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

/** A rough-cut slab, `w` × `h` × `d`, its faces a little uneven. */
function slab(w: number, h: number, d: number, rand: () => number): { shape: Shape; geo: THREE.BufferGeometry } {
  const geo = new THREE.BoxGeometry(w, h, d, 4, Math.max(1, Math.round(h / 1.5)), 4)
  const p = geo.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const k = 1 + (rand() - 0.5) * 0.04
    p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k)
  }
  geo.computeVertexNormals()
  geo.deleteAttribute('uv')
  const shape: Shape = {
    field: (x, y, z) => Math.max(Math.abs(x) - w / 2, Math.abs(y) - h / 2, Math.abs(z) - d / 2),
    hx: w / 2 + 1,
    hy: h / 2 + 1,
    hz: d / 2 + 1,
    cy: 0,
  }
  return { shape, geo }
}

/**
 * Lay the steps out round (cx, cz); returns where the top is (for what is
 * left there). Every third step is a tall block you climb; the rest are
 * thin slabs a jump apart, each a little higher than the last.
 */
export function hangingSteps(rocks: Rocks, terrain: Terrain, cx: number, cz: number): THREE.Vector3 {
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
  }
  return topAt
}
