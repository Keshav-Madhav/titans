// The Green's sunken bell (#7, PLAN §4b.1): an off-beat stroke chokes it; five in time wake it; the
// stone comes down out of the sky and plants itself; standing under its foot you are pushed clear,
// not trapped; on its top you stand, and what was kept there is there. Shots along the way.
import { chromium } from 'playwright-core'
const OUT = process.argv[2]
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(m.text())); page.on('pageerror', (e) => errs.push(e.message))
await page.goto('http://localhost:4317/?offline', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__g && window.__g.ready === true', null, { timeout: 240000 })
const B = 2.6
const info = await page.evaluate(() => {
  const g = window.__g; g.weather.set('clear', true); g.sky.setTime(0.36); g.finds.find('bag')
  const b = g.sunkBells.bells[0], f = g.skyStone
  return b ? { bell: [Math.round(b.def.x), Math.round(b.def.z)], stone: [Math.round(f.x), Math.round(f.z), Math.round(f.y - g.heightAt(f.x, f.z))], dist: Math.round(Math.hypot(f.x - b.def.x, f.z - b.def.z)), y1: Math.round(g.bellDescent.y1), top: Math.round(g.bellDescent.top.y - g.heightAt(f.x, f.z)), open: +g.biome?.open?.(b.def.x, b.def.z)?.toFixed?.(2) } : null
})
console.log('bell:', JSON.stringify(info))
if (!info) { console.log('FAIL no bell'); process.exit(1) }
// Stand at the beam, facing the bell (and the stone beyond it).
await page.evaluate(() => { const g = window.__g, b = g.sunkBells.bells[0]; g.teleport(b.stand.x, b.stand.z); g.setCam(Math.atan2(b.def.x - b.stand.x, b.def.z - b.stand.z), 0.1, 6) })
await page.waitForTimeout(400)
await page.evaluate(() => { const g = window.__g, b = g.sunkBells.bells[0]; const d = new g.THREE.Vector3(); g.camera.getWorldDirection(d); if (d.x * (b.def.x - b.stand.x) + d.z * (b.def.z - b.stand.z) < 0) g.setCam(Math.atan2(b.def.x - b.stand.x, b.def.z - b.stand.z) + Math.PI, 0.1, 6) })
await page.waitForTimeout(1500)
const prompt = await page.evaluate(() => document.getElementById('prompt')?.textContent ?? '')
await page.screenshot({ path: `${OUT}/bell-near.png` })
// From the side (the chain, the lintel, the ram against the bronze).
const yaw0 = await page.evaluate(() => window.__g.rig.yaw)
await page.evaluate((y) => window.__g.setCam(y + 0.9, 0.12, 11), yaw0)
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/bell-side.png` })
await page.evaluate((y) => window.__g.setCam(y, 0.1, 6), yaw0)
await page.waitForTimeout(400)
// (A key is read on the next frame: wait a little before looking.)
const count = async () => { await page.waitForTimeout(150); return page.evaluate(() => window.__g.sunkBells.bells[0].count) }
// Off the beat: a stroke, then another 0.72 breaths later.
await page.keyboard.press('KeyE')
await page.waitForTimeout(B * 1000 * 0.72 - 150)
const firstStroke = await count()
await page.keyboard.press('KeyE')
const offBeat = await count()
await page.waitForTimeout(B * 1000 * 4)
// In time: five strokes a breath apart.
const counts = []
for (let i = 0; i < 5; i++) {
  await page.keyboard.press('KeyE')
  counts.push(await count())
  if (i === 2) { await page.waitForTimeout(B * 1000 * 0.3 - 150); await page.screenshot({ path: `${OUT}/bell-swing.png` }); await page.waitForTimeout(B * 1000 * 0.7) }
  else if (i < 4) await page.waitForTimeout(B * 1000 - 150)
}
await page.waitForTimeout(150)
const woken = await page.evaluate(() => window.__g.sunkBells.bells[0].woken)
// Watch it come down, from the bell, looking up at it.
const ys = []
for (let s = 0; s < 6; s++) {
  await page.waitForTimeout(9000)
  const r = await page.evaluate(() => { const g = window.__g, f = g.skyStone; const w = g.wanderer.pos; g.setCam(Math.atan2(f.x - w.x, f.z - w.z), -0.5, 7); return Math.round(f.y) })
  ys.push(r)
  if (s === 2) {
    await page.waitForTimeout(300)
    await page.evaluate(() => { const g = window.__g, f = g.skyStone, w = g.wanderer.pos; const d = new g.THREE.Vector3(); g.camera.getWorldDirection(d); if (d.x * (f.x - w.x) + d.z * (f.z - w.z) < 0) g.setCam(Math.atan2(f.x - w.x, f.z - w.z) + Math.PI, -0.5, 7) })
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${OUT}/bell-descending.png` })
  }
}
// Stand where its foot will land, just before it does.
await page.evaluate(() => { const g = window.__g, f = g.skyStone; g.teleport(f.x + 2, f.z + 1) })
await page.waitForTimeout(12000)
const under = await page.evaluate(() => { const g = window.__g, w = g.wanderer.pos; return { done: g.bellDescent.run.done, inside: +g.rocks.sdfAt(w.x, w.y + 1, w.z).toFixed(2) } })
// From a little way off, the stone standing in the grass.
await page.evaluate(() => { const g = window.__g, f = g.skyStone, b = g.sunkBells.bells[0]; const dx = b.def.x - f.x, dz = b.def.z - f.z, L = Math.hypot(dx, dz); g.teleport(f.x + dx / L * 160, f.z + dz / L * 160); g.setCam(Math.atan2(-dx, -dz), -0.25, 8) })
await page.waitForTimeout(400)
await page.evaluate(() => { const g = window.__g, f = g.skyStone, w = g.wanderer.pos; const d = new g.THREE.Vector3(); g.camera.getWorldDirection(d); if (d.x * (f.x - w.x) + d.z * (f.z - w.z) < 0) g.setCam(Math.atan2(-(f.x - w.x), -(f.z - w.z)) , -0.25, 8) })
await page.waitForTimeout(2500)
await page.screenshot({ path: `${OUT}/bell-landed.png` })
// On top.
await page.evaluate(() => { const g = window.__g, t = g.bellDescent.top; g.wanderer.place(t.x, t.y + 1.5, t.z) })
await page.waitForTimeout(2500)
const top = await page.evaluate(() => { const g = window.__g, w = g.wanderer.pos, t = g.bellDescent.top; const s = g.spots.near(w, (id) => g.finds.has(id)); return { dy: +(w.y - t.y).toFixed(2), spot: s ? s.id : null } })
await page.screenshot({ path: `${OUT}/bell-top.png` })
const descended = ys[0] > ys[ys.length - 1] + 100
const pass = /Strike the bell/.test(prompt) && firstStroke === 1 && offBeat === 0 && counts.join() === '1,2,3,4,5' && woken && descended && under.done && under.inside > -0.3 && Math.abs(top.dy) < 2 && top.spot === 'sky-green'
console.log(`${pass ? 'ok  ' : 'FAIL'} bells: ${JSON.stringify({ prompt, firstStroke, offBeat, counts, woken, ys, under, top })}`)
console.log('errors:', errs.join(' | ') || 'none')
await browser.close()
if (!pass || errs.length) process.exit(1)
