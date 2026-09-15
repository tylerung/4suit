import { Router } from 'express'
import { route, badRequest } from '../lib/errors.js'
import { signInSchema } from '../validation/schemas.js'
import { signToken } from '../middleware/auth.js'
import { getUser, listUsers } from '../services/users.js'

/**
 * 4suit has no passwords — you pick one of the demo accounts — so this is the
 * one route that takes a user id from the request body. Everything else reads
 * the actor from the signed token minted here.
 */
export const authRouter: Router = Router()

authRouter.post('/signin', route(async (req, res) => {
  const { userId } = signInSchema.parse(req.body)
  const user = await getUser(userId)
  if (!user) throw badRequest('That account does not exist.')
  res.json({ token: signToken(user.id), user })
}))

authRouter.post('/signout', route(async (_req, res) => {
  // Tokens are stateless, so signing out is the client dropping the token. The
  // route exists so that becoming a real session later changes only the server.
  res.status(204).end()
}))

authRouter.get('/me', route(async (req, res) => {
  res.json({ user: await getUser(req.userId) })
}))

/** The sign-in screen's account picker. */
authRouter.get('/accounts', route(async (_req, res) => {
  res.json(await listUsers())
}))
