// The Frozen One (the High Places): one of them, locked standing in a block of glacier ice on
// the plateau above the clouds. The ice is drawn after it, so you see it through the ice: dark,
// blurred by the cracks, very still. Shards of the glacier lie broken round its foot.

import * as THREE from 'three'
import { HIGH, mulberry32, type Terrain } from '@titans/shared'
import { Titan } from './titan'

export class Frozen {
  readonly group = new THREE.Group()
  readonly titan: Titan
  readonly at: THREE.Vector3

  constructor(terrain: Terrain) {
    const x = Math.sin(HIGH.axis) * HIGH.frozenD
    const z = Math.cos(HIGH.axis) * HIGH.frozenD
    const y = terrain.heightAt(x, z)
    this.at = new THREE.Vector3(x, y, z)
    // Facing back the way you came up (out over the lands), as if it had turned to look.
    this.titan = new Titan(520, x, z, HIGH.axis + Math.PI + 0.35, 6161, 1)
    this.titan.restBlend = 0
    this.titan.silhouette(0.5)
    this.group.add(this.titan.group)
    const rand = mulberry32(6161)
    // The block: a craggy box of ice round it, sunk into the snow.
    // (Glacier ice: tools/gen-textures.py 'ice' — fracture planes, trapped bubbles, old snow bands.)
    const load = (f: string, srgb: boolean) => {
      const t = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}tex/${f}`)
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.repeat.set(5, 5)
      t.anisotropy = 4
      if (srgb) t.colorSpace = THREE.SRGBColorSpace
      return t
    }
    const iceMat = new THREE.MeshStandardMaterial({
      color: 0xdff2fa,
      map: load('ice_c.jpg', true),
      normalMap: load('ice_n.jpg', false),
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 0.18,
      metalness: 0.05,
      transparent: true,
      opacity: 0.66,
      depthWrite: false,
      emissive: 0x0e2c38,
      flatShading: true,
    })
    const block = (w: number, h: number, d: number, seg: number) => {
      const g = new THREE.BoxGeometry(w, h, d, seg, Math.round(seg * h / w), seg)
      const p = g.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < p.count; i++) {
        const k = 0.06 + 0.04 * rand()
        p.setXYZ(i, p.getX(i) * (1 + (rand() - 0.5) * k), p.getY(i) + (rand() - 0.5) * h * 0.03, p.getZ(i) * (1 + (rand() - 0.5) * k))
      }
      g.computeVertexNormals()
      return g
    }
    // (Wide enough for its shoulders and arms: at 300 m they came out through its sides.)
    const ice = new THREE.Mesh(block(480, 620, 380, 6), iceMat)
    ice.position.set(x, y + 280, z)
    ice.rotation.y = HIGH.axis + 0.2
    ice.renderOrder = 4
    this.group.add(ice)
    // Broken shards about its foot.
    for (let i = 0; i < 9; i++) {
      const a = rand() * Math.PI * 2
      const r = 260 + rand() * 140
      const s = 18 + rand() * 40
      const shard = new THREE.Mesh(block(s, s * (1.2 + rand() * 1.4), s * 0.8, 2), iceMat)
      const sx = x + Math.cos(a) * r
      const sz = z + Math.sin(a) * r
      shard.position.set(sx, terrain.heightAt(sx, sz) + s * 0.3, sz)
      shard.rotation.set(rand() * 0.8, rand() * 6.3, rand() * 0.8)
      shard.renderOrder = 4
      this.group.add(shard)
    }
  }

  /** Each frame near it: hold its pose on the ground. */
  update(dt: number, terrain: Terrain, camera: THREE.Vector3): void {
    if (camera.distanceTo(this.at) > 12000) return
    this.titan.pose(terrain, dt)
    this.titan.group.updateMatrixWorld(true)
    this.titan.setLodFor(camera)
  }
}
