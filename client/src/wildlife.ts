// Wildlife: herds of plains striders. Traditional game AI, no LLM:
//
//   herd mind (finite-state machine): graze → travel → drink → graze, with
//     thirst rising over time; a thirsty herd walks to the nearest lake a
//     Titan made — life follows the Titans. Any Titan footfall nearby, a
//     Titan walking close, or a Wanderer right among them: flee.
//   each animal (steering): seek the herd's goal, plus separation, cohesion
//     and alignment with its herd; never wade into deep water.
//
// Drawn as a few InstancedMeshes (body, neck, head, legs), every leg swung
// per animal per frame — about forty animals cost a handful of draw calls.
// Single player for now: in multiplayer each client runs its own herds
// (server-run wildlife comes with multiplayer).

import * as THREE from 'three'
import { inBasin, mulberry32, type Lake, type LakeSystem, type Terrain } from '@titans/shared'

const HERDS = 4
const PER_HERD = [9, 7, 10, 8]
const SPEED = { graze: 0.5, travel: 3.2, drink: 0, flee: 9 }
const THIRST_RATE = 1 / 240 // a herd gets thirsty in about four minutes

type HerdState = 'graze' | 'travel' | 'drink' | 'flee'

interface Animal {
  x: number
  z: number
  y: number
  vx: number
  vz: number
  heading: number
  stride: number
  head: number // 0 head up … 1 head down (grazing, drinking)
  wanderA: number
}

interface Herd {
  animals: Animal[]
  state: HerdState
  timer: number
  thirst: number
  tx: number
  tz: number
  /** Where fear comes from, while fleeing. */
  fx: number
  fz: number
}

/** Something big to be afraid of. */
export interface Threat {
  x: number
  z: number
  /** Metres: inside this, the herd bolts. */
  r: number
}

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3(1, 1, 1)
const _local = new THREE.Matrix4()
const _neck = new THREE.Matrix4()
const _part = new THREE.Matrix4()
const HIPS: Array<[number, number, number]> = [
  [-0.2, 0.62, 1],
  [0.2, 0.62, -1],
  [-0.2, -0.62, -1],
  [0.2, -0.62, 1],
]

export class Wildlife {
  readonly group = new THREE.Group()
  readonly herds: Herd[] = []
  private readonly body: THREE.InstancedMesh
  private readonly neck: THREE.InstancedMesh
  private readonly headM: THREE.InstancedMesh
  private readonly legs: THREE.InstancedMesh
  private readonly rand = mulberry32(4242)
  private readonly count: number

  constructor(
    private readonly terrain: Terrain,
    private readonly lakes: LakeSystem,
  ) {
    // Spread the herds around spawn on the open plain.
    for (let h = 0; h < HERDS; h++) {
      const a = (h / HERDS) * Math.PI * 2 + 0.6
      const r = 350 + h * 260
      const cx = Math.cos(a) * r
      const cz = Math.sin(a) * r
      const animals: Animal[] = []
      for (let i = 0; i < PER_HERD[h]; i++) {
        const x = cx + (this.rand() - 0.5) * 30
        const z = cz + (this.rand() - 0.5) * 30
        animals.push({ x, z, y: terrain.heightAt(x, z), vx: 0, vz: 0, heading: this.rand() * 6.28, stride: this.rand() * 6, head: 1, wanderA: this.rand() * 6.28 })
      }
      this.herds.push({ animals, state: 'graze', timer: 5 + this.rand() * 20, thirst: this.rand() * 0.5, tx: cx, tz: cz, fx: 0, fz: 0 })
    }
    this.count = PER_HERD.reduce((a, b) => a + b, 0)

    const hide = new THREE.MeshStandardMaterial({ color: 0x8c6a46, roughness: 0.9 })
    const dark = new THREE.MeshStandardMaterial({ color: 0x4e3a28, roughness: 0.9 })
    const bodyG = new THREE.SphereGeometry(1, 14, 10).scale(0.42, 0.42, 0.95)
    const neckG = new THREE.CylinderGeometry(0.12, 0.18, 0.8, 8).translate(0, 0.4, 0)
    const headG = new THREE.SphereGeometry(1, 10, 8).scale(0.13, 0.15, 0.3).translate(0, 0, 0.18)
    const legG = new THREE.CylinderGeometry(0.06, 0.045, 1.05, 6).translate(0, -0.525, 0)
    this.body = this.instanced(bodyG, hide, this.count)
    this.neck = this.instanced(neckG, hide, this.count)
    this.headM = this.instanced(headG, hide, this.count)
    this.legs = this.instanced(legG, dark, this.count * 4)
  }

  private instanced(g: THREE.BufferGeometry, m: THREE.Material, n: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(g, m, n)
    mesh.castShadow = true
    mesh.frustumCulled = false
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.group.add(mesh)
    return mesh
  }

  /** A footfall or stomp at (x, z): every herd within `r` bolts away from it. */
  alarm(x: number, z: number, r: number): void {
    for (const h of this.herds) {
      const [cx, cz] = centre(h)
      if (Math.hypot(cx - x, cz - z) > r) continue
      h.state = 'flee'
      h.timer = 10 + this.rand() * 6
      h.fx = x
      h.fz = z
    }
  }

  /** One fixed step. `threats`: Titans (and the Wanderer) the herds should keep clear of. */
  step(dt: number, threats: readonly Threat[]): void {
    for (const h of this.herds) {
      this.think(h, dt, threats)
      this.steer(h, dt)
    }
  }

  // --- the herd's mind -------------------------------------------------------

  private think(h: Herd, dt: number, threats: readonly Threat[]): void {
    const [cx, cz] = centre(h)
    h.timer -= dt
    h.thirst = Math.min(1, h.thirst + THIRST_RATE * dt)

    // Fear first: anything big and close sends them running.
    if (h.state !== 'flee') {
      for (const t of threats) {
        if (Math.hypot(t.x - cx, t.z - cz) < t.r) {
          h.state = 'flee'
          h.timer = 8 + this.rand() * 5
          h.fx = t.x
          h.fz = t.z
          break
        }
      }
    }

    switch (h.state) {
      case 'flee': {
        // Run straight away from the fright.
        const dx = cx - h.fx
        const dz = cz - h.fz
        const d = Math.hypot(dx, dz) || 1
        h.tx = cx + (dx / d) * 80
        h.tz = cz + (dz / d) * 80
        if (h.timer <= 0) this.settle(h)
        break
      }
      case 'graze':
        if (h.thirst > 0.6 && this.goDrink(h, cx, cz)) break
        if (h.timer <= 0) {
          // Move on to fresh grass nearby, on low, open ground.
          for (let i = 0; i < 12; i++) {
            const a = this.rand() * Math.PI * 2
            const r = 60 + this.rand() * 160
            const x = cx + Math.cos(a) * r
            const z = cz + Math.sin(a) * r
            if (Math.hypot(x, z) > 1700 || this.terrain.heightAt(x, z) > 40) continue
            h.tx = x
            h.tz = z
            h.state = 'travel'
            h.timer = 120
            break
          }
          if (h.state === 'graze') h.timer = 5
        }
        break
      case 'travel':
        if (Math.hypot(h.tx - cx, h.tz - cz) < 14 || h.timer <= 0) {
          if (h.thirst > 0.6 && this.nearWater(cx, cz, 30)) {
            h.state = 'drink'
            h.timer = 18 + this.rand() * 10
          } else this.settle(h)
        }
        break
      case 'drink':
        if (h.timer <= 0) {
          h.thirst = 0
          this.settle(h)
        }
        break
    }
  }

  private settle(h: Herd): void {
    h.state = 'graze'
    h.timer = 15 + this.rand() * 30
    const [cx, cz] = centre(h)
    h.tx = cx
    h.tz = cz
  }

  /** Head for the nearest lake a Titan made, stopping on its shore. */
  private goDrink(h: Herd, cx: number, cz: number): boolean {
    let best = 1500
    let lake: Lake | null = null
    for (const l of this.lakes.lakes) {
      if (l.level <= l.basin.bottom + 0.3) continue
      const d = Math.hypot(l.basin.bx - cx, l.basin.bz - cz)
      if (d < best) {
        best = d
        lake = l
      }
    }
    if (!lake) return false
    // Walk the line from the herd toward the lake's deepest point: the first
    // wet cell is the shore; stop a few metres short of it.
    const dx = lake.basin.bx - cx
    const dz = lake.basin.bz - cz
    const n = Math.max(1, Math.ceil(best))
    let sx = lake.basin.bx
    let sz = lake.basin.bz
    for (let i = 0; i <= n; i++) {
      const x = Math.round(cx + (dx * i) / n)
      const z = Math.round(cz + (dz * i) / n)
      if (inBasin(lake.basin, x, z)) {
        const back = Math.max(0, i - 4)
        sx = cx + (dx * back) / n
        sz = cz + (dz * back) / n
        break
      }
    }
    h.tx = sx
    h.tz = sz
    h.state = 'travel'
    h.timer = 300
    return true
  }

  private nearWater(x: number, z: number, r: number): boolean {
    for (const l of this.lakes.lakes) {
      const b = l.basin
      if (x < b.x0 - r || x > b.x0 + b.w + r || z < b.z0 - r || z > b.z0 + b.h + r) continue
      for (let a = 0; a < 8; a++) {
        for (const d of [r * 0.4, r]) {
          if (inBasin(b, Math.round(x + Math.cos(a) * d), Math.round(z + Math.sin(a) * d))) return true
        }
      }
    }
    return false
  }

  /** Deep enough here that a strider will not walk in. */
  private deep(x: number, z: number): boolean {
    const ix = Math.round(x)
    const iz = Math.round(z)
    for (const l of this.lakes.lakes) {
      if (inBasin(l.basin, ix, iz) && l.level - this.terrain.cellHeight(ix, iz) > 0.45) return true
    }
    return false
  }

  // --- each animal's legs ----------------------------------------------------

  private steer(h: Herd, dt: number): void {
    const [cx, cz] = centre(h)
    let mvx = 0
    let mvz = 0
    for (const a of h.animals) {
      mvx += a.vx
      mvz += a.vz
    }
    mvx /= h.animals.length
    mvz /= h.animals.length
    const speed = SPEED[h.state]
    for (const a of h.animals) {
      // Seek the goal (grazing: amble about the herd's middle).
      let gx: number
      let gz: number
      if (h.state === 'graze' || h.state === 'drink') {
        a.wanderA += (this.rand() - 0.5) * dt * 2
        gx = (h.state === 'drink' ? h.tx : cx) + Math.cos(a.wanderA) * 6 - a.x
        gz = (h.state === 'drink' ? h.tz : cz) + Math.sin(a.wanderA) * 6 - a.z
      } else {
        gx = h.tx - a.x
        gz = h.tz - a.z
      }
      const gl = Math.hypot(gx, gz) || 1
      let dx = (gx / gl) * 1.0
      let dz = (gz / gl) * 1.0
      // Flock: keep apart, keep together, keep pace.
      for (const o of h.animals) {
        if (o === a) continue
        const ox = a.x - o.x
        const oz = a.z - o.z
        const od = Math.hypot(ox, oz)
        if (od < 2.6 && od > 0) {
          dx += (ox / od) * (2.6 - od) * 0.9
          dz += (oz / od) * (2.6 - od) * 0.9
        }
      }
      dx += (cx - a.x) * 0.012 + mvx * 0.05
      dz += (cz - a.z) * 0.012 + mvz * 0.05
      const dl = Math.hypot(dx, dz) || 1
      const want = h.state === 'graze' || h.state === 'drink' ? (Math.sin(a.wanderA * 3) > 0.3 ? speed : 0) : speed
      const k = Math.min(1, dt * (h.state === 'flee' ? 4 : 2))
      a.vx += ((dx / dl) * want - a.vx) * k
      a.vz += ((dz / dl) * want - a.vz) * k
      let nx = a.x + a.vx * dt
      let nz = a.z + a.vz * dt
      if (this.deep(nx, nz)) {
        // Never into deep water: slide along the shore instead.
        const t = a.vx
        a.vx = -a.vz * 0.6
        a.vz = t * 0.6
        nx = a.x + a.vx * dt
        nz = a.z + a.vz * dt
        if (this.deep(nx, nz)) {
          nx = a.x
          nz = a.z
          a.vx = a.vz = 0
        }
      }
      a.x = nx
      a.z = nz
      a.y = this.terrain.heightAt(a.x, a.z)
      const sp = Math.hypot(a.vx, a.vz)
      if (sp > 0.15) {
        let dh = Math.atan2(a.vx, a.vz) - a.heading
        dh = Math.atan2(Math.sin(dh), Math.cos(dh))
        a.heading += dh * Math.min(1, dt * 6)
      }
      a.stride += sp * dt * 2.4
      const down = (h.state === 'graze' && sp < 0.2) || h.state === 'drink' ? 1 : 0
      a.head += (down - a.head) * Math.min(1, dt * 2)
    }
  }

  /** Write every animal's parts into the instanced meshes. */
  render(): void {
    let i = 0
    for (const h of this.herds) {
      for (const a of h.animals) {
        _q.setFromAxisAngle(_p.set(0, 1, 0), a.heading)
        const bob = Math.abs(Math.sin(a.stride)) * 0.05
        _m.compose(_p.set(a.x, a.y + 1.2 + bob, a.z), _q, _s)
        this.body.setMatrixAt(i, _m)
        // Neck rises from the chest, and dips to graze or drink.
        _e.set(-0.7 + a.head * 1.75, 0, 0)
        _local.makeRotationFromEuler(_e).setPosition(0, 0.12, 0.72)
        _neck.multiplyMatrices(_m, _local)
        this.neck.setMatrixAt(i, _neck)
        _local.makeRotationFromEuler(_e.set(0.5 - a.head * 0.7, 0, 0)).setPosition(0, 0.8, 0)
        this.headM.setMatrixAt(i, _part.multiplyMatrices(_neck, _local))
        // Legs: diagonal pairs swing together.
        const sw = Math.sin(a.stride) * 0.55
        for (let l = 0; l < 4; l++) {
          _local.makeRotationX(HIPS[l][2] * sw).setPosition(HIPS[l][0], -0.15, HIPS[l][1])
          this.legs.setMatrixAt(i * 4 + l, _part.multiplyMatrices(_m, _local))
        }
        i++
      }
    }
    this.body.instanceMatrix.needsUpdate = true
    this.neck.instanceMatrix.needsUpdate = true
    this.headM.instanceMatrix.needsUpdate = true
    this.legs.instanceMatrix.needsUpdate = true
  }

  stats(): Array<{ state: HerdState; thirst: number; x: number; z: number; n: number }> {
    return this.herds.map((h) => {
      const [x, z] = centre(h)
      return { state: h.state, thirst: +h.thirst.toFixed(2), x, z, n: h.animals.length }
    })
  }
}

function centre(h: Herd): [number, number] {
  let x = 0
  let z = 0
  for (const a of h.animals) {
    x += a.x
    z += a.z
  }
  return [x / h.animals.length, z / h.animals.length]
}
