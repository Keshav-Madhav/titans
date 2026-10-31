// Screenshot harness. Opens the game in headless Chrome (ANGLE, real GPU),
// waits for the game to say it is ready, runs a named scene, writes shots/.
//
//   node tools/shot.mjs <scene> [url]
//
// Scenes are small functions over `window.__g`; add one per phase gate.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const scene = process.argv[2] ?? 'ground'
// Scenes that test founding a town of your own start without the old villages.
const extra = { settlement: '&novillages' }[scene] ?? ''
const url = process.argv[3] ?? `http://localhost:4317/?offline${extra}`
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
  // P8b gate: stride leaves no trench; a stomp digs deep and knocks a Wanderer down; the call shows.
  async verbs() {
    const r = await page.evaluate(async () => {
      const g = window.__g
      const H = g.titan.H
      const walk = async (n) => {
        const t0 = g.titanState().steps
        g.autopilot.forward = 1
        while (g.titanState().steps < t0 + n) await new Promise((r) => setTimeout(r, 40))
      }
      const midDepth = (F) => {
        const out = []
        for (let i = 2; i < F.length; i++) {
          if (F[i].foot !== F[i - 2].foot) continue
          out.push(g.deltaAt((F[i].x + F[i - 2].x) / 2, (F[i].z + F[i - 2].z) / 2))
        }
        return out
      }
      g.clock.scale = 8
      // Stride: feet lifted clean.
      g.setPlough(false)
      await walk(5)
      const strideMid = midDepth(g.falls.slice())
      // Plough again, for comparison.
      g.setPlough(true)
      const n0 = g.falls.length
      await walk(5)
      const ploughMid = midDepth(g.falls.slice(n0 - 1))
      // Stomp, with a Wanderer standing 60 m from where the Titan is heading.
      const t = g.titanState()
      const fx = Math.sin(t.heading), fz = Math.cos(t.heading)
      g.teleport(t.x + fx * 1.2 * g.titan.body.stepLen + fz * 60, t.z + fz * 1.2 * g.titan.body.stepLen - fx * 60)
      g.clock.scale = 2
      g.stomp()
      // The stomp is the NEXT step to start: wait for the footfall that carries it.
      const until = Date.now() + 30000
      while (!(g.falls.length && g.falls[g.falls.length - 1].stomp) && Date.now() < until) await new Promise((r) => setTimeout(r, 20))
      // Sample the knockdown just after the slam.
      await new Promise((r) => setTimeout(r, 120))
      const stunned = g.wanderer.stunned
      const s = g.falls[g.falls.length - 1]
      const normal = g.falls[g.falls.length - 3]
      g.autopilot.forward = 0
      g.clock.scale = 1
      g.callOut()
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      return {
        strideMid: Math.min(...strideMid),
        ploughMid: Math.max(...ploughMid),
        stomp: s.stomp,
        stompDepth: g.deltaAt(s.x, s.z),
        normalDepth: g.deltaAt(normal.x, normal.z),
        stunned,
        dist: Math.hypot(g.player().x - s.x, g.player().z - s.z),
        beacon: getComputedStyle(document.getElementById('beacon')).display,
        H,
      }
    })
    console.log(`stride: deepest mid-stride delta ${r.strideMid.toFixed(2)} m; plough: shallowest ${r.ploughMid.toFixed(2)} m`)
    console.log(`stomp: flagged=${r.stomp}, print ${r.stompDepth.toFixed(1)} m vs normal ${r.normalDepth.toFixed(1)} m; Wanderer ${r.dist.toFixed(0)} m away stunned ${r.stunned.toFixed(2)} s; call marker ${r.beacon}`)
    await page.evaluate(() => {
      const g = window.__g
      const t = g.titanState()
      const p = g.player()
      g.setCam(Math.atan2(p.x - t.x, p.z - t.z), 0.1, 8)
    })
    await shot('p8b-stomp')
    if (r.strideMid < -0.6) throw new Error('verbs gate: striding still dug a trench')
    if (r.ploughMid > -2) throw new Error('verbs gate: ploughing did not dig a trench')
    if (!r.stomp || r.stompDepth > r.normalDepth - 4) throw new Error('verbs gate: the stomp was not deeper')
    if (r.stunned <= 0) throw new Error('verbs gate: the Wanderer was not knocked down')
    if (r.beacon !== 'flex') throw new Error('verbs gate: no call marker')
  },
  // P9 gate: rest → sit; sleep → a mountain with a hill and a name; a new Titan wakes; climb the mountain.
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
        label: [...document.querySelectorAll('.label.mountain')].find((e) => e.style.display !== 'none')?.textContent ?? '',
      }
    })
    console.log(`dormant: ${r.mountains} mountain(s), hill rose ${r.rise.toFixed(1)} m, new Titan woke ${r.newTitanAway.toFixed(0)} m away; label "${r.label}"`)
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
    if (r.mountains !== 1 || r.rise < 5 || r.newTitanAway < 300 || !r.label.includes('DORMANT')) throw new Error('rest gate: no proper mountain')
    if (!climbed.active || !climbed.on?.startsWith('local-')) throw new Error('rest gate: could not climb the mountain')
  },
  // The old villages: from the road in, from above, and from the square.
  async village() {
    const v = await page.evaluate(() => {
      const g = window.__g
      const t = [...g.settlement.towns].filter((q) => q.layout === 'street').sort((a, b) => Math.hypot(a.cx, a.cz) - Math.hypot(b.cx, b.cz))[0]
      const kinds = {}
      for (const b of g.settlement.buildings) if (b.town === t.id) kinds[b.kind] = (kinds[b.kind] ?? 0) + 1
      return { name: t.name, cx: t.cx, cz: t.cz, dir: t.dir, kinds, towns: g.settlement.towns.length }
    })
    console.log(`${v.towns} villages; nearest ${v.name}: ${JSON.stringify(v.kinds)}`)
    await page.evaluate((v) => {
      const g = window.__g
      // On the main street, 70 m out, looking at the square.
      const fx = Math.sin(v.dir), fz = Math.cos(v.dir)
      // On the landward end of the main street (it runs down to the water), looking along it.
      g.teleport(v.cx - fx * 75, v.cz - fz * 75)
      g.setCam(Math.atan2(-fx, -fz), 0.12, 6)
    }, v)
    await shot('village-street')
    await page.evaluate((v) => {
      const g = window.__g
      g.teleport(v.cx - 120, v.cz - 120)
      g.rig.setProfile({ minDist: 10, maxDist: 4000, dist: 150, focusHeight: 1.5, follow: 10 })
      g.setCam(Math.PI + Math.PI / 4, 0.45)
    }, v)
    await shot('village-above')
    if (!v.kinds.church || !v.kinds.well || (v.kinds.house ?? 0) + (v.kinds.hut ?? 0) + (v.kinds.townhouse ?? 0) < 30) throw new Error('village gate: a village is missing its parts')
    // Towns grow: the old village, and a town founded by the lake with a well and two homes.
    const g2 = await page.evaluate(async (vid) => {
      const g = window.__g
      const t0 = g.titanState().steps
      g.autopilot.forward = 1
      g.clock.scale = 10
      while (g.titanState().steps < t0 + 10) await new Promise((r) => setTimeout(r, 40))
      g.autopilot.forward = 0
      const until = Date.now() + 20000
      while (Date.now() < until && !(g.titanState().speed === 0 && g.lakeStats().every((l) => l.full))) await new Promise((r) => setTimeout(r, 100))
      g.clock.scale = 1
      const lake = [...g.lakes.lakes].sort((a, b) => b.basin.sorted.length - a.basin.sorted.length)[0]
      const plan = ['well', 'house', 'house']
      let first = null
      for (const kind of plan) {
        const near = first ?? { x: lake.basin.bx, z: lake.basin.bz }
        const spot = g.findSpot(kind, near.x, near.z, first ? 40 : 140)
        if (spot && !g.build(kind, spot.x, spot.z)) first ??= spot
      }
      const mine = g.settlement.towns.find((t) => t.player)
      const count = (id) => g.settlement.buildings.filter((b) => b.town === id).length
      const before = { mine: mine ? count(mine.id) : 0, village: count(vid) }
      // Twenty minutes of a town's life.
      for (let i = 0; i < 30; i++) g.settlement.grow(40)
      g.settlement.update(0)
      g.townsfolk.sync()
      return { name: mine?.name, before, after: { mine: mine ? count(mine.id) : 0, village: count(vid) }, folk: g.townsfolk.folk.length, calls: g.settlement.drawCalls }
    }, (await page.evaluate(() => [...window.__g.settlement.towns].filter((q) => q.layout === 'street').sort((a, b) => Math.hypot(a.cx, a.cz) - Math.hypot(b.cx, b.cz))[0].id)))
    console.log(`growth: ${g2.name} ${g2.before.mine} → ${g2.after.mine} buildings; ${v.name} ${g2.before.village} → ${g2.after.village}; ${g2.folk} townsfolk; towns drawn in ${g2.calls} calls`)
    if (g2.after.mine < g2.before.mine + 10 || g2.after.village <= g2.before.village) throw new Error('village gate: towns did not grow')
    await page.evaluate(() => {
      const g = window.__g
      const t = g.settlement.towns.find((q) => q.player)
      g.teleport(t.cx - 70, t.cz - 70)
      g.rig.setProfile({ minDist: 10, maxDist: 4000, dist: 110, focusHeight: 1.5, follow: 10 })
      g.setCam(Math.PI + Math.PI / 4, 0.42)
    })
    await shot('village-grown')
  },
  // The reel, shot for shot (as near as the game allows), to compare against it.
  async reel() {
    const T = () => page.evaluate(() => window.__g.titanState())
    // Walk Titan 1 a while first: a trail of lakes, canals.
    await page.evaluate(async () => {
      const g = window.__g
      const t0 = g.titanState().steps
      g.autopilot.forward = 1
      g.autopilot.turn = 0.05
      g.clock.scale = 10
      while (g.titanState().steps < t0 + 12) await new Promise((r) => setTimeout(r, 40))
      g.clock.scale = 1
      // Keep it walking slowly for the stride pose.
      await new Promise((r) => setTimeout(r, 1500))
      g.autopilot.forward = 0
      const until = Date.now() + 20000
      while (Date.now() < until && !g.lakeStats().every((l) => l.full)) {
        g.clock.scale = 10
        await new Promise((r) => setTimeout(r, 100))
      }
      g.clock.scale = 1
    })
    const H = await page.evaluate(() => window.__g.titan.H)
    // 1 — "Some players are giants": high behind and beside the giant, looking down past it.
    await page.evaluate((H) => {
      const g = window.__g
      const t = g.titanState()
      const fx = Math.sin(t.heading), fz = Math.cos(t.heading)
      g.teleport(t.x - fx * 0.95 * H + fz * 0.55 * H, t.z - fz * 0.95 * H - fx * 0.55 * H)
      g.rig.setProfile({ minDist: 1, maxDist: 4000, dist: 0.3 * H, focusHeight: 0.85 * H, follow: 50 })
      const p = g.player()
      g.setCam(Math.atan2(p.x - t.x, p.z - t.z), 0.1)
    }, H)
    await shot('reel-1-giants')
    // 2 — "Every step leaves a lake": above the trail, looking along it.
    await page.evaluate((H) => {
      const g = window.__g
      const t = g.titanState()
      const fx = Math.sin(t.heading), fz = Math.cos(t.heading)
      g.teleport(t.x - fx * 3.2 * H, t.z - fz * 3.2 * H)
      g.rig.setProfile({ minDist: 1, maxDist: 4000, dist: 1.2 * H, focusHeight: 1.6 * H, follow: 50 })
      g.setCam(Math.atan2(-fx, -fz), 0.9)
    }, H)
    await shot('reel-2-lakes')
    // 3 — "Or be a single adventurer": in a village square, the church ahead, a giant beyond.
    await page.evaluate((H) => {
      const g = window.__g
      const town = [...g.settlement.towns].filter((q) => q.layout === 'street').sort((a, b) => Math.hypot(a.cx, a.cz) - Math.hypot(b.cx, b.cz))[0]
      const church = g.settlement.buildings.find((b) => b.town === town.id && b.kind === 'church')
      const ax = church ? church.x : town.cx + 20
      const az = church ? church.z : town.cz + 20
      // Stand out on the main street (clear of the stalls), facing the church.
      const sx = town.cx - Math.sin(town.dir) * 17, sz = town.cz - Math.cos(town.dir) * 17
      const dx = ax - sx, dz = az - sz
      const d = Math.hypot(dx, dz) || 1
      g.teleport(sx, sz)
      g.rig.setProfile({ minDist: 1, maxDist: 4000, dist: 3.2, focusHeight: 1.7, follow: 50 })
      g.setCam(Math.atan2(-dx, -dz), -0.16)
      // Bring a giant to stand behind the church.
      const tg = g.titan.gait
      const bx = ax + (dx / d) * 1.4 * H, bz = az + (dz / d) * 1.4 * H
      const ox = bx - tg.x, oz = bz - tg.z
      tg.x += ox; tg.z += oz
      tg.plant.forEach((p) => { p.x += ox; p.z += oz })
      tg.swingFrom.x += ox; tg.swingFrom.z += oz; tg.swingTo.x += ox; tg.swingTo.z += oz
      tg.heading = Math.atan2(-dx, -dz)
    }, H)
    await shot('reel-3-square')
    // 3b — "Your city can follow the giant": the caravan trailing a walking giant.
    const cv = await page.evaluate(async (H) => {
      const g = window.__g
      const c = g.caravan
      if (!c) return null
      // Put the caravan behind the giant and let it walk on; the wagons follow.
      const t = g.titan.gait
      c.wagons.forEach((w, i) => {
        w.x = t.x - Math.sin(t.heading) * (1.3 * H + i * 13)
        w.z = t.z - Math.cos(t.heading) * (1.3 * H + i * 13)
        w.heading = t.heading
      })
      g.autopilot.forward = 1
      g.autopilot.turn = 0
      g.clock.scale = 4
      await new Promise((r) => setTimeout(r, 6000))
      g.clock.scale = 1
      // Off to one side of the train, behind it: wagons in a line, the giant ahead.
      const last = c.wagons[c.wagons.length - 1]
      const sx = Math.cos(t.heading), sz = -Math.sin(t.heading)
      g.teleport(last.x - Math.sin(t.heading) * 25 + sx * 22, last.z - Math.cos(t.heading) * 25 + sz * 22)
      g.rig.setProfile({ minDist: 1, maxDist: 4000, dist: 10, focusHeight: 3, follow: 50 })
      const p = g.player()
      g.setCam(Math.atan2(p.x - t.x, p.z - t.z), 0.02)
      return { state: c.state, following: !!c.following, gap: Math.hypot(c.wagons[0].x - t.x, c.wagons[0].z - t.z) }
    }, H)
    console.log('caravan', JSON.stringify(cv))
    await shot('reel-3b-caravan')
    await page.evaluate(() => (window.__g.autopilot.forward = 0))
    // 4 — "Climb the giants": a climber high on the giant's back, the plain far below.
    await page.evaluate(async (H) => {
      const g = window.__g
      g.grabTitan()
      g.clock.scale = 12
      g.input.press('KeyW')
      const until = Date.now() + 40000
      while (Date.now() < until && g.climbState().active && g.climbState().height < 0.62 * H) {
        const c = g.climbState()
        const t = g.titan.chest
        g.setCam(Math.atan2(c.x - t.x, c.z - t.z), 0.15)
        await new Promise((r) => setTimeout(r, 60))
      }
      g.input.release('KeyW')
      g.clock.scale = 1
      // From outside the body, a little above: the climber on the rock, the plain below.
      const c = g.climbState()
      const t = g.titan.chest
      g.rig.setProfile({ minDist: 1, maxDist: 4000, dist: 14, focusHeight: 1.2, follow: 50 })
      g.setCam(Math.atan2(c.x - t.x, c.z - t.z), 0.45)
    }, H)
    await shot('reel-4-climb')
    // 5 — "Log off, become a mountain".
    await page.evaluate(async (H) => {
      const g = window.__g
      if (g.climber.active) g.climber.release(0)
      g.goDormant('t1')
      await new Promise((r) => setTimeout(r, 300))
      const m = g.mountains.targets()[0].titan.gait
      const away = 2.6 * H
      g.teleport(m.x + Math.sin(m.heading) * away, m.z + Math.cos(m.heading) * away)
      g.rig.setProfile({ minDist: 1, maxDist: 4000, dist: 0.25 * H, focusHeight: 0.3 * H, follow: 50 })
      const p = g.player()
      g.setCam(Math.atan2(p.x - m.x, p.z - m.z), -0.05)
    }, H)
    await shot('reel-5-mountain')
    if (process.env.DIAG) {
      await page.evaluate(() => { window.__g.scene.getObjectByName('water').visible = false })
      await shot('diag-nowater')
      await page.evaluate(() => { window.__g.scene.getObjectByName('water').visible = true; window.__g.renderer.shadowMap.enabled = false; window.__g.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true }) })
      await shot('diag-noshadow')
    }
    console.log('lakes:', JSON.stringify(await page.evaluate(() => window.__g.lakes.lakes.filter((l) => l.basin.sorted.length > 5000).map((l) => ({ cells: l.basin.sorted.length, depth: +(l.level - l.basin.bottom).toFixed(2), mean: +(l.level - l.basin.prefix[l.basin.sorted.length] / l.basin.sorted.length).toFixed(2), at: [l.basin.bx, l.basin.bz] })))))
  },
  // Life follows the water: settlers found hamlets by a giant's lakes and at a sleeping giant's feet.
  async settlers() {
    const r = await page.evaluate(async () => {
      const g = window.__g
      const S = g.settlement
      const before = S.towns.length
      // Walk the giant away from the old villages, leaving lakes.
      const t0 = g.titanState().steps
      g.autopilot.forward = 1
      g.autopilot.turn = 0.08
      g.clock.scale = 10
      while (g.titanState().steps < t0 + 10) await new Promise((r) => setTimeout(r, 40))
      g.autopilot.forward = 0
      const until = Date.now() + 30000
      while (Date.now() < until && !(g.titanState().speed === 0 && g.lakeStats().every((l) => l.full || l.cells > 20000))) await new Promise((r) => setTimeout(r, 100))
      g.clock.scale = 1
      // Ten minutes pass for the settlers.
      for (let i = 0; i < 40; i++) S.emerge(15, g.lakes.lakes)
      const byLake = S.towns.slice(before).map((t) => t.name)
      // The giant sleeps; settlers come to its feet.
      const tg = g.titanState()
      const n = S.towns.length
      g.goDormant('t1')
      for (let i = 0; i < 20; i++) S.emerge(15, g.lakes.lakes)
      const feet = S.towns.slice(n).map((t) => ({ name: t.name, d: Math.round(Math.hypot(t.cx - tg.x, t.cz - tg.z)) }))
      S.update(0)
      g.townsfolk.sync()
      const first = S.towns[before]
      return { byLake, feet, first: first && { x: first.cx, z: first.cz, n: S.buildings.filter((b) => b.town === first.id).length }, said: [...document.querySelectorAll('#chat-log .line')].map((e) => e.textContent).filter((t) => t.includes('founded')).slice(-3) }
    })
    console.log(`hamlets by the giant's lakes: ${r.byLake.join(', ') || 'none'}; at the sleeping giant's feet: ${r.feet.map((f) => `${f.name} (${f.d} m)`).join(', ') || 'none'}`)
    console.log('chat:', r.said.join(' | '))
    if (r.first) {
      await page.evaluate((f) => {
        const g = window.__g
        g.teleport(f.x - 60, f.z - 60)
        g.rig.setProfile({ minDist: 10, maxDist: 4000, dist: 90, focusHeight: 1.5, follow: 50 })
        g.setCam(Math.PI + Math.PI / 4, 0.4)
      }, r.first)
      await shot('settlers-hamlet')
    }
    if (r.byLake.length < 1 || r.feet.length < 1) throw new Error('settlers gate: no hamlets came')
  },
  // Life: a village's edge — smoke, sheep by the fields, birds overhead — and a hamlet.
  async life() {
    const v = await page.evaluate(async () => {
      const g = window.__g
      const t = [...g.settlement.towns].filter((q) => q.layout === 'street').sort((a, b) => Math.hypot(a.cx, a.cz) - Math.hypot(b.cx, b.cz))[0]
      // The flock nearest this town: stand beyond it, looking over it to the town.
      const flock = [...g.livestock.flocks].sort((a, b) => Math.hypot(a.hx - t.cx, a.hz - t.cz) - Math.hypot(b.hx - t.cx, b.hz - t.cz))[0]
      const at = flock ? { x: flock.hx, z: flock.hz } : { x: t.cx + 90, z: t.cz }
      const dx = at.x - t.cx, dz = at.z - t.cz
      const d = Math.hypot(dx, dz) || 1
      g.teleport(at.x + (dx / d) * 22, at.z + (dz / d) * 22)
      g.setCam(Math.atan2(dx, dz), 0.1, 6)
      // Let the smoke rise and the birds gather.
      await new Promise((r) => setTimeout(r, 6000))
      return { town: t.name, sheep: g.livestock.count, chimneys: g.settlement.chimneysNear(t.cx, t.cz, 380).length }
    })
    console.log('life', JSON.stringify(v))
    await shot('life-village-edge')
    // Boats: from the shore, a fisher on the village's lake.
    const b = await page.evaluate(async () => {
      const g = window.__g
      const t = [...g.settlement.towns].filter((q) => q.layout === 'street').sort((a, b) => Math.hypot(a.cx, a.cz) - Math.hypot(b.cx, b.cz))[0]
      const boat = [...g.boats.boats].sort((a, b) => Math.hypot(a.x - t.cx, a.z - t.cz) - Math.hypot(b.x - t.cx, b.z - t.cz))[0]
      if (!boat) return { boats: 0 }
      // Walk from the boat toward the town until dry ground, then a little further.
      const dx = t.cx - boat.x, dz = t.cz - boat.z
      const d = Math.hypot(dx, dz) || 1
      let k = 0
      while (k < d && g.settlement.wet(boat.x + (dx / d) * k, boat.z + (dz / d) * k)) k += 2
      k = Math.min(Math.max(k + 10, 30), 70)
      g.teleport(boat.x + (dx / d) * k, boat.z + (dz / d) * k)
      g.setCam(Math.atan2(dx, dz), 0.12, 6)
      await new Promise((r) => setTimeout(r, 1500))
      return { boats: g.boats.boats.length, from: Math.round(k) }
    })
    console.log('boats', JSON.stringify(b))
    await shot('life-boats')
    if (b.boats < 3) throw new Error('life gate: no boats on the village lakes')
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
  // P11 gate: a settlement beside a Titan's lake — founded, refused where it should be, peopled, crushable.
  async settlement() {
    const r = await page.evaluate(async () => {
      const g = window.__g
      const out = {}
      out.dryRefusal = g.build('house', 5, 5)
      // A Titan walks a trail of lakes.
      const t0 = g.titanState().steps
      g.autopilot.forward = 1
      g.autopilot.turn = 0.1
      g.clock.scale = 10
      while (g.titanState().steps < t0 + 12) await new Promise((r) => setTimeout(r, 40))
      g.autopilot.forward = 0
      const until = Date.now() + 20000
      while (Date.now() < until && !(g.titanState().speed === 0 && g.lakeStats().length && g.lakeStats().every((l) => l.full))) await new Promise((r) => setTimeout(r, 100))
      g.clock.scale = 1
      // Found a town beside the biggest lake.
      const lake = [...g.lakes.lakes].sort((a, b) => b.basin.sorted.length - a.basin.sorted.length)[0]
      const plan = ['house', 'house', 'hut', 'hut', 'well', 'tower']
      const placed = []
      for (const kind of plan) {
        const near = placed.length ? placed[0] : { x: lake.basin.bx, z: lake.basin.bz }
        const spot = g.findSpot(kind, near.x, near.z, placed.length ? 60 : 140)
        if (!spot) continue
        const why = g.build(kind, spot.x, spot.z, Math.random() * 6)
        if (!why) placed.push({ kind, ...spot })
      }
      out.name = g.settlement.name
      out.placed = placed.map((p) => p.kind)
      out.wetRefusal = g.build('hut', lake.basin.bx, lake.basin.bz)
      out.farRefusal = g.build('hut', placed[0].x + 400, placed[0].z)
      out.folk = g.townsfolk.folk.length
      // Townsfolk are only simulated near you: go and watch.
      g.teleport(placed[0].x + 30, placed[0].z + 30)
      const before = g.townsfolk.folk.map((p) => ({ x: p.x, z: p.z }))
      g.clock.scale = 3
      await new Promise((r) => setTimeout(r, 6000))
      g.clock.scale = 1
      out.moved = g.townsfolk.folk.filter((p, i) => Math.hypot(p.x - before[i].x, p.z - before[i].z) > 1).length
      out.centre = { x: g.settlement.cx, z: g.settlement.cz }
      return out
    })
    console.log(`refused on dry ground far from water: "${r.dryRefusal}"`)
    console.log(`founded ${r.name}: ${r.placed.join(', ')}`)
    console.log(`refused in the lake: "${r.wetRefusal}"; refused far away: "${r.farRefusal}"`)
    console.log(`${r.folk} townsfolk; ${r.moved} went about their day`)
    await page.evaluate((c) => {
      const g = window.__g
      g.teleport(c.x - 55, c.z - 55)
      g.rig.setProfile({ minDist: 2, maxDist: 4000, dist: 70, focusHeight: 1.5, follow: 10 })
      g.setCam(Math.PI + Math.PI / 4, 0.38)
    }, r.centre)
    await shot('p11-settlement')
    const crush = await page.evaluate(() => {
      const g = window.__g
      const b = g.settlement.buildings[0]
      // One more home well clear of the foot (a 180 m Titan's print is 36 m long).
      const far = g.findSpot('hut', b.x + 75, b.z, 50)
      if (far) g.build('hut', far.x, far.z)
      const dist = (q) => Math.hypot(q.x - b.x, q.z - b.z)
      const under = g.settlement.buildings.filter((q) => dist(q) < 22).length
      const clear = g.settlement.buildings.filter((q) => dist(q) > 45).length
      const n = g.settlement.buildings.length
      g.footfallAt(b.x, b.z)
      const left = g.settlement.buildings
      return {
        before: n,
        after: left.length,
        under,
        clear,
        underLeft: left.filter((q) => dist(q) < 22).length,
        clearLeft: left.filter((q) => dist(q) > 45).length,
        folk: g.townsfolk.folk.length,
        said: document.getElementById('chat-log').textContent.includes('crushed'),
      }
    })
    console.log(`a footfall on the ${r.placed[0]}: ${crush.before} → ${crush.after} buildings (${crush.under} under the foot → ${crush.underLeft}; ${crush.clear} well clear → ${crush.clearLeft}); ${crush.folk} townsfolk left; told: ${crush.said}`)
    if (!r.dryRefusal || !r.wetRefusal || !r.farRefusal) throw new Error('settlement gate: a bad spot was accepted')
    if (!r.name || r.placed.length < 5) throw new Error('settlement gate: could not found a town')
    if (r.folk < 4 || r.moved < 2) throw new Error('settlement gate: no townsfolk going about')
    if (crush.underLeft !== 0 || !crush.said) throw new Error('settlement gate: the footfall did not crush what it landed on')
    if (crush.clear < 1 || crush.clearLeft !== crush.clear) throw new Error('settlement gate: the footfall crushed buildings well clear of it')
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
    // Let merges settle (one per simulation step), then count what is left unmerged.
    await page.evaluate(() => new Promise((r) => setTimeout(r, 1500)))
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
