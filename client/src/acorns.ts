// Giant acorns (the user: "things should generally be huge"): fallen from the Old Wood's giant trees and
// lying in the leaf litter under them, each as long as a cart is and taller than you — a smooth brown nut
// half out of its scaly cup, sunk a little into the ground where it landed.
//
// Their own model: the nut a lathe of an acorn's outline (a blunt point at the tip, broadest past the
// middle), the cup a shallow bowl round its base covered in overlapping scales and a short stalk. Built
// upright, laid on its side; matching fields for collision through rocks.addBuilt, so you can climb on
// them and stand on top.

import * as THREE from 'three'
import type { Shape } from './rock-fields'

/** Laid on its side, how far its axis stands above the ground, as a share of the nut's radius. */
const REST = 0.85

/** An ellipsoid's distance (approximate; negative inside). */
function ellipsoid(x: number, y: number, z: number, rx: number, ry: number, rz: number): number {
  const k0 = Math.hypot(x / rx, y / ry, z / rz)
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz))
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz)
}

/** From the laid-down frame (axis along -x) back to the upright one (axis along +y). */
function upright(x: number, y: number, z: number, R: number): [number, number, number] {
  const ly = y - R * REST
  return [ly, -x, z]
}

function layDown(g: THREE.BufferGeometry, R: number): THREE.BufferGeometry {
  return g.rotateZ(Math.PI / 2).translate(0, R * REST, 0)
}

/** The nut: `L` long, its radius 0.38 L. Upright it runs from its tip (y = 0) to its cup end (y = 0.8 L). */
export function acornNutGeometry(L: number): THREE.BufferGeometry {
  const R = 0.38 * L
  const pts: THREE.Vector2[] = []
  const N = 28
  for (let i = 0; i <= N; i++) {
    const t = i / N
    // A blunt point, swelling quickly, broadest at ~60%, rounding into the cup.
    // (A clear point at the tip, then the long smooth swell: rounder, it read as a potato.)
    const r = R * Math.pow(Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5), 1.15) * (1 - 0.08 * Math.max(0, t - 0.75) / 0.25)
    pts.push(new THREE.Vector2(Math.max(0.001, r), 0.8 * L * t))
  }
  const g = new THREE.LatheGeometry(pts, 36)
  g.computeVertexNormals()
  return layDown(g, R)
}

/** The cup: a scaly bowl holding the nut's broad end — a closed lathe (outside, rim, inside), with a stalk. */
export function acornCupGeometry(L: number): THREE.BufferGeometry {
  const R = 0.38 * L
  const outer: THREE.Vector2[] = []
  const N = 16
  // Outside: from the stalk at the base round to the rim, which sits a little proud of the nut.
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const a = t * Math.PI * 0.5
    outer.push(new THREE.Vector2(0.18 * R + (R * 1.06 - 0.18 * R) * Math.sin(a), 0.9 * L - 0.3 * L * (1 - Math.cos(a)) - 0.0 * t))
  }
  // Inside: back down from the rim, hugging the nut.
  const inner: THREE.Vector2[] = []
  for (let i = N; i >= 0; i--) {
    const t = i / N
    const a = t * Math.PI * 0.5
    inner.push(new THREE.Vector2(Math.max(0.001, (0.18 * R + (R * 0.96 - 0.18 * R) * Math.sin(a)) * 0.98), 0.88 * L - 0.27 * L * (1 - Math.cos(a))))
  }
  const g = new THREE.LatheGeometry([...outer, ...inner], 48)
  // Scales: overlapping rows of small bumps over the outside, each row offset half a scale.
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const r = Math.hypot(x, z)
    if (r < 0.2 * R) continue
    const ang = Math.atan2(z, x)
    const row = (0.9 * L - y) / (0.3 * L) * 7
    const bump = Math.max(0, Math.sin(ang * 14 + (Math.floor(row) % 2) * Math.PI)) * Math.max(0, Math.sin(row * Math.PI)) * 0.05 * R
    const k = (r + bump) / r
    pos.setXYZ(i, x * k, y, z * k)
  }
  g.computeVertexNormals()
  const stalk = new THREE.CylinderGeometry(0.06 * L, 0.09 * L, 0.14 * L, 10).translate(0, 0.96 * L, 0)
  const merged = new THREE.BufferGeometry()
  const a1 = g.toNonIndexed().getAttribute('position').array as Float32Array
  const a2 = stalk.toNonIndexed().getAttribute('position').array as Float32Array
  const all = new Float32Array(a1.length + a2.length)
  all.set(a1, 0)
  all.set(a2, a1.length)
  merged.setAttribute('position', new THREE.BufferAttribute(all, 3))
  merged.computeVertexNormals()
  return layDown(merged, R)
}

export function acornNutShape(L: number): Shape {
  const R = 0.38 * L
  const field = (x: number, y: number, z: number): number => {
    const [ux, uy, uz] = upright(x, y, z, R)
    return ellipsoid(ux, uy - 0.42 * L, uz, R * 0.97, 0.42 * L, R * 0.97)
  }
  return { field, hx: L, hy: R * 2, hz: R * 1.2, cy: R * REST }
}

export function acornCupShape(L: number): Shape {
  const R = 0.38 * L
  const field = (x: number, y: number, z: number): number => {
    const [ux, uy, uz] = upright(x, y, z, R)
    return ellipsoid(ux, uy - 0.78 * L, uz, R * 1.08, 0.14 * L, R * 1.08)
  }
  return { field, hx: L, hy: R * 2, hz: R * 1.3, cy: R * REST }
}

/** The top of a laid-down acorn of length `L` (above its rest point): where something could sit. */
export function acornTop(L: number): number {
  return 0.38 * L * (REST + 0.97)
}
