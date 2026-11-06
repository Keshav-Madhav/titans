// The Wanderer: a small figure in a red cloak — the one thing in this world
// at human scale, so it has to read at a glance from far away and feel alive
// up close. Procedural: a slim body in a dark tunic, jointed legs and boots,
// arms that swing, a deep pointed hood with the face lost in shadow; and
// cloth — a long red cape and a scarf, simulated (verlet), streaming behind
// when you run, lifted by the weather's wind, never through the body or the
// ground. A small lantern at the hip glows warm in dark places.

import * as THREE from 'three'
import type { Avatar } from './avatar'
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
/** The most you can brake by, letting go on the ground (m/s²): a long run stops in ~2/3 s. */
const BRAKE = 22
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

const _seedDir = new THREE.Vector2()
const _m4 = new THREE.Matrix4()
const _ra = new THREE.Vector3()
const _rb = new THREE.Vector3()
const _p0 = new THREE.Vector3()
const _p1 = new THREE.Vector3()
const _p2 = new THREE.Vector3()
const _p3 = new THREE.Vector3()
const _p4 = new THREE.Vector3()
const _p5 = new THREE.Vector3()
const _cf = new THREE.Vector3()
const _cr = new THREE.Vector3()
const _cu = new THREE.Vector3()
const _t0 = new THREE.Vector3()
const _t1 = new THREE.Vector3()
const _t2 = new THREE.Vector3()
const _t3 = new THREE.Vector3()
const _t4 = new THREE.Vector3()
const _t5 = new THREE.Vector3()
const _t6 = new THREE.Vector3()
const _rq = new THREE.Quaternion()
const _rq2 = new THREE.Quaternion()
const _rq3 = new THREE.Quaternion()
const _rqI = new THREE.Quaternion()
const _one = new THREE.Vector3(1, 1, 1)
const _up = new THREE.Vector3(0, 1, 0)
const _side = new THREE.Vector3(1, 0, 0)
const _tq = new THREE.Quaternion()
const _fwd = new THREE.Vector3(0, 0, 1)
const _tv = new THREE.Vector3()
const _ikA = new THREE.Vector3()
const _ikB = new THREE.Vector3()
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
  // (Texture coordinates — QA cycle 7: without them the cloth's weave and folds never reached the
  // hood, a smooth red egg on a woven cloak.) Round the head, and from the crown down; the weave is
  // ~4× finer here than on the cape's strip, so it is laid round the hood a few times.
  const uvs = new Float32Array(keep.length * 2)
  keep.forEach((i, j) => {
    pos.set([p.getX(i), p.getY(i), p.getZ(i)], j * 3)
    nrm.set([n.getX(i), n.getY(i), n.getZ(i)], j * 3)
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    uvs.set([(Math.atan2(x, -z) / (Math.PI * 2) + 0.5) * 3, 0.95 - (Math.acos(Math.max(-1, Math.min(1, y / radius))) / Math.PI) * 0.75], j * 2)
  })
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
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
function clothTexture(): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
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
  const height = new Float32Array(W * H)
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
      // Relief for the normal map: the weave's ribs, the folds, the stitched band raised a little.
      height[y * W + x] = 0.55 * (twill - 0.94) / 0.06 + 2.2 * (fold - 0.9) / 0.1 + (band < 0.9 ? 0.25 : 0)
      const k = (y * W + x) * 4
      img.data[k] = img.data[k + 1] = img.data[k + 2] = l * 255
      img.data[k + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  // (QA cycle 7: the colour alone moved a few percent and the cloak read as flat red plastic — the
  // weave and the folds must catch the light.) A normal map from the same relief.
  const cn = document.createElement('canvas')
  cn.width = W
  cn.height = H
  const gn = cn.getContext('2d')!
  const nimg = gn.createImageData(W, H)
  const hAt = (x: number, y: number) => height[((y + H) % H) * W + ((x + W) % W)]
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = (hAt(x + 1, y) - hAt(x - 1, y)) * 0.5
      const dy = (hAt(x, y + 1) - hAt(x, y - 1)) * 0.5
      const nz = 1 / Math.hypot(dx, dy, 1)
      const k = (y * W + x) * 4
      nimg.data[k] = (0.5 - dx * nz * 0.5) * 255
      nimg.data[k + 1] = (0.5 + dy * nz * 0.5) * 255
      nimg.data[k + 2] = (0.5 + nz * 0.5) * 255
      nimg.data[k + 3] = 255
    }
  gn.putImageData(nimg, 0, 0)
  const n = new THREE.CanvasTexture(cn)
  n.anisotropy = 4
  return { map: t, normal: n }
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
  /**
   * How far above the pins' mean height the cloth may rise (m). A cloak in a gale streams out
   * level at most: in a storm, running along a steep slope, the cape was pushed up the hill
   * behind you and stood over your head like a board. Infinity while you fall or glide (then
   * the rushing air may lift it).
   */
  ceil = Infinity
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
    // Drawn finer than it is simulated (QA cycle 7: 9 × 9 particles drawn as 64 flat quads read as
    // a stiff board): SUB vertices per cell, a smooth (Catmull-Rom) surface through the particles.
    const RC = (cols - 1) * Cloth.SUB + 1
    const RR = (rows - 1) * Cloth.SUB + 1
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RC * RR * 3), 3))
    // (The cloth's texture: across the width, and from the shoulders, v = 1, down to the hem.)
    const uv = new Float32Array(RC * RR * 2)
    for (let r = 0; r < RR; r++) for (let c = 0; c < RC; c++) uv.set([c / (RC - 1), 1 - r / (RR - 1)], (r * RC + c) * 2)
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    const idx: number[] = []
    for (let r = 0; r < RR - 1; r++) {
      for (let c = 0; c < RC - 1; c++) {
        const a = r * RC + c
        idx.push(a, a + RC, a + 1, a + 1, a + RC, a + RC + 1)
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
          const spread = 1 + (this.taper(row) - 1) * 0.55
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
      if (this.ceil < Infinity) {
        let py = 0
        for (let c = 0; c < cols; c++) py += pins[c].y
        const top = py / cols + this.ceil
        for (let i = cols * 2; i < cols * rows; i++) if (p[i * 3 + 1] > top) p[i * 3 + 1] = top
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
    this.refine(pos.array as Float32Array)
    pos.needsUpdate = true
    this.mesh.geometry.computeVertexNormals()
  }

  static readonly SUB = 3

  /** The particles → the drawn surface: Catmull-Rom across each row, then down the columns. */
  private refine(out: Float32Array): void {
    const { cols, rows, p } = this
    const S = Cloth.SUB
    const RC = (cols - 1) * S + 1
    const RR = (rows - 1) * S + 1
    const cr = (a: number, b: number, c: number, d: number, t: number) => {
      const t2 = t * t
      return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t2 * t)
    }
    const P = (r: number, c: number, k: number) => p[((Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))) * 3) + k]
    // Across each particle row first (rows × RC), then down (RR × RC).
    const tmp = this.tmp ?? (this.tmp = new Float32Array(rows * RC * 3))
    for (let r = 0; r < rows; r++)
      for (let x = 0; x < RC; x++) {
        const c = Math.min(cols - 2, Math.floor(x / S))
        const t = x / S - c
        for (let k = 0; k < 3; k++) tmp[(r * RC + x) * 3 + k] = cr(P(r, c - 1, k), P(r, c, k), P(r, c + 1, k), P(r, c + 2, k), t)
      }
    const T = (r: number, x: number, k: number) => tmp[(Math.min(rows - 1, Math.max(0, r)) * RC + x) * 3 + k]
    for (let y = 0; y < RR; y++) {
      const r = Math.min(rows - 2, Math.floor(y / S))
      const t = y / S - r
      for (let x = 0; x < RC; x++) for (let k = 0; k < 3; k++) out[(y * RC + x) * 3 + k] = cr(T(r - 1, x, k), T(r, x, k), T(r + 1, x, k), T(r + 2, x, k), t)
    }
  }
  private tmp: Float32Array | null = null

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
type LimbKind = 'thigh' | 'shin' | 'upperArm' | 'forearm'

/**
 * A limb with a body's shape (graphics pass, 2026-11-04: they were straight ten-sided cylinders —
 * the mannequin look). A lathe along a real profile — the thigh full below the hip, the calf
 * swelling at the back of the upper shin, the forearm fuller toward the elbow — oval in section,
 * sixteen sides; the shins wound in their wraps (a spiral of raised bands). A ball at the joint.
 */
function limb(len: number, r0: number, r1: number, mat: THREE.Material, kind: LimbKind): THREE.Group {
  const g = new THREE.Group()
  const RINGS = 10
  const SIDES = 16
  const bulge = { thigh: 0.14, shin: 0.0, upperArm: 0.09, forearm: 0.12 }[kind]
  const at = { thigh: 0.32, shin: 0.3, upperArm: 0.4, forearm: 0.25 }[kind]
  const pos: number[] = []
  const uvs: number[] = []
  const idx: number[] = []
  for (let j = 0; j <= RINGS; j++) {
    const t = j / RINGS
    let r = r0 + (r1 - r0) * t
    r *= 1 + bulge * Math.exp(-((t - at) * (t - at)) / 0.045)
    // (Rounded in at the ends: no flat cut where it meets the joint ball.)
    r *= 0.9 + 0.1 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.85))
    for (let i = 0; i < SIDES; i++) {
      const a = (i / SIDES) * Math.PI * 2
      let x = Math.cos(a) * r
      let z = Math.sin(a) * r * 0.86
      // The calf: out behind the shin, high up.
      if (kind === 'shin') {
        const back = Math.max(0, -Math.sin(a))
        z -= back * r * 0.32 * Math.exp(-((t - 0.28) * (t - 0.28)) / 0.03)
        // The wraps: a spiral of raised bands round the shin.
        const band = Math.sin((t * 9 + a / (Math.PI * 2)) * Math.PI * 2)
        const k = 1 + 0.045 * Math.max(0, band) * (t > 0.08 && t < 0.86 ? 1 : 0)
        x *= k
        z *= k
      }
      pos.push(x, -len * t, z)
      uvs.push(i / SIDES, t)
    }
  }
  for (let j = 0; j < RINGS; j++)
    for (let i = 0; i < SIDES; i++) {
      const a = j * SIDES + i
      const b = j * SIDES + ((i + 1) % SIDES)
      const c = a + SIDES
      const d = b + SIDES
      idx.push(a, c, b, b, c, d)
    }
  const body = new THREE.BufferGeometry()
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  body.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  body.setIndex(idx)
  // (Normals while indexed — smooth round the limb; recomputed after toNonIndexed they facet.)
  body.computeVertexNormals()
  const m = new THREE.Mesh(mergeGeometries([body.toNonIndexed(), new THREE.SphereGeometry(r0 * 0.9, 14, 8).toNonIndexed()])!, mat)
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
  /** On the cloak down a snowfield (ice slides). */
  sledding = false
  /** Is (x, z) snow you can slide on? (main sets it: the High Ice.) */
  isSnow: (x: number, z: number) => boolean = () => false
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
  /** Hanging from the grappling line (arms up on the rope). */
  hanging = false
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
  /** The fraction of a leg's cycle its foot is on the ground. */
  private stanceF = 0.5
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
  /** A seed river's lift at a point (0 … 1), and its way there into `dir` (set by the game). */
  seedLift: (p: THREE.Vector3, dir: THREE.Vector2) => number = () => 0
  /** A thermal's lift at a point, m/s (set by the game). */
  thermalLift: (p: THREE.Vector3) => number = () => 0
  private t = 0
  /** Smoothed speed (in walks) the limbs follow. */
  private gait = 0
  private hsS = 0
  private climbing = false
  private climbMoving = 0
  private readonly pelvis = new THREE.Group()
  private readonly chest = new THREE.Group()
  /** The rigged body (avatar.ts), once loaded: shown instead of the old jointed one. */
  private avatar: Avatar | null = null
  /** Where the old chest and pelvis would be on the rigged body (what hung from them hangs here). */
  private readonly chestAnchor = new THREE.Group()
  private readonly pelvisAnchor = new THREE.Group()
  private readonly anchorOff: { chest: THREE.Matrix4; pelvis: THREE.Matrix4; neck: THREE.Matrix4; face?: THREE.Matrix4 } = { chest: new THREE.Matrix4(), pelvis: new THREE.Matrix4(), neck: new THREE.Matrix4() }
  /** The shoulder mantle's place on the rigged body (the neck's base, turning with the upper spine). */
  private readonly neckAnchor = new THREE.Group()
  /** The hollow of the face's place (in the head, in the body's frame: forward is +z). */
  private readonly faceAnchor = new THREE.Group()
  /** The wing-cloak spread behind the shoulders (only while gliding). */
  private readonly wing: THREE.Mesh
  private readonly head = new THREE.Group()
  private readonly legs: Leg[] = []
  /** Each leg's place in its stance this frame (0 … 1, landing → lift-off), or -1 in the air. */
  private readonly stance = [-1, -1]
  /** The speed last frame and its smoothed rate of change (m/s²), for the lean. */
  private leanSpeed = 0
  private leanAcc = 0
  /** Where each planted ankle is pinned on the ground (null: not planted). */
  private readonly footLock: Array<THREE.Vector3 | null> = [null, null]
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
  /** The legs, and (rigged body) the arms — upper arm and forearm each, a little thinner. */
  private readonly limbCaps: Capsule[] = [...this.legCaps, ...[0, 1, 2, 3].map(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.085 }))]
  private readonly axisB = new THREE.Vector3()
  private readonly hangDir = new THREE.Vector3()
  private readonly windV = new THREE.Vector3()
  private readonly redCloth: THREE.MeshPhysicalMaterial
  /** 0 … 1: how far the view looks into the sun (main sets it; the cloak glows a little against it). */
  backlit = 0

  constructor(cloak: THREE.ColorRepresentation = RED) {
    // Cloth: the weave and folds in a normal map, and sheen — the soft bright rim fabric has at
    // grazing angles (QA cycle 7: it read as flat red plastic).
    const cloth = clothTexture()
    const red = new THREE.MeshPhysicalMaterial({
      color: cloak,
      roughness: 0.86,
      side: THREE.DoubleSide,
      map: cloth.map,
      normalMap: cloth.normal,
      normalScale: new THREE.Vector2(1.2, 1.2),
      // (Deep red and faint: a pale sheen at full strength washed it to salmon under cloud.)
      sheen: 0.3,
      sheenRoughness: 0.7,
      sheenColor: new THREE.Color(cloak).multiplyScalar(1.25),
    })
    // The red reads in the dark too (QA cycle 4: in the Mire at night the hood was a muddy smear —
    // you are the one thing in the land that must always read): a faint glow of its own colour,
    // nothing by day, rising with the dark (animate()).
    red.emissive.set(cloak)
    red.emissiveIntensity = 0
    this.redCloth = red
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
        // The tunic over the hips — only so far: the coat below it hangs in two halves from the
        // thighs (it flared on down to the knee here too, rigid on the chest, and every stride drove
        // a thigh out through it: the user, 2026-11-05, "legs through the coat").
        new THREE.CylinderGeometry(0.15, 0.19, 0.16, 14, 1, true).translate(0, -0.0, 0).scale(1.1, 1, 0.92).toNonIndexed(),
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
      const hip = limb(0.44, 0.09, 0.072, tunic, 'thigh')
      hip.position.set(side * 0.095, 0, 0)
      // The coat's skirt, in two halves, each hung on its own thigh (graphics pass, 2026-11-04:
      // bare stick legs read as a jointed doll): flared, to just below the knee, open at the hem,
      // a little longer behind. It swings with that leg, so a stride never cuts through it.
      {
        const skirt = new THREE.CylinderGeometry(0.118, 0.158, 0.54, 18, 6, true)
        const sp = skirt.getAttribute('position')
        for (let k = 0; k < sp.count; k++) {
          const x = sp.getX(k)
          const y = sp.getY(k)
          const z = sp.getZ(k)
          // Longer behind than in front, and folds round the hem.
          const ang = Math.atan2(z, x)
          const low = y < -0.2 ? 1 : 0
          const fold = 1 + 0.06 * Math.sin(ang * 7 + side) * Math.max(0, -y / 0.27) * low
          sp.setXYZ(k, x * fold, y - (z < 0 ? 0.035 * Math.max(0, -y / 0.27) : 0), z * fold * 0.9)
        }
        skirt.computeVertexNormals()
        const coatMat = (tunic as THREE.MeshStandardMaterial).clone()
        coatMat.side = THREE.DoubleSide
        const coat = new THREE.Mesh(skirt.translate(side * 0.02, -0.2, 0), coatMat)
        coat.castShadow = true
        hip.add(coat)
      }
      const knee = limb(0.44, 0.078, 0.064, wraps, 'shin')
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
      const shoulder = limb(0.29, 0.068, 0.058, tunic, 'upperArm')
      shoulder.position.set(side * 0.22, 0.52, 0)
      const elbow = limb(0.27, 0.056, 0.048, tunic, 'forearm')
      elbow.position.y = -0.29
      // Sleeves: the upper arm's loose and long enough to cover the elbow, the forearm's widening
      // to a turned-back cuff (the joint balls showed — a doll's arm).
      for (const [part, len, r0, r1, y0] of [
        [shoulder, 0.33, 0.078, 0.075, 0.0],
        [elbow, 0.22, 0.066, 0.074, 0.0],
      ] as const) {
        const sl = new THREE.CylinderGeometry(r1, r0, len, 14, 3, true)
        const sp = sl.getAttribute('position')
        for (let k = 0; k < sp.count; k++) {
          const a = Math.atan2(sp.getZ(k), sp.getX(k))
          const f = 1 + 0.05 * Math.sin(a * 5 + len * 40)
          sp.setXYZ(k, sp.getX(k) * f, sp.getY(k), sp.getZ(k) * f * 0.92)
        }
        sl.computeVertexNormals()
        const sleeveMat = (tunic as THREE.MeshStandardMaterial).clone()
        sleeveMat.side = THREE.DoubleSide
        const sleeve = new THREE.Mesh(sl.translate(0, y0 - len / 2 + 0.02, 0), sleeveMat)
        sleeve.castShadow = true
        part.add(sleeve)
      }
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
    this.flyLean = THREE.MathUtils.clamp(this.flyLean + (this.gliding ? 1 : -1) * dt * 2.5, 0, 1)
    // Camera looks along -Z at yaw 0, so forward is (-sin, -cos).
    const fx = -Math.sin(camYaw)
    const fz = -Math.cos(camYaw)
    let wx = fx * move.y + -fz * move.x
    let wz = fz * move.y + fx * move.x
    const len = Math.hypot(wx, wz)
    if (len > 0) {
      // (A stick part-way over walks slower; keys are always all the way.)
      const mag = Math.min(1, Math.hypot(move.x, move.y))
      wx *= mag / len
      wz *= mag / len
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
    // Ice slides (user's pick #4): on the High Ice's snow, heading down a real slope, you sit on
    // your cloak and go — gravity takes you down the fall line, A/D carves, S digs in to brake,
    // Space hops (keeping the speed); it ends where the slope runs out and you have slowed, or on
    // anything that isn't snow.
    {
      const sx = terrain.heightAt(this.pos.x + 0.6, this.pos.z) - terrain.heightAt(this.pos.x - 0.6, this.pos.z)
      const sz = terrain.heightAt(this.pos.x, this.pos.z + 0.6) - terrain.heightAt(this.pos.x, this.pos.z - 0.6)
      const grade = Math.hypot(sx, sz) / 1.2
      const snowy = this.isSnow(this.pos.x, this.pos.z) && !this.onStone
      const hv = Math.hypot(this.vel.x, this.vel.z)
      if (!this.sledding && this.grounded && snowy && grade > 0.28 && len > 0) {
        // Pushing downhill (within ~50° of the fall line).
        const down = -(wx * sx + wz * sz) / (Math.hypot(sx, sz) * len)
        if (down > 0.64) {
          this.sledding = true
          this.lope = 0
        }
      }
      if (this.sledding && (!snowy || (grade < 0.12 && hv < 1.6))) this.sledding = false
      if (this.sledding && this.grounded) {
        const gl = Math.hypot(sx, sz) || 1
        // Gravity along the fall line (≈ g·sin θ), a little friction, air drag at speed.
        const a = 9.8 * (grade / Math.sqrt(1 + grade * grade))
        this.vel.x -= (sx / gl) * a * dt
        this.vel.z -= (sz / gl) * a * dt
        // Carving: A/D turn the run (faster turns slower); S brakes.
        const turn = -move.x * Math.min(1.8, 14 / Math.max(4, hv)) * dt
        const c = Math.cos(turn)
        const sn = Math.sin(turn)
        const vx = this.vel.x * c - this.vel.z * sn
        this.vel.z = this.vel.x * sn + this.vel.z * c
        this.vel.x = vx
        const fric = 0.04 + (move.y < -0.3 ? 2.2 : 0) + hv * 0.004
        this.vel.x *= Math.max(0, 1 - fric * dt)
        this.vel.z *= Math.max(0, 1 - fric * dt)
        // (No faster than a long glide: past that the snow's bumps would launch you.)
        const cap = 32
        if (hv > cap) {
          this.vel.x *= cap / hv
          this.vel.z *= cap / hv
        }
        if (hv > 0.5) this.yaw = Math.atan2(this.vel.x, this.vel.z)
        this.sliding = false
        this.scrambling = false
      }
    }
    if (!this.sledding) {
      // The long run builds over ~5 s of a steady sprint on ground that isn't
      // climbing, and falls away when you turn hard, climb, or stop.
      const vlen = Math.hypot(this.vel.x, this.vel.z)
      const steady = len > 0 && vlen > SPRINT * 0.8 && (this.vel.x * wx + this.vel.z * wz) / vlen > 0.92
      const rise = len > 0 ? (terrain.heightAt(this.pos.x + wx * 2, this.pos.z + wz * 2) - terrain.heightAt(this.pos.x, this.pos.z)) / 2 : 0
      if (sprint && this.grounded && steady && rise < 0.18) this.lope = Math.min(1, this.lope + dt / 5)
      else if (this.grounded || !sprint) this.lope = Math.max(0, this.lope - dt * (sprint && len > 0 ? 0.5 : 2))
      const speed = sprint ? SPRINT + (LONG - SPRINT) * this.lope * this.lope * (3 - 2 * this.lope) : WALK
      const k = Math.min(1, ACCEL * dt * (this.grounded ? 1 : 0.25))
      // Letting go at speed, the body brakes over a few strides, not on the spot (QA cycle 5: from a
      // long run it stopped in a quarter of a second — ~200 m/s² at first, a snap no one could
      // make). At most BRAKE; a walk still stops in under 0.2 s.
      let bx = (wx * speed - this.vel.x) * k
      let bz = (wz * speed - this.vel.z) * k
      if (len === 0 && this.grounded) {
        const b = Math.hypot(bx, bz)
        if (b > BRAKE * dt) {
          bx *= (BRAKE * dt) / b
          bz *= (BRAKE * dt) / b
        }
      }
      this.vel.x += bx
      this.vel.z += bz

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
      // (Down to straight down, −1.56: clamped at −1.35, a fall straight down was thrown 6 m/s sideways
      // the frame the cloak opened — the playtest's camera jolt. Lift brings the nose up from there.)
      this.gamma = THREE.MathUtils.clamp(this.gamma + ((lift * Math.cos(this.bank) - FLY_G * Math.cos(this.gamma)) / Math.max(v, 3)) * dt, -1.56, 0.9)
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
      // A river of seeds on the wind (user's pick #5): its air lifts you, and carries you its way.
      const seed = this.seedLift(this.pos, _seedDir)
      if (seed > 0) {
        this.updraft = Math.max(this.updraft, 8.5 * seed)
        // The heading eases round to the river's way (it is a current: you go with it or leave it).
        let dh = Math.atan2(_seedDir.x, _seedDir.y) - this.heading
        dh = Math.atan2(Math.sin(dh), Math.cos(dh))
        this.heading += dh * Math.min(1, 0.5 * seed * dt)
      }
      // A thermal (sun-heated ground, by day): rising air you circle up in.
      this.updraft = Math.max(this.updraft, this.thermalLift(this.pos))
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
    // Turning toward where you go: a critically damped spring on the turn's rate, not a fixed share of
    // the angle a step — reversing, that turned 34° in the first frame (2,000°/s from a standstill).
    // Now it winds up and settles, an about-face in ~0.3 s, without overshoot.
    let d = 0
    if (hs > 0.3) {
      d = Math.atan2(this.vel.x, this.vel.z) - this.yaw
      d = Math.atan2(Math.sin(d), Math.cos(d))
    }
    const W = 13
    this.yawV += (W * W * d - 2 * W * this.yawV) * Math.min(dt, 1 / 30)
    this.yaw += this.yawV * dt
  }

  /** In flight: how far the body has leaned into the flying pose (eased in and out). */
  private flyLean = 0
  /** Swimming: how much the feet are held under the water (eased in and out). */
  private swimLegW = 0
  /** The facing's turn rate (rad/s), sprung toward where you go. */
  private yawV = 0

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
    // (The rigged body's swim clip lies flat in the water itself: tipped again here it went head down
    // under the surface, only its arms and boots showing.)
    if (this.swimLean > 0.01 && !this.avatar) {
      this.obj.quaternion.multiply(_tq.setFromAxisAngle(_side, this.swimLean))
      this.obj.position.y += Math.sin(this.swimLean) * 0.78
    }
    // In flight: lean into the bank, nose with the flight path, body near level.
    // (Eased in and out over ~0.2 s: opening the cloak tipped the body 52° forward in one frame —
    // the playtest's worst pop, the head and hands thrown 0.5 m in 16 ms.)
    // (On an S-curve: eased exponentially alone, its first frame was its biggest — 13.5°.)
    const fl = this.flyLean * this.flyLean * (3 - 2 * this.flyLean)
    if (fl > 0.002) {
      this.obj.quaternion.multiply(_tq.setFromAxisAngle(_fwd, this.bank * 0.9 * fl))
      this.obj.quaternion.multiply(_tq.setFromAxisAngle(_side, (0.9 - this.gamma * 0.5) * fl))
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
      o.position.copy(point).addScaledVector(normal, 0.8).addScaledVector(_cy, -1.2)
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
    const h = this.avatar?.bone('hand_r')
    if (h) return h.getWorldPosition(out)
    return this.arms[0].elbow.localToWorld(out.set(0, -0.34, 0))
  }

  /**
   * Wear the rigged body (avatar.ts): it is shown and the old jointed one hidden; the cloth, the
   * glide wing, the lantern and the satchel move onto anchors that follow its bones.
   */
  /** The cloak's red (the rigged body's hood wears it too). */
  get cloakMaterial(): THREE.Material {
    return this.redCloth
  }

  setAvatar(av: Avatar): void {
    this.avatar = av
    this.obj.add(av.root)
    // (Rests taken standing — the idle clip's first pose — not in the rig's bind pose, a T with the
    // spine tilted half a radian from standing: everything anchored to it came out tipped.)
    av.update(1 / 60, { speed: 0, grounded: true, swimming: false, vy: 0, mode: 'ground', take: -1, climbRate: 0 })
    av.update(1, { speed: 0, grounded: true, swimming: false, vy: 0, mode: 'ground', take: -1, climbRate: 0 })
    // (The whole body's matrices from the top: the bones' worlds were worked out from a stale
    // wanderer transform — its yaw at load — and every anchor came out turned round, the cape
    // hanging down the chest.)
    this.obj.updateMatrixWorld(true)
    // Each anchor: where the old part stood at rest, held relative to its bone at rest.
    const objInv = this.obj.matrixWorld.clone().invert()
    const restOf = (bone: string, y: number, out: THREE.Matrix4) => {
      const b = av.bone(bone)!
      const boneObj = objInv.clone().multiply(b.matrixWorld)
      out.copy(boneObj.invert()).multiply(new THREE.Matrix4().makeTranslation(0, y, 0))
    }
    restOf('spine_03', 0.92, this.anchorOff.chest)
    // The cape's pins and the scarf's, on the rigged body itself (user, 2026-11-05: "cape looks
    // disconnected… starting from the head instead of shoulders" — the pins were the old body's,
    // at 1.44 m; this body's shoulders are at ~1.29): an arc across the top of the shoulders and round
    // the upper back, from one shoulder joint to the other, in the upper spine's own space.
    {
      const sp = av.bone('spine_03')!
      const toSpine = sp.matrixWorld.clone().invert()
      const L = av.bone('upperarm_l')!.getWorldPosition(new THREE.Vector3()).applyMatrix4(objInv)
      const R = av.bone('upperarm_r')!.getWorldPosition(new THREE.Vector3()).applyMatrix4(objInv)
      const S = sp.getWorldPosition(new THREE.Vector3()).applyMatrix4(objInv)
      const neck = av.bone('neck_01')!.getWorldPosition(new THREE.Vector3()).applyMatrix4(objInv)
      const half = Math.abs(L.x - R.x) / 2
      const y = (L.y + R.y) / 2 + 0.07 // on top of the shoulder, not at the joint
      this.capeSpine.length = 0
      this.capeObj.length = 0
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (0.06 + (0.88 * i) / 8)
        // (Past the shoulders, wrapping them: at their width it hung as a strip down the back.)
        // (And round them toward the front at the ends, deeper over the back: on a shallow arc the cape
        // settled flat, a red board on the back — the user's complaint, still true on 2026-11-06.)
        const local = new THREE.Vector3(-Math.cos(a) * half * 1.45, y - 0.05 * Math.sin(a) - 0.03 * (1 - Math.sin(a)), S.z + 0.03 - Math.sin(a) * 0.21)
        this.capeObj.push(local.clone())
        // (Body space → world → the spine bone's space.)
        this.capeSpine.push(local.applyMatrix4(this.obj.matrixWorld).applyMatrix4(toSpine))
      }
      this.spineRestObj.copy(S)
      // The mantle (the hood's red skirt over the shoulders, over the top of the cape: without it the
      // cape was a flat red board pinned on behind — user, 2026-11-05).
      const neckObj = new THREE.Matrix4().makeTranslation(neck.x, neck.y + 0.02, neck.z - 0.025)
      const spRest = objInv.clone().multiply(sp.matrixWorld)
      this.anchorOff.neck.copy(spRest.invert()).multiply(neckObj)
      this.neckAnchor.matrixAutoUpdate = false
      this.obj.add(this.neckAnchor)
      // (Sized to this body: its shoulders are 0.34 m apart — the old mantle, 0.88 m across, was a bell.)
      const mantle = new THREE.Mesh(mantleGeometry().scale(0.66, 0.72, 0.78), this.redCloth)
      mantle.castShadow = true
      this.neckAnchor.add(mantle)
      // The face's hollow: in the hood's opening, a little in front of the head bone, its bowl open forward.
      if (av.faceMesh) {
        const headB = av.bone('Head')!
        const hp = headB.getWorldPosition(new THREE.Vector3()).applyMatrix4(objInv)
        const headRest = objInv.clone().multiply(headB.matrixWorld)
        this.anchorOff.face = headRest.invert().multiply(new THREE.Matrix4().makeTranslation(hp.x, hp.y + 0.07, hp.z + 0.11))
        this.faceAnchor.matrixAutoUpdate = false
        this.obj.add(this.faceAnchor)
        av.faceMesh.removeFromParent()
        av.faceMesh.scale.set(1.0, 1.25, 1.1)
        this.faceAnchor.add(av.faceMesh)
      }
      this.scarfSpine.length = 0
      for (const sx of [-0.05, 0.05]) this.scarfSpine.push(new THREE.Vector3(sx, neck.y - 0.02, neck.z + 0.06).applyMatrix4(this.obj.matrixWorld).applyMatrix4(toSpine))
    }
    // (The wing rides this anchor: in to the back of the shoulders — it hovered a hand's breadth
    // off the back in flight, a red sheet floating over the body.)
    this.anchorOff.chest.multiply(new THREE.Matrix4().makeTranslation(0, -0.05, 0.1))
    restOf('pelvis', 0.92, this.anchorOff.pelvis)
    for (const a of [this.chestAnchor, this.pelvisAnchor]) {
      a.matrixAutoUpdate = false
      this.obj.add(a)
    }
    this.chestAnchor.add(this.wing)
    this.pelvisAnchor.add(this.lanternHook)
    for (const o of this.bagParts) this.pelvisAnchor.add(o)
    // The tools ride the rig's hands (with the old hands' turn: the poses were made for them).
    for (const i of [0, 1]) {
      this.handAnchor[i].matrixAutoUpdate = false
      this.obj.add(this.handAnchor[i])
    }
    this.handAnchor[1].add(this.props.bow)
    this.handAnchor[0].add(this.props.horn, this.props.sight)
    // (The old body stays hidden but still posed every frame: its limbs are the pose the rig's are
    // aimed along when a tool is held or a wall is climbed — retarget().)
    for (const o of this.pelvis.children) if ((o as THREE.Mesh).isMesh) o.visible = false
    this.pelvis.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.visible = false
    })
    this.pelvis.visible = true
    // (No scarf on this body: the mantle covers the neck, and the scarf read as a red tie down the
    // front, a stalk standing out of the water and a streak in a fall.)
    this.scarf.mesh.visible = false
    // (Deeper folds: standing, it hung as a flat red rectangle.)
    this.cape.pleats = 0.17
    this.followAvatar()
  }

  /**
   * Swimming, the cape's floor: soaked, it hangs a hand's breadth under the surface, not on it (it lay
   * spread on the water, a red blanket floating with a hood at one end — the body under it unseen).
   * Where the ground under it is the water's surface (within 5 cm), 0.22 m below; a bed above that
   * stays the bed.
   */
  private clothGround: (x: number, z: number) => number = () => -Infinity
  private readonly soakedFloor = (x: number, z: number): number => {
    const g = this.clothGround(x, z)
    const w = this.waterLevel
    return Number.isFinite(w) && g >= w - 0.05 ? w - 0.22 : g
  }

  /** Foot IK's eased state: each foot's height offset to the ground, and the hips' drop. */
  private readonly footOff = [0, 0]
  private hipDrop = 0
  private swimLift = 0

  /**
   * Feet on the ground (the clips are made on the flat): each ankle is moved by how far the ground
   * under it is from the ground under the body; the hips drop as far as the lower foot needs; each
   * leg solved as two bones toward its ankle (the knee kept on the side the clip bent it). On a
   * 0.36 slope, before: a foot 15 cm up, the other's toe 5 cm into the ground; walking across it
   * the lower foot floated up to 33 cm.
   */
  private footIK(dt: number, ground: (x: number, z: number) => number): void {
    const av = this.avatar!
    const on = this.grounded && !this.climbing && !this.swimming && !this.gliding && !this.onBody && !this.hanging ? 1 : 0
    const base = ground(this.obj.position.x, this.obj.position.z)
    const want = [0, 0]
    for (let i = 0; i < 2; i++) {
      const sd = i === 0 ? 'r' : 'l'
      av.bone(`foot_${sd}`)!.getWorldPosition(_p0)
      av.bone(`ball_${sd}`)!.getWorldPosition(_p1)
      // (The higher of heel and toe's ground: a toe must not go in going uphill.)
      const g = Math.max(ground(_p0.x, _p0.z), ground(_p1.x, _p1.z) - 0.04)
      want[i] = THREE.MathUtils.clamp(g - base, -0.45, 0.45) * on
    }
    const k = Math.min(1, dt * 14)
    for (let i = 0; i < 2; i++) this.footOff[i] += (want[i] - this.footOff[i]) * k
    this.hipDrop += (Math.max(0, -Math.min(this.footOff[0], this.footOff[1])) - this.hipDrop) * k
    // Swimming: the upper back held just under the surface (the head and shoulders above it).
    if (this.swimming) {
      av.root.position.y = 0
      av.root.updateMatrixWorld(true)
      // (Head and shoulders out: with the back held at the surface the whole body was under the
      // water — it is not clear — and only the cape showed, floating.)
      const head = av.bone('Head')!.getWorldPosition(_p0).y
      const back = av.bone('spine_03')!.getWorldPosition(_p1).y
      // (The head bone 0.2 m up — the face and hood clear — not 0.3: treading water at 0.3 the arms,
      // out at the shoulders, stood above the surface, a red T floating on the lake.)
      const lift = Math.max(this.waterLevel + 0.2 - head, this.waterLevel - 0.02 - back)
      this.swimLift += (lift - this.swimLift) * Math.min(1, dt * 6)
    } else this.swimLift += (0 - this.swimLift) * Math.min(1, dt * 6)
    av.root.position.y = -this.hipDrop + this.swimLift
    av.root.updateMatrixWorld(true)
    const fwdB = _cf.set(0, 0, 1).applyQuaternion(this.obj.quaternion)
    for (let i = 0; i < 2; i++) {
      const sd = i === 0 ? 'r' : 'l'
      // Only as much as the ground asks: on the flat the clip's leg is left exactly as it is (solved
      // there anyway, a nearly straight leg's bend direction was noise, and the knee went sideways or
      // backward mid-stride — user, 2026-11-05: "knee surgery?").
      const need = Math.abs(this.footOff[i] + this.hipDrop)
      const wIK = THREE.MathUtils.smoothstep(need, 0.01, 0.04)
      if (wIK < 0.001) continue
      const thigh = av.bone(`thigh_${sd}`)!
      const calf = av.bone(`calf_${sd}`)!
      const foot = av.bone(`foot_${sd}`)!
      thigh.getWorldPosition(_p0) // hip
      calf.getWorldPosition(_p1) // knee
      foot.getWorldPosition(_p2) // ankle (as the clip has it, with the hips dropped)
      const l1 = _p0.distanceTo(_p1)
      const l2 = _p1.distanceTo(_p2)
      // The ankle's target: up by the ground's offset and back up by the hips' drop.
      _ra.copy(_p2)
      _ra.y += this.footOff[i] + this.hipDrop
      const d = Math.min(_p0.distanceTo(_ra), (l1 + l2) * 0.999)
      _rb.subVectors(_ra, _p0).normalize() // hip → ankle
      _ra.copy(_p0).addScaledVector(_rb, d) // (reachable)
      // The knee: in the plane of hip, ankle and the clip's knee, at the right distance from each.
      const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
      const h = Math.sqrt(Math.max(0, l1 * l1 - a * a))
      // The knee bends the way the clip bent it — and always forward of the leg's line (a knee
      // never bends backward); nearly straight, the body's forward decides.
      const pole = _p1.clone().sub(_p0)
      pole.addScaledVector(_rb, -pole.dot(_rb))
      if (pole.dot(fwdB) < 0.02 || pole.lengthSq() < 4e-4) pole.copy(fwdB)
      pole.addScaledVector(_rb, -pole.dot(_rb))
      pole.normalize()
      const kneeT = _p0.clone().addScaledVector(_rb, a).addScaledVector(pole, h)
      this.aimBone(thigh, calf, _p0, kneeT, wIK)
      calf.getWorldPosition(_p1)
      this.aimBone(calf, foot, _p1, _ra, wIK)
    }
    // The soles laid on the ground's slope (they stayed flat: on a hillside the toe dug in or the heel
    // floated). Each foot turned by the turn from straight up to the ground's normal under it, as much
    // as it is down (low over the ground) and the ground asks.
    if (on > 0)
      for (let i = 0; i < 2; i++) {
        const foot = av.bone(`foot_${i === 0 ? 'r' : 'l'}`)!
        foot.getWorldPosition(_p0)
        const gy = ground(_p0.x, _p0.z)
        const low = 1 - THREE.MathUtils.smoothstep(_p0.y - gy, 0.12, 0.3)
        if (low < 0.01) continue
        const e = 0.4
        _p1.set(ground(_p0.x - e, _p0.z) - ground(_p0.x + e, _p0.z), 2 * e, ground(_p0.x, _p0.z - e) - ground(_p0.x, _p0.z + e)).normalize()
        if (_p1.y > 0.995) continue
        _rq.setFromUnitVectors(_cu.set(0, 1, 0), _p1)
        _rq.slerp(_rqI, 1 - low * 0.85)
        foot.getWorldQuaternion(_rq2)
        _rq2.premultiply(_rq)
        foot.parent!.getWorldQuaternion(_rq3).invert()
        foot.quaternion.copy(_rq3.multiply(_rq2))
        foot.updateWorldMatrix(false, true)
        // Then the toe: pitched about the ankle until the ball of the foot sits at its height on the
        // flat (3 cm) over the ground under it — never into it.
        const ball = av.bone(`ball_${i === 0 ? 'r' : 'l'}`)!
        ball.getWorldPosition(_p2)
        const want = ground(_p2.x, _p2.z) + 0.03
        const dy = (want - _p2.y) * low
        if (Math.abs(dy) < 0.003) continue
        const toe = _p3.subVectors(_p2, _p0)
        const len = toe.length()
        if (len < 0.05) continue
        const axis = _p4.crossVectors(toe, _cu.set(0, 1, 0)).normalize()
        const ang = Math.asin(THREE.MathUtils.clamp(dy / len, -0.6, 0.6))
        _rq.setFromAxisAngle(axis, ang)
        foot.getWorldQuaternion(_rq2)
        _rq2.premultiply(_rq)
        foot.parent!.getWorldQuaternion(_rq3).invert()
        foot.quaternion.copy(_rq3.multiply(_rq2))
        foot.updateWorldMatrix(false, true)
      }
  }

  /** Climbing on the rig: weight eased in and out. */
  private climbW = 0

  /**
   * A climbing pose for the rigged body (the wall's frame is the body's: forward into the wall, up
   * the wall): hand over hand — one hand reaching high above the head while the other, lower,
   * pulls; the feet stepping up on the diagonal (the right foot with the left hand), knees out; the
   * hips swaying under the hands. Its phase runs only while you climb; holding still holds the reach.
   */
  private climbRig(dt: number): void {
    const av = this.avatar!
    this.climbW += ((this.climbing ? 1 : 0) - this.climbW) * Math.min(1, dt * 10)
    if (this.climbW < 0.01) return
    const w = this.climbW
    const q = this.obj.quaternion
    const fwd = _cf.set(0, 0, 1).applyQuaternion(q)
    const right = _cr.set(-1, 0, 0).applyQuaternion(q)
    const up = _cu.set(0, 1, 0).applyQuaternion(q)
    const ph = this.stride * 1.1
    for (let i = 0; i < 2; i++) {
      const sd = i === 0 ? 'r' : 'l'
      const side = i === 0 ? 1 : -1 // +right
      // Arm: from the shoulder joint, up the wall and a little in toward it.
      const reach = 0.5 + 0.5 * Math.sin(ph + i * Math.PI)
      const sh = av.bone(`upperarm_${sd}`)!.getWorldPosition(_p0)
      const hand = _p1.copy(sh).addScaledVector(up, 0.2 + 0.42 * reach).addScaledVector(right, side * (0.2 - 0.06 * reach)).addScaledVector(fwd, 0.24)
      // (Elbow out to the side and down.)
      const pole = _p2.copy(right).multiplyScalar(side).addScaledVector(up, -0.6)
      this.twoBone(`upperarm_${sd}`, `lowerarm_${sd}`, `hand_${sd}`, hand, pole, w)
      // Leg: on the diagonal with the other arm — up as that hand reaches.
      const step = 0.5 + 0.5 * Math.sin(ph + (1 - i) * Math.PI)
      const hip = av.bone(`thigh_${sd}`)!.getWorldPosition(_p0)
      const foot = _p1.copy(hip).addScaledVector(up, -0.78 + 0.34 * step).addScaledVector(right, side * (0.16 + 0.06 * step)).addScaledVector(fwd, 0.2 + 0.05 * step)
      const kpole = _p2.copy(fwd).addScaledVector(right, side * 0.8)
      this.twoBone(`thigh_${sd}`, `calf_${sd}`, `foot_${sd}`, foot, kpole, w)
    }
  }

  private glideW = 0
  private hangW = 0

  /**
   * Flying and hanging on the rig. Flying: the arms spread wide holding the wing's leading edge out,
   * a little forward, the one on the low side of a bank dipping; the legs trailing together behind.
   * On the line: both hands up on the rope above the head, the legs hanging a little bent.
   */
  private airRig(dt: number): void {
    this.glideW = THREE.MathUtils.clamp(this.glideW + (this.gliding ? 1 : -1) * dt * 2.8, 0, 1)
    this.hangW += ((this.hanging && !this.gliding ? 1 : 0) - this.hangW) * Math.min(1, dt * 8)
    if (this.glideW < 0.01 && this.hangW < 0.01) return
    // (On an S-curve, as the body's lean: eased exponentially the arms' first frame was their biggest.)
    const gw = this.glideW * this.glideW * (3 - 2 * this.glideW)
    const av = this.avatar!
    const q = this.obj.quaternion
    const fwd = _cf.set(0, 0, 1).applyQuaternion(q)
    const right = _cr.set(-1, 0, 0).applyQuaternion(q)
    const up = _cu.set(0, 1, 0).applyQuaternion(q)
    for (let i = 0; i < 2; i++) {
      const sd = i === 0 ? 'r' : 'l'
      const side = i === 0 ? 1 : -1
      if (this.glideW >= 0.01) {
        const sh = av.bone(`upperarm_${sd}`)!.getWorldPosition(_p0)
        const dip = -side * this.bank * 0.25
        // (Holding the wing's leading edge: out to the side, level with the back — in flight that is
        // a little "behind", above the arms' line.)
        const hand = _p1.copy(sh).addScaledVector(right, side * 0.6).addScaledVector(fwd, -0.04).addScaledVector(up, 0.04 + dip)
        this.twoBone(`upperarm_${sd}`, `lowerarm_${sd}`, `hand_${sd}`, hand, _p2.copy(up).addScaledVector(fwd, -0.5), gw)
        const hip = av.bone(`thigh_${sd}`)!.getWorldPosition(_p0)
        const foot = _p1.copy(hip).addScaledVector(up, -0.8).addScaledVector(fwd, -0.22).addScaledVector(right, -side * 0.03)
        this.twoBone(`thigh_${sd}`, `calf_${sd}`, `foot_${sd}`, foot, _p2.copy(fwd), gw)
      }
      if (this.hangW >= 0.01) {
        const head = av.bone('Head')!.getWorldPosition(_p0)
        const hand = _p1.copy(head).addScaledVector(up, 0.42 + i * 0.12).addScaledVector(right, side * 0.04).addScaledVector(fwd, 0.08)
        this.twoBone(`upperarm_${sd}`, `lowerarm_${sd}`, `hand_${sd}`, hand, _p2.copy(right).multiplyScalar(side).addScaledVector(fwd, 0.3), this.hangW)
        const hip = av.bone(`thigh_${sd}`)!.getWorldPosition(_p0)
        const foot = _p1.copy(hip).addScaledVector(up, -0.8).addScaledVector(fwd, i ? 0.12 : -0.05)
        this.twoBone(`thigh_${sd}`, `calf_${sd}`, `foot_${sd}`, foot, _p2.copy(fwd), this.hangW)
      }
    }
  }

  /**
   * Swimming, the feet kept under: the swim clip's kick, with the body lifted for the head, brought the
   * boots up out of the water behind you. A foot above SWIM_FEET under the surface is reached down to
   * it, the knee bending toward the bed.
   */
  private swimLegs(dt: number): void {
    this.swimLegW += ((this.swimming ? 1 : 0) - this.swimLegW) * Math.min(1, dt * 6)
    if (this.swimLegW < 0.01 || !Number.isFinite(this.waterLevel)) return
    const av = this.avatar!
    const limit = this.waterLevel - 0.12
    for (const sd of ['l', 'r']) {
      av.bone(`foot_${sd}`)!.getWorldPosition(_p1)
      if (_p1.y <= limit) continue
      _p1.y = limit
      this.twoBone(`thigh_${sd}`, `calf_${sd}`, `foot_${sd}`, _p1, _p2.set(0, -1, 0), this.swimLegW)
    }
  }

  /** Two-bone IK on the rig: `a`→`b`→`c` reaching `target`, the middle joint toward `pole`. */
  private twoBone(a: string, b: string, c: string, target: THREE.Vector3, pole: THREE.Vector3, w: number): void {
    const av = this.avatar!
    const A = av.bone(a)!
    const B = av.bone(b)!
    const C = av.bone(c)!
    A.updateWorldMatrix(true, true)
    const pa = A.getWorldPosition(_t0)
    const pb = B.getWorldPosition(_t1)
    const pc = C.getWorldPosition(_t2)
    const l1 = pa.distanceTo(pb)
    const l2 = pb.distanceTo(pc)
    const dir = _t3.subVectors(target, pa)
    const d = THREE.MathUtils.clamp(dir.length(), Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999)
    dir.normalize()
    const end = _t4.copy(pa).addScaledVector(dir, d)
    const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    const h = Math.sqrt(Math.max(0, l1 * l1 - x * x))
    const bend = _t5.copy(pole).addScaledVector(dir, -pole.dot(dir))
    if (bend.lengthSq() < 1e-6) bend.set(0, 1, 0)
    bend.normalize()
    const mid = _t6.copy(pa).addScaledVector(dir, x).addScaledVector(bend, h)
    this.aimBone(A, B, pa, mid, w)
    B.getWorldPosition(_t1)
    this.aimBone(B, C, _t1, end, w)
  }

  /** Each foot's height over the ground last frame, and whether it is down (rigged body). */
  private readonly footH = [1, 1]
  private readonly footDown = [true, true]

  /**
   * A step lands when one of the rigged body's feet comes down to the ground (the clips' own
   * footfalls): the sound, the prints and the trail on that beat. (They were timed off the old body's
   * stride, which runs at its own rate: up to 150 ms off the feet you saw, and running, 21 steps
   * heard to 16 taken.)
   */
  private footDowns(ground: (x: number, z: number) => number): void {
    const av = this.avatar!
    const moving = this.grounded && !this.climbing && !this.gliding && !this.swimming && this.speed > 0.6
    for (let i = 0; i < 2; i++) {
      av.bone(`foot_${i === 0 ? 'r' : 'l'}`)!.getWorldPosition(_p0)
      const h = _p0.y - ground(_p0.x, _p0.z)
      // Down below ~13 cm (the ankle sits ~9.6 cm up when planted), up again above ~20.
      if (!this.footDown[i] && h < 0.13) {
        this.footDown[i] = true
        if (moving) this.onStep?.(Math.min(1, this.speed / SPRINT))
      } else if (this.footDown[i] && h > 0.2) this.footDown[i] = false
      this.footH[i] = h
    }
  }

  /** Turn `bone` so the direction to `child` lies along from → to, by `w`. */
  private aimBone(b: THREE.Bone, c: THREE.Bone, from: THREE.Vector3, to: THREE.Vector3, w: number): void {
    b.updateWorldMatrix(true, true)
    const cur = _p3.copy(c.getWorldPosition(_p4)).sub(b.getWorldPosition(_p5)).normalize()
    const want = _p4.subVectors(to, from).normalize()
    _rq.setFromUnitVectors(cur, want)
    if (w < 0.999) _rq.slerp(_rqI, 1 - w)
    b.getWorldQuaternion(_rq2)
    _rq2.premultiply(_rq)
    b.parent!.getWorldQuaternion(_rq3).invert()
    b.quaternion.copy(_rq3.multiply(_rq2))
    b.updateWorldMatrix(false, true)
  }

  /** The cape's and scarf's pins in the rigged body's upper spine space. */
  private readonly capeSpine: THREE.Vector3[] = []
  private readonly scarfSpine: THREE.Vector3[] = []
  /** The cape's pins in the body's own frame at rest, and the upper spine's place then. */
  private readonly capeObj: THREE.Vector3[] = []
  private readonly spineRestObj = new THREE.Vector3()

  /** The tools' hands on the rigged body, right [0] and left [1]. */
  private readonly handAnchor = [new THREE.Group(), new THREE.Group()]
  /** How much the old limbs' pose is put on the rig's (eased): arms, legs. */
  private retargetW = { arms: 0, legs: 0 }

  /**
   * Aim the rig's limbs along the old (hidden, still posed) body's: each bone turned so it points from
   * its joint to the next as the old limb does, weighted. Used where the clips have nothing fitting:
   * a tool in hand (arms), climbing (all four).
   */
  private retarget(dt: number): void {
    const av = this.avatar!
    // (Climbing has its own pose on the rig now — climbRig(); the old one reached forward into the
    // wall at shoulder height, arms splayed: from behind, a T. User: "no climbing pose".)
    const wantArms = this.holding && !this.climbing ? 1 : 0
    const wantLegs = 0
    this.retargetW.arms += (wantArms - this.retargetW.arms) * Math.min(1, dt * 10)
    this.retargetW.legs += (wantLegs - this.retargetW.legs) * Math.min(1, dt * 10)
    const aim = (bone: string, child: string, from: THREE.Vector3, to: THREE.Vector3, w: number) => {
      if (w < 0.01) return
      const b = av.bone(bone)!
      const c = av.bone(child)!
      b.updateWorldMatrix(true, true)
      b.getWorldPosition(_ra)
      c.getWorldPosition(_rb)
      const cur = _rb.sub(_ra).normalize()
      const want = _ra.subVectors(to, from).normalize()
      _rq.setFromUnitVectors(cur, want)
      if (w < 0.999) _rq.slerp(_rqI, 1 - w)
      // World turn → the bone's local: q_local' = parent⁻¹ · turn · world.
      b.getWorldQuaternion(_rq2)
      _rq2.premultiply(_rq)
      b.parent!.getWorldQuaternion(_rq3).invert()
      b.quaternion.copy(_rq3.multiply(_rq2))
      b.updateWorldMatrix(false, true)
    }
    const A = this.arms
    const L = this.legs
    for (let i = 0; i < 2; i++) {
      const sd = i === 0 ? 'r' : 'l'
      if (this.retargetW.arms > 0.01) {
        A[i].shoulder.getWorldPosition(_p0)
        A[i].elbow.getWorldPosition(_p1)
        A[i].elbow.localToWorld(_p2.set(0, -0.3, 0))
        aim(`upperarm_${sd}`, `lowerarm_${sd}`, _p0, _p1, this.retargetW.arms)
        aim(`lowerarm_${sd}`, `hand_${sd}`, _p1, _p2, this.retargetW.arms)
      }
      if (this.retargetW.legs > 0.01) {
        const sl = i === 0 ? 'r' : 'l'
        // (Old legs: [0] is the −x side, the body's right.)
        L[i].hip.getWorldPosition(_p0)
        L[i].knee.getWorldPosition(_p1)
        L[i].knee.localToWorld(_p2.set(0, -0.44, 0))
        aim(`thigh_${sl}`, `calf_${sl}`, _p0, _p1, this.retargetW.legs)
        aim(`calf_${sl}`, `foot_${sl}`, _p1, _p2, this.retargetW.legs)
      }
    }
  }

  private followAvatar(): void {
    const av = this.avatar!
    av.root.updateMatrixWorld(true)
    const objInv = _m4.copy(this.obj.matrixWorld).invert()
    const set = (a: THREE.Group, bone: string, off: THREE.Matrix4) => {
      a.matrix.copy(objInv).multiply(av.bone(bone)!.matrixWorld).multiply(off)
      a.matrixWorldNeedsUpdate = true
    }
    set(this.chestAnchor, 'spine_03', this.anchorOff.chest)
    set(this.pelvisAnchor, 'pelvis', this.anchorOff.pelvis)
    set(this.neckAnchor, 'spine_03', this.anchorOff.neck)
    if (this.anchorOff.face) set(this.faceAnchor, 'Head', this.anchorOff.face)
    // The hands: at the rig's hand, turned as the old hand is.
    for (let i = 0; i < 2; i++) {
      const hb = av.bone(i === 0 ? 'hand_r' : 'hand_l')!
      hb.getWorldPosition(_p0)
      const oldHand = this.arms[i].elbow.children[0]
      oldHand.getWorldQuaternion(_rq)
      const a = this.handAnchor[i]
      a.matrix.compose(_p0, _rq, _one).premultiply(objInv)
      a.matrixWorldNeedsUpdate = true
    }
    this.obj.updateMatrixWorld(true)
  }

  /**
   * Animate the body and its cloth for this frame: the stride from the speed,
   * arms swinging, breathing; reaching and pulling when climbing; the cape and
   * scarf in the `wind` (an acceleration, m/s²). `dark` (0 … 1) brightens the lantern.
   */
  /**
   * Feet that stay where they are put (QA cycle 5, the user's "walking looks like sliding"; measured
   * at the sole: a planted foot slid at ~20% of the body's speed in every gait, and sank up to
   * 10 cm into the ground). Each foot, when it lands, is pinned to the ground where it came down;
   * while it is planted the hip and knee are solved (two bones, in the leg's own plane) to keep the
   * ankle on the pin; it eases in at the landing and out before lift-off, so the swing hands over
   * without a pop. Only walking and running on open ground.
   */
  private plantFeet(ground: (x: number, z: number) => number): void {
    const onFoot = this.grounded && !this.climbing && !this.swimming && !this.gliding && !this.sliding && !this.sledding && !this.onBody
    if (!onFoot || this.speed < 0.4 || this.stunned > 0 || this.landK > 0.05) {
      this.footLock[0] = this.footLock[1] = null
      return
    }
    this.obj.updateMatrixWorld(true)
    const L1 = 0.44
    const L2 = 0.44
    for (let i = 0; i < 2; i++) {
      const t = this.stance[i]
      const leg = this.legs[i]
      if (t < 0) {
        this.footLock[i] = null
        continue
      }
      // The ankle now (the pose as swung), and its pin: where it came down, at the ground.
      leg.knee.localToWorld(_ikA.set(0, -L2, 0))
      if (!this.footLock[i]) this.footLock[i] = new THREE.Vector3(_ikA.x, ground(_ikA.x, _ikA.z) + 0.055, _ikA.z)
      const pin = this.footLock[i]!
      // The pin in the hip's own frame (its parent's space, from the hip joint).
      const parent = leg.hip.parent!
      parent.worldToLocal(_ikB.copy(pin)).sub(leg.hip.position)
      const tx = _ikB.x
      const ty = _ikB.y
      const tz = _ikB.z
      // Sideways first: the hips twist as you walk and swing each hip out over its foot (left
      // unsolved, the ankle missed its pin by that much — 5–8 cm — and still slid). The hip rolls
      // out to it; the rest is solved in the plane the leg then swings in, its bones shortened by
      // the roll.
      const roll = Math.asin(THREE.MathUtils.clamp(tx / Math.max(0.12, Math.hypot(tx, ty, tz)), -0.5, 0.5))
      const cr = Math.cos(roll)
      const l1 = L1 * cr
      const l2 = L2 * cr
      // (Out of reach, the leg straightens toward the pin: it is not let go — let go, the next
      // frame pinned it again wherever the ankle had slid to, and the foot slid all the same.)
      const d = THREE.MathUtils.clamp(Math.hypot(ty, tz), 0.12, (l1 + l2) * 0.999)
      const aim = Math.atan2(-tz, -ty)
      const knee = Math.PI - Math.acos(THREE.MathUtils.clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1))
      const off = Math.acos(THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1))
      // In at the landing, out before the lift.
      // (Eased over the first and last fifth of the stance: over a tenth, linear, the leg was thrown
      // between its swing and its pin in two or three frames.)
      const w = THREE.MathUtils.smoothstep(t, 0, 0.18) * (1 - THREE.MathUtils.smoothstep(t, 0.82, 1))
      leg.hip.rotation.x += (aim - off - leg.hip.rotation.x) * w
      leg.hip.rotation.z += (roll - leg.hip.rotation.z) * w
      leg.knee.rotation.x += (knee - leg.knee.rotation.x) * w
    }
  }

  /**
   * The pose as worked out this frame, eased toward from last frame's (~30 ms): whatever the pose
   * code does — a state changing, a blend starting — no joint jumps in a single frame. (User,
   * 2026-11-05: "its not smooth in animations"; measured, the limbs snapped in a third of the
   * frames of a run.) Big state changes (a teleport, taking hold) settle within ~0.1 s.
   */
  private smoothPose(dt: number): void {
    const k = 1 - Math.exp(-Math.max(dt, 0) / 0.03)
    const js = this.poseJoints
    const prev = this.posePrev
    if (prev.length !== js.length * 3) {
      prev.length = 0
      for (const o of js) prev.push(o.rotation.x, o.rotation.y, o.rotation.z)
      this.posePelvisY = this.pelvis.position.y
      return
    }
    js.forEach((o, i) => {
      const r = o.rotation
      r.x = prev[i * 3] += (r.x - prev[i * 3]) * k
      r.y = prev[i * 3 + 1] += (r.y - prev[i * 3 + 1]) * k
      r.z = prev[i * 3 + 2] += (r.z - prev[i * 3 + 2]) * k
    })
    this.pelvis.position.y = this.posePelvisY += (this.pelvis.position.y - this.posePelvisY) * k
  }
  private readonly posePrev: number[] = []
  private posePelvisY = 0.92
  private get poseJoints(): THREE.Object3D[] {
    if (!this._poseJoints) this._poseJoints = [this.pelvis, this.chest, this.head, ...this.legs.flatMap((l) => [l.hip, l.knee]), ...this.arms.flatMap((a) => [a.shoulder, a.elbow])]
    return this._poseJoints
  }
  private _poseJoints: THREE.Object3D[] | null = null

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
    // (Eased: the speed changes on the 60 Hz simulation steps — at 120 Hz the stride, and the lantern
    // swinging on it, moved in a staircase.)
    this.hsS += ((this.climbing ? 0 : this.speed) - this.hsS) * Math.min(1, dt * 14)
    const hs = this.hsS
    this.gait += (Math.min(1.6, hs / WALK) - this.gait) * Math.min(1, dt * 6)
    // The stride keeps the planted foot still on the ground (user: "walking looks like
    // sliding"): the foot under you sweeps back at LEG · swing · (dφ/dt), and that must be
    // the ground going by. Past a sprint the stride lengthens rather than quickens.
    const over = THREE.MathUtils.clamp((hs - SPRINT) / (LONG - SPRINT), 0, 1)
    const swingAmp = 0.7 + 0.15 * Math.max(0, this.gait - 1) / 0.6 + 0.25 * over
    this.swingAmp = swingAmp
    // The foot on the ground is down for a fraction of each leg's cycle: half at a walk, a third
    // at a full run (the rest of the stride is in the air). While down it sweeps back at a steady
    // rate, so the cadence that keeps it still on the ground is π·f·speed / (LEG · sin amp).
    // (Timed off a sine, at a run the planted foot slid at half the body's speed.)
    const runK = Math.max(0, this.gait - 1) / 0.6
    this.stanceF = 0.5 - 0.17 * runK
    const ampNow = swingAmp * Math.max(0.3, Math.min(1, this.gait))
    this.stride += (this.climbing ? this.climbMoving * 2.4 : Math.min(24, (Math.PI * this.stanceF * hs) / (LEG * Math.sin(ampNow)))) * dt
    const s = this.stride
    // A foot comes down each half stride (on the ground, walking).
    const half = Math.floor(s / Math.PI)
    if (half !== this.lastHalf) {
      this.lastHalf = half
      // (On the rigged body, its own feet say when a step lands: footDowns(), after it is posed.)
      if (!this.avatar && !this.climbing && this.grounded && !this.gliding && hs > 0.6) this.onStep?.(Math.min(1, hs / SPRINT))
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
    const onFoot = this.grounded && !this.climbing && !this.swimming && !this.gliding && !this.sliding && !this.sledding
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
      // On the line: both hands up on the rope, legs hanging a little bent.
      if (this.hanging) {
        A[0].shoulder.rotation.set(-2.75, 0, -0.12)
        A[1].shoulder.rotation.set(-2.85, 0, 0.12)
        A[0].elbow.rotation.x = -0.35
        A[1].elbow.rotation.x = -0.2
        L[0].hip.rotation.x = -0.25
        L[1].hip.rotation.x = 0.1
        L[0].knee.rotation.x = 0.5
        L[1].knee.rotation.x = 0.3
        this.chest.rotation.x = -0.05
        this.head.rotation.x = -0.35
      }
      // A running leap (not a long fall): a stride held in the air — the lead knee driven up,
      // the trail leg stretched back, the arms opposite, leaning into it; reaching the lead
      // foot down for the ground as you come down.
      const leap = this.hanging ? 0 : THREE.MathUtils.clamp(Math.hypot(this.vel.x, this.vel.z) / SPRINT, 0, 1) * (1 - fall)
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
        // This leg's place in its cycle, u in [0, 1): planted from 0.5 − f/2 to 0.5 + f/2
        // (lands forward, sweeps back at a steady rate), in the air the rest of the way round.
        const f = this.stanceF
        const u = (((s + i * Math.PI) / (Math.PI * 2)) % 1 + 1) % 1
        const st0 = 0.5 - f / 2
        let n: number // the leg's angle, −1 (back) … 1 (forward)
        let c: number // > 0 in the air (peaking mid-swing), < 0 planted
        let kneeCarry = 0
        if (u >= st0 && u < st0 + f) {
          const t = (u - st0) / f
          n = 1 - 2 * t
          c = -Math.sin(Math.PI * t)
          this.stance[i] = t
        } else {
          this.stance[i] = -1
          const v = ((u - (st0 + f) + 1) % 1) / (1 - f)
          // Back to front through the air on a curve that leaves and meets the ground's sweep at its
          // own rate (it was a cosine, still at both ends: the leg stopped dead at lift-off and set off
          // at full sweep on landing — twice a step a jolt, the snap you saw in every stride).
          // Cubic Hermite from −1 to 1, both ends at the stance's rate (−2/f per cycle, here per v).
          const m = (-2 * (1 - f)) / f
          const v2 = v * v
          const v3 = v2 * v
          n = (2 * v3 - 3 * v2 + 1) * -1 + (v3 - 2 * v2 + v) * m + (-2 * v3 + 3 * v2) * 1 + (v3 - v2) * m
          c = Math.sin(Math.PI * v)
          // (The knee planted carries its little bend on into the lift — it was dropped to straight
          // in one frame.)
          kneeCarry = (1 - THREE.MathUtils.smoothstep(v, 0, 0.35)) * 0.12 * (1 + run)
        }
        const swing = n * this.swingAmp * go
        // Forward through the air the knee folds — high and quick at a run, the heel kicked
        // up behind; planted it stays nearly straight, softening a little as the weight comes on.
        const lift = c > 0 ? Math.sin(Math.min(Math.PI, c * Math.PI * 0.9)) : 0
        const fold = c > 0 ? c * (0.5 + run * 0.5) + lift * (0.25 + run * 0.75) + kneeCarry : Math.max(0, -n) * 0.12 * (1 + run)
        L[i].hip.rotation.x = -swing - (c > 0 ? lift * run * 0.25 : 0)
        // (Running, the leg reaching forward stays bent at the knee — kicked out straight it
        // read as a goose-step.)
        L[i].knee.rotation.x = (fold + run * 0.45 * Math.max(0, n)) * go + 0.04
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
      if (this.sliding || this.sledding) {
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
      this.pelvis.position.y = 0.92 - drop * 0.85 + bound + breathe - (this.sliding ? 0.24 : this.sledding ? 0.5 : 0)
      // The lean also answers the change of speed: into it as you set off, back against it as you
      // brake (QA cycle 6 — it hung off the speed alone, so a hard stop and a steady run looked alike).
      if (dt > 0) {
        const acc = (hs - this.leanSpeed) / dt
        this.leanSpeed = hs
        this.leanAcc += (THREE.MathUtils.clamp(acc, -25, 25) - this.leanAcc) * Math.min(1, dt * 6)
      }
      const surge = this.grounded ? THREE.MathUtils.clamp(this.leanAcc * 0.012, -0.22, 0.12) : 0
      this.chest.rotation.x = this.sledding ? -0.42 : this.sliding ? -0.25 : 0.07 * Math.min(1, g) + run * 0.2 + over * 0.06 + surge + 0.55 * this.scrambleLean
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
      // (The rigged body's own stride: one clip cycle is two steps, as one turn of the old stride.)
      const stride = this.avatar ? this.avatar.stride * Math.PI * 2 : this.stride
      const go = this.grounded && !this.climbing && !this.swimming ? Math.min(1, this.gait) : 0
      const swing = Math.sin(stride - 0.7) * (0.22 + 0.18 * run) * go
      this.lanternHook.rotation.x += (swing - this.lanternHook.rotation.x) * Math.min(1, dt * 10)
      const out = THREE.MathUtils.clamp(-this.bodyRoll * 1.4, -0.4, 0.4) + Math.cos(stride) * 0.06 * go
      this.lanternHook.rotation.z += (out - this.lanternHook.rotation.z) * Math.min(1, dt * 6)
      // The satchel bumps against the hip with each step.
      const bag = this.bagParts[1]
      if (bag) {
        // (sin², not |sin|: its sharp bottom snapped the bag twice a stride.)
        bag.position.y = -0.12 + Math.sin(stride) ** 2 * 0.018 * go * (1 + run)
        bag.rotation.z = 0.1 + Math.sin(stride + 0.5) * 0.08 * go
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

    this.smoothPose(dt)
    if (this.avatar) {
      this.obj.updateMatrixWorld(true)
      const mode = this.climbing ? 'climb' : this.gliding ? 'glide' : this.sliding || this.sledding ? 'slide' : this.hanging ? 'hang' : 'ground'
      this.avatar.update(dt, { speed: this.climbing ? 0 : this.speed, grounded: this.grounded || this.onBody, swimming: this.swimming, vy: this.vel.y, mode, take: this.takeT >= 0 ? this.takeT / 1.3 : -1, climbRate: Math.min(1, this.climbMoving) })
      this.retarget(dt)
      this.climbRig(dt)
      this.airRig(dt)
      this.swimLegs(dt)
      this.footIK(dt, ground)
      this.footDowns(ground)
      this.followAvatar()
    }
    // The cloth, in the world: pinned at the shoulders (with the chest's lean).
    this.obj.updateMatrixWorld(true)
    const m = this.obj.matrixWorld
    const cm = (this.avatar ? this.chestAnchor : this.chest).matrixWorld
    if (this.avatar && this.capeSpine.length) {
      // The pins follow the upper spine's place and lean, but only a quarter of its twist: the run
      // clip twists the spine hard each stride, and pinned to it the cape's top swung and the long
      // cloth whipped from side to side, bunching over the shoulders (seen from the game's camera).
      const spB = this.avatar.bone('spine_03')!
      const sm = spB.matrixWorld
      const objM = this.obj.matrixWorld
      spB.getWorldPosition(_p3).applyMatrix4(_m4.copy(objM).invert()).sub(this.spineRestObj)
      this.capeSpine.forEach((a, i) => {
        const full = _p4.copy(a).applyMatrix4(sm)
        const calm = _p5.copy(this.capeObj[i]).add(_p3).applyMatrix4(objM)
        this.capePins[i].copy(calm).lerp(full, 0.3)
      })
      this.scarfSpine.forEach((a, i) => this.scarfPins[i].copy(a).applyMatrix4(sm))
    } else {
      this.capeChest.forEach((a, i) => this.capePins[i].copy(a).applyMatrix4(cm))
      this.scarfChest.forEach((a, i) => this.scarfPins[i].copy(a).applyMatrix4(cm))
    }
    this.hangDir.set(0, -1, -0.15).transformDirection(m)
    // The body's capsule, pelvis to chest, a little fatter than the body. (It must end below
    // the pins: a cap above them pushed the scarf's first links upward and it stood on end.)
    if (this.avatar) {
      // The rigged body's own trunk: pelvis to upper spine (it leans and twists with the clips).
      this.avatar.bone('pelvis')!.getWorldPosition(this.axisA)
      this.avatar.bone('spine_03')!.getWorldPosition(this.axisB)
    } else {
      this.axisA.set(0, 0.55, 0).applyMatrix4(m)
      this.axisB.set(0, 1.26, -0.02).applyMatrix4(m)
    }
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
    this.plantFeet(ground)
    // The legs, as the cloth sees them (thigh and shin each): it falls round them, not through.
    for (let i = 0; i < 2; i++) {
      const L = this.legs[i]
      const c = this.legCaps
      const av = this.avatar
      if (av) {
        const side = i ? 'l' : 'r'
        av.bone(`thigh_${side}`)!.getWorldPosition(c[i * 2].a)
        av.bone(`calf_${side}`)!.getWorldPosition(c[i * 2].b)
        c[i * 2 + 1].a.copy(c[i * 2].b)
        av.bone(`foot_${side}`)!.getWorldPosition(c[i * 2 + 1].b)
        // (And the arms: the cape, wrapped further round the shoulders, hung over them, and a sleeve
        // and bracer stood out through the middle of it.)
        const A = this.limbCaps
        av.bone(`upperarm_${side}`)!.getWorldPosition(A[4 + i * 2].a)
        av.bone(`lowerarm_${side}`)!.getWorldPosition(A[4 + i * 2].b)
        A[5 + i * 2].a.copy(A[4 + i * 2].b)
        av.bone(`hand_${side}`)!.getWorldPosition(A[5 + i * 2].b)
        continue
      }
      L.hip.getWorldPosition(c[i * 2].a)
      L.knee.getWorldPosition(c[i * 2].b)
      c[i * 2 + 1].a.copy(c[i * 2].b)
      c[i * 2 + 1].b.set(0, -0.44, 0)
      L.knee.localToWorld(c[i * 2 + 1].b)
    }
    this.cape.water = this.scarf.water = this.swimming
    // (Falling or gliding, the air may lift it; otherwise no higher than the shoulders.)
    // (Never up through the hood: falling fast it stood straight up out of the head, a red spike
    // — user, 2026-11-05. Gliding the wing carries it; otherwise at most a little over the shoulders.)
    this.cape.ceil = this.gliding ? Infinity : this.vel.y < -6 ? 0.15 : 0.1
    this.clothGround = ground
    this.cape.step(dt, this.capePins, this.hangDir, this.windV, this.axisA, this.axisB, this.avatar ? 0.2 : 0.23, this.swimming ? this.soakedFloor : ground, this.avatar ? this.limbCaps : this.legCaps)
    this.windV.multiplyScalar(1.25)
    // (The scarf too: falling, and in the water, it stood up over the hood like a red stalk.)
    this.scarf.ceil = this.gliding ? Infinity : 0.05
    this.scarf.step(dt, this.scarfPins, this.hangDir, this.windV, this.axisA, this.axisB, 0.2, ground)

    // The lantern: brighter in the dark, a slow flicker.
    const flicker = 0.9 + 0.1 * Math.sin(this.t * 11) * Math.sin(this.t * 7.3)
    // It comes up by itself as the dark comes on (and is all but out by day).
    this.lanternOn += (Math.max(0, (dark - 0.25) / 0.75) - this.lanternOn) * Math.min(1, dt * 0.8)
    // …and against the light: looking toward the sun the cloak went near-black on the bright beach
    // (QA cycle 7). The red keeps a faint glow of its own as the view turns into the sun.
    this.redCloth.emissiveIntensity = Math.max(0.16 * this.lanternOn, 0.5 * this.backlit)
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
