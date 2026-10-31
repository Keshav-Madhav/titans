// The shapes of the rock formations (./rocks.ts): signed distance fields
// built from rounded primitives, blended and carved, displaced by noise; and
// surface nets to mesh them. No three.js here: the worker (./rocks-worker.ts)
// meshes with it, and the main thread uses the same fields for collision.

import { makeSimplex2, mulberry32, type Noise2, type RegionName } from '@titans/shared'

export type FormationKind = 'arch' | 'cave' | 'hoodoo' | 'overhang' | 'spire' | 'boulders'

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
  /** Bounding box half-extents and centre height. */
  hx: number
  hy: number
  hz: number
  cy: number
}

/** Build a formation's shape from its kind and own seed (the same on any thread). */
export function make(kind: FormationKind, seed: number, worldSeed: number): Shape {
  const rand = mulberry32(seed)
  const n = noiseFor(worldSeed)
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
  valley: [
    ['boulders', 8],
    ['arch', 1],
    ['overhang', 2],
  ],
  forest: [
    ['boulders', 14],
    ['overhang', 6],
    ['cave', 3],
    ['arch', 2],
  ],
  desert: [
    ['arch', 7],
    ['hoodoo', 16],
    ['spire', 6],
    ['cave', 3],
    ['boulders', 6],
  ],
  ruins: [
    ['spire', 5],
    ['arch', 3],
    ['overhang', 4],
    ['cave', 2],
    ['boulders', 8],
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
export function meshShape(sh: Shape): RockMesh {
  const f = sh.field
  const span = Math.max(sh.hx, sh.hy, sh.hz) * 2
  const s = Math.max(0.9, span / 64)
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
    for (const t of [1.5, 4, 9]) occ += Math.max(0, t - f(x + (gx / gl) * t, y + (gy / gl) * t, z + (gz / gl) * t)) / t
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

