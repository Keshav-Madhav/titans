// Thermals: there are some (by day); from the sand, the devil and the birds above it show; gliding
// in it, circling, you go up (against the same glide 300 m away). Shots: from the ground, circling.
import { chromium } from 'playwright-core'
const OUT = process.argv[2]
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-gl=angle', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(m.text())); page.on('pageerror', (e) => errs.push(e.message))
await page.goto('http://localhost:4317/?offline', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__g && window.__g.ready === true', null, { timeout: 240000 })
const info = await page.evaluate(() => {
  const g = window.__g; g.weather.set('clear', true); g.sky.setTime(0.42); for (const f of ['bag', 'cloak']) g.finds.find(f)
  return g.thermals.cols.map((c) => [Math.round(c.x), Math.round(c.z)])
})
console.log('thermals:', JSON.stringify(info))
if (info.length < 5) { console.log('FAIL too few'); process.exit(1) }
await page.waitForTimeout(6000) // (they fade in with the day)
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
const c0 = info[0]
await page.evaluate((c) => window.__g.teleport(c[0] + 34, c[1] + 12), c0)
await page.waitForTimeout(800)
// (Past the wanderer's shoulder: the devil off to one side of the frame, not behind the hood.)
await face(c0[0] + 9, c0[1] - 16, 0.05, 6)
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}/thermal-ground.png` })
await face(c0[0], c0[1], -1.15, 5)
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/thermal-birds.png` })
async function glide(dx) {
  await page.evaluate(([c, dx]) => {
    const g = window.__g, x = c[0] + dx + 20, z = c[1]
    g.wanderer.place(x, g.heightAt(x, z) + 90, z)
    g.wanderer.vel.set(0, -2, 10)
    g.wanderer.yaw = 0
  }, [c0, dx])
  await page.keyboard.down('Space')
  const y0 = await page.evaluate(() => window.__g.wanderer.pos.y)
  let kMax = 0
  await page.keyboard.down('KeyD')
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(500)
    kMax = Math.max(kMax, await page.evaluate(() => window.__g.thermals.lastK))
    if (dx === 0 && i === 12) await page.screenshot({ path: `${OUT}/thermal-circling.png` })
  }
  await page.keyboard.up('KeyD')
  const r = await page.evaluate(() => ({ y: window.__g.wanderer.pos.y, gliding: window.__g.wanderer.gliding }))
  await page.keyboard.up('Space')
  await page.waitForTimeout(300)
  return { dy: +(r.y - y0).toFixed(1), gliding: r.gliding, kMax: +kMax.toFixed(2) }
}
const inCol = await glide(0)
const away = await glide(300)
const pass = inCol.dy > away.dy + 40 && inCol.kMax > 0.5 && away.kMax === 0
console.log(`${pass ? 'ok  ' : 'FAIL'} thermals: ${JSON.stringify({ inCol, away })}`)
console.log('errors:', errs.join(' | ') || 'none')
await browser.close()
if (!pass || errs.length) process.exit(1)
