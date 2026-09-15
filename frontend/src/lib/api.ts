import type {
  Amenity, AvatarTone, Comment, Coords, FeedItem, GameType, MediaItem, Post, PostKind,
  RankedVenue, Rating, Role, SessionResult, Subscores, User, Venue, VenueList, VenueStats,
  VenueType,
} from '../types'
import { del, get, patch, post, put, setToken } from './client'
import { invalidate } from './store'

/**
 * 4suit's data layer, as seen from the browser.
 *
 * Every function here is one request to the API. The rules that used to live in
 * this file — who may see a private account, how a room's score is averaged,
 * what ranks first — now live in `backend/src/services`, because a rule the
 * browser enforces is a rule the browser can also skip. What is left on this
 * side is the shape of each call and, on anything that writes, the `invalidate()`
 * that tells every live query on screen to refetch.
 */

/* =========================================================== auth / users */

export async function listUsers(): Promise<User[]> {
  return get<User[]>('/auth/accounts')
}

export async function getCurrentUser(): Promise<User | null> {
  const { user } = await get<{ user: User | null }>('/auth/me')
  return user
}

export async function signIn(userId: string): Promise<User> {
  const { token, user } = await post<{ token: string; user: User }>('/auth/signin', { userId })
  setToken(token)
  invalidate()
  return user
}

export async function signOut(): Promise<void> {
  await post('/auth/signout').catch(() => undefined)
  setToken(null)
  invalidate()
}

export async function getUser(id: string | null | undefined): Promise<User | null> {
  if (!id) return null
  return get<User>(`/users/${encodeURIComponent(id)}`).catch(() => null)
}

/** Hydrate a list of ids — a post's likers, a follower list — in one request. */
export async function listUsersByIds(ids: string[]): Promise<User[]> {
  if (!ids.length) return []
  return get<User[]>('/users/lookup', { ids: ids.join(',') })
}

export async function getUserByUsername(username: string): Promise<User | null> {
  return get<User>(`/users/by-username/${encodeURIComponent(username)}`).catch(() => null)
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

/** Throws ApiError, whose message is the server's — written to be shown. */
export async function updateProfile(userId: string, body: ProfilePatch): Promise<User> {
  const user = await patch<User>(`/users/${encodeURIComponent(userId)}`, body)
  invalidate()
  return user
}

export interface UserStats {
  posts: number
  ratings: number
  followers: number
  following: number
  lists: number
  /** Mean of every rating this user has left. */
  averageGiven: number | null
}

export async function getUserStats(userId: string): Promise<UserStats> {
  return get<UserStats>(`/users/${encodeURIComponent(userId)}/stats`)
}

export interface Connections {
  followers: User[]
  following: User[]
  /** Only ever populated for your own account. */
  pendingFollowers: User[]
}

export async function getConnections(userId: string): Promise<Connections> {
  return get<Connections>(`/users/${encodeURIComponent(userId)}/connections`)
}

/** Suggested accounts: people you do not follow yet, most-followed first. */
export async function suggestedUsers(limit = 5): Promise<User[]> {
  return get<User[]>('/users/suggested', { limit })
}

/* -------------------------------------------------------------- following */

export type FollowState = 'self' | 'following' | 'requested' | 'none'

export async function followState(targetId: string): Promise<FollowState> {
  const { state } = await get<{ state: FollowState }>(
    `/users/${encodeURIComponent(targetId)}/follow-state`,
  )
  return state
}

/** Follow, unfollow, or cancel a pending request. Returns the resulting state. */
export async function toggleFollow(targetId: string): Promise<FollowState> {
  const { state } = await post<{ state: FollowState }>(
    `/users/${encodeURIComponent(targetId)}/follow`,
  )
  invalidate()
  return state
}

export async function acceptFollowRequest(ownerId: string, requesterId: string): Promise<void> {
  await post(`/users/${encodeURIComponent(ownerId)}/requests/${encodeURIComponent(requesterId)}/accept`)
  invalidate()
}

export async function declineFollowRequest(ownerId: string, requesterId: string): Promise<void> {
  await del(`/users/${encodeURIComponent(ownerId)}/requests/${encodeURIComponent(requesterId)}`)
  invalidate()
}

export async function removeFollower(ownerId: string, followerId: string): Promise<void> {
  await del(`/users/${encodeURIComponent(ownerId)}/followers/${encodeURIComponent(followerId)}`)
  invalidate()
}

/* ---------------------------------------------------------------- venues */

export async function listVenues(): Promise<Venue[]> {
  return get<Venue[]>('/venues')
}

export async function getVenue(id: string | null | undefined): Promise<Venue | null> {
  if (!id) return null
  return get<Venue>(`/venues/${encodeURIComponent(id)}`).catch(() => null)
}

export async function getVenueStats(venueId: string): Promise<VenueStats> {
  return get<VenueStats>(`/venues/${encodeURIComponent(venueId)}/stats`)
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

/** The leaderboard. Ranked against the filtered set, so #1 is best of these. */
export async function rankVenues(q: VenueQuery = {}): Promise<RankedVenue[]> {
  return get<RankedVenue[]>('/venues/rank', {
    lat: q.origin?.lat,
    lng: q.origin?.lng,
    radiusMi: q.origin ? q.radiusMi ?? undefined : undefined,
    text: q.text,
    type: q.type,
    games: q.games?.length ? q.games.join(',') : undefined,
    amenities: q.amenities?.length ? q.amenities.join(',') : undefined,
    minReviews: q.minReviews,
    sort: q.sort,
  })
}

/* --------------------------------------------------------------- ratings */

export async function listRatingsForVenue(venueId: string): Promise<Rating[]> {
  return get<Rating[]>(`/venues/${encodeURIComponent(venueId)}/ratings`)
}

export async function listRatingsByUser(userId: string): Promise<Rating[]> {
  return get<Rating[]>(`/users/${encodeURIComponent(userId)}/ratings`)
}

export async function getRating(id: string | null | undefined): Promise<Rating | null> {
  if (!id) return null
  return get<Rating>(`/ratings/${encodeURIComponent(id)}`).catch(() => null)
}

export async function getMyRating(venueId: string): Promise<Rating | null> {
  const { rating } = await get<{ rating: Rating | null }>('/ratings/mine', { venueId })
  return rating
}

export interface RatingInput {
  venueId: string
  subscores: Subscores
  review: string
  stakesPlayed: string
}

/** One rating per person per room — saving again replaces the old one. */
export async function saveRating(input: RatingInput): Promise<Rating> {
  const rating = await put<Rating>('/ratings', input)
  invalidate()
  return rating
}

export async function deleteRating(ratingId: string): Promise<void> {
  await del(`/ratings/${encodeURIComponent(ratingId)}`)
  invalidate()
}

/* ----------------------------------------------------------------- posts */

export type FeedScope = 'following' | 'discover'

/**
 * `following` is the home feed: people you follow, plus yourself.
 * `discover` is everything you are allowed to see.
 */
export async function listFeed(scope: FeedScope = 'following'): Promise<FeedItem[]> {
  return get<FeedItem[]>('/feed', { scope })
}

/** A post with its author, room and rating already attached. */
export async function getFeedItem(postId: string): Promise<FeedItem | null> {
  return get<FeedItem>(`/posts/${encodeURIComponent(postId)}`).catch(() => null)
}

export async function listPostsByUser(userId: string): Promise<FeedItem[]> {
  return get<FeedItem[]>(`/users/${encodeURIComponent(userId)}/posts`)
}

export async function listPostsForVenue(venueId: string): Promise<FeedItem[]> {
  return get<FeedItem[]>(`/venues/${encodeURIComponent(venueId)}/posts`)
}

export interface PostInput {
  kind: PostKind
  body: string
  venueId?: string | null
  ratingId?: string | null
  session?: SessionResult | null
  /** Photos and videos, already uploaded by lib/media.ts. */
  media?: MediaItem[]
  tags?: string[]
}

export async function createPost(input: PostInput): Promise<Post> {
  const item = await post<FeedItem>('/posts', input)
  invalidate()
  return item.post
}

export async function updatePost(postId: string, body: string, tags?: string[]): Promise<void> {
  await patch(`/posts/${encodeURIComponent(postId)}`, { body, tags })
  invalidate()
}

export async function deletePost(postId: string): Promise<void> {
  await del(`/posts/${encodeURIComponent(postId)}`)
  invalidate()
}

export async function toggleLike(postId: string): Promise<void> {
  await post(`/posts/${encodeURIComponent(postId)}/like`)
  invalidate()
}

/* -------------------------------------------------------------- comments */

export async function listComments(postId: string): Promise<Comment[]> {
  return get<Comment[]>(`/posts/${encodeURIComponent(postId)}/comments`)
}

export async function addComment(postId: string, body: string): Promise<Comment> {
  const comment = await post<Comment>(`/posts/${encodeURIComponent(postId)}/comments`, { body })
  invalidate()
  return comment
}

export async function deleteComment(commentId: string): Promise<void> {
  await del(`/comments/${encodeURIComponent(commentId)}`)
  invalidate()
}

export async function toggleCommentLike(commentId: string): Promise<void> {
  await post(`/comments/${encodeURIComponent(commentId)}/like`)
  invalidate()
}

/* ----------------------------------------------------------------- lists */

/**
 * Throws rather than returning null when the list is missing or private: the
 * two cases read differently to the person looking at them, and only the
 * server's answer can tell them apart.
 */
export async function getList(id: string): Promise<VenueList> {
  return get<VenueList>(`/lists/${encodeURIComponent(id)}`)
}

export async function listListsByUser(ownerId: string): Promise<VenueList[]> {
  return get<VenueList[]>(`/users/${encodeURIComponent(ownerId)}/lists`)
}

export interface ListInput {
  name: string
  description?: string
  emoji?: string
  isPublic?: boolean
  venueIds?: string[]
}

export async function createList(input: ListInput): Promise<VenueList> {
  const list = await post<VenueList>('/lists', input)
  invalidate()
  return list
}

export async function updateList(listId: string, body: Partial<ListInput>): Promise<VenueList> {
  const list = await patch<VenueList>(`/lists/${encodeURIComponent(listId)}`, body)
  invalidate()
  return list
}

export async function deleteList(listId: string): Promise<void> {
  await del(`/lists/${encodeURIComponent(listId)}`)
  invalidate()
}

/** Add/remove in one call; resolves true when the venue ends up in the list. */
export async function toggleVenueInList(listId: string, venueId: string): Promise<boolean> {
  const { inList } = await post<{ inList: boolean; list: VenueList }>(
    `/lists/${encodeURIComponent(listId)}/venues/${encodeURIComponent(venueId)}`,
  )
  invalidate()
  return inList
}

export async function reorderList(
  listId: string,
  venueId: string,
  direction: -1 | 1,
): Promise<void> {
  await post(`/lists/${encodeURIComponent(listId)}/reorder`, { venueId, direction })
  invalidate()
}

/* ---------------------------------------------------------------- search */

export interface SearchResults {
  venues: RankedVenue[]
  users: User[]
  posts: FeedItem[]
  lists: VenueList[]
}

const EMPTY_RESULTS: SearchResults = { venues: [], users: [], posts: [], lists: [] }

export async function search(query: string, origin?: Coords | null): Promise<SearchResults> {
  if (!query.trim()) return EMPTY_RESULTS
  return get<SearchResults>('/search', { q: query, lat: origin?.lat, lng: origin?.lng })
}

/* ----------------------------------------------------------------- admin */

/** Restore the seeded demo data, dropping every uploaded photo and video. */
export async function resetDemoData(): Promise<void> {
  await post('/admin/reset')
  invalidate()
}
