import { AVATAR_PHOTO, MEDIA_LIMITS, type MediaItem, type MediaKind } from '../types'
import { newId } from './storage'

/**
 * Photo and video storage.
 *
 * The rest of the app keeps its whole state in one localStorage document, which
 * is the wrong home for media: a single phone photo would exhaust the ~5MB quota
 * on its own, and `persist()` swallows the resulting QuotaExceededError, so a
 * post would appear to save and then vanish on reload. So the bytes go to
 * IndexedDB — which holds orders of magnitude more and stores Blobs natively,
 * with no base64 inflation — and only the metadata rides in the sync store.
 *
 * IndexedDB is unavailable in some contexts (private windows, blocked site data,
 * jsdom). Everything here degrades to an in-memory map rather than throwing, so
 * the app still works; the media just does not survive a reload.
 */

const DB_NAME = 'railbird-media'
const DB_VERSION = 1
const STORE = 'blobs'

/** Fallback when IndexedDB cannot be opened. Lives only for this page load. */
const memory = new Map<string, Blob>()
let usingMemory = false

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDB(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { usingMemory = true; resolve(null); return }
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => { usingMemory = true; resolve(null) }
      req.onblocked = () => { usingMemory = true; resolve(null) }
    } catch {
      usingMemory = true
      resolve(null)
    }
  })
  return dbPromise
}

/** True when blobs are only in memory, so media will not survive a reload. */
export function isEphemeral(): boolean {
  return usingMemory
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE)
}

async function putBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDB()
  if (!db) { memory.set(id, blob); return }
  await new Promise<void>((resolve, reject) => {
    const req = tx(db, 'readwrite').put(blob, id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error ?? new Error('Could not save that file.'))
  })
}

async function getBlob(id: string): Promise<Blob | null> {
  const db = await openDB()
  if (!db) return memory.get(id) ?? null
  return new Promise<Blob | null>((resolve) => {
    const req = tx(db, 'readonly').get(id)
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null)
    req.onerror = () => resolve(null)
  })
}

async function removeBlob(id: string): Promise<void> {
  const db = await openDB()
  if (!db) { memory.delete(id); return }
  await new Promise<void>((resolve) => {
    const req = tx(db, 'readwrite').delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
  })
}

/** Drop the blobs behind these media items. Safe to call with seeded media. */
export async function deleteMedia(items: MediaItem[]): Promise<void> {
  await Promise.all(items.filter((m) => m.dataUri === null).map((m) => removeBlob(m.id)))
}

/** Wipe every stored blob — used by the "reset demo data" action. */
export async function clearAllMedia(): Promise<void> {
  memory.clear()
  const db = await openDB()
  if (!db) return
  await new Promise<void>((resolve) => {
    const req = tx(db, 'readwrite').clear()
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
  })
}

/* ------------------------------------------------------------- resolving */

const urlCache = new Map<string, string>()

/**
 * A displayable URL for an item. Seeded media returns its inline data URI;
 * everything else becomes an object URL, cached so repeated renders of the same
 * attachment do not leak a new URL each time.
 */
export async function resolveMediaUrl(item: MediaItem): Promise<string | null> {
  if (item.dataUri) return item.dataUri
  const cached = urlCache.get(item.id)
  if (cached) return cached
  const blob = await getBlob(item.id)
  if (!blob) return null
  const url = URL.createObjectURL(blob)
  urlCache.set(item.id, url)
  return url
}

/** Release a cached object URL. Called when media is deleted, not on unmount. */
export function releaseMediaUrl(id: string): void {
  const url = urlCache.get(id)
  if (!url) return
  URL.revokeObjectURL(url)
  urlCache.delete(id)
}

/* -------------------------------------------------------------- ingestion */

export function kindOf(mime: string): MediaKind | null {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  return null
}

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Thrown with a message written for the person doing the posting. */
export class MediaError extends Error {}

function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new MediaError('That image could not be read.'))
    img.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') { resolve(null); return }
    canvas.toBlob((b) => resolve(b), mime, quality)
  })
}

interface Normalised {
  blob: Blob
  width: number
  height: number
  mime: string
  durationSec: number | null
  posterUri: string | null
}

/**
 * Shrink oversized photos before they are stored. A 4000px photo in a 640px
 * column is wasted bytes, and the smaller file is what keeps a few posts of
 * holiday photos from filling the user's disk quota.
 */
async function normaliseImage(file: File): Promise<Normalised> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImageEl(url)
    const w = img.naturalWidth || img.width
    const h = img.naturalHeight || img.height
    const longest = Math.max(w, h)
    const asIs: Normalised = {
      blob: file, width: w, height: h, mime: file.type,
      durationSec: null, posterUri: null,
    }
    // Re-encoding a GIF to JPEG would throw away the animation.
    if (file.type === 'image/gif' || longest <= MEDIA_LIMITS.maxImageEdge) return asIs
    if (typeof document === 'undefined') return asIs

    const scale = MEDIA_LIMITS.maxImageEdge / longest
    const cw = Math.max(1, Math.round(w * scale))
    const ch = Math.max(1, Math.round(h * scale))
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')
    if (!ctx) return asIs
    ctx.drawImage(img, 0, 0, cw, ch)
    const out = await canvasToBlob(canvas, 'image/jpeg', 0.85)
    // Keep the original if re-encoding did not actually help.
    if (!out || out.size >= file.size) return asIs
    return { blob: out, width: cw, height: ch, mime: 'image/jpeg', durationSec: null, posterUri: null }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Read a video's dimensions and duration, and grab a first frame to use as the
 * poster so the feed shows something before playback starts. Any failure here is
 * cosmetic, so it degrades to "no poster" rather than rejecting the upload.
 */
async function probeVideo(file: File): Promise<Normalised> {
  const base: Normalised = {
    blob: file, width: 0, height: 0, mime: file.type,
    durationSec: null, posterUri: null,
  }
  if (typeof document === 'undefined') return base

  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.muted = true
  // Required for the frame grab to work on iOS Safari.
  video.playsInline = true

  try {
    const meta = await new Promise<boolean>((resolve) => {
      const done = (ok: boolean) => resolve(ok)
      video.onloadedmetadata = () => done(true)
      video.onerror = () => done(false)
      window.setTimeout(() => done(false), 5000)
      video.src = url
    })
    if (!meta) return base

    base.width = video.videoWidth
    base.height = video.videoHeight
    base.durationSec = Number.isFinite(video.duration) ? video.duration : null

    const seeked = await new Promise<boolean>((resolve) => {
      video.onseeked = () => resolve(true)
      video.onerror = () => resolve(false)
      window.setTimeout(() => resolve(false), 5000)
      // A hair into the clip: frame zero is often black.
      video.currentTime = Math.min(0.1, (video.duration || 1) / 10)
    })
    if (!seeked || !video.videoWidth) return base

    const scale = Math.min(1, MEDIA_LIMITS.maxImageEdge / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return base
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    if (typeof canvas.toDataURL === 'function') {
      base.posterUri = canvas.toDataURL('image/jpeg', 0.6)
    }
    return base
  } catch {
    return base
  } finally {
    video.removeAttribute('src')
    URL.revokeObjectURL(url)
  }
}

/**
 * Validate a picked file, normalise it, store the bytes and return the metadata
 * to hang on the post. Throws MediaError with a message worth showing.
 */
export async function ingestFile(file: File): Promise<MediaItem> {
  const kind = kindOf(file.type)
  if (!kind) {
    throw new MediaError(`${file.name || 'That file'} is not a photo or a video.`)
  }

  const cap = kind === 'image' ? MEDIA_LIMITS.imageBytes : MEDIA_LIMITS.videoBytes
  if (file.size > cap) {
    throw new MediaError(
      `${kind === 'image' ? 'Photos' : 'Videos'} have to be under ${prettyBytes(cap)} — ` +
      `that one is ${prettyBytes(file.size)}.`,
    )
  }

  const norm = kind === 'image' ? await normaliseImage(file) : await probeVideo(file)

  const id = newId('m')
  try {
    await putBlob(id, norm.blob)
  } catch {
    throw new MediaError('There was no room to store that file. Try a smaller one.')
  }

  return {
    id,
    kind,
    mime: norm.mime || file.type,
    dataUri: null,
    width: norm.width,
    height: norm.height,
    durationSec: norm.durationSec,
    posterUri: norm.posterUri,
    byteSize: norm.blob.size,
    alt: '',
  }
}

/* -------------------------------------------------------- profile photos */

/**
 * Turn a picked file into a profile photo: centre-cropped square, shrunk to
 * AVATAR_PHOTO.edge, returned as a JPEG data URI.
 *
 * These are the one kind of image that does NOT go to IndexedDB. An avatar is
 * drawn on every post, comment and row, and in the nav bar, so it has to be on
 * hand synchronously — resolving a blob per face would flash initials on every
 * mount. Cropped and shrunk, a photo is tens of KB, so it rides on the user
 * record in the sync store instead.
 */
export async function makeAvatarPhoto(file: File): Promise<string> {
  if (kindOf(file.type) !== 'image') {
    throw new MediaError(`${file.name || 'That file'} is not a photo.`)
  }
  if (file.size > MEDIA_LIMITS.imageBytes) {
    throw new MediaError(
      `Photos have to be under ${prettyBytes(MEDIA_LIMITS.imageBytes)} — ` +
      `that one is ${prettyBytes(file.size)}.`,
    )
  }

  const url = URL.createObjectURL(file)
  try {
    const img = await loadImageEl(url)
    const w = img.naturalWidth || img.width
    const h = img.naturalHeight || img.height
    if (!w || !h) throw new MediaError('That image could not be read.')

    // Unlike post photos, the original is never an acceptable fallback here:
    // an uncropped 4000px photo is exactly what the sync store cannot hold.
    const side = Math.min(w, h)
    const edge = Math.min(AVATAR_PHOTO.edge, side)   // never enlarge a small photo
    const canvas = document.createElement('canvas')
    canvas.width = edge
    canvas.height = edge
    const ctx = canvas.getContext('2d')
    if (!ctx || typeof canvas.toDataURL !== 'function') {
      throw new MediaError('This browser cannot resize photos, so it cannot set one.')
    }
    // JPEG has no transparency; without a fill a cut-out PNG would go black.
    ctx.fillStyle = '#E4E6EB'
    ctx.fillRect(0, 0, edge, edge)
    ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, edge, edge)

    // Noisy photos compress badly; step the quality down before giving up.
    for (const quality of [0.86, 0.74, 0.6]) {
      const uri = canvas.toDataURL('image/jpeg', quality)
      if (uri.length <= AVATAR_PHOTO.maxChars) return uri
    }
    throw new MediaError('That photo would not shrink small enough. Try a different one.')
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** "1:04" / "0:09" for a video duration badge. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return ''
  const total = Math.round(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export { prettyBytes }
