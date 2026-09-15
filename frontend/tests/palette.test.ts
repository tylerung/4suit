// Palette guard. 4suit is built from four colours plus one reserved alert
// red; this suite fails if anything else sneaks into the source, or if a token
// is referenced that nothing defines. An undefined custom property never errors
// — it silently computes to the property's initial value — which is exactly how
// every border-radius in the app once collapsed to 0 without a single test
// noticing.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { listUsers, listVenues } from '../src/lib/api'
import { AVATAR_TONES } from '../src/types'
import { reportResult } from './report'

// Module-local, so it cannot collide with @types/node if that is ever added.
declare const process: { cwd(): string }

let failures = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  ok   ${name}`)
  else { failures++; console.log(`  FAIL ${name} ${detail}`) }
}

const ROOT = process.cwd()
const PALETTE = { night: '#0d1117', mist: '#e4e6eb', blue: '#3b82f6', slate: '#8b949e' }
const ALERT = '#ef4444'
const ALLOWED = new Set([...Object.values(PALETTE), ALERT])

const files: string[] = []
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(css|tsx?)$/.test(name)) files.push(p)
  }
}
walk(join(ROOT, 'src'))
const src = files.map((f) => ({ f: relative(ROOT, f), s: readFileSync(f, 'utf8') }))
const css = src.filter((x) => x.f.endsWith('.css'))
const indexCss = src.find((x) => x.f === join('src', 'index.css'))!.s

console.log('\n— the four palette colours are the source of truth —')
for (const [name, hex] of Object.entries(PALETTE)) {
  const m = indexCss.match(new RegExp(`--c-${name}:\\s*(#[0-9a-fA-F]{6})`))
  check(`--c-${name} is ${hex.toUpperCase()}`, !!m && m[1].toLowerCase() === hex, m?.[1] ?? 'not defined')
}
check('the reserved alert red is defined once, in index.css',
  src.filter((x) => x.s.toLowerCase().includes(ALERT)).map((x) => x.f).join() === join('src', 'index.css'))

console.log('\n— nothing outside the palette —')
{
  const HEX = /(?<=[\s'"(:,])#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g
  const stray: string[] = []
  for (const { f, s } of src) {
    for (const m of s.matchAll(HEX)) {
      let hex = m[0].toLowerCase()
      if (hex.length === 4) hex = '#' + [...hex.slice(1)].map((c) => c + c).join('')
      if (!ALLOWED.has(hex.slice(0, 7))) stray.push(`${f}: ${m[0]}`)
    }
  }
  check('every hex colour in src is a palette colour', stray.length === 0, stray.slice(0, 6).join(' | '))

  const fnColour = src.flatMap(({ f, s }) =>
    [...s.matchAll(/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/g)].map((m) => `${f}: ${m[0]}`))
  check('no rgb()/hsl()/lab() literals — colours derive from tokens', fnColour.length === 0,
    fnColour.slice(0, 6).join(' | '))

  const named = css.flatMap(({ f, s }) =>
    [...s.matchAll(/:\s*(white|black|red|green|blue|gray|grey|gold|orange|yellow|purple|pink|silver)\s*[;}]/g)]
      .map((m) => `${f}: ${m[1]}`))
  check('no named colours in stylesheets', named.length === 0, named.join(' | '))

  const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
  const theme = html.match(/name="theme-color"\s+content="(#[0-9a-fA-F]{6})"/)
  check('the browser theme-color is palette night',
    !!theme && theme[1].toLowerCase() === PALETTE.night, theme?.[1] ?? 'missing')
}

console.log('\n— every token that is used is defined —')
{
  const defined = new Set<string>()
  for (const { s } of src) for (const m of s.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) defined.add(m[1])
  const missing: string[] = []
  for (const { f, s } of src) {
    for (const m of s.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
      if (!defined.has(m[1])) missing.push(`${f}: ${m[1]}`)
    }
  }
  check('no var() points at an undefined token', missing.length === 0,
    `${missing.length} unresolved, e.g. ${missing.slice(0, 4).join(' | ')}`)
  for (const t of ['--radius', '--radius-sm', '--radius-lg', '--radius-pill']) {
    check(`${t} is defined`, defined.has(t))
  }
  const legacy = ['--gold', '--gold-dim', '--chip-red', '--chip-green', '--chip-blue', '--chip-purple', '--success']
  const stale = src.flatMap(({ f, s }) => legacy.filter((t) => new RegExp(`${t}\\b(?!-)`).test(s)).map((t) => `${f}: ${t}`))
  check('none of the pre-palette colour tokens survive', stale.length === 0, stale.join(' | '))
}

/* The data has to stay on the palette too, and it is the API's data now — so
   this half asks the server rather than reading a seed file the client no
   longer has. */
async function checkData() {
  console.log('\n— data is on the palette too —')
  const users = await listUsers()
  const venues = await listVenues()
  const tones = new Set(AVATAR_TONES.map((t) => t.id))
  check('every account has a palette avatar tone',
    users.every((u) => tones.has(u.avatarTone)), users.map((u) => u.avatarTone).join(','))
  check('the tones actually vary', new Set(users.map((u) => u.avatarTone)).size === tones.size)
  check('venues carry no colours of their own',
    venues.every((v) => !('colors' in (v as unknown as Record<string, unknown>))))

  console.log(`\n${failures === 0 ? 'ALL PALETTE CHECKS PASS' : failures + ' PALETTE FAILURES'}\n`)
  reportResult(failures)
}

checkData().catch((e) => {
  console.log('HARNESS ERROR:', (e as Error).stack)
  reportResult(failures + 1)
})
