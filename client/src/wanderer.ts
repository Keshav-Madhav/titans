// The Wanderer: a red-cloaked figure at human scale. Procedural on purpose —
// a cloak hides the body, so a simple stride reads well until a rigged CC0
// character replaces it.

import * as THREE from 'three'
import { type Terrain } from '@titans/shared'

const WALK = 4.2
const SPRINT = 8.5
const ACCEL = 14
const JUMP = 5.6
const GRAVITY = 18

const _up = new THREE.Vector3(0, 1, 0)
const _cx = new THREE.Vector3()
const _cy = new THREE.Vector3()
const _cz = new THREE.Vector3()
const _cm = new THREE.Matrix4()

/** A sphere open at the neck, with a round face opening cut toward +Z. */
function hoodShell(radius: number, openingAngle: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(radius, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.82).toNonIndexed()
  const p = g.getAttribute('position')
  const n = g.getAttribute('normal')
  const keep: number[] = []
  const axis = new THREE.Vector3(0, -0.12, 1).normalize()
  const c = new THREE.Vector3()
  const cos = Math.cos(openingAngle)
  for (let t = 0; t < p.count; t += 3) {
    c.set(0, 0, 0)
    for (let k = 0; k < 3; k++) c.add(new THREE.Vector3().fromBufferAttribute(p, t + k))
    if (c.normalize().dot(axis) > cos) continue
    keep.push(t, t + 1, t + 2)
  }
  const out = new THREE.BufferGeometry()
  const pos = new Float32Array(keep.length * 3)
  const nrm = new Float32Array(keep.length * 3)
  keep.forEach((i, j) => {
    pos.set([p.getX(i), p.getY(i), p.getZ(i)], j * 3)
    nrm.set([n.getX(i), n.getY(i), n.getZ(i)], j * 3)
  })
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  g.dispose()
  return out
}

export class Wanderer {
  readonly obj = new THREE.Group()
  readonly pos = new THREE.Vector3()
  readonly vel = new THREE.Vector3()
  yaw = 0
  // Previous simulation state, for interpolated rendering.
  private readonly prev = new THREE.Vector3()
  private prevYaw = 0
  grounded = true
  private stride = 0
  private readonly legL: THREE.Mesh
  private readonly legR: THREE.Mesh
  private readonly cloak: THREE.Mesh

  constructor(cloak: THREE.ColorRepresentation = 0xa8291f) {
    // Double-sided: the hem is open, and from a low camera the inside must not vanish.
    const cloakMat = new THREE.MeshStandardMaterial({ color: cloak, roughness: 0.85, side: THREE.DoubleSide })
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2420, roughness: 0.9 })

    // Cloak: a lathe from the neck flaring to the hem.
    const profile = [
      new THREE.Vector2(0.02, 1.5),
      new THREE.Vector2(0.17, 1.46),
      new THREE.Vector2(0.26, 1.36),
      new THREE.Vector2(0.29, 1.12),
      new THREE.Vector2(0.33, 0.78),
      // Ankle-length: a hem 0.38 m up threw a shadow that started ~0.85 m
      // away from the body at this sun angle and read as detached.
      new THREE.Vector2(0.41, 0.16),
      new THREE.Vector2(0.4, 0.12),
    ]
    this.cloak = new THREE.Mesh(new THREE.LatheGeometry(profile, 18), cloakMat)
    this.cloak.castShadow = true
    this.obj.add(this.cloak)

    // Hood: a shell with a round opening at the front, and the dark face
    // fully INSIDE it, so the face shows only through the opening. (A face
    // sphere larger than the hood used to poke out of its sides as a black
    // crescent.)
    const hood = new THREE.Mesh(hoodShell(0.16, 0.74), cloakMat)
    hood.scale.set(1, 1.18, 1.08)
    hood.position.set(0, 1.62, -0.015)
    hood.castShadow = true
    this.obj.add(hood)
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.118, 14, 10), darkMat)
    face.position.set(0, 1.6, 0.0)
    this.obj.add(face)

    const legGeo = new THREE.CapsuleGeometry(0.075, 0.38, 4, 8)
    legGeo.translate(0, -0.24, 0)
    this.legL = new THREE.Mesh(legGeo, darkMat)
    this.legR = new THREE.Mesh(legGeo, darkMat)
    this.legL.position.set(-0.11, 0.48, 0)
    this.legR.position.set(0.11, 0.48, 0)
    this.legL.castShadow = this.legR.castShadow = true
    this.obj.add(this.legL, this.legR)
  }

  /** One fixed simulation step. `camYaw` orients WASD to the view. */
  step(dt: number, move: { x: number; y: number }, sprint: boolean, jump: boolean, camYaw: number, terrain: Terrain): void {
    this.prev.copy(this.pos)
    this.prevYaw = this.yaw
    // Camera looks along -Z at yaw 0, so forward is (-sin, -cos).
    const fx = -Math.sin(camYaw)
    const fz = -Math.cos(camYaw)
    let wx = fx * move.y + -fz * move.x
    let wz = fz * move.y + fx * move.x
    const len = Math.hypot(wx, wz)
    if (len > 0) {
      wx /= len
      wz /= len
    }
    const speed = sprint ? SPRINT : WALK
    const k = Math.min(1, ACCEL * dt * (this.grounded ? 1 : 0.25))
    this.vel.x += (wx * speed - this.vel.x) * k
    this.vel.z += (wz * speed - this.vel.z) * k

    if (jump && this.grounded) {
      this.vel.y = JUMP
      this.grounded = false
    }
    this.vel.y -= GRAVITY * dt
    this.pos.addScaledVector(this.vel, dt)

    const ground = terrain.heightAt(this.pos.x, this.pos.z)
    if (this.pos.y <= ground) {
      this.pos.y = ground
      this.vel.y = 0
      this.grounded = true
    } else if (this.grounded && this.pos.y - ground < 0.35 && this.vel.y <= 0) {
      this.pos.y = ground // stick to the ground walking downhill
    } else {
      this.grounded = false
    }

    const hs = Math.hypot(this.vel.x, this.vel.z)
    if (hs > 0.3) {
      const target = Math.atan2(this.vel.x, this.vel.z)
      let d = target - this.yaw
      d = Math.atan2(Math.sin(d), Math.cos(d))
      this.yaw += d * Math.min(1, 12 * dt)
    }
    this.stride += hs * dt * 2.6
    const swing = this.grounded ? Math.sin(this.stride) * Math.min(1, hs / WALK) * 0.55 : 0.35
    this.legL.rotation.x = swing
    this.legR.rotation.x = -swing
    this.cloak.rotation.x = -Math.min(0.18, hs * 0.02)
  }

  /** Teleport: no interpolation across the jump. */
  place(x: number, y: number, z: number): void {
    this.pos.set(x, y, z)
    this.prev.copy(this.pos)
    this.vel.set(0, 0, 0)
  }

  /** Copy simulation state to the scene graph, `alpha` of the way from the previous step. */
  sync(alpha: number): void {
    this.obj.position.lerpVectors(this.prev, this.pos, alpha)
    let d = this.yaw - this.prevYaw
    d = Math.atan2(Math.sin(d), Math.cos(d))
    this.obj.quaternion.setFromAxisAngle(_up, this.prevYaw + d * alpha)
  }

  /**
   * Pose on a Titan's body. On steep rock: chest to the stone, head up the
   * slope, held a little off the surface. Standing on top (a shoulder, the
   * head): upright, facing `yaw`. `moving` (m/s) drives the limbs.
   */
  climbPose(dt: number, point: THREE.Vector3, normal: THREE.Vector3, standing: boolean, yaw: number, moving: number): void {
    const o = this.obj
    if (standing) {
      o.position.copy(point)
      o.quaternion.setFromAxisAngle(_up, yaw)
    } else {
      // Up the slope = world up flattened onto the rock.
      _cy.set(0, 1, 0).addScaledVector(normal, -normal.y)
      if (_cy.lengthSq() < 1e-4) _cy.set(0, 0, 1)
      _cy.normalize()
      _cz.copy(normal).negate()
      _cx.crossVectors(_cy, _cz)
      _cm.makeBasis(_cx, _cy, _cz)
      o.quaternion.setFromRotationMatrix(_cm)
      o.position.copy(point).addScaledVector(normal, 0.32).addScaledVector(_cy, -0.85)
    }
    this.stride += moving * dt * 3.2
    const swing = moving > 0 ? Math.sin(this.stride) * 0.5 : standing ? 0 : 0.25
    this.legL.rotation.x = swing
    this.legR.rotation.x = standing ? -swing : -swing * 0.6 - 0.2
    this.cloak.rotation.x = standing ? 0 : 0.12
  }

  /** Back to upright after a climb (sync() only sets yaw). */
  upright(): void {
    this.obj.quaternion.setFromAxisAngle(_up, this.yaw)
  }

  /**
   * Pose a body we do not simulate (another player): place it, and animate
   * the stride from how far it moved since last frame.
   */
  drive(dt: number, x: number, y: number, z: number, yaw: number): void {
    const hs = dt > 0 ? Math.hypot(x - this.obj.position.x, z - this.obj.position.z) / dt : 0
    this.obj.position.set(x, y, z)
    this.obj.quaternion.setFromAxisAngle(_up, yaw)
    this.stride += Math.min(hs, 12) * dt * 2.6
    const swing = Math.sin(this.stride) * Math.min(1, hs / WALK) * 0.55
    this.legL.rotation.x = swing
    this.legR.rotation.x = -swing
    this.cloak.rotation.x = -Math.min(0.18, hs * 0.02)
  }

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.z)
  }
}
