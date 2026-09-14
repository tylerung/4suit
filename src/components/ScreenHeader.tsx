import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  /** Show a back chevron that pops the history stack. */
  back?: boolean
  /** Rendered flush right. */
  actions?: ReactNode
}

export default function ScreenHeader({ title, subtitle, back, actions }: Props) {
  const navigate = useNavigate()
  return (
    <header className="screen-head">
      {back && (
        <button className="back-btn" onClick={() => navigate(-1)} aria-label="Go back">
          ‹
        </button>
      )}
      <div style={{ minWidth: 0 }}>
        <h1>{title}</h1>
        {subtitle && <div className="screen-head-sub">{subtitle}</div>}
      </div>
      <div className="spacer" />
      {actions}
    </header>
  )
}
