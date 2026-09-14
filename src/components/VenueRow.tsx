import { Link } from 'react-router-dom'
import type { RankedVenue } from '../types'
import { formatDistance } from '../lib/geo'
import StarRating from './StarRating'
import './VenueRow.css'

interface Props {
  row: RankedVenue
  /** Show the leaderboard position medal. */
  showRank?: boolean
  /** Rendered on the right instead of the chevron. */
  action?: React.ReactNode
}

export function rankClass(rank: number): string {
  if (rank === 1) return 'gold'
  if (rank === 2) return 'silver'
  if (rank === 3) return 'bronze'
  return ''
}

export default function VenueRow({ row, showRank = true, action }: Props) {
  const { venue, stats, distanceMi } = row
  return (
    <Link to={`/venue/${venue.id}`} className="venue-row">
      {showRank && (
        <span className={`venue-rank num ${rankClass(stats.rank)}`}>{stats.rank}</span>
      )}
      <span
        className={`venue-swatch venue-tone venue-tone-${venue.type}`}
        aria-hidden="true"
      >
        {venue.type === 'casino' ? '\u2666\uFE0E' : '\u2660\uFE0E'}
      </span>
      <span className="venue-row-main">
        <span className="venue-row-name">{venue.name}</span>
        <span className="venue-row-meta faint">
          {venue.city}, {venue.state}
          {distanceMi !== null && <> · {formatDistance(distanceMi)}</>}
          {' · '}{venue.tableCount} tables
        </span>
        <span className="venue-row-rating">
          {stats.average === null
            ? <span className="faint">Not rated yet</span>
            : <StarRating value={stats.average} showValue count={stats.count} />}
        </span>
      </span>
      {action ?? <span className="venue-row-chevron faint" aria-hidden="true">›</span>}
    </Link>
  )
}
