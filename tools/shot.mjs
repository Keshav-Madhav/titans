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
  // The Undercroft: down a skylight from the plaza; among the pillars; the stair.
  async undercroft() {
    await page.waitForFunction(() => window.__g.rocks.formations.filter((f) => f.always).every((f) => f.mesh), null, { timeout: 120000 })
    await page.evaluate(() => window.__g.weather.set('breaking', true))
    const H = await page.evaluate(() => ({ ...window.__g.shared.HALL, top: window.__g.terrain.base.hallTop }))
    const views = [
      // On the plaza beside a skylight, looking down into it.
      ['plaza', [H.x - 40 + 4, H.top + 9, H.z - 20 + 14], [H.x - 40, H.top - 70, H.z - 20 - 6]],
      // On the floor between pillars, toward a shaft of light.
      ['floor', [H.x - 185, H.top - 66, H.z - 55], [H.x + 0, H.top - 45, H.z + 45]],
      // Down the long axis, low, the rows of pillars receding into the dark.
      ['rows', [H.x + 190, H.top - 66, H.z - 2], [H.x - 200, H.top - 40, H.z]],
      // At the head of the stair, looking down it.
      ['stair', [H.x - 205, H.top + 3, H.z + 125], [H.x - 20, H.top - 60, H.z + 125]],
    ]
    for (const [name, from, at] of views) {
      await page.evaluate(([from, at]) => {
        const g = window.__g
        g.teleport(from[0], from[2])
        g.lookFrom(from, at)
      }, [from, at])
      await shot(`undercroft-${name}`)
    }
    await page.evaluate(() => window.__g.lookFrom(null))
    // Walk down the stair from the rim.
    const walk = await page.evaluate(async (H) => {
      const g = window.__g
      // On the rim just outside the west end, at the stair's landing.
      g.teleport(H.x - 222, H.z + 125)
      const y0 = g.player().y
      g.wanderer.yaw = Math.PI / 2
      g.rig.setProfile({ minDist: 2, maxDist: 4000, dist: 6, focusHeight: 1.5, follow: 10 })
      g.setCam(-Math.PI / 2, 0.2, 6)
      g.input.press('KeyW')
      g.input.press('ShiftLeft')
      const t0 = performance.now()
      while (performance.now() - t0 < 12000) await new Promise((r) => setTimeout(r, 100))
      g.input.release('KeyW')
      g.input.release('ShiftLeft')
      const p = g.player()
      return { y0: +y0.toFixed(1), y: +p.y.toFixed(1), x: Math.round(p.x - H.x), z: Math.round(p.z - H.z) }
    }, H)
    console.log('down the stair', JSON.stringify(walk))
    await shot('undercroft-walked')
    if (walk.y0 - walk.y < 20) throw new Error('undercroft gate: could not walk down the stair')
  },
  // The map: wander a little (and once up high), see the minimap; open the map.
  async map() {
    await page.waitForFunction(() => window.__g.rocks.formations.filter((f) => f.always).every((f) => f.mesh), null, { timeout: 120000 })
    const seen = await page.evaluate(async () => {
      const g = window.__g
      const wait = (ms) => new Promise((r) => setTimeout(r, ms))
      const before = g.worldMap.explored
      for (const [x, z] of [[0, 0], [0, -500], [300, 900], [-900, -600], [1200, -900]]) {
        g.teleport(x, z)
        await wait(300)
      }
      const ground = g.worldMap.explored
      // Up a pillar of the colonnade: far more of the land comes into view.
      const c = g.colossi.places.get('colonnade')
      g.wanderer.place(c.x, c.y + 300, c.z)
      await wait(400)
      g.teleport(120, 80)
      await wait(400)
      return { before, ground, high: g.worldMap.explored }
    })
    console.log('seen', JSON.stringify(seen))
    await page.evaluate(() => window.__g.setCam(window.__g.rig.yaw, 0.15, 8))
    await shot('map-minimap')
    await page.evaluate(() => window.__g.worldMap.toggle())
    await new Promise((r) => setTimeout(r, 400))
    await shot('map-open')
    await page.evaluate(() => window.__g.worldMap.toggle())
    if (!(seen.high > seen.ground && seen.ground > seen.before)) throw new Error('map gate: exploring did not uncover the map')
  },
  // The wanderer up close: standing, running (cape streaming), in a storm's wind, in the dark.
  async hero() {
    await page.evaluate(() => window.__g.weather.set('breaking', true))
    const stand = async (name, weather, x, z, a, inDark = false) => {
      await page.evaluate(async ([weather, x, z, a, inDark]) => {
        const g = window.__g
        g.weather.set(weather, true)
        if (inDark) g.wanderer.place(x, g.terrain.base.hallTop - 69.2, z)
        else g.teleport(x, z)
        g.wanderer.yaw = 0.4
        await new Promise((r) => setTimeout(r, 1500))
        const p = g.player()
        g.lookFrom([p.x + Math.sin(a) * 2.6, p.y + 1.5, p.z + Math.cos(a) * 2.6], [p.x, p.y + 1.05, p.z])
      }, [weather, x, z, a, inDark])
      await shot(`hero-${name}`)
    }
    await stand('front', 'breaking', 140, 90, 0.9)
    await stand('back', 'breaking', 140, 90, 3.6)
    await stand('storm', 'storm', 140, 90, 2.2)
    const H = await page.evaluate(() => window.__g.shared.HALL)
    await stand('dark', 'overcast', H.x + 60, H.z - 60, 1.2, true)
    await page.evaluate(() => window.__g.lookFrom(null))
    // Running, seen from the side.
    await page.evaluate(async () => {
      const g = window.__g
      g.weather.set('breaking', true)
      g.teleport(100, 100)
      g.rig.setProfile({ minDist: 2, maxDist: 4000, dist: 4.8, focusHeight: 1.1, follow: 10 })
      g.setCam(0, 0.12, 4.8)
      g.input.press('KeyA')
      g.input.press('ShiftLeft')
      await new Promise((r) => setTimeout(r, 1800))
    })
    await shot('hero-running')
    await page.evaluate(() => {
      const g = window.__g
      g.input.release('KeyA')
      g.input.release('ShiftLeft')
    })
  },
  // Watchers: from the ground at a distance under a heavy sky; then walk at one — it is gone.
  async watchers() {
    const info = await page.evaluate(async () => {
      const g = window.__g
      g.weather.set('overcast', true)
      return g.watchers.watchers.map((w) => ({ x: Math.round(w.x), z: Math.round(w.z), h: Math.round(w.mesh.scale.x) }))
    })
    console.log(`${info.length} watchers`, JSON.stringify(info.slice(0, 4)))
    for (const [i, dist] of [[0, 190], [1, 200], [3, 210]]) {
      await page.evaluate(async ([i, dist]) => {
        const g = window.__g
        const w = g.watchers.watchers[i]
        const ok = g.frame([w.x, g.heightAt(w.x, w.z) + w.mesh.scale.x * 0.55, w.z], dist, 2.5, w.yaw)
        // Let it come out of the haze (they appear slowly) and turn a little.
        g.clock.scale = 1
        for (const q of g.watchers.watchers) q.seen = 1
        await new Promise((r) => setTimeout(r, 400))
        return ok
      }, [i, dist])
      await shot(`watcher-${i}`)
    }
    // Close in on one: it thins away before you reach it.
    const gone = await page.evaluate(async () => {
      const g = window.__g
      g.lookFrom(null)
      const w = g.watchers.watchers[0]
      g.teleport(w.x + 60, w.z + 60)
      await new Promise((r) => setTimeout(r, 2500))
      return { seen: +w.seen.toFixed(2), visible: w.mesh.visible }
    })
    console.log('walked up to one', JSON.stringify(gone))
    if (gone.seen > 0.1) throw new Error('watchers gate: a watcher stayed when you came close')
  },
  // The weather: the same views under each kind of sky.
  async weather() {
    await page.waitForFunction(() => window.__g.rocks.formations.filter((f) => f.always).every((f) => f.mesh), null, { timeout: 120000 })
    for (const w of ['overcast', 'storm', 'breaking', 'clear']) {
      await page.evaluate((w) => window.__g.weather.set(w, true), w)
      await page.evaluate(() => {
        const g = window.__g
        const c = g.colossi.places.get('sentinel')
        g.frame([c.x, c.y + 220, c.z], 700, 2.5, Math.atan2(-c.x, -c.z))
      })
      await shot(`weather-${w}-sentinel`)
      await page.evaluate(() => {
        const g = window.__g
        const t = g.titan.gait
        g.frame([t.x, g.heightAt(t.x, t.z) + 200, t.z], 420, 2.5, 2.2)
      })
      await shot(`weather-${w}-giant`)
      // Toward the sun, over the colonnade: shafts through the gaps when it breaks.
      await page.evaluate(() => {
        const g = window.__g
        const c = g.colossi.places.get('colonnade')
        const s = g.sky.sunDir
        g.frame([c.x, c.y + 380, c.z], 1300, 3, Math.atan2(-s.x, -s.z))
      })
      await shot(`weather-${w}-sun`)
    }
  },
  // The colossi, each from where a wanderer would stand, looking up.
  async colossi() {
    const t0 = Date.now()
    await page.waitForFunction(() => window.__g.rocks.formations.filter((f) => f.always).every((f) => f.mesh), null, { timeout: 120000 })
    const info = await page.evaluate(() => {
      const g = window.__g
      const all = g.rocks.formations.filter((f) => f.always)
      return { count: all.length, tris: all.reduce((n, f) => n + (f.mesh.geometry.index ? f.mesh.geometry.index.count : f.mesh.geometry.getAttribute("position").count) / 3, 0), places: Object.fromEntries([...g.colossi.places].map(([k, v]) => [k, [Math.round(v.x), Math.round(v.y), Math.round(v.z)]])) }
    })
    console.log(`${info.count} colossi meshed in ${((Date.now() - t0) / 1000).toFixed(1)} s, ${Math.round(info.tris / 1000)}k tris`, JSON.stringify(info.places))
    // Each view: the subject (its place, raised to look at its middle) from a
    // clear vantage at a distance, camera low, the wanderer in frame for scale.
    const views = [
      ['sentinel-from-spawn', 'sentinel', 190, 900, 3],
      ['sentinel-feet', 'sentinel', 230, 300, 2],
      ['ribcage', 'ribcage', 70, 420, 2.5],
      ['skull', 'skull', 50, 260, 2.5],
      ['sword', 'sword', 140, 420, 2.5],
      ['colonnade', 'colonnade', 300, 650, 3],
      ['stair', 'stair', 140, 520, 3],
      ['gate', 'gate', 150, 260, 3],
      ['giant-tree', 'tree-1', 120, 260, 2.5],
      ['stones', 'stone-1', 0, 520, 3],
    ]
    for (const [name, place, rise, dist, height] of views) {
      const ok = await page.evaluate(([place, rise, dist, height]) => {
        const g = window.__g
        const c = g.colossi.places.get(place)
        if (!c) return false
        // Prefer looking from the valley's side.
        return g.frame([c.x, c.y + rise, c.z], dist, height, Math.atan2(-c.x, -c.z))
      }, [place, rise, dist, height])
      if (!ok) console.log(`  no clear view of ${name}`)
      await shot(`colossus-${name}`)
    }
    // The sky: a leviathan passing over; the far colossi beyond the mountains.
    await page.evaluate(async () => {
      const g = window.__g
      const b = g.leviathans.beasts[0].mesh.position
      // Above the trees a little off its path, looking up at it.
      const x = b.x + 600
      const z = b.z - 400
      g.teleport(x, z)
      const y = g.heightAt(x, z) + 90
      g.lookFrom([x, y, z], [b.x, b.y, b.z])
    })
    await shot('colossus-leviathan')
    await page.evaluate(async () => {
      const g = window.__g
      const t = g.farGiants[0].gait
      // From high over the valley's edge, toward the giant beyond the mountains.
      const x = -t.x * 0.05
      const z = -t.z * 0.05
      g.teleport(x, z)
      g.lookFrom([x, g.heightAt(x, z) + 420, z], [t.x, 1600, t.z])
    })
    await shot('colossus-far-giant')
    // A strider, from the ground: legs coming down out of the sky.
    for (const w of ['breaking', 'overcast']) {
      await page.evaluate((w) => {
        const g = window.__g
        g.weather.set(w, true)
        const s = g.striders.striders[0]
        g.frame([s.x, g.heightAt(s.x, s.z) + 300, s.z], 1100, 2.5, Math.atan2(-s.x, -s.z))
      }, w)
      await shot(`colossus-strider-${w}`)
    }
    await page.evaluate(() => window.__g.lookFrom(null))
    // Climb a pillar of the colonnade: walk at it, take hold, climb.
    const climb = await page.evaluate(async () => {
      const g = window.__g
      const f = g.rocks.formations.find((q) => q.kind === 'built' && q.hy > 200)
      const a = 0.7
      const r = f.hx / 1.6
      // Outside the plinth (1.45 r), facing it.
      g.teleport(f.x + Math.cos(a) * (r * 1.45 + 4), f.z + Math.sin(a) * (r * 1.45 + 4))
      g.wanderer.yaw = Math.atan2(-Math.cos(a), -Math.sin(a))
      g.rig.setProfile({ minDist: 2, maxDist: 4000, dist: 10, focusHeight: 1.5, follow: 10 })
      g.setCam(Math.atan2(Math.cos(a), Math.sin(a)), 0.15, 10)
      let held = false
      for (let i = 0; i < 300 && !held; i++) {
        g.input.press('KeyW')
        await new Promise((r) => requestAnimationFrame(r))
        g.input.release('KeyW')
        g.input.press('KeyE')
        await new Promise((r) => requestAnimationFrame(r))
        g.input.release('KeyE')
        held = g.cliff.active && !!g.cliff.solid
      }
      const y0 = g.player().y
      g.input.press('KeyW')
      const t0 = performance.now()
      while (performance.now() - t0 < 8000 && g.cliff.active) await new Promise((r) => setTimeout(r, 50))
      g.input.release('KeyW')
      const p = g.player()
      return { held, rose: p.y - y0, still: g.cliff.active, grip: +g.cliff.stamina.toFixed(2), inside: g.rocks.sdf(f, p.x, p.y + 0.5, p.z) < -0.5 }
    })
    console.log('pillar climb', JSON.stringify(climb))
    await shot('colossus-climbing')
    if (!climb.held || climb.rose < 6 || climb.inside) throw new Error('colossi gate: could not climb a pillar')
    for (const [name, place, angle, dist, pitch] of views) {
      await page.evaluate(([place, angle, dist, pitch]) => {
        const g = window.__g
        const c = g.colossi.places.get(place)
        if (!c) return
        // From the place toward the valley's centre, turned by `angle`.
        const base = Math.atan2(-c.x, -c.z) + angle
        const x = c.x + Math.sin(base) * dist
        const z = c.z + Math.cos(base) * dist
        g.teleport(x, z)
        g.rig.setProfile({ minDist: 2, maxDist: 4000, dist: 8, focusHeight: 1.6, follow: 10 })
        g.setCam(Math.atan2(x - c.x, z - c.z), -pitch, 8)
      }, [place, angle, dist, pitch])
      await shot(`colossus-${name}`)
    }
  },
  // Rock formations: one of each kind, from a little way off; then into a cave.
  async rocks() {
    const kinds = await page.evaluate(() => {
      const g = window.__g
      const by = {}
      for (const f of g.rocks.formations) {
        const d = Math.hypot(f.x, f.z)
        if (!by[f.kind] || d < by[f.kind].d) by[f.kind] = { id: f.id, d, land: f.land }
      }
      return { count: g.rocks.formations.length, by }
    })
    console.log(`${kinds.count} formations;`, Object.entries(kinds.by).map(([k, v]) => `${k} in the ${v.land} ${Math.round(v.d)} m out`).join(', '))
    for (const [kind, v] of Object.entries(kinds.by)) {
      await page.evaluate(async ([id, kind]) => {
        const g = window.__g
        const f = g.rocks.formations[id]
        const r = Math.max(f.hx, f.hz)
        // Stand off to one side, a little more than its size away, and look at it.
        // An arch is seen through its opening (its ring lies across local x): look along local z.
        const turn = kind === 'arch' ? 0 : 0.6
        const ax = Math.sin(f.rot + turn), az = Math.cos(f.rot + turn)
        g.teleport(f.x + ax * (r * 1.5 + 25), f.z + az * (r * 1.5 + 25))
        g.rig.setProfile({ minDist: 2, maxDist: 4000, dist: 9, focusHeight: 1.5, follow: 10 })
        g.setCam(Math.atan2(ax, az), kind === 'spire' || kind === 'hoodoo' ? -0.25 : -0.05, 9)
        while (!f.mesh) await new Promise((r) => setTimeout(r, 100))
      }, [v.id, kind])
      await shot(`rock-${kind}`)
    }
    // Into the cave: from its mouth, walk in along the tunnel.
    const cave = await page.evaluate(async (id) => {
      const g = window.__g
      const f = g.rocks.formations[id]
      // Local (0, z) along the tunnel → world (mesh.rotation.y = rot).
      const at = (lz) => ({ x: f.x + lz * Math.sin(f.rot), z: f.z + lz * Math.cos(f.rot) })
      const mouth = at(-f.hz + 2)
      g.teleport(mouth.x, mouth.z)
      const into = at(0)
      g.wanderer.yaw = Math.atan2(into.x - mouth.x, into.z - mouth.z)
      g.rig.setProfile({ minDist: 1.5, maxDist: 4000, dist: 5, focusHeight: 1.6, follow: 10 })
      g.setCam(Math.atan2(mouth.x - into.x, mouth.z - into.z), 0.05, 5)
      await new Promise((r) => setTimeout(r, 600))
      const start = g.player()
      // Walk in, steering along the tunnel.
      g.input.press('KeyW')
      const t0 = performance.now()
      while (performance.now() - t0 < 5000) {
        g.setCam(Math.atan2(mouth.x - into.x, mouth.z - into.z), 0.05, 5)
        await new Promise((r) => setTimeout(r, 50))
      }
      g.input.release('KeyW')
      const p = g.player()
      return { walked: Math.hypot(p.x - start.x, p.z - start.z), y: p.y, ground: g.heightAt(p.x, p.z), inRock: g.rocks.sdf(f, p.x, p.y + 0.9, p.z) < 0 }
    }, kinds.by.cave.id)
    console.log('into the cave', JSON.stringify(cave))
    await shot('rock-cave-inside')
    if (cave.walked < 8 || cave.inRock) throw new Error('rocks gate: could not walk into the cave')
  },
  // The carved land: in each land, the foot of its tallest wall, looking up; then from above.
  async carved() {
    const spots = await page.evaluate(() => {
      const g = window.__g
      const H = (x, z) => g.heightAt(x, z)
      const out = {}
      for (const [land, ax, az] of [['forest', -0.866, -0.5], ['desert', 0, 1], ['ruins', 0.866, -0.5], ['valley', 0, 0]]) {
        let best = null
        for (let r = land === 'valley' ? 650 : 900; r <= (land === 'valley' ? 1000 : 2400); r += 70) {
          for (let a = -0.6; a <= 0.6; a += 0.06) {
            const base = land === 'valley' ? Math.atan2(1, 0) + a * 5.2 : Math.atan2(ax, az) + a
            const x = Math.sin(base) * r
            const z = Math.cos(base) * r
            if (g.terrain.base.regions.name(x, z) !== land && land !== 'valley') continue
            const h = H(x, z)
            // Flat enough to stand at the foot of it.
            if (Math.abs(H(x + 3, z) - h) + Math.abs(H(x, z + 3) - h) > 2) continue
            let top = -Infinity, tx = 0, tz = 0
            for (let k = 0; k < 16; k++) {
              const t = (k / 16) * Math.PI * 2
              for (const dd of [60, 110, 170]) {
                const hh = H(x + Math.sin(t) * dd, z + Math.cos(t) * dd)
                if (hh - h > top) {
                  top = hh - h
                  tx = Math.sin(t)
                  tz = Math.cos(t)
                }
              }
            }
            if (!best || top > best.relief) best = { x, z, relief: top, tx, tz }
          }
        }
        out[land] = best
      }
      return out
    })
    for (const [land, s] of Object.entries(spots)) {
      if (!s) continue
      console.log(land, `wall ${s.relief.toFixed(0)} m above`, JSON.stringify({ x: Math.round(s.x), z: Math.round(s.z) }))
      await page.evaluate((s) => {
        const g = window.__g
        // Stand back from the wall a little and look up at it.
        g.teleport(s.x - s.tx * 25, s.z - s.tz * 25)
        g.rig.setProfile({ minDist: 2, maxDist: 4000, dist: 9, focusHeight: 1.5, follow: 10 })
        g.setCam(Math.atan2(-s.tx, -s.tz), -0.32, 9)
      }, s)
      await shot(`carved-${land}`)
      await page.evaluate((s) => {
        const g = window.__g
        g.rig.setProfile({ minDist: 10, maxDist: 4000, dist: 520, focusHeight: 1.5, follow: 10 })
        g.setCam(Math.atan2(-s.tx, -s.tz), 0.42)
      }, s)
      await shot(`carved-${land}-above`)
    }
    // Climb the desert's wall: take hold, climb for a while.
    const s = spots.desert
    const climb = await page.evaluate(async (s) => {
      const g = window.__g
      g.rig.setProfile({ minDist: 2, maxDist: 4000, dist: 9, focusHeight: 1.5, follow: 10 })
      // Walk at the wall until E takes hold.
      g.teleport(s.x, s.z)
      g.wanderer.yaw = Math.atan2(s.tx, s.tz)
      g.setCam(Math.atan2(-s.tx, -s.tz), 0.1, 9)
      let held = false
      for (let i = 0; i < 400 && !held; i++) {
        g.input.press('KeyW')
        await new Promise((r) => requestAnimationFrame(r))
        g.input.release('KeyW')
        g.input.press('KeyE')
        await new Promise((r) => requestAnimationFrame(r))
        g.input.release('KeyE')
        held = g.cliff.active
      }
      const y0 = g.player().y
      g.input.press('KeyW')
      const t0 = performance.now()
      while (performance.now() - t0 < 6000 && g.cliff.active) await new Promise((r) => setTimeout(r, 50))
      const out = { held, rose: g.player().y - y0, still: g.cliff.active, grip: g.cliff.stamina }
      g.input.release('KeyW')
      return out
    }, s)
    console.log('cliff climb', JSON.stringify(climb))
    await page.evaluate(() => window.__g.setCam(window.__g.rig.yaw, 0.2, 7))
    await shot('carved-climbing')
    if (!climb.held || climb.rose < 4) throw new Error('carved gate: could not climb the rock')
  },
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
