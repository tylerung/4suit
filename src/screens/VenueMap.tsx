import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import type { DivIcon } from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import StarRating from '../components/StarRating'
import { formatDistance } from '../lib/geo'
import type { Coords, RankedVenue } from '../types'
import './VenueMap.css'

interface Props {
  rows: RankedVenue[]
  origin: Coords
}

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    if (ch === '&') return '&amp;'
    if (ch === '<') return '&lt;'
    if (ch === '>') return '&gt;'
    if (ch === '"') return '&quot;'
    return '&#39;'
  })
}

/** A pin carrying the room's average, coloured by room type like every room tile. */
function pinIcon(row: RankedVenue): DivIcon {
  const label = row.stats.average === null ? '–' : row.stats.average.toFixed(1)
  const type = row.venue.type === 'casino' ? 'casino' : 'cardroom'
  const top = row.stats.rank <= 3 ? ' vm-pin-body-top' : ''
  return L.divIcon({
    className: 'vm-pin',
    html:
      `<span class="vm-pin-body venue-tone venue-tone-${type}${top}">` +
      `<span class="vm-pin-label">${escapeHtml(label)}</span>` +
      `</span>` +
      `<span class="vm-pin-stem vm-pin-stem-${type}"></span>`,
    iconSize: [38, 44],
    iconAnchor: [19, 42],
    popupAnchor: [0, -38],
  })
}

/** Keeps the viewport glued to whatever the filters currently return. */
function FitToRows({ rows, origin }: Props) {
  const map = useMap()
  const signature = rows.map((row) => row.venue.id).join('|')

  useEffect(() => {
    if (rows.length === 0) {
      map.setView([origin.lat, origin.lng], 10)
      return
    }
    const points = rows.map((row) => L.latLng(row.venue.lat, row.venue.lng))
    const bounds = L.latLngBounds(points)
    const ne = bounds.getNorthEast()
    const sw = bounds.getSouthWest()
    const degenerate = Math.abs(ne.lat - sw.lat) < 0.01 && Math.abs(ne.lng - sw.lng) < 0.01
    if (points.length === 1 || degenerate) {
      map.setView(bounds.getCenter(), 12)
      return
    }
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 })
  }, [map, signature, origin.lat, origin.lng, rows])

  return null
}

export default function VenueMap({ rows, origin }: Props) {
  const markers = useMemo(
    () => rows.map((row) => ({ row, icon: pinIcon(row) })),
    [rows],
  )

  return (
    <div className="vm-wrap">
      <MapContainer
        className="vm-map"
        center={[origin.lat, origin.lng]}
        zoom={10}
        scrollWheelZoom={false}
        attributionControl
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <FitToRows rows={rows} origin={origin} />
        {markers.map(({ row, icon }) => (
          <Marker
            key={row.venue.id}
            position={[row.venue.lat, row.venue.lng]}
            icon={icon}
            title={row.venue.name}
          >
            <Popup>
              <div className="vm-popup">
                <div className="vm-popup-name">{row.venue.name}</div>
                <div className="vm-popup-place faint">
                  {row.venue.city}, {row.venue.state}
                  {row.distanceMi !== null && ` · ${formatDistance(row.distanceMi)}`}
                </div>
                <div className="vm-popup-rating">
                  {row.stats.average === null ? (
                    <span className="faint">No ratings yet</span>
                  ) : (
                    <StarRating value={row.stats.average} size={14} showValue count={row.stats.count} />
                  )}
                </div>
                <Link to={`/venue/${row.venue.id}`} className="btn btn-sm btn-primary vm-popup-link">
                  Open room
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <div className="vm-legend">
        <span className="num" aria-live="polite">
          {rows.length} {rows.length === 1 ? 'room' : 'rooms'} shown
        </span>
        {/* Pin colour encodes room type, so the map says which is which. */}
        <span className="vm-legend-key" aria-hidden="true">
          <span className="vm-legend-dot venue-tone-casino" />Casino
          <span className="vm-legend-dot venue-tone-cardroom" />Card room
        </span>
      </div>
    </div>
  )
}
