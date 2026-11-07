// Ice slides: on a High Ice snowfield, push downhill → you slide and gather speed; D carves; S brakes.
import { chromium } from 'playwright-core'
const OUT = process.argv[2]
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(m.text())); page.on('pageerror', (e) => errs.push(e.message))
await page.goto('http://localhost:4317/?offline', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__g && window.__g.ready === true', null, { timeout: 240000 })
const spot = await page.evaluate(() => {
  const g = window.__g; g.weather.set('clear', true); g.sky.setTime(0.4)
  // A long snow slope: sample round the High Ice for grade 0.35–0.6 sustained 60 m down the fall line.
  for (let r = 11500; r < 15000; r += 150) for (let a = 0; a < 6.28; a += 0.05) {
    const x = Math.sin(a) * r, z = Math.cos(a) * r
    if (!g.wanderer.isSnow(x, z)) continue
    const h = g.heightAt(x, z)
    const sx = g.heightAt(x + 1, z) - g.heightAt(x - 1, z), sz = g.heightAt(x, z + 1) - g.heightAt(x, z - 1)
    const grade = Math.hypot(sx, sz) / 2
    if (grade < 0.35 || grade > 0.6) continue
    const L = Math.hypot(sx, sz), dx = -sx / L, dz = -sz / L
    let ok = true
    for (let d = 10; d <= 60; d += 10) { const hh = g.heightAt(x + dx * d, z + dz * d); if (!g.wanderer.isSnow(x + dx * d, z + dz * d) || h - hh < d * 0.2) { ok = false; break } }
    if (ok) return { x, z, dx, dz, grade: +grade.toFixed(2) }
  }
  return null
})
if (!spot) { console.log('FAIL no snow slope found'); process.exit(1) }
await page.evaluate((s) => { const g = window.__g; g.teleport(s.x, s.z); g.setCam(Math.atan2(s.dx, s.dz), 0.2, 7) }, spot)
await page.waitForTimeout(300)
// (The camera's matrix updates on the next frame: check its facing only after one has run.)
await page.evaluate((s) => { const g = window.__g; const d = new g.THREE.Vector3(); g.camera.getWorldDirection(d); if (d.x * s.dx + d.z * s.dz < 0) g.setCam(Math.atan2(s.dx, s.dz) + Math.PI, 0.2, 7) }, spot)
await page.waitForTimeout(1500)
// (Walking down it does not slide you — the user, 2026-11-07: a slide comes only from a crouch.)
await page.keyboard.down('KeyW'); await page.waitForTimeout(600); await page.keyboard.up('KeyW')
const walked = await page.evaluate(() => window.__g.wanderer.sledding)
// C: crouch, and away.
await page.keyboard.press('KeyC'); await page.waitForTimeout(100)
await page.keyboard.down('KeyW'); await page.waitForTimeout(600); await page.keyboard.up('KeyW')
await page.waitForTimeout(2400)
const a = await page.evaluate(() => { const w = window.__g.wanderer; return { sledding: w.sledding, speed: +Math.hypot(w.vel.x, w.vel.z).toFixed(1), dir: Math.atan2(w.vel.x, w.vel.z) } })
await page.screenshot({ path: `${OUT}/sled-run.png` })
await page.keyboard.down('KeyD'); await page.waitForTimeout(1000); await page.keyboard.up('KeyD')
const b = await page.evaluate(() => { const w = window.__g.wanderer; return { sledding: w.sledding, speed: +Math.hypot(w.vel.x, w.vel.z).toFixed(1), dir: Math.atan2(w.vel.x, w.vel.z) } })
await page.keyboard.down('KeyS'); await page.waitForTimeout(1500); await page.keyboard.up('KeyS')
const c = await page.evaluate(() => { const w = window.__g.wanderer; return { sledding: w.sledding, speed: +Math.hypot(w.vel.x, w.vel.z).toFixed(1) } })
const turned = Math.abs(Math.atan2(Math.sin(b.dir - a.dir), Math.cos(b.dir - a.dir)))
// Standing up (C again) ends it.
await page.keyboard.press('KeyC'); await page.waitForTimeout(300)
const stood = await page.evaluate(() => !window.__g.wanderer.sledding && !window.__g.wanderer.crouching)
const pass = !walked && a.sledding && a.speed > 5 && turned > 0.15 && c.speed < b.speed && stood
console.log(`${pass ? 'ok  ' : 'FAIL'} sled: ${JSON.stringify({ spot: { grade: spot.grade }, walkedIntoSlide: walked, stood, run: a.speed, sledding: a.sledding, turnedRad: +turned.toFixed(2), braked: [b.speed, c.speed] })}`)
console.log('errors:', errs.join(' | ') || 'none')
await browser.close()
if (!pass || errs.length) process.exit(1)
