// Playtest driver: a real, headed browser on a fresh game (a new player), held open, driven one
// step at a time over HTTP so a person (or Claude) can look at each frame and decide what to try
// next. Real key presses held for real time; looking goes through the game's own mouse-look input.
//
//   node tools/play.mjs [url] [outDir]         (listens on 127.0.0.1:4499)
//   curl -s localhost:4499/act -d '{"hold":["KeyW","ShiftLeft"],"ms":2000,"look":[200,0],"tap":["Space"],"name":"run"}'
//   → { shot: "<outDir>/NNN-run.png", state: {...} }
//
// Body fields (all optional): hold (keys held for ms), ms, tap (keys pressed and released first),
// look ([dx, dy] mouse pixels, spread over the step), toward ([x, z]: steer the view at a place,
// as a player holds the mouse on a landmark), click (left click), wait (ms more after),
// eval (JS run in the page, its result returned — for setting up a situation, not for playing),
// size ([w, h] of the shot, default 960×600).
import { chromium } from 'playwright-core'
import { createServer } from 'node:http'
import { mkdirSync } from 'node:fs'

const URL = process.argv[2] ?? 'http://127.0.0.1:4402/?offline'
const OUT = process.argv[3] ?? 'shots/play'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ args: ['--mute-audio'], channel: 'chrome', headless: false })
// (Gone with its browser: a driver left listening with a dead page held the port and the next one could not start.)
browser.on('disconnected', () => process.exit(0))
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await context.newPage()
const log = []
page.on('pageerror', (e) => log.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') log.push(`${m.type()}: ${m.text().slice(0, 300)}`)
})
await page.goto(URL, { waitUntil: 'domcontentloaded' })
let n = 0

const state = () =>
  page.evaluate(() => {
    const g = window.__g
    if (!g) return { loading: true }
    const w = g.wanderer
    const txt = (id) => (document.getElementById(id)?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
    const p = w.pos
    const land = g.terrain.heightAt(p.x, p.z)
    return {
      ready: g.ready,
      pos: [p.x, p.y, p.z].map((v) => +v.toFixed(1)),
      aboveLand: +(p.y - land).toFixed(2),
      speed: +Math.hypot(w.vel.x, w.vel.z).toFixed(1),
      vy: +w.vel.y.toFixed(1),
      mode: w.climbing ? 'climb' : w.gliding ? 'glide' : w.swimming ? 'swim' : w.sledding ? 'slide' : w.hanging ? 'hang' : w.grounded ? 'ground' : 'air',
      crouch: w.crouching,
      land: g.terrain.base.regions.name(p.x, p.z),
      prompt: txt('prompt'),
      said: txt('narration') || txt('caption'),
      camToBody: +g.camera.position.distanceTo(p).toFixed(1),
      fov: +g.camera.fov.toFixed(0),
      time: +g.sky.time.toFixed(2),
      found: g.finds.save().slice(-6),
    }
  })

async function act(b) {
  const ms = b.ms ?? 0
  let evalResult
  if (b.eval) evalResult = await page.evaluate((src) => { try { return new Function('g', src)(window.__g) } catch (e) { return 'threw: ' + e.message } }, b.eval)
  if (b.click) await page.mouse.click(...(Array.isArray(b.click) ? b.click : [640, 400]))
  for (const k of b.tap ?? []) await page.keyboard.press(k, { delay: 60 })
  for (const k of b.hold ?? []) await page.keyboard.down(k)
  // Look: spread over the step (the game's own mouse-look input, as a locked mouse would feed it).
  const steps = Math.max(1, Math.round(ms / 50))
  for (let i = 0; i < steps; i++) {
    if (b.toward) await page.evaluate(([tx, tz]) => { const g = window.__g; if (!g) return; const w = g.wanderer.pos; g.rig.yaw = Math.atan2(-(tx - w.x), -(tz - w.z)) }, b.toward)
    if (b.look) await page.evaluate(([dx, dy]) => { const I = window.__g?.input; if (I) { I.lookX += dx; I.lookY += dy } }, [b.look[0] / steps, b.look[1] / steps])
    await page.waitForTimeout(ms / steps)
  }
  let duringResult
  if (b.during) duringResult = await page.evaluate((src) => { try { return new Function('g', src)(window.__g) } catch (e) { return 'threw: ' + e.message } }, b.during)
  for (const k of b.hold ?? []) await page.keyboard.up(k)
  if (b.wait) await page.waitForTimeout(b.wait)
  const [w, h] = b.size ?? [960, 600]
  const name = `${String(n++).padStart(3, '0')}-${(b.name ?? 'step').replace(/[^a-z0-9-]/gi, '')}`
  const shot = `${OUT}/${name}.png`
  await page.screenshot({ path: shot, scale: 'css' })
  // (Resized by the reader if needed; the full frame is kept.)
  const errs = log.splice(0)
  return { shot, w, h, state: await state(), errors: errs, eval: evalResult, during: duringResult }
}

createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', async () => {
    try {
      const out = req.url === '/state' ? await state() : await act(body ? JSON.parse(body) : {})
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(out))
    } catch (e) {
      res.writeHead(500)
      res.end(String(e))
    }
  })
}).listen(4499, '127.0.0.1', () => console.log('play driver on 127.0.0.1:4499'))
