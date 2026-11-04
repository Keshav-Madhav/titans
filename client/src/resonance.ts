// Resonance stones (user: "a puzzle"). A ring of four standing stones of
// different heights round a low slab. Each hums when struck (E), the tall
// ones low, the short ones high. Carved on the slab's face: four bars of
// different heights, left to right — the order to strike them in. Get it
// right and the stones answer each other, and the slab sinks into the ground;
// what was kept under it is yours. Get it wrong and they fall silent.

import * as THREE from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { mulberry32, type Terrain } from '@titans/shared'
import { carvedStone } from './spots'

export interface ResonanceDef {
  /** What is kept under the slab (a trinket: discovery.ts id). */
  id: string
  x: number
  z: number
  /** The order to strike them in, as height ranks (0 the tallest). */
  order: number[]
}

const HEIGHTS = [5.2, 4.1, 3.1, 2.2]
/** Tall low, short high: a pentatonic-ish set. */
const PITCHES = [98, 130.8, 146.8, 196]
const RING = 7.5
const REACH = 2.6

interface Ring {
  def: ResonanceDef
  stones: Array<{ rank: number; at: THREE.Vector3; rune: THREE.MeshBasicMaterial; glow: number }>
  slab: THREE.Group
  sink: number
  y: number
  progress: number
  solved: boolean
  /** Where what it kept lies (where the slab stood, once it has sunk). */
  reward: THREE.Vector3
}

/**
 * A standing stone that has stood a long time (QA cycle 7: they were clean boxes with knife edges,
 * like concrete posts set down on the grass): a tapering block with rounded corners (a squircle
 * section), weather-rounded top edges, small dents, and — `broken` — a corner of the top gone.
 */
function weatheredStone(w: number, h: number, d: number, rand: () => number, broken = true, taper = 0.22): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry = new THREE.BoxGeometry(w, h, d, 6, Math.max(6, Math.round(h * 3)), 4)
  const p = geo.getAttribute('position') as THREE.BufferAttribute
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute
  const s1 = rand() * 100
  const breakSide = rand() < 0.5 ? -1 : 1
  const breakDepth = broken ? 0.06 + rand() * 0.12 : 0
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) / (w / 2)
    let z = p.getZ(i) / (d / 2)
    const y = p.getY(i)
    const t = (y + h / 2) / h
    // Square section → squircle: the corners worn round.
    const m = Math.max(Math.abs(x), Math.abs(z), 1e-6)
    const ux = x / m
    const uz = z / m
    const k = 1 / Math.pow(ux ** 4 + uz ** 4, 0.25)
    x = ux * k * m
    z = uz * k * m
    // Taper, and the top edges rounded over the last ~12%.
    const top = Math.max(0, (t - 0.88) / 0.12)
    const shrink = (1 - taper * t) * (1 - 0.35 * top * top)
    // Dents and swells: a slow hash noise, a few centimetres.
    const n = Math.sin(x * 3.1 + y * 2.3 + s1) * Math.sin(z * 2.7 - y * 1.9 + s1 * 1.3) * 0.035
    let px = x * (w / 2) * shrink * (1 + n)
    let pz = z * (d / 2) * shrink * (1 + n)
    let py = y - top * top * h * 0.03
    // A corner of the top broken off, long ago (a slanting cut).
    if (breakDepth > 0) {
      const cut = h / 2 - h * breakDepth * Math.max(0, x * breakSide * 0.7 + 0.3)
      if (py > cut) py = cut + (py - cut) * 0.15
    }
    p.setXYZ(i, px, py, pz)
    // (Texture in metres, not one tile per face: on a 4 m stone the carving stretched into wood grain.)
    uv.setXY(i, (px + pz) * 0.55, py * 0.55)
  }
  // Smooth normals across the old box edges: the faces' vertices are split there (each face has its
  // own UVs), so take normals from a position-only merged copy and hand them back by position.
  const solid = mergeVertices(new THREE.BufferGeometry().setAttribute('position', p.clone()).setIndex(geo.getIndex()), 1e-4)
  solid.computeVertexNormals()
  const key = (x: number, y: number, z: number) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`
  const byPos = new Map<string, [number, number, number]>()
  const sp = solid.getAttribute('position')
  const sn = solid.getAttribute('normal')
  for (let i = 0; i < sp.count; i++) byPos.set(key(sp.getX(i), sp.getY(i), sp.getZ(i)), [sn.getX(i), sn.getY(i), sn.getZ(i)])
  geo.computeVertexNormals()
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const v = byPos.get(key(p.getX(i), p.getY(i), p.getZ(i)))
    if (v) nrm.setXYZ(i, v[0], v[1], v[2])
  }
  return geo
}

export class Resonance {
  readonly group = new THREE.Group()
  readonly rings: Ring[] = []
  /** Struck: the pitch (and whether it broke the sequence); solved: open it. */
  onStrike: (pitch: number, wrong: boolean) => void = () => {}
  onSolve: (id: string, pitches: number[]) => void = () => {}

  constructor(defs: ResonanceDef[], terrain: Terrain) {
    const stoneMat = carvedStone()
    for (const def of defs) {
      const rand = mulberry32(def.x * 7 + def.z)
      const y = terrain.heightAt(def.x, def.z)
      const stones: Ring['stones'] = []
      // The four, round the slab, in shuffled places (the order is in the carving, not the layout).
      const ranks = [0, 1, 2, 3].sort(() => rand() - 0.5)
      ranks.forEach((rank, k) => {
        const a = (k / 4) * Math.PI * 2 + 0.4
        const at = new THREE.Vector3(def.x + Math.cos(a) * RING, 0, def.z + Math.sin(a) * RING)
        at.y = terrain.heightAt(at.x, at.z)
        const h = HEIGHTS[rank]
        const geo = weatheredStone(1.1, h, 0.7, rand)
        const m = new THREE.Mesh(geo, stoneMat)
        m.position.set(at.x, at.y + h / 2 - 0.35, at.z)
        m.rotation.y = -a
        m.castShadow = m.receiveShadow = true
        const rune = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.0, 1.2), transparent: true, opacity: 0.15 })
        const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.12, h * 0.55), rune)
        // On the face toward the slab.
        mark.position.set(at.x - Math.cos(a) * 0.36, at.y + h * 0.5, at.z - Math.sin(a) * 0.36)
        mark.rotation.y = -a - Math.PI / 2
        this.group.add(m, mark)
        stones.push({ rank, at, rune, glow: 0 })
      })
      // The slab, low, with the order carved on it.
      const slab = new THREE.Group()
      const body = new THREE.Mesh(weatheredStone(2.6, 1.2, 1.6, rand, false, 0) /* (no taper: the carved clue lies on its face) */, stoneMat)
      body.position.y = 0.4
      body.castShadow = body.receiveShadow = true
      const clue = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.9), new THREE.MeshStandardMaterial({ map: clueTexture(def.order), transparent: true, roughness: 1 }))
      clue.position.set(0, 0.42, 0.81)
      const clueTop = clue.clone()
      clueTop.rotation.x = -Math.PI / 2
      clueTop.position.set(0, 1.01, 0)
      slab.add(body, clue, clueTop)
      slab.position.set(def.x, y, def.z)
      this.group.add(slab)
      this.rings.push({ def, stones, slab, sink: 0, y, progress: 0, solved: false, reward: new THREE.Vector3(def.x, y, def.z) })
    }
  }

  /** The stone within reach of `p`, if any (of a ring not yet solved). */
  near(p: THREE.Vector3): { ring: Ring; stone: number } | null {
    for (const ring of this.rings) {
      if (ring.solved) continue
      for (let k = 0; k < ring.stones.length; k++) {
        const s = ring.stones[k]
        if (Math.hypot(s.at.x - p.x, s.at.z - p.z) < REACH + 0.6) return { ring, stone: k }
      }
    }
    return null
  }

  strike(ring: Ring, k: number): void {
    const s = ring.stones[k]
    s.glow = 1
    const right = ring.def.order[ring.progress] === s.rank
    this.onStrike(PITCHES[s.rank], !right)
    if (!right) {
      // Silence: start again.
      ring.progress = 0
      for (const o of ring.stones) if (o !== s) o.glow = 0
      return
    }
    ring.progress++
    if (ring.progress === ring.def.order.length) this.solve(ring)
  }

  private solve(ring: Ring, instant = false): void {
    ring.solved = true
    if (instant) ring.sink = 1
    else this.onSolve(ring.def.id, ring.def.order.map((r) => PITCHES[r]))
  }

  /** Solved before (a loaded game). */
  open(id: string): void {
    const ring = this.rings.find((r) => r.def.id === id)
    if (ring) this.solve(ring, true)
  }

  update(dt: number): void {
    for (const ring of this.rings) {
      for (const s of ring.stones) {
        // A struck stone's mark glows and fades; a solved ring's stay lit.
        const want = ring.solved ? 0.9 : 0.15
        s.glow = Math.max(0, s.glow - dt * (ring.solved ? 0 : 0.25))
        s.rune.opacity = Math.max(want, s.glow)
      }
      if (ring.solved && ring.sink < 1) ring.sink = Math.min(1, ring.sink + dt / 6)
      ring.slab.position.y = ring.y - ring.sink * 1.7
    }
  }
}

/** Four carved bars, left to right, as tall as the stones to strike in turn. */
function clueTexture(order: number[]): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 104
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(40,36,30,0.75)'
  order.forEach((rank, i) => {
    const h = (HEIGHTS[rank] / HEIGHTS[0]) * 84
    const x = 26 + i * 58
    g.fillRect(x, 96 - h, 22, h)
  })
  g.fillRect(14, 97, 228, 3)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
