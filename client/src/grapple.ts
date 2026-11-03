// The grappling line (user, 2026-11-04: "traversal is slow, maybe a physics based grappling
// hook?"). G throws it where you are looking — rock, the ground, a giant — up to RANGE metres;
// if it catches, it is a rope, not a winch: you hang from it and swing under gravity (a
// distance constraint, the outward part of your velocity taken away at full stretch), and
// holding G reels you in. Space lets go, with a kick up and forward (a swing turned into a
// leap); standing on the ground with it slack, it comes back on its own. On a giant the hook rides along with the part it caught.

import * as THREE from 'three'

export const RANGE = 70
const REEL = 13 // m/s the line shortens while G is held
const MIN_LEN = 2.2

export interface Anchor {
  /** Where it caught, in the world, now. */
  readonly at: THREE.Vector3
  /** Follow a moving body (a giant's part): its matrixWorld and the point in its frame. */
  follow: { obj: THREE.Object3D; local: THREE.Vector3 } | null
}

export class Grapple {
  readonly line: THREE.Line
  private readonly linePos: Float32Array
  anchor: Anchor | null = null
  /** The rope's length (m): the most you can be from the anchor. */
  length = 0
  /** In flight: the hook travelling out to where it will catch. */
  private flying: { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; hit: Anchor | null } | null = null

  constructor() {
    this.linePos = new Float32Array(2 * 3)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3))
    this.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x5a4632 }))
    this.line.frustumCulled = false
    this.line.visible = false
    // (A rope you can see up close: a thin tube from the hand to the hook. The line alone was
    // a hairline lost against rock.)
    this.rope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 1, 6, 1).translate(0, 0.5, 0),
      new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 0.9 }),
    )
    this.rope.frustumCulled = false
    this.rope.castShadow = true
    this.line.add(this.rope)
  }

  private readonly rope: THREE.Mesh

  get attached(): boolean {
    return !!this.anchor
  }

  get busy(): boolean {
    return !!this.anchor || !!this.flying
  }

  /** Throw toward `to` (where the aim hit) from `from`; `hit` null: it falls short. */
  throw(from: THREE.Vector3, to: THREE.Vector3, hit: Anchor | null): void {
    const d = from.distanceTo(to)
    this.flying = { from: from.clone(), to: to.clone(), t: 0, dur: 0.12 + d / 120, hit }
    this.line.visible = true
  }

  release(): void {
    this.anchor = null
    this.flying = null
    this.line.visible = false
  }

  /**
   * One physics step for the body at `pos` with velocity `vel` (both changed in place).
   * `reel`: G held. Returns 'caught' the step it catches, else null.
   */
  step(dt: number, pos: THREE.Vector3, vel: THREE.Vector3, reel: boolean, grounded: boolean): 'caught' | 'missed' | null {
    let ev: 'caught' | 'missed' | null = null
    if (this.flying) {
      const f = this.flying
      f.t += dt
      if (f.t >= f.dur) {
        this.flying = null
        if (f.hit) {
          this.anchor = f.hit
          this.length = Math.max(MIN_LEN, pos.distanceTo(f.hit.at))
          ev = 'caught'
        } else {
          this.line.visible = false
          ev = 'missed'
        }
      }
    }
    const a = this.anchor
    if (!a) return ev
    if (a.follow) a.at.copy(a.follow.local).applyMatrix4(a.follow.obj.matrixWorld)
    if (reel) this.length = Math.max(MIN_LEN, this.length - REEL * dt)
    // On the ground with slack, the rope only lies there.
    const r = _r.subVectors(pos, a.at)
    const d = r.length()
    if (d > this.length && d > 1e-4) {
      // Back onto the rope's reach, and no more moving outward along it.
      r.multiplyScalar(1 / d)
      pos.copy(a.at).addScaledVector(r, this.length)
      const out = vel.dot(r)
      if (out > 0) vel.addScaledVector(r, -out)
      // Reeling: the line pulls, and the pull wins over standing still on the ground.
      if (reel) vel.addScaledVector(r, -Math.min(REEL, 4 + REEL * 0.6) * dt * 8)
    } else if (reel && !grounded) {
      // Slack while reeling: take it up at once.
      this.length = Math.max(MIN_LEN, Math.min(this.length, d))
    }
    return ev
  }

  /** Draw the rope from the hand (or the hook in flight). */
  draw(hand: THREE.Vector3): void {
    const p = this.linePos
    p[0] = hand.x
    p[1] = hand.y
    p[2] = hand.z
    if (this.flying) {
      const f = this.flying
      const k = Math.min(1, f.t / f.dur)
      _r.lerpVectors(f.from, f.to, k)
      p[3] = _r.x
      p[4] = _r.y
      p[5] = _r.z
    } else if (this.anchor) {
      p[3] = this.anchor.at.x
      p[4] = this.anchor.at.y
      p[5] = this.anchor.at.z
    }
    ;(this.line.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    const end = _e.set(p[3], p[4], p[5])
    const len = hand.distanceTo(end)
    this.rope.position.copy(hand)
    this.rope.quaternion.setFromUnitVectors(_up, _r.subVectors(end, hand).normalize())
    this.rope.scale.set(1, Math.max(0.01, len), 1)
  }
}

const _r = new THREE.Vector3()
const _e = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
