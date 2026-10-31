// The Great Bell (adventure: something you do that the whole land answers).
// A bronze bell twenty-five metres tall hangs in a stone frame by the
// Colonnade, far above the ground, too high to reach. An arrow rings it: one
// long, deep stroke that rolls out over every land — and every walking giant
// stops where it is and turns toward the sound, for a while. (Why, no one
// says.)

import * as THREE from 'three'
import type { Terrain } from '@titans/shared'
import type { Rocks } from './rocks'
import type { Shape } from './rock-fields'
import { LAYER } from './terrain-material'

const POST_H = 120
const SPAN = 70

export class Bell {
  readonly group = new THREE.Group()
  /** The bell's centre (for the arrow's hit and the giants' gaze). */
  readonly at = new THREE.Vector3()
  private readonly bell = new THREE.Group()
  private swing = 0
  private t = 0
  /** Struck: ring it, and the giants turn. */
  onStrike: () => void = () => {}

  constructor(rocks: Rocks, terrain: Terrain, x: number, z: number, rot: number) {
    const y = terrain.heightAt(x, z)
    // The frame: two square stone posts and a lintel across them (solid: climbable).
    const box = (w: number, h: number, d: number): { shape: Shape; geo: THREE.BufferGeometry } => {
      const geo = new THREE.BoxGeometry(w, h, d, 2, Math.max(2, Math.round(h / 12)), 2).translate(0, h / 2, 0)
      geo.deleteAttribute('uv')
      return { shape: { field: (lx, ly, lz) => Math.max(Math.abs(lx) - w / 2, Math.abs(ly - h / 2) - h / 2, Math.abs(lz) - d / 2), hx: w / 2 + 1, hy: h / 2 + 1, hz: d / 2 + 1, cy: h / 2 }, geo }
    }
    const ax = Math.cos(rot)
    const az = -Math.sin(rot)
    for (const s of [-1, 1]) {
      const px = x + ax * s * (SPAN / 2)
      const pz = z + az * s * (SPAN / 2)
      const py = terrain.heightAt(px, pz)
      const post = box(14, POST_H + (y - py) + 4, 14)
      rocks.addBuilt(post.shape, post.geo, { x: px, y: py - 4, z: pz, rot, layers: [LAYER.carved, LAYER.moss], scale: 12, tint: [0.9, 0.88, 0.84] })
    }
    const lintel = box(SPAN + 24, 12, 16)
    rocks.addBuilt(lintel.shape, lintel.geo, { x, y: y + POST_H - 4, z, rot, layers: [LAYER.carved, LAYER.moss], scale: 12, tint: [0.9, 0.88, 0.84] })
    // The bell: lathed bronze, green with age, hanging on a short chain.
    const profile: THREE.Vector2[] = []
    for (let i = 0; i <= 24; i++) {
      const t = i / 24
      // From the lip (wide, flared) up to the crown (narrow, domed).
      const r = 12.5 * (1 - 0.55 * Math.pow(t, 0.8)) + (t < 0.08 ? (0.08 - t) * 20 : 0)
      profile.push(new THREE.Vector2(t > 0.97 ? r * (1 - (t - 0.97) * 25) : r, t * 24))
    }
    const bronze = new THREE.MeshStandardMaterial({ color: 0x5a6a52, metalness: 0.65, roughness: 0.5 })
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 40), bronze)
    body.position.y = -26
    body.castShadow = true
    const clapper = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8), bronze)
    clapper.position.y = -24
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 6, 6), new THREE.MeshStandardMaterial({ color: 0x2c2a28, metalness: 0.6, roughness: 0.6 }))
    chain.position.y = -3
    this.bell.add(body, clapper, chain)
    this.bell.position.set(x, y + POST_H - 4, z)
    this.bell.rotation.y = rot
    this.group.add(this.bell)
    this.at.set(x, y + POST_H - 4 - 14, z)
  }

  /** Does the segment from→to pass through the bell (no side effects)? */
  test(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const seg = to.clone().sub(from)
    const len = seg.length()
    if (len < 1e-6) return false
    seg.divideScalar(len)
    const t = THREE.MathUtils.clamp(this.at.clone().sub(from).dot(seg), 0, len)
    return from.clone().addScaledVector(seg, t).distanceTo(this.at) <= 12
  }

  /** Did the segment from→to pass through the bell? (Rings it.) */
  hit(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 | null {
    const seg = to.clone().sub(from)
    const len = seg.length()
    if (len < 1e-6) return null
    seg.divideScalar(len)
    const t = THREE.MathUtils.clamp(this.at.clone().sub(from).dot(seg), 0, len)
    const p = from.clone().addScaledVector(seg, t)
    if (p.distanceTo(this.at) > 12) return null
    this.swing = 1
    this.t = 0
    this.onStrike()
    return p
  }

  /** Its swing after a stroke, dying away. */
  update(dt: number): void {
    this.t += dt
    if (this.swing > 0.001) {
      this.swing *= Math.exp(-dt * 0.12)
      this.bell.rotation.z = Math.sin(this.t * 1.4) * 0.12 * this.swing
    }
  }
}
