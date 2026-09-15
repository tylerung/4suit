# ♠ 4suit

A social network for poker players to post about, review, and rank card rooms and casinos.

4suit is two pieces: a **React client** and an **Express + MongoDB API**, seeded with 34 real US
card rooms and 14 demo accounts.

```
frontend/   React + TypeScript, built with Vite — the five tabs and everything you see
backend/    Express + TypeScript on MongoDB — the data, the rules, and the uploaded files
```

```bash
npm run install:all           # installs both packages

cp backend/.env.example backend/.env    # then point MONGODB_URI at your database
npm run dev:api               # http://localhost:4000 — seeds itself if the database is empty
npm run dev:web               # http://localhost:5173 — proxies /api to the API

npm test                      # 50 API checks, then 134 browser checks
```

The client needs no configuration in development: with `VITE_API_URL` empty it calls `/api` on its
own origin and the Vite dev server proxies that to the backend. Set `VITE_API_URL` to the API's
public URL when you build for somewhere real.

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

An attachment splits in two. The **metadata** (`MediaItem`: id, kind, dimensions, duration, alt
text) is a small object that rides on the post document. The **bytes** go to GridFS — MongoDB's own
store for files past the 16MB document limit — and are served back from `GET /api/media/:id`, which
is the URL the `<img>` or `<video>` points at.

The client still does the work only a browser can do, before anything is uploaded:

- Photos are downscaled to 1600px on the long edge (GIFs are left alone so they keep animating), so
  a 12MB phone photo does not cross the wire at full size to be resized on arrival.
- Videos are uploaded as-is, with a poster frame grabbed a hair into the clip so the feed has
  something to show before playback starts.
- The size and type rules are checked again on the server. The client's copy exists to fail fast
  with a good message, not to be the thing enforcing them.

Files are deleted whenever the thing referencing them goes away: deleting a post, deleting a rating
that takes its post with it, removing an attachment in the composer, discarding a draft, or
resetting the demo data. Nothing else points at them, so a missed cleanup would leak silently and
forever. An upload that is already on a post cannot be deleted on its own — deleting the post is
what cleans those up, so nobody can punch a hole in a published post. Seeded demo media is the
exception to all of this: it is a few hundred bytes of inline SVG, so it lives in `dataUri` and
needs no blob at all.

**Profile photos go the other way**, deliberately. An avatar is drawn on every post, comment and
row, and in the nav bar, so it has to arrive with the user record rather than as a request per
face. `makeAvatarPhoto()` crops to a square, shrinks to 320px and encodes a JPEG (stepping the
quality down if it has to), which lands at tens of KB — small enough to live on the user document
as a data URI. The API caps that string at 120,000 characters and only accepts an inline
`data:image/…` URI, never a remote URL that would ping someone else's server.

## Ranking model

The leaderboard is computed by the API (`GET /api/venues/rank`), which ranks whatever set you are
currently filtered to, so **#1 means "best of what you
are looking at"** — not a fixed global position. Filters compose: radius from your location (device
GPS or a picked metro), casino vs. card room, games spread, amenities, and a minimum review count
to keep thinly-reviewed rooms out of the top three. Unrated rooms always sort last regardless of
the tiebreak direction.

Distance uses a haversine against either your device coordinates (if you grant permission) or the
metro you pick — Vegas, LA, Atlantic City, South Florida, Texas, Philadelphia, Chicago or Seattle.
Your coordinates are sent as ranking parameters and are not stored.

## Architecture

```
backend/
  src/
    server.ts             boot: connect, seed an empty database, listen
    app.ts                express wiring — CORS, JSON, auth, routes, error handler
    types.ts              domain model, and therefore the wire format
    config/env.ts         every environment value, read once (nothing else touches process.env)
    db/
      mongo.ts            the connection, the collections, the indexes, _id <-> id mapping
      seed-data.ts        34 real card rooms, 14 users, generated ratings/posts/comments/lists
      seed.ts             seed an empty database; reset and reseed on demand
    middleware/           bearer-token auth, error handling
    validation/schemas.ts every shape the API accepts, in one place (zod)
    services/             the rules: privacy, ranking, feeds, ratings, lists, search, media
    routes/               one router per resource, thin — parse, call a service, respond
  tests/
    api.test.ts           50 checks over HTTP against a real mongod
    test-server.ts        the same API, disposable, for the client's suites

frontend/
  src/
    types.ts              the client's copy of the domain model
    lib/
      client.ts           fetch, the bearer token, and what an API error looks like
      api.ts              one function per call — the data layer as the browser sees it
      store.ts            "something changed" notification; every write invalidates
      directory.ts        read-through cache for rooms and accounts (deduped by id)
      media.ts            shrink / probe a picked file, upload it, address it
      geo.ts              haversine, distance/time/money formatting
    hooks/useQuery.ts     fetch on mount, refetch on change, ignore stale answers
    state/AppContext.tsx  current user, location origin, store subscription
    components/           Avatar, StarRating, PostCard, VenueRow, CommentThread, MediaGrid…
    screens/              one file per route
  tests/
    run.mjs               starts the API, bundles each suite, runs it in a fresh process
    harness.tsx           mount, click, settle — the waiting a networked read needs
```

### Where the rules live

Everything that decides *what is true* is in `backend/src/services`: who may see a private account,
how a room's score is averaged, what ranks first, whether a handle is taken, who may delete a post.
The client asks and renders.

That split is the point of the backend. A rule the browser enforces is a rule the browser can also
skip — the previous version shipped every private account's posts to every visitor's tab and then
filtered them in a render function. Now a post nobody is allowed to see is a post that never leaves
the database, and "who is doing this" comes from a signed token rather than from an id in the
request body.

### How a screen reads data

Screens call `useQuery(() => api.something(), [deps], initial)`. It fetches on mount, refetches when
the deps change or a write calls `invalidate()`, and ignores a slow answer that has been overtaken
by a newer one. Writes go through the same `api.*` module and invalidate on success, so liking a
post on the feed updates the count on the post's own screen without the two knowing about each
other.

Two things stay on the client on purpose: **your device's coordinates**, which are sent as ranking
parameters and never stored, and **image work that needs a canvas** — cropping an avatar, shrinking
a photo, grabbing a video's poster frame.

## The API

All routes are under `/api`. Anything that writes needs `Authorization: Bearer <token>`, and the
token's user is the actor — no endpoint takes an actor id from the caller.

| Method | Route | What it does |
| --- | --- | --- |
| `POST` | `/auth/signin` | Take a seat as a demo account; returns a token |
| `GET` | `/auth/me` · `/auth/accounts` | Who the token is · the account picker |
| `GET` | `/users/:id` · `/by-username/:name` · `/lookup?ids=` | Accounts, one or many |
| `PATCH` | `/users/:id` | Edit your own profile (validated server-side) |
| `GET` | `/users/:id/posts` · `/ratings` · `/lists` · `/stats` · `/connections` | A profile's contents, privacy-scoped |
| `POST` | `/users/:id/follow` | Follow, unfollow, or cancel a request — whichever applies |
| `GET` | `/venues` · `/venues/rank` · `/venues/:id/stats` | Rooms, the leaderboard, a room's scores |
| `GET` | `/feed?scope=following\|discover` | The home feed, hydrated |
| `POST` `PATCH` `DELETE` | `/posts` · `/posts/:id` | Your own posts |
| `POST` | `/posts/:id/like` · `/posts/:id/comments` | Like; comment |
| `PUT` `DELETE` | `/ratings` · `/ratings/:id` | One rating per person per room |
| `POST` `PATCH` `DELETE` | `/lists` · `/lists/:id` · `/lists/:id/venues/:venueId` | Curated lists |
| `GET` | `/search?q=` | Rooms, people, posts and lists in one answer |
| `POST` `GET` `DELETE` | `/media` · `/media/:id` | Upload, serve and clean up attachments |
| `POST` | `/admin/reset` | Restore the demo dataset (off in production) |

## Configuration

`backend/.env` holds the secrets and is git-ignored; `backend/.env.example` is the committed
template. Every value in it is a placeholder — point them at real infrastructure before this runs
anywhere but a laptop.

| Variable | Default | Notes |
| --- | --- | --- |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` | An Atlas `mongodb+srv://…` string works as-is |
| `MONGODB_DB` | `4suit` | |
| `PORT` | `4000` | |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated list of allowed browser origins |
| `JWT_SECRET` | dev-only placeholder | Signs session tokens; the server refuses to start in production on the placeholder |
| `JWT_EXPIRES_IN` | `30d` | |
| `SEED_ON_START` | `true` | Only ever writes to an empty database |
| `ALLOW_DB_RESET` | `true` outside production | Gates `POST /api/admin/reset` |
| `MAX_UPLOAD_BYTES` | `104857600` | Hard ceiling on one uploaded file |

`frontend/.env` holds `VITE_API_URL` only. Vite exposes `VITE_`-prefixed variables to the browser,
so nothing secret belongs in it.

## Tests

```bash
npm test                              # both packages
npm --prefix backend test             # the API
npm --prefix frontend test            # the browser suites
npm --prefix frontend test -- routes  # one suite
```

There is no test framework here on purpose. Each suite is a plain script that counts its own
assertions.

The API suite boots a real mongod (`mongodb-memory-server`, in a temp directory), seeds it, starts
the actual Express app and exercises it over HTTP — so what is covered is the API a browser would
meet, not the service functions behind it.

The browser suites do the same thing from the other side: the runner starts that same disposable
API, then bundles each suite with esbuild and runs it in its own node process against a fresh
jsdom. Nothing is stubbed in place of the server, because a stub is a second implementation of the
rules that can pass while the real one is broken.

| Suite | Checks | Covers |
| --- | --- | --- |
| `backend/api` | 50 | Ranking, filters and distance; privacy gating for feeds, posts, ratings and lists; follow / request / approve; rating upsert with a server-computed overall; ownership on every write; upload, serve and cleanup of attachments; validation refusals |
| `routes` | 23 | Every route mounts with no thrown error and no `console.error`, including not-found and private-account paths |
| `interactions` | 69 | Map toggle mounting Leaflet with markers; like toggling; the full rating flow writing a rating plus its companion post; list privacy toggle checked against a stranger's own request; private-profile gating; uploading and attaching a photo; picking, previewing, saving and removing a profile photo |
| `navigation` | 24 | Which screen a click actually lands on — the nested-clickable cases that are easy to break; the suit icon on each tab and your avatar on Profile |
| `palette` | 18 | Every hex colour is one of the five; no `rgb()`/`hsl()`/named colours; every `var()` resolves to a defined token; the accounts and rooms the API serves are on-palette |

Several assertions are regressions pinned to specific bugs found during review (the venue-review
privacy leak, the avatar click target, rating scores following the room across a mode change).
Those were each confirmed to fail against the pre-fix code before being kept.

## Notes

- **Theme** — dark by default (it is a poker app; people use it in card rooms at 2am). Light theme
  under Settings → Appearance, applied via `data-theme` on the root element.
- **Reset** — Settings → Your data → *Reset demo data* restores the seeded dataset for everyone,
  since the data is now the server's. The route is disabled in production.
- **Accounts** — `/signin` is a demo account picker. Sign in as `@teddystakes` or `@luzhomegame`
  to see a private account from the inside, or view them from another account to see the lock.
- The room details (rake, table counts, stakes) are plausible demo data for real, public venues,
  not a live feed. Do not plan a trip around them.
