import { collections, toDomain, toDomainAll, type UserDoc } from '../db/mongo.js'
import { AVATAR_PHOTO, type FollowState, type User, type UserStats } from '../types.js'
import { badRequest, notFound } from '../lib/errors.js'
import type { ProfilePatch } from '../validation/schemas.js'

/* ------------------------------------------------------------------ reads */

export async function listUsers(): Promise<User[]> {
  const docs = await collections.users().find().sort({ username: 1 }).toArray()
  return toDomainAll(docs)
}

export async function getUser(id: string | null | undefined): Promise<User | null> {
  if (!id) return null
  return toDomain(await collections.users().findOne({ _id: id }))
}

export async function requireUserRecord(id: string): Promise<User> {
  const user = await getUser(id)
  if (!user) throw notFound('That account does not exist.')
  return user
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const doc = await collections.users().findOne(
    { username },
    { collation: { locale: 'en', strength: 2 } },
  )
  return toDomain(doc)
}

/** Suggested accounts: people you do not follow yet, most-followed first. */
export async function suggestedUsers(viewerId: string | null, limit = 5): Promise<User[]> {
  const viewer = viewerId ? await getUser(viewerId) : null
  const excluded = [...(viewer?.followingIds ?? []), ...(viewerId ? [viewerId] : [])]
  const docs = await collections.users()
    .find(excluded.length ? { _id: { $nin: excluded } } : {})
    .toArray()
  return toDomainAll(docs)
    .sort((a, b) => b.followerIds.length - a.followerIds.length)
    .slice(0, Math.max(0, limit))
}

export async function getUserStats(userId: string): Promise<UserStats> {
  const [user, posts, ratings, lists] = await Promise.all([
    getUser(userId),
    collections.posts().countDocuments({ authorId: userId }),
    collections.ratings().find({ userId }, { projection: { overall: 1 } }).toArray(),
    collections.lists().countDocuments({ ownerId: userId }),
  ])
  if (!user) throw notFound('That account does not exist.')
  return {
    posts,
    ratings: ratings.length,
    followers: user.followerIds.length,
    following: user.followingIds.length,
    lists,
    averageGiven: ratings.length
      ? Math.round((ratings.reduce((s, r) => s + r.overall, 0) / ratings.length) * 10) / 10
      : null,
  }
}

/* --------------------------------------------------------------- profile */

/**
 * Validation lives here rather than in the composer screen: the rules that
 * decide whether a handle is taken or a photo is too big are the database's
 * business, and a second client would otherwise have to reimplement them.
 */
export async function updateProfile(userId: string, patch: ProfilePatch): Promise<User> {
  const users = collections.users()
  const user = await users.findOne({ _id: userId })
  if (!user) throw notFound('That account does not exist.')

  const update: Partial<UserDoc> = {}

  if (patch.username !== undefined) {
    const name = patch.username.trim().replace(/^@/, '')
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(name)) {
      throw badRequest('Username must be 3-20 characters, letters, numbers and underscores only.')
    }
    const taken = await users.findOne(
      { _id: { $ne: userId }, username: name },
      { projection: { _id: 1 }, collation: { locale: 'en', strength: 2 } },
    )
    if (taken) throw badRequest('That username is taken.')
    update.username = name
  }

  if (patch.displayName !== undefined) {
    const name = patch.displayName.trim()
    if (!name) throw badRequest('Display name cannot be empty.')
    update.displayName = name
  }

  if (patch.avatarPhoto !== undefined) {
    if (patch.avatarPhoto === null) {
      update.avatarPhoto = null
    } else {
      // The photo is rendered for every viewer, so only an inline image is
      // accepted — never a remote URL that would ping someone else's server.
      // Length first, so an oversized string is never run through the regex.
      if (patch.avatarPhoto.length > AVATAR_PHOTO.maxChars) {
        throw badRequest('That profile photo is too large.')
      }
      if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(patch.avatarPhoto)) {
        throw badRequest('That profile photo could not be read.')
      }
      update.avatarPhoto = patch.avatarPhoto
    }
  }

  if (patch.bio !== undefined) update.bio = patch.bio.trim()
  if (patch.location !== undefined) update.location = patch.location.trim()
  if (patch.roles !== undefined) update.roles = patch.roles
  if (patch.homeVenueId !== undefined) update.homeVenueId = patch.homeVenueId
  if (patch.avatarTone !== undefined) update.avatarTone = patch.avatarTone
  if (patch.isPrivate !== undefined) update.isPrivate = patch.isPrivate

  if (Object.keys(update).length) await users.updateOne({ _id: userId }, { $set: update })

  // Going public auto-accepts everyone who was waiting on approval.
  if (patch.isPrivate === false && user.pendingFollowerIds.length) {
    for (const requesterId of [...user.pendingFollowerIds]) {
      await acceptFollowRequest(userId, requesterId)
    }
  }

  return requireUserRecord(userId)
}

/* -------------------------------------------------------------- following */

export async function followState(
  viewerId: string | null,
  targetId: string,
): Promise<FollowState> {
  if (!viewerId) return 'none'
  if (viewerId === targetId) return 'self'
  const viewer = await collections.users().findOne(
    { _id: viewerId },
    { projection: { followingIds: 1, pendingFollowingIds: 1 } },
  )
  if (!viewer) return 'none'
  if (viewer.followingIds.includes(targetId)) return 'following'
  if (viewer.pendingFollowingIds.includes(targetId)) return 'requested'
  return 'none'
}

/**
 * Follow, unfollow, or cancel a pending request — whichever the current state
 * implies. Returns the state the viewer ends up in.
 */
export async function toggleFollow(viewerId: string, targetId: string): Promise<FollowState> {
  if (viewerId === targetId) return 'self'
  const users = collections.users()
  const [viewer, target] = await Promise.all([
    users.findOne({ _id: viewerId }),
    users.findOne({ _id: targetId }),
  ])
  if (!viewer || !target) throw notFound('That account does not exist.')

  if (viewer.followingIds.includes(targetId)) {
    await Promise.all([
      users.updateOne({ _id: viewerId }, { $pull: { followingIds: targetId } }),
      users.updateOne({ _id: targetId }, { $pull: { followerIds: viewerId } }),
    ])
    return 'none'
  }
  if (viewer.pendingFollowingIds.includes(targetId)) {
    await Promise.all([
      users.updateOne({ _id: viewerId }, { $pull: { pendingFollowingIds: targetId } }),
      users.updateOne({ _id: targetId }, { $pull: { pendingFollowerIds: viewerId } }),
    ])
    return 'none'
  }
  if (target.isPrivate) {
    await Promise.all([
      users.updateOne({ _id: viewerId }, { $addToSet: { pendingFollowingIds: targetId } }),
      users.updateOne({ _id: targetId }, { $addToSet: { pendingFollowerIds: viewerId } }),
    ])
    return 'requested'
  }
  await Promise.all([
    users.updateOne({ _id: viewerId }, { $addToSet: { followingIds: targetId } }),
    users.updateOne({ _id: targetId }, { $addToSet: { followerIds: viewerId } }),
  ])
  return 'following'
}

export async function acceptFollowRequest(ownerId: string, requesterId: string): Promise<void> {
  const users = collections.users()
  await Promise.all([
    users.updateOne(
      { _id: ownerId },
      { $pull: { pendingFollowerIds: requesterId }, $addToSet: { followerIds: requesterId } },
    ),
    users.updateOne(
      { _id: requesterId },
      { $pull: { pendingFollowingIds: ownerId }, $addToSet: { followingIds: ownerId } },
    ),
  ])
}

export async function declineFollowRequest(ownerId: string, requesterId: string): Promise<void> {
  const users = collections.users()
  await Promise.all([
    users.updateOne({ _id: ownerId }, { $pull: { pendingFollowerIds: requesterId } }),
    users.updateOne({ _id: requesterId }, { $pull: { pendingFollowingIds: ownerId } }),
  ])
}

export async function removeFollower(ownerId: string, followerId: string): Promise<void> {
  const users = collections.users()
  await Promise.all([
    users.updateOne({ _id: ownerId }, { $pull: { followerIds: followerId } }),
    users.updateOne({ _id: followerId }, { $pull: { followingIds: ownerId } }),
  ])
}

/** Hydrate a list of ids into user records, preserving the given order. */
export async function getUsersByIds(ids: string[]): Promise<User[]> {
  if (!ids.length) return []
  const docs = await collections.users().find({ _id: { $in: ids } }).toArray()
  const byId = new Map(docs.map((d) => [d._id, toDomain(d)]))
  return ids.map((id) => byId.get(id)).filter((u): u is User => u !== undefined)
}
