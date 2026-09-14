import type {
  Amenity, AvatarTone, Comment, Coords, FeedItem, GameType, MediaItem, Post, PostKind, RankedVenue,
  Rating, Role, SessionResult, Subscores, User, Venue, VenueList, VenueStats, VenueType,
} from '../types'
import { AVATAR_PHOTO, MEDIA_LIMITS } from '../types'
import { getDB, mutate, newId, resetDB as resetStore } from './storage'
import { deleteMedia, clearAllMedia } from './media'
import { distanceMi } from './geo'

/* =========================================================== auth / users */

export function listUsers(): User[] {
  return getDB().users
}

export function getCurrentUser(): User | null {
  const db = getDB()
  return db.users.find((u) => u.id === db.currentUserId) ?? null
}

export function signIn(userId: string): void {
  mutate((db) => {
    if (db.users.some((u) => u.id === userId)) db.currentUserId = userId
  })
}

export function signOut(): void {
  mutate((db) => { db.currentUserId = null })
}

export function getUser(id: string | null | undefined): User | null {
  if (!id) return null
  return getDB().users.find((u) => u.id === id) ?? null
}

export function getUserByUsername(username: string): User | null {
  const lower = username.toLowerCase()
  return getDB().users.find((u) => u.username.toLowerCase() === lower) ?? null
}

export interface ProfilePatch {
  displayName?: string
  username?: string
  bio?: string
  location?: string
  roles?: Role[]
  homeVenueId?: string | null
  avatarTone?: AvatarTone
  /** A data URI from makeAvatarPhoto(), or null to go back to initials. */
  avatarPhoto?: string | null
  isPrivate?: boolean
}

/** Returns an error message, or null on success. */
export function updateProfile(userId: string, patch: ProfilePatch): string | null {
  const db = getDB()
  const user = db.users.find((u) => u.id === userId)
  if (!user) return 'User not found.'

  if (patch.username !== undefined) {
    const name = patch.username.trim().replace(/^@/, '')
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(name)) {
      return 'Username must be 3-20 characters, letters, numbers and underscores only.'
    }
    const taken = db.users.some(
      (u) => u.id !== userId && u.username.toLowerCase() === name.toLowerCase(),
    )
    if (taken) return 'That username is taken.'
    patch = { ...patch, username: name }
  }
  if (patch.displayName !== undefined && !patch.displayName.trim()) {
    return 'Display name cannot be empty.'
  }
  if (typeof patch.avatarPhoto === 'string') {
    // The photo is rendered for every viewer, so only an inline image is
    // accepted — never a remote URL that would ping someone else's server.
    // Length first, so an oversized string is never run through the regex.
    if (patch.avatarPhoto.length > AVATAR_PHOTO.maxChars) return 'That profile photo is too large.'
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(patch.avatarPhoto)) {
      return 'That profile photo could not be read.'
    }
  }

  mutate(() => {
    Object.assign(user, patch)
    if (patch.displayName !== undefined) user.displayName = patch.displayName.trim()
    if (patch.bio !== undefined) user.bio = patch.bio.trim()
    // Going public auto-accepts everyone who was waiting on approval.
    if (patch.isPrivate === false && user.pendingFollowerIds.length) {
      for (const requesterId of [...user.pendingFollowerIds]) acceptFollowInternal(user.id, requesterId)
    }
  })
  return null
}

/* -------------------------------------------------------------- following */

export type FollowState = 'self' | 'following' | 'requested' | 'none'

export function followState(viewerId: string | null, targetId: string): FollowState {
  if (!viewerId) return 'none'
  if (viewerId === targetId) return 'self'
  const viewer = getUser(viewerId)
  if (!viewer) return 'none'
  if (viewer.followingIds.includes(targetId)) return 'following'
  if (viewer.pendingFollowingIds.includes(targetId)) return 'requested'
  return 'none'
}

/** Follow, unfollow, or cancel a pending request. Returns the resulting state. */
export function toggleFollow(viewerId: string, targetId: string): FollowState {
  if (viewerId === targetId) return 'self'
  return mutate((db) => {
    const viewer = db.users.find((u) => u.id === viewerId)
    const target = db.users.find((u) => u.id === targetId)
    if (!viewer || !target) return 'none' as FollowState

    const isFollowing = viewer.followingIds.includes(targetId)
    const isPending = viewer.pendingFollowingIds.includes(targetId)

    if (isFollowing) {
      viewer.followingIds = viewer.followingIds.filter((id) => id !== targetId)
      target.followerIds = target.followerIds.filter((id) => id !== viewerId)
      return 'none' as FollowState
    }
    if (isPending) {
      viewer.pendingFollowingIds = viewer.pendingFollowingIds.filter((id) => id !== targetId)
      target.pendingFollowerIds = target.pendingFollowerIds.filter((id) => id !== viewerId)
      return 'none' as FollowState
    }
    if (target.isPrivate) {
      viewer.pendingFollowingIds.push(targetId)
      target.pendingFollowerIds.push(viewerId)
      return 'requested' as FollowState
    }
    viewer.followingIds.push(targetId)
    target.followerIds.push(viewerId)
    return 'following' as FollowState
  })
}

function acceptFollowInternal(ownerId: string, requesterId: string): void {
  const db = getDB()
  const owner = db.users.find((u) => u.id === ownerId)
  const requester = db.users.find((u) => u.id === requesterId)
  if (!owner || !requester) return
  owner.pendingFollowerIds = owner.pendingFollowerIds.filter((id) => id !== requesterId)
  requester.pendingFollowingIds = requester.pendingFollowingIds.filter((id) => id !== ownerId)
  if (!owner.followerIds.includes(requesterId)) owner.followerIds.push(requesterId)
  if (!requester.followingIds.includes(ownerId)) requester.followingIds.push(ownerId)
}

export function acceptFollowRequest(ownerId: string, requesterId: string): void {
  mutate(() => acceptFollowInternal(ownerId, requesterId))
}

export function declineFollowRequest(ownerId: string, requesterId: string): void {
  mutate((db) => {
    const owner = db.users.find((u) => u.id === ownerId)
    const requester = db.users.find((u) => u.id === requesterId)
    if (owner) owner.pendingFollowerIds = owner.pendingFollowerIds.filter((id) => id !== requesterId)
    if (requester) {
      requester.pendingFollowingIds = requester.pendingFollowingIds.filter((id) => id !== ownerId)
    }
  })
}

export function removeFollower(ownerId: string, followerId: string): void {
  mutate((db) => {
    const owner = db.users.find((u) => u.id === ownerId)
    const follower = db.users.find((u) => u.id === followerId)
    if (owner) owner.followerIds = owner.followerIds.filter((id) => id !== followerId)
    if (follower) follower.followingIds = follower.followingIds.filter((id) => id !== ownerId)
  })
}

/* ---------------------------------------------------------------- privacy */

/**
 * Can `viewerId` see `targetId`'s posts, lists and activity? Public accounts are
 * open; private accounts are visible only to the owner and approved followers.
 */
export function canViewProfile(viewerId: string | null, targetId: string): boolean {
  const target = getUser(targetId)
  if (!target) return false
  if (!target.isPrivate) return true
  if (!viewerId) return false
  if (viewerId === targetId) return true
  return target.followerIds.includes(viewerId)
}

/* --------------------------------------------------------------- venues */

export function listVenues(): Venue[] {
  return getDB().venues
}

export function getVenue(id: string | null | undefined): Venue | null {
  if (!id) return null
  return getDB().venues.find((v) => v.id === id) ?? null
}

const EMPTY_SUB: Subscores = {
  gameQuality: 0, tableAvailability: 0, dealers: 0, comps: 0, atmosphere: 0, value: 0,
}

export function getVenueStats(venueId: string): VenueStats {
  const ratings = getDB().ratings.filter((r) => r.venueId === venueId)
  if (!ratings.length) {
    return { venueId, average: null, count: 0, subscores: null, rank: 0 }
  }
  const average = ratings.reduce((s, r) => s + r.overall, 0) / ratings.length
  const subscores = { ...EMPTY_SUB }
  for (const key of Object.keys(subscores) as (keyof Subscores)[]) {
    subscores[key] = ratings.reduce((s, r) => s + r.subscores[key], 0) / ratings.length
  }
  return {
    venueId,
    average: Math.round(average * 10) / 10,
    count: ratings.length,
    subscores,
    rank: 0,
  }
}

export type VenueSort = 'rating' | 'distance' | 'reviews' | 'name'

export interface VenueQuery {
  origin?: Coords | null
  /** Miles. Ignored when origin is null. */
  radiusMi?: number | null
  text?: string
  type?: VenueType | 'all'
  games?: GameType[]
  amenities?: Amenity[]
  /** Hide rooms with fewer than this many reviews. */
  minReviews?: number
  sort?: VenueSort
}

/**
 * The leaderboard. Ranking is always computed on the filtered set, so rank #1
 * means "best of what you are currently looking at".
 */
export function rankVenues(q: VenueQuery = {}): RankedVenue[] {
  const {
    origin = null, radiusMi = null, text = '', type = 'all',
    games = [], amenities = [], minReviews = 0, sort = 'rating',
  } = q
  const needle = text.trim().toLowerCase()

  let rows: RankedVenue[] = getDB().venues.map((venue) => ({
    venue,
    stats: getVenueStats(venue.id),
    distanceMi: origin ? Math.round(distanceMi(origin, venue) * 10) / 10 : null,
  }))

  rows = rows.filter(({ venue, stats, distanceMi: d }) => {
    if (type !== 'all' && venue.type !== type) return false
    if (stats.count < minReviews) return false
    if (radiusMi !== null && d !== null && d > radiusMi) return false
    if (games.length && !games.every((g) => venue.games.includes(g))) return false
    if (amenities.length && !amenities.every((a) => venue.amenities.includes(a))) return false
    if (needle) {
      const hay = `${venue.name} ${venue.city} ${venue.state} ${venue.address} ${venue.blurb}`.toLowerCase()
      if (!hay.includes(needle)) return false
    }
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

/* --------------------------------------------------------------- ratings */

/**
 * Reviews for a room, newest first.
 *
 * Pass `viewerId` to get only the reviews that viewer is allowed to read —
 * an attributed review carries its author's name and words, so a private
 * account's review is withheld the same way their posts are. The room's
 * aggregate score (getVenueStats) deliberately still counts every rating:
 * a score is a fact about the room, and gating it would make the leaderboard
 * mean something different for every viewer.
 */
export function listRatingsForVenue(venueId: string, viewerId?: string | null): Rating[] {
  const gated = viewerId !== undefined
  return getDB().ratings
    .filter((r) => r.venueId === venueId)
    .filter((r) => !gated || canViewProfile(viewerId ?? null, r.userId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function listRatingsByUser(userId: string): Rating[] {
  return getDB().ratings
    .filter((r) => r.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getRating(id: string | null | undefined): Rating | null {
  if (!id) return null
  return getDB().ratings.find((r) => r.id === id) ?? null
}

export function getMyRating(userId: string, venueId: string): Rating | null {
  return getDB().ratings.find((r) => r.userId === userId && r.venueId === venueId) ?? null
}

export interface RatingInput {
  venueId: string
  subscores: Subscores
  review: string
  stakesPlayed: string
}

/**
 * One rating per user per room — re-rating replaces the old one. Overall is the
 * mean of the six subscores, so it can never disagree with the breakdown.
 */
export function saveRating(userId: string, input: RatingInput): Rating {
  const values = Object.values(input.subscores)
  const overall = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
  return mutate((db) => {
    const existing = db.ratings.find((r) => r.userId === userId && r.venueId === input.venueId)
    if (existing) {
      Object.assign(existing, {
        overall,
        subscores: input.subscores,
        review: input.review.trim(),
        stakesPlayed: input.stakesPlayed,
        createdAt: new Date().toISOString(),
      })
      // Return a copy: callers holding the result should not see it mutate on the
      // next save, and React comparisons on the returned value stay meaningful.
      return { ...existing }
    }
    const rating: Rating = {
      id: newId('r'),
      userId,
      venueId: input.venueId,
      overall,
      subscores: input.subscores,
      review: input.review.trim(),
      stakesPlayed: input.stakesPlayed,
      createdAt: new Date().toISOString(),
    }
    db.ratings.push(rating)
    return { ...rating }
  })
}

export function deleteRating(ratingId: string): void {
  mutate((db) => {
    db.ratings = db.ratings.filter((r) => r.id !== ratingId)
    // Rating posts are meaningless without their rating.
    const removed = db.posts.filter((p) => p.ratingId === ratingId)
    const orphaned = removed.map((p) => p.id)
    db.posts = db.posts.filter((p) => p.ratingId !== ratingId)
    db.comments = db.comments.filter((c) => !orphaned.includes(c.postId))
    const strandedMedia = removed.flatMap((p) => p.media)
    if (strandedMedia.length) void deleteMedia(strandedMedia)
  })
}

/* ----------------------------------------------------------------- posts */

export function getPost(id: string | null | undefined): Post | null {
  if (!id) return null
  return getDB().posts.find((p) => p.id === id) ?? null
}

function toFeedItem(post: Post, viewerId: string | null): FeedItem | null {
  const author = getUser(post.authorId)
  if (!author) return null
  return {
    post,
    author,
    venue: getVenue(post.venueId),
    rating: getRating(post.ratingId),
    commentCount: getDB().comments.filter((c) => c.postId === post.id).length,
    likedByMe: viewerId ? post.likedBy.includes(viewerId) : false,
  }
}

export function hydratePost(post: Post, viewerId: string | null): FeedItem | null {
  return toFeedItem(post, viewerId)
}

export type FeedScope = 'following' | 'discover'

/**
 * `following` is the home feed: people you follow, plus yourself.
 * `discover` is everything you are allowed to see.
 */
export function listFeed(viewerId: string | null, scope: FeedScope = 'following'): FeedItem[] {
  const db = getDB()
  const viewer = getUser(viewerId)
  const allowed = new Set<string>()

  for (const u of db.users) {
    if (!canViewProfile(viewerId, u.id)) continue
    if (scope === 'discover') { allowed.add(u.id); continue }
    if (viewer && (viewer.followingIds.includes(u.id) || u.id === viewer.id)) allowed.add(u.id)
  }

  return db.posts
    .filter((p) => allowed.has(p.authorId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((p) => toFeedItem(p, viewerId))
    .filter((x): x is FeedItem => x !== null)
}

export function listPostsByUser(userId: string, viewerId: string | null): FeedItem[] {
  if (!canViewProfile(viewerId, userId)) return []
  return getDB().posts
    .filter((p) => p.authorId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((p) => toFeedItem(p, viewerId))
    .filter((x): x is FeedItem => x !== null)
}

export function listPostsForVenue(venueId: string, viewerId: string | null): FeedItem[] {
  return getDB().posts
    .filter((p) => p.venueId === venueId && canViewProfile(viewerId, p.authorId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((p) => toFeedItem(p, viewerId))
    .filter((x): x is FeedItem => x !== null)
}

export interface PostInput {
  kind: PostKind
  body: string
  venueId?: string | null
  ratingId?: string | null
  session?: SessionResult | null
  /** Photos and videos, already ingested by lib/media.ts. */
  media?: MediaItem[]
  tags?: string[]
}

export function createPost(authorId: string, input: PostInput): Post {
  return mutate((db) => {
    const post: Post = {
      id: newId('p'),
      authorId,
      kind: input.kind,
      body: input.body.trim(),
      venueId: input.venueId ?? null,
      ratingId: input.ratingId ?? null,
      session: input.session ?? null,
      media: (input.media ?? []).slice(0, MEDIA_LIMITS.perPost),
      tags: (input.tags ?? []).map((t) => t.trim().replace(/^#/, '')).filter(Boolean),
      createdAt: new Date().toISOString(),
      likedBy: [],
    }
    db.posts.push(post)
    return post
  })
}

export function updatePost(postId: string, body: string, tags?: string[]): void {
  mutate((db) => {
    const post = db.posts.find((p) => p.id === postId)
    if (!post) return
    post.body = body.trim()
    if (tags) post.tags = tags.map((t) => t.trim().replace(/^#/, '')).filter(Boolean)
  })
}

export function deletePost(postId: string): void {
  const doomed = getPost(postId)
  mutate((db) => {
    db.posts = db.posts.filter((p) => p.id !== postId)
    db.comments = db.comments.filter((c) => c.postId !== postId)
  })
  // The blobs outlive the record unless we say otherwise, and nothing else
  // references them, so they would sit in IndexedDB forever.
  if (doomed && doomed.media.length) void deleteMedia(doomed.media)
}

export function toggleLike(postId: string, userId: string): void {
  mutate((db) => {
    const post = db.posts.find((p) => p.id === postId)
    if (!post) return
    post.likedBy = post.likedBy.includes(userId)
      ? post.likedBy.filter((id) => id !== userId)
      : [...post.likedBy, userId]
  })
}

/* -------------------------------------------------------------- comments */

export function listComments(postId: string): Comment[] {
  return getDB().comments
    .filter((c) => c.postId === postId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function addComment(postId: string, authorId: string, body: string): Comment {
  return mutate((db) => {
    const comment: Comment = {
      id: newId('c'),
      postId,
      authorId,
      body: body.trim(),
      createdAt: new Date().toISOString(),
      likedBy: [],
    }
    db.comments.push(comment)
    return comment
  })
}

export function deleteComment(commentId: string): void {
  mutate((db) => { db.comments = db.comments.filter((c) => c.id !== commentId) })
}

export function toggleCommentLike(commentId: string, userId: string): void {
  mutate((db) => {
    const c = db.comments.find((x) => x.id === commentId)
    if (!c) return
    c.likedBy = c.likedBy.includes(userId)
      ? c.likedBy.filter((id) => id !== userId)
      : [...c.likedBy, userId]
  })
}

/* ----------------------------------------------------------------- lists */

export function getList(id: string | null | undefined): VenueList | null {
  if (!id) return null
  return getDB().lists.find((l) => l.id === id) ?? null
}

/** Lists owned by `ownerId` that `viewerId` is allowed to see. */
export function listListsByUser(ownerId: string, viewerId: string | null): VenueList[] {
  const isOwner = viewerId === ownerId
  if (!isOwner && !canViewProfile(viewerId, ownerId)) return []
  return getDB().lists
    .filter((l) => l.ownerId === ownerId && (isOwner || l.isPublic))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function canViewList(list: VenueList, viewerId: string | null): boolean {
  if (viewerId === list.ownerId) return true
  if (!list.isPublic) return false
  return canViewProfile(viewerId, list.ownerId)
}

export interface ListInput {
  name: string
  description?: string
  emoji?: string
  isPublic?: boolean
  venueIds?: string[]
}

export function createList(ownerId: string, input: ListInput): VenueList {
  const now = new Date().toISOString()
  return mutate((db) => {
    const list: VenueList = {
      id: newId('l'),
      ownerId,
      name: input.name.trim() || 'Untitled list',
      description: (input.description ?? '').trim(),
      emoji: input.emoji || '📋',
      isPublic: input.isPublic ?? false,
      venueIds: input.venueIds ?? [],
      createdAt: now,
      updatedAt: now,
    }
    db.lists.push(list)
    return list
  })
}

export function updateList(listId: string, patch: Partial<ListInput>): void {
  mutate((db) => {
    const list = db.lists.find((l) => l.id === listId)
    if (!list) return
    if (patch.name !== undefined) list.name = patch.name.trim() || list.name
    if (patch.description !== undefined) list.description = patch.description.trim()
    if (patch.emoji !== undefined) list.emoji = patch.emoji
    if (patch.isPublic !== undefined) list.isPublic = patch.isPublic
    if (patch.venueIds !== undefined) list.venueIds = patch.venueIds
    list.updatedAt = new Date().toISOString()
  })
}

export function deleteList(listId: string): void {
  mutate((db) => { db.lists = db.lists.filter((l) => l.id !== listId) })
}

/** Add/remove in one call; returns true when the venue ends up in the list. */
export function toggleVenueInList(listId: string, venueId: string): boolean {
  return mutate((db) => {
    const list = db.lists.find((l) => l.id === listId)
    if (!list) return false
    const has = list.venueIds.includes(venueId)
    list.venueIds = has
      ? list.venueIds.filter((id) => id !== venueId)
      : [...list.venueIds, venueId]
    list.updatedAt = new Date().toISOString()
    return !has
  })
}

export function reorderList(listId: string, venueId: string, direction: -1 | 1): void {
  mutate((db) => {
    const list = db.lists.find((l) => l.id === listId)
    if (!list) return
    const i = list.venueIds.indexOf(venueId)
    const j = i + direction
    if (i < 0 || j < 0 || j >= list.venueIds.length) return
    const next = [...list.venueIds]
    ;[next[i], next[j]] = [next[j], next[i]]
    list.venueIds = next
    list.updatedAt = new Date().toISOString()
  })
}

/* ---------------------------------------------------------------- search */

export interface SearchResults {
  venues: RankedVenue[]
  users: User[]
  posts: FeedItem[]
  lists: VenueList[]
}

export function search(query: string, viewerId: string | null, origin?: Coords | null): SearchResults {
  const q = query.trim().toLowerCase()
  if (!q) return { venues: [], users: [], posts: [], lists: [] }
  const db = getDB()

  const venues = rankVenues({ text: q, origin, sort: 'rating' })

  const users = db.users
    .filter((u) => {
      const hay = `${u.username} ${u.displayName} ${u.location} ${u.bio} ${u.roles.join(' ')}`.toLowerCase()
      return hay.includes(q)
    })
    .sort((a, b) => {
      // Exact handle match first, then by reach.
      const aExact = a.username.toLowerCase() === q ? 1 : 0
      const bExact = b.username.toLowerCase() === q ? 1 : 0
      return bExact - aExact || b.followerIds.length - a.followerIds.length
    })

  const posts = db.posts
    .filter((p) => {
      if (!canViewProfile(viewerId, p.authorId)) return false
      const hay = `${p.body} ${p.tags.join(' ')}`.toLowerCase()
      return hay.includes(q)
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((p) => toFeedItem(p, viewerId))
    .filter((x): x is FeedItem => x !== null)

  const lists = db.lists
    .filter((l) => canViewList(l, viewerId))
    .filter((l) => `${l.name} ${l.description}`.toLowerCase().includes(q))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return { venues, users, posts, lists }
}

/* --------------------------------------------------------------- derived */

export interface UserStats {
  posts: number
  ratings: number
  followers: number
  following: number
  lists: number
  /** Mean of every rating this user has left. */
  averageGiven: number | null
}

export function getUserStats(userId: string): UserStats {
  const db = getDB()
  const ratings = db.ratings.filter((r) => r.userId === userId)
  const user = getUser(userId)
  return {
    posts: db.posts.filter((p) => p.authorId === userId).length,
    ratings: ratings.length,
    followers: user?.followerIds.length ?? 0,
    following: user?.followingIds.length ?? 0,
    lists: db.lists.filter((l) => l.ownerId === userId).length,
    averageGiven: ratings.length
      ? Math.round((ratings.reduce((s, r) => s + r.overall, 0) / ratings.length) * 10) / 10
      : null,
  }
}

/** Suggested accounts: people you do not follow yet, most-followed first. */
export function suggestedUsers(viewerId: string | null, limit = 5): User[] {
  const viewer = getUser(viewerId)
  return getDB().users
    .filter((u) => u.id !== viewerId)
    .filter((u) => !viewer?.followingIds.includes(u.id))
    .sort((a, b) => b.followerIds.length - a.followerIds.length)
    .slice(0, limit)
}

/** Restore the seeded demo data and drop every stored photo and video with it. */
export function resetDB(): void {
  void clearAllMedia()
  resetStore()
}
