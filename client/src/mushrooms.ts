// Giant mushrooms on the Mire's edges, where the Old Wood goes down into the water (the user:
// "things should generally be huge"): pale stems four to twelve metres tall under wide brown caps,
// gills underneath, in clusters of three to seven, leaning a little each their own way.

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { mulberry32, type Terrain } from '@titans/shared'

const CELL = 60
const FAR = 520
const CAP = 1400

/** One mushroom, 1 m tall: a slightly bulging stem, a domed cap 1.3 m across with gills under it. */
function mushroomGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const paint = (g: THREE.BufferGeometry, rgb: (y: number, nx: number, ny: number) => [number, number, number]) => {
    const p = g.getAttribute('position') as THREE.BufferAttribute
    const n = g.getAttribute('normal') as THREE.BufferAttribute
    const c = new Float32Array(p.count * 3)
    for (let i = 0; i < p.count; i++) {
      const [r, gg, b] = rgb(p.getY(i), n.getX(i), n.getY(i))
      c[i * 3] = r
      c[i * 3 + 1] = gg
      c[i * 3 + 2] = b
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3))
    g.deleteAttribute('uv')
    return g
  }
  // The stem: thicker at the foot, pale, darkening down into the mud.
  const stem = new THREE.LatheGeometry(
    [0, 0.12, 0.3, 0.55, 0.8, 0.92].map((y, i) => new THREE.Vector2(0.13 - 0.04 * (y / 0.92) + (i === 0 ? 0.05 : 0) + 0.015 * Math.sin(y * 6), y)).concat([new THREE.Vector2(0.001, 0.92)]),
    14,
  )
  stem.computeVertexNormals()
  parts.push(paint(stem, (y) => {
    // (Damp grey-tan, mud-dark at the foot and fading up the whole stem, a touch paler under the cap:
    // the cream stems still read as plastic poles in full sun.)
    const k = Math.pow(Math.min(1, y / 0.9), 0.6)
    return [0.14 + 0.17 * k, 0.12 + 0.14 * k, 0.09 + 0.09 * k]
  }))
  // The cap: a dome, brown on top fading paler to the rim.
  const cap = new THREE.SphereGeometry(0.65, 20, 8, 0, Math.PI * 2, 0, Math.PI * 0.42).scale(1, 0.78, 1).translate(0, 0.76, 0)
  parts.push(paint(cap, (y) => {
    const k = Math.min(1, Math.max(0, (y - 0.82) / 0.24))
    return [0.36 - 0.18 * k, 0.24 - 0.12 * k, 0.15 - 0.07 * k]
  }))
  // Gills: a dark ring under the cap's rim.
  const gills = new THREE.RingGeometry(0.07, 0.62, 28, 1).rotateX(Math.PI / 2).translate(0, 0.84, 0)
  for (let i = 0; i < gills.getAttribute('position').count; i++) {
    const p = gills.getAttribute('position') as THREE.BufferAttribute
    const r = Math.hypot(p.getX(i), p.getZ(i))
    p.setY(i, 0.84 + 0.08 * (r / 0.62))
  }
  gills.computeVertexNormals()
  parts.push(paint(gills, () => [0.2, 0.15, 0.12]))
  // Which parts glow at night: the gills (1), nothing else.
  // (Brightest in by the stem, fading out to the rim: an even disc read as a neon sign.)
  parts.forEach((g, k) => {
    const p = g.getAttribute('position') as THREE.BufferAttribute
    const a = new Float32Array(p.count)
    if (k === 2) for (let i = 0; i < p.count; i++) a[i] = Math.pow(1 - Math.min(1, Math.hypot(p.getX(i), p.getZ(i)) / 0.62), 1.4)
    g.setAttribute('aGlow', new THREE.BufferAttribute(a, 1))
  })
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!
}

export class Mushrooms {
  readonly mesh: THREE.InstancedMesh
  /** 0 … 1: how much night it is (main sets it). */
  readonly night = { value: 0 }
  private readonly cells = new Map<number, Float32Array>()
  private lastX = Infinity
  private lastZ = Infinity
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly e = new THREE.Euler()
  private readonly s = new THREE.Vector3()
  private readonly p = new THREE.Vector3()

  constructor(
    private readonly terrain: Terrain,
    /** 0 … 1: how much of the Mire (x, z) is. */
    private readonly mire: (x: number, z: number) => number,
    /** Under water, or not to be grown on. */
    private readonly blocked: (x: number, z: number) => boolean,
  ) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, side: THREE.DoubleSide })
    // At night the gills glow, faint and cold: you find them across the marsh by it.
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = this.night
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying float vGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.14, 0.5, 0.42) * vGlow * uNight * 0.55;')
    }
    this.mesh = new THREE.InstancedMesh(mushroomGeometry(), mat, CAP)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
  }

  /** Per cell: [x, y, z, height, yaw, lean-x, lean-z] for each mushroom. */
  private cell(cx: number, cz: number): Float32Array {
    const k = cx * 100003 + cz
    let c = this.cells.get(k)
    if (c) return c
    const rand = mulberry32((cx * 73856093) ^ (cz * 19349663) ^ 0x3a5)
    const out: number[] = []
    const x0 = (cx + rand()) * CELL
    const z0 = (cz + rand()) * CELL
    const m = this.mire(x0, z0)
    // On the Mire's edges (its rim, not out in the water's middle), a cluster now and then.
    if (m > 0.2 && m < 0.75 && rand() < 0.35) {
      const n = 3 + Math.floor(rand() * 5)
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2
        const d = rand() * 9
        const x = x0 + Math.cos(a) * d
        const z = z0 + Math.sin(a) * d
        if (this.blocked(x, z)) continue
        const h = 4 + rand() * rand() * 8
        out.push(x, this.terrain.heightAt(x, z) - 0.3, z, h, rand() * 6.28, (rand() - 0.5) * 0.22, (rand() - 0.5) * 0.22)
      }
    }
    c = new Float32Array(out)
    this.cells.set(k, c)
    return c
  }

  /**
   * Keep a walker out of the stems (they are more than a metre thick on a big one): each stem a circle
   * of its own radius at the foot, plus the body's, pushed out of sideways. Only cells already made.
   */
  stemPush(p: THREE.Vector3): void {
    const cx = Math.floor(p.x / CELL)
    const cz = Math.floor(p.z / CELL)
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.cells.get((cx + dx) * 100003 + (cz + dz))
        if (!c) continue
        for (let i = 0; i + 6 < c.length; i += 7) {
          const h = c[i + 3]
          const r = 0.15 * h + 0.3
          const ex = p.x - c[i]
          const ez = p.z - c[i + 2]
          const d = Math.hypot(ex, ez)
          if (d >= r || p.y < c[i + 1] - 1 || p.y > c[i + 1] + h * 0.75) continue
          if (d < 1e-4) p.x = c[i] + r
          else {
            p.x = c[i] + (ex / d) * r
            p.z = c[i + 2] + (ez / d) * r
          }
        }
      }
  }

  /** Distance across the ground to the nearest stem (negative inside) — the camera's lens; 99 if none. */
  stemSdf(x: number, y: number, z: number): number {
    let best = 99
    for (let cz = Math.floor((z - 8) / CELL); cz <= Math.floor((z + 8) / CELL); cz++)
      for (let cx = Math.floor((x - 8) / CELL); cx <= Math.floor((x + 8) / CELL); cx++) {
        const c = this.cells.get(cx * 100003 + cz)
        if (!c) continue
        for (let i = 0; i + 6 < c.length; i += 7) {
          const h = c[i + 3]
          if (y < c[i + 1] - 1 || y > c[i + 1] + h * 0.75) continue
          best = Math.min(best, Math.hypot(x - c[i], z - c[i + 2]) - 0.15 * h)
        }
      }
    return best
  }

  private readonly _v = new THREE.Vector3()
  private readonly _iq = new THREE.Quaternion()
  /** (x, y, z) in mushroom `c[i…]`'s own unit frame (its 1 m model), lean and all. */
  private local(c: Float32Array, i: number, x: number, y: number, z: number): THREE.Vector3 {
    this._iq.setFromEuler(this.e.set(c[i + 5], c[i + 4], c[i + 6], 'YXZ')).invert()
    return this._v.set(x - c[i], y - c[i + 1], z - c[i + 2]).applyQuaternion(this._iq).divideScalar(c[i + 3])
  }

  /** The cap's top over the model's (x, z) — 1 m model units — or NaN past its rim. */
  private static capTop(lx: number, lz: number): number {
    const d = Math.hypot(lx, lz)
    return d < 0.62 ? 0.76 + 0.78 * Math.sqrt(0.65 * 0.65 - d * d) : NaN
  }

  private each(x: number, z: number, fn: (c: Float32Array, i: number) => boolean): boolean {
    const cx = Math.floor(x / CELL)
    const cz = Math.floor(z / CELL)
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.cells.get((cx + dx) * 100003 + (cz + dz))
        if (!c) continue
        for (let i = 0; i + 6 < c.length; i += 7) {
          if (Math.abs(x - c[i]) > c[i + 3] || Math.abs(z - c[i + 2]) > c[i + 3]) continue
          if (fn(c, i)) return true
        }
      }
    return false
  }

  /** Inside a mushroom (its cap or its stem): the grappling line catches there. */
  solidAt(x: number, y: number, z: number): boolean {
    return this.each(x, z, (c, i) => {
      const l = this.local(c, i, x, y, z)
      const top = Mushrooms.capTop(l.x, l.z)
      if (!Number.isNaN(top) && l.y > 0.8 && l.y < top) return true
      return l.y > 0 && l.y < 0.85 && Math.hypot(l.x, l.z) < 0.13
    })
  }

  /** The top of a cap under you, if you are on (or just over) one: world height, or null. */
  capFloor(x: number, y: number, z: number): number | null {
    let best: number | null = null
    this.each(x, z, (c, i) => {
      const l = this.local(c, i, x, y, z)
      const top = Mushrooms.capTop(l.x, l.z)
      if (Number.isNaN(top)) return false
      const dy = (l.y - top) * c[i + 3]
      if (dy < -0.9 || dy > 0.6) return false
      // Back to the world: the cap's top straight under (x, z), near enough for a gentle dome.
      const wy = y - dy
      if (best === null || wy > best) best = wy
      return false
    })
    return best
  }

  /** The tallest mushroom within `r` of (x, z): where its cap's top is (world), or null. */
  tallestNear(x: number, z: number, r: number): THREE.Vector3 | null {
    let best: { h: number; i: number; c: Float32Array } | null = null
    const n = Math.ceil(r / CELL)
    const c0x = Math.floor(x / CELL)
    const c0z = Math.floor(z / CELL)
    for (let dz = -n; dz <= n; dz++)
      for (let dx = -n; dx <= n; dx++) {
        const c = this.cell(c0x + dx, c0z + dz)
        for (let i = 0; i + 6 < c.length; i += 7) {
          if (Math.hypot(c[i] - x, c[i + 2] - z) > r) continue
          if (!best || c[i + 3] > best.h) best = { h: c[i + 3], i, c }
        }
      }
    if (!best) return null
    // The cap's top centre, the lean applied.
    const { c, i } = best
    this.q.setFromEuler(this.e.set(c[i + 5], c[i + 4], c[i + 6], 'YXZ'))
    return new THREE.Vector3(0, (0.76 + 0.78 * 0.65) * c[i + 3], 0).applyQuaternion(this.q).add(this.p.set(c[i], c[i + 1], c[i + 2]))
  }

  update(cam: THREE.Vector3): void {
    if (Math.hypot(cam.x - this.lastX, cam.z - this.lastZ) < 25) return
    this.lastX = cam.x
    this.lastZ = cam.z
    const r = Math.ceil(FAR / CELL)
    const c0x = Math.floor(cam.x / CELL)
    const c0z = Math.floor(cam.z / CELL)
    let n = 0
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const cx = c0x + dx
        const cz = c0z + dz
        if (Math.hypot((cx + 0.5) * CELL - cam.x, (cz + 0.5) * CELL - cam.z) > FAR + CELL) continue
        const c = this.cell(cx, cz)
        for (let i = 0; i + 6 < c.length && n < CAP; i += 7) {
          this.q.setFromEuler(this.e.set(c[i + 5], c[i + 4], c[i + 6], 'YXZ'))
          this.m.compose(this.p.set(c[i], c[i + 1], c[i + 2]), this.q, this.s.set(c[i + 3], c[i + 3], c[i + 3]))
          this.mesh.setMatrixAt(n++, this.m)
        }
      }
    }
    this.mesh.count = n
    this.mesh.instanceMatrix.needsUpdate = true
    this.mesh.visible = n > 0
    if (this.cells.size > 3000) this.cells.clear()
  }
}
