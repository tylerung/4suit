import { Link } from 'react-router-dom'
import EmptyState from '../components/EmptyState'

export default function NotFoundScreen() {
  return (
    <EmptyState
      icon="🃏"
      title="Nothing here"
      body="That page folded."
      action={<Link to="/" className="btn btn-primary">Back to the feed</Link>}
    />
  )
}
