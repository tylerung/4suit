// Mounts every route into jsdom and reports any render-time error.
import * as api from '../src/lib/api'
import { mountApp, settle } from './harness'
import { reportResult } from './report'

const ROUTES = [
  '/', '/rankings', '/search', '/search?q=plo', '/compose',
  '/compose?mode=rating&venue=v-aria', '/compose?mode=session&venue=v-wynn',
  '/profile', '/u/marisolplays', '/u/teddystakes', '/u/nobody-here',
  '/venue/v-aria', '/venue/v-the-lodge', '/venue/does-not-exist',
  '/list/l-1', '/list/l-4', '/list/l-6', '/list/nope',
  '/settings', '/signin', '/totally-bogus-route',
]

let failures = 0
const errors: string[] = []

// React logs render errors through console.error before rethrowing; capture both.
const realError = console.error
console.error = (...args: any[]) => {
  const msg = args.map((a) => (a instanceof Error ? a.stack ?? a.message : String(a))).join(' ')
  // Ignore jsdom's unimplemented-API noise and act() advisories.
  if (/not implemented|Not implemented|act\(\)|ReactDOMTestUtils/.test(msg)) return
  errors.push(msg.split('\n')[0])
  realError('    console.error:', msg.split('\n')[0])
}

async function mount(route: string) {
  const before = errors.length
  let threw: unknown = null
  let mounted: Awaited<ReturnType<typeof mountApp>> | null = null
  try {
    mounted = await mountApp(route)
    // Screens fetch what they show, so the first paint can be a loading line;
    // settle again before judging whether anything rendered.
    await settle(4)
    const text = mounted.host.textContent ?? ''
    if (text.trim().length < 10) threw = new Error(`rendered almost nothing (${text.length} chars)`)
  } catch (e) {
    threw = e
  }
  await mounted?.unmount()

  const newErrors = errors.length - before
  if (threw || newErrors > 0) {
    failures++
    console.log(`  FAIL ${route}`)
    if (threw) console.log(`       threw: ${(threw as Error).message}`)
    if (newErrors > 0) console.log(`       ${newErrors} console.error(s)`)
  } else {
    console.log(`  ok   ${route}`)
  }
}

async function main() {
  await api.signIn('u-you')
  await api.resetDemoData()
  await api.signIn('u-you')

  console.log('\n— mounting every route —')
  for (const r of ROUTES) await mount(r)

  // A post id resolved from the API, so the detail route is exercised with a
  // real post rather than a guess.
  const feed = await api.listFeed('discover')
  if (feed[0]) await mount(`/post/${feed[0].post.id}`)
  await mount('/post/does-not-exist')

  console.log(`\n${failures === 0 ? 'ALL ROUTES RENDER' : failures + ' ROUTE FAILURES'}\n`)
  reportResult(failures)
}

main()
