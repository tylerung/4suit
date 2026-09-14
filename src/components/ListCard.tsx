import { Link } from 'react-router-dom'
import type { VenueList } from '../types'
import { getUser, getVenue } from '../lib/api'
import { timeAgo } from '../lib/geo'
import './ListCard.css'
import Icon from './Icon'

export default function ListCard({ list, showOwner = false }: { list: VenueList; showOwner?: boolean }) {
  const owner = showOwner ? getUser(list.ownerId) : null
  const preview = list.venueIds.slice(0, 3).map((id) => getVenue(id)).filter(Boolean)

  return (
    <Link to={`/list/${list.id}`} className="list-card card">
      <div className="list-card-head">
        <span className="list-card-emoji" aria-hidden="true">{list.emoji}</span>
        <div className="list-card-title">
          <b>{list.name}</b>
          <span className="faint">
            {list.venueIds.length} room{list.venueIds.length === 1 ? '' : 's'}
            {owner && <> · @{owner.username}</>}
            {' · '}updated {timeAgo(list.updatedAt)}
          </span>
        </div>
        <span className={`list-visibility ${list.isPublic ? 'public' : 'private'}`}>
          {list.isPublic ? 'Public' : <><Icon name="lock" size={11} /> Private</>}
        </span>
      </div>
      {list.description && <p className="list-card-desc muted">{list.description}</p>}
      {preview.length > 0 && (
        <div className="list-card-preview">
          {preview.map((v) => (
            <span
              key={v!.id}
              className={`list-card-dot venue-tone venue-tone-${v!.type}`}
              title={v!.name}
            />
          ))}
          <span className="faint list-card-names">
            {preview.map((v) => v!.name).join(' · ')}
            {list.venueIds.length > 3 && ` +${list.venueIds.length - 3} more`}
          </span>
        </div>
      )}
    </Link>
  )
}
