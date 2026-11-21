// Quadtree LOD terrain (CDLOD-style). Every chunk is N × N quads (64, or 32
// at the lowest quality) plus skirts, from 64 m leaves (1 m per quad, matching the delta resolution) up to
// a 32 km root centred on the origin. Splitting uses 3D camera distance, so a
// Titan's high camera automatically gets coarser, wider terrain.
//
// The displayed set is always a complete cover: a chunk being split or merged
// stays on screen until every replacement is built, so LOD changes never open
// holes. Builds are time-sliced to a per-frame budget.

import * as THREE from 'three'
import { makeSimplex2, poolBowl, smoothstep, type Noise2, type RegionWeights, type Terrain } from '@titans/shared'
import { makeDetailTexture } from './detail-texture'
import type { Biome } from './biome'
import { LAYER, makeTerrainMaterial, type TerrainTextures } from './terrain-material'
import { tallAt } from './tallgrass'

const ROOT = 65536
const LEAF = 64
const MAX_LEVEL = Math.round(Math.log2(ROOT / LEAF))
/** Chunks this size (metres) and up are built on the half-resolution grid. */
const FAR_CHUNK = 1024
/** Chunks this size (metres) and up split by farSplitK. */
const FAR_SPLIT_FROM = 2048
/**
 * The far chunks (FAR_CHUNK and up) are drawn together, one batch: the ring of land and mountains out to
 * the horizon was 80-120 draw calls a frame on its own — most of the land's draws (2026-11-21; ~2 ms a
 * frame here, ~5 on a slow CPU). Slots are sized for the finest far grid (32 quads) so a coarser one fits
 * the same slot; up to FAR_SLOTS of them (some 420-430 are shown at once, more are kept for coming back).
 */
const FAR_SLOTS = 640
const FAR_MAX_N = 32
interface FarSlot {
  geom: number
  inst: number
}

/** Everything that depends on the chunk resolution N (quads per side). */
interface Grid {
  N: number
  ROW: number
  GRID_VERTS: number
  VERTS: number
  H_ROW: number // heights with a one-sample border, for normals
  index: THREE.BufferAttribute
  edges: Int32Array
}

function makeGrid(N: number): Grid {
  const ROW = N + 1
  const GRID_VERTS = ROW * ROW
  const edges = edgeOrder(N)
  return { N, ROW, GRID_VERTS, VERTS: GRID_VERTS + 4 * ROW, H_ROW: N + 3, index: buildIndex(N, edges), edges }
}
/** The finest far grid: what a far slot is sized for. */
const FAR_GRID_MAX = makeGrid(FAR_MAX_N)

interface Chunk {
  key: number
  level: number
  x0: number
  z0: number
  size: number
  mesh: THREE.Mesh | null
  /** A far chunk is drawn from a slot in the far batch (TerrainView.farBatch), not a mesh of its own. */
  far: FarSlot | null
  dirty: boolean
  lastSeen: number
  /** Its base heights (the noise: the expensive part), kept — a giant's step changes only the delta. */
  base?: Float32Array
}

function nodeKey(level: number, ix: number, iz: number): number {
  return (level * 1048576 + ix) * 1048576 + iz
}

function buildIndex(N: number, edges: Int32Array): THREE.BufferAttribute {
  const ROW = N + 1
  const GRID_VERTS = ROW * ROW
  const idx: number[] = []
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * ROW + i
      const b = a + 1
      const c = a + ROW
      const d = c + 1
      // Diagonals alternate in a checkerboard: steep walls fold into a mesh
      // of diamonds instead of rows of identical saw teeth.
      if ((i + j) & 1) idx.push(a, c, d, a, d, b)
      else idx.push(a, c, b, b, c, d)
    }
  }
  // Skirts: each edge strip, both windings (cheaper than a double-sided material).
  for (let e = 0; e < 4; e++) {
    for (let k = 0; k < N; k++) {
      const v0 = edges[e * ROW + k]
      const v1 = edges[e * ROW + k + 1]
      const s0 = GRID_VERTS + e * ROW + k
      const s1 = s0 + 1
      idx.push(v0, v1, s1, v0, s1, s0, v0, s1, v1, v0, s0, s1)
    }
  }
  return new THREE.BufferAttribute(new Uint16Array(idx), 1)
}

/** Grid-vertex indices along the four edges, ROW per edge. */
function edgeOrder(N: number): Int32Array {
  const ROW = N + 1
  const out = new Int32Array(4 * ROW)
  for (let k = 0; k < ROW; k++) {
    out[k] = k // z = z0
    out[ROW + k] = N * ROW + k // z = z0 + size
    out[2 * ROW + k] = k * ROW // x = x0
    out[3 * ROW + k] = k * ROW + N // x = x0 + size
  }
  return out
}

export class TerrainView {
  readonly group = new THREE.Group()
  readonly material: THREE.MeshStandardMaterial
  private readonly chunks = new Map<number, Chunk>()
  private grid = makeGrid(64)
  private farGrid = makeGrid(32)
  private heights = new Float32Array(67 * 67)
  private deltas = new Float32Array(67 * 67)
  private readonly detail: Noise2
  private readonly centreH = new Map<number, number>()
  private shown = new Set<number>()
  /** The far chunks' batch, its free slots, and the scratch geometry a far chunk is built in. */
  private farBatch: THREE.BatchedMesh | null = null
  private farFree: FarSlot[] = []
  private farSlots = 0
  private farScratch: THREE.BufferGeometry | null = null
  /** Has something to draw (a mesh, or a far slot). */
  private has(c: Chunk): boolean {
    return !!c.mesh || !!c.far
  }
  private setShown(c: Chunk, v: boolean): void {
    if (c.mesh) c.mesh.visible = v
    else if (c.far) this.farBatch!.setVisibleAt(c.far.inst, v)
  }
  /** A slot for a far chunk: a free one, a new one, or the longest-unseen one not on screen (null: none). */
  private takeFarSlot(want: Set<number> | null): FarSlot | null {
    const free = this.farFree.pop()
    if (free) return free
    // (Sizes from the finest far grid itself: its skirts are drawn both ways, 12 indices a quad.)
    const top = FAR_GRID_MAX
    const VERTS = top.VERTS
    const INDEX = top.index.count
    if (!this.farBatch) {
      this.farBatch = new THREE.BatchedMesh(FAR_SLOTS, FAR_SLOTS * VERTS, FAR_SLOTS * INDEX, this.material)
      this.farBatch.frustumCulled = false
      this.farBatch.receiveShadow = true
      this.farBatch.name = 'terrain-far'
      this.group.add(this.farBatch)
    }
    if (this.farSlots < FAR_SLOTS) {
      const geom = this.farBatch.addGeometry(this.farScratch!, VERTS, INDEX)
      const inst = this.farBatch.addInstance(geom)
      this.farBatch.setVisibleAt(inst, false)
      this.farSlots++
      return { geom, inst }
    }
    let victim: Chunk | null = null
    for (const c of this.chunks.values()) {
      if (!c.far || this.shown.has(c.key) || (want && want.has(c.key))) continue
      if (!victim || c.lastSeen < victim.lastSeen) victim = c
    }
    if (!victim) return null
    const slot = victim.far!
    victim.far = null
    this.farBatch.setVisibleAt(slot.inst, false)
    return slot
  }
  private want: Set<number> | null = null
  private frame = 0
  private desired: number[] = []
  stats = { shown: 0, built: 0, queued: 0, buildMs: 0 }
  /**
   * Split when the camera is nearer than splitK × chunk size. Higher is
   * finer distant terrain and more triangles; the quality governor sets it.
   */
  splitK = 1.5
  /**
   * The same for chunks of FAR_SPLIT_FROM and up — the far ring of mountains on every horizon.
   * At splitK they stayed in 8–16 km chunks of 256–512 m triangles: bare flat facets on the
   * skyline (Q48). They cover little of the screen, so splitting them sooner costs little.
   */
  farSplitK = 2.5
  /** Where forests and meadows are (forests read as dark canopy from afar). */
  biome: Biome | null = null
  private readonly w: RegionWeights = { valley: 0, forest: 0, desert: 0, ruins: 0, mire: 0 }
  /** Splat weights for one vertex (LAYERS order). */
  private readonly sw = new Float32Array(8)
  /** Is this ground freshly churned by a giant (bare sand), or old and grown over? */
  fresh: (x: number, z: number) => boolean = () => true

  constructor(
    private readonly terrain: Terrain,
    seed: number,
    textures: TerrainTextures,
  ) {
    this.detail = makeSimplex2(seed + 999)
    this.material = makeTerrainMaterial(textures, makeDetailTexture(seed))
    this.group.name = 'terrain'
  }

  /**
   * Quads per chunk side. Changing it rebuilds every chunk in place: each
   * keeps showing its old mesh until its new one is built, so nothing opens.
   */
  setResolution(n: number): void {
    if (n === this.grid.N) return
    this.grid = makeGrid(n)
    this.farGrid = makeGrid(Math.max(16, n >> 1))
    this.heights = new Float32Array(this.grid.H_ROW * this.grid.H_ROW)
    this.deltas = new Float32Array(this.grid.H_ROW * this.grid.H_ROW)
    for (const c of this.chunks.values()) c.dirty = true
  }

  get resolution(): number {
    return this.grid.N
  }

  /** Mark every chunk overlapping the box (world metres) for rebuild. */
  /** 0 … 1: how far under something lying on the land (x, z) is (main sets it: the fallen giants). */
  under: ((x: number, z: number) => number) | null = null

  markDirty(x0: number, z0: number, x1: number, z1: number): void {
    for (const c of this.chunks.values()) {
      const m = c.size / this.grid.N
      if (c.x0 - m <= x1 && c.x0 + c.size + m >= x0 && c.z0 - m <= z1 && c.z0 + c.size + m >= z0) c.dirty = true
    }
  }

  /** Refine toward the camera, build within budget, swap in complete covers. */
  update(cam: THREE.Vector3, budgetMs: number): void {
    this.frame++
    const desired = this.desired
    desired.length = 0
    this.collect(0, 0, 0, cam, desired)
    const want = new Set(desired)
    this.want = want

    // Build queue: missing or dirty desired chunks, nearest first.
    const queue: Chunk[] = []
    for (const key of desired) {
      let c = this.chunks.get(key)
      if (!c) {
        c = this.makeChunk(key)
        this.chunks.set(key, c)
      }
      c.lastSeen = this.frame
      if (!this.has(c) || c.dirty) queue.push(c)
    }
    const cx = cam.x
    const cz = cam.z
    const dist = (c: Chunk) => {
      const dx = c.x0 + c.size / 2 - cx
      const dz = c.z0 + c.size / 2 - cz
      return dx * dx + dz * dz
    }
    queue.sort((a, b) => dist(a) - dist(b))
    const t0 = performance.now()
    let built = 0
    for (const c of queue) {
      if (built > 0 && performance.now() - t0 > budgetMs) break
      this.build(c)
      built++
    }
    this.stats.buildMs = performance.now() - t0
    this.stats.queued = queue.length - built

    this.reconcile(want)
    this.evict(want)
  }

  /** True when every desired chunk is built and shown (used by the loader). */
  settled(): boolean {
    return this.stats.queued === 0 && this.desired.every((k) => this.shown.has(k))
  }

  private collect(level: number, ix: number, iz: number, cam: THREE.Vector3, out: number[]): void {
    const size = ROOT / (1 << level)
    const x0 = -ROOT / 2 + ix * size
    const z0 = -ROOT / 2 + iz * size
    if (level < MAX_LEVEL) {
      const key = nodeKey(level, ix, iz)
      let hc = this.centreH.get(key)
      if (hc === undefined) {
        hc = this.terrain.heightAt(x0 + size / 2, z0 + size / 2)
        this.centreH.set(key, hc)
      }
      const dx = Math.max(0, Math.abs(x0 + size / 2 - cam.x) - size / 2)
      const dz = Math.max(0, Math.abs(z0 + size / 2 - cam.z) - size / 2)
      const dy = cam.y - hc
      const k = size >= FAR_SPLIT_FROM ? this.farSplitK : this.splitK
      if (dx * dx + dy * dy + dz * dz < size * k * (size * k)) {
        const l = level + 1
        this.collect(l, ix * 2, iz * 2, cam, out)
        this.collect(l, ix * 2 + 1, iz * 2, cam, out)
        this.collect(l, ix * 2, iz * 2 + 1, cam, out)
        this.collect(l, ix * 2 + 1, iz * 2 + 1, cam, out)
        return
      }
    }
    out.push(nodeKey(level, ix, iz))
  }

  private makeChunk(key: number): Chunk {
    const iz = key % 1048576
    const rest = (key - iz) / 1048576
    const ix = rest % 1048576
    const level = (rest - ix) / 1048576
    const size = ROOT / (1 << level)
    return { key, level, x0: -ROOT / 2 + ix * size, z0: -ROOT / 2 + iz * size, size, mesh: null, far: null, dirty: false, lastSeen: 0 }
  }

  private isAncestor(a: Chunk, b: Chunk): boolean {
    return a.level < b.level && b.x0 >= a.x0 && b.x0 < a.x0 + a.size && b.z0 >= a.z0 && b.z0 < a.z0 + a.size
  }

  /**
   * Swap toward the desired cover without ever opening a hole: an outdated
   * chunk stays on screen until everything replacing it is built, and the
   * replacements stay hidden until then.
   */
  private reconcile(want: Set<number>): void {
    const show = new Set<number>()
    const blocked = new Set<number>()
    for (const key of this.shown) {
      if (want.has(key)) continue
      const s = this.chunks.get(key)
      if (!s || !this.has(s)) continue
      let ready = true
      const under: number[] = []
      for (const k of this.desired) {
        const d = this.chunks.get(k)!
        if (this.isAncestor(d, s) || this.isAncestor(s, d)) {
          under.push(k)
          if (!this.has(d)) ready = false
        }
      }
      if (!ready || under.length === 0) {
        show.add(key)
        for (const k of under) blocked.add(k)
      }
    }
    for (const k of this.desired) {
      const c = this.chunks.get(k)!
      if (this.has(c) && !blocked.has(k)) show.add(k)
    }
    for (const c of this.chunks.values()) if (this.has(c)) this.setShown(c, show.has(c.key))
    this.shown = show
    this.stats.shown = show.size
  }

  private evict(want: Set<number>): void {
    if (this.chunks.size < 360) return
    for (const c of this.chunks.values()) {
      if (want.has(c.key) || this.shown.has(c.key) || this.frame - c.lastSeen < 300) continue
      if (c.mesh) {
        this.group.remove(c.mesh)
        c.mesh.geometry.dispose()
      }
      if (c.far) {
        this.farBatch!.setVisibleAt(c.far.inst, false)
        this.farFree.push(c.far)
        c.far = null
      }
      this.chunks.delete(c.key)
    }
  }

  /**
   * Split each steep quad along the diagonal whose two corners are nearest in
   * height, so the triangles follow a cliff instead of cutting across it (the
   * shared checkerboard left rows of jagged, smeared teeth at every cliff's
   * foot). Chunks with no steep quad keep the shared index.
   */
  /**
   * The grid a chunk is built on: far chunks (1 km and up, only ever seen from 1.6 km off)
   * on half the quads — the skirts hide the seam where they meet a finer one. (Every chunk
   * was 64 × 64 whatever its size: the land was 1.1–1.2 M triangles a frame, most of the
   * frame's geometry.)
   */
  private gridFor(c: Chunk): Grid {
    return c.size >= FAR_CHUNK ? this.farGrid : this.grid
  }

  private fitDiagonals(geo: THREE.BufferGeometry, step: number, grid: Grid): void {
    const { N, ROW, H_ROW, index } = grid
    const H = this.heights
    const steep = step * 1.2
    let own: Uint16Array | null = null
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const ha = H[(j + 1) * H_ROW + i + 1]
        const hb = H[(j + 1) * H_ROW + i + 2]
        const hc = H[(j + 2) * H_ROW + i + 1]
        const hd = H[(j + 2) * H_ROW + i + 2]
        const ad = Math.abs(ha - hd)
        const bc = Math.abs(hb - hc)
        if (Math.max(ad, bc) < steep) continue
        const along = ad <= bc // the a–d diagonal follows it
        if (along === !!((i + j) & 1)) continue // the shared split already does
        if (!own) {
          const prev = geo.getIndex()
          own = prev && prev !== index && prev.array.length === index.array.length ? (prev.array as Uint16Array) : new Uint16Array(index.array as Uint16Array)
          if (prev !== index) own.set(index.array as Uint16Array)
        }
        const a = j * ROW + i
        const b = a + 1
        const c = a + ROW
        const d = c + 1
        const k = (j * N + i) * 6
        if (along) own.set([a, c, d, a, d, b], k)
        else own.set([a, c, b, b, c, d], k)
      }
    }
    const cur = geo.getIndex()
    if (!own) {
      if (cur !== index) geo.setIndex(index)
      return
    }
    if (cur && cur !== index && cur.array === own) cur.needsUpdate = true
    else geo.setIndex(new THREE.BufferAttribute(own, 1))
  }

  private build(c: Chunk): void {
    const t = this.terrain
    const grid = this.gridFor(c)
    const { N, ROW, GRID_VERTS, VERTS, H_ROW } = grid
    const step = c.size / N
    const H = this.heights
    const D = this.deltas
    const useDelta = t.delta.touches(c.x0 - step, c.z0 - step, c.size + 2 * step)
    // (Rebuilt after a footfall: the base is as it was; only the delta is read again.)
    let B = c.base
    const fresh = !B || B.length !== H_ROW * H_ROW
    if (fresh) B = c.base = new Float32Array(H_ROW * H_ROW)
    for (let j = 0; j < H_ROW; j++) {
      const z = c.z0 + (j - 1) * step
      for (let i = 0; i < H_ROW; i++) {
        const x = c.x0 + (i - 1) * step
        // (On a coarse chunk, the giants' prints averaged over the patch each vertex stands for: point-
        // sampled, a 1 m steep-walled print came out as sharp triangular hollows and spikes on 2–8 m
        // quads — hard facets under a low sun, tour review 2026-11-08. The walking ground, the leaves'
        // 1 m quads, is sampled exactly as before.)
        let d = 0
        if (useDelta) {
          if (step > 1.5) {
            const o = step * 0.35
            d = (2 * t.delta.sample(x, z) + t.delta.sample(x - o, z) + t.delta.sample(x + o, z) + t.delta.sample(x, z - o) + t.delta.sample(x, z + o)) / 6
          } else d = t.delta.sample(x, z)
        }
        const k = j * H_ROW + i
        if (fresh) B![k] = t.base.height(x, z)
        D[k] = d
        H[k] = B![k] + d
      }
    }

    const newGeo = () => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(VERTS * 3), 3))
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(VERTS * 3), 3))
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(VERTS * 3), 3))
      g.setAttribute('aSplatA', new THREE.BufferAttribute(new Uint8Array(VERTS * 4), 4, true))
      g.setAttribute('aSplatB', new THREE.BufferAttribute(new Uint8Array(VERTS * 4), 4, true))
      g.setIndex(grid.index)
      return g
    }
    const isFar = c.size >= FAR_CHUNK
    let slot: FarSlot | null = null
    let geo: THREE.BufferGeometry
    if (isFar) {
      // Built in the scratch geometry, then copied into the chunk's slot in the far batch.
      if (!this.farScratch || this.farScratch.getAttribute('position').count !== VERTS) {
        this.farScratch?.dispose()
        this.farScratch = newGeo()
      }
      geo = this.farScratch!
      slot = c.far ?? this.takeFarSlot(this.want)
      if (!slot) return // (the pool is full of what is on screen: built when one frees up)
    } else if (c.mesh && c.mesh.geometry.getAttribute('position').count === VERTS) {
      geo = c.mesh.geometry
    } else {
      // New chunk, or the resolution changed: fresh buffers.
      c.mesh?.geometry.dispose()
      geo = newGeo()
      if (c.mesh) c.mesh.geometry = geo
    }
    this.fitDiagonals(geo, step, grid)
    const P = geo.getAttribute('position').array as Float32Array
    const Nn = geo.getAttribute('normal').array as Float32Array
    const C = geo.getAttribute('color').array as Float32Array
    const SA = geo.getAttribute('aSplatA').array as Uint8Array
    const SB = geo.getAttribute('aSplatB').array as Uint8Array

    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const v = j * ROW + i
        const hi = (j + 1) * H_ROW + (i + 1)
        const h = H[hi]
        const x = c.x0 + i * step
        const z = c.z0 + j * step
        P[v * 3] = x
        P[v * 3 + 1] = h
        P[v * 3 + 2] = z
        let nx = H[hi - 1] - H[hi + 1]
        let nz = H[hi - H_ROW] - H[hi + H_ROW]
        let ny = 2 * step
        const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz)
        nx *= inv
        ny *= inv
        nz *= inv
        Nn[v * 3] = nx
        Nn[v * 3 + 1] = ny
        Nn[v * 3 + 2] = nz
        this.shade(C, SA, SB, v, x, z, h, ny, D[hi])
      }
    }

    // Skirts hang below each edge to hide cracks between LOD levels — as deep as the land falls along
    // the edge there: on a sheer cliff a coarse edge and its finer neighbour part by tens of metres, and
    // a fixed 1.5 steps left the sky showing through as a bright white line down the rock (the golden-
    // hour flyover; the long-open "white hairline").
    const base = step * 1.5 + 1
    for (let e = 0; e < 4 * ROW; e++) {
      const src = grid.edges[e]
      const dst = GRID_VERTS + e
      const k0 = e % ROW
      const hy = P[src * 3 + 1]
      let fall = 0
      if (k0 > 0) fall = Math.max(fall, Math.abs(hy - P[grid.edges[e - 1] * 3 + 1]))
      if (k0 < ROW - 1) fall = Math.max(fall, Math.abs(hy - P[grid.edges[e + 1] * 3 + 1]))
      const drop = base + fall
      P[dst * 3] = P[src * 3]
      P[dst * 3 + 1] = hy - drop
      P[dst * 3 + 2] = P[src * 3 + 2]
      for (let k = 0; k < 3; k++) {
        Nn[dst * 3 + k] = Nn[src * 3 + k]
        C[dst * 3 + k] = C[src * 3 + k]
      }
      for (let k = 0; k < 4; k++) {
        SA[dst * 4 + k] = SA[src * 4 + k]
        SB[dst * 4 + k] = SB[src * 4 + k]
      }
    }

    geo.getAttribute('position').needsUpdate = true
    geo.getAttribute('normal').needsUpdate = true
    geo.getAttribute('color').needsUpdate = true
    geo.getAttribute('aSplatA').needsUpdate = true
    geo.getAttribute('aSplatB').needsUpdate = true
    geo.computeBoundingSphere()
    geo.computeBoundingBox()

    if (slot) {
      this.farBatch!.setGeometryAt(slot.geom, geo)
      c.far = slot
      c.dirty = false
      this.stats.built++
      return
    }
    if (!c.mesh) {
      const mesh = new THREE.Mesh(geo, this.material)
      mesh.receiveShadow = true
      mesh.matrixAutoUpdate = false
      mesh.visible = false
      c.mesh = mesh
      this.group.add(mesh)
    }
    c.dirty = false
    this.stats.built++
  }

  /**
   * The ground at one vertex: how much of each texture layer (by land, slope,
   * height and what the giants did to it), written as splat weights; and in
   * the vertex colour, the forest canopy seen from afar (r) and a darkening
   * for freshly churned ground (g).
   */
  private shade(C: Float32Array, SA: Uint8Array, SB: Uint8Array, v: number, x: number, z: number, h: number, ny: number, delta: number): void {
    const n = this.detail(x * 0.013, z * 0.013)
    const big = this.detail(x * 0.0017 + 5.3, z * 0.0017 - 2.1)
    const slope = 1 - ny
    const r = this.terrain.base.regions.at(x, z, this.w)
    const w = this.sw
    w.fill(0)

    // The valley: meadow grass with dry patches and a little bare earth.
    const dry = smoothstep(0.15, 0.75, big)
    w[LAYER.grass] += r.valley * (1 - dry * 0.5)
    w[LAYER.drygrass] += r.valley * dry * 0.5
    w[LAYER.mud] += r.valley * smoothstep(0.55, 0.9, n) * 0.4
    // The Old Wood: leaf litter and mud under the trees, grass in the clearings.
    const trees = this.biome ? this.biome.forest(x, z) : 0.6
    w[LAYER.forest] += r.forest * (0.25 + 0.75 * trees)
    w[LAYER.mud] += r.forest * smoothstep(0.1, 0.7, n) * 0.5
    w[LAYER.grass] += r.forest * (1 - trees) * 0.8
    // The Dune Sea: sand, with tough dry grass in the hollows between dunes.
    w[LAYER.sand] += r.desert
    w[LAYER.drygrass] += r.desert * smoothstep(0.35, 0.8, n) * smoothstep(30, 12, h) * 0.6
    // The Mire: black mud and wet leaf-rot, coarse grass on the hummocks.
    w[LAYER.mud] += r.mire * (0.55 + 0.3 * n)
    w[LAYER.forest] += r.mire * 0.35
    w[LAYER.grass] += r.mire * smoothstep(0.4, 0.8, n) * 0.4
    // The Steps: dry grass and meadow over the old stone.
    w[LAYER.drygrass] += r.ruins * (0.3 + 0.4 * dry)
    w[LAYER.grass] += r.ruins * (0.7 - 0.4 * dry)

    let sum = 0
    for (let i = 0; i < 8; i++) sum += w[i]
    for (let i = 0; i < 8; i++) w[i] /= sum

    // Bare ground a giant turned over: earth (sand in the Dune Sea); old trails
    // (or ground that has greened again) only a little.
    // Wet ground darkens: all of the Mire a little, the pools' banks most.
    let dark = 1 - r.mire * (0.22 + 0.25 * poolBowl(x, z))
    // Under the Tallgrass (tallgrass.ts): bare, shaded earth and old litter between the stalks, darker
    // the deeper in — the lawn ran straight under blades four times your height.
    // Under a fallen giant (the floor of its hollow): dark, damp, old leaf litter — the meadow ran
    // straight through the tunnel, bright green in the dark (tour review).
    const ug = this.under ? this.under(x, z) : 0
    if (ug > 0.01) {
      this.toward(LAYER.forest, ug)
      dark *= 1 - 0.38 * ug
    }
    const tg = tallAt(x, z)
    if (tg > 0.01) {
      this.toward(LAYER.forest, smoothstep(0.15, 0.6, tg) * 0.85)
      dark *= 1 - 0.42 * smoothstep(0.2, 0.85, tg)
    }
    if (delta !== 0) {
      const t = smoothstep(0.15, 1.8, Math.abs(delta)) * (this.fresh(x, z) ? 0.85 : 0.25)
      this.toward(r.desert > 0.5 ? LAYER.sand : LAYER.mud, t)
      dark *= 1 - 0.18 * t * (delta < 0 ? smoothstep(0.5, 3, -delta) : 0)
    }
    // Cliffs and mountain sides: rock (red in the Dune Sea).
    const alpine = smoothstep(140, 330, h) * 0.75
    // (In the Dune Sea only past ~54°: a dune's slip face, ~33°, is sand — it came out as red cliff
    // strata, whole faces of it; the mesas' walls are far steeper.)
    // (And past ~60°, not ~54°: the generated dunes' lips stand that steep in places and wore a red
    // band of strata along their crests; the mesas' walls are near vertical — tour review 2026-11-08.)
    const rockLo = 0.16 + 0.42 * r.desert
    const rockT = Math.max(smoothstep(rockLo, rockLo + 0.18 - 0.06 * r.desert, slope + n * 0.04), alpine)
    if (rockT > 0) {
      const red = r.desert * (1 - alpine)
      this.toward(LAYER.rock, rockT * (1 - red))
      this.toward(LAYER.redrock, rockT * red)
    }
    // Snow on the high, gentle slopes.
    const snow = smoothstep(430 + n * 70, 580 + n * 70, h) * (1 - smoothstep(0.42, 0.68, slope))
    if (snow > 0) this.toward(LAYER.snow, snow)

    const o = v * 4
    SA[o] = w[0] * 255
    SA[o + 1] = w[1] * 255
    SA[o + 2] = w[2] * 255
    SA[o + 3] = w[3] * 255
    SB[o] = w[4] * 255
    SB[o + 1] = w[5] * 255
    SB[o + 2] = w[6] * 255
    SB[o + 3] = w[7] * 255
    // The Old Wood's weight (its canopy from afar; its mossy, darker cliffs).
    // (Below zero, the Steps' weight: their cut walls are dressed stone — terrain-material.)
    C[v * 3] = r.forest * (1 - smoothstep(170, 260, h)) - r.ruins
    C[v * 3 + 1] = dark
    // How much of the Dune Sea this is: the shader's cliffs are red rock there.
    C[v * 3 + 2] = r.desert
  }

  /** Blend the splat weights toward one layer by t (they still sum to 1). */
  private toward(layer: number, t: number): void {
    const w = this.sw
    for (let i = 0; i < 8; i++) w[i] *= 1 - t
    w[layer] += t
  }
}
