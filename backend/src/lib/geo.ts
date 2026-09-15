import type { Coords } from '../types.js'

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
