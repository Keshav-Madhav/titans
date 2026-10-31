// A herd (user, 2026-10-31: "smaller but big giants multiple together seeming
// like a herd"). Five giants, 120–190 m, roaming together across the open
// eastern Dune Sea: a slow drift toward a far point, each keeping its own place
// in the group and its distance from the others, the young ones near the
// middle. They pay you no attention. You can climb one, if you can catch it.

import * as THREE from 'three'
import { mulberry32, type GaitEvent, type Terrain } from '@titans/shared'
import { Titan } from './titan'

/** Where they roam: round this point, this far. */
const HOME = { x: 3000, z: 3800 }
const ROAM = 1800
const SIZES = [190, 170, 155, 135, 120]
/**
 * Their places in the group (x across, z ahead): the biggest leads, two
 * flank, the young ones keep to the middle and the back.
 */
const SLOTS = [
  { x: 0, z: 260 },
  { x: -260, z: 40 },
  { x: 250, z: -20 },
  { x: -80, z: -140 },
  { x: 110, z: -230 },
]

export class Herd {
  readonly giants: Titan[] = []
  /** Each one's place in the group, in the herd's frame (x across, z ahead). */
  private readonly slots: Array<{ x: number; z: number }> = []
  private readonly target = { x: HOME.x, z: HOME.z }
  private heading = 0
  private wait = 0
  private readonly rand: () => number
  private readonly discard: GaitEvent[] = []
  private time = 0
  /** A footfall of one of them (for dust, the ground's shake, the sound). */
  onFootfall: (x: number, z: number, H: number) => void = () => {}

  constructor(
    private readonly terrain: Terrain,
    seed: number,
  ) {
    this.rand = mulberry32(seed ^ 0x4e7d)
    SIZES.forEach((H, i) => {
      const slot = SLOTS[i]
      this.slots.push(slot)
      const t = new Titan(H, HOME.x + slot.x, HOME.z + slot.z, this.rand() * Math.PI * 2, 400 + i * 13)
      t.restBlend = 0
      this.giants.push(t)
    })
    this.pick()
  }

  /** A new far point to drift toward: open, low, not too steep. */
  private pick(): void {
    for (let tries = 0; tries < 40; tries++) {
      const a = this.rand() * Math.PI * 2
      const r = Math.sqrt(this.rand()) * ROAM
      const x = HOME.x + Math.cos(a) * r
      const z = HOME.z + Math.sin(a) * r
      if (Math.hypot(x - this.target.x, z - this.target.z) < 700) continue
      let lo = Infinity
      let hi = -Infinity
      for (let k = 0; k < 8; k++) {
        const h = this.terrain.heightAt(x + Math.cos(k * 0.785) * 250, z + Math.sin(k * 0.785) * 250)
        lo = Math.min(lo, h)
        hi = Math.max(hi, h)
      }
      if (hi - lo > 45) continue
      this.target.x = x
      this.target.z = z
      return
    }
  }

  /** Where the group is: the middle of them. */
  centre(out = new THREE.Vector2()): THREE.Vector2 {
    out.set(0, 0)
    for (const g of this.giants) out.add(new THREE.Vector2(g.gait.x, g.gait.z))
    return out.multiplyScalar(1 / this.giants.length)
  }

  private readonly c = new THREE.Vector2()

  step(dt: number): void {
    this.time += dt
    const c = this.centre(this.c)
    const dx = this.target.x - c.x
    const dz = this.target.z - c.y
    const far = Math.hypot(dx, dz)
    if (this.wait > 0) {
      this.wait -= dt
      if (this.wait <= 0) this.pick()
    } else if (far < 200) {
      // Arrived: graze a while before moving on.
      this.wait = 40 + this.rand() * 80
    } else {
      // The herd's facing turns slowly toward where it is going.
      const want = Math.atan2(dx, dz)
      let dh = want - this.heading
      dh = Math.atan2(Math.sin(dh), Math.cos(dh))
      this.heading += THREE.MathUtils.clamp(dh, -0.02 * dt, 0.02 * dt)
    }
    const moving = this.wait <= 0
    const fx = Math.sin(this.heading)
    const fz = Math.cos(this.heading)
    this.giants.forEach((g, i) => {
      const s = this.slots[i]
      // Its place: the slot, carried along by the herd (a little ahead when moving).
      const lead = moving ? 160 : 0
      const px = c.x + fz * s.x + fx * (s.z + lead)
      const pz = c.y - fx * s.x + fz * (s.z + lead)
      let sx = px - g.gait.x
      let sz = pz - g.gait.z
      // Room: push away from any that are too close.
      for (const o of this.giants) {
        if (o === g) continue
        const ox = g.gait.x - o.gait.x
        const oz = g.gait.z - o.gait.z
        const d = Math.hypot(ox, oz)
        const room = (g.H + o.H) * 0.55
        if (d < room && d > 1e-3) {
          sx += (ox / d) * (room - d) * 2
          sz += (oz / d) * (room - d) * 2
        }
      }
      const dist = Math.hypot(sx, sz)
      let turn = 0
      let forward = 0
      if (dist > g.H * 0.3) {
        let dh = Math.atan2(sx, sz) - g.gait.heading
        dh = Math.atan2(Math.sin(dh), Math.cos(dh))
        turn = THREE.MathUtils.clamp(dh * 1.5, -1, 1)
        forward = Math.cos(dh) > 0.2 ? Math.min(0.75, dist / (g.H * 1.5)) : 0
      } else if (!moving) {
        // Grazing: turn idly now and then.
        turn = Math.sin(this.time * 0.07 + i * 2.1) * 0.15
      }
      this.discard.length = 0
      g.step(dt, { forward, turn }, this.discard)
      for (const ev of this.discard) if (ev.type === 'footfall') this.onFootfall(ev.x, ev.z, g.H)
    })
  }
}
