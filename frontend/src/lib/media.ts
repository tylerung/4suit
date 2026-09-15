import { AVATAR_PHOTO, MEDIA_LIMITS, type MediaItem, type MediaKind } from '../types'
import { del, upload, url } from './client'

/**
 * Photo and video handling on the client.
 *
 * The bytes live on the server now (GridFS, behind /api/media), so this file no
 * longer stores anything — what is left is the part that genuinely belongs in a
 * browser: reading the file the user picked, shrinking an oversized photo and
 * grabbing a poster frame from a video before either goes over the wire. A
 * server cannot use a canvas, and a 12MB photo should not be uploaded at full
 * size only to be resized on arrival.
 *
 * The size and type rules are re-applied server-side. The checks here exist to
 * fail fast with a good message, not to be the only thing enforcing them.
 */

/** A displayable URL for an item: inline for seeded media, otherwise the API. */
export function mediaUrl(item: MediaItem): string {
  return item.dataUri ?? url(`/media/${encodeURIComponent(item.id)}`)
}

/** Drop uploads that never made it onto a post (removed, or a cancelled draft). */
export async function deleteMedia(items: MediaItem[]): Promise<void> {
  await Promise.all(
    items
      .filter((m) => m.dataUri === null)
      .map((m) => del(`/media/${encodeURIComponent(m.id)}`).catch(() => undefined)),
  )
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
 * Shrink oversized photos before they are uploaded. A 4000px photo in a 640px
 * column is wasted bytes on the wire and in the database, and the smaller file
 * is what keeps a few posts of holiday photos off everyone's data plan.
 */
async function normaliseImage(file: File): Promise<Normalised> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImageEl(objectUrl)
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
    URL.revokeObjectURL(objectUrl)
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

  const objectUrl = URL.createObjectURL(file)
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
      video.src = objectUrl
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
    URL.revokeObjectURL(objectUrl)
  }
}

/**
 * Validate a picked file, normalise it, upload the bytes and return the
 * metadata to hang on the post. Throws MediaError with a message worth showing.
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

  const form = new FormData()
  form.append('file', norm.blob, file.name || 'upload')
  form.append('width', String(norm.width))
  form.append('height', String(norm.height))
  if (norm.durationSec !== null) form.append('durationSec', String(norm.durationSec))
  if (norm.posterUri) form.append('posterUri', norm.posterUri)

  try {
    return await upload<MediaItem>('/media', form)
  } catch (err) {
    // The server's message is already written for a person; keep it, but as the
    // error type the composer knows how to display.
    throw new MediaError(err instanceof Error ? err.message : 'That file could not be uploaded.')
  }
}

/* -------------------------------------------------------- profile photos */

/**
 * Turn a picked file into a profile photo: centre-cropped square, shrunk to
 * AVATAR_PHOTO.edge, returned as a JPEG data URI.
 *
 * These are the one kind of image that is not uploaded as a file. An avatar is
 * drawn on every post, comment and row, and in the nav bar, so it has to arrive
 * with the user record rather than as a request per face. Cropped and shrunk, a
 * photo is tens of KB, so it rides on the user document.
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

  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImageEl(objectUrl)
    const w = img.naturalWidth || img.width
    const h = img.naturalHeight || img.height
    if (!w || !h) throw new MediaError('That image could not be read.')

    // Unlike post photos, the original is never an acceptable fallback here: an
    // uncropped 4000px photo is exactly what a user document cannot hold.
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
    URL.revokeObjectURL(objectUrl)
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
