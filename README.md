# ♠ Railbird

A social network for poker players to post about, review, and rank card rooms and casinos.

Railbird is a **local-first** React app: every user, post, rating, comment and list lives in your
browser's `localStorage`, seeded with 34 real US card rooms and 14 demo accounts. Nothing is
uploaded anywhere, and there is no server to run.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # 285 assertions across 6 suites
```

---

## The five tabs

| Tab | Icon | Route | What it does |
| --- | --- | --- | --- |
| **Feed** | ♥ | `/` | Posts from the people you follow, with a Discover tab for everything else |
| **Rankings** | ♣ | `/rankings` | Leaderboard of rooms near you — switch between **list** and **map** |
| **Search** | ♦ | `/search` | Rooms, people, posts and lists in one search |
| **Post** | ♠ | `/compose` | Write a post, rate a room, or log a session |
| **Profile** | your photo | `/profile` | Your posts, ratings and lists — edit profile, photo, roles and privacy |

## Features

- **Post, comment, like** — three post kinds (plain text, a room rating, a logged session with
  stakes / hours / net result). Edit and delete your own posts and comments; like anything.
- **Photos and video** — attach up to 4 per post, of any kind. Tap one to open a full-screen viewer
  with keyboard navigation. Photos take alt text; videos get a poster frame grabbed from the clip
  and a duration badge. A photo on its own is a valid post — no caption required.
- **Rate rooms on six dimensions** — game quality, table availability, dealers, comps, atmosphere
  and rake value. The overall score is the mean of the six, so the headline number can never
  disagree with the breakdown. One rating per person per room; re-rating replaces the old one.
- **Profile photos** — upload one from *Edit profile*. It is cropped to a square from the center,
  shrunk to 320px, and shown everywhere you appear: posts, comments, follower lists, and the Profile
  tab in the nav bar. Without a photo, your initials sit on the colour you pick.
- **Roles on your profile** — 13 of them, from *Cash Player* and *Tournament Player* to *Dealer*,
  *Floor Supervisor*, *Vlogger*, *Coach*, *Staker* and *Home Game Host*. Staff roles are styled
  distinctly so you can tell who works in the room from who plays in it.
- **Map of every room with its rating** — Leaflet + OpenStreetMap, one pin per room coloured by
  room type — casino blue, card room slate — and labelled with its score. The map and the list
  read from the same filtered set, so toggling between them never changes which rooms you see.
- **Private profiles** — flip your account to private and new followers need approval. Approved
  followers see your posts, ratings and lists; everyone else sees a locked profile. Pending
  requests surface as a badge on the Profile tab.
- **Public and private lists** — curate ranked lists of rooms ("Vegas $2/$5, ranked", "Real PLO
  Games Only"), reorder them by hand, and toggle each one between public and private.

## Palette

The whole UI is built from four colours:

| | Hex | Role |
| --- | --- | --- |
| Night | `#0D1117` | Page and surfaces in dark theme; text in light |
| Mist | `#E4E6EB` | Text in dark theme; cards in light |
| Blue | `#3B82F6` | The accent — primary buttons, active states, stars, scores, links |
| Slate | `#8B949E` | Secondary text, card rooms, quiet UI |

Every other colour in the stylesheets is a `color-mix()` of those four, defined once as tokens in
`src/index.css`: surfaces are night lifted toward mist, borders are slate sunk into night, and so on.
Blue has two tokens — `--accent` for fills and `--accent-text` for blue that has to be read, tuned per
theme to hold WCAG AA on the tinted surfaces it sits on (pure `#3B82F6` is 5.1:1 on night but under
4:1 on an active chip). Text on a blue fill is night, because mist on blue is only 2.9:1.

One colour sits deliberately outside the palette: a single alert red (`#EF4444`), used only for
errors, destructive actions and losing sessions. Winning sessions are blue, not green.

Colour carries meaning rather than decoration:

- Rooms are **blue if they are casinos and slate if they are card rooms** — tiles, map pins and the
  map legend all agree. Map tiles render in greyscale so the pins are the only colour on the map.
- Profile banners, and avatars without a photo, take one of four tones, one per palette colour.
- Interface icons (nav, actions, toggles, lock and pin markers) are monochrome SVGs in
  `currentColor`, so they follow the palette and the active state. The nav tabs are the four suits,
  which means hearts and diamonds are not red. Emoji that are content — list icons, role badges,
  empty-state illustrations — keep their own colours, as do profile photos.

The `palette` test suite enforces all of this: it fails on any hex colour that is not one of the
five, any `rgb()`/`hsl()` literal, any named colour, and any `var(--token)` that nothing defines.

## Where the pixels live

Everything else in Railbird sits in one `localStorage` document, but media cannot: a single phone
photo would exhaust the ~5MB quota on its own, and `persist()` swallows the resulting
`QuotaExceededError` — so a post would appear to save and then vanish on reload.

So attachments split in two. The **metadata** (`MediaItem`: id, kind, dimensions, duration, alt
text) rides in the sync store on the post. The **bytes** go to IndexedDB, which holds orders of
magnitude more and stores `Blob`s natively with no base64 inflation. `resolveMediaUrl()` turns an
item into a displayable URL at render time, so every component that shows media handles three
states: resolving, resolved, and gone — that last one is real, since clearing site data wipes the
blobs while the post metadata survives.

Consequences worth knowing:

- Photos are downscaled to 1600px on the long edge before storage (GIFs are left alone so they keep
  animating). Videos are stored as-is, with a poster frame grabbed a hair into the clip.
- Blobs are deleted whenever the thing referencing them goes away: deleting a post, deleting a
  rating that takes its post with it, discarding a composer draft, or resetting the demo data.
  Nothing else points at them, so a missed cleanup would leak silently and forever.
- Where IndexedDB is unavailable (private windows, blocked site data), the store degrades to an
  in-memory map instead of throwing — the app works, but attachments do not survive a reload, and
  the composer says so.
- Seeded demo media is the exception to all of this: it is a few hundred bytes of inline SVG, so it
  lives in `dataUri` and needs no blob store at all.

**Profile photos go the other way**, deliberately. An avatar is drawn on every post, comment and
row, and in the nav bar, so it has to be on hand synchronously — resolving a blob per face would
flash initials on every mount. `makeAvatarPhoto()` crops to a square, shrinks to 320px and encodes a
JPEG (stepping the quality down if it has to), which lands at tens of KB — small enough to live on
the user record as a data URI. The API caps that string at 120,000 characters and only accepts an
inline `data:image/…` URI, never a remote URL. Unlike post photos, there is no "store the original"
fallback: an uncropped phone photo is exactly what the sync store cannot hold.

## Ranking model

`rankVenues()` ranks whatever set you are currently filtered to, so **#1 means "best of what you
are looking at"** — not a fixed global position. Filters compose: radius from your location (device
GPS or a picked metro), casino vs. card room, games spread, amenities, and a minimum review count
to keep thinly-reviewed rooms out of the top three. Unrated rooms always sort last regardless of
the tiebreak direction.

Distance uses a haversine against either your device coordinates (if you grant permission) or the
metro you pick — Vegas, LA, Atlantic City, South Florida, Texas, Philadelphia, Chicago or Seattle.

## Architecture

```
src/
  types.ts              domain model — every module agrees on these shapes
  lib/
    seed.ts             34 real card rooms, 14 users, generated ratings/posts/comments/lists
    storage.ts          the localStorage document + change notification
    api.ts              the ONLY module that touches storage — swap this for a real backend
    media.ts            photo/video ingest + the IndexedDB blob store
    geo.ts              haversine, distance/time/money formatting
  state/AppContext.tsx  current user, location origin, store subscription
  components/           Avatar, StarRating, StarInput, RoleBadge, PostCard, VenueRow,
                        CommentThread, FollowButton, UserRow, ListCard, Modal, NavBar, Icon,
                        MediaGrid (viewer + lightbox), MediaPicker (composer)…
  screens/              one file per route
tests/
  run.mjs               bundles each suite and runs it in a fresh process
  setup.cjs             jsdom + browser globals the app touches
  *.test.ts(x)          the six suites
```

Screens call `api.*` **synchronously during render** and re-render through a `useSyncExternalStore`
subscription (`revision` on `useApp()`). That keeps components free of data-fetching lifecycle, and
it means swapping in a real backend is a rewrite of `api.ts` alone — the screens do not know where
the data comes from.

The seed data is generated from a fixed-seed PRNG with a frozen clock, so the demo dataset is
byte-identical on every machine.

## Tests

```bash
npm test                  # everything
npm test -- navigation    # one suite
```

There is no test framework here on purpose. Each suite is a plain script that counts its own
assertions; the runner bundles it with esbuild — so it imports the app's TypeScript directly — and
runs it in its own node process against a fresh jsdom, so no suite can leak DOM or `localStorage`
state into the next.

| Suite | Assertions | Covers |
| --- | --- | --- |
| `data-layer` | 98 | Ranking, filters and sorts; privacy gating; follow / request / approve; rating upsert and delete; post and comment CRUD with cascades; list CRUD, reorder and visibility; search; profile validation, including which profile photos the API will accept; older saved data loading without a reset |
| `routes` | 23 | Every route mounts with no thrown error and no `console.error`, including not-found and private-account paths |
| `interactions` | 66 | Map toggle mounting Leaflet with markers; like toggling; the full rating flow writing a rating plus its companion post; list privacy toggle; private-profile gating; picking, previewing, saving and removing a profile photo |
| `navigation` | 24 | Which screen a click actually lands on — the nested-clickable cases that are easy to break; the suit icon on each tab and your avatar on Profile |
| `media` | 56 | Attachment ingest and validation, IndexedDB storage and resolution, blob cleanup on every delete path; profile photo crop, resize, quality step-down and refusals |
| `palette` | 18 | Every hex colour is one of the five; no `rgb()`/`hsl()`/named colours; every `var()` resolves to a defined token; seeded users and venues are on-palette |

Several assertions are regressions pinned to specific bugs found during review (the venue-review
privacy leak, the avatar click target, rating scores following the room across a mode change).
Those were each confirmed to fail against the pre-fix code before being kept.

## Notes

- **Theme** — dark by default (it is a poker app; people use it in card rooms at 2am). Light theme
  under Settings → Appearance, applied via `data-theme` on the root element.
- **Reset** — Settings → Your data → *Reset demo data* restores the seeded dataset.
- **Accounts** — `/signin` is a demo account picker. Sign in as `@teddystakes` or `@luzhomegame`
  to see a private account from the inside, or view them from another account to see the lock.
- The room details (rake, table counts, stakes) are plausible demo data for real, public venues,
  not a live feed. Do not plan a trip around them.
