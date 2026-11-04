// Small life that makes the land feel alive: flocks of birds wheeling over
// lakes and landmarks near you, wings beating. Traditional game AI, instanced
// (one draw call whatever the numbers).

import * as THREE from 'three'
import { mulberry32, type Terrain } from '@titans/shared'

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _e = new THREE.Euler()

// --- birds ---------------------------------------------------------------------

const FLOCKS = 6
const PER_FLOCK = 16

interface Bird {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
}

interface Flock {
  birds: Bird[]
  /** What it circles: a lake or a town. */
  cx: number
  cz: number
  cy: number
  radius: number
  spin: number
  retarget: number
}

const CROW = new THREE.Color(0x2f2b28)
const GULL = new THREE.Color(0xd9dcdf)

export class Birds {
  readonly mesh: THREE.InstancedMesh
  private readonly flocks: Flock[] = []
  private readonly time = { value: 0 }
  private readonly rand = mulberry32(808)

  constructor(private readonly terrain: Terrain) {
    // A bird: two wing triangles meeting at the body; the tips (marked) beat.
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.35, -1, 0, -0.1, 0, 0, -0.35, 0, 0, 0.35, 0, 0, -0.35, 1, 0, -0.1], 3))
    g.setAttribute('aTip', new THREE.Float32BufferAttribute([0, 1, 0, 0, 0, 1], 1))
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3))
    const phase = new Float32Array(FLOCKS * PER_FLOCK)
    for (let i = 0; i < phase.length; i++) phase[i] = this.rand() * 6.28
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1))
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.time
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aTip;\nattribute float aPhase;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += aTip * sin(uTime * 9.0 + aPhase) * 0.7;')
    }
    this.mesh = new THREE.InstancedMesh(g, mat, FLOCKS * PER_FLOCK)
    this.mesh.frustumCulled = false
    for (let i = 0; i < FLOCKS * PER_FLOCK; i++) this.mesh.setColorAt(i, CROW)
    for (let f = 0; f < FLOCKS; f++) {
      const birds: Bird[] = []
      for (let i = 0; i < PER_FLOCK; i++) birds.push({ x: 0, y: 1e5, z: 0, vx: 0, vy: 0, vz: 0 })
      this.flocks.push({ birds, cx: 0, cz: 0, cy: 60, radius: 70, spin: this.rand() < 0.5 ? 1 : -1, retarget: 0 })
    }
  }

  /** `spots`: places worth circling near the camera (lakes, towns). */
  step(dt: number, camera: THREE.Vector3, spots: ReadonlyArray<{ x: number; z: number; pale?: boolean }>): void {
    this.time.value += dt
    for (const f of this.flocks) {
      f.retarget -= dt
      const far = Math.hypot(f.cx - camera.x, f.cz - camera.z) > 1300
      if ((f.retarget <= 0 || far) && spots.length) {
        const near = spots.filter((s) => Math.hypot(s.x - camera.x, s.z - camera.z) < 1100)
        const pool = near.length ? near : spots
        const s = pool[Math.floor(this.rand() * pool.length)]
        f.cx = s.x + (this.rand() - 0.5) * 80
        f.cz = s.z + (this.rand() - 0.5) * 80
        f.cy = this.terrain.heightAt(f.cx, f.cz) + 35 + this.rand() * 70
        f.radius = 40 + this.rand() * 80
        f.retarget = 40 + this.rand() * 60
        // Seabirds are pale (gulls over the beach); the rest dark against the sky.
        const fi = this.flocks.indexOf(f)
        const col = s.pale ? GULL : CROW
        for (let i = 0; i < f.birds.length; i++) this.mesh.setColorAt(fi * PER_FLOCK + i, col)
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
        if (far) for (const b of f.birds) Object.assign(b, { x: f.cx + (this.rand() - 0.5) * 30, y: f.cy, z: f.cz + (this.rand() - 0.5) * 30 })
      }
      // Each bird circles the spot, loosely, and keeps a little apart from the next.
      for (let i = 0; i < f.birds.length; i++) {
        const b = f.birds[i]
        const dx = b.x - f.cx
        const dz = b.z - f.cz
        const d = Math.hypot(dx, dz) || 1
        // Tangent (orbit) + pull to the ring + to the height.
        let ax = (-dz / d) * f.spin * 14 + (dx / d) * (f.radius - d) * 0.25 - b.vx
        let az = (dx / d) * f.spin * 14 + (dz / d) * (f.radius - d) * 0.25 - b.vz
        let ay = (f.cy + Math.sin(this.time.value * 0.7 + i) * 6 - b.y) * 0.5 - b.vy
        const o = f.birds[(i + 1) % f.birds.length]
        const ox = b.x - o.x
        const oz = b.z - o.z
        const od = Math.hypot(ox, oz, b.y - o.y)
        if (od < 4 && od > 0) {
          ax += (ox / od) * 20
          az += (oz / od) * 20
        }
        b.vx += ax * dt * 1.5
        b.vy += ay * dt * 1.5
        b.vz += az * dt * 1.5
        b.x += b.vx * dt
        b.y += b.vy * dt
        b.z += b.vz * dt
      }
    }
  }

  render(): void {
    let n = 0
    for (const f of this.flocks) {
      for (const b of f.birds) {
        _e.set(0, Math.atan2(b.vx, b.vz), Math.max(-0.5, Math.min(0.5, -b.vy * 0.05)))
        _q.setFromEuler(_e)
        _m.compose(_p.set(b.x, b.y, b.z), _q, _s.set(1, 1, 1))
        this.mesh.setMatrixAt(n++, _m)
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
