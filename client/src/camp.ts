// The camp: someone stopped here on the Green, a short walk ahead of where you
// wake, and did not come back for their things. A ring of cold stones, a burnt
// log, a bedroll gone to moss, a pole with a strip of red cloth snapping in
// the wind (so you see it from where you start) — and the bag.

import * as THREE from 'three'
import { mulberry32, type Terrain } from '@titans/shared'
import { carvedStone } from './spots'

/**
 * Where it is: at the top of the Undercroft's stair, a few steps out on the
 * grass — the first close thing you see when you climb out into the light.
 */
export const CAMP = { x: -232, z: 1518 }

export class Camp {
  readonly group = new THREE.Group()
  private readonly bag: THREE.Group
  private readonly cloth: THREE.Mesh
  private readonly rest: Float32Array
  readonly bagAt = new THREE.Vector3()
  private time = 0

  /** At `where` (the first, with the bag, by default); `withBag` false for the traveller's later camps. */
  constructor(terrain: Terrain, where: { x: number; z: number } = CAMP, withBag = true) {
    const CAMP = where
    const rand = mulberry32(4711)
    const at = (dx: number, dz: number, lift = 0) => new THREE.Vector3(CAMP.x + dx, terrain.heightAt(CAMP.x + dx, CAMP.z + dz) + lift, CAMP.z + dz)
    const stone = carvedStone()
    const char = new THREE.MeshStandardMaterial({ color: 0x1e1a17, roughness: 1 })
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a4430, roughness: 0.95 })
    const roll = new THREE.MeshStandardMaterial({ color: 0x5e4a3a, roughness: 1 })
    const leather = new THREE.MeshStandardMaterial({ color: 0x7a4f33, roughness: 0.8 })
    // The fire ring, cold.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rand() * 0.2
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 + rand() * 0.1, 0), stone)
      s.position.copy(at(Math.cos(a) * 0.75, Math.sin(a) * 0.75, 0.08))
      s.rotation.set(rand() * 3, rand() * 3, rand() * 3)
      this.group.add(s)
    }
    const ash = new THREE.Mesh(new THREE.CircleGeometry(0.62, 16).rotateX(-Math.PI / 2), char)
    ash.position.copy(at(0, 0, 0.03))
    this.group.add(ash)
    for (const r of [0.5, -0.7]) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 6).rotateZ(Math.PI / 2).rotateY(r), char)
      log.position.copy(at(0, 0, 0.12))
      this.group.add(log)
    }
    // The bedroll, half unrolled.
    const bed = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.9, 10).rotateZ(Math.PI / 2).scale(1, 0.45, 1).rotateY(0.4), roll)
    bed.position.copy(at(-1.8, 0.9, 0.14))
    this.group.add(bed)
    // A pole driven into the ground, leaning, with a strip of red cloth.
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 3.6, 6).translate(0, 1.8, 0), wood)
    pole.position.copy(at(1.6, -1.2))
    pole.rotation.set(0.12, 0, -0.1)
    this.group.add(pole)
    const geo = new THREE.PlaneGeometry(1.7, 0.26, 12, 2).translate(0.85, 0, 0)
    this.rest = (geo.getAttribute('position').array as Float32Array).slice()
    this.cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x9b2b22, roughness: 0.9, side: THREE.DoubleSide }))
    this.cloth.position.set(0, 3.35, 0)
    pole.add(this.cloth)
    // The bag, by the bedroll.
    this.bag = new THREE.Group()
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8).scale(1, 0.85, 0.8), leather)
    const flap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.15, 0.5, 0.95), leather)
    flap.position.y = 0.14
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.02, 4, 16, Math.PI), wood)
    strap.position.y = 0.16
    this.bag.add(body, flap, strap)
    this.bagAt.copy(at(-0.9, 1.6, 0.2))
    this.bag.position.copy(this.bagAt)
    this.bag.rotation.y = 0.7
    this.group.add(this.bag)
    this.bag.visible = withBag
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true
    })
  }

  /** Close enough to take the bag (and it is still there). */
  near(p: THREE.Vector3): boolean {
    return this.bag.visible && p.distanceTo(this.bagAt) < 2.6
  }

  /** It is in your hands now. */
  take(): void {
    this.bag.visible = false
  }

  /** The cloth snaps in the wind. */
  update(dt: number, wind: number): void {
    this.time += dt
    const pos = this.cloth.geometry.getAttribute('position') as THREE.BufferAttribute
    const a = pos.array as Float32Array
    for (let i = 0; i < pos.count; i++) {
      const x = this.rest[i * 3]
      const k = x / 1.7
      a[i * 3 + 2] = Math.sin(this.time * (4 + wind * 5) - x * 4.5) * 0.16 * k * (0.5 + wind)
      a[i * 3 + 1] = this.rest[i * 3 + 1] - k * k * 0.18 * (1 - wind * 0.6)
    }
    pos.needsUpdate = true
    this.cloth.geometry.computeVertexNormals()
  }
}
