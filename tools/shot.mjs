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
  else if (m.text().startsWith('[climb]')) console.log(m.text())
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
  // The four lands, each from the ground and from above.
  async lands() {
    const places = [
      ['valley', 120, 60],
      ['forest', -1300, -750],
      ['desert', 0, 1500],
      ['ruins', 1300, -750],
    ]
    for (const [name, x, z] of places) {
      const info = await page.evaluate(([x, z]) => {
        const g = window.__g
        g.teleport(x, z)
        // Look outward, away from the centre, a little down.
        g.rig.setProfile({ minDist: 2, maxDist: 4000, dist: 7, focusHeight: 1.5, follow: 10 })
        g.setCam(Math.atan2(-x, -z), 0.05, 7)
        return { region: g.terrain.base.regions.name(x, z), h: g.heightAt(x, z) }
      }, [x, z])
      console.log(name, JSON.stringify(info))
      await shot(`land-${name}`)
      await page.evaluate(([x, z]) => {
        const g = window.__g
        g.rig.setProfile({ minDist: 10, maxDist: 4000, dist: 420, focusHeight: 1.5, follow: 10 })
        g.setCam(Math.atan2(-x, -z), 0.38)
      }, [x, z])
      await shot(`land-${name}-above`)
    }
  },
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
  // P8 gate: grab the foot, climb to the shoulders, hold on while it walks.
  async climb() {
    const grabbed = await page.evaluate(() => window.__g.grabTitan())
    if (!grabbed) throw new Error('climb gate: could not grab the foot')
    const route = await page.evaluate(async () => {
      const g = window.__g
      const H = g.titan.H
      const parts = []
      g.clock.scale = 5
      g.input.press('KeyW')
      const until = Date.now() + 45000
      let best = 0
      while (Date.now() < until) {
        const c = g.climbState()
        if (!c.active) break
        if (parts[parts.length - 1] !== c.part) parts.push(c.part)
        best = Math.max(best, c.height)
        if (c.height > 0.74 * H && c.standing) break
        // Steer like a player: face the next part up the body, so "forward"
        // on a ledge walks into it (W climbs on steep rock regardless).
        const next = { footL: ['shinL', 1], shinL: ['thighL', 2], thighL: ['torso', 0], torso: ['upperArmL', 0], upperArmL: ['upperArmL', 0] }[c.part] ?? ['torso', 0]
        const p = g.titan.part(next[0])
        let t = p.lumps[next[1]].c.clone().applyMatrix4(p.mesh.matrixWorld)
        // Right underneath it, its bearing is noise: head for the body's middle instead.
        if (Math.hypot(c.x - t.x, c.z - t.z) < 4) t = g.titan.pelvis
        g.setCam(Math.atan2(c.x - t.x, c.z - t.z), 0.15)
        await new Promise((r) => setTimeout(r, 60))
      }
      g.input.release('KeyW')
      g.clock.scale = 1
      const c = g.climbState()
      return { parts, best: +best.toFixed(1), end: c, H }
    })
    console.log(`climbed through ${route.parts.join(' → ')}; peak ${route.best} m of ${route.H} m; standing=${route.end.standing}; grip ${route.end.stamina.toFixed(2)}`)
    await page.evaluate(() => window.__g.setCam(window.__g.rig.yaw, 0.35, 9))
    await shot('p8-climb')
    // Hold on while it walks three strides.
    const ride = await page.evaluate(async () => {
      const g = window.__g
      const a = g.climbState()
      const t0 = g.titanState()
      g.autopilot.forward = 1
      g.clock.scale = 4
      while (g.titanState().steps < t0.steps + 3 && g.climbState().active) await new Promise((r) => setTimeout(r, 50))
      g.autopilot.forward = 0
      g.clock.scale = 1
      const b = g.climbState()
      const t1 = g.titanState()
      return { held: b.active, carried: Math.hypot(b.x - a.x, b.z - a.z), titanMoved: Math.hypot(t1.x - t0.x, t1.z - t0.z), grip: b.stamina }
    })
    console.log(`rode ${ride.carried.toFixed(1)} m while the Titan walked ${ride.titanMoved.toFixed(1)} m; still holding: ${ride.held}; grip ${ride.grip.toFixed(2)}`)
    await shot('p8-ride')
    if (route.best < 0.7 * route.H) throw new Error('climb gate: never reached the shoulders')
    if (!ride.held || ride.carried < ride.titanMoved * 0.6) throw new Error('climb gate: not carried by the Titan')
  },
  // Rest → sit; sleep → a mountain with a hill under it; a new giant wakes; climb the mountain.
  async rest() {
    await page.evaluate(async () => {
      const g = window.__g
      g.titan.gait.resting = true
      g.clock.scale = 3
      while (g.titan.restBlend < 1) await new Promise((r) => setTimeout(r, 50))
      g.clock.scale = 1
      const t = g.titanState()
      const k = g.titan.H / 180
      g.teleport(t.x + (Math.sin(t.heading) * 330 + Math.cos(t.heading) * 140) * k, t.z + (Math.cos(t.heading) * 330 - Math.sin(t.heading) * 140) * k)
      const p = g.player()
      g.setCam(Math.atan2(p.x - t.x, p.z - t.z), 0.06, 7)
    })
    await shot('p9-resting')
    await page.evaluate(() => {
      const g = window.__g
      const t = g.titanState()
      // Side on, to read the sitting silhouette.
      const k = g.titan.H / 180
      g.teleport(t.x + Math.cos(t.heading) * 330 * k, t.z - Math.sin(t.heading) * 330 * k)
      const p = g.player()
      g.setCam(Math.atan2(p.x - t.x, p.z - t.z), 0.08, 7)
    })
    await shot('p9-resting-side')
    const r = await page.evaluate(async () => {
      const g = window.__g
      const before = g.titanState()
      const groundBefore = g.heightAt(before.x, before.z)
      g.goDormant()
      await new Promise((r) => setTimeout(r, 300))
      const after = g.titanState()
      const m = g.mountains.targets()[0]
      return {
        mountains: g.mountains.count,
        rise: g.heightAt(before.x, before.z) - groundBefore,
        newTitanAway: Math.hypot(after.x - before.x, after.z - before.z),
        mountainAt: m && Math.hypot(m.titan.gait.x - before.x, m.titan.gait.z - before.z),
      }
    })
    console.log(`dormant: ${r.mountains} mountain(s), hill rose ${r.rise.toFixed(1)} m, new giant woke ${r.newTitanAway.toFixed(0)} m away`)
    await shot('p9-mountain')
    const climbed = await page.evaluate(async () => {
      const g = window.__g
      const m = g.mountains.targets()[0].titan
      const foot = m.part('footL')
      const c = foot.lumps[0].c.clone().applyMatrix4(foot.mesh.matrixWorld)
      const out = new g.THREE.Vector3(c.x - m.gait.x, 0, c.z - m.gait.z).normalize()
      for (let d = 40; d > 0; d -= 0.5) {
        g.teleport(c.x + out.x * d, c.z + out.z * d)
        g.input.press('KeyE')
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
        g.input.release('KeyE')
        if (g.climbState().active) break
      }
      const s = g.climbState()
      return { active: s.active, on: g.climber.target?.id ?? null }
    })
    console.log(`climbing the mountain: ${climbed.active} (holding ${climbed.on})`)
    if (r.mountains !== 1 || r.rise < 5 || r.newTitanAway < 300) throw new Error('rest gate: no proper mountain')
    if (!climbed.active || !climbed.on?.startsWith('local-')) throw new Error('rest gate: could not climb the mountain')
  },
  // Landmarks: each kind of ruin, from the ground.
  async ruins() {
    const sites = await page.evaluate(() => window.__g.ruins.sites)
    for (const kind of ['hand', 'circle', 'colonnade', 'face']) {
      const s = sites.find((q) => q.kind === kind)
      if (!s) continue
      await page.evaluate((s) => {
        const g = window.__g
        g.teleport(s.x + 45, s.z + 30)
        const p = g.player()
        g.setCam(Math.atan2(p.x - s.x, p.z - s.z), 0.08, 7)
      }, s)
      await shot(`ruin-${kind}`)
    }
  },
  // The reel's sky: a Wanderer looking up at a Titan with clouds about its waist.
  async sky() {
    await page.evaluate(() => {
      const g = window.__g
      const t = g.titanState()
      g.teleport(t.x - 260, t.z + 140)
      const p = g.player()
      g.setCam(Math.atan2(p.x - t.x, p.z - t.z), -0.3, 6)
    })
    await shot('p12-sky')
  },
  // Look check: the Titan front-lit and back-lit, up close and far.
  async titanlook() {
    for (const [name, toward, dist] of [['look-front', 1, 380], ['look-back', -1, 380], ['look-close', -1, 60]]) {
      await page.evaluate(([toward, dist]) => {
        const g = window.__g
        const t = g.titanState()
        const s = g.sky.sunDir
        // toward=1: the sun behind the camera; -1: the sun behind the Titan.
        const hx = s.x / Math.hypot(s.x, s.z), hz = s.z / Math.hypot(s.x, s.z)
        g.teleport(t.x + hx * dist * toward, t.z + hz * dist * toward)
        const p = g.player()
        g.setCam(Math.atan2(p.x - t.x, p.z - t.z), dist < 100 ? -0.35 : 0.0, 6)
      }, [toward, dist])
      await shot(name)
    }
  },
  // P10b gate: herds on the ground; thirsty, they walk to a Titan's lake and drink; startled, they bolt.
  async wildlife() {
    const r = await page.evaluate(async () => {
      const g = window.__g
      const W = g.wildlife
      const s0 = W.stats()
      const grounded = W.herds.every((h) => h.animals.every((a) => Math.abs(a.y - g.heightAt(a.x, a.z)) < 0.05))
      // A Titan walks a trail of lakes.
      const t0 = g.titanState().steps
      g.autopilot.forward = 1
      g.autopilot.turn = 0.1
      g.clock.scale = 10
      while (g.titanState().steps < t0 + 12) await new Promise((r) => setTimeout(r, 40))
      g.autopilot.forward = 0
      const until = Date.now() + 20000
      while (Date.now() < until && !(g.titanState().speed === 0 && g.lakeStats().length && g.lakeStats().every((l) => l.full))) await new Promise((r) => setTimeout(r, 100))
      // Walk the Titan far off: a herd will not drink at its feet.
      const tg = g.titan.gait
      tg.x += 4000
      tg.plant.forEach((p) => (p.x += 4000))
      tg.swingFrom.x += 4000
      tg.swingTo.x += 4000
      await new Promise((r) => setTimeout(r, 200))
      // The herd nearest the trail gets thirsty.
      const lakes = g.lakes.lakes
      const near = (h) => Math.min(...lakes.map((l) => Math.hypot(l.basin.bx - W.stats()[W.herds.indexOf(h)].x, l.basin.bz - W.stats()[W.herds.indexOf(h)].z)))
      const herd = [...W.herds].sort((a, b) => near(a) - near(b))[0]
      const hi = W.herds.indexOf(herd)
      herd.thirst = 1
      herd.state = 'graze'
      herd.timer = 0
      const startDist = near(herd)
      const states = new Set()
      const until2 = Date.now() + 60000
      while (Date.now() < until2) {
        states.add(herd.state)
        if (herd.state === 'drink') break
        await new Promise((r) => setTimeout(r, 50))
      }
      g.clock.scale = 1
      const at = W.stats()[hi]
      const shore = Math.min(...lakes.flatMap((l) => {
        // distance from the herd's middle to the nearest wet cell of this lake
        const b = l.basin
        let best = Infinity
        for (let j = 0; j < b.h; j += 2) for (let i = 0; i < b.w; i += 2) if (b.mask[j * b.w + i]) best = Math.min(best, Math.hypot(b.x0 + i - at.x, b.z0 + j - at.z))
        return [best]
      }))
      return { herds: s0.length, animals: s0.reduce((a, h) => a + h.n, 0), grounded, hi, startDist, states: [...states], drinking: herd.state === 'drink', shore, at }
    })
    console.log(`${r.herds} herds, ${r.animals} animals, on the ground: ${r.grounded}`)
    console.log(`thirsty herd ${r.hi}: ${r.startDist.toFixed(0)} m from the nearest lake → states ${r.states.join(' → ')}; drinking: ${r.drinking}, ${r.shore.toFixed(1)} m from the water`)
    await page.evaluate((at) => {
      const g = window.__g
      g.teleport(at.x + 22, at.z + 22)
      g.rig.setProfile({ minDist: 2, maxDist: 4000, dist: 16, focusHeight: 1.5, follow: 10 })
      g.setCam(Math.PI / 4, 0.32)
    }, r.at)
    await shot('p10-herd-drinking')
    const flee = await page.evaluate(async (hi) => {
      const g = window.__g
      const W = g.wildlife
      const a = W.stats()[hi]
      const ax = a.x + 45
      const az = a.z
      W.alarm(ax, az, 300)
      await new Promise((r) => setTimeout(r, 2500))
      const b = W.stats()[hi]
      return { state: b.state, from: Math.hypot(a.x - ax, a.z - az), to: Math.hypot(b.x - ax, b.z - az) }
    }, r.hi)
    console.log(`startled 45 m away: ${flee.state}, now ${flee.to.toFixed(0)} m from the fright (was ${flee.from.toFixed(0)})`)
    if (r.herds !== 4 || !r.grounded) throw new Error('wildlife gate: herds missing or floating')
    if (!r.drinking || r.shore > 30) throw new Error('wildlife gate: the thirsty herd did not drink at a lake')
    if (flee.state !== 'flee' || flee.to < flee.from + 8) throw new Error('wildlife gate: the herd did not bolt')
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
      const until = Date.now() + 45000
      while (Date.now() < until) {
        const t = g.titanState()
        const all = g.lakeStats()
        if (t.speed === 0 && !g.titan.gait.isSwinging && all.every((l) => l.full || l.cells >= 20000)) break
        await new Promise((r) => setTimeout(r, 100))
      }
      g.clock.scale = 1
    })
    // Let merges settle (one per simulation step); a lake just merged from two
    // holds their water and fills the rest by rain, so wait for that too.
    await page.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 1500))
      const g = window.__g
      g.clock.scale = 10
      const until = Date.now() + 20000
      while (Date.now() < until && !g.lakeStats().every((l) => l.full || l.cells >= 20000)) await new Promise((r) => setTimeout(r, 100))
      g.clock.scale = 1
    })
    const lakes = await page.evaluate(() => window.__g.lakeStats())
    const mutual = await page.evaluate(() => window.__g.lakes.mutualPairs())
    const full = lakes.filter((l) => l.full).length
    console.log(`${lakes.length} lakes, ${full} full, ${mutual} unmerged mutual pairs; sizes ${lakes.map((l) => l.cells).join(' ')}`)
    if (mutual > 0) throw new Error(`lakes gate: ${mutual} pairs of lakes spill into each other`)
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
    // Close over the longest overflow stream.
    const st = await page.evaluate(() => {
      const g = window.__g
      const s = g.lakes.streams().sort((a, b) => b.cells.length - a.cells.length)[0]
      if (!s) return null
      const [x, z] = s.cells[Math.floor(s.cells.length / 2)]
      g.teleport(x + 25, z + 25)
      g.rig.setProfile({ minDist: 10, maxDist: 4000, dist: 55, focusHeight: 1.5, follow: 10 })
      g.setCam(Math.PI / 4, 0.75)
      return { cells: s.cells.length, toLake: !s.sig.endsWith(':0') }
    })
    console.log('longest stream', JSON.stringify(st))
    if (st) await shot('p5-streams')
    // Footprint-sized lakes fill fast; a hectare-scale one formed by merges takes its time.
    const small = lakes.filter((l) => l.cells < 20000)
    if (lakes.length < 10 || small.some((l) => !l.full)) throw new Error(`lakes gate: ${lakes.length} lakes, ${full} full (${small.filter((l) => !l.full).length} small ones still filling)`)
  },
}

try {
  if (!scenes[scene]) throw new Error(`unknown scene "${scene}" (have: ${Object.keys(scenes).join(', ')})`)
  await scenes[scene]()
} finally {
  if (errors.length) console.log('console errors:\n  ' + errors.slice(0, 12).join('\n  '))
  await browser.close()
}
