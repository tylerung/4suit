import { collections } from '../db/mongo.js'

/**
 * Who can see whose activity.
 *
 * This used to be a function the browser called on data it already had, which
 * meant a private account's posts were sitting in every visitor's tab and the
 * check was advisory. Here it runs before anything is read, so a post nobody is
 * allowed to see is a post that never leaves the database.
 */

/** Can `viewerId` see `targetId`'s posts, lists and activity? */
export async function canViewProfile(
  viewerId: string | null,
  targetId: string,
): Promise<boolean> {
  const target = await collections.users().findOne(
    { _id: targetId },
    { projection: { isPrivate: 1, followerIds: 1 } },
  )
  if (!target) return false
  if (!target.isPrivate) return true
  if (!viewerId) return false
  if (viewerId === targetId) return true
  return target.followerIds.includes(viewerId)
}

/**
 * Every user id whose activity `viewerId` may read: public accounts, private
 * accounts that approved them, and themselves. Used to scope feeds and search
 * in the query rather than filtering after the fact.
 */
export async function visibleAuthorIds(viewerId: string | null): Promise<string[]> {
  const clauses: Record<string, unknown>[] = [{ isPrivate: false }]
  if (viewerId) {
    clauses.push({ _id: viewerId }, { followerIds: viewerId })
  }
  const docs = await collections.users()
    .find({ $or: clauses }, { projection: { _id: 1 } })
    .toArray()
  return docs.map((d) => d._id)
}

/** The same set as an $in filter, ready to drop into a query. */
export async function visibleAuthorFilter(viewerId: string | null): Promise<{ $in: string[] }> {
  return { $in: await visibleAuthorIds(viewerId) }
}
