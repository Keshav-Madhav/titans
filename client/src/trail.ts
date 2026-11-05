// Your trail (user, 2026-11-05, idea #11): where you walk, the grass is pressed down and springs
// back over half a minute; where you walk often, a faint path wears in — trodden, paler, the grass
// thinner — and fades again over a long while if you stop using it. The land remembers you a little.
//
// A sparse store in 1 m cells (only cells you have walked), and a small texture of the 128 m round
// you (R pressed, G worn), refreshed a few times a second for the grass and the ground to read.

import * as THREE from 'three'

const N = 128
/** How long pressed grass takes to spring back (seconds to fade to ~1/e). */
const PRESS_TAU = 22
/** How fast a path wears in (per footfall) and fades (per second). */
const WEAR_STEP = 0.035
const WEAR_FADE = 1 / 1800

interface Cell {
  press: number
  wear: number
  /** Game time it was last updated (for decay on read). */
  t: number
}

/** The uniforms the grass and the ground read it through (shared; the Trail fills them). */
export const trailU = {
  tTrail: { value: null as THREE.Texture | null },
  uTrailO: { value: new THREE.Vector2(-1e6, -1e6) },
  uTrailS: { value: N },
}

export class Trail {
  readonly texture: THREE.DataTexture
  private readonly data = new Uint8Array(N * N * 4)
  private readonly cells = new Map<number, Cell>()
  private time = 0
  private refresh = 0
  private ox = Infinity
  private oz = Infinity

  constructor() {
    this.texture = new THREE.DataTexture(this.data, N, N, THREE.RGBAFormat)
    this.texture.magFilter = this.texture.minFilter = THREE.LinearFilter
    this.texture.needsUpdate = true
    trailU.tTrail.value = this.texture
  }

  private static key(ix: number, iz: number): number {
    return (ix + 32768) * 65536 + (iz + 32768)
  }

  /** A footfall at (x, z): pressed round it, and a little more worn. */
  step(x: number, z: number, pace: number): void {
    const r = 0.6 + 0.4 * pace
    for (let iz = Math.floor(z - r); iz <= Math.floor(z + r); iz++)
      for (let ix = Math.floor(x - r); ix <= Math.floor(x + r); ix++) {
        const d = Math.hypot(ix + 0.5 - x, iz + 0.5 - z)
        if (d > r + 0.5) continue
        const k = 1 - Math.min(1, d / (r + 0.5))
        const c = this.cell(ix, iz)
        c.press = Math.min(1, c.press + 0.85 * k)
        c.wear = Math.min(1, c.wear + WEAR_STEP * k)
      }
    this.refresh = 0
  }

  private cell(ix: number, iz: number): Cell {
    const key = Trail.key(ix, iz)
    let c = this.cells.get(key)
    if (!c) {
      c = { press: 0, wear: 0, t: this.time }
      this.cells.set(key, c)
    } else this.decay(c)
    return c
  }

  private decay(c: Cell): void {
    const dt = this.time - c.t
    if (dt <= 0) return
    c.press *= Math.exp(-dt / PRESS_TAU)
    c.wear = Math.max(0, c.wear - dt * WEAR_FADE)
    c.t = this.time
  }

  /** Advance, and refresh the texture round `p` a few times a second. */
  update(dt: number, p: THREE.Vector3): void {
    this.time += dt
    this.refresh -= dt
    const ox = Math.floor(p.x) - N / 2
    const oz = Math.floor(p.z) - N / 2
    const moved = Math.abs(ox - this.ox) > 8 || Math.abs(oz - this.oz) > 8
    if (this.refresh > 0 && !moved) return
    this.refresh = 0.25
    if (moved) {
      this.ox = ox
      this.oz = oz
      trailU.uTrailO.value.set(ox, oz)
    }
    const d = this.data
    d.fill(0)
    for (const [key, c] of this.cells) {
      const ix = Math.floor(key / 65536) - 32768
      const iz = (key % 65536) - 32768
      this.decay(c)
      // Forget cells with nothing left in them.
      if (c.press < 0.01 && c.wear < 0.005) {
        this.cells.delete(key)
        continue
      }
      const tx = ix - this.ox
      const tz = iz - this.oz
      if (tx < 0 || tz < 0 || tx >= N || tz >= N) continue
      const o = (tz * N + tx) * 4
      d[o] = Math.round(c.press * 255)
      d[o + 1] = Math.round(c.wear * 255)
    }
    this.texture.needsUpdate = true
  }

  /** Tools: how many cells remembered. */
  get size(): number {
    return this.cells.size
  }
}

/** GLSL to read it: trailAt(worldXZ) → vec2(pressed, worn). Needs uniforms tTrail, uTrailO, uTrailS. */
export const TRAIL_GLSL = /* glsl */ `
  uniform sampler2D tTrail;
  uniform vec2 uTrailO;
  uniform float uTrailS;
  vec2 trailAt(vec2 xz) {
    vec2 uv = (xz - uTrailO) / uTrailS;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec2(0.0);
    return texture2D(tTrail, uv).rg;
  }
`
