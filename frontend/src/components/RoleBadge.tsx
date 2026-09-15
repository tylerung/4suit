import { ROLE_BY_ID, type Role } from '../types'
import './RoleBadge.css'

export default function RoleBadge({ role, size = 'md' }: { role: Role; size?: 'sm' | 'md' }) {
  const meta = ROLE_BY_ID[role]
  if (!meta) return null
  return (
    <span className={`role-badge ${meta.staff ? 'staff' : ''} ${size}`} title={meta.blurb}>
      <span aria-hidden="true">{meta.emoji}</span>
      {meta.label}
    </span>
  )
}
