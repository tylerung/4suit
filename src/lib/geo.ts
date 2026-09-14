import type { Coords } from '../types'

const EARTH_MI = 3958.8
const rad = (d: number) => (d * Math.PI) / 180

/** Great-circle distance in miles. */
export function distanceMi(a: Coords, b: Coords): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_MI * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function formatDistance(mi: number | null): string {
  if (mi === null) return ''
  if (mi < 0.1) return 'here'
  if (mi < 10) return `${mi.toFixed(1)} mi`
  return `${Math.round(mi)} mi`
}

/** "3h", "2d", "Mar 4" — compact relative time for feed timestamps. */
export function timeAgo(iso: string, now = Date.now()): string {
  const ms = now - Date.parse(iso)
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const d = Math.floor(hr / 24)
  if (d < 7) return `${d}d`
  if (d < 365) return `${Math.floor(d / 7)}w`
  return `${Math.floor(d / 365)}y`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

/** Signed dollars with a sign prefix, e.g. "+$2,340" / "-$410". */
export function formatMoney(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '-' : ''
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString()}`
}

export function formatCount(n: number): string {
  if (n < 1000) return String(n)
  return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`
}
