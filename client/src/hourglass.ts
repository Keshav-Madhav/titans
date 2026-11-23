// The Hourglass ("things should generally be huge"): in the Dune Sea, a giant's hourglass lying on its
// side, half sunk — its frame wood gone grey and split, end caps as wide as a house, four turned posts,
// and between them the glass: one bulb whole, its sand all run down into it long ago; the other broken
// open low on its side, and the desert has blown in. You step in through the break and stand on the sand, the
// light coming through the glass round you. On that sand, one grain of it, as big as your fist.
//
// Its own model: caps, posts and both bulbs' sand drawn by rocks.addBuilt (wood, wood, sand — layers set
// per part after), the glass a lathe of its own with the break cut out of it (jagged: whole triangles
// dropped), clear and faint. One field for standing and climbing: caps, posts, the whole bulb's glass,
// the broken one's but for the break, and the sand in each.

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Shape } from './rock-fields'

/** Half its length (cap to cap), the caps' radius and half-thickness; the posts' ring and radius. */
const HALF = 18
const CAPR = 9.5
const CAPT = 1.1
const PR = 7.8
const POST = 0.85
/** The posts round the axis — three: the fourth, on the break's side, snapped (whole, it ran right across
 *  the way in at the sill's height and you could not get past it). */
const SNAPPED = (3 * Math.PI) / 4
const POST_ANGLES = [Math.PI / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]
/** The glass: from the neck (x 0) to the caps' collars; its thickness. */
const GX = HALF - CAPT * 2
const GLASS = 0.25
/** Its axis above the sand it lies sunk in. */
export const HOURGLASS_RISE = CAPR * 0.78
export const HOURGLASS_HALF = HALF
export const HOURGLASS_W = CAPR

/** The glass's radius at x (both bulbs alike): a narrow neck, round bulbs, a collar at each cap. */
function glassR(x: number): number {
  const t = Math.min(1, Math.max(0, (Math.abs(x) - 0.4) / (GX - 0.4)))
  return 0.9 + 5.9 * Math.pow(Math.sin(Math.PI * t), 0.7) + 1.8 * THREE.MathUtils.smoothstep(t, 0.82, 1)
}
/** The break in the +x bulb: in its flank, ragged, its sill a step up from the dunes. (Angle round the axis:
 *  0 is +y, toward +z.) (On the upper flank, 7 m up the curve of the glass, there was no way in; on the
 *  side, a 2 m sill of glass you could not step up.) */
const BREAK_ANG = 2.0
function broken(x: number, ang: number): boolean {
  if (x < 2.5 || x > GX - 2) return false
  let da = ang - BREAK_ANG
  da = Math.atan2(Math.sin(da), Math.cos(da))
  const ragged = 1.05 + 0.25 * Math.sin(x * 2.3) + 0.18 * Math.sin(x * 5.1 + 1.3)
  const span = (1 - Math.abs((x - (GX + 2.5) / 2) / ((GX - 4.5) / 2)) ** 2) * ragged
  return Math.abs(da) < span
}
/** The sand's level in each bulb (local y; the axis is 0): run down into the −x bulb, blown into the +x
 *  up to the break's sill (higher, it would have run out of it). */
const SAND_LO = -2.2
const SAND_HI = -6.1
const sandY = (x: number) => (x < 0 ? SAND_LO + 0.6 * Math.cos((x / GX) * Math.PI * 0.5) : SAND_HI + 0.25 * Math.exp(-((x - 8) ** 2) / 18))

const tiltUp = (g: THREE.BufferGeometry) => g.rotateZ(-Math.PI / 2)

/** The solid parts (caps, posts, the sand in the bulbs), and where each part starts. */
export function hourglassSolids(): { geo: THREE.BufferGeometry; postsFrom: number; sandFrom: number } {
  const caps: THREE.BufferGeometry[] = []
  for (const s of [-1, 1]) {
    caps.push(tiltUp(new THREE.CylinderGeometry(CAPR, CAPR, CAPT * 2, 40, 1)).translate(s * (HALF - CAPT), 0, 0))
    // A carved rim and a boss where the glass seats.
    caps.push(tiltUp(new THREE.TorusGeometry(CAPR - 0.4, 0.45, 8, 40).rotateX(Math.PI / 2)).translate(s * (HALF - CAPT * 2 - 0.1), 0, 0))
    caps.push(tiltUp(new THREE.CylinderGeometry(3.4, 3.8, 0.8, 24)).translate(s * (HALF - CAPT * 2 - 0.4), 0, 0))
  }
  const capG = mergeGeometries(caps.map((g) => g.toNonIndexed()).map((g) => (g.deleteAttribute('uv'), g)))!
  const postsFrom = capG.getAttribute('position').count
  const posts: THREE.BufferGeometry[] = []
  for (const a of POST_ANGLES) {
    const pts: THREE.Vector2[] = []
    for (let i = 0; i <= 40; i++) {
      const y = -GX + (i / 40) * GX * 2
      // A turned spindle: beads at the ends and the middle.
      const bead = Math.exp(-((y - GX * 0.82) ** 2) / 1.2) + Math.exp(-((y + GX * 0.82) ** 2) / 1.2) + 0.7 * Math.exp(-(y ** 2) / 2)
      pts.push(new THREE.Vector2(POST * (1 + 0.45 * bead), y))
    }
    posts.push(tiltUp(new THREE.LatheGeometry(pts, 10)).translate(0, Math.cos(a) * PR, Math.sin(a) * PR))
  }
  // The fourth, snapped: a splintered stub left on the −x cap.
  posts.push(tiltUp(new THREE.CylinderGeometry(POST * 0.7, POST * 1.3, 3.2, 8, 1)).translate(-GX + 1.6, Math.cos(SNAPPED) * PR, Math.sin(SNAPPED) * PR))
  const postG = mergeGeometries(posts.map((g) => g.toNonIndexed()).map((g) => (g.deleteAttribute('uv'), g)))!
  const sandFrom = postsFrom + postG.getAttribute('position').count
  // The sand: a surface across each bulb at its level, clipped to the glass.
  const sand: number[] = []
  const N = 64
  const M = 24
  for (let i = 0; i < N; i++)
    for (let j = 0; j < M; j++) {
      const q = (u: number, v: number): [number, number, number] | null => {
        const x = -GX + 0.6 + (u / N) * (GX * 2 - 1.2)
        if (Math.abs(x) < 1.2) return null
        const y = sandY(x)
        const half = Math.sqrt(Math.max(0, glassR(x) ** 2 - y * y)) - 0.15
        if (half <= 0.2) return null
        return [x, y, -half + (v / M) * half * 2]
      }
      const a = q(i, j)
      const b = q(i + 1, j)
      const c = q(i + 1, j + 1)
      const d = q(i, j + 1)
      if (!a || !b || !c || !d) continue
      sand.push(...a, ...c, ...b, ...a, ...d, ...c)
    }
  const sandG = new THREE.BufferGeometry()
  sandG.setAttribute('position', new THREE.Float32BufferAttribute(sand, 3))
  sandG.computeVertexNormals()
  // (Each part keeps its own smooth normals: recomputed over the merged, non-indexed whole they came out
  // flat — faceted caps and posts.)
  const geo = mergeGeometries([capG, postG, sandG])!
  return { geo, postsFrom, sandFrom }
}

/** The glass: a lathe of the profile along x, the break dropped from it (whole triangles: a jagged edge). */
export function hourglassGlass(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= 120; i++) {
    const x = -GX + (i / 120) * GX * 2
    pts.push(new THREE.Vector2(glassR(x), x))
  }
  const lathe = tiltUp(new THREE.LatheGeometry(pts, 48)).toNonIndexed()
  const pos = lathe.getAttribute('position') as THREE.BufferAttribute
  const nrm = lathe.getAttribute('normal') as THREE.BufferAttribute
  const keep: number[] = []
  const keepN: number[] = []
  for (let t = 0; t < pos.count; t += 3) {
    let out = 0
    for (let k = 0; k < 3; k++) {
      const x = pos.getX(t + k)
      const ang = Math.atan2(pos.getZ(t + k), pos.getY(t + k))
      if (broken(x, ang)) out++
    }
    if (out < 2)
      for (let k = 0; k < 3; k++) {
        keep.push(pos.getX(t + k), pos.getY(t + k), pos.getZ(t + k))
        keepN.push(nrm.getX(t + k), nrm.getY(t + k), nrm.getZ(t + k))
      }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(keepN, 3))
  return g
}

/** Signed distance (local, lying: the axis is y 0; negative inside). */
export function hourglassShape(): Shape {
  const seg = (px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, r: number) => {
    const t = Math.max(0, Math.min(1, (px - ax) / (bx - ax)))
    return Math.hypot(px - ax - (bx - ax) * t, py - ay, pz - az) - r
  }
  const field = (x: number, y: number, z: number): number => {
    const rho = Math.hypot(y, z)
    // The caps.
    let d = Math.max(rho - CAPR, Math.abs(Math.abs(x) - (HALF - CAPT)) - CAPT)
    // The posts.
    for (const a of POST_ANGLES) d = Math.min(d, seg(x, y, z, -GX, Math.cos(a) * PR, Math.sin(a) * PR, GX, POST * 1.2))
    d = Math.min(d, seg(x, y, z, -GX, Math.cos(SNAPPED) * PR, Math.sin(SNAPPED) * PR, -GX + 3.2, POST * 1.3))
    if (Math.abs(x) < GX) {
      const r = glassR(x)
      // The glass, but for the break.
      if (!broken(x, Math.atan2(z, y))) d = Math.min(d, Math.abs(rho - r) - GLASS)
      // The sand in the bulb.
      d = Math.min(d, Math.max(y - sandY(x), rho - r))
    }
    return d
  }
  return { field, hx: HALF + 1, hy: CAPR + 1, hz: CAPR + 1, cy: 0 }
}

/** Where its grain of sand lies (local): on the sand in the broken bulb, under the break. */
export const HOURGLASS_GRAIN = new THREE.Vector3(8.5, SAND_HI + 0.25 + 0.12, -0.6)
