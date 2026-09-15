import { useState } from 'react'
import { followState, toggleFollow, type FollowState } from '../lib/api'
import { useQuery } from '../hooks/useQuery'
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
  const { currentUser } = useApp()
  const [pending, setPending] = useState(false)
  const targetId = user.id
  // 'self' as the placeholder: until the server answers, the button renders
  // nothing rather than flashing "Follow" at a profile you already follow.
  const { data: state } = useQuery<FollowState>(
    () => (currentUser ? followState(targetId) : Promise.resolve('self')),
    [currentUser?.id, targetId],
    'self',
  )

  if (!currentUser || state === 'self') return null

  const label =
    state === 'following' ? 'Following'
    : state === 'requested' ? 'Requested'
    : user.isPrivate ? 'Request' : 'Follow'

  const primary = state === 'none'

  return (
    <button
      className={`btn ${primary ? 'btn-primary' : ''} ${size === 'sm' ? 'btn-sm' : ''}`}
      disabled={pending}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setPending(true)
        void toggleFollow(targetId).finally(() => setPending(false))
      }}
      title={state === 'requested' ? 'Cancel follow request' : undefined}
    >
      {label}
    </button>
  )
}
