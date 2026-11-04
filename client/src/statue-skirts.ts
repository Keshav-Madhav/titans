// What has gathered round the statues' feet over the ages (the user, 2026-11-04: they "look like
// someone placed them there — something that has existed for a while… ground buildup and crash and
// breaks"). Round each standing colossus: rubble heaped against its foot — pieces broken off it and
// fallen stone, half sunk — and, further out, a few great fragments that came down long ago.
//
// Made from the scanned boulders (rock-scans.ts) once they load: the near shape within NEAR_R of
// the camera, the far one beyond, re-split as you move. Placement is seeded and found once, from
// the formation's own shape (rocks.sdfAt): walk out from its middle until you leave the stone.

import * as THREE from 'three'
import { mulberry32, type Terrain } from '@titans/shared'

const NEAR_R = 160
const CAP = 4000
/** Far off only the big pieces, and not past this (a 600-triangle piece × thousands adds up). */
const FAR_R = 1400
const FAR_MIN = 3

interface Piece {
  m: THREE.Matrix4
  x: number
  z: number
  s: number
  shadow: boolean
}

export interface SkirtFormation {
  x: number
  y: number
  z: number
  hx: number
  hz: number
  cy: number
  hy: number
  seed: number
}

export class StatueSkirts {
  readonly group = new THREE.Group()
  private readonly pieces: Piece[] = []
  private readonly near: THREE.InstancedMesh[] = []
  private readonly far: THREE.InstancedMesh
  private readonly last = new THREE.Vector3(Infinity, 0, 0)
  /** Tools: how many pieces in all, and near you now. */
  stats = { pieces: 0, near: 0, far: 0 }

  constructor(
    formations: SkirtFormation[],
    terrain: Terrain,
    sdfAt: (x: number, y: number, z: number) => number,
    near: Array<{ geo: THREE.BufferGeometry; mat: THREE.Material }>,
    farGeo: THREE.BufferGeometry,
  ) {
    for (const f of formations) this.place(f, terrain, sdfAt)
    this.stats.pieces = this.pieces.length
    // One instanced mesh per scanned shape near you; one for every piece far off.
    for (const n of near) {
      const m = new THREE.InstancedMesh(n.geo, n.mat, CAP)
      m.count = 0
      m.castShadow = true
      m.receiveShadow = true
      m.frustumCulled = false
      this.near.push(m)
      this.group.add(m)
    }
    this.far = new THREE.InstancedMesh(farGeo, near[0].mat, CAP)
    this.far.count = 0
    this.far.receiveShadow = true
    this.far.frustumCulled = false
    this.group.add(this.far)
  }

  private place(f: SkirtFormation, terrain: Terrain, sdfAt: (x: number, y: number, z: number) => number): void {
    const rand = mulberry32(f.seed * 7919 + 17)
    const tall = Math.max(1, f.cy + f.hy)
    const size = Math.min(1, tall / 300)
    const reach = Math.max(f.hx, f.hz) * 1.3 + 20
    // Walk out from the middle until the stone ends, round the whole statue.
    // (Every statue its share: a fixed budget each, so the first ones met do not take it all.)
    const steps = Math.round(Math.min(120, Math.max(36, (2 * Math.PI * Math.max(f.hx, f.hz)) / 10)))
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2 + rand() * 0.05
      const dx = Math.cos(a)
      const dz = Math.sin(a)
      let edge = -1
      for (let r = 2; r < reach; r += 2) {
        const x = f.x + dx * r
        const z = f.z + dz * r
        if (sdfAt(x, terrain.heightAt(x, z) + 1.5, z) > 1.0) {
          edge = r
          break
        }
      }
      if (edge < 0) continue
      // Rubble against the foot: a few pieces, the larger nearer the stone.
      const n = 2 + Math.floor(rand() * (2 + 3 * size))
      for (let i = 0; i < n; i++) {
        const out = edge + rand() * rand() * (6 + 14 * size)
        const side = (rand() - 0.5) * 6
        const x = f.x + dx * out - dz * side
        const z = f.z + dz * out + dx * side
        // (A heap: big blocks against the stone, smaller spilling outward.)
        const s = (0.8 + rand() * 2.6) * (0.7 + 3.2 * size) * (1.2 - 0.6 * Math.min(1, (out - edge) / 20))
        this.add(x, z, s, rand, terrain, q, e, s > 2.2)
      }
      // Now and then a great fragment that fell long ago, further out, deep in the ground.
      if (rand() < 0.05 + 0.08 * size) {
        const out = edge + 12 + rand() * (25 + 40 * size)
        const x = f.x + dx * out
        const z = f.z + dz * out
        const s = (5 + rand() * 9) * (0.5 + size)
        this.add(x, z, s, rand, terrain, q, e, true, 0.45)
      }
    }
  }

  private add(x: number, z: number, s: number, rand: () => number, terrain: Terrain, q: THREE.Quaternion, e: THREE.Euler, shadow: boolean, sink = 0.28): void {
    if (this.pieces.length >= CAP) return
    const h = terrain.heightAt(x, z)
    // Tipped as it fell, turned any way, sunk into what has built up round it since.
    e.set((rand() - 0.5) * 0.7, rand() * Math.PI * 2, (rand() - 0.5) * 0.7)
    q.setFromEuler(e)
    const sy = s * (0.55 + rand() * 0.6)
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, h - sy * sink, z), q, new THREE.Vector3(s * (0.8 + rand() * 0.4), sy, s * (0.8 + rand() * 0.4)))
    this.pieces.push({ m, x, z, s, shadow })
  }

  /** Near pieces as the detailed scans, far ones as the light shape (re-split every ~15 m moved). */
  update(cam: THREE.Vector3): void {
    if (cam.distanceToSquared(this.last) < 225) return
    this.last.copy(cam)
    const counts = this.near.map(() => 0)
    let farN = 0
    let i = 0
    for (const p of this.pieces) {
      const d2 = (p.x - cam.x) ** 2 + (p.z - cam.z) ** 2
      if (d2 < NEAR_R * NEAR_R) {
        const k = i++ % this.near.length
        this.near[k].setMatrixAt(counts[k]++, p.m)
      } else if (d2 < FAR_R * FAR_R && p.s > FAR_MIN) this.far.setMatrixAt(farN++, p.m)
    }
    this.near.forEach((m, k) => {
      m.count = counts[k]
      m.instanceMatrix.needsUpdate = true
    })
    this.far.count = farN
    this.far.instanceMatrix.needsUpdate = true
    this.stats.near = counts.reduce((a, b) => a + b, 0)
    this.stats.far = farN
  }
}
