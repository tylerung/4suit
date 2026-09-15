import { collections, mediaBucket, toDoc } from './mongo.js'
import { COMMENTS, LISTS, POSTS, RATINGS, USERS, VENUES } from './seed-data.js'

/**
 * The demo dataset: 34 real US card rooms, 14 accounts, and the posts, ratings,
 * comments and lists between them. It is deterministic — the seed module uses a
 * fixed PRNG and a fixed clock — so every environment comes up identical.
 */
export async function seedDatabase(): Promise<void> {
  await Promise.all([
    collections.users().insertMany(USERS.map(toDoc)),
    collections.venues().insertMany(VENUES.map(toDoc)),
    collections.ratings().insertMany(RATINGS.map(toDoc)),
    collections.posts().insertMany(POSTS.map(toDoc)),
    collections.comments().insertMany(COMMENTS.map(toDoc)),
    collections.lists().insertMany(LISTS.map(toDoc)),
  ])
}

/** Seed only an empty database, so a restart never overwrites real activity. */
export async function seedIfEmpty(): Promise<boolean> {
  const existing = await collections.venues().estimatedDocumentCount()
  if (existing > 0) return false
  await seedDatabase()
  return true
}

/**
 * Wipe everything — uploaded photos and videos included — and seed again.
 * Backs the "reset demo data" button in Settings, and is refused in production
 * unless ALLOW_DB_RESET says otherwise.
 */
export async function resetDatabase(): Promise<void> {
  await Promise.all([
    collections.users().deleteMany({}),
    collections.venues().deleteMany({}),
    collections.ratings().deleteMany({}),
    collections.posts().deleteMany({}),
    collections.comments().deleteMany({}),
    collections.lists().deleteMany({}),
  ])
  // drop() on a bucket that was never written throws; nothing to clear then.
  await mediaBucket().drop().catch(() => {})
  await seedDatabase()
}
