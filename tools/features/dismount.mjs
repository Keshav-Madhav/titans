// Getting off a giant: standing on its back, E; climbing its leg, E; climbing, Space. Each must end on
// the ground (not caught again on the giant) within a few seconds.
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 640, height: 400 } })
const errs = []; page.on('pageerror', (e) => errs.push(e.message))
await page.goto('http://localhost:4317/?offline', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__g && window.__g.ready === true', null, { timeout: 240000 })
const press = async (k) => { await page.evaluate((k) => { const g = window.__g; g.input.press(k); g.frames(2); g.input.release(k) }, k) }
const after = () => page.evaluate(() => { const g = window.__g; let onGround = false, caught = false, why = ''; for (let i = 0; i < 900; i++) { g.frames(1); if (g.climbState().active && !caught) { caught = true; why = 'frame ' + i } const w = g.wanderer; if (w.grounded && !g.climbState().active && w.pos.y < g.heightAt(w.pos.x, w.pos.z) + 0.5) { onGround = true; break } } return { onGround, caughtAgain: caught, why, y: +(g.wanderer.pos.y - g.heightAt(g.wanderer.pos.x, g.wanderer.pos.z)).toFixed(1) } })
const out = {}
// 1. Standing on its back (the shrine's slab).
await page.evaluate(() => { const g = window.__g, t = g.titan, torso = t.part('torso'); const slab = torso.lumps.find((l) => l.p === 8); const top = slab.c.clone().add(new g.THREE.Vector3(0, slab.r.y, 0)).applyMatrix4(torso.mesh.matrixWorld); g.wanderer.place(top.x, top.y + 3, top.z); g.wanderer.vel.set(0, 0, 0); g.frames(90) })
out.standing = await page.evaluate(() => window.__g.climbState().standing)
await press('KeyE')
out.backE = await after()
// 2. Climbing a leg: E.
await page.evaluate(() => { const g = window.__g; g.frames(5); g.grabTitan(); g.frames(2); g.input.press('KeyW'); g.frames(90); g.input.release('KeyW'); g.frames(2) })
out.climbing = await page.evaluate(() => window.__g.climbState().active)
await press('KeyE')
out.legE = await after()
// 3. Climbing a leg: Space (leap off).
await page.evaluate(() => { const g = window.__g; g.frames(5); g.grabTitan(); g.frames(2); g.input.press('KeyW'); g.frames(90); g.input.release('KeyW'); g.frames(2) })
await press('Space')
out.legSpace = await after()
const pass = out.backE.onGround && out.legE.onGround && out.legSpace.onGround
console.log(`${pass ? 'ok  ' : 'FAIL'} dismount: ${JSON.stringify(out)}`)
console.log('errors:', errs.join(' | ') || 'none')
await browser.close()
if (!pass) process.exit(1)
