// The headless Chrome every tool drives (ANGLE on the real GPU).
//
// Alone, a tool launches its own. Under tools/gates.sh one browser is launched once
// (tools/browser-server.mjs) and every gate connects to it with TITANS_BROWSER_WS; each gate then
// works in its own fresh browser context — its own storage, cache and pages, as clean as a new
// browser — and closing the connection closes that context, never the shared browser.
import { chromium } from 'playwright-core'

export const ARGS = ['--use-gl=angle', '--ignore-gpu-blocklist']

/** A browser to open contexts/pages on: the shared one when there is one, else a launch of our own. */
export async function launch(extraArgs = []) {
  const ws = process.env.TITANS_BROWSER_WS
  // (A gate that needs other browser flags — sfx's autoplay — always launches its own.)
  if (ws && extraArgs.length === 0) {
    try {
      return await chromium.connect(ws, { timeout: 30000 })
    } catch (e) {
      // The shared browser is gone: carry on in a browser of our own (still one at a time).
      console.log(`[browser] shared browser unreachable (${e.message.split('\n')[0]}); launching one`)
    }
  }
  return chromium.launch({ channel: 'chrome', headless: true, args: [...ARGS, ...extraArgs] })
}
