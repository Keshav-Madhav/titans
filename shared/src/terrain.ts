// Terrain height = baseHeight (pure, seeded, never stored)
//                + delta      (sparse tiles of what players did, persisted).
//
// Everything here is shared by client and server, so it must stay
// deterministic: noise from ./noise, polynomials only, no transcendental math.

import { makeSimplex2, smoothstep, type Noise2 } from './noise'
import { Regions, type RegionWeights } from './regions'
import { DELTA_TILE } from './constants'

// fBm octave rotation (scaled rotation, as in Inigo Quilez's terrain work):
// rotating every octave hides the grid alignment simplex otherwise shows.
function fbm(n: Noise2, x: number, y: number, octaves: number): number {
  let sum = 0
  let amp = 0.5
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += amp * n(x, y)
    norm += amp
    const nx = 1.6 * x + 1.2 * y
    y = -1.2 * x + 1.6 * y
    x = nx
    amp *= 0.5
  }
  return sum / norm
}

// Ridged multifractal: sharp crests, each octave weighted by the one above,
// so detail gathers on the ridges and valleys stay smooth. Returns ~[0, 1].
function ridged(n: Noise2, x: number, y: number, octaves: number): number {
  let sum = 0
  let amp = 0.5
  let weight = 1
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    let r = 1 - Math.abs(n(x, y))
    r *= r * 0.5 + 0.5
    r *= weight
    weight = r * 2 > 1 ? 1 : r * 2
    sum += r * amp
    norm += amp
    const nx = 1.6 * x + 1.2 * y
    y = -1.2 * x + 1.6 * y
    x = nx
    amp *= 0.5
  }
  return sum / norm
}

/**
 * The world as it was before the giants walked it. Each land has its own
 * shape (see ./regions): a quiet valley of low swells at the centre; the Old
 * Wood's rolling hills; the Dune Sea's long crests; the Steps, broad hills
 * the First Ones cut into terraces. All of it rises, from about 2.7 km out,
 * into the ridged, snow-capped mountains that ring the world.
 */
export class BaseTerrain {
  readonly regions: Regions
  private readonly warp: Noise2
  private readonly plains: Noise2
  private readonly hills: Noise2
  private readonly peaks: Noise2
  private readonly mask: Noise2
  private readonly dunes: Noise2
  private readonly w: RegionWeights = { valley: 0, forest: 0, desert: 0, ruins: 0 }

  constructor(seed: number) {
    this.regions = new Regions(seed)
    this.warp = makeSimplex2(seed)
    this.plains = makeSimplex2(seed + 101)
    this.hills = makeSimplex2(seed + 202)
    this.peaks = makeSimplex2(seed + 303)
    this.mask = makeSimplex2(seed + 404)
    this.dunes = makeSimplex2(seed + 505)
  }

  height(x: number, z: number): number {
    // Domain warp: bends every later feature so nothing reads as a circle.
    const wx = x + 140 * this.warp(x * 0.0011, z * 0.0011)
    const wz = z + 140 * this.warp(x * 0.0011 + 31.7, z * 0.0011 - 17.3)
    const r = this.regions.at(x, z, this.w)

    // Plains: long, low swells plus a little close-range undulation — the
    // valley, and the floor every land is built on.
    let h = 7 * fbm(this.plains, wx * 0.0015, wz * 0.0015, 4)
    h += 0.9 * this.plains(x * 0.018 + 7.1, z * 0.018 - 3.3)

    // The Old Wood: rolling hills.
    if (r.forest > 0.001) h += r.forest * 58 * (0.5 + 0.5 * fbm(this.hills, wx * 0.0021, wz * 0.0021, 4))

    // The Dune Sea: long crests across a wind from the west, on broad swells.
    if (r.desert > 0.001) {
      const u = wx * 0.94 + wz * 0.34
      const v = -wx * 0.34 + wz * 0.94
      const crest = ridged(this.dunes, u * 0.0042, v * 0.0013, 3)
      const swell = 0.5 + 0.5 * fbm(this.dunes, wx * 0.0008 + 9.1, wz * 0.0008 - 4.4, 3)
      h += r.desert * (36 * crest * crest + 22 * swell)
    }

    // The Steps: broad hills, cut by the First Ones into 16 m terraces.
    if (r.ruins > 0.001) {
      const hill = 110 * (0.5 + 0.5 * fbm(this.hills, wx * 0.0011 + 17.3, wz * 0.0011 - 5.2, 4))
      const t = hill / TERRACE
      const f = t - Math.floor(t)
      h += r.ruins * (Math.floor(t) + smoothstep(0.84, 1, f)) * TERRACE
    }

    // Mountains ring the world from ~2.7 km, irregular via their own noise. A
    // broad massif lifts the range; ridges are carved into it at a long
    // wavelength so the skyline reads as ranges, not needles.
    const d = Math.sqrt(x * x + z * z)
    const belt = smoothstep(2700, 5200, d + 700 * this.mask(x * 0.0006 - 9.1, z * 0.0006 + 4.4))
    if (belt > 0) {
      const massif = 0.5 + 0.5 * fbm(this.mask, wx * 0.00032 + 3.3, wz * 0.00032 - 8.8, 3)
      const rr = ridged(this.peaks, wx * 0.00042, wz * 0.00042, 6)
      h += belt * (massif * 380 + rr * rr * 620 * (0.4 + massif))
    }
    return h
  }
}

/** Height of one of the Steps' terraces (metres). */
export const TERRACE = 16


/**
 * Sparse, 1 m-resolution record of terrain changes. Tiles are DELTA_TILE
 * metres square and exist only where something changed; sample (ix, iz) is
 * the delta at integer world coordinates.
 */
export class DeltaField {
  readonly tiles = new Map<number, Float32Array>()

  static key(tx: number, tz: number): number {
    return (tx + 32768) * 65536 + (tz + 32768)
  }

  /** Delta at integer coordinates (0 where nothing has changed). */
  at(ix: number, iz: number): number {
    const tx = Math.floor(ix / DELTA_TILE)
    const tz = Math.floor(iz / DELTA_TILE)
    const tile = this.tiles.get(DeltaField.key(tx, tz))
    if (!tile) return 0
    return tile[(iz - tz * DELTA_TILE) * DELTA_TILE + (ix - tx * DELTA_TILE)]
  }

  /** Mutable tile for integer coordinates, created on first write. */
  tileFor(ix: number, iz: number): { tile: Float32Array; ox: number; oz: number } {
    const tx = Math.floor(ix / DELTA_TILE)
    const tz = Math.floor(iz / DELTA_TILE)
    const k = DeltaField.key(tx, tz)
    let tile = this.tiles.get(k)
    if (!tile) {
      tile = new Float32Array(DELTA_TILE * DELTA_TILE)
      this.tiles.set(k, tile)
    }
    return { tile, ox: tx * DELTA_TILE, oz: tz * DELTA_TILE }
  }

  add(ix: number, iz: number, v: number): void {
    const { tile, ox, oz } = this.tileFor(ix, iz)
    tile[(iz - oz) * DELTA_TILE + (ix - ox)] += v
  }

  set(ix: number, iz: number, v: number): void {
    const { tile, ox, oz } = this.tileFor(ix, iz)
    tile[(iz - oz) * DELTA_TILE + (ix - ox)] = v
  }

  /** Carve down to `v` without filling anything deeper (overlapping cuts don't stack). */
  lowerTo(ix: number, iz: number, v: number): void {
    if (this.at(ix, iz) > v) this.set(ix, iz, v)
  }

  /** Bilinear delta at any point. */
  sample(x: number, z: number): number {
    if (this.tiles.size === 0) return 0
    const ix = Math.floor(x)
    const iz = Math.floor(z)
    const fx = x - ix
    const fz = z - iz
    const a = this.at(ix, iz)
    const b = this.at(ix + 1, iz)
    const c = this.at(ix, iz + 1)
    const d = this.at(ix + 1, iz + 1)
    return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz
  }

  /** True if any tile overlaps the square [x0, x0+size] × [z0, z0+size]. */
  touches(x0: number, z0: number, size: number): boolean {
    if (this.tiles.size === 0) return false
    const tx0 = Math.floor(x0 / DELTA_TILE)
    const tz0 = Math.floor(z0 / DELTA_TILE)
    const tx1 = Math.floor((x0 + size + 1) / DELTA_TILE)
    const tz1 = Math.floor((z0 + size + 1) / DELTA_TILE)
    // A huge far chunk spans thousands of tiles; walk the tiles instead.
    if ((tx1 - tx0 + 1) * (tz1 - tz0 + 1) > this.tiles.size) {
      for (const k of this.tiles.keys()) {
        const tx = Math.floor(k / 65536) - 32768
        const tz = (k % 65536) - 32768
        if (tx >= tx0 && tx <= tx1 && tz >= tz0 && tz <= tz1) return true
      }
      return false
    }
    for (let tz = tz0; tz <= tz1; tz++) {
      for (let tx = tx0; tx <= tx1; tx++) if (this.tiles.has(DeltaField.key(tx, tz))) return true
    }
    return false
  }
}

/** The terrain everyone walks on: base + delta. */
export class Terrain {
  readonly base: BaseTerrain
  readonly delta = new DeltaField()

  constructor(seed: number) {
    this.base = new BaseTerrain(seed)
  }

  heightAt(x: number, z: number): number {
    return this.base.height(x, z) + this.delta.sample(x, z)
  }

  // Base heights at integer cells, cached per tile: lake floods touch
  // hundreds of thousands of cells and the noise is the expensive part.
  private readonly baseTiles = new Map<number, Float32Array>()

  /** Height at integer coordinates (no interpolation) — the lake grid. */
  readonly cellHeight = (ix: number, iz: number): number => {
    const tx = Math.floor(ix / DELTA_TILE)
    const tz = Math.floor(iz / DELTA_TILE)
    const k = DeltaField.key(tx, tz)
    let t = this.baseTiles.get(k)
    if (!t) {
      if (this.baseTiles.size > 3000) this.baseTiles.clear()
      t = new Float32Array(DELTA_TILE * DELTA_TILE)
      for (let j = 0; j < DELTA_TILE; j++) {
        for (let i = 0; i < DELTA_TILE; i++) t[j * DELTA_TILE + i] = this.base.height(tx * DELTA_TILE + i, tz * DELTA_TILE + j)
      }
      this.baseTiles.set(k, t)
    }
    return t[(iz - tz * DELTA_TILE) * DELTA_TILE + (ix - tx * DELTA_TILE)] + this.delta.at(ix, iz)
  }
}
