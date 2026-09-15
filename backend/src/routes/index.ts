import { Router } from 'express'
import { authRouter } from './auth.js'
import { usersRouter } from './users.js'
import { venuesRouter } from './venues.js'
import { ratingsRouter } from './ratings.js'
import { feedRouter, postsRouter } from './posts.js'
import { commentsRouter } from './comments.js'
import { listsRouter } from './lists.js'
import { searchRouter } from './search.js'
import { mediaRouter } from './media.js'
import { adminRouter } from './admin.js'

export const apiRouter: Router = Router()

apiRouter.get('/health', (_req, res) => {
  res.json({ ok: true, service: '4suit-api' })
})

apiRouter.use('/auth', authRouter)
apiRouter.use('/users', usersRouter)
apiRouter.use('/venues', venuesRouter)
apiRouter.use('/ratings', ratingsRouter)
apiRouter.use('/posts', postsRouter)
apiRouter.use('/feed', feedRouter)
apiRouter.use('/comments', commentsRouter)
apiRouter.use('/lists', listsRouter)
apiRouter.use('/search', searchRouter)
apiRouter.use('/media', mediaRouter)
apiRouter.use('/admin', adminRouter)
