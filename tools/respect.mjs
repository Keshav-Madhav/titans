// Respect for the player: a broken frame shows a card (not a frozen screen) and never
// writes over the save; a damaged save loads the one before it; the Wader is not "met"
// from inside the Husk.
//   npm run preview (4317), then: node tools/respect.mjs [outdir]
import { launch } from './browser.mjs'
// TITANS_URL=<origin> points the gate at another server (default the preview on 4317).
const BASE = process.env.TITANS_URL ?? 'http://localhost:4317'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] ?? 'shots'
mkdirSync(OUT, { recursive: true })
let failed = false
const fail = (m) => {
  failed = true
  console.error('RESPECT GATE FAILED:', m)
}
const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } })
const page = await ctx.newPage()
const ready = () => page.waitForFunction(() => window.__g && window.__g.ready === true, null, { timeout: 240000 })
const ev = (f, a) => page.evaluate(f, a)
const KEY = 'titans.adventure.v3'

try {
  await page.goto(`${BASE}/?offline`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await ready()
  // 1. The Husk is not the beach: standing inside it, the Wader is not met.
  const husk = await ev(async () => {
    const g = window.__g
    const h = g.colossi.places.get('husk')
    g.teleport(h.x, h.z)
    await new Promise((r) => setTimeout(r, 4000))
    return { at: [Math.round(h.x), Math.round(h.z)], wader: g.finds.has('wader'), husk: g.finds.has('husk') }
  })
  console.log('in the Husk:', JSON.stringify(husk))
  if (husk.wader) fail('the Wader was met from inside the Husk')
  if (!husk.husk) fail('the Husk itself was not found (the test stood in the wrong place)')

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await ready()
  // 2. Two saves at two places: the second is the save, the first its backup.
  const a = await ev(() => {
    const g = window.__g
    g.teleport(-400, 300)
    g.saveLocal()
    g.teleport(500, -200)
    g.saveLocal()
    const main = JSON.parse(localStorage.getItem('titans.adventure.v3')).player
    const prev = JSON.parse(localStorage.getItem('titans.adventure.v3.prev')).player
    return { main: [Math.round(main.x), Math.round(main.z)], prev: [Math.round(prev.x), Math.round(prev.z)] }
  })
  console.log('save / backup:', JSON.stringify(a))
  if (a.main[0] !== 500 || a.prev[0] !== -400) fail('the backup is not the save before the last')

  // 3. The save damaged: the backup loads, and the game says so.
  // (Damaged from outside the game: leaving the game saves it again on the way out.)
  await page.goto(`${BASE}/icons/bow.png`)
  const good = await ev((k) => {
    const p = JSON.parse(localStorage.getItem(k)).player
    localStorage.setItem(k, '{"v":1,"events":[1,2,')
    return p
  }, KEY)
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await ready()
  await page.waitForTimeout(3500)
  const b = await ev(() => ({ p: window.__g.player(), said: document.body.innerText.includes('The last save was damaged') }))
  console.log('after damage:', JSON.stringify({ x: Math.round(b.p.x), z: Math.round(b.p.z), said: b.said }))
  if (Math.abs(b.p.x - good.x) > 3 || Math.abs(b.p.z - good.z) > 3) fail('a damaged save did not fall back to the backup')
  if (!b.said) fail('falling back to the backup was not told')
  await ev(() => window.__g.saveLocal())

  // 4. A frame breaks (QA flag): the card, and the save untouched after it.
  await page.goto(`${BASE}/?qa=throw`, { waitUntil: 'domcontentloaded' })
  await ready()
  await page.waitForSelector('#crash', { timeout: 30000 }).catch(() => fail('no card when a frame broke'))
  const before = await ev((k) => localStorage.getItem(k), KEY)
  await ev(() => {
    window.__g.teleport(2000, 2000)
    window.__g.saveLocal()
    document.dispatchEvent(new Event('visibilitychange'))
    dispatchEvent(new Event('pagehide'))
  })
  const after = await ev((k) => localStorage.getItem(k), KEY)
  const card = await ev(() => ({ text: document.querySelector('#crash h2')?.textContent, details: document.querySelector('#crash pre')?.textContent.split('\n').slice(0, 3) }))
  console.log('crash card:', JSON.stringify(card), 'save unchanged:', before === after)
  if (before !== after) fail('a broken game wrote over the save')
  await page.screenshot({ path: `${OUT}/crash-card.png` })
  await page.setViewportSize({ width: 844, height: 390 })
  await page.screenshot({ path: `${OUT}/crash-card-phone.png` })
} catch (e) {
  fail(e.message)
}
await browser.close()
console.log(failed ? 'FAIL' : 'PASS respect')
process.exit(failed ? 1 : 0)
