import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { MediaItem } from '../types'
import { formatDuration, mediaUrl } from '../lib/media'
import './MediaGrid.css'
import Icon from './Icon'

/**
 * Read-only display of a post's attachments, plus the full-screen viewer that
 * opens when a tile is tapped.
 *
 * An attachment's URL is known the moment its metadata is — it is an address on
 * the API — so tiles render straight away and the browser streams the bytes. A
 * file can still be gone (deleted from under a cached feed), which the browser
 * only reports when the element fails to load, so a tile must still lay out and
 * still be announced sensibly with nothing behind it.
 */

/* ------------------------------------------------------------- url state */

interface MediaUrl {
  url: string
  /** True once the browser has told us the file did not load. */
  missing: boolean
  onError: () => void
}

function useMediaUrl(item: MediaItem): MediaUrl {
  const url = mediaUrl(item)
  const [missing, setMissing] = useState(false)
  // Editing alt text hands us a new object for the same bytes; only a genuinely
  // different URL should clear a recorded failure.
  useEffect(() => { setMissing(false) }, [url])
  return { url, missing, onError: () => setMissing(true) }
}

/* ------------------------------------------------------------------ tile */

interface TileProps {
  item: MediaItem
  /** Position in the full attachment list. */
  index: number
  /** Length of the full attachment list, used for the label. */
  total: number
  /** Attachments hidden behind this tile; > 0 renders the "+N" overlay. */
  more: number
  /** True when this is the only tile, which gets the item's own aspect ratio. */
  single: boolean
  onOpen: (index: number) => void
}

function Tile({ item, index, total, more, single, onOpen }: TileProps) {
  const { url, missing, onError } = useMediaUrl(item)
  const isVideo = item.kind === 'video'
  const duration = isVideo ? formatDuration(item.durationSec) : ''

  let label = `Open ${isVideo ? 'video' : 'photo'} ${index + 1} of ${total}`
  if (duration !== '') label += `, ${duration}`
  if (more > 0) label += `, plus ${more} more`

  // Reserve the right box before the bytes arrive so the feed does not jump.
  const style: CSSProperties | undefined =
    single && item.width > 0 && item.height > 0
      ? { aspectRatio: `${item.width} / ${item.height}` }
      : undefined

  return (
    <button
      type="button"
      className="mg-tile"
      style={style}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onOpen(index) }}
      // The feed card is itself clickable; keep Enter/Space from reaching it.
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation() }}
    >
      {!missing && !isVideo && (
        <img
          className="mg-media"
          src={url}
          alt={item.alt || ''}
          loading="lazy"
          draggable={false}
          onError={onError}
        />
      )}

      {!missing && isVideo && (
        <video
          className="mg-media"
          src={url}
          poster={item.posterUri ?? undefined}
          muted
          playsInline
          preload="metadata"
          tabIndex={-1}
          aria-hidden="true"
          onError={onError}
        />
      )}

      {missing && (
        <span className="mg-missing">
          <span className="mg-missing-glyph" aria-hidden="true"><Icon name={isVideo ? 'no-media' : 'camera'} size={22} /></span>
          <span>{isVideo ? 'Video unavailable' : 'Photo unavailable'}</span>
        </span>
      )}

      {isVideo && !missing && (
        <span className="mg-play" aria-hidden="true">▶</span>
      )}

      {duration !== '' && !missing && (
        <span className="mg-badge num" aria-hidden="true">{duration}</span>
      )}

      {more > 0 && <span className="mg-more" aria-hidden="true">+{more}</span>}
    </button>
  )
}

/* -------------------------------------------------------------- lightbox */

function LightboxMedia({ item }: { item: MediaItem }) {
  const { url, missing, onError } = useMediaUrl(item)
  const isVideo = item.kind === 'video'

  if (missing) {
    return (
      <p className="mg-lb-note muted">
        <Icon name="no-media" size={15} />{' '}
        {isVideo ? 'This video is no longer available.' : 'This photo is no longer available.'}
      </p>
    )
  }

  if (isVideo) {
    return (
      <video
        className="mg-lb-media"
        src={url}
        poster={item.posterUri ?? undefined}
        controls
        autoPlay
        playsInline
        preload="metadata"
        onClick={(e) => e.stopPropagation()}
        onError={onError}
      />
    )
  }

  return (
    <img
      className="mg-lb-media"
      src={url}
      alt={item.alt || ''}
      onClick={(e) => e.stopPropagation()}
      onError={onError}
    />
  )
}

interface LightboxProps {
  items: MediaItem[]
  startIndex: number
  onClose: () => void
}

function Lightbox({ items, startIndex, onClose }: LightboxProps) {
  const count = items.length
  const [index, setIndex] = useState(startIndex)
  const closeRef = useRef<HTMLButtonElement | null>(null)

  const go = useCallback((delta: number) => {
    setIndex((i) => (count < 1 ? 0 : (i + delta + count) % count))
  }, [count])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (count < 2) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [count, go, onClose])

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    return () => {
      document.body.style.overflow = prevOverflow
      prevFocus?.focus()
    }
  }, [])

  const safeIndex = count > 0 ? Math.min(index, count - 1) : 0
  const item = items[safeIndex]
  if (!item) return null

  const caption = item.alt.trim()

  return createPortal(
    <div
      className="mg-lb"
      role="dialog"
      aria-modal="true"
      aria-label={item.kind === 'video' ? 'Video viewer' : 'Photo viewer'}
      // Portalled events still bubble through the React tree into the feed card,
      // so every handler in here stops them.
      onClick={(e) => { e.stopPropagation(); onClose() }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="mg-lb-bar">
        {count > 1 && (
          <span className="mg-lb-count num">{safeIndex + 1} / {count}</span>
        )}
        <span className="mg-lb-spacer" />
        <button
          ref={closeRef}
          type="button"
          className="mg-lb-btn"
          aria-label="Close"
          onClick={(e) => { e.stopPropagation(); onClose() }}
        >
          ×
        </button>
      </div>

      <div className="mg-lb-stage">
        <figure className="mg-lb-figure">
          <LightboxMedia key={item.id} item={item} />
          {caption !== '' && (
            <figcaption className="mg-lb-caption" onClick={(e) => e.stopPropagation()}>
              {caption}
            </figcaption>
          )}
        </figure>
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            className="mg-lb-nav mg-lb-prev"
            aria-label="Previous"
            onClick={(e) => { e.stopPropagation(); go(-1) }}
          >
            ‹
          </button>
          <button
            type="button"
            className="mg-lb-nav mg-lb-next"
            aria-label="Next"
            onClick={(e) => { e.stopPropagation(); go(1) }}
          >
            ›
          </button>
        </>
      )}
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------------------ grid */

interface Props {
  items: MediaItem[]
  /** Tighter height cap, for dense contexts like a quoted or inline preview. */
  compact?: boolean
}

export default function MediaGrid({ items, compact = false }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const close = useCallback(() => setOpenIndex(null), [])

  if (items.length === 0) return null

  // Four is the enforced ceiling; anything past it collapses into a "+N" tile.
  const shown = items.slice(0, 4)
  const more = items.length - shown.length

  return (
    <div className={`mg-grid mg-n${shown.length}${compact ? ' is-compact' : ''}`}>
      {shown.map((item, i) => (
        <Tile
          key={item.id}
          item={item}
          index={i}
          total={items.length}
          more={i === shown.length - 1 ? more : 0}
          single={shown.length === 1}
          onOpen={setOpenIndex}
        />
      ))}

      {openIndex !== null && (
        <Lightbox items={items} startIndex={openIndex} onClose={close} />
      )}
    </div>
  )
}
