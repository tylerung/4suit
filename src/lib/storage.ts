import type { Comment, Post, Rating, User, Venue, VenueList } from '../types'
import { COMMENTS, LISTS, POSTS, RATINGS, USERS, VENUES } from './seed'

/**
 * The whole app state lives in one localStorage document. `api.ts` is the only
 * module that should touch this directly — swapping in a real backend means
 * reimplementing api.ts, not the screens.
 */
export interface DB {
  version: number
  users: User[]
  venues: Venue[]
  ratings: Rating[]
  posts: Post[]
  comments: Comment[]
  lists: VenueList[]
  currentUserId: string | null
}

export const KEY = 'railbird:db:v3'
/* Bumped to 2 when posts gained `media`: a v1 document would deserialize with
   `post.media === undefined` and blow up the first time a feed rendered it.
   Bumped to 3 when avatars moved from a free hue to a palette tone and
   venues lost their brand colours; a v2 user has no `avatarTone`.
   A mismatched version is discarded and reseeded rather than migrated.
   Purely additive fields are backfilled in readStorage() instead, so adding
   one does not throw away everything the user has posted. */
export const SCHEMA_VERSION = 3

export function freshDB(): DB {
  return {
    version: SCHEMA_VERSION,
    users: structuredClone(USERS),
    venues: structuredClone(VENUES),
    ratings: structuredClone(RATINGS),
    posts: structuredClone(POSTS),
    comments: structuredClone(COMMENTS),
    lists: structuredClone(LISTS),
    currentUserId: 'u-you',
  }
}

let cache: DB | null = null

function readStorage(): DB | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DB
    if (parsed?.version !== SCHEMA_VERSION) return null
    // A partially-written document is worse than no document.
    if (!Array.isArray(parsed.users) || !Array.isArray(parsed.venues)) return null
    // Profile photos arrived after v3 was written.
    for (const u of parsed.users) u.avatarPhoto ??= null
    return parsed
  } catch {
    return null
  }
}

export function getDB(): DB {
  if (cache) return cache
  cache = readStorage() ?? freshDB()
  return cache
}

/** Persist the in-memory document. Silently tolerates quota / private mode. */
export function persist(): void {
  if (!cache) return
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    /* storage unavailable — the session still works, it just will not survive reload */
  }
}

/** Mutate the document and persist in one step. */
export function mutate<T>(fn: (db: DB) => T): T {
  const db = getDB()
  const result = fn(db)
  persist()
  emit()
  return result
}

export function resetDB(): void {
  cache = freshDB()
  persist()
  emit()
}

/* ------------------------------------------------- change notification --- */

type Listener = () => void
const listeners = new Set<Listener>()
let revision = 0

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getRevision(): number {
  return revision
}

function emit(): void {
  revision++
  listeners.forEach((l) => l())
}

/* --------------------------------------------------------------- id gen --- */

let counter = 0
/** Monotonic, collision-free within a session; prefixed for readability. */
export function newId(prefix: string): string {
  counter++
  const stamp = Date.now().toString(36)
  return `${prefix}-${stamp}${counter.toString(36)}`
}
