import { Link } from 'react-router-dom'
import type { User } from '../types'
import './Avatar.css'

interface Props {
  user: User
  size?: number
  /** Wrap in a link to the profile. Defaults to true. */
  link?: boolean
}

/** The profile photo when there is one, otherwise initials on a palette tone. */
export default function Avatar({ user, size = 44, link = true }: Props) {
  const initials = user.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  const node = (
    <span
      className={`avatar avatar-${user.avatarTone}${user.avatarPhoto ? ' avatar-has-photo' : ''}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.36),
      }}
      aria-hidden="true"
    >
      {user.avatarPhoto
        ? <img className="avatar-img" src={user.avatarPhoto} alt="" draggable={false} />
        : initials}
    </span>
  )

  if (!link) return node
  return (
    <Link
      to={`/u/${user.username}`}
      className="avatar-link"
      aria-label={user.displayName}
      /* An avatar always means "go to this person". Without this, a click inside
         a clickable parent (PostCard navigates to the post) bubbles up and the
         parent's handler wins, so tapping a face opened the post instead. */
      onClick={(e) => e.stopPropagation()}
    >
      {node}
    </Link>
  )
}
