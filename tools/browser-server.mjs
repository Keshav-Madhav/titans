// One headless Chrome for a whole gate sweep: launched once, its endpoint written to <file>,
// alive until this process is stopped (SIGTERM/SIGINT) or the process that started it is gone.
//   node tools/browser-server.mjs <endpoint-file>
import { chromium } from 'playwright-core'
import { writeFileSync, rmSync } from 'node:fs'
import { ARGS } from './browser.mjs'

const file = process.argv[2]
if (!file) throw new Error('usage: node tools/browser-server.mjs <endpoint-file>')
const server = await chromium.launchServer({ channel: 'chrome', headless: true, args: ARGS })
writeFileSync(file, server.wsEndpoint())
let closing = false
const stop = async () => {
  if (closing) return
  closing = true
  rmSync(file, { force: true })
  await server.close().catch(() => {})
  process.exit(0)
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
// Never outlive the sweep (killed outright, its trap never ran): orphaned, we stop too.
const parent = process.ppid
setInterval(() => {
  try {
    process.kill(parent, 0)
    if (process.ppid !== parent) stop()
  } catch {
    stop()
  }
}, 2000)
