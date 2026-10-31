// Stone eyes: what the bow is for. Sets of three, set high in stone — on the
// Undercroft's pillars, on the Sentinel, in a mesa's cliff — each a disc of
// carved stone with an amber iris that glows. An arrow closes one. Close all
// three of a set and what they were watching over is let go (a trinket:
// spots.ts reveals it).

import * as THREE from 'three'
import { carvedStone } from './spots'

export interface EyeSet {
  /** The trinket they watch over (discovery.ts id). */
  id: string
  eyes: Array<{ at: THREE.Vector3; normal: THREE.Vector3 }>
  /** Where it is let go. */
  reward: THREE.Vector3
}

const RADIUS = 2.6

export class Eyes {
  readonly group = new THREE.Group()
  private readonly irises: Array<{ set: EyeSet; k: number; at: THREE.Vector3; mat: THREE.MeshBasicMaterial; shut: boolean }> = []
  /** An eye closed; all of a set closed (`done`). */
  onShut: (set: EyeSet, done: boolean) => void = () => {}

  constructor(readonly sets: EyeSet[]) {
    // (Big enough to find on a 400 m statue from the grass below.)
    const disc = new THREE.CylinderGeometry(2.6, 2.9, 0.9, 24).rotateX(Math.PI / 2)
    const iris = new THREE.CircleGeometry(1.05, 24)
    const ring = new THREE.RingGeometry(1.25, 1.6, 24)
    for (const set of sets) {
      set.eyes.forEach((e, k) => {
        const g = new THREE.Group()
        const body = new THREE.Mesh(disc, carvedStone())
        body.castShadow = body.receiveShadow = true
        const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.9, 0.6) })
        const i = new THREE.Mesh(iris, mat)
        i.position.z = 0.46
        const r = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0x2a2620 }))
        r.position.z = 0.455
        g.add(body, i, r)
        g.position.copy(e.at)
        g.lookAt(e.at.clone().add(e.normal))
        this.group.add(g)
        this.irises.push({ set, k, at: e.at.clone().addScaledVector(e.normal, 0.45), mat, shut: false })
      })
    }
  }

  /** Does the segment from→to pass through an open eye (no side effects)? */
  test(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const seg = to.clone().sub(from)
    const len = seg.length()
    if (len < 1e-6) return false
    seg.divideScalar(len)
    return this.irises.some((e) => !e.shut && from.clone().addScaledVector(seg, THREE.MathUtils.clamp(e.at.clone().sub(from).dot(seg), 0, len)).distanceTo(e.at) < RADIUS)
  }

  /** Did the segment from→to pass through an open eye? Closes it; returns where. */
  hit(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 | null {
    const seg = to.clone().sub(from)
    const len = seg.length()
    if (len < 1e-6) return null
    seg.divideScalar(len)
    for (const e of this.irises) {
      if (e.shut) continue
      const t = THREE.MathUtils.clamp(e.at.clone().sub(from).dot(seg), 0, len)
      const p = from.clone().addScaledVector(seg, t)
      if (p.distanceTo(e.at) < RADIUS) {
        this.shut(e)
        const done = this.irises.filter((o) => o.set === e.set).every((o) => o.shut)
        this.onShut(e.set, done)
        return p
      }
    }
    return null
  }

  private shut(e: (typeof this.irises)[number]): void {
    e.shut = true
    e.mat.color.set(0x15130f)
  }

  /** Closed before (a loaded game). */
  close(id: string): void {
    for (const e of this.irises) if (e.set.id === id) this.shut(e)
  }

  /** Open eyes in a set (for tools). */
  open(id: string): number {
    return this.irises.filter((e) => e.set.id === id && !e.shut).length
  }

  /** The open eyes' positions (for tools). */
  targets(): THREE.Vector3[] {
    return this.irises.filter((e) => !e.shut).map((e) => e.at)
  }
}
