import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AMENITY_LABELS, GAME_LABELS, SUBSCORE_META,
  type Rating, type User,
} from '../types'
import {
  createList, deleteRating, getUser, getVenue, getVenueStats, listListsByUser,
  listPostsForVenue, listRatingsForVenue, rankVenues, toggleVenueInList,
} from '../lib/api'
import { distanceMi, formatDate, formatDistance, timeAgo } from '../lib/geo'
import { useApp } from '../state/AppContext'
import Avatar from '../components/Avatar'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import PostCard from '../components/PostCard'
import ScreenHeader from '../components/ScreenHeader'
import StarRating from '../components/StarRating'
import VenueRow from '../components/VenueRow'
import { useToast } from '../components/Toast'
import './VenueDetailScreen.css'
import Icon from '../components/Icon'

type ReviewSort = 'newest' | 'highest' | 'lowest'
type Tab = 'reviews' | 'posts'

const SORT_LABELS: { id: ReviewSort; label: string }[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'highest', label: 'Highest' },
  { id: 'lowest', label: 'Lowest' },
]

function sortReviews(rows: Rating[], sort: ReviewSort): Rating[] {
  const out = [...rows]
  switch (sort) {
    case 'highest':
      out.sort((a, b) => b.overall - a.overall || b.createdAt.localeCompare(a.createdAt))
      break
    case 'lowest':
      out.sort((a, b) => a.overall - b.overall || b.createdAt.localeCompare(a.createdAt))
      break
    default:
      out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
  return out
}

/** Strip the protocol so the anchor shows the bare domain the seed data uses. */
function bareDomain(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
}

function ReviewCard(
  { rating, author, mine, actions }:
  { rating: Rating; author: User; mine: boolean; actions?: ReactNode },
) {
  return (
    <article className={`card vd-review${mine ? ' vd-review-mine' : ''}`}>
      <header className="vd-review-head">
        <Avatar user={author} size={38} />
        <div className="vd-review-who">
          <div className="vd-review-line">
            <Link to={`/u/${author.username}`} className="vd-review-name">
              {author.displayName}
            </Link>
            {author.verified && <span className="vd-review-check" title="Verified">✓</span>}
          </div>
          <div className="vd-review-line faint">
            <span className="vd-review-handle">@{author.username}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={rating.createdAt} title={formatDate(rating.createdAt)}>
              {timeAgo(rating.createdAt)}
            </time>
          </div>
        </div>
        <StarRating value={rating.overall} showValue />
      </header>

      <div className="vd-review-chips">
        {mine && <span className="chip chip-static vd-review-mine-tag">Your review</span>}
        {rating.stakesPlayed && (
          <span className="chip chip-static">Played {rating.stakesPlayed}</span>
        )}
      </div>

      {rating.review
        ? <p className="vd-review-body">{rating.review}</p>
        : <p className="vd-review-body faint">Scored the room, left no notes.</p>}

      {actions && <div className="vd-review-actions">{actions}</div>}
    </article>
  )
}

export default function VenueDetailScreen() {
  const { venueId } = useParams<{ venueId: string }>()
  const { revision, currentUser, origin, originLabel } = useApp()
  const [toastNode, showToast] = useToast()

  const [tab, setTab] = useState<Tab>('reviews')
  const [reviewSort, setReviewSort] = useState<ReviewSort>('newest')
  const [saveOpen, setSaveOpen] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [newListPublic, setNewListPublic] = useState(false)

  const meId = currentUser?.id ?? null

  const data = useMemo(() => {
    void revision
    const venue = getVenue(venueId)
    if (!venue) return null

    const ranked = rankVenues({ origin })
    const row = ranked.find((r) => r.venue.id === venue.id) ?? null

    const nearby = ranked
      .filter((r) => r.venue.id !== venue.id)
      .map((r) => ({ ...r, distanceMi: Math.round(distanceMi(venue, r.venue) * 10) / 10 }))
      .sort((a, b) => a.distanceMi - b.distanceMi)
      .slice(0, 4)

    return {
      venue,
      stats: getVenueStats(venue.id),
      row,
      nearby,
      ratings: listRatingsForVenue(venue.id, meId),
      posts: listPostsForVenue(venue.id, meId),
      lists: meId ? listListsByUser(meId, meId) : [],
    }
  }, [revision, venueId, origin, meId])

  if (!data) {
    return (
      <>
        <ScreenHeader title="Room" back />
        <EmptyState
          icon="🚪"
          title="Room not found"
          body="That room is not on the board — it may have been folded into another listing."
          action={<Link className="btn btn-primary" to="/rankings">Back to the rankings</Link>}
        />
      </>
    )
  }

  const { venue, stats, row, nearby, ratings, posts, lists } = data
  const emoji = venue.type === 'casino' ? '\u2666\uFE0E' : '\u2660\uFE0E'
  const typeLabel = venue.type === 'casino' ? 'Casino' : 'Card room'
  const domain = bareDomain(venue.website)
  const savedIn = lists.filter((l) => l.venueIds.includes(venue.id))
  const subscores = stats.subscores

  const myRating = meId ? (ratings.find((r) => r.userId === meId) ?? null) : null
  const otherRatings = sortReviews(
    ratings.filter((r) => r.id !== myRating?.id),
    reviewSort,
  )

  const withAuthor = (rating: Rating): { rating: Rating; author: User } | null => {
    const author = getUser(rating.userId)
    return author ? { rating, author } : null
  }
  const otherRows = otherRatings
    .map(withAuthor)
    .filter((x): x is { rating: Rating; author: User } => x !== null)
  const myRow = myRating ? withAuthor(myRating) : null

  const rateHref = `/compose?mode=rating&venue=${encodeURIComponent(venue.id)}`
  const postHref = `/compose?venue=${encodeURIComponent(venue.id)}`

  const removeMyReview = () => {
    if (!myRating) return
    if (!confirm(`Delete your review of ${venue.name}? The rating post goes with it.`)) return
    deleteRating(myRating.id)
    showToast('Review deleted')
  }

  const createAndAdd = () => {
    const name = newListName.trim()
    if (!meId || !name) return
    createList(meId, { name, isPublic: newListPublic, venueIds: [venue.id] })
    setNewListName('')
    setNewListPublic(false)
    showToast(`Started “${name}”`)
  }

  return (
    <>
      <ScreenHeader title={venue.name} subtitle={`${venue.city}, ${venue.state}`} back />

      <section
        className={`vd-hero venue-deep venue-deep-${venue.type}`}
      >
        <div className="vd-hero-veil" />
        <span className="vd-hero-mark" aria-hidden="true">{emoji}</span>
        <div className="vd-hero-inner">
          <h2 className="vd-hero-name">{venue.name}</h2>
          <div className="vd-hero-place muted">
            {venue.city}, {venue.state}
            {row && row.distanceMi !== null && (
              <> · {formatDistance(row.distanceMi)} away</>
            )}
          </div>
          <div className="vd-hero-chips">
            <span className="chip chip-static">{typeLabel}</span>
            <span className="chip chip-static">{venue.tableCount} tables</span>
          </div>

          <div className="vd-hero-score">
            {stats.average === null ? (
              <div className="vd-hero-unrated">
                <b>Unrated</b>
                <span className="faint">Nobody has scored this room yet.</span>
              </div>
            ) : (
              <>
                <span className="num vd-hero-big">{stats.average.toFixed(1)}</span>
                <span className="vd-hero-stack">
                  <StarRating value={stats.average} showValue count={stats.count} />
                  {row && (
                    <span className="vd-hero-rank">
                      <b className="num">#{row.stats.rank}</b> near {originLabel}
                    </span>
                  )}
                </span>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="vd-actions">
        <Link className="btn btn-primary" to={rateHref}>
          {myRating ? 'Update your rating' : 'Rate this room'}
        </Link>
        <Link className="btn" to={postHref}>Post about it</Link>
        <button className="btn" onClick={() => setSaveOpen(true)}>
          {savedIn.length ? `Saved · ${savedIn.length}` : 'Save to list'}
        </button>
      </div>

      <section className="vd-section">
        <h2 className="section-title">The room</h2>
        <p className="vd-blurb">{venue.blurb}</p>
        <dl className="vd-info card">
          <div className="vd-info-cell">
            <dt className="faint">Address</dt>
            <dd>{venue.address}, {venue.city}, {venue.state}</dd>
          </div>
          <div className="vd-info-cell">
            <dt className="faint">Hours</dt>
            <dd>{venue.hours}</dd>
          </div>
          <div className="vd-info-cell">
            <dt className="faint">Rake</dt>
            <dd>{venue.rake}</dd>
          </div>
          <div className="vd-info-cell">
            <dt className="faint">Tables</dt>
            <dd className="num">{venue.tableCount}</dd>
          </div>
          <div className="vd-info-cell">
            <dt className="faint">Website</dt>
            <dd>
              <a
                className="vd-link"
                href={`https://${domain}`}
                target="_blank"
                rel="noreferrer"
              >
                {domain} <span aria-hidden="true">↗</span>
              </a>
            </dd>
          </div>
        </dl>
      </section>

      <section className="vd-section">
        <h2 className="section-title">Games spread</h2>
        <div className="vd-chips">
          {venue.games.map((g) => (
            <span key={g} className="chip chip-static">{GAME_LABELS[g]}</span>
          ))}
        </div>

        <h2 className="section-title vd-section-gap">Stakes</h2>
        <div className="vd-chips">
          {venue.stakes.map((s) => (
            <span key={s} className="chip chip-static num vd-stake">{s}</span>
          ))}
        </div>

        <h2 className="section-title vd-section-gap">Amenities</h2>
        <div className="vd-chips">
          {venue.amenities.map((a) => (
            <span key={a} className="chip chip-static">{AMENITY_LABELS[a]}</span>
          ))}
        </div>
      </section>

      <section className="vd-section">
        <h2 className="section-title">Score breakdown</h2>
        {subscores === null ? (
          <p className="muted vd-note">
            Not rated yet. The breakdown fills in as soon as somebody scores the six categories.
          </p>
        ) : (
          <div className="vd-bars card">
            {SUBSCORE_META.map((m) => {
              const value = subscores[m.key]
              return (
                <div className="vd-bar-row" key={m.key} title={m.hint}>
                  <span className="vd-bar-label">{m.label}</span>
                  <span className="vd-bar-track" aria-hidden="true">
                    <span className="vd-bar-fill" style={{ width: `${(value / 5) * 100}%` }} />
                  </span>
                  <b className="num vd-bar-value">{value.toFixed(1)}</b>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="vd-section">
        <div className="vd-tabs" role="group" aria-label="Room activity">
          <button
            className={`vd-tab${tab === 'reviews' ? ' is-active' : ''}`}
            aria-pressed={tab === 'reviews'}
            onClick={() => setTab('reviews')}
          >
            Reviews <span className="num faint">{ratings.length}</span>
          </button>
          <button
            className={`vd-tab${tab === 'posts' ? ' is-active' : ''}`}
            aria-pressed={tab === 'posts'}
            onClick={() => setTab('posts')}
          >
            Posts <span className="num faint">{posts.length}</span>
          </button>
        </div>

        {tab === 'reviews' ? (
          <>
            {ratings.length > 1 && (
              <div className="chip-row vd-sort" role="group" aria-label="Sort reviews">
                {SORT_LABELS.map((s) => (
                  <button
                    key={s.id}
                    className="chip"
                    aria-pressed={reviewSort === s.id}
                    onClick={() => setReviewSort(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            {stats.count > ratings.length && (
              <p className="field-hint vd-hidden-note">
                {stats.count - ratings.length} more{' '}
                {stats.count - ratings.length === 1 ? 'review counts' : 'reviews count'} toward this
                room&rsquo;s score but {stats.count - ratings.length === 1 ? 'is' : 'are'} written by
                private accounts you do not follow.
              </p>
            )}

            {ratings.length === 0 ? (
              <EmptyState
                icon="⭐"
                title={stats.count > 0 ? 'No reviews you can read' : 'No reviews yet'}
                body={stats.count > 0
                  ? 'Every review here is from a private account. Add yours and it will be the first one anybody can read.'
                  : 'Be the first to tell people what the games, the dealers and the rake are actually like.'}
                action={<Link className="btn btn-primary" to={rateHref}>Rate this room</Link>}
              />
            ) : (
              <div className="vd-reviews">
                {myRow && (
                  <ReviewCard
                    rating={myRow.rating}
                    author={myRow.author}
                    mine
                    actions={
                      <>
                        <Link className="btn btn-sm" to={rateHref}>Edit</Link>
                        <button className="btn btn-sm btn-danger" onClick={removeMyReview}>
                          Delete
                        </button>
                      </>
                    }
                  />
                )}
                {otherRows.map(({ rating, author }) => (
                  <ReviewCard key={rating.id} rating={rating} author={author} mine={false} />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {posts.length === 0 ? (
              <EmptyState
                icon="💬"
                title="Nothing posted from here"
                body="No session results, no bad beats, no waitlist complaints. Yet."
                action={<Link className="btn btn-primary" to={postHref}>Post about it</Link>}
              />
            ) : (
              <div className="vd-posts">
                {posts.map((item) => <PostCard key={item.post.id} item={item} />)}
              </div>
            )}
          </>
        )}
      </section>

      {nearby.length > 0 && (
        <section className="vd-section">
          <h2 className="section-title">Nearby rooms</h2>
          <div className="vd-nearby">
            {nearby.map((r) => (
              <VenueRow key={r.venue.id} row={r} showRank={false} />
            ))}
          </div>
        </section>
      )}

      <Modal
        open={saveOpen}
        title={`Save ${venue.name}`}
        onClose={() => setSaveOpen(false)}
        footer={
          <button className="btn btn-primary" onClick={() => setSaveOpen(false)}>Done</button>
        }
      >
        {!meId ? (
          <p className="muted">
            <Link className="vd-link" to="/signin">Sign in</Link> to keep lists of rooms.
          </p>
        ) : (
          <>
            {lists.length === 0 ? (
              <p className="muted vd-note">
                You have no lists yet. Start one below — a room per line is how the good ones begin.
              </p>
            ) : (
              <div className="vd-list-picker">
                {lists.map((list) => {
                  const has = list.venueIds.includes(venue.id)
                  return (
                    <button
                      key={list.id}
                      type="button"
                      role="checkbox"
                      aria-checked={has}
                      className={`vd-list-row${has ? ' is-in' : ''}`}
                      onClick={() => {
                        const added = toggleVenueInList(list.id, venue.id)
                        showToast(added
                          ? `Added to ${list.name}`
                          : `Removed from ${list.name}`)
                      }}
                    >
                      <span className="vd-list-box" aria-hidden="true">{has ? '✓' : ''}</span>
                      <span className="vd-list-emoji" aria-hidden="true">{list.emoji}</span>
                      <span className="vd-list-main">
                        <span className="vd-list-name">{list.name}</span>
                        <span className="faint vd-list-meta">
                          {list.venueIds.length} {list.venueIds.length === 1 ? 'room' : 'rooms'}
                          {' · '}{list.isPublic ? 'Public' : 'Private'}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            <form
              className="vd-newlist"
              onSubmit={(e) => { e.preventDefault(); createAndAdd() }}
            >
              <label className="field-label" htmlFor="vd-newlist-name">New list</label>
              <input
                id="vd-newlist-name"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="Rooms worth the drive"
                maxLength={60}
              />
              <div className="vd-newlist-foot">
                <button
                  type="button"
                  className="chip"
                  aria-pressed={newListPublic}
                  onClick={() => setNewListPublic((v) => !v)}
                >
                  {newListPublic
                    ? <><Icon name="globe" size={13} /> Public</>
                    : <><Icon name="lock" size={13} /> Private</>}
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-primary"
                  disabled={!newListName.trim()}
                >
                  Create &amp; add
                </button>
              </div>
            </form>
          </>
        )}
      </Modal>

      {toastNode}
    </>
  )
}
