import { Router } from 'express'
import { route } from '../lib/errors.js'
import { actorId, requireUser } from '../middleware/auth.js'
import { deleteComment, toggleCommentLike } from '../services/comments.js'

export const commentsRouter: Router = Router()

commentsRouter.delete('/:id', requireUser, route(async (req, res) => {
  await deleteComment(req.params.id, actorId(req))
  res.status(204).end()
}))

commentsRouter.post('/:id/like', requireUser, route(async (req, res) => {
  res.json(await toggleCommentLike(req.params.id, actorId(req)))
}))
