import { followState, toggleFollow } from '../lib/api'
import { useApp } from '../state/AppContext'
import type { User } from '../types'

interface Props {
  user: User
  size?: 'sm' | 'md'
}

/**
 * Handles all four states: your own profile (renders nothing), following,
 * request-pending on a private account, and not following.
 */
export default function FollowButton({ user, size = 'md' }: Props) {
  const { currentUser, revision } = useApp()
  void revision
  if (!currentUser) return null

  const state = followState(currentUser.id, user.id)
  if (state === 'self') return null

  const label =
    state === 'following' ? 'Following'
    : state === 'requested' ? 'Requested'
    : user.isPrivate ? 'Request' : 'Follow'

  const primary = state === 'none'

  return (
    <button
      className={`btn ${primary ? 'btn-primary' : ''} ${size === 'sm' ? 'btn-sm' : ''}`}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        toggleFollow(currentUser.id, user.id)
      }}
      title={state === 'requested' ? 'Cancel follow request' : undefined}
    >
      {label}
    </button>
  )
}
