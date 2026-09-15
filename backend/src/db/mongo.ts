import { GridFSBucket, MongoClient, type Db } from 'mongodb'
import { env } from '../config/env.js'
import type { Comment, Post, Rating, User, Venue, VenueList } from '../types.js'

/**
 * The single MongoDB connection, opened once at boot.
 *
 * Documents are stored with the domain id as `_id` — ids like `u-marisol` and
 * `v-bellagio` are already unique, readable and stable, so minting an ObjectId
 * alongside them would only add a second identity to keep in sync. `toDomain`
 * maps `_id` back to `id` on the way out, and nothing above this layer ever
 * sees a raw document.
 */

/** A stored document: the domain entity with `id` renamed to `_id`. */
export type Doc<T extends { id: string }> = Omit<T, 'id'> & { _id: string }

export type UserDoc = Doc<User>
export type VenueDoc = Doc<Venue>
export type RatingDoc = Doc<Rating>
export type PostDoc = Doc<Post>
export type CommentDoc = Doc<Comment>
export type ListDoc = Doc<VenueList>

let client: MongoClient | null = null
let db: Db | null = null

export async function connect(): Promise<Db> {
  if (db) return db
  client = new MongoClient(env.mongoUri, {
    // Fail fast with a readable error instead of hanging a request for 30s.
    serverSelectionTimeoutMS: 5000,
  })
  await client.connect()
  db = client.db(env.mongoDb)
  await ensureIndexes(db)
  return db
}

export async function disconnect(): Promise<void> {
  await client?.close()
  client = null
  db = null
}

export function getDb(): Db {
  if (!db) throw new Error('Database not connected — call connect() first.')
  return db
}

export const collections = {
  users: () => getDb().collection<UserDoc>('users'),
  venues: () => getDb().collection<VenueDoc>('venues'),
  ratings: () => getDb().collection<RatingDoc>('ratings'),
  posts: () => getDb().collection<PostDoc>('posts'),
  comments: () => getDb().collection<CommentDoc>('comments'),
  lists: () => getDb().collection<ListDoc>('lists'),
}

/** Blob store for post photos and videos. See services/media.ts. */
export function mediaBucket(): GridFSBucket {
  return new GridFSBucket(getDb(), { bucketName: 'media' })
}

async function ensureIndexes(database: Db): Promise<void> {
  await Promise.all([
    // Handles are matched case-insensitively on sign-in and on profile edits.
    database.collection('users').createIndex(
      { username: 1 },
      { unique: true, collation: { locale: 'en', strength: 2 } },
    ),
    // One rating per user per room is a rule, so let the database hold it.
    database.collection('ratings').createIndex({ userId: 1, venueId: 1 }, { unique: true }),
    database.collection('ratings').createIndex({ venueId: 1, createdAt: -1 }),
    database.collection('posts').createIndex({ createdAt: -1 }),
    database.collection('posts').createIndex({ authorId: 1, createdAt: -1 }),
    database.collection('posts').createIndex({ venueId: 1, createdAt: -1 }),
    database.collection('comments').createIndex({ postId: 1, createdAt: 1 }),
    database.collection('lists').createIndex({ ownerId: 1, updatedAt: -1 }),
    database.collection('venues').createIndex({ city: 1, state: 1 }),
  ])
}

/* ------------------------------------------------------------- mapping --- */

/** The domain shape of a stored document: `_id` renamed back to `id`. */
export type Domain<D extends { _id: string }> = Omit<D, '_id'> & { id: string }

export function toDomain<D extends { _id: string }>(doc: D): Domain<D>
export function toDomain<D extends { _id: string }>(doc: D | null): Domain<D> | null
export function toDomain<D extends { _id: string }>(doc: D | null): Domain<D> | null {
  if (!doc) return null
  const { _id, ...rest } = doc
  return { id: _id, ...rest } as Domain<D>
}

export function toDoc<T extends { id: string }>(entity: T): Doc<T> {
  const { id, ...rest } = entity
  return { _id: id, ...rest } as Doc<T>
}

export function toDomainAll<D extends { _id: string }>(docs: D[]): Domain<D>[] {
  return docs.map((d) => toDomain(d))
}
