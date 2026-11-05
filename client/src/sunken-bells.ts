// The sunken bells (user's pick #7, "must be done very well, so carefully"; PLAN §4b). One per
// land: a bronze bell green with age, hung on a short iron chain from an old stone yoke standing
// alone in the land, its lip a little clear of the grass, with a striking-beam hung beside it from
// the same lintel on two old ropes.
//
// Ringing it is slow and physical. E: you set your shoulder to the beam and it swings in. The bell
// answers with a hum that breathes — it swells and fades on its own, every BREATH seconds — and the
// beam swings back and returns on the same breath (it is a pendulum of that period). Strike again as
// the beam comes back to you, on the swell, and the hum grows. Strike against it and the hum chokes
// and falls back. Five strokes in time and the land answers (the caller wakes the change: PLAN §4b).
//
// Nothing here talks after the first prompt. The swell is heard (the hum's breath), seen (the beam
// coming back; a faint light breathing on the bronze lip) and felt (the bell's dust shivering).

import * as THREE from 'three'
import { mulberry32, type Terrain } from '@titans/shared'
import { weatheredStone } from './weathered-stone'
import type { Shape } from './rock-fields'
import type { Build } from './lanterns'
import type { Formation } from './rocks'

export interface SunkBellDef {
  /** The land's name for it (and the save). */
  id: string
  x: number
  z: number
  /** Which way the yoke faces (radians). */
  rot: number
  seed: number
}

/** The hum's breath, and the beam's swing: one period (s). */
export const BREATH = 2.6
/** Strokes in time to wake it. */
export const STROKES = 5
/** How near the swell a stroke must land (fraction of a breath either side). */
const WINDOW = 0.17
const REACH = 3.2

export interface SunkBell {
  def: SunkBellDef
  /** Where you stand to strike (the beam's end). */
  stand: THREE.Vector3
  /** The bell's centre (for sound and the giants' gaze). */
  at: THREE.Vector3
  /** Strokes in time so far (0 … STROKES). */
  count: number
  /** Seconds since the last stroke (Infinity: silent). */
  since: number
  /** The hum's level now (0 … 1), eased. */
  hum: number
  woken: boolean
  beam: THREE.Group
  /** Its bronze (its own: the light breathing on it is this bell's). */
  lip: THREE.MeshStandardMaterial
  bell: THREE.Group
}

/** A cast bell's outline, lip (0) to crown (1): flared lip, sound bow, waist, round shoulder. */
const PROFILE: Array<[number, number]> = [
  [0.0, 1.3], [0.03, 1.33], [0.08, 1.26], [0.16, 1.1], [0.28, 0.96], [0.45, 0.87], [0.62, 0.83],
  [0.76, 0.81], [0.85, 0.77], [0.91, 0.68], [0.96, 0.5], [0.99, 0.25], [1.0, 0.0],
]
const BELL_H = 3.4
/** The hanging bell's lip, above the yoke's foot (its origin, 0.4 m under the ground). */
const LIP_Y = 6.3 - (1.0 + BELL_H + 0.39)
function outline(t: number): number {
  for (let i = 1; i < PROFILE.length; i++)
    if (t <= PROFILE[i][0]) {
      const [t0, r0] = PROFILE[i - 1]
      const [t1, r1] = PROFILE[i]
      const k = (t - t0) / (t1 - t0)
      return r0 + (r1 - r0) * (k * k * (3 - 2 * k))
    }
  return 0
}

/** The bell: bronze walls with a hollow inside (its mouth shows from below), bands, a crown loop. */
function bellGeometry(): THREE.BufferGeometry {
  const N = 30
  // The outside, lip up to the crown (a lathe of points going up faces out), and round under the
  // lip to the inside wall.
  const outer: THREE.Vector2[] = [new THREE.Vector2(1.17, 0.0), new THREE.Vector2(1.36, 0.02)]
  for (let i = 0; i <= N; i++) {
    const t = i / N
    outer.push(new THREE.Vector2(Math.max(0.001, outline(t)), t * BELL_H))
  }
  // The inside: built the same way (going up), then turned to face the hollow.
  const inner: THREE.Vector2[] = []
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * 0.94
    inner.push(new THREE.Vector2(Math.max(0.001, outline(t) - 0.13), t * BELL_H))
  }
  const inside = new THREE.LatheGeometry(inner, 40).toNonIndexed()
  {
    const p = inside.getAttribute('position')
    const n = inside.getAttribute('normal')
    for (let i = 0; i < p.count; i += 3) {
      // Reverse each triangle's winding, and its normals.
      for (const attr of [p, n]) {
        const x = attr.getX(i + 1), y = attr.getY(i + 1), z = attr.getZ(i + 1)
        attr.setXYZ(i + 1, attr.getX(i + 2), attr.getY(i + 2), attr.getZ(i + 2))
        attr.setXYZ(i + 2, x, y, z)
      }
    }
    for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i))
  }
  const parts: THREE.BufferGeometry[] = [new THREE.LatheGeometry(outer, 40), inside]
  // Two raised bands (one low on the sound bow, one on the shoulder) and the loop it hangs from.
  for (const t of [0.12, 0.8]) parts.push(new THREE.TorusGeometry(outline(t) + 0.01, 0.045, 6, 40).rotateX(Math.PI / 2).translate(0, t * BELL_H, 0))
  parts.push(new THREE.TorusGeometry(0.34, 0.11, 8, 18).translate(0, BELL_H + 0.28, 0))
  return mergeParts(parts)
}

export class SunkenBells {
  readonly group = new THREE.Group()
  readonly bells: SunkBell[] = []
  private time = 0
  /** A stroke: `good` (in time, or the first), the count after it, and the bell. */
  onStrike: (b: SunkBell, good: boolean) => void = () => {}
  /** Five in time: the land answers. */
  onWake: (b: SunkBell) => void = () => {}

  constructor(defs: SunkBellDef[], terrain: Terrain, build: Build) {
    const bronze = new THREE.MeshStandardMaterial({ color: 0x4f6a57, metalness: 0.3, roughness: 0.6 })
    // (Verdigris in the hollows, bronze where it is rubbed: a little warmer on the lip and crown.)
    bronze.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vBy;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBy = position.y;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vBy;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n  float rub = smoothstep(0.35, 0.0, vBy) + smoothstep(3.0, 3.4, vBy) * 0.6 + smoothstep(0.03, 0.0, abs(vBy - 0.41)) * 0.5 + smoothstep(0.03, 0.0, abs(vBy - 2.72)) * 0.5;\n  float mott = 0.5 + 0.5 * sin(vBy * 7.0 + sin(vBy * 23.0) * 1.3);\n  diffuseColor.rgb = mix(diffuseColor.rgb * (0.8 + 0.35 * mott), vec3(0.4, 0.29, 0.16), 0.6 * clamp(rub, 0.0, 1.0));')
    }
    bronze.customProgramCacheKey = () => 'sunk-bell'
    const bellGeo = bellGeometry()
    const wood = new THREE.MeshStandardMaterial({ color: 0x6f5a40, roughness: 0.88 })
    const rope = new THREE.MeshStandardMaterial({ color: 0x6e604a, roughness: 1 })
    const iron = new THREE.MeshStandardMaterial({ color: 0x2e2b28, metalness: 0.6, roughness: 0.65 })
    for (const def of defs) {
      const rand = mulberry32(def.seed)
      const y = terrain.heightAt(def.x, def.z)
      const ax = Math.cos(def.rot)
      const az = -Math.sin(def.rot)
      // The bell: sunk to a little over half its height, tilted where it fell, mouth half buried.
      const bell = new THREE.Group()
      const own = bronze.clone()
      own.onBeforeCompile = bronze.onBeforeCompile
      own.customProgramCacheKey = bronze.customProgramCacheKey
      own.emissive = new THREE.Color(0.55, 0.75, 0.35)
      own.emissiveIntensity = 0
      const body = new THREE.Mesh(bellGeo, own)
      body.castShadow = body.receiveShadow = true
      const lip = own
      // Hung from the lintel by its crown loop on a short iron chain (user, 2026-11-05: "the bell
      // is not attached" — it stood loose on the grass under the yoke). The group's origin is the
      // hanging point, so the bell sways from it; its lip hangs a little clear of the grass.
      const HANG = y - 0.4 + 6.4 - 0.1
      const CHAIN = 1.0
      body.position.y = -(CHAIN + BELL_H + 0.39)
      bell.add(body)
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, CHAIN + 0.1, 6).translate(0, -(CHAIN + 0.1) / 2, 0), iron)
      chain.castShadow = true
      bell.add(chain)
      bell.position.set(def.x, HANG, def.z)
      bell.rotation.y = def.rot
      this.group.add(bell)
      // The yoke: two squared stone posts either side, a lintel across (solid: the rocks' stone).
      const span = 6.2
      const postH = 6.4
      // The lintel is a deep slab (4 m along the way you face): the bell hangs at its back edge,
      // the ram on two straight ropes from under its front, nothing passing through anything; the
      // posts stand under its middle.
      const nx = Math.sin(def.rot)
      const nz = Math.cos(def.rot)
      const MID = 1.4
      const parts: Array<{ geo: THREE.BufferGeometry; box: [number, number, number, number, number, number] }> = []
      for (const s of [-1, 1]) {
        // (weatheredStone is centred on its origin: stood up on the ground here.)
        const g = weatheredStone(0.9, postH, 0.9, rand, true, 0.08)
        g.translate(ax * s * span * 0.5 + nx * MID, postH / 2, az * s * span * 0.5 + nz * MID)
        parts.push({ geo: g, box: [ax * s * span * 0.5 + nx * MID, postH / 2, az * s * span * 0.5 + nz * MID, 0.5, postH / 2, 0.5] })
      }
      const lintel = new THREE.BoxGeometry(span + 1.6, 0.8, 4.0, 4, 1, 3).rotateY(def.rot).translate(nx * MID, postH + 0.3, nz * MID)
      parts.push({ geo: lintel, box: [0, postH + 0.3, 0, 0, 0, 0] })
      const merged = mergeParts(parts.map((p) => p.geo))
      const c = Math.cos(def.rot)
      const sn = Math.sin(def.rot)
      const shape: Shape = {
        field: (lx, ly, lz) => {
          let d = Infinity
          for (const p of parts.slice(0, 2)) {
            const [bx, by, bz, hx, hy, hz] = p.box
            d = Math.min(d, Math.max(Math.abs(lx - bx) - hx, Math.abs(ly - by) - hy, Math.abs(lz - bz) - hz))
          }
          // The lintel, in its own frame (along the yoke).
          const u = lx * c - lz * sn
          const w = lx * sn + lz * c
          d = Math.min(d, Math.max(Math.abs(u) - (span + 1.6) / 2, Math.abs(ly - postH - 0.3) - 0.4, Math.abs(w - MID) - 2.0))
          // The bell hanging under it (solid: you, the camera and arrows stop at the bronze).
          const bt = (ly - LIP_Y) / BELL_H
          if (bt > -0.2 && bt < 1.2) d = Math.min(d, Math.max(Math.hypot(lx, lz) - outline(THREE.MathUtils.clamp(bt, 0, 1)), ly - LIP_Y - BELL_H, LIP_Y - ly))
          return d
        },
        hx: span / 2 + 5,
        hz: span / 2 + 5,
        hy: postH / 2 + 2,
        cy: postH / 2,
      }
      build(shape, merged, { x: def.x, y: y - 0.4, z: def.z })
      // The beam: a log hung from the lintel on two ropes, its end toward you (it swings toward
      // the bell's shoulder, along the yoke's normal).
      const beam = new THREE.Group()
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.3, 2.4, 12, 1).rotateX(Math.PI / 2), wood)
      log.castShadow = true
      // Its near end against the bell's sound bow (1.15 m out from its axis, at the lip's height
      // plus half a metre).
      log.position.set(0, -4.3, 0)
      beam.add(log)
      for (const s of [-1, 1]) {
        // Two ropes straight down from the slab's underside to the log, a hand from either end.
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 4.1, 4).translate(0, -2.05, s * 0.8), rope)
        r.castShadow = true
        beam.add(r)
      }
      beam.position.set(def.x + nx * 2.35, y - 0.4 + postH - 0.1, def.z + nz * 2.35)
      beam.rotation.y = def.rot
      this.group.add(beam)
      const stand = new THREE.Vector3(def.x + nx * 5.6, 0, def.z + nz * 5.6)
      stand.y = terrain.heightAt(stand.x, stand.z)
      this.bells.push({ def, stand, at: new THREE.Vector3(def.x, y + 2.6, def.z), count: 0, since: Infinity, hum: 0, woken: false, beam, lip, bell })
    }
  }

  near(p: THREE.Vector3): SunkBell | null {
    for (const b of this.bells) if (Math.hypot(b.stand.x - p.x, b.stand.z - p.z) < REACH && Math.abs(b.stand.y - p.y) < 2.5) return b
    return null
  }

  /** How close to the swell `since` is (1 on it, 0 a quarter-breath off). */
  static onSwell(since: number): number {
    const ph = (since / BREATH) % 1
    const off = Math.min(ph, 1 - ph)
    return Math.max(0, 1 - off / WINDOW)
  }

  /** A stroke (E). Too soon (the beam still away) does nothing. */
  strike(b: SunkBell): void {
    if (b.since < BREATH * 0.6) return
    // The first stroke starts it; after that, in time is on a swell within the hum's life.
    const first = b.since === Infinity || b.since > BREATH * 3.4
    const good = first || SunkenBells.onSwell(b.since) > 0
    if (first) b.count = 1
    else if (good) b.count = Math.min(STROKES, b.count + 1)
    else b.count = Math.max(0, b.count - 2)
    b.since = 0
    this.onStrike(b, good)
    if (good && b.count >= STROKES && !b.woken) {
      b.woken = true
      this.onWake(b)
    }
  }

  save(): string[] {
    return this.bells.filter((b) => b.woken).map((b) => b.def.id)
  }

  update(dt: number): void {
    this.time += dt
    for (const b of this.bells) {
      b.since += dt
      // The hum: struck up by each stroke (more for each in time), dying over a few breaths.
      const life = Math.exp(-b.since / (BREATH * (1.2 + 0.5 * b.count)))
      const target = b.since === Infinity ? 0 : (0.25 + 0.15 * b.count) * life
      b.hum += (target - b.hum) * Math.min(1, dt * 6)
      // (Never struck: since is Infinity, and cos(Infinity) is NaN — a NaN glow turned the whole bell black.)
      const swell = Number.isFinite(b.since) ? 0.5 + 0.5 * Math.cos((b.since / BREATH) * Math.PI * 2) : 0
      // The beam: it hangs with its end against the bell. Shoved in, it rings it and rebounds
      // toward you, and swings back to touch the bell again one breath later — on the swell:
      // that is when to shove it again. (Damped: left alone, it settles against the bronze.)
      const sw = b.since < BREATH * 4 ? Math.abs(Math.sin((b.since / BREATH) * Math.PI)) * Math.exp(-b.since / (BREATH * 1.8)) : 0
      b.beam.rotation.x = -0.42 * sw
      // The lip's light breathes with the hum; and the bell shivers a hair while it hums.
      b.lip.emissiveIntensity = b.hum * (0.2 + 0.8 * swell) * 0.5 + (b.woken ? 0.05 : 0)
      // Struck, it swings a little away from the ram on its chain and back (and shivers while it hums).
      b.bell.rotation.x = 0.05 * sw + b.hum * 0.0025 * Math.sin(this.time * 70)
    }
  }
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0
  const ps = parts.map((p) => {
    const q = p.index ? p.toNonIndexed() : p
    q.deleteAttribute('uv')
    if (!q.getAttribute('normal')) q.computeVertexNormals()
    n += q.getAttribute('position').count
    return q
  })
  const pos = new Float32Array(n * 3)
  const nor = new Float32Array(n * 3)
  let o = 0
  for (const q of ps) {
    pos.set(q.getAttribute('position').array as Float32Array, o * 3)
    nor.set(q.getAttribute('normal').array as Float32Array, o * 3)
    o += q.getAttribute('position').count
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  return g
}

/**
 * What the Green's bell wakes (PLAN §4b.1): a stone hanging in the sky stops turning and comes
 * down — slowly, a mountain sinking toward you — and plants its broken foot in the grass. Its
 * collision follows it down (the rocks' field reads `f.y`).
 */
export class StoneDescent {
  private t = 0
  private readonly y0: number
  private readonly amp0: number
  done = false
  /** It has struck the ground (once): dust, sound. */
  onLand: () => void = () => {}

  constructor(
    private readonly f: Formation,
    /** Where it comes to rest (its `y`). */
    readonly y1: number,
    readonly secs: number,
  ) {
    this.y0 = f.y
    this.amp0 = f.float?.amp ?? 0
    // It stops turning where it is (and its field turns with it from now on).
    if (f.float && f.mesh) {
      f.rot = f.mesh.rotation.y
      f.cos = Math.cos(f.rot)
      f.sin = Math.sin(f.rot)
      f.float.spin = 0
    }
  }

  /** Done at once (a save where it has already come down). */
  finish(): void {
    this.t = this.secs
    this.apply()
    this.done = true
  }

  update(dt: number): void {
    if (this.done) return
    this.t += dt
    this.apply()
    if (this.t >= this.secs) {
      this.done = true
      this.onLand()
    }
  }

  private apply(): void {
    const k = Math.min(1, this.t / this.secs)
    // Slow to start (it has hung there a long time), slowest at the end: settling, not falling.
    const e = k * k * k * (k * (k * 6 - 15) + 10)
    this.f.y = this.y0 + (this.y1 - this.y0) * e
    if (this.f.float) {
      // The bob stills over the first fifth (its field, at f.y, is where it is drawn by the end).
      this.f.float.amp = this.amp0 * Math.max(0, 1 - k * 5)
    }
  }
}
