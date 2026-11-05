// What the Dune Sea's bell wakes (PLAN §4b.3): the head in the sand. Out in the dunes a smooth
// bump of carved stone stands a couple of metres out of the sand — the crown of a head, buried.
// Rung, the sand round it shivers and it rises, slowly, sand pouring off it, until it stands to the
// chin: a great stone face, and its open mouth a doorway into a small dark room. What was kept in
// there is there.
//
// Sculpted as the colossi are (rock-fields 'head', with a real room in its jaw behind the doorway
// of its lips), one formation, solid; it rises by its `y` (collision follows it) and its mesh with it.

import * as THREE from 'three'
import type { Terrain } from '@titans/shared'
import type { Formation, Rocks } from './rocks'
import { LAYER } from './terrain-material'

/** The chin sits this far into the sand when it stands (the room's floor is then the sand's level). */
const SINK = 1.0
/** Asleep: only the crown (this much of it) shows. */
const SHOWS = 2.2
const TOP = 25

export class DuneHead {
  readonly f: Formation
  /** Where what was kept sits (world), in the room. */
  readonly inside = new THREE.Vector3()
  private readonly ySleep: number
  private readonly yWake: number
  private readonly ground: number
  private t = -1
  readonly secs = 46
  private puffT = 0
  /** Sand off it as it rises (world x, y, z at its foot). */
  onPour: (x: number, y: number, z: number) => void = () => {}
  onDone: () => void = () => {}

  constructor(rocks: Rocks, terrain: Terrain, x: number, z: number, rot: number, seed: number) {
    let ground = Infinity
    for (let a = 0; a < 6.28; a += 0.6) for (const r of [0, 4, 8]) ground = Math.min(ground, terrain.heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r))
    this.ground = ground
    this.yWake = ground - SINK
    // (The crown above the highest sand round it: from the lowest, a dune covered it.)
    let high = -Infinity
    for (let a = 0; a < 6.28; a += 0.6) for (const r of [0, 4]) high = Math.max(high, terrain.heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r))
    this.ySleep = high + SHOWS - TOP
    // Sculpted as the colossi are (rock-fields 'head': a field meshed on the workers), placed where
    // it will stand, then sunk.
    rocks.addColossus({ kind: 'head', x, z, y: this.yWake, rot, seed, layers: [LAYER.relief, LAYER.sand], scale: 9, tint: [0.98, 0.88, 0.72], res: 72 })
    this.f = rocks.formations[rocks.formations.length - 1]
    this.setY(this.ySleep)
    const c = Math.cos(rot)
    const s = Math.sin(rot)
    // In the room, toward the back.
    const lx = 0
    const lz = -2.2
    this.inside.set(x + lx * c + lz * s, this.yWake + 1.0, z - lx * s + lz * c)
  }

  private setY(y: number): void {
    this.f.y = y
    if (this.f.mesh) this.f.mesh.position.y = y
  }

  /**
   * The sand out of its mouth and room, and a hollow in front of the doorway sloping up to the
   * dunes (risen, the dunes stood in its doorway and you could not get in). Returns the box changed.
   */
  dig(terrain: Terrain): { x0: number; z0: number; x1: number; z1: number } {
    const floor = this.yWake + 1.0 - 0.05
    const c = Math.cos(this.f.rot)
    const s = Math.sin(this.f.rot)
    const R = 40
    const x0 = Math.floor(this.f.x - R)
    const z0 = Math.floor(this.f.z - R)
    for (let iz = z0; iz <= this.f.z + R; iz++)
      for (let ix = x0; ix <= this.f.x + R; ix++) {
        // Local: x across the face, z out of it.
        const dx = ix - this.f.x
        const dz = iz - this.f.z
        const lx = dx * c - dz * s
        const lz = dx * s + dz * c
        // The core: the room, the doorway and an apron out in front of it.
        const ox = Math.max(0, Math.abs(lx) - 4)
        const oz = Math.max(0, -6 - lz, lz - 15)
        const out = Math.hypot(ox, oz)
        // (Inside the head's sides, nothing to dig but the room: the stone is there.)
        if (Math.abs(lx) > 4 && lz < 8 && lz > -8) continue
        const target = floor + out * 0.45
        const now = terrain.heightAt(ix, iz)
        if (now <= target) continue
        terrain.delta.lowerTo(ix, iz, target - (now - terrain.delta.at(ix, iz)))
      }
    return { x0, z0, x1: Math.ceil(this.f.x + R), z1: Math.ceil(this.f.z + R) }
  }

  wake(): void {
    if (this.t < 0) this.t = 0
  }

  finish(): void {
    this.t = this.secs + 1
    this.setY(this.yWake)
  }

  get running(): boolean {
    return this.t >= 0 && this.t <= this.secs
  }

  update(dt: number): void {
    // (Its mesh is made on a worker, after it was sunk: put it where it is.)
    if (this.f.mesh && this.f.mesh.position.y !== this.f.y) this.f.mesh.position.y = this.f.y
    if (!this.running) return
    this.t += dt
    const k = Math.min(1, this.t / this.secs)
    // Slow to start (the sand holds it), slowest at the end.
    const e = k * k * k * (k * (k * 6 - 15) + 10)
    this.setY(this.ySleep + (this.yWake - this.ySleep) * e)
    // Sand pouring off it at the line where it leaves the ground, round it.
    this.puffT -= dt
    if (this.puffT < 0 && k < 0.97) {
      this.puffT = 0.12
      const a = Math.random() * Math.PI * 2
      const r = 8 + Math.random() * 2
      const px = this.f.x + Math.cos(a) * r
      const pz = this.f.z + Math.sin(a) * r
      this.onPour(px, this.ground, pz)
    }
    if (this.t > this.secs) this.onDone()
  }
}
