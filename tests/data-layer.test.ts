// Runtime smoke test for the Railbird data layer. Bundled with esbuild, run in node.
import * as api from '../src/lib/api'
import { KEY, freshDB } from '../src/lib/storage'
import { AVATAR_PHOTO, METROS, SUBSCORE_META } from '../src/types'
import type { Subscores, User } from '../src/types'
import { reportResult } from './report'

let failures = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name} ${detail}`)
  }
}

console.log('\n— a document saved before profile photos —')
// Must run before anything touches the store, so this is the first read.
const beforePhotos = freshDB()
const originalBio = beforePhotos.users[0].bio
beforePhotos.users[0].bio = 'saved before photos existed'
for (const u of beforePhotos.users) delete (u as Partial<User>).avatarPhoto
localStorage.setItem(KEY, JSON.stringify(beforePhotos))
check('it is kept, not thrown away and reseeded',
  api.listUsers()[0].bio === 'saved before photos existed', api.listUsers()[0].bio)
check('its users are backfilled with no photo',
  api.listUsers().every((u) => u.avatarPhoto === null))
api.updateProfile(api.listUsers()[0].id, { bio: originalBio })

console.log('\n— seed —')
const venues = api.listVenues()
const users = api.listUsers()
check('34 venues seeded', venues.length === 34, `got ${venues.length}`)
check('14 users seeded', users.length === 14, `got ${users.length}`)
check('current user is @railbirder', api.getCurrentUser()?.username === 'railbirder')
check('every venue has coords', venues.every((v) => Number.isFinite(v.lat) && Number.isFinite(v.lng)))
check('every venue is a casino or a card room',
  venues.every((v) => v.type === 'casino' || v.type === 'cardroom'))
check('follow graph is symmetric', users.every((u) =>
  u.followingIds.every((id) => api.getUser(id)?.followerIds.includes(u.id))))

console.log('\n— ranking —')
const vegas = METROS[0]
const all = api.rankVenues({ origin: vegas })
check('ranks every venue', all.length === 34, `got ${all.length}`)
check('rank is 1..n in order', all.every((r, i) => r.stats.rank === i + 1))
check('sorted by average desc', all.every((r, i) =>
  i === 0 || (all[i - 1].stats.average ?? -1) >= (r.stats.average ?? -1)))
check('distance computed from origin', all.every((r) => r.distanceMi !== null))
const near = api.rankVenues({ origin: vegas, radiusMi: 50 })
check('radius filter narrows the set', near.length > 0 && near.length < 34, `got ${near.length}`)
check('radius filter respects the bound', near.every((r) => (r.distanceMi ?? 0) <= 50))
check('radius result re-ranks from 1', near[0].stats.rank === 1)
const byDist = api.rankVenues({ origin: vegas, sort: 'distance' })
check('distance sort is ascending', byDist.every((r, i) =>
  i === 0 || (byDist[i - 1].distanceMi ?? 0) <= (r.distanceMi ?? 0)))
const cardrooms = api.rankVenues({ type: 'cardroom' })
check('type filter works', cardrooms.length > 0 && cardrooms.every((r) => r.venue.type === 'cardroom'))
const plo = api.rankVenues({ games: ['plo5'] })
check('game filter works', plo.length > 0 && plo.every((r) => r.venue.games.includes('plo5')))
check('text filter works', api.rankVenues({ text: 'bellagio' }).length === 1)

console.log('\n— privacy —')
const teddy = api.getUserByUsername('teddystakes')!
const marisol = api.getUserByUsername('marisolplays')!
const me = api.getCurrentUser()!
check('teddy is private', teddy.isPrivate)
check('private profile hidden from non-follower', !api.canViewProfile(me.id, teddy.id))
check('public profile visible', api.canViewProfile(me.id, marisol.id))
check('owner sees own private profile', api.canViewProfile(teddy.id, teddy.id))
check('private posts withheld', api.listPostsByUser(teddy.id, me.id).length === 0)
check('private posts visible to owner', api.listPostsByUser(teddy.id, teddy.id).length > 0)
check('discover feed excludes private non-followed',
  api.listFeed(me.id, 'discover').every((f) => f.author.id !== teddy.id))

console.log('\n— follow flow —')
const before = api.followState(me.id, teddy.id)
check('pre-existing request to private acct', before === 'requested', `got ${before}`)
check('cancel request returns none', api.toggleFollow(me.id, teddy.id) === 'none')
check('re-request returns requested', api.toggleFollow(me.id, teddy.id) === 'requested')
api.acceptFollowRequest(teddy.id, me.id)
check('accepted becomes following', api.followState(me.id, teddy.id) === 'following')
check('accepted clears the pending list', !api.getUser(teddy.id)!.pendingFollowerIds.includes(me.id))
check('approved follower can now see posts', api.canViewProfile(me.id, teddy.id))
check('unfollow returns none', api.toggleFollow(me.id, teddy.id) === 'none')
check('public follow is immediate', api.toggleFollow(me.id, marisol.id) === 'none')
check('re-follow public is immediate', api.toggleFollow(me.id, marisol.id) === 'following')

console.log('\n— ratings —')
const aria = venues.find((v) => v.id === 'v-aria')!
const subs: Subscores = {
  gameQuality: 5, tableAvailability: 4, dealers: 5, comps: 3, atmosphere: 4, value: 3,
}
check('SUBSCORE_META covers every key',
  SUBSCORE_META.length === 6 && SUBSCORE_META.every((m) => m.key in subs))
const hadSeedRating = api.getMyRating(me.id, aria.id) !== null
check('seed already rated ARIA as this user', hadSeedRating)
const statsBefore = api.getVenueStats(aria.id)
const r1 = api.saveRating(me.id, { venueId: aria.id, subscores: subs, review: 'Test', stakesPlayed: '$1/$3 NLHE' })
check('overall is the mean of subscores', r1.overall === 4, `got ${r1.overall}`)
check('upsert over a seed rating keeps the count', api.getVenueStats(aria.id).count === statsBefore.count)
const r2 = api.saveRating(me.id, {
  venueId: aria.id,
  subscores: { ...subs, comps: 5, value: 5 },
  review: 'Revised', stakesPlayed: '$2/$5 NLHE',
})
check('re-rating upserts, does not duplicate', api.getVenueStats(aria.id).count === statsBefore.count)
check('re-rating keeps the same id', r1.id === r2.id)
check('re-rating recomputes overall', r2.overall > r1.overall, `r1=${r1.overall} r2=${r2.overall}`)
check('returned rating is not aliased to the store', api.getMyRating(me.id, aria.id) !== r2)
check('getMyRating finds it', api.getMyRating(me.id, aria.id)?.id === r1.id)
api.deleteRating(r1.id)
check('delete removes one rating', api.getVenueStats(aria.id).count === statsBefore.count - 1)
check('deleted rating is gone', api.getMyRating(me.id, aria.id) === null)

console.log('\n— posts & comments —')
const p = api.createPost(me.id, { kind: 'text', body: 'smoke test post', tags: ['#test', 'plo'] })
check('tags are normalised', p.tags.join(',') === 'test,plo', p.tags.join(','))
check('post appears in own feed', api.listFeed(me.id, 'following').some((f) => f.post.id === p.id))
api.toggleLike(p.id, marisol.id)
check('like registers', api.getPost(p.id)!.likedBy.includes(marisol.id))
api.toggleLike(p.id, marisol.id)
check('unlike registers', !api.getPost(p.id)!.likedBy.includes(marisol.id))
const c = api.addComment(p.id, marisol.id, 'nice')
check('comment attaches', api.listComments(p.id).some((x) => x.id === c.id))
check('hydrate counts comments', api.hydratePost(api.getPost(p.id)!, me.id)!.commentCount === 1)
api.updatePost(p.id, 'edited body')
check('post edit persists', api.getPost(p.id)!.body === 'edited body')
api.deletePost(p.id)
check('delete removes the post', api.getPost(p.id) === null)
check('delete cascades to comments', api.listComments(p.id).length === 0)

console.log('\n— lists —')
const l = api.createList(me.id, { name: 'Smoke list', isPublic: false, venueIds: ['v-aria'] })
check('list created private by request', !l.isPublic)
check('private list hidden from others', !api.canViewList(api.getList(l.id)!, marisol.id))
check('private list visible to owner', api.canViewList(api.getList(l.id)!, me.id))
check("owner's private list excluded from others' view",
  !api.listListsByUser(me.id, marisol.id).some((x) => x.id === l.id))
api.updateList(l.id, { isPublic: true })
check('made public, now visible', api.canViewList(api.getList(l.id)!, marisol.id))
check('toggle adds a venue', api.toggleVenueInList(l.id, 'v-wynn') === true)
check('list has 2 venues', api.getList(l.id)!.venueIds.length === 2)
api.reorderList(l.id, 'v-wynn', -1)
check('reorder moves it up', api.getList(l.id)!.venueIds[0] === 'v-wynn')
api.reorderList(l.id, 'v-wynn', -1)
check('reorder at the edge is a no-op', api.getList(l.id)!.venueIds[0] === 'v-wynn')
check('toggle removes a venue', api.toggleVenueInList(l.id, 'v-wynn') === false)
api.deleteList(l.id)
check('list deleted', api.getList(l.id) === null)

console.log('\n— search —')
const s = api.search('plo', me.id, vegas)
check('search finds rooms', s.venues.length > 0)
check('search finds people', s.users.length > 0)
check('search finds posts', s.posts.length > 0)
check('empty query returns nothing', api.search('  ', me.id).venues.length === 0)
const byHandle = api.search('marisolplays', me.id)
check('exact handle ranks first', byHandle.users[0]?.username === 'marisolplays')
check('search excludes private authors',
  api.search('the', teddy.id === me.id ? 'x' : me.id).posts.every((f) => api.canViewProfile(me.id, f.author.id)))

console.log('\n— profile validation —')
check('rejects a short username', api.updateProfile(me.id, { username: 'ab' }) !== null)
check('rejects a taken username', api.updateProfile(me.id, { username: 'marisolplays' }) !== null)
check('rejects an empty display name', api.updateProfile(me.id, { displayName: '  ' }) !== null)
check('accepts a valid change', api.updateProfile(me.id, { username: 'railbirder2' }) === null)
check('username actually changed', api.getCurrentUser()!.username === 'railbirder2')

console.log('\n— profile photos —')
{
  const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
  check('nobody starts with a photo', users.every((u) => u.avatarPhoto === null))
  check('accepts an inline JPEG', api.updateProfile(me.id, { avatarPhoto: PHOTO }) === null)
  check('the photo is stored on the user', api.getUser(me.id)!.avatarPhoto === PHOTO)
  check('rejects a remote URL',
    api.updateProfile(me.id, { avatarPhoto: 'https://example.com/me.jpg' }) !== null)
  check('rejects a javascript: URL',
    api.updateProfile(me.id, { avatarPhoto: 'javascript:alert(1)' }) !== null)
  check('rejects a data URI that is not an image',
    api.updateProfile(me.id, { avatarPhoto: 'data:text/html;base64,PGgxPg==' }) !== null)
  check('rejects a photo over the size ceiling', api.updateProfile(me.id, {
    avatarPhoto: 'data:image/jpeg;base64,' + 'A'.repeat(AVATAR_PHOTO.maxChars),
  }) !== null)
  check('a rejected photo leaves the old one in place', api.getUser(me.id)!.avatarPhoto === PHOTO)
  check('a rejected photo blocks the rest of the patch too',
    api.updateProfile(me.id, { avatarPhoto: 'nope', bio: 'changed' }) !== null &&
    api.getUser(me.id)!.bio !== 'changed')
  check('null removes the photo',
    api.updateProfile(me.id, { avatarPhoto: null }) === null && api.getUser(me.id)!.avatarPhoto === null)
}

console.log('\n— going public auto-approves —')
api.signIn(teddy.id)
const pendingCount = api.getUser(teddy.id)!.pendingFollowerIds.length
check('teddy has pending requests', pendingCount > 0, `got ${pendingCount}`)
api.updateProfile(teddy.id, { isPrivate: false })
check('pending list cleared', api.getUser(teddy.id)!.pendingFollowerIds.length === 0)
check('pending became followers', api.getUser(teddy.id)!.followerIds.length >= pendingCount)


console.log('\n— venue reviews respect author privacy —')
api.resetDB()
{
  const viewer = 'u-you'
  const priv = api.listUsers().filter((u) => u.isPrivate && !api.canViewProfile(viewer, u.id))
  check('there is a private account we cannot view', priv.length > 0)
  const privIds = new Set(priv.map((u) => u.id))
  // A room where a private account left a review.
  const target = api.listVenues()
    .map((v) => v.id)
    .find((id) => api.listRatingsForVenue(id).some((r) => privIds.has(r.userId)))
  check('a private account reviewed some room', !!target, String(target))
  if (target) {
    const ungated = api.listRatingsForVenue(target)
    const gated = api.listRatingsForVenue(target, viewer)
    check('ungated call still returns every review', ungated.length > 0)
    check('gated call hides the private author',
      gated.every((r) => !privIds.has(r.userId)), `${ungated.length} -> ${gated.length}`)
    check('gated call actually removed something', gated.length < ungated.length)
    check('the room score still counts every rating',
      api.getVenueStats(target).count === ungated.length)
    check('a public author is still shown',
      gated.some((r) => !privIds.has(r.userId)) || gated.length === 0)
    // Once approved, the review becomes readable.
    const hiddenAuthor = ungated.find((r) => privIds.has(r.userId))!.userId
    api.acceptFollowRequest(hiddenAuthor, viewer)
    if (api.followState(viewer, hiddenAuthor) !== 'following') api.toggleFollow(viewer, hiddenAuthor)
    const afterFollow = api.listRatingsForVenue(target, viewer)
    check('approved follower can read the review',
      afterFollow.some((r) => r.userId === hiddenAuthor), `${afterFollow.length}`)
  }
}
api.resetDB()

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}\n`)
reportResult(failures)
