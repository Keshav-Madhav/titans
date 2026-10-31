// The scale director (user, 2026-10-31: "add more scale of bigness… use tricks
// like fov and camera angles… dynamic fov… we control the user's experience,
// we need them to feel a certain feeling"). It watches the biggest thing in
// your sight each frame and shapes the camera so it feels as big as it is:
//
//   loom     — the more of the sky a thing fills from where you stand, the
//              wider the lens and the lower and nearer the ground the camera
//              (a worm's-eye view; a wide lens stretches the near and tall)
//   look up  — tilting the view up at it widens the lens further, so its top
//              stays in frame and still feels too far up
//   drift    — stand still under one, hands off the mouse, and your gaze drifts
//              slowly up to its face (any mouse movement and it lets go)
//   stare    — hold your view on something enormous far away and, over a few
//              seconds, the eye narrows on it, the way you would squint at it
//   vertigo  — the moment you first find one of them: a dolly zoom — you stay
//              the same size, the lens narrows, the camera falls back, and the
//              thing behind you swells
//
// It decides only numbers (lens, camera height and distance, a pitch to drift
// to); main.ts applies them to the rig.

import * as THREE from 'three'

export interface BigThing {
  x: number
  z: number
  /** Ground under it and its top (metres). */
  base: number
  top: number
}

export interface ScaleOut {
  /** Degrees added to the lens. */
  fov: number
  /** Metres the camera's focus drops (and the camera with it). */
  drop: number
  /** Multiplies the camera's distance. */
  dist: number
  /** A pitch for the rig to drift toward (null: none). */
  pitch: number | null
}

const VERTIGO = 5.5

export class ScaleDirector {
  private loom = 0
  private stare = 0
  private idle = 0
  private vertigoT = -1
  private vertigoFrom = 58
  /** The thing that fills most of your sky right now (and how much: radians of elevation to its top). */
  dominant: { thing: BigThing; elev: number; dist: number; bearing: number } | null = null
  readonly out: ScaleOut = { fov: 0, drop: 0, dist: 1, pitch: null }
  /** Off: the camera as it was (tools compare with and without). */
  enabled = true

  /** The dolly zoom (on first finding something enormous). */
  vertigo(fov: number): void {
    if (!this.dominant || this.dominant.elev < 0.18) return
    this.vertigoT = 0
    this.vertigoFrom = fov
  }

  get inVertigo(): boolean {
    return this.vertigoT >= 0
  }

  /**
   * `eye` the wanderer's eye; `view` the camera's forward; `mouse` how much
   * the view was moved this frame; `still` whether the wanderer stands still;
   * `pitch` the rig's pitch (negative looks up).
   */
  update(dt: number, things: BigThing[], eye: THREE.Vector3, view: THREE.Vector3, mouse: number, still: boolean, pitch: number, grounded: boolean): ScaleOut {
    // What fills most of your sky.
    let best: ScaleDirector['dominant'] = null
    for (const t of things) {
      const dx = t.x - eye.x
      const dz = t.z - eye.z
      const dist = Math.max(1, Math.hypot(dx, dz))
      const elev = Math.atan2(t.top - eye.y, dist)
      if (!best || elev > best.elev) best = { thing: t, elev, dist, bearing: Math.atan2(dx, dz) }
    }
    this.dominant = best
    if (!this.enabled) {
      this.loom = this.stare = 0
      const o = this.out
      o.fov = 0
      o.drop = 0
      o.dist = 1
      o.pitch = null
      return o
    }
    const vh = Math.atan2(view.x, view.z)
    const facing = best ? Math.cos(best.bearing - vh) : 0

    // Loom: from ~15° of sky to ~60°.
    const loomWant = grounded && best ? THREE.MathUtils.smoothstep(best.elev, 0.25, 1.05) : 0
    this.loom += (loomWant - this.loom) * Math.min(1, dt * 0.7)

    // Mouse idle time (for the drift and the stare).
    this.idle = mouse > 0.5 ? 0 : this.idle + dt

    // Stare: something big and far (beyond ~1.2 km, standing a few degrees tall)
    // that you hold near the centre of your view, still.
    let centred = 0
    for (const t of things) {
      const dx = t.x - eye.x
      const dz = t.z - eye.z
      const dist = Math.hypot(dx, dz)
      if (dist < 1200 || Math.atan2(t.top - t.base, dist) < 0.05) continue
      _to.set(dx, (t.base + t.top) / 2 - eye.y, dz).normalize()
      centred = Math.max(centred, _to.dot(view))
    }
    const stareWant = still && this.idle > 2.5 && centred > Math.cos(0.16) ? 1 : 0
    this.stare += (stareWant - this.stare) * Math.min(1, dt * (stareWant ? 0.18 : 1.2))

    // Look up: the view tilted up (rig pitch below −0.08) widens the lens.
    const up = THREE.MathUtils.clamp((-pitch - 0.08) / 0.6, 0, 1)

    const o = this.out
    const wide = 17 * this.loom + 10 * up * (0.4 + 0.6 * this.loom)
    o.fov = wide - 26 * this.stare
    o.drop = 0.9 * this.loom
    o.dist = 1 - 0.25 * this.loom
    // The stare is a slow dolly too: you keep your size, the far thing rises up behind you.
    if (this.stare > 0.001) {
      const f0 = 58 + wide
      o.dist *= Math.tan(THREE.MathUtils.degToRad(f0 / 2)) / Math.tan(THREE.MathUtils.degToRad((f0 - 26 * this.stare) / 2))
    }
    // Drift: under one, still, mouse idle — the gaze rises toward its upper body.
    o.pitch = null
    // (Not during the vertigo: tilting up would drop you out of the frame as the lens narrows.)
    if (best && grounded && still && this.idle > 1.5 && this.loom > 0.3 && facing > 0.55 && this.vertigoT < 0) {
      const gaze = Math.min(0.95, Math.atan2(best.thing.base + (best.thing.top - best.thing.base) * 0.72 - eye.y, best.dist))
      o.pitch = -(gaze / 2.4 + 0.08)
    }

    // Vertigo: 2.6 s in, the lens narrowing and the camera falling back so you
    // stay the same size; then 2.9 s back out.
    if (this.vertigoT >= 0) {
      this.vertigoT += dt
      const t = this.vertigoT
      const k = t < 2.6 ? ease(t / 2.6) : 1 - ease((t - 2.6) / 2.9)
      // (vertigoFrom is the whole lens at the start, the director's own widening in it.)
      const f0 = this.vertigoFrom
      const f = Math.max(22, f0 - 26 * k)
      o.fov += f - f0
      // dist·tan(fov/2) held: the wanderer keeps its size on screen.
      o.dist *= Math.tan(THREE.MathUtils.degToRad(f0 / 2)) / Math.tan(THREE.MathUtils.degToRad(f / 2))
      if (t > VERTIGO) this.vertigoT = -1
    }
    return o
  }
}

const _to = new THREE.Vector3()
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))
