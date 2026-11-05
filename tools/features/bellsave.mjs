// The bells across a save (#7): wake all three, save, reload — the stone is down, the stair is out,
// the head has risen (and the sand is dug from its mouth), and each trinket is there to take.
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(m.text())); page.on('pageerror', (e) => errs.push(e.message))
const ready = () => page.waitForFunction('window.__g && window.__g.ready === true', null, { timeout: 240000 })
await page.goto('http://localhost:4317/', { waitUntil: 'domcontentloaded' })
await ready()
await page.evaluate(() => {
  const g = window.__g
  g.finds.find('bag')
  for (const b of g.sunkBells.bells) { b.woken = true; g.sunkBells.onWake(b) }
})
// (Saved straight away: the changes are still under way — the save must still bring them done.)
await page.waitForTimeout(1500)
await page.evaluate(() => window.__g.saveLocal())
await page.goto('http://localhost:4317/', { waitUntil: 'domcontentloaded' })
await ready()
await page.waitForTimeout(1500)
const r = await page.evaluate(() => {
  const g = window.__g, near = (p) => { const s = g.spots.spots.find((x) => x.id === p); return s ? !s.hidden : null }
  const h = g.duneHead, st = g.woodStair
  const c = Math.cos(h.f.rot), s = Math.sin(h.f.rot)
  const mouth = g.heightAt(h.f.x + 6 * s, h.f.z + 6 * c) - (h.f.y + 1)
  return {
    woken: g.sunkBells.save(),
    stoneDown: Math.abs(g.skyStone.y - g.bellDescent.y1) < 0.5,
    stairOut: !!st && st.slabs.every((x) => x.ext === 1),
    headUp: Math.abs(h.f.y - (h.f.mesh ? h.f.mesh.position.y : h.f.y)) < 0.01 && !h.running,
    mouthSand: +mouth.toFixed(2),
    shown: { sky: near('sky-green'), stair: near('stair-wood'), head: near('head-dunes') },
  }
})
const pass = r.woken.length === 3 && r.stoneDown && r.stairOut && r.headUp && r.mouthSand < 0.2 && r.shown.sky && r.shown.stair && r.shown.head
console.log(`${pass ? 'ok  ' : 'FAIL'} bellsave: ${JSON.stringify(r)}`)
console.log('errors:', errs.join(' | ') || 'none')
await browser.close()
if (!pass || errs.length) process.exit(1)
