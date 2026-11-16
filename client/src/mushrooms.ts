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
    const k = Math.min(1, y / 0.25)
    // (Damp grey-cream, not white: bare white stems read as plastic.)
    return [0.22 + 0.32 * k, 0.2 + 0.29 * k, 0.17 + 0.22 * k]
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
