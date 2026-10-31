// The First Ones' trails. "Where they walked, valleys formed... where they
// wept, oceans appeared." A fresh world is not dry: long ago, giants crossed
// these plains, and their trails remain — chains of old footprint lakes,
// joined (where they dragged their feet) by channels that are rivers now.
// They are made with the very same gait, kernels and water as the living
// giants, then left to grow over (no fresh-earth marks, plants regrow).
// The old villages are founded on their shores.

import { inHall, mulberry32, SPREAD, titanBody, TitanGait, TITAN_SPAWNS, type GaitEvent } from '@titans/shared'

export interface AncientTrail {
  events: GaitEvent[]
}

/**
 * Lay out `count` ancient trails, deterministically from the seed: each
 * starts in the valley and arcs round the start, inside the ring of cliffs,
 * staying on low ground and off the start itself.
 */
export function ancientTrails(seed: number, height: number, heightAt: (x: number, z: number) => number, count = 3, steps = 16): AncientTrail[] {
  const rand = mulberry32(seed ^ 0x0a11ce5)
  const out: AncientTrail[] = []
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2 + rand() * 0.9
    const r = (400 + rand() * 180) * SPREAD
    const x0 = Math.cos(a) * r
    const z0 = Math.sin(a) * r
    // Roughly round spawn (tangential), a little in or out.
    const gait = new TitanGait(titanBody(height), x0, z0, Math.atan2(Math.cos(a), Math.sin(a)) + Math.PI / 2 + (rand() - 0.5) * 0.7)
    gait.plough = rand() < 0.75 // most dragged their feet: rivers between the lakes
    const phase = rand() * 6
    const bend = 0.25 + rand() * 0.3
    // Which way round the start it walks (the way it set out).
    const dir = Math.sign(Math.cos(a) * Math.cos(gait.heading) - Math.sin(a) * Math.sin(gait.heading)) || 1
    const events: GaitEvent[] = []
    const tick: GaitEvent[] = []
    let t = 0
    while (gait.steps < steps && t < 6000) {
      tick.length = 0
      // Hold the circle round the start, wander a little, turn from rising ground.
      const d = Math.hypot(gait.x, gait.z) || 1
      const rx = gait.x / d
      const rz = gait.z / d
      const inward = Math.max(-0.8, Math.min(0.8, (d - r) * 0.004))
      const want = Math.atan2(-rz * dir - rx * inward, rx * dir - rz * inward)
      let turn = Math.atan2(Math.sin(want - gait.heading), Math.cos(want - gait.heading)) * 1.5 + bend * Math.sin(phase + t * 0.004) * 0.4
      const ahead = 120
      const l = heightAt(gait.x + Math.sin(gait.heading + 0.5) * ahead, gait.z + Math.cos(gait.heading + 0.5) * ahead)
      const rr = heightAt(gait.x + Math.sin(gait.heading - 0.5) * ahead, gait.z + Math.cos(gait.heading - 0.5) * ahead)
      turn += Math.max(-0.6, Math.min(0.6, (rr - l) * 0.03))
      // Wide of where the living giants stand: their ground is not old craters.
      for (const s of TITAN_SPAWNS) {
        const sx = s.x - gait.x
        const sz = s.z - gait.z
        const sd = Math.hypot(sx, sz)
        if (sd > 520 * SPREAD) continue
        // Which side the spawn is on, relative to the heading: turn the other way.
        const side = Math.sin(gait.heading) * sz - Math.cos(gait.heading) * sx
        turn += (side > 0 ? 1 : -1) * 1.4 * (1 - sd / 520)
      }
      gait.step(0.1, { forward: 1, turn: Math.max(-1, Math.min(1, turn)) }, tick)
      t++
      let stop = false
      for (const ev of tick) {
        const x = ev.type === 'drag' ? ev.bx : ev.x
        const z = ev.type === 'drag' ? ev.bz : ev.z
        // Keep to the valley floor (inside the escarpment), off the start.
        const d = Math.hypot(x, z)
        if (heightAt(x, z) > 95 || d < 250 * SPREAD || d > 900 * SPREAD || inHall(x, z, 120) || TITAN_SPAWNS.some((s) => Math.hypot(s.x - x, s.z - z) < 260)) stop = true
      }
      if (stop) break
      events.push(...tick)
    }
    if (events.some((e) => e.type === 'footfall')) out.push({ events })
  }
  return out
}
