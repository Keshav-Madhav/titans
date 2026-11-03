// The Wanderer: a small figure in a red cloak — the one thing in this world
// at human scale, so it has to read at a glance from far away and feel alive
// up close. Procedural: a slim body in a dark tunic, jointed legs and boots,
// arms that swing, a deep pointed hood with the face lost in shadow; and
// cloth — a long red cape and a scarf, simulated (verlet), streaming behind
// when you run, lifted by the weather's wind, never through the body or the
// ground. A small lantern at the hip glows warm in dark places.

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { type Terrain } from '@titans/shared'

const WALK = 4.2
const SPRINT = 8.5
/**
 * The long run: hold a sprint over open, level ground and the stride
 * lengthens to this (the lands are kilometres across; SotC had a horse).
 */
const LONG = 14.5
/** Hip to sole (m): the length the stride is measured with. */
const LEG = 0.93
const ease01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))
/**
 * Flight with the wing-cloak (user: "make gliding a physics based thing so
 * players can master it, not just pressing W"). A small glider: lift and drag
 * grow with the square of airspeed; W lowers the nose (less lift: you dive and
 * gain speed), S raises it (more lift: you climb, and bleed speed), A / D bank
 * you into a turn (steeper turns sink more); below ~8 m/s the cloak stalls and
 * you drop until speed returns. Air rising off steep ground ahead lifts you:
 * ride a ridge and you can stay up.
 */
const FLY_G = 11
const KL = 0.079
const CD0 = 0.04
const ACCEL = 14
const JUMP = 5.6
/** Water deeper than this, you swim (metres); you float this far down in it; swimming speeds. */
const SWIM_DEPTH = 1.3
const SWIM_SINK = 1.12
const SWIM = 2.2
const SWIM_FAST = 3.4
const GRAVITY = 18
/** Steeper than this (rise over run, ≈ 50°) you cannot walk up: you slide. */
export const MAX_SLOPE = 1.2
/** Steeper than walking, but you can scramble up it pushing on (rise over run); past this it is a cliff: climb it (E). */
export const SCRAMBLE_SLOPE = 1.85
const SLIDE = 14

const _up = new THREE.Vector3(0, 1, 0)
const _side = new THREE.Vector3(1, 0, 0)
const _tq = new THREE.Quaternion()
const _fwd = new THREE.Vector3(0, 0, 1)
const _tv = new THREE.Vector3()
const _cx = new THREE.Vector3()
const _cy = new THREE.Vector3()
const _cz = new THREE.Vector3()
const _cm = new THREE.Matrix4()
const _v = new THREE.Vector3()
const _w = new THREE.Vector3()
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()

const RED = 0xa3241c
const TUNIC = 0x5e4c3a
const LEATHER = 0x3a2a1c
const WRAPS = 0x6a604f

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
    // (Any triangle with a corner outside the opening stays; its corners inside are moved
    // out onto the opening's edge, below — a clean round rim, not a saw-tooth of whole
    // triangles missing.)
    let out = false
    for (let k = 0; k < 3; k++) if (new THREE.Vector3().fromBufferAttribute(p, t + k).normalize().dot(axis) <= cos) out = true
    if (!out) continue
    keep.push(t, t + 1, t + 2)
  }
  const sin = Math.sin(openingAngle)
  const v = new THREE.Vector3()
  const perp = new THREE.Vector3()
  for (const i of keep) {
    v.fromBufferAttribute(p, i)
    const r = v.length()
    if (v.clone().normalize().dot(axis) <= cos) continue
    perp.copy(v).addScaledVector(axis, -v.dot(axis))
    if (perp.lengthSq() < 1e-10) continue
    perp.normalize()
    v.copy(axis).multiplyScalar(cos * r).addScaledVector(perp, sin * r)
    p.setXYZ(i, v.x, v.y, v.z)
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

/**
 * The mantle: the hood's skirt, draped over the shoulders — a curved fall of cloth, wider across
 * than front to back, longer, with a soft wave at its hem. (It was a short straight cone, a red
 * lampshade with the shoulders poking out under its brim.)
 */
function mantleGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = []
  const N = 7
  for (let i = 0; i <= N; i++) {
    const t = i / N
    // Close at the neck, rounding out over the shoulders, then falling nearly straight.
    pts.push(new THREE.Vector2(0.11 + 0.215 * Math.pow(Math.sin((t * Math.PI) / 2), 0.6), 0.04 - 0.3 * t))
  }
  const g = new THREE.LatheGeometry(pts, 24)
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const a = Math.atan2(z, x)
    const low = THREE.MathUtils.smoothstep(-y, 0.12, 0.26)
    // A soft wave at the hem, and a little longer at the back.
    pos.setY(i, y - low * (0.018 * Math.sin(a * 6) + 0.035 * Math.max(0, -Math.sin(a))))
  }
  g.computeVertexNormals()
  return g.translate(0, 0.005, -0.01).scale(1.2, 1, 0.84)
}

/** The hood: the shell, drawn back to a soft point behind the head. */
function hoodGeometry(): THREE.BufferGeometry {
  const g = hoodShell(0.165, 0.72)
  const p = g.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    const z = p.getZ(i)
    const back = Math.max(0, -z) / 0.165
    const top = Math.max(0, y) / 0.165
    const x = p.getX(i)
    // (Drawn back to a real point — a cowl, not a ball: at 0.12 it read as a red sphere —
    // with a seam down the middle of the back where the two halves were sewn.)
    const peak = back * back * top
    const seam = Math.exp(-((x / 0.022) ** 2)) * back * 0.014
    p.setXYZ(i, x * (1 - 0.32 * back * top), y + back * top * 0.07 - peak * 0.015, z - peak * 0.22 + seam)
  }
  // (Welded, so the reshaped shell shades smooth rather than in facets.)
  g.deleteAttribute('normal')
  const w = mergeVertices(g, 1e-5)
  w.computeVertexNormals()
  return w.scale(1, 1.15, 1.1)
}

// --- cloth ------------------------------------------------------------------------

/**
 * The rest of what the traveller wears, as grey patterns multiplied by each
 * material's colour: `wool` (a tunic's knit, a seam, a darker patch or two),
 * `wrap` (cloth wound round the shins, in overlapping bands), `leather` (grain,
 * scuffs, a stitched edge).
 */
function fabricTexture(kind: 'wool' | 'wrap' | 'leather'): THREE.CanvasTexture {
  const S = 128
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const img = g.createImageData(S, S)
  let seed = kind.length * 4099 + 17
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const blot = Array.from({ length: 5 }, () => [rnd() * S, rnd() * S, 8 + rnd() * 18])
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let l = 1
      if (kind === 'wool') {
        // Knit: small v-shaped stitches in columns.
        const cx = x % 4
        const cy = (y + (cx < 2 ? cx : 3 - cx)) % 4
        l = 0.86 + 0.1 * (cy < 2 ? 1 : 0) + 0.04 * Math.sin(x * 0.9)
        if (Math.abs(x - S * 0.5) < 1) l *= 0.82 // a seam
      } else if (kind === 'wrap') {
        // Bands wound on a slant, each edge a shade darker, a weave across them.
        const t = (y + x * 0.35) % 14
        l = 0.84 + 0.12 * Math.min(1, t / 3) - (t > 12 ? 0.14 : 0) + 0.04 * ((x + y) % 2)
      } else {
        l = 0.8 + 0.2 * rnd()
        l = 0.88 + (l - 0.88) * 0.5
        if (y < 3 || y > S - 4) l *= 0.8 // an edge
        if ((y === 5 || y === S - 6) && x % 6 < 3) l *= 1.25 // stitches
      }
      for (const [bx, by, r] of blot) {
        const d = Math.hypot(x - bx, y - by) / r
        if (d < 1) l *= 1 - 0.07 * (1 - d)
      }
      l *= 0.96 + rnd() * 0.06
      const k = (y * S + x) * 4
      img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.min(255, l * 235)
      img.data[k + 3] = 255
    }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(3, 3)
  t.anisotropy = 4
  return t
}

/**
 * The cloak's weave: a fine twill, soft lengthwise folds, wear at the edges and
 * a darker embroidered band at the hem (grey, multiplied by the cloak's colour).
 */
function clothTexture(): THREE.CanvasTexture {
  const W = 256
  const H = 256
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const img = g.createImageData(W, H)
  let seed = 9173
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const noise = new Float32Array(W)
  for (let i = 0; i < W; i++) noise[i] = rnd()
  for (let y = 0; y < H; y++) {
    const v = y / H // 0 top (shoulders) … 1 hem
    for (let x = 0; x < W; x++) {
      const u = x / W
      // Twill: fine diagonal ribs.
      const twill = 0.94 + 0.06 * Math.sin((x + y) * 1.6) * Math.sin((x - y) * 0.35 + 1.0)
      // Lengthwise folds (soft shading), more toward the hem.
      const fold = 1 - 0.1 * v * (0.5 + 0.5 * Math.sin(u * Math.PI * 7 + noise[(x >> 3) & 255] * 1.5))
      // Worn edges and a frayed, darker hem.
      const edge = Math.min(u, 1 - u)
      const wear = 1 - 0.12 * (1 - Math.min(1, edge * 14)) - 0.18 * Math.max(0, (v - 0.94) / 0.06)
      // The band: two thin lines and a stitched zigzag between, just above the hem.
      const b0 = v > 0.8 && v < 0.81
      const b1 = v > 0.885 && v < 0.895
      const zig = v > 0.815 && v < 0.88 && Math.abs(((x / 6) % 2) - 1) * 0.065 + 0.815 > v - 0.004 && Math.abs(((x / 6) % 2) - 1) * 0.065 + 0.815 < v + 0.004
      const band = b0 || b1 || zig ? 0.55 : v > 0.8 && v < 0.9 ? 0.86 : 1
      const speck = 0.97 + rnd() * 0.06
      const l = Math.max(0, Math.min(1, twill * fold * wear * band * speck))
      const k = (y * W + x) * 4
      img.data[k] = img.data[k + 1] = img.data[k + 2] = l * 255
      img.data[k + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** A limb the cloth keeps out of: a→b, radius r. */
interface Capsule {
  a: THREE.Vector3
  b: THREE.Vector3
  r: number
}
/** How much of the body's movement the cloth is carried with each step (the rest it trails). */
const CARRY = 0.82

/**
 * A sheet of cloth: a grid of verlet particles, the top row pinned to points
 * that follow the body, the rest hanging under gravity and the wind, held
 * together by distance constraints, kept out of a capsule round the body and
 * above the ground. Drawn as a double-sided mesh rebuilt each frame.
 */
class Cloth {
  /** Floating: the floor under it is water, not a wall to be pushed back from. */
  water = false
  readonly mesh: THREE.Mesh
  private readonly p: Float32Array
  private readonly q: Float32Array
  private ready = false
  /** How deep the folds it remembers are, at the hem (metres; 0: none). */
  pleats = 0
  /** 0 moving … 1 at rest: how firmly it settles into its folds (and flare). */
  rest = 0
  /** The pinned spacing between neighbouring columns (set from the first pins). */
  private widths: number[] = []
  /** The ground under each particle (+3 cm), this frame. */
  private readonly floor: Float32Array

  constructor(
    private readonly cols: number,
    private readonly rows: number,
    private readonly seg: number,
    material: THREE.Material,
    /** Width of the strip at each row (1 = as pinned): a scarf tapers. */
    private readonly taper: (row: number) => number = () => 1,
  ) {
    this.p = new Float32Array(cols * rows * 3)
    this.q = new Float32Array(cols * rows * 3)
    this.floor = new Float32Array(cols * rows)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cols * rows * 3), 3))
    // (The cloth's texture: across the width, and from the shoulders, v = 1, down to the hem.)
    const uv = new Float32Array(cols * rows * 2)
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) uv.set([c / (cols - 1), 1 - r / (rows - 1)], (r * cols + c) * 2)
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    const idx: number[] = []
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c
        idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1)
      }
    }
    g.setIndex(idx)
    this.mesh = new THREE.Mesh(g, material)
    this.mesh.castShadow = true
    this.mesh.frustumCulled = false
  }

  /**
   * Advance by dt. `pins` are the top row's world positions; `hang` the way
   * it hangs from them when still; `wind` an acceleration; the body a capsule
   * (a→b, radius r) the cloth stays outside; `ground` the land under it.
   */
  step(dt: number, pins: THREE.Vector3[], hang: THREE.Vector3, wind: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, r: number, ground: (x: number, z: number) => number, limbs: Capsule[] = []): void {
    const { cols, rows, p, q } = this
    // The first time, or after a teleport: hang straight from the pins.
    if (!this.ready || pins[0].distanceTo(_v.set(p[0], p[1], p[2])) > 4) {
      this.widths = pins.slice(1).map((v, i) => v.distanceTo(pins[i]))
      for (let row = 0; row < rows; row++) {
        for (let c = 0; c < cols; c++) {
          const k = (row * cols + c) * 3
          p[k] = q[k] = pins[c].x + hang.x * this.seg * row
          p[k + 1] = q[k + 1] = pins[c].y + hang.y * this.seg * row
          p[k + 2] = q[k + 2] = pins[c].z + hang.z * this.seg * row
        }
      }
      this.ready = true
    }
    // The body carries the cloth with it (most of the way): it feels how you move
    // relative to the air, not the whole of a run or a 40 m/s dive at once — which
    // no number of constraint passes could hold, and it smeared out into strips.
    // (Fast, it is carried nearer all the way: left 18% behind each frame at 30 m/s of fall it
    // trailed 9 cm a frame, more than the constraints pull back, and stood up in a spike.
    // At most 3 cm a frame — walking and running are well under that, unchanged.)
    _v.set(pins[0].x - p[0], pins[0].y - p[1], pins[0].z - p[2])
    const moved = _v.length()
    _v.multiplyScalar(moved > 0 ? 1 - Math.min(1 - CARRY, 0.03 / moved) : CARRY)
    for (let i = cols * 3; i < p.length; i += 3) {
      p[i] += _v.x
      p[i + 1] += _v.y
      p[i + 2] += _v.z
      q[i] += _v.x
      q[i + 1] += _v.y
      q[i + 2] += _v.z
    }
    for (let i = cols; i < cols * rows; i++) this.floor[i] = ground(p[i * 3], p[i * 3 + 2]) + 0.03
    const steps = 3
    const h = Math.min(dt, 1 / 30) / steps
    // A memory of how it hangs: in folds (pleats across it, deeper toward the hem), not a flat
    // sheet. A gentle pull toward that shape — wind and running still have their way with it.
    _a.subVectors(pins[cols - 1], pins[0]).normalize()
    _b.crossVectors(_a, hang).normalize()
    for (let s = 0; s < steps; s++) {
      // Integrate: inertia (damped), gravity, the wind (gustier toward the hem).
      for (let row = 1; row < rows; row++) {
        const flutter = row / rows
        for (let c = 0; c < cols; c++) {
          const k = (row * cols + c) * 3
          const vx = (p[k] - q[k]) * 0.985
          const vy = (p[k + 1] - q[k + 1]) * 0.985
          const vz = (p[k + 2] - q[k + 2]) * 0.985
          q[k] = p[k]
          q[k + 1] = p[k + 1]
          q[k + 2] = p[k + 2]
          p[k] += vx + wind.x * h * h * flutter
          p[k + 1] += vy - 9.8 * h * h + wind.y * h * h * flutter
          p[k + 2] += vz + wind.z * h * h * flutter
        }
      }
      if (this.pleats > 0) {
        // At rest it settles into its folds and flares out over the hem; moving, it only
        // remembers them faintly. The pull shapes each row about its own middle (it never
        // holds the cloth in place: the wind and the body still swing it as a whole).
        const pull = 0.012 + 0.03 * this.rest
        let px = 0
        let pz = 0
        for (let c = 0; c < cols; c++) {
          px += pins[c].x
          pz += pins[c].z
        }
        px /= cols
        pz /= cols
        // (The fold pattern about its own mean: an offset common to the row would walk it away.)
        let fm = 0
        for (let c = 0; c < cols; c++) fm += Math.sin(c * 1.9 + 0.5)
        fm /= cols
        for (let row = 1; row < rows; row++) {
          const depth = this.pleats * (row / (rows - 1))
          // (Not all the way out: the cloth is wider than the line it hangs on, and the
          // slack goes into the folds — which a cloth pulled taut across could not make.)
          const spread = 1 + (this.taper(row) - 1) * 0.3
          let cx = 0
          let cz = 0
          for (let c = 0; c < cols; c++) {
            const k = (row * cols + c) * 3
            cx += p[k]
            cz += p[k + 2]
          }
          cx /= cols
          cz /= cols
          for (let c = 0; c < cols; c++) {
            const k = (row * cols + c) * 3
            const fold = (Math.sin(c * 1.9 + 0.5) - fm) * depth
            const tx = cx + (pins[c].x - px) * spread + _b.x * fold
            const tz = cz + (pins[c].z - pz) * spread + _b.z * fold
            p[k] += (tx - p[k]) * pull
            p[k + 2] += (tz - p[k + 2]) * pull
          }
        }
      }
      for (let c = 0; c < cols; c++) {
        p[c * 3] = q[c * 3] = pins[c].x
        p[c * 3 + 1] = q[c * 3 + 1] = pins[c].y
        p[c * 3 + 2] = q[c * 3 + 2] = pins[c].z
      }
      // Constraints: neighbours down and across keep their distance.
      for (let it = 0; it < 6; it++) {
        for (let row = 0; row < rows; row++) {
          const w = this.taper(row)
          for (let c = 0; c < cols; c++) {
            const i = row * cols + c
            if (row < rows - 1) this.keep(i, i + cols, this.seg, row === 0)
            if (c < cols - 1) this.keep(i, i + 1, (this.widths[c] ?? this.seg) * w, row === 0)
            // Bend: two rows down, softly — it folds, it does not crumple up on itself.
            if (row < rows - 2) this.keep(i, i + 2 * cols, this.seg * 2, row === 0, 0.35)
          }
        }
        for (let i = cols; i < cols * rows; i++) {
          this.collide(i, a, b, r)
          for (const L of limbs) this.collide(i, L.a, L.b, L.r)
          // (Above the ground: its height under each particle looked up once a frame, below.
          // Looked up inside every collision, it was ~6,500 terrain samples a frame — most
          // of the game's main-thread time.)
          const k = i * 3 + 1
          if (p[k] < this.floor[i]) {
            // Ground well above your feet under it is a wall (you stand at a cliff's foot, the
            // cape hanging back over it): lifted onto it, the hem climbed the rock and stood up
            // over your head. Against a wall it is pushed back toward you instead, and hangs.
            // (In water the floor is the surface: there it floats, it is not a wall — treated
            // as one the cape was shoved in toward you and stood up out of the lake like a fin.)
            if (!this.water && this.floor[i] > a.y - 0.25) {
              const dx = a.x - p[k - 1]
              const dz = a.z - p[k + 1]
              const d = Math.hypot(dx, dz) || 1
              p[k - 1] += (dx / d) * 0.02
              p[k + 1] += (dz / d) * 0.02
            } else p[k] = this.floor[i]
          }
        }
      }
      // And never further from its pin than the cloth between them reaches (a little
      // give): however hard it is yanked, it cannot stretch out into a streak.
      for (let row = 1; row < rows; row++) {
        const max = row * this.seg * 1.06
        for (let c = 0; c < cols; c++) {
          const k = (row * cols + c) * 3
          const dx = p[k] - pins[c].x
          const dy = p[k + 1] - pins[c].y
          const dz = p[k + 2] - pins[c].z
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (d > max) {
            const f = max / d
            p[k] = pins[c].x + dx * f
            p[k + 1] = pins[c].y + dy * f
            p[k + 2] = pins[c].z + dz * f
          }
        }
      }
    }
    const pos = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    ;(pos.array as Float32Array).set(p)
    pos.needsUpdate = true
    this.mesh.geometry.computeVertexNormals()
  }

  private keep(i: number, j: number, len: number, pinnedI: boolean, stiff = 1): void {
    const p = this.p
    const a = i * 3
    const b = j * 3
    const dx = p[b] - p[a]
    const dy = p[b + 1] - p[a + 1]
    const dz = p[b + 2] - p[a + 2]
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6
    // (A bend link pushes apart only — it may not hold the cloth stretched — and only partly.)
    if (stiff < 1 && d > len) return
    const k = ((d - len) / d) * stiff
    if (pinnedI) {
      // A pinned point does not move: its neighbour takes all of it.
      p[b] -= dx * k
      p[b + 1] -= dy * k
      p[b + 2] -= dz * k
    } else {
      p[a] += dx * k * 0.5
      p[a + 1] += dy * k * 0.5
      p[a + 2] += dz * k * 0.5
      p[b] -= dx * k * 0.5
      p[b + 1] -= dy * k * 0.5
      p[b + 2] -= dz * k * 0.5
    }
  }

  private collide(i: number, a: THREE.Vector3, b: THREE.Vector3, r: number): void {
    const p = this.p
    const k = i * 3
    _v.subVectors(b, a)
    const t = Math.max(0, Math.min(1, ((p[k] - a.x) * _v.x + (p[k + 1] - a.y) * _v.y + (p[k + 2] - a.z) * _v.z) / _v.lengthSq()))
    _w.copy(a).addScaledVector(_v, t)
    const dx = p[k] - _w.x
    const dy = p[k + 1] - _w.y
    const dz = p[k + 2] - _w.z
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (d < r && d > 1e-5) {
      p[k] = _w.x + (dx / d) * r
      p[k + 1] = _w.y + (dy / d) * r
      p[k + 2] = _w.z + (dz / d) * r
    }
  }
}

// --- the body ----------------------------------------------------------------------

/** A limb segment: a tapered capsule hanging down from its joint (the group's origin). */
function limb(len: number, r0: number, r1: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group()
  const m = new THREE.Mesh(
    mergeGeometries([new THREE.CylinderGeometry(r1, r0, len, 10, 1).translate(0, -len / 2, 0).toNonIndexed(), new THREE.SphereGeometry(r0, 10, 6).toNonIndexed()])!,
    mat,
  )
  m.castShadow = true
  g.add(m)
  return g
}

interface Leg {
  hip: THREE.Group
  knee: THREE.Group
}

interface Arm {
  shoulder: THREE.Group
  elbow: THREE.Group
}

export class Wanderer {
  readonly obj = new THREE.Group()
  /** World-space things that are not children of `obj` (the cloth): add these to the scene too. */
  readonly world = new THREE.Group()
  readonly pos = new THREE.Vector3()
  readonly vel = new THREE.Vector3()
  yaw = 0
  // Previous simulation state, for interpolated rendering.
  private readonly prev = new THREE.Vector3()
  private prevYaw = 0
  grounded = true
  /** On ground too steep to stand on. */
  sliding = false
  /** Standing on rock (set by the world each step): the land's slope under it is no matter. */
  onStone = false
  /** The water's surface where you stand (main.ts sets it each step; NaN: dry). */
  waterLevel = NaN
  /** Clambering up a slope too steep to walk (hands to the ground). */
  scrambling = false
  /** In water too deep to stand in. */
  swimming = false
  /** How far into a scramble the pose is (0 … 1, eased). */
  private scrambleLean = 0
  /** How far forward the body lies in the water (radians, eased). */
  private swimLean = 0
  /** The bag's strap and satchel (shown once you have it). */
  private bagParts: THREE.Object3D[] = []
  set hasBag(v: boolean) {
    for (const o of this.bagParts) o.visible = v
  }
  /** Called as each foot comes down (`pace` 0 … 1, a run). */
  onStep: ((pace: number) => void) | null = null
  private lastHalf = 0
  /** Seconds left knocked off your feet (a giant stomped nearby). */
  stunned = 0
  private tilt = 0
  private stride = 0
  /** The whole body's lean: into a turn (roll, rad), with a change of pace or a slope (pitch, rad). */
  private bodyRoll = 0
  private bodyPitch = 0
  private lastYawA = 0
  private lastSpeedA = 0
  private accSm = 0
  /** The lantern's hook at the hip: it swings from here. */
  private readonly lanternHook = new THREE.Group()
  /** Out of breath (0 … 1): builds on a long sprint, eases off at rest. */
  private winded = 0
  /** Standing still this long (s): weight shifts, a look round. */
  private stillT = 0
  /** On a giant or a rock face this frame (climbPose): the body is moved for us, not by `vel`. */
  private onBody = false
  /** How the body really moved (m/s, smoothed): the cloth's own wind while on a giant. */
  private readonly bodyVel = new THREE.Vector3()
  private readonly lastBodyPos = new THREE.Vector3()
  /** A landing: 0 … 1 how hard, decaying (knees take it). */
  private landK = 0
  private airVy = 0
  private wasGrounded = true
  /** Seconds into kneeling to take something (< 0: not). */
  private takeT = -1
  /** The hip's swing either way at this pace (rad). */
  private swingAmp = 0.55
  /** 0 … 1: how far into the long run (see LONG). */
  lope = 0
  /** Has the wing-cloak (main.ts sets it once found). */
  canGlide = false
  /** Falling with the cloak open. */
  gliding = false
  /** The wing's shape at rest (it billows from this). */
  private wingRest = new Float32Array(0)
  /** In flight: airspeed (m/s), flight-path angle (rad, + up), heading, bank (rad, + right). */
  airspeed = 0
  private gamma = 0
  private heading = 0
  bank = 0
  /** Rising air under you this step (m/s): for the tools and the HUD. */
  updraft = 0
  private t = 0
  /** Smoothed speed (in walks) the limbs follow. */
  private gait = 0
  private climbing = false
  private climbMoving = 0
  private readonly pelvis = new THREE.Group()
  private readonly chest = new THREE.Group()
  /** The wing-cloak spread behind the shoulders (only while gliding). */
  private readonly wing: THREE.Mesh
  private readonly head = new THREE.Group()
  private readonly legs: Leg[] = []
  private readonly arms: Arm[] = []
  /** What is in your hands (main.ts sets it while a tool is in use): its prop shows, the arms take its pose. */
  holding: 'bow' | 'horn' | 'sight' | null = null
  private readonly props: Record<'bow' | 'horn' | 'sight', THREE.Object3D>
  private readonly cape: Cloth
  private readonly scarf: Cloth
  private readonly lantern: THREE.PointLight
  /** 0 … 1: how far the lantern has come up (it follows the dark). */
  private lanternOn = 0
  private readonly lanternGlow: THREE.Mesh
  private readonly capeAnchors: THREE.Vector3[] = []
  /** The same, in the chest's own space. */
  private readonly capeChest: THREE.Vector3[] = []
  private readonly scarfChest: THREE.Vector3[] = []
  private readonly scarfAnchors = [new THREE.Vector3(-0.05, 1.47, -0.1), new THREE.Vector3(0.05, 1.47, -0.1)]
  private readonly capePins: THREE.Vector3[]
  private readonly scarfPins = [new THREE.Vector3(), new THREE.Vector3()]
  private readonly axisA = new THREE.Vector3()
  private readonly legCaps: Capsule[] = [0, 1, 2, 3].map(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.12 }))
  private readonly axisB = new THREE.Vector3()
  private readonly hangDir = new THREE.Vector3()
  private readonly windV = new THREE.Vector3()

  constructor(cloak: THREE.ColorRepresentation = RED) {
    const red = new THREE.MeshStandardMaterial({ color: cloak, roughness: 0.86, side: THREE.DoubleSide, map: clothTexture() })
    // (Each with its own weave or grain: a flat colour read as a mannequin.)
    const tunic = new THREE.MeshStandardMaterial({ color: TUNIC, roughness: 0.94, map: fabricTexture('wool') })
    const leather = new THREE.MeshStandardMaterial({ color: LEATHER, roughness: 0.72, map: fabricTexture('leather') })
    const wraps = new THREE.MeshStandardMaterial({ color: WRAPS, roughness: 0.95, map: fabricTexture('wrap') })
    const dark = new THREE.MeshStandardMaterial({ color: 0x0c0a09, roughness: 1 })

    // The wing-cloak: a wide sheet from wrist to wrist, bellied by the air,
    // out behind the shoulders — shown only while gliding.
    const wg = new THREE.PlaneGeometry(2.3, 1.15, 12, 4)
    const wp = wg.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < wp.count; i++) {
      const x = wp.getX(i) / 1.15
      const y = wp.getY(i) / 0.575
      const t = (y + 1) / 2 // 1 along the arms, 0 at the small of the back
      // A wing, not a sheet: wrist to wrist across the top, narrowing to the
      // small of the back, the trailing edge scalloped between the ribs.
      const nx = x * (0.18 + 0.82 * Math.pow(t, 0.7))
      wp.setX(i, nx * 1.15)
      const scallop = t < 0.01 ? 0.1 * Math.abs(Math.sin(x * Math.PI * 2.5)) : 0
      wp.setY(i, wp.getY(i) + scallop - 0.12 * x * x * t)
      // Bellied back (−z) in the middle, the lower edge trailing.
      wp.setZ(i, -0.3 * (1 - nx * nx) * t - 0.25 * (1 - t))
    }
    wg.computeVertexNormals()
    this.wingRest = (wg.getAttribute('position').array as Float32Array).slice()
    this.wing = new THREE.Mesh(wg, red)
    this.wing.position.set(0, 0.08, -0.2)
    this.wing.visible = false
    this.wing.castShadow = true
    // Seams along its ribs, a shade darker, fanning out from the back with the cloth:
    // it is a made thing, a cloak stiffened along its ribs, not a flat red sheet.
    const cols = new Float32Array(wp.count * 3)
    for (let i = 0; i < wp.count; i++) {
      const col = i % 13 // (the plane's column: 12 segments across, before the fan)
      const seam = col % 2 === 0 && col > 0 && col < 12 ? 0.72 : 1
      cols.set([seam, seam, seam], i * 3)
    }
    wg.setAttribute('color', new THREE.BufferAttribute(cols, 3))
    const wingMat = red.clone()
    wingMat.vertexColors = true
    this.wing.material = wingMat

    // Pelvis at the hips; the chest, head and arms hang from it.
    this.pelvis.position.y = 0.92
    this.obj.add(this.pelvis)
    const torso = new THREE.Mesh(
      mergeGeometries([
        new THREE.CylinderGeometry(0.17, 0.145, 0.5, 12, 2).translate(0, 0.28, 0).scale(1.15, 1, 0.82).toNonIndexed(),
        new THREE.SphereGeometry(0.18, 12, 8).translate(0, 0.5, 0).scale(1.18, 0.75, 0.82).toNonIndexed(),
        // The tunic's skirt, flaring to the knee.
        new THREE.CylinderGeometry(0.15, 0.25, 0.52, 14, 2, true).translate(0, -0.18, 0).scale(1.1, 1, 0.92).toNonIndexed(),
      ])!,
      tunic,
    )
    torso.castShadow = true
    this.chest.add(torso)
    this.chest.add(this.wing)
    this.chest.add(new THREE.Mesh(new THREE.TorusGeometry(0.142, 0.022, 6, 18).rotateX(Math.PI / 2).scale(1.15, 1, 0.85).translate(0, 0.06, 0), leather))
    this.pelvis.add(this.chest)

    // Head in its hood; the face a dark hollow you never quite see into.
    this.head.position.y = 0.6
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 10).translate(0, 0.08, 0.005), dark)
    const hood = new THREE.Mesh(hoodGeometry().translate(0, 0.095, -0.015), red)
    hood.castShadow = true
    // A mantle round the shoulders: the hood's skirt.
    const mantle = new THREE.Mesh(mantleGeometry(), red)
    mantle.castShadow = true
    this.head.add(face, hood, mantle)
    this.chest.add(this.head)

    // Legs: thigh (tunic) and shin (boot), hung from the hips.
    for (const side of [-1, 1]) {
      const hip = limb(0.44, 0.09, 0.072, tunic)
      hip.position.set(side * 0.095, 0, 0)
      const knee = limb(0.44, 0.07, 0.06, wraps)
      knee.position.y = -0.44
      // A boot: a rounded upper over the ankle and a toe, on a darker sole.
      const boot = mergeGeometries([
        new THREE.CylinderGeometry(0.068, 0.072, 0.13, 10).translate(0, -0.4, 0).toNonIndexed(),
        new THREE.SphereGeometry(0.068, 10, 8).scale(0.85, 0.62, 1.75).translate(0, -0.46, 0.07).toNonIndexed(),
      ])!
      const foot = new THREE.Mesh(boot, leather)
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.022, 0.25).translate(0, -0.493, 0.06), dark)
      foot.castShadow = true
      knee.add(foot, sole)
      hip.add(knee)
      this.pelvis.add(hip)
      this.legs.push({ hip, knee })
    }
    // Arms: sleeve, forearm, hand.
    for (const side of [-1, 1]) {
      const shoulder = limb(0.29, 0.068, 0.058, tunic)
      shoulder.position.set(side * 0.22, 0.52, 0)
      const elbow = limb(0.27, 0.056, 0.048, tunic)
      elbow.position.y = -0.29
      // A hand, not a ball: a mitten of palm and fingers, and a thumb.
      const hand = new THREE.Group()
      hand.position.y = -0.3
      // (Gloved, a wrapped cuff at the wrist, and smaller: bare and that size they read as two
      // big brown eggs at the ends of the sleeves.)
      const glove = new THREE.MeshStandardMaterial({ color: 0x4a3426, roughness: 0.75, map: fabricTexture('leather') })
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.046, 0.04, 10).translate(0, 0.005, 0), wraps)
      hand.add(cuff)
      hand.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8).scale(0.72, 1.12, 0.5).translate(0, -0.042, 0), glove))
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.03, 3, 6), glove)
      thumb.position.set(-side * 0.03, -0.02, 0.018)
      thumb.rotation.z = side * 0.6
      hand.add(thumb)
      elbow.add(hand)
      shoulder.add(elbow)
      this.chest.add(shoulder)
      this.arms.push({ shoulder, elbow })
    }
    // The tools, held when in use (hidden otherwise). Right hand A[0], left A[1]
    // (the body faces +z: its right is −x).
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.7 })
    const hornMat = new THREE.MeshStandardMaterial({ color: 0x9b8a6c, roughness: 0.6 })
    const bow = new THREE.Group()
    // Limbs bowed forward (along the arm, −y in the hand) from the grip at the hand.
    const limbCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.12, -0.72), new THREE.Vector3(0, -0.44, 0), new THREE.Vector3(0, -0.12, 0.72))
    bow.add(new THREE.Mesh(new THREE.TubeGeometry(limbCurve, 20, 0.018, 6), wood))
    const stringMat = new THREE.MeshBasicMaterial({ color: 0xd8d0bc })
    bow.add(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.44, 4).rotateX(Math.PI / 2).translate(0, -0.12, 0), stringMat))
    const horn = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.04, 0.02), new THREE.Vector3(0, -0.22, 0.14), new THREE.Vector3(0.02, -0.3, 0.38)), 12, 0.03, 8),
      hornMat,
    )
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.03, 0.09, 12, 1, true).rotateX(Math.PI / 2).translate(0.02, -0.3, 0.42), hornMat)
    const hornGroup = new THREE.Group()
    hornGroup.add(horn, bell)
    const sight = new THREE.Group()
    sight.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 18).rotateX(Math.PI / 2).translate(0, -0.1, 0.03), new THREE.MeshStandardMaterial({ color: 0x9fc6c8, roughness: 0.15, transparent: true, opacity: 0.8, emissive: new THREE.Color(0.1, 0.3, 0.32) })))
    this.props = { bow, horn: hornGroup, sight }
    this.arms[1].elbow.children[0].add(bow)
    this.arms[0].elbow.children[0].add(hornGroup, sight)
    for (const k of ['bow', 'horn', 'sight'] as const) this.props[k].visible = false

    // The lantern at the left hip: a small warm light.
    // (A little iron lantern hung at the hip: a cap with a ring, the glass, a base. It was a dark
    // box with a cream ball stuck on its front.)
    const iron = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.55, metalness: 0.6 })
    const lanternBody = new THREE.Mesh(
      mergeGeometries([
        new THREE.CylinderGeometry(0.018, 0.048, 0.035, 8).translate(0, 0.06, 0).toNonIndexed(),
        new THREE.TorusGeometry(0.016, 0.004, 4, 10).translate(0, 0.09, 0).toNonIndexed(),
        new THREE.CylinderGeometry(0.046, 0.04, 0.022, 8).translate(0, -0.054, 0).toNonIndexed(),
        // Four thin bars round the glass.
        ...[0, 1, 2, 3].map((k) => new THREE.CylinderGeometry(0.004, 0.004, 0.09, 4).translate(Math.cos(k * 1.571 + 0.785) * 0.04, 0, Math.sin(k * 1.571 + 0.785) * 0.04).toNonIndexed()),
      ])!,
      iron,
    )
    // (Hung from a hook, so it swings as you walk: the pivot at the ring.)
    this.lanternHook.position.set(-0.2, -0.03, 0.06)
    this.pelvis.add(this.lanternHook)
    lanternBody.position.set(0, -0.1, 0)
    lanternBody.castShadow = true
    this.lanternHook.add(lanternBody)
    // The traveller's bag, once it is yours: a strap (a loop laid round the body, then tilted)
    // from the left shoulder across the chest (lying on it: deeper than the body, it stood off it
    // in a hoop you could see the sky through from the side)
    // to a satchel on the right hip.
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.016, 5, 28).rotateX(Math.PI / 2).scale(0.98, 1, 0.56).rotateZ(-0.85).translate(0.02, 0.26, 0.004), leather)
    // A soft leather bag (it was a plain box): a rounded body, a darker flap folded down over its
    // front, and an iron buckle.
    const satchel = new THREE.Group()
    const bagBody = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.16, 0.075, 3, 0.03), leather)
    const flapMat = new THREE.MeshStandardMaterial({ color: 0x3e2a1c, roughness: 0.7, map: fabricTexture('leather') })
    const flap = new THREE.Mesh(new RoundedBoxGeometry(0.205, 0.1, 0.012, 2, 0.005).translate(0, 0.035, 0.041), flapMat)
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.022, 0.008).translate(0, -0.012, 0.049), new THREE.MeshStandardMaterial({ color: 0x5a524a, roughness: 0.4, metalness: 0.7 }))
    satchel.add(bagBody, flap, buckle)
    for (const m of [bagBody, flap]) m.castShadow = true
    // (Out on the side of the hip, over the tunic's flare, a little behind.)
    satchel.position.set(0.27, -0.12, -0.05)
    satchel.rotation.set(0, Math.PI / 2 + 0.2, 0.1)
    strap.castShadow = true
    this.chest.add(strap)
    this.pelvis.add(satchel)
    this.bagParts = [strap, satchel]
    this.lanternGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.085, 10).translate(0, -0.1, 0), new THREE.MeshBasicMaterial({ color: 0xffc47a }))
    // (Reaching ~26 m: in the dark you see the ground about you, not just your feet.)
    this.lantern = new THREE.PointLight(0xffb066, 0.6, 26, 1.4)
    this.lantern.position.set(0, -0.1, 0.06)
    this.lanternHook.add(this.lanternGlow, this.lantern)

    // The cape: pinned in an arc across the shoulders and round the back, hanging to the calves.
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.1 + (0.8 * i) / 8)
      this.capeAnchors.push(new THREE.Vector3(-Math.cos(a) * 0.22, 1.44, -Math.sin(a) * 0.15 - 0.03))
    }
    this.capePins = this.capeAnchors.map(() => new THREE.Vector3())
    // (Pinned to the chest itself, not the body's root: it turns, leans and bobs with the
    // shoulders — user: "the cape doesn't move with the shoulders".)
    this.obj.updateMatrixWorld(true)
    const toChest = this.chest.matrixWorld.clone().invert()
    for (const a of this.capeAnchors) this.capeChest.push(a.clone().applyMatrix4(toChest))
    for (const a of this.scarfAnchors) this.scarfChest.push(a.clone().applyMatrix4(toChest))
    // (Flaring toward the hem: a cloak, not a plank.)
    this.cape = new Cloth(9, 9, 0.135, red, (row) => 1 + 0.5 * (row / 8))
    this.cape.pleats = 0.07
    this.scarf = new Cloth(2, 8, 0.15, red, (row) => 1 - row / 12)
    this.world.add(this.cape.mesh, this.scarf.mesh)
  }

  /** One fixed simulation step. `camYaw` orients WASD to the view. */
  step(dt: number, move: { x: number; y: number }, sprint: boolean, jump: boolean, camYaw: number, terrain: Terrain): void {
    this.prev.copy(this.pos)
    this.prevYaw = this.yaw
    if (this.stunned > 0) {
      // Knocked down: no control until you are back on your feet.
      this.stunned = Math.max(0, this.stunned - dt)
      move = { x: 0, y: 0 }
      jump = false
    }
    this.tilt += ((this.stunned > 0 ? 1.25 : 0) - this.tilt) * Math.min(1, dt * (this.stunned > 0 ? 10 : 3))
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
    // Deep water: you swim, head above it, slower; no falling, no running.
    const bed = terrain.heightAt(this.pos.x, this.pos.z)
    const deep = this.waterLevel - bed
    if (deep > SWIM_DEPTH && this.pos.y < this.waterLevel - 0.45) {
      if (!this.swimming) this.vel.y *= 0.25 // (the water takes the fall)
      this.swimming = true
      this.gliding = false
      this.lope = 0
      const speed = sprint ? SWIM_FAST : SWIM
      const k = Math.min(1, dt * 2.2)
      this.vel.x += (wx * speed - this.vel.x) * k
      this.vel.z += (wz * speed - this.vel.z) * k
      // Bobbing at the surface (buoyancy, damped).
      const float = this.waterLevel - SWIM_SINK + Math.sin(this.t * 1.9) * 0.05
      this.vel.y += ((float - this.pos.y) * 9 - this.vel.y * 4) * dt
      this.pos.addScaledVector(this.vel, dt)
      // Out where it shallows: on your feet again.
      const under = terrain.heightAt(this.pos.x, this.pos.z)
      if (this.pos.y < under) this.pos.y = under
      this.grounded = false
      if (len > 0.1) {
        let d = Math.atan2(wx, wz) - this.yaw
        d = Math.atan2(Math.sin(d), Math.cos(d))
        this.yaw += d * Math.min(1, 5 * dt)
      }
      return
    }
    if (this.swimming && this.waterLevel - bed <= SWIM_DEPTH) this.grounded = true
    this.swimming = false
    // The long run builds over ~5 s of a steady sprint on ground that isn't
    // climbing, and falls away when you turn hard, climb, or stop.
    const vlen = Math.hypot(this.vel.x, this.vel.z)
    const steady = len > 0 && vlen > SPRINT * 0.8 && (this.vel.x * wx + this.vel.z * wz) / vlen > 0.92
    const rise = len > 0 ? (terrain.heightAt(this.pos.x + wx * 2, this.pos.z + wz * 2) - terrain.heightAt(this.pos.x, this.pos.z)) / 2 : 0
    if (sprint && this.grounded && steady && rise < 0.18) this.lope = Math.min(1, this.lope + dt / 5)
    else if (this.grounded || !sprint) this.lope = Math.max(0, this.lope - dt * (sprint && len > 0 ? 0.5 : 2))
    const speed = sprint ? SPRINT + (LONG - SPRINT) * this.lope * this.lope * (3 - 2 * this.lope) : WALK
    const k = Math.min(1, ACCEL * dt * (this.grounded ? 1 : 0.25))
    this.vel.x += (wx * speed - this.vel.x) * k
    this.vel.z += (wz * speed - this.vel.z) * k

    // Too steep to stand on: no walking up it, and you slide down.
    const gx = terrain.heightAt(this.pos.x + 0.5, this.pos.z) - terrain.heightAt(this.pos.x - 0.5, this.pos.z)
    const gz = terrain.heightAt(this.pos.x, this.pos.z + 0.5) - terrain.heightAt(this.pos.x, this.pos.z - 0.5)
    const steep = Math.hypot(gx, gz)
    // (Only on the land itself: standing on rock above it — a ledge, the hall's stair — the slope under the rock is no matter.)
    const onLand = this.grounded && !this.onStone && this.pos.y < terrain.heightAt(this.pos.x, this.pos.z) + 0.8
    // Steep but not sheer, and you are pushing up it: you scramble up, slowly, hands to the ground.
    const upHill = steep > 1e-4 && len > 0 ? (wx * gx + wz * gz) / steep : 0
    this.scrambling = onLand && steep > MAX_SLOPE && steep < SCRAMBLE_SLOPE && upHill > 0.35
    if (this.scrambling) {
      // (A plain cap on speed, not a damping: the same pace at any frame rate.)
      const cap = (sprint ? 2.3 : 1.6) * (1 - 0.5 * THREE.MathUtils.smoothstep(steep, MAX_SLOPE, SCRAMBLE_SLOPE))
      const hv = Math.hypot(this.vel.x, this.vel.z)
      if (hv > cap) {
        this.vel.x *= cap / hv
        this.vel.z *= cap / hv
      }
      this.lope = 0
    }
    this.sliding = onLand && steep > MAX_SLOPE && !this.scrambling
    if (this.sliding) {
      const ux = gx / steep
      const uz = gz / steep
      const up = this.vel.x * ux + this.vel.z * uz
      if (up > 0) {
        this.vel.x -= up * ux
        this.vel.z -= up * uz
      }
      this.vel.x -= ux * SLIDE * dt
      this.vel.z -= uz * SLIDE * dt
      jump = false
    }

    if (jump && this.grounded) {
      this.vel.y = JUMP
      this.grounded = false
    }
    this.vel.y -= GRAVITY * dt
    // The wing-cloak: falling with Space held, it opens — you sink slowly and
    // sail the way you lean (or the way you face), and land on your feet.
    const wasGliding = this.gliding
    this.gliding = this.canGlide && !this.grounded && jump && (wasGliding || this.vel.y < -1)
    if (this.gliding) {
      if (!wasGliding) {
        // Opening: take up the flight from how you were falling.
        const hs0 = Math.hypot(this.vel.x, this.vel.z)
        this.airspeed = Math.max(9, Math.hypot(hs0, this.vel.y))
        this.gamma = Math.atan2(this.vel.y, Math.max(hs0, 1))
        this.heading = hs0 > 1 ? Math.atan2(this.vel.x, this.vel.z) : this.yaw
        this.bank = 0
      }
      const cl = THREE.MathUtils.clamp(0.62 - move.y * 0.47, 0.12, 1.15)
      this.bank += (move.x * 0.75 - this.bank) * Math.min(1, dt * 2.5)
      const v = this.airspeed
      const stall = THREE.MathUtils.smoothstep(v, 7, 10)
      const lift = KL * v * v * cl * stall
      const drag = KL * v * v * (CD0 + 0.12 * cl * cl)
      this.airspeed = THREE.MathUtils.clamp(v + (-FLY_G * Math.sin(this.gamma) - drag) * dt, 2, 45)
      this.gamma = THREE.MathUtils.clamp(this.gamma + ((lift * Math.cos(this.bank) - FLY_G * Math.cos(this.gamma)) / Math.max(v, 3)) * dt, -1.35, 0.9)
      // Bank right (+): turn right — the body faces +z, its right is −x, so heading falls.
      this.heading -= ((lift * Math.sin(this.bank)) / Math.max(v, 3)) * dt
      const cg = Math.cos(this.gamma)
      this.vel.set(Math.sin(this.heading) * cg * this.airspeed, Math.sin(this.gamma) * this.airspeed, Math.cos(this.heading) * cg * this.airspeed)
      // Ridge lift: air pushed up a steep slope ahead of you, strongest low over it.
      const ax = this.pos.x + Math.sin(this.heading) * 40
      const az = this.pos.z + Math.cos(this.heading) * 40
      const below = terrain.heightAt(this.pos.x, this.pos.z)
      const rise = (terrain.heightAt(ax, az) - below) / 40
      const agl = this.pos.y - below
      this.updraft = rise > 0.25 && agl < 160 ? Math.min(7, (rise - 0.25) * 16) * (1 - agl / 160) : 0
      this.vel.y += this.updraft
      this.yaw = this.heading
    } else this.updraft = 0
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
  }

  /** A shockwave: thrown by `impulse` and knocked down for `seconds`. */
  knock(impulse: THREE.Vector3, seconds: number): void {
    this.vel.add(impulse)
    this.grounded = false
    this.stunned = Math.max(this.stunned, seconds)
  }

  /** Teleport: no interpolation across the jump. */
  place(x: number, y: number, z: number): void {
    this.pos.set(x, y, z)
    this.prev.copy(this.pos)
    this.vel.set(0, 0, 0)
  }

  /** Copy simulation state to the scene graph, `alpha` of the way from the previous step. */
  sync(alpha: number): void {
    this.climbing = false
    this.onBody = false
    this.obj.position.lerpVectors(this.prev, this.pos, alpha)
    let d = this.yaw - this.prevYaw
    d = Math.atan2(Math.sin(d), Math.cos(d))
    this.obj.quaternion.setFromAxisAngle(_up, this.prevYaw + d * alpha)
    if (this.tilt > 0.01) this.obj.quaternion.multiply(_tq.setFromAxisAngle(_side, -this.tilt))
    if (Math.abs(this.bodyRoll) > 0.002) this.obj.quaternion.multiply(_tq.setFromAxisAngle(_fwd, this.bodyRoll))
    if (Math.abs(this.bodyPitch) > 0.002) this.obj.quaternion.multiply(_tq.setFromAxisAngle(_side, this.bodyPitch))
    // Swimming: the body lies forward in the water (more as you go), lifted so the head stays up.
    if (this.swimLean > 0.01) {
      this.obj.quaternion.multiply(_tq.setFromAxisAngle(_side, this.swimLean))
      this.obj.position.y += Math.sin(this.swimLean) * 0.78
    }
    // In flight: lean into the bank, nose with the flight path, body near level.
    if (this.gliding) {
      this.obj.quaternion.multiply(_tq.setFromAxisAngle(_fwd, this.bank * 0.9))
      this.obj.quaternion.multiply(_tq.setFromAxisAngle(_side, 0.9 - this.gamma * 0.5))
    }
  }

  /**
   * Pose on a giant's body or a rock face. On steep rock: chest to the stone,
   * head up the slope, held a little off the surface. Standing on top: upright,
   * facing `yaw`. `moving` (m/s) drives the limbs.
   */
  climbPose(_dt: number, point: THREE.Vector3, normal: THREE.Vector3, standing: boolean, yaw: number, moving: number): void {
    const o = this.obj
    this.climbing = !standing
    this.climbMoving = moving
    this.onBody = true
    // (The walk's state from the climb, not left over from before you took hold: standing on
    // a giant's back you are on your feet, walking at the climb's pace, or still.)
    this.grounded = standing
    this.sliding = false
    this.swimming = false
    this.yaw = yaw
    this.vel.set(standing ? Math.sin(yaw) * moving : 0, 0, standing ? Math.cos(yaw) * moving : 0)
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
      // (0.45 m off the surface: at 0.3 the chest and knees went into the lumps of a giant.)
      o.position.copy(point).addScaledVector(normal, 0.45).addScaledVector(_cy, -1.2)
    }
  }

  /** Back to upright after a climb (sync() only sets yaw). */
  upright(): void {
    this.obj.quaternion.setFromAxisAngle(_up, this.yaw)
  }

  /** Kneel and reach for something at your feet (≈1.3 s). */
  reachDown(): void {
    this.takeT = 0
  }

  /** Where the right hand is (world). */
  handWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.arms[0].elbow.localToWorld(out.set(0, -0.34, 0))
  }

  /**
   * Animate the body and its cloth for this frame: the stride from the speed,
   * arms swinging, breathing; reaching and pulling when climbing; the cape and
   * scarf in the `wind` (an acceleration, m/s²). `dark` (0 … 1) brightens the lantern.
   */
  animate(dt: number, ground: (x: number, z: number) => number, wind: THREE.Vector3, dark: number): void {
    this.t += dt
    this.scrambleLean += ((this.scrambling ? 1 : 0) - this.scrambleLean) * Math.min(1, dt * 6)
    this.swimLean += ((this.swimming ? 0.25 + 0.7 * Math.min(1, this.speed / SWIM) : 0) - this.swimLean) * Math.min(1, dt * 4)
    this.wing.visible = this.gliding
    if (this.gliding) {
      this.wing.rotation.x = Math.sin(this.t * 9) * 0.03
      // The cloth between the battens billows, and its trailing edge flutters harder the faster you go.
      const pos = this.wing.geometry.getAttribute('position') as THREE.BufferAttribute
      const a = pos.array as Float32Array
      const r = this.wingRest
      const v = THREE.MathUtils.clamp(this.airspeed / 25, 0.2, 1.4)
      for (let i = 0; i < a.length; i += 3) {
        const x = r[i] / 1.15
        const t = (r[i + 1] / 0.575 + 1) / 2 // 1 along the arms, 0 at the trailing edge
        const between = Math.abs(Math.sin(x * Math.PI * 2.7))
        const flutter = (1 - t) * (1 - t) * Math.sin(this.t * (14 + 10 * v) + x * 7) * 0.05 * v
        a[i + 2] = r[i + 2] - between * 0.06 * (0.6 + 0.4 * v) * (1 - t * 0.6) + flutter
      }
      pos.needsUpdate = true
      this.wing.geometry.computeVertexNormals()
    }
    const hs = this.climbing ? 0 : this.speed
    this.gait += (Math.min(1.6, hs / WALK) - this.gait) * Math.min(1, dt * 6)
    // The stride keeps the planted foot still on the ground (user: "walking looks like
    // sliding"): the foot under you sweeps back at LEG · swing · (dφ/dt), and that must be
    // the ground going by. Past a sprint the stride lengthens rather than quickens.
    const over = THREE.MathUtils.clamp((hs - SPRINT) / (LONG - SPRINT), 0, 1)
    const swingAmp = 0.55 + 0.2 * Math.max(0, this.gait - 1) / 0.6 + 0.15 * over
    this.swingAmp = swingAmp
    this.stride += (this.climbing ? this.climbMoving * 2.4 : Math.min(15.5, hs / (LEG * swingAmp * Math.max(0.3, Math.min(1, this.gait))))) * dt
    const s = this.stride
    // A foot comes down each half stride (on the ground, walking).
    const half = Math.floor(s / Math.PI)
    if (half !== this.lastHalf) {
      this.lastHalf = half
      if (!this.climbing && this.grounded && !this.gliding && hs > 0.6) this.onStep?.(Math.min(1, hs / SPRINT))
    }
    const run = Math.max(0, this.gait - 1) / 0.6
    this.pelvis.rotation.y = 0
    this.pelvis.rotation.z = 0
    this.pelvis.position.x = 0
    this.chest.rotation.y = 0
    this.chest.rotation.z = 0
    this.head.rotation.y = 0
    for (const l of this.legs) l.hip.rotation.z = 0
    // How the body is carried, from how it moves (user: "focus on the wanderer animations
    // alot more… 99% of the time a player would be looking at a frame with the wanderer").
    const onFoot = this.grounded && !this.climbing && !this.swimming && !this.gliding && !this.sliding
    let yr = this.yaw - this.lastYawA
    yr = Math.atan2(Math.sin(yr), Math.cos(yr)) / Math.max(dt, 1e-3)
    this.lastYawA = this.yaw
    const acc = (hs - this.lastSpeedA) / Math.max(dt, 1e-3)
    this.lastSpeedA = hs
    this.accSm += (THREE.MathUtils.clamp(acc, -30, 30) - this.accSm) * Math.min(1, dt * 6)
    // Into a turn, as a runner leans against it (more the faster you go).
    const rollWant = onFoot ? THREE.MathUtils.clamp(-yr * hs * 0.022, -0.26, 0.26) : 0
    this.bodyRoll += (rollWant - this.bodyRoll) * Math.min(1, dt * 7)
    // Setting off you tip forward into it; pulling up you sit back on your heels. Uphill you
    // lean into the slope.
    const fx = Math.sin(this.yaw)
    const fz = Math.cos(this.yaw)
    const slope = onFoot && hs > 0.5 ? THREE.MathUtils.clamp((ground(this.pos.x + fx * 1.5, this.pos.z + fz * 1.5) - ground(this.pos.x - fx * 1.5, this.pos.z - fz * 1.5)) / 3, -0.8, 0.8) : 0
    const pitchWant = onFoot ? THREE.MathUtils.clamp(this.accSm * 0.012, -0.16, 0.14) + Math.max(0, slope) * 0.35 - Math.max(0, -slope) * 0.12 : 0
    this.bodyPitch += (pitchWant - this.bodyPitch) * Math.min(1, dt * 5)
    // Landing: how fast you came down sets how deep the knees take it.
    if (!this.grounded) this.airVy = Math.min(this.airVy, this.vel.y)
    if (this.grounded && !this.wasGrounded && !this.climbing) this.landK = Math.max(this.landK, THREE.MathUtils.clamp((-this.airVy - 1.5) / 9, 0, 1))
    if (this.grounded) this.airVy = 0
    this.wasGrounded = this.grounded
    this.landK = Math.max(0, this.landK - dt * 2.6)
    this.stillT = onFoot && hs < 0.3 && this.holding === null ? this.stillT + dt : 0
    this.winded = THREE.MathUtils.clamp(this.winded + (onFoot && hs > SPRINT * 0.9 ? dt / 10 : hs < 1 ? -dt / 9 : -dt / 30), 0, 1)
    const L = this.legs
    const A = this.arms
    if (this.climbing) {
      // Hand over hand: one arm reaching high and straight while the other, bent, pulls
      // the body up past it; the legs step on the diagonal (right foot up with the left
      // hand), knees out, the hips swaying under the hands. Holding still, the last
      // reach is held — not both arms straight up like a sign of surrender.
      const ph = s * 1.1
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1
        const up = 0.5 + 0.5 * Math.sin(ph + i * Math.PI)
        A[i].shoulder.rotation.set(-1.95 - 0.95 * up, 0, side * (0.42 - 0.22 * up))
        A[i].elbow.rotation.x = -0.15 - 1.45 * (1 - up)
        const legUp = 0.5 + 0.5 * Math.sin(ph + (1 - i) * Math.PI)
        L[i].hip.rotation.x = -0.25 - 0.95 * legUp
        L[i].hip.rotation.z = side * -(0.18 + 0.2 * legUp)
        L[i].knee.rotation.x = 0.45 + 1.35 * legUp
      }
      this.pelvis.position.y = 0.92
      this.pelvis.position.x = Math.sin(ph) * 0.07
      this.pelvis.rotation.z = Math.sin(ph) * 0.08
      this.chest.rotation.z = -Math.sin(ph) * 0.06
      this.chest.rotation.x = 0
      // Looking up at the next hold (a glance down now and then).
      this.head.rotation.x = -0.4 + Math.max(0, Math.sin(this.t * 0.4)) * 0.25
      this.head.rotation.y = Math.sin(ph) * 0.15
    } else if (this.swimming) {
      // Swimming: a slow breaststroke — reach ahead, sweep out and back — legs kicking;
      // treading water when still (arms sculling at the sides).
      const go = Math.min(1, this.speed / SWIM)
      const st = this.t * (1.6 + go * 1.4)
      const reach = 0.5 + 0.5 * Math.sin(st)
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1
        A[i].shoulder.rotation.set(-0.6 - 2.1 * reach * go - 0.5 * (1 - go), 0, side * (0.25 + (1 - reach) * 0.9 * go + 0.5 * (1 - go) * (0.5 + 0.5 * Math.sin(this.t * 2.4 + i))))
        A[i].elbow.rotation.x = -0.3 - (1 - reach) * 0.9 * go
        const kick = Math.sin(st * 2 + i * Math.PI)
        L[i].hip.rotation.x = 0.15 + kick * 0.3 * go - 0.3 * (1 - go) * Math.sin(this.t * 1.8 + i * 2)
        L[i].knee.rotation.x = 0.3 + Math.max(0, -kick) * 0.6
      }
      this.pelvis.position.y = 0.92
      this.chest.rotation.x = 0
      // Head up out of the water, whatever the body is doing.
      this.head.rotation.x = -0.75 * this.swimLean
    } else if (this.gliding) {
      // Flying: arms spread wide, holding the wing's leading edge out, one dipping with the bank;
      // legs trailing together.
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1
        A[i].shoulder.rotation.set(-0.15, 0, side * (1.38 + side * this.bank * 0.35))
        A[i].elbow.rotation.x = -0.12
        L[i].hip.rotation.x = 0.12 + Math.sin(this.t * 3 + i) * 0.03
        L[i].knee.rotation.x = 0.18
      }
      this.pelvis.position.y = 0.92
      this.chest.rotation.x = 0
      this.head.rotation.x = -0.5
    } else if (!this.grounded && !this.sliding) {
      // In the air: knees up, arms out. Dropping fast (a long fall), it comes apart: arms
      // wheeling for a hold that is not there, legs running on nothing, eyes on the ground.
      const fall = THREE.MathUtils.smoothstep(-this.vel.y, 7, 16)
      const w = this.t * 7
      L[0].hip.rotation.x = -0.5 + fall * (0.3 + 0.55 * Math.sin(w))
      L[1].hip.rotation.x = 0.2 + fall * (-0.4 + 0.55 * Math.sin(w + Math.PI))
      L[0].knee.rotation.x = 0.8 + fall * 0.4 * Math.max(0, Math.cos(w))
      L[1].knee.rotation.x = 0.5 + fall * 0.4 * Math.max(0, Math.cos(w + Math.PI))
      A[0].shoulder.rotation.set(-0.3 - fall * (0.9 + 0.8 * Math.sin(w * 0.8)), 0, -0.7 - fall * 0.5)
      A[1].shoulder.rotation.set(-0.3 - fall * (0.9 + 0.8 * Math.sin(w * 0.8 + 2)), 0, 0.7 + fall * 0.5)
      A[0].elbow.rotation.x = -0.3 - fall * 0.4
      A[1].elbow.rotation.x = -0.3 - fall * 0.4
      this.chest.rotation.x = 0.1 + fall * 0.2
      this.head.rotation.x = fall * 0.45
      // A running leap (not a long fall): a stride held in the air — the lead knee driven up,
      // the trail leg stretched back, the arms opposite, leaning into it; reaching the lead
      // foot down for the ground as you come down.
      const leap = THREE.MathUtils.clamp(Math.hypot(this.vel.x, this.vel.z) / SPRINT, 0, 1) * (1 - fall)
      if (leap > 0.02) {
        const down = THREE.MathUtils.smoothstep(-this.vel.y, -1, 4)
        const lead = this.lastHalf % 2 === 0 ? 0 : 1
        const trail = 1 - lead
        const mixL = (o: THREE.Object3D, x: number) => (o.rotation.x += (x - o.rotation.x) * leap)
        mixL(L[lead].hip, -1.05 + 0.55 * down)
        mixL(L[lead].knee, 1.1 - 0.6 * down)
        mixL(L[trail].hip, 0.55)
        mixL(L[trail].knee, 0.9)
        mixL(A[lead].shoulder, 0.7)
        mixL(A[trail].shoulder, -0.9)
        mixL(A[lead].elbow, -0.9)
        mixL(A[trail].elbow, -1.1)
        A[lead].shoulder.rotation.z += ((lead ? 1 : -1) * 0.15 - A[lead].shoulder.rotation.z) * leap
        A[trail].shoulder.rotation.z += ((trail ? 1 : -1) * 0.25 - A[trail].shoulder.rotation.z) * leap
        this.chest.rotation.x += (0.28 - this.chest.rotation.x) * leap
        this.head.rotation.x += (-0.15 - this.head.rotation.x) * leap
      }
    } else {
      // Walking and running: legs swing from the hips, knees bend on the
      // swing; arms counter-swing; the body leans in and bobs.
      const g = this.gait
      const go = Math.min(1, g)
      let drop = 0
      for (let i = 0; i < 2; i++) {
        const ph = s + i * Math.PI
        const swing = Math.sin(ph) * this.swingAmp * go
        // Forward through the air (cos > 0) the knee folds — high and quick at a run, the
        // heel kicked up behind; planted (cos < 0) it stays nearly straight, softening a
        // little as the weight comes onto it.
        const c = Math.cos(ph)
        const lift = c > 0 ? Math.sin(Math.min(Math.PI, c * Math.PI * 0.9)) : 0
        const fold = c > 0 ? c * (0.5 + run * 0.5) + lift * (0.25 + run * 0.75) : Math.max(0, -Math.sin(ph)) * 0.12 * (1 + run)
        L[i].hip.rotation.x = -swing - (c > 0 ? lift * run * 0.25 : 0)
        // (Running, the leg reaching forward stays bent at the knee — kicked out straight it
        // read as a goose-step.)
        L[i].knee.rotation.x = (fold + run * 0.45 * Math.max(0, Math.sin(ph))) * go + 0.04
        // The leg on the ground (cos < 0) sets how low the hips ride: it is shorter
        // upright than slanted, so the body rises over it and dips between steps
        // (otherwise the back foot floats off the ground as it trails).
        if (c < 0) drop = Math.max(drop, LEG * (1 - Math.cos(swing)) * (1 - run * 0.6))
        A[i].shoulder.rotation.set(swing * (0.75 + run * 0.35), 0, (i ? 1 : -1) * (0.12 + run * 0.06))
        // Elbows bend more as the arm comes forward.
        A[i].elbow.rotation.x = -0.25 - run * 1.05 - Math.max(0, swing) * (0.35 + run * 0.3)
      }
      // Hips turn with the leg going forward; the shoulders turn against them.
      this.pelvis.rotation.y = Math.sin(s) * (0.09 + run * 0.05) * go
      this.chest.rotation.y = -Math.sin(s) * (0.16 + run * 0.08) * go
      // …and dip a little on the side of the leg swinging through.
      this.pelvis.rotation.z = Math.cos(s) * 0.035 * go * (1 - run * 0.5)
      if (this.sliding) {
        // Down the scree: crouched, weight back into the slope, knees bent and feet braced
        // ahead, one hand trailing on the ground behind, the other out for balance (it was
        // an upright half-step, arms out like a scarecrow).
        const sh = Math.sin(this.t * 9) * 0.04
        L[0].hip.rotation.x = -0.75 + sh
        L[1].hip.rotation.x = -0.45 - sh
        L[0].knee.rotation.x = 1.05
        L[1].knee.rotation.x = 1.25
        A[0].shoulder.rotation.set(0.65, 0, -0.45)
        A[0].elbow.rotation.x = -0.15
        A[1].shoulder.rotation.set(-0.5, 0, 0.95 + sh)
        A[1].elbow.rotation.x = -0.4
      }
      if (this.scrambleLean > 0.02) {
        // Hands reaching to the slope ahead, one then the other.
        for (let i = 0; i < 2; i++) {
          const reach = Math.sin(s + i * Math.PI)
          A[i].shoulder.rotation.x += (-1.5 - reach * 0.5 - A[i].shoulder.rotation.x) * this.scrambleLean
          A[i].elbow.rotation.x += (-0.35 - A[i].elbow.rotation.x) * this.scrambleLean
          L[i].knee.rotation.x += 0.35 * this.scrambleLean
        }
      }
      const breathe = Math.sin(this.t * 1.6) * 0.008 * (1 - Math.min(1, g))
      // Running, both feet leave the ground mid-stride: a bound up between footfalls.
      const bound = run * Math.max(0, Math.cos(s * 2)) * 0.045
      this.pelvis.position.y = 0.92 - drop * 0.85 + bound + breathe - (this.sliding ? 0.24 : 0)
      this.chest.rotation.x = this.sliding ? -0.25 : 0.07 * Math.min(1, g) + run * 0.2 + over * 0.06 + 0.55 * this.scrambleLean
      // The head stays level and looking ahead whatever the body does.
      this.head.rotation.x = -this.chest.rotation.x * 0.75
      this.head.rotation.y = -this.chest.rotation.y - this.pelvis.rotation.y
      // A landing: down into the knees, arms out a little, and up again.
      if (this.landK > 0.01) {
        const k = Math.sin(Math.min(1, this.landK) * Math.PI * 0.5)
        this.pelvis.position.y -= 0.24 * k
        for (let i = 0; i < 2; i++) {
          L[i].hip.rotation.x -= 0.75 * k
          L[i].knee.rotation.x += 1.25 * k
          A[i].shoulder.rotation.z += (i ? 1 : -1) * 0.35 * k
        }
        this.chest.rotation.x += 0.35 * k
      }
      // Pulled up after a long run: catching your breath — the chest heaving, head down a
      // little, shoulders rising and falling — before anything else.
      if (this.winded > 0.05 && hs < 1) {
        const k = this.winded * (1 - Math.min(1, hs))
        const b = Math.sin(this.t * 5.2)
        this.chest.rotation.x += (0.18 + 0.05 * b) * k
        this.pelvis.position.y -= 0.03 * k
        this.head.rotation.x += 0.12 * k
        for (let i = 0; i < 2; i++) {
          A[i].shoulder.rotation.x += (-0.12 + 0.06 * b) * k
          L[i].knee.rotation.x += 0.12 * k
        }
      }
      // Standing a while: the weight on one leg, then the other; now and then a look round
      // (at the land, the sky — not a mannequin waiting for input).
      if (this.stillT > 2.5) {
        const w = THREE.MathUtils.smoothstep(this.stillT, 2.5, 4.5)
        const shift = Math.sin(this.t * 0.23) // which leg
        this.pelvis.rotation.z += shift * 0.045 * w
        this.pelvis.position.x = shift * 0.025 * w
        const bent = shift > 0 ? 1 : 0
        L[bent].knee.rotation.x += Math.abs(shift) * 0.22 * w
        L[bent].hip.rotation.x -= Math.abs(shift) * 0.08 * w
        // A slow look one way or the other every so often, held, then back.
        const look = Math.sin(this.t * 0.11) * Math.sin(this.t * 0.07 + 1.3)
        this.head.rotation.y += THREE.MathUtils.clamp(look * 1.6, -0.7, 0.7) * w
        this.head.rotation.x += Math.max(0, Math.sin(this.t * 0.05 + 2)) * -0.18 * w
      }
    }

    // A tool in hand: its pose over whatever the legs are doing.
    for (const k of ['bow', 'horn', 'sight'] as const) this.props[k].visible = this.holding === k
    if (this.holding === 'bow') {
      // The bow arm straight out ahead, the string hand drawn back to the cheek.
      A[1].shoulder.rotation.set(-1.52, 0, 0.12)
      A[1].elbow.rotation.x = 0
      A[0].shoulder.rotation.set(-1.45, 0.2, -0.35)
      A[0].elbow.rotation.x = -2.1
    } else if (this.holding === 'horn') {
      // The horn to the mouth, the other hand steadying it.
      A[0].shoulder.rotation.set(-1.4, 0, -0.32)
      A[0].elbow.rotation.x = -2.05
      A[1].shoulder.rotation.set(-1.4, 0, 0.5)
      A[1].elbow.rotation.x = -1.2
      this.head.rotation.x = -0.25
    } else if (this.holding === 'sight') {
      // The stone held up before the eye: upper arm out level, forearm up to the face.
      A[0].shoulder.rotation.set(-1.55, 0, -0.38)
      A[0].elbow.rotation.x = -1.75
    }

    // The lantern swings on its hook: with the stride, a beat behind it, and out on a turn.
    {
      const go = this.grounded && !this.climbing && !this.swimming ? Math.min(1, this.gait) : 0
      const swing = Math.sin(this.stride - 0.7) * (0.22 + 0.18 * run) * go
      this.lanternHook.rotation.x += (swing - this.lanternHook.rotation.x) * Math.min(1, dt * 10)
      const out = THREE.MathUtils.clamp(-this.bodyRoll * 1.4, -0.4, 0.4) + Math.cos(this.stride) * 0.06 * go
      this.lanternHook.rotation.z += (out - this.lanternHook.rotation.z) * Math.min(1, dt * 6)
      // The satchel bumps against the hip with each step.
      const bag = this.bagParts[1]
      if (bag) {
        bag.position.y = -0.12 + Math.abs(Math.sin(this.stride)) * 0.018 * go * (1 + run)
        bag.rotation.z = 0.1 + Math.sin(this.stride + 0.5) * 0.08 * go
      }
    }

    // Taking something from the ground: down on one knee, the right hand reaching to it,
    // a moment, then up (it rises into the hand meanwhile: Spots.take).
    if (this.takeT >= 0) {
      this.takeT += dt
      const t = this.takeT
      const k = t < 0.4 ? ease01(t / 0.4) : t < 0.8 ? 1 : 1 - ease01((t - 0.8) / 0.5)
      const mix = (a: number, b: number) => a + (b - a) * k
      this.pelvis.position.y = mix(this.pelvis.position.y, 0.6)
      L[0].hip.rotation.x = mix(L[0].hip.rotation.x, -1.35)
      L[0].knee.rotation.x = mix(L[0].knee.rotation.x, 1.55)
      L[1].hip.rotation.x = mix(L[1].hip.rotation.x, 0.15)
      L[1].knee.rotation.x = mix(L[1].knee.rotation.x, 1.75)
      this.chest.rotation.x = mix(this.chest.rotation.x, 0.55)
      this.head.rotation.x = mix(this.head.rotation.x, 0.25)
      A[0].shoulder.rotation.set(mix(A[0].shoulder.rotation.x, -0.95), 0, mix(A[0].shoulder.rotation.z, -0.18))
      A[0].elbow.rotation.x = mix(A[0].elbow.rotation.x, -0.15)
      A[1].shoulder.rotation.x = mix(A[1].shoulder.rotation.x, -0.2)
      A[1].elbow.rotation.x = mix(A[1].elbow.rotation.x, -0.6)
      if (t >= 1.3) this.takeT = -1
    }

    // The cloth, in the world: pinned at the shoulders (with the chest's lean).
    this.obj.updateMatrixWorld(true)
    const m = this.obj.matrixWorld
    const cm = this.chest.matrixWorld
    this.capeChest.forEach((a, i) => this.capePins[i].copy(a).applyMatrix4(cm))
    this.scarfChest.forEach((a, i) => this.scarfPins[i].copy(a).applyMatrix4(cm))
    this.hangDir.set(0, -1, -0.15).transformDirection(m)
    // The body's capsule, pelvis to chest, a little fatter than the body. (It must end below
    // the pins: a cap above them pushed the scarf's first links upward and it stood on end.)
    this.axisA.set(0, 0.55, 0).applyMatrix4(m)
    this.axisB.set(0, 1.26, -0.02).applyMatrix4(m)
    // Moving makes wind of its own: the cloth streams behind; the weather's wind gusts.
    const gust = wind.length()
    this.windV.copy(wind).multiplyScalar(0.5 + 0.5 * Math.max(0, Math.sin(this.t * 0.7) * Math.sin(this.t * 1.9)))
    // (Running makes a breeze that lifts it back — not a gale that holds it out flat.)
    // On a giant, `vel` is whatever it was before you took hold (the climb moves the body
    // itself): the cape streamed sideways and bunched over the shoulders in a wind that
    // wasn't there. There, how the body really moves.
    {
      const jump = this.lastBodyPos.distanceToSquared(this.obj.position) > 100
      if (dt > 0 && !jump) {
        _tv.subVectors(this.obj.position, this.lastBodyPos).divideScalar(dt)
        if (_tv.lengthSq() > 900) _tv.setLength(30)
        this.bodyVel.lerp(_tv, Math.min(1, dt * 8))
      }
      this.lastBodyPos.copy(this.obj.position)
    }
    this.windV.addScaledVector(this.onBody ? this.bodyVel : this.vel, this.gliding ? -0.6 : -0.42)
    this.windV.x += Math.sin(this.t * 2.3) * gust * 0.25
    this.windV.z += Math.cos(this.t * 1.7) * gust * 0.25
    // A long fall: the air rushing up would stand the whole cape on your head,
    // a thin red spike (from ~20 m/s down). Up only so far; the rest of it
    // streams the cape out behind you, flying, as a falling cloak does.
    if (this.windV.y > 4) {
      const over = this.windV.y - 4
      this.windV.y = 4 + over * 0.2
      this.windV.x -= Math.sin(this.yaw) * over * 0.55
      this.windV.z -= Math.cos(this.yaw) * over * 0.55
    }
    // Even on a still day the air is never quite still: a slow, wandering breeze, enough
    // to stir the hem when you stand (a cape hanging dead straight reads as a board).
    const airA = this.t * 0.05
    const air = 0.7 * (0.55 + 0.45 * Math.sin(this.t * 0.31) * Math.sin(this.t * 0.83 + 1))
    this.windV.x += Math.cos(airA) * air
    this.windV.z += Math.sin(airA) * air
    const speed = Math.hypot(this.vel.x, this.vel.z)
    this.cape.rest += ((speed < 0.6 && !this.gliding ? 1 : 0) - this.cape.rest) * Math.min(1, dt * 0.8)
    // The legs, as the cloth sees them (thigh and shin each): it falls round them, not through.
    for (let i = 0; i < 2; i++) {
      const L = this.legs[i]
      const c = this.legCaps
      L.hip.getWorldPosition(c[i * 2].a)
      L.knee.getWorldPosition(c[i * 2].b)
      c[i * 2 + 1].a.copy(c[i * 2].b)
      c[i * 2 + 1].b.set(0, -0.44, 0)
      L.knee.localToWorld(c[i * 2 + 1].b)
    }
    this.cape.water = this.scarf.water = this.swimming
    this.cape.step(dt, this.capePins, this.hangDir, this.windV, this.axisA, this.axisB, 0.23, ground, this.legCaps)
    this.windV.multiplyScalar(1.25)
    this.scarf.step(dt, this.scarfPins, this.hangDir, this.windV, this.axisA, this.axisB, 0.2, ground)

    // The lantern: brighter in the dark, a slow flicker.
    const flicker = 0.9 + 0.1 * Math.sin(this.t * 11) * Math.sin(this.t * 7.3)
    // It comes up by itself as the dark comes on (and is all but out by day).
    this.lanternOn += (Math.max(0, (dark - 0.25) / 0.75) - this.lanternOn) * Math.min(1, dt * 0.8)
    this.lantern.intensity = (0.04 + this.lanternOn * 7) * flicker
    this.lantern.distance = 10 + this.lanternOn * 18
    // The glass: dim amber by day (a lantern hardly lit), bright and warm in the dark.
    const glow = (0.35 + 0.65 * this.lanternOn) * flicker
    ;(this.lanternGlow.material as THREE.MeshBasicMaterial).color.setRGB(0.95 * glow + 0.05, 0.62 * glow, 0.3 * glow)
  }

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.z)
  }
}
