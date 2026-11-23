// The Thimble ("more random trinkets thrown around"): in the Old Wood, a giant's brass thimble lying on
// its side in the litter, gone green — a domed room you walk into through its open mouth, its walls
// pitted all over with the dimples a needle's eye once pushed against, moss along the side it lies on.
// Inside, on the floor of the dome, the pin it was kept with: a sewing pin as long as a spear.
//
// Its own model (a lathe of a thimble's profile with a wall's thickness, dimpled by a field of round
// hollows; a rolled rim), drawn by rocks.addBuilt (bone tinted bronze-green, moss below); a field for
// standing, climbing and walking in.

import * as THREE from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Shape } from './rock-fields'

/** Its length (mouth to crown), radius at the mouth and at the crown's start, the wall's thickness. */
const LEN = 19
const R0 = 8.2
const R1 = 7.4
const WALL = 0.55
/** Its axis above the litter it lies on, and how far it is sunk. */
export const THIMBLE_RISE = R0 - 0.9
export const THIMBLE_HALF = LEN / 2
export const THIMBLE_R = R0

/** The outer radius at x (0 the mouth, LEN the crown's top): a slightly tapered cylinder, a rounded crown. */
function rOut(x: number): number {
  const crownAt = LEN - R1
  if (x <= crownAt) return R0 + (R1 - R0) * (x / crownAt)
  const t = (x - crownAt) / R1
  return R1 * Math.sqrt(Math.max(0, 1 - t * t))
}
/** The dimples: a grid of round hollows over the outside (u along, a round), metres deep. */
function dimple(x: number, ang: number): number {
  if (x < 1.4) return 0
  const r = rOut(x)
  // (Spacing and mesh matched: at 1.05 m on a 0.5 m mesh the dimples came out a sawtooth — first look.)
  const s = 1.9
  const v = (ang * r) / s
  const row = Math.floor(x / s)
  const off = row % 2 ? 0.5 : 0
  const fu = x / s - row - 0.5
  const fv = v + off - Math.floor(v + off) - 0.5
  const d = Math.hypot(fu, fv)
  return d < 0.42 ? 0.42 * (1 - (d / 0.42) ** 2) ** 1.5 : 0
}

/** The geometry: outside (dimpled) and inside surfaces, the rolled rim at the mouth; lying along x. */
export function thimbleGeometry(): THREE.BufferGeometry {
  const N = 110
  const M = 168
  const pos: number[] = []
  const quad = (a: number[], b: number[], c: number[], d: number[]) => pos.push(...a, ...b, ...c, ...a, ...c, ...d)
  // The inner surface closes in a dome of its own (a wall's thickness inside the crown): run as the outer
  // less a wall, it ended in an open ring and the sky showed through the crown from inside.
  const crownAt = LEN - R1
  const rIn = (x: number) => (x <= crownAt ? rOut(x) - WALL : (R1 - WALL) * Math.sqrt(Math.max(0, 1 - ((x - crownAt) / (R1 - WALL)) ** 2)))
  const at = (x: number, ang: number, inner: boolean): number[] => {
    const r = inner ? rIn(x) : rOut(x) - dimple(x, ang)
    return [x - LEN / 2, Math.cos(ang) * r, Math.sin(ang) * r]
  }
  for (const inner of [false, true]) {
    const xEnd = inner ? crownAt + R1 - WALL : LEN
    for (let i = 0; i < N; i++)
      for (let j = 0; j < M; j++) {
        const x0 = (i / N) * xEnd
        const x1 = ((i + 1) / N) * xEnd
        const a0 = (j / M) * Math.PI * 2
        const a1 = ((j + 1) / M) * Math.PI * 2
        // (Each surface facing out of the metal: the inner one faced the wall, and from inside you saw the
        // back of the dimpled outer surface instead.)
        if (inner) quad(at(x0, a0, true), at(x1, a0, true), at(x1, a1, true), at(x0, a1, true))
        else quad(at(x0, a0, false), at(x0, a1, false), at(x1, a1, false), at(x1, a0, false))
      }
  }
  const g0 = new THREE.BufferGeometry()
  g0.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  // (Smooth normals: welded, then averaged — per-face, the dimples shaded as facets.)
  const g = mergeVertices(g0).toNonIndexed()
  g.computeVertexNormals()
  // The rolled rim at the mouth.
  const rim = new THREE.TorusGeometry(R0 - WALL / 2, WALL * 0.9, 10, 96).rotateY(Math.PI / 2).translate(-LEN / 2, 0, 0).toNonIndexed()
  rim.deleteAttribute('uv')
  const merged = new THREE.BufferGeometry()
  const a = g.getAttribute('position').array as Float32Array
  const b = rim.getAttribute('position').array as Float32Array
  const na = g.getAttribute('normal').array as Float32Array
  const nb = rim.getAttribute('normal').array as Float32Array
  const p = new Float32Array(a.length + b.length)
  p.set(a)
  p.set(b, a.length)
  const n = new Float32Array(na.length + nb.length)
  n.set(na)
  n.set(nb, na.length)
  merged.setAttribute('position', new THREE.BufferAttribute(p, 3))
  merged.setAttribute('normal', new THREE.BufferAttribute(n, 3))
  return merged
}

/** Signed distance (local, lying: axis along x, the mouth at −x; negative inside the metal). */
export function thimbleShape(): Shape {
  const field = (lx: number, y: number, z: number): number => {
    const x = lx + LEN / 2
    const rho = Math.hypot(y, z)
    const xc = Math.max(0, Math.min(LEN, x))
    // The solid outside (closed at the crown, open at the mouth) less the hollow inside.
    const outer = Math.max(rho - rOut(xc), -x, x - LEN)
    const inner = Math.max(rho - Math.max(0, rOut(xc) - WALL), -x - 2, x - (LEN - WALL))
    return Math.max(outer, -inner)
  }
  return { field, hx: LEN / 2 + 1, hy: R0 + 1, hz: R0 + 1, cy: 0 }
}

/** The pin inside (local, lying): a sewing pin as long as a spear lying along the floor of the dome, its
 *  head toward the crown — its geometry, and where a knot of red thread on it lies (the find). */
export function thimblePin(): { geo: THREE.BufferGeometry; knot: THREE.Vector3 } {
  const floor = -THIMBLE_RISE
  const L = 11
  const shaft = new THREE.CylinderGeometry(0.11, 0.11, L, 10, 1)
  const point = new THREE.ConeGeometry(0.11, 0.9, 10).translate(0, -L / 2 - 0.45, 0).rotateX(Math.PI)
  const head = new THREE.SphereGeometry(0.42, 16, 12).translate(0, L / 2 + 0.3, 0)
  const parts = [shaft, point, head].map((g) => g.toNonIndexed())
  const pos: number[] = []
  const nrm: number[] = []
  for (const g of parts) {
    pos.push(...(g.getAttribute('position').array as Float32Array))
    nrm.push(...(g.getAttribute('normal').array as Float32Array))
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  // Lying along the floor, angled across it, the head toward the crown.
  geo.rotateZ(-Math.PI / 2).rotateY(0.22).translate(-0.5, floor + 0.12, 0.8)
  return { geo, knot: new THREE.Vector3(-L / 2 + 1.2, floor + 0.02, 0.8 + Math.sin(0.22) * (L / 2 - 1.2)) }
}
