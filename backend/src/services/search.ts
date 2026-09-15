import { collections, toDomainAll } from '../db/mongo.js'
import type { Coords, SearchResults } from '../types.js'
import { visibleAuthorIds } from './privacy.js'
import { hydratePosts } from './posts.js'
import { rankVenues } from './venues.js'

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * One query across rooms, people, posts and lists.
 *
 * Every branch is scoped to what the viewer may see before it is sorted, so a
 * private account's post cannot surface here even as a title — the check the
 * browser used to make on data it already held.
 */
export async function search(
  query: string,
  viewerId: string | null,
  origin?: Coords | null,
): Promise<SearchResults> {
  const q = query.trim().toLowerCase()
  if (!q) return { venues: [], users: [], posts: [], lists: [] }

  const rx = new RegExp(escapeRegex(q), 'i')
  const authorIds = await visibleAuthorIds(viewerId)

  const [venues, userDocs, postDocs, listDocs] = await Promise.all([
    rankVenues({ text: q, lat: origin?.lat, lng: origin?.lng, sort: 'rating' }),

    collections.users().find({
      $or: [{ username: rx }, { displayName: rx }, { location: rx }, { bio: rx }, { roles: rx }],
    }).toArray(),

    collections.posts().find({
      authorId: { $in: authorIds },
      $or: [{ body: rx }, { tags: rx }],
    }).sort({ createdAt: -1 }).toArray(),

    collections.lists().find({
      $and: [
        { $or: [{ name: rx }, { description: rx }] },
        // Owner-private lists are only ever the viewer's own; public ones still
        // depend on the owner's account being visible to this viewer.
        { $or: [{ ownerId: viewerId ?? '' }, { isPublic: true, ownerId: { $in: authorIds } }] },
      ],
    }).sort({ updatedAt: -1 }).toArray(),
  ])

  const users = toDomainAll(userDocs).sort((a, b) => {
    // Exact handle match first, then by reach.
    const aExact = a.username.toLowerCase() === q ? 1 : 0
    const bExact = b.username.toLowerCase() === q ? 1 : 0
    return bExact - aExact || b.followerIds.length - a.followerIds.length
  })

  return {
    venues,
    users,
    posts: await hydratePosts(toDomainAll(postDocs), viewerId),
    lists: toDomainAll(listDocs),
  }
}
