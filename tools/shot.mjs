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
// SHOTS=<dir> writes elsewhere (before/after comparisons).
const OUT = process.env.SHOTS ?? 'shots'
mkdirSync(OUT, { recursive: true })

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
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log(`${OUT}/${name}.png`, JSON.stringify(stats))
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
  // Cairns: where they are; light one on a peak and the one on the pillar; the beams from afar.
  async cairns() {
    const list = await page.evaluate(() => window.__g.cairns.cairns.map((c) => ({ name: c.name, x: Math.round(c.x), y: Math.round(c.y), z: Math.round(c.z) })))
    console.log(`${list.length} cairns:`, list.map((c) => `${c.name} (${c.y} m)`).join(', '))
    const lit = await page.evaluate(async () => {
      const g = window.__g
      const wait = (ms) => new Promise((r) => setTimeout(r, ms))
      const before = g.worldMap.explored
      const out = []
      for (const name of ['Moss Crown', 'The Tallest Pillar', 'The Red Tooth']) {
        const c = g.cairns.cairns.find((q) => q.name === name)
        if (!c) continue
        g.wanderer.place(c.x + 2, c.y + 0.2, c.z + 1)
        await wait(300)
        g.input.press('KeyE')
        await wait(120)
        g.input.release('KeyE')
        await wait(300)
        out.push({ name, lit: c.lit, prompt: document.getElementById('prompt').textContent })
      }
      return { out, before, after: g.worldMap.explored, said: g.narration.lines.slice(-1)[0] }
    })
    console.log('lit', JSON.stringify(lit))
    // A lit cairn close up, the land below.
    await page.evaluate(async () => {
      const g = window.__g
      g.weather.set('breaking', true)
      const c = g.cairns.cairns.find((q) => q.name === 'Moss Crown')
      g.wanderer.place(c.x + 3, c.y + 0.2, c.z + 2)
      g.wanderer.yaw = Math.atan2(-c.x, -c.z)
      await new Promise((r) => setTimeout(r, 4500))
      g.lookFrom([c.x + 9, c.y + 4, c.z + 7], [c.x, c.y + 1.5, c.z])
    })
    await shot('cairn-lit')
    // From the valley: the beams rising over the lands.
    await page.evaluate(async () => {
      const g = window.__g
      g.weather.set('overcast', true)
      g.teleport(0, 300)
      g.lookFrom([0, g.heightAt(0, 300) + 40, 300], [300, 260, -1200])
    })
    await shot('cairn-beams')
    await page.evaluate(() => window.__g.lookFrom(null))
    if (lit.out.length < 3 || lit.out.some((c) => !c.lit) || !(lit.after > lit.before)) throw new Error('cairns gate: could not light the cairns')
  },
  // Falls: a short drop is nothing; a long one blacks out and wakes you at the last safe ground.
  async fall() {
    const r = await page.evaluate(async () => {
      const g = window.__g
      const wait = (ms) => new Promise((r) => setTimeout(r, ms))
      g.teleport(150, 80)
      await wait(2200) // long enough to count as safe ground
      const safe = g.lastSafe
      // A short drop, a few metres away.
      g.wanderer.place(158, g.heightAt(158, 80) + 8, 80)
      await wait(1500)
      const short = g.player()
      // (Stood there a while, the short drop's landing may have become safe ground itself.)
      const before = g.lastSafe
      // A long drop, further off.
      g.wanderer.place(190, g.heightAt(190, 80) + 60, 80)
      await wait(4500)
      const long = g.player()
      return {
        safe: [safe.x, safe.z].map(Math.round),
        shortStayed: Math.hypot(short.x - 158, short.z - 80) < 2,
        longBack: Math.hypot(long.x - before.x, long.z - before.z) < 2,
        long: [long.x, long.z].map(Math.round),
        said: g.narration.lines.slice(-1)[0] ?? '',
      }
    })
    console.log('falls', JSON.stringify(r))
    if (!r.shortStayed) throw new Error('fall gate: a short drop moved you')
    if (!r.longBack) throw new Error('fall gate: a long fall did not wake you at the last safe ground')
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
    for (const [i, dist] of [[0, 320], [1, 340], [3, 360]]) {
      await page.evaluate(async ([i, dist]) => {
        const g = window.__g
        const w = g.watchers.watchers[i]
        const ok = g.frame([w.x, g.heightAt(w.x, w.z) + w.mesh.scale.x * 0.55, w.z], dist, 2.5, w.yaw)
        // Look a little aside (straight at one, it thins away): it stands at the edge of the frame.
        const c = g.camera.position
        const ax = w.x - c.x
        const az = w.z - c.z
        const turn = 0.42
        g.lookFrom([c.x, c.y, c.z], [c.x + ax * Math.cos(turn) - az * Math.sin(turn), g.heightAt(w.x, w.z) + w.mesh.scale.x * 0.4, c.z + ax * Math.sin(turn) + az * Math.cos(turn)])
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
  // A giant up close: from the front, the side, below, and its head.
  async giant() {
    await page.evaluate(() => window.__g.weather.set('breaking', true))
    const views = [
      ['front', 0, 520, 2.5, 0.55],
      ['side', 1.6, 480, 2.5, 0.5],
      ['back', 3.1, 460, 2.5, 0.55],
      ['below', 0.6, 170, 2, 0.4],
    ]
    for (const [name, turn, dist, height, rise] of views) {
      await page.evaluate(([turn, dist, height, rise]) => {
        const g = window.__g
        const t = g.titan
        const h = g.heightAt(t.gait.x, t.gait.z)
        g.frame([t.gait.x, h + t.H * rise, t.gait.z], dist, height, t.gait.heading + turn)
      }, [turn, dist, height, rise])
      await shot(`giant-${name}`)
    }
    // The head, close: from a camera just in front of the mask.
    await page.evaluate(() => {
      const g = window.__g
      const t = g.titan
      const head = t.head
      const fx = Math.sin(t.gait.heading)
      const fz = Math.cos(t.gait.heading)
      g.lookFrom([head.x + fx * 70 + fz * 25, head.y + 10, head.z + fz * 70 - fx * 25], [head.x, head.y + 8, head.z])
    })
    await shot('giant-head')
    // The shrine on its back, from above and behind.
    await page.evaluate(() => {
      const g = window.__g
      const t = g.titan
      const c = t.chest
      const fx = Math.sin(t.gait.heading)
      const fz = Math.cos(t.gait.heading)
      g.lookFrom([c.x - fx * t.H * 0.32 + fz * 30, c.y + t.H * 0.16, c.z - fz * t.H * 0.32 - fx * 30], [c.x - fx * t.H * 0.06, c.y + t.H * 0.04, c.z - fz * t.H * 0.06])
    })
    await shot('giant-shrine')
    await page.evaluate(() => window.__g.lookFrom(null))
  },
  // From where you wake, toward each land: is there room between the big things?
  async vistas() {
    await page.waitForFunction(() => window.__g.rocks.formations.filter((f) => f.always).every((f) => f.mesh), null, { timeout: 180000 })
    await page.evaluate(() => window.__g.weather.set('breaking', true))
    const views = [
      ['north-sentinel', 0, -1],
      ['northwest-wood', -0.866, -0.5],
      ['south-dunes', 0, 1],
      ['northeast-steps', 0.866, -0.5],
      ['east-green', 1, 0.15],
      ['west-green', -1, 0.3],
    ]
    for (const [name, dx, dz] of views) {
      await page.evaluate(([dx, dz]) => {
        const g = window.__g
        g.teleport(0, 0)
        g.rig.yaw = Math.atan2(dx, dz) + Math.PI
      }, [dx, dz])
      await settle(40)
      await shot(`vista-${name}`)
    }
    // And from up high: the Sentinel's shoulder, looking back across the Green.
    await page.evaluate(() => {
      const g = window.__g
      const s = g.colossi.places.get('sentinel')
      g.lookFrom([s.x + 60, s.y + 200, s.z + 260], [0, 30, 2600])
    })
    await shot('vista-from-the-sentinel')
    await page.evaluate(() => window.__g.lookFrom(null))
  },
  // The Wall: the outer range, and the colossi beyond it, from the Green.
  async wall() {
    for (const [w, dirs] of [['clear', [0.45, 1.5, 2.55, 3.5, 4.4]], ['breaking', [0.45, 4.4]], ['overcast', [2.55]]]) {
      await page.evaluate((w) => window.__g.weather.set(w, true), w)
      for (const a of dirs) {
        await page.evaluate((a) => {
          const g = window.__g
          // From a height over the Green (a cairn's view: the lands are ~10 km
          // across now, and from the grass the near hills hide the edge).
          const x = Math.cos(a) * 2200
          const z = Math.sin(a) * 2200
          g.teleport(x, z)
          const h = g.heightAt(x, z)
          g.lookFrom([x, h + 260, z], [Math.cos(a) * 26000, 3200, Math.sin(a) * 26000])
        }, a)
        await shot(`wall-${w}-${a}`)
      }
    }
    await page.evaluate(() => window.__g.lookFrom(null))
  },
  // The Shore: the beach, the sea (you swim in it), the Wader wading out in the deep.
  async shore() {
    const r = await page.evaluate(async () => {
      const g = window.__g
      g.weather.set('clear', true)
      g.teleport(300, 9200)
      g.setCam(Math.PI + 0.2, 0.05)
      await new Promise((res) => setTimeout(res, 8000))
      const beach = { y: g.player().y, sea: g.sea.levelAt(300, 9200) }
      // Out into the surf.
      g.teleport(0, 10300)
      await new Promise((res) => setTimeout(res, 3000))
      return { beach, swim: g.wanderer.swimming, level: g.sea.levelAt(0, 10300), found: ['shore', 'wader'].filter((k) => g.finds.has(k)), wader: g.wader.gait.speed }
    })
    console.log('shore', JSON.stringify(r))
    await shot('shore-surf')
    await page.evaluate(() => { const g = window.__g; const p = g.player(); g.lookFrom([p.x, p.y + 3, p.z], [g.wader.gait.x, 300, g.wader.gait.z]) })
    await shot('shore-wader')
    await page.evaluate(() => window.__g.lookFrom(null))
    if (r.beach.y < -2 || !r.swim || r.level !== -4 || r.found.length < 2 || !(r.wader > 0)) throw new Error('shore gate failed')
  },
  // The High Places: walk up the stair cut in the cliff (it must be walkable), then the plateau and
  // the Frozen One in the ice.
  async high() {
    const r = await page.evaluate(async () => {
      const g = window.__g
      g.weather.set('overcast', true)
      const H = g.HIGH
      const R = (H.foot + H.lip) / 2
      const at = (t) => {
        const d = H.foot - 220 + (H.lip + 160 - (H.foot - 220)) * t
        const a = H.axis + (H.a0 * R + (H.a1 * R - H.a0 * R) * t) / R
        return [Math.sin(a) * d, Math.cos(a) * d]
      }
      const [x0, z0] = at(0.3)
      g.teleport(x0, z0)
      await new Promise((res) => setTimeout(res, 6000))
      const y0 = g.player().y
      // Climb: keep facing the next point up the stair, W held.
      // (Running: 20 s at a run up a ~21° stair is ~60 m of height; walking, ~30.)
      g.input.press('KeyW')
      g.input.press('ShiftLeft')
      const t0 = performance.now()
      while (performance.now() - t0 < 20000) {
        const p = g.player()
        let best = 0, bd = Infinity
        for (let i = 0; i <= 200; i++) { const [x, z] = at(i / 200); const dd = Math.hypot(x - p.x, z - p.z); if (dd < bd) { bd = dd; best = i / 200 } }
        const [nx, nz] = at(Math.min(1, best + 0.02))
        g.setCam(Math.atan2(-(nx - p.x), -(nz - p.z)), 0.15)
        await new Promise((res) => setTimeout(res, 120))
      }
      g.input.release('KeyW')
      g.input.release('ShiftLeft')
      const climbed = g.player().y - y0
      // The plateau, near the ice.
      const fx = Math.sin(H.axis) * (H.frozenD - 700), fz = Math.cos(H.axis) * (H.frozenD - 700)
      g.teleport(fx, fz)
      await new Promise((res) => setTimeout(res, 7000))
      return { climbed, y: g.player().y, found: ['high', 'frozen'].filter((k) => g.finds.has(k)) }
    })
    console.log('high', JSON.stringify(r))
    await page.evaluate(() => { const g = window.__g; const p = g.player(); const f = g.frozen.at; g.lookFrom([p.x, p.y + 3, p.z], [f.x, f.y + 260, f.z]) })
    await shot('high-frozen')
    await page.evaluate(() => { const g = window.__g; const p = g.player(); g.lookFrom([p.x, p.y + 4, p.z], [0, 400, 0]) })
    await shot('high-over-the-clouds')
    await page.evaluate(() => window.__g.lookFrom(null))
    if (r.climbed < 45 || r.y < 760 || r.found.length < 2) throw new Error('high gate failed')
  },
  // The grappling line: throw it at the High Places' cliff, hold G to reel in, rise.
  async grapple() {
    await page.evaluate(() => { const g = window.__g; g.weather.set('clear', true); g.finds.find('bag'); const H = g.HIGH; const d = H.foot + 200; const a = H.axis + 0.12; g.teleport(Math.sin(a) * d, Math.cos(a) * d); g.setCam(H.axis + 0.12 + Math.PI, -0.3) })
    await page.waitForTimeout(6000)
    const y0 = await page.evaluate(() => window.__g.wanderer.pos.y)
    await page.keyboard.down('KeyG')
    await page.waitForTimeout(3600)
    await page.keyboard.up('KeyG')
    const r = await page.evaluate((y0) => { const g = window.__g; return { rose: g.wanderer.pos.y - y0, attached: g.grapple.attached, hanging: g.wanderer.hanging } }, y0)
    console.log('grapple', JSON.stringify(r))
    await shot('grapple-hanging')
    await page.keyboard.press('Space')
    await page.waitForTimeout(400)
    const off = await page.evaluate(() => window.__g.grapple.attached)
    if (r.rose < 20 || !r.attached || !r.hanging || off) throw new Error('grapple gate failed')
  },
  // Aiming, as a player sees it: the real camera over the shoulder, the mark on an eye, the arrow
  // in flight, the eye closing — on the Sentinel, in the Undercroft, at a mesa.
  async aim() {
    await page.evaluate(() => {
      const g = window.__g
      g.weather.set('breaking', true)
      g.finds.find('bag')
      g.finds.find('bow')
    })
    // Turn the rig until the centre of the view is on `t` (with the bow drawn: the shoulder camera).
    const aimAt = (t) =>
      page.evaluate(async (t) => {
        const g = window.__g
        const T = new g.THREE.Vector3(t[0], t[1], t[2])
        const dir = new g.THREE.Vector3()
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => requestAnimationFrame(r))
          const c = g.camera.position
          g.camera.getWorldDirection(dir)
          const want = T.clone().sub(c).normalize()
          const yawErr = Math.atan2(want.x, want.z) - Math.atan2(dir.x, dir.z)
          const pitchErr = Math.asin(want.y) - Math.asin(dir.y)
          g.rig.yaw += Math.atan2(Math.sin(yawErr), Math.cos(yawErr)) * 0.8
          g.rig.pitch -= pitchErr * 0.35
          g.rig.pitch = Math.max(-0.75, Math.min(1.4, g.rig.pitch))
        }
        g.camera.getWorldDirection(dir)
        const want = T.clone().sub(g.camera.position).normalize()
        return +((dir.angleTo(want) * 180) / Math.PI).toFixed(2)
      }, t)
    const standOff = (setId, k, d) =>
      page.evaluate(([setId, k, d]) => {
        const g = window.__g
        const e = g.eyes.sets.find((s) => s.id === setId).eyes[k]
        const q = e.at.clone().addScaledVector(e.normal, d)
        g.teleport(q.x, q.z)
        g.rig.yaw = Math.atan2(q.x - e.at.x, q.z - e.at.z)
        return e.at.toArray()
      }, [setId, k, d])
    const draw = (on) => page.evaluate((on) => (on ? window.__g.input.press('KeyQ') : window.__g.input.release('KeyQ')), on)
    const loose = () => page.evaluate(() => window.__g.input.press('KeyF'))
    // The Sentinel's eyes, from the Green.
    const report = []
    for (const k of [0, 1, 2]) {
      const t = await standOff('eyes-sentinel', k, 150)
      await draw(true)
      await page.waitForTimeout(700)
      report.push(await aimAt(t))
      if (k === 1) await shot('aim-sentinel')
      await loose()
      if (k === 1) {
        await page.waitForTimeout(450)
        await shot('aim-flight')
      }
      await page.waitForTimeout(2600)
      if (k === 1) await shot('aim-hit')
      await draw(false)
    }
    await page.waitForTimeout(1600)
    await page.evaluate(() => window.__g.setCam(window.__g.rig.yaw, 0.1, 7))
    await page.waitForTimeout(1400)
    await shot('aim-released')
    // The Undercroft: from the altar, at an eye high on a pillar.
    const th = await page.evaluate(() => {
      const g = window.__g
      const s = g.spots.spots.find((s) => s.id === 'bow')
      g.teleport(s.at.x - 4, s.at.z + 2)
      return g.eyes.sets.find((s) => s.id === 'eyes-hall').eyes[0].at.toArray()
    })
    await draw(true)
    await page.waitForTimeout(700)
    report.push(await aimAt(th))
    await shot('aim-hall')
    await draw(false)
    // A mesa's cliff, from the sand.
    const tm = await standOff('eyes-mesa', 1, 90)
    await draw(true)
    await page.waitForTimeout(700)
    report.push(await aimAt(tm))
    await shot('aim-mesa')
    await draw(false)
    const open = await page.evaluate(() => window.__g.eyes.open('eyes-sentinel'))
    console.log(`aim error (deg): ${report.join(', ')}; Sentinel eyes still open: ${open}`)
  },
  // Uncover: call the Walker across the mound with the horn; its foot breaks it open. And watching.
  async uncover() {
    await page.evaluate(() => {
      const g = window.__g
      g.weather.set('breaking', true)
      for (const id of ['bag', 'horn']) g.finds.find(id)
    })
    const r = await page.evaluate(async () => {
      const g = window.__g
      const t = g.titan
      const M = { x: 950, z: 620 }
      // Stand beyond the mound from the Walker, so its way to you crosses it.
      const dx = M.x - t.gait.x
      const dz = M.z - t.gait.z
      const l = Math.hypot(dx, dz)
      g.teleport(M.x + (dx / l) * 70, M.z + (dz / l) * 70)
      g.input.press('KeyH')
      await new Promise((res) => setTimeout(res, 150))
      g.input.release('KeyH')
      g.clock.scale = 6
      const until = Date.now() + 45000
      while (Date.now() < until && !g.spots.spots.find((s) => s.id === 'buried-box').hidden === false) await new Promise((res) => setTimeout(res, 250))
      while (Date.now() < until && g.spots.spots.find((s) => s.id === 'buried-box').hidden) await new Promise((res) => setTimeout(res, 250))
      g.clock.scale = 1
      const open = !g.spots.spots.find((s) => s.id === 'buried-box').hidden
      // Watch it, standing still.
      const w0 = g.finds.has('watch-walker')
      await new Promise((res) => setTimeout(res, 19500))
      return { open, watched: g.finds.has('watch-walker'), w0, d: Math.round(Math.hypot(t.gait.x - M.x, t.gait.z - M.z)) }
    })
    await page.evaluate(() => {
      const g = window.__g
      g.lookFrom([950 + 14, g.heightAt(964, 632) + 6, 620 + 12], [950, g.heightAt(950, 620), 620])
    })
    await page.waitForTimeout(700)
    await shot('uncover')
    await page.evaluate(() => window.__g.lookFrom(null))
    console.log(`the mound opened: ${r.open} (walker ${r.d} m off); watched the Walker: ${r.watched}`)
    if (!r.open) throw new Error('uncover gate: the mound did not open')
  },
  // In hand: the wanderer holding each tool in its pose, close; the toolbar with them all.
  async hands() {
    await page.evaluate(() => {
      const g = window.__g
      g.weather.set('breaking', true)
      for (const id of ['bag', 'bow', 'horn', 'cloak', 'sight']) g.finds.find(id)
      g.teleport(300, 400)
    })
    const pose = async (name, act) => {
      await page.evaluate((act) => {
        const g = window.__g
        if (act === 'bow') g.input.press('KeyQ')
        if (act === 'horn') g.input.press('KeyH')
        if (act === 'sight') g.input.press('KeyV')
      }, act)
      await page.waitForTimeout(700)
      // From the front and a little to the side, close.
      await page.evaluate(() => {
        const g = window.__g
        const p = g.player()
        const y = g.wanderer.yaw
        g.lookFrom([p.x - Math.sin(y + 0.7) * 2.6, p.y + 1.6, p.z - Math.cos(y + 0.7) * 2.6], [p.x, p.y + 1.25, p.z])
      })
      await page.waitForTimeout(300)
      await shot(`hands-${name}`)
      await page.evaluate(() => {
        const g = window.__g
        g.lookFrom(null)
        g.input.release('KeyQ')
        g.input.release('KeyH')
        g.input.release('KeyV')
      })
      await page.waitForTimeout(2800)
    }
    await pose('bow', 'bow')
    await pose('horn', 'horn')
    await pose('sight', 'sight')
    await pose('idle', null)
  },
  // Day into night: the same view at morning, noon, sunset, dusk, night (moon, stars), dawn.
  async daynight() {
    await page.evaluate(() => window.__g.weather.set('clear', true))
    for (const [name, t] of [['morning', 0.25], ['noon', 0.5], ['sunset', 0.87], ['dusk', 0.91], ['night', 0.96], ['midnight', 0.0], ['dawn', 0.09]]) {
      await page.evaluate((t) => {
        const g = window.__g
        g.sky.setTime(t)
        g.teleport(0, 0)
        g.setCam(0, 0.05, 7) // north, toward the Sentinel
      }, t)
      await page.waitForTimeout(700)
      await shot(`day-${name}`)
    }
    // Night, looking up at the moon and the stars over the Green.
    await page.evaluate(() => {
      const g = window.__g
      g.sky.setTime(0.98)
      const m = g.sky.moonDir
      g.lookFrom([0, g.heightAt(0, 0) + 1.7, 0], [m.x * 100, g.heightAt(0, 0) + 1.7 + m.y * 100, m.z * 100])
    })
    await page.waitForTimeout(700)
    await shot('day-moon')
    await page.evaluate(() => {
      const g = window.__g
      g.lookFrom(null)
      g.sky.setTime(0.36)
    })
  },
  // The Hanging Steps: every slab stood on in turn (a level top you land on), the view, the top.
  async steps() {
    await page.waitForFunction(() => window.__g.rocks.formations.every((f) => f.mesh || !f.always), null, { timeout: 180000 })
    await page.evaluate(() => window.__g.weather.set('breaking', true))
    const r = await page.evaluate(async () => {
      const g = window.__g
      const slabs = g.rocks.formations.filter((f) => f.kind === 'built' && f.hx < 4 && f.float)
      const stood = []
      for (const f of slabs) {
        const top = g.rocks.topAt(f.x, f.z)
        g.teleport(f.x, f.z, top + 0.3)
        await new Promise((res) => setTimeout(res, 250))
        const p = g.player()
        stood.push(Math.abs(p.y - top) < 0.6 ? 1 : 0)
      }
      return { n: slabs.length, stood: stood.reduce((a, b) => a + b, 0), top: Math.round(g.rocks.topAt(slabs[slabs.length - 1].x, slabs[slabs.length - 1].z) - g.heightAt(slabs[0].x, slabs[0].z)) }
    })
    await page.evaluate(() => {
      const g = window.__g
      const s = g.spots.spots.find((s) => s.id === 'kite-steps')
      g.teleport(s.at.x + 40, s.at.z + 40)
      g.lookFrom([s.at.x + 45, g.heightAt(s.at.x + 45, s.at.z + 45) + 8, s.at.z + 45], [s.at.x, s.at.y - 18, s.at.z])
    })
    await page.waitForTimeout(800)
    await shot('steps')
    await page.evaluate(() => window.__g.lookFrom(null))
    console.log(`the Hanging Steps: ${r.n} slabs, stood on ${r.stood}; the top ${r.top} m up`)
    if (r.stood < r.n) throw new Error('steps gate: a slab could not be stood on')
  },
  // The Sight-stone: take it in the Grove, hold V, see the marks, follow them to what waits.
  async sight() {
    await page.evaluate(() => {
      window.__g.weather.set('breaking', true)
      window.__g.finds.find('bag')
    })
    const took = await page.evaluate(async () => {
      const g = window.__g
      const s = g.spots.spots.find((s) => s.id === 'sight')
      g.teleport(s.at.x + 0.6, s.at.z)
      await new Promise((r) => setTimeout(r, 200))
      g.input.press('KeyE')
      await new Promise((r) => setTimeout(r, 150))
      g.input.release('KeyE')
      await new Promise((r) => setTimeout(r, 100))
      return g.finds.has('sight')
    })
    // On the Green at the first camp, looking along its trail: without, then through the stone.
    await page.evaluate(() => {
      const g = window.__g
      const t = g.glyphs.trails.find((t) => t.def.id === 'cache-green')
      const p0 = t.marks[0].position
      const p3 = t.marks[3].position
      g.teleport(p0.x - (p3.x - p0.x) * 0.12, p0.z - (p3.z - p0.z) * 0.12)
      g.setCam(Math.atan2(p0.x - p3.x, p0.z - p3.z), 0.3, 6)
    })
    await page.waitForTimeout(700)
    await shot('sight-without')
    await page.evaluate(() => window.__g.input.press('KeyV'))
    await page.waitForTimeout(900)
    await shot('sight-through')
    // Follow each trail to its end, looking.
    const ends = await page.evaluate(async () => {
      const g = window.__g
      const out = []
      for (const t of g.glyphs.trails) {
        g.teleport(t.end.x + 1, t.end.z)
        await new Promise((r) => setTimeout(r, 400))
        const s = g.spots.spots.find((x) => x.id === t.def.id)
        g.teleport(s.at.x + 0.5, s.at.z)
        await new Promise((r) => setTimeout(r, 150))
        g.input.press('KeyE')
        await new Promise((r) => setTimeout(r, 150))
        g.input.release('KeyE')
        await new Promise((r) => setTimeout(r, 100))
        out.push(`${t.def.id}:${g.finds.has(t.def.id) ? 'taken' : 'MISSED'}`)
      }
      g.input.release('KeyV')
      return out
    })
    console.log(`took the stone: ${took}; ${ends.join(' ')}`)
    if (!took || ends.some((e) => e.endsWith('MISSED'))) throw new Error('sight gate failed')
  },
  // The Mire: its pools and drowned trees; the Drowned One rising out of it.
  async mire() {
    await page.waitForFunction(() => window.__g.rocks.formations.filter((f) => f.always).every((f) => f.mesh), null, { timeout: 240000 })
    await page.evaluate(() => window.__g.weather.set('overcast', true))
    const views = [
      ['edge', -0.866 * 6900 + 900, -0.5 * 6900 + 500, -0.866, -0.5, 2],
      ['pools', -0.866 * 6900 + 650, -0.5 * 6900 + 120, -0.866, -0.5, 2],
    ]
    for (const [name, x, z, dx, dz] of views) {
      await page.evaluate(([x, z, dx, dz]) => {
        const g = window.__g
        g.teleport(x, z)
        g.setCam(Math.atan2(-dx, -dz), 0.12, 7)
      }, [x, z, dx, dz])
      await page.waitForTimeout(1500)
      await shot(`mire-${name}`)
    }
    await page.evaluate(() => {
      const g = window.__g
      const d = g.colossi.places.get('drowned')
      const back = Math.atan2(-d.x, -d.z)
      const x = d.x + Math.sin(back) * 620
      const z = d.z + Math.cos(back) * 620
      g.teleport(x, z)
      g.lookFrom([x, g.heightAt(x, z) + 2, z], [d.x, d.y + 60, d.z])
    })
    await page.waitForTimeout(1500)
    await shot('mire-drowned')
    await page.evaluate(() => {
      const g = window.__g
      g.lookFrom(null)
      g.sky.setTime(0.94)
      const d = g.colossi.places.get('drowned')
      const back = Math.atan2(-d.x, -d.z)
      g.teleport(d.x + Math.sin(back) * 420, d.z + Math.cos(back) * 420)
      g.setCam(back + Math.PI, 0.1, 7)
    })
    await page.waitForTimeout(1500)
    await shot('mire-night')
    await page.evaluate(() => window.__g.sky.setTime(0.36))
    const r = await page.evaluate(() => ({ region: window.__g.terrain.base.regions.name(-0.866 * 6900, -0.5 * 6900), pools: window.__g.mireView.water.count, snags: window.__g.mireView.snags.count }))
    console.log('mire', JSON.stringify(r))
  },
  // Scale: the same moments with the scale director off and on — at the Walker's feet, looking up,
  // the gaze drifting up, staring at the Sentinel from afar, and the vertigo of first sight.
  async scale() {
    await page.evaluate(() => {
      const g = window.__g
      g.weather.set('breaking', true)
      g.sky.setTime(0.36)
    })
    const atWalker = () =>
      page.evaluate(() => {
        const g = window.__g
        const t = g.titan
        const back = t.gait.heading + Math.PI
        const x = t.gait.x + Math.sin(back) * 150 + Math.cos(back) * 60
        const z = t.gait.z + Math.cos(back) * 150 - Math.sin(back) * 60
        g.teleport(x, z)
        g.setCam(Math.atan2(x - t.gait.x, z - t.gait.z), 0.15, 5.5)
      })
    for (const on of [false, true]) {
      const tag = on ? 'on' : 'off'
      await page.evaluate((on) => (window.__g.scaleDir.enabled = on), on)
      await atWalker()
      await page.waitForTimeout(4000)
      await shot(`scale-${tag}-feet`)
      await page.evaluate(() => window.__g.setCam(window.__g.rig.yaw, -0.5, 5.5))
      await page.waitForTimeout(3000)
      await shot(`scale-${tag}-lookup`)
    }
    // Hands off the mouse under it: the gaze drifts up.
    await atWalker()
    await page.waitForTimeout(9000)
    await shot('scale-drift')
    // Staring: the Sentinel from the far side of the Green, held still.
    await page.evaluate(() => {
      const g = window.__g
      // From where you wake, 1.6 km off, across the Green.
      const s = g.colossi.places.get('sentinel')
      g.teleport(60, 120)
      const p = g.player()
      g.setCam(Math.atan2(p.x - s.x, p.z - s.z), 0.04, 5.5)
    })
    await page.waitForTimeout(1500)
    await shot('scale-stare-0')
    await page.waitForTimeout(12000)
    await shot('scale-stare-12')
    // Vertigo: begun by hand (as finding the Walker would), frames through it.
    await atWalker()
    await page.waitForTimeout(3000)
    await page.evaluate(() => window.__g.scaleDir.vertigo(window.__g.camera.fov))
    // (Straight screenshots: shot() waits for the world to settle, and the dolly is over by then.)
    for (const at of [0, 1.3, 2.6]) {
      await page.waitForTimeout(at === 0 ? 30 : 1300)
      await page.screenshot({ path: `${OUT}/scale-vertigo-${String(at).replace('.', '_')}.png` })
    }
    const fov = await page.evaluate(() => window.__g.camera.fov)
    console.log('scale fov at the end of the vertigo in', fov.toFixed(1))
    // Cloud shadows over the Green on a fair day, from a height.
    await page.evaluate(() => {
      const g = window.__g
      g.weather.set('clear', true)
      g.weather.now.cover = 0.5
      g.lookFrom([0, g.heightAt(0, 0) + 200, 900], [0, g.heightAt(0, 0), -700])
    })
    await page.waitForTimeout(2000)
    await shot('scale-cloud-shadows')
    // Birds bursting up round a giant's foot.
    await page.evaluate(() => {
      const g = window.__g
      const t = g.titan
      g.lookFrom([t.gait.x + 260, g.heightAt(t.gait.x + 260, t.gait.z + 120) + 3, t.gait.z + 120], [t.gait.x, g.heightAt(t.gait.x, t.gait.z) + 60, t.gait.z])
      g.ambience.flushAt(t.gait.x + 20, t.gait.z + 10, 40)
    })
    await page.waitForTimeout(900)
    await page.screenshot({ path: `${OUT}/scale-birds.png` })
    await page.evaluate(() => window.__g.lookFrom(null))
  },
  // The eerie places, each as you come upon it: the Pit, the Circle, the Husk (and inside), the Hanged.
  async eerie() {
    await page.waitForFunction(() => window.__g.rocks.formations.filter((f) => f.always).every((f) => f.mesh), null, { timeout: 240000 })
    await page.evaluate(() => window.__g.weather.set('overcast', true))
    const view = async (name, fn) => {
      await page.evaluate(fn)
      await page.waitForTimeout(1500)
      await shot(name)
    }
    await view('eerie-pit', () => {
      const g = window.__g
      const P = g.shared.PIT
      g.teleport(P.x - P.r - 18, P.z + 10)
      g.lookFrom([P.x - P.r - 10, g.heightAt(P.x - P.r - 18, P.z) + 3.5, P.z + 4], [P.x + 10, g.heightAt(P.x - P.r - 18, P.z) - 40, P.z])
    })
    await view('eerie-circle', () => {
      const g = window.__g
      const c = g.eerie.circle
      const out = Math.atan2(c.x, c.z)
      const x = c.x - Math.sin(out) * (c.r + 300)
      const z = c.z - Math.cos(out) * (c.r + 300)
      g.teleport(x, z)
      g.lookFrom([x, g.heightAt(x, z) + 40, z], [c.x, g.heightAt(c.x, c.z) + 90, c.z])
    })
    await view('eerie-circle-inside', () => {
      const g = window.__g
      const c = g.eerie.circle
      g.teleport(c.x + 60, c.z + 40)
      g.lookFrom([c.x + 70, g.heightAt(c.x + 70, c.z + 50) + 1.7, c.z + 50], [c.x + 200, g.heightAt(c.x, c.z) + 120, c.z + 160])
    })
    await view('eerie-husk', () => {
      const g = window.__g
      const h = g.colossi.places.get('husk')
      g.teleport(h.x + 360, h.z - 120)
      g.lookFrom([h.x + 360, g.heightAt(h.x + 360, h.z - 120) + 3, h.z - 120], [h.x, h.y + 40, h.z])
    })
    await view('eerie-husk-inside', () => {
      const g = window.__g
      const h = g.colossi.places.get('husk')
      const x = h.x + Math.sin(0.9) * 60
      const z = h.z + Math.cos(0.9) * 60
      g.teleport(x, z)
      g.lookFrom([x, g.heightAt(x, z) + 1.7, z], [h.x + Math.sin(0.9) * 10, g.heightAt(x, z) + 6, h.z + Math.cos(0.9) * 10])
    })
    await view('eerie-hanged', () => {
      const g = window.__g
      const hg = g.eerie.hanged
      g.teleport(hg.x - 60, hg.z - 50)
      g.lookFrom([hg.x - 60, g.heightAt(hg.x - 60, hg.z - 50) + 1.7, hg.z - 50], [hg.x, g.heightAt(hg.x, hg.z) + 120, hg.z])
    })
    await page.evaluate(() => window.__g.lookFrom(null))
    const found = await page.evaluate(() => ['pit', 'circle', 'husk', 'hanged'].map((id) => `${id}:${window.__g.finds.has(id)}`).join(' '))
    console.log('eerie', found)
  },
  // The Great Bell: shoot it from below; every giant stops and turns toward it.
  async bell() {
    await page.evaluate(() => {
      const g = window.__g
      g.weather.set('breaking', true)
      g.setWild(true)
      for (const id of ['bag', 'bow']) g.finds.find(id)
    })
    const b = await page.evaluate(() => window.__g.bell.at.toArray())
    // Stand 160 m off toward the Green (in the open: not inside a tree), aim at it, loose —
    // and again if it missed, as a player would (one shot in a sweep missed under load).
    const at = await page.evaluate((b) => {
      const g = window.__g
      for (let k = 0; k < 40; k++) {
        const x = b[0] - 140 + (k % 7) * 9 - 27
        const z = b[2] + 80 + Math.floor(k / 7) * 9 - 18
        if (!g.vegetation.treeNear(x, z, 10)) return [x, z]
      }
      return [b[0] - 140, b[2] + 80]
    }, b)
    let r = { rang: false, order: 'none' }
    for (let attempt = 0; attempt < 3 && !r.rang; attempt++) {
      await page.evaluate((at) => {
        const g = window.__g
        g.teleport(at[0], at[1])
        g.input.press('KeyQ')
      }, at)
      await page.waitForTimeout(700)
      await page.evaluate(async (b) => {
        const g = window.__g
        const T = new g.THREE.Vector3(b[0], b[1], b[2])
        const dir = new g.THREE.Vector3()
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => requestAnimationFrame(r))
          g.camera.getWorldDirection(dir)
          const want = T.clone().sub(g.camera.position).normalize()
          const yawErr = Math.atan2(want.x, want.z) - Math.atan2(dir.x, dir.z)
          g.rig.yaw += Math.atan2(Math.sin(yawErr), Math.cos(yawErr)) * 0.8
          g.rig.pitch = Math.max(-0.75, Math.min(1.4, g.rig.pitch - (Math.asin(want.y) - Math.asin(dir.y)) * 0.35))
        }
      }, b)
      if (attempt === 0) await shot('bell-aim')
      await page.evaluate(() => window.__g.input.press('KeyF'))
      await page.waitForTimeout(4000)
      r = await page.evaluate(() => {
        const g = window.__g
        g.input.release('KeyQ')
        g.input.release('KeyF')
        return { rang: g.finds.has('bell'), order: g.hornOrders.get('t1')?.kind ?? 'none' }
      })
      if (!r.rang) console.log('bell: missed, shooting again')
    }
    await page.evaluate((b) => {
      const g = window.__g
      g.lookFrom([b[0] - 260, g.heightAt(b[0] - 260, b[2] + 160) + 30, b[2] + 160], [b[0], b[1] - 30, b[2]])
    }, b)
    await page.waitForTimeout(800)
    await shot('bell')
    await page.evaluate(() => window.__g.lookFrom(null))
    console.log('bell', JSON.stringify(r))
    if (!r.rang || r.order !== 'look') throw new Error('bell gate failed')
  },
  // Dread: each unexplained thing, begun by hand, seen as a player would.
  async dread() {
    const run = async (kind, setup, look, wait, name) => {
      await page.evaluate(setup)
      await page.waitForTimeout(400)
      const ok = await page.evaluate((k) => window.__g.dreadBegin(k), kind)
      if (look) await page.evaluate(look)
      await page.waitForTimeout(wait)
      await shot(name)
      return ok
    }
    const out = {}
    // The pale walker: at dusk in fog on the Green, looking a little off it (it is at the edge of sight).
    out.walker = await run('walker', () => {
      const g = window.__g
      g.weather.set('overcast', true)
      g.sky.setTime(0.9)
      g.teleport(600, 900)
      g.setCam(0, 0.06, 7)
    }, null, 9000, 'dread-walker')
    // Stare at it: it goes, and you have seen it.
    await page.evaluate(() => {
      const g = window.__g
      const w = g.dread.walker
      g.lookFrom([g.player().x, g.player().y + 1.7, g.player().z], [w.gait.x, w.chest.y, w.gait.z])
    })
    await page.waitForTimeout(6000)
    await page.evaluate(() => window.__g.lookFrom(null))
    // The eyes in the Old Wood at night.
    out.eyes = await run('eyes', () => {
      const g = window.__g
      g.sky.setTime(0.97)
      g.weather.set('clear', true)
      g.teleport(-3300, -1900)
      g.setCam(1, 0.15, 6)
    }, null, 7000, 'dread-eyes')
    // Look at a pair: they close.
    await page.evaluate(() => {
      const g = window.__g
      const e = g.dread.eyes[0]
      g.lookFrom([g.player().x, g.player().y + 1.7, g.player().z], e.position.toArray())
    })
    await page.waitForTimeout(1500)
    await page.evaluate(() => window.__g.lookFrom(null))
    // The footprints at dawn on the Green.
    out.footprints = await run('footprints', () => {
      const g = window.__g
      g.sky.setTime(0.14)
      g.weather.set('clear', true)
      g.teleport(-600, 800)
      g.setCam(0, 0.25, 9)
    }, null, 3000, 'dread-footprints')
    // Look at them from above.
    await page.evaluate(() => {
      const g = window.__g
      const p = g.player()
      g.lookFrom([p.x, p.y + 230, p.z + 260], [p.x, p.y, p.z - 120])
    })
    await page.waitForTimeout(1500)
    await shot('dread-footprints-above')
    await page.evaluate(() => window.__g.lookFrom(null))
    out.stillness = await page.evaluate(() => window.__g.dreadBegin('stillness'))
    await page.waitForTimeout(500)
    const found = await page.evaluate(() => ['strange-walker', 'strange-eyes', 'strange-footprints'].map((id) => `${id}:${window.__g.finds.has(id)}`).join(' '))
    console.log('dread', JSON.stringify(out), found)
    await page.evaluate(() => window.__g.sky.setTime(0.36))
  },
  // Offerings: look at the carving (nothing yet), bring the thing, hold it over the bowl; it answers.
  async offer() {
    await page.evaluate(() => {
      const g = window.__g
      g.weather.set('breaking', true)
      g.finds.find('bag')
    })
    const r = await page.evaluate(async () => {
      const g = window.__g
      const press = async () => {
        g.input.press('KeyE')
        await new Promise((res) => setTimeout(res, 150))
        g.input.release('KeyE')
        await new Promise((res) => setTimeout(res, 120))
      }
      const out = []
      for (const s of g.offerings.shrines) {
        g.teleport(s.at.x + Math.sin(Math.atan2(-s.at.x, -s.at.z)) * 1.8, s.at.z + Math.cos(Math.atan2(-s.at.x, -s.at.z)) * 1.8)
        await new Promise((res) => setTimeout(res, 200))
        await press()
        const before = s.answered
        g.finds.find(s.def.wants)
        await press()
        await new Promise((res) => setTimeout(res, 2000))
        out.push(`${s.def.id}: before ${before}, after ${s.answered}, lore ${g.finds.has(s.def.id)}`)
      }
      return out
    })
    await page.evaluate(() => {
      const g = window.__g
      const s = g.offerings.shrines[g.offerings.shrines.length - 1]
      const a = Math.atan2(-s.at.x, -s.at.z)
      g.lookFrom([s.at.x + Math.sin(a) * 4 + Math.cos(a) * 1.5, s.at.y + 1.8, s.at.z + Math.cos(a) * 4 - Math.sin(a) * 1.5], [s.at.x, s.at.y + 1, s.at.z])
    })
    await page.waitForTimeout(600)
    await shot('offer')
    await page.evaluate(() => window.__g.lookFrom(null))
    console.log(r.join('; '))
    if (r.some((x) => !x.includes('lore true'))) throw new Error('offer gate failed')
  },
  // Weather of the lands: a sandstorm in the Dune Sea, mist at dawn, a rainbow after rain.
  async lands_weather() {
    await page.evaluate(() => {
      const g = window.__g
      g.sky.setTime(0.45)
      g.weather.set('storm', true)
      g.teleport(0, 4600)
      g.setCam(0.3, 0.08, 7)
    })
    await page.waitForTimeout(5000)
    await shot('weather-sandstorm')
    await page.evaluate(() => {
      const g = window.__g
      g.weather.set('clear', true)
      g.sky.setTime(0.17)
      g.teleport(300, 400)
      g.setCam(Math.PI * 0.75, 0.12, 7)
    })
    await page.waitForTimeout(1500)
    await shot('weather-dawn-mist')
    // A rainbow: rain, then the sun comes back low behind you.
    await page.evaluate(async () => {
      const g = window.__g
      g.sky.setTime(0.8)
      g.teleport(300, 400)
      g.weather.set('storm', true)
      await new Promise((r) => setTimeout(r, 600))
      g.weather.set('breaking', true)
      g.weather.now.rain = 0
      g.weather.now.cover = 0.45
      const s = g.sky.sunDir
      g.setCam(Math.atan2(s.x, s.z), -0.05, 7) // facing away from the sun
    })
    await page.waitForTimeout(1500)
    await shot('weather-rainbow')
    await page.evaluate(() => window.__g.sky.setTime(0.36))
  },
  // Small life: fireflies at dusk over the Green, butterflies by day, birds round a giant's head.
  async life() {
    await page.evaluate(() => {
      const g = window.__g
      g.weather.set('clear', true)
      g.sky.setTime(0.925)
      g.teleport(600, 900)
      g.setCam(0.6, 0.18, 6)
    })
    await page.waitForTimeout(1500)
    await shot('life-fireflies')
    await page.evaluate(() => {
      const g = window.__g
      g.sky.setTime(0.4)
      g.teleport(600, 900)
      g.setCam(0.6, 0.05, 4)
    })
    await page.waitForTimeout(1500)
    await shot('life-butterflies')
    // A hare, close: put one in front of the camera and look at it.
    await page.evaluate(() => {
      const g = window.__g
      const h = g.ambience.hareState[0]
      const p = g.player()
      h.x = p.x + 20
      h.z = p.z + 4
      h.run = 0
      g.lookFrom([p.x + 16, g.heightAt(p.x + 16, p.z + 3) + 0.9, p.z + 3], [h.x, g.heightAt(h.x, h.z) + 0.2, h.z])
    })
    await page.waitForTimeout(600)
    await shot('life-hare')
    await page.evaluate(() => window.__g.lookFrom(null))
    await page.evaluate(() => {
      const g = window.__g
      const t = g.titan
      g.teleport(t.gait.x + 500, t.gait.z + 300)
      g.lookFrom([t.gait.x + 500, g.heightAt(t.gait.x + 500, t.gait.z + 300) + 2, t.gait.z + 300], [t.head.x, t.head.y, t.head.z])
    })
    await page.waitForTimeout(1500)
    await shot('life-circlers')
    await page.evaluate(() => {
      window.__g.lookFrom(null)
      window.__g.sky.setTime(0.36)
    })
  },
  // Flight, as physics: a hands-off glide, a dive-and-climb, a stall, and lift off a slope.
  async flight() {
    await page.evaluate(() => {
      window.__g.weather.set('breaking', true)
      for (const id of ['bag', 'cloak']) window.__g.finds.find(id)
    })
    const fly = (keys, ms, at) =>
      page.evaluate(
        async ([keys, ms, at]) => {
          const g = window.__g
          g.wanderer.place(at[0], g.heightAt(at[0], at[2]) + at[1], at[2])
          g.wanderer.yaw = at[3]
          g.wanderer.vel.set(Math.sin(at[3]) * 12, -2, Math.cos(at[3]) * 12)
          g.input.press('Space')
          for (const k of keys) g.input.press(k)
          const x0 = g.player().x
          const z0 = g.player().z
          const y0 = g.player().y
          let minV = 99
          let maxV = 0
          let maxUp = 0
          const t0 = Date.now()
          while (Date.now() - t0 < ms) {
            await new Promise((r) => setTimeout(r, 100))
            minV = Math.min(minV, g.wanderer.airspeed)
            maxV = Math.max(maxV, g.wanderer.airspeed)
            maxUp = Math.max(maxUp, g.wanderer.updraft)
            if (g.player().grounded) break
          }
          for (const k of keys) g.input.release(k)
          g.input.release('Space')
          const p = g.player()
          return { far: Math.round(Math.hypot(p.x - x0, p.z - z0)), dy: Math.round(p.y - y0), secs: ((Date.now() - t0) / 1000).toFixed(1), minV: minV.toFixed(1), maxV: maxV.toFixed(1), up: maxUp.toFixed(1) }
        },
        [keys, ms, at],
      )
    const out = {}
    out.handsOff = await fly([], 25000, [300, 150, 400, 0])
    out.diveAll = await fly(['KeyW'], 25000, [300, 150, 400, 0])
    out.stall = await fly(['KeyS'], 6000, [300, 150, 400, 0])
    // Toward the escarpment at the Green's edge (rising ground ahead): ridge lift.
    out.ridge = await page.evaluate(() => {
      const g = window.__g
      // Find steep rising ground: walk out north from the Sentinel's side till the ground climbs.
      for (let d = 1800; d < 3400; d += 20) {
        const a = g.heightAt(d, 0)
        const b = g.heightAt(d + 40, 0)
        if ((b - a) / 40 > 0.6) return [d - 60, a]
      }
      return null
    })
    if (out.ridge) out.ridgeFlight = await fly([], 8000, [out.ridge[0], 25, 0, Math.PI / 2])
    console.log('flight', JSON.stringify(out))
    // A shot in a bank.
    await page.evaluate(() => {
      const g = window.__g
      g.wanderer.place(300, g.heightAt(300, 400) + 120, 400)
      g.wanderer.vel.set(0, -3, 14)
      g.input.press('Space')
      g.input.press('KeyD')
    })
    await page.waitForTimeout(2200)
    await shot('flight-bank')
    await page.evaluate(() => {
      window.__g.input.release('KeyD')
      window.__g.input.release('Space')
    })
  },
  // The wing-cloak: take it at the top of the Great Stair, step off, and sail down.
  async glide() {
    await page.evaluate(() => {
      window.__g.weather.set('breaking', true)
      window.__g.finds.find('bag')
    })
    const took = await page.evaluate(async () => {
      const g = window.__g
      const c = g.spots.spots.find((s) => s.id === 'cloak')
      g.teleport(c.at.x + 0.6, c.at.z, c.at.y + 0.1)
      await new Promise((r) => setTimeout(r, 200))
      g.input.press('KeyE')
      await new Promise((r) => setTimeout(r, 150))
      g.input.release('KeyE')
      await new Promise((r) => setTimeout(r, 100))
      return g.finds.has('cloak')
    })
    // From 150 m over the Steps, facing back toward the Green: Space and W held.
    const r = await page.evaluate(async () => {
      const g = window.__g
      const c = g.spots.spots.find((s) => s.id === 'cloak')
      const x = c.at.x - 60
      const z = c.at.z
      const y0 = g.heightAt(x, z) + 150
      g.wanderer.place(x, y0, z)
      g.setCam(Math.atan2(x, z), 0.15, 8) // looking toward the centre
      // (Flight is physics now: a run-up, then hands off — W would dive.)
      g.wanderer.vel.set(-Math.sin(Math.atan2(x, z)) * 12, -2, -Math.cos(Math.atan2(x, z)) * 12)
      g.input.press('Space')
      const lines0 = g.narration.lines.length
      let glided = false
      const until = Date.now() + 70000
      let shotAt = 0
      while (Date.now() < until) {
        await new Promise((res) => setTimeout(res, 200))
        if (g.wanderer.gliding) glided = true
        if (!shotAt && glided) shotAt = Date.now()
        if (g.player().grounded) break
      }
      g.input.release('KeyW')
      g.input.release('Space')
      const p = g.player()
      return { glided, flew: Math.round(Math.hypot(p.x - x, p.z - z)), from: Math.round(y0 - p.y), fell: g.narration.lines.slice(lines0).some((l) => /fell|ground came|Darkness|wake/.test(l)) }
    })
    console.log(`took the cloak: ${took}; glided: ${r.glided}; sailed ${r.flew} m coming down ${r.from} m; a fall: ${r.fell}`)
    // And as it looks: off the top of the Sentinel's hood, sailing out over the Green.
    await page.evaluate(() => {
      const g = window.__g
      const s = g.colossi.places.get('sentinel')
      g.wanderer.place(s.x, g.heightAt(s.x, s.z) + 380, s.z + 160)
      g.setCam(Math.PI, 0.32, 9) // looking south, toward the start
      g.input.press('KeyW')
      g.input.press('Space')
    })
    await page.waitForTimeout(4500)
    await shot('glide')
    await page.evaluate(() => {
      window.__g.input.release('KeyW')
      window.__g.input.release('Space')
    })
    if (!took || !r.glided || r.fell || r.flew < 250) throw new Error('glide gate failed')
  },
  // The traveller's trail and the Horn: read the page, take the horn, call the Walker, ride it.
  async horn() {
    await page.evaluate(() => {
      window.__g.weather.set('breaking', true)
      window.__g.finds.find('bag')
    })
    const got = await page.evaluate(async () => {
      const g = window.__g
      const press = async (code) => {
        g.input.press(code)
        await new Promise((r) => setTimeout(r, 150))
        g.input.release(code)
        await new Promise((r) => setTimeout(r, 120))
      }
      const pageSpot = g.spots.spots.find((s) => s.id === 'page-2')
      g.teleport(pageSpot.at.x + 0.6, pageSpot.at.z)
      await new Promise((r) => setTimeout(r, 200))
      await press('KeyE')
      const horn = g.spots.spots.find((s) => s.id === 'horn')
      g.teleport(horn.at.x + 0.6, horn.at.z)
      await new Promise((r) => setTimeout(r, 200))
      await press('KeyE')
      return { page: g.finds.has('page-2'), horn: g.finds.has('horn') }
    })
    await page.evaluate(() => {
      const g = window.__g
      const c = g.travellerCamps?.[0]
      const sp = g.spots.spots.find((s) => s.id === 'page-2')
      g.teleport(sp.at.x + 6, sp.at.z + 5)
      g.setCam(Math.atan2(6, 5), 0.2, 6)
    })
    await page.waitForTimeout(500)
    await shot('horn-camp')
    // Call the Walker from 1.4 km off.
    const call = await page.evaluate(async () => {
      const g = window.__g
      const t = g.titan
      const x = t.gait.x + 1400
      const z = t.gait.z + 300
      g.teleport(x, z)
      const d0 = Math.hypot(t.gait.x - x, t.gait.z - z)
      g.input.press('KeyH')
      await new Promise((r) => setTimeout(r, 150))
      g.input.release('KeyH')
      g.clock.scale = 6
      const until = Date.now() + 40000
      let d = d0
      while (Date.now() < until) {
        await new Promise((r) => setTimeout(r, 250))
        d = Math.hypot(t.gait.x - g.player().x, t.gait.z - g.player().z)
        if (d < t.H * 0.55 && t.gait.speed < 0.5) break
      }
      g.clock.scale = 1
      g.setCam(Math.atan2(g.player().x - t.gait.x, g.player().z - t.gait.z), -0.3, 8)
      return { d0: Math.round(d0), d: Math.round(d), order: g.hornOrders.get('t1')?.kind ?? 'none' }
    })
    await page.waitForTimeout(800)
    await shot('horn-came')
    // Ride it: hold on, blow the horn from its back, look east.
    const ride = await page.evaluate(async () => {
      const g = window.__g
      if (!g.grabTitan()) return { grabbed: false }
      const t = g.titan
      g.setCam(-Math.PI / 2, 0.2, 9) // looking toward +x
      await new Promise((r) => setTimeout(r, 300))
      const x0 = t.gait.x
      const z0 = t.gait.z
      g.input.press('KeyH')
      await new Promise((r) => setTimeout(r, 150))
      g.input.release('KeyH')
      g.clock.scale = 4
      await new Promise((r) => setTimeout(r, 9000))
      g.clock.scale = 1
      return { grabbed: true, moved: [Math.round(t.gait.x - x0), Math.round(t.gait.z - z0)], holding: g.climbState().active }
    })
    // (The riding camera takes over on its own: no setCam.)
    await page.waitForTimeout(600)
    await shot('horn-ride')
    console.log(`page: ${got.page}, horn: ${got.horn}; called from ${call.d0} m → ${call.d} m (order ${call.order}); ride: ${JSON.stringify(ride)}`)
    if (!got.horn || call.d > 300 || !ride.grabbed || ride.moved[0] < 60) throw new Error('horn gate failed')
  },
  // More of play, as a player sees it: aiming from far off (you in the frame), an arrow in the
  // grass, a wisp darting away, the bag and the journal full.
  async play() {
    await page.evaluate(() => {
      const g = window.__g
      g.weather.set('breaking', true)
      g.finds.find('bag')
      g.finds.find('bow')
    })
    const aimAt = (t) =>
      page.evaluate(async (t) => {
        const g = window.__g
        const T = new g.THREE.Vector3(t[0], t[1], t[2])
        const dir = new g.THREE.Vector3()
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => requestAnimationFrame(r))
          g.camera.getWorldDirection(dir)
          const want = T.clone().sub(g.camera.position).normalize()
          const yawErr = Math.atan2(want.x, want.z) - Math.atan2(dir.x, dir.z)
          g.rig.yaw += Math.atan2(Math.sin(yawErr), Math.cos(yawErr)) * 0.8
          g.rig.pitch = Math.max(-0.75, Math.min(1.4, g.rig.pitch - (Math.asin(want.y) - Math.asin(dir.y)) * 0.35))
        }
      }, t)
    // A mesa's eye from 260 m across the sand.
    const tm = await page.evaluate(() => {
      const g = window.__g
      const e = g.eyes.sets.find((s) => s.id === 'eyes-mesa').eyes[2]
      const q = e.at.clone().addScaledVector(e.normal, 260)
      g.teleport(q.x, q.z)
      g.rig.yaw = Math.atan2(q.x - e.at.x, q.z - e.at.z)
      g.input.press('KeyQ')
      return e.at.toArray()
    })
    await page.waitForTimeout(700)
    await aimAt(tm)
    await shot('play-aim-far')
    await page.evaluate(() => window.__g.input.press('KeyF'))
    await page.waitForTimeout(700)
    await shot('play-aim-far-flight')
    await page.evaluate(() => window.__g.input.release('KeyQ'))
    // An arrow into the grass a few metres ahead, then looked at.
    const at = await page.evaluate(() => {
      const g = window.__g
      g.teleport(300, 400)
      g.rig.yaw = 0
      g.input.press('KeyQ')
      return [300, g.heightAt(300, 390), 390]
    })
    await page.waitForTimeout(700)
    await aimAt(at)
    await page.evaluate(() => window.__g.input.press('KeyF'))
    await page.waitForTimeout(800)
    await page.evaluate(() => {
      const g = window.__g
      g.input.release('KeyQ')
      g.lookFrom([302.5, g.heightAt(302.5, 392.5) + 1.2, 392.5], [300, g.heightAt(300, 390) + 0.3, 390])
    })
    await page.waitForTimeout(600)
    await shot('play-arrow-stuck')
    await page.evaluate(() => window.__g.lookFrom(null))
    // A wisp darting away across the dunes.
    await page.evaluate(() => {
      const g = window.__g
      const w = g.wisps.wisps.find((w) => w.def.id === 'wisp-dunes')
      g.teleport(w.pos.x + 10, w.pos.z + 6)
      g.lookFrom([w.pos.x + 18, g.heightAt(w.pos.x + 18, w.pos.z + 14) + 2.5, w.pos.z + 14], [w.path[1].x, w.path[1].y, w.path[1].z])
    })
    await page.waitForTimeout(900)
    await shot('play-wisp-flight')
    await page.evaluate(() => window.__g.lookFrom(null))
    // Everything found: the bag and the journal, full.
    await page.evaluate(() => {
      const g = window.__g
      for (const id of ['bow', 'ring-hood', 'beads-pillar', 'figure-stair', 'key-hall', 'tooth-skull', 'feather-spire', 'coin-arch', 'bell-grove', 'relic-walker', 'relic-herd-1', 'relic-herd-5', 'wisp-green', 'res-wood', 'eyes-sentinel', 'sentinel', 'undercroft', 'grove', 'fallen', 'walker', 'herd', 'lore-knee', 'lore-hall', 'lore-bow', 'lore-walker']) g.finds.find(id)
    })
    await page.waitForTimeout(400)
    await page.keyboard.press('KeyI')
    await page.waitForTimeout(400)
    await shot('play-bag')
    await page.keyboard.press('KeyI')
    await page.keyboard.press('KeyJ')
    await page.waitForTimeout(400)
    await shot('play-journal')
    await page.keyboard.press('KeyJ')
  },
  // The bow: take it from the altar, then close every set of eyes and take what they watched over.
  async bow() {
    await page.evaluate(() => {
      window.__g.weather.set('breaking', true)
      window.__g.finds.find('bag')
    })
    const took = await page.evaluate(async () => {
      const g = window.__g
      const s = g.spots.spots.find((s) => s.id === 'bow')
      g.teleport(s.at.x - 1.2, s.at.z, s.at.y - 1.1)
      await new Promise((r) => setTimeout(r, 200))
      g.input.press('KeyE')
      await new Promise((r) => setTimeout(r, 150))
      g.input.release('KeyE')
      await new Promise((r) => setTimeout(r, 100))
      return g.finds.has('bow')
    })
    console.log(`took the bow: ${took}`)
    // Drawn, in the Undercroft, aiming at the first eye on the pillars.
    await page.evaluate(() => {
      const g = window.__g
      const t = g.eyes.targets()[0]
      g.setCam(Math.atan2(g.player().x - t.x, g.player().z - t.z), -0.35, 6)
      g.input.press('KeyQ')
    })
    await page.waitForTimeout(900)
    await shot('bow-drawn')
    await page.evaluate(() => window.__g.input.release('KeyQ'))
    // The eyes themselves: one on the Sentinel, from the Green below.
    await page.evaluate(() => {
      const g = window.__g
      const e = g.eyes.sets.find((s) => s.id === 'eyes-sentinel').eyes[1]
      const q = e.at.clone().addScaledVector(e.normal, 140)
      const y = g.heightAt(q.x, q.z) + 1.7
      g.teleport(q.x, q.z)
      g.lookFrom([q.x, y, q.z], [e.at.x, e.at.y - 25, e.at.z])
    })
    await page.waitForTimeout(800)
    await shot('bow-eyes')
    await page.evaluate(() => window.__g.lookFrom(null))
    const sets = await page.evaluate(() => window.__g.eyes.sets.map((s) => s.id))
    const report = []
    for (const id of sets) {
      const n = await page.evaluate(async (id) => {
        const g = window.__g
        const set = g.eyes.sets.find((s) => s.id === id)
        let shots = 0
        for (const e of set.eyes) {
          // Stand 35 m out along where the eye looks (on the ground below that point), aim at it, loose.
          // Standing on the ground out along where it looks, as near as a clear shot allows.
          let p = null
          let y = 0
          for (const d of [30, 60, 100, 160, 240, 340, 460]) {
            const q = e.at.clone().addScaledVector(e.normal, d)
            const qy = g.heightAt(q.x, q.z) + 1.7
            const from = new g.THREE.Vector3(q.x, qy, q.z)
            const dir = e.at.clone().sub(from)
            const len = dir.length()
            // (Clear up to the eye's own disc: from below, its rim is met ~3 m short of the middle.)
            if (g.pick(from, dir.normalize(), len + 2) >= len - 3.5) {
              p = q
              y = qy - 1.7
              break
            }
          }
          if (!p) continue
          g.teleport(p.x, p.z, y)
          g.lookFrom([p.x, y + 1.7, p.z], [e.at.x, e.at.y, e.at.z])
          await new Promise((r) => setTimeout(r, 120))
          g.input.press('KeyQ')
          await new Promise((r) => setTimeout(r, 600))
          g.input.press('KeyF')
          await new Promise((r) => setTimeout(r, 100))
          g.input.release('KeyF')
          await new Promise((r) => setTimeout(r, 900))
          g.input.release('KeyQ')
          shots++
        }
        g.lookFrom(null)
        // (A long shot is still in the air: give it time to land.)
        await new Promise((r) => setTimeout(r, 2500))
        return g.eyes.open(id)
      }, id)
      report.push(`${id}: ${n} open`)
    }
    await page.waitForTimeout(2000)
    const got = await page.evaluate(async () => {
      const g = window.__g
      const out = []
      for (const s of g.eyes.sets) {
        const spot = g.spots.spots.find((x) => x.id === s.id)
        g.teleport(spot.at.x + 0.5, spot.at.z)
        await new Promise((r) => setTimeout(r, 150))
        g.input.press('KeyE')
        await new Promise((r) => setTimeout(r, 150))
        g.input.release('KeyE')
        await new Promise((r) => setTimeout(r, 100))
        out.push(`${s.id}:${g.finds.has(s.id) ? 'taken' : 'MISSED'}`)
      }
      return out
    })
    console.log(`eyes left open after shooting — ${report.join(', ')}; ${got.join(' ')}`)
    if (!took || report.some((r) => !r.endsWith(': 0 open')) || got.some((x) => x.endsWith('MISSED'))) throw new Error('bow gate failed')
  },
  // Resonance: strike the stones in the carved order; the slab sinks; take what it kept.
  async resonance() {
    await page.evaluate(() => {
      window.__g.weather.set('breaking', true)
      window.__g.finds.find('bag')
    })
    const ring = await page.evaluate(() => {
      const r = window.__g.resonance.rings[0]
      return { x: r.def.x, z: r.def.z, order: r.def.order }
    })
    await page.evaluate((r) => {
      const g = window.__g
      g.teleport(r.x + 14, r.z + 10)
      g.lookFrom([r.x + 14, g.heightAt(r.x + 14, r.z + 10) + 2.2, r.z + 10], [r.x, g.heightAt(r.x, r.z) + 1.5, r.z])
    }, ring)
    await page.waitForTimeout(800)
    await shot('resonance')
    await page.evaluate(() => window.__g.lookFrom(null))
    const strike = (rank) => page.evaluate(async (rank) => {
      const g = window.__g
      const r = g.resonance.rings[0]
      const s = r.stones.find((s) => s.rank === rank)
      // Stand at it, on the slab's side, and press E.
      const dx = r.def.x - s.at.x
      const dz = r.def.z - s.at.z
      const l = Math.hypot(dx, dz)
      g.teleport(s.at.x + (dx / l) * 1.6, s.at.z + (dz / l) * 1.6)
      await new Promise((res) => setTimeout(res, 150))
      g.input.press('KeyE')
      await new Promise((res) => setTimeout(res, 120))
      g.input.release('KeyE')
      await new Promise((res) => setTimeout(res, 300))
      return r.progress
    }, rank)
    // A wrong first strike resets it; then the right order.
    const wrong = ring.order[1]
    const afterWrong = await strike(wrong)
    const steps = []
    for (const rank of ring.order) steps.push(await strike(rank))
    await page.waitForTimeout(7000)
    const solved = await page.evaluate(() => window.__g.resonance.rings[0].solved)
    await page.evaluate((r) => {
      const g = window.__g
      g.lookFrom([r.x + 9, g.heightAt(r.x + 9, r.z + 7) + 3, r.z + 7], [r.x, g.heightAt(r.x, r.z), r.z])
    }, ring)
    await page.waitForTimeout(500)
    await shot('resonance-solved')
    await page.evaluate(() => window.__g.lookFrom(null))
    const took = await page.evaluate(async (r) => {
      const g = window.__g
      g.teleport(r.x + 0.5, r.z)
      await new Promise((res) => setTimeout(res, 150))
      g.input.press('KeyE')
      await new Promise((res) => setTimeout(res, 120))
      g.input.release('KeyE')
      await new Promise((res) => setTimeout(res, 100))
      return g.finds.has('res-steps')
    }, ring)
    console.log(`wrong strike → progress ${afterWrong}; the order → ${steps.join(',')}; solved: ${solved}; took what it kept: ${took}`)
    if (afterWrong !== 0 || !solved || !took) throw new Error('resonance gate failed')
  },
  // Chase the light: follow a wisp hop by hop to where it settles; take what it leaves.
  async wisp() {
    await page.evaluate(() => {
      window.__g.weather.set('overcast', true)
      window.__g.finds.find('bag')
    })
    const r = await page.evaluate(async () => {
      const g = window.__g
      const w = g.wisps.wisps.find((w) => w.def.id === 'wisp-green')
      const hops = []
      for (let k = 0; k < 40 && !w.done; k++) {
        // Walk up to where it waits (stopping 10 m short), and let it go.
        const p = w.pos
        const back = p.clone().sub(g.player()).setY(0).normalize().multiplyScalar(-10)
        g.teleport(p.x + back.x, p.z + back.z)
        await new Promise((res) => setTimeout(res, 250))
        hops.push(w.i)
        while (w.flying) await new Promise((res) => setTimeout(res, 100))
      }
      return { hops: hops.length, seq: hops.join(","), done: w.done, revealed: !g.spots.spots.find((s) => s.id === 'wisp-green').hidden }
    })
    console.log(`followed the wisp: ${r.hops} approaches (${r.seq}); settled: ${r.done}; revealed: ${r.revealed}`)
    // Look at a wisp waiting (the wood's), from a little way off.
    await page.evaluate(() => {
      const g = window.__g
      const w = g.wisps.wisps.find((w) => w.def.id === 'wisp-wood')
      g.teleport(w.pos.x + 24, w.pos.z + 18)
      g.lookFrom([w.pos.x + 24, g.heightAt(w.pos.x + 24, w.pos.z + 18) + 1.7, w.pos.z + 18], [w.pos.x, w.pos.y, w.pos.z])
    })
    await page.waitForTimeout(800)
    await shot('wisp')
    await page.evaluate(() => window.__g.lookFrom(null))
    const took = await page.evaluate(async () => {
      const g = window.__g
      const s = g.spots.spots.find((s) => s.id === 'wisp-green')
      g.teleport(s.at.x + 0.5, s.at.z)
      await new Promise((res) => setTimeout(res, 150))
      g.input.press('KeyE')
      await new Promise((res) => setTimeout(res, 150))
      g.input.release('KeyE')
      await new Promise((res) => setTimeout(res, 100))
      return g.finds.has('wisp-green')
    })
    console.log(`took what it left: ${took}`)
    if (!r.done || !r.revealed || !took) throw new Error('wisp gate: could not follow it to the end and take what it left')
  },
  // Raiding: climb the Walker to the shrine on its back and take its relic; it shrugs.
  async raid() {
    await page.evaluate(() => window.__g.finds.find('bag'))
    const grabbed = await page.evaluate(() => window.__g.grabTitan())
    if (!grabbed) throw new Error('raid gate: could not grab the foot')
    const r = await page.evaluate(async () => {
      const g = window.__g
      const parts = []
      g.clock.scale = 5
      g.input.press('KeyW')
      const until = Date.now() + 60000
      let shrugged = false
      while (Date.now() < until && !g.finds.has('relic-walker')) {
        const c = g.climbState()
        if (!c.active) break
        if (parts[parts.length - 1] !== c.part) parts.push(c.part)
        // Up the leg to the torso, then over the back to the glyph.
        const next = { footL: ['shinL', 1], shinL: ['thighL', 2], thighL: ['torso', 0] }[c.part]
        let t
        if (next) {
          const p = g.titan.part(next[0])
          t = p.lumps[next[1]].c.clone().applyMatrix4(p.mesh.matrixWorld)
        } else {
          t = g.titan.group.getObjectByName('glyph').getWorldPosition(new g.THREE.Vector3())
        }
        if (Math.hypot(c.x - t.x, c.z - t.z) < 4) t = g.titan.pelvis
        g.setCam(Math.atan2(c.x - t.x, c.z - t.z), 0.15)
        await new Promise((res) => setTimeout(res, 60))
      }
      shrugged = g.titan.shrugging
      g.input.release('KeyW')
      g.clock.scale = 1
      return { parts, got: g.finds.has('relic-walker'), shrugged, height: +g.climbState().height.toFixed(0) }
    })
    console.log(`climbed ${r.parts.join(' → ')}; relic taken: ${r.got}; it shrugged: ${r.shrugged}; at ${r.height} m`)
    await page.evaluate(() => window.__g.setCam(window.__g.rig.yaw, 0.45, 14))
    await page.waitForTimeout(1500)
    await shot('raid')
    if (!r.got) throw new Error('raid gate: the relic was not taken')
  },
  // Words on stone and trinkets on high places: every one placed sensibly, readable, takeable.
  async spots() {
    await page.waitForFunction(() => window.__g.rocks.formations.filter((f) => f.always).every((f) => f.mesh), null, { timeout: 180000 })
    await page.evaluate(() => window.__g.weather.set('clear', true))
    const list = await page.evaluate(() => window.__g.spots.spots.map((s) => ({ id: s.id, kind: s.kind, x: Math.round(s.at.x), y: +s.at.y.toFixed(1), z: Math.round(s.at.z), ground: +window.__g.heightAt(s.at.x, s.at.z).toFixed(1) })))
    for (const s of list) console.log(`${s.kind.padEnd(7)} ${s.id.padEnd(15)} (${s.x}, ${s.y}, ${s.z})  ${s.y - s.ground > 3 ? `${(s.y - s.ground).toFixed(0)} m up` : 'on the ground'}`)
    // A stone up close, then read it.
    await page.evaluate(() => {
      const g = window.__g
      const s = g.spots.spots.find((s) => s.id === 'lore-knee')
      g.teleport(s.at.x + 2, s.at.z + 1.5)
      g.setCam(Math.atan2(2, 1.5) + 0.4, 0.15, 4)
    })
    await page.waitForTimeout(600)
    await shot('spots-stone')
    await page.evaluate(() => window.__g.input.press('KeyE'))
    await page.waitForTimeout(200)
    await page.evaluate(() => window.__g.input.release('KeyE'))
    await page.waitForTimeout(1800)
    await shot('spots-stone-read')
    // A trinket's glint from the ground below and some way off.
    await page.evaluate(() => {
      const g = window.__g
      const s = g.spots.spots.find((s) => s.id === 'coin-arch') ?? g.spots.spots.find((s) => s.kind === 'trinket')
      const x = s.at.x + 260
      const z = s.at.z + 180
      g.teleport(x, z)
      g.lookFrom([x, g.heightAt(x, z) + 1.7, z], [s.at.x, s.at.y, s.at.z])
    })
    await page.waitForTimeout(1200)
    await shot('spots-glint')
    await page.evaluate(() => window.__g.lookFrom(null))
    // Every trinket: stand on it (with the bag) and take it.
    const took = await page.evaluate(async () => {
      const g = window.__g
      g.finds.find('bag')
      const out = []
      for (const s of g.spots.spots.filter((s) => s.kind === 'trinket' && !s.hidden)) {
        // (Lighting the first cairn wakes something far off a few seconds later, and you watch:
        // input waits while it plays.)
        while (g.awakening.active) await new Promise((r) => setTimeout(r, 200))
        g.teleport(s.at.x + 0.6, s.at.z, s.at.y + 0.1)
        await new Promise((r) => setTimeout(r, 120))
        // (Twice: where a cairn stands beside it, the first E lights the cairn.)
        for (let k = 0; k < 4 && !g.finds.has(s.id); k++) {
          // (It may begin on its timer while we are here.)
          while (g.awakening.active) await new Promise((r) => setTimeout(r, 200))
          g.input.press('KeyE')
          await new Promise((r) => setTimeout(r, 120))
          g.input.release('KeyE')
          await new Promise((r) => setTimeout(r, 80))
        }
        out.push(`${s.id}:${g.finds.has(s.id) ? 'taken' : 'MISSED'}`)
      }
      return out
    })
    console.log(took.join(' '))
    await page.keyboard.press('KeyI')
    await page.waitForTimeout(300)
    await shot('spots-bag')
    await page.keyboard.press('KeyI')
    if (took.some((t) => t.endsWith('MISSED'))) throw new Error('spots gate: a trinket could not be taken')
  },
  // The bag: the camp ahead of the start, taking it, looking in it.
  async bag() {
    await page.evaluate(() => window.__g.weather.set('breaking', true))
    // From the start, facing north: the red cloth should catch the eye.
    await page.evaluate(() => {
      const g = window.__g
      g.teleport(0, 0)
      g.setCam(0, 0.1, 7)
    })
    await shot('bag-from-start')
    const before = await page.evaluate(() => {
      const g = window.__g
      g.bag.toggle() // no bag yet: nothing opens
      return g.bag.open
    })
    // At the camp.
    await page.evaluate(() => {
      const g = window.__g
      const c = g.camp
      g.teleport(c.bagAt.x + 2.2, c.bagAt.z + 1.2)
      g.setCam(Math.atan2(2.2, 1.2), 0.25, 5)
    })
    await page.waitForTimeout(800)
    await shot('bag-camp')
    await page.evaluate(() => window.__g.input.press('KeyE'))
    await page.waitForTimeout(300)
    await page.evaluate(() => window.__g.input.release('KeyE'))
    await page.waitForFunction(() => window.__g.finds.has('bag'), null, { timeout: 5000 })
    await page.waitForTimeout(1500)
    await shot('bag-taken')
    await page.keyboard.press('KeyI')
    await page.waitForTimeout(300)
    await shot('bag-open')
    const open = await page.evaluate(() => window.__g.bag.open)
    await page.keyboard.press('KeyI')
    console.log(`before the bag, I opened: ${before}; took it: true; then I opened: ${open}`)
    if (before || !open) throw new Error('bag gate: the bag should open only once found')
  },
  // Discovery: walking up to places finds them; the card rises; the journal lists them.
  async discover() {
    await page.evaluate(() => window.__g.weather.set('breaking', true))
    const start = await page.evaluate(() => window.__g.finds.count)
    // To the Sentinel's feet.
    await page.evaluate(() => {
      const g = window.__g
      const s = g.colossi.places.get('sentinel')
      g.teleport(s.x + 300, s.z + 300)
      g.setCam(Math.atan2(300, 300), 0.12, 7)
    })
    await page.waitForFunction(() => window.__g.finds.has('sentinel'), null, { timeout: 20000 })
    await page.waitForTimeout(1600)
    await shot('discover-card')
    await page.keyboard.press('KeyJ')
    await page.waitForTimeout(300)
    await shot('discover-journal')
    await page.keyboard.press('KeyJ')
    const end = await page.evaluate(() => ({ n: window.__g.finds.count, ids: window.__g.finds.save() }))
    console.log(`found ${start} → ${end.n}: ${end.ids.join(', ')}`)
    if (!end.ids.includes('green') || !end.ids.includes('sentinel')) throw new Error('discover gate: the Green and the Sentinel should be found')
  },
  // The giant trees, together: from the forest's edge, and from among them.
  async forest() {
    await page.waitForFunction(() => window.__g.rocks.formations.filter((f) => f.kind === 'trunk').every((f) => f.mesh), null, { timeout: 180000 })
    await page.evaluate(() => window.__g.weather.set('breaking', true))
    const views = [
      // From the Green, 2.4 km out from the forest's middle, looking at it.
      ['edge', 2400, 2.5, 0.06],
      // Among them.
      ['among', 350, 2.5, 0.35],
    ]
    for (const [name, back, up, tilt] of views) {
      await page.evaluate(([back, up, tilt]) => {
        const g = window.__g
        const cx = -0.866 * 4300
        const cz = -0.5 * 4300
        // From the centre's side of it, looking out at it.
        const x = cx + 0.866 * back
        const z = cz + 0.5 * back
        g.teleport(x, z)
        const h = g.heightAt(x, z)
        g.lookFrom([x, h + up, z], [cx, h + up + back * tilt + 120, cz])
      }, [back, up, tilt])
      await shot(`forest-${name}`)
    }
    await page.evaluate(() => window.__g.lookFrom(null))
  },
  // The herd: smaller giants roaming the eastern Dune Sea together.
  async herd() {
    await page.evaluate(() => {
      window.__g.setWild(true)
      window.__g.weather.set('clear', true)
    })
    // [name, distance, camera height above the ground, aim height up them (×H of the biggest)]
    const views = [
      ['far', 1700, 140, 0.4],
      ['near', 480, 20, 0.6],
    ]
    const start = await page.evaluate(() => window.__g.herd.centre().toArray())
    for (const [name, dist, high, up] of views) {
      await page.evaluate(([dist, high, up]) => {
        const g = window.__g
        const c = g.herd.centre()
        // From the west, looking east across them.
        const x = c.x - dist
        const z = c.y + dist * 0.3
        g.teleport(x, z)
        const h = g.heightAt(x, z)
        g.lookFrom([x, h + high, z], [c.x, g.heightAt(c.x, c.y) + 190 * up, c.y])
      }, [dist, high, up])
      await shot(`herd-${name}`)
    }
    await page.evaluate(() => window.__g.lookFrom(null))
    await new Promise((r) => setTimeout(r, 25000))
    const end = await page.evaluate(() => window.__g.herd.centre().toArray())
    const spread = await page.evaluate(() => {
      const gs = window.__g.herd.giants
      let min = Infinity
      for (const a of gs) for (const b of gs) if (a !== b) min = Math.min(min, Math.hypot(a.gait.x - b.gait.x, a.gait.z - b.gait.z))
      return Math.round(min)
    })
    console.log(`herd moved ${Math.round(Math.hypot(end[0] - start[0], end[1] - start[1]))} m in 25 s; closest pair ${spread} m apart`)
  },
  // An awakening: a colossus beyond the mountains moves, and the camera is taken to watch it.
  async awakening() {
    await page.evaluate(() => {
      const g = window.__g
      g.weather.set('breaking', true)
      const t = g.farGiants[0].gait
      // Standing on open ground in the valley, looking roughly toward it.
      const x = -t.x * 0.04
      const z = -t.z * 0.04
      g.teleport(x, z)
      g.rig.yaw = Math.atan2(t.x - x, t.z - z) + Math.PI
    })
    await settle(60)
    await shot('awakening-0-before')
    await page.evaluate(() => window.__g.awakening.begin(window.__g.camera))
    for (const at of [2.5, 6, 12, 18, 24, 31]) {
      await page.waitForFunction((at) => (window.__g.awakening.t ?? 99) >= at, at, { timeout: 120000 })
      await shot(`awakening-${String(at).replace('.', '_')}`)
    }
    console.log('stepped:', await page.evaluate(() => window.__g.awakening.stepped))
    await page.waitForFunction(() => !window.__g.awakening.active, null, { timeout: 60000 })
    await settle(20)
    await shot('awakening-after')
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
        // (The lands were spread 2.6x when the world grew: the Dune Sea starts past 2.4 km.)
        for (let r = land === 'valley' ? 650 : 900; r <= (land === 'valley' ? 1000 : 6000); r += land === 'valley' ? 70 : 150) {
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
      ['valley', 300, 150],
      ['forest', -3720, -2150],
      ['desert', 0, 4600],
      ['ruins', 3720, -2150],
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
  // The long run: a held sprint over the Green lengthens into ~14 m/s.
  async run() {
    await page.evaluate(() => {
      const g = window.__g
      g.teleport(0, 0)
      // East, across the open Green.
      g.setCam(-Math.PI / 2, 0.12, 6)
      g.input.press('KeyW')
      g.input.press('ShiftLeft')
    })
    const samples = []
    for (let i = 0; i < 12; i++) {
      const a = await page.evaluate(() => window.__g.player())
      await page.waitForTimeout(1000)
      const b = await page.evaluate(() => window.__g.player())
      samples.push(Math.hypot(b.x - a.x, b.z - a.z))
      if (i === 10) await shot('run-long')
    }
    const lope = await page.evaluate(() => window.__g.wanderer.lope)
    await page.evaluate(() => { window.__g.input.release('KeyW'); window.__g.input.release('ShiftLeft') })
    console.log(`speeds (m/s): ${samples.map((v) => v.toFixed(1)).join(' ')}; lope ${lope.toFixed(2)}`)
    if (Math.max(...samples) < 12) throw new Error('run gate: the long run never came')
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
    // And while it walks, standing on its back: the riding camera (no setCam).
    await page.evaluate(() => {
      window.__g.autopilot.forward = 1
    })
    await page.waitForTimeout(7000)
    await shot('p8-riding')
    await page.evaluate(() => {
      window.__g.autopilot.forward = 0
    })
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
