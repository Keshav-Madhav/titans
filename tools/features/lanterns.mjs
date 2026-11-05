// Lantern paths (#8): three paths; by day the first lamp will not take; at night E lights it and
// the fire runs down the line to the ring, revealing what is on the slab. Shots: the line lit, the ring.
import { chromium } from 'playwright-core'
const OUT = process.argv[2]
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(m.text())); page.on('pageerror', (e) => errs.push(e.message))
await page.goto('http://localhost:4317/?offline', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__g && window.__g.ready === true', null, { timeout: 240000 })
const info = await page.evaluate(() => {
  const g = window.__g; g.weather.set('clear', true); g.sky.setTime(0.4); for (const f of ['bag']) g.finds.find(f)
  return g.lanterns.paths.map((p) => ({ id: p.def.id, x: Math.round(p.lamps[0].x), z: Math.round(p.lamps[0].z), run: Math.round(Math.hypot(p.end.x - p.lamps[0].x, p.end.z - p.lamps[0].z)) }))
})
console.log('paths:', JSON.stringify(info))
const J = Number(process.env.PATH_I ?? 0)
// Stand by the first lamp, looking along the line.
const stand = async () => {
  await page.evaluate((j) => {
    const g = window.__g, p = g.lanterns.paths[j], a = p.lamps[0], b = p.lamps[3]
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz)
    g.teleport(a.x - (dx / L) * 1.8, a.z - (dz / L) * 1.8)
    g.setCam(Math.atan2(dx, dz), 0.05, 6)
  }, J)
  await page.waitForTimeout(400)
  await page.evaluate((j) => { const g = window.__g, p = g.lanterns.paths[j], a = p.lamps[0], b = p.lamps[3]; const d = new g.THREE.Vector3(); g.camera.getWorldDirection(d); if (d.x * (b.x - a.x) + d.z * (b.z - a.z) < 0) g.setCam(Math.atan2(b.x - a.x, b.z - a.z) + Math.PI, 0.05, 6) }, J)
  await page.waitForTimeout(1200)
}
await stand()
const dayPrompt = await page.evaluate(() => document.getElementById('prompt')?.textContent ?? '')
await page.keyboard.press('KeyE')
await page.waitForTimeout(500)
const dayKindled = await page.evaluate((j) => window.__g.lanterns.paths[j].kindled, J)
await page.screenshot({ path: `${OUT}/lamps-day.png` })
// Close beside the first lamp, from the side (what holds what up).
await page.evaluate((j) => { const g = window.__g, a = g.lanterns.paths[j].lamps[0]; g.teleport(a.x + 3, a.z + 1); g.setCam(g.rig.yaw + 1.2, 0.15, 4) }, J)
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/lamps-close.png` })
// Night.
await page.evaluate(() => window.__g.sky.setTime(0.0))
await page.waitForTimeout(1500)
await stand()
const nightPrompt = await page.evaluate(() => document.getElementById('prompt')?.textContent ?? '')
await page.keyboard.press('KeyE')
await page.waitForTimeout(9000)
await page.screenshot({ path: `${OUT}/lamps-running.png` })
await page.waitForTimeout(12000)
await page.evaluate(() => { const g = window.__g; g.setCam(g.rig.yaw, 0.32, 24) })
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/lamps-lit.png` })
const lit = await page.evaluate((j) => { const g = window.__g, p = g.lanterns.paths[j]; return { kindled: p.kindled, night: +g.sky.night.toFixed(2) } }, J)
// The ring: stand near the slab, look at it.
const ring = await page.evaluate((j) => {
  const g = window.__g, p = g.lanterns.paths[j], l = p.lamps[13]
  const dx = p.end.x - l.x, dz = p.end.z - l.z, L = Math.hypot(dx, dz)
  g.teleport(p.end.x - (dx / L) * 2.2, p.end.z - (dz / L) * 2.2)
  g.setCam(Math.atan2(dx, dz), 0.45, 9)
  return true
}, J)
await page.waitForTimeout(1500)
const spot = await page.evaluate(() => { const g = window.__g; const s = g.spots.near(g.wanderer.pos, (id) => g.finds.has(id)); return s ? s.id : null })
await page.screenshot({ path: `${OUT}/lamps-ring.png` })
const id = info[J]?.id
const pass = info.length === 3 && !dayKindled && /Look/.test(dayPrompt) && /Light/.test(nightPrompt) && lit.kindled && spot === id
console.log(`${pass ? 'ok  ' : 'FAIL'} lanterns: ${JSON.stringify({ dayPrompt, dayKindled, nightPrompt, lit, spot, ring })}`)
console.log('errors:', errs.join(' | ') || 'none')
await browser.close()
if (!pass || errs.length) process.exit(1)
