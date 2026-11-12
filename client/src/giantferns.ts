// Giant ferns round the Grove (the user: "things should generally be huge"): fronds of the giants'
// age arching five to nine metres over you in the deep wood. Their own model — the ordinary fern's
// flat cards, scaled up, read as bright zig-zag paper — a spine of many segments per frond, curling
// up and over, with leaflets in pairs down both sides that droop and shorten toward the tip.

import * as THREE from 'three'
import { mulberry32, type Terrain } from '@titans/shared'

const GROVE = { x: -0.866 * 4300, z: -0.5 * 4300, r: 1900 }
const CELL = 40
/** Drawn within this of the camera. */
const FAR = 420
const CAP = 1600

/** One fern, 1 m tall (scaled per instance): fronds from a crown, each a curling spine with leaflets. */
function fernGeometry(): THREE.BufferGeometry {
  const pos: number[] = []
  const col: number[] = []
  const nrm: number[] = []
  const rand = mulberry32(0xfe4)
  const FRONDS = 8
  const SEG = 14
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ca: number[], cb: number[], cc: number[]) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize()
    // (Leaves lit from above whichever way they face: a frond's underside was black.)
    if (n.y < 0) n.negate()
    n.y = Math.max(n.y, 0.35)
    n.normalize()
    for (const [p, cl] of [[a, ca], [b, cb], [c, cc]] as const) {
      pos.push(p.x, p.y, p.z)
      col.push(cl[0], cl[1], cl[2])
      nrm.push(n.x, n.y, n.z)
    }
  }
  for (let f = 0; f < FRONDS; f++) {
    const az = (f / FRONDS) * Math.PI * 2 + rand() * 0.5
    const len = 0.85 + rand() * 0.3
    const rise = 1.05 + rand() * 0.35
    const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az))
    const side = new THREE.Vector3(-dir.z, 0, dir.x)
    const tint = rand()
    // The spine: out and up, then curling over and down toward its tip.
    const spine: THREE.Vector3[] = []
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG
      const out = len * t
      const up = rise * Math.sin(t * Math.PI * 0.62) - 0.25 * t * t
      spine.push(new THREE.Vector3(dir.x * out, up, dir.z * out))
    }
    const stem = [0.16, 0.2, 0.08]
    for (let s = 0; s < SEG; s++) {
      const t = s / SEG
      const a = spine[s]
      const b = spine[s + 1]
      // The spine itself, a thin strip.
      const w = 0.012 * (1 - t)
      tri(a.clone().addScaledVector(side, -w), a.clone().addScaledVector(side, w), b, stem, stem, stem)
      if (t < 0.08) continue
      // A leaflet each side: longest a third of the way out, shrinking to the tip, drooping.
      const L = 0.32 * Math.sin(Math.min(1, (t - 0.05) / 0.95) * Math.PI) * (1 - 0.35 * t)
      // (Deep, shaded green: in the wood's light the first, brighter green read as paper.)
      const g = [0.11 + 0.07 * tint + 0.06 * t, 0.24 + 0.07 * tint + 0.05 * t, 0.06 + 0.03 * t]
      const g2 = [g[0] * 0.75, g[1] * 0.78, g[2] * 0.8]
      for (const sgn of [-1, 1]) {
        const tip = a.clone().lerp(b, 0.5).addScaledVector(side, sgn * L).addScaledVector(dir, L * 0.25)
        tip.y -= L * 0.45
        tri(a, b, tip, g2, g2, g)
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  return geo
}

export class GiantFerns {
  readonly mesh: THREE.InstancedMesh
  private readonly time = { value: 0 }
  private readonly cells = new Map<number, Float32Array>()
  private lastX = Infinity
  private lastZ = Infinity
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly s = new THREE.Vector3()
  private readonly p = new THREE.Vector3()
  private readonly up = new THREE.Vector3(0, 1, 0)

  constructor(
    private readonly terrain: Terrain,
    private readonly forest: (x: number, z: number) => number,
    private readonly blocked: (x: number, z: number) => boolean,
  ) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide })
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.time
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // A slow heavy sway, more toward the frond tips.
        vec3 fr = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float fs = sin(uTime * 0.6 + fr.x * 0.05 + fr.z * 0.04) * 0.04 * position.y * length(position.xz);
        transformed.x += fs;
        transformed.z += fs * 0.6;`,
      )
    }
    this.mesh = new THREE.InstancedMesh(fernGeometry(), mat, CAP)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
  }

  private cell(cx: number, cz: number): Float32Array {
    const k = cx * 100003 + cz
    let c = this.cells.get(k)
    if (c) return c
    const rand = mulberry32((cx * 92821) ^ (cz * 68917) ^ 0xfe41)
    const out: number[] = []
    const n = Math.floor(rand() * 4)
    for (let i = 0; i < n; i++) {
      const x = (cx + rand()) * CELL
      const z = (cz + rand()) * CELL
      const size = 5 + rand() * 4
      const turn = rand() * Math.PI * 2
      const gd = Math.hypot(x - GROVE.x, z - GROVE.z)
      if (gd > GROVE.r || this.forest(x, z) < 0.55 || rand() > 1 - gd / GROVE.r * 0.7 || this.blocked(x, z)) continue
      out.push(x, this.terrain.heightAt(x, z) - 0.2, z, size, turn)
    }
    c = new Float32Array(out)
    this.cells.set(k, c)
    return c
  }

  update(dt: number, cam: THREE.Vector3): void {
    this.time.value += dt
    const near = Math.hypot(cam.x - GROVE.x, cam.z - GROVE.z) < GROVE.r + FAR
    this.mesh.visible = near
    if (!near || Math.hypot(cam.x - this.lastX, cam.z - this.lastZ) < 20) return
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
        for (let i = 0; i + 4 < c.length && n < CAP; i += 5) {
          this.q.setFromAxisAngle(this.up, c[i + 4])
          this.m.compose(this.p.set(c[i], c[i + 1], c[i + 2]), this.q, this.s.set(c[i + 3], c[i + 3], c[i + 3]))
          this.mesh.setMatrixAt(n++, this.m)
        }
      }
    }
    this.mesh.count = n
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.cells.size > 3000) this.cells.clear()
  }
}
