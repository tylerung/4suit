/**
 * Railbird's test runner.
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
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

const SUITES = [
  { name: 'data-layer',   file: 'data-layer.test.ts',    blurb: 'api + storage behaviour' },
  { name: 'routes',       file: 'routes.test.tsx',       blurb: 'every route mounts' },
  { name: 'interactions', file: 'interactions.test.tsx', blurb: 'map, likes, rating flow, privacy' },
  { name: 'navigation',   file: 'navigation.test.tsx',   blurb: 'clicks land where they should' },
  { name: 'media',        file: 'media.test.ts',         blurb: 'photo/video ingest, storage, cleanup' },
  { name: 'palette',      file: 'palette.test.ts',       blurb: 'four colours only, no undefined tokens' },
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

const outDir = await mkdtemp(join(tmpdir(), 'railbird-tests-'))
let failed = 0

try {
  for (const suite of selected) {
    console.log(`\n[1m▸ ${suite.name}[0m [2m— ${suite.blurb}[0m`)

    const bundle = join(outDir, `${suite.name}.cjs`)
    const built = await run('npx', [
      'esbuild', join(HERE, suite.file),
      '--bundle', '--platform=node', '--format=cjs',
      `--outfile=${bundle}`,
      '--loader:.css=empty',   // suites exercise behaviour, not styling
      '--jsx=automatic',
      '--external:jsdom',
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
  await rm(outDir, { recursive: true, force: true })
}

console.log(
  failed === 0
    ? `\n[32m✓ all ${selected.length} suite(s) passed[0m\n`
    : `\n[31m✗ ${failed} of ${selected.length} suite(s) failed[0m\n`,
)
process.exit(failed === 0 ? 0 : 1)
