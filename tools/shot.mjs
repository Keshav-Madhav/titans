// Screenshot harness. Opens the game in headless Chrome (ANGLE, real GPU),
// waits for the game to say it is ready, runs a named scene, writes shots/.
//
//   node tools/shot.mjs <scene> [url]
//
// Scenes are small functions over `window.__g`; add one per phase gate.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const scene = process.argv[2] ?? 'ground'
const url = process.argv[3] ?? 'http://localhost:4317/?offline'
mkdirSync('shots', { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`)
})

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
const t0 = Date.now()
await page.waitForFunction('window.__g && window.__g.ready === true', null, { timeout: 120000 })
console.log(`ready in ${Date.now() - t0} ms`)
await page.waitForTimeout(900) // the loading veil fades for 0.8 s

/** Let the world settle after moving the camera: wait for chunk builds to finish. */
async function settle(extraFrames = 30) {
  await page.waitForFunction(() => window.__g.terrainView.settled(), null, { timeout: 60000 })
  await page.evaluate((n) => new Promise((r) => {
    let k = 0
    const tick = () => (++k >= n ? r() : requestAnimationFrame(tick))
    requestAnimationFrame(tick)
  }), extraFrames)
}

async function shot(name) {
  await settle()
  const stats = await page.evaluate(() => window.__g.stats())
  await page.screenshot({ path: `shots/${name}.png` })
  console.log(`shots/${name}.png`, JSON.stringify(stats))
}

const scenes = {
  async ground() {
    await page.evaluate(() => window.__g.setCam(Math.PI * 0.85, 0.12, 6))
    await shot('p1-ground')
    await page.evaluate(() => window.__g.setCam(Math.PI * 0.15, 0.05, 4))
    await shot('p1-ground-2')
  },
  async aerial() {
    await page.evaluate(() => {
      const g = window.__g
      g.rig.setProfile({ minDist: 10, maxDist: 4000, dist: 900, focusHeight: 1.5, follow: 10 })
      g.setCam(Math.PI * 0.9, 0.35)
    })
    await shot('p1-aerial')
    await page.evaluate(() => {
      const g = window.__g
      g.rig.distance = 2600
      g.setCam(Math.PI * 0.2, 0.28)
    })
    await shot('p1-aerial-far')
  },
  // The Wanderer up close, side-lit and back-lit: shadow attached at the feet, cloak solid.
  async closeup() {
    await page.evaluate(() => window.__g.setCam(Math.PI * 0.85, 0.18, 3.2))
    await shot('wanderer-close')
    await page.evaluate(() => window.__g.setCam(Math.PI * 0.85 + 2.2, -0.05, 2.6))
    await shot('wanderer-close-2')
    await page.evaluate(() => window.__g.setCam(Math.PI * 0.85 + 3.1, 0.05, 2.4))
    await shot('wanderer-close-front')
    await page.evaluate(() => window.__g.setCam(Math.PI * 0.85, 1.3, 5))
    await shot('wanderer-top')
  },
  async walk() {
    const before = await page.evaluate(() => window.__g.player())
    await page.evaluate(() => { window.__g.input.press('KeyW'); window.__g.input.press('ShiftLeft') })
    await page.waitForTimeout(2500)
    await page.evaluate(() => { window.__g.input.release('KeyW'); window.__g.input.release('ShiftLeft') })
    const after = await page.evaluate(() => window.__g.player())
    const moved = Math.hypot(after.x - before.x, after.z - before.z)
    console.log(`walked ${moved.toFixed(1)} m, grounded=${after.grounded}`)
    if (moved < 10) throw new Error('walk gate: player barely moved')
    await page.evaluate(() => window.__g.setCam(window.__g.rig.yaw, 0.18, 5))
    await shot('p2-walk')
  },
  // P3 gate: the reel's scale shot — a Wanderer on the plain looking up at a walking Titan.
  async titan() {
    await page.evaluate(() => {
      const g = window.__g
      const t = g.titanState()
      // Stand ahead of the Titan, a little off its path, and walk it toward us.
      const fx = Math.sin(t.heading), fz = Math.cos(t.heading)
      const k = g.titan.H / 120
      g.teleport(t.x + (fx * 400 + fz * 150) * k, t.z + (fz * 400 - fx * 150) * k)
      g.autopilot.forward = 1
      g.clock.scale = 3
    })
    // Wait for strides, not seconds: the Titan's pace is a design knob.
    await page.waitForFunction(() => window.__g.titanState().steps >= 4, null, { timeout: 60000 })
    await page.evaluate(() => {
      const g = window.__g
      g.clock.scale = 1
      const t = g.titanState(), p = g.player()
      // Camera behind the Wanderer, facing the Titan, gaze tilted up.
      const yaw = Math.atan2(p.x - t.x, p.z - t.z)
      g.setCam(yaw, -0.22, 6)
    })
    await shot('p3-scale')
    await page.evaluate(() => { const g = window.__g; g.setCam(g.rig.yaw + 0.25, 0.05, 9) })
    await shot('p3-scale-2')
    const st = await page.evaluate(() => window.__g.titanState())
    console.log('titan', JSON.stringify(st))
    if (st.steps < 3) throw new Error('titan gate: Titan did not walk')
  },
  async titanview() {
    await page.evaluate(async () => {
      const g = window.__g
      g.setRole('titan')
      g.clock.scale = 10
      const t0 = g.titanState().steps
      g.input.press('KeyW')
      while (g.titanState().steps < t0 + 10) await new Promise((r) => setTimeout(r, 50))
      g.input.release('KeyW')
      const until = Date.now() + 20000
      while (Date.now() < until) {
        if (g.titanState().speed === 0 && !g.titan.gait.isSwinging && g.lakeStats().every((l) => l.full)) break
        await new Promise((r) => setTimeout(r, 100))
      }
      g.clock.scale = 1
      // Look back along the trail from behind the Titan's shoulder.
      g.setCam(g.titanState().heading + 0.35, 0.42, 2.6 * g.titan.H)
    })
    await shot('p3-titan-view')
  },
  // P4 gate: twenty steps leave twenty measured craters.
  async trail() {
    const falls = await page.evaluate(async () => {
      const g = window.__g
      const out = []
      const t0 = g.titanState()
      g.autopilot.forward = 1
      g.autopilot.turn = 0.25
      g.clock.scale = 10
      let seen = t0.steps
      while (seen < t0.steps + 20) {
        await new Promise((r) => setTimeout(r, 50))
        const t = g.titanState()
        if (t.steps > seen) {
          seen = t.steps
          const foot = (t.steps % 2 === 1) ? 0 : 1
          out.push(t.plant[0], t.plant[1])
        }
      }
      g.autopilot.forward = 0
      g.clock.scale = 1
      return out
    })
    const depths = await page.evaluate((pts) => pts.map((p) => window.__g.deltaAt(p.x, p.z)), falls)
    const deep = depths.filter((d) => d < -2).length
    console.log(`sampled ${depths.length} planted-foot points, ${deep} sit in a crater deeper than 2 m; min delta ${Math.min(...depths).toFixed(2)} m`)
    await page.evaluate(() => {
      const g = window.__g
      const t = g.titanState()
      g.teleport(t.x - Math.sin(t.heading) * 500, t.z - Math.cos(t.heading) * 500)
      g.rig.setProfile({ minDist: 10, maxDist: 4000, dist: 650, focusHeight: 1.5, follow: 10 })
      g.setCam(t.heading + Math.PI + 0.5, 0.55)
    })
    await shot('p4-trail')
    if (deep < 16) throw new Error('trail gate: footprints missing')
  },
  // P5 gate: the reel's "every step leaves a lake" — a chain of filled footprints.
  async lakes() {
    await page.evaluate(async () => {
      const g = window.__g
      const t0 = g.titanState()
      g.autopilot.forward = 1
      g.autopilot.turn = 0.12
      g.clock.scale = 10
      while (g.titanState().steps < t0.steps + 14) await new Promise((r) => setTimeout(r, 50))
      g.autopilot.forward = 0
      // Wait for the facts, not a timer: the Titan finishes its stride and
      // stands still, then the rain fills every print (or 20 s passes).
      const until = Date.now() + 20000
      while (Date.now() < until) {
        const t = g.titanState()
        const all = g.lakeStats()
        if (t.speed === 0 && !g.titan.gait.isSwinging && all.every((l) => l.full)) break
        await new Promise((r) => setTimeout(r, 100))
      }
      g.clock.scale = 1
    })
    const lakes = await page.evaluate(() => window.__g.lakeStats())
    const full = lakes.filter((l) => l.full).length
    console.log(`${lakes.length} lakes, ${full} full; sizes ${lakes.map((l) => l.cells).join(' ')}`)
    console.log('sample', JSON.stringify(lakes.slice(0, 3)))
    await page.evaluate(() => {
      const g = window.__g
      const t = g.titanState()
      const bx = -Math.sin(t.heading), bz = -Math.cos(t.heading)
      // Behind the Titan and above the trail, looking along it toward the giant.
      const k = g.titan.H / 120
      g.teleport(t.x + bx * 300 * k, t.z + bz * 300 * k)
      g.rig.setProfile({ minDist: 10, maxDist: 4000, dist: 260 * k, focusHeight: 1.5, follow: 10 })
      g.setCam(Math.atan2(bx, bz), 0.42)
    })
    await shot('p5-lakes')
    await page.evaluate(() => {
      const g = window.__g
      const t = g.titanState()
      const k = g.titan.H / 120
      const bx = -Math.sin(t.heading), bz = -Math.cos(t.heading)
      // Low and close, off to the side of the canals, looking back along them.
      g.teleport(t.x + bx * 120 * k + bz * 60 * k, t.z + bz * 120 * k - bx * 60 * k)
      g.rig.setProfile({ minDist: 10, maxDist: 4000, dist: 70 * k, focusHeight: 1.5, follow: 10 })
      g.setCam(Math.atan2(-bz, bx), 0.5)
    })
    await shot('p5-canals')
    await page.evaluate(() => {
      const g = window.__g
      const p = g.player()
      g.rig.setProfile({ minDist: 2, maxDist: 4000, dist: 7, focusHeight: 1.5, follow: 10 })
      g.setCam(g.rig.yaw + 0.3, 0.12)
    })
    await shot('p5-lakes-ground')
    if (lakes.length < 10 || full < lakes.length) throw new Error(`lakes gate: ${lakes.length} lakes, ${full} full`)
  },
}

try {
  if (!scenes[scene]) throw new Error(`unknown scene "${scene}" (have: ${Object.keys(scenes).join(', ')})`)
  await scenes[scene]()
} finally {
  if (errors.length) console.log('console errors:\n  ' + errors.slice(0, 12).join('\n  '))
  await browser.close()
}
