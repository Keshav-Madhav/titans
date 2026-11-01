// The Mire (beyond the Old Wood, north-west): still black water in round
// pools, drowned trees standing bare and grey out of it, reeds round the
// banks — and, at its heart, the Drowned One: a colossus sunk to the chest.
//
// The pools are shared/src/mire.ts (the ground is carved there); here each
// gets a disc of still water at its rim's level, made for the cells near you.

import * as THREE from 'three'
import { mulberry32, POOL_CELL, poolInCell, type Terrain } from '@titans/shared'

const NEAR = 1400
const POOLS = 260
const SNAGS = 220

export class MireView {
  readonly group = new THREE.Group()
  private readonly water: THREE.InstancedMesh
  private readonly snags: THREE.InstancedMesh
  private lastKey = ''

  constructor(
    private readonly terrain: Terrain,
    /** 0 … 1: how much of the Mire (x, z) is. */
    private readonly mire: (x: number, z: number) => number,
  ) {
    // Black, still, mirroring: barely a ripple.
    const mat = new THREE.MeshStandardMaterial({ color: 0x11160f, roughness: 0.04, metalness: 0.2, envMapIntensity: 2.2, emissive: 0x040705 })
    this.water = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), mat, POOLS)
    this.water.frustumCulled = false
    this.water.receiveShadow = true
    this.water.count = 0
    // A drowned tree: a grey trunk, snapped high, with two or three bare limbs.
    const wood = new THREE.MeshStandardMaterial({ color: 0x6f6a60, roughness: 1 })
    const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.22, 0.5, 11, 6).translate(0, 5.5, 0)]
    for (const [a, y, tilt, len] of [
      [0.4, 7.5, 0.9, 4],
      [2.6, 9, 1.1, 3.2],
      [4.4, 6, 0.7, 2.6],
    ] as const) {
      const limb = new THREE.CylinderGeometry(0.05, 0.16, len, 5).translate(0, len / 2, 0)
      limb.rotateZ(tilt).rotateY(a).translate(0, y, 0)
      parts.push(limb)
    }
    const geo = mergeAll(parts)
    this.snags = new THREE.InstancedMesh(geo, wood, SNAGS)
    this.snags.frustumCulled = false
    this.snags.castShadow = true
    this.snags.count = 0
    this.group.add(this.water, this.snags)
  }

  /** The pools laid out near you: where their water stands. */
  private readonly pools: Array<{ x: number; z: number; r: number; level: number }> = []

  /** The water surface over (x, z) in a marsh pool near you, or NaN. */
  levelAt(x: number, z: number): number {
    for (const p of this.pools) if ((x - p.x) ** 2 + (z - p.z) ** 2 < p.r * p.r && this.terrain.heightAt(x, z) < p.level) return p.level
    return NaN
  }

  /** Lay out the pools' water and the drowned trees round `cam` (when it has moved a cell). */
  update(cam: THREE.Vector3): void {
    const key = `${Math.floor(cam.x / POOL_CELL)},${Math.floor(cam.z / POOL_CELL)}`
    if (key === this.lastKey) return
    this.lastKey = key
    if (this.mire(cam.x, cam.z) < 0.01 && this.mire(cam.x + Math.sign(-cam.x) * NEAR, cam.z) < 0.01) {
      this.water.count = this.snags.count = 0
      this.pools.length = 0
      return
    }
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()
    const p = new THREE.Vector3()
    const r = Math.ceil(NEAR / POOL_CELL)
    const cx0 = Math.floor(cam.x / POOL_CELL)
    const cz0 = Math.floor(cam.z / POOL_CELL)
    let nw = 0
    let ns = 0
    this.pools.length = 0
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const cx = cx0 + dx
        const cz = cz0 + dz
        const ccx = (cx + 0.5) * POOL_CELL
        const ccz = (cz + 0.5) * POOL_CELL
        const w = this.mire(ccx, ccz)
        if (w < 0.25) continue
        const pool = poolInCell(cx, cz)
        const rand = mulberry32((cx * 92821) ^ (cz * 68917) ^ 0x7a1)
        if (pool && nw < POOLS) {
          // The water stands a little below the rim's average (the ground is nearly level here).
          let rim = 0
          for (let k = 0; k < 10; k++) rim += this.terrain.heightAt(pool.x + Math.cos(k * 0.628) * pool.r * 1.3, pool.z + Math.sin(k * 0.628) * pool.r * 1.3) / 10
          // (Wide enough to reach the wobbled shore everywhere: the ground cuts the real edge.)
          m.compose(p.set(pool.x, rim - 0.7, pool.z), q.identity(), s.set(pool.r * 1.6, 1, pool.r * 1.6))
          this.water.setMatrixAt(nw++, m)
          this.pools.push({ x: pool.x, z: pool.z, r: pool.r * 1.6, level: rim - 0.7 })
        }
        // A drowned tree or two in or by the water.
        for (let k = 0; k < 2 && ns < SNAGS; k++) {
          if (rand() > 0.55 * w) continue
          const a = rand() * 6.28
          const d = pool ? pool.r * (0.3 + rand() * 1.1) : rand() * 40
          const x = (pool ? pool.x : ccx) + Math.cos(a) * d
          const z = (pool ? pool.z : ccz) + Math.sin(a) * d
          const sc = 0.7 + rand() * 0.8
          q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.25, rand() * 6.28, (rand() - 0.5) * 0.25))
          m.compose(p.set(x, this.terrain.heightAt(x, z) - 0.8, z), q, s.set(sc, sc * (0.7 + rand() * 0.6), sc))
          this.snags.setMatrixAt(ns++, m)
        }
      }
    }
    this.water.count = nw
    this.snags.count = ns
    this.water.instanceMatrix.needsUpdate = true
    this.snags.instanceMatrix.needsUpdate = true
  }
}

function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const ni = parts.map((g) => (g.index ? g.toNonIndexed() : g))
  let n = 0
  for (const g of ni) n += g.getAttribute('position').count
  const pos = new Float32Array(n * 3)
  const nrm = new Float32Array(n * 3)
  let o = 0
  for (const g of ni) {
    g.computeVertexNormals()
    pos.set(g.getAttribute('position').array as Float32Array, o * 3)
    nrm.set(g.getAttribute('normal').array as Float32Array, o * 3)
    o += g.getAttribute('position').count
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  return out
}
