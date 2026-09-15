import type { Readable } from 'node:stream'
import { collections, mediaBucket } from '../db/mongo.js'
import { newId } from '../db/ids.js'
import { MEDIA_LIMITS, type MediaItem, type MediaKind } from '../types.js'
import { badRequest, forbidden, notFound } from '../lib/errors.js'

/**
 * Photo and video storage.
 *
 * The bytes used to go into the browser's IndexedDB, which meant an attachment
 * existed only on the machine that posted it — everyone else's feed showed a
 * hole where the photo should be. They now go to GridFS, MongoDB's own store
 * for files past the 16MB document limit, and are served back by id.
 *
 * Files are addressed by their domain id (`m-…`) held in GridFS's `filename`,
 * so nothing outside this module has to know about the bucket's own ObjectIds.
 */

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

export interface UploadInput {
  buffer: Buffer
  mime: string
  originalName: string
  ownerId: string
  width: number
  height: number
  durationSec?: number
  posterUri?: string
}

/**
 * Store an uploaded file and return the metadata that hangs on the post. The
 * client shrinks photos and grabs a video poster before sending, but the size
 * and type rules are re-checked here — a client is not in a position to promise
 * anything about what it uploads.
 */
export async function storeUpload(input: UploadInput): Promise<MediaItem> {
  const kind = kindOf(input.mime)
  if (!kind) throw badRequest(`${input.originalName || 'That file'} is not a photo or a video.`)

  const cap = kind === 'image' ? MEDIA_LIMITS.imageBytes : MEDIA_LIMITS.videoBytes
  if (input.buffer.length > cap) {
    throw badRequest(
      `${kind === 'image' ? 'Photos' : 'Videos'} have to be under ${prettyBytes(cap)} — ` +
      `that one is ${prettyBytes(input.buffer.length)}.`,
    )
  }

  const id = newId('m')
  const bucket = mediaBucket()
  await new Promise<void>((resolve, reject) => {
    const stream = bucket.openUploadStream(id, {
      contentType: input.mime,
      metadata: { kind, ownerId: input.ownerId, originalName: input.originalName },
    })
    stream.on('error', reject)
    stream.on('finish', () => resolve())
    stream.end(input.buffer)
  })

  return {
    id,
    kind,
    mime: input.mime,
    dataUri: null,
    width: input.width,
    height: input.height,
    durationSec: kind === 'video' ? input.durationSec ?? null : null,
    posterUri: kind === 'video' ? input.posterUri ?? null : null,
    byteSize: input.buffer.length,
    alt: '',
  }
}

export interface StoredFile {
  stream: Readable
  mime: string
  byteSize: number
}

/** Open a stored file for streaming back to the browser. */
export async function openMedia(id: string): Promise<StoredFile> {
  const bucket = mediaBucket()
  const file = await bucket.find({ filename: id }).limit(1).next()
  if (!file) throw notFound('That file is no longer here.')
  return {
    stream: bucket.openDownloadStream(file._id),
    mime: file.contentType ?? 'application/octet-stream',
    byteSize: file.length,
  }
}

/**
 * Drop the blobs behind these media items. Safe to call with seeded media,
 * whose bytes are inline and have no blob to delete.
 */
export async function deleteMedia(items: MediaItem[]): Promise<void> {
  const ids = items.filter((m) => m.dataUri === null).map((m) => m.id)
  if (!ids.length) return
  const bucket = mediaBucket()
  const files = await bucket.find({ filename: { $in: ids } }).toArray()
  await Promise.all(files.map((f) => bucket.delete(f._id).catch(() => {})))
}

/** True when the id names a file this user uploaded and can still attach. */
export async function ownsMedia(id: string, ownerId: string): Promise<boolean> {
  const file = await mediaBucket().find({ filename: id }).limit(1).next()
  return file?.metadata?.ownerId === ownerId
}

/**
 * Drop one upload on the uploader's behalf — an attachment removed in the
 * composer, or a draft that was abandoned. A file already on a post is left
 * alone; deleting a post is what cleans those up, and nothing else should be
 * able to punch a hole in a published post.
 */
export async function deleteOwnUpload(id: string, ownerId: string): Promise<void> {
  const bucket = mediaBucket()
  const file = await bucket.find({ filename: id }).limit(1).next()
  if (!file) return
  if (file.metadata?.ownerId !== ownerId) throw forbidden('That attachment is not yours.')
  const attached = await collections.posts().countDocuments({ 'media.id': id }, { limit: 1 })
  if (attached > 0) throw badRequest('That attachment is on a post. Delete the post instead.')
  await bucket.delete(file._id)
}
