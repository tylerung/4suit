import type { User, Venue } from '../types'
import { getUser, listVenues } from './api'
import { subscribe } from './store'
import { useQuery } from '../hooks/useQuery'

/**
 * A small read-through cache for the two kinds of record that get asked for
 * over and over while rendering a screen: rooms and accounts.
 *
 * A list card names its owner, a venue tile names its room — fetching those one
 * component at a time would be a request per card, and the same request many
 * times over on a screen full of them. Requests are deduplicated by id here (a
 * second ask for an in-flight record joins the first), and the whole cache is
 * dropped whenever a write invalidates server state, so nothing here can go
 * stale past the next mutation.
 */

let venuesPromise: Promise<Venue[]> | null = null
const userPromises = new Map<string, Promise<User | null>>()

subscribe(() => {
  venuesPromise = null
  userPromises.clear()
})

/** Every room, fetched once. Rooms are reference data — they rarely change. */
export function fetchVenues(): Promise<Venue[]> {
  venuesPromise ??= listVenues().catch((err) => {
    venuesPromise = null      // a failure should not be cached as the answer
    throw err
  })
  return venuesPromise
}

export function fetchUser(id: string | null | undefined): Promise<User | null> {
  if (!id) return Promise.resolve(null)
  let promise = userPromises.get(id)
  if (!promise) {
    promise = getUser(id).catch((err) => {
      userPromises.delete(id)
      throw err
    })
    userPromises.set(id, promise)
  }
  return promise
}

const NO_VENUES: Venue[] = []

export function useVenues(): Venue[] {
  return useQuery(fetchVenues, [], NO_VENUES).data
}

/** The same rooms, keyed by id, for components that look one up by reference. */
export function useVenueMap(): Map<string, Venue> {
  const venues = useVenues()
  return new Map(venues.map((v) => [v.id, v]))
}

export function useUser(id: string | null | undefined): User | null {
  return useQuery(() => fetchUser(id), [id], null).data
}
