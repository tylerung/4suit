import './StarRating.css'

interface Props {
  /** 0-5, fractional allowed. */
  value: number
  size?: number
  /** Show the numeric value beside the stars. */
  showValue?: boolean
  /** Review count rendered as "(12)". */
  count?: number
}

/** Read-only star display with true fractional fill. */
export default function StarRating({ value, size = 15, showValue = false, count }: Props) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100))
  return (
    <span className="stars-wrap" title={`${value.toFixed(1)} out of 5`}>
      <span className="stars" style={{ fontSize: size }} aria-hidden="true">
        <span className="stars-bg">★★★★★</span>
        <span className="stars-fg" style={{ width: `${pct}%` }}>★★★★★</span>
      </span>
      {showValue && <b className="num stars-value">{value.toFixed(1)}</b>}
      {count !== undefined && <span className="faint stars-count">({count})</span>}
      <span className="sr-only">{value.toFixed(1)} out of 5{count !== undefined ? `, ${count} reviews` : ''}</span>
    </span>
  )
}
