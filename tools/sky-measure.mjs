// Measure the sky colour around the horizon (by angle from the sun), to tune against the reel.
//   node tools/sky-measure.mjs [query] [uniforms-json]
import { chromium } from 'playwright-core'
import { execSync } from 'node:child_process'
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-gl=angle'] })
const page = await b.newPage({ viewport: { width: 800, height: 500 } })
await page.goto('http://localhost:4317/?offline' + (process.argv[2] ?? ''), { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__g && window.__g.ready === true, null, { timeout: 120000 })
await page.waitForTimeout(900)
const P = JSON.parse(process.argv[3] ?? '{}')
await page.evaluate((p) => { const u = window.__g.sky.sky.material.uniforms; for (const [k, v] of Object.entries(p)) u[k].value = v }, P)
const sun = await page.evaluate(() => { const s = window.__g.sky.sunDir; return Math.atan2(s.x, s.z) })
for (let k = 0; k < 8; k++) {
  const yaw = (k / 8) * Math.PI * 2
  // pitch -0.2: gaze tilted up ~0.29 rad; the centre strip sits ~20° up
  await page.evaluate((yaw) => window.__g.setCam(yaw, -0.2, 6), yaw)
  await page.waitForTimeout(250)
  await page.screenshot({ path: '/tmp/sky.png', clip: { x: 300, y: 100, width: 200, height: 40 } })
  const rgb = execSync(`ffmpeg -v error -i /tmp/sky.png -vf scale=1:1 -f rawvideo -pix_fmt rgb24 - | od -An -tu1`).toString().trim()
  // camera looks along -(sin yaw, cos yaw)
  const look = Math.atan2(-Math.sin(yaw), -Math.cos(yaw))
  let d = look - sun
  d = Math.atan2(Math.sin(d), Math.cos(d))
  console.log(`${((d * 180) / Math.PI).toFixed(0).padStart(5)}° from the sun → ${rgb}`)
}
await b.close()
