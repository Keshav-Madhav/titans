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

export class Wanderer {
  readonly obj = new THREE.Group()
  readonly pos = new THREE.Vector3()
  readonly vel = new THREE.Vector3()
  yaw = 0
  grounded = true
  private stride = 0
  private readonly legL: THREE.Mesh
  private readonly legR: THREE.Mesh
  private readonly cloak: THREE.Mesh

  constructor() {
    const cloakMat = new THREE.MeshStandardMaterial({ color: 0xa8291f, roughness: 0.85 })
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2420, roughness: 0.9 })

    // Cloak: a lathe from the neck flaring to the hem.
    const profile = [
      new THREE.Vector2(0.02, 1.5),
      new THREE.Vector2(0.17, 1.46),
      new THREE.Vector2(0.26, 1.36),
      new THREE.Vector2(0.29, 1.12),
      new THREE.Vector2(0.33, 0.78),
      new THREE.Vector2(0.4, 0.42),
      new THREE.Vector2(0.39, 0.38),
    ]
    this.cloak = new THREE.Mesh(new THREE.LatheGeometry(profile, 18), cloakMat)
    this.cloak.castShadow = true
    this.obj.add(this.cloak)

    // Hood: a slightly pointed shell over a dark face.
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), cloakMat)
    hood.scale.set(1, 1.18, 1.08)
    hood.position.set(0, 1.62, -0.015)
    hood.castShadow = true
    this.obj.add(hood)
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10), darkMat)
    face.position.set(0, 1.6, 0.075)
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

  /** Copy simulation state to the scene graph. */
  sync(): void {
    this.obj.position.copy(this.pos)
    this.obj.rotation.y = this.yaw
  }

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.z)
  }
}
