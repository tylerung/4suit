// Photo/video attachments: ingestion, storage, resolution and cleanup.
import * as api from '../src/lib/api'
import * as media from '../src/lib/media'
import { AVATAR_PHOTO, MEDIA_LIMITS, type MediaItem } from '../src/types'
import { reportResult } from './report'

let failures = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  ok   ${name}`)
  else { failures++; console.log(`  FAIL ${name} ${detail}`) }
}

function fileOf(name: string, type: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

async function main() {
  api.resetDB()
  api.signIn('u-you')
  const me = api.getCurrentUser()!

  console.log('\n— seeded demo media —')
  {
    const withMedia = api.listFeed(me.id, 'discover').filter((f) => f.post.media.length > 0)
    check('some seeded posts carry media', withMedia.length > 0, `${withMedia.length} posts`)
    const all = withMedia.flatMap((f) => f.post.media)
    check('seeded media is inline, needing no blob store',
      all.every((m) => m.dataUri !== null))
    check('seeded media declares its dimensions',
      all.every((m) => m.width > 0 && m.height > 0))
    check('seeded images carry alt text', all.every((m) => m.alt.trim().length > 0))
    check('a seeded item resolves to its data URI',
      (await media.resolveMediaUrl(all[0])) === all[0].dataUri)
    check('no seeded post exceeds the per-post cap',
      withMedia.every((f) => f.post.media.length <= MEDIA_LIMITS.perPost))
  }

  console.log('\n— rejecting what is not postable —')
  {
    let msg = ''
    try { await media.ingestFile(fileOf('hand-history.txt', 'text/plain', 10)) }
    catch (e) { msg = (e as Error).message }
    check('a text file is refused', msg.includes('not a photo or a video'), msg)
    check('the refusal names the file', msg.includes('hand-history.txt'), msg)

    msg = ''
    try { await media.ingestFile(fileOf('huge.jpg', 'image/jpeg', MEDIA_LIMITS.imageBytes + 1)) }
    catch (e) { msg = (e as Error).message }
    check('an oversized photo is refused', msg.includes('under'), msg)
    check('the refusal is a MediaError', msg !== '')

    msg = ''
    try { await media.ingestFile(fileOf('huge.mp4', 'video/mp4', MEDIA_LIMITS.videoBytes + 1)) }
    catch (e) { msg = (e as Error).message }
    check('an oversized video is refused', msg.includes('Videos'), msg)

    // Videos get the larger allowance, so an image-sized video sails through.
    const ok = await media.ingestFile(fileOf('clip.mp4', 'video/mp4', MEDIA_LIMITS.imageBytes + 1))
    check('a video over the photo cap is still fine', ok.kind === 'video')
    await media.deleteMedia([ok])
  }

  console.log('\n— ingesting and resolving —')
  let stored: MediaItem
  {
    stored = await media.ingestFile(fileOf('table.jpg', 'image/jpeg', 2048))
    check('kind is derived from the mime type', stored.kind === 'image')
    check('bytes are NOT inlined into the sync store', stored.dataUri === null)
    check('dimensions come from the decoder', stored.width === 1200 && stored.height === 900)
    check('byte size is recorded', stored.byteSize === 2048, String(stored.byteSize))
    check('alt starts empty for the author to fill in', stored.alt === '')

    const url = await media.resolveMediaUrl(stored)
    check('a stored item resolves to an object URL', !!url && url.startsWith('blob:'), String(url))
    check('resolution is cached, returning the same URL',
      (await media.resolveMediaUrl(stored)) === url)

    const missing: MediaItem = { ...stored, id: 'm-does-not-exist' }
    check('a missing blob resolves to null rather than throwing',
      (await media.resolveMediaUrl(missing)) === null)
  }

  console.log('\n— attaching to a post —')
  {
    const post = api.createPost(me.id, {
      kind: 'text', body: 'Table shot from tonight.', media: [stored],
    })
    check('the post carries its attachment', post.media.length === 1)
    check('the attachment survives a re-read',
      api.getPost(post.id)?.media[0].id === stored.id)
    check('the feed hydrates it', api.listFeed(me.id, 'following')
      .find((f) => f.post.id === post.id)?.post.media.length === 1)

    // The cap is enforced by the API, not just the picker UI.
    const many = Array.from({ length: MEDIA_LIMITS.perPost + 3 }, (_, i) => ({ ...stored, id: `m-x${i}` }))
    const capped = api.createPost(me.id, { kind: 'text', body: 'Too many', media: many })
    check('the API caps attachments per post',
      capped.media.length === MEDIA_LIMITS.perPost, String(capped.media.length))
    api.deletePost(capped.id)

    // Deleting the post must not strand the blob in IndexedDB.
    const before = await media.resolveMediaUrl(stored)
    check('blob is present before the delete', before !== null)
    media.releaseMediaUrl(stored.id)
    api.deletePost(post.id)
    await new Promise((r) => setTimeout(r, 50))   // cleanup is fire-and-forget
    check('deleting the post drops its blob too',
      (await media.resolveMediaUrl(stored)) === null)
    check('the post itself is gone', api.getPost(post.id) === null)
  }

  console.log('\n— rating posts clean up their media too —')
  {
    const shot = await media.ingestFile(fileOf('room.jpg', 'image/jpeg', 512))
    const rating = api.saveRating(me.id, {
      venueId: 'v-borgata',
      subscores: { gameQuality: 4, tableAvailability: 4, dealers: 4, comps: 4, atmosphere: 4, value: 4 },
      review: 'Solid.', stakesPlayed: '$2/$5 NLHE',
    })
    const post = api.createPost(me.id, {
      kind: 'rating', body: 'Rated it.', venueId: 'v-borgata',
      ratingId: rating.id, media: [shot],
    })
    check('the rating post has media', api.getPost(post.id)?.media.length === 1)
    media.releaseMediaUrl(shot.id)
    api.deleteRating(rating.id)
    await new Promise((r) => setTimeout(r, 50))
    check('deleting the rating removes its post', api.getPost(post.id) === null)
    check('and releases that post\'s blob',
      (await media.resolveMediaUrl(shot)) === null)
  }

  console.log('\n— reset clears stored media —')
  {
    const shot = await media.ingestFile(fileOf('x.jpg', 'image/jpeg', 256))
    check('blob exists before reset', (await media.resolveMediaUrl(shot)) !== null)
    media.releaseMediaUrl(shot.id)
    api.resetDB()
    await new Promise((r) => setTimeout(r, 50))
    check('reset wipes the blob store', (await media.resolveMediaUrl(shot)) === null)
  }

  console.log('\n— profile photos —')
  {
    // jsdom has no 2d canvas. Stand in one that records the crop, then put the
    // real (null-returning) one back so the post-photo path above is untouched.
    const proto = window.HTMLCanvasElement.prototype
    const realGetContext = proto.getContext
    const realToDataURL = proto.toDataURL
    const g = globalThis as unknown as { Image: unknown }
    const RealImage = g.Image
    const small = 'data:image/jpeg;base64,/9j/AAAA'
    let crop: number[] = []
    let out = { w: 0, h: 0 }
    let qualities: number[] = []
    let encode = (_q: number) => small

    proto.getContext = function (this: HTMLCanvasElement) {
      const canvas = this
      return {
        fillStyle: '',
        fillRect() {},
        drawImage(_img: unknown, ...args: number[]) {
          crop = args.slice(0, 4)
          out = { w: canvas.width, h: canvas.height }
        },
      }
    } as unknown as typeof proto.getContext
    proto.toDataURL = (_type?: string, q?: number) => {
      qualities.push(q ?? 1)
      return encode(q ?? 1)
    }

    const refusal = async (file: File) => {
      try { await media.makeAvatarPhoto(file); return '' }
      catch (e) { return (e as Error).message }
    }

    try {
      const uri = await media.makeAvatarPhoto(fileOf('me.jpg', 'image/jpeg', 4096))
      check('a photo comes back as a JPEG data URI', uri === small, uri.slice(0, 30))
      // The stub decoder reports every image as 1200×900, i.e. landscape.
      check('a landscape photo is cropped to its centre square',
        crop.join() === '150,0,900,900', crop.join())
      check('and shrunk to the avatar edge',
        out.w === AVATAR_PHOTO.edge && out.h === AVATAR_PHOTO.edge, `${out.w}×${out.h}`)
      check('the result passes profile validation',
        api.updateProfile(me.id, { avatarPhoto: uri }) === null)
      api.updateProfile(me.id, { avatarPhoto: null })

      class SmallPortrait {
        naturalWidth = 200
        naturalHeight = 260
        onload: (() => void) | null = null
        set src(_v: string) { setTimeout(() => this.onload?.(), 0) }
      }
      g.Image = SmallPortrait
      await media.makeAvatarPhoto(fileOf('small.jpg', 'image/jpeg', 1024))
      check('a portrait photo is cropped to its centre square',
        crop.join() === '0,30,200,200', crop.join())
      check('a photo smaller than the edge is not enlarged', out.w === 200, String(out.w))
      g.Image = RealImage

      qualities = []
      encode = (q) => 'data:image/jpeg;base64,' + 'A'.repeat(q > 0.7 ? AVATAR_PHOTO.maxChars : 1000)
      const shrunk = await media.makeAvatarPhoto(fileOf('noisy.jpg', 'image/jpeg', 4096))
      check('quality steps down until the photo fits',
        qualities.length === 3 && shrunk.length <= AVATAR_PHOTO.maxChars, qualities.join())
      encode = () => 'data:image/jpeg;base64,' + 'A'.repeat(AVATAR_PHOTO.maxChars)
      const tooBig = await refusal(fileOf('noisier.jpg', 'image/jpeg', 4096))
      check('a photo that never fits is refused rather than stored', tooBig.includes('small enough'), tooBig)
      encode = () => small

      const notImage = await refusal(fileOf('notes.txt', 'text/plain', 10))
      check('a non-image is refused by name', notImage.includes('notes.txt is not a photo'), notImage)
      const video = await refusal(fileOf('clip.mp4', 'video/mp4', 10))
      check('so is a video', video.includes('not a photo'), video)
      const huge = await refusal(fileOf('huge.jpg', 'image/jpeg', MEDIA_LIMITS.imageBytes + 1))
      check('an oversized photo is refused', huge.includes('under'), huge)
      // The shared stub decodes by URL, and an object URL never carries the
      // file name, so stand in a decoder that always fails.
      class BrokenImage {
        onerror: (() => void) | null = null
        set src(_v: string) { setTimeout(() => this.onerror?.(), 0) }
      }
      g.Image = BrokenImage
      const broken = await refusal(fileOf('corrupt.jpg', 'image/jpeg', 64))
      check('an undecodable photo is refused', broken.includes('could not be read'), broken)
      g.Image = RealImage
    } finally {
      proto.getContext = realGetContext
      proto.toDataURL = realToDataURL
      g.Image = RealImage
    }

    // Post photos fall back to the original when there is no canvas; an avatar
    // must not, because the original is exactly what the sync store cannot hold.
    const noCanvas = await refusal(fileOf('me.jpg', 'image/jpeg', 512))
    check('with no canvas the photo is refused, not stored uncropped',
      noCanvas.includes('cannot resize'), noCanvas)
  }

  console.log('\n— helpers —')
  {
    check('kindOf reads image mimes', media.kindOf('image/png') === 'image')
    check('kindOf reads video mimes', media.kindOf('video/quicktime') === 'video')
    check('kindOf rejects anything else', media.kindOf('application/pdf') === null)
    check('duration formats as m:ss', media.formatDuration(64) === '1:04', media.formatDuration(64))
    check('duration pads seconds', media.formatDuration(9) === '0:09', media.formatDuration(9))
    check('unknown duration is blank', media.formatDuration(null) === '')
    check('negative duration is blank', media.formatDuration(-3) === '')
    check('bytes format small', media.prettyBytes(820) === '820 B', media.prettyBytes(820))
    check('bytes format KB', media.prettyBytes(2048) === '2 KB', media.prettyBytes(2048))
    check('bytes format MB', media.prettyBytes(3_500_000) === '3.3 MB', media.prettyBytes(3_500_000))
    check('IndexedDB is in use, not the memory fallback', media.isEphemeral() === false)
  }

  console.log(`\n${failures === 0 ? 'ALL MEDIA CHECKS PASS' : failures + ' MEDIA FAILURES'}\n`)
  reportResult(failures)
}

main().catch((e) => {
  console.log('HARNESS ERROR:', (e as Error).stack)
  reportResult(1)
})
