// The First Ones' trails. "Where they walked, valleys formed... where they
// wept, oceans appeared." A fresh world is not dry: long ago, giants crossed
// these plains, and their trails remain — chains of old footprint lakes,
// joined (where they dragged their feet) by channels that are rivers now.
// They are made with the very same gait, kernels and water as the living
// giants, then left to grow over (no fresh-earth marks, plants regrow).
// The old villages are founded on their shores.

import { mulberry32, titanBody, TitanGait, type GaitEvent } from '@titans/shared'

export interface AncientTrail {
  events: GaitEvent[]
}

/**
 * Lay out `count` ancient trails, deterministically from the seed: each
 * starts out on the plain and arcs round spawn, staying on low ground and
 * off the start.
 */
export function ancientTrails(seed: number, height: number, heightAt: (x: number, z: number) => number, count = 3, steps = 16): AncientTrail[] {
  const rand = mulberry32(seed ^ 0x0a11ce5)
  const out: AncientTrail[] = []
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2 + rand() * 0.9
    const r = 650 + rand() * 550
    const x0 = Math.cos(a) * r
    const z0 = Math.sin(a) * r
    // Roughly round spawn (tangential), a little in or out.
    const gait = new TitanGait(titanBody(height), x0, z0, Math.atan2(Math.cos(a), Math.sin(a)) + Math.PI / 2 + (rand() - 0.5) * 0.7)
    gait.plough = rand() < 0.75 // most dragged their feet: rivers between the lakes
    const phase = rand() * 6
    const bend = 0.25 + rand() * 0.3
    const events: GaitEvent[] = []
    const tick: GaitEvent[] = []
    let t = 0
    while (gait.steps < steps && t < 4000) {
      tick.length = 0
      gait.step(0.1, { forward: 1, turn: bend * Math.sin(phase + t * 0.004) }, tick)
      t++
      let stop = false
      for (const ev of tick) {
        const x = ev.type === 'drag' ? ev.bx : ev.x
        const z = ev.type === 'drag' ? ev.bz : ev.z
        // Keep to the low plains, and off the place everyone starts.
        if (heightAt(x, z) > 55 || Math.hypot(x, z) < 320) stop = true
      }
      if (stop) break
      events.push(...tick)
    }
    if (events.some((e) => e.type === 'footfall')) out.push({ events })
  }
  return out
}
