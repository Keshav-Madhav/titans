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
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { broadleafGeometry, bushGeometry, coniferGeometry, foliageMaterial, foliageTexture } from './trees'
import { inBasin, makeSimplex2, mulberry32, poolBowl, type LakeSystem, type Terrain } from '@titans/shared'
import { LAYER } from './terrain-material'
import type { Biome } from './biome'
import type { PaintField } from './paint'

const CELL = 96
/** Seconds of game time before churned ground greens over. */
const REGROW = 300
const GCELL = 24 // grass cells

type Kind = 'coniferNear' | 'coniferMid' | 'broadNear' | 'broadMid' | 'rock' | 'bush' | 'grass' | 'reed' | 'shrub' | 'fern' | 'stalk'
const CAP: Record<Kind, number> = {
  coniferNear: 7000,
  coniferMid: 26000,
  broadNear: 7000,
  broadMid: 26000,
  rock: 5000,
  bush: 9000,
  grass: 34000,
  reed: 6000,
  shrub: 40000,
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
type CellData = Partial<Record<'conifer' | 'broad' | 'rock' | 'bush' | 'reed' | 'shrub' | 'fern' | 'stalk', Batch>>

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

function lumpy(g: THREE.BufferGeometry, seed: number, amt: number): THREE.BufferGeometry {
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  g = mergeVertices(g, 1e-4)
  const n = makeSimplex2(seed)
  const p = g.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const k = 1 + amt * n(x * 1.7 + y, z * 1.7 - y)
    p.setXYZ(i, x * k, y * k, z * k)
  }
  g.computeVertexNormals()
  return g
}


const SRGB = THREE.SRGBColorSpace

const GEOMS: Record<Kind, () => THREE.BufferGeometry> = {
  // Up close: leaf-card trees (trees.ts). Farther: simple shapes in the same colours.
  coniferNear: () => coniferGeometry(41),
  coniferMid: () => coniferGeometry(41, true),
  broadNear: () => broadleafGeometry(11),
  broadMid: () => broadleafGeometry(11, true),
  // Boulders: lumpy, flattened, textured as rock (rocks.ts' tri-planar material).
  rock: () => rockLayers(colored(lumpy(lumpy(new THREE.IcosahedronGeometry(1, 3), 21, 0.22), 22, 0.08).scale(1.1, 0.68, 0.95), 0xffffff)),
  // Bushes and scrub: clumps of leaf cards, as the trees are.
  bush: () => bushGeometry(31, 12),
  shrub: () => bushGeometry(37, 4, 0.7),
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
  // A fern: fronds arching out from a crown, each a long tapering leaf bent down at the tip.
  fern: () => {
    const parts: THREE.BufferGeometry[] = []
    const fronds = 8
    for (let i = 0; i < fronds; i++) {
      const a = (i / fronds) * Math.PI * 2 + (i % 2) * 0.3
      const L = 0.85 + (i % 3) * 0.15
      const pos: number[] = []
      const segs = 6
      for (let k = 0; k < segs; k++) {
        const t0 = k / segs
        const t1 = (k + 1) / segs
        // Out and up, then over (a parabola), narrowing to the tip.
        const at = (t: number) => [Math.cos(a) * L * t, 0.55 * t - 0.62 * t * t + 0.05, Math.sin(a) * L * t]
        const w0 = 0.13 * (1 - t0) + 0.01
        const w1 = 0.13 * (1 - t1) + 0.01
        const p0 = at(t0)
        const p1 = at(t1)
        const sx = -Math.sin(a)
        const sz = Math.cos(a)
        const A = [p0[0] - sx * w0, p0[1], p0[2] - sz * w0]
        const B = [p0[0] + sx * w0, p0[1], p0[2] + sz * w0]
        const C = [p1[0] + sx * w1, p1[1], p1[2] + sz * w1]
        const D = [p1[0] - sx * w1, p1[1], p1[2] - sz * w1]
        pos.push(...A, ...B, ...C, ...A, ...C, ...D, ...B, ...A, ...C, ...C, ...A, ...D)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      const nrm = new Float32Array(pos.length)
      for (let j = 1; j < nrm.length; j += 3) nrm[j] = 1
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
      parts.push(colored(g, i % 2 ? 0x3f6a2a : 0x4c7a30))
    }
    return mergeGeometries(parts)!
  },
  // A stand of tall flowering stems: thin stalks, a pale head at the top of each.
  stalk: () => {
    const parts: THREE.BufferGeometry[] = []
    for (let i = 0; i < 4; i++) {
      const a = i * 2.1
      const ox = Math.cos(a) * 0.12
      const oz = Math.sin(a) * 0.12
      const h = 0.9 + (i % 2) * 0.35
      parts.push(colored(new THREE.CylinderGeometry(0.008, 0.012, h, 4).translate(ox, h / 2, oz).toNonIndexed(), 0x5d7036))
      parts.push(colored(new THREE.IcosahedronGeometry(0.055, 0).scale(1, 1.6, 1).translate(ox, h + 0.04, oz), [0xe8e2d0, 0xd9b8d8, 0xe8c66a, 0xc9d6e8][i]))
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

const SWAY: Record<Kind, number> = { coniferNear: 0.01, coniferMid: 0.008, broadNear: 0.014, broadMid: 0.01, rock: 0, bush: 0.03, grass: 0.16, reed: 0.1, shrub: 0, fern: 0.05, stalk: 0.14 }

export class Vegetation {
  readonly group = new THREE.Group()
  nearR = 240
  midR = 750
  grassR = 70
  private readonly meshes = {} as Record<Kind, THREE.InstancedMesh>
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
      if (k === 'coniferNear' || k === 'broadNear' || k === 'coniferMid' || k === 'broadMid' || k === 'bush' || k === 'shrub') mat = foliageMaterial(foliage, this.time, SWAY[k] || 0.004)
      else if (k === 'rock') mat = rockMat
      else {
        mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 })
        if (SWAY[k] > 0) this.sway(mat, SWAY[k])
      }
      const mesh = new THREE.InstancedMesh(GEOMS[k](), mat, CAP[k])
      mesh.count = 0
      mesh.frustumCulled = false
      mesh.castShadow = k === 'coniferNear' || k === 'broadNear' || k === 'rock'
      mesh.receiveShadow = k !== 'coniferMid' && k !== 'broadMid'
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP[k] * 3), 3)
      this.meshes[k] = mesh
      this.group.add(mesh)
    }
  }

  /** A little wind: tops move, roots do not; neighbouring plants out of step. */
  private sway(mat: THREE.MeshStandardMaterial, amount: number): void {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.time
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 root = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float sway = sin(uTime * 1.3 + root.x * 0.07 + root.z * 0.05) * ${amount.toFixed(4)} * max(0.0, transformed.y);
        transformed.x += sway;
        transformed.z += sway * 0.6;`,
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
    // The lakes rose or spread: the shore plants move with them.
    if (this.since > 2) {
      const sig = this.lakes.lakes.map((l) => `${l.id}.${l.version}.${Math.round(l.level * 4)}`).join(',')
      if (sig !== this.lakeSig) {
        this.lakeSig = sig
        for (const l of this.lakes.lakes) this.markDirty(l.basin.x0 - 8, l.basin.z0 - 8, l.basin.x0 + l.basin.w + 8, l.basin.z0 + l.basin.h + 8)
      }
    }
    const k = key(Math.floor(cam.x / GCELL), Math.floor(cam.z / GCELL))
    if (k === this.lastKey && !this.dirty && this.since < 1.5) return
    this.lastKey = k
    this.since = 0
    this.dirty = false
    this.rebuild(cam)
  }

  private rebuild(cam: THREE.Vector3): void {
    const n: Record<Kind, number> = { coniferNear: 0, coniferMid: 0, broadNear: 0, broadMid: 0, rock: 0, bush: 0, grass: 0, reed: 0, shrub: 0, fern: 0, stalk: 0 }
    // Copy a whole cell's batch in one go (as much as still fits).
    const push = (kind: Kind, b: Batch) => {
      const fit = Math.min(b.n, CAP[kind] - n[kind])
      if (fit <= 0) return
      const mesh = this.meshes[kind]
      const m = b.m as Float32Array
      const c = b.c as Float32Array
      mesh.instanceMatrix.array.set(fit === b.n ? m : m.subarray(0, fit * 16), n[kind] * 16)
      mesh.instanceColor!.array.set(fit === b.n ? c : c.subarray(0, fit * 3), n[kind] * 3)
      n[kind] += fit
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
    for (const [d, cx, cz] of order) {
      let c = this.cells.get(key(cx, cz))
      if (!c) {
        c = this.genCell(cx, cz)
        this.cells.set(key(cx, cz), c)
      }
      const near = d < this.nearR
      for (const [src, nearKind, midKind] of [
        ['conifer', 'coniferNear', 'coniferMid'],
        ['broad', 'broadNear', 'broadMid'],
      ] as const) {
        const b = c[src]
        if (b) push(near ? nearKind : midKind, b)
      }
      if (d < this.midR * 0.55) {
        if (c.rock) push('rock', c.rock)
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
      const mesh = this.meshes[k]
      mesh.count = n[k]
      mesh.instanceMatrix.needsUpdate = true
      mesh.instanceColor!.needsUpdate = true
    }
    this.stats = {
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
    const sx = this.terrain.heightAt(x + 2, z) - h
    const sz = this.terrain.heightAt(x, z + 2) - h
    if (sx * sx + sz * sz > 2.2) return null // steeper than ~35°
    return h
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

  private genCell(cx: number, cz: number): CellData {
    const rand = mulberry32((cx * 73856093) ^ (cz * 19349663) ^ 0x5bd1e995)
    const out: CellData = {}
    const batch = (k: keyof CellData) => (out[k] ??= { m: [], c: [], n: 0 })
    const x0 = cx * CELL
    const z0 = cz * CELL
    // Trees on a jittered 7 m grid: dense in forests, the odd lone tree in the open.
    for (let gz = 0; gz < CELL; gz += 7) {
      for (let gx = 0; gx < CELL; gx += 7) {
        const x = x0 + gx + rand() * 7
        const z = z0 + gz + rand() * 7
        const f = this.biome.forest(x, z)
        const cp = this.biome.copse(x, z)
        // No trees in the Dune Sea.
        // (No living trees in the Mire: only the drowned ones, mire.ts.)
        const p = (f > 0.45 ? 0.2 + f * 0.62 : (f * 0.06 + 0.011) * (1 - 0.9 * this.biome.open(x, z)) + cp * 0.42) * (1 - this.biome.desert(x, z)) * (1 - this.biome.mire(x, z))
        if (rand() > p) continue
        const h = this.ground(x, z, 400)
        if (h === null) continue
        const conifer = h > 160 || rand() < 0.45
        const sc = 0.75 + rand() * 0.65
        const tint = 0.82 + rand() * 0.3
        this.col.setRGB(tint * (0.95 + rand() * 0.1), tint, tint * (0.9 + rand() * 0.1))
        this.add(batch(conifer ? 'conifer' : 'broad'), x, h - 0.3, z, rand() * 6.28, sc, sc * (0.85 + rand() * 0.35), this.col)
      }
    }
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
      this.col.setRGB(t * (1.1 + 0.2 * d), t * (1.28 - 0.18 * d), t * (1.5 - 0.55 * d))
      this.add(batch('rock'), x, h - sc * 0.25, z, rand() * 6.28, sc, sc * (0.7 + rand() * 0.6), this.col)
    }
    // Bushes: along forest edges and near water.
    for (let i = 0; i < 30; i++) {
      const x = x0 + rand() * CELL
      const z = z0 + rand() * CELL
      const f = this.biome.forest(x, z)
      const edge = (f > 0.15 && f < 0.6 ? 0.45 : 0.12 + this.biome.copse(x, z) * 0.4) * (1 - this.biome.desert(x, z)) * (1 - 0.85 * this.biome.mire(x, z))
      const waterSide = this.wet(x, z, 3) ? 0 : this.wet(x + 4, z, 0.2) || this.wet(x - 4, z, 0.2) || this.wet(x, z + 4, 0.2) || this.wet(x, z - 4, 0.2) ? 0.7 * (1 - this.biome.desert(x, z)) : 0
      if (rand() > edge + waterSide) continue
      const h = this.ground(x, z)
      if (h === null) continue
      const sc = 0.7 + rand() * 0.9
      const t = 0.8 + rand() * 0.35
      this.col.setRGB(t, t, t * 0.9)
      this.add(batch('bush'), x, h - 0.1, z, rand() * 6.28, sc, sc, this.col)
    }
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
