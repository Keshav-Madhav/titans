// Titan gait planner. Decides where every foot lands; the animation solves
// to it, never the reverse, and each landing is exactly where the footprint
// event fires.
//
// Phase is tied to distance travelled (one step per `stepLen` metres), so
// feet never skate. Heading uses sin/cos, which is fine here: the server owns
// the planner in multiplayer and footfalls travel as explicit coordinates,
// so clients never need to reproduce these numbers bit-for-bit.

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
  footLen: number
  footWidth: number
}

/** Proportions as fractions of height — one table, any Titan scale. */
export function titanBody(height: number): TitanBody {
  const stepLen = 0.3 * height
  const stepTime = 3.0 * Math.sqrt(height / 120) // dynamic similarity: time ∝ √size
  return {
    height,
    hipHeight: 0.42 * height,
    thigh: 0.225 * height,
    shin: 0.215 * height,
    hipHalf: 0.095 * height,
    stepLen,
    stepTime,
    lift: 0.1 * height,
    turnRate: 0.16,
    footLen: 0.17 * height,
    footWidth: 0.085 * height,
  }
}

export interface Footfall {
  foot: 0 | 1 // 0 = left, 1 = right
  x: number
  z: number
  heading: number
  step: number
}

export interface GaitInput {
  forward: number // 0..1 (Titans do not walk backwards)
  turn: number // -1..1, positive turns left
}

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

  /** Advance by dt; returns a footfall if a foot landed this tick. */
  step(dt: number, input: GaitInput): Footfall | null {
    const b = this.body
    const target = Math.max(0, Math.min(1, input.forward)) * this.maxSpeed
    const accel = this.maxSpeed / (b.stepTime * 1.5)
    if (this.speed < target) this.speed = Math.min(target, this.speed + accel * dt)
    else this.speed = Math.max(target, this.speed - accel * 1.6 * dt)

    // Turning needs momentum: a standing Titan pivots slowly.
    const turnScale = 0.35 + 0.65 * (this.speed / this.maxSpeed)
    this.heading += input.turn * b.turnRate * turnScale * dt

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
      if (!moving && off < b.stepLen * 0.25) return null
      this.swinging = true
      this.phase = 0
      this.swingFrom.x = p.x
      this.swingFrom.z = p.z
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

    if (this.phase < 1) return null
    const foot = this.swingFoot
    this.plant[foot].x = t.x
    this.plant[foot].z = t.z
    this.swinging = false
    this.phase = 0
    this.swingFoot = foot === 0 ? 1 : 0
    this.steps++
    return { foot, x: t.x, z: t.z, heading: this.heading, step: this.steps }
  }

  /** Current foot positions: planted, or mid-swing with its arc height. */
  footPos(foot: 0 | 1, out: { x: number; z: number; lift: number }): void {
    if (this.swinging && foot === this.swingFoot) {
      const p = this.phase
      const e = p * p * (3 - 2 * p)
      out.x = this.swingFrom.x + (this.swingTo.x - this.swingFrom.x) * e
      out.z = this.swingFrom.z + (this.swingTo.z - this.swingFrom.z) * e
      out.lift = 4 * p * (1 - p) * this.body.lift
    } else {
      out.x = this.plant[foot].x
      out.z = this.plant[foot].z
      out.lift = 0
    }
  }

  get isSwinging(): boolean {
    return this.swinging
  }
}
