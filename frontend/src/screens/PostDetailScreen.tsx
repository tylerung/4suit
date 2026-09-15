import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { FeedItem, User } from '../types'
import { getFeedItem, listUsersByIds } from '../lib/api'
import { useQuery } from '../hooks/useQuery'
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
const NO_USERS: User[] = []

export default function PostDetailScreen() {
  const { postId } = useParams()
  const { currentUser } = useApp()
  const [likersOpen, setLikersOpen] = useState(false)

  /* The API decides whether this post is readable at all: a post from a private
     account the viewer does not follow comes back as a refusal, not as a record
     the screen has to remember to hide. */
  const { data: item, loaded } = useQuery<FeedItem | null>(
    () => (postId ? getFeedItem(postId) : Promise.resolve(null)),
    [postId, currentUser?.id],
    null,
  )

  // Keyed on the ids themselves, so a like added anywhere refetches the faces.
  const likedBy = (item?.post.likedBy ?? []).join(',')
  const { data: likers } = useQuery<User[]>(
    () => listUsersByIds(likedBy ? likedBy.split(',') : []),
    [likedBy],
    NO_USERS,
  )

  if (!loaded) {
    return (
      <>
        <ScreenHeader title="Post" back />
        <p className="screen-loading faint" role="status">Turning it over…</p>
      </>
    )
  }

  if (!item) {
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

  const post = item.post
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
