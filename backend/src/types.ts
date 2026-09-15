/**
 * 4suit — server-side domain model.
 *
 * The client keeps a matching copy in `frontend/src/types.ts`: these shapes are
 * the wire format, so a change here is a change there. What lives on the client
 * and not here is purely presentational (role labels, amenity labels, the metro
 * picker); what lives here and not there is validation vocabulary.
 */

/* ------------------------------------------------------------------ roles */

export type Role =
  | 'cash-player'
  | 'tournament-player'
  | 'pro'
  | 'recreational'
  | 'dealer'
  | 'floor-supervisor'
  | 'tournament-director'
  | 'streamer'
  | 'vlogger'
  | 'coach'
  | 'reporter'
  | 'staker'
  | 'home-game-host'

export const ROLE_IDS: Role[] = [
  'cash-player', 'tournament-player', 'pro', 'recreational', 'dealer',
  'floor-supervisor', 'tournament-director', 'streamer', 'vlogger', 'coach',
  'reporter', 'staker', 'home-game-host',
]

/* ------------------------------------------------------------------ users */

export type AvatarTone = 'blue' | 'slate' | 'mist' | 'night'

export const AVATAR_TONE_IDS: AvatarTone[] = ['blue', 'slate', 'mist', 'night']

/**
 * Profile photos are cropped square and shrunk by the client before upload, so
 * one costs tens of KB — small enough to live on the user document as a data
 * URI rather than in the blob store.
 */
export const AVATAR_PHOTO = {
  /** Output edge in pixels: an 88px profile avatar at 3x, with headroom. */
  edge: 320,
  /** Hard ceiling on the stored data URI, enforced on every write. */
  maxChars: 120_000,
} as const

export interface User {
  id: string
  username: string
  displayName: string
  bio: string
  avatarTone: AvatarTone
  /** Square JPEG data URI; null shows initials on `avatarTone` instead. */
  avatarPhoto: string | null
  roles: Role[]
  homeVenueId: string | null
  location: string
  /** When true, only approved followers can see posts, lists and stats. */
  isPrivate: boolean
  followingIds: string[]
  followerIds: string[]
  /** Ids of users who have asked to follow this (private) account. */
  pendingFollowerIds: string[]
  /** Ids of private accounts this user has asked to follow. */
  pendingFollowingIds: string[]
  joinedAt: string
  verified: boolean
}

/* ----------------------------------------------------------------- venues */

export type VenueType = 'casino' | 'cardroom'

export type GameType =
  | 'nlhe' | 'plo' | 'plo5' | 'limit-holdem' | 'stud' | 'mixed' | 'tournaments' | 'bomb-pots'

export const GAME_TYPES: GameType[] = [
  'nlhe', 'plo', 'plo5', 'limit-holdem', 'stud', 'mixed', 'tournaments', 'bomb-pots',
]

export type Amenity =
  | 'food-service' | 'comps' | 'high-limit' | 'bad-beat-jackpot' | 'free-parking'
  | 'valet' | 'open-24h' | 'waitlist-app' | 'massage' | 'smoking-area' | 'sportsbook' | 'hotel'

export const AMENITIES: Amenity[] = [
  'food-service', 'comps', 'high-limit', 'bad-beat-jackpot', 'free-parking', 'valet',
  'open-24h', 'waitlist-app', 'massage', 'smoking-area', 'sportsbook', 'hotel',
]

export interface Venue {
  id: string
  name: string
  type: VenueType
  address: string
  city: string
  state: string
  lat: number
  lng: number
  tableCount: number
  games: GameType[]
  /** Human readable stakes, e.g. "$1/$3 NLHE". */
  stakes: string[]
  rake: string
  amenities: Amenity[]
  hours: string
  website: string
  /** Short editorial description. */
  blurb: string
}

/* ---------------------------------------------------------------- ratings */

/** The six dimensions every rating scores, each 1-5. */
export interface Subscores {
  gameQuality: number
  tableAvailability: number
  dealers: number
  comps: number
  atmosphere: number
  value: number
}

export const SUBSCORE_KEYS: (keyof Subscores)[] = [
  'gameQuality', 'tableAvailability', 'dealers', 'comps', 'atmosphere', 'value',
]

export interface Rating {
  id: string
  userId: string
  venueId: string
  /** 1-5, one decimal. */
  overall: number
  subscores: Subscores
  review: string
  /** Stakes the rater was playing, free text. */
  stakesPlayed: string
  createdAt: string
}

/* ------------------------------------------------------------------ posts */

export type PostKind = 'text' | 'rating' | 'session'

export interface SessionResult {
  stakes: string
  hours: number
  /** Net result in dollars; may be negative. */
  net: number
}

/* ------------------------------------------------------------------ media */

export type MediaKind = 'image' | 'video'

/**
 * An attachment's metadata. Holds no bytes: the pixels live in GridFS under
 * `id` and are served from GET /api/media/:id. Seeded demo media is the
 * exception — it is a handful of bytes of inline SVG, so it rides along in
 * `dataUri` and needs no blob at all.
 */
export interface MediaItem {
  id: string
  kind: MediaKind
  mime: string
  /** Inline source for seeded demo media; null when the bytes are in GridFS. */
  dataUri: string | null
  width: number
  height: number
  /** Videos only. */
  durationSec: number | null
  /** Video poster frame, as a small data URI. */
  posterUri: string | null
  byteSize: number
  /** Describes the image for screen readers; empty is allowed but discouraged. */
  alt: string
}

/** Attachment limits. The client pre-checks them; the server is the authority. */
export const MEDIA_LIMITS = {
  perPost: 4,
  imageBytes: 12 * 1024 * 1024,
  videoBytes: 100 * 1024 * 1024,
  /** Long edge, in pixels; larger images are downscaled by the client. */
  maxImageEdge: 1600,
  /** Ceiling on a video poster frame, which rides inline on the metadata. */
  posterMaxChars: 400_000,
} as const

export interface Post {
  id: string
  authorId: string
  kind: PostKind
  body: string
  venueId: string | null
  /** Set when kind === 'rating'. */
  ratingId: string | null
  /** Set when kind === 'session'. */
  session: SessionResult | null
  /** Photos and videos attached to the post, in display order. */
  media: MediaItem[]
  tags: string[]
  createdAt: string
  likedBy: string[]
}

export interface Comment {
  id: string
  postId: string
  authorId: string
  body: string
  createdAt: string
  likedBy: string[]
}

/* ------------------------------------------------------------------ lists */

export interface VenueList {
  id: string
  ownerId: string
  name: string
  description: string
  venueIds: string[]
  isPublic: boolean
  emoji: string
  createdAt: string
  updatedAt: string
}

/* ------------------------------------------------- derived / view models */

export interface VenueStats {
  venueId: string
  /** Mean of every rating's overall, or null when unrated. */
  average: number | null
  count: number
  /** Mean of each subscore across all ratings. */
  subscores: Subscores | null
  /** 1-indexed position in the currently applied leaderboard ordering. */
  rank: number
}

export interface RankedVenue {
  venue: Venue
  stats: VenueStats
  /** Miles from the active location, or null when unknown. */
  distanceMi: number | null
}

/** A post plus everything the client needs to render it without extra calls. */
export interface FeedItem {
  post: Post
  author: User
  venue: Venue | null
  rating: Rating | null
  commentCount: number
  likedByMe: boolean
}

export interface Coords {
  lat: number
  lng: number
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

export type FollowState = 'self' | 'following' | 'requested' | 'none'

export type FeedScope = 'following' | 'discover'

export type VenueSort = 'rating' | 'distance' | 'reviews' | 'name'

export interface SearchResults {
  venues: RankedVenue[]
  users: User[]
  posts: FeedItem[]
  lists: VenueList[]
}
