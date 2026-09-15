import { collections, toDomain, toDomainAll, type RatingDoc } from '../db/mongo.js'
import { newId } from '../db/ids.js'
import type { Rating } from '../types.js'
import type { RatingInput } from '../validation/schemas.js'
import { forbidden, notFound } from '../lib/errors.js'
import { canViewProfile, visibleAuthorIds } from './privacy.js'
import { deletePostsForRating } from './posts.js'
import { requireVenue } from './venues.js'

/**
 * Reviews for a room, newest first, limited to the ones `viewerId` may read —
 * an attributed review carries its author's name and words, so a private
 * account's review is withheld the same way their posts are. The room's
 * aggregate score deliberately still counts every rating: a score is a fact
 * about the room, and gating it would make the leaderboard mean something
 * different for every viewer.
 */
export async function listRatingsForVenue(
  venueId: string,
  viewerId: string | null,
): Promise<Rating[]> {
  const authorIds = await visibleAuthorIds(viewerId)
  const docs = await collections.ratings()
    .find({ venueId, userId: { $in: authorIds } })
    .sort({ createdAt: -1 })
    .toArray()
  return toDomainAll(docs)
}

export async function listRatingsByUser(
  userId: string,
  viewerId: string | null,
): Promise<Rating[]> {
  if (!(await canViewProfile(viewerId, userId))) return []
  const docs = await collections.ratings()
    .find({ userId })
    .sort({ createdAt: -1 })
    .toArray()
  return toDomainAll(docs)
}

export async function getRating(id: string | null | undefined): Promise<Rating | null> {
  if (!id) return null
  return toDomain(await collections.ratings().findOne({ _id: id }))
}

export async function getMyRating(userId: string, venueId: string): Promise<Rating | null> {
  return toDomain(await collections.ratings().findOne({ userId, venueId }))
}

/**
 * One rating per user per room — re-rating replaces the old one, which the
 * unique index on (userId, venueId) also guarantees against a double submit.
 * Overall is the mean of the six subscores, computed here rather than accepted
 * from the client, so the headline number can never disagree with the breakdown.
 */
export async function saveRating(userId: string, input: RatingInput): Promise<Rating> {
  await requireVenue(input.venueId)

  const values = Object.values(input.subscores)
  const overall = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
  const now = new Date().toISOString()

  const existing = await collections.ratings().findOne({ userId, venueId: input.venueId })
  const id = existing?._id ?? newId('r')

  const rating: Rating = {
    id,
    userId,
    venueId: input.venueId,
    overall,
    subscores: input.subscores,
    review: input.review.trim(),
    stakesPlayed: input.stakesPlayed,
    createdAt: now,
  }
  const { id: _id, ...rest } = rating
  await collections.ratings().replaceOne(
    { _id: id },
    { _id: id, ...rest } as RatingDoc,
    { upsert: true },
  )
  return rating
}

export async function deleteRating(ratingId: string, actorId: string): Promise<void> {
  const rating = await getRating(ratingId)
  if (!rating) throw notFound('That rating is no longer here.')
  if (rating.userId !== actorId) throw forbidden('That rating is not yours.')
  await collections.ratings().deleteOne({ _id: ratingId })
  // Rating posts are meaningless without their rating.
  await deletePostsForRating(ratingId)
}
