// Quick look: screenshot the page as-is after ready (optionally with a query string).
//   node tools/look.mjs [name] [query]
import { chromium } from 'playwright-core'
const name = process.argv[2] ?? 'look'
const q = process.argv[3] ?? ''
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-gl=angle', '--ignore-gpu-blocklist'] })
const page = await b.newPage({ viewport: { width: 1280, height: 760 } })
page.on('pageerror', (e) => console.error('[pageerror]', e.message))
await page.goto('http://localhost:4317/' + q, { waitUntil: 'domcontentloaded', timeout: 120000 })
await page.waitForFunction('window.__g && window.__g.ready === true', null, { timeout: 120000 })
await page.waitForTimeout(1200)
await page.screenshot({ path: `shots/${name}.png` })
console.log(`shots/${name}.png`)
await b.close()
