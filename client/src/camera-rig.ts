// Third-person orbit camera with per-role scale: a Wanderer's camera sits a
// few metres back, a Titan's a few hundred. Looking up (negative pitch)
// tilts the view skyward instead of burying the camera, which is what makes
// a Titan read as enormous from the ground.

import * as THREE from 'three'
import { type Terrain } from '@titans/shared'

export interface CameraProfile {
  minDist: number
  maxDist: number
  dist: number
  focusHeight: number
  follow: number // focus smoothing, per second
}

export const WANDERER_CAM: CameraProfile = { minDist: 2.2, maxDist: 18, dist: 5.5, focusHeight: 1.55, follow: 18 }

export class CameraRig {
  yaw = 0
  pitch = 0.22
  readonly focus = new THREE.Vector3()
  private profile: CameraProfile = WANDERER_CAM
  private dist = WANDERER_CAM.dist
  private readonly look = new THREE.Vector3()
  private snapped = false

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  private trauma = 0

  /** Ground shake from a footfall: amplitude in metres, decays quickly. */
  shake(amount: number): void {
    this.trauma = Math.max(this.trauma, amount)
  }

  setProfile(p: CameraProfile): void {
    this.profile = p
    this.dist = p.dist
    this.snapped = false
  }

  /** Signed distance to solid rock (negative inside), so the camera stays out of it. */
  occluder: ((x: number, y: number, z: number) => number) | null = null
  /** How far out the camera may go now (eases back out after being pulled in). */
  private held = Infinity

  get distance(): number {
    return this.dist
  }

  set distance(d: number) {
    this.dist = THREE.MathUtils.clamp(d, this.profile.minDist, this.profile.maxDist)
  }

  update(dt: number, dx: number, dy: number, wheel: number, subject: THREE.Vector3, terrain: Terrain): void {
    this.yaw -= dx * 0.0024
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.0024, -0.75, 1.4)
    if (wheel !== 0) this.distance = this.dist * Math.pow(1.12, wheel)

    const p = this.profile
    const fy = subject.y + p.focusHeight
    // A jump (a respawn, a teleport): cut, don't glide — gliding across the map
    // dragged the camera under hills on the way.
    if (this.snapped && Math.hypot(subject.x - this.focus.x, fy - this.focus.y, subject.z - this.focus.z) > 40) this.snapped = false
    if (!this.snapped) {
      this.focus.set(subject.x, fy, subject.z)
      this.snapped = true
    } else {
      const k = 1 - Math.exp(-p.follow * dt)
      this.focus.x += (subject.x - this.focus.x) * k
      this.focus.y += (fy - this.focus.y) * k
      this.focus.z += (subject.z - this.focus.z) * k
    }
    // The focus is never under the ground.
    this.focus.y = Math.max(this.focus.y, terrain.heightAt(this.focus.x, this.focus.z) + 0.5)

    const pitch = Math.max(this.pitch, -0.08)
    const cp = Math.cos(pitch)
    const cam = this.camera.position
    cam.set(
      this.focus.x + Math.sin(this.yaw) * cp * this.dist,
      this.focus.y + Math.sin(pitch) * this.dist,
      this.focus.z + Math.cos(this.yaw) * cp * this.dist,
    )
    // Never through the world: march from the focus out to the camera and stop
    // short of rock (formations, colossi) or ground in between. Pull in at
    // once; ease back out.
    const want = this.dist
    let clear = want
    const ux = (cam.x - this.focus.x) / want
    const uy = (cam.y - this.focus.y) / want
    const uz = (cam.z - this.focus.z) / want
    for (let t = 0.6; t <= want; t += Math.max(0.35, t * 0.08)) {
      const x = this.focus.x + ux * t
      const y = this.focus.y + uy * t
      const z = this.focus.z + uz * t
      const solid = this.occluder ? this.occluder(x, y, z) < 0.5 : false
      if (solid || y < terrain.heightAt(x, z) + 0.35) {
        clear = Math.max(0.6, t - 0.5)
        break
      }
    }
    this.held = clear < this.held ? clear : this.held + (clear - this.held) * Math.min(1, dt * 2.5)
    const d = Math.min(want, this.held)
    cam.set(this.focus.x + ux * d, this.focus.y + uy * d, this.focus.z + uz * d)
    const floor = terrain.heightAt(cam.x, cam.z) + 0.45
    if (cam.y < floor) cam.y = floor

    if (this.trauma > 0.001) {
      const a = this.trauma
      cam.x += (Math.random() - 0.5) * a
      cam.y += (Math.random() - 0.5) * a
      cam.z += (Math.random() - 0.5) * a
      this.trauma *= Math.exp(-6 * dt)
    }

    // Below the horizon line, pitch tilts the gaze up instead of the camera down.
    const up = this.pitch < -0.08 ? (-this.pitch - 0.08) * 2.4 : 0
    this.look.copy(this.focus)
    this.look.y += Math.tan(Math.min(up, 1.35)) * this.dist
    this.camera.lookAt(this.look)
  }
}
