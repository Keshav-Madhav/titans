// A newcomer's first minutes: a fresh browser on the real game (no tool mode),
// photographed at the moments a player meets things. Logs what the game said.
//   node tools/newplayer.mjs <out-dir> [url]
// The route: the title, waking in the Undercroft, the stair up into the light
// (the reveal), the camp at the stair's mouth (the bag), then a look round.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
const out = process.argv[2] ?? 'shots/newplayer'
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
console.log(log.join('\n'))
await ctx.close()
await browser.close()
