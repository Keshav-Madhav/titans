// A newcomer's first hour, past the first climb: the newplayer route (title,
// Undercroft, reveal, the bag), then on as the tips lead — the bag opened, the
// giant walking the Green climbed to its shoulders, the map, down again, and
// the traveller's smoke followed to the second camp. Long walks run the clock
// faster (logged); everything else is played as a player would.
//   node tools/firsthour.mjs <out-dir> [url]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
const out = process.argv[2] ?? 'shots/firsthour'
const url = process.argv[3] ?? 'http://localhost:4317/'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] })
// (VIDEO=1 records the whole playthrough to a .webm in the out folder.)
const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 }, ...(process.env.VIDEO ? { recordVideo: { dir: out, size: { width: 1280, height: 760 } } } : {}) })
const page = await ctx.newPage()
const log = []
const snap = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png` })
  const s = await page.evaluate(() => ({
    said: window.__g ? window.__g.narration.lines.slice(-2) : [],
    tip: document.getElementById('tips')?.style.display !== 'none' ? document.querySelector('#tips span')?.textContent : '',
    found: window.__g ? window.__g.finds.save() : [],
    p: window.__g ? (({ x, y, z }) => [Math.round(x), Math.round(y), Math.round(z)])(window.__g.player()) : null,
    opening: window.__g?.opening,
    hints: document.getElementById('hints')?.textContent ?? '',
  }))
  log.push(`${name}: ${s.opening} at ${JSON.stringify(s.p)} · tip "${s.tip ?? ''}" · found [${s.found.join(', ')}] · said ${JSON.stringify(s.said)} · keys "${s.hints}"`)
}
const hold = async (keys, ms) => {
  for (const k of keys) await page.keyboard.down(k)
  await page.waitForTimeout(ms)
  for (const k of keys) await page.keyboard.up(k)
}
// Walk toward (x, z), turning the view toward it as a player would, until near (or out of time).
const walkTo = async (x, z, { run = false, near = 4, ms = 40000 } = {}) => {
  const t0 = Date.now()
  await page.keyboard.down('KeyW')
  if (run) await page.keyboard.down('ShiftLeft')
  while (Date.now() - t0 < ms) {
    const d = await page.evaluate(([x, z]) => {
      const g = window.__g
      const p = g.player()
      if (g.opening === 'reveal') return -1
      g.setCam(Math.atan2(-(x - p.x), -(z - p.z)), g.rig.pitch)
      return Math.hypot(x - p.x, z - p.z)
    }, [x, z])
    if (d < near) break
    await page.waitForTimeout(250)
  }
  await page.keyboard.up('KeyW')
  if (run) await page.keyboard.up('ShiftLeft')
}
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await snap('01-loading')
await page.waitForFunction('window.__g && window.__g.ready === true', null, { timeout: 180000 })
await page.waitForTimeout(1500)
await snap('02-title')
await page.mouse.click(640, 380)
await page.waitForTimeout(1600)
await snap('03-waking')
await page.waitForTimeout(3600)
await snap('04-awake')
// The hall: HALL is (60, 1400); the stair's foot at (85, 1525), its top at (-120, 1525).
await walkTo(85, 1520)
await snap('05-stair-foot')
await walkTo(-178, 1524, { run: true })
await page.waitForTimeout(1500)
await snap('06-reveal-early')
await page.waitForTimeout(3500)
await snap('07-reveal-held')
await page.waitForTimeout(5500)
await snap('08-after-reveal')
// The camp at the stair's mouth: the red cloth, the traveller's page, the bag.
await walkTo(-232, 1518, { near: 3 })
await snap('09-camp')
await page.keyboard.press('KeyE')
await page.waitForTimeout(2500)
const bagAt = await page.evaluate(() => [window.__g.camp.bagAt.x, window.__g.camp.bagAt.z])
await walkTo(bagAt[0], bagAt[1], { near: 1.2, ms: 8000 })
await page.keyboard.press('KeyE')
await page.waitForTimeout(3500)
await snap('10-bag-taken')
await page.evaluate(() => window.__g.setCam(window.__g.rig.yaw + Math.PI * 0.7, 0.1))
await page.waitForTimeout(1500)
await snap('11-looked-round')

const tipNow = () => page.evaluate(() => (document.getElementById('tips')?.style.display !== 'none' ? document.querySelector('#tips span')?.textContent : '') ?? '')
const t0 = Date.now()
const mark = (s) => log.push(`[${((Date.now() - t0) / 1000).toFixed(0)} s] ${s}`)
// The bag, as the tip says.
await page.keyboard.press('KeyI')
await page.waitForTimeout(1500)
await snap('12-bag-open')
await page.keyboard.press('KeyI')
await page.waitForTimeout(800)
mark(`tip after the bag: "${await tipNow()}"`)
// The giant walking the Green: go to its foot (it moves; keep re-aiming).
const walker = async () => page.evaluate(() => {
  const g = window.__g
  const p = g.player()
  let best = null
  for (const [id, a] of g.titans) {
    const d = Math.hypot(a.titan.gait.x - p.x, a.titan.gait.z - p.z)
    if (!best || d < best.d) best = { id, d, x: a.titan.gait.x, z: a.titan.gait.z }
  }
  return best
})
let w = await walker()
mark(`nearest giant ${w.id} at ${w.d.toFixed(0)} m`)
await page.evaluate(() => { window.__g.clock.scale = 3 })
{
  const until = Date.now() + 120000
  await page.keyboard.down('KeyW')
  await page.keyboard.down('ShiftLeft')
  while (Date.now() < until) {
    w = await walker()
    if (w.d < 26) break
    await page.evaluate(([x, z]) => { const g = window.__g; const p = g.player(); g.setCam(Math.atan2(-(x - p.x), -(z - p.z)), g.rig.pitch) }, [w.x, w.z])
    await page.waitForTimeout(250)
  }
  await page.keyboard.up('KeyW')
  await page.keyboard.up('ShiftLeft')
}
await page.evaluate(() => { window.__g.clock.scale = 1 })
mark(`reached the giant: ${w.d.toFixed(0)} m from its middle`)
await snap('13-at-the-foot')
// E at its foot, as the tip says: walk right up to the nearer foot (it is
// moving; re-aim) and press E as you reach it.
const footOf = () => page.evaluate((id) => {
  const g = window.__g
  const t = g.titans.get(id).titan
  t.group.updateMatrixWorld(true)
  const p = g.player()
  let best = null
  for (const n of ['footL', 'footR']) {
    const f = t.part(n)
    const q = f.lumps[0].c.clone().applyMatrix4(f.mesh.matrixWorld)
    const d = Math.hypot(q.x - p.x, q.z - p.z)
    if (!best || d < best.d) best = { d, x: q.x, z: q.z }
  }
  return best
}, w.id)
let holding = false
{
  const until = Date.now() + 40000
  await page.keyboard.down('KeyW')
  while (Date.now() < until && !holding) {
    const f = await footOf()
    await page.evaluate(([x, z]) => { const g = window.__g; const p = g.player(); g.setCam(Math.atan2(-(x - p.x), -(z - p.z)), g.rig.pitch) }, [f.x, f.z])
    // As a player: E when the prompt offers to take hold.
    const prompt = await page.evaluate(() => document.getElementById('prompt')?.textContent ?? '')
    if (prompt.includes('Take hold')) { mark(`prompt: "${prompt}" at ${f.d.toFixed(0)} m from the foot's middle`); await page.keyboard.press('KeyE') }
    await page.waitForTimeout(200)
    holding = await page.evaluate(() => window.__g.climbState().active)
  }
  await page.keyboard.up('KeyW')
}
mark(holding ? 'took hold with E' : 'could not take hold with E in 40 s — grabbed by the tool')
if (!holding) await page.evaluate((id) => window.__g.grabTitan(id), w.id)
// Climb, steering up the body like the climb gate.
const climb = await page.evaluate(async (id) => {
  const g = window.__g
  const T = g.titans.get(id).titan
  const H = T.H
  // (Played at the real pace: the climb is the thing being tested.)
  g.input.press('KeyW')
  const until = Date.now() + 150000
  let best = 0
  let rests = 0
  const trace = []
  let k = 0
  let hi = 0
  let hiAt = Date.now()
  let side = 0
  while (Date.now() < until) {
    const c = g.climbState()
    if (k++ % 40 === 0 || !c.active) trace.push(`${(performance.now() / 1000).toFixed(1)}s ${c.part} ${c.height.toFixed(0)} m grip ${c.stamina.toFixed(2)}${c.standing ? ' standing' : ''} giant ${T.gait.speed.toFixed(1)} m/s${T.shrugging ? ' shrugging' : ''}${c.active ? '' : ' — off: ' + g.narration.lines.slice(-1)[0]}`)
    if (!c.active) break
    best = Math.max(best, c.height)
    if (c.height > 0.74 * H && c.standing) break
    if (c.stamina < 0.75 && c.standing) { g.input.release('KeyW'); rests++; while (g.climbState().stamina < 0.9 && g.climbState().active) await new Promise((r) => setTimeout(r, 100)); g.input.press('KeyW') }
    // Not rising for a few seconds (wedged where two boulders meet): as a
    // player would, edge sideways a while.
    if (c.height > hi + 1) { hi = c.height; hiAt = Date.now() }
    if (Date.now() - hiAt > 3000) {
      const key = side++ % 2 ? 'KeyA' : 'KeyD'
      g.input.press(key)
      await new Promise((r) => setTimeout(r, 1200))
      g.input.release(key)
      hiAt = Date.now()
    }
    const next = { footL: ['shinL', 1], shinL: ['thighL', 2], thighL: ['torso', 0], torso: ['upperArmL', 0], upperArmL: ['upperArmL', 0], footR: ['shinR', 1], shinR: ['thighR', 2], thighR: ['torso', 0] }[c.part] ?? ['torso', 0]
    const p = T.part(next[0])
    let t = p.lumps[next[1]].c.clone().applyMatrix4(p.mesh.matrixWorld)
    if (Math.hypot(c.x - t.x, c.z - t.z) < 4) t = T.pelvis
    g.setCam(Math.atan2(c.x - t.x, c.z - t.z), 0.15)
    await new Promise((r) => setTimeout(r, 60))
  }
  g.input.release('KeyW')
  g.clock.scale = 1
  const c = g.climbState()
  return { best: +best.toFixed(0), H: +H.toFixed(0), active: c.active, standing: c.standing, rests, height: +c.height.toFixed(0), trace }
}, w.id)
for (const t of climb.trace) mark(`  climbing: ${t}`)
mark(`climb: peak ${climb.best} of ${climb.H} m, now ${climb.height} m, holding ${climb.active}, standing ${climb.standing}, rests ${climb.rests}`)
if (process.env.CLIMB_ONLY) {
  console.log(log.join('\n'))
  await ctx.close()
  await browser.close()
  process.exit(0)
}
await page.evaluate(() => window.__g.setCam(window.__g.rig.yaw + 2.2, 0.05, 12))
await page.waitForTimeout(2500)
await snap('14-on-its-shoulders')
mark(`tip up high: "${await tipNow()}"`)
await page.keyboard.press('KeyM')
await page.waitForTimeout(2000)
await snap('15-map-from-up-high')
await page.keyboard.press('KeyM')
await page.waitForTimeout(1000)
mark(`tip after the map: "${await tipNow()}"`)
// Down: let go (Space jumps off) and glide or fall.
await page.keyboard.press('Space')
await page.waitForTimeout(400)
await page.keyboard.down('Space')
await page.waitForTimeout(250)
await page.keyboard.up('Space')
const down = await page.evaluate(async () => {
  const g = window.__g
  const until = Date.now() + 40000
  let peakFall = 0
  while (Date.now() < until) {
    const p = g.player()
    const ground = g.heightAt(p.x, p.z)
    peakFall = Math.max(peakFall, p.y - ground)
    if (p.y - ground < 0.5 && !g.climbState().active) break
    await new Promise((r) => setTimeout(r, 100))
  }
  return { at: g.player(), state: g.wanderer.state ?? null, falls: g.falls ?? null }
})
mark(`down: ${JSON.stringify(down)}`)
await page.waitForTimeout(3000)
await snap('16-down-again')
// The traveller's smoke: the second camp.
const camp2 = [2350, 3000]
// (A player sees the hall's stair and roof holes and walks round them: go by a
// waypoint south-east of it if the straight line passes within 260 m.)
const via = await page.evaluate(([x, z]) => {
  const p = window.__g.player()
  const hx = 60, hz = 1400
  const dx = x - p.x, dz = z - p.z, l = Math.hypot(dx, dz)
  const t = Math.max(0, Math.min(1, ((hx - p.x) * dx + (hz - p.z) * dz) / (l * l)))
  const d = Math.hypot(p.x + dx * t - hx, p.z + dz * t - hz)
  return d < 260 ? [hx + 340, hz - 340] : null
}, camp2)
await page.evaluate(([x, z]) => { const g = window.__g; const p = g.player(); g.setCam(Math.atan2(-(x - p.x), -(z - p.z)), 0.02, 9) }, camp2)
await page.waitForTimeout(2000)
await snap('17-the-smoke')
const startD = await page.evaluate(([x, z]) => { const p = window.__g.player(); return Math.hypot(x - p.x, z - p.z) }, camp2)
mark(`second camp ${startD.toFixed(0)} m away; walking there, clock ×4`)
await page.evaluate(() => { window.__g.clock.scale = 4 })
let stuck = 0
{
  const until = Date.now() + 240000
  let last = null
  let lastT = Date.now()
  await page.keyboard.down('KeyW')
  await page.keyboard.down('ShiftLeft')
  let n = 0
  let goal = via ?? camp2
  if (via) mark(`going round the Undercroft by ${via}`)
  while (Date.now() < until) {
    const s = await page.evaluate(([x, z]) => {
      const g = window.__g
      const p = g.player()
      g.setCam(Math.atan2(-(x - p.x), -(z - p.z)), g.rig.pitch)
      return { d: Math.hypot(x - p.x, z - p.z), x: p.x, z: p.z }
    }, goal)
    if (s.d < 4) { if (goal === camp2) break; goal = camp2; continue }
    if (Date.now() - lastT > 3000) {
      const prompt = await page.evaluate(() => document.getElementById('prompt')?.textContent ?? '')
      if (last && Math.hypot(s.x - last.x, s.z - last.z) < 3 && prompt.includes('Climb')) {
        // A wall the game offers to climb: take hold and go up it.
        await page.keyboard.up('ShiftLeft')
        await page.keyboard.press('KeyE')
        await page.waitForTimeout(300)
        const up = await page.evaluate(async () => {
          const g = window.__g
          const y0 = g.player().y
          const until = Date.now() + 60000
          while (g.cliff.active && Date.now() < until) await new Promise((r) => setTimeout(r, 200))
          return { rose: g.player().y - y0, still: g.cliff.active }
        })
        mark(`climbed a wall: rose ${up.rose.toFixed(0)} m${up.still ? ' (still on it after 60 s)' : ''}`)
        await page.keyboard.down('ShiftLeft')
      } else if (last && Math.hypot(s.x - last.x, s.z - last.z) < 3) {
        stuck++
        // As a player would: hop, and veer.
        await page.keyboard.press('Space')
        await page.keyboard.down('KeyA'); await page.waitForTimeout(700); await page.keyboard.up('KeyA')
      }
      last = s
      lastT = Date.now()
      if (++n % 8 === 0) await snap(`18-walk-${String(n).padStart(2, '0')}`)
    }
    await page.waitForTimeout(200)
  }
  await page.keyboard.up('KeyW')
  await page.keyboard.up('ShiftLeft')
}
await page.evaluate(() => { window.__g.clock.scale = 1 })
const endD = await page.evaluate(([x, z]) => { const p = window.__g.player(); return Math.hypot(x - p.x, z - p.z) }, camp2)
mark(`at the second camp: ${endD.toFixed(0)} m off; stuck ${stuck} times on the way`)
await snap('19-second-camp')
// The page: E beside it.
for (let i = 0; i < 4; i++) {
  await page.keyboard.press('KeyE')
  await page.waitForTimeout(1200)
  if (await page.evaluate(() => window.__g.finds.has('page-2'))) break
  await walkTo(2351.1, 3001.4, { near: 1, ms: 3000 })
}
await page.waitForTimeout(2000)
await snap('20-page-two')
mark(`page-2 found: ${await page.evaluate(() => window.__g.finds.has('page-2'))}; tip now "${await tipNow()}"`)
console.log(log.join('\n'))
await ctx.close()
await browser.close()
