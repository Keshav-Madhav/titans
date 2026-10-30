// Townsfolk: the people of the towns. Traditional game AI, no LLM — a small
// state machine each:
//
//   idle  → stand at a door, the well, a stall or the shore a while
//   walk  → to another of those places in their own town
//   flee  → a Titan close by: run from it, then go home
//
// One per hut, two per house, a merchant per stall. Only people within
// ACTIVE_R of the camera are simulated and drawn (a whole town's worth of
// cloaks costs draw calls); the rest wait where they are.

import * as THREE from 'three'
import { mulberry32, type Terrain } from '@titans/shared'
import { cloakedBodyGeometry } from './wanderer'
import type { Settlement } from './settlement'
import type { Threat } from './wildlife'

const CLOAKS = [0x6b5a45, 0x5c6b4a, 0x7a5f4a, 0x4f5a66, 0x80704f, 0x6a4f5a, 0x8a4a3a, 0x3f5f5a]
const WALK = 1.4
const RUN = 5
const ACTIVE_R = 420
const MAX_FOLK = 140

interface Person {
  x: number
  /** Walk-cycle phase and how fast they were moving last frame (for the legs). */
  stride: number
  px: number
  pz: number
  color: number
  z: number
  yaw: number
  /** The building they live (or trade) at. */
  home: number
  town: number
  merchant: boolean
  state: 'idle' | 'walk' | 'flee'
  timer: number
  tx: number
  tz: number
}

const _m = new THREE.Matrix4()
const _leg = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _p = new THREE.Vector3()
const _one = new THREE.Vector3(1, 1, 1)
const _up = new THREE.Vector3(0, 1, 0)
const _c = new THREE.Color()

export class Townsfolk {
  readonly group = new THREE.Group()
  readonly folk: Person[] = []
  // Everyone drawn as instances: a crowd is four draw calls, not hundreds.
  private readonly cloaks: THREE.InstancedMesh
  private readonly faces: THREE.InstancedMesh
  private readonly legs: THREE.InstancedMesh
  private readonly rand = mulberry32(777)
  private sig = ''
  private readonly cam = new THREE.Vector3()

  constructor(
    private readonly terrain: Terrain,
    private readonly town: Settlement,
  ) {
    const g = cloakedBodyGeometry()
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b2420, roughness: 0.9 })
    this.cloaks = new THREE.InstancedMesh(g.cloak, new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide }), MAX_FOLK)
    this.cloaks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FOLK * 3), 3)
    this.faces = new THREE.InstancedMesh(g.face, dark, MAX_FOLK)
    this.legs = new THREE.InstancedMesh(g.leg, dark, MAX_FOLK * 2)
    for (const m of [this.cloaks, this.faces, this.legs]) {
      m.count = 0
      m.castShadow = true
      m.frustumCulled = false
      this.group.add(m)
    }
  }

  /** Match the people to the homes and stalls standing. */
  sync(): void {
    const b = this.town.buildings
    const sig = b.map((q) => q.id).join(',')
    if (sig === this.sig) return
    this.sig = sig
    const places = this.town.places()
    const want: Array<{ home: number; merchant: boolean }> = []
    b.forEach((q, i) => {
      if (q.kind === 'hut') want.push({ home: i, merchant: false })
      else if (q.kind === 'house') want.push({ home: i, merchant: false }, { home: i, merchant: false })
      else if (q.kind === 'stall') want.push({ home: i, merchant: true })
    })
    want.length = Math.min(want.length, MAX_FOLK)
    // Keep who we can (same house still standing), drop the rest, add newcomers.
    const ids = b.map((q) => q.id)
    const kept: Person[] = []
    const byHome = new Map<number, Person[]>()
    for (const p of this.folk) {
      if (ids.indexOf(p.home) < 0) continue
      const list = byHome.get(p.home) ?? []
      list.push(p)
      byHome.set(p.home, list)
    }
    for (const w of want) {
      const id = b[w.home].id
      const list = byHome.get(id)
      if (list && list.length) {
        kept.push(list.shift()!)
        continue
      }
      const door = places[w.home]
      kept.push({
        x: door.x,
        z: door.z,
        stride: this.rand() * 6,
        px: door.x,
        pz: door.z,
        color: CLOAKS[Math.floor(this.rand() * CLOAKS.length)],
        yaw: 0,
        home: id,
        town: b[w.home].town,
        merchant: w.merchant,
        state: 'idle',
        timer: this.rand() * 8,
        tx: door.x,
        tz: door.z,
      })
    }
    this.folk.length = 0
    this.folk.push(...kept)
  }

  step(dt: number, threats: readonly Threat[], camera: THREE.Vector3): void {
    this.cam.copy(camera)
    const places = this.town.places()
    if (places.length === 0) return
    const ids = this.town.buildings.map((q) => q.id)
    for (const p of this.folk) {
      if (Math.hypot(p.x - camera.x, p.z - camera.z) > ACTIVE_R) continue
      p.timer -= dt
      // A Titan close by: run.
      if (p.state !== 'flee') {
        for (const t of threats) {
          if (Math.hypot(t.x - p.x, t.z - p.z) < t.r) {
            p.state = 'flee'
            p.timer = 6 + this.rand() * 4
            const dx = p.x - t.x
            const dz = p.z - t.z
            const d = Math.hypot(dx, dz) || 1
            p.tx = p.x + (dx / d) * 60
            p.tz = p.z + (dz / d) * 60
            break
          }
        }
      }
      const homeAt = places[Math.max(0, ids.indexOf(p.home))]
      if (p.state === 'idle' && p.timer <= 0) {
        if (p.merchant) {
          // Merchants stay by their stall, shifting about.
          p.tx = homeAt.x + (this.rand() - 0.5) * 3
          p.tz = homeAt.z + (this.rand() - 0.5) * 3
        } else {
          // Off somewhere in their own town: the well, the market, the water, a neighbour.
          const mine = places.filter((q) => q.town === p.town)
          const wells = mine.filter((q) => q.kind === 'well')
          const stalls = mine.filter((q) => q.kind === 'stall')
          const r = this.rand()
          const dest =
            r < 0.3 && wells.length
              ? wells[Math.floor(this.rand() * wells.length)]
              : r < 0.5 && stalls.length
                ? stalls[Math.floor(this.rand() * stalls.length)]
                : r < 0.62
                  ? this.shore(p)
                  : mine[Math.floor(this.rand() * mine.length)]
          p.tx = dest.x + (this.rand() - 0.5) * 3
          p.tz = dest.z + (this.rand() - 0.5) * 3
        }
        p.state = 'walk'
        p.timer = 90
      }
      if (p.state === 'flee' && p.timer <= 0) {
        p.tx = homeAt.x
        p.tz = homeAt.z
        p.state = 'walk'
        p.timer = 120
      }
      if (p.state === 'idle') continue
      const dx = p.tx - p.x
      const dz = p.tz - p.z
      const d = Math.hypot(dx, dz)
      if (d < 0.8 || p.timer <= 0) {
        p.state = 'idle'
        p.timer = 4 + this.rand() * 10
        continue
      }
      const speed = p.state === 'flee' ? RUN : WALK
      const nx = p.x + (dx / d) * speed * dt
      const nz = p.z + (dz / d) * speed * dt
      if (this.town.wet(nx, nz)) {
        // Do not walk into the lake: stand at its edge instead.
        p.state = 'idle'
        p.timer = 3 + this.rand() * 6
        continue
      }
      p.x = nx
      p.z = nz
      let dy = Math.atan2(dx, dz) - p.yaw
      dy = Math.atan2(Math.sin(dy), Math.cos(dy))
      p.yaw += dy * Math.min(1, dt * 6)
    }
  }

  /** A spot on the nearest shore within reach, or where they stand if there is none. */
  private shore(p: Person): { x: number; z: number } {
    for (let r = 10; r < 160; r += 10) {
      for (let a = 0; a < 12; a++) {
        const x = p.x + Math.cos((a / 12) * Math.PI * 2) * r
        const z = p.z + Math.sin((a / 12) * Math.PI * 2) * r
        if (this.town.wet(x, z)) {
          const k = (r - 4) / r
          return { x: p.x + (x - p.x) * k, z: p.z + (z - p.z) * k }
        }
      }
    }
    return { x: p.x, z: p.z }
  }

  /** Everyone near the camera, into the instanced meshes, legs swinging with their pace. */
  render(dt: number): void {
    let n = 0
    for (const p of this.folk) {
      if (Math.hypot(p.x - this.cam.x, p.z - this.cam.z) > ACTIVE_R) continue
      const speed = dt > 0 ? Math.min(6, Math.hypot(p.x - p.px, p.z - p.pz) / dt) : 0
      p.px = p.x
      p.pz = p.z
      p.stride += speed * dt * 2.6
      _q.setFromAxisAngle(_up, p.yaw)
      _m.compose(_p.set(p.x, this.terrain.heightAt(p.x, p.z), p.z), _q, _one)
      this.cloaks.setMatrixAt(n, _m)
      this.cloaks.setColorAt(n, _c.setHex(p.color))
      this.faces.setMatrixAt(n, _m)
      const swing = Math.sin(p.stride) * Math.min(1, speed / 1.4) * 0.55
      for (const [i, side] of [
        [0, -1],
        [1, 1],
      ] as const) {
        _leg.makeRotationX(swing * side).setPosition(side * 0.11, 0.48, 0)
        this.legs.setMatrixAt(n * 2 + i, _leg.premultiply(_m))
      }
      n++
    }
    this.cloaks.count = this.faces.count = n
    this.legs.count = n * 2
    for (const m of [this.cloaks, this.faces, this.legs]) m.instanceMatrix.needsUpdate = true
    if (this.cloaks.instanceColor) this.cloaks.instanceColor.needsUpdate = true
  }

  /** People drawn this frame. */
  get visible(): number {
    return this.cloaks.count
  }
}
