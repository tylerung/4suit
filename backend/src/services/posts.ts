import { collections, toDomain, toDomainAll, type PostDoc } from '../db/mongo.js'
import { newId } from '../db/ids.js'
import { MEDIA_LIMITS, type FeedItem, type FeedScope, type Post } from '../types.js'
import type { PostInput } from '../validation/schemas.js'
import { forbidden, notFound } from '../lib/errors.js'
import { canViewProfile, visibleAuthorIds } from './privacy.js'
import { deleteMedia, ownsMedia } from './media.js'

/* ------------------------------------------------------------- hydration */

/**
 * Turn stored posts into feed items — author, room, rating and comment count
 * attached — in a fixed number of queries no matter how many posts there are.
 * The client used to do this with a lookup per post against its local copy of
 * every record; over a network that would be a request per post.
 */
export async function hydratePosts(posts: Post[], viewerId: string | null): Promise<FeedItem[]> {
  if (!posts.length) return []

  const authorIds = [...new Set(posts.map((p) => p.authorId))]
  const venueIds = [...new Set(posts.map((p) => p.venueId).filter((id): id is string => !!id))]
  const ratingIds = [...new Set(posts.map((p) => p.ratingId).filter((id): id is string => !!id))]
  const postIds = posts.map((p) => p.id)

  const [authors, venues, ratings, counts] = await Promise.all([
    collections.users().find({ _id: { $in: authorIds } }).toArray(),
    venueIds.length
      ? collections.venues().find({ _id: { $in: venueIds } }).toArray()
      : Promise.resolve([]),
    ratingIds.length
      ? collections.ratings().find({ _id: { $in: ratingIds } }).toArray()
      : Promise.resolve([]),
    collections.comments().aggregate<{ _id: string; n: number }>([
      { $match: { postId: { $in: postIds } } },
      { $group: { _id: '$postId', n: { $sum: 1 } } },
    ]).toArray(),
  ])

  const authorById = new Map(authors.map((d) => [d._id, toDomain(d)]))
  const venueById = new Map(venues.map((d) => [d._id, toDomain(d)]))
  const ratingById = new Map(ratings.map((d) => [d._id, toDomain(d)]))
  const countByPost = new Map(counts.map((c) => [c._id, c.n]))

  return posts.flatMap((post) => {
    const author = authorById.get(post.authorId)
    // A post whose author is gone has nothing to render; drop it rather than
    // handing the client a half-built item to guard against.
    if (!author) return []
    return [{
      post,
      author,
      venue: post.venueId ? venueById.get(post.venueId) ?? null : null,
      rating: post.ratingId ? ratingById.get(post.ratingId) ?? null : null,
      commentCount: countByPost.get(post.id) ?? 0,
      likedByMe: viewerId ? post.likedBy.includes(viewerId) : false,
    }]
  })
}

async function hydrateOne(post: Post, viewerId: string | null): Promise<FeedItem> {
  const [item] = await hydratePosts([post], viewerId)
  if (!item) throw notFound('That post is no longer here.')
  return item
}

/* ----------------------------------------------------------------- reads */

export async function getPost(id: string): Promise<Post | null> {
  return toDomain(await collections.posts().findOne({ _id: id }))
}

/** A single post, hydrated, with the viewer's right to see it checked first. */
export async function getFeedItem(id: string, viewerId: string | null): Promise<FeedItem> {
  const post = await getPost(id)
  if (!post) throw notFound('That post is no longer here.')
  if (!(await canViewProfile(viewerId, post.authorId))) {
    throw forbidden('That account is private.')
  }
  return hydrateOne(post, viewerId)
}

/**
 * `following` is the home feed: people you follow, plus yourself.
 * `discover` is everything you are allowed to see.
 */
export async function listFeed(
  viewerId: string | null,
  scope: FeedScope = 'following',
): Promise<FeedItem[]> {
  const allowed = await visibleAuthorIds(viewerId)
  let authorIds = allowed

  if (scope === 'following') {
    if (!viewerId) return []
    const viewer = await collections.users().findOne(
      { _id: viewerId },
      { projection: { followingIds: 1 } },
    )
    if (!viewer) return []
    const wanted = new Set([...viewer.followingIds, viewerId])
    authorIds = allowed.filter((id) => wanted.has(id))
  }

  const docs = await collections.posts()
    .find({ authorId: { $in: authorIds } })
    .sort({ createdAt: -1 })
    .toArray()
  return hydratePosts(toDomainAll(docs), viewerId)
}

export async function listPostsByUser(userId: string, viewerId: string | null): Promise<FeedItem[]> {
  if (!(await canViewProfile(viewerId, userId))) return []
  const docs = await collections.posts()
    .find({ authorId: userId })
    .sort({ createdAt: -1 })
    .toArray()
  return hydratePosts(toDomainAll(docs), viewerId)
}

export async function listPostsForVenue(
  venueId: string,
  viewerId: string | null,
): Promise<FeedItem[]> {
  const authorIds = await visibleAuthorIds(viewerId)
  const docs = await collections.posts()
    .find({ venueId, authorId: { $in: authorIds } })
    .sort({ createdAt: -1 })
    .toArray()
  return hydratePosts(toDomainAll(docs), viewerId)
}

/* ------------------------------------------------------------- mutations */

export async function createPost(authorId: string, input: PostInput): Promise<FeedItem> {
  const media = (input.media ?? []).slice(0, MEDIA_LIMITS.perPost)
  // Attaching someone else's upload by guessing its id would republish their
  // photo under your name, so every uploaded id has to be one of yours.
  for (const item of media) {
    if (item.dataUri === null && !(await ownsMedia(item.id, authorId))) {
      throw forbidden('That attachment is not yours.')
    }
  }

  const post: Post = {
    id: newId('p'),
    authorId,
    kind: input.kind,
    body: input.body.trim(),
    venueId: input.venueId ?? null,
    ratingId: input.ratingId ?? null,
    session: input.session ?? null,
    media,
    tags: (input.tags ?? []).map((t) => t.trim().replace(/^#/, '')).filter(Boolean),
    createdAt: new Date().toISOString(),
    likedBy: [],
  }
  const { id, ...rest } = post
  await collections.posts().insertOne({ _id: id, ...rest } as PostDoc)
  return hydrateOne(post, authorId)
}

async function requireOwnPost(postId: string, actorId: string): Promise<Post> {
  const post = await getPost(postId)
  if (!post) throw notFound('That post is no longer here.')
  if (post.authorId !== actorId) throw forbidden('That post is not yours.')
  return post
}

export async function updatePost(
  postId: string,
  actorId: string,
  body: string,
  tags?: string[],
): Promise<FeedItem> {
  await requireOwnPost(postId, actorId)
  const update: Record<string, unknown> = { body: body.trim() }
  if (tags) update.tags = tags.map((t) => t.trim().replace(/^#/, '')).filter(Boolean)
  await collections.posts().updateOne({ _id: postId }, { $set: update })
  const updated = await getPost(postId)
  return hydrateOne(updated!, actorId)
}

export async function deletePost(postId: string, actorId: string): Promise<void> {
  const post = await requireOwnPost(postId, actorId)
  await Promise.all([
    collections.posts().deleteOne({ _id: postId }),
    collections.comments().deleteMany({ postId }),
  ])
  // Nothing else references the blobs, so they would sit in the bucket forever.
  if (post.media.length) await deleteMedia(post.media)
}

export async function toggleLike(postId: string, userId: string): Promise<FeedItem> {
  const post = await getPost(postId)
  if (!post) throw notFound('That post is no longer here.')
  if (!(await canViewProfile(userId, post.authorId))) {
    throw forbidden('That account is private.')
  }
  await collections.posts().updateOne(
    { _id: postId },
    post.likedBy.includes(userId)
      ? { $pull: { likedBy: userId } }
      : { $addToSet: { likedBy: userId } },
  )
  const updated = await getPost(postId)
  return hydrateOne(updated!, userId)
}

/** Used by the rating cascade: drops the posts that quoted a deleted rating. */
export async function deletePostsForRating(ratingId: string): Promise<void> {
  const docs = await collections.posts().find({ ratingId }).toArray()
  if (!docs.length) return
  const posts = toDomainAll(docs)
  const ids = posts.map((p) => p.id)
  await Promise.all([
    collections.posts().deleteMany({ _id: { $in: ids } }),
    collections.comments().deleteMany({ postId: { $in: ids } }),
  ])
  const stranded = posts.flatMap((p) => p.media)
  if (stranded.length) await deleteMedia(stranded)
}
