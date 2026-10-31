// Lake gate, in Node (no browser): lay the First Ones' trails the way a fresh
// world does, then check the refill is quick, truly settled (more rain merges
// nothing), survives a save/restore exactly, and costs next to nothing in play.
//
//   npx tsx tools/fill-bench.ts

import { Terrain, LakeSystem, WORLD_SEED, TITAN_HEIGHT, applyDrag, dragFor, applyImpact, impactFor, applyFootprint, footprintFor, type Box, type GaitEvent } from '@titans/shared'
import { ancientTrails } from '../client/src/ancient'
import { packEvent, unpackEvent } from '../client/src/save'

const H = TITAN_HEIGHT
const terrain = new Terrain(WORLD_SEED)
const dug = (x: number, z: number) => terrain.delta.at(x, z) < -0.05
const lakes = new LakeSystem(terrain.cellHeight, undefined, dug)
const shapes = (s: LakeSystem) => s.lakes.map((l) => `${l.id}:${l.basin.sorted.length}`).join(',')
let failed = false
const fail = (why: string) => {
  console.log('LAKE GATE FAILED:', why)
  failed = true
}

// The trails, applied as main.ts applies a footfall (one onDeform per stride).
const box: Box = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity }
const grow = (b: Box) => {
  box.x0 = Math.min(box.x0, b.x0)
  box.z0 = Math.min(box.z0, b.z0)
  box.x1 = Math.max(box.x1, b.x1)
  box.z1 = Math.max(box.z1, b.z1)
}
let t0 = performance.now()
for (const trail of ancientTrails(WORLD_SEED, H, (x, z) => terrain.heightAt(x, z))) {
  for (const raw of trail.events) {
    const packed = packEvent(raw as unknown as { type: string } & Record<string, unknown>)
    const ev = (packed ? unpackEvent(packed) : raw) as GaitEvent
    if (ev.type === 'drag') {
      grow(applyDrag(terrain.delta, dragFor(H, ev.ax, ev.az, ev.bx, ev.bz)))
      continue
    }
    grow(applyImpact(terrain.delta, impactFor(H, ev.x, ev.z, ev.stomp)))
    grow(applyFootprint(terrain.delta, footprintFor(H, ev.x, ev.z, ev.hx ?? Math.sin(ev.heading), ev.hz ?? Math.cos(ev.heading), ev.stomp)))
    lakes.onDeform(box, ev.x, ev.z)
    box.x0 = box.z0 = Infinity
    box.x1 = box.z1 = -Infinity
  }
}
console.log(`trails laid: ${lakes.lakes.length} lakes, ${(performance.now() - t0).toFixed(0)} ms`)

// The refill a fresh world runs under its loading screen.
const settled = lakes.fillAll()
console.log(`refill: settled ${settled} in ${lakes.lastFillRounds} rounds, ${lakes.lastFillMs} ms; ${lakes.lakes.length} lakes, ${lakes.lakes.filter((l) => lakes.isFull(l)).length} full`)
if (!settled) fail('the refill ran out of time')

// Settled means settled: more rain changes no lake.
const before = shapes(lakes)
lakes.fillAll()
if (shapes(lakes) !== before) fail(`a settled world changed on more rain (${lakes.lastFillRounds} more rounds)`)

// Save and restore: the same lakes, full, with nothing left to merge.
const saved = lakes.save()
const again = new LakeSystem(terrain.cellHeight, undefined, dug)
t0 = performance.now()
const ok = again.restore(saved)
console.log(`restore: ${ok} in ${(performance.now() - t0).toFixed(1)} ms from ${(JSON.stringify(saved).length / 1024).toFixed(0)} KB`)
if (!ok || shapes(again) !== shapes(lakes)) fail('restored lakes differ')
const exact = again.lakes.every((l, i) => {
  const o = lakes.lakes[i].basin
  const b = l.basin
  return o.spill === b.spill && o.bottom === b.bottom && o.prefix.at(-1) === b.prefix.at(-1) && Object.is(o.ex, b.ex) && Object.is(o.ez, b.ez)
})
if (!exact) fail('restored beds, brims or exits differ')
again.fillAll()
if (shapes(again) !== shapes(lakes)) fail(`restored lakes changed on refill (${again.lastFillRounds} rounds)`)

// A minute of play at 60 fps: rain on full lakes changes nothing and costs little.
let worst = 0
t0 = performance.now()
for (let i = 0; i < 3600; i++) {
  const q = performance.now()
  again.step(1 / 60)
  worst = Math.max(worst, performance.now() - q)
}
const cpu = performance.now() - t0
console.log(`a minute of play: ${cpu.toFixed(0)} ms of lake work, worst step ${worst.toFixed(1)} ms; part-filled ${again.lakes.filter((l) => !again.isFull(l)).length}`)
if (shapes(again) !== shapes(lakes)) fail('lakes kept merging in play')
if (worst > 8) fail('a lake step took longer than half a frame')

console.log(failed ? 'LAKE GATE FAILED' : 'LAKE GATE PASSED')
process.exit(failed ? 1 : 0)
