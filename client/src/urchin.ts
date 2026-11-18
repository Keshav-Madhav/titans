// The Urchin (the user: "things should generally be huge"): on the Shore, a sea urchin's test — the
// round shell left when the spines are gone — bleached on the sand, fourteen metres across. Broken
// open on one side at the sand: you can walk in. Inside, in the half-light through the pores, the
// sand floor and, lying on it, one tooth of the jaw that was underneath.
//
// Its own model: an oblate dome; five paired bands of pores running pole to pole (the ambulacra), the
// broad fields between them studded with rows of tubercles (where the spines were), a mouth hole
// underneath, a small one on top, and the break. A matching field for rocks.addBuilt: a wall of real
// thickness you can climb, a hollow you can stand in.

import * as THREE from 'three'
import { mulberry32 } from '@titans/shared'
import type { Shape } from './rock-fields'

/** Its height over its width (an urchin's test is a low dome). */
const FLAT = 0.58
/** The wall's thickness (m). */
const WALL = 0.35
/** The break in its side: direction (local, unit, near the sand) and its angular radius. */
// (Low on the side: sunk as it is, the break's lower edge goes into the sand, so you walk straight in.)
const BREAK = { dir: new THREE.Vector3(1, -0.35, 0.2).normalize(), r: 0.6 }

/** Is the unit direction d (on the round, before flattening) in one of the openings? */
function opening(d: THREE.Vector3, rand: () => number): boolean {
  if (d.y > 0.97) return true // the small hole on top
  if (d.y < -0.85) return true // the mouth underneath
  void rand
  return false
}

/** The break's edge: its angular radius at azimuth phi round the break's axis (ragged, but smooth). */
const breakR = (phi: number) => BREAK.r * (0.92 + 0.08 * Math.sin(3 * phi + 1) + 0.05 * Math.sin(7 * phi + 2.3) + 0.03 * Math.sin(13 * phi))
const _bu = new THREE.Vector3(0, 1, 0).cross(BREAK.dir).normalize()
const _bv = new THREE.Vector3().crossVectors(BREAK.dir, _bu)
const _p = new THREE.Vector3()
/**
 * A direction inside the break is moved out onto its edge (at the same azimuth round the axis): the
 * triangles there fold flat along the rim instead of being dropped square by square — dropped, the
 * hole's edge was a stair of grid cells, first look.
 */
function toBreakEdge(d: THREE.Vector3): boolean {
  const c = THREE.MathUtils.clamp(d.dot(BREAK.dir), -1, 1)
  const theta = Math.acos(c)
  _p.copy(d).addScaledVector(BREAK.dir, -c)
  const len = _p.length()
  if (len < 1e-6) _p.copy(_bu)
  else _p.divideScalar(len)
  const phi = Math.atan2(_p.dot(_bv), _p.dot(_bu))
  const rb = breakR(phi)
  if (theta >= rb) return false
  d.copy(BREAK.dir).multiplyScalar(Math.cos(rb)).addScaledVector(_p, Math.sin(rb))
  return true
}

/** 0 … 1: how much of an ambulacrum (pore band) this direction is on; and how close to a tubercle. */
function pattern(d: THREE.Vector3): { amb: number; tub: number } {
  const lon = Math.atan2(d.z, d.x)
  const lat = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1))
  // Five bands, each a pair of pore rows, narrowing toward the poles.
  const sector = (((lon / (Math.PI * 2)) * 5) % 1 + 1) % 1
  const band = Math.abs(sector - 0.5)
  const w = 0.07 * Math.cos(lat) + 0.015
  const amb = 1 - THREE.MathUtils.smoothstep(band, w * 0.6, w)
  // Tubercles: a grid of knobs in the broad fields, in rows down the latitude.
  const rows = 22
  const across = 7 * Math.max(0.25, Math.cos(lat))
  const fu = (lat / Math.PI) * rows
  const fv = sector * across * 2
  const du = fu - Math.round(fu)
  const dv = fv - Math.round(fv + (Math.round(fu) % 2) * 0.5) + (Math.round(fu) % 2) * 0.5
  const tub = (1 - amb) * Math.max(0, 1 - Math.hypot(du, dv) / 0.32)
  return { amb, tub }
}

/** The test of radius R (its width is 2R): the outer and inner surfaces, the openings left out. */
export function urchinGeometry(R: number): THREE.BufferGeometry {
  const rand = mulberry32(0x0c41)
  // (Fine enough for the knobs to be round: at 96 × 56 a knob was one or two vertices, a pyramid.)
  const W = 220
  const H = 128
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  const d = new THREE.Vector3()
  const keep: boolean[] = []
  const moved: boolean[] = []
  for (const side of [1, -1]) {
    const base = pos.length / 3
    for (let j = 0; j <= H; j++) {
      const v = j / H
      const lat = (v - 0.5) * Math.PI
      for (let i = 0; i <= W; i++) {
        const lon = (i / W) * Math.PI * 2
        d.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon))
        const m = toBreakEdge(d)
        if (side > 0) moved.push(m)
        const { amb, tub } = pattern(d)
        // Knobs stand out; the pore bands sink a little; the inner surface is the wall's thickness in.
        // (Real relief, metres: knobs a hand and a half high, the pore bands a groove — at 1-2 % of R
        // they did not show, and it read as a boulder, first look.)
        const pore = amb * Math.max(0, Math.cos(lon * 60) * Math.cos(lat * 44)) ** 6
        const rr = side > 0 ? R + 0.26 * tub * tub - 0.12 * amb - 0.08 * pore : R - WALL
        pos.push(d.x * rr, d.y * rr * FLAT, d.z * rr)
        // Bleached: chalk, the pore bands faintly violet, the knobs whiter; inside, shadowed grey-cream.
        // (Linear values.)
        const k = side > 0 ? 1 : 0.62
        const c = [0.6 + 0.14 * tub - 0.1 * amb - 0.25 * pore, 0.56 + 0.12 * tub - 0.14 * amb - 0.25 * pore, 0.5 + 0.1 * tub - 0.02 * amb - 0.2 * pore]
        col.push(c[0] * k, c[1] * k, c[2] * k)
        if (side > 0) keep.push(!opening(d, rand))
      }
    }
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const a = j * (W + 1) + i
        if (!keep[a] || !keep[a + 1] || !keep[a + W + 1] || !keep[a + W + 2]) continue
        const A = base + a
        const B = A + W + 1
        // (A triangle with all three corners pulled onto the break's edge spans the hole: left out.)
        const t1 = !(moved[a] && moved[a + W + 1] && moved[a + 1])
        const t2 = !(moved[a + 1] && moved[a + W + 1] && moved[a + W + 2])
        if (side > 0) {
          if (t1) idx.push(A, B, A + 1)
          if (t2) idx.push(A + 1, B, B + 1)
        } else {
          if (t1) idx.push(A, A + 1, B)
          if (t2) idx.push(A + 1, B + 1, B)
        }
      }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** The test's field (negative inside the wall), the openings cut through. */
export function urchinShape(R: number): Shape {
  const d = new THREE.Vector3()
  const field = (x: number, y: number, z: number): number => {
    // The flattened sphere, measured round (the wall is thin, so this is close enough).
    const ly = y / FLAT
    const r = Math.hypot(x, ly, z)
    const shell = Math.abs(r - (R - WALL / 2)) - WALL / 2
    if (r < 1e-3) return shell
    d.set(x / r, ly / r, z / r)
    // (The openings: free air. The break's edge is smoothed here — a ragged hole to look at, a clean
    // one to walk through.)
    if (d.y > 0.97 || d.y < -0.85) return Math.max(shell, 0.4)
    const off = d.angleTo(BREAK.dir) - BREAK.r * 0.9
    if (off < 0) return Math.max(shell, -off * R)
    return shell
  }
  return { field, hx: R + 1, hy: R * FLAT + 1, hz: R + 1, cy: 0 }
}

/** Where the floor of its inside is, local: it rests sunk into the sand by `sink` metres. */
export function urchinSink(R: number): number {
  return R * FLAT * 0.28
}

/** The test as drawn: its own vertex-coloured material (rocks.addBuilt's mesh, rock-textured, is hidden). */
export function urchinMesh(R: number): THREE.Mesh {
  const m = new THREE.Mesh(urchinGeometry(R), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }))
  m.castShadow = true
  m.receiveShadow = true
  return m
}
