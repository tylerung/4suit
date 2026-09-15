import type { NextFunction, Request, RequestHandler, Response } from 'express'

/** An error with a status code and a message that is safe to show a user. */
export class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly details?: unknown) {
    super(message)
    this.name = 'HttpError'
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details)
export const unauthorized = (msg = 'Sign in to do that.') => new HttpError(401, msg)
export const forbidden = (msg = 'That is not yours to change.') => new HttpError(403, msg)
export const notFound = (msg = 'Not found.') => new HttpError(404, msg)

/**
 * Express 4 does not forward a rejected promise to the error handler, so every
 * async route is wrapped in this rather than repeating try/catch in each one.
 */
export function route(handler: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    void Promise.resolve(handler(req, res, next)).catch(next)
  }
}
