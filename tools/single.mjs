// Single player is the default, and it remembers.
//   1. A fresh visit is single player (no network), and the Titans wander by themselves.
//   2. Walk a Titan, reload: the same craters at every footfall, the Titan where it stood
//      (sat down, since you left while walking it).
//   3. Pretend you were away for hours: it slept, and is a mountain with your name.
//   4. The world panel switches to multiplayer (and back).
//   npm run preview (4317); npm run server (2567) for step 4.    node tools/single.mjs
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

mkdirSync('shots', { recursive: true })
let failed = false
const fail = (m) => {
  failed = true
  console.error('SINGLE GATE FAILED:', m)
}
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext({ viewport: { width: 1100, height: 680 } })
let page = await ctx.newPage()
page.on('pageerror', (e) => console.error('[pageerror]', e.message))
const ready = (m = 'offline') => page.waitForFunction((m) => window.__g && window.__g.ready === true && window.__g.mode === m, m, { timeout: 120000 })
const ev = (f, a) => page.evaluate(f, a)

try {
  await page.goto('http://localhost:4317/', { waitUntil: 'domcontentloaded', timeout: 120000 })
  await ready()
  const chip = await ev(() => document.getElementById('net').textContent)
  console.log(`fresh visit: mode ${await ev(() => window.__g.mode)}, chip "${chip}", saving ${await ev(() => window.__g.localSave)}`)
  if (!chip.includes('single player')) fail('not single player by default')
  const tip0 = await ev(() => ({ shown: getComputedStyle(document.getElementById('tips')).display, step: window.__g.tips.current }))
  // A real click: the first gesture starts the sound (browsers insist).
  await page.mouse.click(550, 400)
  await page.waitForTimeout(300)
  const audio = await ev(() => ({ running: window.__g.sound.running, on: window.__g.sound.enabled }))
  console.log(`first hint shown: ${tip0.shown === 'flex'} (step ${tip0.step}); sound started on the first click: ${audio.running}, on: ${audio.on}`)
  if (tip0.shown !== 'flex' || tip0.step !== 0) fail('no first hint')
  if (!audio.running) fail('sound did not start on the first click')
  // Walk a little: the first hint is done.
  await ev(() => {
    window.__g.input.press('KeyW')
    window.__g.input.press('ShiftLeft')
  })
  await page.waitForTimeout(4000)
  await ev(() => {
    window.__g.input.release('KeyW')
    window.__g.input.release('ShiftLeft')
  })
  await page.waitForTimeout(700)
  console.log(`after a walk, hint step ${await ev(() => window.__g.tips.current)}`)

  // Left alone, the Titans wander (the wild mind runs offline too).
  await ev(() => (window.__g.clock.scale = 10))
  await page.waitForFunction(() => [...window.__g.titans.values()].some((a) => a.titan.gait.steps >= 2), null, { timeout: 60000 }).catch(() => fail('the Titans did not wander'))
  await ev(() => (window.__g.clock.scale = 1))

  // Walk a Titan.
  await ev(() => window.__g.toggleRole('t1'))
  await ev(() => {
    window.__g.clock.scale = 8
    window.__g.input.press('KeyW')
  })
  await page.waitForFunction(() => window.__g.titans.get('t1').titan.gait.steps >= 6, null, { timeout: 60000 })
  await ev(() => {
    window.__g.input.release('KeyW')
    window.__g.clock.scale = 1
  })
  await page.waitForFunction(() => window.__g.titans.get('t1').titan.gait.speed === 0, null, { timeout: 30000 })
  const before = await ev(() => {
    const g = window.__g
    // Freeze the world (the other Titan wanders), so what we measure is what is saved.
    g.clock.scale = 0
    g.saveLocal()
    const t = g.titans.get('t1').titan.gait
    return { falls: g.falls.slice(), depth: g.falls.map((q) => +g.deltaAt(q.x, q.z).toFixed(3)), x: t.x, z: t.z, saved: g.savedEvents(), name: g.identity.name }
  })
  console.log(`walked: ${before.falls.length} footfalls, ${before.saved} events saved`)

  // Reload: the same world.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await ready()
  const after = await ev((pts) => {
    const g = window.__g
    const t = g.titans.get('t1').titan.gait
    // Our trail's lakes (the other Titan, wandering, is still making and re-flooding its own).
    const t2 = g.titans.get('t2')?.titan.gait
    const ours = g.lakes.lakes
      .filter((l) => Math.hypot(l.basin.bx - t.x, l.basin.bz - t.z) < 400 && (!t2 || Math.hypot(l.basin.bx - t2.x, l.basin.bz - t2.z) > 300))
      .map((l) => l.id)
    return { depth: pts.map((q) => +g.deltaAt(q.x, q.z).toFixed(3)), x: t.x, z: t.z, resting: t.resting, lakes: g.lakeStats().filter((l) => ours.includes(l.id)) }
  }, before.falls)
  const same = JSON.stringify(after.depth) === JSON.stringify(before.depth)
  console.log(`reloaded: craters identical ${same}; Titan ${Math.hypot(after.x - before.x, after.z - before.z).toFixed(2)} m from where it stood, sitting ${after.resting}; lakes ${after.lakes.filter((l) => l.full).length}/${after.lakes.length} full`)
  if (!same) {
    before.depth.forEach((v, i) => {
      if (v !== after.depth[i]) console.log('  differs at', JSON.stringify(before.falls[i]), v, '→', after.depth[i])
    })
    fail('the world changed across a reload')
  }
  if (Math.hypot(after.x - before.x, after.z - before.z) > 0.5 || !after.resting) fail('the Titan is not where (or how) we left it')
  // Rain filled them while we were away (a Titan still wandering may be making new ones).
  if (after.lakes.length === 0 || after.lakes.some((l) => !l.full)) {
    console.log('  lakes after reload:', JSON.stringify(after.lakes))
    fail('our lakes came back part-filled')
  }

  // Build by hand: found a town beside the lake (B, pick, aim, click), reload, it is still there.
  const town = await ev(async () => {
    const g = window.__g
    const lake = [...g.lakes.lakes].sort((a, b) => b.basin.sorted.length - a.basin.sorted.length)[0]
    // Near the lake but well above its rising water: nothing wet within 20 m.
    let spot = null
    search: for (let d = 30; d <= 150; d += 4) {
      for (let a = 0; a < 24; a++) {
        const x = lake.basin.bx + Math.cos((a / 24) * Math.PI * 2) * d
        const z = lake.basin.bz + Math.sin((a / 24) * Math.PI * 2) * d
        if (g.settlement.whyNot('house', x, z)) continue
        let dry = true
        for (let k = 0; k < 8 && dry; k++) for (const r of [10, 20]) if (g.settlement.wet(x + Math.cos(k * 0.785) * r, z + Math.sin(k * 0.785) * r)) dry = false
        if (dry) {
          spot = { x, z }
          break search
        }
      }
    }
    spot ??= g.findSpot('house', lake.basin.bx, lake.basin.bz, 140)
    // Stand 12 m from the spot on dry ground at about its height, looking at it:
    // the centre of the view lands on it.
    const sh = g.heightAt(spot.x, spot.z)
    // Stand on the dry side, away from the lake, looking toward the water:
    // a crater rim between us and the spot would hide it.
    let face = Math.atan2(lake.basin.bx - spot.x, lake.basin.bz - spot.z)
    for (let a = 0; a < 16; a++) {
      const ang = face + ((a % 2 ? 1 : -1) * Math.ceil(a / 2) * Math.PI) / 16
      const sx = spot.x - Math.sin(ang) * 12
      const sz = spot.z - Math.cos(ang) * 12
      if (!g.settlement.wet(sx, sz) && Math.abs(g.heightAt(sx, sz) - sh) < 1.5) {
        face = ang
        break
      }
    }
    g.teleport(spot.x - Math.sin(face) * 12, spot.z - Math.cos(face) * 12)
    g.input.press('KeyB')
    await new Promise((r) => setTimeout(r, 100))
    g.input.release('KeyB')
    g.input.press('Digit2')
    await new Promise((r) => setTimeout(r, 100))
    g.input.release('Digit2')
    // Aim: camera behind, looking toward the spot; sweep the pitch and settle
    // on the one whose aim lands nearest the spot.
    g.rig.yaw = face + Math.PI
    const ghostOf = () => g.settlement.group.children.find((c) => c.children.length && c.children[0].material?.transparent && c.visible)
    let bestPitch = 0.1
    let best = Infinity
    for (let pitch = 0.04; pitch < 0.6; pitch += 0.008) {
      g.rig.pitch = pitch
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const ghost = ghostOf()
      const d = ghost ? Math.hypot(ghost.position.x - spot.x, ghost.position.z - spot.z) : Infinity
      if (d < best) {
        best = d
        bestPitch = pitch
      }
    }
    g.rig.pitch = bestPitch
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))
    const before = g.settlement.buildings.length
    const ghost = ghostOf()
    const aimedAt = ghost ? { x: ghost.position.x, z: ghost.position.z, red: ghost.children[0].material.color.getHex() !== 0x7fe08a } : null
    g.input.click()
    await new Promise((r) => setTimeout(r, 200))
    const byHand = g.settlement.buildings.length - before
    g.input.press('KeyB')
    await new Promise((r) => setTimeout(r, 100))
    g.input.release('KeyB')
    // Two more by the API, so the town is worth reloading.
    for (const kind of ['hut', 'well']) {
      const s = g.findSpot(kind, spot.x, spot.z, 60)
      if (s) g.build(kind, s.x, s.z)
    }
    g.saveLocal()
    return { name: g.settlement.name, byHand: byHand === 1, aimedAt, spot, n: g.settlement.buildings.length, folk: g.townsfolk.folk.length, said: document.getElementById('chat-log').textContent.slice(-160) }
  })
  console.log(`built by hand (B, 2, aim, click): ${town.byHand}; ${town.name} has ${town.n} buildings, ${town.folk} townsfolk`)
  if (!town.byHand || !town.name) fail(`could not build by hand: aimed ${JSON.stringify(town.aimedAt)} at ${JSON.stringify(town.spot)}; game said: ${town.said}`)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await ready()
  const back = await ev(() => ({ name: window.__g.settlement.name, n: window.__g.settlement.buildings.length, folk: window.__g.townsfolk.folk.length }))
  console.log(`reloaded: ${back.name} with ${back.n} buildings and ${back.folk} townsfolk`)
  if (back.name !== town.name || back.n !== town.n) fail('the town did not survive a reload')
  await page.waitForTimeout(700)
  const tipEnd = await ev(() => ({ step: window.__g.tips.current, shown: getComputedStyle(document.getElementById('tips')).display }))
  console.log(`hints after walking, a Titan, lakes and a town: step ${tipEnd.step}, card ${tipEnd.shown}`)
  if (tipEnd.step !== 4 || tipEnd.shown !== 'none') fail('the hints did not run their course')

  // Away for hours: close the tab (it saves on the way out), let every clock
  // in the save run six hours, open the game again.
  await page.close()
  page = await ctx.newPage()
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))
  await page.addInitScript(() => {
    if (sessionStorage.getItem('aged')) return
    sessionStorage.setItem('aged', '1')
    const d = JSON.parse(localStorage.getItem('titans.world.v1'))
    const h6 = 6 * 3600 * 1000
    d.savedAt -= h6
    for (const t of Object.values(d.titans)) if (t.aloneSince) t.aloneSince -= h6
    localStorage.setItem('titans.world.v1', JSON.stringify(d))
  })
  await page.goto('http://localhost:4317/', { waitUntil: 'domcontentloaded', timeout: 120000 })
  await ready()
  const away = await ev(() => ({
    mountains: window.__g.mountains.count,
    names: Object.values(window.__g.mountains.infos()).map((m) => m.name),
    t1: window.__g.titans.get('t1').titan.gait.steps,
  }))
  console.log(`after hours away: ${away.mountains} mountain(s) named ${JSON.stringify(away.names)}; slot 1 woke a new Titan (${away.t1} steps)`)
  if (away.mountains < 1 || !away.names.includes(before.name)) fail('the Titan we left did not become our mountain')

  // The world panel switches to multiplayer and back.
  await page.waitForTimeout(900) // the loading veil fades for 0.8 s
  await ev(() => document.getElementById('net').click())
  // Sound off from the panel, at once.
  await ev(() => document.getElementById('menu-sound').click())
  const soundOff = await ev(() => window.__g.sound.enabled)
  await ev(() => document.getElementById('menu-sound').click())
  console.log(`panel sound toggle: off → ${soundOff === false}, back on → ${await ev(() => window.__g.sound.enabled)}`)
  if (soundOff !== false) fail('the sound switch did nothing')
  const open = await ev(() => getComputedStyle(document.getElementById('menu')).display)
  await page.screenshot({ path: 'shots/single-menu.png' })
  await ev(() => {
    document.getElementById('menu-mp').click()
    document.getElementById('menu-apply').click()
  })
  await page.waitForFunction(() => window.__g && window.__g.ready === true && window.__g.mode !== 'connecting', null, { timeout: 120000 })
  const mpMode = await ev(() => window.__g.mode)
  await ev(() => {
    document.getElementById('menu-sp').click()
    document.getElementById('menu-apply').click()
  })
  await ready()
  console.log(`panel ${open}; switched to multiplayer → ${mpMode}; back to single player → ${await ev(() => window.__g.mode)}`)
  if (open !== 'block' || mpMode !== 'online') fail('the world panel did not switch to multiplayer')
  if (!failed) console.log('SINGLE GATE PASSED')
} finally {
  await browser.close()
  if (failed) process.exitCode = 1
}
