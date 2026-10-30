// P10 gate: the world is never empty. Own server (port 2570) whose wild
// Titan takes over 1.5 s after nobody is walking it:
//   1. B joins and does nothing: the Titan walks by itself, labelled "A wild Titan".
//   2. B takes the Titan: the wild mind lets go (B's input only; it stops).
//   3. B steps out: the Titan goes wild again and walks on.
//   npm run preview  (port 4317)        node tools/wild.mjs
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { rmSync, mkdirSync } from 'node:fs'

const PORT = 2570
const DB = 'data/wild-gate.db'
const url = `http://localhost:4317/?server=${encodeURIComponent(`http://localhost:${PORT}`)}`
mkdirSync('shots', { recursive: true })
for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) rmSync(`server/${f}`, { force: true })
let failed = false
const fail = (m) => {
  failed = true
  console.error('WILD GATE FAILED:', m)
}
const proc = spawn('npx', ['tsx', 'src/index.ts'], {
  cwd: 'server',
  env: { ...process.env, PORT: String(PORT), TITANS_DB: DB, TITANS_AI_DELAY_MS: '1500', NODE_NO_WARNINGS: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
})
await new Promise((resolve, reject) => {
  let out = ''
  const t = setTimeout(() => reject(new Error('server did not start')), 30000)
  proc.stdout.on('data', (d) => {
    out += d
    if (/listening on/.test(out)) {
      clearTimeout(t)
      resolve()
    }
  })
})
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--ignore-gpu-blocklist'] })
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 680 } })
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction('window.__g && window.__g.ready === true && window.__g.mode === "online"', null, { timeout: 120000 })
  const ev = (f, a) => page.evaluate(f, a)

  // 1. Left alone, it walks itself.
  await page.waitForFunction(() => window.__g.titanState().steps >= 3 && window.__g.net.state.titans.get('t1').wild, null, { timeout: 60000 }).catch(() => fail('the Titan did not walk by itself'))
  // Online the server refuses teleports (that is the anti-cheat working), so
  // look at the Titan from wherever we stand, then read its label.
  await ev(() => {
    const g = window.__g
    const t = g.titanState()
    const p = g.player()
    g.setCam(Math.atan2(p.x - t.x, p.z - t.z), 0.05, 8)
  })
  await page.waitForFunction(() => window.__g.terrainView.settled(), null, { timeout: 30000 })
  await page.waitForTimeout(600)
  const wild = await ev(() => ({
    steps: window.__g.titanState().steps,
    falls: window.__g.falls.length,
    label: [...document.querySelectorAll('.label.titan-name')].filter((e) => e.style.display !== 'none').map((e) => e.textContent).join(' | '),
  }))
  console.log(`alone: the Titan walked ${wild.steps} steps by itself (${wild.falls} footfalls arrived); label "${wild.label}"`)
  if (!wild.label.includes('A wild Titan')) fail('no "A wild Titan" label')
  await page.screenshot({ path: 'shots/p10-wild.png' })
  console.log('shots/p10-wild.png')

  // 2. Take it: the wild mind lets go and it stops for us.
  await ev(() => window.__g.toggleRole('t1'))
  await page.waitForFunction(() => window.__g.role === 'titan' && !window.__g.net.state.titans.get('t1').wild, null, { timeout: 10000 }).catch(() => fail('could not take the Titan from the wild'))
  await page.waitForFunction(() => window.__g.titanState().speed === 0, null, { timeout: 20000 }).catch(() => fail('the Titan kept walking under our control'))
  const held = await ev(() => window.__g.titanState().steps)
  console.log(`taken over at ${held} steps; it stood still for us`)

  // 3. Step out: it goes wild again.
  await ev(() => window.__g.toggleRole())
  await page.waitForFunction((n) => window.__g.net.state.titans.get('t1').wild && window.__g.titanState().steps >= n + 2, held, { timeout: 60000 }).catch(() => fail('it did not go wild again'))
  console.log(`stepped out: wild again, now ${await ev(() => window.__g.titanState().steps)} steps`)
  if (!failed) console.log('WILD GATE PASSED')
} finally {
  await browser.close()
  try {
    process.kill(-proc.pid, 'SIGKILL')
  } catch {}
  if (failed) process.exitCode = 1
}
