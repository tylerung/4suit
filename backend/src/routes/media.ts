import { Router } from 'express'
import multer from 'multer'
import { badRequest, route } from '../lib/errors.js'
import { actorId, requireUser } from '../middleware/auth.js'
import { env } from '../config/env.js'
import { mediaUploadMetaSchema } from '../validation/schemas.js'
import { deleteOwnUpload, openMedia, storeUpload } from '../services/media.js'

/**
 * Uploads are buffered in memory and handed straight to GridFS. A file is
 * capped twice: multer refuses anything over the configured ceiling before a
 * byte reaches a route, and the media service applies the per-kind limit.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadBytes, files: 1 },
})

export const mediaRouter: Router = Router()

mediaRouter.post('/', requireUser, upload.single('file'), route(async (req, res) => {
  if (!req.file) throw badRequest('No file was uploaded.')
  const meta = mediaUploadMetaSchema.parse(req.body)
  const item = await storeUpload({
    buffer: req.file.buffer,
    mime: req.file.mimetype,
    originalName: req.file.originalname,
    ownerId: actorId(req),
    width: meta.width,
    height: meta.height,
    durationSec: meta.durationSec,
    posterUri: meta.posterUri,
  })
  res.status(201).json(item)
}))

/**
 * Serving the bytes. Attachments are immutable once stored — a new upload gets
 * a new id — so they can be cached hard.
 */
mediaRouter.get('/:id', route(async (req, res) => {
  const file = await openMedia(req.params.id)
  res.setHeader('Content-Type', file.mime)
  res.setHeader('Content-Length', String(file.byteSize))
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  file.stream.on('error', () => res.destroy())
  file.stream.pipe(res)
}))

/** Clean up an upload that never made it onto a post. */
mediaRouter.delete('/:id', requireUser, route(async (req, res) => {
  await deleteOwnUpload(req.params.id, actorId(req))
  res.status(204).end()
}))
