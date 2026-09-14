import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { FeedItem } from '../types'
import { deletePost, toggleLike, updatePost } from '../lib/api'
import { formatMoney, timeAgo } from '../lib/geo'
import { useApp } from '../state/AppContext'
import Avatar from './Avatar'
import StarRating from './StarRating'
import MediaGrid from './MediaGrid'
import './PostCard.css'
import Icon from './Icon'

interface Props {
  item: FeedItem
  /** Suppress the click-through wrapper on the detail screen itself. */
  detail?: boolean
}

export default function PostCard({ item, detail = false }: Props) {
  const { post, author, venue, rating, commentCount, likedByMe } = item
  const { currentUser } = useApp()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(post.body)
  const [menuOpen, setMenuOpen] = useState(false)

  const isMine = currentUser?.id === post.authorId

  const open = () => { if (!detail && !editing) navigate(`/post/${post.id}`) }

  return (
    <article
      className={`post-card ${detail ? 'is-detail' : ''}`}
      onClick={open}
      role={detail ? undefined : 'link'}
      tabIndex={detail ? undefined : 0}
      onKeyDown={(e) => { if (!detail && e.key === 'Enter') open() }}
    >
      <Avatar user={author} size={42} />

      <div className="post-main">
        <header className="post-head">
          <Link
            to={`/u/${author.username}`}
            className="post-author"
            onClick={(e) => e.stopPropagation()}
          >
            {author.displayName}
          </Link>
          {author.verified && <span className="verified" title="Verified">✓</span>}
          <span className="faint post-handle">@{author.username}</span>
          <span className="faint">·</span>
          <span className="faint" title={new Date(post.createdAt).toLocaleString()}>
            {timeAgo(post.createdAt)}
          </span>
          <span className="spacer" />
          {isMine && (
            <div className="post-menu-wrap" onClick={(e) => e.stopPropagation()}>
              <button
                className="post-menu-btn"
                aria-label="Post options"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                ···
              </button>
              {menuOpen && (
                <div className="post-menu card">
                  <button onClick={() => { setEditing(true); setMenuOpen(false) }}>Edit post</button>
                  <button
                    className="danger"
                    onClick={() => {
                      setMenuOpen(false)
                      if (confirm('Delete this post? This cannot be undone.')) {
                        deletePost(post.id)
                        if (detail) navigate(-1)
                      }
                    }}
                  >
                    Delete post
                  </button>
                </div>
              )}
            </div>
          )}
        </header>

        {editing ? (
          <div className="post-edit" onClick={(e) => e.stopPropagation()}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Edit post text"
            />
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-sm btn-ghost" onClick={() => { setDraft(post.body); setEditing(false) }}>
                Cancel
              </button>
              <button
                className="btn btn-sm btn-primary"
                disabled={!draft.trim()}
                onClick={() => { updatePost(post.id, draft); setEditing(false) }}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <p className="post-body">{post.body}</p>
        )}

        {/* MediaGrid contains its own clicks, so the card needs no guard here. */}
        {post.media.length > 0 && (
          <div className="post-media">
            <MediaGrid items={post.media} compact={!detail} />
          </div>
        )}

        {post.kind === 'rating' && rating && venue && (
          <Link
            to={`/venue/${venue.id}`}
            className="post-attach post-rating"
            onClick={(e) => e.stopPropagation()}
          >
            <span
              className={`post-attach-swatch venue-tone venue-tone-${venue.type}`}
              aria-hidden="true"
            >
              {venue.type === 'casino' ? '\u2666\uFE0E' : '\u2660\uFE0E'}
            </span>
            <span className="post-attach-main">
              <b>{venue.name}</b>
              <span className="faint">{venue.city}, {venue.state} · {rating.stakesPlayed}</span>
            </span>
            <span className="post-attach-score">
              <StarRating value={rating.overall} size={13} />
              <b className="num">{rating.overall.toFixed(1)}</b>
            </span>
          </Link>
        )}

        {post.kind === 'session' && post.session && venue && (
          <Link
            to={`/venue/${venue.id}`}
            className="post-attach post-session"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="post-attach-main">
              <b>{venue.name}</b>
              <span className="faint">{post.session.stakes} · {post.session.hours}h session</span>
            </span>
            <span className={`post-session-net num ${post.session.net >= 0 ? 'pos' : 'neg'}`}>
              {formatMoney(post.session.net)}
            </span>
          </Link>
        )}

        {post.kind === 'text' && venue && (
          <Link
            to={`/venue/${venue.id}`}
            className="post-venue-tag"
            onClick={(e) => e.stopPropagation()}
          >
            <Icon name="pin" size={14} /> {venue.name}
          </Link>
        )}

        {post.tags.length > 0 && (
          <div className="post-tags">
            {post.tags.map((t) => (
              <Link
                key={t}
                to={`/search?q=${encodeURIComponent(t)}`}
                className="post-tag"
                onClick={(e) => e.stopPropagation()}
              >
                #{t}
              </Link>
            ))}
          </div>
        )}

        <footer className="post-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className={`post-action ${likedByMe ? 'liked' : ''}`}
            onClick={() => currentUser && toggleLike(post.id, currentUser.id)}
            aria-pressed={likedByMe}
            aria-label={likedByMe ? 'Unlike' : 'Like'}
          >
            <span aria-hidden="true">{likedByMe ? '♥' : '♡'}</span>
            <span className="num">{post.likedBy.length}</span>
          </button>
          <Link to={`/post/${post.id}`} className="post-action">
            <Icon name="chat" size={17} />
            <span className="num">{commentCount}</span>
          </Link>
          {venue && (
            <Link to={`/venue/${venue.id}`} className="post-action">
              <Icon name="pin" size={17} />
              <span className="post-action-text">Room</span>
            </Link>
          )}
        </footer>
      </div>
    </article>
  )
}
