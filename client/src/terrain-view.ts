// Quadtree LOD terrain (CDLOD-style). Every chunk is N × N quads (64, or 32
// at the lowest quality) plus skirts, from 64 m leaves (1 m per quad, matching the delta resolution) up to
// a 32 km root centred on the origin. Splitting uses 3D camera distance, so a
// Titan's high camera automatically gets coarser, wider terrain.
//
// The displayed set is always a complete cover: a chunk being split or merged
// stays on screen until every replacement is built, so LOD changes never open
// holes. Builds are time-sliced to a per-frame budget.

import * as THREE from 'three'
import { makeSimplex2, smoothstep, type Noise2, type Terrain } from '@titans/shared'
import { makeDetailTexture } from './detail-texture'
import type { Biome } from './biome'
import type { PaintField } from './paint'

const ROOT = 32768
const LEAF = 64
const MAX_LEVEL = Math.round(Math.log2(ROOT / LEAF))

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

// sRGB palette, converted to linear once.
function lin(hex: number): [number, number, number] {
  const c = new THREE.Color(hex)
  return [c.r, c.g, c.b]
}
const GRASS_DRY = lin(0xa89066)
const GRASS_GREEN = lin(0x8a8150)
const SOIL = lin(0xae9670)
// Ground a Titan turned over: pale sand on the walls and rims (the reel's
// craters), only a little darker where it lies deep and wet.
const SAND = lin(0xc6b38e)
const WET_SOIL = lin(0x9a8666)
const ROCK = lin(0x8e877d)
const ROCK_DARK = lin(0x5d5852)
const SNOW = lin(0xeef1f5)
const MEADOW = lin(0x707a43)
const CANOPY = lin(0x4b5331)
const CANOPY_DARK = lin(0x363d26)
const ROAD = lin(0xa58f68)
const COBBLE = lin(0x9c968b)

interface Chunk {
  key: number
  level: number
  x0: number
  z0: number
  size: number
  mesh: THREE.Mesh | null
  dirty: boolean
  lastSeen: number
}

/**
 * Close-range ground texture without any downloaded asset: three octaves of
 * the detail texture in world space modulate the vertex colour. The finest
 * octave fades out with distance so far terrain does not shimmer.
 */
function addGroundDetail(mat: THREE.MeshStandardMaterial, tex: THREE.Texture): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.detailMap = { value: tex }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGroundPos;\nattribute float aPave;\nvarying float vPave;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGroundPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvPave = aPave;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D detailMap;\nvarying vec3 vGroundPos;\nvarying float vPave;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float gd1 = texture2D(detailMap, vGroundPos.xz * 0.21).r;
        float gd2 = texture2D(detailMap, vGroundPos.xz * 0.037).r;
        float gd3 = texture2D(detailMap, vGroundPos.xz * 0.0053).r;
        float gFade = 1.0 - smoothstep(40.0, 260.0, distance(vGroundPos, cameraPosition));
        diffuseColor.rgb *= mix(1.0, 0.72 + 0.56 * gd1, gFade * (1.0 - vPave)) * (0.8 + 0.4 * gd2) * (0.86 + 0.28 * gd3);
        // Cobbles: offset rows of rounded stones with dark joints, up close.
        if (vPave > 0.02) {
          vec2 cp = vGroundPos.xz / vec2(0.34, 0.27);
          cp.x += mod(floor(cp.y), 2.0) * 0.5;
          vec2 cell = floor(cp);
          vec2 f = fract(cp) - 0.5;
          float stone = 1.0 - smoothstep(0.32, 0.5, max(abs(f.x), abs(f.y)) + 0.12 * dot(f, f));
          float hv = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          float cobbleFade = (1.0 - smoothstep(15.0, 55.0, distance(vGroundPos, cameraPosition))) * smoothstep(0.02, 0.6, vPave);
          diffuseColor.rgb *= mix(1.0, mix(0.55, 0.92 + 0.22 * hv, stone), cobbleFade);
        }`,
      )
  }
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
      idx.push(a, c, b, b, c, d)
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
  private heights = new Float32Array(67 * 67)
  private deltas = new Float32Array(67 * 67)
  private readonly detail: Noise2
  private readonly centreH = new Map<number, number>()
  private shown = new Set<number>()
  private frame = 0
  private desired: number[] = []
  stats = { shown: 0, built: 0, queued: 0, buildMs: 0 }
  /**
   * Split when the camera is nearer than splitK × chunk size. Higher is
   * finer distant terrain and more triangles; the quality governor sets it.
   */
  splitK = 1.5
  /** Where forests and meadows are (forests read as dark canopy from afar). */
  biome: Biome | null = null
  /** Roads and squares painted onto the ground. */
  paint: PaintField | null = null
  /** Cobbled streets and squares (also drawn as stones up close). */
  pave: PaintField | null = null
  /** Is this ground freshly churned by a giant (bare sand), or old and grown over? */
  fresh: (x: number, z: number) => boolean = () => true

  constructor(private readonly terrain: Terrain, seed: number) {
    this.detail = makeSimplex2(seed + 999)
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 })
    addGroundDetail(this.material, makeDetailTexture(seed))
    this.group.name = 'terrain'
  }

  /**
   * Quads per chunk side. Changing it rebuilds every chunk in place: each
   * keeps showing its old mesh until its new one is built, so nothing opens.
   */
  setResolution(n: number): void {
    if (n === this.grid.N) return
    this.grid = makeGrid(n)
    this.heights = new Float32Array(this.grid.H_ROW * this.grid.H_ROW)
    this.deltas = new Float32Array(this.grid.H_ROW * this.grid.H_ROW)
    for (const c of this.chunks.values()) c.dirty = true
  }

  get resolution(): number {
    return this.grid.N
  }

  /** Mark every chunk overlapping the box (world metres) for rebuild. */
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

    // Build queue: missing or dirty desired chunks, nearest first.
    const queue: Chunk[] = []
    for (const key of desired) {
      let c = this.chunks.get(key)
      if (!c) {
        c = this.makeChunk(key)
        this.chunks.set(key, c)
      }
      c.lastSeen = this.frame
      if (!c.mesh || c.dirty) queue.push(c)
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
      if (dx * dx + dy * dy + dz * dz < size * this.splitK * (size * this.splitK)) {
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
    return { key, level, x0: -ROOT / 2 + ix * size, z0: -ROOT / 2 + iz * size, size, mesh: null, dirty: false, lastSeen: 0 }
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
      if (!s || !s.mesh) continue
      let ready = true
      const under: number[] = []
      for (const k of this.desired) {
        const d = this.chunks.get(k)!
        if (this.isAncestor(d, s) || this.isAncestor(s, d)) {
          under.push(k)
          if (!d.mesh) ready = false
        }
      }
      if (!ready || under.length === 0) {
        show.add(key)
        for (const k of under) blocked.add(k)
      }
    }
    for (const k of this.desired) {
      const c = this.chunks.get(k)!
      if (c.mesh && !blocked.has(k)) show.add(k)
    }
    for (const c of this.chunks.values()) if (c.mesh) c.mesh.visible = show.has(c.key)
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
      this.chunks.delete(c.key)
    }
  }

  private build(c: Chunk): void {
    const t = this.terrain
    const { N, ROW, GRID_VERTS, VERTS, H_ROW } = this.grid
    const step = c.size / N
    const H = this.heights
    const D = this.deltas
    const useDelta = t.delta.touches(c.x0 - step, c.z0 - step, c.size + 2 * step)
    for (let j = 0; j < H_ROW; j++) {
      const z = c.z0 + (j - 1) * step
      for (let i = 0; i < H_ROW; i++) {
        const x = c.x0 + (i - 1) * step
        const d = useDelta ? t.delta.sample(x, z) : 0
        D[j * H_ROW + i] = d
        H[j * H_ROW + i] = t.base.height(x, z) + d
      }
    }

    let geo: THREE.BufferGeometry
    if (c.mesh && c.mesh.geometry.getAttribute('position').count === VERTS) {
      geo = c.mesh.geometry
    } else {
      // New chunk, or the resolution changed: fresh buffers.
      c.mesh?.geometry.dispose()
      geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(VERTS * 3), 3))
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(VERTS * 3), 3))
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(VERTS * 3), 3))
      geo.setAttribute('aPave', new THREE.BufferAttribute(new Float32Array(VERTS), 1))
      geo.setIndex(this.grid.index)
      if (c.mesh) c.mesh.geometry = geo
    }
    const P = geo.getAttribute('position').array as Float32Array
    const Nn = geo.getAttribute('normal').array as Float32Array
    const C = geo.getAttribute('color').array as Float32Array
    const PV = geo.getAttribute('aPave').array as Float32Array

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
        PV[v] = this.pave ? this.pave.at(x, z) : 0
        this.shade(C, v * 3, x, z, h, ny, D[hi], PV[v])
      }
    }

    // Skirts hang below each edge to hide cracks between LOD levels.
    const drop = step * 1.5 + 1
    for (let e = 0; e < 4 * ROW; e++) {
      const src = this.grid.edges[e]
      const dst = GRID_VERTS + e
      P[dst * 3] = P[src * 3]
      P[dst * 3 + 1] = P[src * 3 + 1] - drop
      P[dst * 3 + 2] = P[src * 3 + 2]
      for (let k = 0; k < 3; k++) {
        Nn[dst * 3 + k] = Nn[src * 3 + k]
        C[dst * 3 + k] = C[src * 3 + k]
      }
      PV[dst] = PV[src]
    }

    geo.getAttribute('position').needsUpdate = true
    geo.getAttribute('normal').needsUpdate = true
    geo.getAttribute('color').needsUpdate = true
    geo.getAttribute('aPave').needsUpdate = true
    geo.computeBoundingSphere()
    geo.computeBoundingBox()

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

  private shade(C: Float32Array, o: number, x: number, z: number, h: number, ny: number, delta: number, pave = 0): void {
    const v = this.detail(x * 0.013, z * 0.013)
    const big = this.detail(x * 0.0017 + 5.3, z * 0.0017 - 2.1)
    const slope = 1 - ny

    let t = smoothstep(-0.35, 0.6, big)
    let r = GRASS_DRY[0] + (GRASS_GREEN[0] - GRASS_DRY[0]) * t
    let g = GRASS_DRY[1] + (GRASS_GREEN[1] - GRASS_DRY[1]) * t
    let b = GRASS_DRY[2] + (GRASS_GREEN[2] - GRASS_DRY[2]) * t

    t = smoothstep(0.35, 0.85, v) * 0.55
    r += (SOIL[0] - r) * t
    g += (SOIL[1] - g) * t
    b += (SOIL[2] - b) * t

    if (this.biome) {
      // Lush meadow, then forest: canopy from afar, shaded floor up close.
      // Darker where the scrub is thick (it reads from afar before the bushes do).
      t = (this.biome.scrub(x, z) - 0.2) * 0.22
      r += (CANOPY[0] - r) * t
      g += (CANOPY[1] - g) * t
      b += (CANOPY[2] - b) * t
      t = this.biome.meadow(x, z) * 0.3
      r += (MEADOW[0] - r) * t
      g += (MEADOW[1] - g) * t
      b += (MEADOW[2] - b) * t
      const f = this.biome.forest(x, z) * (1 - smoothstep(170, 260, h))
      if (f > 0) {
        // Mottled crowns: a fine noise across the canopy so it reads as trees, not a stain.
        const crowns = this.detail(x * 0.09, z * 0.09)
        const cv = smoothstep(-0.6, 0.6, v * 0.5 + crowns * 0.6)
        t = f * 0.8
        r += (CANOPY[0] + (CANOPY_DARK[0] - CANOPY[0]) * cv - r) * t
        g += (CANOPY[1] + (CANOPY_DARK[1] - CANOPY[1]) * cv - g) * t
        b += (CANOPY[2] + (CANOPY_DARK[2] - CANOPY[2]) * cv - b) * t
      }
    }

    // Freshly disturbed ground (Titan footprints) reads as turned soil.
    if (delta !== 0) {
      // Fresh: bare sand. Old (regrown, or the First Ones' trails): a little earth on the walls.
      t = smoothstep(0.15, 1.8, Math.abs(delta)) * (this.fresh(x, z) ? 1 : 0.22)
      const wet = delta < 0 ? smoothstep(0.5, 3, -delta) : 0
      const sr = SAND[0] + (WET_SOIL[0] - SAND[0]) * wet
      const sg = SAND[1] + (WET_SOIL[1] - SAND[1]) * wet
      const sb = SAND[2] + (WET_SOIL[2] - SAND[2]) * wet
      r += (sr - r) * t
      g += (sg - g) * t
      b += (sb - b) * t
    }

    // Dirt roads, and cobbled streets and squares.
    const p = this.paint ? this.paint.at(x, z) : 0
    if (p > 0) {
      r += (ROAD[0] - r) * p * 0.9
      g += (ROAD[1] - g) * p * 0.9
      b += (ROAD[2] - b) * p * 0.9
    }
    if (pave > 0) {
      r += (COBBLE[0] - r) * pave
      g += (COBBLE[1] - g) * pave
      b += (COBBLE[2] - b) * pave
    }

    const alpine = smoothstep(140, 330, h) * 0.75
    const rockT = Math.max(smoothstep(0.17, 0.4, slope + v * 0.04), alpine)
    const rt = smoothstep(-0.6, 0.8, v)
    const rr = ROCK[0] + (ROCK_DARK[0] - ROCK[0]) * rt
    const rg = ROCK[1] + (ROCK_DARK[1] - ROCK[1]) * rt
    const rb = ROCK[2] + (ROCK_DARK[2] - ROCK[2]) * rt
    r += (rr - r) * rockT
    g += (rg - g) * rockT
    b += (rb - b) * rockT

    const snow = smoothstep(430 + v * 70, 580 + v * 70, h) * (1 - smoothstep(0.42, 0.68, slope))
    r += (SNOW[0] - r) * snow
    g += (SNOW[1] - g) * snow
    b += (SNOW[2] - b) * snow

    const k = 0.93 + 0.07 * v
    C[o] = r * k
    C[o + 1] = g * k
    C[o + 2] = b * k
  }
}
