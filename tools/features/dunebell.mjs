// The Dune Sea's bell (#7, PLAN §4b.3): the crown in the sand before; five in time; the head
// rises out of the sand; you walk in at its mouth and what was kept is there. Shots on the way.
import { chromium } from 'playwright-core'
const OUT = process.argv[2]
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-gl=angle', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(m.text())); page.on('pageerror', (e) => errs.push(e.message))
await page.goto('http://localhost:4317/?offline', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__g && window.__g.ready === true', null, { timeout: 240000 })
const B = 2.6
const info = await page.evaluate(() => {
  const g = window.__g; g.weather.set('clear', true); g.sky.setTime(0.4); g.finds.find('bag')
  const b = g.sunkBells.bells.find((x) => x.def.id === 'bell-dunes'), h = g.duneHead
  return b && h ? { bell: [Math.round(b.def.x), Math.round(b.def.z)], head: [Math.round(h.f.x), Math.round(h.f.z)], crownAbove: +(h.f.y + 25 - g.heightAt(h.f.x, h.f.z)).toFixed(1) } : null
})
console.log('dunes:', JSON.stringify(info))
if (!info) { console.log('FAIL no dunes bell'); process.exit(1) }
let off = null
const face = async (tx, tz, pitch, dist) => {
  if (off === null) {
    await page.evaluate(([tx, tz]) => { const g = window.__g, w = g.wanderer.pos; g.setCam(Math.atan2(tx - w.x, tz - w.z), 0, 6) }, [tx, tz])
    await page.waitForTimeout(300)
    off = await page.evaluate(([tx, tz]) => { const g = window.__g, w = g.wanderer.pos; const d = new g.THREE.Vector3(); g.camera.getWorldDirection(d); return d.x * (tx - w.x) + d.z * (tz - w.z) < 0 ? Math.PI : 0 }, [tx, tz])
  }
  await page.evaluate(([tx, tz, pitch, dist, off]) => { const g = window.__g, w = g.wanderer.pos; g.setCam(Math.atan2(tx - w.x, tz - w.z) + off, pitch, dist) }, [tx, tz, pitch, dist, off])
  await page.waitForTimeout(300)
}
await page.evaluate(() => { const g = window.__g, b = g.sunkBells.bells.find((x) => x.def.id === 'bell-dunes'); g.teleport(b.stand.x, b.stand.z) })
await page.waitForTimeout(800)
await face(info.head[0], info.head[1], 0.05, 6)
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}/dunes-before.png` })
const counts = []
for (let i = 0; i < 5; i++) {
  await page.keyboard.press('KeyE')
  await page.waitForTimeout(150)
  counts.push(await page.evaluate(() => window.__g.sunkBells.bells.find((x) => x.def.id === 'bell-dunes').count))
  if (i < 4) await page.waitForTimeout(B * 1000 - 150)
}
await page.waitForTimeout(24000)
await face(info.head[0], info.head[1], -0.05, 6)
await page.screenshot({ path: `${OUT}/dunes-rising.png` })
await page.waitForTimeout(25000)
const risen = await page.evaluate(() => { const g = window.__g, h = g.duneHead; return { running: h.running, crownAbove: +(h.f.y + 25 - g.heightAt(h.f.x, h.f.z)).toFixed(1) } })
await face(info.head[0], info.head[1], -0.1, 6)
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/dunes-risen.png` })
// From the side, nearer: what stands on what.
await page.evaluate(() => { const g = window.__g, h = g.duneHead, c = Math.cos(h.f.rot), s = Math.sin(h.f.rot); const lx = 32, lz = 14; g.teleport(h.f.x + lx * c + lz * s, h.f.z - lx * s + lz * c) })
await page.waitForTimeout(600)
await face(info.head[0], info.head[1], -0.1, 7)
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/dunes-side.png` })
// Walk in at the mouth: start 9 m out in front of it, face the room, W.
const start = await page.evaluate(() => { const g = window.__g, h = g.duneHead, c = Math.cos(h.f.rot), s = Math.sin(h.f.rot); const lz = 16; g.teleport(h.f.x + lz * s, h.f.z + lz * c); return [h.inside.x, h.inside.z] })
await page.waitForTimeout(600)
await face(start[0], start[1], 0.05, 4)
await page.keyboard.down("KeyW"); await page.waitForTimeout(8000); await page.keyboard.up('KeyW')
await page.waitForTimeout(600)
const inside = await page.evaluate(() => { const g = window.__g, w = g.wanderer.pos, h = g.duneHead; const s = g.spots.near(w, (id) => g.finds.has(id)); return { d: +Math.hypot(w.x - h.inside.x, w.z - h.inside.z).toFixed(2), dy: +(w.y - h.inside.y).toFixed(2), spot: s ? s.id : null } })
await page.screenshot({ path: `${OUT}/dunes-inside.png` })
const pass = counts.join() === '1,2,3,4,5' && info.crownAbove > 0.5 && info.crownAbove < 4 && !risen.running && risen.crownAbove > 21 && inside.d < 3 && Math.abs(inside.dy) < 0.6 && inside.spot === 'head-dunes'
console.log(`${pass ? 'ok  ' : 'FAIL'} dunebell: ${JSON.stringify({ counts, before: info.crownAbove, risen, inside })}`)
console.log('errors:', errs.join(' | ') || 'none')
await browser.close()
if (!pass || errs.length) process.exit(1)
