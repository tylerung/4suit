import { Link } from 'react-router-dom'
import type { User } from '../types'
import Avatar from './Avatar'
import RoleBadge from './RoleBadge'
import FollowButton from './FollowButton'
import './UserRow.css'
import Icon from './Icon'

export default function UserRow({ user, showFollow = true }: { user: User; showFollow?: boolean }) {
  return (
    <div className="user-row">
      <Avatar user={user} size={44} />
      <Link to={`/u/${user.username}`} className="user-row-main">
        <div className="user-row-name">
          {user.displayName}
          {user.verified && <span className="verified" title="Verified">✓</span>}
          {user.isPrivate && <span className="lock" title="Private account" role="img" aria-label="Private account"><Icon name="lock" size={12} /></span>}
        </div>
        <div className="user-row-handle faint">@{user.username} · {user.location}</div>
        {user.roles.length > 0 && (
          <div className="user-row-roles">
            {user.roles.slice(0, 2).map((r) => <RoleBadge key={r} role={r} size="sm" />)}
          </div>
        )}
      </Link>
      {showFollow && <FollowButton user={user} size="sm" />}
    </div>
  )
}
