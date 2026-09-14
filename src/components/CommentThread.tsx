import { useState } from 'react'
import { Link } from 'react-router-dom'
import { addComment, deleteComment, getUser, listComments, toggleCommentLike } from '../lib/api'
import { timeAgo } from '../lib/geo'
import { useApp } from '../state/AppContext'
import Avatar from './Avatar'
import './CommentThread.css'

const MAX = 500

export default function CommentThread({ postId }: { postId: string }) {
  const { currentUser, revision } = useApp()
  const [draft, setDraft] = useState('')
  void revision

  const comments = listComments(postId)

  const submit = () => {
    if (!currentUser || !draft.trim()) return
    addComment(postId, currentUser.id, draft)
    setDraft('')
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
              <button className="btn btn-sm btn-primary" disabled={!draft.trim()} onClick={submit}>
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

      {comments.map((c) => {
        const author = getUser(c.authorId)
        if (!author) return null
        const liked = currentUser ? c.likedBy.includes(currentUser.id) : false
        return (
          <div key={c.id} className="comment">
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
                  onClick={() => currentUser && toggleCommentLike(c.id, currentUser.id)}
                >
                  {liked ? '♥' : '♡'} <span className="num">{c.likedBy.length}</span>
                </button>
                {currentUser?.id === c.authorId && (
                  <button
                    className="comment-action danger"
                    onClick={() => { if (confirm('Delete this comment?')) deleteComment(c.id) }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </section>
  )
}
