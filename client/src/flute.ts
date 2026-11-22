// The Flute ("things should generally be huge"): on the Shore, east of the camp, a giant's bone flute
// washed up and half sunk in the sand — forty-six metres of old bone, a knuckle flared at its foot, six
// finger holes along its top and the window near its head. You walk in at the foot, on sand, down a
// tunnel lit by six shafts of daylight falling through the holes, to the block that closes its head.
// When the wind is up it sounds, now and then: one low note, breathed across the beach.
//
// One field for everything: collision (rocks.addBuilt) and the drawn mesh — surface nets of the same
// field, so the holes and the window come out clean (no cutting a lathe's triangles), drawn by addBuilt
// in the rock material's bone like the Fallen's ribs.

import * as THREE from 'three'
import { surfaceNets, type Shape } from './rock-fields'

/** Its length; its bore's wall; the shaft's radius (it swells at the foot's knuckle). */
// (Sized against its neighbours: at 46 m it read as a stick on the beach beside the colossus, 110 m off.)
const K = 1.45
const L = 46 * K
const HALF = L / 2
const WALL = 0.6 * K
const R0 = 2.9 * K
/** Rolled a little about its own axis as it came to rest: the holes face up and toward the sea. */
const ROLL = 0.22
/** Its axis above the sand it lies in: sunk to over a third of its height, a sand floor inside. */
export const FLUTE_RISE = R0 * 0.45
export const FLUTE_HALF_LEN = HALF
export const FLUTE_HALF = R0 + 0.9 * K
/** The finger holes (x along the axis, foot at +x) and their radii; the window near the head. */
const HOLES: Array<[number, number]> = ([[-3.2, 0.82], [0.9, 0.86], [5.0, 0.9], [9.6, 0.88], [13.7, 0.92], [17.6, 0.86]] as Array<[number, number]>).map(([x, r]) => [x * K, r * K])
const WIN_X = -HALF + 5.6 * K
/** The block plugging the head (its inner end), and the windway's slit over it. */
const BLOCK = 2.6 * K

function radius(x: number): number {
  // A shaft a little waisted; the head's end swollen a touch; the foot a knuckle of bone, flared.
  const t = (x + HALF) / L
  return R0 + K * (-0.22 * Math.sin(Math.PI * t) + 0.35 * (1 - THREE.MathUtils.smoothstep(x, -HALF, -HALF + 4 * K)) + 0.95 * THREE.MathUtils.smoothstep(x, HALF - 6 * K, HALF - 0.4 * K))
}

/** Grooves cut round it in bands (a maker's rings), metres deep at x. */
function groove(x: number): number {
  let g = 0
  for (const b of [-HALF + 1.2 * K, -HALF + 1.8 * K, -HALF + 8.4 * K, HALF - 7.4 * K, HALF - 6.8 * K]) g = Math.max(g, 1 - Math.min(1, Math.abs(x - b) / (0.16 * K)))
  return g * 0.1 * K
}

const box = (x: number, y: number, z: number, bx: number, by: number, bz: number) => {
  const qx = Math.abs(x) - bx
  const qy = Math.abs(y) - by
  const qz = Math.abs(z) - bz
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0)
}

/** The field in the flute's own frame: axis along x, the holes at +y. */
function own(x: number, y: number, z: number): number {
  const rho = Math.hypot(y, z)
  const r = radius(x) - groove(x)
  const ri = radius(x) - WALL
  let d = Math.max(rho - r, ri - rho)
  d = Math.max(d, Math.abs(x) - HALF)
  // The block in the head, the windway a slit over it.
  let block = Math.max(rho - ri - 0.05, Math.abs(x + HALF - BLOCK / 2) - BLOCK / 2)
  block = Math.max(block, -box(x + HALF - BLOCK / 2, y - ri + 0.32 * K, z, BLOCK, 0.26 * K, 0.85 * K))
  d = Math.min(d, block)
  // The finger holes, through the top wall only.
  for (const [hx, hr] of HOLES) d = Math.max(d, -Math.max(Math.hypot(x - hx, z) - hr, -y))
  // The window: a square mouth in the top just past the block, its far edge (the labium) bevelled.
  const win = Math.max(box(x - WIN_X, y - ri, z, 1.25 * K, WALL + 0.8, 0.95 * K), -y)
  const bevel = x - WIN_X - 1.25 * K + (radius(x) - y) * 1.1
  d = Math.max(d, -Math.min(win, Math.max(bevel, box(x - WIN_X - 1.6 * K, y - ri, z, 0.6 * K, WALL + 0.8, 0.95 * K), -y)))
  return d
}

/** Lying (local, y up from its axis): rolled about its axis, and cut flat under the sand. */
function lying(x: number, y: number, z: number): number {
  const c = Math.cos(ROLL)
  const s = Math.sin(ROLL)
  // Undo the roll: the flute's frame is the lying one turned by ROLL about x.
  const yy = c * y + s * z
  const zz = -s * y + c * z
  return Math.max(own(x, yy, zz), -(y + FLUTE_RISE + 0.7))
}

/** Signed distance (local, lying; negative inside) for rocks.addBuilt. */
export function fluteShape(): Shape {
  return { field: lying, hx: HALF + 1.2, hy: FLUTE_HALF + 0.5, hz: FLUTE_HALF + 0.5, cy: 0 }
}

/** The drawn flute (through rocks.addBuilt, in its bone): surface nets of the field, normals from its
 *  gradient, and a tint per vertex (`tint` — set it back after addBuilt, which overwrites `color`). */
export function fluteGeometry(): THREE.BufferGeometry {
  const s = 0.36
  const hx = HALF + 1.2
  const hr = FLUTE_HALF + 0.5
  const y0 = -FLUTE_RISE - 1.0
  const { pos, index } = surfaceNets(lying, -hx, y0, -hr, Math.ceil((2 * hx) / s) + 2, Math.ceil((hr - y0) / s) + 2, Math.ceil((2 * hr) / s) + 2, s)
  const n = pos.length / 3
  const normal = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  const e = s * 0.25
  const c = Math.cos(ROLL)
  const sn = Math.sin(ROLL)
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3]
    const y = pos[i * 3 + 1]
    const z = pos[i * 3 + 2]
    const gx = lying(x + e, y, z) - lying(x - e, y, z)
    const gy = lying(x, y + e, z) - lying(x, y - e, z)
    const gz = lying(x, y, z + e) - lying(x, y, z - e)
    const gl = Math.hypot(gx, gy, gz) || 1
    normal.set([gx / gl, gy / gl, gz / gl], i * 3)
    // A tint over the rock material's bone (rocks.addBuilt): the bore's inside shadowed (no sky gets in
    // but by the holes), the grooves dark, the ends a little yellowed.
    const yy = c * y + sn * z
    const zz = -sn * y + c * z
    const rho = Math.hypot(yy, zz)
    const inside = THREE.MathUtils.smoothstep(rho, radius(x) - WALL * 0.2, radius(x) - WALL * 0.8)
    const ends = Math.max(1 - THREE.MathUtils.smoothstep(x, -HALF, -HALF + 9 * K), THREE.MathUtils.smoothstep(x, HALF - 9 * K, HALF))
    const k = (1 - 0.5 * inside) * (1 - 0.5 * Math.min(1, groove(x) / (0.1 * K)))
    col.set([k * (1 + 0.04 * ends), k * (1 - 0.02 * ends), k * (1 - 0.12 * ends)], i * 3)
  }
  // Each triangle wound to face along its corners' normals (as meshShape).
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t] * 3
    const bb = index[t + 1] * 3
    const cc = index[t + 2] * 3
    const ux = pos[bb] - pos[a]
    const uy = pos[bb + 1] - pos[a + 1]
    const uz = pos[bb + 2] - pos[a + 2]
    const vx = pos[cc] - pos[a]
    const vy = pos[cc + 1] - pos[a + 1]
    const vz = pos[cc + 2] - pos[a + 2]
    const fx = uy * vz - uz * vy
    const fy = uz * vx - ux * vz
    const fz = ux * vy - uy * vx
    if (fx * (normal[a] + normal[bb] + normal[cc]) + fy * (normal[a + 1] + normal[bb + 1] + normal[cc + 1]) + fz * (normal[a + 2] + normal[bb + 2] + normal[cc + 2]) < 0) {
      const k = index[t + 1]
      index[t + 1] = index[t + 2]
      index[t + 2] = k
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.userData.tint = col
  geo.setIndex(index)
  return geo
}

/** Where, inside, the block's face is (local, lying): the find lies on the sand before it. */
export function fluteBlockFloor(): THREE.Vector3 {
  return new THREE.Vector3(-HALF + BLOCK + 2.2, -FLUTE_RISE, -0.8)
}

/** Where it lies, for the shaders (x, y, z: its axis's middle; w: its turn): set when it is placed. */
export const fluteO = { x: 0, y: -1e5, z: 0, w: 0 }

const g = (v: number) => v.toFixed(3)
/**
 * Dark inside (atmosphere.ts patches it into every lit material, the sand floor included): the bore
 * lit only toward its open foot and under the finger holes and the window, and your lantern's pool.
 * (Lit as the outside, the inside of the tube was as bright as the beach — first look, 2026-11-22.)
 */
export function fluteDarkGlsl(u: string): string {
  return /* glsl */ `
  vec3 tp = vFogWorld - ${u}.xyz;
  if (abs(tp.x) + abs(tp.z) < ${g(HALF * 1.5 + 8)} && abs(tp.y) < ${g(R0 * 2 + 4)}) {
    float tc = cos(${u}.w);
    float ts = sin(${u}.w);
    float lx = tp.x * tc - tp.z * ts;
    float lz = tp.x * ts + tp.z * tc;
    float yy = ${g(Math.cos(ROLL))} * tp.y + ${g(Math.sin(ROLL))} * lz;
    float zz = -${g(Math.sin(ROLL))} * tp.y + ${g(Math.cos(ROLL))} * lz;
    float rho = length(vec2(yy, zz));
    float tt = (lx + ${g(HALF)}) / ${g(L)};
    float rr = ${g(R0)} + ${g(K)} * (-0.22 * sin(3.14159 * tt) + 0.35 * (1.0 - smoothstep(${g(-HALF)}, ${g(-HALF + 4 * K)}, lx)) + 0.95 * smoothstep(${g(HALF - 6 * K)}, ${g(HALF - 0.4 * K)}, lx));
    float ri = rr - ${g(WALL)};
    float tin = (1.0 - smoothstep(ri + ${g(WALL * 0.3)}, ri + ${g(WALL * 0.85)}, rho)) * (1.0 - smoothstep(${g(HALF - 2.5)}, ${g(HALF + 0.5)}, lx)) * step(${g(-HALF - 0.5)}, lx);
    if (tin > 0.0) {
      float lit = (1.0 - smoothstep(0.0, ${g(6 * K)}, ${g(HALF)} - lx)) * 0.9;
      ${HOLES.map(([hx, hr]) => `lit = max(lit, (1.0 - smoothstep(${g(hr * 0.8)}, ${g(hr * 1.5)}, length(vec2(lx - ${g(hx)}, zz)))) * 0.85);`).join('\n      ')}
      lit = max(lit, (1.0 - smoothstep(${g(1.0 * K)}, ${g(1.9 * K)}, length(vec2(lx - ${g(WIN_X)}, zz)))) * 0.85);
      float lamp = 1.0 - smoothstep(3.0, 14.0, distance(vFogWorld, cameraPosition));
      vec3 dim = vec3(0.12 + 0.85 * lit) + vec3(1.0, 0.78, 0.5) * lamp * 0.45;
      gl_FragColor.rgb *= mix(vec3(1.0), dim, tin);
    }
  }`
}
