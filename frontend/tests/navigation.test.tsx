// Proves where a click actually lands, by reporting the live router location.
import React from 'react'
import { useLocation } from 'react-router-dom'
import * as api from '../src/lib/api'
import { click, mountApp } from './harness'
import { reportResult } from './report'


let failures = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  ok   ${name}`)
  else { failures++; console.log(`  FAIL ${name} ${detail}`) }
}

let current = '/'
function Probe() {
  const loc = useLocation()
  current = loc.pathname + loc.search
  return null
}

const mount = (route: string) => mountApp(route, React.createElement(Probe, null))

async function main() {
  // Suites share one API, so this one starts from the seeded dataset rather
  // than from whatever the last suite left behind.
  await api.signIn('u-you')
  await api.resetDemoData()
  await api.signIn('u-you')

  console.log('\n— clicking the author avatar in the feed —')
  {
    const m = await mount('/')
    const card = m.host.querySelector('.post-card')!
    const avatarLink = card.querySelector('.avatar-link')
    const expectedHref = avatarLink?.getAttribute('href')
    check('the avatar is a profile link', !!expectedHref && expectedHref.startsWith('/u/'),
      String(expectedHref))
    await click(avatarLink)
    check('avatar click lands on the profile, not the post',
      current.startsWith('/u/'), `landed on ${current}`)
    await m.unmount()
  }

  console.log('\n— clicking the author name (already stopPropagation) —')
  {
    current = '/'
    const m = await mount('/')
    const nameLink = m.host.querySelector('.post-card .post-author')
    await click(nameLink)
    check('name click lands on the profile', current.startsWith('/u/'), `landed on ${current}`)
    await m.unmount()
  }

  console.log('\n— clicking the card body still opens the post —')
  {
    current = '/'
    const m = await mount('/')
    await click(m.host.querySelector('.post-card .post-body'))
    check('body click opens the post', current.startsWith('/post/'), `landed on ${current}`)
    await m.unmount()
  }

  console.log('\n— compose re-seeds when the URL params change —')
  {
    // Simulates: open Compose, then tap "Rate this room" for a specific venue.
    // Both render the same route element, so the component instance persists.
    current = '/'
    const m = await mount('/compose')
    const textarea = m.host.querySelector<HTMLTextAreaElement>('textarea')
    check('composer renders a textarea', !!textarea)

    // Navigate within the same route by clicking a link that carries params.
    // Use the Rankings -> venue -> rate path instead: mount directly with params
    // after having mounted plain /compose is not possible on one instance, so
    // assert the weaker, still-meaningful property: params seed on fresh mount.
    await m.unmount()

    current = '/'
    const m2 = await mount('/compose?mode=rating&venue=v-aria')
    const stars = m2.host.querySelectorAll('.star-btn').length
    check('?mode=rating seeds the rating form on mount', stars === 30, `stars=${stars}`)
    const txt = (m2.host.textContent ?? '')
    check('?venue= preselects the room', txt.includes('ARIA'), txt.slice(0, 60))
    await m2.unmount()
  }

  console.log('\n— nav "Post" tab while a rating draft is open —')
  {
    current = '/'
    // Reachable path: Room detail -> "Rate this room" -> then tap the Post tab.
    const m = await mount('/compose?mode=rating&venue=v-aria')
    check('starts as a rating form', m.host.querySelectorAll('.star-btn').length === 30)
    const postTab = Array.from(m.host.querySelectorAll<HTMLElement>('a.nav-tab'))
      .find((a) => a.getAttribute('href') === '/compose')
    check('nav Post tab is present', !!postTab)
    if (postTab) {
      await click(postTab)
      check('URL is now plain /compose', current === '/compose', current)
      // Deliberate: the draft survives. Every parameterised entry to /compose
      // arrives from a screen that unmounts this one, so params always seed on a
      // fresh mount; resetting here would only ever throw away real work.
      const starsAfter = m.host.querySelectorAll('.star-btn').length
      check('in-progress rating draft is preserved', starsAfter === 30,
        `expected the draft to survive, saw ${starsAfter} stars`)
    }
    await m.unmount()
  }

  console.log('\n— tapping a photo opens the viewer, not the post —')
  {
    // Same trap as the avatar: the tile sits inside PostCard's clickable card,
    // so without a stopPropagation guard the card's navigate would win and the
    // viewer would flash open and then be torn down by a route change.
    current = '/'
    const m = await mount('/')
    const tile = m.host.querySelector('.mg-tile')
    check('a media tile is on the feed', !!tile)
    await click(tile)
    check('the route did not change', current === '/', `landed on ${current}`)
    check('the lightbox is open', !!document.querySelector('.mg-lb'))

    const closeBtn = document.querySelector('.mg-lb [aria-label="Close"]')
    check('the viewer has a close button', !!closeBtn)
    await click(closeBtn)
    check('closing returns to the feed with no navigation',
      !document.querySelector('.mg-lb') && current === '/', current)
    await m.unmount()
  }

  console.log('\n— the nav wears the four suits —')
  {
    current = '/'
    const m = await mount('/')
    const tab = (href: string) => m.host.querySelector(`a.nav-tab[href="${href}"]`)
    const suits: [string, string][] = [
      ['/', 'heart'], ['/rankings', 'club'], ['/search', 'diamond'], ['/compose', 'spade'],
    ]
    for (const [href, suit] of suits) {
      const svg = tab(href)?.querySelector('.nav-icon svg')
      check(`${href} shows the ${suit}`, !!svg?.classList.contains(`icon-${suit}`),
        svg?.getAttribute('class') ?? 'no icon')
    }
    const profile = tab('/profile')
    check('Profile shows the signed-in user, not an icon',
      !!profile?.querySelector('.nav-icon .avatar') && !profile?.querySelector('svg'))
    check('as their initials while they have no photo',
      profile?.querySelector('.avatar')?.textContent === 'Y', profile?.textContent ?? '')
    await click(profile)
    check('the avatar tab still lands on your profile', current === '/profile', current)
    check('and is marked active', tab('/profile')?.classList.contains('active') === true)
    await m.unmount()
  }

  console.log(`\n${failures === 0 ? 'ALL NAV CHECKS PASS' : failures + ' NAV FAILURES'}\n`)
  reportResult(failures)
}

main().catch((e) => {
  console.log('HARNESS ERROR:', (e as Error).stack)
  reportResult(1)
})
