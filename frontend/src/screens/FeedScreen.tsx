import { Fragment, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { FeedItem, User } from '../types'
import { listFeed, suggestedUsers, type FeedScope } from '../lib/api'
import { useQuery } from '../hooks/useQuery'
import { useApp } from '../state/AppContext'
import Avatar from '../components/Avatar'
import EmptyState from '../components/EmptyState'
import PostCard from '../components/PostCard'
import ScreenHeader from '../components/ScreenHeader'
import UserRow from '../components/UserRow'
import './FeedScreen.css'

/** Posts shown before the "who to follow" card gets slipped into the feed. */
const INTERLEAVE_AFTER = 6

const SCOPES: { id: FeedScope; label: string }[] = [
  { id: 'following', label: 'Following' },
  { id: 'discover', label: 'Discover' },
]

function WhoToFollow({ users }: { users: User[] }) {
  if (users.length === 0) return null
  return (
    <section className="feed-suggest card" aria-label="Who to follow">
      <div className="feed-suggest-head">
        <h2 className="section-title">Who to follow</h2>
        <Link to="/search" className="feed-suggest-more">Browse players</Link>
      </div>
      <div className="feed-suggest-list">
        {users.map((u) => <UserRow key={u.id} user={u} />)}
      </div>
    </section>
  )
}

const NO_ITEMS: FeedItem[] = []
const NO_USERS: User[] = []

export default function FeedScreen() {
  const { currentUser } = useApp()
  const navigate = useNavigate()
  const [scope, setScope] = useState<FeedScope>('following')
  const tabRefs = useRef<Record<FeedScope, HTMLButtonElement | null>>({
    following: null,
    discover: null,
  })

  const meId = currentUser?.id ?? null

  const { data: items, loaded, error } = useQuery<FeedItem[]>(
    () => (meId ? listFeed(scope) : Promise.resolve(NO_ITEMS)),
    [meId, scope],
    NO_ITEMS,
  )

  const { data: suggestions } = useQuery<User[]>(
    () => suggestedUsers(5),
    [meId],
    NO_USERS,
  )

  if (!currentUser) {
    return (
      <>
        <ScreenHeader title="4suit" />
        <EmptyState
          icon="♠️"
          title="Nobody is seated"
          body="Pick a player to sign in as and the feed fills up."
          action={<Link className="btn btn-primary" to="/signin">Sign in</Link>}
        />
      </>
    )
  }

  const moveTab = (dir: -1 | 1) => {
    const i = SCOPES.findIndex((s) => s.id === scope)
    const next = SCOPES[(i + dir + SCOPES.length) % SCOPES.length].id
    setScope(next)
    tabRefs.current[next]?.focus()
  }

  const interleave = scope === 'following'
    && items.length > INTERLEAVE_AFTER
    && suggestions.length > 0

  return (
    <>
      <ScreenHeader
        title="4suit"
        actions={
          <Link to="/compose" className="btn btn-sm btn-primary">Post</Link>
        }
      />

      <div className="feed-seg" role="tablist" aria-label="Feed scope">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            id={`feed-tab-${s.id}`}
            role="tab"
            type="button"
            ref={(el) => { tabRefs.current[s.id] = el }}
            aria-selected={scope === s.id}
            aria-controls="feed-panel"
            tabIndex={scope === s.id ? 0 : -1}
            className={`feed-seg-btn ${scope === s.id ? 'is-on' : ''}`}
            onClick={() => setScope(s.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') { e.preventDefault(); moveTab(-1) }
              if (e.key === 'ArrowRight') { e.preventDefault(); moveTab(1) }
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="feed-composer">
        <Avatar user={currentUser} size={40} link={false} />
        <button
          type="button"
          className="feed-composer-input"
          onClick={() => navigate('/compose')}
        >
          <span className="feed-composer-text">Share a session, a room, or a rating…</span>
          <span className="feed-composer-pen" aria-hidden="true">✎</span>
        </button>
      </div>

      <div
        id="feed-panel"
        role="tabpanel"
        aria-labelledby={`feed-tab-${scope}`}
        className="feed-list"
      >
        {error && <p className="load-error" role="alert">{error}</p>}

        {!loaded ? (
          <p className="screen-loading faint" role="status">Dealing the feed…</p>
        ) : items.length === 0 ? (
          scope === 'following' ? (
            <>
              <EmptyState
                icon="🃏"
                title="Your feed is quiet"
                body="Nobody you follow has posted. Go find some players — grinders, dealers, the guy who logs every $1/$3 session — and their posts land here."
                action={<Link className="btn btn-primary" to="/search">Find players to follow</Link>}
              />
              <WhoToFollow users={suggestions} />
            </>
          ) : (
            <EmptyState
              icon="🂠"
              title="Nothing on the rail"
              body="No public posts to show yet. Be the first to put one up."
              action={<Link className="btn btn-primary" to="/compose">Write a post</Link>}
            />
          )
        ) : (
          items.map((item, i) => (
            <Fragment key={item.post.id}>
              <PostCard item={item} />
              {interleave && i === INTERLEAVE_AFTER - 1 && <WhoToFollow users={suggestions} />}
            </Fragment>
          ))
        )}
      </div>

      {items.length > 0 && (
        <p className="feed-end faint">
          {scope === 'following'
            ? 'That’s everyone you follow, all caught up.'
            : 'End of the rail — you’ve seen every public post.'}
        </p>
      )}
    </>
  )
}
