import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  acceptFollowRequest,
  canViewProfile,
  createList,
  declineFollowRequest,
  deleteRating,
  getUser,
  getUserByUsername,
  getUserStats,
  getVenue,
  listListsByUser,
  listPostsByUser,
  listRatingsByUser,
  listVenues,
  updateProfile,
} from '../lib/api'
import { formatCount, formatDate } from '../lib/geo'
import { MediaError, makeAvatarPhoto } from '../lib/media'
import { useApp } from '../state/AppContext'
import { ROLES, SUBSCORE_META, type Role, type User } from '../types'
import Avatar from '../components/Avatar'
import EmptyState from '../components/EmptyState'
import FollowButton from '../components/FollowButton'
import ListCard from '../components/ListCard'
import Modal from '../components/Modal'
import PostCard from '../components/PostCard'
import RoleBadge from '../components/RoleBadge'
import ScreenHeader from '../components/ScreenHeader'
import StarRating from '../components/StarRating'
import UserRow from '../components/UserRow'
import { useToast } from '../components/Toast'
import './ProfileScreen.css'
import { AVATAR_TONES, type AvatarTone } from '../types'
import Icon from '../components/Icon'

const TABS = [
  { id: 'posts', label: 'Posts' },
  { id: 'ratings', label: 'Ratings' },
  { id: 'lists', label: 'Lists' },
] as const

type Tab = (typeof TABS)[number]['id']
type PeopleTab = 'followers' | 'following'

interface EditForm {
  displayName: string
  username: string
  bio: string
  location: string
  avatarTone: AvatarTone
  avatarPhoto: string | null
  roles: Role[]
  homeVenueId: string
  isPrivate: boolean
}

const BLANK_EDIT: EditForm = {
  displayName: '',
  username: '',
  bio: '',
  location: '',
  avatarTone: 'blue',
  avatarPhoto: null,
  roles: [],
  homeVenueId: '',
  isPrivate: false,
}

interface ListForm {
  name: string
  description: string
  emoji: string
  isPublic: boolean
}

const BLANK_LIST: ListForm = { name: '', description: '', emoji: '📋', isPublic: false }

const LIST_EMOJI = ['📋', '♠️', '🎰', '🃏', '🏆', '🌴', '💵', '🔥']

const BIO_MAX = 200

function Switch({
  checked, onToggle, label, hint,
}: { checked: boolean; onToggle: () => void; label: string; hint: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`prof-switch ${checked ? 'is-on' : ''}`}
      onClick={onToggle}
    >
      <span className="prof-switch-track" aria-hidden="true">
        <span className="prof-switch-thumb" />
      </span>
      <span className="prof-switch-copy">
        <span className="prof-switch-label">{label}</span>
        <span className="prof-switch-hint faint">{hint}</span>
      </span>
    </button>
  )
}

export default function ProfileScreen() {
  const { revision, currentUser } = useApp()
  const { username } = useParams<{ username: string }>()
  const navigate = useNavigate()
  const [toastNode, showToast] = useToast()

  const [tab, setTab] = useState<Tab>('posts')
  const [people, setPeople] = useState<PeopleTab | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [edit, setEdit] = useState<EditForm>(BLANK_EDIT)
  const [editError, setEditError] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  /* Bumped on every pick and every re-open, so a slow photo finishing after
     the form was closed (or a newer photo was chosen) is dropped, not applied. */
  const photoSeq = useRef(0)
  const [listOpen, setListOpen] = useState(false)
  const [listForm, setListForm] = useState<ListForm>(BLANK_LIST)
  const [listError, setListError] = useState<string | null>(null)
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({
    posts: null, ratings: null, lists: null,
  })

  const viewerId = currentUser ? currentUser.id : null

  const user = useMemo(
    () => (username ? getUserByUsername(username) : currentUser),
    [revision, username, currentUser],
  )
  const isMe = user !== null && user.id === viewerId
  const canView = useMemo(
    () => (user ? canViewProfile(viewerId, user.id) : false),
    [revision, user, viewerId],
  )

  /* /profile and /u/:username render this same component, so React keeps the
     instance alive when you tap through from one profile to another. Without
     this, an open followers modal would stay open over the account you just
     navigated to and start listing *their* followers. */
  const profileId = user ? user.id : null
  useEffect(() => {
    setPeople(null)
    setEditOpen(false)
    setEditError(null)
    setListOpen(false)
    setListError(null)
    setTab('posts')
  }, [profileId])

  const stats = useMemo(() => (user ? getUserStats(user.id) : null), [revision, user])
  const posts = useMemo(
    () => (user && canView ? listPostsByUser(user.id, viewerId) : []),
    [revision, user, canView, viewerId],
  )
  const ratings = useMemo(
    () => (user && canView ? listRatingsByUser(user.id) : []),
    [revision, user, canView],
  )
  const lists = useMemo(
    () => (user && canView ? listListsByUser(user.id, viewerId) : []),
    [revision, user, canView, viewerId],
  )
  const requests = useMemo(
    () => (isMe && user
      ? user.pendingFollowerIds.map((id) => getUser(id)).filter((u): u is User => u !== null)
      : []),
    [revision, isMe, user],
  )
  const peopleUsers = useMemo(() => {
    if (!user || !people) return []
    const ids = people === 'followers' ? user.followerIds : user.followingIds
    return ids.map((id) => getUser(id)).filter((u): u is User => u !== null)
  }, [revision, user, people])
  const venueOptions = useMemo(
    () => [...listVenues()].sort((a, b) => a.name.localeCompare(b.name)),
    [revision],
  )

  if (!user || !stats) {
    return (
      <div className="prof-screen">
        <ScreenHeader title="Profile" back />
        <EmptyState
          icon="🕳️"
          title="No such account"
          body={username
            ? `Nobody is playing under @${username}. They may have changed handles.`
            : 'Sign in to see your profile.'}
          action={<Link className="btn btn-primary" to="/search">Search players</Link>}
        />
      </div>
    )
  }

  const profile: User = user
  const homeVenue = getVenue(profile.homeVenueId)

  const openEdit = () => {
    setEdit({
      displayName: profile.displayName,
      username: profile.username,
      bio: profile.bio,
      location: profile.location,
      avatarTone: profile.avatarTone,
      avatarPhoto: profile.avatarPhoto,
      roles: [...profile.roles],
      homeVenueId: profile.homeVenueId ?? '',
      isPrivate: profile.isPrivate,
    })
    setEditError(null)
    photoSeq.current++
    setPhotoBusy(false)
    setPhotoError(null)
    setEditOpen(true)
  }

  const pickPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Re-picking the same file has to re-fire change.
    e.target.value = ''
    if (!file) return
    const seq = ++photoSeq.current
    setPhotoError(null)
    setPhotoBusy(true)
    try {
      const uri = await makeAvatarPhoto(file)
      if (seq === photoSeq.current) setEdit((f) => ({ ...f, avatarPhoto: uri }))
    } catch (err) {
      if (seq === photoSeq.current) {
        setPhotoError(err instanceof MediaError ? err.message : 'That photo could not be used.')
      }
    } finally {
      if (seq === photoSeq.current) setPhotoBusy(false)
    }
  }

  const saveEdit = () => {
    const handle = edit.username.trim().replace(/^@/, '')
    const error = updateProfile(profile.id, {
      displayName: edit.displayName,
      username: handle,
      bio: edit.bio,
      location: edit.location.trim(),
      roles: edit.roles,
      homeVenueId: edit.homeVenueId ? edit.homeVenueId : null,
      avatarTone: edit.avatarTone,
      avatarPhoto: edit.avatarPhoto,
      isPrivate: edit.isPrivate,
    })
    if (error) {
      setEditError(error)
      return
    }
    setEditOpen(false)
    showToast('Profile saved')
    // The old handle is in the URL when you edit from /u/:username.
    if (username && handle.toLowerCase() !== username.toLowerCase()) {
      navigate(`/u/${handle}`, { replace: true })
    }
  }

  const toggleRole = (role: Role) => {
    setEdit((f) => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter((r) => r !== role) : [...f.roles, role],
    }))
  }

  const submitList = () => {
    const name = listForm.name.trim()
    if (!name) {
      setListError('Give the list a name — “Vegas rooms worth the drive” beats “Untitled”.')
      return
    }
    const created = createList(profile.id, {
      name,
      description: listForm.description,
      emoji: listForm.emoji || '📋',
      isPublic: listForm.isPublic,
    })
    setListOpen(false)
    setListForm(BLANK_LIST)
    setListError(null)
    navigate(`/list/${created.id}`)
  }

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const i = TABS.findIndex((t) => t.id === tab)
    const step = e.key === 'ArrowRight' ? 1 : TABS.length - 1
    const next = TABS[(i + step) % TABS.length]
    setTab(next.id)
    tabRefs.current[next.id]?.focus()
  }

  return (
    <div className="prof-screen">
      <ScreenHeader
        title={isMe ? 'Your profile' : profile.displayName}
        subtitle={`@${profile.username}`}
        back={!isMe}
      />

      <section className="prof-hero card">
        <div className={`prof-cover prof-cover-${profile.avatarTone}`} aria-hidden="true" />
        <div className="prof-hero-body">
          <div className="prof-hero-top">
            <span className="prof-avatar">
              <Avatar user={profile} size={88} link={false} />
            </span>
            <div className="prof-hero-actions">
              {isMe ? (
                <>
                  <button className="btn btn-sm" onClick={openEdit}>Edit profile</button>
                  <Link className="btn btn-sm btn-ghost" to="/settings">Settings</Link>
                </>
              ) : (
                <FollowButton user={profile} />
              )}
            </div>
          </div>

          <h2 className="prof-name">
            {profile.displayName}
            {profile.verified && <span className="prof-verified" title="Verified">✓</span>}
            {profile.isPrivate && (
              <span className="prof-lock" title="Private account" role="img" aria-label="Private account"><Icon name="lock" size={15} /></span>
            )}
          </h2>
          <div className="prof-handle faint">@{profile.username}</div>
          <div className="prof-meta faint">
            {profile.location && <span><Icon name="pin" size={13} /> {profile.location}</span>}
            <span>Joined {formatDate(profile.joinedAt)}</span>
          </div>

          {profile.bio && <p className="prof-bio">{profile.bio}</p>}

          {profile.roles.length > 0 && (
            <div className="prof-roles">
              {profile.roles.map((r) => <RoleBadge key={r} role={r} size="sm" />)}
            </div>
          )}

          {homeVenue && (
            <div className="prof-home muted">
              Home room:{' '}
              <Link className="prof-home-link" to={`/venue/${homeVenue.id}`}>{homeVenue.name}</Link>
            </div>
          )}
        </div>
      </section>

      <section className="prof-stats" aria-label="Profile stats">
        <div className="prof-stat">
          <b className="num">{formatCount(stats.posts)}</b>
          <span className="faint">Posts</span>
        </div>
        <div className="prof-stat">
          <b className="num">{formatCount(stats.ratings)}</b>
          <span className="faint">Ratings</span>
        </div>
        <div className="prof-stat">
          <b className="num">{formatCount(stats.lists)}</b>
          <span className="faint">Lists</span>
        </div>
        {canView ? (
          <button
            className="prof-stat prof-stat-btn"
            onClick={() => setPeople('followers')}
            aria-label={`${stats.followers} followers — open list`}
          >
            <b className="num">{formatCount(stats.followers)}</b>
            <span className="faint">Followers</span>
          </button>
        ) : (
          <div className="prof-stat">
            <b className="num">{formatCount(stats.followers)}</b>
            <span className="faint">Followers</span>
          </div>
        )}
        {canView ? (
          <button
            className="prof-stat prof-stat-btn"
            onClick={() => setPeople('following')}
            aria-label={`Following ${stats.following} accounts — open list`}
          >
            <b className="num">{formatCount(stats.following)}</b>
            <span className="faint">Following</span>
          </button>
        ) : (
          <div className="prof-stat">
            <b className="num">{formatCount(stats.following)}</b>
            <span className="faint">Following</span>
          </div>
        )}
        <div className="prof-stat">
          <b className="num prof-stat-avg">
            {stats.averageGiven === null ? '—' : (
              <>
                <span className="prof-stat-star" aria-hidden="true">★</span>
                {stats.averageGiven.toFixed(1)}
              </>
            )}
          </b>
          <span className="faint">Avg given</span>
        </div>
      </section>

      {isMe && requests.length > 0 && (
        <section className="prof-requests card">
          <h3 className="section-title prof-requests-title">
            Follow requests
            <span className="prof-requests-count num">{requests.length}</span>
          </h3>
          <div className="prof-request-list">
            {requests.map((r) => (
              <div className="prof-request" key={r.id}>
                <Avatar user={r} size={40} />
                <Link to={`/u/${r.username}`} className="prof-request-main">
                  <span className="prof-request-name">
                    {r.displayName}
                    {r.verified && <span className="prof-verified" title="Verified">✓</span>}
                  </span>
                  <span className="faint prof-request-handle">
                    @{r.username}{r.location ? ` · ${r.location}` : ''}
                  </span>
                </Link>
                <div className="prof-request-actions">
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => {
                      acceptFollowRequest(profile.id, r.id)
                      showToast(`@${r.username} approved`)
                    }}
                  >
                    Approve
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => {
                      declineFollowRequest(profile.id, r.id)
                      showToast(`@${r.username} declined`)
                    }}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!canView ? (
        <section className="prof-locked card">
          <div className="prof-locked-icon" aria-hidden="true"><Icon name="lock" size={30} /></div>
          <h3>This account is private</h3>
          <p className="muted">
            Only followers @{profile.username} has approved can see their posts, ratings and lists.
            Send a request and it sits in their queue until they look up from the table.
          </p>
          <FollowButton user={profile} />
        </section>
      ) : (
        <>
          <div className="prof-tabs" role="tablist" aria-label="Profile sections" onKeyDown={onTabKey}>
            {TABS.map((t) => (
              <button
                key={t.id}
                id={`prof-tab-${t.id}`}
                ref={(el) => { tabRefs.current[t.id] = el }}
                role="tab"
                type="button"
                aria-selected={tab === t.id}
                aria-controls="prof-panel"
                tabIndex={tab === t.id ? 0 : -1}
                className={`prof-tab ${tab === t.id ? 'is-active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                <span className="prof-tab-count num">
                  {t.id === 'posts' ? posts.length : t.id === 'ratings' ? ratings.length : lists.length}
                </span>
              </button>
            ))}
          </div>

          <div className="prof-panel" id="prof-panel" role="tabpanel" aria-labelledby={`prof-tab-${tab}`}>
            {tab === 'posts' && (
              posts.length === 0 ? (
                <EmptyState
                  icon="🗒️"
                  title={isMe ? 'Nothing on the record yet' : 'No posts yet'}
                  body={isMe
                    ? 'Log a session, review a room, or just get the bad beat out of your system.'
                    : `${profile.displayName} hasn’t posted anything since joining.`}
                  action={isMe
                    ? <Link className="btn btn-primary" to="/compose">Write a post</Link>
                    : undefined}
                />
              ) : (
                <div className="prof-feed">
                  {posts.map((item) => <PostCard key={item.post.id} item={item} />)}
                </div>
              )
            )}

            {tab === 'ratings' && (
              ratings.length === 0 ? (
                <EmptyState
                  icon="⭐"
                  title={isMe ? 'You haven’t rated a room yet' : 'No ratings yet'}
                  body={isMe
                    ? 'Six scores and a paragraph is all it takes to save someone a wasted drive.'
                    : `${profile.displayName} hasn’t scored any rooms yet.`}
                  action={isMe
                    ? <Link className="btn btn-primary" to="/rankings">Find a room to rate</Link>
                    : undefined}
                />
              ) : (
                <div className="prof-ratings">
                  {ratings.map((r) => {
                    const venue = getVenue(r.venueId)
                    if (!venue) return null
                    return (
                      <article className="prof-rating card" key={r.id}>
                        <div className="prof-rating-head">
                          <Link to={`/venue/${venue.id}`} className="prof-rating-venue">
                            <span
                              className={`prof-rating-swatch venue-tone venue-tone-${venue.type}`}
                              aria-hidden="true"
                            >
                              {venue.type === 'casino' ? '\u2666\uFE0E' : '\u2660\uFE0E'}
                            </span>
                            <span className="prof-rating-venue-main">
                              <b>{venue.name}</b>
                              <span className="faint prof-rating-city">{venue.city}, {venue.state}</span>
                            </span>
                          </Link>
                          <StarRating value={r.overall} showValue />
                        </div>

                        <div className="prof-rating-meta faint">
                          {r.stakesPlayed && <span>{r.stakesPlayed}</span>}
                          <span>{formatDate(r.createdAt)}</span>
                        </div>

                        {r.review && <p className="prof-rating-review">{r.review}</p>}

                        <div className="prof-subscores">
                          {SUBSCORE_META.map((m) => (
                            <div className="prof-sub" key={m.key}>
                              <span className="prof-sub-label faint">{m.label}</span>
                              <span className="prof-sub-bar">
                                <span
                                  className="prof-sub-fill"
                                  style={{ width: `${(r.subscores[m.key] / 5) * 100}%` }}
                                />
                              </span>
                              <span className="prof-sub-val num">{r.subscores[m.key].toFixed(1)}</span>
                            </div>
                          ))}
                        </div>

                        {isMe && (
                          <div className="prof-rating-actions">
                            <button
                              className="btn btn-sm"
                              onClick={() => navigate(`/compose?mode=rating&venue=${venue.id}`)}
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => {
                                if (window.confirm(`Delete your rating of ${venue.name}? The post that carried it goes too.`)) {
                                  deleteRating(r.id)
                                  showToast('Rating deleted')
                                }
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </article>
                    )
                  })}
                </div>
              )
            )}

            {tab === 'lists' && (
              <div className="prof-lists">
                {isMe && (
                  <button
                    className="btn btn-block prof-new-list"
                    onClick={() => { setListError(null); setListOpen(true) }}
                  >
                    ＋ New list
                  </button>
                )}
                {lists.length === 0 ? (
                  <EmptyState
                    icon="📋"
                    title={isMe ? 'No lists yet' : 'No public lists'}
                    body={isMe
                      ? 'Group the rooms you actually play — the soft ones, the ones with a real waitlist app, the ones you drive past.'
                      : `${profile.displayName} hasn’t shared any lists.`}
                  />
                ) : (
                  lists.map((l) => <ListCard key={l.id} list={l} />)
                )}
              </div>
            )}
          </div>
        </>
      )}

      <Modal
        open={people !== null}
        title={people === 'following' ? `@${profile.username} follows` : `Followers of @${profile.username}`}
        onClose={() => setPeople(null)}
      >
        {peopleUsers.length === 0 ? (
          <EmptyState
            icon="👤"
            title={people === 'following' ? 'Not following anyone yet' : 'No followers yet'}
            body={people === 'following'
              ? 'Following players fills the home feed with rooms worth knowing about.'
              : 'Nobody has railed this account yet.'}
          />
        ) : (
          <div className="prof-people">
            {peopleUsers.map((u) => <UserRow key={u.id} user={u} />)}
          </div>
        )}
      </Modal>

      <Modal
        open={editOpen}
        title="Edit profile"
        onClose={() => setEditOpen(false)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setEditOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveEdit} disabled={photoBusy}>Save changes</button>
          </>
        }
      >
        <div className="field">
          <span className="field-label" id="prof-photo-label">Profile photo</span>
          <div className="prof-photo" role="group" aria-labelledby="prof-photo-label">
            <Avatar
              user={{
                ...profile,
                displayName: edit.displayName || profile.displayName,
                avatarTone: edit.avatarTone,
                avatarPhoto: edit.avatarPhoto,
              }}
              size={72}
              link={false}
            />
            <div className="prof-photo-actions">
              <input
                ref={photoInput}
                type="file"
                accept="image/*"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => { void pickPhoto(e) }}
              />
              <button
                type="button"
                className="btn btn-sm"
                disabled={photoBusy}
                onClick={() => photoInput.current?.click()}
              >
                <Icon name="camera" size={15} />
                {photoBusy ? 'Preparing…' : edit.avatarPhoto ? 'Change photo' : 'Upload photo'}
              </button>
              {edit.avatarPhoto && !photoBusy && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setEdit((f) => ({ ...f, avatarPhoto: null }))}
                >
                  Remove photo
                </button>
              )}
            </div>
          </div>
          <div className="field-hint">Cropped to a square from the center.</div>
          {photoError && <div className="field-error" role="alert">{photoError}</div>}
        </div>

        <div className="field">
          <label className="field-label" htmlFor="prof-name-input">Display name</label>
          <input
            id="prof-name-input"
            value={edit.displayName}
            onChange={(e) => setEdit((f) => ({ ...f, displayName: e.target.value }))}
            placeholder="How you want to be known"
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="prof-username-input">Username</label>
          <div className="prof-handle-input">
            <span className="prof-handle-at faint" aria-hidden="true">@</span>
            <input
              id="prof-username-input"
              value={edit.username}
              onChange={(e) => setEdit((f) => ({ ...f, username: e.target.value }))}
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>
          <div className="field-hint">3-20 characters. Letters, numbers and underscores.</div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="prof-bio-input">Bio</label>
          <textarea
            id="prof-bio-input"
            value={edit.bio}
            maxLength={BIO_MAX}
            onChange={(e) => setEdit((f) => ({ ...f, bio: e.target.value }))}
            placeholder="Stakes you play, games you chase, rooms you live in."
          />
          <div className="field-hint prof-counter">
            <span className="num">{edit.bio.length}</span>/{BIO_MAX}
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="prof-location-input">Location</label>
          <input
            id="prof-location-input"
            value={edit.location}
            onChange={(e) => setEdit((f) => ({ ...f, location: e.target.value }))}
            placeholder="Las Vegas, NV"
          />
        </div>

        <div className="field">
          <span className="field-label" id="prof-tone-label">Color</span>
          <div className="prof-tones" role="radiogroup" aria-labelledby="prof-tone-label">
            {AVATAR_TONES.map((t) => (
              <label key={t.id} className="prof-tone" title={t.label}>
                <input
                  type="radio"
                  name="prof-avatar-tone"
                  className="sr-only"
                  value={t.id}
                  checked={edit.avatarTone === t.id}
                  onChange={() => setEdit((f) => ({ ...f, avatarTone: t.id }))}
                />
                <span className={`prof-tone-swatch avatar-${t.id}`} aria-hidden="true" />
                <span className="sr-only">{t.label}</span>
              </label>
            ))}
          </div>
          <div className="field-hint">
            {edit.avatarPhoto
              ? 'Colors your profile banner.'
              : 'Behind your initials, and on your profile banner.'}
          </div>
        </div>

        <div className="field">
          <span className="field-label">Roles</span>
          <div className="prof-role-grid">
            {ROLES.map((meta) => {
              const on = edit.roles.includes(meta.id)
              return (
                <button
                  key={meta.id}
                  type="button"
                  className={`chip prof-role-chip ${on ? 'is-active' : ''}`}
                  aria-pressed={on}
                  title={meta.blurb}
                  onClick={() => toggleRole(meta.id)}
                >
                  <span aria-hidden="true">{meta.emoji}</span>
                  <span className="prof-role-label">{meta.label}</span>
                  {meta.staff && <span className="prof-role-staff">staff</span>}
                </button>
              )
            })}
          </div>
          <div className="field-hint">Staff roles show a different badge on your posts.</div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="prof-home-select">Home room</label>
          <select
            id="prof-home-select"
            value={edit.homeVenueId}
            onChange={(e) => setEdit((f) => ({ ...f, homeVenueId: e.target.value }))}
          >
            <option value="">None</option>
            {venueOptions.map((v) => (
              <option key={v.id} value={v.id}>{v.name} — {v.city}, {v.state}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <Switch
            checked={edit.isPrivate}
            onToggle={() => setEdit((f) => ({ ...f, isPrivate: !f.isPrivate }))}
            label="Private account"
            hint={edit.isPrivate
              ? 'Only approved followers see your posts, ratings and lists. Going public again approves everyone still waiting.'
              : 'Anyone can see your posts, ratings and lists.'}
          />
        </div>

        {editError && <div className="field-error">{editError}</div>}
      </Modal>

      <Modal
        open={listOpen}
        title="New list"
        onClose={() => setListOpen(false)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setListOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={submitList} disabled={!listForm.name.trim()}>
              Create list
            </button>
          </>
        }
      >
        <div className="field">
          <label className="field-label" htmlFor="prof-list-name">Name</label>
          <input
            id="prof-list-name"
            value={listForm.name}
            onChange={(e) => setListForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Rooms worth the drive"
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="prof-list-desc">Description</label>
          <textarea
            id="prof-list-desc"
            value={listForm.description}
            onChange={(e) => setListForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="What gets a room onto this list?"
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="prof-list-emoji">Emoji</label>
          <div className="prof-emoji-row">
            <input
              id="prof-list-emoji"
              className="prof-emoji-input"
              value={listForm.emoji}
              maxLength={2}
              onChange={(e) => setListForm((f) => ({ ...f, emoji: e.target.value }))}
            />
            <div className="chip-row prof-emoji-picks">
              {LIST_EMOJI.map((glyph) => (
                <button
                  key={glyph}
                  type="button"
                  className={`chip prof-emoji-chip ${listForm.emoji === glyph ? 'is-active' : ''}`}
                  aria-pressed={listForm.emoji === glyph}
                  aria-label={`Use ${glyph}`}
                  onClick={() => setListForm((f) => ({ ...f, emoji: glyph }))}
                >
                  {glyph}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="field">
          <Switch
            checked={listForm.isPublic}
            onToggle={() => setListForm((f) => ({ ...f, isPublic: !f.isPublic }))}
            label="Public list"
            hint={listForm.isPublic
              ? 'Anyone who can see your profile can open this list.'
              : 'Only you can see this list.'}
          />
        </div>

        {listError && <div className="field-error">{listError}</div>}
      </Modal>

      {toastNode}
    </div>
  )
}
