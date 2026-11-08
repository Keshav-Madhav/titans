// Third-person orbit camera with per-role scale: a Wanderer's camera sits a
// few metres back, a Titan's a few hundred. Looking up (negative pitch)
// tilts the view skyward instead of burying the camera, which is what makes
// a Titan read as enormous from the ground.

import * as THREE from 'three'
import { inHall, type Terrain } from '@titans/shared'

export interface CameraProfile {
  minDist: number
  maxDist: number
  dist: number
  focusHeight: number
  follow: number // focus smoothing, per second
}

// (7 m, not 5.5: the user, 2026-11-08 — "a little farther away so the wanderer takes up a little
// less space on the screen, further adding the small feeling".)
/** How far (m) the camera's focus may trail what it follows. */
const MAX_LAG = 3

export const WANDERER_CAM: CameraProfile = { minDist: 2.2, maxDist: 18, dist: 7, focusHeight: 1.55, follow: 18 }
/**
 * Climbing a giant: further out than on foot (QA Q14 — at 5.5 m the giant's skin filled the screen
 * and you lost the giant: no silhouette, no ground below, no sense of where on it you were).
 */
export const CLIMB_CAM: CameraProfile = { minDist: 3, maxDist: 30, dist: 10, focusHeight: 1.2, follow: 10 }
/** On a rock face: between the two. */
export const CLIFF_CAM: CameraProfile = { minDist: 2.5, maxDist: 24, dist: 8, focusHeight: 1.3, follow: 12 }
/** Riding a walking giant: pulled back and up, smoothed against its sway, so you see the land go by under it. */
export const RIDE_CAM: CameraProfile = { minDist: 6, maxDist: 60, dist: 26, focusHeight: 4, follow: 4 }

/** The most a shake moves the camera (metres), at trauma 1. */
const SHAKE_MAX = 0.5

/** The camera's clearance (m): its near plane's half-width at this field of view, and a margin. */
const CAM_R = 0.32
const RING: Array<[number, number]> = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]

export class CameraRig {
  yaw = 0
  pitch = 0.22
  readonly focus = new THREE.Vector3()
  private profile: CameraProfile = WANDERER_CAM
  private dist = WANDERER_CAM.dist
  private readonly look = new THREE.Vector3()
  private snapped = false

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  /** Mouse look speed (settings) and whether pushing the mouse up looks down. */
  sensitivity = 1
  invertY = false
  /** The player's shake setting, 0 … 1. */
  shakeScale = 1
  private trauma = 0
  private shakeT = 0

  /**
   * Ground shake: `trauma` 0…1 (1 = a stomp beside you). The camera moves by the
   * square of it (small tremors stay small), smoothly — a rolling tremor, not a
   * per-frame buzz — and it dies away over about a second.
   */
  shake(trauma: number): void {
    this.trauma = Math.min(1, Math.max(this.trauma, trauma))
  }

  setProfile(p: CameraProfile): void {
    this.profile = p
    this.dist = p.dist
    this.snapped = false
  }

  /** Start over: the camera's eased state dropped (after something left it invalid — see main.ts). */
  reset(): void {
    this.snapped = false
    this.held = this.dist
    this.lift = 0
    this.trauma = 0
    if (!Number.isFinite(this.yaw)) this.yaw = 0
    if (!Number.isFinite(this.pitch)) this.pitch = 0.15
    this.focus.set(0, 0, 0)
  }

  /** Change profile without a cut: the distance eases over (riding on and off). */
  blendTo(p: CameraProfile): void {
    if (p === this.profile) return
    this.profile = p
    this.userDist = false
  }

  /** Ease the distance toward the profile's own (called each frame after blendTo). */
  ease(dt: number): void {
    const want = THREE.MathUtils.clamp(this.profile.dist, this.profile.minDist, this.profile.maxDist)
    if (Math.abs(this.dist - want) > 0.01 && !this.userDist) this.dist += (want - this.dist) * Math.min(1, dt * 1.5)
  }

  /** The player has zoomed by hand (then the profile's distance no longer pulls). */
  private userDist = false
  /** The scale director's hand (scale.ts): the focus lowered, the distance scaled. */
  drop = 0
  distMul = 1

  /** Signed distance to solid rock (negative inside), so the camera stays out of it. */
  occluder: ((x: number, y: number, z: number) => number) | null = null
  /**
   * The near terrain mesh's grid step (m). The ground the camera keeps clear of is the mesh's, not the
   * true height: on a cliff a 1 m triangle bridges the drop, standing up to 3 m above the true height
   * at a point — the camera sat under the drawn ground and the screen went white (seen through the
   * land's back faces to the sky — tour review, 2026-11-06, a ledge at the Old Wood's cliffs).
   */
  meshStep = 1
  /** How far the camera is raised over the focus where there is no room for it (eased). */
  private lift = 0
  /** Set while a bow is drawn: the camera holds still under the aim (no rising, see update). */
  aiming = false
  /** How far out the camera may go now (eases back out after being pulled in). */
  private held = Infinity

  get distance(): number {
    return this.dist
  }

  set distance(d: number) {
    this.dist = THREE.MathUtils.clamp(d, this.profile.minDist, this.profile.maxDist)
  }

  update(dt: number, dx: number, dy: number, wheel: number, subject: THREE.Vector3, terrain: Terrain): void {
    this.yaw -= dx * 0.0024 * this.sensitivity
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.0024 * this.sensitivity * (this.invertY ? -1 : 1), -0.75, 1.4)
    if (wheel !== 0) {
      this.distance = this.dist * Math.pow(1.12, wheel)
      this.userDist = true
    }

    const p = this.profile
    const fy = subject.y + Math.max(0.6, p.focusHeight - this.drop)
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
      // (Never more than a few metres behind. The eased lag is speed / follow — 33 m in Creative's
      // fast flight — and swung with every frame's length (6 to 33 m frame to frame): the body
      // stuttered across the screen. Capped, the trail is steady however fast you go; at a walk,
      // a glide or a fall it is well under the cap and nothing changes.)
      const lx = this.focus.x - subject.x, ly = this.focus.y - fy, lz = this.focus.z - subject.z
      const lag = Math.hypot(lx, ly, lz)
      if (lag > MAX_LAG) {
        const s = MAX_LAG / lag
        this.focus.set(subject.x + lx * s, fy + ly * s, subject.z + lz * s)
      }
    }
    // The focus is never under the ground.
    this.focus.y = Math.max(this.focus.y, terrain.heightAt(this.focus.x, this.focus.z) + 0.5)

    // The ground as the mesh draws it at (x, z): its grid's corners blended. (Not the land's true height —
    // on a cliff a grid triangle bridges the drop up to 3 m above it, and the camera sat under the drawn
    // ground, the screen white; nor the grid's highest corner — over-cautious, it pulled the camera in at
    // every hollow, and the bow's aim was 33° off at the bell.)
    const s = this.meshStep
    const drawn = (x: number, z: number): number => {
      const x0 = Math.floor(x / s) * s
      const z0 = Math.floor(z / s) * s
      const fx = (x - x0) / s
      const fz = (z - z0) / s
      const a = terrain.heightAt(x0, z0) + (terrain.heightAt(x0 + s, z0) - terrain.heightAt(x0, z0)) * fx
      const b = terrain.heightAt(x0, z0 + s) + (terrain.heightAt(x0 + s, z0 + s) - terrain.heightAt(x0, z0 + s)) * fx
      return a + (b - a) * fz
    }
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
    // (The unit direction from the rig's own distance; then out to dist × distMul.)
    const want = this.dist * this.distMul
    let clear = want
    const ux = (cam.x - this.focus.x) / this.dist
    const uy = (cam.y - this.focus.y) / this.dist
    const uz = (cam.z - this.focus.z) / this.dist
    // (Starting inside rock — on a giant's body the march begins within its rough shape —
    // counts only once the line has come out into the open: hit at once, the camera was
    // pulled into your back the whole climb.)
    let outside = !(this.occluder && this.occluder(this.focus.x, this.focus.y, this.focus.z) < 0.5)
    for (let t = 0.6; t <= want; t += Math.max(0.35, t * 0.08)) {
      const x = this.focus.x + ux * t
      const y = this.focus.y + uy * t
      const z = this.focus.z + uz * t
      let solid = this.occluder ? this.occluder(x, y, z) < 0.5 : false
      if (!outside) {
        if (!solid) outside = true
        solid = false
      }
      if (solid || y < drawn(x, z) + 0.35) {
        clear = Math.max(0.6, t - 0.5)
        break
      }
    }
    // (Pulled in fast, not at once: a giant's leg swinging across the line snapped the camera 6–9 m
    // in a frame while you climbed — the playtest's camera snaps. At 40 m/s it comes in over a few
    // frames; the leg may cross the view for them. The camera's own spot is still kept out of the
    // rock every frame, below.)
    // (The ground cannot swing across the line, and pulling in to it at once keeps the view steady
    // under your hand — the bow's aim settles in a frame; rate-limited, the bell gate's aim drifted
    // and missed.)
    this.held = clear < this.held ? (!this.aiming ? Math.max(clear, this.held - dt * 40) : clear) : this.held + (clear - this.held) * Math.min(1, dt * 2.5)
    let d = Math.min(want, this.held)
    // The camera is a ball, not a point (QA, the user: "camera through things"): on the line it
    // stopped short of rock, but sat a hand's width from a wall or a slope beside it and the near
    // plane cut into them. Pulled in until there is room all round it.
    const room = (cx: number, cy: number, cz: number): boolean => {
      if (this.occluder && this.occluder(cx, cy, cz) < CAM_R) return false
      for (const [ox, oz] of RING) if (cy < drawn(cx + ox * CAM_R, cz + oz * CAM_R) + CAM_R) return false
      return true
    }
    for (let i = 0; i < 12 && d > 0.6 && !room(this.focus.x + ux * d, this.focus.y + uy * d, this.focus.z + uz * d); i++) d = Math.max(0.6, d - 0.3)
    // (Also over a few frames when only the room round the lens is short — a giant's leg sweeping past
    // pulled it 1.8 m in one frame, playtest; at once only if the lens itself would be inside rock.)
    if (d < this.held) {
      const lensIn = this.occluder ? this.occluder(this.focus.x + ux * this.held, this.focus.y + uy * this.held, this.focus.z + uz * this.held) < 0.05 : false
      this.held = lensIn || this.aiming ? d : Math.max(d, this.held - dt * 40)
      d = this.held
    }
    cam.set(this.focus.x + ux * d, this.focus.y + uy * d, this.focus.z + uz * d)
    // Pulled all the way in and still no room — on a ledge against a cliff, a wall 10 cm from the lens
    // and the near plane cutting through it to the white beyond: up over your head instead, eased.
    let lift = 0
    // (Not when you look up — the camera sits low behind you then by design, the ground just under it —
    // nor while aiming: risen, the view tilted 11° and drifted as it eased, and the bow missed.)
    // (Never under a roof — in the Undercroft, its stair and the ground round its walls — where rising
    // put the camera up into the stone and the screen went black: the user, 2026-11-07, coming up out
    // of the hall.)
    const roofed = inHall(this.focus.x, this.focus.z, 40)
    if (this.pitch > 0.02 && !this.aiming && !roofed) while (lift < 4 && !room(cam.x, cam.y + lift, cam.z)) lift += 0.25
    // (And only if rising finds room: rising the full 4 m into solid stone — down a hollow under the
    // Sentinel's plinth, the camera already inside it — put the lens deeper in rock; tour in a real window.)
    if (lift >= 4 && !room(cam.x, cam.y + lift, cam.z)) lift = 0
    if (this.aiming) this.lift = 0
    this.lift += (lift - this.lift) * Math.min(1, dt * (lift > this.lift ? 12 : 2))
    cam.y += this.lift
    const floor = drawn(cam.x, cam.z) + 0.45
    if (cam.y < floor) cam.y = floor

    if (this.trauma > 0.002) {
      this.shakeT += dt
      const t = this.shakeT
      const a = SHAKE_MAX * this.trauma * this.trauma * this.shakeScale
      cam.x += a * (Math.sin(t * 21.7) + 0.5 * Math.sin(t * 37.1 + 1.3)) / 1.5
      cam.y += a * (Math.sin(t * 25.3 + 2.1) + 0.5 * Math.sin(t * 41.9 + 0.4)) / 1.5
      cam.z += a * (Math.sin(t * 19.1 + 4.2) + 0.5 * Math.sin(t * 33.7 + 2.9)) / 1.5
      this.trauma = Math.max(0, this.trauma - dt * 1.1)
    }

    // Below the horizon line, pitch tilts the gaze up instead of the camera down.
    const up = this.pitch < -0.08 ? (-this.pitch - 0.08) * 2.4 : 0
    this.look.copy(this.focus)
    this.look.y += Math.tan(Math.min(up, 1.35)) * this.dist
    // (Lifted over your head, it looks on past you — over the shoulder, not straight down on you.)
    const hl = Math.hypot(ux, uz) || 1
    this.look.x -= (ux / hl) * this.lift * 0.45
    this.look.z -= (uz / hl) * this.lift * 0.45
    this.camera.lookAt(this.look)
  }
}
