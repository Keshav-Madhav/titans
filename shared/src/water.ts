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
 * The largest basin a flood will grow (≈ 9 ha). Past it, water is spreading
 * into natural lowland: the flood stops there with no exit, so that water
 * counts as running off (the river phase will route it). This world is dry
 * until Titans bring water; its natural hollows are not lakes.
 */
const MAX_CELLS = 90000
/** Largest natural hollow that spill may turn into a new pool (≈ 1.6 ha). */
const POOL_MAX = 16000
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

/**
 * Every hollow in a window filled to the brim — priority flood inward from
 * the window's edge (Barnes et al. 2014, depression filling). Each cell's
 * filled level is the lowest "highest point" on any path out of the window;
 * cells below it are under water. Returns the full lakes (one Basin each)
 * that contain the given seed cells. Side-by-side hollows sharing a low
 * saddle come out as ONE lake; a terrace spilling downhill stays two.
 */
export function filledBasins(H: CellHeight, x0: number, z0: number, x1: number, z1: number, seeds: Array<[number, number]>): Basin[] {
  const w = x1 - x0 + 1
  const h = z1 - z0 + 1
  const n = w * h
  const Hc = new Float64Array(n)
  const F = new Float64Array(n)
  const closed = new Uint8Array(n)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) Hc[j * w + i] = H(x0 + i, z0 + j)
  const heap = new Heap()
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (i !== 0 && j !== 0 && i !== w - 1 && j !== h - 1) continue
      const k = j * w + i
      F[k] = Hc[k]
      closed[k] = 1
      heap.push(F[k], i, j)
    }
  }
  const top = [0, 0, 0]
  while (heap.size > 0) {
    heap.pop(top)
    const ci = top[1]
    const cj = top[2]
    const fc = top[0]
    for (let q = 0; q < 4; q++) {
      const i = ci + (q === 0 ? 1 : q === 1 ? -1 : 0)
      const j = cj + (q === 2 ? 1 : q === 3 ? -1 : 0)
      if (i < 0 || j < 0 || i >= w || j >= h) continue
      const k = j * w + i
      if (closed[k]) continue
      closed[k] = 1
      F[k] = Hc[k] > fc ? Hc[k] : fc
      heap.push(F[k], i, j)
    }
  }

  const out: Basin[] = []
  const taken = new Uint8Array(n)
  for (const [sx, sz] of seeds) {
    const si = sx - x0
    const sj = sz - z0
    if (si < 0 || sj < 0 || si >= w || sj >= h) continue
    const k0 = sj * w + si
    if (taken[k0] || F[k0] <= Hc[k0] + 1e-6) continue
    // The lake is every cell under the same filled level, connected.
    const level = F[k0]
    const cells: number[] = [k0]
    taken[k0] = 1
    for (let c = 0; c < cells.length; c++) {
      const ci = cells[c] % w
      const cj = (cells[c] - ci) / w
      for (let q = 0; q < 4; q++) {
        const i = ci + (q === 0 ? 1 : q === 1 ? -1 : 0)
        const j = cj + (q === 2 ? 1 : q === 3 ? -1 : 0)
        if (i < 0 || j < 0 || i >= w || j >= h) continue
        const k = j * w + i
        if (taken[k] || Hc[k] >= level - 1e-6 || Math.abs(F[k] - level) > 1e-6) continue
        taken[k] = 1
        cells.push(k)
      }
    }
    let bx0 = Infinity
    let bz0 = Infinity
    let bx1 = -Infinity
    let bz1 = -Infinity
    let bottom = Infinity
    let bx = 0
    let bz = 0
    for (const k of cells) {
      const i = k % w
      const j = (k - i) / w
      bx0 = Math.min(bx0, i)
      bx1 = Math.max(bx1, i)
      bz0 = Math.min(bz0, j)
      bz1 = Math.max(bz1, j)
      if (Hc[k] < bottom) {
        bottom = Hc[k]
        bx = x0 + i
        bz = z0 + j
      }
    }
    const mw = bx1 - bx0 + 1
    const mh = bz1 - bz0 + 1
    const mask = new Uint8Array(mw * mh)
    // The way out: the lowest cell bordering the lake (its saddle).
    let ex = NaN
    let ez = NaN
    let eh = Infinity
    for (const k of cells) {
      const i = k % w
      const j = (k - i) / w
      mask[(j - bz0) * mw + (i - bx0)] = 1
      for (let q = 0; q < 4; q++) {
        const ni = i + (q === 0 ? 1 : q === 1 ? -1 : 0)
        const nj = j + (q === 2 ? 1 : q === 3 ? -1 : 0)
        if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue
        const nk = nj * w + ni
        if (taken[nk] && Hc[nk] < level) continue
        if (Hc[nk] < eh) {
          eh = Hc[nk]
          ex = x0 + ni
          ez = z0 + nj
        }
      }
    }
    const sorted = Float64Array.from(cells.map((k) => Hc[k])).sort()
    const prefix = new Float64Array(sorted.length + 1)
    for (let i = 0; i < sorted.length; i++) prefix[i + 1] = prefix[i] + sorted[i]
    // Lowland, not a lake: too big, or pressed against the window's edge
    // (the water would keep going past it).
    const edge = bx0 <= 1 || bz0 <= 1 || bx1 >= w - 2 || bz1 >= h - 2
    const capped = cells.length > MAX_CELLS || edge
    out.push({ x0: x0 + bx0, z0: z0 + bz0, w: mw, h: mh, mask, bottom, spill: level, bx, bz, ex, ez, sorted, prefix, capped })
  }
  return out
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

/** Identifies a pair of lakes by their shapes (ids alone survive re-floods that change them). */
function shapeKey(l: Lake, d: Lake): string {
  return `${l.id}:${l.basin.sorted.length}:${d.id}:${d.basin.sorted.length}`
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
  surface(wet?: Map<Lake, Region>, exclude?: ReadonlySet<Lake>): CellHeight {
    const H = this.H
    const index = new Map<number, Lake[]>()
    const regionOf = (l: Lake): Region => wet?.get(l) ?? l.basin
    for (const l of this.lakes) {
      if (l.level <= l.basin.bottom || exclude?.has(l)) continue
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
    exclude?: ReadonlySet<Lake>,
  ): boolean {
    const S = this.surface(wet, exclude)
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
          if (d !== l && !this.lowland.has(shapeKey(l, d))) {
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
    // Rain for real (a step with no rain never overflows, so the merges that
    // only happen when water spills never fired), until a step changes nothing.
    // Big giants mean many merges (one per step): give it room, but never
    // more than a couple of seconds (the loading screen covers it).
    let calm = 0
    let round = 0
    const until = Date.now() + 2500
    for (; round < 1500 && calm < 2 && Date.now() < until; round++) {
      for (const l of this.lakes) {
        l.volume = volumeAt(l.basin, l.basin.spill)
        l.level = l.basin.spill
        l.carry = 0
      }
      const count = this.lakes.length
      const shapes = this.lakes.map((l) => l.basin.sorted.length).join(',')
      this.step(30)
      const same = this.lakes.length === count && this.lakes.map((l) => l.basin.sorted.length).join(',') === shapes
      calm = same ? calm + 1 : 0
    }
    this.lastFillRounds = round
    // Whatever the last merge left half-filled: brim-full, as rain would have it.
    for (const l of this.lakes) {
      l.volume = volumeAt(l.basin, l.basin.spill)
      l.level = l.basin.spill
      l.carry = 0
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
      if (!d) continue
      // Keyed on shape, not version: a failed attempt itself bumps versions.
      const pair = shapeKey(l, d)
      // Two full lakes each spilling into the other cannot both be right:
      // settle them first (each distinct shape is tried once).
      if (this.isFull(d) && this.downstream(d) === l) {
        if (!this.resolved.has(pair)) {
          this.resolved.add(pair)
          if (this.resolveMutual(l, d)) {
            changed = true
            break
          }
        } else {
          // Settled once and still each spilling into the other: stop the
          // water circling. Both stay full; their overflow runs off.
          this.lowland.add(shapeKey(l, d))
          this.lowland.add(shapeKey(d, l))
          l.down = 0
          d.down = 0
          continue
        }
      }
      if (d.level < l.basin.spill || this.failed.has(pair)) continue
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
      if (ok && this.lakes.length < before) {
        changed = true
        break
      }
      this.failed.add(pair)
    }
    return changed
  }

  /**
   * A full pair, each spilling into the other. Levels within a hand's
   * breadth: they are one body of water — flood across everything below that
   * level from l's lowest point and out to the true outlet. Levels apart: the
   * higher lake's outline is stale (its water would run over the saddle the
   * lower one spills across), so re-derive both from the real ground,
   * ignoring each other's water; their water is kept, the excess spills on,
   * and next time round they meet at the same level and merge.
   */
  private resolveMutual(l: Lake, d: Lake): boolean {
    // Fill every hollow in a window around both (plus a margin for their
    // rims) and take the lakes that contain their lowest points.
    const pad = 6
    const x0 = Math.min(l.basin.x0, d.basin.x0) - pad
    const z0 = Math.min(l.basin.z0, d.basin.z0) - pad
    const x1 = Math.max(l.basin.x0 + l.basin.w, d.basin.x0 + d.basin.w) + pad
    const z1 = Math.max(l.basin.z0 + l.basin.h, d.basin.z0 + d.basin.h) + pad
    if ((x1 - x0) * (z1 - z0) > MAX_CELLS * 4) return false
    const basins = filledBasins(
      this.H,
      x0,
      z0,
      x1,
      z1,
      [l, d].map((k) => [k.basin.bx, k.basin.bz] as [number, number]),
    )
    if (basins.length === 0) return false
    if (basins.some((b) => b.capped)) {
      // Full, this pair's water spreads onto natural lowland: it runs off
      // there (the river phase routes it) instead of circling between them.
      // Remembered by shape, so a recomputed downstream does not revive the loop.
      this.lowland.add(shapeKey(l, d))
      l.down = 0
      return true
    }
    const water = l.volume + d.volume + l.carry + d.carry
    const old = new Map([
      [l, 0],
      [d, 0],
    ])
    this.lakes.splice(this.lakes.indexOf(l), 1)
    this.lakes.splice(this.lakes.indexOf(d), 1)
    let left = water
    for (const b of basins) {
      // Whichever predecessor's lowest point it holds lends it its id.
      const from = inBasin(b, l.basin.bx, l.basin.bz) ? l : d
      old.set(from, 1)
      const cap = volumeAt(b, b.spill)
      const v = Math.min(cap, left)
      left -= v
      this.lakes.push({ id: from.id, basin: b, volume: v, level: levelFor(b, v), carry: 0, version: Math.max(l.version, d.version) + 1 })
    }
    // Water that no longer fits spills on from the last lake.
    if (left > 0) this.lakes[this.lakes.length - 1].carry += left
    for (const k of this.lakes) k.down = undefined
    return true
  }

  /**
   * Where overflowing water runs: for every full lake, the cells from its
   * spill point to the lake it feeds, or — if it feeds none — downhill over
   * the plain until it soaks into the first hollow (at most `maxRun` cells).
   * Each entry carries a signature so renderers can rebuild only on change.
   */
  streams(maxRun = 320): Array<{ id: number; sig: string; cells: Array<[number, number]> }> {
    const out: Array<{ id: number; sig: string; cells: Array<[number, number]> }> = []
    for (const l of this.lakes) {
      if (!this.isFull(l) || Number.isNaN(l.basin.ex)) continue
      const d = this.downstream(l)
      const sig = `${l.id}:${l.version}:${d ? d.id : 0}`
      let cells: Array<[number, number]>
      if (d && l.path?.length) {
        cells = l.path.map((k) => [Math.floor(k / 65536) - 32768, (k % 65536) - 32768])
      } else {
        // Runoff onto the plain: straight downhill (never back into the lake).
        cells = []
        const b = l.basin
        const H: CellHeight = (x, z) => (inBasin(b, x, z) ? Infinity : this.H(x, z))
        let x = b.ex
        let z = b.ez
        let h = H(x, z)
        for (let i = 0; i < maxRun; i++) {
          cells.push([x, z])
          let nx = x
          let nz = z
          let nh = h
          for (let q = 0; q < 4; q++) {
            const tx = x + (q === 0 ? 1 : q === 1 ? -1 : 0)
            const tz = z + (q === 2 ? 1 : q === 3 ? -1 : 0)
            const th = H(tx, tz)
            if (th < nh) {
              nh = th
              nx = tx
              nz = tz
            }
          }
          if (nx === x && nz === z) break // soaked into a hollow
          x = nx
          z = nz
          h = nh
        }
      }
      if (cells.length >= 3) out.push({ id: l.id, sig, cells })
    }
    return out
  }

  /** Full lakes that each spill into the other (should be none once things settle). */
  mutualPairs(): number {
    let n = 0
    for (const l of this.lakes) {
      const d = this.isFull(l) ? this.downstream(l) : null
      if (d && d.id > l.id && this.isFull(d) && this.downstream(d) === l) n++
    }
    return n
  }

  private readonly failed = new Set<string>()
  /** Rounds the last fillAll() needed (diagnostics). */
  lastFillRounds = 0
  private readonly resolved = new Set<string>()
  /** Pairs (by shape) whose shared overflow runs off into lowland. */
  private readonly lowland = new Set<string>()
}
