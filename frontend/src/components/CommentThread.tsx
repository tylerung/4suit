import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Comment } from '../types'
import { addComment, deleteComment, listComments, toggleCommentLike } from '../lib/api'
import { useQuery } from '../hooks/useQuery'
import { useUser } from '../lib/directory'
import { timeAgo } from '../lib/geo'
import { useApp } from '../state/AppContext'
import Avatar from './Avatar'
import './CommentThread.css'

const MAX = 500
const NO_COMMENTS: Comment[] = []

export default function CommentThread({ postId }: { postId: string }) {
  const { currentUser } = useApp()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const { data: comments } = useQuery<Comment[]>(
    () => listComments(postId),
    [postId],
    NO_COMMENTS,
  )

  const submit = () => {
    if (!currentUser || !draft.trim() || sending) return
    setSending(true)
    // Clear the box on success only: a failed reply the user has to retype is
    // worse than one still sitting there.
    void addComment(postId, draft)
      .then(() => setDraft(''))
      .finally(() => setSending(false))
  }

  return (
    <section className="comments" aria-label="Comments">
      {currentUser && (
        <div className="comment-composer">
          <Avatar user={currentUser} size={38} link={false} />
          <div className="comment-composer-main">
            <textarea
              value={draft}
              maxLength={MAX}
              placeholder="Add a comment…"
              aria-label="Add a comment"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
              }}
            />
            <div className="comment-composer-foot">
              <span className="faint num">{draft.length}/{MAX}</span>
              <button
                className="btn btn-sm btn-primary"
                disabled={!draft.trim() || sending}
                onClick={submit}
              >
                Reply
              </button>
            </div>
          </div>
        </div>
      )}

      <h2 className="section-title comments-title">
        {comments.length} comment{comments.length === 1 ? '' : 's'}
      </h2>

      {comments.length === 0 && (
        <p className="faint comments-empty">No comments yet. Be the first.</p>
      )}

      {comments.map((c) => <CommentRow key={c.id} comment={c} />)}
    </section>
  )
}

/** One comment. Split out so each row can resolve its own author. */
function CommentRow({ comment: c }: { comment: Comment }) {
  const { currentUser } = useApp()
  const author = useUser(c.authorId)
  if (!author) return null
  const liked = currentUser ? c.likedBy.includes(currentUser.id) : false
  return (
    <div className="comment">
      <Avatar user={author} size={34} />
      <div className="comment-main">
        <div className="comment-head">
          <Link to={`/u/${author.username}`} className="comment-author">
            {author.displayName}
          </Link>
          <span className="faint">@{author.username}</span>
          <span className="faint">· {timeAgo(c.createdAt)}</span>
        </div>
        <p className="comment-body">{c.body}</p>
        <div className="comment-actions">
          <button
            className={`comment-action ${liked ? 'liked' : ''}`}
            aria-pressed={liked}
            onClick={() => { if (currentUser) void toggleCommentLike(c.id) }}
          >
            {liked ? '♥' : '♡'} <span className="num">{c.likedBy.length}</span>
          </button>
          {currentUser?.id === c.authorId && (
            <button
              className="comment-action danger"
              onClick={() => {
                if (confirm('Delete this comment?')) void deleteComment(c.id)
              }}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
