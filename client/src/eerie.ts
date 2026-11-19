// Eerie places (user, 2026-10-31: "things to discover really which is scary
// to discover… you were curious to go wandering, so now wander and find").
// Set pieces nobody points you to, each found by going there, each a little
// wrong — and each with something to read and something to take.
//
//   the Pit         — a sinkhole in the Green (shared/terrain.ts), its depths
//                     lost in the dark, cold mist rising, a moan in it
//   the Circle      — seven hooded figures in stone in a ring, heads bowed,
//                     facing a black stone in the middle; near it the land goes silent
//   the Hanged      — bones too long for any animal, hanging on chains from a
//                     giant tree in the Old Wood, turning slowly, creaking
//   (the Husk is a colossus shape: rock-fields.ts)
//
// This module draws what is not terrain or rock, and says how near you are to
// each (for its sound).

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mulberry32, PIT, type Terrain } from '@titans/shared'

export class Eerie {
  readonly group = new THREE.Group()
  readonly circle: { x: number; z: number; r: number }
  readonly hanged: { x: number; z: number; bones: THREE.Group[] }
  private readonly mist: THREE.Points
  private readonly mistPos: Float32Array
  private time = 0

  constructor(
    private readonly terrain: Terrain,
    circleAt: { x: number; z: number },
    hangFrom: { x: number; y: number; z: number },
  ) {
    const rand = mulberry32(6661)
    // The Pit (a sinkhole: shared/terrain.ts; its depths darkened: atmosphere.ts) — cold mist welling up out of it.
    const top = terrain.base.pitTop
    const n = 220
    this.mistPos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2
      const r = Math.sqrt(rand()) * PIT.r * 0.75
      this.mistPos.set([PIT.x + Math.cos(a) * r, top - 60 + rand() * 70, PIT.z + Math.sin(a) * r], i * 3)
    }
    const mg = new THREE.BufferGeometry()
    mg.setAttribute('position', new THREE.BufferAttribute(this.mistPos, 3))
    this.mist = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0xc8d0d4, size: 14, transparent: true, opacity: 0.12, depthWrite: false, map: softDot(), sizeAttenuation: true }))
    this.mist.frustumCulled = false
    this.group.add(this.mist)

    // The Circle: seven hooded figures in stone (rock-fields' 'mourner', placed
    // in main.ts), all facing the middle.
    const R = 200
    this.circle = { x: circleAt.x, z: circleAt.z, r: R }


    // The Hanged: long pale bones on chains from a giant tree's limb, turning slowly.
    const bone = new THREE.MeshStandardMaterial({ color: 0xcfc6b2, roughness: 0.9 })
    const iron = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.7, metalness: 0.5 })
    const bones: THREE.Group[] = []
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group()
      const len = 14 + rand() * 12
      const drop = 30 + rand() * 50
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, drop, 5).translate(0, -drop / 2, 0), iron)
      // A long bone: a shaft, a knob at each end.
      // (One mesh, not three: the Hanged were 15 bone draws a pass and 15 more into the shadow map.)
      const b = new THREE.Mesh(
        mergeGeometries([
          new THREE.CylinderGeometry(0.9, 1.1, len, 8),
          new THREE.SphereGeometry(1.9, 10, 8).scale(1, 0.8, 1.2).translate(0, len / 2, 0),
          new THREE.SphereGeometry(1.7, 10, 8).scale(1.2, 0.8, 1).translate(0, -len / 2, 0),
        ])!,
        bone,
      )
      b.rotation.z = Math.PI / 2 + (rand() - 0.5) * 0.6
      b.position.y = -drop
      g.add(chain, b)
      g.position.set(hangFrom.x + (rand() - 0.5) * 70, hangFrom.y, hangFrom.z + (rand() - 0.5) * 70)
      g.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true
      })
      bones.push(g)
      this.group.add(g)
    }
    this.hanged = { x: hangFrom.x, z: hangFrom.z, bones }
  }

  /** Each frame: the mist wells up, the bones turn, the stone giants keep their detail by distance. */
  update(dt: number): void {
    this.time += dt
    const top = this.terrain.base.pitTop
    const p = this.mistPos
    for (let i = 0; i < p.length; i += 3) {
      p[i + 1] += dt * (1.2 + (i % 7) * 0.15)
      if (p[i + 1] > top + 12) p[i + 1] = top - 70
    }
    ;(this.mist.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    this.hanged.bones.forEach((g, i) => {
      g.rotation.y = Math.sin(this.time * 0.11 + i * 1.7) * 0.6
      g.rotation.z = Math.sin(this.time * 0.23 + i) * 0.015
    })
  }

  /** 0 … 1: how near (x, z) is to each place (for their sounds and silences). */
  near(x: number, z: number): { pit: number; circle: number; hanged: number } {
    return {
      pit: 1 - THREE.MathUtils.smoothstep(Math.hypot(x - PIT.x, z - PIT.z), PIT.r, PIT.r + 260),
      circle: 1 - THREE.MathUtils.smoothstep(Math.hypot(x - this.circle.x, z - this.circle.z), this.circle.r, this.circle.r + 450),
      hanged: 1 - THREE.MathUtils.smoothstep(Math.hypot(x - this.hanged.x, z - this.hanged.z), 40, 260),
    }
  }
}

export function softDot(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 32, 32)
  return new THREE.CanvasTexture(c)
}
