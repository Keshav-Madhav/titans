// The Old Wood's bell (#7, PLAN §4b.2): five in time; the stair comes out of the giant tree; each
// slab holds you up; you can walk up it; at the top, what was kept there. Shots from several sides.
import { chromium } from 'playwright-core'
const OUT = process.argv[2]
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-gl=angle', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(m.text())); page.on('pageerror', (e) => errs.push(e.message))
await page.goto('http://localhost:4317/?offline', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__g && window.__g.ready === true', null, { timeout: 240000 })
const B = 2.6
const info = await page.evaluate(() => {
  const g = window.__g; g.weather.set('clear', true); g.sky.setTime(0.38); g.finds.find('bag')
  const b = g.sunkBells.bells.find((x) => x.def.id === 'bell-wood')
  return b ? { bell: [Math.round(b.def.x), Math.round(b.def.z)] } : null
})
console.log('wood bell:', JSON.stringify(info))
if (!info) { console.log('FAIL no wood bell'); process.exit(1) }
const face = async (tx, tz, pitch, dist) => {
  await page.evaluate(([tx, tz, pitch, dist]) => { const g = window.__g, w = g.wanderer.pos; g.setCam(Math.atan2(tx - w.x, tz - w.z), pitch, dist) }, [tx, tz, pitch, dist])
  await page.waitForTimeout(300)
  await page.evaluate(([tx, tz, pitch, dist]) => { const g = window.__g, w = g.wanderer.pos; const d = new g.THREE.Vector3(); g.camera.getWorldDirection(d); if (d.x * (tx - w.x) + d.z * (tz - w.z) < 0) g.setCam(Math.atan2(tx - w.x, tz - w.z) + Math.PI, pitch, dist) }, [tx, tz, pitch, dist])
}
await page.evaluate(() => { const g = window.__g, b = g.sunkBells.bells.find((x) => x.def.id === 'bell-wood'); g.teleport(b.stand.x, b.stand.z) })
await page.waitForTimeout(800)
const bp = await page.evaluate(() => { const b = window.__g.sunkBells.bells.find((x) => x.def.id === 'bell-wood'); return [b.def.x, b.def.z] })
await face(bp[0], bp[1], 0.1, 7)
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/wood-bell.png` })
const count = async () => { await page.waitForTimeout(150); return page.evaluate(() => window.__g.sunkBells.bells.find((x) => x.def.id === 'bell-wood').count) }
const counts = []
for (let i = 0; i < 5; i++) {
  await page.keyboard.press('KeyE')
  counts.push(await count())
  if (i < 4) await page.waitForTimeout(B * 1000 - 150)
}
const built = await page.evaluate(() => { const g = window.__g, s = g.woodStair; s.__ms = 0; return s ? { slabs: s.slabs.length, secs: +s.secs.toFixed(1), topAbove: Math.round(s.top.y - g.heightAt(s.top.x, s.top.z)) } : null })
console.log('stair:', JSON.stringify(built))
// Watching it come out, from the bell's clearing, looking up the trunk.
await page.waitForTimeout(12000)
const tp = await page.evaluate(() => { const g = window.__g, s = g.woodStair; return [s.top.x, s.top.z] })
await face(tp[0], tp[1], -0.3, 5)
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/wood-rising.png` })
const secs = built?.secs ?? 75
await page.waitForTimeout(Math.max(0, (secs - 13) * 1000 + 2000))
// Each slab holds you (floor where its top is): sample every 10th.
const holds = await page.evaluate(() => {
  const g = window.__g, s = g.woodStair, v = new g.THREE.Vector3()
  let ok = 0, n = 0
  for (let i = 0; i < s.slabs.length; i += 10) {
    const sl = s.slabs[i]
    { const k = sl.len / 2 - 1.4; v.set(sl.c.x + sl.out.x * k, sl.c.y + 0.21, sl.c.z + sl.out.y * k); s.toWorld(v) }
    const f = g.rocks.floorAt(v.x, v.y + 0.3, v.z)
    n++
    if (f !== null && Math.abs(f - v.y) < 0.25) ok++
    else (s.__bad ??= []).push(i)
  }
  return { ok, n, bad: s.__bad ?? [] }
})
// Walk up it: stand on slab 12, face the next ones, hold W.
const walk = await page.evaluate(() => {
  const g = window.__g, s = g.woodStair, v = new g.THREE.Vector3(), u = new g.THREE.Vector3()
  const a = s.slabs[12], b = s.slabs[16]
  const ka = a.len / 2 - 1.4, kb = b.len / 2 - 1.4; v.set(a.c.x + a.out.x * ka, a.c.y + 0.21, a.c.z + a.out.y * ka); s.toWorld(v); u.set(b.c.x + b.out.x * kb, b.c.y, b.c.z + b.out.y * kb); s.toWorld(u)
  g.wanderer.place(v.x, v.y + 0.3, v.z)
  return { y0: v.y, to: [u.x, u.z] }
})
await face(walk.to[0], walk.to[1], 0.2, 6)
await page.waitForTimeout(300)
// (The yaw the rig wants for "toward": found once, from the facing check above.)
const off = await page.evaluate((to) => { const g = window.__g, w = g.wanderer.pos; return g.rig.yaw - Math.atan2(to[0] - w.x, to[1] - w.z) }, walk.to)
await page.keyboard.down('KeyW')
for (let k = 0; k < 40; k++) {
  // Steer as a player would: toward a slab a few ahead of the nearest one.
  await page.evaluate((off) => {
    const g = window.__g, s = g.woodStair, w = g.wanderer.pos, v = new g.THREE.Vector3()
    let best = 0, bd = Infinity
    s.slabs.forEach((sl, i) => { v.copy(sl.c); s.toWorld(v); const d = v.distanceTo(w); if (d < bd) { bd = d; best = i } })
    const t = s.slabs[Math.min(s.slabs.length - 1, best + 2)]
    // (The middle of the walk: the slab's centre is at the bark — most of it is in the tree.)
    { const k = t.len / 2 - 1.4; v.set(t.c.x + t.out.x * k, t.c.y, t.c.z + t.out.y * k); s.toWorld(v) }
    g.setCam(Math.atan2(v.x - w.x, v.z - w.z) + off, 0.2, 6)
    const sl = s.slabs[best]; v.copy(sl.c); s.toWorld(v)
    const ax = s.slabs[best].out
    return { i: best, dy: +(w.y - v.y - 0.21).toFixed(2), d: +Math.hypot(w.x - v.x, w.z - v.z).toFixed(2), gr: g.wanderer.grounded, st: g.wanderer.onStone }
  }, off).then((r) => process.env.DBG && console.log(JSON.stringify(r)))
  await page.waitForTimeout(220)
}
await page.keyboard.up('KeyW')
await page.waitForTimeout(300)
const walked = await page.evaluate((y0) => +(window.__g.wanderer.pos.y - y0).toFixed(2), walk.y0)
await page.screenshot({ path: `${OUT}/wood-on-stair.png` })
// From well off, the whole spiral.
await page.evaluate(() => { const g = window.__g, b = g.sunkBells.bells.find((x) => x.def.id === 'bell-wood'); g.teleport(b.stand.x, b.stand.z) })
await page.waitForTimeout(500)
await face(tp[0], tp[1], -0.35, 5)
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}/wood-whole.png` })
// The top.
await page.evaluate(() => { const g = window.__g, t = g.woodStair.top; g.wanderer.place(t.x, t.y + 1, t.z) })
await page.waitForTimeout(2000)
const top = await page.evaluate(() => { const g = window.__g, w = g.wanderer.pos, t = g.woodStair.top; const s = g.spots.near(w, (id) => g.finds.has(id)); return { dy: +(w.y - t.y).toFixed(2), spot: s ? s.id : null } })
await page.evaluate(() => { const g = window.__g; g.setCam(g.rig.yaw + 2.2, 0.35, 9) })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/wood-top.png` })
const pass = counts.join() === '1,2,3,4,5' && built && built.slabs > 60 && holds.ok >= holds.n - 1 && walked > 4 && Math.abs(top.dy) < 1.5 && top.spot === 'stair-wood'
console.log(`${pass ? 'ok  ' : 'FAIL'} woodbell: ${JSON.stringify({ counts, built, holds, walked, top })}`)
console.log('errors:', errs.join(' | ') || 'none')
await browser.close()
if (!pass || errs.length) process.exit(1)
