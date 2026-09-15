import { Router } from 'express'
import { route } from '../lib/errors.js'
import { actorId, requireUser } from '../middleware/auth.js'
import { listInputSchema, listPatchSchema, reorderSchema } from '../validation/schemas.js'
import {
  createList, deleteList, getList, reorderList, toggleVenueInList, updateList,
} from '../services/lists.js'

export const listsRouter: Router = Router()

listsRouter.get('/:id', route(async (req, res) => {
  res.json(await getList(req.params.id, req.userId))
}))

listsRouter.post('/', requireUser, route(async (req, res) => {
  res.status(201).json(await createList(actorId(req), listInputSchema.parse(req.body)))
}))

listsRouter.patch('/:id', requireUser, route(async (req, res) => {
  res.json(await updateList(req.params.id, actorId(req), listPatchSchema.parse(req.body)))
}))

listsRouter.delete('/:id', requireUser, route(async (req, res) => {
  await deleteList(req.params.id, actorId(req))
  res.status(204).end()
}))

listsRouter.post('/:id/venues/:venueId', requireUser, route(async (req, res) => {
  res.json(await toggleVenueInList(req.params.id, req.params.venueId, actorId(req)))
}))

listsRouter.post('/:id/reorder', requireUser, route(async (req, res) => {
  const { venueId, direction } = reorderSchema.parse(req.body)
  res.json(await reorderList(req.params.id, actorId(req), venueId, direction))
}))
