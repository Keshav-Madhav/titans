// The wild Titan's mind: traditional game AI (a small state machine with a
// little randomness), no LLM. When nobody walks the Titan it wanders the
// plains on its own, so the world keeps changing and there is always a giant
// to follow and climb.
//
//   wander → walk toward a far point on open ground, ploughing (sometimes
//            striding), now and then stomping or calling out
//   pause  → stand and look about, then pick somewhere new
//
// Waypoints stay on the plains (off the mountain belt, away from dormant
// Titans). Seeded, so a server restart wanders the same way.

import { mulberry32 } from './noise'
import type { GaitInput, TitanGait } from './gait'

export interface BrainWorld {
  /** Ground height, to keep to open, low ground. */
  heightAt(x: number, z: number): number
  /** Places to keep away from (dormant mountains), with a radius. */
  avoid: ReadonlyArray<{ x: number; z: number; r: number }>
}

export interface BrainOutput extends GaitInput {
  plough: boolean
  /** One-shot wishes, cleared after reading. */
  stomp: boolean
  call: boolean
}

/** How far from the world's middle the wild Titan roams (the mountain belt starts ~1.9 km out). */
const ROAM = 1500
const ARRIVE = 70

export class TitanBrain {
  state: 'wander' | 'pause' = 'pause'
  readonly target = { x: 0, z: 0 }
  private left = 4 // seconds left in this state
  private plough = true
  private readonly rand: () => number
  private readonly out: BrainOutput = { forward: 0, turn: 0, plough: true, stomp: false, call: false }

  constructor(seed: number) {
    this.rand = mulberry32(seed)
  }

  think(dt: number, g: TitanGait, world: BrainWorld): BrainOutput {
    const o = this.out
    o.stomp = false
    o.call = false
    this.left -= dt

    if (this.state === 'pause') {
      o.forward = 0
      o.turn = 0
      if (this.left <= 0) this.pickTarget(g, world)
      return o
    }

    const dx = this.target.x - g.x
    const dz = this.target.z - g.z
    if (Math.hypot(dx, dz) < ARRIVE || this.left <= 0) {
      // Arrived (or gave up): stand a while and look about.
      this.state = 'pause'
      this.left = 6 + this.rand() * 14
      if (this.rand() < 0.3) o.call = true
      o.forward = 0
      o.turn = 0
      return o
    }
    // Steer: turn toward the target, slow right down for sharp turns.
    let a = Math.atan2(dx, dz) - g.heading
    a = Math.atan2(Math.sin(a), Math.cos(a))
    o.turn = Math.max(-1, Math.min(1, a * 1.6))
    o.forward = Math.abs(a) < 1.1 ? 1 : 0.25
    o.plough = this.plough
    // Now and then, for no reason a person could name, it stomps.
    if (this.rand() < dt / 45) o.stomp = true
    return o
  }

  private pickTarget(g: TitanGait, world: BrainWorld): void {
    for (let tries = 0; tries < 24; tries++) {
      const a = this.rand() * Math.PI * 2
      const r = Math.sqrt(this.rand()) * ROAM
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const far = Math.hypot(x - g.x, z - g.z)
      if (far < 400 || far > 1600) continue
      if (world.heightAt(x, z) > 40) continue // keep to the low plains
      if (world.avoid.some((m) => Math.hypot(x - m.x, z - m.z) < m.r)) continue
      this.target.x = x
      this.target.z = z
      this.state = 'wander'
      this.left = 400 // give up on a target after this long
      this.plough = this.rand() < 0.75
      return
    }
    this.left = 5 // nowhere good: look about a bit longer
  }
}
