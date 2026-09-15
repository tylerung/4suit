import { collections, toDomain, toDomainAll, type VenueDoc } from '../db/mongo.js'
import { distanceMi } from '../lib/geo.js'
import {
  SUBSCORE_KEYS, type Coords, type RankedVenue, type Subscores, type Venue, type VenueStats,
} from '../types.js'
import type { VenueQueryInput } from '../validation/schemas.js'
import { notFound } from '../lib/errors.js'

export async function listVenues(): Promise<Venue[]> {
  return toDomainAll(await collections.venues().find().sort({ name: 1 }).toArray())
}

export async function getVenue(id: string | null | undefined): Promise<Venue | null> {
  if (!id) return null
  return toDomain(await collections.venues().findOne({ _id: id }))
}

export async function requireVenue(id: string): Promise<Venue> {
  const venue = await getVenue(id)
  if (!venue) throw notFound('That room does not exist.')
  return venue
}

/* ----------------------------------------------------------------- stats */

const emptyStats = (venueId: string): VenueStats =>
  ({ venueId, average: null, count: 0, subscores: null, rank: 0 })

/**
 * Rating aggregates come out of the database rather than out of a loop over
 * every rating in the app — the client used to hold all of them to compute this.
 */
async function aggregateStats(venueIds?: string[]): Promise<Map<string, VenueStats>> {
  const match = venueIds ? [{ $match: { venueId: { $in: venueIds } } }] : []
  const rows = await collections.ratings().aggregate<{
    _id: string
    count: number
    average: number
  } & Record<keyof Subscores, number>>([
    ...match,
    {
      $group: {
        _id: '$venueId',
        count: { $sum: 1 },
        average: { $avg: '$overall' },
        ...Object.fromEntries(
          SUBSCORE_KEYS.map((key) => [key, { $avg: `$subscores.${key}` }]),
        ),
      },
    },
  ]).toArray()

  const out = new Map<string, VenueStats>()
  for (const row of rows) {
    out.set(row._id, {
      venueId: row._id,
      average: Math.round(row.average * 10) / 10,
      count: row.count,
      subscores: Object.fromEntries(
        SUBSCORE_KEYS.map((key) => [key, row[key]]),
      ) as unknown as Subscores,
      rank: 0,
    })
  }
  return out
}

export async function getVenueStats(venueId: string): Promise<VenueStats> {
  const stats = await aggregateStats([venueId])
  return stats.get(venueId) ?? emptyStats(venueId)
}

/* ----------------------------------------------------------- leaderboard */

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The leaderboard. Ranking is always computed on the filtered set, so rank #1
 * means "best of what you are currently looking at".
 *
 * Attribute filters run in the query; the ones that need a rating aggregate or
 * a distance (minReviews, radius, ordering) run over the matched rooms, which
 * is a few dozen documents rather than the whole collection.
 */
export async function rankVenues(q: VenueQueryInput = {}): Promise<RankedVenue[]> {
  const {
    lat, lng, radiusMi = null, text = '', type = 'all',
    games = [], amenities = [], minReviews = 0, sort = 'rating',
  } = q
  const origin: Coords | null =
    lat !== undefined && lng !== undefined ? { lat, lng } : null

  const filter: Record<string, unknown> = {}
  if (type !== 'all') filter.type = type
  if (games.length) filter.games = { $all: games }
  if (amenities.length) filter.amenities = { $all: amenities }

  const needle = text.trim()
  if (needle) {
    const rx = new RegExp(escapeRegex(needle), 'i')
    filter.$or = [
      { name: rx }, { city: rx }, { state: rx }, { address: rx }, { blurb: rx },
    ]
  }

  const docs: VenueDoc[] = await collections.venues().find(filter).toArray()
  const venues = toDomainAll(docs)
  const stats = await aggregateStats(venues.map((v) => v.id))

  let rows: RankedVenue[] = venues.map((venue) => ({
    venue,
    stats: stats.get(venue.id) ?? emptyStats(venue.id),
    distanceMi: origin ? Math.round(distanceMi(origin, venue) * 10) / 10 : null,
  }))

  rows = rows.filter(({ stats: s, distanceMi: d }) => {
    if (s.count < minReviews) return false
    if (radiusMi !== null && radiusMi !== undefined && d !== null && d > radiusMi) return false
    return true
  })

  const byRating = (a: RankedVenue, b: RankedVenue) => {
    // Unrated rooms always sort last, whichever direction the tiebreaks go.
    const av = a.stats.average, bv = b.stats.average
    if (av === null && bv === null) return a.venue.name.localeCompare(b.venue.name)
    if (av === null) return 1
    if (bv === null) return -1
    if (bv !== av) return bv - av
    if (b.stats.count !== a.stats.count) return b.stats.count - a.stats.count
    return a.venue.name.localeCompare(b.venue.name)
  }

  rows.sort((a, b) => {
    switch (sort) {
      case 'distance': {
        const ad = a.distanceMi ?? Infinity
        const bd = b.distanceMi ?? Infinity
        return ad === bd ? byRating(a, b) : ad - bd
      }
      case 'reviews':
        return b.stats.count - a.stats.count || byRating(a, b)
      case 'name':
        return a.venue.name.localeCompare(b.venue.name)
      default:
        return byRating(a, b)
    }
  })

  return rows.map((row, i) => ({ ...row, stats: { ...row.stats, rank: i + 1 } }))
}
