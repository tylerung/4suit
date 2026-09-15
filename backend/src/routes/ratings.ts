import { Router } from 'express'
import { badRequest, notFound, route } from '../lib/errors.js'
import { actorId, requireUser } from '../middleware/auth.js'
import { ratingInputSchema } from '../validation/schemas.js'
import { deleteRating, getMyRating, getRating, saveRating } from '../services/ratings.js'

export const ratingsRouter: Router = Router()

/** The signed-in user's rating for a room, if they have left one. */
ratingsRouter.get('/mine', requireUser, route(async (req, res) => {
  const venueId = String(req.query.venueId ?? '')
  if (!venueId) throw badRequest('venueId is required.')
  res.json({ rating: await getMyRating(actorId(req), venueId) })
}))

ratingsRouter.get('/:id', route(async (req, res) => {
  const rating = await getRating(req.params.id)
  if (!rating) throw notFound('That rating is no longer here.')
  res.json(rating)
}))

/** Create or replace — one rating per person per room. */
ratingsRouter.put('/', requireUser, route(async (req, res) => {
  res.json(await saveRating(actorId(req), ratingInputSchema.parse(req.body)))
}))

ratingsRouter.delete('/:id', requireUser, route(async (req, res) => {
  await deleteRating(req.params.id, actorId(req))
  res.status(204).end()
}))
