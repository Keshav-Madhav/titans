// The Mire (beyond the Old Wood, north-west): still black water in round
// pools, drowned trees standing bare and grey out of it, reeds round the
// banks — and, at its heart, the Drowned One: a colossus sunk to the chest.
//
// The pools are shared/src/mire.ts (the ground is carved there); here each
// gets a disc of still water at its rim's level, made for the cells near you.

import * as THREE from 'three'
import { mulberry32, POOL_CELL, poolBowl, poolInCell, poolReach, type Terrain } from '@titans/shared'
import { SOFT_GLSL, soft, softScene } from './soft'

const NEAR = 1400
const POOLS = 260
const SNAGS = 220
/** Spokes round a pool's outline. */
const SPOKES = 28

export class MireView {
  readonly group = new THREE.Group()
  private readonly water: THREE.Mesh
  private readonly wPos = new Float32Array(POOLS * (SPOKES + 1) * 3)
  private readonly snags: THREE.InstancedMesh
  private lastKey = ''

  constructor(
    private readonly terrain: Terrain,
    /** 0 … 1: how much of the Mire (x, z) is. */
    private readonly mire: (x: number, z: number) => number,
  ) {
    this.water0 = poolWater(terrain, mire)
    // Black, still, mirroring: barely a ripple.
    // (The water is drawn with the soft layers (soft.ts), after the land, fading out as the bed
    // behind it nears: the ground used to cut each disc off in a hard line, and at a glance it
    // mirrored the pale sky — the pools read as flat sky-blue cutouts lying on the mud, the
    // plainest "developer water" in the game (screenshot review, 2026-11-06). It mirrors less now
    // the lower you look at it, and a peat-dark tint holds near the bank.)
    const mat = new THREE.MeshStandardMaterial({ color: 0x11160f, roughness: 0.18, metalness: 0.2, envMapIntensity: 0.22, emissive: 0x030403, transparent: true, depthWrite: false })
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, soft)
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPoolW;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvPoolW = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', '#include <packing>\nvarying vec3 vPoolW;\n' + SOFT_GLSL + '\nvoid main() {')
        .replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
          {
            // Shallow at the bank: dark peat showing, then gone into the mud over its last 30 cm.
            // How deep the water stands over the bed here, straight down: the gap behind the surface
            // along the line of sight, times how steeply the eye looks down. (Along the line of sight alone,
            // a pool seen low from 100 m away had metres "behind" it right to its edge, and lay on the
            // marsh as a white plank with a hard edge — tour review.)
            float shore = 1.0;
            if (uSoftOn > 0.5) {
              float sd = texture2D(tSoftDepth, gl_FragCoord.xy / uSoftRes).r;
              float gap = -perspectiveDepthToViewZ(sd, uSoftNF.x, uSoftNF.y) + perspectiveDepthToViewZ(gl_FragCoord.z, uSoftNF.x, uSoftNF.y);
              float down = abs(normalize(vPoolW - cameraPosition).y);
              shore = smoothstep(0.0, 0.35, gap * down);
            }
            // Peat water: black, with only a dim sheen of the sky even at a grazing angle (seen low, the
            // reflection went nearly white — a pale plank lying across the marsh, tour review).
            gl_FragColor.rgb = min(gl_FragColor.rgb, vec3(0.16, 0.17, 0.17)) * 0.55 + gl_FragColor.rgb * 0.12;
            // At the bank the bed shows through, dark and wet.
            gl_FragColor.rgb = mix(vec3(0.05, 0.045, 0.035), gl_FragColor.rgb, smoothstep(0.1, 0.9, shore));
            gl_FragColor.a = smoothstep(0.0, 0.6, shore);
          }`,
        )
    }
    // (Each pool's water is its own bowl's outline (shared poolReach), all in one mesh rebuilt when
    // you move a cell: a circle either hung out past the bank over lower ground — black plates over
    // the slopes, the user's screenshot — or, set low enough not to, left the bowls dry craters.)
    const wGeo = new THREE.BufferGeometry()
    wGeo.setAttribute('position', new THREE.BufferAttribute(this.wPos, 3))
    wGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(POOLS * (SPOKES + 1) * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3))
    const idx: number[] = []
    for (let p = 0; p < POOLS; p++) {
      const b = p * (SPOKES + 1)
      for (let k = 0; k < SPOKES; k++) idx.push(b, b + 1 + ((k + 1) % SPOKES), b + 1 + k)
    }
    wGeo.setIndex(idx)
    wGeo.setDrawRange(0, 0)
    this.water = new THREE.Mesh(wGeo, mat)
    this.water.frustumCulled = false
    this.water.receiveShadow = true
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
    this.group.add(this.snags)
    // (With the soft layers: see the material.)
    this.water.renderOrder = 1
    softScene.add(this.water)
  }

  /** The pools laid out near you: where their water stands. */
  private readonly pools: Array<{ x: number; z: number; r: number; level: number }> = []

  private readonly water0: ReturnType<typeof poolWater>

  /**
   * Under a pool's water at (x, z), whether or not the pool is laid out near you yet (the grass
   * asks: it grew on the beds of the pools, under the water).
   */
  wetAt(x: number, z: number): boolean {
    return this.water0.wetAt(x, z)
  }

  /** The water surface over (x, z) in a marsh pool near you, or NaN. */
  levelAt(x: number, z: number): number {
    for (const p of this.pools) if ((x - p.x) ** 2 + (z - p.z) ** 2 < p.r * p.r && this.terrain.heightAt(x, z) < p.level && poolBowl(x, z) > 0) return p.level
    return NaN
  }

  /** Lay out the pools' water and the drowned trees round `cam` (when it has moved a cell). */
  update(cam: THREE.Vector3): void {
    const key = `${Math.floor(cam.x / POOL_CELL)},${Math.floor(cam.z / POOL_CELL)}`
    if (key === this.lastKey) return
    this.lastKey = key
    if (this.mire(cam.x, cam.z) < 0.01 && this.mire(cam.x + Math.sign(-cam.x) * NEAR, cam.z) < 0.01) {
      this.water.geometry.setDrawRange(0, 0)
      this.snags.count = 0
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
        const level = pool ? this.water0.level(cx, cz, pool) : NaN
        if (pool && !Number.isNaN(level) && nw < POOLS) {
          const o = nw * (SPOKES + 1) * 3
          this.wPos[o] = pool.x
          this.wPos[o + 1] = level
          this.wPos[o + 2] = pool.z
          let far = 0
          for (let k = 0; k < SPOKES; k++) {
            const a = (k / SPOKES) * Math.PI * 2
            // (A metre past the carved edge: the bank's rise hides the rim, no dry ring shows.)
            const rr = poolReach(pool, cx, cz, a) + 1
            far = Math.max(far, rr)
            this.wPos[o + 3 + k * 3] = pool.x + Math.cos(a) * rr
            this.wPos[o + 3 + k * 3 + 1] = level
            this.wPos[o + 3 + k * 3 + 2] = pool.z + Math.sin(a) * rr
          }
          nw++
          this.pools.push({ x: pool.x, z: pool.z, r: far, level })
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
    this.water.geometry.setDrawRange(0, nw * SPOKES * 3)
    ;(this.water.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
    this.snags.count = ns
    this.snags.instanceMatrix.needsUpdate = true
  }
}

/**
 * The Mire's pools' water, worked out from the ground alone (the same everywhere, before any
 * pool is laid out): each pool's level (by cell, cached) and whether (x, z) is under one.
 */
export function poolWater(terrain: Terrain, mire: (x: number, z: number) => number) {
  const levels = new Map<number, number>()
  const level = (cx: number, cz: number, pool: { x: number; z: number; r: number }): number => {
    const k = cx * 100003 + cz
    let l = levels.get(k)
    if (l === undefined) {
      // The water stands a little under the LOWEST point of its bowl's lip, never above it: on the
      // flat Mire that is nearly brim-full; where the Mire runs onto the slopes at the cliffs' feet the
      // downhill lip sets it, and the uphill side of the bowl stands dry (it hung out over the slope
      // as a flat black plate when set from the rim's average — the user's screenshot, 2026-11-08).
      let rim = Infinity
      let top = -Infinity
      for (let i = 0; i < SPOKES; i++) {
        const a = (i / SPOKES) * Math.PI * 2
        const rr = poolReach(pool, cx, cz, a) + 1
        const h = terrain.heightAt(pool.x + Math.cos(a) * rr, pool.z + Math.sin(a) * rr)
        rim = Math.min(rim, h)
        top = Math.max(top, h)
      }
      // (On a steep slope no water at all, a dry hollow: peat-black water lying in dents on a bare
      // rock face read as holes in the land — storm flyover, 2026-11-08, the Mire's western slopes.)
      l = top - rim > 4 ? NaN : rim - 0.3
      if (levels.size > 6000) levels.clear()
      levels.set(k, l)
    }
    return l
  }
  const wetAt = (x: number, z: number): boolean => {
    if (mire(x, z) < 0.2) return false
    const cx = Math.floor(x / POOL_CELL)
    const cz = Math.floor(z / POOL_CELL)
    const pool = poolInCell(cx, cz)
    if (!pool || (x - pool.x) ** 2 + (z - pool.z) ** 2 > (pool.r * 1.8) ** 2 || poolBowl(x, z) <= 0) return false
    return terrain.heightAt(x, z) < level(cx, cz, pool) + 0.05
  }
  return { level, wetAt }
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
