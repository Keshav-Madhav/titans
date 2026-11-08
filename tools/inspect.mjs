// Inspection: drop the wanderer at random spots in every land (seeded, so the
// same spots each run) and shoot what a player would see from the normal
// camera — then tile them into contact sheets to look over for flaws.
//
//   node tools/inspect.mjs [out-dir] [per-land] [seed] [weather] [url]
//
// Writes <out-dir>/<land>-<n>.png and <out-dir>/sheet-<land>.jpg.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const out = process.argv[2] ?? 'shots/inspect'
const per = Number(process.argv[3] ?? 8)
const seed = Number(process.argv[4] ?? 1)
const weather = process.argv[5] ?? 'overcast'
const url = process.argv[6] ?? 'http://localhost:4317/?offline'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-gl=angle', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
await page.waitForFunction('window.__g && window.__g.ready === true', null, { timeout: 120000 })
await page.evaluate((w) => window.__g.weather.set(w, true), weather)

const lands = ['valley', 'forest', 'desert', 'ruins']
for (const land of lands) {
  const files = []
  for (let n = 0; n < per; n++) {
    const spot = await page.evaluate(([land, n, seed]) => {
      const g = window.__g
      let s = (seed * 7919 + n * 104729 + land.length * 31337) >>> 0
      const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
      for (let tries = 0; tries < 400; tries++) {
        const a = rand() * Math.PI * 2
        const d = (land === 'valley' ? 100 + rand() * 800 : 700 + rand() * 1900) * 2.6 // × SPREAD
        const x = Math.cos(a) * d
        const z = Math.sin(a) * d
        if (g.terrain.base.regions.name(x, z) !== land) continue
        if (g.lakes.lakes.some((l) => l.level > g.heightAt(x, z) && Math.abs(l.basin.bx - x) < 200 && Math.abs(l.basin.bz - z) < 200)) continue
        if (g.rocks.sdfAt && g.rocks.sdfAt(x, g.heightAt(x, z) + 1, z) < 1) continue
        g.teleport(x, z)
        const yaw = rand() * Math.PI * 2
        g.lookFrom(null)
        g.rig.setProfile({ minDist: 2, maxDist: 4000, dist: 7, focusHeight: 1.5, follow: 10 })
        g.setCam(yaw, 0.08 + rand() * 0.25, 7)
        return { x: Math.round(x), z: Math.round(z), h: Math.round(g.heightAt(x, z)) }
      }
      return null
    }, [land, n, seed])
    if (!spot) continue
    await page.waitForFunction(() => window.__g.terrainView.settled(), null, { timeout: 60000 })
    await page.waitForTimeout(700)
    const f = `${out}/${land}-${n}.png`
    await page.screenshot({ path: f })
    files.push([f, `${land} ${n}  (${spot.x}, ${spot.z}) h${spot.h}`])
  }
  // A contact sheet: two columns, labelled.
  execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image, ImageDraw
items = [a.split('|', 1) for a in sys.argv[2:]]
W, H = 640, 380
cols = 2
rows = (len(items) + cols - 1) // cols
sheet = Image.new('RGB', (cols * W, rows * H), (20, 20, 20))
d = ImageDraw.Draw(sheet)
for i, (f, label) in enumerate(items):
    im = Image.open(f).convert('RGB').resize((W, H))
    x, y = (i % cols) * W, (i // cols) * H
    sheet.paste(im, (x, y))
    d.rectangle([x, y, x + 300, y + 18], fill=(0, 0, 0))
    d.text((x + 4, y + 3), label, fill=(255, 255, 255))
sheet.save(sys.argv[1], quality=85)
`, `${out}/sheet-${land}.jpg`, ...files.map(([f, l]) => `${f}|${l}`)])
  console.log(`${land}: ${files.length} spots → ${out}/sheet-${land}.jpg`)
}
if (errors.length) console.log('errors:', errors.slice(0, 5).join(' | '))
await browser.close()
