/**
 * Railbird — shared domain model.
 * Every module in the app agrees on the shapes in this file.
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

export interface RoleMeta {
  id: Role
  label: string
  emoji: string
  /** Roles that describe a job at a room rather than a way of playing. */
  staff: boolean
  blurb: string
}

export const ROLES: RoleMeta[] = [
  { id: 'cash-player',        label: 'Cash Player',        emoji: '💵', staff: false, blurb: 'Ring games are home.' },
  { id: 'tournament-player',  label: 'Tournament Player',  emoji: '🏆', staff: false, blurb: 'Bag and tag.' },
  { id: 'pro',                label: 'Pro',                emoji: '♠️', staff: false, blurb: 'Poker pays the bills.' },
  { id: 'recreational',       label: 'Recreational',       emoji: '🎉', staff: false, blurb: 'Here for a good time.' },
  { id: 'dealer',             label: 'Dealer',             emoji: '🃏', staff: true,  blurb: 'Shuffle up and deal.' },
  { id: 'floor-supervisor',   label: 'Floor Supervisor',   emoji: '🛎️', staff: true,  blurb: 'Runs the room.' },
  { id: 'tournament-director',label: 'Tournament Director',emoji: '📋', staff: true,  blurb: 'Sets the structure.' },
  { id: 'streamer',           label: 'Streamer',           emoji: '🎥', staff: false, blurb: 'Live on stream.' },
  { id: 'vlogger',            label: 'Vlogger',            emoji: '📹', staff: false, blurb: 'Documents the grind.' },
  { id: 'coach',              label: 'Coach',              emoji: '🎓', staff: false, blurb: 'Teaches the game.' },
  { id: 'reporter',           label: 'Reporter',           emoji: '📰', staff: false, blurb: 'Covers the circuit.' },
  { id: 'staker',             label: 'Staker / Backer',    emoji: '🤝', staff: false, blurb: 'Puts players in.' },
  { id: 'home-game-host',     label: 'Home Game Host',     emoji: '🏠', staff: false, blurb: 'Runs the local game.' },
]

export const ROLE_BY_ID: Record<Role, RoleMeta> = Object.fromEntries(
  ROLES.map((r) => [r.id, r]),
) as Record<Role, RoleMeta>

/* ------------------------------------------------------------------ users */

/**
 * Avatars take one of the four palette colours rather than a point on a hue
 * wheel, so no profile can introduce a colour the rest of the app does not use.
 */
export type AvatarTone = 'blue' | 'slate' | 'mist' | 'night'

export const AVATAR_TONES: { id: AvatarTone; label: string }[] = [
  { id: 'blue', label: 'Blue' },
  { id: 'slate', label: 'Slate' },
  { id: 'mist', label: 'Mist' },
  { id: 'night', label: 'Night' },
]

/**
 * Profile photos are cropped square and shrunk before they are kept, so one
 * costs tens of KB — small enough to live on the user record (see
 * makeAvatarPhoto in lib/media.ts for why they are not in IndexedDB).
 */
export const AVATAR_PHOTO = {
  /** Output edge in pixels: an 88px profile avatar at 3x, with headroom. */
  edge: 320,
  /** Hard ceiling on the stored data URI, enforced by the API. */
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

export const GAME_LABELS: Record<GameType, string> = {
  'nlhe': 'No Limit Hold’em',
  'plo': 'Pot Limit Omaha',
  'plo5': '5-Card PLO',
  'limit-holdem': 'Limit Hold’em',
  'stud': 'Stud',
  'mixed': 'Mixed Games',
  'tournaments': 'Tournaments',
  'bomb-pots': 'Bomb Pots',
}

export type Amenity =
  | 'food-service' | 'comps' | 'high-limit' | 'bad-beat-jackpot' | 'free-parking'
  | 'valet' | 'open-24h' | 'waitlist-app' | 'massage' | 'smoking-area' | 'sportsbook' | 'hotel'

export const AMENITY_LABELS: Record<Amenity, string> = {
  'food-service': 'Table-side food',
  'comps': 'Comps / rate',
  'high-limit': 'High limit room',
  'bad-beat-jackpot': 'Bad beat jackpot',
  'free-parking': 'Free parking',
  'valet': 'Valet',
  'open-24h': 'Open 24h',
  'waitlist-app': 'Waitlist app',
  'massage': 'Massage',
  'smoking-area': 'Smoking area',
  'sportsbook': 'Sportsbook',
  'hotel': 'Hotel on site',
}

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

export const SUBSCORE_META: { key: keyof Subscores; label: string; hint: string }[] = [
  { key: 'gameQuality',       label: 'Game Quality',       hint: 'How good are the games?' },
  { key: 'tableAvailability', label: 'Table Availability',  hint: 'How long is the wait?' },
  { key: 'dealers',           label: 'Dealers',             hint: 'Speed and accuracy.' },
  { key: 'comps',             label: 'Comps & Rate',        hint: 'What you get back.' },
  { key: 'atmosphere',        label: 'Atmosphere',          hint: 'Room, staff, vibe.' },
  { key: 'value',             label: 'Rake Value',          hint: 'Is the rake fair?' },
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
 * An attachment's metadata. Deliberately holds no bytes: photos and videos are
 * far too large for the localStorage document, so the pixels live in IndexedDB
 * under `id` and are resolved at render time (see lib/media.ts). Seeded demo
 * media is the exception — it is a handful of bytes of inline SVG, so it rides
 * along in `dataUri` and needs no blob store at all.
 */
export interface MediaItem {
  id: string
  kind: MediaKind
  mime: string
  /** Inline source for seeded demo media; null when the bytes are in IndexedDB. */
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

/** Attachment limits, enforced in lib/media.ts and surfaced in the composer. */
export const MEDIA_LIMITS = {
  perPost: 4,
  imageBytes: 12 * 1024 * 1024,
  videoBytes: 100 * 1024 * 1024,
  /** Long edge, in pixels; larger images are downscaled before storing. */
  maxImageEdge: 1600,
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

/** A post plus everything the UI needs to render it without extra lookups. */
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

/** A named place the user can rank "near me" against. */
export interface Metro {
  id: string
  label: string
  lat: number
  lng: number
}

export const METROS: Metro[] = [
  { id: 'las-vegas',    label: 'Las Vegas, NV',     lat: 36.1147, lng: -115.1728 },
  { id: 'los-angeles',  label: 'Los Angeles, CA',   lat: 34.0522, lng: -118.2437 },
  { id: 'atlantic-city',label: 'Atlantic City, NJ', lat: 39.3643, lng: -74.4229 },
  { id: 'south-florida',label: 'South Florida',     lat: 26.1224, lng: -80.1373 },
  { id: 'texas',        label: 'Dallas / Houston',  lat: 32.7767, lng: -96.7970 },
  { id: 'northeast',    label: 'Philadelphia, PA',  lat: 39.9526, lng: -75.1652 },
  { id: 'midwest',      label: 'Chicago, IL',       lat: 41.8781, lng: -87.6298 },
  { id: 'northwest',    label: 'Seattle, WA',       lat: 47.6062, lng: -122.3321 },
]
