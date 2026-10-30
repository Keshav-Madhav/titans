// P7 gate: the world remembers. Runs its OWN server (port 2568, scratch DB),
// so it can kill it:
//   1. A walks the Titan four steps; B (a Wanderer) walks somewhere and leaves.
//   2. The server is killed with SIGKILL — a crash, not a polite shutdown.
//   3. A fresh server starts on the same database.
//   4. B comes back (same browser storage): same craters at every footfall,
//      the Titan where it stopped, B where B left, and the lakes already full.
//
//   npm run preview  (port 4317)        node tools/persist.mjs
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { rmSync, mkdirSync } from 'node:fs'

const PORT = 2568
const DB = 'data/persist-gate.db'
const url = `http://localhost:4317/?server=${encodeURIComponent(`http://localhost:${PORT}`)}`
mkdirSync('shots', { recursive: true })
for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) rmSync(`server/${f}`, { force: true })

let failed = false
const fail = (m) => {
  failed = true
  console.error('PERSIST GATE FAILED:', m)
}

function startServer() {
  const proc = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: 'server',
    env: { ...process.env, PORT: String(PORT), TITANS_DB: DB, NODE_NO_WARNINGS: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true, // its own process group, so a crash takes the forked tsx child with it
  })
  return new Promise((resolve, reject) => {
    let out = ''
    const t = setTimeout(() => reject(new Error('server did not start:\n' + out)), 30000)
    proc.stdout.on('data', (d) => {
      out += d
      const loaded = out.match(/world loaded: .*/)
      if (/listening on/.test(out) || loaded) {
        clearTimeout(t)
        resolve(proc)
      }
    })
    proc.stderr.on('data', (d) => (out += d))
  })
}

// `npx tsx` forks node; kill the whole group so SIGKILL really is a crash.
function crash(proc) {
  try {
    process.kill(-proc.pid, 'SIGKILL')
  } catch {
    proc.kill('SIGKILL')
  }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--ignore-gpu-blocklist'] })
async function open(ctx) {
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction('window.__g && window.__g.ready === true && window.__g.mode === "online"', null, { timeout: 120000 })
  return page
}

let server = await startServer()
try {
  const ctxA = await browser.newContext({ viewport: { width: 1100, height: 680 } })
  const ctxB = await browser.newContext({ viewport: { width: 1100, height: 680 } })
  const A = await open(ctxA)
  const B = await open(ctxB)

  await A.evaluate(() => window.__g.toggleRole())
  await A.waitForFunction(() => window.__g.role === 'titan', null, { timeout: 10000 })
  await A.evaluate(() => window.__g.input.press('KeyW'))
  await B.waitForFunction(() => window.__g.titanState().steps >= 4, null, { timeout: 90000 })
  await A.evaluate(() => window.__g.input.release('KeyW'))
  // Let it come to rest, then a little longer than the 2 s Titan save.
  await B.waitForFunction(() => window.__g.titanState().speed === 0, null, { timeout: 30000 })
  await B.waitForTimeout(2600)

  await B.evaluate(() => { window.__g.input.press('KeyW'); window.__g.input.press('ShiftLeft') })
  await B.waitForTimeout(3000)
  await B.evaluate(() => { window.__g.input.release('KeyW'); window.__g.input.release('ShiftLeft') })
  await B.waitForTimeout(400)

  const before = await B.evaluate(() => {
    const g = window.__g
    const falls = g.falls.slice()
    return { falls, depth: falls.map((q) => +g.deltaAt(q.x, q.z).toFixed(4)), titan: g.titanState(), me: g.player(), name: g.identity.name }
  })
  console.log(`before: ${before.falls.length} footfalls, Titan at ${before.titan.x.toFixed(1)}, ${before.titan.z.toFixed(1)} (${before.titan.steps} steps), ${before.name} at ${before.me.x.toFixed(1)}, ${before.me.z.toFixed(1)}`)

  // B leaves (its position is saved on leave), A stays — then the crash.
  await B.close()
  await A.waitForTimeout(500)
  crash(server)
  await A.close()
  console.log('server killed (SIGKILL)')

  server = await startServer()
  const B2 = await open(ctxB)
  await B2.waitForFunction((n) => window.__g.falls.length >= n, before.falls.length, { timeout: 30000 })
  // Lakes come back full; a merge on arrival can leave one topping up for a
  // moment, so wait for the fact (with a deadline) rather than one instant.
  const t0 = Date.now()
  await B2.waitForFunction(() => window.__g.lakeStats().length > 0 && window.__g.lakeStats().every((l) => l.full), null, { timeout: 10000 }).catch(() => {})
  console.log(`lakes full ${Date.now() - t0} ms after the replay`)
  const after = await B2.evaluate((pts) => {
    const g = window.__g
    return {
      depth: pts.map((q) => +g.deltaAt(q.x, q.z).toFixed(4)),
      titan: g.titanState(),
      me: g.player(),
      name: g.identity.name,
      lakes: g.lakeStats(),
    }
  }, before.falls)

  const sameLand = JSON.stringify(after.depth) === JSON.stringify(before.depth)
  const titanGap = Math.hypot(after.titan.x - before.titan.x, after.titan.z - before.titan.z)
  const meGap = Math.hypot(after.me.x - before.me.x, after.me.z - before.me.z)
  const full = after.lakes.filter((l) => l.full).length
  console.log(`after:  craters identical: ${sameLand}; Titan moved ${titanGap.toFixed(2)} m (steps ${after.titan.steps}); ${after.name} woke ${meGap.toFixed(2)} m from where they left; lakes ${full}/${after.lakes.length} full`)
  if (!sameLand) fail('the land changed across the restart')
  if (titanGap > 1 || after.titan.steps !== before.titan.steps) fail('the Titan is not where it stopped')
  if (meGap > 3 || after.name !== before.name) fail('the returning Wanderer did not wake where they left')
  if (after.lakes.length === 0 || full < after.lakes.length) fail('lakes are not full on return: ' + JSON.stringify(after.lakes))

  await B2.evaluate(() => {
    const g = window.__g
    const t = g.titanState()
    const p = g.player()
    g.setCam(Math.atan2(-(t.x - p.x), -(t.z - p.z)) , 0.25, 40)
  })
  await B2.waitForFunction(() => window.__g.terrainView.settled(), null, { timeout: 30000 })
  await B2.waitForTimeout(600)
  await B2.screenshot({ path: 'shots/p7-return.png' })
  console.log('shots/p7-return.png')
  if (!failed) console.log('PERSIST GATE PASSED')
} finally {
  await browser.close()
  crash(server)
  if (failed) process.exitCode = 1
}
