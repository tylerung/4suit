/**
 * `npm run seed` — wipe the configured database and write the demo dataset.
 * Separate from the server so a fresh environment can be prepared before boot.
 */
import { connect, disconnect } from './mongo.js'
import { resetDatabase } from './seed.js'
import { env } from '../config/env.js'

const run = async () => {
  await connect()
  console.log(`[seed] resetting ${env.mongoUri}/${env.mongoDb}`)
  await resetDatabase()
  console.log('[seed] done')
  await disconnect()
}

run().catch((err) => {
  console.error('[seed] failed:', err)
  process.exitCode = 1
})
