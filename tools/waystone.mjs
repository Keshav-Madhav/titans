// Waystones and the grapple's new aids, driven like a player.
import { chromium } from 'playwright-core'
const OUT = process.argv[2]
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-gl=angle', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(m.text())); page.on('pageerror', (e) => errs.push(e.message))
await page.goto('http://localhost:4317/?offline', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__g && window.__g.ready === true', null, { timeout: 240000 })
const ok = []
// 1. Waystones: light two cairns, stand by the first, E, then 1.
const two = await page.evaluate(() => {
  const g = window.__g; const cs = g.cairns.cairns.slice(0, 2)
  for (const c of cs) g.cairns.light(c, true)
  const a = cs[0]
  g.teleport(a.x + 1.2, a.z, a.y)
  return cs.map((c) => ({ name: c.name, x: Math.round(c.x), y: Math.round(c.y), z: Math.round(c.z) }))
})
await page.waitForTimeout(1500)
const prompt = await page.evaluate(() => document.getElementById('prompt')?.textContent ?? '')
await page.keyboard.press('KeyE'); await page.waitForTimeout(500)
const open = await page.evaluate(() => window.__g.travel.open)
await page.screenshot({ path: `${OUT}/travel-card.png` })
await page.keyboard.press('Digit1'); await page.waitForTimeout(2200)
const at = await page.evaluate(() => { const p = window.__g.player(); return [Math.round(p.x), Math.round(p.y), Math.round(p.z)] })
const d = Math.hypot(at[0] - two[1].x, at[2] - two[1].z)
await page.screenshot({ path: `${OUT}/travel-arrived.png` })
ok.push(['waystone', open && d < 8, { prompt, open, to: two[1].name, at, dist: Math.round(d) }])
// 2. Grapple: below a terrace wall of the Steps (16 m), the reticle shows on its lip; throw, reel
// (hold G), and you end on the upper terrace.
const setup = await page.evaluate(async () => {
  const g = window.__g; g.finds.find('bag'); g.finds.find('line'); g.weather.set('clear', true); g.sky.setTime(0.4)
  const R = g.terrain.base.regions
  let best = null
  for (let x = -6000; x < 6000 && !best; x += 40) for (let z = -6000; z < 6000 && !best; z += 40) {
    if (R.name(x, z) !== 'ruins') continue
    for (let k = 0; k < 4 && !best; k++) {
      const a = k * Math.PI / 2, dx = Math.cos(a), dz = Math.sin(a)
      const lo = g.heightAt(x, z), hi = g.heightAt(x + dx * 12, z + dz * 12)
      const flatLo = Math.abs(g.heightAt(x - dx * 4, z - dz * 4) - lo) < 0.8
      const flatHi = Math.abs(g.heightAt(x + dx * 16, z + dz * 16) - hi) < 0.8
      if (hi - lo > 12 && hi - lo < 20 && flatLo && flatHi) best = { x, z, dx, dz, lo, hi }
    }
  }
  if (!best) return null
  g.teleport(best.x, best.z)
  window.__probeW = best
  return { lo: Math.round(best.lo), hi: Math.round(best.hi) }
})
await page.waitForTimeout(2000)
if (setup) {
  const aim = await page.evaluate(async () => {
    const g = window.__g; const w = window.__probeW
    // (Whichever yaw actually faces the wall: check the camera.)
    let yaw = Math.atan2(w.dx, w.dz)
    g.setCam(yaw, 0, 6); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    { const d = new g.THREE.Vector3(); g.camera.getWorldDirection(d); if (d.x * w.dx + d.z * w.dz < 0) yaw += Math.PI }
    let best = null
    for (let pitch = -0.9; pitch <= 0.3; pitch += 0.02) {
      g.setCam(yaw, pitch, 6); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const h = g.grappleAim()
      if (h && h.at.y < w.hi + 0.5 && (!best || h.at.y > best.y)) best = { pitch, y: h.at.y }
    }
    if (best) g.setCam(yaw, best.pitch, 6)
    return best
  })
  await page.waitForTimeout(500)
  const reticle = await page.evaluate(() => document.getElementById('hook').classList.contains('on'))
  await page.screenshot({ path: `${OUT}/hook-reticle.png` })
  await page.keyboard.down('KeyG')
  const trace = []
  for (let i = 0; i < 20; i++) { await page.waitForTimeout(250); trace.push(await page.evaluate(() => { const g = window.__g; const q = g.player(); const a = g.grapple.anchor; if (g.mantling && !window.__mt) window.__mt = [q.x.toFixed(1), q.z.toFixed(1), g.heightAt(q.x, q.z).toFixed(1), String(g.rocks.topAt(q.x, q.z))]; return `[${(q.x - window.__probeW.x).toFixed(1)},${(q.z - window.__probeW.z).toFixed(1)}]${q.y.toFixed(1)}${g.grapple.attached ? 'A' : g.grapple.busy ? 'F' : '-'}${a ? 'd' + Math.hypot(q.x - a.at.x, q.y - a.at.y, q.z - a.at.z).toFixed(1) : ''}${g.mantling ? 'M' : ''}` })) }
  await page.keyboard.up('KeyG'); await page.waitForTimeout(1500)
  const p = await page.evaluate(() => { const q = window.__g.player(); return { y: +q.y.toFixed(1) } })
  console.log('trace', trace.join(' ')); console.log('mantle seen at', await page.evaluate(() => JSON.stringify(window.__mt)))
  console.log('after', await page.evaluate(() => { const g = window.__g; const q = g.player(); const xz = [q.x, q.z].map((v) => v.toFixed(1)); return JSON.stringify({ xz, ground: g.heightAt(q.x, q.z).toFixed(1), rockTop: g.rocks.topAt(q.x, q.z), wall: window.__probeW }) }))
  await page.screenshot({ path: `${OUT}/hook-after.png` })
  ok.push(['grapple', reticle && p.y > setup.hi - 1.5, { setup, aim, reticle, end: p }])
} else ok.push(['grapple', false, 'no terrace wall found'])
for (const [n, pass, info] of ok) console.log(`${pass ? 'ok  ' : 'FAIL'} ${n}: ${JSON.stringify(info)}`)
console.log('errors:', errs.join(' | ') || 'none')
await browser.close()
if (ok.some((o) => !o[1]) || errs.length) process.exit(1)
