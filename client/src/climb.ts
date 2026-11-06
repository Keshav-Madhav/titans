// Climbing a Titan. A climber holds a point on one boulder ("lump") of one
// body part, stored in that part's LOCAL frame, so the Titan carries them as
// it walks: every frame the hold is re-read through the part's current
// matrix. Moving is done on the analytic boulder surface (the same bulge
// function the mesh was built from): step along the tangent plane, project
// back onto the boulder, and if that lands inside another boulder (of any
// part) move onto its surface instead — which is how a climber crosses from
// shin to thigh to hip to shoulder.
//
// Grip stamina drains on steep rock (faster while the Titan walks, much
// faster while it shrugs) and recovers standing on top of a shoulder or the
// head. Run out and you fall.

import * as THREE from 'three'
import { BLOCK_P, type LumpSurface, type Titan, type TitanPart } from './titan'

const GRAB_REACH = 1.8 // metres from the climber's chest to rock
const CLIMB_SPEED = 3.0 // a 300 m giant: fast enough to reach the shoulders on one grip
const TOP_SPEED = 3.2
const smoothstep01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))
const TOP_NORMAL = 0.62 // surface normal.y above this: standing on top
const DRAIN_STEEP = 0.007 // per second on steep rock, Titan still
const DRAIN_MOVING = 0.025 // extra per second at the Titan's full stride
const DRAIN_SHRUG = 0.6 // extra per second while it shrugs (upper body holds)
const REGEN_TOP = 0.22

/** What other clients need to draw a climber: which Titan, which part, which boulder, where on it. */
export interface Hold {
  /** '' = the awake Titan; otherwise a mountain's id. */
  titan: string
  part: string
  lump: number
  x: number
  y: number
  z: number
}

const UPPER = /^(torso|head|upperArm|forearm|hand)/
/** Heights up the body (m from the feet) kept out of a giant when on foot. */
const PUSH_H = [0.35, 0.95, 1.6]

/** Project part-local point q radially onto lump L. Returns |q|/surface (< 1 means q was inside). */
function onLump(L: LumpSurface, q: THREE.Vector3, out: THREE.Vector3): number {
  const ux = (q.x - L.c.x) / L.r.x
  const uy = (q.y - L.c.y) / L.r.y
  const uz = (q.z - L.c.z) / L.r.z
  const len = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1e-6
  const dx = ux / len
  const dy = uy / len
  const dz = uz / len
  const k = L.bulge(dx, dy, dz)
  out.set(L.c.x + dx * L.r.x * k, L.c.y + dy * L.r.y * k, L.c.z + dz * L.r.z * k)
  return len / k
}

/** Outward normal (part-local) of lump L at surface point p — the block's (superellipsoid's), ignoring weathering. */
export function lumpNormal(L: LumpSurface, p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const P = L.p ?? BLOCK_P
  const ux = (p.x - L.c.x) / L.r.x
  const uy = (p.y - L.c.y) / L.r.y
  const uz = (p.z - L.c.z) / L.r.z
  return out
    .set((Math.sign(ux) * Math.pow(Math.abs(ux), P - 1)) / L.r.x, (Math.sign(uy) * Math.pow(Math.abs(uy), P - 1)) / L.r.y, (Math.sign(uz) * Math.pow(Math.abs(uz), P - 1)) / L.r.z)
    .normalize()
}

const _q = new THREE.Vector3()
const _s = new THREE.Vector3()
const _w = new THREE.Vector3()
const _m = new THREE.Vector3()
const _inv = new THREE.Matrix4()
const _gd = new THREE.Vector3()
const _gq = new THREE.Vector3()
const _go = Array.from({ length: 12 }, () => new THREE.Vector3())
const _gt = new Float64Array(12)

/** Something climbable: the awake Titan (id '') or a dormant one (a mountain). */
export interface ClimbTarget {
  id: string
  titan: Titan
}

/** A part's stone and what is built on it — plates, the shrine — not its fur (cards, alpha-cut). */
const solidCache = new WeakMap<TitanPart, THREE.Mesh[]>()
function solidMeshes(part: TitanPart): THREE.Mesh[] {
  let list = solidCache.get(part)
  if (!list) {
    list = []
    part.mesh.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh) return
      const mat = m.material as THREE.Material
      if (mat && (mat.alphaTest > 0 || mat.transparent)) return
      list!.push(m)
    })
    solidCache.set(part, list)
  }
  return list
}

/** Rays in along `inward` from each point (from `from` out) against one mesh: nearest hits into _gt. */
function castInto(mesh: THREE.Mesh, points: readonly THREE.Vector3[], n: number, inward: THREE.Vector3, from: number): void {
  const geo = mesh.geometry
  const pos = geo.attributes.position.array as ArrayLike<number>
  const idx = geo.index?.array as ArrayLike<number> | undefined
  _inv.copy(mesh.matrixWorld).invert()
  _gd.copy(inward).transformDirection(_inv)
  // The points (local), each with its ray's start; the box they and their rays span.
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity
  for (let i = 0; i < n; i++) {
    const o = _go[i].copy(points[i]).applyMatrix4(_inv).addScaledVector(_gd, -from)
    for (const q of [o, _gq.copy(o).addScaledVector(_gd, from + 2.5)]) {
      x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); z0 = Math.min(z0, q.z)
      x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); z1 = Math.max(z1, q.z)
    }
  }
  const tris = idx ? idx.length / 3 : pos.length / 9
  for (let t = 0; t < tris; t++) {
    const a = (idx ? idx[t * 3] : t * 3) * 3
    const b = (idx ? idx[t * 3 + 1] : t * 3 + 1) * 3
    const c = (idx ? idx[t * 3 + 2] : t * 3 + 2) * 3
    const ax = pos[a], ay = pos[a + 1], az = pos[a + 2]
    const bx = pos[b], by = pos[b + 1], bz = pos[b + 2]
    const cx = pos[c], cy = pos[c + 1], cz = pos[c + 2]
    if (Math.max(ax, bx, cx) < x0 || Math.min(ax, bx, cx) > x1) continue
    if (Math.max(ay, by, cy) < y0 || Math.min(ay, by, cy) > y1) continue
    if (Math.max(az, bz, cz) < z0 || Math.min(az, bz, cz) > z1) continue
    // Möller–Trumbore, either side (the ray starts outside; a backface is only hit from within).
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az
    const px = _gd.y * e2z - _gd.z * e2y, py = _gd.z * e2x - _gd.x * e2z, pz = _gd.x * e2y - _gd.y * e2x
    const det = e1x * px + e1y * py + e1z * pz
    if (Math.abs(det) < 1e-9) continue
    const inv = 1 / det
    for (let i = 0; i < n; i++) {
      const o = _go[i]
      const sx = o.x - ax, sy = o.y - ay, sz = o.z - az
      const u = (sx * px + sy * py + sz * pz) * inv
      if (u < 0 || u > 1) continue
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x
      const v = (_gd.x * qx + _gd.y * qy + _gd.z * qz) * inv
      if (v < 0 || u + v > 1) continue
      const d = (e2x * qx + e2y * qy + e2z * qz) * inv
      if (d > 0 && d < _gt[i]) _gt[i] = d
    }
  }
}

export class Climber {
  active = false
  target: ClimbTarget | null = null
  part: TitanPart | null = null
  lump = 0
  /** The hold, on the surface, in the part's local frame. */
  readonly local = new THREE.Vector3()
  stamina = 1
  /** The first climb (until you let go high up): grip drains slower. */
  gentle = false
  standing = false
  /** World position and outward normal of the hold (refreshed by sync()). */
  readonly world = new THREE.Vector3()
  readonly normal = new THREE.Vector3()
  /** How fast the hold itself is moving — the Titan carrying us. */
  readonly vel = new THREE.Vector3()
  moving = 0
  private readonly prevWorld = new THREE.Vector3()
  private readonly invs = new Map<TitanPart, THREE.Matrix4>()

  constructor(private readonly targets: () => ClimbTarget[]) {}

  /** Grab the nearest rock, on any Titan, within reach of `chest` (world). */
  /** Is any giant's rock within reach of `chest` (for the prompt; takes no hold)? */
  inReach(chest: THREE.Vector3): boolean {
    for (const target of this.targets()) {
      const t = target.titan
      // (Most are far off: skip a giant whose middle is further than it is tall.)
      if (Math.hypot(t.gait.x - chest.x, t.gait.z - chest.z) > t.H * 1.2) continue
      for (const part of t.parts) {
        const inv = _inv.copy(part.mesh.matrixWorld).invert()
        _q.copy(chest).applyMatrix4(inv)
        for (const L of part.lumps) {
          onLump(L, _q, _s)
          if (_w.copy(_s).applyMatrix4(part.mesh.matrixWorld).distanceTo(chest) < GRAB_REACH) return true
        }
      }
    }
    return false
  }

  tryGrab(chest: THREE.Vector3): boolean {
    let best = GRAB_REACH
    for (const target of this.targets()) {
      for (const part of target.titan.parts) {
        const inv = _inv.copy(part.mesh.matrixWorld).invert()
        _q.copy(chest).applyMatrix4(inv)
        part.lumps.forEach((L, j) => {
          onLump(L, _q, _s)
          _w.copy(_s).applyMatrix4(part.mesh.matrixWorld)
          const d = _w.distanceTo(chest)
          if (d < best) {
            best = d
            this.attach(target, part, j, _s)
          }
        })
      }
    }
    if (this.active) this.refresh(true)
    return this.active
  }

  /**
   * Coming down onto a giant (user, 2026-11-05: "standing is impossible, jumping throws you off"):
   * if `feet` are on or just inside a part of it that faces up enough to stand on, take that as a
   * footing — you are standing on it (the climb's top mode), carried as it moves. Only while
   * falling (`vy` ≤ 0.5), so a jump or a let-go is not caught on the way up. The highest such
   * surface under you wins (the shoulder, not the arm beneath it).
   */
  landOn(feet: THREE.Vector3, vy: number): boolean {
    if (vy > 0.5) return false
    let best: { target: ClimbTarget; part: TitanPart; lump: number; local: THREE.Vector3; y: number } | null = null
    for (const target of this.targets()) {
      const t = target.titan
      if (Math.hypot(t.gait.x - feet.x, t.gait.z - feet.z) > t.H * 1.2) continue
      for (const part of t.parts) {
        const inv = _inv.copy(part.mesh.matrixWorld).invert()
        _q.copy(feet).applyMatrix4(inv)
        part.lumps.forEach((L, j) => {
          // On it, or within a hand's breadth above it (a fast fall crosses the skin in a step).
          const r = onLump(L, _q, _s)
          if (r > 1.0) {
            _w.copy(_s).applyMatrix4(part.mesh.matrixWorld)
            if (feet.y - _w.y > 0.35 || _w.distanceTo(feet) > 0.6) return
          } else _w.copy(_s).applyMatrix4(part.mesh.matrixWorld)
          // (Not from far inside: a point deep in a lump is not landing on it.)
          if (_w.distanceTo(feet) > 3) return
          lumpNormal(L, _s, _m).transformDirection(part.mesh.matrixWorld)
          if (_m.y < 0.45) return
          if (!best || _w.y > best.y) best = { target, part, lump: j, local: _s.clone(), y: _w.y }
        })
      }
    }
    if (!best) return false
    const b = best as { target: ClimbTarget; part: TitanPart; lump: number; local: THREE.Vector3; y: number }
    this.attach(b.target, b.part, b.lump, b.local)
    this.refresh(true)
    return true
  }

  /** How deep (m) world point `p` is inside the giant held (0 outside) — for keeping the body out. */
  /**
   * How near the visible stone of the part you hold the body comes: rays in along `inward` from each
   * world point (starting `from` metres out), against the triangles the part's mesh shows now. Returns
   * the smallest (hit distance − from), negative when a point is inside; Infinity if nothing is hit.
   * (The lumps' analytic shape stood up to 0.7 m proud of the mesh — ridges its facets cut — and the
   * armour-raised collision up to 1.4 m. three's raycast against all 3,800 triangles was ~0.12 ms a
   * ray; here only triangles near the body are tested.)
   */
  stoneGap(points: readonly THREE.Vector3[], inward: THREE.Vector3, from: number): number {
    const part = this.part
    if (!part) return Infinity
    const n = Math.min(points.length, _go.length)
    for (let i = 0; i < n; i++) _gt[i] = Infinity
    for (const mesh of solidMeshes(part)) if (mesh.visible) castInto(mesh, points, n, inward, from)
    let gap = Infinity
    for (let i = 0; i < n; i++) gap = Math.min(gap, _gt[i] - from)
    return gap
  }

  depth(p: THREE.Vector3, except?: TitanPart | null): number {
    if (!this.target) return 0
    let d = 0
    for (const part of this.target.titan.parts) {
      if (part === except) continue
      const inv = _inv.copy(part.mesh.matrixWorld).invert()
      _q.copy(p).applyMatrix4(inv)
      for (const L of part.lumps) {
        if (onLump(L, _q, _s) >= 1) continue
        _w.copy(_s).applyMatrix4(part.mesh.matrixWorld)
        d = Math.max(d, _w.distanceTo(p))
      }
    }
    return d
  }

  attach(target: ClimbTarget, part: TitanPart, lump: number, local: THREE.Vector3): void {
    this.active = true
    this.target = target
    this.part = part
    this.lump = lump
    this.local.copy(local)
  }

  /** Let go. Returns the velocity to fall with: the Titan's motion plus a push off the rock. */
  release(push: number): THREE.Vector3 {
    this.active = false
    this.part = null
    this.target = null
    return new THREE.Vector3().copy(this.vel).addScaledVector(this.normal, push).add(new THREE.Vector3(0, push * 0.6, 0))
  }

  /**
   * One fixed step of climbing. `move` is WASD (y = up the rock, or forward
   * when standing on top). Returns false if the grip gave out.
   */
  step(dt: number, move: { x: number; y: number }, camYaw: number, titanStride: number, shrugging: boolean): boolean {
    if (!this.active || !this.part) return false
    this.refresh(false)
    const part = this.part
    const M = part.mesh.matrixWorld
    const n = this.normal

    // Intent in the world, flattened onto the rock's tangent plane.
    const fx = -Math.sin(camYaw)
    const fz = -Math.cos(camYaw)
    const rx = Math.cos(camYaw)
    const rz = -Math.sin(camYaw)
    if (this.standing) _m.set(fx * move.y + rx * move.x, 0, fz * move.y + rz * move.x)
    else _m.set(rx * move.x, move.y, rz * move.x)
    _m.addScaledVector(n, -n.dot(_m))
    this.moving = 0
    if (_m.lengthSq() > 1e-6) {
      const speed = this.standing ? TOP_SPEED : CLIMB_SPEED
      _m.setLength(speed * dt)
      this.moving = speed
      _w.copy(this.world).add(_m)
      _q.copy(_w).applyMatrix4(_inv.copy(M).invert())
      onLump(part.lumps[this.lump], _q, this.local)
      this.crossOver()
    }

    // Grip.
    let drain = this.standing ? -REGEN_TOP : DRAIN_STEEP + DRAIN_MOVING * titanStride
    if (shrugging && UPPER.test(part.key)) drain += DRAIN_SHRUG
    if (!this.standing) {
      // Less steep (the upper side of a bulge, a slab of hide), it takes less holding on:
      // somewhere to ease off between the thighs and the shoulders.
      const slab = n.y < 0.2 ? 0 : n.y > 0.62 ? 1 : ((n.y - 0.2) / 0.42) ** 2 * (3 - 2 * ((n.y - 0.2) / 0.42))
      drain *= 1 - 0.6 * slab
      // (Your first climb: a little more forgiving still.)
      if (this.gentle) drain *= 0.7
      // Holding still: half the drain; and where the surface leans back far enough to take
      // your weight (a thigh's top, the back's slope, a shoulder's flank), you get your grip
      // back slowly — somewhere to rest on the way up (user: "no kind of resting place").
      if (this.moving === 0) drain = n.y > 0.3 ? -REGEN_TOP * 0.35 * smoothstep01((n.y - 0.3) / 0.3) : drain * 0.5
    }
    this.stamina = Math.min(1, Math.max(0, this.stamina - drain * dt))
    return this.stamina > 0
  }

  /**
   * If the hold now sits inside another boulder (this part's or another's),
   * the real surface there is that boulder's: move onto it. Never straight
   * back onto one left in the same step: where two boulders meet, each
   * surface lies inside the other, and bouncing between them wedged
   * climbers in the crease. On the new face, the next step climbs out of it.
   */
  private crossOver(): void {
    if (!this.part) return
    this.invs.clear()
    const left = new Set<string>([`${this.part.key}:${this.lump}`])
    for (let iter = 0; iter < 3; iter++) {
      _w.copy(this.local).applyMatrix4(this.part.mesh.matrixWorld)
      let moved = false
      for (const p of this.target!.titan.parts) {
        let inv = this.invs.get(p)
        if (!inv) {
          inv = new THREE.Matrix4().copy(p.mesh.matrixWorld).invert()
          this.invs.set(p, inv)
        }
        _q.copy(_w).applyMatrix4(inv)
        for (let j = 0; j < p.lumps.length; j++) {
          if (left.has(`${p.key}:${j}`)) continue
          if (onLump(p.lumps[j], _q, _s) < 0.999) {
            this.part = p
            this.lump = j
            left.add(`${p.key}:${j}`)
            this.local.copy(_s)
            moved = true
            break
          }
        }
        if (moved) break
      }
      if (!moved) return
    }
  }

  /** Re-read the hold through the part's current matrix (call after the Titan is posed). */
  sync(dt: number): void {
    if (!this.active) return
    this.refresh(false)
    if (dt > 0) this.vel.subVectors(this.world, this.prevWorld).divideScalar(dt)
    this.prevWorld.copy(this.world)
  }

  private refresh(reset: boolean): void {
    if (!this.part) return
    const M = this.part.mesh.matrixWorld
    this.world.copy(this.local).applyMatrix4(M)
    lumpNormal(this.part.lumps[this.lump], this.local, this.normal).transformDirection(M)
    this.standing = this.normal.y > TOP_NORMAL
    if (reset) {
      this.prevWorld.copy(this.world)
      this.vel.set(0, 0, 0)
    }
  }

  hold(): Hold | null {
    if (!this.active || !this.part || !this.target) return null
    return { titan: this.target.id, part: this.part.key, lump: this.lump, x: this.local.x, y: this.local.y, z: this.local.z }
  }

  /**
   * The Titan we hold went to sleep and its body is now the mountain `to`:
   * keep the same hold, on the mountain.
   */
  retarget(to: ClimbTarget): void {
    if (!this.part) return
    const part = to.titan.part(this.part.key)
    if (!part) return
    this.target = to
    this.part = part
  }

  /**
   * Keep a walking Wanderer out of the giants (user, 2026-11-05: "certain parts you go through").
   * Three points up the body — shins, waist, head — against every block of every giant within
   * reach; the deepest one inside sets the push, out along that block's surface (sideways only:
   * a top you come down on is a footing, landOn). Each part's inverse is worked out once a call.
   */
  pushOut(pos: THREE.Vector3): void {
    let bestD = 0
    let bx = 0
    let bz = 0
    for (const target of this.targets()) {
      const t = target.titan
      if (Math.hypot(t.gait.x - pos.x, t.gait.z - pos.z) > t.H * 1.2) continue
      for (const p of t.parts) {
        const inv = _inv.copy(p.mesh.matrixWorld).invert()
        for (const h of PUSH_H) {
          _w.set(pos.x, pos.y + h, pos.z)
          _q.copy(_w).applyMatrix4(inv)
          for (const L of p.lumps) {
            if (onLump(L, _q, _s) >= 1) continue
            _s.applyMatrix4(p.mesh.matrixWorld)
            const dx = _s.x - _w.x
            const dz = _s.z - _w.z
            const d = Math.hypot(dx, dz)
            if (d > bestD) {
              bestD = d
              bx = dx
              bz = dz
            }
          }
        }
      }
    }
    if (bestD <= 0) return
    pos.x += bx + (bx / bestD) * 0.15
    pos.z += bz + (bz / bestD) * 0.15
  }
}

/** World position + normal of a hold someone else reported (for drawing remote climbers). */
export function holdToWorld(titanOf: (id: string) => Titan | undefined, h: Hold, pos: THREE.Vector3, normal: THREE.Vector3): boolean {
  const part = titanOf(h.titan)?.part(h.part)
  const L = part?.lumps[h.lump]
  if (!part || !L) return false
  _q.set(h.x, h.y, h.z)
  pos.copy(_q).applyMatrix4(part.mesh.matrixWorld)
  lumpNormal(L, _q, normal).transformDirection(part.mesh.matrixWorld)
  return true
}
