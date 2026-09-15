import { useMemo, useState, type MouseEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  deleteList, getList, rankVenues, reorderList, toggleVenueInList, updateList,
} from '../lib/api'
import { useQuery } from '../hooks/useQuery'
import { useUser, useVenues } from '../lib/directory'
import { distanceMi, formatDate, formatDistance, timeAgo } from '../lib/geo'
import { useApp, useCurrentUser } from '../state/AppContext'
import type { RankedVenue, Venue, VenueList } from '../types'
import Avatar from '../components/Avatar'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import ScreenHeader from '../components/ScreenHeader'
import VenueRow from '../components/VenueRow'
import { useToast } from '../components/Toast'
import './ListDetailScreen.css'
import Icon from '../components/Icon'

const EMOJI_CHOICES = ['📋', '♠️', '🃏', '🎰', '🏆', '🔥', '💰', '🌴', '🌃', '☕', '🚩', '⭐']

const NO_ROWS: RankedVenue[] = []

export default function ListDetailScreen() {
  const { listId } = useParams<{ listId: string }>()
  const { origin } = useApp()
  const me = useCurrentUser()
  const navigate = useNavigate()
  const [toastNode, showToast] = useToast()

  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editEmoji, setEditEmoji] = useState('📋')
  const [editError, setEditError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addQuery, setAddQuery] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const viewerId = me?.id ?? null

  /* Whether this list can be read at all is the server's call — a private list
     belonging to an account you do not follow is refused rather than returned
     for the screen to hide. The refusal's message is what distinguishes
     "private" from "gone". */
  const { data: list, loaded, error } = useQuery<VenueList | null>(
    () => (listId ? getList(listId) : Promise.resolve(null)),
    [listId, viewerId],
    null,
  )

  /* Scores for the rooms on the list come from one ranked query rather than a
     stats call per room; the rank shown is the list's own order, not the
     leaderboard's. */
  const { data: ranked } = useQuery<RankedVenue[]>(
    () => rankVenues({ origin }),
    [origin.lat, origin.lng],
    NO_ROWS,
  )

  const rows = useMemo<RankedVenue[]>(() => {
    if (!list) return NO_ROWS
    const byId = new Map(ranked.map((r) => [r.venue.id, r]))
    return list.venueIds.flatMap((id, i) => {
      const row = byId.get(id)
      if (!row) return []
      return [{
        venue: row.venue,
        stats: { ...row.stats, rank: i + 1 },
        distanceMi: Math.round(distanceMi(origin, row.venue) * 10) / 10,
      }]
    })
  }, [list, ranked, origin])

  const allVenues = useVenues()
  const addResults = useMemo<Venue[]>(() => {
    const q = addQuery.trim().toLowerCase()
    return allVenues
      .filter((v) => !q || `${v.name} ${v.city} ${v.state}`.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [allVenues, addQuery])

  const owner = useUser(list?.ownerId)

  if (!loaded) {
    return (
      <>
        <ScreenHeader title="List" back />
        <p className="screen-loading faint" role="status">Fetching the list…</p>
      </>
    )
  }

  if (!list) {
    const isPrivate = error !== null && /private/i.test(error)
    return (
      <>
        <ScreenHeader title={isPrivate ? 'Private list' : 'List'} back />
        <EmptyState
          icon={isPrivate ? '🔒' : '🗂️'}
          title={isPrivate ? 'This list is private' : 'List not found'}
          body={isPrivate
            ? 'Private lists stay with their owner. If their account is approved-followers, send a request and check back.'
            : 'This list was deleted, or the link points somewhere that never existed.'}
          action={<Link className="btn" to="/rankings">Browse the rankings</Link>}
        />
      </>
    )
  }

  const isOwner = me !== null && me.id === list.ownerId
  const handle = owner ? `@${owner.username}` : 'The owner'

  const roomCount = list.venueIds.length
  const rated = rows.filter((r) => r.stats.average !== null)
  const listAverage = rated.length
    ? Math.round((rated.reduce((s, r) => s + (r.stats.average ?? 0), 0) / rated.length) * 10) / 10
    : null

  const stop = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const openEdit = () => {
    setEditName(list.name)
    setEditDesc(list.description)
    setEditEmoji(list.emoji)
    setEditError(null)
    setEditOpen(true)
  }

  const openAdd = () => {
    setAddQuery('')
    setAddOpen(true)
  }

  const saveEdit = () => {
    const name = editName.trim()
    if (!name) {
      setEditError('Every list needs a name.')
      return
    }
    void updateList(list.id, { name, description: editDesc, emoji: editEmoji.trim() || '📋' })
      .then(() => {
        setEditOpen(false)
        showToast('Details saved')
      })
      .catch((err: unknown) => setEditError(err instanceof Error ? err.message : 'Could not save that.'))
  }

  const toggleVisibility = () => {
    const nowPublic = !list.isPublic
    void updateList(list.id, { isPublic: nowPublic })
      .then(() => showToast(nowPublic ? 'List is public now' : 'List is private again'))
  }

  const move = (venue: Venue, direction: -1 | 1) => {
    void reorderList(list.id, venue.id, direction)
      .then(() => showToast(`${venue.name} moved ${direction === -1 ? 'up' : 'down'}`))
  }

  const removeRoom = (venue: Venue) => {
    void toggleVenueInList(list.id, venue.id).then(() => showToast(`Removed ${venue.name}`))
  }

  const toggleFromPicker = (venue: Venue) => {
    void toggleVenueInList(list.id, venue.id)
      .then((added) => showToast(added ? `Added ${venue.name}` : `Removed ${venue.name}`))
  }

  const reallyDelete = () => {
    void deleteList(list.id).then(() => {
      setConfirmOpen(false)
      navigate('/profile')
    })
  }

  return (
    <>
      <ScreenHeader
        title={list.name}
        subtitle={`${roomCount} room${roomCount === 1 ? '' : 's'}${owner ? ` · by @${owner.username}` : ''}`}
        back
        actions={isOwner
          ? <button className="btn btn-sm" onClick={openEdit}>Edit</button>
          : undefined}
      />

      <div className="ld-wrap">
        <section className="card ld-head">
          <div className="ld-head-top">
            <span className="ld-emoji" aria-hidden="true">{list.emoji}</span>
            <div className="ld-title">
              <h2 className="ld-name">{list.name}</h2>
              <div className="faint ld-dates">
                Started {formatDate(list.createdAt)} · updated {timeAgo(list.updatedAt)}
              </div>
            </div>
            <span className={`ld-vis-pill ${list.isPublic ? 'is-public' : 'is-private'}`}>
              {list.isPublic ? 'Public' : <><Icon name="lock" size={11} /> Private</>}
            </span>
          </div>

          {list.description && <p className="ld-desc muted">{list.description}</p>}

          {owner && (
            <div className="ld-owner">
              <Avatar user={owner} size={34} />
              <Link to={`/u/${owner.username}`} className="ld-owner-name">
                <b>{owner.displayName}</b>
                <span className="faint">@{owner.username}</span>
              </Link>
            </div>
          )}

          {isOwner && (
            <div className="ld-tools">
              <button className="btn btn-sm" onClick={openEdit}>Edit details</button>
              <button className="btn btn-sm btn-primary" onClick={openAdd}>Add rooms</button>
            </div>
          )}
        </section>

        {isOwner && (
          <section className="card ld-vis">
            <div className="ld-vis-row">
              <div className="ld-vis-text">
                <span className="ld-vis-label" id="ld-vis-label">
                  {list.isPublic ? 'Public list' : 'Private list'}
                </span>
                <span className="faint ld-vis-explain">
                  {list.isPublic
                    ? 'Anyone who can see your profile can open this list and read your order.'
                    : 'Only you can open this list. It stays off your profile and out of search.'}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={list.isPublic}
                aria-labelledby="ld-vis-label"
                className={`ld-switch${list.isPublic ? ' is-on' : ''}`}
                onClick={toggleVisibility}
              >
                <span className="ld-switch-knob" aria-hidden="true" />
              </button>
            </div>
          </section>
        )}

        {rows.length > 0 && (
          <div className="card ld-summary">
            <div className="ld-summary-text">
              <span className="muted ld-summary-label">Average rating across this list</span>
              <span className="faint ld-summary-note">
                {listAverage === null
                  ? 'Nobody has rated any of these rooms yet'
                  : `${rated.length} rated room${rated.length === 1 ? '' : 's'}${
                      rows.length > rated.length ? ` · ${rows.length - rated.length} still unrated` : ''
                    }`}
              </span>
            </div>
            <span className="ld-summary-val num">
              {listAverage === null ? '—' : listAverage.toFixed(1)}
            </span>
          </div>
        )}

        {rows.length === 0 ? (
          <EmptyState
            icon="🗂️"
            title="No rooms yet"
            body={isOwner
              ? 'A list with nothing in it is just a name. Add the rooms you would actually drive to.'
              : `${handle} hasn't put any rooms in here yet.`}
            action={isOwner
              ? <button className="btn btn-primary" onClick={openAdd}>Add rooms</button>
              : undefined}
          />
        ) : (
          <>
            <div className="ld-rooms-head">
              <h2 className="section-title">Rooms in order</h2>
              {isOwner && (
                <span className="faint ld-rooms-hint">Arrows re-rank · Remove pulls a room</span>
              )}
            </div>
            <ol className="ld-rooms">
              {rows.map((row, i) => (
                <li className="ld-room" key={row.venue.id}>
                  <span className="ld-pos num" aria-hidden="true">{i + 1}</span>
                  <div className="ld-room-main">
                    <VenueRow
                      row={row}
                      showRank={false}
                      action={isOwner ? (
                        <span className="ld-ctls">
                          <button
                            className="ld-ctl"
                            aria-label={`Move ${row.venue.name} up`}
                            disabled={i === 0}
                            onClick={(e) => { stop(e); move(row.venue, -1) }}
                          >
                            ▲
                          </button>
                          <button
                            className="ld-ctl"
                            aria-label={`Move ${row.venue.name} down`}
                            disabled={i === rows.length - 1}
                            onClick={(e) => { stop(e); move(row.venue, 1) }}
                          >
                            ▼
                          </button>
                          <button
                            className="ld-ctl ld-ctl-remove"
                            aria-label={`Remove ${row.venue.name} from this list`}
                            onClick={(e) => { stop(e); removeRoom(row.venue) }}
                          >
                            <span className="ld-ctl-x" aria-hidden="true">✕</span>
                            <span className="ld-ctl-word" aria-hidden="true">Remove</span>
                          </button>
                        </span>
                      ) : undefined}
                    />
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}

        {isOwner && (
          <div className="ld-danger">
            <button className="btn btn-danger btn-block" onClick={() => setConfirmOpen(true)}>
              Delete list
            </button>
            <p className="faint ld-danger-note">
              Deleting the list leaves the rooms and your ratings exactly where they are.
            </p>
          </div>
        )}
      </div>

      {isOwner && (
        <>
          <Modal
            open={editOpen}
            title="Edit list details"
            onClose={() => setEditOpen(false)}
            footer={
              <>
                <button className="btn" onClick={() => setEditOpen(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveEdit}>Save</button>
              </>
            }
          >
            <div className="field">
              <label className="field-label" htmlFor="ld-name-input">Name</label>
              <input
                id="ld-name-input"
                value={editName}
                maxLength={60}
                placeholder="Rooms worth the drive"
                onChange={(ev) => { setEditName(ev.target.value); setEditError(null) }}
              />
              {editError && <div className="field-error">{editError}</div>}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="ld-desc-input">Description</label>
              <textarea
                id="ld-desc-input"
                value={editDesc}
                maxLength={240}
                placeholder="What has to be true for a room to make this list?"
                onChange={(ev) => setEditDesc(ev.target.value)}
              />
              <div className="field-hint">{editDesc.length}/240</div>
            </div>

            <div className="field">
              <span className="field-label" id="ld-emoji-label">Emoji</span>
              <div className="chip-row ld-emoji-row" role="group" aria-labelledby="ld-emoji-label">
                {EMOJI_CHOICES.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    className="chip ld-emoji-chip"
                    aria-pressed={editEmoji === choice}
                    aria-label={`Emoji ${choice}`}
                    onClick={() => setEditEmoji(choice)}
                  >
                    {choice}
                  </button>
                ))}
              </div>
              <input
                className="ld-emoji-input"
                value={editEmoji}
                maxLength={4}
                aria-label="Custom emoji"
                placeholder="or paste your own"
                onChange={(ev) => setEditEmoji(ev.target.value)}
              />
              <div className="field-hint">Shows next to the list name everywhere it appears.</div>
            </div>
          </Modal>

          <Modal
            open={addOpen}
            title="Add rooms"
            onClose={() => setAddOpen(false)}
            footer={
              <>
                <span className="faint ld-add-count">
                  {roomCount} room{roomCount === 1 ? '' : 's'} in this list
                </span>
                <button className="btn btn-primary" onClick={() => setAddOpen(false)}>Done</button>
              </>
            }
          >
            <input
              className="ld-add-search"
              value={addQuery}
              aria-label="Search rooms by name or city"
              placeholder="Search rooms by name or city"
              onChange={(ev) => setAddQuery(ev.target.value)}
            />
            {addResults.length === 0 ? (
              <p className="muted ld-add-none">
                {addQuery.trim()
                  ? `No room matches “${addQuery.trim()}”.`
                  : 'There are no rooms to add yet.'}
              </p>
            ) : (
              <ul className="ld-add-list">
                {addResults.map((v) => {
                  const inList = list.venueIds.includes(v.id)
                  const miles = Math.round(distanceMi(origin, v) * 10) / 10
                  return (
                    <li className="ld-add-row" key={v.id}>
                      <span
                        className={`ld-add-swatch venue-tone venue-tone-${v.type}`}
                        aria-hidden="true"
                      />
                      <span className="ld-add-info">
                        <span className="ld-add-name">{v.name}</span>
                        <span className="faint ld-add-meta">
                          {v.city}, {v.state} · {formatDistance(miles)}
                        </span>
                      </span>
                      <button
                        className={`btn btn-sm${inList ? '' : ' btn-primary'}`}
                        aria-pressed={inList}
                        title={inList ? 'Remove from this list' : 'Add to this list'}
                        onClick={() => toggleFromPicker(v)}
                      >
                        {inList ? '✓ Added' : 'Add'}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Modal>

          <Modal
            open={confirmOpen}
            title="Delete this list?"
            onClose={() => setConfirmOpen(false)}
            footer={
              <>
                <button className="btn" onClick={() => setConfirmOpen(false)}>Keep it</button>
                <button className="btn btn-danger" onClick={reallyDelete}>Delete list</button>
              </>
            }
          >
            <p className="muted ld-confirm">
              {`“${list.name}” and the order you put it in are gone for good. The ${roomCount} room${
                roomCount === 1 ? '' : 's'
              } and every rating you left stay exactly where they are.`}
            </p>
          </Modal>
        </>
      )}

      {toastNode}
    </>
  )
}
