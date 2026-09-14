import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { SUBSCORE_META } from '../types'
import type { MediaItem, PostKind, Rating, Subscores, Venue } from '../types'
import { createPost, getMyRating, getVenue, listVenues, saveRating } from '../lib/api'
import { distanceMi, formatDate, formatDistance, formatMoney } from '../lib/geo'
import { deleteMedia } from '../lib/media'
import { useApp, useCurrentUser } from '../state/AppContext'
import ScreenHeader from '../components/ScreenHeader'
import StarInput from '../components/StarInput'
import StarRating from '../components/StarRating'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import MediaPicker from '../components/MediaPicker'
import { useToast } from '../components/Toast'
import './ComposeScreen.css'

const MODES: { id: PostKind; label: string; hint: string }[] = [
  { id: 'text', label: 'Post', hint: 'Trip report, bad beat, table talk. Tagging a room is optional.' },
  { id: 'rating', label: 'Rate a room', hint: 'Six scores, no abstaining. One rating per room — the newest one counts.' },
  { id: 'session', label: 'Log a session', hint: 'Stakes, hours, and the number. Win or lose, the graph is the graph.' },
]

const EMPTY_SUBSCORES: Subscores = {
  gameQuality: 0, tableAvailability: 0, dealers: 0, comps: 0, atmosphere: 0, value: 0,
}

const MAX_BODY = 600
const MAX_TAGS = 8
const MAX_ROOM_RESULTS = 8

/** Split on spaces and commas, drop leading hashes, de-dupe case-insensitively. */
function parseTags(raw: string): string[] {
  const out: string[] = []
  for (const piece of raw.split(/[\s,]+/)) {
    const tag = piece.replace(/^#+/, '').trim()
    if (!tag) continue
    if (out.some((t) => t.toLowerCase() === tag.toLowerCase())) continue
    out.push(tag)
    if (out.length >= MAX_TAGS) break
  }
  return out
}

/** "+1,200" / "-$410" / "0" -> number. null when it is not a dollar amount. */
function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '')
  if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function isMode(value: string | null): value is PostKind {
  return value === 'text' || value === 'rating' || value === 'session'
}

function withScore(scores: Subscores, key: keyof Subscores, value: number): Subscores {
  const next: Subscores = { ...scores }
  next[key] = value
  return next
}

export default function ComposeScreen() {
  const me = useCurrentUser()
  const { revision, origin } = useApp()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [toastNode, showToast] = useToast()

  // Deep links: /compose?venue=v-aria&mode=rating
  const paramVenueId = getVenue(searchParams.get('venue'))?.id ?? null
  const paramMode = searchParams.get('mode')
  const initialMode: PostKind = isMode(paramMode) ? paramMode : 'text'
  const seeded = me && paramVenueId && initialMode === 'rating' ? getMyRating(me.id, paramVenueId) : null

  const [mode, setMode] = useState<PostKind>(initialMode)
  const [venueId, setVenueId] = useState<string | null>(paramVenueId)
  const [venueQuery, setVenueQuery] = useState('')
  const [body, setBody] = useState(() => seeded?.review ?? '')
  const [tagsInput, setTagsInput] = useState('')
  const [attachments, setAttachments] = useState<MediaItem[]>([])
  const [subscores, setSubscores] = useState<Subscores>(() =>
    seeded ? { ...seeded.subscores } : { ...EMPTY_SUBSCORES })
  const [stakes, setStakes] = useState(() => seeded?.stakesPlayed ?? '')
  const [hoursInput, setHoursInput] = useState('')
  const [netInput, setNetInput] = useState('')
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [discardOpen, setDiscardOpen] = useState(false)

  /* Note: an in-progress draft deliberately survives a tap on the nav Post tab.
     Every parameterised entry point (/compose?mode=rating&venue=…) arrives from
     a screen that unmounts this one first, so params always seed on a fresh
     mount; the only live param change is back to a bare /compose, where keeping
     the draft beats resetting it and throwing the work away. */

  const originLat = origin.lat
  const originLng = origin.lng

  const venue = useMemo(() => {
    void revision
    return getVenue(venueId)
  }, [revision, venueId])

  const existing = useMemo(() => {
    void revision
    return me && venueId ? getMyRating(me.id, venueId) : null
  }, [revision, me, venueId])

  const results = useMemo(() => {
    void revision
    const q = venueQuery.trim().toLowerCase()
    return listVenues()
      .filter((v) => !q || `${v.name} ${v.city} ${v.state}`.toLowerCase().includes(q))
      .map((v) => ({ room: v, mi: distanceMi({ lat: originLat, lng: originLng }, v) }))
      .sort((a, b) => a.mi - b.mi)
      .slice(0, MAX_ROOM_RESULTS)
  }, [revision, venueQuery, originLat, originLng])

  const tags = useMemo(() => parseTags(tagsInput), [tagsInput])

  const scored = SUBSCORE_META.filter((m) => subscores[m.key] > 0).length
  const overall = SUBSCORE_META.reduce((sum, m) => sum + subscores[m.key], 0) / SUBSCORE_META.length
  const hoursNum = hoursInput.trim() === '' ? Number.NaN : Number(hoursInput)
  const hoursValid = Number.isFinite(hoursNum) && hoursNum > 0
  const netNum = parseMoney(netInput)

  const errVenue = mode !== 'text' && !venue ? 'Pick the room first — a score with no room is just a mood.' : ''
  const errBody = mode === 'text' && !body.trim() && attachments.length === 0
    ? 'Type something, or attach a photo. Even “lost a flip, went home” counts.' : ''
  const errScores = mode === 'rating' && scored < SUBSCORE_META.length
    ? `All six categories, please — ${scored} of ${SUBSCORE_META.length} so far.` : ''
  const errStakes = mode === 'session' && !stakes.trim() ? 'What were you playing?' : ''
  const errHours = mode === 'session' && !hoursValid ? 'Hours has to be a number above 0.' : ''
  const errNet = mode === 'session' && netNum === null
    ? 'Net result, like +1,200 or -410. Put 0 if you broke even.' : ''
  const blocker = errVenue || errBody || errScores || errStakes || errHours || errNet
  const valid = blocker === ''

  const dirty =
    body.trim() !== '' ||
    tagsInput.trim() !== '' ||
    stakes.trim() !== '' ||
    hoursInput.trim() !== '' ||
    netInput.trim() !== '' ||
    scored > 0 ||
    attachments.length > 0 ||
    venueId !== paramVenueId

  if (!me) {
    return (
      <>
        <ScreenHeader title="New post" back />
        <EmptyState
          icon="🔒"
          title="Sign in to post"
          body="Railbird needs to know whose session this is."
          action={
            <button type="button" className="btn btn-primary" onClick={() => navigate('/signin')}>
              Sign in
            </button>
          }
        />
      </>
    )
  }

  const meId = me.id
  const modeMeta = MODES.find((m) => m.id === mode) ?? MODES[0]
  // A plain post should not open onto a wall of rooms — make the user ask for them.
  const showRooms = mode !== 'text' || venueQuery.trim() !== ''
  const submitLabel = mode === 'rating' ? (existing ? 'Update rating' : 'Post rating') : 'Post'

  const touch = (key: string) => setTouched((t) => (t[key] ? t : { ...t, [key]: true }))

  const applyRating = (r: Rating) => {
    setSubscores({ ...r.subscores })
    setStakes(r.stakesPlayed)
    setBody((current) => (current.trim() ? current : r.review))
  }

  const selectVenue = (v: Venue) => {
    const changedRoom = v.id !== venueId
    setVenueId(v.id)
    setVenueQuery('')
    touch('venue')
    if (!changedRoom) return
    /* Six scores describe one room, so they have to follow the room even when
       it is swapped from another mode. Without this, scores entered for room A
       survived a switch to Post, a change to room B, and a switch back to
       Rate — and submitting then filed A's scores against B. */
    const prior = getMyRating(meId, v.id)
    if (prior) {
      if (mode === 'rating') applyRating(prior)
      else setSubscores({ ...prior.subscores })
    } else {
      setSubscores({ ...EMPTY_SUBSCORES })
    }
  }

  const clearVenue = () => {
    setVenueId(null)
    setVenueQuery('')
    touch('venue')
  }

  const changeMode = (next: PostKind) => {
    if (next === mode) return
    setMode(next)
    if (next === 'rating' && venueId) {
      const prior = getMyRating(meId, venueId)
      if (prior) applyRating(prior)
    }
  }

  const removeTag = (tag: string) => setTagsInput(tags.filter((t) => t !== tag).join(' '))

  const setStakesPreset = (preset: string) => {
    setStakes(stakes.trim() === preset ? '' : preset)
    touch('stakes')
  }

  const handleSubmit = () => {
    if (!valid) return
    const written = body.trim()

    if (mode === 'rating') {
      if (!venue) return
      const rating = saveRating(meId, {
        venueId: venue.id,
        subscores,
        review: written,
        stakesPlayed: stakes.trim(),
      })
      const post = createPost(meId, {
        kind: 'rating',
        body: written || `Rated ${venue.name} ${rating.overall.toFixed(1)}/5.`,
        venueId: venue.id,
        ratingId: rating.id,
        media: attachments,
        tags,
      })
      showToast('Posted')
      navigate(`/post/${post.id}`)
      return
    }

    if (mode === 'session') {
      if (!venue || netNum === null || !hoursValid) return
      const hours = Math.round(hoursNum * 100) / 100
      const played = stakes.trim()
      const post = createPost(meId, {
        kind: 'session',
        body: written || `${hours}h of ${played} at ${venue.name}. ${formatMoney(netNum)}.`,
        venueId: venue.id,
        session: { stakes: played, hours, net: netNum },
        media: attachments,
        tags,
      })
      showToast('Posted')
      navigate(`/post/${post.id}`)
      return
    }

    const post = createPost(meId, {
      kind: 'text',
      body: written,
      venueId: venue ? venue.id : null,
      media: attachments,
      tags,
    })
    showToast('Posted')
    navigate(`/post/${post.id}`)
  }

  /* Attachments are ingested into IndexedDB the moment they are picked, before
     any post exists. Walking away without posting would strand those blobs with
     nothing referencing them, so an abandoned draft takes its media with it. */
  const discardDraft = () => {
    if (attachments.length) void deleteMedia(attachments)
    setAttachments([])
    setDiscardOpen(false)
    navigate(-1)
  }

  const handleDiscard = () => {
    if (dirty) setDiscardOpen(true)
    else discardDraft()
  }

  const bodyLabel = mode === 'rating' ? 'Your review' : mode === 'session' ? 'Session notes' : 'What happened?'
  const bodyPlaceholder =
    mode === 'rating' ? 'Dealers are quick, the $2/$5 runs deep, and the rake stops at four.'
      : mode === 'session' ? 'Two hours card dead, then ran a set into a set. It happens.'
        : 'Say something worth railing.'

  return (
    <>
      <ScreenHeader
        title="New post"
        back
        actions={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSubmit}
            disabled={!valid}
          >
            {submitLabel}
          </button>
        }
      />

      <div className="cmp-wrap">
        <div className="cmp-modes" role="group" aria-label="Post type">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className="cmp-mode"
              aria-pressed={mode === m.id}
              onClick={() => changeMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="cmp-mode-hint faint">{modeMeta.hint}</p>

        {/* ------------------------------------------------------------ room */}
        <section className="cmp-section">
          {venue ? (
            <>
              <div className="field-label">Room</div>
              <div className="card cmp-room-card">
                <span
                  className={`cmp-swatch cmp-swatch-lg venue-tone venue-tone-${venue.type}`}
                  aria-hidden="true"
                >
                  {venue.type === 'casino' ? '\u2666\uFE0E' : '\u2660\uFE0E'}
                </span>
                <span className="cmp-room-text">
                  <span className="cmp-room-name">{venue.name}</span>
                  <span className="cmp-room-meta faint">
                    {venue.city}, {venue.state} · {venue.tableCount} tables
                  </span>
                </span>
                <button type="button" className="btn btn-sm" onClick={clearVenue}>Change</button>
              </div>
            </>
          ) : (
            <>
              <label className="field-label" htmlFor="cmp-room">
                Room {mode === 'text' && <span className="faint">· optional</span>}
              </label>
              <input
                id="cmp-room"
                type="search"
                autoComplete="off"
                value={venueQuery}
                placeholder="Search rooms by name or city"
                onChange={(e) => setVenueQuery(e.target.value)}
                onBlur={() => touch('venue')}
              />
              {showRooms && <p className="sr-only" aria-live="polite">{results.length} rooms match</p>}
              {showRooms && (results.length === 0 ? (
                <p className="cmp-room-none faint">
                  Nothing matches “{venueQuery.trim()}”. Try the city instead.
                </p>
              ) : (
                <div className="cmp-room-results">
                  {results.map(({ room, mi }) => (
                    <button
                      key={room.id}
                      type="button"
                      className="cmp-room-option"
                      onClick={() => selectVenue(room)}
                    >
                      <span
                        className={`cmp-swatch venue-tone venue-tone-${room.type}`}
                        aria-hidden="true"
                      >
                        {room.type === 'casino' ? '\u2666\uFE0E' : '\u2660\uFE0E'}
                      </span>
                      <span className="cmp-room-text">
                        <span className="cmp-room-name">{room.name}</span>
                        <span className="cmp-room-meta faint">
                          {room.city}, {room.state} · {formatDistance(Math.round(mi * 10) / 10)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ))}
              {mode !== 'text' && !touched.venue && (
                <p className="field-hint">
                  Required — {mode === 'rating' ? 'ratings' : 'sessions'} are tied to a room.
                </p>
              )}
              {mode === 'text' && !showRooms && (
                <p className="field-hint">Start typing to pin this post to a room.</p>
              )}
            </>
          )}
          {touched.venue && errVenue && <p className="field-error">{errVenue}</p>}
        </section>

        {/* ---------------------------------------------------------- rating */}
        {mode === 'rating' && (
          <section className="cmp-section">
            <div className="cmp-overall">
              <span className="cmp-overall-num num">{overall.toFixed(1)}</span>
              <span className="cmp-overall-text">
                <span className="cmp-overall-label">Overall</span>
                <StarRating value={overall} size={18} />
                <span className="cmp-overall-sub faint">
                  {scored < SUBSCORE_META.length
                    ? `${scored} of ${SUBSCORE_META.length} scored`
                    : 'Straight mean of your six scores'}
                </span>
              </span>
            </div>

            <div className="card cmp-scores">
              {SUBSCORE_META.map((m) => (
                <StarInput
                  key={m.key}
                  label={m.label}
                  hint={m.hint}
                  value={subscores[m.key]}
                  onChange={(v) => setSubscores((s) => withScore(s, m.key, v))}
                />
              ))}
            </div>
            {scored > 0 && errScores && <p className="field-error">{errScores}</p>}

            {existing && venue && (
              <p className="cmp-note">
                You gave {venue.name} {existing.overall.toFixed(1)}/5 on {formatDate(existing.createdAt)}.
                Posting again replaces it — one rating per player, per room.
              </p>
            )}

            <div className="cmp-field">
              <label className="field-label" htmlFor="cmp-stakes">Stakes played</label>
              {venue && venue.stakes.length > 0 && (
                <div className="chip-row cmp-stakes-row">
                  {venue.stakes.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="chip"
                      aria-pressed={stakes.trim() === s}
                      onClick={() => setStakesPreset(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <input
                id="cmp-stakes"
                type="text"
                autoComplete="off"
                value={stakes}
                placeholder="$2/$5 NLHE"
                onChange={(e) => setStakes(e.target.value)}
                onBlur={() => touch('stakes')}
              />
              <p className="field-hint">Optional, but it tells people which game you are scoring.</p>
            </div>
          </section>
        )}

        {/* --------------------------------------------------------- session */}
        {mode === 'session' && (
          <section className="cmp-section">
            <div className="cmp-field">
              <label className="field-label" htmlFor="cmp-session-stakes">Stakes</label>
              {venue && venue.stakes.length > 0 && (
                <div className="chip-row cmp-stakes-row">
                  {venue.stakes.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="chip"
                      aria-pressed={stakes.trim() === s}
                      onClick={() => setStakesPreset(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <input
                id="cmp-session-stakes"
                type="text"
                autoComplete="off"
                value={stakes}
                placeholder="$1/$3 NLHE"
                onChange={(e) => setStakes(e.target.value)}
                onBlur={() => touch('stakes')}
              />
              {touched.stakes && errStakes && <p className="field-error">{errStakes}</p>}
            </div>

            <div className="cmp-grid2">
              <div className="cmp-field">
                <label className="field-label" htmlFor="cmp-hours">Hours</label>
                <input
                  id="cmp-hours"
                  type="number"
                  step={0.5}
                  min={0}
                  inputMode="decimal"
                  value={hoursInput}
                  placeholder="5.5"
                  onChange={(e) => setHoursInput(e.target.value)}
                  onBlur={() => touch('hours')}
                />
                {touched.hours && errHours && <p className="field-error">{errHours}</p>}
              </div>
              <div className="cmp-field">
                <label className="field-label" htmlFor="cmp-net">Net result</label>
                <input
                  id="cmp-net"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  value={netInput}
                  placeholder="+1,200"
                  onChange={(e) => setNetInput(e.target.value)}
                  onBlur={() => touch('net')}
                />
                {touched.net && errNet && <p className="field-error">{errNet}</p>}
              </div>
            </div>

            {hoursValid && netNum !== null && (
              <div className="cmp-hourly">
                <span className="cmp-hourly-label muted">
                  {formatMoney(netNum)} over {Math.round(hoursNum * 100) / 100}h
                </span>
                <span className={`cmp-hourly-val num ${netNum >= 0 ? 'pos' : 'neg'}`}>
                  {formatMoney(netNum / hoursNum)}/hr
                </span>
              </div>
            )}
          </section>
        )}

        {/* ------------------------------------------------------------ body */}
        <section className="cmp-section">
          <div className="cmp-body-head">
            <label className="field-label cmp-body-label" htmlFor="cmp-body">{bodyLabel}</label>
            <span className={`cmp-counter num ${body.length >= MAX_BODY - 60 ? 'is-warn' : ''}`}>
              {body.length}/{MAX_BODY}
            </span>
          </div>
          <textarea
            id="cmp-body"
            value={body}
            maxLength={MAX_BODY}
            placeholder={bodyPlaceholder}
            onChange={(e) => setBody(e.target.value)}
            onBlur={() => touch('body')}
          />
          {touched.body && errBody && <p className="field-error">{errBody}</p>}
          {mode === 'rating' && (
            <p className="field-hint">
              Optional. Leave it blank and the post is just the score.
            </p>
          )}
          {mode === 'session' && (
            <p className="field-hint">Optional. The numbers already told the story.</p>
          )}
        </section>

        {/* ----------------------------------------------------------- media */}
        <section className="cmp-section">
          <label className="field-label">Photos & video</label>
          <MediaPicker items={attachments} onChange={setAttachments} />
        </section>

        {/* ------------------------------------------------------------ tags */}
        <section className="cmp-section">
          <label className="field-label" htmlFor="cmp-tags">Tags</label>
          <input
            id="cmp-tags"
            type="text"
            autoComplete="off"
            value={tagsInput}
            placeholder="plo badbeat vegas"
            onChange={(e) => setTagsInput(e.target.value)}
          />
          <p className="field-hint">Spaces or commas. First {MAX_TAGS} stick.</p>
          {tags.length > 0 && (
            <div className="cmp-tag-chips">
              {tags.map((t) => (
                <button
                  key={t.toLowerCase()}
                  type="button"
                  className="chip cmp-tag"
                  onClick={() => removeTag(t)}
                  aria-label={`Remove tag ${t}`}
                >
                  #{t}
                  <span className="cmp-tag-x" aria-hidden="true">×</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <div className="cmp-foot">
          <button type="button" className="btn btn-ghost" onClick={handleDiscard}>Discard</button>
          {!valid && <p className="cmp-blocker faint">{blocker}</p>}
        </div>
      </div>

      <Modal
        open={discardOpen}
        title="Throw this away?"
        onClose={() => setDiscardOpen(false)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setDiscardOpen(false)}>
              Keep editing
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={discardDraft}
            >
              Discard
            </button>
          </>
        }
      >
        <p className="cmp-modal-text muted">
          Nothing has been saved yet. Everything you typed goes in the muck.
        </p>
      </Modal>

      {toastNode}
    </>
  )
}
