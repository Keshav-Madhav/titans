// Adversarial QA: things a restless or careless player does. After each, the game must have
// thrown nothing, and the wanderer must be somewhere sane (finite, not under the land, not
// stuck in a page or a mode it cannot leave).
//   npm run preview (4317), then: node tools/adversary.mjs [outdir]
import { launch } from './browser.mjs'
// TITANS_URL=<origin> points the gate at another server (default the preview on 4317).
const BASE = process.env.TITANS_URL ?? 'http://localhost:4317'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] ?? 'shots/adversary'
mkdirSync(OUT, { recursive: true })
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
const ready = () => page.waitForFunction(() => window.__g && window.__g.ready === true, null, { timeout: 240000 })
const wait = (ms) => page.waitForTimeout(ms)
let failed = 0
async function check(name) {
  const s = await page.evaluate(() => {
    const g = window.__g
    const p = g.player()
    const ground = g.heightAt(p.x, p.z)
    return {
      ok: [p.x, p.y, p.z].every(Number.isFinite),
      under: p.y < ground - 3 && !g.wanderer.swimming,
      crashed: !!document.getElementById('crash'),
      pages: { bag: g.bag.open, journal: g.journal.open, map: g.worldMap.open, pause: g.pause.open },
      climbing: g.climbState?.().active,
      y: +(p.y - ground).toFixed(2),
    }
  })
  const bad = !s.ok || s.under || s.crashed || errors.length
  if (bad) failed++
  console.log(`${bad ? 'FAIL' : 'ok  '} ${name}: ${JSON.stringify(s)}${errors.length ? ' errors: ' + errors.splice(0).join(' | ').slice(0, 300) : ''}`)
  await page.screenshot({ path: `${OUT}/${name}.png` })
}

// 1. Reload during the title → waking hand-over, three times quickly.
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => localStorage.clear())
for (let i = 0; i < 3; i++) {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await ready()
  await wait(1500)
  await page.mouse.click(640, 360)
  await wait(300 + i * 400)
}
await ready()
await wait(4000)
await check('reload-mid-waking')

// 2. Key mash: every key at once, repeatedly, while running.
await page.goto(`${BASE}/?offline`, { waitUntil: 'domcontentloaded' })
await ready()
await page.evaluate(() => { const g = window.__g; for (const f of ['bag', 'line', 'bow', 'horn', 'cloak', 'sight']) g.finds.find(f); g.teleport(-600, 400) })
await wait(2000)
await page.keyboard.down('KeyW')
await page.keyboard.down('ShiftLeft')
for (let i = 0; i < 40; i++) {
  for (const k of ['Space', 'KeyE', 'KeyG', 'KeyQ', 'KeyF', 'KeyH', 'KeyV']) await page.keyboard.press(k)
}
await page.keyboard.up('ShiftLeft')
await page.keyboard.up('KeyW')
await wait(2500)
await check('key-mash-running')

// 3. Pages flipped open and shut fast, and all at once.
for (let i = 0; i < 25; i++) for (const k of ['KeyI', 'KeyJ', 'KeyM']) await page.keyboard.press(k)
// …then one at a time must mean one at a time: each key leaves only its own page open.
for (const [k, want] of [['KeyI', 'bag'], ['KeyJ', 'journal'], ['KeyM', 'map'], ['KeyI', 'bag']]) {
  await page.keyboard.press(k)
  await wait(150)
  const open = await page.evaluate(() => { const g = window.__g; return Object.entries({ bag: g.bag.open, journal: g.journal.open, map: g.worldMap.open }).filter(([, v]) => v).map(([n]) => n) })
  const good = open.length === 1 && open[0] === want
  if (!good) failed++
  console.log(`${good ? 'ok  ' : 'FAIL'} ${k}: open ${JSON.stringify(open)} (want only ${want})`)
}
for (let i = 0; i < 3; i++) await page.keyboard.press('Escape')
await wait(400)
await check('pages-mashed')

// 4. Climbing: pause and resume fast; resize the window mid-climb; let go mid-pause.
await page.evaluate(() => window.__g.grabTitan())
await wait(800)
await page.keyboard.down('KeyW')
for (let i = 0; i < 12; i++) {
  await page.evaluate(() => window.__g.pause.show())
  await wait(60)
  await page.evaluate(() => window.__g.pause.resume())
  await wait(120)
}
for (const [w, h] of [[800, 600], [1600, 500], [500, 900], [1280, 720]]) {
  await page.setViewportSize({ width: w, height: h })
  await wait(400)
}
await page.keyboard.up('KeyW')
await wait(800)
await check('climb-pause-resize')
await page.evaluate(() => window.__g.pause.show())
await page.keyboard.press('Space')
await page.keyboard.press('KeyE')
await wait(300)
await page.evaluate(() => window.__g.pause.resume())
await wait(3000)
await check('climb-keys-while-paused')

// 5. Focus lost while running (the key-up never arrives): no running on by itself.
await page.keyboard.press('Space') // (let go of the giant first)
await wait(2500)
await page.evaluate(() => window.__g.teleport(-600, 400))
await wait(1500)
await page.keyboard.down('KeyW')
await wait(600)
await page.evaluate(() => { dispatchEvent(new Event('blur')); document.dispatchEvent(new Event('visibilitychange')) })
await wait(1500)
const after = await page.evaluate(() => window.__g.wanderer.speed)
console.log(`speed 1.5 s after losing focus with W held: ${after.toFixed(2)}`)
if (after > 0.5) { failed++; console.log('FAIL still walking after focus loss') }
await page.keyboard.up('KeyW')
await check('focus-lost')

// 6. Jump off the highest place, gliding and spamming the line.
await page.evaluate(() => { const g = window.__g; const c = g.colossi.places.get('colonnade'); g.wanderer.place(c.x, c.y + 120, c.z) })
for (let i = 0; i < 30; i++) {
  await page.keyboard.down('Space')
  await page.keyboard.press('KeyG')
  await wait(60)
  await page.keyboard.up('Space')
}
await wait(6000)
await check('fall-glide-line-spam')

await browser.close()
console.log(failed ? `FAIL adversary (${failed})` : 'PASS adversary')
process.exit(failed ? 1 : 0)
