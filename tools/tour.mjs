// A player's-eye tour for reviewing by eye (the user, 2026-11-06: checks are not enough — review
// hundreds of screenshots again and again). Spots across every land and at every colossus, each shot
// from the game's own camera behind the wanderer and from a second angle, at times and weathers
// spread over the tour. The HUD's text is hidden (the world is what is reviewed); the HUD itself is
// reviewed by its own shots. Writes <out>/tour-NNN-<tag>.png and <out>/tour.json (what each shot is).
//   node tools/tour.mjs <out> [count=40] [seed=1]
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
const OUT = process.argv[2] ?? 'shots/tour'
const COUNT = +(process.argv[3] ?? 40)
const SEED = +(process.argv[4] ?? 1)
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto(`${process.env.TITANS_URL ?? 'http://localhost:4317'}/?offline`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__g && window.__g.ready === true', null, { timeout: 240000 })
await page.addStyleTag({ content: '#narration, #tips, #hint, #found, #role { display: none !important; }' })
const spots = await page.evaluate(([count, seed]) => {
  const g = window.__g
  let s = seed * 9301 + 49297
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
  const out = []
  for (const [name, p] of g.colossi.places) out.push({ tag: 'colossus-' + name, x: p.x + 40, z: p.z + 40 })
  let tries = 0
  while (out.length < count + g.colossi.places.size && tries++ < 4000) {
    const a = rnd() * Math.PI * 2, r = 200 + rnd() * 5200
    const x = Math.sin(a) * r, z = Math.cos(a) * r
    const land = g.terrain.base.regions.name(x, z)
    if (!land || land === 'sea') continue
    if (g.heightAt(x, z) < -60) continue
    out.push({ tag: land, x, z })
  }
  return out
}, [COUNT, SEED])
// (TOUR_NIGHT=1: the same spots by night, dusk and dawn.)
const TIMES = process.env.TOUR_NIGHT ? [0.95, 0.02, 0.9, 0.1, 0.98, 0.06] : [0.3, 0.42, 0.55, 0.68, 0.74, 0.36, 0.5, 0.62]
// (TOUR_WEATHER=storm: every spot in that weather.)
const WEATHER = process.env.TOUR_WEATHER ? [process.env.TOUR_WEATHER] : ['clear', 'clear', 'breaking', 'clear', 'overcast', 'clear', 'storm', 'clear']
const log = []
let n = 0
for (const [i, sp] of spots.entries()) {
  const t = TIMES[i % TIMES.length]
  const w = WEATHER[(i * 3) % WEATHER.length]
  const where = await page.evaluate(async ([sp, t, w]) => {
    const g = window.__g
    g.weather.set(w, true)
    g.sky.setTime(t)
    g.teleport(sp.x, sp.z)
    g.wanderer.yaw = ((sp.x * 12.9898 + sp.z * 78.233) % 6.283 + 6.283) % 6.283 // (from the spot: the same view each run)
    g.setCam(g.wanderer.yaw + Math.PI, 0.18, 7)
    // Walk a few steps, so the body is in its stride and the camera has followed.
    g.input.press('KeyW')
    await new Promise((r) => setTimeout(r, 900))
    g.input.release('KeyW')
    await new Promise((r) => setTimeout(r, 2200))
    const p = g.wanderer.pos
    return { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z), land: g.terrain.base.regions.name(p.x, p.z), swimming: g.wanderer.swimming }
  }, [sp, t, w])
  const base = `${OUT}/tour-${String(n).padStart(3, '0')}-${sp.tag}`
  await page.screenshot({ path: `${base}-a.png` })
  // The second look: from the side and higher, the land around and what stands in it.
  await page.evaluate(() => { const g = window.__g; g.setCam(g.rig.yaw + 1.9, 0.42, 22) })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${base}-b.png` })
  log.push({ n, tag: sp.tag, time: t, weather: w, ...where })
  n++
}
writeFileSync(`${OUT}/tour.json`, JSON.stringify({ errors: errs, shots: log }, null, 1))
console.log(`${n} spots, ${n * 2} shots; errors: ${errs.length ? errs.join(' | ') : 'none'}`)
await browser.close()
