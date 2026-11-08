// Seed rivers (#5): there are some on the Green; gliding into one lifts you (vs. the same glide
// beside it); and shots: one from the grass, one riding it.
import { chromium } from 'playwright-core'
const OUT = process.argv[2]
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-gl=angle', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(m.text())); page.on('pageerror', (e) => errs.push(e.message))
await page.goto('http://localhost:4317/?offline', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__g && window.__g.ready === true', null, { timeout: 240000 })
const info = await page.evaluate(() => {
  const g = window.__g; g.weather.set('clear', true); g.sky.setTime(0.33); for (const f of ['bag', 'cloak']) g.finds.find(f)
  return g.seeds.rivers.map((r) => ({ x: Math.round(r.pts[0].x), z: Math.round(r.pts[0].z), len: Math.round(r.len), top: Math.round(r.pts[31].y - g.heightAt(r.pts[31].x, r.pts[31].z)) }))
})
console.log('rivers:', JSON.stringify(info))
if (info.length < 5) { console.log('FAIL too few rivers'); process.exit(1) }

// From the grass 140 m off its side, looking up at its middle.
for (const [j, name] of [[0, 'a'], [2, 'b']]) {
  await page.evaluate((j) => {
    const g = window.__g, r = g.seeds.rivers[j], p = r.pts[14], q = r.pts[18]
    const dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz)
    const sx = p.x - (dz / L) * 140, sz = p.z + (dx / L) * 140
    g.teleport(sx, sz)
    g.__seedAim = { x: p.x, y: p.y, z: p.z }
  }, j)
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    const g = window.__g, p = g.__seedAim, w = g.wanderer.pos
    const yaw = Math.atan2(p.x - w.x, p.z - w.z), pitch = -0.6 * Math.atan2(p.y - w.y, Math.hypot(p.x - w.x, p.z - w.z))
    g.setCam(yaw, pitch, 7)
  })
  await page.waitForTimeout(300)
  await page.evaluate(() => { const g = window.__g, p = g.__seedAim, w = g.wanderer.pos; const d = new g.THREE.Vector3(); g.camera.getWorldDirection(d); if (d.x * (p.x - w.x) + d.z * (p.z - w.z) < 0) { const yaw = Math.atan2(p.x - w.x, p.z - w.z) + Math.PI, pitch = -0.6 * Math.atan2(p.y - w.y, Math.hypot(p.x - w.x, p.z - w.z)); g.setCam(yaw, pitch, 7) } })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/seeds-side-${name}.png` })
}


async function glide(side) {
  await page.evaluate((side) => {
    const g = window.__g, r = g.seeds.rivers[0], a = r.pts[5], b = r.pts[7]
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L
    const x = a.x - ux * 30 - uz * side, z = a.z - uz * 30 + ux * side
    const y = Math.max(a.y + 4, g.heightAt(x, z) + 30)
    g.wanderer.place(x, y, z)
    g.wanderer.vel.set(ux * 11, -2, uz * 11)
    g.wanderer.yaw = Math.atan2(ux, uz)
  }, side)
  await page.keyboard.down('Space')
  const y0 = await page.evaluate(() => window.__g.wanderer.pos.y)
  let kMax = 0
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(500)
    kMax = Math.max(kMax, await page.evaluate(() => window.__g.seeds.lastK))
    if (side === 0 && i === 7) await page.screenshot({ path: `${OUT}/seeds-ride.png` })
  }
  const r = await page.evaluate(() => ({ y: window.__g.wanderer.pos.y, gliding: window.__g.wanderer.gliding }))
  await page.keyboard.up('Space')
  await page.waitForTimeout(300)
  return { dy: +(r.y - y0).toFixed(1), gliding: r.gliding, kMax: +kMax.toFixed(2) }
}
const inRiver = await glide(0)
const beside = await glide(220)
const pass = inRiver.dy > beside.dy + 25 && inRiver.kMax > 0.5 && beside.kMax === 0
console.log(`${pass ? 'ok  ' : 'FAIL'} seeds: ${JSON.stringify({ inRiver, beside })}`)
console.log('errors:', errs.join(' | ') || 'none')
await browser.close()
if (!pass || errs.length) process.exit(1)
