import { Router } from 'express'
import { forbidden, notFound, route } from '../lib/errors.js'
import { requireUser } from '../middleware/auth.js'
import { profilePatchSchema } from '../validation/schemas.js'
import {
  acceptFollowRequest, declineFollowRequest, followState, getUserByUsername,
  getUserStats, getUsersByIds, listUsers, removeFollower, requireUserRecord, suggestedUsers,
  toggleFollow, updateProfile,
} from '../services/users.js'
import { listPostsByUser } from '../services/posts.js'
import { listRatingsByUser } from '../services/ratings.js'
import { listListsByUser } from '../services/lists.js'

export const usersRouter: Router = Router()

usersRouter.get('/', route(async (_req, res) => {
  res.json(await listUsers())
}))

usersRouter.get('/suggested', route(async (req, res) => {
  const limit = Number.parseInt(String(req.query.limit ?? '5'), 10)
  res.json(await suggestedUsers(req.userId, Number.isFinite(limit) ? limit : 5))
}))

/** Hydrate a set of ids in one call — a post's likers, say. */
usersRouter.get('/lookup', route(async (req, res) => {
  const ids = String(req.query.ids ?? '').split(',').map((id) => id.trim()).filter(Boolean)
  res.json(await getUsersByIds(ids.slice(0, 200)))
}))

usersRouter.get('/by-username/:username', route(async (req, res) => {
  const user = await getUserByUsername(req.params.username)
  if (!user) throw notFound('No account with that handle.')
  res.json(user)
}))

usersRouter.get('/:id', route(async (req, res) => {
  res.json(await requireUserRecord(req.params.id))
}))

usersRouter.patch('/:id', requireUser, route(async (req, res) => {
  // A profile is only ever edited by its owner; the token says who that is.
  if (req.params.id !== req.userId) throw forbidden('That profile is not yours.')
  res.json(await updateProfile(req.params.id, profilePatchSchema.parse(req.body)))
}))

usersRouter.get('/:id/stats', route(async (req, res) => {
  res.json(await getUserStats(req.params.id))
}))

usersRouter.get('/:id/posts', route(async (req, res) => {
  res.json(await listPostsByUser(req.params.id, req.userId))
}))

usersRouter.get('/:id/ratings', route(async (req, res) => {
  res.json(await listRatingsByUser(req.params.id, req.userId))
}))

usersRouter.get('/:id/lists', route(async (req, res) => {
  res.json(await listListsByUser(req.params.id, req.userId))
}))

/* ---------------------------------------------------------------- follows */

usersRouter.get('/:id/follow-state', route(async (req, res) => {
  res.json({ state: await followState(req.userId, req.params.id) })
}))

usersRouter.post('/:id/follow', requireUser, route(async (req, res) => {
  res.json({ state: await toggleFollow(req.userId!, req.params.id) })
}))

/** Whichever of this account's connections the viewer is allowed to enumerate. */
usersRouter.get('/:id/connections', route(async (req, res) => {
  const user = await requireUserRecord(req.params.id)
  const isSelf = req.userId === user.id
  const [followers, following, pending] = await Promise.all([
    getUsersByIds(user.followerIds),
    getUsersByIds(user.followingIds),
    isSelf ? getUsersByIds(user.pendingFollowerIds) : Promise.resolve([]),
  ])
  res.json({ followers, following, pendingFollowers: pending })
}))

usersRouter.post('/:id/requests/:requesterId/accept', requireUser, route(async (req, res) => {
  if (req.params.id !== req.userId) throw forbidden('Those requests are not yours to approve.')
  await acceptFollowRequest(req.params.id, req.params.requesterId)
  res.json(await requireUserRecord(req.params.id))
}))

usersRouter.delete('/:id/requests/:requesterId', requireUser, route(async (req, res) => {
  if (req.params.id !== req.userId) throw forbidden('Those requests are not yours to decline.')
  await declineFollowRequest(req.params.id, req.params.requesterId)
  res.json(await requireUserRecord(req.params.id))
}))

usersRouter.delete('/:id/followers/:followerId', requireUser, route(async (req, res) => {
  if (req.params.id !== req.userId) throw forbidden('Those followers are not yours to remove.')
  await removeFollower(req.params.id, req.params.followerId)
  res.json(await requireUserRecord(req.params.id))
}))
