import type { ReactNode } from 'react'
import './EmptyState.css'

interface Props {
  icon?: string
  title: string
  body?: string
  action?: ReactNode
}

export default function EmptyState({ icon = '🂠', title, body, action }: Props) {
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      {body && <p className="muted">{body}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  )
}
