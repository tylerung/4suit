import { Router } from 'express'
import { route } from '../lib/errors.js'
import { actorId, requireUser } from '../middleware/auth.js'
import { commentInputSchema, postInputSchema, postPatchSchema } from '../validation/schemas.js'
import {
  createPost, deletePost, getFeedItem, listFeed, toggleLike, updatePost,
} from '../services/posts.js'
import { addComment, listComments } from '../services/comments.js'

export const postsRouter: Router = Router()

postsRouter.get('/:id', route(async (req, res) => {
  res.json(await getFeedItem(req.params.id, req.userId))
}))

postsRouter.post('/', requireUser, route(async (req, res) => {
  res.status(201).json(await createPost(actorId(req), postInputSchema.parse(req.body)))
}))

postsRouter.patch('/:id', requireUser, route(async (req, res) => {
  const patch = postPatchSchema.parse(req.body)
  res.json(await updatePost(req.params.id, actorId(req), patch.body, patch.tags))
}))

postsRouter.delete('/:id', requireUser, route(async (req, res) => {
  await deletePost(req.params.id, actorId(req))
  res.status(204).end()
}))

postsRouter.post('/:id/like', requireUser, route(async (req, res) => {
  res.json(await toggleLike(req.params.id, actorId(req)))
}))

postsRouter.get('/:id/comments', route(async (req, res) => {
  res.json(await listComments(req.params.id, req.userId))
}))

postsRouter.post('/:id/comments', requireUser, route(async (req, res) => {
  const { body } = commentInputSchema.parse(req.body)
  res.status(201).json(await addComment(req.params.id, actorId(req), body))
}))

/* ------------------------------------------------------------------ feed */

export const feedRouter: Router = Router()

feedRouter.get('/', route(async (req, res) => {
  const scope = req.query.scope === 'discover' ? 'discover' : 'following'
  res.json(await listFeed(req.userId, scope))
}))
