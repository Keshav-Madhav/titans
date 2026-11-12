// Vegetation and ground scatter: forests and copses of conifers and broadleaf
// trees, lone trees on the plain, boulders, bushes, grass and wildflowers
// around you, reeds along the shallow edges of the Titans' lakes.
//
// The world is cut into 96 m cells; each cell's plants are generated from the
// seed and the biome fields (so the trees stand where the terrain shows dark
// canopy from afar), skipping water, roads, buildings and ground a Titan has
// trodden flat. Trees have two looks: detailed within `nearR`, a simple cone
// or blob out to `midR`; beyond that, the canopy colour in the terrain carries
// the forest. Everything is instanced and sways a little in the wind.

import * as THREE from 'three'
import { mergeGeometries, mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import { tallAt } from './tallgrass'
import { broadleafGeometry, bushGeometry, coniferGeometry, foliageMaterial, foliageTexture } from './trees'
import { inBasin, makeSimplex2, mulberry32, poolBowl, type LakeSystem, type Terrain, SHORE, seaward } from '@titans/shared'
import { LAYER } from './terrain-material'
import type { Biome } from './biome'
import type { PaintField } from './paint'

const CELL = 96
/** Within this the boulders are drawn in full detail, three broken shapes (m). */
const ROCK_NEAR = 90
/** Small stones: only the cells whose middle is this near (m) — the one you are in and its neighbours. */
const PEBBLE_R = 110
/** Wedges round you for the distant kinds (each frustum-culled on its own). */
const SECTORS = 8
/** Tools: false draws every near instance again (to measure the culling, same frame). */
export const cullSwitch = { on: true }
/**
 * The near kinds culled per instance against the view, every time the camera moves or turns enough
 * (optimisation pass, 2026-11-04: they were drawn all round you — the trees and boulders behind the
 * camera too, ~2–4k triangles each). [bounding radius, its centre's height] in instance units.
 */
const CULLED: Partial<Record<Kind, [number, number]>> = {
  coniferNear: [7.5, 6.5],
  broadNear: [7.5, 7],
  rockA: [1.5, 0.3],
  rockB: [1.5, 0.4],
  rockC: [1.5, 0.3],
  pebble: [1.2, 0.2],
  reed: [1.2, 0.6],
  fern: [1.0, 0.3],
  stalk: [1.0, 0.6],
}
/**
 * Trees nearer than this cast their own leaf-dappled shadows; farther (to the
 * edge of the shadow map), a simple stand-in's — the shadow pass drew every
 * near tree's full 2,500 leaf-card triangles (0.9 M in a forest) for shadows
 * a few texels wide.
 */
const SHADE_R = 70
/** The layer the shadow-only casters live on (the sun's shadow camera sees it; no other camera does). */
export const SHADOW_ONLY = 2
const SECTORED: Kind[] = ['coniferMid', 'coniferFar', 'broadMid', 'broadFar', 'bush', 'shrub', 'rock']
/** Seconds of game time before churned ground greens over. */
const REGROW = 300
const GCELL = 24 // grass cells
/** How far you move before the trees, rocks and bushes are repacked (m). */
const TREE_STEP = 48

type Kind = 'coniferNear' | 'coniferMid' | 'coniferFar' | 'broadNear' | 'broadMid' | 'broadFar' | 'rock' | 'rockA' | 'rockB' | 'rockC' | 'pebble' | 'bush' | 'grass' | 'reed' | 'shrub' | 'fern' | 'stalk'
const CAP: Record<Kind, number> = {
  coniferNear: 10000,
  coniferMid: 20000,
  coniferFar: 80000,
  broadNear: 10000,
  broadMid: 20000,
  broadFar: 80000,
  rock: 5000,
  rockA: 1500,
  rockB: 1500,
  rockC: 1500,
  pebble: 3000,
  bush: 20000,
  grass: 80000,
  reed: 6000,
  shrub: 90000,
  fern: 16000,
  stalk: 9000,
}

/** Instances of each kind in one cell: packed matrices + colours (number[] while generating, typed once done). */
interface Batch {
  m: number[] | Float32Array
  c: number[] | Float32Array
  n: number
}

function pack(b: Batch): Batch {
  return { m: Float32Array.from(b.m), c: Float32Array.from(b.c), n: b.n }
}
type CellData = Partial<Record<'conifer' | 'broad' | 'rock' | 'rockA' | 'rockB' | 'rockC' | 'pebble' | 'bush' | 'reed' | 'shrub' | 'fern' | 'stalk', Batch>>

/** The rock material's layers (sides, tops, metres per tile) on every vertex. */
function rockLayers(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.getAttribute('position').count
  const a = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) a.set([LAYER.rock, LAYER.grass, 3.5], i * 3)
  g.setAttribute('aLayer', new THREE.BufferAttribute(a, 3))
  return g
}

function colored(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex)
  const n = g.getAttribute('position').count
  const a = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(a, 3))
  return g
}


/**
 * A boulder that was broken off something (graphics pass, 2026-11-04: the user — "a flat 10-triangle
 * rock doesn't match"; every boulder was the one smooth lumpy blob, scaled and turned). A rounded
 * lump, then cut by a few planes — flat broken faces meeting at real edges — a little fine relief,
 * and settled on a flat underside. Normals creased at the cuts: sharp edges, smooth elsewhere.
 */
function brokenRock(seed: number, detail: number, shape: [number, number, number] = [1.1, 0.72, 0.95], depth = 0.45): THREE.BufferGeometry {
  const rand = mulberry32(seed)
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail)
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  g = mergeVertices(g, 1e-4)
  const big = makeSimplex2(seed * 7 + 1)
  const fine = makeSimplex2(seed * 13 + 5)
  const p = g.getAttribute('position')
  const v = new THREE.Vector3()
  // The cuts: a few planes, mostly steep (broken sides), one or two shallow (a worn top).
  const cuts: Array<[THREE.Vector3, number]> = []
  const nCuts = 6 + Math.floor(rand() * 4)
  for (let i = 0; i < nCuts; i++) {
    const a = rand() * Math.PI * 2
    const up = i < 2 ? 0.55 + rand() * 0.4 : (rand() - 0.35) * 0.7
    const n = new THREE.Vector3(Math.cos(a), up, Math.sin(a)).normalize()
    // (Deep enough to bite: cut at 62–84% of the radius they barely touched the lump — it still
    // read as a smooth mound.)
    cuts.push([n, depth + rand() * 0.25])
  }
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    // The rounded lump.
    v.multiplyScalar(1 + 0.2 * big(v.x * 1.3 + v.y * 0.7, v.z * 1.3 - v.y * 0.5))
    // Broken off flat along each cut.
    for (const [n, d] of cuts) {
      const k = v.dot(n)
      if (k > d) v.addScaledVector(n, d - k)
    }
    // Fine relief: grain and small pits (kept small, so the cut faces stay flat).
    v.multiplyScalar(1 + 0.025 * fine(v.x * 6 + v.y * 3, v.z * 6 - v.y * 2.5))
    // Settled: the underside flattened into the ground.
    if (v.y < -0.3) v.y = -0.3 + (v.y + 0.3) * 0.25
    p.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  g = toCreasedNormals(g, 0.55)
  return g.scale(shape[0], shape[1], shape[2])
}

const SRGB = THREE.SRGBColorSpace

const GEOMS: Record<Kind, () => THREE.BufferGeometry> = {
  // Up close: leaf-card trees (trees.ts). Farther: simple shapes in the same colours.
  coniferNear: () => coniferGeometry(41),
  coniferMid: () => coniferGeometry(41, true),
  coniferFar: () => coniferGeometry(41, true, true),
  broadNear: () => broadleafGeometry(11),
  broadMid: () => broadleafGeometry(11, true),
  broadFar: () => broadleafGeometry(11, true, true),
  // Boulders: lumpy, flattened, textured as rock (rocks.ts' tri-planar material).
  // (Near: three broken shapes in full detail; farther, the lighter one.)
  rock: () => rockLayers(colored(brokenRock(21, 3, [1.15, 0.85, 1.0], 0.42), 0xffffff)),
  // (A broken block; a tall slab, tipped; a round stone split and worn.)
  rockA: () => rockLayers(colored(brokenRock(21, 4, [1.15, 0.85, 1.0], 0.42), 0xffffff)),
  rockB: () => rockLayers(colored(brokenRock(57, 4, [0.75, 1.25, 1.05], 0.48), 0xffffff)),
  rockC: () => rockLayers(colored(brokenRock(93, 4, [1.2, 0.7, 1.1], 0.55), 0xffffff)),
  // Small stones in the grass, near you (a scan replaces it: rock-scans.ts).
  pebble: () => rockLayers(colored(brokenRock(7, 1, [1, 0.7, 1], 0.5), 0xffffff)),
  // Bushes and scrub: clumps of leaf cards, as the trees are.
  bush: () => bushGeometry(31, 14),
  // (Its normals mostly up, lit like the ground it grows from: four cards from the crown's centre
  // left half of each facing down, and a low shrub came out as a flat black cutout on sunny grass —
  // the tour, 2026-11-07.)
  shrub: () => {
    const g = bushGeometry(37, 4, 0.7)
    const n = g.getAttribute('normal') as THREE.BufferAttribute
    const v = new THREE.Vector3()
    for (let i = 0; i < n.count; i++) {
      v.set(n.getX(i), n.getY(i), n.getZ(i)).lerp(new THREE.Vector3(0, 1, 0), 0.7).normalize()
      n.setXYZ(i, v.x, v.y, v.z)
    }
    return g
  },
  grass: () => {
    // A tuft of thin blades leaning outward.
    const pos: number[] = []
    const col: number[] = []
    const n = 9
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + i * 0.7
      const lean = 0.14 + (i % 3) * 0.06
      const h = 0.38 + ((i * 37) % 10) * 0.035
      const cx = Math.cos(a)
      const cz = Math.sin(a)
      const w = 0.035
      // base left, base right, tip — and the same blade wound the other way,
      // so both faces are front faces with up-facing normals (a DoubleSide
      // material flips the normal on back faces and turned blades brown).
      const bl = [cx * 0.05 - cz * w, 0, cz * 0.05 + cx * w]
      const br = [cx * 0.05 + cz * w, 0, cz * 0.05 - cx * w]
      const tip = [cx * lean, h, cz * lean]
      pos.push(...bl, ...br, ...tip, ...br, ...bl, ...tip)
      col.push(0.62, 0.62, 0.62, 0.62, 0.62, 0.62, 1, 1, 1, 0.62, 0.62, 0.62, 0.62, 0.62, 0.62, 1, 1, 1)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    // Lit like the ground beneath them, not like paper turned to the sun.
    const nrm = new Float32Array(pos.length)
    for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
    return g
  },
  // A fern: fronds arching out from a crown. (Each frond a strip of leaflets, not one solid leaf: as
  // a solid, flat-lit tapering blade it read as clip-art — bright cartoon green, untextured — against
  // the textured ground (tour review, 2026-11-06). Now a midrib with leaflets out both sides, darker
  // at the crown and in its own shade, lit by the frond's own facing.)
  fern: () => {
    const pos: number[] = []
    const col: number[] = []
    const nrm: number[] = []
    const c0 = new THREE.Color(0x23401a)
    const c1 = new THREE.Color(0x4a7330)
    const c2 = new THREE.Color(0x6f8a3c)
    const tmp = new THREE.Color()
    const fronds = 9
    for (let i = 0; i < fronds; i++) {
      const a = (i / fronds) * Math.PI * 2 + (i % 2) * 0.3
      const L = 0.85 + (i % 3) * 0.15
      const arch = 0.5 + (i % 4) * 0.06
      const at = (t: number): [number, number, number] => [Math.cos(a) * L * t, arch * t - 0.62 * t * t + 0.05, Math.sin(a) * L * t]
      const sx = -Math.sin(a)
      const sz = Math.cos(a)
      const segs = 9
      for (let k = 0; k < segs; k++) {
        const t0 = k / segs
        const t1 = (k + 1) / segs
        const p0 = at(t0)
        const p1 = at(t1)
        // The frond's tangent and its up-facing normal here (lit by its own facing).
        const tx = p1[0] - p0[0], ty = p1[1] - p0[1], tz = p1[2] - p0[2]
        let nx = ty * sz - tz * 0, ny = tz * sx - tx * sz, nz = tx * 0 - ty * sx
        const nl = Math.hypot(nx, ny, nz) || 1
        nx /= nl; ny /= nl; nz /= nl
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz }
        // A pair of leaflets: out to both sides, angled forward and drooping, longest mid-frond.
        const span = (0.17 * Math.sin(Math.PI * Math.min(1, t0 * 1.15 + 0.08)) + 0.02) * (1 + (i % 2) * 0.12)
        const shade = tmp.copy(c0).lerp(c1, Math.min(1, t0 * 1.6)).lerp(c2, Math.max(0, t0 - 0.6) * 0.9)
        for (const side of [-1, 1]) {
          const base = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2]
          const tip = [base[0] + sx * side * span + (p1[0] - p0[0]) * 1.4, base[1] - span * 0.35, base[2] + sz * side * span + (p1[2] - p0[2]) * 1.4]
          // (A leaflet: a narrow diamond from the rib to its tip.)
          const w = 0.03 + span * 0.18
          const mx = (base[0] + tip[0]) / 2, my = (base[1] + tip[1]) / 2, mz = (base[2] + tip[2]) / 2
          const A = base, C = tip
          const B = [mx + (p1[0] - p0[0]) * w * 6, my + 0.004, mz + (p1[2] - p0[2]) * w * 6]
          const D = [mx - (p1[0] - p0[0]) * w * 6, my - 0.004, mz - (p1[2] - p0[2]) * w * 6]
          for (const tri of [[A, B, C], [A, C, D], [B, A, C], [C, A, D]]) for (const v of tri) {
            pos.push(v[0], v[1], v[2])
            nrm.push(nx, ny, nz)
            const tipLight = v === C ? 1.12 : 1
            col.push(shade.r * tipLight, shade.g * tipLight, shade.b * tipLight)
          }
        }
        // The rib itself: a thin dark strip.
        const rw = 0.012 * (1 - t0) + 0.004
        const A = [p0[0] - sx * rw, p0[1], p0[2] - sz * rw], B = [p0[0] + sx * rw, p0[1], p0[2] + sz * rw]
        const C = [p1[0] + sx * rw, p1[1], p1[2] + sz * rw], D = [p1[0] - sx * rw, p1[1], p1[2] - sz * rw]
        for (const tri of [[A, B, C], [A, C, D], [B, A, C], [C, A, D]]) for (const v of tri) {
          pos.push(v[0], v[1], v[2])
          nrm.push(nx, ny, nz)
          col.push(c0.r * 0.9, c0.g * 0.9, c0.b * 0.9)
        }
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    return g
  },
  // A stand of tall flowering stems: thin stalks, a pale head at the top of each.
  stalk: () => {
    const parts: THREE.BufferGeometry[] = []
    for (let i = 0; i < 4; i++) {
      const a = i * 2.1
      const ox = Math.cos(a) * 0.12
      const oz = Math.sin(a) * 0.12
      // (Knee-high and green: at a metre and more, dark, they stood about the meadow like bare black poles.)
      const h = 0.55 + (i % 2) * 0.22
      parts.push(colored(new THREE.CylinderGeometry(0.007, 0.011, h, 4).translate(ox, h / 2, oz).toNonIndexed(), 0x7d9a48))
      // (A loose head of small florets, not one faceted bead: as a 12-sided 11 cm gem in pastel on a
      // stick it read as a lollipop or a crystal — tour review, 2026-11-07.)
      const col = [0xd8d2bf, 0xc7a9c4, 0xd6b65e, 0xb9c4d4][i]
      for (let k = 0; k < 6; k++) {
        const fa = k * 2.4 + i, fr = k === 0 ? 0 : 0.03
        parts.push(colored(new THREE.IcosahedronGeometry(0.026 + (k === 0 ? 0.008 : 0), 1).scale(1, 0.8, 1).translate(ox + Math.cos(fa) * fr, h + 0.02 + (k === 0 ? 0.03 : k * 0.008), oz + Math.sin(fa) * fr), col))
      }
    }
    // (All non-indexed, no uvs: mergeGeometries needs them alike.)
    for (const g of parts) g.deleteAttribute('uv')
    return mergeGeometries(parts)!
  },
  reed: () => {
    const parts: THREE.BufferGeometry[] = []
    for (let i = 0; i < 5; i++) {
      const g = new THREE.BufferGeometry()
      const a = (i / 5) * Math.PI * 2
      const ox = Math.cos(a) * 0.18
      const oz = Math.sin(a) * 0.18
      const tx = ox + 0.02 * Math.cos(a)
      const ty = 1.6 + (i % 2) * 0.3
      g.setAttribute('position', new THREE.Float32BufferAttribute([ox - 0.05, 0, oz, ox + 0.05, 0, oz, tx, ty, oz, ox + 0.05, 0, oz, ox - 0.05, 0, oz, tx, ty, oz], 3))
      g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3))
      parts.push(colored(g, 0x6f7a3c))
    }
    return mergeGeometries(parts)!
  },
}

const SWAY: Record<Kind, number> = { coniferNear: 0.01, coniferMid: 0.008, coniferFar: 0, broadNear: 0.014, broadMid: 0.01, broadFar: 0, rock: 0, rockA: 0, rockB: 0, rockC: 0, pebble: 0, bush: 0.03, grass: 0.16, reed: 0.1, shrub: 0, fern: 0.05, stalk: 0.14 }

export class Vegetation {
  readonly group = new THREE.Group()
  nearR = 260
  midR = 1400
  grassR = 110
  private readonly meshes = {} as Record<Kind, THREE.InstancedMesh>
  /** The distant kinds' wedges (the first is meshes[kind]). */
  private readonly sectors = new Map<Kind, THREE.InstancedMesh[]>()
  /** Every instance of the culled kinds near you (rebuild() fills it; cull() draws what is in view). */
  private readonly full = new Map<Kind, { m: Float32Array; c: Float32Array; n: number }>()
  private cullDirty = true
  private readonly cullPos = new THREE.Vector3(Infinity, 0, 0)
  private readonly cullQ = new THREE.Quaternion()
  private readonly frustum = new THREE.Frustum()
  private readonly projView = new THREE.Matrix4()
  private readonly sphere = new THREE.Sphere()
  /** Tools: instances drawn / held, per culled kind (last cull). */
  cullStats: Record<string, string> = {}

  /** Draw only the near instances in view (with a margin for the shadows of what is just outside). */
  cull(camera: THREE.Camera): void {
    if (!cullSwitch.on) {
      if (this.cullStats.off !== '1') {
        for (const [k, f] of this.full) {
          const mesh = this.meshes[k]
          ;(mesh.instanceMatrix.array as Float32Array).set(f.m)
          ;(mesh.instanceColor!.array as Float32Array).set(f.c)
          mesh.count = f.n
          mesh.instanceMatrix.needsUpdate = true
          mesh.instanceColor!.needsUpdate = true
        }
        this.cullStats.off = '1'
        this.cullDirty = true
      }
      return
    }
    this.cullStats.off = '0'
    if (!this.cullDirty && camera.position.distanceToSquared(this.cullPos) < 0.25 && camera.quaternion.angleTo(this.cullQ) < 0.03) return
    this.cullDirty = false
    this.cullPos.copy(camera.position)
    this.cullQ.copy(camera.quaternion)
    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.projView)
    for (const [k, f] of this.full) {
      const [r, yo] = CULLED[k]!
      const mesh = this.meshes[k]
      const dm = mesh.instanceMatrix.array as Float32Array
      const dc = mesh.instanceColor!.array as Float32Array
      const m = f.m
      let v = 0
      for (let i = 0; i < f.n; i++) {
        const o = i * 16
        const sx = Math.hypot(m[o], m[o + 1], m[o + 2])
        const sy = Math.hypot(m[o + 4], m[o + 5], m[o + 6])
        this.sphere.center.set(m[o + 12], m[o + 13] + yo * sy, m[o + 14])
        this.sphere.radius = r * Math.max(sx, sy) + 3
        if (!this.frustum.intersectsSphere(this.sphere)) continue
        if (v !== i) {
          dm.set(m.subarray(o, o + 16), v * 16)
          dc.set(f.c.subarray(i * 3, i * 3 + 3), v * 3)
        }
        v++
      }
      mesh.count = v
      mesh.instanceMatrix.needsUpdate = true
      mesh.instanceColor!.needsUpdate = true
      this.cullStats[k] = `${v}/${f.n}`
    }
  }

  /**
   * Scanned boulders in place of the made ones (tools/build-rocks.mjs: CC0 photogrammetry, each cut
   * to ~4k triangles near with its baked colour, normal and AO maps, ~600 far). `near` gives the three
   * near shapes their own scan; the far ones take the first scan's far mesh and its material.
   */
  /** A plant kind's shape and look, to grow elsewhere with the same wind (statue-skirts.ts). */
  asset(k: 'bush' | 'shrub' | 'fern' | 'reed'): { geo: THREE.BufferGeometry; mat: THREE.Material } {
    const m = this.meshes[k]
    return { geo: m.geometry, mat: m.material as THREE.Material }
  }

  useScannedRocks(near: Array<{ geo: THREE.BufferGeometry; mat: THREE.Material }>, far: THREE.BufferGeometry, pebble?: { geo: THREE.BufferGeometry; mat: THREE.Material }): void {
    if (pebble) {
      this.meshes.pebble.geometry = pebble.geo
      this.meshes.pebble.material = pebble.mat
    }
    const kinds = ['rockA', 'rockB', 'rockC'] as const
    kinds.forEach((k, i) => {
      const src = near[i % near.length]
      this.meshes[k].geometry = src.geo
      this.meshes[k].material = src.mat
    })
    for (const m of this.sectors.get('rock') ?? [this.meshes.rock]) {
      m.geometry = far
      m.material = near[0].mat
    }
  }
  /** The near trees' shadow casters: [detailed (close), simple (farther)]. */
  private readonly shadeCast = new Map<Kind, [THREE.InstancedMesh, THREE.InstancedMesh]>()
  private readonly cells = new Map<number, CellData>()
  private readonly grassCells = new Map<number, Batch>()
  private readonly time = { value: 0 }
  private lastKey = NaN
  private since = 0
  private dirty = true
  private lakeSig = ''
  private readonly mat = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly up = new THREE.Vector3(0, 1, 0)
  private readonly v = new THREE.Vector3()
  private readonly s = new THREE.Vector3()
  private readonly col = new THREE.Color()
  stats = { trees: 0, rocks: 0, bushes: 0, grass: 0, reeds: 0, shrubs: 0 }
  /**
   * Ground a giant has just churned up stays bare for REGROW seconds of game
   * time; then grass, bushes and trees return (old craters, ancient trails).
   * 64 m cells → the game time they become green again.
   */
  private readonly churned = new Map<number, number>()
  private clockS = 0
  private sinceExpire = 0
  /** Called when churned ground greens over (the terrain recolours it). */
  onRegrow: (x0: number, z0: number, x1: number, z1: number) => void = () => {}

  constructor(
    private readonly terrain: Terrain,
    private readonly biome: Biome,
    private readonly lakes: LakeSystem,
    private readonly paint: PaintField,
    private readonly pave: PaintField,
    /** Something built here (no plant may stand on it). */
    private readonly occupied: (x: number, z: number) => boolean,
    /** The boulders' material (textured rock). */
    rockMat: THREE.MeshStandardMaterial,
  ) {
    const foliage = foliageTexture()
    for (const k of Object.keys(GEOMS) as Kind[]) {
      let mat: THREE.MeshStandardMaterial
      if (k === 'coniferNear' || k === 'broadNear' || k === 'coniferMid' || k === 'broadMid' || k === 'coniferFar' || k === 'broadFar' || k === 'bush' || k === 'shrub') mat = foliageMaterial(foliage, this.time, SWAY[k] || 0.004)
      else if (k === 'rock' || k === 'rockA' || k === 'rockB' || k === 'rockC' || k === 'pebble') mat = rockMat
      else {
        mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 })
        if (SWAY[k] > 0) this.sway(mat, SWAY[k])
      }
      const geo = GEOMS[k]()
      const sectored = SECTORED.includes(k)
      // (Distant kinds come in wedges round you, each culled on its own: the
      // trees behind you were all drawn every frame.)
      const cap = sectored ? Math.ceil(CAP[k] / 3) : CAP[k]
      const mesh = new THREE.InstancedMesh(geo, mat, cap)
      mesh.count = 0
      mesh.frustumCulled = sectored
      mesh.castShadow = k === 'coniferNear' || k === 'broadNear' || k === 'rock' || k === 'rockA' || k === 'rockB' || k === 'rockC'
      mesh.receiveShadow = k !== 'coniferMid' && k !== 'broadMid' && k !== 'coniferFar' && k !== 'broadFar'
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP[k] * 3), 3)
      this.meshes[k] = mesh
      this.group.add(mesh)
      if (sectored) {
        const list = [mesh]
        for (let s = 1; s < SECTORS; s++) {
          const m2 = new THREE.InstancedMesh(geo, mat, cap)
          m2.count = 0
          m2.frustumCulled = true
          m2.castShadow = mesh.castShadow
          m2.receiveShadow = mesh.receiveShadow
          m2.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3)
          this.group.add(m2)
          list.push(m2)
        }
        this.sectors.set(k, list)
      }
    }
    for (const [nearK, midK] of [['coniferNear', 'coniferMid'], ['broadNear', 'broadMid']] as const) {
      const near = this.meshes[nearK]
      near.castShadow = false
      const caster = (src: THREE.InstancedMesh) => {
        const m = new THREE.InstancedMesh(src.geometry, src.material, CAP[nearK])
        m.count = 0
        m.frustumCulled = false
        m.castShadow = true
        m.layers.set(SHADOW_ONLY)
        this.group.add(m)
        return m
      }
      this.shadeCast.set(nearK, [caster(near), caster(this.meshes[midK])])
    }
  }

  /** A little wind: tops move, roots do not; neighbouring plants out of step. */
  private sway(mat: THREE.MeshStandardMaterial, amount: number): void {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.time
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vPlantW;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 root = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float sway = sin(uTime * 1.3 + root.x * 0.07 + root.z * 0.05) * ${amount.toFixed(4)} * max(0.0, transformed.y);
        transformed.x += sway;
        transformed.z += sway * 0.6;
        vPlantW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;`,
      )
      // Right at the lens a tuft was a fan of huge yellow blades across the view: dissolved
      // there (an even 4×4 dither, as the trees' leaves).
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vPlantW;').replace(
        'void main() {',
        `void main() {
        {
          // (Over a narrow band, 1.3 – 1.7 m: over 0.7 – 2.2 m a blade crossing in front of the lens
          // half-dissolved for its whole length — a long dotted strip down the view, over the cloak
          // and the sand (tour review, 2026-11-08). Now a blade that close is gone, past it whole.)
          float near = smoothstep(1.3, 1.7, distance(vPlantW, cameraPosition));
          ivec2 b = ivec2(gl_FragCoord.xy) % 4;
          int i = b.x + b.y * 4;
          float th = float(i == 0 ? 0 : i == 1 ? 8 : i == 2 ? 2 : i == 3 ? 10 : i == 4 ? 12 : i == 5 ? 4 : i == 6 ? 14 : i == 7 ? 6 : i == 8 ? 3 : i == 9 ? 11 : i == 10 ? 1 : i == 11 ? 9 : i == 12 ? 15 : i == 13 ? 7 : i == 14 ? 13 : 5) / 16.0 + 1.0 / 32.0;
          if (near < th) discard;
        }`,
      )
    }
  }

  /** A giant just tore up this ground: bare for a while. */
  trample(x0: number, z0: number, x1: number, z1: number): void {
    const until = this.clockS + REGROW
    for (let cz = Math.floor(z0 / 64); cz <= Math.floor(z1 / 64); cz++) for (let cx = Math.floor(x0 / 64); cx <= Math.floor(x1 / 64); cx++) this.churned.set(key(cx, cz), until)
    this.markDirty(x0, z0, x1, z1)
  }

  /** Is this ground still raw from a giant's foot? */
  isFresh(x: number, z: number): boolean {
    const until = this.churned.get(key(Math.floor(x / 64), Math.floor(z / 64)))
    return until !== undefined && until > this.clockS
  }

  /**
   * Keep a walker out of the trees' trunks (the user, 2026-11-06: you walked straight through a tree).
   * Each trunk a circle — its own radius at the foot, by the tree's scale, plus the body's — pushed out
   * of sideways. Only cells already grown (nothing is generated for this). True if it moved.
   */
  trunkPush(p: THREE.Vector3): boolean {
    let moved = false
    const cx = Math.floor(p.x / CELL)
    const cz = Math.floor(p.z / CELL)
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.cells.get(key(cx + dx, cz + dz))
        if (!c) continue
        // (And the boulders lying about: a 3 m one was walk-through as well. Each by its geometry's
        // half-width, a little inside it — they are lumpy and round, not cylinders.)
        const rocks = (['rock', 'rockA', 'rockB', 'rockC'] as const).map((k) => [c[k], this.halfWidth(k) * 0.8] as const)
        for (const [b, r0] of [[c.conifer, 0.3], [c.broad, 0.55], ...rocks] as const) {
          if (!b) continue
          const m = b.m
          for (let i = 0; i < b.n; i++) {
            const tx = m[i * 16 + 12]
            const tz = m[i * 16 + 14]
            const ex = p.x - tx
            const ez = p.z - tz
            if (Math.abs(ex) > 3 || Math.abs(ez) > 3) continue
            const sc = Math.hypot(m[i * 16], m[i * 16 + 1], m[i * 16 + 2])
            // (A stone you would step over is no wall: only rocks wider than ~0.8 m stop you.)
            if (b !== c.conifer && b !== c.broad && r0 * sc < 0.4) continue
            const r = r0 * sc + 0.3
            const d = Math.hypot(ex, ez)
            if (d >= r || Math.abs(p.y - m[i * 16 + 13]) > 3) continue
            if (d < 1e-4) p.x = tx + r
            else {
              p.x = tx + (ex / d) * r
              p.z = tz + (ez / d) * r
            }
            moved = true
          }
        }
      }
    return moved
  }

  /** A kind's geometry's half-width across the ground (unscaled), measured once. */
  private halfWidth(k: Kind): number {
    let h = this.halfW.get(k)
    if (h === undefined) {
      const g = this.meshes[k]?.geometry
      if (!g) return 0
      g.computeBoundingBox()
      const b = g.boundingBox!
      h = Math.min(b.max.x - b.min.x, b.max.z - b.min.z) / 2
      this.halfW.set(k, h)
    }
    return h
  }
  private readonly halfW = new Map<Kind, number>()

  /** Is there a tree within `r` of (x, z)? (The reveal keeps them out of its shot.) */
  treeNear(x: number, z: number, r: number): boolean {
    const cx = Math.floor(x / CELL)
    const cz = Math.floor(z / CELL)
    let c = this.cells.get(key(cx, cz))
    if (!c) {
      c = this.genCell(cx, cz)
      this.cells.set(key(cx, cz), c)
    }
    for (const b of [c.conifer, c.broad]) {
      if (!b) continue
      const m = b.m
      for (let i = 0; i < b.n; i++) if ((m[i * 16 + 12] - x) ** 2 + (m[i * 16 + 14] - z) ** 2 < r * r) return true
    }
    return false
  }

  /** Terrain changed (or something was built) inside the box: regrow those cells. */
  markDirty(x0: number, z0: number, x1: number, z1: number): void {
    for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) this.cells.delete(key(cx, cz))
    for (let cz = Math.floor(z0 / GCELL); cz <= Math.floor(z1 / GCELL); cz++) for (let cx = Math.floor(x0 / GCELL); cx <= Math.floor(x1 / GCELL); cx++) this.grassCells.delete(key(cx, cz))
    this.dirty = true
  }

  update(dt: number, cam: THREE.Vector3): void {
    this.time.value += dt
    this.clockS += dt
    this.sinceExpire += dt
    if (this.sinceExpire > 2) {
      this.sinceExpire = 0
      for (const [k, until] of this.churned) {
        if (until > this.clockS) continue
        this.churned.delete(k)
        const cx = Math.floor(k / 65536) - 32768
        const cz = (k % 65536) - 32768
        this.markDirty(cx * 64, cz * 64, cx * 64 + 64, cz * 64 + 64)
        this.onRegrow(cx * 64, cz * 64, cx * 64 + 64, cz * 64 + 64)
      }
    }
    this.since += dt
    this.sinceLakes += dt
    // The lakes rose or spread: the shore plants move with them.
    if (this.sinceLakes > 2) {
      this.sinceLakes = 0
      const sig = this.lakes.lakes.map((l) => `${l.id}.${l.version}.${Math.round(l.level * 4)}`).join(',')
      if (sig !== this.lakeSig) {
        this.lakeSig = sig
        for (const l of this.lakes.lakes) this.markDirty(l.basin.x0 - 8, l.basin.z0 - 8, l.basin.x0 + l.basin.w + 8, l.basin.z0 + l.basin.h + 8)
      }
    }
    const k = key(Math.floor(cam.x / GCELL), Math.floor(cam.z / GCELL))
    // (Trees, rocks and bushes reach 1.4 km: repacking all of them — tens of thousands — every 24 m
    // and every 1.5 s even standing still was the forest's hitches, 6–9 ms frames 1 in 20 at a run.
    // Now the grass follows you cell by cell; the rest only every 48 m, or when something changed.)
    const tk = key(Math.floor(cam.x / TREE_STEP), Math.floor(cam.z / TREE_STEP))
    const trees = this.dirty || tk !== this.lastTreeKey
    if (k === this.lastKey && !trees) return
    // The cells it will need, made a few milliseconds a frame first (a giant's footfall unmakes
    // several: made all at once, with the repack, they were 34 ms of a 117 ms hitch — the user,
    // 2026-11-05, "whenever giants take a step, there is big frame lag"). The old trees stay up
    // until every new cell is ready.
    // (After a jump — loading, a waystone, a teleport — all of it at once, as before: nothing to
    // show meanwhile.)
    const jumped = Math.hypot(cam.x - this.prepAt.x, cam.z - this.prepAt.z) > 150
    if (!this.prepare(cam, jumped ? 60 : 2.5)) return
    this.prepAt.copy(cam)
    this.lastKey = k
    if (trees) this.lastTreeKey = tk
    this.since = 0
    this.dirty = false
    this.rebuild(cam, trees)
  }

  private lastTreeKey = -1
  /** The cell being made a few rows a frame. */
  private making: { k: number; g: Generator<void, CellData, void> } | null = null
  private sinceLakes = 0

  private readonly prepAt = new THREE.Vector3(1e9, 0, 1e9)

  /** Make missing cells round `cam` (nearest first) for up to `budgetMs`; true when none is missing. */
  private prepare(cam: THREE.Vector3, budgetMs: number): boolean {
    const t0 = performance.now()
    const r = Math.ceil(this.midR / CELL)
    const ccx = Math.floor(cam.x / CELL)
    const ccz = Math.floor(cam.z / CELL)
    let done = true
    for (let ring = 0; ring <= r; ring++) {
      for (let dz = -ring; dz <= ring; dz++)
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue
          const cx = ccx + dx
          const cz = ccz + dz
          if (Math.hypot((cx + 0.5) * CELL - cam.x, (cz + 0.5) * CELL - cam.z) >= this.midR + CELL) continue
          const kk = key(cx, cz)
          if (this.cells.has(kk)) continue
          if (!this.making || this.making.k !== kk) this.making = { k: kk, g: this.genCellSteps(cx, cz) }
          for (;;) {
            if (performance.now() - t0 > budgetMs) return false
            const st = this.making.g.next()
            if (st.done) {
              this.cells.set(kk, st.value)
              this.making = null
              break
            }
          }
          done = false
        }
    }
    const gr = Math.ceil(this.grassR / GCELL)
    const gcx = Math.floor(cam.x / GCELL)
    const gcz = Math.floor(cam.z / GCELL)
    for (let dz = -gr; dz <= gr; dz++)
      for (let dx = -gr; dx <= gr; dx++) {
        const cx = gcx + dx
        const cz = gcz + dz
        if (Math.hypot((cx + 0.5) * GCELL - cam.x, (cz + 0.5) * GCELL - cam.z) > this.grassR + GCELL) continue
        const kk = key(cx, cz)
        if (this.grassCells.has(kk)) continue
        if (performance.now() - t0 > budgetMs) return false
        this.grassCells.set(kk, this.genGrass(cx, cz))
        done = false
      }
    // (Made some this frame: the repack waits for the next, so both are not in one frame.)
    return done || performance.now() - t0 < budgetMs * 0.3
  }

  private rebuild(cam: THREE.Vector3, trees = true): void {
    const n: Record<Kind, number> = { coniferNear: 0, coniferMid: 0, coniferFar: 0, broadNear: 0, broadMid: 0, broadFar: 0, rock: 0, rockA: 0, rockB: 0, rockC: 0, pebble: 0, bush: 0, grass: 0, reed: 0, shrub: 0, fern: 0, stalk: 0 }
    // Copy a whole cell's batch in one go (as much as still fits).
    const sn = new Map<Kind, number[]>()
    for (const [k, list] of this.sectors) sn.set(k, list.map(() => 0))
    let sector = 0
    const push = (kind: Kind, b: Batch) => {
      const list = this.sectors.get(kind)
      const mesh = list ? list[sector] : this.meshes[kind]
      const counts = list ? sn.get(kind)! : null
      const at = counts ? counts[sector] : n[kind]
      const fit = Math.min(b.n, mesh.instanceMatrix.count - at)
      if (fit <= 0) return
      const m = b.m as Float32Array
      const c = b.c as Float32Array
      mesh.instanceMatrix.array.set(fit === b.n ? m : m.subarray(0, fit * 16), at * 16)
      mesh.instanceColor!.array.set(fit === b.n ? c : c.subarray(0, fit * 3), at * 3)
      if (counts) counts[sector] += fit
      n[kind] += fit
    }
    // Far trees thinned with distance (an even scatter kept, not whole rows dropped): out there
    // the ground's own canopy colour carries the forest, and the faint trees were most of what
    // the GPU was given in the Old Wood (745 k triangles in the Grove).
    const pushThin = (kind: Kind, b: Batch, keep: number) => {
      if (keep >= 0.999) return push(kind, b)
      const list = this.sectors.get(kind)
      const mesh = list ? list[sector] : this.meshes[kind]
      const counts = list ? sn.get(kind)! : null
      let at = counts ? counts[sector] : n[kind]
      const cap = mesh.instanceMatrix.count
      const m = b.m as Float32Array
      const c = b.c as Float32Array
      const im = mesh.instanceMatrix.array as Float32Array
      const ic = mesh.instanceColor!.array as Float32Array
      let added = 0
      for (let i = 0; i < b.n && at < cap; i++) {
        // (A fixed hash of the tree's own position: the same trees stay as you move.)
        const h = Math.abs(Math.sin(m[i * 16 + 12] * 12.9898 + m[i * 16 + 14] * 78.233) * 43758.5453) % 1
        if (h > keep) continue
        im.set(m.subarray(i * 16, i * 16 + 16), at * 16)
        ic.set(c.subarray(i * 3, i * 3 + 3), at * 3)
        at++
        added++
      }
      if (counts) counts[sector] += added
      n[kind] += added
    }
    // The near trees' shadows: each tree to the detailed or the simple caster by its distance.
    const shadeN = new Map<Kind, [number, number]>()
    for (const k of this.shadeCast.keys()) shadeN.set(k, [0, 0])
    const shade = (kind: Kind, b: Batch) => {
      const casters = this.shadeCast.get(kind)!
      const counts = shadeN.get(kind)!
      const m = b.m as Float32Array
      for (let i = 0; i < b.n; i++) {
        const j = Math.hypot(m[i * 16 + 12] - cam.x, m[i * 16 + 14] - cam.z) < SHADE_R ? 0 : 1
        if (counts[j] >= casters[j].instanceMatrix.count) continue
        casters[j].instanceMatrix.array.set(m.subarray(i * 16, i * 16 + 16), counts[j] * 16)
        counts[j]++
      }
    }
    // Trees, rocks, bushes, reeds: by cell, nearest first.
    const r = Math.ceil(this.midR / CELL)
    const ccx = Math.floor(cam.x / CELL)
    const ccz = Math.floor(cam.z / CELL)
    const order: Array<[number, number, number]> = []
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const cx = ccx + dx
        const cz = ccz + dz
        const d = Math.hypot((cx + 0.5) * CELL - cam.x, (cz + 0.5) * CELL - cam.z)
        if (d < this.midR + CELL) order.push([d, cx, cz])
      }
    }
    order.sort((a, b) => a[0] - b[0])
    if (!trees) order.length = 0
    for (const [d, cx, cz] of order) {
      // Which wedge round you this cell lies in.
      const ang = Math.atan2((cz + 0.5) * CELL - cam.z, (cx + 0.5) * CELL - cam.x)
      sector = Math.min(SECTORS - 1, Math.floor(((ang + Math.PI) / (Math.PI * 2)) * SECTORS))
      let c = this.cells.get(key(cx, cz))
      if (!c) {
        c = this.genCell(cx, cz)
        this.cells.set(key(cx, cz), c)
      }
      const near = d < this.nearR
      // (Three looks: detailed, simple, and faint — half the cards — past a few hundred metres.)
      const faint = d > Math.max(this.nearR * 1.6, this.midR * 0.45)
      for (const [src, nearKind, midKind, farKind] of [
        ['conifer', 'coniferNear', 'coniferMid', 'coniferFar'],
        ['broad', 'broadNear', 'broadMid', 'broadFar'],
      ] as const) {
        const b = c[src]
        if (b) {
          if (faint) pushThin(farKind, b, 1 - 0.6 * THREE.MathUtils.smoothstep(d, this.midR * 0.5, this.midR))
          else push(near ? nearKind : midKind, b)
        }
        if (b && near) shade(nearKind, b)
      }
      if (d < ROCK_NEAR) {
        if (c.rockA) push('rockA', c.rockA)
        if (c.rockB) push('rockB', c.rockB)
        if (c.rockC) push('rockC', c.rockC)
      } else if (d < this.midR * 0.55 && c.rock) push('rock', c.rock)
      if (d < PEBBLE_R && c.pebble) push('pebble', c.pebble)
      if (d < this.midR * 0.55) {
        if (c.bush) push('bush', c.bush)
      }
      if (d < this.midR * 0.85 && c.shrub) push('shrub', c.shrub)
      if (d < this.nearR && c.reed) push('reed', c.reed)
      if (d < this.nearR * 0.7 && c.fern) push('fern', c.fern)
      if (d < this.nearR * 0.8 && c.stalk) push('stalk', c.stalk)
    }
    // Grass and flowers, close by.
    const gr = Math.ceil(this.grassR / GCELL)
    const gcx = Math.floor(cam.x / GCELL)
    const gcz = Math.floor(cam.z / GCELL)
    for (let dz = -gr; dz <= gr; dz++) {
      for (let dx = -gr; dx <= gr; dx++) {
        const cx = gcx + dx
        const cz = gcz + dz
        if (Math.hypot((cx + 0.5) * GCELL - cam.x, (cz + 0.5) * GCELL - cam.z) > this.grassR + GCELL) continue
        let b = this.grassCells.get(key(cx, cz))
        if (!b) {
          b = this.genGrass(cx, cz)
          this.grassCells.set(key(cx, cz), b)
        }
        push('grass', b)
      }
    }
    for (const k of Object.keys(n) as Kind[]) {
      // (Grass only: the rest keeps what it holds.)
      if (!trees && k !== 'grass') continue
      const list = this.sectors.get(k)
      if (list) {
        const counts = sn.get(k)!
        list.forEach((mesh, s) => {
          mesh.count = counts[s]
          mesh.instanceMatrix.needsUpdate = true
          mesh.instanceColor!.needsUpdate = true
          // (Its bounds, for the culling: computed over the instances it holds now.)
          if (counts[s] > 0) mesh.computeBoundingSphere()
        })
        continue
      }
      const mesh = this.meshes[k]
      mesh.count = n[k]
      mesh.instanceMatrix.needsUpdate = true
      mesh.instanceColor!.needsUpdate = true
      if (CULLED[k]) {
        this.full.set(k, { m: (mesh.instanceMatrix.array as Float32Array).slice(0, n[k] * 16), c: (mesh.instanceColor!.array as Float32Array).slice(0, n[k] * 3), n: n[k] })
        this.cullDirty = true
      }
    }
    if (trees) for (const [k, casters] of this.shadeCast) {
      casters.forEach((m, j) => {
        m.count = shadeN.get(k)![j]
        m.instanceMatrix.needsUpdate = true
      })
    }
    if (trees) this.stats = {
      trees: n.coniferNear + n.coniferMid + n.broadNear + n.broadMid,
      rocks: n.rock,
      bushes: n.bush,
      grass: n.grass,
      reeds: n.reed,
      shrubs: n.shrub,
    }
    // Keep the caches from growing without bound as the camera roams.
    if (this.cells.size > 1800) this.cells.clear()
    if (this.grassCells.size > 2500) this.grassCells.clear()
  }

  // --- generation ------------------------------------------------------------

  /** Can a plant stand here? Dry, unpaved, unbuilt, untrodden, not too steep, not alpine. */
  private ground(x: number, z: number, maxH = 250): number | null {
    const h = this.terrain.heightAt(x, z)
    if (h > maxH) return null
    if (Math.abs(this.terrain.delta.sample(x, z)) > 0.6 && this.isFresh(x, z)) return null
    if (this.paint.at(x, z) > 0.25 || this.pave.at(x, z) > 0.1) return null
    if (this.occupied(x, z)) return null
    if (this.wet(x, z, 0)) return null
    // (Nothing growing on the sea's bed.)
    if (h < SHORE.sea + 0.4 && seaward(x, z)) return null
    // Steeper than ~35°, measured both ways (one-sided, a slope falling away to −x or −z passed).
    const hx0 = this.terrain.heightAt(x - 2, z)
    const hx1 = this.terrain.heightAt(x + 2, z)
    const hz0 = this.terrain.heightAt(x, z - 2)
    const hz1 = this.terrain.heightAt(x, z + 2)
    const sx = Math.max(Math.abs(hx1 - h), Math.abs(h - hx0))
    const sz = Math.max(Math.abs(hz1 - h), Math.abs(h - hz0))
    if (sx * sx + sz * sz > 2.2) return null
    // A ledge on a cliff face, or its lip: the ground drops away sharply close by (Q49: small trees
    // stood on a sheer wall, on its narrow flat steps).
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      if (this.terrain.heightAt(x + Math.cos(a) * 3, z + Math.sin(a) * 3) < h - 3.5) return null
    }
    return h
  }

  /**
   * A wall within a crown's reach: ground 3 m round that stands well above the trunk's foot (QA cycle
   * 6: firs at a cliff's foot pushed their branches out through the rock face — black chevrons on a
   * sunlit wall).
   */
  private walled(x: number, z: number, h: number): boolean {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      for (const r of [2.5, 4.5]) if (this.terrain.heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r) > h + r * 0.9 + 1.2) return true
    }
    return false
  }

  /**
   * 1 where trees may stand, 0 on the Dune Sea's sand. (The ground turns to sand in step with the
   * desert's weight, but trees only thinned out in step with it too: across the border band the
   * ground already read as sand while half the wood still stood on it — the flyover, 2026-11-08,
   * forest trees in open dunes. Gone by the time sand is a third of the ground.)
   */
  private notSand(x: number, z: number): number {
    // (And none in the Tallgrass: the grass is the forest there — tallgrass.ts.)
    return (1 - THREE.MathUtils.smoothstep(this.biome.desert(x, z), 0.1, 0.35)) * (1 - THREE.MathUtils.smoothstep(tallAt(x, z), 0.05, 0.4))
  }

  private wet(x: number, z: number, margin: number): boolean {
    const ix = Math.round(x)
    const iz = Math.round(z)
    for (const l of this.lakes.lakes) if (inBasin(l.basin, ix, iz) && l.level > this.terrain.cellHeight(ix, iz) - margin) return true
    return false
  }

  private add(b: Batch, x: number, y: number, z: number, rot: number, sx: number, sy: number, color: THREE.Color): void {
    this.q.setFromAxisAngle(this.up, rot)
    this.mat.compose(this.v.set(x, y, z), this.q, this.s.set(sx, sy, sx))
    const m = b.m as number[]
    for (let i = 0; i < 16; i++) m.push(this.mat.elements[i])
    ;(b.c as number[]).push(color.r, color.g, color.b)
    b.n++
  }

  /** A cell, made all at once. */
  private genCell(cx: number, cz: number): CellData {
    const g = this.genCellSteps(cx, cz)
    for (;;) {
      const r = g.next()
      if (r.done) return r.value
    }
  }

  /**
   * A cell, made a few rows at a time (`prepare` steps it within its budget). A whole one is ~8 ms —
   * made at once, every new cell coming into view was a missed frame at a run (the forest's 1-in-20
   * hitches, more with the trees reaching 1.4 km). Same random stream, so the same cell either way.
   */
  private *genCellSteps(cx: number, cz: number): Generator<void, CellData, void> {
    const rand = mulberry32((cx * 73856093) ^ (cz * 19349663) ^ 0x5bd1e995)
    const out: CellData = {}
    const batch = (k: keyof CellData) => (out[k] ??= { m: [], c: [], n: 0 })
    const x0 = cx * CELL
    const z0 = cz * CELL
    // Trees on a jittered 7 m grid: dense in forests, the odd lone tree in the open.
    for (let gz = 0; gz < CELL; gz += 7) {
      yield
      for (let gx = 0; gx < CELL; gx += 7) {
        const x = x0 + gx + rand() * 7
        const z = z0 + gz + rand() * 7
        const f = this.biome.forest(x, z)
        const cp = this.biome.copse(x, z)
        // No trees in the Dune Sea.
        // (No living trees in the Mire: only the drowned ones, mire.ts.)
        const p = (f > 0.45 ? 0.2 + f * 0.62 : (f * 0.06 + 0.011) * (1 - 0.9 * this.biome.open(x, z)) + cp * 0.42) * this.notSand(x, z) * (1 - this.biome.mire(x, z))
        if (rand() > p) continue
        const h = this.ground(x, z, 400)
        if (h === null || this.walled(x, z, h)) continue
        const conifer = h > 160 || rand() < 0.45
        const sc = 0.75 + rand() * 0.65
        const tint = 0.82 + rand() * 0.3
        this.col.setRGB(tint * (0.95 + rand() * 0.1), tint, tint * (0.9 + rand() * 0.1))
        this.add(batch(conifer ? 'conifer' : 'broad'), x, h - 0.3, z, rand() * 6.28, sc, sc * (0.85 + rand() * 0.35), this.col)
      }
    }
    yield
    // Boulders: scattered everywhere, more on rough ground.
    for (let i = 0; i < 7; i++) {
      const x = x0 + rand() * CELL
      const z = z0 + rand() * CELL
      if (rand() > 0.55 * (1 - 0.7 * this.biome.open(x, z))) continue
      const h = this.ground(x, z, 400)
      if (h === null) continue
      const sc = 0.5 + rand() * rand() * 2.8
      // The rock texture is warm brown: toward grey here, toward red in the Dune Sea.
      const t = 0.8 + rand() * 0.3
      const d = this.biome.desert(x, z)
      // (Scanned stone carries its own colour: only a mild tint now — a little warmer and redder in
      // the Dune Sea, a touch cooler on the Green.)
      // (The scans are Namaqualand granite, orange with lichen: cooled toward grey on the Green.)
      this.col.setRGB(t * (0.84 + 0.18 * d), t * (0.94 - 0.02 * d), t * (1.0 - 0.16 * d))
      const ry = rand() * 6.28
      const sy = sc * (0.7 + rand() * 0.6)
      this.add(batch('rock'), x, h - sc * 0.15, z, ry, sc, sy, this.col)
      // (Which broken shape, from where it lies — not from the cell's draws, so nothing else moves.)
      const vk = (['rockA', 'rockB', 'rockC'] as const)[Math.abs(Math.floor(x * 7.31) + Math.floor(z * 3.17)) % 3]
      this.add(batch(vk), x, h - sc * 0.15, z, ry, sc, sy, this.col)
    }
    yield
    // Small stones in the grass (graphics pass, 2026-11-04: ground with nothing on it but grass read
    // as a lawn): a couple of hundred a cell (one in ~40 m²), mostly a hand's width, now and then a
    // fist or a loaf. (At a third of that you never saw one.)
    for (let i = 0; i < 220; i++) {
      const x = x0 + rand() * CELL
      const z = z0 + rand() * CELL
      const h = this.ground(x, z, 400)
      if (h === null) continue
      // (Sized to show over the grass: at 6–35 cm they were all hidden in it.)
      const sc = 0.12 + rand() * rand() * 0.38
      // (The pebble scan is a dark brown stone: lifted and cooled toward the boulders' grey — as it
      // came it read as dark holes in the grass.)
      const t = 1.25 + rand() * 0.45
      const d = this.biome.desert(x, z)
      this.col.setRGB(t * (1.05 + 0.2 * d), t * (1.2 - 0.05 * d), t * (1.45 - 0.3 * d))
      this.add(batch('pebble'), x, h - sc * 0.08, z, rand() * 6.28, sc, sc * (0.75 + rand() * 0.5), this.col)
    }
    yield
    // Bushes: along forest edges and near water.
    for (let i = 0; i < 30; i++) {
      const x = x0 + rand() * CELL
      const z = z0 + rand() * CELL
      const f = this.biome.forest(x, z)
      const edge = (f > 0.15 && f < 0.6 ? 0.45 : 0.12 + this.biome.copse(x, z) * 0.4) * this.notSand(x, z) * (1 - 0.85 * this.biome.mire(x, z))
      const waterSide = this.wet(x, z, 3) ? 0 : this.wet(x + 4, z, 0.2) || this.wet(x - 4, z, 0.2) || this.wet(x, z + 4, 0.2) || this.wet(x, z - 4, 0.2) ? 0.7 * this.notSand(x, z) : 0
      if (rand() > edge + waterSide) continue
      const h = this.ground(x, z)
      if (h === null) continue
      const sc = 0.7 + rand() * 0.9
      const t = 0.8 + rand() * 0.35
      this.col.setRGB(t, t, t * 0.9)
      this.add(batch('bush'), x, h - 0.1, z, rand() * 6.28, sc, sc, this.col)
    }
    yield
    // Scrub across the plain, thick in places, thin in others.
    for (let i = 0; i < 70; i++) {
      const x = x0 + rand() * CELL
      const z = z0 + rand() * CELL
      if (rand() > this.biome.scrub(x, z) * 0.75) continue
      const h = this.ground(x, z, 220)
      if (h === null) continue
      const sc = 0.55 + rand() * 1.1
      const t = 0.75 + rand() * 0.45
      // Dry, grey-brown scrub in the Dune Sea; green elsewhere.
      const d = this.biome.desert(x, z)
      this.col.setRGB(t * (1 + 0.75 * d), t * (0.95 + rand() * 0.1) * (1 + 0.35 * d), t * 0.85 * (1 + 0.45 * d))
      this.add(batch('shrub'), x, h - 0.15, z, rand() * 6.28, sc * (1 - 0.35 * d), sc * (0.7 + rand() * 0.6) * (1 - 0.35 * d), this.col)
    }
    yield
    // Ferns on the woods' floor; tall flowering stems out on the Green's meadows.
    for (let i = 0; i < 420; i++) {
      const x = x0 + rand() * CELL
      const z = z0 + rand() * CELL
      const f = this.biome.forest(x, z)
      const open = this.biome.open(x, z)
      const meadow = this.biome.meadow(x, z)
      const roll = rand()
      // (Into the clearings' edges too: a fern-line is where a wood begins.)
      if (f > 0.15 && roll < 0.15 + f * 0.6) {
        // (The lands stand higher since the world grew: woods to ~400 m.)
        const h = this.ground(x, z, 450)
        if (h === null) continue
        const sc = 0.7 + rand() * 0.7
        const t = 0.8 + rand() * 0.35
        this.col.setRGB(t, t, t * 0.9)
        this.add(batch('fern'), x, h - 0.05, z, rand() * 6.28, sc, sc * (0.8 + rand() * 0.4), this.col)
      } else if (open > 0.5 && roll < 0.11 * meadow * open) {
        const h = this.ground(x, z, 450)
        if (h === null) continue
        const sc = 0.8 + rand() * 0.5
        this.col.setRGB(1, 1, 1)
        this.add(batch('stalk'), x, h - 0.05, z, rand() * 6.28, sc, sc * (0.8 + rand() * 0.5), this.col)
      }
    }
    yield
    // Reeds round the Mire's pools, thick on the banks.
    if (this.biome.mire(x0 + CELL / 2, z0 + CELL / 2) > 0.2) {
      for (let i = 0; i < 260; i++) {
        const x = x0 + rand() * CELL
        const z = z0 + rand() * CELL
        const bank = poolBowl(x, z)
        if (bank < 0.04 || bank > 0.55 || rand() > this.biome.mire(x, z)) continue
        const sc = 0.8 + rand() * 0.7
        const t = 0.7 + rand() * 0.3
        this.col.setRGB(t * 0.9, t, t * 0.75)
        this.add(batch('reed'), x, this.terrain.heightAt(x, z) - 0.1, z, rand() * 6.28, sc, sc, this.col)
      }
    }
    yield
    // Reeds in the shallows of the Titans' lakes.
    for (const l of this.lakes.lakes) {
      const b = l.basin
      if (l.level <= b.bottom + 0.3 || b.x0 > x0 + CELL || b.x0 + b.w < x0 || b.z0 > z0 + CELL || b.z0 + b.h < z0) continue
      for (let i = 0; i < 220; i++) {
        const x = x0 + rand() * CELL
        const z = z0 + rand() * CELL
        const ix = Math.round(x)
        const iz = Math.round(z)
        if (!inBasin(b, ix, iz)) continue
        const depth = l.level - this.terrain.cellHeight(ix, iz)
        if (depth < -0.2 || depth > 0.7) continue
        const sc = 0.8 + rand() * 0.6
        const t = 0.85 + rand() * 0.3
        this.col.setRGB(t, t, t * 0.85)
        this.add(batch('reed'), x, this.terrain.heightAt(x, z) - 0.1, z, rand() * 6.28, sc, sc, this.col)
      }
    }
    for (const k of Object.keys(out) as Array<keyof CellData>) out[k] = pack(out[k]!)
    return out
  }

  private genGrass(cx: number, cz: number): Batch {
    const rand = mulberry32((cx * 83492791) ^ (cz * 2971215073) ^ 0x1234)
    const b: Batch = { m: [], c: [], n: 0 }
    const x0 = cx * GCELL
    const z0 = cz * GCELL
    for (let i = 0; i < 280; i++) {
      const x = x0 + rand() * GCELL
      const z = z0 + rand() * GCELL
      const meadow = this.biome.meadow(x, z)
      const forest = this.biome.forest(x, z)
      const desert = this.biome.desert(x, z)
      if (rand() > (0.35 + meadow * 0.5 - forest * 0.3) * (1 - 0.8 * desert)) continue
      const h = this.ground(x, z, 200)
      if (h === null) continue
      const flowers = this.biome.flowers(x, z)
      // The grass itself is grass.ts; here, wildflowers and the odd tall tuft.
      const flower = rand() < flowers * 0.35
      if (!flower && rand() < 0.8) continue
      if (flower) {
        // A wildflower tuft: white, yellow or violet (sRGB).
        const pick = rand()
        if (pick < 0.4) this.col.setRGB(0.93, 0.92, 0.86, SRGB)
        else if (pick < 0.75) this.col.setRGB(0.95, 0.8, 0.25, SRGB)
        else this.col.setRGB(0.66, 0.5, 0.86, SRGB)
      } else {
        // Grass, from dry straw to a muted green with the meadow (sRGB).
        const v = 0.88 + rand() * 0.2
        const green = meadow * (1 - desert)
        this.col.setRGB((0.68 - green * 0.24) * v, (0.6 - green * 0.04) * v, (0.33 - green * 0.08) * v, SRGB)
      }
      const sc = 0.55 + rand() * 0.55
      this.add(b, x, h - 0.05, z, rand() * 6.28, sc, sc * (0.8 + rand() * 0.6), this.col)
    }
    return pack(b)
  }
}

function key(cx: number, cz: number): number {
  return (cx + 32768) * 65536 + (cz + 32768)
}
