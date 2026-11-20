// A player's-eye tour for reviewing by eye (the user, 2026-11-06: checks are not enough — review
// hundreds of screenshots again and again). Spots across every land and at every colossus, each shot
// from the game's own camera behind the wanderer and from a second angle, at times and weathers
// spread over the tour. The HUD's text is hidden (the world is what is reviewed); the HUD itself is
// reviewed by its own shots. Writes <out>/tour-NNN-<tag>.png and <out>/tour.json (what each shot is).
//   node tools/tour.mjs <out> [count=40] [seed=1]
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { loadavg } from 'node:os'
const OUT = process.argv[2] ?? 'shots/tour'
const COUNT = +(process.argv[3] ?? 40)
const SEED = +(process.argv[4] ?? 1)
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch(process.env.TOUR_HEADED ? { channel: 'chrome', headless: true, args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--mute-audio'] } : { channel: 'chrome', headless: true, args: ['--mute-audio', '--use-gl=angle', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto(`${process.env.TITANS_URL ?? 'http://localhost:4317'}/?offline`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__g && window.__g.ready === true', null, { timeout: 240000 })
await page.addStyleTag({ content: '#narration, #tips, #hint, #found, #role { display: none !important; }' })
const spots = await page.evaluate(([count, seed, LANDS_ONLY]) => {
  const g = window.__g
  let s = seed * 9301 + 49297
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
  const out = []
  // (TOUR_LANDS_ONLY=1: skip the colossi — reviewed every tour — and go straight to the random spots.)
  if (!LANDS_ONLY) for (const [name, p] of g.colossi.places) out.push({ tag: 'colossus-' + name, x: p.x + 40, z: p.z + 40 })
  let tries = 0
  while (out.length < count + (LANDS_ONLY ? 0 : g.colossi.places.size) && tries++ < 4000) {
    const a = rnd() * Math.PI * 2, r = 200 + rnd() * 5200
    const x = Math.sin(a) * r, z = Math.cos(a) * r
    const land = g.terrain.base.regions.name(x, z)
    if (!land || land === 'sea') continue
    if (g.heightAt(x, z) < -60) continue
    out.push({ tag: land, x, z })
  }
  return out
}, [COUNT, SEED, !!process.env.TOUR_LANDS_ONLY])
// (TOUR_NIGHT=1: the same spots by night, dusk and dawn.)
// (TOUR_GOLDEN=1: the sun low, just after sunrise and before sunset — the day runs 0.1 … 0.9.)
const TIMES = process.env.TOUR_NIGHT ? [0.95, 0.02, 0.9, 0.1, 0.98, 0.06] : process.env.TOUR_GOLDEN ? [0.12, 0.86, 0.14, 0.88, 0.13, 0.85] : [0.3, 0.42, 0.55, 0.68, 0.74, 0.36, 0.5, 0.62]
// (TOUR_WEATHER=storm: every spot in that weather.)
const WEATHER = process.env.TOUR_WEATHER ? [process.env.TOUR_WEATHER] : ['clear', 'clear', 'breaking', 'clear', 'overcast', 'clear', 'storm', 'clear']
const log = []
let n = 0
// (TOUR_ONLY=70: only that shot, with the console and the camera's state — to chase one bad frame.)
const ONLY = process.env.TOUR_ONLY ? +process.env.TOUR_ONLY : -1
async function hunt(box) {
    // Which object is it? Hide each of the scene's children in turn and see which takes the dark
    // patch at the given screen box (x0,y0,x1,y1 in pixels) away.
    const [x0, y0, x1, y1] = box.split(',').map(Number)
    let shotN = 0
    const dark = async () => { const b = await page.screenshot({ path: `${OUT}/hunt-${String(shotN++).padStart(3, '0')}.png`, clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } }); return b }
    const { PNG } = await import('pngjs').catch(() => ({ PNG: null }))
    const lum = (buf) => { if (!PNG) return buf.length; const p = PNG.sync.read(buf); let n = 0; for (let i = 0; i < p.data.length; i += 4) if (p.data[i] + p.data[i + 1] + p.data[i + 2] < 90) n++; return n }
    const base0 = lum(await dark())
    const ROOT = process.env.TOUR_HUNT_IN ? +process.env.TOUR_HUNT_IN : -1
    const n = await page.evaluate((R) => (R === -2 ? window.__g.softScene : R >= 0 ? window.__g.scene.children[R] : window.__g.scene).children.length, ROOT)
    const res = []
    for (let i = 0; i < n; i++) {
      const name = await page.evaluate(([i, R]) => { const g = window.__g, c = (R === -2 ? g.softScene : R >= 0 ? g.scene.children[R] : g.scene).children[i]; c.userData.v0 = c.visible; c.visible = false; g.frames(1, 0); let kind = ''; for (const [k, m] of Object.entries(g.vegetation?.meshes ?? {})) if (m === c) kind = k; return (c.name || c.type) + ':' + (c.children?.length ?? 0) + ':' + kind + ':' + (c.geometry?.getAttribute('position')?.count ?? '') }, [i, ROOT])
      const d = lum(await dark())
      await page.evaluate(([i, R]) => { const g = window.__g, c = (R === -2 ? g.softScene : R >= 0 ? g.scene.children[R] : g.scene).children[i]; c.visible = c.userData.v0 }, [i, ROOT])
      res.push([i, name])
    }
    console.log('hunt:', JSON.stringify(res))
  }
if (ONLY >= 0) page.on('console', (m) => console.log('console:', m.type(), m.text().slice(0, 300)))
// (Paced: each spot's world builds at 3-4 cores, and 84 back to back pushed the machine's load past 25
// — the load guard killed the run. Before each spot, wait until the 1-minute load is under TOUR_LOAD.)
const LOAD_CAP = +(process.env.TOUR_LOAD ?? 14)
const cool = async () => { for (let k = 0; k < 60 && loadavg()[0] >= LOAD_CAP; k++) await new Promise((r) => setTimeout(r, 5000)) }
for (const [i, sp] of spots.entries()) {
  await cool()
  if (ONLY >= 0 && i !== ONLY) { n++; continue }
  const t = TIMES[i % TIMES.length]
  const w = WEATHER[(i * 3) % WEATHER.length]
  const where = await page.evaluate(async ([sp, t, w]) => {
    const g = window.__g
    g.weather.set(w, true)
    g.sky.setTime(t)
    g.teleport(sp.x, sp.z)
    // (Until the land there is built: a long jump shows the old coarse cover for a second or two —
    // a flat pale sheet of fog under the grass, which a review then reads as a defect. Tour 1118.)
    for (let k = 0; k < 190 && !g.terrainView.settled(); k++) await new Promise((r) => setTimeout(r, 80))
    g.wanderer.yaw = ((sp.x * 12.9898 + sp.z * 78.233) % 6.283 + 6.283) % 6.283 // (from the spot: the same view each run)
    g.setCam(g.wanderer.yaw + Math.PI, 0.18, 7)
    // Walk a few steps, so the body is in its stride and the camera has followed.
    g.input.press('KeyW')
    await new Promise((r) => setTimeout(r, 900))
    g.input.release('KeyW')
    await new Promise((r) => setTimeout(r, 2200))
    // (And again after the walk: a few steps off a terrace edge dropped into land not yet built, and the
    // shot caught the old coarse cover there — a white hole with grass floating on it, tour 1119a spot 12.)
    for (let k = 0; k < 100 && !g.terrainView.settled(); k++) await new Promise((r) => setTimeout(r, 80))
    const p = g.wanderer.pos
    return { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z), land: g.terrain.base.regions.name(p.x, p.z), swimming: g.wanderer.swimming, skyline: +(+g.skyline).toFixed(2) }
  }, [sp, t, w])
  const base = `${OUT}/tour-${String(n).padStart(3, '0')}-${sp.tag}`
  // (A fall while settling in — dropped at a terrace's lip — blacks the screen out for its 1.8 s; a
  // shot then is the fade, not the land. Wait it out.)
  // (Still in the air — walked off a terrace lip, the blackout only starts on landing: a shot then is
  // the fall, the camera looking down the cliff at a speck, tour 1118e spot 9. Wait for the ground.)
  await page.waitForFunction(() => { const w = window.__g.wanderer; return w.grounded || w.swimming || w.gliding || window.__g.climbState?.().active }, null, { timeout: 6000 }).catch(() => {})
  const fell = await page.evaluate(() => window.__g.fallState.blackout > 0)
  await page.waitForFunction(() => !(window.__g.fallState.blackout > 0), null, { timeout: 8000 }).catch(() => {})
  // (And the fade back in, and getting up off the ground.)
  if (fell) await page.waitForTimeout(2500)
  await page.screenshot({ path: `${base}-a.png` })
  if (ONLY >= 0) console.log('atA:', JSON.stringify(await page.evaluate(() => { const g = window.__g, c = g.camera.position, w = g.wanderer; return { fall: g.fallState, fade: document.getElementById('fade')?.className, cam: [c.x, c.y, c.z].map((v) => +v.toFixed(1)), pos: [w.pos.x, w.pos.y, w.pos.z].map((v) => +v.toFixed(1)), ground: +g.terrain.heightAt(w.pos.x, w.pos.z).toFixed(1), swim: w.swimming, glide: w.gliding, climb: g.climbState && g.climbState() } })))
  // (TOUR_HUNT_AT=n: hunt at that spot in a full run — for what only shows after the spots before it.)
  if ((ONLY >= 0 || +(process.env.TOUR_HUNT_AT ?? -1) === i) && process.env.TOUR_HUNT_A) await hunt(process.env.TOUR_HUNT_A)
  if (ONLY >= 0 && process.env.TOUR_TOGGLES_A) {
    for (const k of ['noao', 'noshadow']) {
      await page.evaluate((k) => { const g = window.__g; g.aoSwitch.on = k !== 'noao'; g.renderer.shadowMap.enabled = k !== 'noshadow'; g.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true }); g.frames(1, 0) }, k)
      await page.screenshot({ path: `${base}-a-${k}.png` })
    }
    await page.evaluate(() => { const g = window.__g; g.aoSwitch.on = true; g.renderer.shadowMap.enabled = true; g.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true }) })
  }
  if (ONLY >= 0 && process.env.TOUR_RAY_A) console.log('rayA:', JSON.stringify(await page.evaluate((uv) => {
    const g = window.__g, T = g.THREE, rc = new T.Raycaster(); rc.setFromCamera(new T.Vector2(uv[0], uv[1]), g.camera)
    return rc.intersectObjects(g.scene.children, true).slice(0, 6).map((h) => { const o = h.object; if (!o) return null; const at = [h.point.x, h.point.y, h.point.z].map((v) => +v.toFixed(1)); console.log("hitAt", JSON.stringify(at)); let kind = null; if (g.veg) for (const [k, m] of Object.entries(g.veg.meshes ?? {})) if (m === o) kind = k; return { name: o.name || o.type, kind, count: o.count, d: +h.distance.toFixed(1), mat: o.material && (o.material.name || o.material.type), inst: h.instanceId, icol: o.instanceColor && h.instanceId !== undefined ? [0, 1, 2].map((c) => +o.instanceColor.array[h.instanceId * 3 + c].toFixed(2)) : null, vcol: !!(o.geometry && o.geometry.getAttribute('color')), verts: o.geometry && o.geometry.getAttribute('position').count } })
  }, process.env.TOUR_RAY_A.split(',').map(Number))))
  // The second look: from the side and higher, the land around and what stands in it.
  await page.evaluate(() => { const g = window.__g; g.setCam(g.rig.yaw + 1.9, 0.42, 22) })
  if (ONLY >= 0) {
    // (Watching it frame by frame: the first frame anything goes off.)
    const trace = await page.evaluate(async () => {
      const g = window.__g, w = g.wanderer, out = []
      const P = w.pos
      for (const m of ['set', 'copy', 'add', 'addScaledVector', 'setX', 'setZ', 'lerp']) { const o = P[m].bind(P); P[m] = (...a) => { const bx = P.x, bz = P.z; const r = o(...a); if (Math.hypot(P.x - bx, P.z - bz) > 50) out.push(['jump', m, [bx, bz].map(Math.round), new Error().stack.split('\n').slice(1, 7).join(' | ')]); return r } }
      { const o = w.place.bind(w); w.place = (x, y, z) => { if (Math.hypot(x - P.x, z - P.z) > 50) out.push(['place', [x, y, z].map(Math.round), new Error().stack.split('\n').slice(1, 7).join(' | ')]); return o(x, y, z) } }
      const say = g.narration.say.bind(g.narration); g.narration.say = (t, ...a) => { out.push(['say', t, JSON.stringify(g.fallState), +w.pos.y.toFixed(1)]); return say(t, ...a) }
      for (let i = 0; i < 70; i++) {
        await new Promise((r) => requestAnimationFrame(r))
        const c = g.camera.position, p = w.pos
        out.push([i, +p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1), +c.x.toFixed(1), +c.y.toFixed(1), +c.z.toFixed(1), +(+g.rig.dist).toFixed(2), w.grounded, w.gliding, w.sledding, g.fallState.fallTop])
      }
      return out
    })
    const pick = trace.filter((t, k) => typeof t[0] === 'string' || k === 0 || k === trace.length - 1 || Math.abs(t[1] - (trace[k - 1][1] ?? t[1])) > 5 || Math.abs(t[4] - (trace[k - 1][4] ?? t[4])) > 5 || ![t[1], t[4]].every(Number.isFinite))
    console.log('trace:', JSON.stringify(pick.slice(0, 12)))
  }
  await page.waitForTimeout(1200 + (+process.env.TOUR_WAIT_B || 0))
  await page.screenshot({ path: `${base}-b.png` })
  if (ONLY >= 0 && process.env.TOUR_EVAL_B) {
    // Each expression evaluated in the page, then the second shot again (TOUR_EVAL_B="a;;b").
    let k = 0
    for (const src of process.env.TOUR_EVAL_B.split(';;')) {
      await page.evaluate((src) => { const g = window.__g; new Function('g', src)(g); g.frames(1, 0) }, src)
      await page.screenshot({ path: `${base}-b-eval${k++}.png` })
    }
  }
  if (ONLY >= 0 && process.env.TOUR_HUNT_B) await hunt(process.env.TOUR_HUNT_B)
  if (ONLY >= 0 && process.env.TOUR_TOGGLES) {
    for (const k of ['noao', 'noshadow', 'both']) {
      await page.evaluate((k) => { const g = window.__g; g.aoSwitch.on = k === 'noshadow'; g.renderer.shadowMap.enabled = k === 'noao'; g.scene.traverse((o) => { if (o.material && o.material.needsUpdate !== undefined && o.name.startsWith('rock')) o.material.needsUpdate = true }); g.frames(1, 0) }, k)
      await page.screenshot({ path: `${base}-${k}.png` })
    }
    await page.evaluate(() => { const g = window.__g; g.aoSwitch.on = true; g.renderer.shadowMap.enabled = true })
  }
  if (ONLY >= 0 && process.env.TOUR_RAY_A) { await page.evaluate(() => {}); }
  if (ONLY >= 0 && process.env.TOUR_RAY) console.log('ray:', JSON.stringify(await page.evaluate((uv) => {
    const g = window.__g, T = g.THREE, rc = new T.Raycaster(); rc.setFromCamera(new T.Vector2(uv[0], uv[1]), g.camera)
    return rc.intersectObjects(g.scene.children, true).slice(0, 5).map((h) => ({ idx: h.object.parent ? h.object.parent.children.indexOf(h.object) : -1, ud: JSON.stringify(h.object.userData).slice(0, 120), verts: h.object.geometry?.getAttribute("position")?.count, at: [h.point.x, h.point.y, h.point.z].map((v) => +v.toFixed(1)), facing: h.face ? +h.face.normal.clone().transformDirection(h.object.matrixWorld).dot(rc.ray.direction).toFixed(2) : null, sdfCam: g.rocks.inside ? g.rocks.inside(g.camera.position) : 'n/a', name: h.object.name || h.object.type, parent: h.object.parent && h.object.parent.name, d: +h.distance.toFixed(1), mat: h.object.material && (h.object.material.name || h.object.material.type), vis: h.object.visible }))
  }, process.env.TOUR_RAY.split(',').map(Number))))
  if (ONLY >= 0) console.log(JSON.stringify(await page.evaluate(() => { const g = window.__g, c = g.camera.position, p = g.wanderer.pos; return { cam: [c.x, c.y, c.z].map((v) => +v.toFixed(2)), pos: [p.x, p.y, p.z].map((v) => +v.toFixed(2)), ground: +g.terrain.heightAt(c.x, c.z).toFixed(2), rockTop: g.rocks.topAt(c.x, c.z), rig: [g.rig.yaw, g.rig.pitch, g.rig.dist].map((v) => +(+v).toFixed(3)), inHallish: false } })))
  log.push({ n, tag: sp.tag, time: t, weather: w, ...where })
  n++
}
writeFileSync(`${OUT}/tour.json`, JSON.stringify({ errors: errs, shots: log }, null, 1))
console.log(`${n} spots, ${n * 2} shots; errors: ${errs.length ? errs.join(' | ') : 'none'}`)
await browser.close()
