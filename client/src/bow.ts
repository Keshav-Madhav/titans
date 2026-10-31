// The bow (user, 2026-10-31: "artifacts found become items that can be used,
// like maybe a bow is found and then bow type puzzles unlock"). Once you have
// it: hold the right mouse button (or Q) to draw — the camera comes in over
// your shoulder, a mark shows where you aim — and click (or F) to loose.
// Arrows fly true but fall; they stick where they land and fade.

import * as THREE from 'three'

const SPEED = 95
const GRAVITY = 9.8
const ARROWS = 24

interface Arrow {
  mesh: THREE.Mesh
  pos: THREE.Vector3
  vel: THREE.Vector3
  flying: boolean
  age: number
}

/**
 * The velocity that carries an arrow along `d` (from the bow to the mark) at
 * `speed`, on the low arc — so it lands where you aimed, falling as it goes
 * (out of reach: straight at it, and it falls short).
 */
function launch(d: THREE.Vector3, speed: number): THREE.Vector3 {
  const x = Math.hypot(d.x, d.z)
  const y = d.y
  const v2 = speed * speed
  const root = v2 * v2 - GRAVITY * (GRAVITY * x * x + 2 * y * v2)
  if (x < 1e-3 || root < 0) return d.clone().normalize().multiplyScalar(speed)
  const theta = Math.atan2(v2 - Math.sqrt(root), GRAVITY * x)
  return new THREE.Vector3((d.x / x) * Math.cos(theta), Math.sin(theta), (d.z / x) * Math.cos(theta)).multiplyScalar(speed)
}

/** What an arrow struck between two points: where, and whether it was something to hit (an eye). */
export type ArrowHit = (from: THREE.Vector3, to: THREE.Vector3) => { at: THREE.Vector3; stop: boolean } | null
/** How far along a ray (from the camera) the first thing is (no side effects), up to `max`. */
export type Pick = (from: THREE.Vector3, dir: THREE.Vector3, max: number) => number

export class Bow {
  readonly group = new THREE.Group()
  /** 0 … 1: how far drawn (the camera and the mark follow it). */
  draw = 0
  readonly arrows: Arrow[] = []
  private next = 0
  private readonly mark = document.getElementById('aim')!
  private readonly ray = new THREE.Vector3()
  /** An arrow loosed (for the sound). */
  onLoose: () => void = () => {}

  constructor() {
    // (A little long and pale-fletched, so you can follow one and find it where it lands.)
    const shaft = new THREE.CylinderGeometry(0.022, 0.022, 1.1, 5).rotateX(Math.PI / 2)
    const head = new THREE.ConeGeometry(0.05, 0.14, 5).rotateX(Math.PI / 2).translate(0, 0, 0.6)
    const fletch = new THREE.BoxGeometry(0.14, 0.006, 0.22).translate(0, 0, -0.46)
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.8 })
    const pale = new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.9, emissive: new THREE.Color(0.12, 0.1, 0.08) })
    for (let i = 0; i < ARROWS; i++) {
      const m = new THREE.Mesh(shaft, mat)
      m.add(new THREE.Mesh(head, mat), new THREE.Mesh(fletch, pale), new THREE.Mesh(fletch.clone().rotateZ(Math.PI / 2), pale))
      m.visible = false
      this.group.add(m)
      this.arrows.push({ mesh: m, pos: new THREE.Vector3(), vel: new THREE.Vector3(), flying: false, age: 0 })
    }
  }

  /**
   * Each frame: `drawing` held or not, `loose` pressed this frame. Arrows
   * start at `from` and fly toward where the camera's centre points.
   */
  update(dt: number, drawing: boolean, loose: boolean, from: THREE.Vector3, camera: THREE.Camera, hit: ArrowHit, pick: Pick): void {
    this.draw = drawing ? Math.min(1, this.draw + dt / 0.45) : Math.max(0, this.draw - dt / 0.25)
    this.mark.classList.toggle('on', this.draw > 0.6)
    if (loose && this.draw > 0.6) {
      const a = this.arrows[this.next]
      this.next = (this.next + 1) % ARROWS
      // Toward whatever is under the mark (the arrow leaves from your chest, not the camera:
      // aiming at a point far beyond a near target would pass under it).
      camera.getWorldDirection(this.ray)
      const aimAt = camera.position.clone().addScaledVector(this.ray, pick(camera.position, this.ray, 400))
      a.pos.copy(from)
      a.vel.copy(launch(aimAt.sub(from), SPEED))
      a.flying = true
      a.age = 0
      a.mesh.visible = true
      this.draw = 0.3
      this.onLoose()
    }
    const prev = new THREE.Vector3()
    for (const a of this.arrows) {
      if (!a.mesh.visible) continue
      a.age += dt
      if (a.flying) {
        prev.copy(a.pos)
        a.vel.y -= GRAVITY * dt
        a.pos.addScaledVector(a.vel, dt)
        const h = hit(prev, a.pos)
        if (h) {
          a.pos.copy(h.at)
          a.flying = false
          a.age = 0
          if (h.stop) a.mesh.visible = false
        }
        if (a.age > 8) a.mesh.visible = false
        a.mesh.lookAt(a.pos.clone().add(a.vel))
      } else if (a.age > 20) a.mesh.visible = false
      a.mesh.position.copy(a.pos)
    }
  }
}
