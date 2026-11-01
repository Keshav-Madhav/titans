// The Hanging Steps (user: "a parkour thing"). Slabs of stone hanging in the
// air in a rising spiral, held still the way the chained stones are: hop the
// short gaps (a run and a jump carries about four metres), climb the tall
// blocks (E at a face), and at the top, forty metres up, something has been
// left. Fall, and the Green is soft — but it is a long way back up.

import * as THREE from 'three'
import { mulberry32, type Terrain } from '@titans/shared'
import type { Rocks } from './rocks'
import type { Shape } from './rock-fields'
import { LAYER } from './terrain-material'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/**
 * A block broken loose and hanging: `w` × `h` × `d`, its top flat (you land on
 * it) but its edges chipped and its sides wandering a little, and under it a
 * jagged root of rock, torn from whatever it was part of. (Perfect boxes in the
 * sky read as crates.) Collision is the block; the root hangs below it.
 */
function slab(w: number, h: number, d: number, rand: () => number): { shape: Shape; geo: THREE.BufferGeometry } {
  const geo = new THREE.BoxGeometry(w, h, d, 5, Math.max(2, Math.round(h / 1.2)), 5)
  const p = geo.getAttribute('position') as THREE.BufferAttribute
  const jig = new Map<string, [number, number, number]>()
  const key = (x: number, y: number, z: number) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    // (The same corner shared by several faces must move the same way: no cracks.)
    const k = key(x, y, z)
    let o = jig.get(k)
    if (!o) {
      const edgeX = Math.abs(Math.abs(x) - w / 2) < 1e-3
      const edgeZ = Math.abs(Math.abs(z) - d / 2) < 1e-3
      const top = y > h / 2 - 1e-3
      const side = (rand() - 0.6) * 0.22
      // Chips off the top edge: down and in a little.
      const chip = top && (edgeX || edgeZ) ? -rand() * 0.28 : 0
      o = [edgeX ? Math.sign(x) * (side + chip * 0.5) : 0, top ? chip : (rand() - 0.5) * 0.12, edgeZ ? Math.sign(z) * (side + chip * 0.5) : 0]
      jig.set(k, o)
    }
    p.setXYZ(i, x + o[0], y + o[1], z + o[2])
  }
  // The root: a rough downward wedge, narrower than the block, ragged.
  const depth = Math.min(4.5, 1.2 + Math.max(w, d) * 0.55)
  const root = new THREE.ConeGeometry(Math.min(w, d) * 0.55, depth, 7, 3).rotateX(Math.PI).translate(0, -h / 2 - depth / 2 + 0.05, 0)
  const rp = root.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < rp.count; i++) {
    const y = rp.getY(i)
    const t = (-h / 2 - y) / depth
    rp.setXYZ(i, rp.getX(i) * (1.25 + (rand() - 0.5) * 0.5) * (w / Math.min(w, d)) * 0.82, y + (rand() - 0.5) * 0.3 * t, rp.getZ(i) * (1.2 + (rand() - 0.5) * 0.5) * (d / Math.min(w, d)) * 0.82)
  }
  const out = mergeGeometries([geo.toNonIndexed(), root.toNonIndexed()])!
  out.deleteAttribute('uv')
  out.computeVertexNormals()
  const shape: Shape = {
    field: (x, y, z) => Math.max(Math.abs(x) - w / 2, Math.abs(y) - h / 2, Math.abs(z) - d / 2),
    hx: w / 2 + 1,
    hy: h / 2 + 1,
    hz: d / 2 + 1,
    cy: 0,
  }
  return { shape, geo: out }
}

/** Broken chain ends hanging from the undersides (iron links, a few metres each). */
function danglingChains(ends: Array<{ at: THREE.Vector3; len: number }>): THREE.InstancedMesh {
  const LINK = 0.34
  const geo = new THREE.TorusGeometry(0.13, 0.035, 4, 10).scale(1, 1.55, 1)
  const total = ends.reduce((n, e) => n + Math.ceil(e.len / LINK), 0)
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x3e3934, metalness: 0.6, roughness: 0.5 }), total)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  let n = 0
  for (const e of ends) {
    const count = Math.ceil(e.len / LINK)
    for (let i = 0; i < count; i++) {
      // Each link turned a quarter to the last, the chain hanging straight down.
      q.setFromEuler(new THREE.Euler(0, (i % 2) * (Math.PI / 2), 0))
      m.compose(new THREE.Vector3(e.at.x, e.at.y - i * LINK, e.at.z), q, new THREE.Vector3(1, 1, 1))
      mesh.setMatrixAt(n++, m)
    }
  }
  mesh.castShadow = true
  mesh.frustumCulled = false
  return mesh
}

/**
 * Lay the steps out round (cx, cz); returns where the top is (for what is
 * left there). Every third step is a tall block you climb; the rest are
 * thin slabs a jump apart, each a little higher than the last.
 */
export function hangingSteps(rocks: Rocks, terrain: Terrain, cx: number, cz: number): { top: THREE.Vector3; decor: THREE.Object3D } {
  const ends: Array<{ at: THREE.Vector3; len: number }> = []
  const rand = mulberry32(9090)
  const g = terrain.heightAt(cx, cz)
  let a = 0
  let top = g + 1.2
  let x = cx + 14
  let z = cz
  let topAt = new THREE.Vector3()
  for (let i = 0; i < 26; i++) {
    const climb = i % 3 === 2
    const w = climb ? 4 : 3.2
    const d = climb ? 4 : 3.2
    const h = climb ? 6.5 : 1
    // A step out round the spiral: 3–3.6 m of gap between edges (a running jump), a little up.
    const step = (climb ? 4 : 3.2) / 2 + 3 + rand() * 0.6 + w / 2
    a += step / 14
    x = cx + Math.cos(a) * 14 * (1 + i * 0.02)
    z = cz + Math.sin(a) * 14 * (1 + i * 0.02)
    // A climb block's top is well above the last step (that is what climbing is for); a slab, a little.
    top += climb ? 5.2 : 0.45
    const y = top - h / 2
    const { shape, geo } = slab(w, h, d, rand)
    rocks.addBuilt(shape, geo, { x, y, z, rot: a, layers: [LAYER.carved, LAYER.moss], scale: 8, tint: [0.92, 0.9, 0.86] })
    const f = rocks.formations[rocks.formations.length - 1]
    // Held still in the air (solid: you can stand on it and climb it).
    f.float = { amp: 0, phase: 0, spin: 0 }
    topAt = new THREE.Vector3(x, top, z)
    // A broken chain or two hanging from under it (what held it, once).
    for (let k = 0; k < (climb ? 2 : 1); k++) {
      const off = (rand() - 0.5) * w * 0.6
      ends.push({ at: new THREE.Vector3(x + Math.cos(a + 1.57) * off, y - h / 2 - 0.4, z + Math.sin(a + 1.57) * off), len: 1.5 + rand() * 4 })
    }
  }
  return { top: topAt, decor: danglingChains(ends) }
}
