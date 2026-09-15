import { useState } from 'react'
import { Link } from 'react-router-dom'
import ScreenHeader from '../components/ScreenHeader'
import EmptyState from '../components/EmptyState'
import StarRating from '../components/StarRating'
import VenueRow, { rankClass } from '../components/VenueRow'
import VenueMap from './VenueMap'
import { rankVenues, type VenueSort } from '../lib/api'
import { useQuery } from '../hooks/useQuery'
import { formatDistance } from '../lib/geo'
import { useApp } from '../state/AppContext'
import {
  AMENITY_LABELS, GAME_LABELS, METROS,
  type Amenity, type GameType, type RankedVenue, type VenueType,
} from '../types'
import './RankingsScreen.css'
import Icon from '../components/Icon'

type Mode = 'list' | 'map'

const RADIUS_OPTIONS: { value: number | null; label: string }[] = [
  { value: 25, label: '25 mi' },
  { value: 50, label: '50 mi' },
  { value: 100, label: '100 mi' },
  { value: 250, label: '250 mi' },
  { value: null, label: 'Any distance' },
]

const TYPE_OPTIONS: { value: VenueType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'casino', label: 'Casinos' },
  { value: 'cardroom', label: 'Card rooms' },
]

const SORT_OPTIONS: { value: VenueSort; label: string; podium: string }[] = [
  { value: 'rating', label: 'Rating', podium: 'Best in the field' },
  { value: 'distance', label: 'Distance', podium: 'Closest to you' },
  { value: 'reviews', label: 'Reviews', podium: 'Most reviewed' },
  { value: 'name', label: 'Name', podium: 'First alphabetically' },
]

const MIN_REVIEW_OPTIONS: number[] = [0, 3, 5]

const GAME_ENTRIES = Object.entries(GAME_LABELS) as [GameType, string][]
const AMENITY_ENTRIES = Object.entries(AMENITY_LABELS) as [Amenity, string][]


function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
}

const NO_ROWS: RankedVenue[] = []

export default function RankingsScreen() {
  const {
    origin, originLabel, metro, setMetroId,
    usingDevice, requestDeviceLocation, clearDeviceLocation, geoError,
  } = useApp()

  const [mode, setMode] = useState<Mode>('list')
  const [radiusMi, setRadiusMi] = useState<number | null>(null)
  const [type, setType] = useState<VenueType | 'all'>('all')
  const [sort, setSort] = useState<VenueSort>('rating')
  const [games, setGames] = useState<GameType[]>([])
  const [amenities, setAmenities] = useState<Amenity[]>([])
  const [minReviews, setMinReviews] = useState(0)
  const [moreOpen, setMoreOpen] = useState(false)

  /* The leaderboard itself is the server's answer: filters, distances and the
     ordering are all applied there, so this screen only decides what to ask
     for. `games` and `amenities` are joined into the dependency list because a
     fresh array of the same values is not a new question. */
  const { data: rows, loaded, error } = useQuery<RankedVenue[]>(
    () => rankVenues({ origin, radiusMi, type, games, amenities, minReviews, sort }),
    [origin.lat, origin.lng, radiusMi, type, games.join(','), amenities.join(','), minReviews, sort],
    NO_ROWS,
  )

  const rated = rows.filter((row) => row.stats.average !== null)
  const average = rated.length
    ? rated.reduce((sum, row) => sum + (row.stats.average ?? 0), 0) / rated.length
    : null

  const extraCount = games.length + amenities.length + (minReviews > 0 ? 1 : 0)
  const filtersActive =
    radiusMi !== null || type !== 'all' || sort !== 'rating' || extraCount > 0

  const clearFilters = () => {
    setRadiusMi(null)
    setType('all')
    setSort('rating')
    setGames([])
    setAmenities([])
    setMinReviews(0)
  }

  const hasPodium = rows.length >= 4
  const podium = hasPodium ? rows.slice(0, 3) : []
  const rest = hasPodium ? rows.slice(3) : rows
  const podiumCaption =
    SORT_OPTIONS.find((opt) => opt.value === sort)?.podium ?? 'Best in the field'

  return (
    <div className="rank-screen">
      <ScreenHeader title="Top Rooms" subtitle={originLabel} />

      <div className="rank-controls">
        <div className="rank-seg" role="group" aria-label="Display mode">
          <button
            type="button"
            className="rank-seg-btn"
            aria-pressed={mode === 'list'}
            onClick={() => setMode('list')}
          >
            <Icon name="list" size={15} /> List
          </button>
          <button
            type="button"
            className="rank-seg-btn"
            aria-pressed={mode === 'map'}
            onClick={() => setMode('map')}
          >
            <Icon name="pin" size={15} /> Map
          </button>
        </div>

        <div className="rank-loc">
          <label className="sr-only" htmlFor="rank-metro">Measure distance from</label>
          <select
            id="rank-metro"
            className="rank-metro"
            value={metro.id}
            onChange={(e) => setMetroId(e.target.value)}
          >
            {METROS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          {usingDevice ? (
            <button
              type="button"
              className="chip is-active rank-geo-chip"
              onClick={clearDeviceLocation}
              aria-label="Stop using your location"
            >
              Using your location ✕
            </button>
          ) : (
            <button type="button" className="btn btn-sm rank-geo-btn" onClick={requestDeviceLocation}>
              Use my location
            </button>
          )}
        </div>
        {geoError && <div className="field-error">{geoError}</div>}

        <div className="rank-group">
          <span className="rank-group-label" id="rank-radius-label">Within</span>
          <div className="chip-row rank-chip-row" role="group" aria-labelledby="rank-radius-label">
            {RADIUS_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                className="chip"
                aria-pressed={radiusMi === opt.value}
                onClick={() => setRadiusMi(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rank-group">
          <span className="rank-group-label" id="rank-type-label">Type</span>
          <div className="chip-row rank-chip-row" role="group" aria-labelledby="rank-type-label">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className="chip"
                aria-pressed={type === opt.value}
                onClick={() => setType(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rank-group">
          <span className="rank-group-label" id="rank-sort-label">Sort</span>
          <div className="chip-row rank-chip-row" role="group" aria-labelledby="rank-sort-label">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className="chip"
                aria-pressed={sort === opt.value}
                onClick={() => setSort(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="rank-more-toggle"
          aria-expanded={moreOpen}
          aria-controls="rank-more"
          onClick={() => setMoreOpen((v) => !v)}
        >
          <span aria-hidden="true" className={`rank-caret${moreOpen ? ' is-open' : ''}`}>›</span>
          {moreOpen ? 'Fewer filters' : 'More filters'}
          {extraCount > 0 && <span className="rank-more-count num">{extraCount}</span>}
        </button>

        <div className="rank-more card" id="rank-more" hidden={!moreOpen}>
          <div className="rank-more-block">
            <div className="section-title">Games spread</div>
            <div className="rank-wrap">
              {GAME_ENTRIES.map(([game, label]) => (
                <button
                  key={game}
                  type="button"
                  className="chip"
                  aria-pressed={games.includes(game)}
                  onClick={() => setGames(toggleValue(games, game))}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="rank-more-block">
            <div className="section-title">Amenities</div>
            <div className="rank-wrap">
              {AMENITY_ENTRIES.map(([amenity, label]) => (
                <button
                  key={amenity}
                  type="button"
                  className="chip"
                  aria-pressed={amenities.includes(amenity)}
                  onClick={() => setAmenities(toggleValue(amenities, amenity))}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="rank-more-block">
            <div className="section-title">Minimum reviews</div>
            <div className="rank-wrap" role="group" aria-label="Minimum reviews">
              {MIN_REVIEW_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className="chip"
                  aria-pressed={minReviews === n}
                  onClick={() => setMinReviews(n)}
                >
                  {n === 0 ? 'Any' : `${n}+ reviews`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rank-summary">
        <span>
          <b className="num">{rows.length}</b> {rows.length === 1 ? 'room' : 'rooms'}
          {average !== null && <> · avg <b className="num">{average.toFixed(1)}</b>★</>}
        </span>
        <span className="rank-summary-gap" />
        {filtersActive && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      {error && <p className="load-error" role="alert">{error}</p>}

      {!loaded ? (
        <p className="screen-loading faint" role="status">Counting the tables…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="🃏"
          title="Nobody is dealing here"
          body="No room clears those filters. Widen the radius or drop a requirement and try again."
          action={
            <button type="button" className="btn btn-primary" onClick={clearFilters}>
              Clear filters
            </button>
          }
        />
      ) : mode === 'map' ? (
        <div className="rank-map">
          <VenueMap rows={rows} origin={origin} />
          <p className="rank-map-hint faint">
            Pins carry the room’s average. Tap one for the card.
          </p>
        </div>
      ) : (
        <>
          {podium.length > 0 && (
            <div className="rank-podium-cap section-title">{podiumCaption}</div>
          )}

          {podium.length > 0 && (
            <div className="rank-podium">
              {podium.map((row) => (
                <Link
                  key={row.venue.id}
                  to={`/venue/${row.venue.id}`}
                  className={`rank-podium-card rank-pod-${rankClass(row.stats.rank)}`}
                >
                  <span className={`rank-podium-medal rank-medal-${row.stats.rank}`} aria-hidden="true">
                    {row.stats.rank}
                  </span>
                  <span
                    className={`rank-podium-tile venue-tone venue-tone-${row.venue.type}`}
                    aria-hidden="true"
                  >
                    {row.venue.type === 'casino' ? '\u2666\uFE0E' : '\u2660\uFE0E'}
                  </span>
                  <span className="rank-podium-name">{row.venue.name}</span>
                  {row.stats.average === null ? (
                    <span className="rank-podium-score faint">Unrated</span>
                  ) : (
                    <>
                      <span className="rank-podium-score num">{row.stats.average.toFixed(1)}</span>
                      <StarRating value={row.stats.average} size={11} />
                    </>
                  )}
                  <span className="rank-podium-meta faint">
                    {row.stats.count} {row.stats.count === 1 ? 'review' : 'reviews'}
                    {row.distanceMi !== null && ` · ${formatDistance(row.distanceMi)}`}
                  </span>
                </Link>
              ))}
            </div>
          )}

          {podium.length > 0 && (
            <div className="rank-rest-head section-title">The rest of the field</div>
          )}

          <div className="rank-list">
            {rest.map((row) => (
              <VenueRow key={row.venue.id} row={row} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
