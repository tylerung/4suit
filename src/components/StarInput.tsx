import './StarRating.css'
import './StarInput.css'

interface Props {
  label: string
  hint?: string
  value: number
  onChange: (v: number) => void
}

/** Five tappable stars. Tapping the current value clears it back to unrated. */
export default function StarInput({ label, hint, value, onChange }: Props) {
  return (
    <div className="star-input">
      <div className="star-input-text">
        <span className="star-input-label">{label}</span>
        {hint && <span className="star-input-hint">{hint}</span>}
      </div>
      <div className="star-input-controls" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`star-btn ${n <= value ? 'on' : ''}`}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            aria-pressed={n <= value}
            onClick={() => onChange(value === n ? 0 : n)}
          >
            ★
          </button>
        ))}
        <span className="num star-input-value">{value ? value.toFixed(0) : '–'}</span>
      </div>
    </div>
  )
}
