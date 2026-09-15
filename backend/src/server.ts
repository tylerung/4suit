import { createApp } from './app.js'
import { assertProductionSecrets, env } from './config/env.js'
import { connect, disconnect } from './db/mongo.js'
import { seedIfEmpty } from './db/seed.js'

async function main(): Promise<void> {
  assertProductionSecrets()

  await connect()
  console.log(`[db] connected to ${env.mongoDb}`)

  if (env.seedOnStart && (await seedIfEmpty())) {
    console.log('[db] empty database — wrote the demo dataset')
  }

  const server = createApp().listen(env.port, () => {
    console.log(`[api] listening on http://localhost:${env.port} (${env.nodeEnv})`)
  })

  // Finish in-flight requests and close the driver's sockets, so a restart in
  // dev does not leave connections open against the database.
  const shutdown = (signal: string) => {
    console.log(`[api] ${signal} — shutting down`)
    server.close(() => {
      void disconnect().finally(() => process.exit(0))
    })
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  console.error('[api] failed to start:', err)
  process.exit(1)
})
