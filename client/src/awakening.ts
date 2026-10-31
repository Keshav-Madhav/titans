// Awakenings (user, 2026-10-31: "a rare event which causes that thing to
// animate, and the game snatches the camera… to smooth pan to it and see it
// move, with a kind of dread"). Rarely — and once, the first time you light
// a cairn and look out — one of the colossi beyond the mountains moves.
//
//   the bars close in; the wind drops away; a horn, impossibly far
//   the camera leaves you and turns, slowly, to it — the lens narrowing, so
//     it fills the frame the way it fills the sky
//   it turns its body toward you, and takes one step
//   long after, the sound of it arrives
//   the camera comes back to you
//
// No threat follows. It just happened, and you saw it.

import * as THREE from 'three'
import type { Titan } from './titan'
import type { GaitEvent } from '@titans/shared'

const LENGTH = 32 // seconds the camera is taken
/** Its time runs faster than ours while we watch: a real step of a thing this size takes most of a minute. */
const HASTE = 2.6
const TURN_IN = 5 // seconds to turn to it
const TURN_OUT = 3.5

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))

export class Awakening {
  /** Seconds into the current awakening (null: none happening). */
  t: number | null = null
  private giant: Titan | null = null
  private next: number
  private readonly fromQ = new THREE.Quaternion()
  private readonly toQ = new THREE.Quaternion()
  private readonly look = new THREE.Matrix4()
  private readonly target = new THREE.Vector3()
  private fromFov = 58
  private stepped = false
  private boomed = false
  private readonly discard: GaitEvent[] = []
  private readonly bars = document.getElementById('bars')
  /** Called at its moments: 'begin', 'step' (the sound should start now), 'end'. */
  on: (what: 'begin' | 'step' | 'end', giant: Titan) => void = () => {}

  constructor(
    private readonly giants: Titan[],
    /** Never one standing in the sun: it would be lost in the glare. */
    private readonly sunDir: THREE.Vector3,
    private readonly rand: () => number = Math.random,
  ) {
    this.next = (25 + this.rand() * 35) * 60
  }

  get active(): boolean {
    return this.t !== null
  }

  /** 0 … 1: how far the sky should part so it can be seen. */
  get reveal(): number {
    if (this.t === null) return 0
    return Math.min(ease(this.t / 6), 1 - ease((this.t - (LENGTH - 5)) / 6))
  }

  /** Begin one now (tools, or a story moment): the colossus most in front of `camera`. */
  begin(camera: THREE.PerspectiveCamera): void {
    if (this.active || !this.giants.length) return
    const fwd = new THREE.Vector3()
    camera.getWorldDirection(fwd)
    let best = this.giants[0]
    let score = -Infinity
    for (const g of this.giants) {
      const to = new THREE.Vector3(g.gait.x - camera.position.x, 0, g.gait.z - camera.position.z).normalize()
      const sun = Math.max(0, (to.x * this.sunDir.x + to.z * this.sunDir.z) / Math.hypot(this.sunDir.x, this.sunDir.z))
      const s = to.dot(fwd) - 2 * sun + this.rand() * 0.3
      if (s > score) {
        score = s
        best = g
      }
    }
    this.giant = best
    this.t = 0
    this.stepped = false
    this.boomed = false
    this.fromQ.copy(camera.quaternion)
    this.fromFov = camera.fov
    this.bars?.classList.add('on')
    this.on('begin', best)
  }

  /**
   * Each frame. While one is happening it drives the camera (return true:
   * the rig must not); otherwise it counts down to the next.
   */
  update(dt: number, camera: THREE.PerspectiveCamera): boolean {
    if (this.t === null) {
      this.next -= dt
      if (this.next <= 0) {
        this.next = (25 + this.rand() * 35) * 60
        this.begin(camera)
      }
      return false
    }
    const g = this.giant!
    this.t += dt
    const t = this.t
    // Below its chest, so the land it stands beyond stays in the frame.
    this.target.set(g.gait.x, g.pelvis.y + (g.chest.y - g.pelvis.y) * 0.4, g.gait.z)
    this.look.lookAt(camera.position, this.target, camera.up)
    this.toQ.setFromRotationMatrix(this.look)
    const k = t < LENGTH - TURN_OUT ? ease(t / TURN_IN) : 1 - ease((t - (LENGTH - TURN_OUT)) / TURN_OUT)
    camera.quaternion.slerpQuaternions(this.fromQ, this.toQ, k)
    // A longer lens, but not so long that it loses the land in front:
    // the mountains small under it are what make it so big.
    const d = camera.position.distanceTo(this.target)
    const fov = THREE.MathUtils.clamp((2 * Math.atan((g.H * 1.15) / d) * 180) / Math.PI, 22, 48)
    camera.fov = this.fromFov + (fov - this.fromFov) * k
    camera.updateProjectionMatrix()
    // It moves: turning toward you, then one step.
    if (t > 7 && t < 25) {
      const want = Math.atan2(camera.position.x - g.gait.x, camera.position.z - g.gait.z)
      let dh = want - g.gait.heading
      dh = Math.atan2(Math.sin(dh), Math.cos(dh))
      const steps = g.gait.steps
      this.discard.length = 0
      g.step(dt * HASTE, { forward: t > 9 && !this.stepped ? 1 : 0, turn: THREE.MathUtils.clamp(dh * 2, -1, 1) * 0.5 }, this.discard)
      if (g.gait.steps > steps) this.stepped = true
      if (this.stepped && !this.boomed) {
        this.boomed = true
        this.on('step', g)
      }
    } else if (t >= 25) {
      // Let it come to rest.
      this.discard.length = 0
      g.step(dt * HASTE, { forward: 0, turn: 0 }, this.discard)
    }
    if (t >= LENGTH - 2.5) this.bars?.classList.remove('on')
    if (t >= LENGTH) {
      this.t = null
      camera.fov = this.fromFov
      camera.updateProjectionMatrix()
      this.on('end', g)
      return false
    }
    return true
  }
}
