import { invalidate } from './store'

/**
 * The HTTP layer: one place that knows the API's address, how a request is
 * authenticated, and what an error from it looks like.
 *
 * Everything above this file (lib/api.ts, the screens) deals in domain calls and
 * never touches fetch directly, which is what makes the client's half of the
 * app small: it renders what the server computed rather than computing it.
 */

/** Empty by default, so the Vite dev-server proxy handles /api in development. */
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

const TOKEN_KEY = '4suit:token'

/** An error carrying the server's own message, which is written for a person. */
export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly details?: unknown) {
    super(message)
    this.name = 'ApiError'
  }
}

/* ----------------------------------------------------------------- token */

let token: string | null = readToken()

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    // Private windows and blocked site data: the session still works, it just
    // will not survive a reload.
    return null
  }
}

export function getToken(): string | null {
  return token
}

export function setToken(next: string | null): void {
  token = next
  try {
    if (next === null) localStorage.removeItem(TOKEN_KEY)
    else localStorage.setItem(TOKEN_KEY, next)
  } catch { /* storage unavailable */ }
}

/* --------------------------------------------------------------- request */

type Query = Record<string, string | number | boolean | null | undefined>

export function url(path: string, query?: Query): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === null || value === undefined || value === '') continue
    search.set(key, String(value))
  }
  const qs = search.toString()
  return `${BASE}/api${path}${qs ? `?${qs}` : ''}`
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T
  const text = await res.text()
  const body = text ? (JSON.parse(text) as unknown) : null

  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error
      ?? `Request failed (${res.status}).`
    // An expired or revoked token would otherwise leave the app insisting it is
    // signed in while every call 401s. Dropping it and re-reading who we are
    // lands the user on the sign-in screen instead. Guarded on the token still
    // being there, so a screenful of 401s invalidates once, not once each.
    if (res.status === 401 && token !== null) {
      setToken(null)
      invalidate()
    }
    throw new ApiError(res.status, message, (body as { details?: unknown } | null)?.details)
  }
  return body as T
}

async function send<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  let res: Response
  try {
    res = await fetch(url(path, query), {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    // fetch only rejects when the request never got an answer.
    throw new ApiError(0, 'Could not reach the server. Check your connection.')
  }
  return parse<T>(res)
}

export const get = <T>(path: string, query?: Query) => send<T>('GET', path, undefined, query)
export const post = <T>(path: string, body?: unknown, query?: Query) => send<T>('POST', path, body ?? {}, query)
export const put = <T>(path: string, body?: unknown) => send<T>('PUT', path, body ?? {})
export const patch = <T>(path: string, body?: unknown) => send<T>('PATCH', path, body ?? {})
export const del = <T>(path: string) => send<T>('DELETE', path)

/** Multipart upload — the one request that does not send JSON. */
export async function upload<T>(path: string, form: FormData): Promise<T> {
  let res: Response
  try {
    res = await fetch(url(path), {
      method: 'POST',
      // No Content-Type: the browser has to set the multipart boundary itself.
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection.')
  }
  return parse<T>(res)
}
