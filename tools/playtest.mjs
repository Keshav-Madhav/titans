// A playtest, driven like a player in real time (the user, 2026-11-06: checks find breakage, screenshots
// find what looks wrong, "and then i need a play test by you too which checks for performance,
// quality, controls, animations, feel in general"). Real requestAnimationFrame timing, real key presses
// held for real durations. Per segment it reports:
//   frames   — frame time median / p95 / p99 / worst, and hitches (> 2× the median, > 25 ms)
//   input    — ms from a key going down to the body answering (speed up, turn begun, leaving the ground)
//   camera   — the camera's jerk: frames where its acceleration jumps far past its typical
//   body     — rig bones (relative to the root) whose acceleration spikes: pops in the animation
// Writes <out>/playtest.json and a frame strip per segment (<out>/pt-<seg>-N.png) to look at.
//   node tools/playtest.mjs <out>
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
const OUT = process.argv[2] ?? 'shots/playtest'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto(`${process.env.TITANS_URL ?? 'http://localhost:4317'}/?offline`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__g && window.__g.ready === true', null, { timeout: 240000 })
await page.waitForFunction('!!window.__g.wanderer.avatar', null, { timeout: 60000 })

// A recorder in the page: every animation frame, the time, the body, the camera, a few bones.
await page.evaluate(() => {
  const g = window.__g
  g.realtime()
  const BONES = ['pelvis', 'Head', 'hand_l', 'hand_r', 'foot_l', 'foot_r']
  const T = g.THREE, v = new T.Vector3()
  window.__rec = { on: false, rows: [], marks: [] }
  const tick = (t) => {
    const R = window.__rec
    if (R.on) {
      const w = g.wanderer, c = g.camera.position, av = w.avatar
      const b = {}
      for (const n of BONES) { av.bone(n).getWorldPosition(v); b[n] = [v.x - w.obj.position.x, v.y - w.obj.position.y, v.z - w.obj.position.z] }
      R.rows.push({ t, x: w.obj.position.x, y: w.obj.position.y, z: w.obj.position.z, yaw: w.yaw, speed: w.speed, grounded: w.grounded, cx: c.x, cy: c.y, cz: c.z, climb: g.climbState().active, glide: w.gliding, b })
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})

const press = async (keys, ms) => {
  await page.evaluate((keys) => { for (const k of keys) window.__g.input.press(k); window.__rec.marks.push({ t: performance.now(), down: keys }) }, keys)
  await page.waitForTimeout(ms)
  await page.evaluate((keys) => { for (const k of keys) window.__g.input.release(k); window.__rec.marks.push({ t: performance.now(), up: keys }) }, keys)
}
const segment = async (name, setup, drive) => {
  await page.evaluate(setup)
  await page.waitForTimeout(1500)
  await page.evaluate(() => { window.__rec.rows = []; window.__rec.marks = []; window.__rec.on = true })
  const shots = []
  await drive(async () => { const f = `${OUT}/pt-${name}-${shots.length}.png`; await page.screenshot({ path: f }); shots.push(f) })
  const data = await page.evaluate(() => { window.__rec.on = false; return { rows: window.__rec.rows, marks: window.__rec.marks } })
  return { name, ...analyse(data), shots }
}

function stats(a) {
  const s = a.slice().sort((x, y) => x - y)
  const q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))]
  return { med: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), p99: +q(0.99).toFixed(1), max: +s[s.length - 1].toFixed(1) }
}
function analyse({ rows, marks }) {
  const dts = []
  for (let i = 1; i < rows.length; i++) dts.push(rows[i].t - rows[i - 1].t)
  const fs = stats(dts)
  const hitches = dts.map((d, i) => [i + 1, d]).filter(([, d]) => d > Math.max(25, fs.med * 2)).map(([i, d]) => ({ at: +(rows[i].t - rows[0].t).toFixed(0), ms: +d.toFixed(1) }))
  // Input: for each key-down, the first frame the body answers.
  const input = []
  for (const m of marks) {
    if (!m.down) continue
    const i0 = rows.findIndex((r) => r.t >= m.t)
    if (i0 < 0) continue
    const r0 = rows[Math.max(0, i0 - 1)]
    let answered = null
    for (let i = i0; i < rows.length && rows[i].t - m.t < 1000; i++) {
      const r = rows[i]
      const turned = Math.abs(Math.atan2(Math.sin(r.yaw - r0.yaw), Math.cos(r.yaw - r0.yaw))) > 0.05
      const sped = Math.abs(r.speed - r0.speed) > 0.3
      const lifted = r.y - r0.y > 0.05 && m.down.includes('Space')
      const caught = r.climb !== r0.climb || r.glide !== r0.glide
      if (turned || sped || lifted || caught) { answered = +(r.t - m.t).toFixed(0); break }
    }
    input.push({ keys: m.down.join('+'), ms: answered })
  }
  // Camera jerk: acceleration of its position, per frame, against its own median.
  const cam = []
  for (let i = 2; i < rows.length; i++) {
    const a = rows[i], b = rows[i - 1], c = rows[i - 2]
    const d1 = (a.t - b.t) / 1000, d0 = (b.t - c.t) / 1000
    if (d1 <= 0 || d0 <= 0) continue
    const ax = ((a.cx - b.cx) / d1 - (b.cx - c.cx) / d0) / ((d1 + d0) / 2)
    const ay = ((a.cy - b.cy) / d1 - (b.cy - c.cy) / d0) / ((d1 + d0) / 2)
    const az = ((a.cz - b.cz) / d1 - (b.cz - c.cz) / d0) / ((d1 + d0) / 2)
    cam.push([i, Math.hypot(ax, ay, az)])
  }
  const camS = stats(cam.map(([, v]) => v))
  const camJerks = cam.filter(([, v]) => v > Math.max(40, camS.med * 8)).map(([i, v]) => ({ at: +(rows[i].t - rows[0].t).toFixed(0), acc: Math.round(v) }))
  // Bone pops: per bone, frames whose acceleration is far over that bone's median.
  const pops = []
  for (const n of Object.keys(rows[0]?.b ?? {})) {
    const acc = []
    for (let i = 2; i < rows.length; i++) {
      const a = rows[i].b[n], b = rows[i - 1].b[n], c = rows[i - 2].b[n]
      const d1 = (rows[i].t - rows[i - 1].t) / 1000, d0 = (rows[i - 1].t - rows[i - 2].t) / 1000
      if (d1 <= 0 || d0 <= 0) continue
      const v = [0, 1, 2].map((k) => ((a[k] - b[k]) / d1 - (b[k] - c[k]) / d0) / ((d1 + d0) / 2))
      acc.push([i, Math.hypot(...v)])
    }
    const st = stats(acc.map(([, v]) => v))
    for (const [i, v] of acc) if (v > Math.max(120, st.med * 10)) pops.push({ bone: n, at: +(rows[i].t - rows[0].t).toFixed(0), acc: Math.round(v), med: st.med })
  }
  pops.sort((a, b) => b.acc - a.acc)
  return { frames: rows.length, frameMs: fs, hitches: hitches.slice(0, 10), hitchCount: hitches.length, input, camera: { accMed: camS.med, jerks: camJerks.slice(0, 8), jerkCount: camJerks.length }, pops: pops.slice(0, 8), popCount: pops.length }
}

const report = []
// 1. Walk, sprint, stop, about-face, strafe — on the open Green.
report.push(await segment('ground', () => { const g = window.__g; g.weather.set('clear', true); g.sky.setTime(0.4); g.teleport(-600, 420); g.wanderer.yaw = 0; g.setCam(Math.PI, 0.15, 7) }, async (shot) => {
  await press(['KeyW'], 1500); await shot()
  await press(['KeyW', 'ShiftLeft'], 2500); await shot()
  await page.waitForTimeout(600)
  await press(['KeyS'], 1200); await shot()
  await press(['KeyA'], 800); await press(['KeyD'], 800)
  await press(['KeyW', 'KeyA'], 1200); await shot()
}))
// 2. Jumps while running, landing.
report.push(await segment('jumps', () => { const g = window.__g; g.teleport(-600, 420); g.wanderer.yaw = 0; g.setCam(Math.PI, 0.15, 7) }, async (shot) => {
  await page.evaluate(() => window.__g.input.press('KeyW'))
  for (let i = 0; i < 3; i++) { await page.waitForTimeout(700); await press(['Space'], 120); if (i === 1) { await page.waitForTimeout(250); await shot() } }
  await page.waitForTimeout(1200)
  await page.evaluate(() => window.__g.input.release('KeyW'))
}))
// 3. Camera: a sweep of the mouse round while walking.
report.push(await segment('look', () => { const g = window.__g; g.teleport(-600, 420); g.setCam(Math.PI, 0.15, 7) }, async (shot) => {
  await page.evaluate(() => window.__g.input.press('KeyW'))
  for (let i = 0; i < 40; i++) { await page.evaluate(() => { window.__g.input.lookX += 18 }); await page.waitForTimeout(40) }
  await shot()
  await page.evaluate(() => window.__g.input.release('KeyW'))
}))
// 4. Climb a giant and ride it.
report.push(await segment('giant', () => { window.__g.grabTitan() }, async (shot) => {
  await press(['KeyW'], 4000); await shot()
  await press(['KeyA'], 1200); await press(['KeyD'], 1200); await shot()
}))
// 5. Off the giant, glide down.
report.push(await segment('glide', () => { const g = window.__g; g.finds.find('cloak'); const p = g.wanderer.pos; g.wanderer.place(p.x, p.y + 80, p.z) }, async (shot) => {
  await page.waitForTimeout(300)
  await page.evaluate(() => window.__g.input.press('Space'))
  await page.waitForTimeout(1200); await shot()
  await press(['KeyA'], 900); await press(['KeyD'], 900); await shot()
  await page.evaluate(() => window.__g.input.release('Space'))
  await page.waitForTimeout(2500)
}))

writeFileSync(`${OUT}/playtest.json`, JSON.stringify({ errors: errs, report }, null, 1))
for (const r of report) {
  console.log(`== ${r.name}: ${r.frames} frames; frame ms ${JSON.stringify(r.frameMs)}; hitches ${r.hitchCount}${r.hitches.length ? ' ' + JSON.stringify(r.hitches.slice(0, 4)) : ''}`)
  console.log(`   input ms: ${r.input.map((i) => `${i.keys} ${i.ms ?? 'none'}`).join(', ')}`)
  console.log(`   camera acc med ${r.camera.accMed}; jerks ${r.camera.jerkCount}${r.camera.jerks.length ? ' ' + JSON.stringify(r.camera.jerks.slice(0, 4)) : ''}`)
  console.log(`   bone pops ${r.popCount}${r.pops.length ? ' ' + JSON.stringify(r.pops.slice(0, 4)) : ''}`)
}
console.log('errors:', errs.length ? errs.join(' | ') : 'none')
await browser.close()
