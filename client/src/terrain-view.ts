// Quadtree LOD terrain (CDLOD-style). Every chunk is 64 × 64 quads plus
// skirts, from 64 m leaves (1 m per quad, matching the delta resolution) up to
// a 32 km root centred on the origin. Splitting uses 3D camera distance, so a
// Titan's high camera automatically gets coarser, wider terrain.
//
// The displayed set is always a complete cover: a chunk being split or merged
// stays on screen until every replacement is built, so LOD changes never open
// holes. Builds are time-sliced to a per-frame budget.

import * as THREE from 'three'
import { makeSimplex2, smoothstep, type Noise2, type Terrain } from '@titans/shared'

const N = 64
const ROOT = 32768
const LEAF = 64
const MAX_LEVEL = Math.round(Math.log2(ROOT / LEAF))
const SPLIT_K = 1.6
const ROW = N + 1
const GRID_VERTS = ROW * ROW
const SKIRT_VERTS = 4 * ROW
const VERTS = GRID_VERTS + SKIRT_VERTS
const H_ROW = N + 3 // heights with a one-sample border, for normals

// sRGB palette, converted to linear once.
function lin(hex: number): [number, number, number] {
  const c = new THREE.Color(hex)
  return [c.r, c.g, c.b]
}
const GRASS_DRY = lin(0x9a8b5a)
const GRASS_GREEN = lin(0x6f7341)
const SOIL = lin(0xa48c63)
const WET_SOIL = lin(0x5c4f3e)
const ROCK = lin(0x8e877d)
const ROCK_DARK = lin(0x5d5852)
const SNOW = lin(0xeef1f5)

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

/** Tileable multi-octave value noise, one channel, 256². */
function makeDetailTexture(seed: number): THREE.DataTexture {
  const S = 256
  const data = new Uint8Array(S * S * 4)
  let s = seed | 0
  const rand = () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const acc = new Float32Array(S * S)
  let amp = 1
  let total = 0
  for (const cells of [4, 8, 16, 32, 64]) {
    const grid = new Float32Array(cells * cells).map(rand)
    const cs = S / cells
    for (let y = 0; y < S; y++) {
      const gy = y / cs
      const y0 = Math.floor(gy)
      const ty = gy - y0
      const sy = ty * ty * (3 - 2 * ty)
      for (let x = 0; x < S; x++) {
        const gx = x / cs
        const x0 = Math.floor(gx)
        const tx = gx - x0
        const sx = tx * tx * (3 - 2 * tx)
        const a = grid[(y0 % cells) * cells + (x0 % cells)]
        const b = grid[(y0 % cells) * cells + ((x0 + 1) % cells)]
        const c = grid[((y0 + 1) % cells) * cells + (x0 % cells)]
        const d = grid[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)]
        acc[y * S + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy)
      }
    }
    total += amp
    amp *= 0.6
  }
  for (let i = 0; i < S * S; i++) {
    const v = Math.round((acc[i] / total) * 255)
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  const tex = new THREE.DataTexture(data, S, S)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = 8
  tex.needsUpdate = true
  return tex
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
      .replace('#include <common>', '#include <common>\nvarying vec3 vGroundPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGroundPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D detailMap;\nvarying vec3 vGroundPos;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float gd1 = texture2D(detailMap, vGroundPos.xz * 0.21).r;
        float gd2 = texture2D(detailMap, vGroundPos.xz * 0.037).r;
        float gd3 = texture2D(detailMap, vGroundPos.xz * 0.0053).r;
        float gFade = 1.0 - smoothstep(40.0, 260.0, distance(vGroundPos, cameraPosition));
        diffuseColor.rgb *= mix(1.0, 0.72 + 0.56 * gd1, gFade) * (0.8 + 0.4 * gd2) * (0.86 + 0.28 * gd3);`,
      )
  }
}

function nodeKey(level: number, ix: number, iz: number): number {
  return (level * 1048576 + ix) * 1048576 + iz
}

function buildIndex(): THREE.BufferAttribute {
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
  const edges = edgeOrder()
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
function edgeOrder(): Int32Array {
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
  private readonly index = buildIndex()
  private readonly edges = edgeOrder()
  private readonly heights = new Float32Array(H_ROW * H_ROW)
  private readonly deltas = new Float32Array(H_ROW * H_ROW)
  private readonly detail: Noise2
  private readonly centreH = new Map<number, number>()
  private shown = new Set<number>()
  private frame = 0
  private desired: number[] = []
  stats = { shown: 0, built: 0, queued: 0, buildMs: 0 }

  constructor(private readonly terrain: Terrain, seed: number) {
    this.detail = makeSimplex2(seed + 999)
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 })
    addGroundDetail(this.material, makeDetailTexture(seed))
    this.group.name = 'terrain'
  }

  /** Mark every chunk overlapping the box (world metres) for rebuild. */
  markDirty(x0: number, z0: number, x1: number, z1: number): void {
    for (const c of this.chunks.values()) {
      const m = c.size / N
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
      if (dx * dx + dy * dy + dz * dz < size * SPLIT_K * (size * SPLIT_K)) {
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
    if (c.mesh) {
      geo = c.mesh.geometry
    } else {
      geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(VERTS * 3), 3))
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(VERTS * 3), 3))
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(VERTS * 3), 3))
      geo.setIndex(this.index)
    }
    const P = geo.getAttribute('position').array as Float32Array
    const Nn = geo.getAttribute('normal').array as Float32Array
    const C = geo.getAttribute('color').array as Float32Array

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
        this.shade(C, v * 3, x, z, h, ny, D[hi])
      }
    }

    // Skirts hang below each edge to hide cracks between LOD levels.
    const drop = step * 1.5 + 1
    for (let e = 0; e < 4 * ROW; e++) {
      const src = this.edges[e]
      const dst = GRID_VERTS + e
      P[dst * 3] = P[src * 3]
      P[dst * 3 + 1] = P[src * 3 + 1] - drop
      P[dst * 3 + 2] = P[src * 3 + 2]
      for (let k = 0; k < 3; k++) {
        Nn[dst * 3 + k] = Nn[src * 3 + k]
        C[dst * 3 + k] = C[src * 3 + k]
      }
    }

    geo.getAttribute('position').needsUpdate = true
    geo.getAttribute('normal').needsUpdate = true
    geo.getAttribute('color').needsUpdate = true
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

  private shade(C: Float32Array, o: number, x: number, z: number, h: number, ny: number, delta: number): void {
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

    // Freshly disturbed ground (Titan footprints) reads as turned soil.
    if (delta !== 0) {
      t = smoothstep(0.15, 1.8, Math.abs(delta))
      const wet = delta < 0 ? smoothstep(0.5, 3, -delta) : 0
      const sr = SOIL[0] + (WET_SOIL[0] - SOIL[0]) * wet
      const sg = SOIL[1] + (WET_SOIL[1] - SOIL[1]) * wet
      const sb = SOIL[2] + (WET_SOIL[2] - SOIL[2]) * wet
      r += (sr - r) * t
      g += (sg - g) * t
      b += (sb - b) * t
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
