// The Lantern (the user: "things should generally be huge"): in the Mire, a giant's lantern lying on its
// side on a dry rise between the pools — an iron cage twenty-odd metres long, its glass all but gone, two
// clouded panes left in the frame. You walk in between the bars. Inside lies the candle, as long as a
// cart and as thick as you are, burnt down long ago; at night an ember on its wick still glows, faintly,
// as if something had breathed on it. Beside it, a drop of its wax.
//
// Its own model: a hexagonal lantern (base, six bars, a band, the top ring, a pyramid cap, a finial and
// a handle), built upright and laid on one of its flat sides; the iron dark, rust in patches, moss along
// the side on the ground. A matching field for rocks.addBuilt (standing, climbing, grappling).

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Shape } from './rock-fields'

/** Upright: corner radius of the hexagon, the bars' height, the cap's height (metres). */
// (Forty-odd metres long: at 26 it read smaller than the giant mushrooms beside it, a toy by the pool.)
const R = 8.4
const H = 28
const CAP = 7
const BAR = 0.58
const BASE = 1.6
/** The hexagon's corners (upright, in xz): at 30° + 60° k, so a flat side faces down when it lies. */
const CORNERS: Array<[number, number]> = Array.from({ length: 6 }, (_, k) => [R * Math.cos(Math.PI / 6 + (k * Math.PI) / 3), R * Math.sin(Math.PI / 6 + (k * Math.PI) / 3)])
/** Lying: upright (x, y, z) → (y, −x, z): the lantern's axis runs along +x, a flat side down. */
/** And centred along its length: base at −OFF, the handle's top at about +OFF (addBuilt's box is round the origin). */
const OFF = (H + CAP + 6.4 + 4.1) / 2
const lay = (g: THREE.BufferGeometry) => g.applyMatrix4(new THREE.Matrix4().set(0, 1, 0, -OFF, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))
/** Its axis above the ground it lies on: the flat side's distance from the middle, and a bar. */
export const LANTERN_RISE = R * Math.cos(Math.PI / 6) + BAR
/** Its half-length along the ground (centred), and its half-width. */
export const LANTERN_HALF_LEN = OFF
export const LANTERN_HALF = R

// Linear colours.
const IRON = new THREE.Color(0.045, 0.04, 0.036)
const RUST = new THREE.Color(0.2, 0.085, 0.03)
const MOSS = new THREE.Color(0.05, 0.085, 0.035)

function hexPrism(r: number, y0: number, y1: number): THREE.BufferGeometry {
  // (three's six-sided cylinder already has its corners at 30° + 60° k, as CORNERS.)
  return new THREE.CylinderGeometry(r, r, y1 - y0, 6, 1).translate(0, (y0 + y1) / 2, 0)
}
/** A bar between two points (upright frame). */
function bar(a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.BufferGeometry {
  const d = new THREE.Vector3().subVectors(b, a)
  const g = new THREE.CylinderGeometry(r, r, d.length(), 8, 1)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()))
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
}

/** The iron, lying, in its own vertex colours. */
export function lanternIron(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  parts.push(hexPrism(R * 1.06, 0, BASE))
  parts.push(hexPrism(R * 0.9, BASE, BASE + 0.5))
  const c = (k: number, y: number) => new THREE.Vector3(CORNERS[k][0], y, CORNERS[k][1])
  for (let k = 0; k < 6; k++) {
    parts.push(bar(c(k, BASE), c(k, H), BAR))
    // The band halfway up and the top ring.
    for (const y of [H * 0.5, H]) parts.push(bar(c(k, y), c((k + 1) % 6, y), BAR * 0.8))
  }
  // The cap: a hexagonal pyramid, a collar and a finial.
  parts.push(new THREE.ConeGeometry(R * 1.08, CAP, 6, 1, false).translate(0, H + CAP / 2, 0))
  parts.push(new THREE.CylinderGeometry(1.25, 1.7, 2, 12).translate(0, H + CAP + 0.6, 0))
  parts.push(new THREE.SphereGeometry(1.25, 14, 10).translate(0, H + CAP + 2.3, 0))
  // The handle: a ring standing on the finial.
  parts.push(new THREE.TorusGeometry(3.6, 0.45, 8, 32).translate(0, H + CAP + 6.4, 0))
  const g = lay(mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)).map((p) => (p.deleteAttribute('uv'), p)))!)
  g.computeVertexNormals()
  // Colour: iron; rust in patches; moss along the side on the ground (lying: low y).
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const col = new Float32Array(pos.count * 3)
  const k = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const rust = THREE.MathUtils.smoothstep(Math.sin(x * 0.7 + z * 0.4) * Math.sin(y * 0.9 - x * 0.2) + 0.25 * Math.sin(z * 2.3 + y * 1.7), 0.15, 0.7)
    const moss = THREE.MathUtils.smoothstep(-y, R * 0.45, R * 0.85)
    k.copy(IRON).lerp(RUST, rust * 0.85).lerp(MOSS, moss * 0.8)
    col.set([k.r, k.g, k.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

/** Two clouded panes left in the frame (lying): one in a side's lower half, one up near the cap. */
export function lanternGlass(): THREE.BufferGeometry {
  const pane = (k: number, y0: number, y1: number, bite: number) => {
    const a = CORNERS[k]
    const b = CORNERS[(k + 1) % 6]
    const inset = 0.94
    const p = (c: [number, number], y: number) => new THREE.Vector3(c[0] * inset, y, c[1] * inset)
    // A pane with a broken corner: a pentagon, the bite out of its top edge.
    const v = [p(a, y0), p(b, y0), p(b, y1 - bite), new THREE.Vector3().lerpVectors(p(a, y1), p(b, y1), 0.55), p(a, y1)]
    const g = new THREE.BufferGeometry().setFromPoints([v[0], v[1], v[2], v[0], v[2], v[3], v[0], v[3], v[4]])
    return g
  }
  const g = lay(mergeGeometries([pane(1, BASE + 0.8, H * 0.5 - 0.5, 3.9), pane(4, H * 0.5 + 0.5, H - 0.8, 6.3)])!)
  g.computeVertexNormals()
  return g
}

/** Signed distance (local, lying; negative inside). */
export function lanternShape(): Shape {
  const q = new THREE.Vector3()
  const seg = (px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number) => {
    const dx = bx - ax, dy = by - ay, dz = bz - az
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / (dx * dx + dy * dy + dz * dz)))
    return Math.hypot(px - ax - dx * t, py - ay - dy * t, pz - az - dz * t) - r
  }
  const hex = (x: number, z: number) => {
    // Distance to a hexagon of corner radius R in xz (flat sides at 0°, 60° … ; upright frame).
    let d = -Infinity
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3
      d = Math.max(d, x * Math.cos(a) + z * Math.sin(a))
    }
    return d
  }
  const ap = R * Math.cos(Math.PI / 6)
  const field = (x: number, y: number, z: number): number => {
    // Back to the upright frame: lying (X, Y, Z) = (y, −x, z) ⇒ upright x = −Y, y = X.
    q.set(-y, x + OFF, z)
    let d = Math.max(hex(q.x, q.z) - ap * 1.06, Math.abs(q.y - (BASE + 0.25) / 2) - (BASE + 0.25) / 2)
    for (let k = 0; k < 6; k++) {
      const [cx, cz] = CORNERS[k]
      const [nx, nz] = CORNERS[(k + 1) % 6]
      d = Math.min(d, seg(q.x, q.y, q.z, cx, BASE, cz, cx, H, cz, BAR))
      d = Math.min(d, seg(q.x, q.y, q.z, cx, H * 0.5, cz, nx, H * 0.5, nz, BAR * 0.8))
      d = Math.min(d, seg(q.x, q.y, q.z, cx, H, cz, nx, H, nz, BAR * 0.8))
    }
    // The cap: a cone of the hexagon's size narrowing to the collar.
    const t = (q.y - H) / CAP
    if (t > -0.05 && t < 1.05) {
      const rr = ap * 1.06 * (1 - Math.min(1, Math.max(0, t)))
      d = Math.min(d, Math.max(hex(q.x, q.z) - rr, Math.abs(q.y - H - CAP / 2) - CAP / 2))
    }
    d = Math.min(d, seg(q.x, q.y, q.z, 0, H + CAP, 0, 0, H + CAP + 3.4, 0, 1.4))
    return d
  }
  return { field, hx: OFF + 2, hy: R + 2, hz: R + 2, cy: 0 }
}

/** A stand-in for rocks.addBuilt (its rock-textured mesh is hidden; the lantern draws itself). */
export function lanternStandIn(): THREE.BufferGeometry {
  return lay(new THREE.CylinderGeometry(R, R, H + CAP, 6, 1).translate(0, (H + CAP) / 2, 0))
}

/** The candle inside, burnt down, lying along the lantern near its base, and the ember on its wick. */
export function lanternCandle(): { wax: THREE.BufferGeometry; ember: THREE.Vector3 } {
  const len = 7.6
  const r = 2
  const g = new THREE.CylinderGeometry(r, r * 1.04, len, 24, 6)
  // A burnt-down top: melted down on one side, a rim of wax standing on the other.
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    if (y > len / 2 - 0.01) pos.setY(i, y - 0.9 * (0.5 + 0.5 * Math.cos(Math.atan2(z, x))) * (Math.hypot(x, z) / r))
    else if (y > 0) pos.setXYZ(i, x * (1 + 0.04 * Math.sin(y * 3 + x)), y, z * (1 + 0.04 * Math.sin(y * 2.4 + z)))
  }
  g.computeVertexNormals()
  const wick = new THREE.CylinderGeometry(0.12, 0.16, 1.2, 6).translate(0, len / 2 + 0.25, 0)
  const wax = mergeGeometries([g.toNonIndexed(), wick.toNonIndexed()].map((p) => (p.deleteAttribute('uv'), p)))!
  // Lying on its side along the lantern's axis, its base toward the lantern's base, on the ground inside
  // (local: the axis is at y 0, the ground at −LANTERN_RISE), a little off the middle.
  wax.rotateZ(-Math.PI / 2)
  const at = new THREE.Vector3(-OFF + BASE + 3 + len / 2, -LANTERN_RISE + r, 1.8)
  wax.translate(at.x, at.y, at.z)
  return { wax, ember: new THREE.Vector3(at.x + len / 2 + 0.85, at.y, at.z) }
}
