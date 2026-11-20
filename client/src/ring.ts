// The Ring (the user: "things should generally be huge"): in the Dune Sea, a giant's ring, lost — a
// band of tarnished bronze thirty metres across standing on its edge in the sand, half sunk, leaning a
// little. You walk under it; you can climb its band. On top, the setting: four prongs round an empty
// seat. The stone is gone. In the seat, one chip of it.
//
// Its own model: a torus drawn out into a wide flat band (a ring, not a hoop), a raised rim along both
// edges of its outer face and, between them, a worn chevron band cut a hand deep; verdigris in the
// cuts and on the faces the sun never reaches, the top scoured pale by blown sand. A matching field
// for rocks.addBuilt (standing, climbing, grappling): the band and the setting's cup.

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Shape } from './rock-fields'

/** Centre of the band's circle to the middle of the band (m). */
export const RING_R = 15
/** The band's half-thickness (radial) and half-width (along the axis). */
// (A ring's proportions, not a hoop's: a band an eighth of the ring across in thickness, wider than
// that along it — at 2.2 m by 6 the first one read as a thin arch.)
const TUBE = 1.7
const HALF_W = 4
/** It has settled leaning a little (radians, round its own axis's normal). */
const LEAN = 0.07
/** The setting on top: its cup's radius, height, and how deep the empty seat is. */
// (Sized as a setting is to its ring: at 2.3 m its prongs read as two horns on an arch.)
const CUP_R = 3.4
const CUP_H = 2.6
const SEAT = 1.3
/** The cup's base: down into the band's top a little. */
const CUP_Y = RING_R + TUBE * 0.6

/** Where the ring's centre sits above the sand under it: under half of it buried. */
export function ringRise(): number {
  return RING_R * 0.1
}

/** The seat's floor, local (before the lean): where the chip lies. */
export function ringSeat(): THREE.Vector3 {
  return new THREE.Vector3(0, CUP_Y + CUP_H - SEAT + 0.05, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), LEAN)
}

// Linear colours (vertex colours are linear: sRGB-looking values come out pastel).
const BRONZE = new THREE.Color(0.3, 0.17, 0.06)
const SCOURED = new THREE.Color(0.5, 0.33, 0.14)
const VERDIGRIS = new THREE.Color(0.07, 0.2, 0.15)

/** The band: a torus in the XY plane (axis Z), drawn out along Z into a flat band, with its relief. */
function bandGeometry(): THREE.BufferGeometry {
  // (Fine enough across the band for its relief: at 28 round the tube the chevrons fell between vertices.)
  const g = new THREE.TorusGeometry(RING_R, TUBE, 64, 300)
  g.deleteAttribute('uv')
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const col = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const ang = Math.atan2(v.y, v.x) // round the ring
    const rr = Math.hypot(v.x, v.y)
    // Where on the tube's cross-section: t radial (-1 inner … 1 outer), s along the axis (-1 … 1).
    const t = (rr - RING_R) / TUBE
    const s = v.z / TUBE
    // Drawn out into a band: wide along the axis, the faces flattened.
    const z = s * HALF_W
    let out = 0
    // The outer face: a raised rim along each edge, a chevron band cut between them.
    if (t > 0.35) {
      const k = (t - 0.35) / 0.65
      const edge = Math.abs(s)
      const rim = THREE.MathUtils.smoothstep(edge, 0.62, 0.74) * (1 - THREE.MathUtils.smoothstep(edge, 0.86, 0.97))
      // Chevrons: a zigzag running round the band, between the rims.
      const u = ang * RING_R * 0.45
      const zig = Math.abs(((u + Math.abs(s) * 1.6) % 2 + 2) % 2 - 1)
      const cut = (1 - THREE.MathUtils.smoothstep(edge, 0.45, 0.55)) * THREE.MathUtils.smoothstep(zig, 0.22, 0.06)
      out = k * (0.3 * rim - 0.24 * cut)
    }
    const nr = rr + out
    pos.setXYZ(i, Math.cos(ang) * nr, Math.sin(ang) * nr, z)
    // Colour: bronze; scoured pale where it faces up into the wind and sand; verdigris in the cuts,
    // on the inner face and low down.
    const up = Math.sin(ang) * t // outer top faces up
    c.copy(BRONZE).lerp(SCOURED, THREE.MathUtils.clamp(up * 1.4, 0, 0.8))
    const green = THREE.MathUtils.clamp((out < -0.05 ? 0.7 : 0) + (t < -0.3 ? 0.45 : 0) + (Math.sin(ang) < -0.2 ? 0.35 : 0) + 0.2 * Math.sin(ang * 7 + s * 3), 0, 0.85)
    c.lerp(VERDIGRIS, green)
    col.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.computeVertexNormals()
  return g
}

/** The setting: a round cup on the band's top, an empty seat in it, four prongs leaning in. */
function settingGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const tint = (g: THREE.BufferGeometry, c: THREE.Color) => {
    const n = g.getAttribute('position').count
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3)
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.deleteAttribute('uv')
    return g.index ? g.toNonIndexed() : g
  }
  const dark = BRONZE.clone().multiplyScalar(0.8)
  // The cup's outer wall, its rim, the inner wall down to the seat, the seat.
  parts.push(tint(new THREE.CylinderGeometry(CUP_R, CUP_R * 0.82, CUP_H, 40, 1, true).translate(0, CUP_Y + CUP_H / 2, 0), BRONZE.clone().lerp(SCOURED, 0.35)))
  parts.push(tint(new THREE.RingGeometry(CUP_R - 0.55, CUP_R, 40).rotateX(-Math.PI / 2).translate(0, CUP_Y + CUP_H, 0), SCOURED))
  parts.push(tint(new THREE.CylinderGeometry(CUP_R - 0.55, CUP_R - 0.7, SEAT, 40, 1, true).scale(-1, 1, 1).translate(0, CUP_Y + CUP_H - SEAT / 2, 0), dark.clone().lerp(VERDIGRIS, 0.4)))
  parts.push(tint(new THREE.CircleGeometry(CUP_R - 0.7, 40).rotateX(-Math.PI / 2).translate(0, CUP_Y + CUP_H - SEAT, 0), VERDIGRIS.clone().multiplyScalar(0.7)))
  // The prongs: tapered claws from the rim, bending in over the empty seat.
  for (let k = 0; k < 4; k++) {
    const a = k * (Math.PI / 2) + Math.PI / 4
    const prong = new THREE.CylinderGeometry(0.2, 0.6, 3.8, 14).translate(0, 1.9, 0).rotateX(-0.5)
    prong.rotateY(-a + Math.PI / 2).translate(Math.cos(a) * (CUP_R - 0.25), CUP_Y + CUP_H - 0.1, Math.sin(a) * (CUP_R - 0.25))
    parts.push(tint(prong, BRONZE.clone().lerp(SCOURED, 0.5)))
  }
  const g = mergeGeometries(parts)!
  g.computeVertexNormals()
  return g
}

/** The ring as drawn, local (centre at the origin, its axis along Z, leaning). */
export function ringGeometry(): THREE.BufferGeometry {
  const band = bandGeometry().toNonIndexed()
  const g = mergeGeometries([band, settingGeometry()])!
  g.rotateZ(LEAN)
  return g
}

/** Signed distance (local, negative inside): the band (an ellipse-section torus) and the cup. */
export function ringShape(): Shape {
  const p = new THREE.Vector3()
  const axis = new THREE.Vector3(0, 0, 1)
  const field = (x: number, y: number, z: number): number => {
    p.set(x, y, z).applyAxisAngle(axis, -LEAN)
    // The band: its cross-section an ellipse TUBE (radial) by HALF_W (along the axis).
    const qx = Math.hypot(p.x, p.y) - RING_R
    const qz = p.z
    const k = Math.hypot(qx / TUBE, qz / HALF_W)
    const band = (k - 1) * Math.min(TUBE, HALF_W)
    // The cup: a capped cylinder with the seat hollowed from the top.
    const cy = CUP_Y + CUP_H / 2
    const dr = Math.hypot(p.x, p.z)
    const outer = Math.max(dr - CUP_R, Math.abs(p.y - cy) - CUP_H / 2)
    const seat = Math.max(dr - (CUP_R - 0.6), (CUP_Y + CUP_H - SEAT) - p.y)
    const cup = Math.max(outer, -seat)
    return Math.min(band, cup)
  }
  return { field, hx: RING_R + TUBE + 1, hy: RING_R + TUBE + CUP_H + 3, hz: HALF_W + 1, cy: 0 }
}

/** A stand-in for rocks.addBuilt (its own mesh is hidden; the ring is drawn by ringMesh). */
export function ringStandIn(): THREE.BufferGeometry {
  return new THREE.TorusGeometry(RING_R, TUBE, 6, 40).scale(1, 1, HALF_W / TUBE).rotateZ(LEAN)
}

/** The ring as drawn: tarnished bronze, its own vertex colours. (Dull: polished, it mirrored the sky and sand like chrome.) */
export function ringMesh(): THREE.Mesh {
  const m = new THREE.Mesh(ringGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.58, envMapIntensity: 0.8 }))
  m.castShadow = true
  m.receiveShadow = true
  return m
}
