// Evaluate an expression against a ready game and print the JSON result.
//   node tools/eval.mjs "<js expression using g = window.__g>" [url]
import { chromium } from 'playwright-core'
const expr = process.argv[2] ?? 'g.stats()'
const url = process.argv[3] ?? 'http://localhost:4317/?offline'
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--ignore-gpu-blocklist'] })
const page = await b.newPage({ viewport: { width: 1280, height: 760 } })
page.on('pageerror', (e) => console.error('[pageerror]', e.message))
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
await page.waitForFunction('window.__g && window.__g.ready === true', null, { timeout: 120000 })
const out = await page.evaluate(`(async () => { const g = window.__g; return (${expr}) })()`)
console.log(JSON.stringify(out, null, 1))
await b.close()
