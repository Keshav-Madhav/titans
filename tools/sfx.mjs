// Recorded sounds: after the first gesture every group decodes, and a step, a landing and
// the panels play recordings (not their synthesised stand-ins); no errors.
//   npm run preview (4317), then: node tools/sfx.mjs
import { launch } from './browser.mjs'
// TITANS_URL=<origin> points the gate at another server (default the preview on 4317).
const BASE = process.env.TITANS_URL ?? 'http://localhost:4317'

let failed = false
const fail = (m) => {
  failed = true
  console.error('SFX GATE FAILED:', m)
}
const browser = await launch(['--autoplay-policy=no-user-gesture-required'])
const page = await browser.newPage({ viewport: { width: 1100, height: 680 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
try {
  await page.goto(`${BASE}/?offline`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__g && window.__g.ready === true, null, { timeout: 240000 })
  await page.mouse.click(500, 300)
  const groups = ['step-grass', 'step-stone', 'step-snow', 'step-soft', 'land-heavy', 'land-soft', 'page', 'book-place', 'cloth', 'belt', 'leather', 'book-open', 'book-close', 'leather-drop', 'metal-click', 'ui-click', 'ui-toggle', 'ui-hover', 'ui-denied']
  await page.waitForFunction((gs) => gs.every((g) => window.__g.sound.hasSample(g)), groups, { timeout: 30000 }).catch(() => {})
  const r = await page.evaluate(async (gs) => {
    const s = window.__g.sound
    const missing = gs.filter((g) => !s.hasSample(g))
    // Recorded voices started by a call (the voice count, read before and after; a pause after
    // each, past the per-group rate limit).
    const started = async (f) => {
      const v0 = s.voices
      f()
      const n = s.voices - v0
      await new Promise((res) => setTimeout(res, 80))
      return n
    }
    const step = []
    for (const k of ['grass', 'stone', 'sand', 'snow', 'mud']) step.push(await started(() => s.step(k, 0.6)))
    const land = await started(() => s.land('grass', 0.8))
    const ui = []
    for (const k of ['bag-open', 'book-open', 'map-open', 'press', 'toggle']) ui.push(await started(() => s.ui(k)))
    return { missing, step, land, ui }
  }, groups)
  console.log('sfx', JSON.stringify(r))
  if (r.missing.length) fail('not loaded: ' + r.missing.join(','))
  if (r.step.some((n) => n < 1)) fail('a footstep played no recording')
  if (r.land < 2) fail('a landing played no recording')
  if (r.ui.some((n) => n < 1)) fail('a panel sound played no recording')
  if (errors.length) fail('errors: ' + errors.join(' | '))
} catch (e) {
  fail(e.message)
}
await browser.close()
console.log(failed ? 'FAIL' : 'PASS sfx')
process.exit(failed ? 1 : 0)
