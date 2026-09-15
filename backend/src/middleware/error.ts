import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { HttpError } from '../lib/errors.js'
import { env } from '../config/env.js'

/** Nothing matched the router: a 404 in the shape every other error uses. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` })
}

/**
 * The one place an error becomes a response. Anything that is not an HttpError
 * is a bug, so it is logged in full and reported as a bare 500 — an internal
 * message (a driver error naming a collection, say) is not the caller's
 * business outside development.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) { next(err); return }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details })
    return
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'That request was not in the expected shape.',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
    return
  }
  // Multer rejects an oversized upload before the route ever runs.
  if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'That file is too large.' })
    return
  }

  console.error('[error]', err)
  res.status(500).json({
    error: 'Something went wrong on our end.',
    details: env.isProduction ? undefined : String(err),
  })
}
