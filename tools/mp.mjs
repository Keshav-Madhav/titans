// P6 gate: three real players in one world, against the real server.
//   npm run server   (port 2567, fresh)      npm run preview   (port 4317)
//   node tools/mp.mjs
// A takes the Titan and walks it; everyone must see the same Titan, the same
// craters, each other, and each other's chat.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const url = process.argv[2] ?? 'http://localhost:4317/'
mkdirSync('shots', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--ignore-gpu-blocklist'] })
const fail = (m) => {
  console.error('MP GATE FAILED:', m)
  process.exitCode = 1
}

async function player(tag) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 680 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.error(`[${tag}] pageerror`, e.message))
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction('window.__g && window.__g.ready === true && window.__g.mode === "online"', null, { timeout: 120000 })
  return page
}

try {
  const [A, B, C] = [await player('A'), await player('B'), await player('C')]
  const ev = (p, f, arg) => p.evaluate(f, arg)

  // Everyone sees the other two.
  for (const [tag, p] of [['A', A], ['B', B], ['C', C]]) {
    await p.waitForFunction(() => window.__g.remotes.count >= 2, null, { timeout: 20000 }).catch(() => fail(`${tag} does not see two remotes`))
  }
  console.log('names:', await Promise.all([A, B, C].map((p) => ev(p, () => window.__g.identity.name))))

  // A takes the Titan and walks it.
  await ev(A, () => window.__g.toggleRole())
  await A.waitForFunction(() => window.__g.role === 'titan', null, { timeout: 10000 }).catch(() => fail('A never became the Titan'))
  // B cannot take it while A has it.
  await ev(B, () => window.__g.toggleRole())
  await B.waitForTimeout(600)
  if ((await ev(B, () => window.__g.role)) !== 'wanderer') fail('B took a Titan that A was driving')

  const start = await ev(B, () => window.__g.titanState().steps)
  await ev(A, () => window.__g.input.press('KeyW'))
  await B.waitForFunction((s) => window.__g.titanState().steps >= s + 4, start, { timeout: 90000 }).catch(() => fail('B never saw the Titan take 4 steps'))
  await ev(A, () => window.__g.input.release('KeyW'))
  await B.waitForTimeout(1500)

  // Same land everywhere: compare the terrain at every footfall B has seen.
  const falls = await ev(B, () => window.__g.falls.slice())
  const sample = (p) => ev(p, (pts) => pts.map((q) => +window.__g.deltaAt(q.x, q.z).toFixed(4)), falls)
  const [dA, dB, dC] = await Promise.all([sample(A), sample(B), sample(C)])
  const same = JSON.stringify(dA) === JSON.stringify(dB) && JSON.stringify(dB) === JSON.stringify(dC)
  console.log(`${falls.length} footfalls; crater depth at each, A/B/C identical: ${same}; e.g. ${dB.slice(0, 4).join(', ')}`)
  if (!falls.length || !same) fail('players disagree about the land')
  const tA = await ev(A, () => window.__g.titanState())
  const tC = await ev(C, () => window.__g.titanState())
  console.log(`Titan steps A=${tA.steps} C=${tC.steps}, position gap ${Math.hypot(tA.x - tC.x, tA.z - tC.z).toFixed(1)} m`)

  // B walks; C sees B move.
  const seenBefore = await ev(C, () => window.__g.remotes.positions())
  await ev(B, () => { window.__g.input.press('KeyW'); window.__g.input.press('ShiftLeft') })
  await B.waitForTimeout(2500)
  await ev(B, () => { window.__g.input.release('KeyW'); window.__g.input.release('ShiftLeft') })
  await C.waitForTimeout(600)
  const seenAfter = await ev(C, () => window.__g.remotes.positions())
  const moved = seenAfter.some((p, i) => seenBefore[i] && Math.hypot(p.x - seenBefore[i].x, p.z - seenBefore[i].z) > 8)
  console.log(`C saw a Wanderer move: ${moved}`)
  if (!moved) fail('C did not see B walk')

  // Chat reaches the others.
  await ev(C, () => window.__g.net.sendChat('the giant walks east'))
  await A.waitForFunction(() => document.getElementById('chat-log').textContent.includes('the giant walks east'), null, { timeout: 5000 }).catch(() => fail('chat did not reach A'))
  console.log('chat delivered')

  // B climbs the Titan; C must see B on its body, where B really is.
  const grabbed = await ev(B, () => window.__g.grabTitan())
  if (!grabbed) fail('B could not grab the Titan')
  await ev(B, () => window.__g.input.press('KeyW'))
  await B.waitForTimeout(4000)
  await ev(B, () => window.__g.input.release('KeyW'))
  await C.waitForFunction(() => window.__g.remotes.climbers >= 1, null, { timeout: 5000 }).catch(() => fail('C does not see a climber'))
  await C.waitForTimeout(400)
  const bAt = await ev(B, () => window.__g.climbState())
  const cSees = await ev(C, () => window.__g.remotes.positions())
  const gap = Math.min(...cSees.map((p) => Math.hypot(p.x - bAt.x, p.z - bAt.z)))
  console.log(`B climbing ${bAt.part} at ${bAt.height.toFixed(1)} m; C draws B ${gap.toFixed(2)} m from where B is`)
  if (!bAt.active || gap > 3) fail('C does not draw B on the Titan')

  // A shrugs; everyone's Titan heaves.
  await ev(A, () => window.__g.input.press('KeyQ'))
  await C.waitForFunction(() => window.__g.titan.shrugging, null, { timeout: 3000 }).catch(() => fail('the shrug did not reach C'))
  console.log('shrug seen by C')

  // A stomps and calls out; the others see the stomp land and the call marker.
  await ev(A, () => { window.__g.input.press('KeyF'); window.__g.input.press('KeyW') })
  await B.waitForFunction(() => window.__g.falls.some((f) => f.stomp), null, { timeout: 60000 }).catch(() => fail('B never saw a stomp'))
  await ev(A, () => { window.__g.input.release('KeyF'); window.__g.input.release('KeyW'); window.__g.input.press('KeyC') })
  await C.waitForFunction(() => getComputedStyle(document.getElementById('beacon')).display === 'flex', null, { timeout: 5000 }).catch(() => fail('C never saw the call'))
  const stomps = await Promise.all([A, B, C].map((p) => ev(p, () => { const f = window.__g.falls.find((q) => q.stomp); return f ? +window.__g.deltaAt(f.x, f.z).toFixed(3) : null })))
  console.log(`stomp print depth A/B/C: ${stomps.join(' / ')}; call marker on C`)
  if (new Set(stomps).size !== 1 || stomps[0] === null) fail('players disagree about the stomp')

  // A picture from C: the other Wanderer and the Titan.
  await ev(C, () => {
    const g = window.__g
    const b = g.remotes.positions()[0]
    const p = g.player()
    const t = g.titanState()
    g.teleport(b.x - 6, b.z - 6)
    g.setCam(Math.atan2(-(t.x - p.x), -(t.z - p.z)), 0.08, 9)
  })
  await C.waitForFunction(() => window.__g.terrainView.settled(), null, { timeout: 30000 })
  await C.waitForTimeout(800)
  await C.screenshot({ path: 'shots/p6-together.png' })
  console.log('shots/p6-together.png')
  if (!process.exitCode) console.log('MP GATE PASSED')
} finally {
  await browser.close()
}
