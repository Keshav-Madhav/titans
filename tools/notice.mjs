// A giant notices you: its head turns toward you, then away again.
import { chromium } from 'playwright-core'
const OUT = process.argv[2]
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-gl=angle', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(m.text())); page.on('pageerror', (e) => errs.push(e.message))
await page.goto('http://localhost:4317/?offline', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__g && window.__g.ready === true', null, { timeout: 240000 })
// Stand off the Walker's side, so its forward is across the view and a turn to you shows.
await page.evaluate(() => { const g = window.__g; g.weather.set('clear', true); g.sky.setTime(0.4); const t = g.titan.gait; const fx = Math.sin(t.heading), fz = Math.cos(t.heading); const x = t.x - fz * 260, z = t.z + fx * 260; g.teleport(x, z); const y = g.heightAt(x, z); g.lookFrom([x, y + 6, z], [t.x, y + 200, t.z]) })
await page.waitForTimeout(3000)
const head = () => page.evaluate(() => { const g = window.__g; const h = g.titan.part('head').mesh; const v = new g.THREE.Vector3(0, 0, 1).applyQuaternion(h.getWorldQuaternion(new g.THREE.Quaternion())); const p = g.player(); const hp = h.getWorldPosition(new g.THREE.Vector3()); const to = new g.THREE.Vector3(p.x - hp.x, 0, p.z - hp.z).normalize(); v.y = 0; v.normalize(); return +(Math.acos(Math.max(-1, Math.min(1, v.dot(to)))) * 180 / Math.PI).toFixed(1) })
const before = await head()
await page.screenshot({ path: `${OUT}/notice-before.png` })
await page.evaluate(() => { const g = window.__g; const t = g.titan.gait; g.noticeNear(t.x, t.z, 100, 8, null) })
await page.waitForTimeout(4500)
const during = await head()
await page.screenshot({ path: `${OUT}/notice-during.png` })
await page.waitForTimeout(9000)
const after = await head()
console.log(`head-to-you angle: before ${before}°, noticing ${during}°, after ${after}°`)
console.log('errors:', errs.join(' | ') || 'none')
await browser.close()
if (!(during < before - 15) || errs.length) process.exit(1)
