import { Router } from 'express'
import { route } from '../lib/errors.js'
import { searchQuerySchema } from '../validation/schemas.js'
import { search } from '../services/search.js'

export const searchRouter: Router = Router()

searchRouter.get('/', route(async (req, res) => {
  const { q, lat, lng } = searchQuerySchema.parse(req.query)
  const origin = lat !== undefined && lng !== undefined ? { lat, lng } : null
  res.json(await search(q, req.userId, origin))
}))
