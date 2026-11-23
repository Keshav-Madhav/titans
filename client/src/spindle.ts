// The Spindle ("things should generally be huge"): on a high terrace of the Steps, as if dropped from
// a lap, a giant's drop spindle — a turned shaft as long as a ship, its stone whorl taller than you
// holding its head up off the terrace, a fat cop of grey wool wound on above the whorl. The thread runs
// off the cop and away down the terraces, still taut: take hold of it (E) and it carries you down, as
// the old cables do (cables.ts addLine). At its far end, a tuft of the wool.
//
// Its own model: the shaft (lying tilted, its tip on the ground), the whorl (a carved stone disc, on
// edge), the cop; drawn by rocks.addBuilt in the rock material, each part in its own stuff — the shaft
// a smooth wood (bone, tinted), the whorl carved stone, the cop wool (hide, pale) — with a field for
// standing, climbing and the grapple.

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Shape } from './rock-fields'

/** The shaft: from its head (x0) past the whorl to its tip on the ground (x1); radii there. */
const X0 = -22
const X1 = 22
const R_HEAD = 0.85
const R_TIP = 0.32
/** The whorl: its centre along the shaft, radius, half-thickness, the hole. */
const WX = -16
const WR = 6
const WT = 1.2
/** The cop of wool: from just past the whorl, this long, this fat. */
const CX0 = -14
const CX1 = -1
const CR = 2.7

/** The shaft's line: through the whorl's centre (held WR up) to the tip on the ground. */
const K = (R_TIP - WR) / (X1 - WX)
const yAt = (x: number) => WR + (x - WX) * K
const rAt = (x: number) => R_HEAD + ((x - X0) / (X1 - X0)) * (R_TIP - R_HEAD)
const copR = (x: number) => (x < CX0 || x > CX1 ? 0 : CR * Math.sqrt(Math.max(0, 1 - ((2 * (x - CX0)) / (CX1 - CX0) - 1) ** 2)))

/** The geometry and the vertex ranges of its parts: [shaftEnd, whorlEnd] (the rest is the cop). */
export function spindleGeometry(): { geo: THREE.BufferGeometry; whorlFrom: number; copFrom: number } {
  const tilt = Math.atan(K)
  const along = (g: THREE.BufferGeometry, x: number) => g.rotateZ(-Math.PI / 2).rotateZ(tilt).translate(x, yAt(x), 0)
  // The shaft: a lathe along x, tapering, the head rounded.
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= 40; i++) {
    const x = X0 + (i / 40) * (X1 - X0)
    pts.push(new THREE.Vector2(rAt(x) * (i === 0 ? 0.4 : i === 40 ? 0.5 : 1), x))
  }
  const shaft = new THREE.LatheGeometry(pts, 16)
  // (Lathe runs along y: turned to x, tilted, set on the line.)
  shaft.rotateZ(-Math.PI / 2).rotateZ(tilt).translate(0, yAt(0), 0)
  const shaftG = shaft.toNonIndexed()
  const whorlFrom = shaftG.getAttribute('position').count
  // The whorl: a thick stone disc on edge, a raised rim and a boss round the hole.
  const w = mergeGeometries(
    [new THREE.CylinderGeometry(WR, WR * 0.96, WT * 2, 40, 1), new THREE.TorusGeometry(WR - 0.25, 0.38, 8, 40).rotateX(Math.PI / 2), new THREE.CylinderGeometry(1.6, 1.6, WT * 2 + 0.6, 20)].map((g) =>
      g.index ? g.toNonIndexed() : g,
    ).map((g) => (g.deleteAttribute('uv'), g)),
  )!
  along(w, WX)
  const copFrom = whorlFrom + w.getAttribute('position').count
  // The cop: the wound wool, fat in the middle, in turns (a ridge every 0.7 m).
  const cp: THREE.Vector2[] = []
  for (let i = 0; i <= 60; i++) {
    const x = CX0 + (i / 60) * (CX1 - CX0)
    cp.push(new THREE.Vector2(Math.max(rAt(x) + 0.05, copR(x) * (1 + 0.045 * Math.sin(x * 9))), x - (CX0 + CX1) / 2))
  }
  const cop = new THREE.LatheGeometry(cp, 28).toNonIndexed()
  along(cop, (CX0 + CX1) / 2)
  const parts = [shaftG, w, cop].map((g) => (g.hasAttribute('uv') && g.deleteAttribute('uv'), g))
  const geo = mergeGeometries(parts)!
  geo.computeVertexNormals()
  return { geo, whorlFrom, copFrom }
}

/** Signed distance (local; negative inside). */
export function spindleShape(): Shape {
  const tilt = Math.atan(K)
  const c = Math.cos(tilt)
  const s = Math.sin(tilt)
  const field = (x: number, y: number, z: number): number => {
    // Into the shaft's frame: u along it (from the whorl's centre), v across (up), z.
    const dx = x - WX
    const dy = y - WR
    const u = dx * c + dy * s
    const v = -dx * s + dy * c
    const ax = WX + u * c // the shaft's x at this point along it
    // The shaft (a tapering rod).
    const along = Math.max(X0 - WX, Math.min(X1 - WX, u))
    let d = Math.hypot(u - along, v, z) - rAt(WX + along * c)
    // The whorl: a disc across the shaft.
    const rr = Math.hypot(v, z)
    d = Math.min(d, Math.max(rr - WR, Math.abs(u) - WT))
    // The cop.
    const cr = copR(ax)
    if (cr > 0) d = Math.min(d, rr - cr)
    return d
  }
  return { field, hx: (X1 - X0) / 2 + 2, hy: WR + 1, hz: WR + 1, cy: WR / 2 }
}

/** Where the thread leaves the cop (local), on `side` (±1, across the shaft): low on its flank, within a
 *  hand's reach off the terrace — from its top, 5 m up, no one could take hold; and off its side, not
 *  along the shaft, or the line ran through the spindle itself. */
export function spindleThread(side: number): THREE.Vector3 {
  const mid = (CX0 + CX1) / 2
  return new THREE.Vector3(mid, yAt(mid) - CR * 0.6, side * CR * 0.8)
}
/** How far it reaches (m) from its middle, for the level ground it needs. */
export const SPINDLE_HALF = (X1 - X0) / 2
