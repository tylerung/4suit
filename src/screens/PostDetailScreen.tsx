import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { User } from '../types'
import { canViewProfile, getPost, getUser, hydratePost } from '../lib/api'
import { formatCount } from '../lib/geo'
import { useApp } from '../state/AppContext'
import Avatar from '../components/Avatar'
import CommentThread from '../components/CommentThread'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import PostCard from '../components/PostCard'
import ScreenHeader from '../components/ScreenHeader'
import UserRow from '../components/UserRow'
import './PostDetailScreen.css'

const STACK_MAX = 6

export default function PostDetailScreen() {
  const { postId } = useParams()
  const { currentUser, revision } = useApp()
  const [likersOpen, setLikersOpen] = useState(false)
  void revision

  const viewerId = currentUser?.id ?? null
  const post = getPost(postId)
  const item = post ? hydratePost(post, viewerId) : null

  if (!post || !item || !canViewProfile(viewerId, post.authorId)) {
    return (
      <>
        <ScreenHeader title="Post" back />
        <EmptyState
          title="Post unavailable"
          body="This post is from a private account you do not follow."
          action={<Link to="/" className="btn btn-primary">Back to the feed</Link>}
        />
      </>
    )
  }

  const likers = post.likedBy
    .map((id) => getUser(id))
    .filter((u): u is User => u !== null)

  const likeCount = post.likedBy.length
  const commentCount = item.commentCount
  const others = likers.length - 1

  return (
    <>
      <ScreenHeader title="Post" back />

      <PostCard item={item} detail />

      <section className="pd-stats" aria-label="Post activity">
        <div className="pd-metrics">
          <span className="pd-metric">
            <b className="num">{formatCount(likeCount)}</b>{' '}
            <span className="faint">{likeCount === 1 ? 'like' : 'likes'}</span>
          </span>
          <span className="pd-metric">
            <b className="num">{formatCount(commentCount)}</b>{' '}
            <span className="faint">{commentCount === 1 ? 'comment' : 'comments'}</span>
          </span>
        </div>

        <div className="pd-time faint">
          Posted {new Date(post.createdAt).toLocaleString()}
        </div>

        {likers.length > 0 && (
          <button
            type="button"
            className="pd-likers"
            aria-haspopup="dialog"
            onClick={() => setLikersOpen(true)}
          >
            <span className="pd-stack" aria-hidden="true">
              {likers.slice(0, STACK_MAX).map((u) => (
                <span key={u.id} className="pd-stack-item">
                  <Avatar user={u} size={26} link={false} />
                </span>
              ))}
            </span>
            <span className="pd-likers-label">
              Liked by <b>{likers[0].displayName}</b>
              {others > 0 && ` and ${others === 1 ? '1 other' : `${formatCount(others)} others`}`}
            </span>
          </button>
        )}
      </section>

      <CommentThread postId={post.id} />

      <Modal
        open={likersOpen && likers.length > 0}
        title={likers.length === 1 ? '1 like' : `${likers.length} likes`}
        onClose={() => setLikersOpen(false)}
      >
        <div className="pd-liker-list">
          {likers.map((u) => (
            <UserRow key={u.id} user={u} />
          ))}
        </div>
      </Modal>
    </>
  )
}
