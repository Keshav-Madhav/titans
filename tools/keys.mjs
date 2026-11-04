// Keys and pads: rebinding on the pause page (press the new key; a key in use swaps),
// prompts show the player's keys, it is kept across a reload and reset; a pad walks and looks.
//   npm run preview (4317), then: node tools/keys.mjs [outdir]
import { launch } from './browser.mjs'
// TITANS_URL=<origin> points the gate at another server (default the preview on 4317).
const BASE = process.env.TITANS_URL ?? 'http://localhost:4317'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] ?? 'shots'
mkdirSync(OUT, { recursive: true })
let failed = false
const fail = (m) => {
  failed = true
  console.error('KEYS GATE FAILED:', m)
}
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const ready = () => page.waitForFunction(() => window.__g && window.__g.ready === true, null, { timeout: 240000 })
const ev = (f, a) => page.evaluate(f, a)
const URL = `${BASE}/?offline`

const bindKey = async (label, key) => {
  const btn = page.locator('.pause-key', { hasText: label }).locator('button.pause-bindkey')
  await btn.click()
  await page.keyboard.press(key)
  await page.waitForTimeout(100)
}
const keyOf = (label) => page.locator('.pause-key', { hasText: label }).locator('button.pause-bindkey').textContent()

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await ready()
  await ev(() => localStorage.removeItem('titans.adventure.settings'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await ready()
  await ev(() => window.__g.pause.show())
  await page.waitForTimeout(400)
  // 1. Use (E) → R.
  await bindKey('Climb, take, use', 'KeyR')
  // 2. Jump (Space) → R: R was Use, so Use takes Space.
  await bindKey('Jump, glide', 'KeyR')
  const shown = { use: await keyOf('Climb, take, use'), jump: await keyOf('Jump, glide') }
  // 3. Esc while listening keeps the old key (and does not close the page).
  await page.locator('.pause-key', { hasText: 'Horn' }).locator('button.pause-bindkey').click()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)
  const horn = await keyOf('Horn')
  const stillOpen = await ev(() => window.__g.pause.open)
  await page.screenshot({ path: `${OUT}/keys-pause.png` })
  const saved = await ev(() => JSON.parse(localStorage.getItem('titans.adventure.settings')).keys)
  console.log('bound:', JSON.stringify({ shown, horn, stillOpen, saved }))
  if (shown.use !== 'Space' || shown.jump !== 'R') fail('rebinding or the swap did not take')
  if (horn !== 'H' || !stillOpen) fail('Esc while listening did not keep the old key, or closed the page')
  if (saved.KeyE !== 'Space' || saved.Space !== 'KeyR') fail('the keys were not saved')
  await ev(() => window.__g.pause.resume())
  // 4. The game hears the new keys as the actions; the old keys do nothing.
  await page.keyboard.down('KeyR')
  const r = await ev(() => ({ jump: window.__g.input.held('Space'), raw: window.__g.input.held('KeyR') }))
  await page.keyboard.up('KeyR')
  await page.keyboard.down('KeyE')
  const e = await ev(() => window.__g.input.held('KeyE'))
  await page.keyboard.up('KeyE')
  console.log('held:', JSON.stringify({ r, e }))
  if (!r.jump || r.raw || e) fail('the game did not hear the rebound keys as their actions')
  // 5. Prompts show the player's keys.
  const hint = await ev(() => document.getElementById('hint')?.innerText ?? '')
  console.log('hint:', hint)
  if (!/R jump/.test(hint.replace(/\s+/g, ' '))) fail('the hint still shows the old keys')
  // 6. Kept across a reload; then reset.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await ready()
  await page.keyboard.down('KeyR')
  const kept = await ev(() => window.__g.input.held('Space'))
  await page.keyboard.up('KeyR')
  await ev(() => window.__g.pause.show())
  await page.waitForTimeout(300)
  await page.locator('button.pause-resetkeys').click()
  const reset = { use: await keyOf('Climb, take, use'), jump: await keyOf('Jump, glide') }
  await ev(() => window.__g.pause.resume())
  console.log('kept after reload:', kept, 'reset:', JSON.stringify(reset))
  if (!kept) fail('the keys were not kept across a reload')
  if (reset.use !== 'E' || reset.jump !== 'Space') fail('reset did not restore the keys')

  // 7. A pad: the left stick part-way walks (slower than full), the right stick looks.
  const pad = await ev(async () => {
    const g = window.__g
    const fake = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), connected: true }
    navigator.getGamepads = () => [fake]
    const walk = async (ly, ms) => {
      fake.axes[1] = ly
      const a = g.player()
      await new Promise((r) => setTimeout(r, ms))
      fake.axes[1] = 0
      const b = g.player()
      return Math.hypot(b.x - a.x, b.z - a.z)
    }
    await walk(-1, 300)
    const full = await walk(-1, 1500)
    await new Promise((r) => setTimeout(r, 600))
    await walk(-0.45, 300)
    const part = await walk(-0.45, 1500)
    const yaw0 = g.rig.yaw
    fake.axes[2] = 0.9
    await new Promise((r) => setTimeout(r, 500))
    fake.axes[2] = 0
    const turned = g.rig.yaw - yaw0
    // A (button 0): a jump.
    fake.buttons[0] = { pressed: true, value: 1 }
    await new Promise((r) => setTimeout(r, 120))
    const up = g.wanderer.vel.y
    fake.buttons[0] = { pressed: false, value: 0 }
    await new Promise((r) => setTimeout(r, 1200))
    // Start opens the pause; the d-pad moves the focus; B goes on.
    const tap = async (i) => {
      fake.buttons[i] = { pressed: true, value: 1 }
      await new Promise((r) => setTimeout(r, 80))
      fake.buttons[i] = { pressed: false, value: 0 }
      await new Promise((r) => setTimeout(r, 80))
    }
    await tap(9)
    const opened = g.pause.open || `no (opening ${g.opening}, tool ${g.toolMode})`
    await tap(13)
    await tap(13)
    const focused = document.activeElement?.className || document.activeElement?.tagName
    await tap(1)
    const closed = !g.pause.open
    return { full: +full.toFixed(1), part: +part.toFixed(1), turned: +turned.toFixed(2), jumpVel: +up.toFixed(1), opened, focused, closed }
  })
  console.log('pad:', JSON.stringify(pad))
  if (!(pad.full > 3) || !(pad.part > 0.5 && pad.part < pad.full * 0.8)) fail('the pad stick does not walk, or part-way is not slower')
  if (!(Math.abs(pad.turned) > 0.2)) fail('the right stick does not look')
  if (!(pad.jumpVel > 1)) fail('A does not jump')
  if (pad.opened !== true || !pad.closed || !/pause-bindkey/.test(pad.focused ?? '')) fail('the pad cannot open, move about and leave the pause page')
  if (errors.length) fail('page errors: ' + errors.join(' | '))
} catch (e) {
  fail(e.message)
}
await browser.close()
console.log(failed ? 'FAIL' : 'PASS keys')
process.exit(failed ? 1 : 0)
