// Lakes: rain fills Titan footprints up to the lowest point of their rim.
//
// A basin is found with a priority flood (Barnes et al. 2014): grow a region
// from the hollow's lowest cell, always taking the lowest cell on its edge.
// The water level is the highest height taken so far; the moment the next
// cell is LOWER than that, the flood has crossed a saddle — that height is
// the spill height, and every cell taken below it is lake bed.
//
// Deterministic (heap ties break by insertion order, arithmetic only), so
// the server can own lakes later and clients can predict them.

export type CellHeight = (ix: number, iz: number) => number

export interface Basin {
  x0: number // bbox origin (integer world coords)
  z0: number
  w: number
  h: number
  mask: Uint8Array // 1 = lake bed, w*h
  bottom: number
  spill: number
  bx: number // lowest cell
  bz: number
  /** Lake-bed heights, ascending, with prefix sums — volume ⇄ level in O(log n). */
  sorted: Float64Array
  prefix: Float64Array
}

const MAX_CELLS = 90000

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

/** Walk downhill from (sx, sz) to the local minimum. */
export function descend(H: CellHeight, sx: number, sz: number): [number, number] {
  let x = sx
  let z = sz
  let h = H(x, z)
  for (let it = 0; it < 2000; it++) {
    let bx = x
    let bz = z
    let bh = h
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue
        const v = H(x + dx, z + dz)
        if (v < bh) {
          bh = v
          bx = x + dx
          bz = z + dz
        }
      }
    }
    if (bx === x && bz === z) break
    x = bx
    z = bz
    h = bh
  }
  return [x, z]
}

/** The basin that holds water poured at (sx, sz), or null if it holds none. */
export function floodBasin(H: CellHeight, sx: number, sz: number): Basin | null {
  const [mx, mz] = descend(H, sx, sz)
  const heap = new Heap()
  const seen = new Set<number>()
  const cellsX: number[] = []
  const cellsZ: number[] = []
  const cellsH: number[] = []
  const top = [0, 0, 0]
  const h0 = H(mx, mz)
  heap.push(h0, mx, mz)
  seen.add(key(mx, mz))
  let level = h0
  let spill = h0
  while (heap.size > 0) {
    heap.pop(top)
    const [hc, cx, cz] = top
    if (hc < level - 1e-6 || cellsX.length >= MAX_CELLS) {
      spill = level
      break
    }
    level = hc
    spill = level
    cellsX.push(cx)
    cellsZ.push(cz)
    cellsH.push(hc)
    for (let k = 0; k < 4; k++) {
      const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0)
      const nz = cz + (k === 2 ? 1 : k === 3 ? -1 : 0)
      const kk = key(nx, nz)
      if (seen.has(kk)) continue
      seen.add(kk)
      heap.push(H(nx, nz), nx, nz)
    }
  }

  let x0 = Infinity
  let z0 = Infinity
  let x1 = -Infinity
  let z1 = -Infinity
  const bed: number[] = []
  for (let i = 0; i < cellsX.length; i++) {
    if (cellsH[i] >= spill) continue
    bed.push(i)
    if (cellsX[i] < x0) x0 = cellsX[i]
    if (cellsX[i] > x1) x1 = cellsX[i]
    if (cellsZ[i] < z0) z0 = cellsZ[i]
    if (cellsZ[i] > z1) z1 = cellsZ[i]
  }
  if (bed.length < 4) return null
  const w = x1 - x0 + 1
  const h = z1 - z0 + 1
  const mask = new Uint8Array(w * h)
  const heights = new Float64Array(bed.length)
  for (let j = 0; j < bed.length; j++) {
    const i = bed[j]
    mask[(cellsZ[i] - z0) * w + (cellsX[i] - x0)] = 1
    heights[j] = cellsH[i]
  }
  heights.sort()
  const prefix = new Float64Array(heights.length + 1)
  for (let i = 0; i < heights.length; i++) prefix[i + 1] = prefix[i] + heights[i]
  return { x0, z0, w, h, mask, bottom: h0, spill, bx: mx, bz: mz, sorted: heights, prefix }
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
  const cap = volumeAt(b, b.spill)
  if (volume >= cap) return b.spill
  // Find k cells such that the level lies between sorted[k-1] and sorted[k].
  let lo = 1
  let hi = b.sorted.length
  while (lo < hi) {
    const m = (lo + hi) >> 1
    // volume if the level were exactly sorted[m]
    const vm = m * b.sorted[m] - b.prefix[m]
    if (vm < volume) lo = m + 1
    else hi = m
  }
  return (volume + b.prefix[lo]) / lo
}

export interface Lake {
  id: number
  basin: Basin
  volume: number
  level: number
  /** Bumped whenever the basin (shape) changes; renderers rebuild on change. */
  version: number
}

/**
 * All lakes in a region. Rain adds volume to every lake at `rainRate` metres
 * of depth per second over its full bed; a lake stops at its spill height
 * (the overflow becomes rivers in a later phase).
 */
export class LakeSystem {
  readonly lakes: Lake[] = []
  private nextId = 1

  constructor(public rainRate = 0.08) {}

  /**
   * Terrain changed inside the box (integer world coords). Re-flood every lake
   * the change touches, plus a new hollow at (sx, sz) if given, merging
   * basins that now share bed and carrying their water over.
   */
  onDeform(H: CellHeight, box: { x0: number; z0: number; x1: number; z1: number }, sx?: number, sz?: number): void {
    const pad = 2
    const hit = this.lakes.filter((l) => {
      const b = l.basin
      return b.x0 - pad <= box.x1 && b.x0 + b.w + pad >= box.x0 && b.z0 - pad <= box.z1 && b.z0 + b.h + pad >= box.z0
    })
    const seeds: Array<[number, number, Lake | null]> = hit.map((l) => [l.basin.bx, l.basin.bz, l])
    if (sx !== undefined && sz !== undefined) seeds.push([Math.round(sx), Math.round(sz), null])

    const fresh: Lake[] = []
    for (const [x, z, old] of seeds) {
      let into = fresh.find((f) => inBasin(f.basin, x, z))
      if (!into) {
        const basin = floodBasin(H, x, z)
        if (!basin) continue
        into = fresh.find((f) => f.basin.bx === basin.bx && f.basin.bz === basin.bz)
        if (!into) {
          into = { id: 0, basin, volume: 0, level: basin.bottom, version: 0 }
          fresh.push(into)
        }
      }
      if (old) {
        into.volume += old.volume
        // The first predecessor keeps its id, so a growing lake stays "the same lake".
        if (into.id === 0) into.id = old.id
        into.version = Math.max(into.version, old.version)
      }
    }
    for (const l of hit) this.lakes.splice(this.lakes.indexOf(l), 1)
    for (const f of fresh) {
      if (f.id === 0) f.id = this.nextId++
      f.volume = Math.min(f.volume, volumeAt(f.basin, f.basin.spill))
      f.level = levelFor(f.basin, f.volume)
      f.version++
      this.lakes.push(f)
    }
  }

  /** Rain. Returns true if any level changed. */
  step(dt: number): boolean {
    let changed = false
    for (const l of this.lakes) {
      const cap = volumeAt(l.basin, l.basin.spill)
      if (l.volume >= cap) continue
      l.volume = Math.min(cap, l.volume + this.rainRate * l.basin.sorted.length * dt)
      l.level = levelFor(l.basin, l.volume)
      changed = true
    }
    return changed
  }
}

export function inBasin(b: Basin, x: number, z: number): boolean {
  const i = x - b.x0
  const j = z - b.z0
  return i >= 0 && j >= 0 && i < b.w && j < b.h && b.mask[j * b.w + i] === 1
}
