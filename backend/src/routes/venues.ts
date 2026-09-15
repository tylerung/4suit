import { Router } from 'express'
import { route } from '../lib/errors.js'
import { venueQuerySchema } from '../validation/schemas.js'
import { getVenueStats, listVenues, rankVenues, requireVenue } from '../services/venues.js'
import { listRatingsForVenue } from '../services/ratings.js'
import { listPostsForVenue } from '../services/posts.js'

export const venuesRouter: Router = Router()

venuesRouter.get('/', route(async (_req, res) => {
  res.json(await listVenues())
}))

/** The leaderboard — filters, distance and ordering all applied server-side. */
venuesRouter.get('/rank', route(async (req, res) => {
  res.json(await rankVenues(venueQuerySchema.parse(req.query)))
}))

venuesRouter.get('/:id', route(async (req, res) => {
  res.json(await requireVenue(req.params.id))
}))

venuesRouter.get('/:id/stats', route(async (req, res) => {
  res.json(await getVenueStats(req.params.id))
}))

venuesRouter.get('/:id/ratings', route(async (req, res) => {
  res.json(await listRatingsForVenue(req.params.id, req.userId))
}))

venuesRouter.get('/:id/posts', route(async (req, res) => {
  res.json(await listPostsForVenue(req.params.id, req.userId))
}))
