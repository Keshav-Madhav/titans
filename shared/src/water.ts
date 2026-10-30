// Lakes: rain fills Titan footprints, trenches and craters; full lakes spill
// into the lake downhill of them; lakes whose surfaces meet merge. That is
// the "fill–spill–merge" model (Barnes, Callaghan & Wickert 2020), run
// incrementally as the terrain changes.
//
// A basin is found with a priority flood (Barnes et al. 2014): grow a region
// from the hollow's lowest cell, always taking the lowest cell on its edge.
// The water level is the highest height taken so far; the moment the next
// cell is LOWER than that, the flood has crossed a saddle — that height is
// the spill height and that cell is the exit. Floods run on the EFFECTIVE
// surface (terrain, or the water surface where a lake holds water), so a
// flood that reaches a neighbour's surface continues across it: that is how
// two lakes become one.
//
// Deterministic (heap ties break by insertion order, arithmetic only), so
// the server can own lakes and clients can predict them.

import type { Box } from './deform'

export type CellHeight = (ix: number, iz: number) => number

export interface Basin {
  x0: number // bbox origin (integer world coords)
  z0: number
  w: number
  h: number
  mask: Uint8Array // 1 = lake bed, w*h
  bottom: number // lowest real terrain height in the bed
  spill: number
  bx: number // that lowest cell
  bz: number
  ex: number // first cell past the spill saddle (NaN if none)
  ez: number
  /** Lake-bed heights, ascending, with prefix sums — volume ⇄ level in O(log n). */
  sorted: Float64Array
  prefix: Float64Array
  /** The flood hit MAX_CELLS: this water is spreading into lowland, not a lake. */
  capped: boolean
}

/**
 * The largest basin a flood will grow (≈ 4 ha). Past it, water is spreading
 * into natural lowland: the flood stops there with no exit, so that water
 * counts as running off (the river phase will route it). This world is dry
 * until Titans bring water; its natural hollows are not lakes.
 */
const MAX_CELLS = 40000
/** Largest natural hollow that spill may turn into a new pool (≈ 0.8 ha). */
const POOL_MAX = 8000
/** Smaller hollows fill at once; water runs on past them. */
const POOL_MIN = 40

/** Bed mask without the volume tables — a lake's wet area on today's terrain. */
interface Region {
  x0: number
  z0: number
  w: number
  h: number
  mask: Uint8Array
}

function inRegion(r: Region, x: number, z: number): boolean {
  const i = x - r.x0
  const j = z - r.z0
  return i >= 0 && j >= 0 && i < r.w && j < r.h && r.mask[j * r.w + i] === 1
}

/** Escape a tiny pit: grow it cell by cell until a neighbour lower than the rim appears. */
export function lowestExit(H: CellHeight, x: number, z: number): [number, number] {
  const heap = new Heap()
  const seen = new Set<number>([key(x, z)])
  heap.push(H(x, z), x, z)
  const top = [0, 0, 0]
  let level = -Infinity
  for (let n = 0; n < 64 && heap.size > 0; n++) {
    heap.pop(top)
    if (top[0] < level - 1e-6) return [top[1], top[2]]
    level = top[0]
    for (let k = 0; k < 4; k++) {
      const nx = top[1] + (k === 0 ? 1 : k === 1 ? -1 : 0)
      const nz = top[2] + (k === 2 ? 1 : k === 3 ? -1 : 0)
      const kk = key(nx, nz)
      if (seen.has(kk)) continue
      seen.add(kk)
      heap.push(H(nx, nz), nx, nz)
    }
  }
  return [NaN, NaN]
}

class Heap {
  private h: number[] = []
  private x: number[] = []
  private z: number[] = []
  private o: number[] = []
  private n = 0
  private seq = 0
  get size(): number {
    return this.n
  }
  private less(a: number, b: number): boolean {
    return this.h[a] < this.h[b] || (this.h[a] === this.h[b] && this.o[a] < this.o[b])
  }
  private swap(a: number, b: number): void {
    let t = this.h[a]
    this.h[a] = this.h[b]
    this.h[b] = t
    t = this.x[a]
    this.x[a] = this.x[b]
    this.x[b] = t
    t = this.z[a]
    this.z[a] = this.z[b]
    this.z[b] = t
    t = this.o[a]
    this.o[a] = this.o[b]
    this.o[b] = t
  }
  push(h: number, x: number, z: number): void {
    let i = this.n++
    this.h[i] = h
    this.x[i] = x
    this.z[i] = z
    this.o[i] = this.seq++
    while (i > 0) {
      const p = (i - 1) >> 1
      if (!this.less(i, p)) break
      this.swap(i, p)
      i = p
    }
  }
  /** Pops into out[0..2] = h, x, z. */
  pop(out: number[]): void {
    out[0] = this.h[0]
    out[1] = this.x[0]
    out[2] = this.z[0]
    this.n--
    if (this.n > 0) {
      this.h[0] = this.h[this.n]
      this.x[0] = this.x[this.n]
      this.z[0] = this.z[this.n]
      this.o[0] = this.o[this.n]
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < this.n && this.less(l, m)) m = l
        if (r < this.n && this.less(r, m)) m = r
        if (m === i) break
        this.swap(i, m)
        i = m
      }
    }
  }
}

const key = (x: number, z: number) => (x + 32768) * 65536 + (z + 32768)

/**
 * Walk downhill from (sx, sz) to the local minimum. Four-connected, like the
 * flood: a diagonal step would slip through one-cell-thin rims that the
 * flood treats as walls.
 */
export function descend(H: CellHeight, sx: number, sz: number, path?: number[]): [number, number] {
  let x = sx
  let z = sz
  let h = H(x, z)
  path?.push(key(x, z))
  for (let it = 0; it < 4000; it++) {
    let bx = x
    let bz = z
    let bh = h
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0)
      const nz = z + (k === 2 ? 1 : k === 3 ? -1 : 0)
      const v = H(nx, nz)
      if (v < bh) {
        bh = v
        bx = nx
        bz = nz
      }
    }
    if (bx === x && bz === z) break
    x = bx
    z = bz
    h = bh
    path?.push(key(x, z))
  }
  return [x, z]
}

/**
 * The basin that holds water poured at (sx, sz), flooding over the effective
 * surface `E` and measuring the bed with real terrain `H`. Null if it holds
 * no water.
 */
export function floodBasin(H: CellHeight, E: CellHeight, sx: number, sz: number, minBed = 4): Basin | null {
  const [mx, mz] = descend(E, sx, sz)
  const heap = new Heap()
  const seen = new Set<number>()
  const cx: number[] = []
  const cz: number[] = []
  const top = [0, 0, 0]
  heap.push(E(mx, mz), mx, mz)
  seen.add(key(mx, mz))
  let level = -Infinity
  let ex = NaN
  let ez = NaN
  let capped = false
  while (heap.size > 0) {
    heap.pop(top)
    const hc = top[0]
    if (hc < level - 1e-6) {
      ex = top[1]
      ez = top[2]
      break
    }
    if (cx.length >= MAX_CELLS) {
      capped = true
      break
    }
    level = hc
    const x = top[1]
    const z = top[2]
    cx.push(x)
    cz.push(z)
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0)
      const nz = z + (k === 2 ? 1 : k === 3 ? -1 : 0)
      const kk = key(nx, nz)
      if (seen.has(kk)) continue
      seen.add(kk)
      heap.push(E(nx, nz), nx, nz)
    }
  }
  const spill = level

  let x0 = Infinity
  let z0 = Infinity
  let x1 = -Infinity
  let z1 = -Infinity
  let bottom = Infinity
  let bx = mx
  let bz = mz
  const bedX: number[] = []
  const bedZ: number[] = []
  const bedH: number[] = []
  for (let i = 0; i < cx.length; i++) {
    const h = H(cx[i], cz[i])
    if (h >= spill) continue
    bedX.push(cx[i])
    bedZ.push(cz[i])
    bedH.push(h)
    if (h < bottom) {
      bottom = h
      bx = cx[i]
      bz = cz[i]
    }
    if (cx[i] < x0) x0 = cx[i]
    if (cx[i] > x1) x1 = cx[i]
    if (cz[i] < z0) z0 = cz[i]
    if (cz[i] > z1) z1 = cz[i]
  }
  if (bedX.length < minBed || bedX.length === 0) return null
  const w = x1 - x0 + 1
  const h = z1 - z0 + 1
  const mask = new Uint8Array(w * h)
  for (let i = 0; i < bedX.length; i++) mask[(bedZ[i] - z0) * w + (bedX[i] - x0)] = 1
  const sorted = Float64Array.from(bedH).sort()
  const prefix = new Float64Array(sorted.length + 1)
  for (let i = 0; i < sorted.length; i++) prefix[i + 1] = prefix[i] + sorted[i]
  return { x0, z0, w, h, mask, bottom, spill, bx, bz, ex, ez, sorted, prefix, capped }
}

/** Number of bed cells strictly below `level`. */
function countBelow(b: Basin, level: number): number {
  let lo = 0
  let hi = b.sorted.length
  while (lo < hi) {
    const m = (lo + hi) >> 1
    if (b.sorted[m] < level) lo = m + 1
    else hi = m
  }
  return lo
}

/** Water volume (m³; cells are 1 m²) held at `level`. */
export function volumeAt(b: Basin, level: number): number {
  const k = countBelow(b, level)
  return k * level - b.prefix[k]
}

/** Inverse of volumeAt, clamped to [bottom, spill]. */
export function levelFor(b: Basin, volume: number): number {
  if (volume <= 0) return b.bottom
  if (volume >= volumeAt(b, b.spill)) return b.spill
  let lo = 1
  let hi = b.sorted.length
  while (lo < hi) {
    const m = (lo + hi) >> 1
    const vm = m * b.sorted[m] - b.prefix[m] // volume if the level sat exactly at sorted[m]
    if (vm < volume) lo = m + 1
    else hi = m
  }
  return (volume + b.prefix[lo]) / lo
}

export function inBasin(b: Basin, x: number, z: number): boolean {
  const i = x - b.x0
  const j = z - b.z0
  return i >= 0 && j >= 0 && i < b.w && j < b.h && b.mask[j * b.w + i] === 1
}

export interface Lake {
  id: number
  basin: Basin
  volume: number
  level: number
  /** Water arriving next step: spill from upstream, or what a shrunk basin could not hold. */
  carry: number
  /** Bumped whenever the basin (shape) changes; renderers rebuild on change. */
  version: number
  /** Cached downstream lake id (undefined = not computed, 0 = none). */
  down?: number
  /** Cells the spill runs through on its way to `down` (packed keys). */
  path?: number[]
}

/**
 * All lakes in a region. Rain adds `rainRate` metres of depth per second over
 * each lake's bed. A full lake passes its excess to the lake downhill of its
 * exit; when that lake's surface reaches the saddle, the two merge. Water
 * spilling where no lake waits is lost for now (rivers to the lowlands come
 * with the river phase).
 */
export class LakeSystem {
  readonly lakes: Lake[] = []
  private nextId = 1

  constructor(private readonly H: CellHeight, public rainRate = 0.06) {}

  /**
   * Terrain, or the water surface where a lake holds water. `wet` replaces a
   * lake's stored bed with where its water actually reaches now (terrain
   * dug beside a lake floods the moment it is dug).
   */
  surface(wet?: Map<Lake, Region>): CellHeight {
    const H = this.H
    const index = new Map<number, Lake[]>()
    const regionOf = (l: Lake): Region => wet?.get(l) ?? l.basin
    for (const l of this.lakes) {
      if (l.level <= l.basin.bottom) continue
      const b = regionOf(l)
      for (let tz = Math.floor(b.z0 / 64); tz <= Math.floor((b.z0 + b.h) / 64); tz++) {
        for (let tx = Math.floor(b.x0 / 64); tx <= Math.floor((b.x0 + b.w) / 64); tx++) {
          const k = key(tx, tz)
          const list = index.get(k)
          if (list) list.push(l)
          else index.set(k, [l])
        }
      }
    }
    if (index.size === 0) return H
    return (ix, iz) => {
      let h = H(ix, iz)
      const list = index.get(key(Math.floor(ix / 64), Math.floor(iz / 64)))
      if (list) for (const l of list) if (l.level > h && inRegion(regionOf(l), ix, iz)) h = l.level
      return h
    }
  }

  /** Cells connected to the lake's lowest point below its current level, on today's terrain. */
  private wetRegion(l: Lake): Region | null {
    if (l.level <= l.basin.bottom) return null
    return this.wetRegionAt(l.basin.bx, l.basin.bz, l.level)
  }

  /** Every cell connected to (sx, sz) through terrain below `level`: what water at that level covers. */
  private wetRegionAt(sx: number, sz: number, level: number): Region {
    const H = this.H
    const seen = new Set<number>()
    const xs: number[] = [sx]
    const zs: number[] = [sz]
    seen.add(key(sx, sz))
    let x0 = sx
    let x1 = x0
    let z0 = sz
    let z1 = z0
    for (let i = 0; i < xs.length && xs.length < MAX_CELLS; i++) {
      for (let k = 0; k < 4; k++) {
        const nx = xs[i] + (k === 0 ? 1 : k === 1 ? -1 : 0)
        const nz = zs[i] + (k === 2 ? 1 : k === 3 ? -1 : 0)
        const kk = key(nx, nz)
        if (seen.has(kk)) continue
        seen.add(kk)
        if (H(nx, nz) >= level) continue
        xs.push(nx)
        zs.push(nz)
        if (nx < x0) x0 = nx
        if (nx > x1) x1 = nx
        if (nz < z0) z0 = nz
        if (nz > z1) z1 = nz
      }
    }
    const w = x1 - x0 + 1
    const h = z1 - z0 + 1
    const mask = new Uint8Array(w * h)
    for (let i = 0; i < xs.length; i++) mask[(zs[i] - z0) * w + (xs[i] - x0)] = 1
    return { x0, z0, w, h, mask }
  }

  /**
   * Terrain changed inside `box`. Re-flood every lake the change touches, and
   * the new hollow at (sx, sz) if given; any lake whose lowest point ends up
   * inside a new basin pours its water into it.
   */
  onDeform(box: Box, sx?: number, sz?: number): void {
    const pad = 3
    const touched = this.lakes.filter((l) => {
      const b = l.basin
      return b.x0 - pad <= box.x1 && b.x0 + b.w + pad >= box.x0 && b.z0 - pad <= box.z1 && b.z0 + b.h + pad >= box.z0
    })
    const seeds: Array<[number, number]> = touched.map((l) => [l.basin.bx, l.basin.bz])
    if (sx !== undefined && sz !== undefined) seeds.push([Math.round(sx), Math.round(sz)])
    const wet = new Map<Lake, Region>()
    for (const l of touched) {
      const r = this.wetRegion(l)
      if (r) wet.set(l, r)
    }
    this.reflood(seeds, wet)
  }

  /** Returns false (changing nothing) if `refuseCapped` and a flood ran into lowland. */
  private reflood(
    seeds: Array<[number, number]>,
    wet?: Map<Lake, Region>,
    lift?: (x: number, z: number, h: number) => number,
    refuseCapped = false,
  ): boolean {
    const S = this.surface(wet)
    const E: CellHeight = lift ? (x, z) => lift(x, z, S(x, z)) : S
    const fresh: Basin[] = []
    for (const [x, z] of seeds) {
      if (fresh.some((b) => inBasin(b, x, z))) continue
      const b = floodBasin(this.H, E, x, z)
      if (!b) continue
      if (b.capped) {
        // Water here would run off into lowland. Merges refuse outright;
        // otherwise skip it and leave whatever lake was there as it was.
        if (refuseCapped) return false
        continue
      }
      // A later flood can swallow an earlier one (it crossed onto its surface).
      for (let i = fresh.length - 1; i >= 0; i--) if (inBasin(b, fresh[i].bx, fresh[i].bz)) fresh.splice(i, 1)
      fresh.push(b)
    }
    for (const basin of fresh) {
      const lake: Lake = { id: 0, basin, volume: 0, level: basin.bottom, carry: 0, version: 0 }
      let biggest = -1
      for (let i = this.lakes.length - 1; i >= 0; i--) {
        const old = this.lakes[i]
        if (!inBasin(basin, old.basin.bx, old.basin.bz)) continue
        lake.volume += old.volume
        lake.carry += old.carry
        // The largest lake absorbed keeps its id: a growing lake stays "the same lake".
        if (old.basin.sorted.length > biggest) {
          biggest = old.basin.sorted.length
          lake.id = old.id
        }
        lake.version = Math.max(lake.version, old.version)
        this.lakes.splice(i, 1)
      }
      if (lake.id === 0) lake.id = this.nextId++
      const cap = volumeAt(basin, basin.spill)
      if (lake.volume > cap) {
        lake.carry += lake.volume - cap
        lake.volume = cap
      }
      lake.level = levelFor(basin, lake.volume)
      lake.version++
      this.lakes.push(lake)
    }
    for (const l of this.lakes) l.down = undefined
    return true
  }

  byId(id: number): Lake | undefined {
    return this.lakes.find((l) => l.id === id)
  }

  /**
   * The lake downhill of this lake's exit. Spill that runs into a hollow with
   * no lake yet makes one there (a pool in a trench, behind a rim), as long
   * as the hollow is small; a big natural lowland is left for the river phase
   * and the water is lost.
   */
  downstream(l: Lake): Lake | null {
    if (l.down === undefined) {
      l.down = 0
      const b = l.basin
      let ex = b.ex
      let ez = b.ez
      // Follow the water downhill. Spilled water cannot run back into the
      // lake it came from (its bed is a wall). A hollow too small to matter
      // fills at once — it is raised to its spill height in `filled` — and
      // the water runs on from its exit; filling is what stops it bouncing
      // between two neighbouring pits, and lets adjacent pits combine.
      const filled = new Map<number, number>()
      const real: CellHeight = (x, z) => (inBasin(b, x, z) ? Infinity : this.H(x, z))
      const H: CellHeight = (x, z) => filled.get(key(x, z)) ?? real(x, z)
      const path: number[] = []
      for (let hop = 0; hop < 256 && !Number.isNaN(ex); hop++) {
        const [dx, dz] = descend(H, ex, ez, path)
        const d = this.lakes.find((o) => inBasin(o.basin, dx, dz))
        if (d) {
          if (d !== l) {
            l.down = d.id
            l.path = path
          }
          break
        }
        // Bed measured on real terrain, flooded over the filled surface: the
        // pool stops at the saddle back to the lake feeding it. Once it fills
        // to that saddle, step() merges the two — that is how a trench
        // becomes a canal.
        const pool = floodBasin(real, H, dx, dz, 1)
        if (!pool) {
          ;[ex, ez] = lowestExit(H, dx, dz)
          continue
        }
        if (pool.capped) break // running off into lowland: lost, for now
        if (pool.sorted.length >= POOL_MIN) {
          if (pool.sorted.length <= POOL_MAX) {
            const p: Lake = { id: this.nextId++, basin: pool, volume: 0, level: pool.bottom, carry: 0, version: 1 }
            this.lakes.push(p)
            l.down = p.id
            l.path = path
          }
          break
        }
        for (let j = 0; j < pool.h; j++) {
          for (let i = 0; i < pool.w; i++) {
            if (!pool.mask[j * pool.w + i]) continue
            const k = key(pool.x0 + i, pool.z0 + j)
            filled.set(k, pool.spill)
            path.push(k)
          }
        }
        ex = pool.ex
        ez = pool.ez
      }
    }
    return l.down ? (this.byId(l.down) ?? null) : null
  }

  /**
   * A world you return to has had its rain: fill every lake to its brim, let
   * the spill find (and fill) the pools below, and let surfaces that now meet
   * merge — repeated until nothing changes.
   */
  fillAll(): void {
    for (let round = 0; round < 64; round++) {
      for (const l of this.lakes) {
        l.volume = volumeAt(l.basin, l.basin.spill)
        l.level = l.basin.spill
        l.carry = 0
      }
      const count = this.lakes.length
      for (const l of [...this.lakes]) this.downstream(l) // may create pools
      this.step(0) // may merge one pair
      if (this.lakes.length === count && this.lakes.every((l) => this.isFull(l))) break
    }
  }

  isFull(l: Lake): boolean {
    return l.level >= l.basin.spill
  }

  /** Rain, spill and merge. Returns true if any lake changed. */
  step(dt: number): boolean {
    if (this.lakes.length === 0) return false
    let changed = false
    // Upstream first: a lake with a higher spill pours into lower ones.
    const order = [...this.lakes].sort((a, b) => b.basin.spill - a.basin.spill)
    for (const l of order) {
      const cap = volumeAt(l.basin, l.basin.spill)
      let v = l.volume + l.carry + this.rainRate * l.basin.sorted.length * dt
      l.carry = 0
      if (v > cap) {
        const d = this.downstream(l)
        if (d) d.carry += v - cap
        v = cap
      }
      if (v !== l.volume) {
        l.volume = v
        l.level = levelFor(l.basin, v)
        changed = true
      }
    }
    // Merge one pair per step whose surfaces have met at the saddle.
    for (const l of order) {
      if (!this.lakes.includes(l) || !this.isFull(l)) continue
      const d = this.downstream(l)
      if (!d || d.level < l.basin.spill) continue
      // Keyed on shape, not version: a failed attempt itself bumps versions.
      const pair = `${l.id}:${l.basin.sorted.length}:${d.id}:${d.basin.sorted.length}`
      if (this.failed.has(pair)) continue
      const before = this.lakes.length
      // Flood from this lake across where each lake's water really reaches
      // today, each at ITS OWN level, out to the true combined outlet.
      // (Raising both to the higher level once pushed water over the lower
      // lake's banks and across the plain.) If the surfaces do not connect,
      // the pair stays two full lakes, which reads fine.
      const wet = new Map<Lake, Region>()
      for (const k of [l, d]) {
        const r = this.wetRegion(k)
        if (r) wet.set(k, r)
      }
      const lb = l.basin
      const ok = this.reflood([[lb.bx, lb.bz]], wet, undefined, true)
      if (!ok) {
        this.failed.add(pair)
        continue
      }
      if (this.lakes.length >= before) this.failed.add(pair) // surfaces did not actually connect
      changed = true
      break
    }
    return changed
  }

  private readonly failed = new Set<string>()
}
