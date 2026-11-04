// Colour vision: the map (open), the minimap and HUD, under protanopia, deuteranopia and
// tritanopia (Chrome's own emulation), tiled with the normal view, for a look: nothing
// should be told by colour alone.
//   npm run preview (4317), then: node tools/vision.mjs <outdir>
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] ?? 'shots'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } })
const cdp = await page.context().newCDPSession(page)
await page.goto('http://localhost:4317/?offline', { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__g && window.__g.ready === true, null, { timeout: 240000 })
await page.evaluate(async () => {
  const g = window.__g
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  g.weather.set('clear', true)
  for (const id of ['bag', 'line', 'sight']) g.finds.find(id)
  for (const [x, z] of [[0, 0], [0, -500], [300, 900], [-900, -600], [1200, -900], [-2500, 1700]]) {
    g.teleport(x, z)
    await wait(300)
  }
  const c = g.colossi.places.get('colonnade')
  g.wanderer.place(c.x, c.y + 300, c.z)
  await wait(400)
  g.teleport(120, 80)
  await wait(1500)
  g.hud?.news?.(true, true)
})
await page.waitForTimeout(1500)
for (const v of ['none', 'protanopia', 'deuteranopia', 'tritanopia']) {
  await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: v })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/vision-${v}-hud.png` })
  await page.evaluate(() => window.__g.worldMap.toggle())
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/vision-${v}-map.png` })
  await page.evaluate(() => window.__g.worldMap.toggle())
}
await browser.close()
console.log('vision shots in', OUT)
