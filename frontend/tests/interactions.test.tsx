// Drives real interactions against mounted screens: the map toggle, liking a
// post, submitting a rating, and flipping a list between public and private.
import { act } from 'react-dom/test-utils'
import * as api from '../src/lib/api'
import { ingestFile } from '../src/lib/media'
import { asUser, click, mountApp, settle, type Mounted } from './harness'
import { reportResult } from './report'


let failures = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  ok   ${name}`)
  else { failures++; console.log(`  FAIL ${name} ${detail}`) }
}

const mount = mountApp
const unmount = (m: Mounted) => m.unmount()

function findByText(host: HTMLElement, sel: string, text: string): HTMLElement | undefined {
  return Array.from(host.querySelectorAll<HTMLElement>(sel))
    .find((e) => (e.textContent ?? '').trim().toLowerCase().includes(text.toLowerCase()))
}

async function main() {
  // Every suite drives the real API, so it starts from the seeded dataset and
  // signs in before anything is mounted.
  await api.signIn('u-you')
  await api.resetDemoData()
  await api.signIn('u-you')

  console.log('\n— map toggle —')
  {
    const m = await mount('/rankings')
    check('rankings starts in list mode', m.host.querySelectorAll('.venue-row').length > 0)
    const mapBtn = findByText(m.host, 'button', 'map')
    check('a Map toggle exists', !!mapBtn)
    if (mapBtn) {
      await click(mapBtn)
      const hasLeaflet = !!m.host.querySelector('.leaflet-container')
      check('leaflet container mounts', hasLeaflet)
      const pins = m.host.querySelectorAll('.vm-pin').length
      check('markers render on the map', pins > 0, `pins=${pins}`)
      const legend = m.host.querySelector('.vm-legend')?.textContent ?? ''
      check('legend reports a room count', /\d+\s+rooms?\s+shown/.test(legend), legend)
      const listBtn = findByText(m.host, 'button', 'list')
      if (listBtn) {
        await click(listBtn)
        check('toggles back to the list', m.host.querySelectorAll('.venue-row').length > 0)
      }
    }
    await unmount(m)
  }

  console.log('\n— liking a post from the feed —')
  {
    const m = await mount('/')
    const cards = m.host.querySelectorAll('.post-card')
    check('feed renders posts', cards.length > 0, `cards=${cards.length}`)
    const likeBtn = m.host.querySelector<HTMLElement>('.post-action')
    const countBefore = Number(likeBtn?.textContent?.replace(/\D/g, '') || '0')
    const pressedBefore = likeBtn?.getAttribute('aria-pressed')
    await click(likeBtn)
    const likeAfter = m.host.querySelector<HTMLElement>('.post-action')
    const countAfter = Number(likeAfter?.textContent?.replace(/\D/g, '') || '0')
    check('like flips aria-pressed',
      likeAfter?.getAttribute('aria-pressed') !== pressedBefore,
      `${pressedBefore} -> ${likeAfter?.getAttribute('aria-pressed')}`)
    check('like count changes by one', Math.abs(countAfter - countBefore) === 1,
      `${countBefore} -> ${countAfter}`)
    await unmount(m)
  }

  console.log('\n— rating a room end to end —')
  {
    // Rate a room this user has never rated, so the count must go up by one.
    const target = 'v-muckleshoot'
    await api.signIn('u-you')
    const me = (await api.getCurrentUser())!
    const existing = await api.getMyRating(target)
    if (existing) await api.deleteRating(existing.id)
    const before = await api.getVenueStats(target)
    const postsBefore = (await api.listPostsByUser(me.id)).length

    const m = await mount(`/compose?mode=rating&venue=${target}`)
    const starButtons = m.host.querySelectorAll<HTMLElement>('.star-btn')
    check('six subscore rows render', m.host.querySelectorAll('.star-input').length === 6,
      `rows=${m.host.querySelectorAll('.star-input').length}`)
    check('five stars per row', starButtons.length === 30, `buttons=${starButtons.length}`)

    // Click the 4th star in each of the six rows.
    for (let row = 0; row < 6; row++) await click(starButtons[row * 5 + 3])

    const submit = Array.from(m.host.querySelectorAll<HTMLButtonElement>('button'))
      .find((b) => /post|save|rate|publish|update/i.test(b.textContent ?? '') && !b.disabled)
    check('submit becomes enabled once scored', !!submit,
      submit ? '' : 'no enabled submit button found')
    if (submit) {
      await click(submit)
      await settle(4)
      const after = await api.getVenueStats(target)
      check('a rating was saved', after.count === before.count + 1,
        `${before.count} -> ${after.count}`)
      const saved = await api.getMyRating(target)
      check('overall is the mean of the six 4s', saved?.overall === 4, String(saved?.overall))
      const mine = await api.listPostsByUser(me.id)
      check('a companion post was created', mine.length === postsBefore + 1,
        `${postsBefore} -> ${mine.length}`)
      const p = mine[0]
      check('the post is a rating post', p?.post.kind === 'rating')
      check('the post links to the rating', p?.post.ratingId === saved?.id)
    }
    await unmount(m)
  }

  console.log('\n— list privacy toggle —')
  {
    const m = await mount('/list/l-6') // "Want to Play", owned by u-you, private
    const listBefore = await api.getList('l-6')
    check('seed list starts private', !listBefore.isPublic)
    const stranger = await asUser('u-marisol')
    check('a stranger cannot read it while it is private',
      (await stranger.get('/lists/l-6')).status === 403)
    const toggle =
      m.host.querySelector('[role="switch"]') ??
      findByText(m.host, 'button', 'public') ??
      findByText(m.host, 'button', 'private')
    check('a visibility control exists', !!toggle)
    if (toggle) {
      await click(toggle)
      check('list became public', (await api.getList('l-6')).isPublic === true)
      check('a stranger can now see it', (await stranger.get('/lists/l-6')).ok)
      await click(
        m.host.querySelector('[role="switch"]') ??
        findByText(m.host, 'button', 'public') ??
        findByText(m.host, 'button', 'private')!,
      )
      check('list went back to private', (await api.getList('l-6')).isPublic === false)
      check('and the stranger is shut out again',
        (await stranger.get('/lists/l-6')).status === 403)
    }
    await unmount(m)
  }

  console.log('\n— private profile is gated in the UI —')
  {
    await api.signIn('u-you')
    const teddy = (await api.getUserByUsername('teddystakes'))!
    // Ensure we are NOT an approved follower.
    if (await api.followState(teddy.id) === 'following') await api.toggleFollow(teddy.id)
    const m = await mount('/u/teddystakes')
    await settle(3)
    const text = (m.host.textContent ?? '').toLowerCase()
    check('locked copy is shown', text.includes('private'), text.slice(0, 80))
    check('no posts leak through', m.host.querySelectorAll('.post-card').length === 0)
    await unmount(m)
  }

  console.log('\n— rating scores follow the room across a mode detour —')
  {
    // Regression: scores entered for room A used to survive a switch to Post
    // mode, a change to room B, and a switch back to Rate — so submitting filed
    // A's scores against B. Scores must belong to whichever room is selected.
    await api.signIn('u-you')
    const m = await mount('/compose?mode=rating&venue=v-aria')
    await settle(3)

    check('rating form is showing for ARIA',
      m.host.querySelectorAll('.star-btn').length === 30,
      `stars=${m.host.querySelectorAll('.star-btn').length}`)
    // ARIA already carries a seeded rating from this user, so the form arrives
    // prefilled and clicking a star at its current value would toggle it off.
    // Going via 1 first makes the final click a genuine change every time.
    for (let row = 0; row < 6; row++) {
      for (const col of [0, 4]) {
        const cells = m.host.querySelectorAll<HTMLElement>('.star-btn')
        await click(cells[row * 5 + col])
      }
    }
    check('all six categories scored five',
      m.host.querySelectorAll('.star-btn.on').length === 30,
      `lit=${m.host.querySelectorAll('.star-btn.on').length}`)

    const modeBtn = (label: string) =>
      Array.from(m.host.querySelectorAll<HTMLElement>('.cmp-mode'))
        .find((b) => (b.textContent ?? '').toLowerCase().includes(label))

    await click(modeBtn('post'))
    check('switched to Post mode', m.host.querySelectorAll('.star-btn').length === 0)

    // Swap the room while the scores are parked out of sight.
    const changeBtn = Array.from(m.host.querySelectorAll<HTMLElement>('button'))
      .find((b) => (b.textContent ?? '').trim() === 'Change')
    check('the selected room offers a Change button', !!changeBtn)
    await click(changeBtn)

    const roomInput = m.host.querySelector<HTMLInputElement>('#cmp-room')
    check('room search is reachable', !!roomInput)
    if (roomInput) {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value')!.set!
        setter.call(roomInput, 'Wynn')
        roomInput.dispatchEvent(new window.Event('input', { bubbles: true }))
      })
      const option = m.host.querySelector<HTMLElement>('.cmp-room-option')
      check('Wynn appears in the results',
        !!option && (option.textContent ?? '').includes('Wynn'),
        (option?.textContent ?? '').slice(0, 40))
      await click(option)
    }

    await click(modeBtn('rate'))
    const lit = m.host.querySelectorAll('.star-btn.on').length
    check('scores did NOT carry over to the new room', lit === 0,
      `${lit} stars still lit from the previous room`)

    await unmount(m)
  }

  console.log('\n— denied geolocation advice clears once acted on —')
  {
    // jsdom has no geolocation; stub one that always denies.
    Object.defineProperty(window.navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_ok: unknown, fail: (e: { code: number; PERMISSION_DENIED: number }) => void) => {
          fail({ code: 1, PERMISSION_DENIED: 1 })
        },
      },
    })

    const m = await mount('/rankings')
    const geoBtn = m.host.querySelector<HTMLElement>('.rank-geo-btn')
    check('the use-my-location button is present', !!geoBtn)
    await click(geoBtn)
    const err = m.host.querySelector('.field-error')
    check('denial shows advice to pick a city', !!err,
      (err?.textContent ?? 'no .field-error rendered').slice(0, 50))

    // Do exactly what the message says: pick a city.
    const select = m.host.querySelector<HTMLSelectElement>('select')
    check('the city picker is present', !!select)
    if (select) {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype, 'value')!.set!
        setter.call(select, 'los-angeles')
        select.dispatchEvent(new window.Event('change', { bubbles: true }))
      })
      check('the now-stale advice is gone', !m.host.querySelector('.field-error'),
        m.host.querySelector('.field-error')?.textContent ?? '')
      check('the picked city took effect',
        (m.host.textContent ?? '').includes('Los Angeles'))
    }
    await unmount(m)
  }

  console.log('\n— attachments render in the feed —')
  {
    await api.resetDemoData()
    await api.signIn('u-you')
    const m = await mount('/')
    const tiles = m.host.querySelectorAll('.mg-tile')
    check('seeded attachments render as tiles', tiles.length > 0, `tiles=${tiles.length}`)

    const withMedia = (await api.listFeed('following')).find((f) => f.post.media.length > 0)
    check('the feed really does carry a post with media', !!withMedia)

    const img = m.host.querySelector<HTMLImageElement>('.mg-media')
    check('an image element is rendered', !!img)
    check('the image carries the author\'s alt text',
      !!img && img.getAttribute('alt') !== null && img.getAttribute('alt') !== '',
      `alt=${img?.getAttribute('alt')}`)

    // The tile must open the viewer, not the post underneath it.
    check('no lightbox before clicking', !document.querySelector('.mg-lb'))
    await click(tiles[0])
    check('clicking a tile opens the lightbox', !!document.querySelector('.mg-lb'))

    await act(async () => {
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    check('Escape closes the lightbox', !document.querySelector('.mg-lb'))
    check('body scroll is restored', document.body.style.overflow !== 'hidden',
      `overflow=${document.body.style.overflow}`)

    await unmount(m)
  }

  console.log('\n— the composer offers attachments —')
  {
    await api.signIn('u-you')
    const m = await mount('/compose')
    const text = (m.host.textContent ?? '')
    check('the composer advertises photos and video',
      /photo/i.test(text) && /video/i.test(text))
    const fileInput = m.host.querySelector<HTMLInputElement>('input[type="file"]')
    check('there is a file input', !!fileInput)
    check('it accepts images and video',
      (fileInput?.getAttribute('accept') ?? '').includes('image/') &&
      (fileInput?.getAttribute('accept') ?? '').includes('video/'),
      String(fileInput?.getAttribute('accept')))
    check('it takes more than one file at a time', fileInput?.hasAttribute('multiple') === true)
    await unmount(m)
  }

  console.log('\n— a photo alone is a valid post —')
  {
    await api.signIn('u-you')
    const me = (await api.getCurrentUser())!
    const before = (await api.listPostsByUser(me.id)).length
    const shot = await ingestFile(
      new File([new Uint8Array(64)], 'rail.jpg', { type: 'image/jpeg' }),
    )
    check('the upload came back with an id from the server', shot.id.startsWith('m-'), shot.id)
    const post = await api.createPost({ kind: 'text', body: '', media: [shot] })
    check('a post with no words but a photo is stored', !!(await api.getFeedItem(post.id)))
    check('it shows up on the profile',
      (await api.listPostsByUser(me.id)).length === before + 1)

    const m = await mount(`/post/${post.id}`)
    check('the post detail renders its tile',
      m.host.querySelectorAll('.mg-tile').length === 1,
      `tiles=${m.host.querySelectorAll('.mg-tile').length}`)
    await unmount(m)
    await api.deletePost(post.id)
  }

  console.log('\n— setting a profile photo —')
  {
    await api.resetDemoData()
    await api.signIn('u-you')
    // jsdom has no 2d canvas; stand in one whose "encode" is a known JPEG.
    const PHOTO = 'data:image/jpeg;base64,/9j/UkFJTEJJUkQ='
    const proto = window.HTMLCanvasElement.prototype
    const realGetContext = proto.getContext
    const realToDataURL = proto.toDataURL
    proto.getContext = (() => ({ fillStyle: '', fillRect() {}, drawImage() {} })) as unknown as
      typeof proto.getContext
    proto.toDataURL = () => PHOTO

    const photoInput = () => document.querySelector<HTMLInputElement>('.prof-photo input[type="file"]')
    const pick = async (file: File) => {
      const input = photoInput()
      if (!input) throw new Error('no photo input')
      Object.defineProperty(input, 'files', { configurable: true, value: [file] })
      await act(async () => {
        input.dispatchEvent(new window.Event('change', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 30))   // decode and encode are async
      })
    }
    const edit = (m: Mounted) => click(findByText(m.host, 'button', 'edit profile'))
    const save = () => click(findByText(document.body, 'button', 'save changes'))
    const navAvatar = (m: Mounted) => m.host.querySelector('a.nav-tab[href="/profile"] .avatar')

    try {
      const m = await mount('/profile')
      check('the Profile tab shows your avatar rather than an icon',
        !!navAvatar(m) && !m.host.querySelector('a.nav-tab[href="/profile"] svg'))
      check('with no photo it shows your initials', !navAvatar(m)?.querySelector('img'))

      await edit(m)
      check('the edit form offers a photo upload', !!findByText(document.body, 'button', 'upload photo'))
      check('the picker only takes images', photoInput()?.getAttribute('accept') === 'image/*',
        String(photoInput()?.getAttribute('accept')))

      await pick(new File([new Uint8Array(2048)], 'me.jpg', { type: 'image/jpeg' }))
      check('the new photo previews in the form',
        document.querySelector('.prof-photo .avatar-img')?.getAttribute('src') === PHOTO)
      check('the button now offers to change it', !!findByText(document.body, 'button', 'change photo'))
      check('nothing is stored until Save',
        (await api.getUser('u-you'))!.avatarPhoto === null)

      await save()
      await settle(3)
      check('Save stores the photo', (await api.getUser('u-you'))!.avatarPhoto === PHOTO)
      check('the nav tab now shows the photo',
        navAvatar(m)?.querySelector('img')?.getAttribute('src') === PHOTO)
      check('so does the profile header',
        m.host.querySelector('.prof-avatar .avatar-img')?.getAttribute('src') === PHOTO)

      await edit(m)
      await click(findByText(document.body, 'button', 'remove photo'))
      check('Remove puts initials back in the preview', !document.querySelector('.prof-photo .avatar-img'))
      await save()
      await settle(3)
      check('saving clears the stored photo', (await api.getUser('u-you'))!.avatarPhoto === null)
      check('and the nav tab is back to initials', !navAvatar(m)?.querySelector('img'))

      await edit(m)
      await pick(new File(['hi'], 'notes.txt', { type: 'text/plain' }))
      const err = document.querySelector('.prof-photo')?.parentElement?.querySelector('.field-error')
      check('a non-image is refused with a reason',
        (err?.textContent ?? '').includes('not a photo'), err?.textContent ?? 'no error shown')
      check('the preview is left alone', !document.querySelector('.prof-photo .avatar-img'))
      await click(findByText(document.body, 'button', 'cancel'))
      await unmount(m)
    } finally {
      proto.getContext = realGetContext
      proto.toDataURL = realToDataURL
    }
  }

  console.log(`\n${failures === 0 ? 'ALL INTERACTIONS PASS' : failures + ' INTERACTION FAILURES'}\n`)
  reportResult(failures)
}

main().catch((e) => {
  console.log('HARNESS ERROR:', (e as Error).stack)
  reportResult(1)
})
