// The Board (the user: "things should generally be huge"; and the story direction: the giants live
// here, you are a curious visitor): in the Ruins, a game the giants left unfinished. A square of
// flagstones as wide as a field on a low plinth, eight by eight, light and dark; round stone pieces
// taller than you on some of the squares — pale limestone and dark basalt — one tipped on its edge,
// one rolled off into the grass.
//
// Built through rocks.addBuilt (stone looks right in the rock material, and you stand on and climb
// all of it): the plinth, the dark squares a finger proud of it, and each piece its own built work.

import * as THREE from 'three'
import { mulberry32 } from '@titans/shared'
import type { Shape } from './rock-fields'

export const CELL = 6
export const N = 8
/** Half the board's width. */
export const HALF = (CELL * N) / 2

const box = (x: number, y: number, z: number, bx: number, by: number, bz: number) => {
  const qx = Math.abs(x) - bx
  const qy = Math.abs(y) - by
  const qz = Math.abs(z) - bz
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0)
}

/** The plinth: its top at local y 0, `depth` deep, a lip a hand wide round the playing squares. */
/** The plinth's half width (the playing squares and a lip). */
export const PLINTH = HALF + 1.2

export function plinth(depth: number): { shape: Shape; geo: THREE.BufferGeometry } {
  const W = PLINTH
  const field = (x: number, y: number, z: number) => box(x, y + depth / 2, z, W, depth / 2, W)
  const geo = new THREE.BoxGeometry(W * 2, depth, W * 2, 12, 2, 12).translate(0, -depth / 2, 0)
  return { shape: { field, hx: W + 1, hy: depth / 2 + 1, hz: W + 1, cy: -depth / 2 }, geo }
}

/**
 * A step course round the plinth: a ring `w` wide whose top is `drop` below the board's, down to the
 * same depth — two of them make the dais you walk up onto. (Without them the plinth's edge stood up out
 * of sloping ground: you slid along it and never had a level place to climb from, first walk.)
 */
export function stepCourse(inner: number, w: number, drop: number, depth: number): { shape: Shape; geo: THREE.BufferGeometry } {
  const O = inner + w
  const h = depth - drop
  const field = (x: number, y: number, z: number) => box(x, y + drop + h / 2, z, O, h / 2, O)
  const parts = [
    new THREE.BoxGeometry(O * 2, h, w).translate(0, -drop - h / 2, inner + w / 2),
    new THREE.BoxGeometry(O * 2, h, w).translate(0, -drop - h / 2, -inner - w / 2),
    new THREE.BoxGeometry(w, h, inner * 2).translate(inner + w / 2, -drop - h / 2, 0),
    new THREE.BoxGeometry(w, h, inner * 2).translate(-inner - w / 2, -drop - h / 2, 0),
  ]
  return { shape: { field, hx: O + 1, hy: h / 2 + 1, hz: O + 1, cy: -drop - h / 2 }, geo: mergeBoxes(parts) }
}

/** The dark squares: thin slabs a finger proud of the plinth, a hair's gap round each. */
export function darkSquares(): { shape: Shape; geo: THREE.BufferGeometry } {
  const parts: THREE.BufferGeometry[] = []
  const T = 0.06
  const S = CELL / 2 - 0.08
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      if ((i + j) % 2 === 0) continue
      const cx = -HALF + (i + 0.5) * CELL
      const cz = -HALF + (j + 0.5) * CELL
      parts.push(new THREE.BoxGeometry(S * 2, T, S * 2).translate(cx, T / 2, cz))
    }
  const geo = mergeBoxes(parts)
  // (Their field is the board's top face: a finger is nothing to stand on separately.)
  const field = (x: number, y: number, z: number) => box(x, y - T / 2, z, HALF, T / 2, HALF)
  return { shape: { field, hx: HALF + 1, hy: 1, hz: HALF + 1, cy: 0 }, geo }
}

function mergeBoxes(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = []
  const nrm: number[] = []
  const idx: number[] = []
  for (const p of parts) {
    const base = pos.length / 3
    const P = p.getAttribute('position')
    const Nn = p.getAttribute('normal')
    for (let k = 0; k < P.count; k++) {
      pos.push(P.getX(k), P.getY(k), P.getZ(k))
      nrm.push(Nn.getX(k), Nn.getY(k), Nn.getZ(k))
    }
    const I = p.getIndex()!
    for (let k = 0; k < I.count; k++) idx.push(base + I.getX(k))
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setIndex(idx)
  return g
}

/** A piece: a round stone R across-half, H high, its rim bevelled and a ring cut in its top face. */
export function pieceGeometry(R: number, H: number): THREE.BufferGeometry {
  const pts = [
    [0, 0],
    [R - 0.12, 0],
    [R, 0.12],
    [R, H - 0.18],
    [R - 0.16, H],
    [R * 0.72, H],
    [R * 0.7, H - 0.07],
    [R * 0.6, H - 0.07],
    [R * 0.58, H],
    [0, H],
  ].map(([x, y]) => new THREE.Vector2(x, y))
  const g = new THREE.LatheGeometry(pts, 40)
  g.computeVertexNormals()
  return g
}

export function pieceShape(R: number, H: number): Shape {
  const field = (x: number, y: number, z: number) => {
    const dr = Math.hypot(x, z) - R
    const dy = Math.abs(y - H / 2) - H / 2
    return Math.min(Math.max(dr, dy), 0) + Math.hypot(Math.max(dr, 0), Math.max(dy, 0))
  }
  return { field, hx: R + 1, hy: H / 2 + 1, hz: R + 1, cy: H / 2 }
}

/** Where the pieces stand: [square i, square j, dark?] — mid-game, a few each side. */
export function layout(): Array<{ i: number; j: number; dark: boolean }> {
  const rand = mulberry32(0xb0a2d)
  const out: Array<{ i: number; j: number; dark: boolean }> = []
  const used = new Set<number>()
  for (const [dark, n, rows] of [[false, 6, [0, 1, 2, 3]], [true, 5, [4, 5, 6, 7]]] as const) {
    for (let k = 0; k < n; ) {
      const j = rows[Math.floor(rand() * rows.length)]
      const i = Math.floor(rand() * N)
      // (On the dark squares only, as the game is played.)
      if ((i + j) % 2 === 0 || used.has(i * N + j)) continue
      used.add(i * N + j)
      out.push({ i, j, dark })
      k++
    }
  }
  return out
}
