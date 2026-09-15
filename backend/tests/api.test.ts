/**
 * 4suit API — end-to-end tests.
 *
 * There is no test framework here on purpose, matching the client's suites: the
 * file is a plain script that counts its own assertions. It boots a real mongod
 * (mongodb-memory-server, in a temp directory), seeds it, starts the actual
 * Express app on a port and exercises it over HTTP — so what is covered is the
 * API a browser would meet, not the service functions behind it.
 *
 *   npm test
 */
import { MongoMemoryServer } from 'mongodb-memory-server'

const mongo = await MongoMemoryServer.create()
process.env.MONGODB_URI = mongo.getUri()
process.env.MONGODB_DB = '4suit_smoke'
process.env.JWT_SECRET = 'smoke-secret'

const { createApp } = await import('../src/app.js')
const { connect, disconnect } = await import('../src/db/mongo.js')
const { seedIfEmpty } = await import('../src/db/seed.js')

await connect()
await seedIfEmpty()
const server = createApp().listen(4999)
const base = 'http://127.0.0.1:4999/api'

let failures = 0
let checks = 0
const check = (name: string, ok: boolean, extra?: unknown) => {
  checks++
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}`, ok ? '' : extra ?? '')
  if (!ok) failures++
}

const j = async (path: string, init?: RequestInit) => {
  const res = await fetch(base + path, init)
  const body = res.status === 204 ? null : await res.json()
  return { status: res.status, body }
}

const auth = (token: string, init: RequestInit = {}): RequestInit => ({
  ...init,
  headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
})
const json = (body: unknown, init: RequestInit = {}): RequestInit => ({
  ...init,
  method: init.method ?? 'POST',
  headers: { ...(init.headers ?? {}), 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const health = await j('/health')
check('health', health.status === 200 && health.body.ok === true, health)

const accounts = await j('/auth/accounts')
check('14 demo accounts', accounts.body.length === 14, accounts.body.length)

const signin = await j('/auth/signin', json({ userId: 'u-you' }))
check('sign in mints a token', signin.status === 200 && typeof signin.body.token === 'string', signin)
const token = signin.body.token as string

const me = await j('/auth/me', auth(token))
check('me is u-you', me.body.user?.id === 'u-you', me.body)

const venues = await j('/venues')
check('34 venues seeded', venues.body.length === 34, venues.body.length)

const ranked = await j('/venues/rank?lat=36.1147&lng=-115.1728&sort=rating')
check('rank #1 is rank-ordered', ranked.body[0]?.stats.rank === 1, ranked.body[0]?.stats)
check('ranked rows carry distance', typeof ranked.body[0]?.distanceMi === 'number', ranked.body[0]?.distanceMi)
const sorted = ranked.body.every((r: any, i: number, all: any[]) =>
  i === 0 || all[i - 1].stats.average === null || r.stats.average === null
  || all[i - 1].stats.average >= r.stats.average)
check('rating sort is descending', sorted)

const nearFilter = await j('/venues/rank?lat=36.1147&lng=-115.1728&radiusMi=25&sort=distance')
check('radius filter trims the field', nearFilter.body.length < venues.body.length, nearFilter.body.length)

const stats = await j('/venues/v-aria/stats')
check('aria has ratings', stats.body.count > 0 && stats.body.average !== null, stats.body)

const feed = await j('/feed?scope=following', auth(token))
check('following feed is hydrated', feed.body.length > 0 && !!feed.body[0].author.username, feed.body[0])

const anonFeed = await j('/feed?scope=following')
check('anonymous following feed is empty', anonFeed.body.length === 0, anonFeed.body.length)

const discover = await j('/feed?scope=discover', auth(token))
check('discover is wider than following', discover.body.length > feed.body.length, [discover.body.length, feed.body.length])

// u-teddy is a private account u-you has only requested to follow.
const privatePosts = await j('/users/u-teddy/posts', auth(token))
check('private account posts are withheld', privatePosts.body.length === 0, privatePosts.body.length)

const post = await j('/posts', auth(token, json({ kind: 'text', body: 'Smoke test post', tags: ['#test'] })))
check('post created', post.status === 201 && post.body.post.body === 'Smoke test post', post.body)
const postId = post.body.post.id as string
check('tag hash stripped', post.body.post.tags[0] === 'test', post.body.post.tags)

const liked = await j(`/posts/${postId}/like`, auth(token, { method: 'POST' }))
check('like toggles on', liked.body.post.likedBy.includes('u-you'), liked.body.post.likedBy)

const comment = await j(`/posts/${postId}/comments`, auth(token, json({ body: 'Nice hand' })))
check('comment added', comment.status === 201, comment.body)

const hydrated = await j(`/posts/${postId}`, auth(token))
check('comment count on the item', hydrated.body.commentCount === 1, hydrated.body.commentCount)

// Another account must not be able to edit or delete it.
const other = await j('/auth/signin', json({ userId: 'u-marisol' }))
const otherToken = other.body.token as string
const forbidden = await j(`/posts/${postId}`, auth(otherToken, { method: 'DELETE' }))
check('another account cannot delete the post', forbidden.status === 403, forbidden)

const anonPost = await j('/posts', json({ kind: 'text', body: 'nope' }))
check('anonymous posting is refused', anonPost.status === 401, anonPost)

const rating = await j('/ratings', auth(token, json({
  venueId: 'v-aria',
  subscores: { gameQuality: 5, tableAvailability: 4, dealers: 5, comps: 3, atmosphere: 4, value: 3 },
  review: 'Good games.',
  stakesPlayed: '$2/$5',
}, { method: 'PUT' })))
check('rating saved with computed overall', rating.body.overall === 4, rating.body.overall)

const again = await j('/ratings', auth(token, json({
  venueId: 'v-aria',
  subscores: { gameQuality: 1, tableAvailability: 1, dealers: 1, comps: 1, atmosphere: 1, value: 1 },
  review: '', stakesPlayed: '',
}, { method: 'PUT' })))
check('re-rating replaces rather than adds', again.body.id === rating.body.id, [rating.body.id, again.body.id])

const badRating = await j('/ratings', auth(token, json({
  venueId: 'v-aria',
  subscores: { gameQuality: 9, tableAvailability: 1, dealers: 1, comps: 1, atmosphere: 1, value: 1 },
}, { method: 'PUT' })))
check('out-of-range score refused', badRating.status === 400, badRating)

const follow = await j('/users/u-hank/follow', auth(token, { method: 'POST' }))
check('follow a public account', follow.body.state === 'following', follow.body)
const unfollow = await j('/users/u-hank/follow', auth(token, { method: 'POST' }))
check('follow toggles off', unfollow.body.state === 'none', unfollow.body)
const request = await j('/users/u-luz/follow', auth(token, { method: 'POST' }))
check('private account gets a request', request.body.state === 'requested', request.body)

const taken = await j('/users/u-you', auth(token, json({ username: 'marisolplays' }, { method: 'PATCH' })))
check('taken handle refused', taken.status === 400 && /taken/i.test(taken.body.error), taken.body)

const renamed = await j('/users/u-you', auth(token, json({ username: '4suiter2' }, { method: 'PATCH' })))
check('own handle accepted', renamed.status === 200 && renamed.body.username === '4suiter2', renamed.body)

const notMine = await j('/users/u-marisol', auth(token, json({ bio: 'hacked' }, { method: 'PATCH' })))
check('editing another profile refused', notMine.status === 403, notMine)

const search = await j('/search?q=PLO', auth(token))
check('search returns rooms and posts', search.body.venues.length > 0 && search.body.posts.length > 0, {
  venues: search.body.venues.length, posts: search.body.posts.length,
})

const list = await j('/lists', auth(token, json({ name: 'Smoke list', isPublic: false, venueIds: ['v-aria'] })))
check('list created', list.status === 201, list.body)
const listId = list.body.id as string
const otherSeesList = await j(`/lists/${listId}`, auth(otherToken))
check('private list hidden from others', otherSeesList.status === 403, otherSeesList.status)
const toggled = await j(`/lists/${listId}/venues/v-wynn`, auth(token, { method: 'POST' }))
check('venue added to list', toggled.body.inList === true && toggled.body.list.venueIds.length === 2, toggled.body)

const deleted = await j(`/posts/${postId}`, auth(token, { method: 'DELETE' }))
check('own post deleted', deleted.status === 204, deleted.status)
const gone = await j(`/posts/${postId}`, auth(token))
check('deleted post is gone', gone.status === 404, gone.status)

const missing = await j('/venues/nope')
check('unknown room 404s', missing.status === 404, missing.status)

/* ------------------------------------------------------------------ media */

/** The smallest valid PNG: a 1x1 transparent pixel. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const uploadForm = new FormData()
uploadForm.append('file', new Blob([PNG], { type: 'image/png' }), 'pixel.png')
uploadForm.append('width', '1')
uploadForm.append('height', '1')
const uploaded = await fetch(`${base}/media`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: uploadForm,
})
const media = await uploaded.json()
check('upload stored', uploaded.status === 201 && media.kind === 'image', media)
check('upload reports its size', media.byteSize === PNG.length, media.byteSize)

const served = await fetch(`${base}/media/${media.id}`)
const servedBytes = Buffer.from(await served.arrayBuffer())
check('bytes come back unchanged', served.status === 200 && servedBytes.equals(PNG), served.status)
check('served with its own type', served.headers.get('content-type') === 'image/png', served.headers.get('content-type'))

const notAFile = new FormData()
notAFile.append('file', new Blob([Buffer.from('plain text')], { type: 'text/plain' }), 'notes.txt')
const rejected = await fetch(`${base}/media`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: notAFile,
})
check('a text file is refused', rejected.status === 400, rejected.status)

const stealAttempt = await j('/posts', auth(otherToken, json({
  kind: 'text', body: 'not mine', media: [media],
})))
check('another account cannot attach your upload', stealAttempt.status === 403, stealAttempt.status)

const withMedia = await j('/posts', auth(token, json({
  kind: 'text', body: 'With a photo', media: [media],
})))
check('post carries its attachment', withMedia.body.post.media[0]?.id === media.id, withMedia.body.post.media)

const stillReferenced = await j(`/media/${media.id}`, auth(token, { method: 'DELETE' }))
check('an attached file cannot be orphaned', stillReferenced.status === 400, stillReferenced.status)

await j(`/posts/${withMedia.body.post.id}`, auth(token, { method: 'DELETE' }))
const goneBytes = await fetch(`${base}/media/${media.id}`)
check('deleting the post drops its bytes', goneBytes.status === 404, goneBytes.status)

/* ------------------------------------------------------- privacy, in full */

const teddy = await j('/auth/signin', json({ userId: 'u-teddy' }))
const teddyToken = teddy.body.token as string
// u-you has a standing request on u-teddy from the seed data.
const approved = await j('/users/u-teddy/requests/u-you/accept', auth(teddyToken, { method: 'POST' }))
check('request approved', approved.body.followerIds.includes('u-you'), approved.body.followerIds)

const nowVisible = await j('/users/u-teddy/posts', auth(token))
check('approved follower sees the posts', nowVisible.body.length > 0, nowVisible.body.length)

const strangerView = await j('/users/u-teddy/posts')
check('everyone else still cannot', strangerView.body.length === 0, strangerView.body.length)

/* ------------------------------------------------------------ aggregates */

const beforeStats = await j('/venues/v-pompano/stats')
await j('/ratings', auth(teddyToken, json({
  venueId: 'v-pompano',
  subscores: { gameQuality: 5, tableAvailability: 5, dealers: 5, comps: 5, atmosphere: 5, value: 5 },
  review: 'Perfect.', stakesPlayed: '$1/$3',
}, { method: 'PUT' })))
const afterStats = await j('/venues/v-pompano/stats')
check('a new rating moves the room average',
  afterStats.body.count === beforeStats.body.count + 1
  && (beforeStats.body.average === null || afterStats.body.average >= beforeStats.body.average),
  [beforeStats.body, afterStats.body])

server.close()
await disconnect()
await mongo.stop()
console.log(failures === 0
  ? `\n\u2713 ${checks} checks passed`
  : `\n\u2717 ${failures} of ${checks} checks failed`)
process.exit(failures === 0 ? 0 : 1)
