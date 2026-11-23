// The Comb ("things should generally be huge"; the user, 2026-11-23: "more random trinkets thrown around,
// like the flute, ring, hourglass"): on the Green, a giant's horn comb, dropped tines-up and its back sunk
// in the turf — a palisade of teeth fourteen metres tall across the meadow. The coarse half you can walk
// between; the fine half is a wall. Two teeth snapped short, one gone. Caught in the fine teeth, one of
// its owner's hairs, dark and as thick as a cord, trailing away over the grass.
//
// Its own model (a spine and its teeth, tapered and rounded), drawn by rocks.addBuilt in the bone layer
// tinted to horn; the hair a tube of its own. One field for standing, climbing and the grapple.

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Shape } from './rock-fields'

/** The spine: length, height above the turf (more of it sunk), thickness. */
const L = 52
// (Sunk to just under its teeth: standing 3.2 m proud, its back was a wall and you could not walk between
// the coarse teeth at all — first play.)
const SPINE_UP = 0.9
const SPINE_DOWN = 3.2
/** Lying tilted as it landed: the coarse end (−x) sunk to a step above the turf (you walk between those
 *  teeth), the fine end (+x) showing its carved back — sunk level all along, it read as a picket fence. */
const TILT = Math.atan2(7.0, L)
const TILTED = new THREE.Matrix4().makeRotationZ(TILT)
const UNTILT = TILTED.clone().invert()
const SPINE_T = 1.5
/** The teeth: their height, base width (along the comb) and thickness. */
const TOOTH_H = 14
// (A comb is a thin plate: its teeth flat blades in its plane, not posts — round, pointed and thick they
// read as a picket fence, first look.)
const TOOTH_W = 1.5
const TOOTH_T = 0.55

interface Tooth {
  x: number
  h: number
  w: number
}
/** Coarse teeth (walk between) on −x, fine on +x; two snapped, one gone. */
function teeth(): Tooth[] {
  const out: Tooth[] = []
  for (let x = -L / 2 + 1.8; x < -1; x += 3.4) out.push({ x, h: TOOTH_H, w: TOOTH_W })
  for (let x = 0.6; x < L / 2 - 1; x += 1.6) out.push({ x, h: TOOTH_H * 0.94, w: TOOTH_W * 0.62 })
  const snapped = [3, 14]
  for (const k of snapped) if (out[k]) out[k].h *= 0.42
  out.splice(9, 1)
  return out
}
const TEETH = teeth()

/** The geometry: the spine, then the teeth. */
export function combGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  // The spine: a long bar, gently arched, its top edge rounded by a band of grooves.
  const spine = new THREE.BoxGeometry(L, SPINE_UP + SPINE_DOWN, SPINE_T, 80, 3, 2)
  const sp = spine.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i)
    let y = sp.getY(i) + (SPINE_UP - SPINE_DOWN) / 2
    const z = sp.getZ(i)
    const arch = 0.25 * Math.cos((x / L) * Math.PI)
    // Rounded ends.
    const end = THREE.MathUtils.smoothstep(Math.abs(x), L / 2 - 3, L / 2)
    if (y > 0) y = y * (1 - 0.35 * end)
    // Grooves along its top band.
    const band = y > SPINE_UP - 1.2 ? 0.12 * Math.max(0, Math.sin(x * 2.2)) : 0
    sp.setXYZ(i, x, y + arch, z * (1 - band))
  }
  parts.push(spine.toNonIndexed())
  for (const t of TEETH) {
    const g = new THREE.BoxGeometry(t.w, t.h, TOOTH_T, 2, 20, 1)
    const p = g.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const u = (p.getY(i) + t.h / 2) / t.h
      // Tapering to a rounded tip; a snapped one ends ragged instead.
      const full = t.h > TOOTH_H * 0.5
      // Narrowing a little toward the tip, the tip rounded (not a point); the blade's thickness thins a
      // touch to its edge. A snapped one ends ragged.
      // (Rounded, as a comb's teeth are — pointed, they were a picket fence's stakes.)
      const k = full ? (1 - 0.18 * u) * (u > 0.9 ? Math.max(0.55, Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.9) / 0.1, 2)))) : 1) : 1 - 0.1 * u
      const rag = !full && u > 0.99 ? 0.35 * Math.sin(p.getX(i) * 7 + p.getZ(i) * 5) : 0
      p.setXYZ(i, p.getX(i) * Math.max(0.2, k), p.getY(i) + t.h / 2 + rag, p.getZ(i) * (1 - 0.3 * u))
    }
    const arch = 0.25 * Math.cos((t.x / L) * Math.PI)
    parts.push(g.toNonIndexed().translate(t.x, SPINE_UP - 0.3 + arch, 0))
  }
  const geo = mergeGeometries(parts.map((g) => (g.deleteAttribute('uv'), g)))!
  geo.applyMatrix4(TILTED)
  geo.computeVertexNormals()
  return geo
}

/** Signed distance (local; the turf at y 0; negative inside). */
export function combShape(): Shape {
  const box = (x: number, y: number, z: number, bx: number, by: number, bz: number) => {
    const qx = Math.abs(x) - bx
    const qy = Math.abs(y) - by
    const qz = Math.abs(z) - bz
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0)
  }
  const q = new THREE.Vector3()
  const flat = (x0: number, y0: number, z: number): number => {
    q.set(x0, y0, z).applyMatrix4(UNTILT)
    const x = q.x
    const y = q.y
    const arch = 0.25 * Math.cos((x / L) * Math.PI)
    let d = box(x, y - arch - (SPINE_UP - SPINE_DOWN) / 2, z, L / 2, (SPINE_UP + SPINE_DOWN) / 2, SPINE_T / 2)
    if (y > SPINE_UP - 1)
      for (const t of TEETH) {
        if (Math.abs(x - t.x) > 3) continue
        const ty = SPINE_UP - 0.3 + arch
        const u = Math.min(1, Math.max(0, (y - ty) / t.h))
        const k = 1 - 0.3 * Math.pow(u, 1.4)
        d = Math.min(d, box(x - t.x, y - ty - t.h / 2, z, (t.w / 2) * k, t.h / 2, (TOOTH_T / 2) * (1 - 0.3 * u)))
      }
    return d
  }
  const field = flat
  return { field, hx: L / 2 + 1, hy: (TOOTH_H + SPINE_UP + SPINE_DOWN) / 2 + 1, hz: SPINE_T + 1, cy: (TOOTH_H + SPINE_UP - SPINE_DOWN) / 2 }
}

/** The hair: caught between two fine teeth up high, looped over, and trailing away over the grass to its end
 *  (local points; the last is its end on the ground, where the find lies). */
export function combHairPath(groundAt: (x: number, z: number) => number): THREE.Vector3[] {
  const fine = TEETH.filter((t) => t.x > 0 && t.h > TOOTH_H * 0.5)
  const a = fine[Math.floor(fine.length * 0.45)]
  const top = SPINE_UP + a.h * 0.78
  const tp = (v: THREE.Vector3) => v.applyMatrix4(TILTED)
  const pts = [new THREE.Vector3(a.x + 0.8, top, -0.2), new THREE.Vector3(a.x + 0.9, top + 0.6, 1.0), new THREE.Vector3(a.x + 2.5, top - 3, 4.5), new THREE.Vector3(a.x + 4, 3, 9)].map(tp)
  for (const [dx, dz] of [[6, 14], [4, 20], [9, 26], [14, 29]]) pts.push(new THREE.Vector3(a.x + dx, 0, dz))
  for (const p of pts) if (p.y < 1) p.y = groundAt(p.x, p.z) + 0.12
  return pts
}

export const COMB_HALF = L / 2
export const COMB_T = SPINE_T
export const COMB_SINK = SPINE_DOWN
