// The adventure remembers.
//   1. A fresh visit saves itself; the first hint shows; the first click starts the sound.
//   2. The giants wander by themselves, leaving craters and lakes.
//   3. Reload: the same craters at every footfall, the giants where they stood, the lakes full,
//      you where you stood.
//   4. Away for hours: a giant left resting fell asleep, and is a mountain.
//   5. A new adventure starts fresh.
//   npm run preview (4317), then: node tools/single.mjs
import { chromium } from 'playwright-core'

let failed = false
const fail = (m) => {
  failed = true
  console.error('SINGLE GATE FAILED:', m)
}
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext({ viewport: { width: 1100, height: 680 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.error('[pageerror]', e.message))
const ready = () => page.waitForFunction(() => window.__g && window.__g.ready === true, null, { timeout: 120000 })
const ev = (f, a) => page.evaluate(f, a)

try {
  await page.goto('http://localhost:4317/', { waitUntil: 'domcontentloaded', timeout: 120000 })
  await ready()
  const fresh = await ev(() => ({ saving: window.__g.localSave, events: window.__g.savedEvents(), lakes: window.__g.lakes.lakes.length }))
  console.log(`fresh visit: saving ${fresh.saving}; the First Ones' trails laid (${fresh.events} events, ${fresh.lakes} lakes)`)
  if (!fresh.saving) fail('the adventure does not save itself')
  if (fresh.lakes < 5) fail('no old lakes in a fresh world')
  const tip0 = await ev(() => ({ shown: getComputedStyle(document.getElementById('tips')).display, step: window.__g.tips.current }))
  // A real click: the first gesture starts the sound (browsers insist).
  await page.mouse.click(550, 400)
  await page.waitForTimeout(300)
  const audio = await ev(() => ({ running: window.__g.sound.running, on: window.__g.sound.enabled }))
  console.log(`first hint shown: ${tip0.shown === 'flex'} (step ${tip0.step}); sound started on the first click: ${audio.running}, on: ${audio.on}`)
  if (tip0.shown !== 'flex' || tip0.step !== 0) fail('no first hint')
  if (!audio.running) fail('sound did not start on the first click')
  // (The first click wakes you from the title: you lie a moment on the hall floor, then stand.)
  await page.waitForFunction(() => window.__g.opening !== 'title' && window.__g.opening !== 'waking', null, { timeout: 15000 }).catch(() => fail('the first click did not wake you'))
  // Walk a little: the first hint is done.
  await ev(() => {
    window.__g.input.press('KeyW')
    window.__g.input.press('ShiftLeft')
  })
  await page.waitForTimeout(4000)
  await ev(() => {
    window.__g.input.release('KeyW')
    window.__g.input.release('ShiftLeft')
  })
  await page.waitForTimeout(700)
  const step = await ev(() => window.__g.tips.current)
  console.log(`after a walk, hint step ${step}`)
  if (step < 1) fail('walking did not advance the hints')

  // Left alone, the giants wander and leave their marks.
  await ev(() => (window.__g.clock.scale = 10))
  await page.waitForFunction(() => window.__g.titans.get('t1').titan.gait.steps >= 6, null, { timeout: 90000 }).catch(() => fail('the giants did not wander'))
  // Sit them down (a walking giant walks on while the page reloads), then save.
  await ev(() => {
    for (const a of window.__g.titans.values()) a.titan.gait.resting = true
  })
  await page.waitForFunction(() => [...window.__g.titans.values()].every((a) => a.titan.gait.speed === 0), null, { timeout: 60000 })
  const before = await ev(() => {
    const g = window.__g
    // Freeze the world, so what we measure is what is saved.
    g.clock.scale = 0
    // (A giant resting a minute of real time turns to stone on the next load — a hill rises
    // under it and it wakes elsewhere. The wait for them to settle varies, and past a minute
    // the reload raised a crater 1.2 m: this gate checks the save, so their rest starts now.)
    for (const a of g.titans.values()) if (a.aloneSince) a.aloneSince = Date.now()
    g.saveLocal()
    const giants = [...g.titans].map(([id, a]) => ({ id, x: a.titan.gait.x, z: a.titan.gait.z }))
    return { falls: g.falls.slice(), depth: g.falls.map((q) => +g.deltaAt(q.x, q.z).toFixed(3)), giants, player: g.player(), saved: g.savedEvents() }
  })
  console.log(`the giants walked: ${before.falls.length} footfalls, ${before.saved} events saved`)

  // Reload: the same world.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await ready()
  const after = await ev((pts) => {
    const g = window.__g
    g.clock.scale = 0
    const giants = [...g.titans].map(([id, a]) => ({ id, x: a.titan.gait.x, z: a.titan.gait.z }))
    return { depth: pts.map((q) => +g.deltaAt(q.x, q.z).toFixed(3)), giants, player: g.player(), lakes: g.lakeStats() }
  }, before.falls)
  const same = JSON.stringify(after.depth) === JSON.stringify(before.depth)
  const moved = Math.max(...before.giants.map((b) => {
    const a = after.giants.find((q) => q.id === b.id)
    return a ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity
  }))
  const youMoved = Math.hypot(after.player.x - before.player.x, after.player.z - before.player.z)
  const part = after.lakes.filter((l) => !l.full)
  console.log(`reloaded: craters identical ${same}; giants ${moved.toFixed(2)} m from where they stood; you ${youMoved.toFixed(2)} m; lakes ${after.lakes.length - part.length}/${after.lakes.length} full`)
  if (!same) {
    before.depth.forEach((v, i) => {
      if (v !== after.depth[i]) console.log('  differs at', JSON.stringify(before.falls[i]), v, '→', after.depth[i])
    })
    fail('the world changed across a reload')
  }
  if (moved > 0.5) fail('a giant is not where it stood')
  if (youMoved > 0.5) fail('you are not where you stood')
  // Rain filled them while we were away.
  if (after.lakes.length === 0 || part.length) {
    console.log('  part-filled:', JSON.stringify(part))
    fail('lakes came back part-filled')
  }

  // Away for hours: giant 1 sat down to rest long ago.
  await ev(() => {
    const g = window.__g
    const a = g.titans.get('t1')
    a.titan.gait.resting = true
    a.aloneSince = Date.now() - 3 * 3600 * 1000
    g.saveLocal()
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await ready()
  const slept = await ev(() => ({ mountains: window.__g.mountains.count }))
  console.log(`after hours away: ${slept.mountains} sleeping giant(s)`)
  if (slept.mountains < 1) fail('the resting giant did not fall asleep while we were away')

  // A new adventure: forget it all.
  await ev(() => window.__g.newAdventure())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await ready()
  const anew = await ev(() => ({ mountains: window.__g.mountains.count, events: window.__g.savedEvents() }))
  console.log(`new adventure: ${anew.mountains} sleeping giants, ${anew.events} events (the old trails only: ${fresh.events})`)
  if (anew.mountains !== 0 || anew.events !== fresh.events) fail('a new adventure did not start fresh')
} catch (e) {
  fail(e.message)
}
await browser.close()
console.log(failed ? 'SINGLE GATE FAILED' : 'SINGLE GATE PASSED')
process.exit(failed ? 1 : 0)
