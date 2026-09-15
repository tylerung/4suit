import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getRevision, subscribe } from '../lib/store'
import { ApiError } from '../lib/client'

/**
 * Read something from the API and re-read it whenever the inputs change or the
 * data is invalidated by a write.
 *
 * Screens used to call the data layer during render, because it was a synchronous
 * read of a local store. Over a network that is not possible, so this hook is the
 * seam: it keeps the "fetch it and hand me the value" shape the screens were
 * written around, and adds the two things a networked read needs — a value to
 * show before the answer arrives, and a guarantee that a slow response from an
 * earlier input can never overwrite a newer one.
 */
export interface QueryResult<T> {
  data: T
  /** True while a request is in flight — including a refetch after a write. */
  loading: boolean
  /**
   * True once an answer has arrived, and true forever after. A refetch is not
   * "we do not know yet": a screen that treats every in-flight request as its
   * first one throws away what it is already showing each time anything is
   * written, which reads as a flash back to the loading state.
   */
  loaded: boolean
  error: string | null
  /** Refetch this query alone; a write should call invalidate() instead. */
  reload: () => void
}

export function useStoreRevision(): number {
  return useSyncExternalStore(subscribe, getRevision, getRevision)
}

export function useQuery<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList,
  initial: T,
): QueryResult<T> {
  const revision = useStoreRevision()
  const [data, setData] = useState<T>(initial)
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  // Only the newest run may write state: an in-flight request for the previous
  // deps would otherwise land after the new one and show stale data.
  const runId = useRef(0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    const id = ++runId.current
    let cancelled = false
    setLoading(true)

    fetcherRef.current()
      .then((value) => {
        if (cancelled || id !== runId.current) return
        setData(value)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled || id !== runId.current) return
        setError(err instanceof ApiError ? err.message : 'Something went wrong.')
      })
      .finally(() => {
        if (cancelled || id !== runId.current) return
        setLoading(false)
        setLoaded(true)
      })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, revision, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { data, loading, loaded, error, reload }
}
