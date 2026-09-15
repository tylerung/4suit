import cors from 'cors'
import express, { type Express } from 'express'
import { env } from './config/env.js'
import { attachUser } from './middleware/auth.js'
import { errorHandler, notFoundHandler } from './middleware/error.js'
import { apiRouter } from './routes/index.js'

export function createApp(): Express {
  const app = express()

  app.disable('x-powered-by')
  app.use(cors({
    origin: env.corsOrigins,
    // The client sends a bearer token, not a cookie, so credentials stay off.
    credentials: false,
  }))
  // Profile photos arrive as data URIs on the user document, so the JSON body
  // limit has to clear AVATAR_PHOTO.maxChars with room to spare. Everything
  // larger than that is an upload, and goes through multer instead.
  app.use(express.json({ limit: '2mb' }))
  app.use(attachUser)

  app.use('/api', apiRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
