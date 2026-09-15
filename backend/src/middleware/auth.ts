import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { unauthorized } from '../lib/errors.js'

/**
 * Sessions are bearer tokens: /api/auth/signin mints one, the client sends it
 * back on every request, and the id inside it — never an id from the request
 * body — is who the server acts as. That is the whole reason the data layer
 * moved off the client: "who is doing this" is now something the client states
 * and the server verifies, rather than something the client decides.
 *
 * 4suit has no passwords (you pick a demo account), so signin is deliberately
 * the only place that trusts a user id from the request. Adding real credentials
 * means changing that one route, not this middleware.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Id of the signed-in user, or null for an anonymous request. */
      userId: string | null
    }
  }
}

interface TokenPayload {
  sub: string
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies TokenPayload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions)
}

function readToken(req: Request): string | null {
  const header = req.get('authorization')
  if (!header) return null
  const [scheme, value] = header.split(' ')
  if (!value || scheme.toLowerCase() !== 'bearer') return null
  return value
}

/** Populates req.userId when a valid token is present; never rejects. */
export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  req.userId = null
  const token = readToken(req)
  if (!token) { next(); return }
  try {
    const payload = jwt.verify(token, env.jwtSecret) as TokenPayload
    if (typeof payload.sub === 'string') req.userId = payload.sub
  } catch {
    // An expired or tampered token is treated as signed out rather than as an
    // error: the client's next call to /api/auth/me tells it to clear the token.
  }
  next()
}

/** Guards routes that need somebody behind them. */
export function requireUser(req: Request, _res: Response, next: NextFunction): void {
  if (!req.userId) { next(unauthorized()); return }
  next()
}

/** The signed-in id, for routes already behind requireUser. */
export function actorId(req: Request): string {
  if (!req.userId) throw unauthorized()
  return req.userId
}
