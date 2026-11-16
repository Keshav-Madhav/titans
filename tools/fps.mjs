// Frame rate does not change the game: the same walk, run and jump from the same spot at
// 30, 60 and 144 frames a second (requestAnimationFrame paced by a timer) end within a
// small distance of each other, and the jump reaches the same height.
//   npm run preview (4317), then: node tools/fps.mjs
import { launch } from './browser.mjs'
// TITANS_URL=<origin> points the gate at another server (default the preview on 4317).
const BASE = process.env.TITANS_URL ?? 'http://localhost:4317'

const browser = await launch()
const out = {}
for (const hz of [30, 60, 144]) {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } })
  await page.addInitScript((hz) => {
    // The page's frames at `hz`, whatever the screen: each callback gets the frame's own time.
    const q = []
    setInterval(() => {
      const now = performance.now()
      const run = q.splice(0)
      for (const f of run) f(now)
    }, 1000 / hz)
    window.requestAnimationFrame = (f) => (q.push(f), q.length)
  }, hz)
  await page.goto(`${BASE}/?offline`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__g && window.__g.ready === true, null, { timeout: 240000 })
  out[hz] = await page.evaluate(async () => {
    const g = window.__g
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    g.weather.set('clear', true)
    g.teleport(-600, 400)
    g.setCam(0, 0.1)
    // (Settled first: since a jump fills the far trees in over ~10 s after the near ones, the walk
    // overlapped it at 2.5 s and the 144 Hz run fell to ~40 fps — the fill-in, not the physics.)
    await wait(12000)
    const a = g.player()
    // Walk 3 s, run 3 s (game seconds: real time here is the same at every rate).
    g.input.press('KeyW')
    await wait(3000)
    g.input.press('ShiftLeft')
    await wait(3000)
    g.input.release('ShiftLeft')
    g.input.release('KeyW')
    await wait(1500)
    const b = g.player()
    // A jump on the spot: the highest the feet go.
    const y0 = g.player().y
    let top = y0
    g.input.press('Space')
    const t0 = performance.now()
    while (performance.now() - t0 < 1500) {
      top = Math.max(top, g.player().y)
      await wait(5)
    }
    g.input.release('Space')
    const fps = g.stats().fps
    return { dist: +Math.hypot(b.x - a.x, b.z - a.z).toFixed(2), jump: +(top - y0).toFixed(3), fps }
  })
  console.log(hz, 'Hz:', JSON.stringify(out[hz]))
  await page.close()
}
await browser.close()
const d = Object.values(out).map((o) => o.dist)
const j = Object.values(out).map((o) => o.jump)
const spread = (v) => Math.max(...v) - Math.min(...v)
// (Bounds: the walk is real-time driven, so ±one frame of the timer at each end, ~0.25 m at a run;
// the jump's apex is sampled every 5 ms, ~0.03 m.)
const ok = spread(d) < Math.max(0.6, 0.03 * Math.max(...d)) && spread(j) < 0.06
console.log(`distance spread ${spread(d).toFixed(2)} m, jump spread ${spread(j).toFixed(3)} m`)
console.log(ok ? 'PASS fps' : 'FAIL fps')
process.exit(ok ? 0 : 1)
