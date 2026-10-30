// Lake surfaces. One flat mesh per lake, built from the lake-bed mask dilated
// by a cell: water extends a little under the shore and the terrain's depth
// test cuts the shoreline cleanly. Rising water only moves the mesh; the
// geometry is rebuilt when the basin's shape changes (lake.version).

import * as THREE from 'three'
import { makeSimplex2, type Lake, type LakeSystem } from '@titans/shared'

/**
 * Tileable ripple normals: a few octaves of periodic noise (wrapped by
 * sampling a torus-like 2D domain), turned into an RGB normal map.
 */
function rippleNormals(size = 256): THREE.DataTexture {
  const n = makeSimplex2(777)
  const h = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0
      for (const [f, a] of [[4, 1], [9, 0.5], [17, 0.25]] as const) {
        // Periodic in x and y: blend the four wrapped copies.
        const u = x / size
        const w = y / size
        const s = (px: number, py: number) => n(px * f, py * f)
        v += a * (s(u, w) * (1 - u) * (1 - w) + s(u - 1, w) * u * (1 - w) + s(u, w - 1) * (1 - u) * w + s(u - 1, w - 1) * u * w)
      }
      h[y * size + x] = v
    }
  }
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = h[y * size + ((x + 1) % size)] - h[y * size + ((x - 1 + size) % size)]
      const dy = h[((y + 1) % size) * size + x] - h[((y - 1 + size) % size) * size + x]
      const len = Math.hypot(dx * 3, dy * 3, 1)
      const i = (y * size + x) * 4
      data[i] = Math.round(((-dx * 3) / len) * 127.5 + 127.5)
      data[i + 1] = Math.round(((-dy * 3) / len) * 127.5 + 127.5)
      data[i + 2] = Math.round((1 / len) * 127.5 + 127.5)
      data[i + 3] = 255
    }
  }
  const tex = new THREE.DataTexture(data, size, size)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}

interface Entry {
  mesh: THREE.Mesh
  version: number
}

export class WaterView {
  readonly group = new THREE.Group()
  private readonly entries = new Map<number, Entry>()
  private readonly streams = new Map<number, { mesh: THREE.Mesh; sig: string }>()
  private streamCheck = 0
  private readonly ripples = rippleNormals()
  private readonly material = new THREE.MeshStandardMaterial({
    // The reel's water: a deep, sky-mirroring blue, not a pale film.
    color: 0x2c5a80,
    roughness: 0.05,
    metalness: 0.1,
    envMapIntensity: 2.6,
    // Light scattered inside the water: without it, a lake seen from above was
    // only its dark body colour and read as a hole.
    emissive: 0x0d2a40,
    normalMap: this.ripples,
    normalScale: new THREE.Vector2(0.22, 0.22),
    transparent: true,
    opacity: 0.95,
  })
  private t = 0

  constructor() {
    this.group.name = 'water'
  }

  /**
   * Overflow, drawn: a ribbon of water along each stream's path, a hand above
   * the ground. Rebuilt only when a stream's signature changes; checked a few
   * times a second (path finding is not free).
   */
  syncStreams(dt: number, lakes: LakeSystem, heightAt: (x: number, z: number) => number): void {
    this.streamCheck -= dt
    if (this.streamCheck > 0) return
    this.streamCheck = 0.3
    const live = new Set<number>()
    for (const s of lakes.streams()) {
      live.add(s.id)
      const e = this.streams.get(s.id)
      if (e && e.sig === s.sig) continue
      if (e) {
        this.group.remove(e.mesh)
        e.mesh.geometry.dispose()
      }
      const mesh = new THREE.Mesh(ribbon(s.cells, heightAt), this.material)
      mesh.renderOrder = 1
      mesh.receiveShadow = true
      this.group.add(mesh)
      this.streams.set(s.id, { mesh, sig: s.sig })
    }
    for (const [id, e] of this.streams) {
      if (live.has(id)) continue
      this.group.remove(e.mesh)
      e.mesh.geometry.dispose()
      this.streams.delete(id)
    }
  }

  /** Drift the ripples. */
  update(dt: number): void {
    this.t += dt
    this.ripples.offset.set(this.t * 0.012, this.t * 0.007)
  }

  sync(lakes: readonly Lake[]): void {
    const live = new Set<number>()
    for (const lake of lakes) {
      live.add(lake.id)
      let e = this.entries.get(lake.id)
      if (!e || e.version !== lake.version) {
        if (e) {
          this.group.remove(e.mesh)
          e.mesh.geometry.dispose()
        }
        const mesh = new THREE.Mesh(surface(lake), this.material)
        mesh.receiveShadow = true
        mesh.renderOrder = 1
        this.group.add(mesh)
        e = { mesh, version: lake.version }
        this.entries.set(lake.id, e)
      }
      e.mesh.position.y = lake.level
      e.mesh.visible = lake.level > lake.basin.bottom + 0.05
    }
    for (const [id, e] of this.entries) {
      if (live.has(id)) continue
      this.group.remove(e.mesh)
      e.mesh.geometry.dispose()
      this.entries.delete(id)
    }
  }
}

/** Quads over the dilated bed mask, merged into horizontal runs per row. */
function surface(lake: Lake): THREE.BufferGeometry {
  const b = lake.basin
  const W = b.w + 2
  const Hh = b.h + 2
  const dil = new Uint8Array(W * Hh)
  for (let j = 0; j < b.h; j++) {
    for (let i = 0; i < b.w; i++) {
      if (!b.mask[j * b.w + i]) continue
      for (let dj = 0; dj <= 2; dj++) for (let di = 0; di <= 2; di++) dil[(j + dj) * W + (i + di)] = 1
    }
  }
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let j = 0; j < Hh; j++) {
    let i = 0
    while (i < W) {
      if (!dil[j * W + i]) {
        i++
        continue
      }
      const start = i
      while (i < W && dil[j * W + i]) i++
      // Cell (x, z) spans x ± 0.5; dilated grid is offset by one cell.
      const xa = b.x0 + start - 1 - 0.5
      const xb = b.x0 + i - 1 - 0.5
      const za = b.z0 + j - 1 - 0.5
      const zb = za + 1
      const v = pos.length / 3
      pos.push(xa, 0, za, xb, 0, za, xa, 0, zb, xb, 0, zb)
      // Ripples in world space (one tile per 30 m), continuous across quads and lakes.
      uv.push(xa / 30, za / 30, xb / 30, za / 30, xa / 30, zb / 30, xb / 30, zb / 30)
      idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  const n = new Float32Array(pos.length)
  for (let k = 1; k < n.length; k += 3) n[k] = 1
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3))
  g.setIndex(idx)
  g.computeBoundingSphere()
  return g
}

/** A smoothed strip of water along a cell path, `width` metres wide, sitting just above the ground. */
function ribbon(cells: Array<[number, number]>, heightAt: (x: number, z: number) => number, width = 2.6): THREE.BufferGeometry {
  // Grid paths zig-zag; average neighbours (twice) for a natural line.
  let pts = cells.map(([x, z]) => new THREE.Vector2(x, z))
  for (let pass = 0; pass < 2; pass++) {
    pts = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 2)]
      const b = pts[Math.min(pts.length - 1, i + 2)]
      return new THREE.Vector2((a.x + 2 * p.x + b.x) / 4, (a.y + 2 * p.y + b.y) / 4)
    })
  }
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(pts.length - 1, i + 1)]
    let dx = b.x - a.x
    let dz = b.y - a.y
    const len = Math.hypot(dx, dz) || 1
    dx /= len
    dz /= len
    // Narrow at the source, full width once running.
    const w = (width / 2) * Math.min(1, 0.3 + i / 12)
    const p = pts[i]
    for (const s of [-1, 1]) {
      const x = p.x - dz * w * s
      const z = p.y + dx * w * s
      pos.push(x, heightAt(x, z) + 0.22, z)
      uv.push(x / 30, z / 30)
    }
    if (i > 0) {
      const v = i * 2
      idx.push(v - 2, v, v - 1, v - 1, v, v + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  // Water lies flat for lighting purposes, whatever the slope.
  const n = g.getAttribute('normal')
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0)
  g.computeBoundingSphere()
  return g
}
