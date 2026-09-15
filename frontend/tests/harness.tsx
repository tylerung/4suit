/**
 * Shared scaffolding for the browser suites.
 *
 * Every suite drives the real API (the runner starts a disposable one), so the
 * app's reads are now asynchronous: mounting a screen starts requests, and the
 * content under test appears a tick or two later. `settle` is what stands in
 * for the user's wait, and `waitFor` is for the cases where an assertion should
 * say what it is waiting for.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { act } from 'react-dom/test-utils'
import App from '../src/App'
import { AppProvider } from '../src/state/AppContext'

export interface Mounted {
  host: HTMLElement
  root: Root
  unmount: () => Promise<void>
}

/** Let pending requests resolve and React flush the renders they cause. */
export async function settle(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  }
}

/** Poll until `predicate` holds, or give up and let the assertion fail. */
export async function waitFor(
  predicate: () => boolean,
  { timeoutMs = 5000, label = 'condition' }: { timeoutMs?: number; label?: string } = {},
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await settle(1)
  }
  console.log(`       gave up waiting for ${label}`)
  return false
}

export async function mountApp(
  route: string,
  extra?: React.ReactNode,
): Promise<Mounted> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <React.StrictMode>
        <MemoryRouter initialEntries={[route]}>
          <AppProvider>
            {extra}
            <App />
          </AppProvider>
        </MemoryRouter>
      </React.StrictMode>,
    )
  })
  await settle()
  return {
    host,
    root,
    unmount: async () => {
      await act(async () => { root.unmount() })
      host.remove()
    },
  }
}

export async function click(el: Element | null | undefined): Promise<void> {
  if (!el) throw new Error('no click target')
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
  })
  await settle(3)
}

const API = import.meta.env.VITE_API_URL ?? ''

/**
 * Ask the API a question as somebody else, without disturbing the session the
 * mounted app is using. Checking that a stranger cannot see a private list is
 * only worth anything if it is the server being asked.
 */
export async function asUser(userId: string) {
  const res = await fetch(`${API}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  })
  const { token } = await res.json()
  return {
    async get(path: string): Promise<Response> {
      return fetch(`${API}/api${path}`, { headers: { Authorization: `Bearer ${token}` } })
    },
  }
}
