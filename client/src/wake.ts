// Rings on the water round you as you swim (and one when you go in): the water
// knows you are there. A few soft rings, born at your shoulders, spreading and
// fading; faster and more of them the faster you swim.

import * as THREE from 'three'

const RINGS = 14
const LIFE = 2.6

export class Wake {
  readonly group = new THREE.Group()
  private readonly rings: Array<{ mesh: THREE.Mesh; t: number; grow: number }> = []
  private next = 0
  private wasIn = false

  constructor() {
    const geo = new THREE.PlaneGeometry(2.2, 2.2).rotateX(-Math.PI / 2)
    const tex = softRing()
    for (let i = 0; i < RINGS; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xf2f6f4, map: tex, transparent: true, opacity: 0, depthWrite: false })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.visible = false
      mesh.renderOrder = 2
      this.group.add(mesh)
      this.rings.push({ mesh, t: LIFE, grow: 1 })
    }
  }

  private spawn(x: number, y: number, z: number, size: number, grow: number): void {
    const r = this.rings.reduce((a, b) => (b.t > a.t ? b : a))
    r.t = 0
    r.grow = grow
    r.mesh.position.set(x, y + 0.03, z)
    r.mesh.scale.setScalar(size)
    r.mesh.visible = true
  }

  /** `swimming` and where (and the water's surface there), `speed` m/s. */
  update(dt: number, swimming: boolean, p: THREE.Vector3, level: number, speed: number): void {
    if (swimming && !this.wasIn) for (let k = 0; k < 3; k++) this.spawn(p.x, level, p.z, 0.4 + k * 0.3, 2.4 - k * 0.4)
    this.wasIn = swimming
    if (swimming) {
      this.next -= dt
      if (this.next <= 0) {
        this.next = speed > 0.5 ? 0.45 - Math.min(0.25, speed * 0.06) : 1.3
        this.spawn(p.x, level, p.z, 0.45, speed > 0.5 ? 1.1 : 0.7)
      }
    }
    for (const r of this.rings) {
      if (r.t >= LIFE) continue
      r.t += dt
      const k = r.t / LIFE
      r.mesh.scale.setScalar(r.mesh.scale.x + dt * r.grow)
      ;(r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k) * (1 - k)
      if (r.t >= LIFE) r.mesh.visible = false
    }
  }
}

/** A soft ring, broken here and there (disturbed water, not a drawn line). */
function softRing(): THREE.CanvasTexture {
  const S = 128
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const img = g.createImageData(S, S)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = (x + 0.5) / S - 0.5
      const dy = (y + 0.5) / S - 0.5
      const r = Math.hypot(dx, dy) * 2
      const a = Math.atan2(dy, dx)
      const band = Math.exp(-Math.pow((r - 0.86) / 0.07, 2)) + 0.35 * Math.exp(-Math.pow((r - 0.7) / 0.05, 2))
      const broken = 0.55 + 0.45 * Math.sin(a * 7 + Math.sin(a * 3) * 2)
      const k = (y * S + x) * 4
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255
      img.data[k + 3] = Math.min(255, band * broken * 255)
    }
  g.putImageData(img, 0, 0)
  return new THREE.CanvasTexture(c)
}
