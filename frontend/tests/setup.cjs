/**
 * Boots a jsdom document and the browser globals the app touches, then runs one
 * bundled suite. Exits with the suite's failure count so the runner can report.
 *
 * Usage: node tests/setup.cjs <path-to-bundled-suite.cjs>
 */
const path = require('path')
const { JSDOM } = require('jsdom')

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})
const w = dom.window

for (const key of [
  'window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event',
  'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'SVGElement',
]) {
  global[key] = key === 'window' ? w : w[key]
}
global.getComputedStyle = w.getComputedStyle.bind(w)
global.requestAnimationFrame = w.requestAnimationFrame || ((cb) => setTimeout(cb, 0))
global.cancelAnimationFrame = w.cancelAnimationFrame || clearTimeout
// React needs this to accept act() outside a test runner.
global.IS_REACT_ACT_ENVIRONMENT = true

// The app keeps its session token (and theme, and metro) in localStorage;
// jsdom's is not writable the way we need.
const store = new Map()
const localStorageStub = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}
Object.defineProperty(w, 'localStorage', { value: localStorageStub, configurable: true })
global.localStorage = localStorageStub

// Destructive actions confirm(); in tests we always say yes.
w.confirm = () => true
global.confirm = () => true
w.scrollTo = () => {}

// jsdom has no object-URL support for blobs; the media layer makes one to read
// a picked file before uploading it.
let objectUrlSeq = 0
const objectUrls = new Map()
w.URL.createObjectURL = (blob) => {
  const url = `blob:4suit/${++objectUrlSeq}`
  objectUrls.set(url, blob)
  return url
}
w.URL.revokeObjectURL = (url) => { objectUrls.delete(url) }
global.URL.createObjectURL = w.URL.createObjectURL
global.URL.revokeObjectURL = w.URL.revokeObjectURL
// Blob, File and FormData come from node, not jsdom: the client hands them to
// node's fetch, and undici only recognises its own. The window gets node's
// versions too, so a suite building a File sees the same class the app does.
w.Blob = global.Blob
w.File = global.File
w.FormData = global.FormData
// The client talks to the test API over HTTP; node's fetch is the one it uses.
w.fetch = global.fetch

// React logs render errors through console.error before rethrowing. Treat those
// as failures, but ignore jsdom's unimplemented-API noise and act() advisories.
let consoleErrors = 0
const realError = console.error
console.error = (...args) => {
  const msg = args
    .map((a) => (a instanceof Error ? a.stack || a.message : String(a)))
    .join(' ')
  if (/not implemented|Not implemented|act\(\)|ReactDOMTestUtils/.test(msg)) return
  consoleErrors++
  realError('    console.error:', msg.split('\n')[0])
}

// jsdom does not fetch or decode image data, so `new Image()` would always fire
// onerror and lib/media.ts would reject every upload as unreadable. Stand in a
// decoder that reports a fixed size. Canvas still has no 2d context here, so the
// downscale branch correctly falls through to "store the original".
class StubImage {
  constructor() {
    this.naturalWidth = 1200
    this.naturalHeight = 900
    this.onload = null
    this.onerror = null
    this._src = ''
  }
  set src(value) {
    this._src = value
    // Async, like the real thing, so callers cannot depend on sync resolution.
    setTimeout(() => {
      if (String(value).includes('unreadable')) this.onerror?.(new Error('bad image'))
      else this.onload?.()
    }, 0)
  }
  get src() { return this._src }
}
w.Image = StubImage
global.Image = StubImage

const suite = process.argv[2]
if (!suite) {
  console.error('setup.cjs: expected a bundled suite path')
  process.exit(1)
}
require(path.resolve(suite))

// Suites are async and now make real HTTP requests, so the wait is a poll for
// the result rather than a fixed sleep — a suite that finishes in 300ms should
// not hold the runner for the length of the timeout.
const DEADLINE = Date.now() + 60_000
const finish = () => {
  const failures = global.__4suitFailures
  if (failures === undefined) {
    if (Date.now() < DEADLINE) { setTimeout(finish, 50); return }
    console.log('  suite never reported a result (did it throw, or hang?)')
    process.exit(1)
  }
  process.exit(failures > 0 || consoleErrors > 0 ? 1 : 0)
}
setTimeout(finish, 50)
