import { z } from 'zod'
import {
  AMENITIES, AVATAR_TONE_IDS, GAME_TYPES, MEDIA_LIMITS, ROLE_IDS, SUBSCORE_KEYS,
} from '../types.js'

/**
 * Every shape the API accepts from a client, in one place. Routes parse their
 * input through these before a service sees it, so a service can assume the
 * data is the right type and only has to enforce rules that need the database.
 */

const enumOf = <T extends string>(values: T[]) => z.enum(values as [T, ...T[]])

const trimmed = (max: number) => z.string().max(max)

/* --------------------------------------------------------------- profile */

export const profilePatchSchema = z.object({
  displayName: trimmed(60).optional(),
  username: trimmed(40).optional(),
  bio: trimmed(500).optional(),
  location: trimmed(120).optional(),
  roles: z.array(enumOf(ROLE_IDS)).max(ROLE_IDS.length).optional(),
  homeVenueId: z.string().max(80).nullable().optional(),
  avatarTone: enumOf(AVATAR_TONE_IDS).optional(),
  /** A data URI produced by the client's cropper, or null to go back to initials. */
  avatarPhoto: z.string().nullable().optional(),
  isPrivate: z.boolean().optional(),
}).strict()

export type ProfilePatch = z.infer<typeof profilePatchSchema>

/* ---------------------------------------------------------------- rating */

const score = z.number().int().min(1).max(5)

export const subscoresSchema = z.object(
  Object.fromEntries(SUBSCORE_KEYS.map((k) => [k, score])) as Record<
    (typeof SUBSCORE_KEYS)[number],
    typeof score
  >,
).strict()

export const ratingInputSchema = z.object({
  venueId: z.string().min(1).max(80),
  subscores: subscoresSchema,
  review: trimmed(4000).default(''),
  stakesPlayed: trimmed(120).default(''),
}).strict()

export type RatingInput = z.infer<typeof ratingInputSchema>

/* ------------------------------------------------------------------ post */

export const mediaItemSchema = z.object({
  id: z.string().min(1).max(120),
  kind: z.enum(['image', 'video']),
  mime: z.string().max(120),
  dataUri: z.string().nullable(),
  width: z.number().int().min(0),
  height: z.number().int().min(0),
  durationSec: z.number().nullable(),
  posterUri: z.string().max(MEDIA_LIMITS.posterMaxChars).nullable(),
  byteSize: z.number().int().min(0),
  alt: trimmed(500).default(''),
}).strict()

export const postInputSchema = z.object({
  kind: z.enum(['text', 'rating', 'session']),
  body: trimmed(5000).default(''),
  venueId: z.string().max(80).nullable().optional(),
  ratingId: z.string().max(120).nullable().optional(),
  session: z.object({
    stakes: trimmed(120),
    hours: z.number().min(0).max(1000),
    net: z.number().min(-10_000_000).max(10_000_000),
  }).strict().nullable().optional(),
  media: z.array(mediaItemSchema).max(MEDIA_LIMITS.perPost).optional(),
  tags: z.array(trimmed(60)).max(20).optional(),
}).strict()

export type PostInput = z.infer<typeof postInputSchema>

export const postPatchSchema = z.object({
  body: trimmed(5000),
  tags: z.array(trimmed(60)).max(20).optional(),
}).strict()

export const commentInputSchema = z.object({
  body: z.string().min(1, 'A comment cannot be empty.').max(2000),
}).strict()

/* ------------------------------------------------------------------ list */

export const listInputSchema = z.object({
  name: trimmed(120).default(''),
  description: trimmed(1000).optional(),
  emoji: trimmed(8).optional(),
  isPublic: z.boolean().optional(),
  venueIds: z.array(z.string().max(80)).max(500).optional(),
}).strict()

export type ListInput = z.infer<typeof listInputSchema>

export const listPatchSchema = listInputSchema.partial()

export const reorderSchema = z.object({
  venueId: z.string().min(1).max(80),
  direction: z.union([z.literal(-1), z.literal(1)]),
}).strict()

/* ------------------------------------------------------- venue leaderboard */

/** Query strings arrive as text, so every field parses from a string. */
const csv = <T extends string>(values: T[]) =>
  z.string()
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(enumOf(values)))
    .optional()

const numeric = z.coerce.number().finite()

export const venueQuerySchema = z.object({
  lat: numeric.optional(),
  lng: numeric.optional(),
  radiusMi: numeric.min(0).optional(),
  text: trimmed(200).optional(),
  type: z.enum(['all', 'casino', 'cardroom']).optional(),
  games: csv(GAME_TYPES),
  amenities: csv(AMENITIES),
  minReviews: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['rating', 'distance', 'reviews', 'name']).optional(),
})

export type VenueQueryInput = z.infer<typeof venueQuerySchema>

/* ---------------------------------------------------------------- search */

export const searchQuerySchema = z.object({
  q: trimmed(200).default(''),
  lat: numeric.optional(),
  lng: numeric.optional(),
})

/* ------------------------------------------------------------------ auth */

export const signInSchema = z.object({
  userId: z.string().min(1).max(80),
}).strict()

/* ----------------------------------------------------------------- media */

/** Metadata the client measured while normalising the file, sent alongside it. */
export const mediaUploadMetaSchema = z.object({
  width: z.coerce.number().int().min(0).default(0),
  height: z.coerce.number().int().min(0).default(0),
  durationSec: z.coerce.number().min(0).optional(),
  posterUri: z.string().max(MEDIA_LIMITS.posterMaxChars).optional(),
})
