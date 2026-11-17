// Giant snail shells (the user: "things should generally be huge"): empty, bleached, lying on their
// sides half-sunk in the valley grass, each the height of a house — whatever lived in them long gone.
// The mouth is wide enough to walk into, and the coil goes on round into the dark.
//
// Their own model: a tube coiling along a logarithmic spiral, growing as it goes (as a shell does),
// with growth ridges across it, a wall of real thickness and an open mouth; and a matching field for
// collision (rocks.addBuilt): solid walls you can climb, a hollow you can stand in.

import * as THREE from 'three'
import type { Shape } from './rock-fields'

/**
 * Turns of the coil (apex to mouth). (Ending three quarters of the way round: the mouth at the bottom of
 * the coil, opening sideways at the grass. At 2.6 it opened 54° down into the turf and you could not
 * walk in.)
 */
const TURNS = 2.75
/** Growth per radian (the shell triples about every turn). */
const B = 0.18
/** The tube's radius as a share of its distance from the coil's axis. */
const TUBE = 0.5
/** The wall's thickness as a share of the tube's radius. */
const WALL = 0.16
/** Along the axis: how far the spire stands out per radian toward the apex (share of R). */
const SPIRE = 0.09
const SAMPLES = 90

/** The coil's centre line and radius at parameter t (0 apex … 1 mouth), for a shell `R` at the mouth. */
export function shellAt(t: number, R: number): { c: THREE.Vector3; r: number; th: number } {
  const thMax = TURNS * Math.PI * 2
  const th = t * thMax
  const rad = R * Math.exp(B * (th - thMax))
  // (Lying on its side: the coil's axis along z, so it rests on the body whorl.)
  const c = new THREE.Vector3(Math.cos(th) * rad, Math.sin(th) * rad, (thMax - th) * SPIRE * rad)
  return { c, r: rad * TUBE, th }
}

/** The shell's geometry (local metres; origin the coil's axis). */
export function shellGeometry(R: number): THREE.BufferGeometry {
  const RING = 22
  const pos: number[] = []
  const idx: number[] = []
  const frames: Array<{ c: THREE.Vector3; n: THREE.Vector3; b: THREE.Vector3; r: number; th: number }> = []
  for (let i = 0; i <= SAMPLES; i++) {
    const t = 0.03 + (i / SAMPLES) * 0.97
    const { c, r, th } = shellAt(t, R)
    const ahead = shellAt(Math.min(1, t + 0.002), R).c
    const behind = shellAt(Math.max(0, t - 0.002), R).c
    const tan = ahead.sub(behind).normalize()
    // The ring's frame: outward from the axis (radial), and across it.
    const radial = new THREE.Vector3(c.x, c.y, 0).normalize()
    const n = radial.sub(tan.clone().multiplyScalar(radial.dot(tan))).normalize()
    const b = new THREE.Vector3().crossVectors(tan, n).normalize()
    frames.push({ c, n, b, r, th })
  }
  // Outer surface, with growth ridges across the coil; inner surface (a thinner, smooth tube).
  const ring = (f: (typeof frames)[0], k: number, inner: boolean) => {
    const a = (k / RING) * Math.PI * 2
    const ridge = inner ? 0 : 0.035 * Math.max(0, Math.sin(f.th * 9)) ** 3 + 0.012 * Math.sin(f.th * 37)
    const rr = f.r * (inner ? 1 - WALL : 1 + ridge)
    return f.c.clone().addScaledVector(f.n, Math.cos(a) * rr).addScaledVector(f.b, Math.sin(a) * rr)
  }
  const base = (layer: number) => layer * frames.length * RING
  for (const inner of [false, true]) {
    for (const f of frames) for (let k = 0; k < RING; k++) {
      const p = ring(f, k, inner)
      pos.push(p.x, p.y, p.z)
    }
    const o = base(inner ? 1 : 0)
    for (let i = 0; i < frames.length - 1; i++)
      for (let k = 0; k < RING; k++) {
        const a = o + i * RING + k
        const b2 = o + i * RING + ((k + 1) % RING)
        const c2 = o + (i + 1) * RING + k
        const d = o + (i + 1) * RING + ((k + 1) % RING)
        // (The inner surface faces in.)
        if (inner) idx.push(a, b2, c2, b2, d, c2)
        else idx.push(a, c2, b2, b2, c2, d)
      }
  }
  // The lip of the mouth: outer ring to inner ring at the last frame.
  const last = frames.length - 1
  for (let k = 0; k < RING; k++) {
    const oa = base(0) + last * RING + k
    const ob = base(0) + last * RING + ((k + 1) % RING)
    const ia = base(1) + last * RING + k
    const ib = base(1) + last * RING + ((k + 1) % RING)
    idx.push(oa, ob, ia, ob, ib, ia)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  const ng = g.toNonIndexed()
  ng.computeVertexNormals()
  return ng
}

/** The shell's field (negative inside the wall): the hollow tube, open at the mouth. */
export function shellShape(R: number): Shape {
  const cs: THREE.Vector3[] = []
  const rs: number[] = []
  for (let i = 0; i <= SAMPLES; i++) {
    const { c, r } = shellAt(0.03 + (i / SAMPLES) * 0.97, R)
    cs.push(c)
    rs.push(r)
  }
  const last = cs.length - 1
  const tanEnd = cs[last].clone().sub(cs[last - 1]).normalize()
  const field = (x: number, y: number, z: number): number => {
    // The nearest stretch of the coil (relative to its size there).
    let bi = 0
    let bk = Infinity
    for (let i = 0; i < cs.length; i++) {
      const d = Math.hypot(x - cs[i].x, y - cs[i].y, z - cs[i].z) / rs[i]
      if (d < bk) {
        bk = d
        bi = i
      }
    }
    const r = rs[bi]
    const d = bk * r
    let wall = Math.abs(d - r * (1 - WALL / 2)) - (r * WALL) / 2
    // Past the mouth: open.
    if (bi === last) wall = Math.max(wall, (x - cs[last].x) * tanEnd.x + (y - cs[last].y) * tanEnd.y + (z - cs[last].z) * tanEnd.z)
    return wall
  }
  const ext = R * (1 + TUBE) + 2
  return { field, hx: ext, hy: ext, hz: R * (TURNS * Math.PI * 2 * SPIRE + TUBE) + 2, cy: 0 }
}
