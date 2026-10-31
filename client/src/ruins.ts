// What the First Ones left: "the deeper players explore, the more they
// uncover." Scattered over the plain: stone circles (some stones fallen),
// broken colonnades, a colossal stone hand reaching out of the ground, a
// half-buried stone face. Landmarks to walk to — the story will live in them
// later. Seeded, placed on dry ground away from towns, and all one mesh.

import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { makeSimplex2, mulberry32, type Terrain } from '@titans/shared'

type Site = 'circle' | 'colonnade' | 'hand' | 'face'
const SITES: Site[] = ['circle', 'colonnade', 'hand', 'circle', 'face', 'colonnade', 'circle', 'hand', 'colonnade', 'circle']

const STONE = new THREE.Color(0xaaa293)
const DARK = new THREE.Color(0x7f786c)
const MOSS = new THREE.Color(0x6b7340)

/** Weathered stone: lumpy, mottled, mossy on top. */
function weather(g: THREE.BufferGeometry, seed: number, lump: number): THREE.BufferGeometry {
  g.deleteAttribute('uv')
  g.deleteAttribute('normal')
  g = mergeVertices(g, 1e-3)
  const n = makeSimplex2(seed)
  const p = g.getAttribute('position')
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const k = 1 + lump * n(v.x * 0.35 + v.y * 0.2, v.z * 0.35 - v.y * 0.2)
    p.setXYZ(i, v.x * k, v.y, v.z * k)
  }
  g.computeVertexNormals()
  const nrm = g.getAttribute('normal')
  const c = new THREE.Color()
  const col = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    c.copy(STONE).lerp(DARK, 0.5 + 0.5 * n(v.x * 0.9, v.y * 0.9 + v.z * 0.4))
    c.lerp(MOSS, THREE.MathUtils.smoothstep(nrm.getY(i) + 0.2 * n(v.x * 0.5, v.z * 0.5), 0.55, 0.85) * 0.8)
    col.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

function site(kind: Site, rand: () => number, seed: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const put = (g: THREE.BufferGeometry, lump = 0.12) => out.push(weather(g, seed + out.length, lump))
  if (kind === 'circle') {
    const n = 9 + Math.floor(rand() * 5)
    const R = 11 + rand() * 6
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const h = 3.5 + rand() * 2.5
      const g = new THREE.BoxGeometry(1.6, h, 0.9, 2, 3, 1)
      if (rand() < 0.25) {
        // Fallen.
        g.rotateZ(Math.PI / 2 - 0.1).translate(0, 0.5, 0)
      } else g.translate(0, h / 2 - 0.4, 0)
      g.rotateY(-a).translate(Math.cos(a) * R, 0, Math.sin(a) * R)
      put(g)
    }
    // An altar stone.
    put(new THREE.BoxGeometry(3.2, 1.1, 1.8, 2, 1, 2).translate(0, 0.4, 0))
  } else if (kind === 'colonnade') {
    const n = 6 + Math.floor(rand() * 4)
    for (let i = 0; i < n; i++) {
      for (const side of [-1, 1]) {
        if (rand() < 0.2) continue // gone entirely
        const h = rand() < 0.4 ? 2 + rand() * 4 : 11
        const g = new THREE.CylinderGeometry(1, 1.15, h, 12, 4).translate(0, h / 2 - 0.5, 0)
        g.translate(side * 5, 0, (i - n / 2) * 6)
        put(g, 0.06)
        if (h > 10 && rand() < 0.5) put(new THREE.BoxGeometry(2.6, 1.2, 7, 2, 1, 3).translate(side * 5, 11, (i - n / 2) * 6 + 3))
      }
    }
    // Broken lintels on the ground.
    for (let i = 0; i < 3; i++) put(new THREE.BoxGeometry(2.4, 1.1, 6, 2, 1, 3).rotateY(rand() * 3).translate((rand() - 0.5) * 14, 0.3, (rand() - 0.5) * n * 6))
  } else if (kind === 'hand') {
    // A colossal hand of stone reaching out of the ground, fingers curled.
    put(new THREE.SphereGeometry(7, 14, 10).scale(1.2, 0.8, 0.7).translate(0, 4, 0), 0.15)
    for (let f = 0; f < 4; f++) {
      const x = -5.2 + f * 3.5
      let y = 8
      let z = 0
      let tilt = -0.15 - rand() * 0.2
      for (let seg = 0; seg < 3; seg++) {
        const len = 5.2 - seg * 1.1
        const g = new THREE.CylinderGeometry(1.25 - seg * 0.15, 1.35 - seg * 0.15, len, 10, 2).translate(0, len / 2, 0).rotateX(tilt).translate(x, y, z)
        put(g, 0.08)
        y += Math.cos(tilt) * len
        z += Math.sin(tilt) * len
        tilt -= 0.45 + rand() * 0.2
      }
    }
    put(new THREE.CylinderGeometry(1.4, 1.6, 7, 10, 2).translate(0, 3.5, 0).rotateZ(0.9).translate(8.5, 2, 1), 0.08)
  } else {
    // A giant's face, sunk to the brow in the plain.
    put(new THREE.SphereGeometry(13, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1, 1.15, 0.95).translate(0, -1, 0), 0.1)
    put(new THREE.BoxGeometry(18, 2.2, 5, 4, 1, 2).translate(0, 7, 9.5)) // brow
    put(new THREE.BoxGeometry(3.4, 6, 4.5, 1, 3, 2).translate(0, 3.4, 12)) // nose
    for (const x of [-5, 5]) out.push(weather(new THREE.SphereGeometry(2.4, 10, 8).translate(x, 4.6, 10.4), seed + 77, 0.05))
  }
  return out
}

export class Ruins {
  readonly mesh: THREE.Mesh
  readonly sites: Array<{ kind: Site; x: number; z: number; r: number }> = []

  constructor(terrain: Terrain, seed: number, clear: (x: number, z: number) => boolean) {
    const rand = mulberry32(seed ^ 0x5eed1)
    const parts: THREE.BufferGeometry[] = []
    for (let tries = 0; tries < 300 && this.sites.length < SITES.length; tries++) {
      const a = rand() * Math.PI * 2
      const d = 380 + rand() * 1900
      const x = Math.cos(a) * d
      const z = Math.sin(a) * d
      const h = terrain.heightAt(x, z)
      if (h > 60 || !clear(x, z) || this.sites.some((s) => Math.hypot(s.x - x, s.z - z) < 300)) continue
      let lo = Infinity
      let hi = -Infinity
      for (let i = 0; i < 8; i++) {
        const hh = terrain.heightAt(x + Math.cos(i * 0.785) * 22, z + Math.sin(i * 0.785) * 22)
        lo = Math.min(lo, hh)
        hi = Math.max(hi, hh)
      }
      if (hi - lo > 5 || !clear(x + 20, z) || !clear(x - 20, z) || !clear(x, z + 20) || !clear(x, z - 20)) continue
      const kind = SITES[this.sites.length]
      const rot = rand() * Math.PI * 2
      for (const g of site(kind, rand, this.sites.length * 101)) {
        g.rotateY(rot).translate(x, lo - 0.3, z)
        parts.push(g)
      }
      this.sites.push({ kind, x, z, r: kind === 'colonnade' ? 30 : 22 })
    }
    const geo = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }))
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.name = 'ruins'
  }

  occupies(x: number, z: number): boolean {
    for (const s of this.sites) if (Math.abs(s.x - x) < s.r && Math.abs(s.z - z) < s.r) return true
    return false
  }
}
