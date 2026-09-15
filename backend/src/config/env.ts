import 'dotenv/config'

/**
 * Every environment value the server reads, resolved once at boot.
 *
 * Secrets live in `backend/.env` (git-ignored); `backend/.env.example` documents
 * the same keys with placeholder values and IS committed. Nothing outside this
 * module reads `process.env`, so there is one list of what deployment must set.
 */

function str(key: string, fallback: string): string {
  const value = process.env[key]
  return value === undefined || value === '' ? fallback : value
}

function int(key: string, fallback: number): number {
  const raw = process.env[key]
  if (raw === undefined || raw === '') return fallback
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) throw new Error(`${key} must be a number, got "${raw}"`)
  return n
}

function bool(key: string, fallback: boolean): boolean {
  const raw = process.env[key]
  if (raw === undefined || raw === '') return fallback
  return raw === '1' || raw.toLowerCase() === 'true'
}

const nodeEnv = str('NODE_ENV', 'development')

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: int('PORT', 4000),

  /** Placeholder connection string — point this at a real cluster to deploy. */
  mongoUri: str('MONGODB_URI', 'mongodb://127.0.0.1:27017'),
  mongoDb: str('MONGODB_DB', '4suit'),

  /** Comma-separated list of browser origins allowed to call the API. */
  corsOrigins: str('CORS_ORIGIN', 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  /** Signs the bearer tokens handed out by /api/auth/signin. */
  jwtSecret: str('JWT_SECRET', 'dev-only-insecure-jwt-secret-change-me'),
  jwtExpiresIn: str('JWT_EXPIRES_IN', '30d'),

  /** Write the demo dataset on boot when the database is empty. */
  seedOnStart: bool('SEED_ON_START', true),
  /** Allow POST /api/admin/reset, which wipes and reseeds. Never in production. */
  allowReset: bool('ALLOW_DB_RESET', nodeEnv !== 'production'),

  /** Hard ceiling on one uploaded file, enforced before anything is stored. */
  maxUploadBytes: int('MAX_UPLOAD_BYTES', 100 * 1024 * 1024),
} as const

/** Shouted at boot so a production deploy never runs on the built-in secret. */
export function assertProductionSecrets(): void {
  if (!env.isProduction) return
  if (env.jwtSecret.startsWith('dev-only-')) {
    throw new Error('JWT_SECRET must be set to a real secret in production.')
  }
  if (env.mongoUri.includes('127.0.0.1') || env.mongoUri.includes('localhost')) {
    console.warn('[env] MONGODB_URI still points at localhost in production.')
  }
}
