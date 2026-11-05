// What the Old Wood's bell wakes (PLAN §4b.2): the stair round the tree. Slabs of stone push out of
// a giant tree's bark one after another — a slow ripple climbing the trunk — and stand there in a
// spiral, a step every half metre up, from the roots to where its first great limb leaves the trunk.
// Walkable (a rise the feet take), and solid as each slab comes out (the field reads how far out
// each one is now).
//
// One instanced mesh (the made stone of the bells' yokes and the lamps), and one formation in the
// rocks with no mesh of its own — its field, indexed by height, is the slabs.

import * as THREE from 'three'
import { mulberry32 } from '@titans/shared'
import type { Formation, Rocks } from './rocks'
import { weatheredStone } from './weathered-stone'
import { carvedStone } from './spots'

const RISE = 0.5
/** A slab: along the trunk (tangential), thick, out from the bark (radial). */
const SL = 2.7
const ST = 0.42
/** Radially: the whole slab, and how much of it stands clear of the bark (the rest is in the tree:
 * the bark's furrows run 1–2 m deep, and a slab set against them showed gaps behind it). */
const SW = 4.8
const CLEAR = 2.8

interface Slab {
  /** Local (the tree's frame): where it stands out, and its directions. */
  c: THREE.Vector3
  out: THREE.Vector2
  /** When it comes out (s from the start), and how far out it is now (0 … 1). */
  at: number
  ext: number
  /** Its size radially (out from the bark: longer where it stands off a hollow) and along. */
  len: number
  wid: number
}

export class TreeStair {
  readonly mesh: THREE.InstancedMesh
  readonly slabs: Slab[] = []
  /** The landing at the top (world): where the stair ends (and what was kept there sits). */
  readonly top = new THREE.Vector3()
  private t = -1
  readonly secs: number
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly s = new THREE.Vector3(1, 1, 1)
  private readonly v = new THREE.Vector3()
  /** The first slab is out / the last: sounds. */
  onSlab: (i: number, at: THREE.Vector3) => void = () => {}

  constructor(
    private readonly tree: Formation,
    h: number,
    rocks: Rocks,
    seed: number,
    /** World direction (from the tree) the stair starts on: toward the bell. */
    startDir: THREE.Vector2,
    groundAt: (x: number, z: number) => number,
  ) {
    const rand = mulberry32(seed)
    void rand
    const field = (x: number, y: number, z: number) => tree.field(x, y, z)
    // Where is the trunk's axis at height y (local)? The deepest point of the field there
    // (worked out every 6 m of height, and between those, eased).
    const axisCache = new Map<number, [number, number]>()
    const axisAt = (y: number): [number, number] => {
      const k = Math.floor(y / 6)
      const a = axisRaw(k * 6, axisCache.get(k - 1))
      axisCache.set(k, a)
      const b = axisCache.get(k + 1) ?? axisRaw((k + 1) * 6, a)
      axisCache.set(k + 1, b)
      const t = y / 6 - k
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    }
    const axisRaw = (y: number, near?: [number, number]): [number, number] => {
      const hit = axisCache.get(Math.round(y / 6))
      if (hit) return hit
      let best = [0, 0] as [number, number]
      let bd = Infinity
      // (Near the last one found, a small search; the first, a wide one.)
      const R = near ? 12 : 48
      const [cx0, cz0] = near ?? [0, 0]
      for (let x = cx0 - R; x <= cx0 + R; x += 6)
        for (let z = cz0 - R; z <= cz0 + R; z += 6) {
          const d = field(x, y, z)
          if (d < bd) {
            bd = d
            best = [x, z]
          }
        }
      for (let step = 3; step > 0.4; step /= 2) {
        const [bx, bz] = best
        for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
          const d = field(bx + dx, y, bz + dz)
          if (d < bd) {
            bd = d
            best = [bx + dx, bz + dz]
          }
        }
      }
      return best
    }
    // Up from a little above the roots' knees to where a limb leaves the trunk (a slab's way
    // out there runs into the limb): one slab every RISE, round at a slab's length a step.
    // It starts on the side toward the bell, at the ground there.
    const lx = startDir.x * tree.cos - startDir.y * tree.sin
    const lz = startDir.x * tree.sin + startDir.y * tree.cos
    let ang = Math.atan2(lz, lx)
    const a0 = axisAt(4)
    let r0 = 4
    while (r0 < 90 && field(a0[0] + Math.cos(ang) * r0, 4, a0[1] + Math.sin(ang) * r0) < 0) r0 += 1
    const w0 = this.toWorld(this.v.set(a0[0] + Math.cos(ang) * (r0 + 1.5), 0, a0[1] + Math.sin(ang) * (r0 + 1.5)))
    const y0 = groundAt(w0.x, w0.z) - tree.y + 0.25
    let y = y0
    let stop = false
    /** First pass: each slab's way out, its height, and the bark there (raw). */
    const raw: Array<{ ax: number; az: number; ox: number; oz: number; y: number; r: number; da: number }> = []
    for (let i = 0; i < 600 && !stop; i++) {
      const [ax, az] = axisAt(y)
      const ox = Math.cos(ang)
      const oz = Math.sin(ang)
      // March out from the axis to the bark (or a root standing out there) — at the slab's
      // height, at head height and above, and at either end of it: the outermost of these, so
      // nothing of the tree bulges over the walk.
      let r = 4
      for (const [dy, dt] of [[0.2, 0], [1.0, 0], [1.9, 0], [0.6, 1.2], [0.6, -1.2], [1.6, 1.2], [1.6, -1.2]]) {
        const tx = -oz * dt
        const tz = ox * dt
        let rr = Math.max(4, r - 8)
        while (rr < 90 && field(ax + ox * rr + tx, y + dy, az + oz * rr + tz) < 0) rr += 1.2
        for (let lo = rr - 1.2, k = 0; k < 4; k++) {
          const m = (lo + rr) / 2
          if (field(ax + ox * m + tx, y + dy, az + oz * m + tz) < 0) lo = m
          else rr = m
        }
        r = Math.max(r, rr)
      }
      // A limb overhead or ahead: the stair arrives.
      if (y > h * 0.4 && (field(ax + ox * (r + CLEAR * 0.5), y + 2.6, az + oz * (r + CLEAR * 0.5)) < 0 || r > 60)) stop = true
      const da = (SL * 0.92) / (r + CLEAR / 2)
      raw.push({ ax, az, ox, oz, y, r, da })
      ang += da
      y += RISE
      if (y > h * 0.92) stop = true
    }
    // Second pass: the walk's line, smoothed — never into the bark, and out no more than 0.6 m
    // from one slab to the next (a root's knee pushed one slab metres out from the last: a gap you
    // fell through). A slab stood off the bark is longer, so its inner end still goes into the wood.
    raw.forEach((a, i) => {
      let rs = a.r
      for (let j = Math.max(0, i - 8); j <= Math.min(raw.length - 1, i + 8); j++) rs = Math.max(rs, raw[j].r - 0.6 * Math.abs(i - j))
      const outer = rs + CLEAR
      const inner = a.r - (SW - CLEAR)
      const len = outer - inner
      const mid = (outer + inner) / 2
      // Along: at least a slab's length, and enough to meet the next one at this radius.
      const wid = Math.max(SL, (a.da * (rs + CLEAR / 2)) / 0.92)
      const c = new THREE.Vector3(a.ax + a.ox * mid, a.y - ST / 2, a.az + a.oz * mid)
      this.slabs.push({ c, out: new THREE.Vector2(a.ox, a.oz), at: 0, ext: 0, len, wid })
    })
    const n = this.slabs.length
    this.secs = Math.min(75, 18 + n * 0.18)
    this.slabs.forEach((s, i) => (s.at = (i / n) * (this.secs - 3)))
    const last = this.slabs[n - 1]
    this.top.copy(this.toWorld(this.v.set(last.c.x, last.c.y + ST / 2, last.c.z)))

    const geo = weatheredStone(SL, ST, SW, rand, false, 0.02, true)
    this.mesh = new THREE.InstancedMesh(geo, carvedStone(), n)
    this.mesh.castShadow = this.mesh.receiveShadow = true
    this.mesh.frustumCulled = false
    this.place()
    // The field: the slabs near the query's height (indexed by it), as boxes in their own frames.
    const self = this
    const slabField = (lx: number, ly: number, lz: number): number => {
      const k = Math.round((ly - y0) / RISE)
      let d = 50
      for (let j = Math.max(0, k - 3); j <= Math.min(n - 1, k + 3); j++) {
        const s = self.slabs[j]
        if (s.ext <= 0.01) continue
        const ex = s.len * (1 - s.ext)
        const cx = s.c.x - s.out.x * ex
        const cz = s.c.z - s.out.y * ex
        const dx = lx - cx
        const dz = lz - cz
        const u = dx * s.out.x + dz * s.out.y
        const v = -dx * s.out.y + dz * s.out.x
        d = Math.min(d, Math.max(Math.abs(u) - s.len / 2, Math.abs(v) - s.wid / 2, Math.abs(ly - s.c.y) - ST / 2))
      }
      return d
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3))
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3))
    rocks.addBuilt({ field: slabField, hx: tree.hx, hz: tree.hz, hy: h / 2 + 4, cy: h / 2 }, g, { x: tree.x, y: tree.y, z: tree.z, rot: tree.rot, layers: [0, 0], scale: 6 })
    const f = rocks.formations[rocks.formations.length - 1]
    if (f.mesh) f.mesh.visible = false
  }

  toWorld(v: THREE.Vector3): THREE.Vector3 {
    const c = this.tree.cos
    const sn = this.tree.sin
    const x = v.x * c + v.z * sn
    const z = -v.x * sn + v.z * c
    return v.set(this.tree.x + x, this.tree.y + v.y, this.tree.z + z)
  }

  /** Start the slabs coming out. */
  wake(): void {
    if (this.t < 0) this.t = 0
  }

  /** All out at once (a save). */
  finish(): void {
    this.t = this.secs + 1
    for (const s of this.slabs) s.ext = 1
    this.place()
  }

  get running(): boolean {
    return this.t >= 0 && this.t <= this.secs
  }

  update(dt: number): void {
    if (this.t < 0 || this.t > this.secs) return
    const before = this.t
    this.t += dt
    this.slabs.forEach((s, i) => {
      const k = THREE.MathUtils.clamp((this.t - s.at) / 2.2, 0, 1)
      s.ext = k * k * (3 - 2 * k)
      if (before < s.at && this.t >= s.at && i % 6 === 0) this.onSlab(i, this.toWorld(this.v.copy(s.c)))
    })
    this.place()
  }

  private place(): void {
    const rotY = this.tree.rot
    this.slabs.forEach((s, i) => {
      const ex = s.len * (1 - s.ext)
      this.v.set(s.c.x - s.out.x * ex, s.c.y, s.c.z - s.out.y * ex)
      this.toWorld(this.v)
      // Long side along the bark: the slab's local z is out (radial).
      this.q.setFromAxisAngle(_up, rotY + Math.atan2(s.out.x, s.out.y))
      // (The geometry is SL along, SW out: scaled to this slab's size.)
      this.s.set(s.wid / SL, 1, s.len / SW)
      this.m.compose(this.v, this.q, this.s)
      this.mesh.setMatrixAt(i, this.m)
    })
    this.mesh.instanceMatrix.needsUpdate = true
  }
}

const _up = new THREE.Vector3(0, 1, 0)
