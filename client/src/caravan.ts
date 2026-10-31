// Caravans: "your city can follow the giant" (the reel). A train of covered
// wagons and walkers trails a walking giant at a respectful distance, along
// the land it is remaking; when the giant stops, the caravan circles its
// wagons and makes camp. Traditional game AI, no LLM:
//
//   follow → the leader heads for a point well behind the nearest walking
//            giant; each wagon follows the one ahead in file
//   camp   → no giant walking (or it has stopped): wagons circle up round a fire
//
// Single player for now (client-side, like the herds).

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { mulberry32, type Terrain, TITAN_HEIGHT } from '@titans/shared'
import type { Titan } from './titan'

const WAGONS = 6
const SPACING = 13
const SPEED = 4.2
const BEHIND = 1.25 * TITAN_HEIGHT // keep this far behind the giant
const TOO_CLOSE = 0.75 * TITAN_HEIGHT

interface Wagon {
  x: number
  z: number
  heading: number
  wheel: number
  mesh: THREE.Group
  wheels: THREE.Object3D[]
}

function wagonModel(): { group: THREE.Group; wheels: THREE.Object3D[] } {
  const timber = new THREE.MeshStandardMaterial({ color: 0x6b5137, roughness: 0.9 })
  const canvas = new THREE.MeshStandardMaterial({ color: 0xe6ddc6, roughness: 0.95, side: THREE.DoubleSide })
  const hide = new THREE.MeshStandardMaterial({ color: 0x5e4a36, roughness: 0.9 })
  const g = new THREE.Group()
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.55, 4.2).translate(0, 1.05, 0), timber)
  // The cover: a half-barrel of canvas over hoops.
  const cover = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 3.9, 14, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(0, 1.35, 0), canvas)
  const end = new THREE.Mesh(new THREE.CircleGeometry(1.15, 14, 0, Math.PI).translate(0, 1.35, -1.95), canvas)
  // Two oxen ahead, a pole between.
  const ox = mergeGeometries([
    new THREE.BoxGeometry(0.75, 0.85, 1.7).translate(-0.55, 1.15, 4.2),
    new THREE.BoxGeometry(0.75, 0.85, 1.7).translate(0.55, 1.15, 4.2),
    new THREE.BoxGeometry(0.4, 0.45, 0.6).translate(-0.55, 1.35, 5.2),
    new THREE.BoxGeometry(0.4, 0.45, 0.6).translate(0.55, 1.35, 5.2),
    ...[-0.85, -0.25, 0.25, 0.85].flatMap((x) => [new THREE.BoxGeometry(0.16, 0.75, 0.16).translate(x, 0.38, 3.65), new THREE.BoxGeometry(0.16, 0.75, 0.16).translate(x, 0.38, 4.75)]),
  ])!
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 2.4).translate(0, 0.95, 2.9), timber)
  g.add(bed, cover, end, new THREE.Mesh(ox, hide), pole)
  const wheels: THREE.Object3D[] = []
  for (const [x, z] of [
    [-1.12, 1.4],
    [1.12, 1.4],
    [-1.12, -1.4],
    [1.12, -1.4],
  ]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.14, 12).rotateZ(Math.PI / 2), timber)
    w.position.set(x, 0.6, z)
    g.add(w)
    wheels.push(w)
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true
  })
  return { group: g, wheels }
}

export class Caravan {
  readonly group = new THREE.Group()
  readonly wagons: Wagon[] = []
  state: 'follow' | 'camp' = 'camp'
  /** The giant being followed (null while camped). */
  following: Titan | null = null
  private readonly fire: THREE.Mesh
  private campX = 0
  private campZ = 0
  private t = 0
  /** Seconds camped in one place. Long enough by water, and the caravan settles there. */
  private camped = 0
  /** Asked whether to settle at the camp; true if a hamlet was founded there. */
  onSettle: (x: number, z: number) => boolean = () => false

  constructor(
    private readonly terrain: Terrain,
    x: number,
    z: number,
  ) {
    const rand = mulberry32(31337)
    for (let i = 0; i < WAGONS; i++) {
      const { group, wheels } = wagonModel()
      const a = (i / WAGONS) * Math.PI * 2
      const w = { x: x + Math.cos(a) * 16, z: z + Math.sin(a) * 16, heading: a + Math.PI / 2 + rand() * 0.2, wheel: 0, mesh: group, wheels }
      this.wagons.push(w)
      this.group.add(group)
    }
    this.campX = x
    this.campZ = z
    this.fire = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.4, 7), new THREE.MeshBasicMaterial({ color: 0xffa040 }))
    this.group.add(this.fire)
  }

  step(dt: number, giants: readonly Titan[], wet: (x: number, z: number) => boolean): void {
    this.t += dt
    const lead = this.wagons[0]
    // Follow the nearest giant that is walking.
    let best: Titan | null = null
    let bd = 2600
    for (const g of giants) {
      if (g.gait.speed < 0.5 || g.gait.resting) continue
      const d = Math.hypot(g.gait.x - lead.x, g.gait.z - lead.z)
      if (d < bd) {
        bd = d
        best = g
      }
    }
    this.following = best
    if (best) this.state = 'follow'
    else if (this.state === 'follow') {
      // It stopped: circle up where the leader stands.
      this.state = 'camp'
      this.campX = lead.x
      this.campZ = lead.z
    }

    if (this.state === 'camp') {
      this.camped += dt
      if (this.camped > 200) {
        this.camped = 0
        if (this.onSettle(this.campX, this.campZ)) this.depart()
      }
    } else this.camped = 0

    if (this.state === 'follow' && best) {
      const g = best.gait
      const tx = g.x - Math.sin(g.heading) * BEHIND
      const tz = g.z - Math.cos(g.heading) * BEHIND
      const tooClose = Math.hypot(g.x - lead.x, g.z - lead.z) < TOO_CLOSE
      this.drive(lead, tx, tz, tooClose ? 0 : SPEED, dt, wet)
      // In file: each wagon follows the one ahead.
      for (let i = 1; i < this.wagons.length; i++) {
        const a = this.wagons[i - 1]
        const w = this.wagons[i]
        const d = Math.hypot(a.x - w.x, a.z - w.z)
        this.drive(w, a.x, a.z, d > SPACING ? SPEED * Math.min(1.4, d / SPACING) : 0, dt, wet)
      }
    } else {
      // Camp: each wagon to its place on a ring round the fire, nose to tail.
      this.wagons.forEach((w, i) => {
        const a = (i / this.wagons.length) * Math.PI * 2
        const px = this.campX + Math.cos(a) * 17
        const pz = this.campZ + Math.sin(a) * 17
        const d = Math.hypot(px - w.x, pz - w.z)
        if (d > 1) this.drive(w, px, pz, Math.min(SPEED, d), dt, wet)
        else {
          let dh = a + Math.PI / 2 - w.heading
          dh = Math.atan2(Math.sin(dh), Math.cos(dh))
          w.heading += dh * Math.min(1, dt * 1.5)
        }
      })
    }
  }

  private drive(w: Wagon, tx: number, tz: number, speed: number, dt: number, wet: (x: number, z: number) => boolean): void {
    const dx = tx - w.x
    const dz = tz - w.z
    const d = Math.hypot(dx, dz)
    if (d < 0.5 || speed <= 0) return
    let dh = Math.atan2(dx, dz) - w.heading
    dh = Math.atan2(Math.sin(dh), Math.cos(dh))
    w.heading += dh * Math.min(1, dt * 1.2)
    const nx = w.x + Math.sin(w.heading) * speed * dt
    const nz = w.z + Math.cos(w.heading) * speed * dt
    if (wet(nx, nz)) {
      // Round the water, not through it.
      w.heading += dt * 1.5
      return
    }
    w.x = nx
    w.z = nz
    w.wheel += (speed * dt) / 0.6
  }

  render(): void {
    for (const w of this.wagons) {
      const y = this.terrain.heightAt(w.x, w.z)
      w.mesh.position.set(w.x, y, w.z)
      // Tilt with the ground along the wagon.
      const ahead = this.terrain.heightAt(w.x + Math.sin(w.heading) * 2, w.z + Math.cos(w.heading) * 2)
      const behind = this.terrain.heightAt(w.x - Math.sin(w.heading) * 2, w.z - Math.cos(w.heading) * 2)
      w.mesh.rotation.set(0, w.heading, 0)
      w.mesh.rotateX(-Math.atan2(ahead - behind, 4))
      for (const wheel of w.wheels) wheel.rotation.x = w.wheel
    }
    const camping = this.state === 'camp'
    this.fire.visible = camping
    if (camping) {
      this.fire.position.set(this.campX, this.terrain.heightAt(this.campX, this.campZ) + 0.6, this.campZ)
      const f = 0.85 + 0.15 * Math.sin(this.t * 13) * Math.sin(this.t * 7.3)
      this.fire.scale.set(f, 0.8 + 0.4 * f, f)
    }
  }

  /** Settled: the families stay; a new caravan will set out from a town (moveTo). */
  depart(): void {
    this.departed = true
  }
  departed = false

  /** Start again from (x, z) (a town's edge), camped. */
  moveTo(x: number, z: number): void {
    this.wagons.forEach((w, i) => {
      const a = (i / this.wagons.length) * Math.PI * 2
      w.x = x + Math.cos(a) * 17
      w.z = z + Math.sin(a) * 17
    })
    this.campX = x
    this.campZ = z
    this.state = 'camp'
    this.departed = false
  }

  centre(): { x: number; z: number } {
    let x = 0
    let z = 0
    for (const w of this.wagons) {
      x += w.x
      z += w.z
    }
    return { x: x / this.wagons.length, z: z / this.wagons.length }
  }
}
