// The Snowshoe ("things should generally be huge"): out on the High Places' snow, a giant's snowshoe,
// lost — its frame a whole young tree bent round and lashed, round at the toe and drawn out to a tail,
// two bars across it, and the net between of rawhide straps gone hard as horn with cold. It stands
// where it was stamped in, tail-first, leaning back against the sky, twenty-odd metres tall; you climb
// its net. (Lying flat it read from the ground as a fallen log — first look, 2026-11-23.)
//
// Built of tubes and straps (its own model), drawn by rocks.addBuilt in the rock material — the frame in
// bark, the straps in hide, snow drifted on what faces up — with a field for standing on it.

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Shape } from './rock-fields'

/** How it stands: leaning back this far from upright (rad), its tail this deep in the snow (m). */
const LEAN = 0.6
const BURY = 3
/** Its length and width (m); the frame's and the bars' radii; the net's height above its base. */
const L = 34
const W = 12
const FRAME = 0.9
const BAR = 0.6
const NET_Y = 0.45
const STRAP = 0.5
const STRAP_T = 0.16
/** The bars across it (fraction of the length from the toe), and the toe hole between the front one and the middle. */
const BARS = [0.3, 0.64]
const HOLE = { u0: 0.31, u1: 0.42, half: 1.6 }

/** Half its width at u (0 the toe, 1 the tail): round at the toe, widest a third along, drawn to a point. */
function halfWidth(u: number): number {
  const c = Math.max(0, Math.min(1, u))
  return (W / 2) * Math.sin(Math.PI * Math.pow(c, 0.62)) * (1 - 0.12 * c)
}
const xAt = (u: number) => -L / 2 + u * L

/** The frame's centreline, round from the tail's tip by one side to the toe and back by the other. */
function framePath(n: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    // t 0 … 0.5 down one side from tail to toe, 0.5 … 1 back up the other.
    const side = t < 0.5 ? 1 : -1
    const u = t < 0.5 ? 1 - t * 2 : (t - 0.5) * 2
    // (The toe's curve kept round by easing u near 0.)
    pts.push(new THREE.Vector3(xAt(u), 0, side * halfWidth(u)))
  }
  return pts
}

/** The straps: two sets of diagonals, clipped to the frame and kept out of the toe hole. */
function straps(): Array<[THREE.Vector3, THREE.Vector3]> {
  const out: Array<[THREE.Vector3, THREE.Vector3]> = []
  const step = 1.7
  for (const dir of [1, -1]) {
    // Lines z = dir · (x − c) at 45°, for c across the length.
    for (let c = -L / 2 - W; c <= L / 2 + W; c += step) {
      // Walk along the line in small steps, cutting it into runs that are inside.
      let run: THREE.Vector3 | null = null
      let last: THREE.Vector3 | null = null
      for (let s = -W; s <= W; s += 0.1) {
        const x = c + s
        const z = dir * s
        const u = (x + L / 2) / L
        const inside = u > 0.015 && u < 0.985 && Math.abs(z) < halfWidth(u) - FRAME * 0.6 && !(u > HOLE.u0 && u < HOLE.u1 && Math.abs(z) < HOLE.half)
        const p = new THREE.Vector3(x, NET_Y - 0.25 * Math.max(0, 1 - Math.abs(z) / (W / 2)), z)
        if (inside && !run) run = p
        if (!inside && run && last) {
          if (run.distanceTo(last) > 0.6) out.push([run, last])
          run = null
        }
        last = p
      }
      if (run && last && run.distanceTo(last) > 0.6) out.push([run, last])
    }
  }
  return out
}

/** The geometry, and which vertices are the net (for their layer). */
export function snowshoeGeometry(): { geo: THREE.BufferGeometry; netFrom: number } {
  const parts: THREE.BufferGeometry[] = []
  // The frame: a tube round the outline, its two ends lashed together at the tail.
  const curve = new THREE.CatmullRomCurve3(framePath(80), false)
  parts.push(new THREE.TubeGeometry(curve, 220, FRAME, 10, false))
  // The lashing at the tail: a thick knot.
  parts.push(new THREE.SphereGeometry(FRAME * 1.6, 12, 8).scale(1.8, 0.9, 1).translate(L / 2 - 0.6, 0, 0))
  // The bars across.
  for (const u of BARS) {
    const w = halfWidth(u)
    parts.push(new THREE.CylinderGeometry(BAR, BAR, w * 2, 10).rotateX(Math.PI / 2).translate(xAt(u), 0.1, 0))
  }
  const frame = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)).map((p) => (p.deleteAttribute('uv'), p)))!
  const netFrom = frame.getAttribute('position').count
  // The net: flat straps, and the binding — a tangle of thongs on the middle where the foot went.
  const net: THREE.BufferGeometry[] = []
  for (const [a, b] of straps()) {
    const d = new THREE.Vector3().subVectors(b, a)
    const g = new THREE.BoxGeometry(d.length(), STRAP_T, STRAP)
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.clone().normalize()))
    net.push(g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2))
  }
  for (let k = 0; k < 5; k++) net.push(new THREE.TorusGeometry(1.3 + k * 0.25, 0.22, 6, 18).rotateX(Math.PI / 2 + (k - 2) * 0.25).rotateY(k * 0.7).translate(xAt(0.46), NET_Y + 0.15, 0))
  const netG = mergeGeometries(net.map((p) => (p.index ? p.toNonIndexed() : p)).map((p) => (p.deleteAttribute('uv'), p)))!
  const geo = mergeGeometries([frame, netG])!
  geo.applyMatrix4(STAND)
  geo.computeVertexNormals()
  return { geo, netFrom }
}

/** Signed distance (local; negative inside) for rocks.addBuilt: the frame, the bars, and the net as a slab. */
export function snowshoeShape(): Shape {
  const seg = (px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number) => {
    const dx = bx - ax, dy = by - ay, dz = bz - az
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / (dx * dx + dy * dy + dz * dz)))
    return Math.hypot(px - ax - dx * t, py - ay - dy * t, pz - az - dz * t) - r
  }
  const path = framePath(60)
  const field = (x: number, y: number, z: number): number => {
    let d = Infinity
    if (Math.abs(x) < L / 2 + FRAME * 2 && Math.abs(z) < W / 2 + FRAME * 2) {
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i]
        const b = path[i + 1]
        d = Math.min(d, seg(x, y, z, a.x, a.y, a.z, b.x, b.y, b.z, FRAME))
      }
    }
    for (const u of BARS) d = Math.min(d, seg(x, y, z, xAt(u), 0.1, -halfWidth(u), xAt(u), 0.1, halfWidth(u), BAR))
    // The net: a thin slab inside the outline (but the toe hole), sagging a little toward the middle.
    const u = (x + L / 2) / L
    if (u > 0.015 && u < 0.985 && Math.abs(z) < halfWidth(u) && !(u > HOLE.u0 && u < HOLE.u1 && Math.abs(z) < HOLE.half)) {
      const ny = NET_Y - 0.25 * Math.max(0, 1 - Math.abs(z) / (W / 2))
      d = Math.min(d, Math.abs(y - ny) - STRAP_T)
    }
    return d
  }
  const q = new THREE.Vector3()
  const standing = (x: number, y: number, z: number) => {
    q.set(x, y, z).applyMatrix4(UNSTAND)
    return field(q.x, q.y, q.z)
  }
  // (From the buried tail to the toe in the sky.)
  const top = L * Math.cos(LEAN) - BURY + FRAME * 2
  const bottom = -BURY - FRAME * 2
  return { field: standing, hx: (L / 2) * Math.sin(LEAN) + FRAME * 3, hy: (top - bottom) / 2, hz: W / 2 + FRAME * 2, cy: (top + bottom) / 2 }
}

/** Lying (toe at −x) → standing on its tail: turned up about z until it leans back LEAN from upright,
 *  the tail's tip BURY under the origin (the snow there). */
const STAND = new THREE.Matrix4().makeTranslation(0, (L / 2) * Math.cos(LEAN) - BURY, 0).multiply(new THREE.Matrix4().makeRotationZ(-(Math.PI / 2 - LEAN)))
const UNSTAND = STAND.clone().invert()
/** Its footprint on the snow (m): what must be level and clear. */
export const SNOWSHOE_FOOT = (L / 2) * Math.sin(LEAN) + FRAME * 2
export const SNOWSHOE_W = W
/** Where the binding is (local, standing): the find lies in its tangle, up the net. */
export const SNOWSHOE_BINDING = new THREE.Vector3(xAt(0.46) + 0.6, NET_Y + 0.6, 0.4).applyMatrix4(STAND)
