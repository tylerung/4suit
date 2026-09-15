/**
 * A disposable 4suit API for the client's test suites.
 *
 * Boots a real mongod in a temp directory (mongodb-memory-server), seeds the
 * demo dataset and serves the actual Express app, so the browser suites run
 * against the API they will meet in production rather than against a hand-
 * written double that can drift away from it.
 *
 *   npx tsx tests/test-server.ts --port 4123
 *
 * Prints "4suit-test-api ready <url>" on stdout once it is listening, and
 * shuts everything down on SIGTERM.
 */
import { MongoMemoryServer } from 'mongodb-memory-server'

const portArg = process.argv.indexOf('--port')
const port = portArg > -1 ? Number(process.argv[portArg + 1]) : 4123

const mongo = await MongoMemoryServer.create()
process.env.MONGODB_URI = mongo.getUri()
process.env.MONGODB_DB = '4suit_test'
process.env.JWT_SECRET = 'test-only-secret'
process.env.ALLOW_DB_RESET = 'true'
process.env.CORS_ORIGIN = 'http://localhost,http://127.0.0.1'

const { createApp } = await import('../src/app.js')
const { connect, disconnect } = await import('../src/db/mongo.js')
const { seedIfEmpty } = await import('../src/db/seed.js')

await connect()
await seedIfEmpty()

const server = createApp().listen(port, () => {
  console.log(`4suit-test-api ready http://127.0.0.1:${port}`)
})

const stop = () => {
  // Keep-alive sockets from the suites would hold the listener open, and this
  // process is disposable — drop them rather than wait them out.
  server.closeAllConnections?.()
  server.close(() => {
    void disconnect().then(() => mongo.stop()).finally(() => process.exit(0))
  })
  // A shutdown that stalls must not outlive the test run.
  setTimeout(() => process.exit(0), 3000).unref()
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
