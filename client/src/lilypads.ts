// Giant lily pads on the Mire's pools (the user: "things should generally be huge"): leaves four to
// seven metres across floating on the black water, sturdy enough to stand on — you can cross a pool on
// them, pad to pad. A few hold a closed flower the size of a barrel.
//
// Their own model: a disc with the lily's notch cut to the middle, its rim curling up a hand's breadth,
// veins out from the centre; built through rocks.addBuilt (a thin disc field), so you stand on it.

import * as THREE from 'three'
import type { Shape } from './rock-fields'

/** A pad's notch: half-width (radians) of the cut out to the rim. */
const NOTCH = 0.16

/** A pad of radius R: the leaf, as triangles round the centre, the rim turned up. */
export function padGeometry(R: number, notchAt: number): THREE.BufferGeometry {
  const RINGS = 6
  const SEG = 40
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  const base = (a: number) => a - notchAt
  for (let r = 0; r <= RINGS; r++) {
    const t = r / RINGS
    for (let k = 0; k <= SEG; k++) {
      // From one side of the notch round to the other.
      const a = notchAt + NOTCH + (k / SEG) * (Math.PI * 2 - 2 * NOTCH)
      const rr = R * t
      // The rim curls up over its last tenth; a faint dish over the rest.
      const y = 0.03 * R * t * t + (t > 0.88 ? 0.12 * R * ((t - 0.88) / 0.12) ** 2 : 0)
      pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr)
      // Veins: lighter lines out from the middle; the rim darker and redder underneath its curl.
      // (Dark, waxy, mottled: a flat bright green read as plastic against the peat-black water.)
      const vein = 1 - 0.22 * Math.max(0, Math.cos(base(a) * 18)) ** 8
      const mot = 0.82 + 0.18 * Math.sin(a * 7 + t * 9) * Math.sin(a * 3 - t * 5)
      // (Linear colour: the vertex colours are not sRGB — 0.13 came out as a pale mint.)
      const g = (0.045 + 0.02 * t) * mot
      col.push((0.014 + 0.006 * t + (t > 0.9 ? 0.035 : 0)) * vein * mot, g * vein, (0.008 + 0.004 * t) * vein * mot)
    }
  }
  for (let r = 0; r < RINGS; r++)
    for (let k = 0; k < SEG; k++) {
      const a = r * (SEG + 1) + k
      const b = a + SEG + 1
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** A closed lily flower on a pad: pale petals folded up round each other. */
export function flowerGeometry(R: number): THREE.BufferGeometry {
  const s = R * 0.16
  const pts = [0, 0.15, 0.4, 0.7, 0.92, 1].map((t) => new THREE.Vector2(s * (0.15 + 0.85 * Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.05)) * (1 - 0.6 * t * t)), s * 1.6 * t))
  const g = new THREE.LatheGeometry(pts, 10)
  // Petal ridges: ten folds round it.
  const p = g.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const z = p.getZ(i)
    const a = Math.atan2(z, x)
    const k = 1 + 0.12 * Math.cos(a * 5)
    p.setXYZ(i, x * k, p.getY(i), z * k)
  }
  g.computeVertexNormals()
  return g.translate(0, 0.03 * R, 0)
}

/** A pad's field: a thin disc (half a hand thick), its top at the leaf's surface. */
export function padShape(R: number): Shape {
  const field = (x: number, y: number, z: number): number => {
    const dr = Math.hypot(x, z) - R
    const dy = Math.abs(y - 0.02 * R) - 0.12
    return Math.min(Math.max(dr, dy), 0) + Math.hypot(Math.max(dr, 0), Math.max(dy, 0))
  }
  return { field, hx: R + 1, hy: 1, hz: R + 1, cy: 0 }
}
