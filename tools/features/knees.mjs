// Knees that bend backward: over 3 s of running (flat) and 2 s across a slope, frames where a knee's
// bend points behind the leg (shin in front of the thigh's line, seen from the side).
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-gl=angle', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 480, height: 320 } })
await page.goto('http://localhost:4317/?offline', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__g && window.__g.ready === true && !!window.__g.wanderer.avatar', null, { timeout: 240000 })
let bad = false
const count = async (label, keys, at) => {
  await page.evaluate((at) => { const g = window.__g; g.teleport(at[0], at[1]); g.wanderer.yaw = at[2]; g.setCam(at[2] + Math.PI, 0.15, 6); g.frames(30) }, at)
  for (const k of keys) await page.keyboard.down(k)
  const r = await page.evaluate(() => {
    const g = window.__g, w = g.wanderer, av = w.avatar, T = g.THREE
    let back = 0, n = 0, worst = 0
    const h = new T.Vector3(), k = new T.Vector3(), f = new T.Vector3()
    for (let i = 0; i < 180; i++) {
      g.frames(1)
      const fwd = new T.Vector3(0, 0, 1).applyQuaternion(w.obj.quaternion)
      for (const s of ['l', 'r']) {
        av.bone('thigh_' + s).getWorldPosition(h); av.bone('calf_' + s).getWorldPosition(k); av.bone('foot_' + s).getWorldPosition(f)
        // The knee's offset from the hip–ankle line: forward is right, backward is broken.
        const line = f.clone().sub(h).normalize()
        const off = k.clone().sub(h); off.addScaledVector(line, -off.dot(line))
        const fw = off.dot(fwd)
        n++
        if (fw < -0.015) { back++; worst = Math.min(worst, fw) }
      }
    }
    return { n, back, worst: +worst.toFixed(3) }
  })
  for (const k of keys) await page.keyboard.up(k)
  console.log(label, JSON.stringify(r))
  if (r.back) bad = true
}
await count('run flat ', ['KeyW', 'ShiftLeft'], [-600, 420, 0])
await count('walk flat', ['KeyW'], [-600, 420, 0])
const slope = await page.evaluate(() => { const g = window.__g; for (let r = 300; r < 3000; r += 40) for (let a = 0; a < 6.28; a += 0.2) { const x = Math.sin(a) * r, z = Math.cos(a) * r; const sx = (g.heightAt(x + 1, z) - g.heightAt(x - 1, z)) / 2, sz = (g.heightAt(x, z + 1) - g.heightAt(x, z - 1)) / 2; const gr = Math.hypot(sx, sz); if (gr > 0.3 && gr < 0.45 && !g.rocks.occupies(x, z)) return [x, z, Math.atan2(-sz, sx)] } })
await count('across slope', ['KeyW', 'ShiftLeft'], slope)
await browser.close()
console.log(bad ? 'FAIL knees' : 'ok   knees')
if (bad) process.exit(1)
