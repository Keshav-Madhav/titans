// P9 gate, online: "log off, become a mountain". Runs its own server
// (port 2569, scratch DB, dormancy after 3 s instead of 60 s):
//   1. A takes the Titan, walks two strides, sits it down (X) and logs off.
//   2. B sees it fall asleep: a named mountain where it sat, the ground risen
//      under it, and a new Titan awake somewhere else.
//   3. The server is SIGKILLed and restarted: the mountain is still there.
//
//   npm run preview  (port 4317)        node tools/dormant.mjs
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { rmSync, mkdirSync } from 'node:fs'

const PORT = 2569
const DB = 'data/dormant-gate.db'
const url = `http://localhost:4317/?server=${encodeURIComponent(`http://localhost:${PORT}`)}`
mkdirSync('shots', { recursive: true })
for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) rmSync(`server/${f}`, { force: true })

let failed = false
const fail = (m) => {
  failed = true
  console.error('DORMANT GATE FAILED:', m)
}

function startServer() {
  const proc = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: 'server',
    env: { ...process.env, TITANS_AI: '0', PORT: String(PORT), TITANS_DB: DB, TITANS_DORMANT_MS: '3000', NODE_NO_WARNINGS: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  proc.stdout.on('data', (d) => {
    const line = String(d)
    if (/mountain/.test(line)) process.stdout.write('  [server] ' + line)
  })
  return new Promise((resolve, reject) => {
    let out = ''
    const t = setTimeout(() => reject(new Error('server did not start:\n' + out)), 30000)
    proc.stdout.on('data', (d) => {
      out += d
      if (/listening on/.test(out)) {
        clearTimeout(t)
        resolve(proc)
      }
    })
    proc.stderr.on('data', (d) => (out += d))
  })
}
const crash = (proc) => {
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
  const nameA = await A.evaluate(() => window.__g.identity.name)

  await A.evaluate(() => window.__g.toggleRole())
  await A.waitForFunction(() => window.__g.role === 'titan', null, { timeout: 10000 })
  await A.evaluate(() => window.__g.input.press('KeyW'))
  await B.waitForFunction(() => window.__g.titanState().steps >= 2, null, { timeout: 60000 })
  await A.evaluate(() => { window.__g.input.release('KeyW'); window.__g.input.press('KeyX') })
  // A Titan this heavy glides a little before it settles: wait until it has stopped.
  await B.waitForFunction(() => window.__g.titan.gait.resting && window.__g.titanState().speed === 0, null, { timeout: 20000 }).catch(() => fail('B never saw the Titan sit'))
  const sat = await B.evaluate(() => window.__g.titanState())
  const groundBefore = await B.evaluate((t) => window.__g.heightAt(t.x, t.z), sat)
  await A.close() // log off
  console.log(`${nameA} sat the Titan down at ${sat.x.toFixed(0)}, ${sat.z.toFixed(0)} and logged off`)

  await B.waitForFunction(() => window.__g.mountains.count >= 1, null, { timeout: 20000 }).catch(() => fail('no mountain appeared'))
  await B.waitForTimeout(800)
  // Face the mountain first: labels only show for what is in front of you.
  await B.evaluate((t) => {
    const g = window.__g
    const p = g.player()
    g.setCam(Math.atan2(p.x - t.x, p.z - t.z), 0.12, 12)
  }, sat)
  await B.waitForFunction(() => window.__g.terrainView.settled(), null, { timeout: 30000 })
  await B.waitForTimeout(500)
  const seen = await B.evaluate((t) => {
    const g = window.__g
    const m = g.mountains.targets()[0]
    const now = g.titanState()
    return {
      at: m ? Math.hypot(m.titan.gait.x - t.x, m.titan.gait.z - t.z) : -1,
      rise: g.heightAt(t.x, t.z),
      newTitanAway: Math.hypot(now.x - t.x, now.z - t.z),
      newSteps: now.steps,
      label: [...document.querySelectorAll('.label.mountain')].filter((e) => e.style.display !== 'none').map((e) => e.textContent).join(' | '),
    }
  }, sat)
  console.log(`B sees: mountain ${seen.at.toFixed(1)} m from where it sat; ground rose ${(seen.rise - groundBefore).toFixed(1)} m; new Titan ${seen.newTitanAway.toFixed(0)} m away (${seen.newSteps} steps); label "${seen.label}"`)
  if (seen.at < 0 || seen.at > 1) fail('the mountain is not where the Titan sat')
  if (seen.rise - groundBefore < 5) fail('no hill rose under the mountain')
  if (seen.newTitanAway < 300 || seen.newSteps !== 0) fail('no new Titan awoke elsewhere')
  if (!seen.label.includes(nameA)) fail(`the mountain does not carry ${nameA}'s name`)
  await B.evaluate((t) => {
    const g = window.__g
    const p = g.player()
    g.setCam(Math.atan2(p.x - t.x, p.z - t.z), 0.12, 12)
  }, sat)
  await B.waitForFunction(() => window.__g.terrainView.settled(), null, { timeout: 30000 })
  await B.waitForTimeout(500)
  await B.screenshot({ path: 'shots/p9-dormant-online.png' })
  console.log('shots/p9-dormant-online.png')

  // Crash, restart: the mountain must persist.
  await B.close()
  crash(server)
  server = await startServer()
  const B2 = await open(ctxB)
  await B2.waitForFunction(() => window.__g.mountains.count >= 1, null, { timeout: 20000 }).catch(() => fail('the mountain did not survive a restart'))
  const kept = await B2.evaluate((t) => ({ n: window.__g.mountains.count, rise: window.__g.heightAt(t.x, t.z) }), sat)
  console.log(`after a crash + restart: ${kept.n} mountain(s); ground there ${(kept.rise - groundBefore).toFixed(1)} m above where it was`)
  if (Math.abs(kept.rise - seen.rise) > 0.01) fail('the hill changed across the restart')
  if (!failed) console.log('DORMANT GATE PASSED')
} finally {
  await browser.close()
  crash(server)
  if (failed) process.exitCode = 1
}
