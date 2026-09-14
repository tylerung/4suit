import { useCallback, useEffect, useRef, useState } from 'react'

/** Fire-and-forget confirmation messages. Returns [node, show]. */
export function useToast(): [React.ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const show = useCallback((m: string) => {
    setMsg(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), 2200)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const node = msg ? <div className="toast" role="status">{msg}</div> : null
  return [node, show]
}
