// The shapes of the rock formations (./rocks.ts): signed distance fields
// built from rounded primitives, blended and carved, displaced by noise; and
// surface nets to mesh them. No three.js here: the worker (./rocks-worker.ts)
// meshes with it, and the main thread uses the same fields for collision.

import { makeSimplex2, mulberry32, type Noise2, type RegionName } from '@titans/shared'

export type FormationKind = 'arch' | 'cave' | 'hoodoo' | 'overhang' | 'spire' | 'boulders'
/** The colossi: the First Ones' remains and works, hundreds of metres across. */
export type ColossusKind = 'sentinel' | 'ribcage' | 'skull' | 'sword' | 'monolith' | 'trunk' | 'reclining' | 'husk' | 'mourner' | 'head'
export type ShapeKind = FormationKind | ColossusKind
type THREE3 = [number, number, number]

/** Signed distance (negative inside) at a local point. */
export type Field = (x: number, y: number, z: number) => number

const noises = new Map<number, Noise2>()
function noiseFor(worldSeed: number): Noise2 {
  let n = noises.get(worldSeed)
  if (!n) noises.set(worldSeed, (n = makeSimplex2(worldSeed + 8181)))
  return n
}

// --- distance functions ---------------------------------------------------------

const len3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z)
/** Ellipsoid (approximate, good enough for blobs). */
const ellipsoid = (x: number, y: number, z: number, a: number, b: number, c: number) => {
  const k0 = len3(x / a, y / b, z / c)
  const k1 = len3(x / (a * a), y / (b * b), z / (c * c))
  return (k0 * (k0 - 1)) / (k1 || 1e-6)
}
/** Capsule from (0,0,0) to (0,h,0). */
const pillar = (x: number, y: number, z: number, h: number, r: number) => len3(x, y - Math.max(0, Math.min(h, y)), z) - r
const torus = (x: number, y: number, z: number, R: number, r: number) => Math.hypot(Math.hypot(x, y) - R, z) - r
const roundBox = (x: number, y: number, z: number, bx: number, by: number, bz: number, r: number) => {
  const qx = Math.abs(x) - bx + r
  const qy = Math.abs(y) - by + r
  const qz = Math.abs(z) - bz + r
  return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r
}
/** Smooth union and smooth subtraction (polynomial). */
const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}
const ssub = (a: number, b: number, k: number) => -smin(-a, b, k)

// --- formations -----------------------------------------------------------------

/** A formation's shape: its field (local metres, y up from the ground) and local bounds. */
export interface Shape {
  field: Field
  /** Where crowns of leaves sit (a giant tree's limb ends), in local metres. */
  tips?: Array<[number, number, number]>
  /** Bounding box half-extents and centre height. */
  hx: number
  hy: number
  hz: number
  cy: number
}

/** Build a formation's shape from its kind and own seed (the same on any thread). */
export function make(kind: ShapeKind, seed: number, worldSeed: number): Shape {
  const rand = mulberry32(seed)
  const n = noiseFor(worldSeed)
  if (isColossus(kind)) return colossus(kind, rand, n)
  // Rock grain: noise on three planes, at two scales.
  const grain = (x: number, y: number, z: number, amp: number) =>
    amp * (0.6 * (n(x * 0.06, y * 0.06) + n(y * 0.06 + 3.3, z * 0.06) + n(z * 0.06 - 5.1, x * 0.06)) / 3 + 0.4 * (n(x * 0.21, z * 0.21 + y * 0.1) + n(y * 0.23, x * 0.19)) / 2)
  if (kind === 'arch') {
    const R = 18 + rand() * 14
    const r = 4.5 + rand() * 3
    const lean = (rand() - 0.5) * 0.25
    return {
      field: (x, y, z) => {
        // A thick ring standing on edge, sunk in the ground, with buttressed feet.
        let d = torus(x, y - 2, z + y * lean, R, r * (1 + 0.25 * (1 - Math.min(1, y / R))))
        d = smin(d, ellipsoid(x - R, y, z, r * 2.2, r * 1.6, r * 2.4), 6)
        d = smin(d, ellipsoid(x + R, y, z, r * 2.2, r * 1.6, r * 2.4), 6)
        return Math.max(d, -(y + 6)) + grain(x, y, z, 2.2)
      },
      hx: R + r * 3,
      hy: (R + r * 2 + 8) / 2,
      hz: r * 3 + 4,
      cy: (R + r * 2 - 8) / 2,
    }
  }
  if (kind === 'cave') {
    const A = 38 + rand() * 18
    const B = 22 + rand() * 12
    const C = 32 + rand() * 14
    const tunnel = 6 + rand() * 2
    const bend = (rand() - 0.5) * 0.5
    return {
      field: (x, y, z) => {
        // A great dome of rock; a tunnel winds through it, opening into a chamber.
        let d = ellipsoid(x, y + 6, z, A, B, C)
        d = smin(d, ellipsoid(x - A * 0.4, y + 2, z + C * 0.3, A * 0.55, B * 0.8, C * 0.5), 10)
        const tx = x - z * bend
        const tun = Math.hypot(tx, Math.max(0, y - 1) * 1.25 + Math.min(0, y - 1) * 3) - tunnel
        d = ssub(d, tun, 4)
        d = ssub(d, ellipsoid(x, y - B * 0.35, z, A * 0.38, B * 0.45, C * 0.35), 6)
        return Math.max(d, -(y + 8)) + grain(x, y, z, 2.6)
      },
      hx: A + 12,
      hy: (B + 14) / 2,
      hz: C + 12,
      cy: (B - 14) / 2,
    }
  }
  if (kind === 'hoodoo') {
    const h = 14 + rand() * 16
    const r = 2.6 + rand() * 1.8
    const cap = r * (1.8 + rand() * 0.8)
    return {
      field: (x, y, z) => {
        let d = pillar(x, y, z, h, r * (1 + 0.35 * Math.max(0, 1 - y / h)))
        d = smin(d, ellipsoid(x, y - h - cap * 0.3, z, cap, cap * 0.55, cap * 0.9), 2)
        d = smin(d, ellipsoid(x, y + 2, z, r * 3, r * 1.4, r * 3), 3)
        return Math.max(d, -(y + 4)) + grain(x, y, z, 1.1)
      },
      hx: cap + 6,
      hy: (h + cap + 6) / 2,
      hz: cap + 6,
      cy: (h + cap - 6) / 2,
    }
  }
  if (kind === 'overhang') {
    const w = 18 + rand() * 12
    const reach = 14 + rand() * 8
    const lift = 7 + rand() * 6
    return {
      field: (x, y, z) => {
        // A slab of rock jutting out from a mound: shelter underneath.
        let d = ellipsoid(x, y + 2, z + reach * 0.6, w * 0.9, lift + 6, reach * 0.8)
        d = smin(d, roundBox(x, y - lift - 2.5, z - reach * 0.15, w * 0.7, 2.6, reach * 0.75, 1.5), 4)
        return Math.max(d, -(y + 5)) + grain(x, y, z, 1.6)
      },
      hx: w + 6,
      hy: (lift + 14) / 2,
      hz: reach * 1.6 + 6,
      cy: (lift + 4) / 2,
    }
  }
  if (kind === 'spire') {
    const h = 40 + rand() * 45
    const r = 7 + rand() * 6
    return {
      field: (x, y, z) => {
        const k = Math.max(0, Math.min(1, y / h))
        let d = pillar(x + Math.sin(y * 0.05) * 2, y, z, h, r * (1.25 - 0.85 * k))
        d = smin(d, ellipsoid(x, y + 3, z, r * 2.4, r * 1.2, r * 2.4), 5)
        return Math.max(d, -(y + 5)) + grain(x, y, z, 2)
      },
      hx: r * 2.6 + 4,
      hy: (h + 12) / 2,
      hz: r * 2.6 + 4,
      cy: (h - 6) / 2,
    }
  }
  // Boulders: a heap of great rounded stones.
  const stones: Array<[number, number, number, number]> = []
  const count = 4 + Math.floor(rand() * 4)
  for (let i = 0; i < count; i++) {
    const r = 3 + rand() * 5
    const a = rand() * Math.PI * 2
    const dist = rand() * 9
    stones.push([Math.cos(a) * dist, r * 0.55 + (i > 3 ? 4 : 0), Math.sin(a) * dist, r])
  }
  return {
    field: (x, y, z) => {
      let d = Infinity
      for (const [sx, sy, sz, r] of stones) d = smin(d, ellipsoid(x - sx, y - sy, z - sz, r, r * 0.8, r * 0.95), 1.2)
      return Math.max(d, -(y + 3)) + grain(x, y, z, 0.9)
    },
    hx: 20,
    hy: 10,
    hz: 20,
    cy: 6,
  }
}

/** What each land holds, and how many. */
export const PLAN: Record<RegionName, Array<[FormationKind, number]>> = {
  // The Green is meant to be empty: a few stones, one arch far out on the grass.
  valley: [
    ['boulders', 5],
    ['arch', 1],
  ],
  // The lands are ~7× the area they were, with not quite twice the rock: room between.
  forest: [
    ['boulders', 18],
    ['overhang', 8],
    ['cave', 3],
    ['arch', 2],
  ],
  desert: [
    ['arch', 9],
    ['hoodoo', 20],
    ['spire', 8],
    ['cave', 3],
    ['boulders', 8],
  ],
  // The Mire: a few half-sunk boulders, nothing high.
  mire: [['boulders', 8]],
  ruins: [
    ['spire', 7],
    ['arch', 3],
    ['overhang', 5],
    ['cave', 2],
    ['boulders', 10],
  ],
}

// --- meshing --------------------------------------------------------------------

/**
 * Surface nets: one vertex per cell the surface passes through (the mean of
 * its edge crossings), a quad for every grid edge with a sign change.
 */
function surfaceNets(f: Field, x0: number, y0: number, z0: number, nx: number, ny: number, nz: number, s: number): { pos: number[]; index: number[] } {
  const V = new Float32Array((nx + 1) * (ny + 1) * (nz + 1))
  const id = (i: number, j: number, k: number) => (k * (ny + 1) + j) * (nx + 1) + i
  for (let k = 0; k <= nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) V[id(i, j, k)] = f(x0 + i * s, y0 + j * s, z0 + k * s)
  const cellVert = new Int32Array(nx * ny * nz).fill(-1)
  const cid = (i: number, j: number, k: number) => (k * ny + j) * nx + i
  const pos: number[] = []
  const corners = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
  ]
  const edges = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ]
  const val = new Float32Array(8)
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let mask = 0
        for (let c = 0; c < 8; c++) {
          val[c] = V[id(i + corners[c][0], j + corners[c][1], k + corners[c][2])]
          if (val[c] < 0) mask |= 1 << c
        }
        if (mask === 0 || mask === 255) continue
        let ax = 0
        let ay = 0
        let az = 0
        let cnt = 0
        for (const [a, b] of edges) {
          if (val[a] < 0 === val[b] < 0) continue
          const t = val[a] / (val[a] - val[b])
          ax += corners[a][0] + (corners[b][0] - corners[a][0]) * t
          ay += corners[a][1] + (corners[b][1] - corners[a][1]) * t
          az += corners[a][2] + (corners[b][2] - corners[a][2]) * t
          cnt++
        }
        cellVert[cid(i, j, k)] = pos.length / 3
        pos.push(x0 + (i + ax / cnt) * s, y0 + (j + ay / cnt) * s, z0 + (k + az / cnt) * s)
      }
    }
  }
  const index: number[] = []
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return
    if (flip) index.push(a, c, b, a, d, c)
    else index.push(a, b, c, a, c, d)
  }
  for (let k = 1; k < nz; k++) {
    for (let j = 1; j < ny; j++) {
      for (let i = 1; i < nx; i++) {
        const inside = V[id(i, j, k)] < 0
        // Edge along x from (i,j,k): the four cells around it share the face.
        if (inside !== V[id(i + 1, j, k)] < 0)
          quad(cellVert[cid(i, j - 1, k - 1)], cellVert[cid(i, j, k - 1)], cellVert[cid(i, j, k)], cellVert[cid(i, j - 1, k)], inside)
        if (inside !== V[id(i, j + 1, k)] < 0)
          quad(cellVert[cid(i - 1, j, k - 1)], cellVert[cid(i - 1, j, k)], cellVert[cid(i, j, k)], cellVert[cid(i, j, k - 1)], inside)
        if (inside !== V[id(i, j, k + 1)] < 0)
          quad(cellVert[cid(i - 1, j - 1, k)], cellVert[cid(i, j - 1, k)], cellVert[cid(i, j, k)], cellVert[cid(i - 1, j, k)], inside)
      }
    }
  }
  return { pos, index }
}

/** Mesh arrays for one formation (transferable from a worker). */
export interface RockMesh {
  position: Float32Array
  normal: Float32Array
  /** Occlusion, 0 … 1. */
  ao: Float32Array
  index: Uint32Array
}

/**
 * Mesh a shape: surface nets over its bounds; normals from the field's
 * gradient (smooth, always outward), each triangle wound to face along them;
 * occlusion from how much rock lies just outside each vertex.
 */
export function meshShape(sh: Shape, res = 64): RockMesh {
  const f = sh.field
  const span = Math.max(sh.hx, sh.hy, sh.hz) * 2
  const s = Math.max(0.9, span / res)
  const nx = Math.ceil((sh.hx * 2) / s) + 2
  const ny = Math.ceil((sh.hy * 2) / s) + 2
  const nz = Math.ceil((sh.hz * 2) / s) + 2
  const { pos, index } = surfaceNets(f, -sh.hx - s, sh.cy - sh.hy - s, -sh.hz - s, nx, ny, nz, s)
  const count = pos.length / 3
  const normal = new Float32Array(count * 3)
  const ao = new Float32Array(count)
  const e = s * 0.25
  for (let i = 0; i < count; i++) {
    const x = pos[i * 3]
    const y = pos[i * 3 + 1]
    const z = pos[i * 3 + 2]
    const gx = f(x + e, y, z) - f(x - e, y, z)
    const gy = f(x, y + e, z) - f(x, y - e, z)
    const gz = f(x, y, z + e) - f(x, y, z - e)
    const gl = Math.hypot(gx, gy, gz) || 1
    normal[i * 3] = gx / gl
    normal[i * 3 + 1] = gy / gl
    normal[i * 3 + 2] = gz / gl
    let occ = 0
    for (const t of [1.5 * s, 4 * s, 9 * s]) occ += Math.max(0, t - f(x + (gx / gl) * t, y + (gy / gl) * t, z + (gz / gl) * t)) / t
    ao[i] = Math.max(0.25, 1 - occ * 0.42)
  }
  // Wind every triangle to face the way its corners' normals do.
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t] * 3
    const b = index[t + 1] * 3
    const c = index[t + 2] * 3
    const ux = pos[b] - pos[a]
    const uy = pos[b + 1] - pos[a + 1]
    const uz = pos[b + 2] - pos[a + 2]
    const vx = pos[c] - pos[a]
    const vy = pos[c + 1] - pos[a + 1]
    const vz = pos[c + 2] - pos[a + 2]
    const fx = uy * vz - uz * vy
    const fy = uz * vx - ux * vz
    const fz = ux * vy - uy * vx
    const nx2 = normal[a] + normal[b] + normal[c]
    const ny2 = normal[a + 1] + normal[b + 1] + normal[c + 1]
    const nz2 = normal[a + 2] + normal[b + 2] + normal[c + 2]
    if (fx * nx2 + fy * ny2 + fz * nz2 < 0) {
      const k = index[t + 1]
      index[t + 1] = index[t + 2]
      index[t + 2] = k
    }
  }
  return { position: Float32Array.from(pos), normal, ao, index: Uint32Array.from(index) }
}


// --- the colossi ----------------------------------------------------------------

const COLOSSI: ColossusKind[] = ['sentinel', 'ribcage', 'skull', 'sword', 'monolith', 'trunk', 'reclining', 'husk', 'mourner', 'head']
export const isColossus = (k: ShapeKind): k is ColossusKind => (COLOSSI as string[]).includes(k)

/** Capsule between two points. */
function capsule(x: number, y: number, z: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number): number {
  const px = x - ax
  const py = y - ay
  const pz = z - az
  const dx = bx - ax
  const dy = by - ay
  const dz = bz - az
  const h = Math.max(0, Math.min(1, (px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz)))
  return len3(px - dx * h, py - dy * h, pz - dz * h) - r
}

function colossus(kind: ColossusKind, rand: () => number, n: Noise2): Shape {
  // Weathering at colossal scale: broad dents and finer pitting.
  const wear = (x: number, y: number, z: number, amp: number) =>
    amp * ((n(x * 0.012, y * 0.012 + z * 0.006) + n(y * 0.011 - 4.1, z * 0.013)) * 0.35 + (n(x * 0.05 + z * 0.02, y * 0.05) + n(z * 0.047, x * 0.05 - y * 0.02)) * 0.15)
  if (kind === 'sentinel') {
    // A First One kneeling: the right knee down, the left raised; a cowled
    // hood with nothing but dark inside; a cape falling down its back in
    // folds; armoured chest and shoulders; both gauntlets on the pommel of a
    // sword driven into the ground before it. ~360 m tall. Facing +z.
    const rb = (x: number, y: number, z: number, cx: number, cy: number, cz: number, bx: number, by: number, bz: number, r: number) => roundBox(x - cx, y - cy, z - cz, bx, by, bz, r)
    return {
      field: (x, y, z) => {
        const ax = Math.abs(x)
        // Legs. Left (−x): foot forward, knee up. Right (+x): knee on the ground, shin back.
        let d = capsule(x, y, z, -42, 168, 18, -46, 118, 112, 30) // left thigh
        d = smin(d, capsule(x, y, z, -46, 118, 112, -48, 8, 122, 25), 10) // left shin
        d = smin(d, rb(x, y, z, -48, 9, 135, 22, 10, 34, 6), 8) // left foot
        d = smin(d, capsule(x, y, z, 42, 168, 18, 44, 22, 46, 31), 10) // right thigh
        d = smin(d, capsule(x, y, z, 44, 18, 46, 44, 12, -78, 25), 10) // right shin, along the ground
        // The skirt of the robe, flaring to the ground, in folds.
        const ang = Math.atan2(x, z)
        const fold = 4.5 * Math.sin(ang * 16 + y * 0.015) * Math.min(1, (182 - y) / 60)
        const skirtR = 62 + (182 - Math.max(0, Math.min(182, y))) * 0.32 + fold
        const skirt = Math.max(Math.hypot(x, (z - 8) * 0.9) - skirtR, y - 182, -y - 4)
        d = smin(d, skirt, 14)
        // Torso, leaning a little forward; armoured ridges across the chest.
        const ty = y - 238
        const tz = z - 4 - ty * 0.1
        d = smin(d, roundBox(x, ty, tz, 56, 62, 34, 14), 12)
        d = smin(d, rb(x, y, z, 0, 186, 2, 46, 26, 30, 10), 10)
        for (const ry of [258, 236, 214]) d = Math.min(d, roundBox(x, y - ry, tz - 33, 52 - (258 - ry) * 0.12, 6, 6, 3))
        // Pauldrons: a dome over each shoulder, two lames stepping down.
        for (const sx of [-1, 1]) {
          d = smin(d, ellipsoid(x - sx * 70, y - 284, z - 2, 42, 25, 40), 6)
          d = Math.min(d, rb(x, y, z, sx * 76, 262, 2, 34, 6, 36, 4))
          d = Math.min(d, rb(x, y, z, sx * 80, 249, 2, 30, 6, 33, 4))
          // Arms: down and forward to the pommel; gauntlets.
          d = smin(d, capsule(x, y, z, sx * 72, 272, 2, sx * 64, 212, 54, 17), 8)
          d = smin(d, capsule(x, y, z, sx * 64, 212, 54, sx * 16, 248, 92, 14), 7)
          d = smin(d, rb(x, y, z, sx * 13, 250, 98, 12, 15, 16, 5), 4)
        }
        // A mantle round the neck, the hood rising out of it.
        d = smin(d, ellipsoid(x, y - 300, z + 2, 74, 18, 50), 12)
        let hood = ellipsoid(x, y - 326, z - 6, 34, 42, 37)
        hood = smin(hood, capsule(x, y, z, 0, 340, -8, 0, 362, -34, 14), 10) // its point, drawn back
        // The cowl: open at the front, deep — the dark inside it.
        hood = ssub(hood, ellipsoid(x, y - 322, z - 34, 22, 29, 30), 4)
        d = smin(d, hood, 12)
        // The cape down the back, in folds, to the ground.
        const cz = z + 40 + 5 * Math.sin(x * 0.11) + Math.max(0, 200 - y) * 0.12
        d = smin(d, Math.max(roundBox(x, y - 160, cz, 74 - Math.max(0, 300 - y) * 0.02, 140, 5, 3), -y - 2), 10)
        // The sword: pommel, ringed grip, crossguard, a blade with a fuller, driven in.
        let sw = len3(x, y - 268, z - 98) - 9
        sw = Math.min(sw, capsule(x, y, z, 0, 260, 98, 0, 228, 98, 5.5))
        for (const gy of [254, 244, 236]) sw = Math.min(sw, torus(x, z - 98, y - gy, 6.2, 1.6))
        sw = Math.min(sw, rb(x, y, z, 0, 222, 98, 50, 6, 8, 3))
        sw = Math.min(sw, len3(ax - 50, y - 222, z - 98) - 8)
        const taper = Math.max(0, Math.min(1, (y + 40) / 260))
        const bz = 98 - (y - 88) * 0.03
        let blade = rb(x, y, z, 0, 88, bz, 8 + 8 * taper, 128, 3.6, 1.2)
        // The fuller: a shallow groove down each face.
        for (const fz of [-3.6, 3.6]) blade = Math.max(blade, -rb(x, y, z, 0, 120, bz + fz, 2.4, 92, 1.1, 0.4))
        sw = Math.min(sw, blade)
        d = Math.min(d, sw)
        // Rubble at its knee.
        d = smin(d, ellipsoid(x - 60, y + 2, z - 70, 24, 10, 20), 6)
        return Math.max(d, -(y + 14)) + wear(x, y, z, 1.3)
      },
      hx: 135,
      hy: 202,
      hz: 162,
      cy: 186,
    }
  }
  if (kind === 'ribcage') {
    // The ribs of a fallen First One, arching out of the sand along a buried spine.
    const ribs = 11
    const len = 520
    return {
      field: (x, y, z) => {
        // Spine: a row of vertebrae along z, half sunk.
        const t = Math.max(0, Math.min(ribs - 1, Math.round((z + len / 2) / (len / (ribs - 1)))))
        const vz = -len / 2 + t * (len / (ribs - 1))
        let d = ellipsoid(x, y + 6, z - vz, 26, 22, 20)
        d = smin(d, capsule(x, y, z, 0, -2, -len / 2 - 30, 0, -2, len / 2 + 30, 12), 8)
        // Ribs: arcs rising from the spine, out and up, over and down to the sand.
        const k = Math.max(0, Math.min(ribs - 1, Math.round((z + len / 2) / (len / (ribs - 1)))))
        const rz = -len / 2 + k * (len / (ribs - 1))
        const size = 1 - Math.abs(k - (ribs - 1) * 0.4) / ribs
        const R = 70 + 75 * size
        // Each side: a torus in the x–y plane centred beside the spine.
        for (const sx of [-1, 1]) {
          const cx = sx * R * 0.92
          const tor = Math.hypot(Math.hypot(x - cx, y - R * 0.15) - R, (z - rz) * 1.1 + (y > 0 ? y * 0.08 : 0)) - (7 + 4 * size)
          // Only the arc above the spine's side: cut the outer lower half away.
          d = smin(d, Math.max(tor, -(x * sx) - 4), 6)
        }
        return Math.max(d, -(y + 14)) + wear(x, y, z, 2.2)
      },
      hx: 290,
      hy: 140,
      hz: len / 2 + 60,
      cy: 120,
    }
  }
  if (kind === 'reclining') {
    // One lying on its back in the marsh, ~730 m from crown to heel, sunk so
    // that only islands rise: the face turned to the sky (brow, nose, the
    // closed eyes, chin), the chest, one knee drawn up, and one hand lifted out
    // of the water, the fingers half curled — as if reaching, or about to.
    // Head at +z, facing up +y; the water's surface is about y = 0.
    return {
      field: (x, y, z) => {
        // The face and skull.
        let d = ellipsoid(x, y - 6, z - 250, 62, 58, 76)
        d = smin(d, ellipsoid(x, y - 50, z - 268, 54, 14, 26), 14) // brow
        d = smin(d, capsule(x, y, z, 0, 58, 278, 0, 70, 300, 11), 8) // nose
        d = smin(d, ellipsoid(x, y - 38, z - 316, 30, 18, 20), 12) // chin and mouth
        d = ssub(d, ellipsoid(Math.abs(x) - 24, y - 56, z - 288, 14, 7, 11), 4) // the eyes' hollows, closed
        d = smin(d, ellipsoid(Math.abs(x) - 24, y - 52, z - 289, 12, 5, 9), 3) // their lids
        // Neck, chest, sternum, belly (sinking toward the feet).
        d = smin(d, capsule(x, y, z, 0, -10, 180, 0, -14, 140, 42), 30)
        d = smin(d, ellipsoid(x, y + 12, z - 70, 130, 52, 110), 36)
        d = smin(d, capsule(x, y, z, 0, 34, 20, 0, 40, 130, 16), 14)
        d = smin(d, ellipsoid(x, y + 40, z + 80, 110, 40, 100), 30)
        // The right leg drawn up: thigh to the knee in the air, shin back down.
        d = smin(d, capsule(x, y, z, 45, -30, -150, 60, 118, -235, 40), 22)
        d = smin(d, capsule(x, y, z, 60, 118, -235, 66, -40, -340, 33), 16)
        d = smin(d, ellipsoid(x - 60, y - 120, z + 236, 34, 22, 30), 10) // kneecap
        // The left leg flat, under.
        d = smin(d, capsule(x, y, z, -45, -36, -150, -55, -40, -390, 34), 20)
        // The left arm along its side, under the water.
        d = smin(d, capsule(x, y, z, -130, -16, 140, -205, -28, -10, 27), 20)
        // The right arm: shoulder, elbow in the mud, forearm up, the hand.
        d = smin(d, capsule(x, y, z, 128, -12, 140, 172, -26, 40, 28), 20)
        d = smin(d, capsule(x, y, z, 172, -26, 40, 202, 92, -12, 24), 16)
        d = smin(d, ellipsoid(x - 206, y - 128, z + 20, 30, 40, 13), 10) // palm
        for (let f = 0; f < 4; f++) {
          const fx = 188 + f * 12
          const tip = 196 + (f === 1 || f === 2 ? 14 : 0)
          d = smin(d, capsule(x, y, z, fx, 160, -20, fx + 2, tip, -6 - f * 2, 7.5 - f * 0.6), 5)
          d = smin(d, capsule(x, y, z, fx + 2, tip, -6 - f * 2, fx + 1, tip + 16, 8 - f * 2, 6.2 - f * 0.5), 4) // curled tips
        }
        d = smin(d, capsule(x, y, z, 236, 128, -18, 252, 160, -2, 8), 6) // thumb
        // Cut flat well under the marsh (nothing is meshed down there).
        return Math.max(d, -(y + 70)) + wear(x, y, z, 2.2)
      },
      hx: 265,
      hy: 150,
      hz: 410,
      cy: 75,
    }
  }
  if (kind === 'mourner') {
    // One of the Circle: a tall hooded figure in a long robe, ~120 m, standing
    // with its head bowed far forward and its hands folded in its sleeves, the
    // hood's opening dark. Each a little different (how low it bows, how it
    // stands). Facing +z.
    const bow = 0.5 + rand() * 0.35
    const lean = (rand() - 0.5) * 0.12
    const H = 112 + rand() * 18
    return {
      field: (x, y, z) => {
        const lx = x - lean * y
        // The robe: wide at the hem, narrowing to the shoulders, falling in folds.
        const t = Math.max(0, Math.min(1, y / (H * 0.78)))
        const rr = 24 - 12 * t + 1.6 * Math.sin(Math.atan2(z, lx) * 9) * (1 - t)
        let d = Math.max(Math.hypot(lx, z * 1.15) - rr, -y, y - H * 0.8)
        // Shoulders, rounded and hunched forward.
        d = smin(d, ellipsoid(lx, y - H * 0.78, z - 4, 17, 10, 13), 8)
        // The hood: bowed far forward over the chest, its opening dark and deep.
        const hy = H * 0.86 - bow * 12
        const hz = 6 + bow * 16
        d = smin(d, ellipsoid(lx, y - hy, z - hz, 11, 14, 13), 8)
        d = ssub(d, ellipsoid(lx, y - (hy - 5 - bow * 3), z - (hz + 9), 6, 8, 7), 3)
        // The sleeves, folded across the front, the hands hidden in them.
        d = smin(d, capsule(x, y, z, -14, H * 0.66, 8, 0, H * 0.58, 16, 6.5), 5)
        d = smin(d, capsule(x, y, z, 14, H * 0.66, 8, 0, H * 0.58, 16, 6.5), 5)
        return d + wear(x, y, z, 1.2)
      },
      hx: 34,
      hy: H * 0.5 + 6,
      hz: 34,
      cy: H * 0.5,
    }
  }
  if (kind === 'husk') {
    // What one of them left behind when it grew: its whole skin, shed in one
    // piece and lying face down in the sand — hollow, split along the back
    // from neck to hip, so you can walk in. ~260 m long. Head at +z.
    return {
      field: (x, y, z) => {
        let d = ellipsoid(x, y - 20, z - 10, 70, 46, 105) // the back and chest
        d = smin(d, ellipsoid(x, y - 10, z + 95, 58, 36, 50), 30) // the hips (at −z)
        d = smin(d, ellipsoid(x, y - 22, z - 128, 34, 32, 38), 18) // the head, face down
        d = smin(d, capsule(x, y, z, 60, 10, 60, 112, -4, 172, 20), 16) // arms, flung out past the head
        d = smin(d, capsule(x, y, z, -60, 10, 60, -116, -4, 166, 20), 16)
        d = smin(d, capsule(x, y, z, 30, 0, -130, 46, -8, -230, 22), 14) // legs
        d = smin(d, capsule(x, y, z, -30, 0, -130, -40, -8, -228, 22), 14)
        // Hollow: a skin seven metres thick (thinner than the mesh's cells, it broke into shards).
        let shell = Math.max(d, -d - 7)
        // Split along the back, neck to hip; holes where the eyes were, at the sides of the head.
        shell = Math.max(shell, -capsule(x, y, z, 0, 62, 92, 0, 44, -80, 15))
        shell = Math.max(shell, -ellipsoid(Math.abs(x) - 30, y - 26, z - 140, 6, 7, 9))
        // Ragged where it tore.
        return Math.max(shell, -(y + 14)) + wear(x, y, z, 1.6)
      },
      hx: 160,
      hy: 70,
      hz: 260,
      cy: 25,
    }
  }
  if (kind === 'head') {
    // The head in the sand (PLAN §4b.3): a carved stone head ~24 m tall, buried to the chin —
    // long-faced, a heavy brow over deep eyes, a long nose, the lips pursed; long ears. Its mouth
    // is a doorway into a room inside the jaw (floor at 1 m, walls 2.4–3.4 m thick). Facing +z.
    return {
      field: (x, y, z) => {
        let d = ellipsoid(x, y - 15, z + 1, 8, 10, 8.5) // the cranium
        d = smin(d, roundBox(x, y - 5, z - 0.5, 7, 5.5, 7.5, 2.5), 4) // the jaw, square and heavy
        d = smin(d, capsule(x, y, z, -6, 15, 6.6, 6, 15, 6.6, 1.6), 2) // the brow
        d = ssub(d, ellipsoid(Math.abs(x) - 3.3, y - 12.8, z - 7.6, 2.2, 1.4, 1.8), 1) // the eyes, deep under it
        d = smin(d, capsule(x, y, z, 0, 14, 7.4, 0, 8.9, 9.3, 1.4), 1.5) // the nose
        d = smin(d, ellipsoid(x, y - 8.6, z - 8.9, 2.2, 1.2, 1.4), 1.2)
        d = smin(d, ellipsoid(x, y - 6.6, z - 8.0, 3.6, 1.0, 1.6), 1) // the upper lip, over the door
        d = smin(d, ellipsoid(Math.abs(x) - 8.3, y - 12, z, 1.2, 5, 2.2), 1.5) // the ears
        // The doorway (between the lips) and the room behind it.
        // (One cavity, cut once, the doorway's box running on well into the room: a union of two
        // boxes' fields under-reads the distance near the face where they meet — it read a wall
        // half a metre off in the middle of the way in, and you could not get through.)
        const cavity = Math.min(roundBox(x, y - 3.1, z - 4.95, 2.6, 2.1, 6.95, 0.6), roundBox(x, y - 4.4, z, 3.6, 3.4, 4.6, 1.0))
        d = ssub(d, cavity, 0.8)
        return d + wear(x, y, z, 0.35)
      },
      hx: 11,
      hy: 14,
      hz: 12,
      cy: 12,
    }
  }
  if (kind === 'skull') {
    // Its skull, on its side in the sand: you could walk into an eye.
    return {
      field: (x, y, z) => {
        let d = ellipsoid(x, y - 40, z, 95, 80, 110)
        d = smin(d, ellipsoid(x, y - 10, z - 85, 70, 45, 70), 25)
        // Eye sockets, the nose, the jaw's hollow.
        d = ssub(d, ellipsoid(x - 42, y - 45, z - 120, 26, 24, 40), 6)
        d = ssub(d, ellipsoid(x + 42, y - 45, z - 120, 26, 24, 40), 6)
        d = ssub(d, ellipsoid(x, y - 15, z - 150, 14, 22, 30), 4)
        d = ssub(d, ellipsoid(x, y + 5, z - 70, 55, 30, 60), 10)
        // Teeth along the upper jaw.
        for (let i = -4; i <= 4; i++) d = smin(d, capsule(x, y, z, i * 11, 2, -150 + Math.abs(i) * 6, i * 11, -14, -146 + Math.abs(i) * 6, 4.5), 2)
        return Math.max(d, -(y + 20)) + wear(x, y, z, 2.5)
      },
      hx: 110,
      hy: 80,
      hz: 165,
      cy: 50,
    }
  }
  if (kind === 'sword') {
    // A blade 300 m long, driven into the dunes at a slant.
    const tilt = 0.32
    return {
      field: (x, y, z) => {
        // Into the blade's frame: tilted about x.
        const c = Math.cos(tilt)
        const s2 = Math.sin(tilt)
        const by = y * c - z * s2
        const bz = y * s2 + z * c
        const taper = Math.max(0, Math.min(1, (by + 60) / 300))
        let d = roundBox(x, by - 90, bz, 15 * (0.55 + 0.45 * taper), 160, 3.4, 1.2)
        d = Math.min(d, roundBox(x, by - 252, bz, 62, 9, 11, 3))
        d = Math.min(d, capsule(x, by, bz, 0, 262, 0, 0, 312, 0, 7))
        d = Math.min(d, len3(x, by - 320, bz) - 13)
        return Math.max(d, -(y + 10)) + wear(x, y, z, 1.4)
      },
      hx: 80,
      hy: 170,
      hz: 130,
      cy: 150,
    }
  }
  if (kind === 'monolith') {
    // A shaft of stone hanging in the air, its ends broken.
    const h = 90 + rand() * 90
    const w = 14 + rand() * 10
    return {
      field: (x, y, z) => {
        let d = roundBox(x, y, z, w * (1 - 0.15 * (y / h)), h / 2, w * 0.8, 3)
        d = ssub(d, len3(x - w, y - h / 2, z) - w * 0.9, 4)
        d = ssub(d, len3(x + w * 0.6, y + h / 2, z - w * 0.3) - w * 0.8, 4)
        return d + wear(x, y, z, 2)
      },
      hx: w + 8,
      hy: h / 2 + 8,
      hz: w + 8,
      cy: 0,
    }
  }
  // A giant tree: a leaning, gnarled trunk; roots arching out of the ground
  // like ridges; six to eight great limbs reaching out at different heights,
  // each ending where a crown of leaves sits (`tips`, for colossi.ts).
  const h = 150 + rand() * 90
  const r = 11 + rand() * 6
  const roots = 7 + Math.floor(rand() * 4)
  const twist = rand() * 6.28
  const lean = (rand() - 0.5) * 0.12
  const rootArcs: Array<[number, number, number, number, number, number, number, number, number, number]> = []
  for (let i = 0; i < roots; i++) {
    const a = (i / roots) * Math.PI * 2 + twist + (rand() - 0.5) * 0.4
    const reach = r * (3.5 + rand() * 2.5)
    // From up the trunk, out through a raised knee, down into the ground.
    rootArcs.push([0, r * (1.6 + rand()), 0, Math.cos(a) * reach * 0.55, r * (0.9 + rand() * 0.6), Math.sin(a) * reach * 0.55, Math.cos(a) * reach, -4, Math.sin(a) * reach, r * (0.38 + rand() * 0.15)])
  }
  const limbs: Array<{ a: THREE3; b: THREE3; r: number }> = []
  const tips: Array<[number, number, number]> = []
  const nl = 6 + Math.floor(rand() * 3)
  for (let i = 0; i < nl; i++) {
    const a = (i / nl) * Math.PI * 2 + twist * 1.7 + (rand() - 0.5) * 0.5
    const y0 = h * (0.55 + 0.35 * rand())
    const out = r * (4.5 + rand() * 4)
    const mid: THREE3 = [Math.cos(a) * out * 0.5 + lean * y0, y0 + h * 0.08, Math.sin(a) * out * 0.5]
    const end: THREE3 = [Math.cos(a) * out + lean * y0, y0 + h * (0.14 + rand() * 0.1), Math.sin(a) * out]
    const base: THREE3 = [lean * y0, y0, 0]
    limbs.push({ a: base, b: mid, r: r * 0.42 })
    limbs.push({ a: mid, b: end, r: r * 0.28 })
    tips.push(end)
  }
  tips.push([lean * h, h * 1.05, 0])
  return {
    field: (x, y, z) => {
      const k = Math.max(0, Math.min(1, y / h))
      const cx = x - lean * y + Math.sin(y * 0.012 + twist) * 6
      let d = Math.hypot(cx, z) - r * (1.7 - 0.95 * k)
      d = Math.max(d, y - h * 1.02, -y - 10)
      for (const [x0, y0, z0, x1, y1, z1, x2, y2, z2, rr] of rootArcs) {
        d = smin(d, capsule(x, y, z, x0, y0, z0, x1, y1, z1, rr * 1.2), r * 0.7)
        d = smin(d, capsule(x, y, z, x1, y1, z1, x2, y2, z2, rr * 0.8), r * 0.5)
      }
      for (const l of limbs) d = smin(d, capsule(x, y, z, l.a[0], l.a[1], l.a[2], l.b[0], l.b[1], l.b[2], l.r), r * 0.5)
      // Bark: deep twisting furrows, and knots.
      const furrow = Math.sin(Math.atan2(z, cx) * 18 + y * 0.04 + n(x * 0.04, z * 0.04) * 3) * 1.6
      return d + furrow + wear(x, y, z, 1.2)
    },
    hx: r * 9.5 + h * 0.07,
    hy: (h * 1.32 + 12) / 2,
    hz: r * 9.5,
    cy: (h * 1.32 - 12) / 2,
    tips,
  }

}
