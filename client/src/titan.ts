// The Titan: a mossy stone giant built from noise-displaced boulders, posed
// every frame from the shared gait planner. Legs use analytic two-bone IK so
// each foot sits exactly where the planner put it — which is where the
// footprint is carved.
//
// Segments are posed directly in world space between joint positions (no
// skeleton): each segment mesh is modelled hanging down -Y from its top joint
// at its true length, then placed with a basis built from the joint pair and
// the body's forward vector.

import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { makeSimplex2, titanBody, TitanGait, type Footfall, type GaitInput, type Terrain, type TitanBody } from '@titans/shared'

type V3 = THREE.Vector3

interface Lump {
  at: number // 0..1 along the segment
  r: [number, number, number] // radii as fractions of height
  off?: [number, number] // x, z offset as fractions of height
}

// Segment shapes, all as fractions of Titan height. Hunched, heavy, long-armed:
// the reel's silhouette.
const SHAPES: Record<string, { len: number; lumps: Lump[] }> = {
  torso: {
    len: 0.3,
    lumps: [
      { at: 0.12, r: [0.17, 0.12, 0.13], off: [0, 0.02] },
      { at: 0.4, r: [0.14, 0.12, 0.12], off: [0, 0.01] },
      { at: 0.72, r: [0.12, 0.1, 0.11] },
      { at: 0.95, r: [0.115, 0.08, 0.105], off: [0, -0.005] },
    ],
  },
  head: { len: 0.075, lumps: [{ at: 0.1, r: [0.06, 0.065, 0.065], off: [0, 0.01] }, { at: 0.55, r: [0.045, 0.035, 0.05] }] },
  upperArm: {
    len: 0.24,
    lumps: [
      { at: 0.05, r: [0.085, 0.08, 0.085] },
      { at: 0.45, r: [0.06, 0.1, 0.062] },
      { at: 0.88, r: [0.052, 0.06, 0.055] },
    ],
  },
  forearm: {
    len: 0.22,
    lumps: [
      { at: 0.2, r: [0.065, 0.085, 0.066] },
      { at: 0.65, r: [0.052, 0.075, 0.054] },
    ],
  },
  hand: { len: 0.07, lumps: [{ at: 0.45, r: [0.065, 0.06, 0.06] }] },
  thigh: {
    len: 0.225,
    lumps: [
      { at: 0.15, r: [0.08, 0.075, 0.082] },
      { at: 0.55, r: [0.07, 0.09, 0.072] },
      { at: 0.92, r: [0.058, 0.05, 0.06] },
    ],
  },
  shin: {
    len: 0.215,
    lumps: [
      { at: 0.2, r: [0.066, 0.075, 0.07] },
      { at: 0.65, r: [0.058, 0.08, 0.06] },
    ],
  },
  foot: { len: 0.04, lumps: [{ at: 0.6, r: [0.06, 0.035, 0.095], off: [0, 0.025] }, { at: 0.75, r: [0.045, 0.03, 0.05], off: [0, 0.075] }] },
}

const STONE = new THREE.Color(0x8b857a)
const STONE_DARK = new THREE.Color(0x605a52)
const MOSS = new THREE.Color(0x5e6b3a)

function boulder(rx: number, ry: number, rz: number, seed: number, detail: number): THREE.BufferGeometry {
  const n1 = makeSimplex2(seed)
  const n2 = makeSimplex2(seed + 7)
  const noise3 = (x: number, y: number, z: number) => (n1(x, y) + n1(y + 3.1, z) + n2(z - 1.7, x)) / 3
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail)
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  g = mergeVertices(g)
  const p = g.getAttribute('position')
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const big = noise3(v.x * 1.3, v.y * 1.3, v.z * 1.3)
    const small = noise3(v.x * 3.7 + 9, v.y * 3.7, v.z * 3.7)
    // Flattened facets: quantise the big noise a little for a chiselled look.
    const k = 1 + 0.2 * big + 0.07 * small
    p.setXYZ(i, v.x * rx * k, v.y * ry * k, v.z * rz * k)
  }
  g.computeVertexNormals()
  const nrm = g.getAttribute('normal')
  const colors = new Float32Array(p.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const s = 0.5 + 0.5 * noise3(v.x * 0.15 + 4, v.y * 0.15, v.z * 0.15)
    c.copy(STONE).lerp(STONE_DARK, s * 0.7)
    const up = nrm.getY(i)
    const moss = THREE.MathUtils.smoothstep(up + 0.25 * noise3(v.x * 0.2, v.y * 0.2, v.z * 0.2), 0.45, 0.8)
    c.lerp(MOSS, moss * 0.85)
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
}

function segmentGeometry(name: string, H: number, seed: number): THREE.BufferGeometry {
  const shape = SHAPES[name]
  const parts = shape.lumps.map((l, i) => {
    const g = boulder(l.r[0] * H, l.r[1] * H, l.r[2] * H, seed + i * 31, 4)
    g.translate((l.off?.[0] ?? 0) * H, -l.at * shape.len * H, (l.off?.[1] ?? 0) * H)
    return g
  })
  const merged = mergeGeometries(parts)!
  for (const p of parts) p.dispose()
  return merged
}

const _x = new THREE.Vector3()
const _y = new THREE.Vector3()
const _z = new THREE.Vector3()
const _m = new THREE.Matrix4()

/** Place a segment mesh at joint A, hanging toward B, facing `fwd`. */
function place(mesh: THREE.Object3D, a: V3, b: V3, fwd: V3): void {
  _y.subVectors(a, b).normalize()
  _z.copy(fwd).addScaledVector(_y, -fwd.dot(_y))
  if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1)
  _z.normalize()
  _x.crossVectors(_y, _z)
  _m.makeBasis(_x, _y, _z)
  mesh.quaternion.setFromRotationMatrix(_m)
  mesh.position.copy(a)
}

/** Two-bone IK: knee/elbow position given root, target, lengths, bend hint. */
function solveTwoBone(root: V3, target: V3, l1: number, l2: number, bend: V3, out: V3): void {
  const d = _x.subVectors(target, root)
  let dist = d.length()
  const max = (l1 + l2) * 0.999
  if (dist > max) {
    target.copy(root).addScaledVector(d.normalize(), max)
    dist = max
    d.subVectors(target, root)
  }
  dist = Math.max(dist, Math.abs(l1 - l2) + 1e-3)
  const dir = d.normalize()
  const along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along))
  _y.copy(bend).addScaledVector(dir, -bend.dot(dir)).normalize()
  out.copy(root).addScaledVector(dir, along).addScaledVector(_y, h)
}

export class Titan {
  readonly group = new THREE.Group()
  readonly body: TitanBody
  readonly gait: TitanGait
  readonly H: number
  readonly pelvis = new THREE.Vector3()
  readonly chest = new THREE.Vector3()
  readonly head = new THREE.Vector3()
  private readonly meshes: Record<string, THREE.Mesh> = {}
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 })
  private readonly j = {
    hip: [new THREE.Vector3(), new THREE.Vector3()],
    knee: [new THREE.Vector3(), new THREE.Vector3()],
    ankle: [new THREE.Vector3(), new THREE.Vector3()],
    shoulder: [new THREE.Vector3(), new THREE.Vector3()],
    elbow: [new THREE.Vector3(), new THREE.Vector3()],
    hand: [new THREE.Vector3(), new THREE.Vector3()],
  }
  private readonly fwd = new THREE.Vector3()
  private readonly left = new THREE.Vector3()
  private readonly foot = { x: 0, z: 0, lift: 0 }
  private readonly tmp = new THREE.Vector3()
  private readonly tmp2 = new THREE.Vector3()
  private breath = 0

  constructor(height: number, x: number, z: number, heading: number, seed = 7) {
    this.H = height
    this.body = titanBody(height)
    this.gait = new TitanGait(this.body, x, z, heading)
    const add = (key: string, shape: string, s: number) => {
      const m = new THREE.Mesh(segmentGeometry(shape, height, seed + s), this.material)
      m.castShadow = true
      m.receiveShadow = true
      this.meshes[key] = m
      this.group.add(m)
    }
    add('torso', 'torso', 1)
    add('head', 'head', 2)
    for (const s of ['L', 'R']) {
      const o = s === 'L' ? 0 : 100
      add('upperArm' + s, 'upperArm', 10 + o)
      add('forearm' + s, 'forearm', 20 + o)
      add('hand' + s, 'hand', 30 + o)
      add('thigh' + s, 'thigh', 40 + o)
      add('shin' + s, 'shin', 50 + o)
      add('foot' + s, 'foot', 60 + o)
    }
    this.group.name = 'titan'
  }

  step(dt: number, input: GaitInput): Footfall | null {
    this.breath += dt
    return this.gait.step(dt, input)
  }

  /** Solve the pose for the current gait state. */
  pose(terrain: Terrain): void {
    const g = this.gait
    const b = this.body
    const H = this.H
    const J = this.j
    this.fwd.set(Math.sin(g.heading), 0, Math.cos(g.heading))
    this.left.set(this.fwd.z, 0, -this.fwd.x)

    // Feet: planner positions on the ground (+ swing arc).
    const ankleUp = 0.035 * H
    let groundSum = 0
    for (const f of [0, 1] as const) {
      g.footPos(f, this.foot)
      const gy = terrain.heightAt(this.foot.x, this.foot.z)
      groundSum += gy
      J.ankle[f].set(this.foot.x, gy + ankleUp + this.foot.lift, this.foot.z)
    }

    // Pelvis: over the body point, swaying toward the stance foot, bobbing
    // with the step, and low enough that both legs can reach their feet.
    const stance = g.isSwinging ? (g.swingFoot === 0 ? 1 : 0) : -1
    const swayAmt = stance < 0 ? 0 : (stance === 0 ? 1 : -1) * 0.022 * H * Math.sin(Math.PI * g.phase)
    const bob = g.isSwinging ? 0.012 * H * Math.sin(Math.PI * g.phase) : 0
    const groundBody = Math.max(groundSum / 2, terrain.heightAt(g.x, g.z) - 0.05 * H)
    this.pelvis.set(g.x, groundBody + b.hipHeight * 0.985 + bob, g.z).addScaledVector(this.left, swayAmt)
    const reach = (b.thigh + b.shin) * 0.985
    for (const f of [0, 1] as const) {
      J.hip[f].copy(this.pelvis).addScaledVector(this.left, f === 0 ? b.hipHalf : -b.hipHalf)
      const dx = J.hip[f].x - J.ankle[f].x
      const dz = J.hip[f].z - J.ankle[f].z
      const flat = dx * dx + dz * dz
      const maxY = J.ankle[f].y + Math.sqrt(Math.max(0, reach * reach - flat))
      if (J.hip[f].y > maxY) this.pelvis.y -= J.hip[f].y - maxY
    }
    for (const f of [0, 1] as const) J.hip[f].copy(this.pelvis).addScaledVector(this.left, f === 0 ? b.hipHalf : -b.hipHalf)

    // Legs.
    for (const f of [0, 1] as const) {
      this.tmp.copy(this.fwd).multiplyScalar(1).addScaledVector(this.left, 0) // knees bend forward
      solveTwoBone(J.hip[f], J.ankle[f], b.thigh, b.shin, this.tmp, J.knee[f])
    }

    // Upper body: hunched forward, counter-rotating gently with the stride.
    const breathe = Math.sin(this.breath * 0.9) * 0.004 * H
    this.chest
      .copy(this.pelvis)
      .addScaledVector(this.fwd, 0.075 * H)
      .addScaledVector(this.left, -swayAmt * 0.6)
    this.chest.y += SHAPES.torso.len * H * 0.97 + breathe
    this.head.copy(this.chest).addScaledVector(this.fwd, 0.065 * H)
    this.head.y += 0.035 * H

    // Arms swing opposite to the legs, by each foot's lead.
    for (const f of [0, 1] as const) {
      const side = f === 0 ? 1 : -1
      J.shoulder[f].copy(this.chest).addScaledVector(this.left, side * 0.165 * H)
      J.shoulder[f].y -= 0.035 * H
      const other = f === 0 ? 1 : 0
      g.footPos(other, this.foot)
      const lead = ((this.foot.x - g.x) * this.fwd.x + (this.foot.z - g.z) * this.fwd.z) / b.stepLen
      const swing = THREE.MathUtils.clamp(lead, -1, 1) * 0.42
      this.tmp.set(0, -Math.cos(swing), 0).addScaledVector(this.fwd, Math.sin(swing)).addScaledVector(this.left, side * 0.2).normalize()
      J.elbow[f].copy(J.shoulder[f]).addScaledVector(this.tmp, SHAPES.upperArm.len * H)
      const fore = swing + 0.38
      this.tmp2.set(0, -Math.cos(fore), 0).addScaledVector(this.fwd, Math.sin(fore)).addScaledVector(this.left, side * 0.08).normalize()
      J.hand[f].copy(J.elbow[f]).addScaledVector(this.tmp2, SHAPES.forearm.len * H)
    }

    // Place meshes.
    const M = this.meshes
    place(M.torso, this.chest, this.pelvis, this.fwd)
    this.tmp.copy(this.head)
    this.tmp.y += SHAPES.head.len * H * 0.6
    place(M.head, this.tmp, this.chest, this.fwd)
    for (const f of [0, 1] as const) {
      const s = f === 0 ? 'L' : 'R'
      place(M['upperArm' + s], J.shoulder[f], J.elbow[f], this.fwd)
      place(M['forearm' + s], J.elbow[f], J.hand[f], this.fwd)
      this.tmp.copy(J.hand[f]).addScaledVector(this.tmp2.set(0, -1, 0), 1)
      place(M['hand' + s], J.hand[f], this.tmp, this.fwd)
      place(M['thigh' + s], J.hip[f], J.knee[f], this.fwd)
      place(M['shin' + s], J.knee[f], J.ankle[f], this.fwd)
      this.tmp.copy(J.ankle[f])
      this.tmp.y -= 1
      place(M['foot' + s], J.ankle[f], this.tmp, this.fwd)
    }
  }

  /** World position of a foot's ankle (for effects and tools). */
  ankle(foot: 0 | 1): THREE.Vector3 {
    return this.j.ankle[foot]
  }
}
