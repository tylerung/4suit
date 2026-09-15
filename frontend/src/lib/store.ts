/**
 * Client-side change notification.
 *
 * The server owns the data now, so there is nothing here to store — what is
 * left is the signal that something has changed. Every mutation in lib/api.ts
 * calls `invalidate()`, every `useQuery` is subscribed, so a like on one screen
 * refreshes the count on another without any screen wiring them together.
 */

type Listener = () => void

const listeners = new Set<Listener>()
let revision = 0

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function getRevision(): number {
  return revision
}

/** Mark server state as stale: every live query refetches. */
export function invalidate(): void {
  revision++
  listeners.forEach((l) => l())
}
