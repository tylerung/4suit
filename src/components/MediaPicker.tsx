import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { MEDIA_LIMITS, type MediaItem } from '../types'
import {
  MediaError,
  deleteMedia,
  formatDuration,
  ingestFile,
  isEphemeral,
  prettyBytes,
  releaseMediaUrl,
  resolveMediaUrl,
} from '../lib/media'
import './MediaPicker.css'
import Icon from './Icon'

/**
 * The attach-media control for the composer.
 *
 * Controlled: `items` is never mutated, every change goes out through
 * `onChange` as a fresh array. Display order is array order.
 */

interface Props {
  items: MediaItem[]
  onChange: (next: MediaItem[]) => void
  disabled?: boolean
}

/* ------------------------------------------------------------- url state */

type UrlState =
  | { status: 'resolving' }
  | { status: 'ready'; url: string }
  | { status: 'missing' }

/**
 * resolveMediaUrl is async, so a thumbnail has three states. The object URLs it
 * hands back are cached and shared, so they are deliberately never revoked here
 * — only an explicit removal releases one.
 */
function useMediaUrl(item: MediaItem): UrlState {
  const [state, setState] = useState<UrlState>({ status: 'resolving' })
  // Editing alt text hands us a new object for the same bytes; keying the effect
  // on the identity of the media keeps that from re-flashing the skeleton.
  const latest = useRef(item)
  latest.current = item
  const { id, dataUri } = item

  useEffect(() => {
    let alive = true
    setState({ status: 'resolving' })
    resolveMediaUrl(latest.current)
      .then((url) => {
        if (!alive) return
        setState(url === null ? { status: 'missing' } : { status: 'ready', url })
      })
      .catch(() => {
        if (alive) setState({ status: 'missing' })
      })
    return () => {
      alive = false
    }
  }, [id, dataUri])

  return state
}

/* ----------------------------------------------------------------- tile */

interface TileProps {
  item: MediaItem
  index: number
  count: number
  selected: boolean
  disabled: boolean
  onSelect: (id: string) => void
  onRemove: (item: MediaItem) => void
  onMove: (index: number, delta: number) => void
}

function MediaTile({
  item, index, count, selected, disabled, onSelect, onRemove, onMove,
}: TileProps) {
  const url = useMediaUrl(item)
  const isImage = item.kind === 'image'
  const duration = formatDuration(item.durationSec)

  return (
    <li className="mp-tile" data-selected={selected ? 'true' : 'false'}>
      <button
        type="button"
        className="mp-tile-select"
        aria-pressed={selected}
        aria-label={`${isImage ? 'Photo' : 'Video'} ${index + 1} of ${count}`}
        disabled={disabled}
        onClick={() => onSelect(item.id)}
      >
        {url.status === 'resolving' && <span className="mp-skel" aria-hidden="true" />}

        {url.status === 'missing' && (
          <span className="mp-gone">
            <span className="mp-gone-glyph" aria-hidden="true">⚠</span>
            Unavailable
          </span>
        )}

        {url.status === 'ready' && (
          isImage ? (
            <img className="mp-media" src={url.url} alt={item.alt} />
          ) : item.posterUri !== null ? (
            <img className="mp-media" src={item.posterUri} alt="" />
          ) : (
            <video className="mp-media" src={url.url} muted playsInline preload="metadata" />
          )
        )}

        {!isImage && (
          <span className="mp-badge" aria-hidden="true">
            <span className="mp-play">▶</span>
            {duration !== '' && <span className="num">{duration}</span>}
          </span>
        )}

        {isImage && item.alt.trim() !== '' && (
          <span className="mp-flag" aria-hidden="true">ALT</span>
        )}
      </button>

      <button
        type="button"
        className="mp-icon mp-remove"
        aria-label={isImage ? 'Remove photo' : 'Remove video'}
        disabled={disabled}
        onClick={() => onRemove(item)}
      >
        <span aria-hidden="true">✕</span>
      </button>

      <div className="mp-move">
        <button
          type="button"
          className="mp-icon"
          aria-label="Move earlier"
          disabled={disabled || index === 0}
          onClick={() => onMove(index, -1)}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <button
          type="button"
          className="mp-icon"
          aria-label="Move later"
          disabled={disabled || index === count - 1}
          onClick={() => onMove(index, 1)}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </li>
  )
}

/* ------------------------------------------------------------ alt editor */

interface AltFieldProps {
  item: MediaItem
  disabled: boolean
  onAlt: (id: string, value: string) => void
}

/** Only the selected photo gets one, so the composer stays small. */
function AltField({ item, disabled, onAlt }: AltFieldProps) {
  const altId = useId()
  return (
    <div className="mp-alt">
      <label className="field-label" htmlFor={altId}>Describe this photo</label>
      <input
        id={altId}
        type="text"
        value={item.alt}
        maxLength={280}
        disabled={disabled}
        placeholder="Heads-up at a final table, chips stacked high"
        onChange={(event) => onAlt(item.id, event.target.value)}
      />
      <div className="field-hint">
        Read aloud to anyone using a screen reader. Say what is in the shot —
        no need to start with “photo of”.
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- picker */

interface Progress {
  done: number
  total: number
}

export default function MediaPicker({ items, onChange, disabled = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const aliveRef = useRef(true)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ephemeral, setEphemeral] = useState(false)

  useEffect(() => {
    aliveRef.current = true
    setEphemeral(isEphemeral())
    return () => {
      aliveRef.current = false
    }
  }, [])

  const busy = progress !== null
  const full = items.length >= MEDIA_LIMITS.perPost
  const locked = disabled || busy
  const remaining = Math.max(0, MEDIA_LIMITS.perPost - items.length)
  const selected = items.find((m) => m.id === selectedId) ?? null
  const totalBytes = items.reduce((sum, m) => sum + m.byteSize, 0)

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    // Read the FileList synchronously — the synthetic event is not safe to touch
    // after the first await.
    const picked = Array.from(event.target.files ?? [])
    if (picked.length === 0) return

    const accepted = picked.slice(0, remaining)
    const skipped = picked.length - accepted.length
    const problems: string[] = []
    if (skipped > 0) {
      problems.push(
        `Only ${MEDIA_LIMITS.perPost} files fit on one post — ` +
        `${skipped} ${skipped === 1 ? 'was' : 'were'} skipped.`,
      )
    }
    setErrors([])

    let next = items
    try {
      for (let i = 0; i < accepted.length; i += 1) {
        // A file that failed keeps the loop going, so re-check before touching
        // state again — the composer may have closed during the last await.
        if (!aliveRef.current) return
        const file = accepted[i]
        setProgress({ done: i, total: accepted.length })
        try {
          // One at a time: video ingestion is heavy, and a failure on one file
          // must not take the rest of the batch down with it.
          const added = await ingestFile(file)
          if (!aliveRef.current) {
            // The bytes are already stored but nothing will ever reference
            // them now, so drop them rather than orphan the blob.
            deleteMedia([added]).catch(() => undefined)
            return
          }
          next = [...next, added]
          onChange(next)
        } catch (err) {
          problems.push(
            err instanceof MediaError
              ? err.message
              : `${file.name || 'That file'} could not be added.`,
          )
        }
      }
    } finally {
      if (aliveRef.current) {
        setProgress(null)
        setErrors(problems)
        // Ingesting is the first thing that opens IndexedDB, so this is the
        // first moment the storage verdict is genuinely known.
        setEphemeral(isEphemeral())
      }
      // Re-picking the same file has to re-fire change.
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function handleRemove(item: MediaItem) {
    onChange(items.filter((m) => m.id !== item.id))
    if (selectedId === item.id) setSelectedId(null)
    releaseMediaUrl(item.id)
    // Best effort — the post is already correct either way.
    deleteMedia([item]).catch(() => undefined)
  }

  function handleMove(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= items.length) return
    const next = items.slice()
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    onChange(next)
  }

  function handleSelect(id: string) {
    setSelectedId((current) => (current === id ? null : id))
  }

  function handleAlt(id: string, value: string) {
    onChange(items.map((m) => (m.id === id ? { ...m, alt: value } : m)))
  }

  const needsAltPrompt =
    selected === null && items.some((m) => m.kind === 'image')

  return (
    <div className="mp-root">
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/*,video/*"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => { void handleFiles(event) }}
      />

      <div className="mp-actions">
        <button
          type="button"
          className="btn"
          disabled={locked || full}
          onClick={() => inputRef.current?.click()}
        >
          <span className="mp-glyph" aria-hidden="true"><Icon name="camera" size={16} /></span>
          {busy ? 'Adding…' : 'Add photo or video'}
        </button>
        {items.length > 0 && (
          <span className="mp-count faint">
            <span className="num">{items.length}</span>
            <span aria-hidden="true"> / </span>
            <span className="sr-only">of</span>
            <span className="num">{MEDIA_LIMITS.perPost}</span>
          </span>
        )}
      </div>

      <div className="mp-status" role="status">
        {progress !== null && (
          <div className="field-hint">
            Adding {Math.min(progress.done + 1, progress.total)} of {progress.total}…
          </div>
        )}
        {progress === null && full && (
          <div className="field-hint">
            {MEDIA_LIMITS.perPost} of {MEDIA_LIMITS.perPost} — that is the limit for one post
          </div>
        )}
        {progress === null && !full && items.length > 0 && (
          <div className="field-hint">
            Room for {remaining} more {remaining === 1 ? 'file' : 'files'}.
          </div>
        )}
      </div>

      {ephemeral && (
        <div className="field-hint mp-warn">
          <span className="mp-warn-glyph" aria-hidden="true">⚠</span>
          This browser is blocking storage, so anything you attach here disappears
          when the page reloads. Post before you refresh.
        </div>
      )}

      {errors.length > 0 && (
        <div className="field-error" role="alert">
          <ul className="mp-errors">
            {errors.map((message, i) => (
              <li key={`${i}-${message}`}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      {items.length > 0 && (
        <ul className="mp-strip">
          {items.map((item, i) => (
            <MediaTile
              key={item.id}
              item={item}
              index={i}
              count={items.length}
              selected={item.id === selectedId}
              disabled={locked}
              onSelect={handleSelect}
              onRemove={handleRemove}
              onMove={handleMove}
            />
          ))}
        </ul>
      )}

      {selected !== null && selected.kind === 'image' && (
        <AltField item={selected} disabled={locked} onAlt={handleAlt} />
      )}

      {needsAltPrompt && (
        <div className="field-hint">
          Tap a photo to describe it for screen readers.
        </div>
      )}

      {items.length > 0 && (
        <div className="mp-foot faint">
          <span>
            <span className="num">{items.length}</span>
            {items.length === 1 ? ' file' : ' files'}
            {' · '}
            <span className="num">{prettyBytes(totalBytes)}</span>
          </span>
        </div>
      )}
    </div>
  )
}
