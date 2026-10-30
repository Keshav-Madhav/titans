// Lake surfaces. One flat mesh per lake, built from the lake-bed mask dilated
// by a cell: water extends a little under the shore and the terrain's depth
// test cuts the shoreline cleanly. Rising water only moves the mesh; the
// geometry is rebuilt when the basin's shape changes (lake.version).

import * as THREE from 'three'
import type { Lake } from '@titans/shared'

interface Entry {
  mesh: THREE.Mesh
  version: number
}

export class WaterView {
  readonly group = new THREE.Group()
  private readonly entries = new Map<number, Entry>()
  private readonly material = new THREE.MeshStandardMaterial({
    color: 0x3a7090,
    roughness: 0.06,
    metalness: 0.15,
    envMapIntensity: 2.1,
    transparent: true,
    opacity: 0.9,
  })

  constructor() {
    this.group.name = 'water'
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
      idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  const n = new Float32Array(pos.length)
  for (let k = 1; k < n.length; k += 3) n[k] = 1
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3))
  g.setIndex(idx)
  g.computeBoundingSphere()
  return g
}
