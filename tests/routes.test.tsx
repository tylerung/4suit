// Mounts every route into jsdom and reports any render-time error.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { act } from 'react-dom/test-utils'
import App from '../src/App'
import { AppProvider } from '../src/state/AppContext'
import * as api from '../src/lib/api'
import { reportResult } from './report'


const ROUTES = [
  '/', '/rankings', '/search', '/search?q=plo', '/compose',
  '/compose?mode=rating&venue=v-aria', '/compose?mode=session&venue=v-wynn',
  '/profile', '/u/marisolplays', '/u/teddystakes', '/u/nobody-here',
  '/venue/v-aria', '/venue/v-the-lodge', '/venue/does-not-exist',
  '/list/l-1', '/list/l-4', '/list/l-6', '/list/nope',
  '/settings', '/signin', '/totally-bogus-route',
]

// A post id and a private-account post id, resolved from the seed.
const firstPost = api.listFeed('u-you', 'discover')[0]
if (firstPost) ROUTES.push(`/post/${firstPost.post.id}`)
ROUTES.push('/post/does-not-exist')

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
  const host = document.createElement('div')
  document.body.appendChild(host)
  const before = errors.length
  let threw: unknown = null
  try {
    const root = createRoot(host)
    await act(async () => {
      root.render(
        React.createElement(
          React.StrictMode,
          null,
          React.createElement(
            MemoryRouter,
            { initialEntries: [route] },
            React.createElement(AppProvider, null, React.createElement(App, null)),
          ),
        ),
      )
    })
    const text = host.textContent ?? ''
    if (text.trim().length < 10) threw = new Error(`rendered almost nothing (${text.length} chars)`)
    await act(async () => { root.unmount() })
  } catch (e) {
    threw = e
  }
  host.remove()

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
  console.log('\n— mounting every route —')
  for (const r of ROUTES) await mount(r)
  console.log(`\n${failures === 0 ? 'ALL ROUTES RENDER' : failures + ' ROUTE FAILURES'}\n`)
  reportResult(failures)
}

main()
