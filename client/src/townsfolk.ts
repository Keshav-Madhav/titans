// Townsfolk: the people of the settlement. Traditional game AI, no LLM — a
// small state machine each:
//
//   idle  → stand at a door, the well or the shore a while
//   walk  → to another of those places (the well and the water most often)
//   flee  → a Titan close by: run from it, then go home
//
// One per hut, two per house (at most sixteen). Cloaked like Wanderers, in
// homespun colours.

import * as THREE from 'three'
import { mulberry32, type Terrain } from '@titans/shared'
import { Wanderer } from './wanderer'
import type { Settlement } from './settlement'
import type { Threat } from './wildlife'

const CLOAKS = [0x6b5a45, 0x5c6b4a, 0x7a5f4a, 0x4f5a66, 0x80704f, 0x6a4f5a]
const WALK = 1.4
const RUN = 5

interface Person {
  body: Wanderer
  x: number
  z: number
  yaw: number
  home: number
  state: 'idle' | 'walk' | 'flee'
  timer: number
  tx: number
  tz: number
}

export class Townsfolk {
  readonly group = new THREE.Group()
  readonly folk: Person[] = []
  private readonly rand = mulberry32(777)

  constructor(
    private readonly terrain: Terrain,
    private readonly town: Settlement,
  ) {}

  /** Match the number of people to the homes standing (and send the homeless away). */
  sync(): void {
    const homes = this.town.buildings.flatMap((b, i) => (b.kind === 'hut' ? [i] : b.kind === 'house' ? [i, i] : []))
    const want = Math.min(16, homes.length)
    while (this.folk.length > want) {
      const p = this.folk.pop()!
      this.group.remove(p.body.obj)
    }
    const places = this.town.places()
    while (this.folk.length < want) {
      const home = homes[this.folk.length]
      const door = places[home]
      const body = new Wanderer(CLOAKS[this.folk.length % CLOAKS.length])
      this.group.add(body.obj)
      this.folk.push({ body, x: door.x, z: door.z, yaw: 0, home, state: 'idle', timer: this.rand() * 6, tx: door.x, tz: door.z })
    }
    for (const p of this.folk) if (p.home >= places.length) p.home = 0
  }

  step(dt: number, threats: readonly Threat[]): void {
    const places = this.town.places()
    if (places.length === 0) return
    for (const p of this.folk) {
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
      if (p.state === 'idle' && p.timer <= 0) {
        // Off somewhere: the well or the water most often, else a neighbour's door.
        const wells = places.filter((q) => q.kind === 'well')
        const r = this.rand()
        const dest = r < 0.45 && wells.length ? wells[Math.floor(this.rand() * wells.length)] : r < 0.65 ? this.shore(p) : places[Math.floor(this.rand() * places.length)]
        p.tx = dest.x + (this.rand() - 0.5) * 3
        p.tz = dest.z + (this.rand() - 0.5) * 3
        p.state = 'walk'
        p.timer = 90
      }
      if (p.state === 'flee' && p.timer <= 0) {
        const home = places[Math.min(p.home, places.length - 1)]
        p.tx = home.x
        p.tz = home.z
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

  /** A spot on the nearest shore within reach, or home if there is none. */
  private shore(p: Person): { x: number; z: number } {
    for (let r = 10; r < 160; r += 10) {
      for (let a = 0; a < 12; a++) {
        const x = p.x + Math.cos((a / 12) * Math.PI * 2) * r
        const z = p.z + Math.sin((a / 12) * Math.PI * 2) * r
        if (this.town.wet(x, z)) {
          // Step back to dry ground.
          const k = (r - 4) / r
          return { x: p.x + (x - p.x) * k, z: p.z + (z - p.z) * k }
        }
      }
    }
    return { x: p.x, z: p.z }
  }

  render(dt: number): void {
    for (const p of this.folk) p.body.drive(dt, p.x, this.terrain.heightAt(p.x, p.z), p.z, p.yaw)
  }
}
