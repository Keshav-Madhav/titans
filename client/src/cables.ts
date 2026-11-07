// Old cables (the user, 2026-11-07: "travelling feels daunting … ziplines idk, nothing that
// outstands in the game, make it fit"). Someone, long ago, strung ropes from the tops of the tall
// stones down to lower ones — the same hands that built the camps and lit the cairns. They sag
// between a stake driven into each top. Take hold (E) under one and you ride it down, hanging by
// your hands; Space lets go (the cloak can open from there). Built from what is there: a high
// formation's top, a lower one's top within a few hundred metres.

import * as THREE from 'three'
import type { Rocks } from './rocks'
import type { Terrain } from '@titans/shared'
import { mulberry32 } from '@titans/shared'

const SEG = 40
/** How far below the line the hands hang from (m): the body hangs from the hands. */
export const HANG = 1.95

export interface Cable {
  a: THREE.Vector3
  b: THREE.Vector3
  /** Sampled points along the sagging rope, a → b (a is the higher end). */
  pts: THREE.Vector3[]
  len: number
}

export class Cables {
  readonly group = new THREE.Group()
  readonly cables: Cable[] = []
  /** Riding: which cable, how far along (0 … 1), speed along it (m/s). */
  ride: { c: Cable; t: number; v: number } | null = null

  constructor(rocks: Rocks, terrain: Terrain, seed: number, near?: { x: number; z: number }) {
    const rand = mulberry32(seed + 5150)
    // One first, near where you begin (the first camp): down from the highest ground within a few
    // hundred metres to a little way off the camp, so the idea is met early, not 3 km out.
    if (near) {
      let top: THREE.Vector3 | null = null
      for (let k = 0; k < 400; k++) {
        const a = rand() * Math.PI * 2
        const d = 120 + rand() * 260
        const x = near.x + Math.cos(a) * d
        const z = near.z + Math.sin(a) * d
        const y = terrain.heightAt(x, z)
        if (!top || y > top.y) top = new THREE.Vector3(x, y, z)
      }
      for (let k = 0; top && k < 60 && !this.cables.length; k++) {
        const a = rand() * Math.PI * 2
        const x = near.x + Math.cos(a) * (25 + rand() * 30)
        const z = near.z + Math.sin(a) * (25 + rand() * 30)
        const y = terrain.heightAt(x, z)
        if (top.y - y < 10) continue
        const c = this.make(top.clone().setY(top.y + 2.4), new THREE.Vector3(x, y + 2.4, z), terrain)
        if (c) this.cables.push(c)
      }
    }
    const tall = rocks.formations.filter((f) => (f.kind === 'spire' || f.kind === 'hoodoo') && !f.always)
    const tops = tall
      .map((f) => {
        const y = rocks.topAt(f.x, f.z)
        return y === null ? null : { f, at: new THREE.Vector3(f.x, y, f.z), ground: terrain.heightAt(f.x, f.z) }
      })
      .filter((t): t is { f: (typeof tall)[number]; at: THREE.Vector3; ground: number } => !!t && t.at.y - t.ground > 14)
    const used = new Set<number>()
    for (const hi of tops) {
      if (this.cables.length >= 30 || used.has(hi.f.id)) continue
      // The best lower stone: a fair drop over a few hundred metres, the rope clear of the land.
      let best: { lo: (typeof tops)[number]; score: number } | null = null
      for (const lo of tops) {
        if (lo === hi || used.has(lo.f.id)) continue
        const d = Math.hypot(lo.at.x - hi.at.x, lo.at.z - hi.at.z)
        const drop = hi.at.y - lo.at.y
        if (d < 70 || d > 380 || drop < 8 || drop / d > 0.45) continue
        const score = drop / d + rand() * 0.05
        if (!best || score > best.score) best = { lo, score }
      }
      if (!best) continue
      const c = this.make(hi.at, best.lo.at, terrain)
      if (!c) continue
      used.add(hi.f.id)
      used.add(best.lo.f.id)
      this.cables.push(c)
    }
    // And from hilltops and ridges down across the lower land: a crest a few hundred metres from a
    // lower rise, the rope clear of the ground between (the tall stones alone gave one cable).
    const GRID = 520
    // (Cells in a shuffled order: walked row by row, the cap filled up at one edge of the world.)
    const cells: Array<[number, number]> = []
    for (let gx = -11000; gx <= 11000; gx += GRID) for (let gz = -11000; gz <= 11000; gz += GRID) cells.push([gx, gz])
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[cells[i], cells[j]] = [cells[j], cells[i]]
    }
    for (const [gx, gz] of cells) {
      if (this.cables.length >= 60) break
      {
        let top: THREE.Vector3 | null = null
        for (let k = 0; k < 25; k++) {
          const x = gx + (rand() - 0.5) * GRID * 0.8
          const z = gz + (rand() - 0.5) * GRID * 0.8
          const y = terrain.heightAt(x, z)
          if (!top || y > top.y) top = new THREE.Vector3(x, y, z)
        }
        if (!top || top.y < -5 || top.y > 420) continue
        let best: { at: THREE.Vector3; score: number } | null = null
        for (let k = 0; k < 18; k++) {
          const a = rand() * Math.PI * 2
          const d = 160 + rand() * 260
          const x = top.x + Math.cos(a) * d
          const z = top.z + Math.sin(a) * d
          const y = terrain.heightAt(x, z)
          const drop = top.y - y
          if (drop / d < 0.1 || drop / d > 0.4) continue
          const score = drop / d + rand() * 0.05
          if (!best || score > best.score) best = { at: new THREE.Vector3(x, y, z), score }
        }
        if (!best) continue
        // (A stake's height up off each end, so the rope clears the crest it starts from.)
        const c = this.make(top.clone().setY(top.y + 2.4), best.at.clone().setY(best.at.y + 2.4), terrain)
        if (c) this.cables.push(c)
      }
    }
    // The ropes: one merged tube; a stake at each end.
    const rope = new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 0.95 })
    const hair = new THREE.LineBasicMaterial({ color: 0x2a2219, transparent: true, opacity: 0.85 })
    const wood = new THREE.MeshStandardMaterial({ color: 0x5b4a38, roughness: 1 })
    for (const c of this.cables) {
      const curve = new THREE.CatmullRomCurve3(c.pts)
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, SEG * 2, 0.05, 6), rope)
      m.castShadow = true
      this.group.add(m)
      // (And a hairline along it: a 7 cm rope is under a pixel past ~60 m and vanished — a line is
      // always at least one, so the rope reads across a valley as a thin dark stroke.)
      const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(SEG * 2)), hair)
      this.group.add(ln)
      for (const end of [c.a, c.b]) {
        // (A post driven into the ground, the rope tied near its top.)
        const H = end.y - terrain.heightAt(end.x, end.z) + 0.3
        const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, H, 6).translate(0, H / 2, 0), wood)
        stake.position.set(end.x, end.y - H + 0.3, end.z)
        stake.rotation.z = (rand() - 0.5) * 0.25
        stake.castShadow = true
        this.group.add(stake)
      }
    }
  }

  private make(a: THREE.Vector3, b: THREE.Vector3, terrain: Terrain): Cable | null {
    // (The rope ties on 0.6 m up the stake.)
    const A = a.clone().setY(a.y + 0.6)
    const B = b.clone().setY(b.y + 0.6)
    const d = A.distanceTo(B)
    const sag = Math.min(9, d * 0.035)
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG
      const p = A.clone().lerp(B, t)
      p.y -= sag * 4 * t * (1 - t)
      // Clear of the land under it (the body hangs HANG below the rope, plus a margin).
      if (i > 2 && i < SEG - 2 && p.y - HANG - 1.2 < terrain.heightAt(p.x, p.z)) return null
      pts.push(p)
    }
    let len = 0
    for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1])
    return { a: A, b: B, pts, len }
  }

  /** The point on a cable at t (0 … 1). */
  at(c: Cable, t: number, out: THREE.Vector3): THREE.Vector3 {
    const f = THREE.MathUtils.clamp(t, 0, 1) * SEG
    const i = Math.min(SEG - 1, Math.floor(f))
    return out.copy(c.pts[i]).lerp(c.pts[i + 1], f - i)
  }

  /** The nearest point of any cable to `p` within `reach` (m): the cable and its t. */
  nearest(p: THREE.Vector3, reach: number): { c: Cable; t: number; d: number } | null {
    let best: { c: Cable; t: number; d: number } | null = null
    for (const c of this.cables) {
      // (Cheap out: far from both ends' line.)
      const mx = (c.a.x + c.b.x) / 2
      const mz = (c.a.z + c.b.z) / 2
      if (Math.hypot(p.x - mx, p.z - mz) > c.len / 2 + reach + 10) continue
      // (To the rope between its sample points: they are ~10 m apart on a long one, and the hands
      // right on the rope midway counted as out of reach.)
      for (let i = 0; i < SEG; i++) {
        const a = c.pts[i]
        _d.subVectors(c.pts[i + 1], a)
        const l2 = _d.lengthSq() || 1
        const u = THREE.MathUtils.clamp(((p.x - a.x) * _d.x + (p.y - a.y) * _d.y + (p.z - a.z) * _d.z) / l2, 0, 1)
        _p0.copy(a).addScaledVector(_d, u)
        const d = _p0.distanceTo(p)
        if (d < reach && (!best || d < best.d)) best = { c, t: (i + u) / SEG, d }
      }
    }
    return best
  }

  /**
   * Riding a step: gravity along the rope, a little drag; returns where the hands are, or 'end'
   * when the low end is reached (you drop off with the speed you had).
   */
  step(dt: number, hands: THREE.Vector3, dir: THREE.Vector3): 'riding' | 'end' {
    const r = this.ride!
    const c = r.c
    const t0 = r.t
    this.at(c, t0, _p0)
    this.at(c, Math.min(1, t0 + 0.01), _p1)
    _d.subVectors(_p1, _p0)
    const seg = _d.length() || 1
    const slope = -_d.y / seg // + going down
    // (A pulley on the rope, not a body dragged along it: little friction, and never slower than a
    // brisk run, so a shallow stretch is still a ride.)
    r.v += (9.8 * slope - 0.006 * r.v * r.v) * dt
    r.v = THREE.MathUtils.clamp(r.v, 7, 30)
    r.t += (r.v * dt) / c.len
    if (r.t >= 0.985) return 'end'
    this.at(c, r.t, hands)
    dir.copy(_d).divideScalar(seg)
    return 'riding'
  }
}

const _p0 = new THREE.Vector3()
const _p1 = new THREE.Vector3()
const _d = new THREE.Vector3()
