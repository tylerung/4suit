/**
 * 4suit's test runner.
 *
 * There is no test framework here on purpose: the suites are plain scripts that
 * count their own assertions. Each one is bundled with esbuild (so it can import
 * the app's TypeScript directly) and then run in its own node process against a
 * fresh jsdom, so no suite can leak DOM or localStorage state into the next.
 *
 *   npm test              run every suite
 *   npm test -- routes    run only suites whose name matches
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const BACKEND = resolve(ROOT, '..', 'backend')

/** Port the disposable API listens on while the suites run. */
const API_PORT = Number(process.env.FOURSUIT_TEST_API_PORT ?? 4123)
const API_URL = `http://127.0.0.1:${API_PORT}`

const SUITES = [
  { name: 'routes',       file: 'routes.test.tsx',       blurb: 'every route mounts', api: true },
  { name: 'interactions', file: 'interactions.test.tsx', blurb: 'map, likes, rating flow, privacy', api: true },
  { name: 'navigation',   file: 'navigation.test.tsx',   blurb: 'clicks land where they should', api: true },
  { name: 'palette',      file: 'palette.test.ts',       blurb: 'four colours only, no undefined tokens', api: true },
]

const filter = process.argv[2]
const selected = filter ? SUITES.filter((s) => s.name.includes(filter)) : SUITES

if (selected.length === 0) {
  console.error(`No suite matches "${filter}". Known: ${SUITES.map((s) => s.name).join(', ')}`)
  process.exit(1)
}

function run(cmd, args, opts = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts })
    child.on('close', (code) => resolvePromise(code ?? 1))
  })
}

/**
 * The suites drive the real API rather than a stand-in: the data layer lives in
 * the backend now, so a fake here would be a second implementation of it that
 * could pass while the real one is broken. This starts the backend's disposable
 * test server (its own in-memory mongod) and waits for it to answer.
 */
async function startApi() {
  if (!existsSync(join(BACKEND, 'node_modules'))) {
    console.log(
      `\n  The API-backed suites need the backend installed:` +
      `\n    npm --prefix ../backend install\n`,
    )
    return null
  }

  // Its own process group: tsx runs the server in a child of its own, and the
  // whole group has to go at teardown or the runner sits waiting on a mongod.
  const child = spawn('npx', ['tsx', 'tests/test-server.ts', '--port', String(API_PORT)], {
    cwd: BACKEND,
    stdio: ['ignore', 'pipe', 'inherit'],
    detached: true,
  })
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    if (!String(chunk).includes('4suit-test-api ready')) process.stdout.write(chunk)
  })

  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) return null
    try {
      const res = await fetch(`${API_URL}/api/health`)
      if (res.ok) return child
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  stopApi(child)
  return null
}

function stopApi(child) {
  if (!child || child.exitCode !== null) return
  child.stdout?.destroy()
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    child.kill('SIGKILL')
  }
}

const outDir = await mkdtemp(join(tmpdir(), '4suit-tests-'))
let failed = 0

const needsApi = selected.some((s) => s.api)
const api = needsApi ? await startApi() : null
if (needsApi && !api) {
  console.log(`[31m✗ could not start the test API — the suites that need it will be skipped[0m`)
}

try {
  for (const suite of selected) {
    if (suite.api && !api) {
      console.log(`\n[1m▸ ${suite.name}[0m [2m— skipped, no API[0m`)
      failed++
      continue
    }
    console.log(`\n[1m▸ ${suite.name}[0m [2m— ${suite.blurb}[0m`)

    const bundle = join(outDir, `${suite.name}.cjs`)
    const built = await run('npx', [
      'esbuild', join(HERE, suite.file),
      '--bundle', '--platform=node', '--format=cjs',
      `--outfile=${bundle}`,
      '--loader:.css=empty',   // suites exercise behaviour, not styling
      '--jsx=automatic',
      '--external:jsdom',
      // The client reads its API address from the Vite environment; in a bundle
      // there is no Vite, so it is baked in here.
      `--define:import.meta.env.VITE_API_URL="${API_URL}"`,
      '--log-level=error',
    ])
    if (built !== 0) {
      console.log(`  bundling failed`)
      failed++
      continue
    }

    const code = await run('node', [join(HERE, 'setup.cjs'), bundle])
    if (code !== 0) failed++
  }
} finally {
  stopApi(api)
  await rm(outDir, { recursive: true, force: true })
}

console.log(
  failed === 0
    ? `\n[32m✓ all ${selected.length} suite(s) passed[0m\n`
    : `\n[31m✗ ${failed} of ${selected.length} suite(s) failed[0m\n`,
)
process.exit(failed === 0 ? 0 : 1)
