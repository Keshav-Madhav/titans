// Titan gait planner. Decides where every foot goes; the animation solves
// to it, never the reverse.
//
// Titans do not step cleanly — they DRAG. The swing foot barely leaves the
// ground and ploughs a trench from its last footprint to its next one, so
// each foot leaves a canal linking its prints (lakes). The planner emits
// that path as short `drag` segments while the foot moves, then a `footfall`
// where it lands.
//
// Phase is tied to distance travelled (one step per `stepLen` metres), so
// feet never skate. Heading uses sin/cos, which is fine here: the authority
// runs the planner and events travel as explicit coordinates, so nobody
// else has to reproduce these numbers bit-for-bit.

import type { TitanSnapshot } from './protocol'

export interface Vec2 {
  x: number
  z: number
}

export interface TitanBody {
  height: number
  hipHeight: number
  thigh: number
  shin: number
  hipHalf: number
  stepLen: number
  stepTime: number
  lift: number
  turnRate: number
  dragSeg: number
}

/** Proportions as fractions of height — one table, any Titan scale. */
export function titanBody(height: number): TitanBody {
  return {
    height,
    hipHeight: 0.42 * height,
    thigh: 0.225 * height,
    shin: 0.215 * height,
    hipHalf: 0.095 * height,
    stepLen: 0.28 * height,
    // Dynamic similarity says time ∝ √size; the extra factor is weight —
    // these things are slower than any animal their size would be.
    stepTime: 4.4 * Math.sqrt(height / 120),
    lift: 0.016 * height, // a scrape, not a step
    turnRate: 0.11,
    dragSeg: 0.06 * height,
  }
}

export type GaitEvent =
  | { type: 'footfall'; foot: 0 | 1; x: number; z: number; heading: number; step: number; stomp?: boolean }
  | { type: 'drag'; foot: 0 | 1; ax: number; az: number; bx: number; bz: number }

export interface GaitInput {
  forward: number // 0..1 (Titans do not walk backwards)
  turn: number // -1..1, positive turns left
}

/** Stomp cooldown, so a Titan cannot machine-gun the land. */
export const STOMP_COOLDOWN_S = 6

export class TitanGait {
  x: number
  z: number
  heading: number
  speed = 0
  phase = 0 // 0..1 through the current swing
  swingFoot: 0 | 1 = 0
  steps = 0
  readonly plant: [Vec2, Vec2]
  readonly swingFrom: Vec2 = { x: 0, z: 0 }
  readonly swingTo: Vec2 = { x: 0, z: 0 }
  private swinging = false
  /** Drag the feet (canals) or lift them clean (lakes only). */
  plough = true
  /** The next step is a stomp (armed by the player; consumed when a swing starts). */
  stompArmed = false
  /** The current swing is a stomp: the foot rises high and slams down. */
  swingStomp = false
  /** Sitting down to rest. A resting Titan does not walk; a long rest without a driver ends in dormancy. */
  resting = false
  private readonly dragFrom: Vec2 = { x: 0, z: 0 }
  private readonly cur = { x: 0, z: 0, lift: 0 }

  constructor(readonly body: TitanBody, x: number, z: number, heading: number) {
    this.x = x
    this.z = z
    this.heading = heading
    this.plant = [this.side(0, 0), this.side(1, 0)]
  }

  get maxSpeed(): number {
    return this.body.stepLen / this.body.stepTime
  }

  /** Point beside the body for a foot, `ahead` metres forward. */
  side(foot: 0 | 1, ahead: number): Vec2 {
    const fx = Math.sin(this.heading)
    const fz = Math.cos(this.heading)
    // Left of a body facing +Z (heading 0) is +X.
    const s = foot === 0 ? 1 : -1
    return {
      x: this.x + fx * ahead + fz * s * this.body.hipHalf,
      z: this.z + fz * ahead - fx * s * this.body.hipHalf,
    }
  }

  /** Advance by dt, pushing any drag segments and footfalls into `out`. */
  step(dt: number, input: GaitInput, out: GaitEvent[]): void {
    const b = this.body
    const target = this.resting ? 0 : Math.max(0, Math.min(1, input.forward)) * this.maxSpeed
    const accel = this.maxSpeed / (b.stepTime * 1.5)
    if (this.speed < target) this.speed = Math.min(target, this.speed + accel * dt)
    else this.speed = Math.max(target, this.speed - accel * 1.6 * dt)

    // Turning needs momentum: a standing Titan pivots slowly.
    const turnScale = 0.35 + 0.65 * (this.speed / this.maxSpeed)
    if (!this.resting) this.heading += input.turn * b.turnRate * turnScale * dt

    const fx = Math.sin(this.heading)
    const fz = Math.cos(this.heading)
    this.x += fx * this.speed * dt
    this.z += fz * this.speed * dt

    const moving = this.speed > 0.05
    if (!this.swinging) {
      // Start a step when moving, or to bring a trailing foot alongside.
      const rest = this.side(this.swingFoot, 0)
      const p = this.plant[this.swingFoot]
      const off = Math.hypot(p.x - rest.x, p.z - rest.z)
      if (!moving && off < b.stepLen * 0.25) return
      this.swinging = true
      this.phase = 0
      this.swingStomp = this.stompArmed
      this.stompArmed = false
      this.swingFrom.x = this.dragFrom.x = p.x
      this.swingFrom.z = this.dragFrom.z = p.z
    }

    // Distance-driven phase, with a floor so a stopping Titan finishes its step.
    const rate = Math.max(this.speed / b.stepLen, 1 / (b.stepTime * 1.4))
    this.phase += rate * dt

    // Re-aim continuously so turns bend the footpath: land half a step
    // ahead of where the body will be at touchdown (or beside it if stopping).
    const remaining = (1 - Math.min(1, this.phase)) * b.stepLen * (this.speed / this.maxSpeed)
    const lead = 0.5 * b.stepLen * (this.speed / this.maxSpeed)
    const t = this.side(this.swingFoot, remaining + lead)
    this.swingTo.x = t.x
    this.swingTo.z = t.z

    const foot = this.swingFoot
    if (this.phase < 1) {
      if (!this.plough || this.swingStomp) return
      // The dragging foot cuts its trench in segments behind it.
      this.footPos(foot, this.cur)
      const dx = this.cur.x - this.dragFrom.x
      const dz = this.cur.z - this.dragFrom.z
      if (dx * dx + dz * dz >= b.dragSeg * b.dragSeg) {
        out.push({ type: 'drag', foot, ax: this.dragFrom.x, az: this.dragFrom.z, bx: this.cur.x, bz: this.cur.z })
        this.dragFrom.x = this.cur.x
        this.dragFrom.z = this.cur.z
      }
      return
    }

    if (this.plough && !this.swingStomp) out.push({ type: 'drag', foot, ax: this.dragFrom.x, az: this.dragFrom.z, bx: t.x, bz: t.z })
    const stomp = this.swingStomp
    this.swingStomp = false
    this.plant[foot].x = t.x
    this.plant[foot].z = t.z
    this.swinging = false
    this.phase = 0
    this.swingFoot = foot === 0 ? 1 : 0
    this.steps++
    out.push({ type: 'footfall', foot, x: t.x, z: t.z, heading: this.heading, step: this.steps, ...(stomp ? { stomp } : {}) })
  }

  /** Current foot positions: planted, or mid-drag with its (small) lift. */
  footPos(foot: 0 | 1, out: { x: number; z: number; lift: number }): void {
    if (this.swinging && foot === this.swingFoot) {
      const p = Math.min(1, this.phase)
      const e = p * p * (3 - 2 * p)
      out.x = this.swingFrom.x + (this.swingTo.x - this.swingFrom.x) * e
      out.z = this.swingFrom.z + (this.swingTo.z - this.swingFrom.z) * e
      if (this.swingStomp) {
        // Rise high and hang there, then slam down in the last fifth.
        const up = p < 0.8 ? Math.min(1, p / 0.45) : 1 - ((p - 0.8) / 0.2) * ((p - 0.8) / 0.2)
        out.lift = up * 0.16 * this.body.height
      } else {
        out.lift = 4 * p * (1 - p) * (this.plough ? this.body.lift : 0.08 * this.body.height)
      }
    } else {
      out.x = this.plant[foot].x
      out.z = this.plant[foot].z
      out.lift = 0
    }
  }

  get isSwinging(): boolean {
    return this.swinging
  }

  /** Everything needed to pose this Titan elsewhere (the server sends it in room state). */
  snapshot(out: TitanSnapshot): TitanSnapshot {
    out.x = this.x
    out.z = this.z
    out.heading = this.heading
    out.speed = this.speed
    out.phase = this.phase
    out.swingFoot = this.swingFoot
    out.swinging = this.swinging
    out.steps = this.steps
    out.p0x = this.plant[0].x
    out.p0z = this.plant[0].z
    out.p1x = this.plant[1].x
    out.p1z = this.plant[1].z
    out.fromX = this.swingFrom.x
    out.fromZ = this.swingFrom.z
    out.toX = this.swingTo.x
    out.toZ = this.swingTo.z
    out.plough = this.plough
    out.swingStomp = this.swingStomp
    out.resting = this.resting
    return out
  }

  /** Adopt a snapshot (a client mirroring the server's Titan). */
  restore(s: TitanSnapshot): void {
    this.x = s.x
    this.z = s.z
    this.heading = s.heading
    this.speed = s.speed
    this.phase = s.phase
    this.swingFoot = s.swingFoot
    this.swinging = s.swinging
    this.steps = s.steps
    this.plant[0].x = s.p0x
    this.plant[0].z = s.p0z
    this.plant[1].x = s.p1x
    this.plant[1].z = s.p1z
    this.swingFrom.x = s.fromX
    this.swingFrom.z = s.fromZ
    this.swingTo.x = s.toX
    this.swingTo.z = s.toZ
    this.plough = s.plough
    this.swingStomp = s.swingStomp
    this.resting = s.resting
    // The next drag segment starts from the swing's start: re-cutting that
    // stretch is harmless (trenches cut with lowerTo), a cut from (0, 0) is not.
    this.dragFrom.x = s.fromX
    this.dragFrom.z = s.fromZ
  }
}
