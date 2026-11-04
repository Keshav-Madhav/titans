// Playtest clips: short scenes played with real keys and mouse (Playwright's keyboard and
// mouse, as a player would press them), each recorded to video, with its frame times, draw
// calls, triangles and JS heap measured while it plays. The QA loop's eyes (docs/qa).
//
//   npm run preview (4317), then: node tools/clips.mjs <outdir> [clip ...]
//
// Writes <outdir>/<clip>.webm, <outdir>/<clip>-sheet.jpg (a frame a second, tiled) and
// <outdir>/perf.json. Headless frame times read about twice as slow as a real browser on this
// machine (memory: perf-measurement-contamination) — compare runs, not absolutes.
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const OUT = process.argv[2] ?? 'shots/clips'
const only = process.argv.slice(3)
mkdirSync(OUT, { recursive: true })
const W = 1280
const H = 720
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] })

const wait = (page, ms) => page.waitForTimeout(ms)
/** Look about by dragging with the right button (works without pointer lock). */
async function look(page, dx, dy, steps = 12) {
  await page.mouse.move(W / 2, H / 2)
  await page.mouse.down({ button: 'right' })
  for (let i = 1; i <= steps; i++) await page.mouse.move(W / 2 + (dx * i) / steps, H / 2 + (dy * i) / steps)
  await page.mouse.up({ button: 'right' })
}
const hold = async (page, keys, ms) => {
  for (const k of keys) await page.keyboard.down(k)
  await wait(page, ms)
  for (const k of keys) await page.keyboard.up(k)
}

const CLIPS = {
  // A new player: the title, waking, the first steps in the dark hall, out toward the light.
  async opening(page) {
    await page.goto('http://localhost:4317/', { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => localStorage.clear())
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.__g && window.__g.ready === true, null, { timeout: 240000 })
    await wait(page, 2500)
    await page.mouse.click(W / 2, H / 2)
    await wait(page, 7000)
    await hold(page, ['KeyW'], 4000)
    await look(page, 300, 0)
    await hold(page, ['KeyW', 'ShiftLeft'], 5000)
    await look(page, -500, -40)
    await hold(page, ['KeyW'], 3000)
  },
  // The Green at a run: running, a jump, turning to look round, a stop.
  async green(page) {
    await ready(page)
    await page.evaluate(() => { const g = window.__g; g.weather.set('clear', true); g.teleport(-600, 400); g.setCam(0.4, 0.08, 8) })
    await wait(page, 3000)
    await hold(page, ['KeyW'], 2500)
    await page.keyboard.down('KeyW')
    await page.keyboard.down('ShiftLeft')
    await wait(page, 2500)
    await page.keyboard.press('Space')
    await wait(page, 1800)
    await look(page, 420, 0, 20)
    await wait(page, 1500)
    await page.keyboard.up('ShiftLeft')
    await page.keyboard.up('KeyW')
    await wait(page, 1500)
    await look(page, -800, 20, 30)
    await wait(page, 1000)
  },
  // Taking hold of the Walker and climbing.
  async climb(page) {
    await ready(page)
    await page.evaluate(() => { window.__g.weather.set('clear', true); window.__g.grabTitan() })
    await wait(page, 1500)
    await hold(page, ['KeyW'], 9000)
    await look(page, 300, -60)
    await hold(page, ['KeyW', 'KeyD'], 4000)
    await wait(page, 1500)
  },
  // The grappling line at the High Places' cliff: thrown, reeled up, let go with a kick.
  async grapple(page) {
    await ready(page)
    await page.evaluate(() => { const g = window.__g; g.weather.set('clear', true); g.finds.find('bag'); const H = g.HIGH; const d = H.foot + 200; const a = H.axis + 0.12; g.teleport(Math.sin(a) * d, Math.cos(a) * d); g.setCam(H.axis + 0.12 + Math.PI, -0.3, 8) })
    await wait(page, 5000)
    await page.keyboard.down('KeyG')
    await wait(page, 4200)
    await page.keyboard.up('KeyG')
    await wait(page, 1200)
    await page.keyboard.press('Space')
    await wait(page, 3500)
  },
  // A sandstorm in the Dune Sea, walking into it.
  async storm(page) {
    await ready(page)
    await page.evaluate(() => { const g = window.__g; g.teleport(1300, 3700); g.weather.set('storm', true); g.setCam(0, 0.06, 8) })
    await wait(page, 3000)
    await hold(page, ['KeyW'], 6000)
    await look(page, 600, 0, 30)
    await hold(page, ['KeyW', 'ShiftLeft'], 4000)
  },
  // The Shore: down the beach into the surf, swimming, the Wader far out.
  async shore(page) {
    await ready(page)
    await page.evaluate(() => { const g = window.__g; g.weather.set('clear', true); g.teleport(300, 9200); g.setCam(Math.PI + 0.2, 0.05, 8) })
    await wait(page, 4000)
    await hold(page, ['KeyW', 'ShiftLeft'], 6000)
    await hold(page, ['KeyW'], 5000)
    await look(page, 500, -30, 30)
    await wait(page, 1500)
  },
}

async function ready(page) {
  await page.goto('http://localhost:4317/?offline', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__g && window.__g.ready === true, null, { timeout: 240000 })
  await wait(page, 1200)
}

const perf = {}
for (const [name, play] of Object.entries(CLIPS)) {
  if (only.length && !only.includes(name)) continue
  const dir = `${OUT}/.v-${name}`
  mkdirSync(dir, { recursive: true })
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir, size: { width: W, height: H } } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  // Frame times, from the game's own animation frames.
  await page.addInitScript(() => {
    window.__ft = []
    const raf = window.requestAnimationFrame.bind(window)
    let last = 0
    window.requestAnimationFrame = (f) => raf((t) => {
      if (last) window.__ft.push(t - last)
      last = t
      f(t)
    })
  })
  // Measure only the scene itself: reset the frame list when play begins.
  const t0 = Date.now()
  let samples = []
  const sampler = setInterval(async () => {
    try {
      const s = await page.evaluate(() => ({ st: window.__g?.stats?.(), heap: performance.memory?.usedJSHeapSize }))
      if (s.st) samples.push(s)
    } catch {}
  }, 1000)
  let res
  try {
    res = await play(page)
  } catch (e) {
    errors.push('clip: ' + e.message)
  }
  clearInterval(sampler)
  const ft = await page.evaluate(() => window.__ft ?? []).catch(() => [])
  await ctx.close()
  const vid = readdirSync(dir).find((f) => f.endsWith('.webm'))
  if (vid) renameSync(`${dir}/${vid}`, `${OUT}/${name}.webm`)
  // The last 80% of frames (the load is not the scene).
  const play_ = ft.slice(Math.floor(ft.length * 0.2)).filter((x) => x < 2000)
  const sorted = [...play_].sort((a, b) => a - b)
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
  const mean = play_.reduce((a, b) => a + b, 0) / Math.max(1, play_.length)
  const worst1 = sorted.slice(Math.floor(sorted.length * 0.99))
  const low1 = worst1.length ? 1000 / (worst1.reduce((a, b) => a + b, 0) / worst1.length) : 0
  const avg = (k) => Math.round(samples.reduce((a, s) => a + (s.st?.[k] ?? 0), 0) / Math.max(1, samples.length))
  perf[name] = {
    seconds: Math.round((Date.now() - t0) / 1000),
    frames: play_.length,
    fpsAvg: +(1000 / mean).toFixed(1),
    fps1Low: +low1.toFixed(1),
    frameMs: { p50: +pct(0.5).toFixed(1), p99: +pct(0.99).toFixed(1), max: +(sorted[sorted.length - 1] ?? 0).toFixed(1) },
    over33ms: play_.filter((x) => x > 33.4).length,
    drawCalls: avg('calls'),
    triangles: avg('tris'),
    heapMB: +((samples[samples.length - 1]?.heap ?? 0) / 1048576).toFixed(0),
    errors,
    result: res,
  }
  console.log(name, JSON.stringify(perf[name]))
  // A frame a second, tiled: to look at the clip at a glance.
  try {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', `${OUT}/${name}.webm`, '-vf', 'fps=1,scale=480:-1,tile=5x5', '-frames:v', '1', '-q:v', '4', `${OUT}/${name}-sheet.jpg`])
  } catch {}
}
writeFileSync(`${OUT}/perf.json`, JSON.stringify(perf, null, 1))
await browser.close()
