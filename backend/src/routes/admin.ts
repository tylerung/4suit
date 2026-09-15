import { Router } from 'express'
import { forbidden, route } from '../lib/errors.js'
import { requireUser } from '../middleware/auth.js'
import { env } from '../config/env.js'
import { resetDatabase } from '../db/seed.js'

export const adminRouter: Router = Router()

/**
 * Restore the demo dataset, dropping every post, rating and uploaded file with
 * it. This is a development convenience — in production the flag is off and the
 * route refuses, so a stray click cannot wipe a real database.
 */
adminRouter.post('/reset', requireUser, route(async (_req, res) => {
  if (!env.allowReset) throw forbidden('Resetting the database is disabled here.')
  await resetDatabase()
  res.json({ ok: true })
}))
