// Terrain height = baseHeight (pure, seeded, never stored)
//                + delta      (sparse tiles of what players did, persisted).
//
// Everything here is shared by client and server, so it must stay
// deterministic: noise from ./noise, polynomials only, no transcendental math.

import { makeSimplex2, smoothstep, type Noise2 } from './noise'
import { Regions, type RegionWeights } from './regions'
import { DELTA_TILE, SPREAD } from './constants'

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
  private readonly rock: Noise2
  private readonly canyon: Noise2
  private readonly w: RegionWeights = { valley: 0, forest: 0, desert: 0, ruins: 0 }

  constructor(seed: number) {
    this.regions = new Regions(seed)
    this.warp = makeSimplex2(seed)
    this.plains = makeSimplex2(seed + 101)
    this.hills = makeSimplex2(seed + 202)
    this.peaks = makeSimplex2(seed + 303)
    this.mask = makeSimplex2(seed + 404)
    this.dunes = makeSimplex2(seed + 505)
    this.rock = makeSimplex2(seed + 606)
    this.canyon = makeSimplex2(seed + 707)
    // The ground level the Undercroft's roof sits at (measured with no pit yet).
    this.hallTop = this.height(HALL.x, HALL.z)
  }

  /** Ground level at the Undercroft (its roof); the floor is HALL.depth below. */
  hallTop = NaN

  height(x: number, z: number): number {
    // Domain warp: bends every later feature so nothing reads as a circle.
    const wx = x + 140 * this.warp(x * 0.0011, z * 0.0011)
    const wz = z + 140 * this.warp(x * 0.0011 + 31.7, z * 0.0011 - 17.3)
    const r = this.regions.at(x, z, this.w)

    // Plains: long, low swells plus a little close-range undulation — the
    // valley, and the floor every land is built on.
    let h = 7 * fbm(this.plains, wx * 0.0015, wz * 0.0015, 4)
    h += 0.9 * this.plains(x * 0.018 + 7.1, z * 0.018 - 3.3)

    // The Green: vast smooth swells of grass, a kilometre or so from crest to
    // crest, so the horizon is always a long curve and a giant can sink behind one.
    // (Laid flat over the Undercroft, whose roof is one level.)
    if (r.valley > 0.001) {
      const swell = fbm(this.hills, wx * 0.00085 + 3.7, wz * 0.00085 - 8.1, 3)
      const calm = smoothstep(30, 450, Math.max(Math.abs(x - HALL.x) - HALL.hx, Math.abs(z - HALL.z) - HALL.hz))
      h += r.valley * calm * (68 * (0.5 + 0.5 * swell) + 12 * fbm(this.plains, wx * 0.0018 + 2.2, wz * 0.0018 + 6.6, 2))
    }

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

    const d = Math.sqrt(x * x + z * z)
    h += this.carve(x, z, wx, wz, d, r)
    if (!Number.isNaN(this.hallTop)) {
      const out = Math.max(Math.abs(x - HALL.x) - HALL.hx, Math.abs(z - HALL.z) - HALL.hz)
      // The ground meets the Undercroft's roof all round it (its stair lands
      // on the grass, not under a step of roof edge), easing out over 200 m.
      if (out < 220) h += (this.hallTop - h) * (1 - smoothstep(10, 220, out))
      // The pit: sheer sides, a flat floor.
      if (inHall(x, z, 4)) h += (this.hallTop - HALL.depth - h) * (1 - smoothstep(-3, 3, out))
    }

    // Mountains ring the world from ~2.7 km, irregular via their own noise. A
    // broad massif lifts the range; ridges are carved into it at a long
    // wavelength so the skyline reads as ranges, not needles.
    // (Grown with the world: wider ranges, higher, further out.)
    const mk = 0.0006 / SPREAD
    const belt = smoothstep(2700 * SPREAD, 5200 * SPREAD, d + 700 * SPREAD * this.mask(x * mk - 9.1, z * mk + 4.4))
    if (belt > 0) {
      const massif = 0.5 + 0.5 * fbm(this.mask, wx * 0.0002 + 3.3, wz * 0.0002 - 8.8, 3)
      const rr = ridged(this.peaks, wx * 0.00026, wz * 0.00026, 6)
      h += belt * (massif * 620 + rr * rr * 1000 * (0.4 + massif))
    }

    // The Wall (user, 2026-10-31: "very very far edge mountains, very tall…
    // unreachable… silhouettes in the fog's background, still smaller than
    // giants"): a range 1.5–3 km high from ~13 km out, seen whole only on a
    // clear day. You are small beside it; the colossi beyond it stand two or
    // three times its height, their chests and heads clear above its crest.
    const wk = 0.00009
    const wallD = d + 2600 * this.mask(x * wk + 5.5, z * wk - 2.2)
    const wall = smoothstep(12500, 16500, wallD) * (1 - smoothstep(19500, 22500, wallD))
    if (wall > 0) {
      const crest = ridged(this.peaks, wx * 0.00011 + 7.7, wz * 0.00011 - 3.3, 5)
      h += wall * (1300 + crest * crest * 1900)
    }
    return h
  }

  /**
   * The carving that makes the land dramatic, added to the lands' own shapes.
   * A few big forms, each one you can name from far away:
   *
   * - the escarpment: the three lands stand on a shelf above the valley, a wall
   *   of layered rock between them, broken by a pass toward each land;
   * - fault walls: long winding cliffs where the ground steps up tens of
   *   metres, across the Old Wood and the Steps;
   * - mesas: big flat-topped stones with sheer, banded sides, in the Dune Sea
   *   and the Steps;
   * - canyons: a few deep, winding, flat-floored canyons through each land;
   * - rock spines: ridges of stone through the Wood's hills.
   *
   * The start (the middle of the valley) is left gentle.
   */
  private carve(x: number, z: number, wx: number, wz: number, d: number, r: RegionWeights): number {
    const away = smoothstep(320 * SPREAD, 640 * SPREAD, d)
    if (away <= 0) return 0
    let h = 0
    const lands = 1 - r.valley

    // The escarpment: the shelf rises at the valley's edge, as a wall except
    // through the three passes, where it ramps.
    const shelf = 40 + 32 * (0.5 + 0.5 * this.rock(wx * 0.0011 + 7.7, wz * 0.0011 - 3.1))
    const ragged = 0.06 * this.rock(wx * 0.0045, wz * 0.0045) + 0.025 * this.rock(x * 0.021, z * 0.021)
    const wall = smoothstep(0.44, 0.5, lands + ragged)
    if (wall > 0) {
      const nx = x / (d || 1)
      const nz = z / (d || 1)
      let pass = 0
      for (const [ax, az] of PASSES) pass = Math.max(pass, smoothstep(0.9, 0.975, nx * ax + nz * az))
      h += shelf * ((1 - pass) * strata(wall, 3) + pass * smoothstep(0.15, 0.9, lands))
    }

    // Fault walls: where a slow noise crosses zero, the ground steps up.
    const faults = (r.forest * 45 + r.ruins * 70 + r.desert * 25) * away
    if (faults > 1) {
      const f = this.rock(wx * 0.00028 + 12.5, wz * 0.00028 - 7.5) + 0.012 * this.rock(x * 0.012, z * 0.012)
      h += faults * strata(smoothstep(-0.012, 0.012, f), 3)
    }

    // Mesas: a few big flat-topped stones.
    const stone = (r.desert * 0.95 + r.ruins * 0.6 + r.forest * 0.2) * away
    if (stone > 0.01) {
      // Ragged edges (bays, spurs, fallen corners) so a side is never one plane.
      const m = fbm(this.rock, wx * 0.00085 + 4.4, wz * 0.00085 - 9.9, 3) + 0.045 * this.rock(x * 0.011, z * 0.011) + 0.02 * this.rock(x * 0.04, z * 0.04)
      // (Rarer than they were: a mesa should stand alone on its plain.) Sheer sides.
      const top = smoothstep(0.4, 0.414, m)
      if (top > 0) h += stone * strata(top, 4) * (70 + 80 * (0.5 + 0.5 * this.rock(wx * 0.0006 + 3.1, wz * 0.0006 - 5.3)))
    }

    // Canyons: where a warped, slow noise crosses zero — wide flat floors,
    // walls in bands.
    const depth = (110 * r.desert + 85 * r.ruins + 60 * r.forest) * away
    if (depth > 1) {
      const cx = wx + 160 * this.rock(wx * 0.0013 - 1.7, wz * 0.0013 + 6.2)
      const cz = wz + 160 * this.rock(wx * 0.0013 + 8.8, wz * 0.0013 - 2.6)
      const t = Math.abs(this.canyon(cx * 0.00024, cz * 0.00024))
      const inside = 1 - smoothstep(0.03, 0.052, t)
      if (inside > 0) h -= depth * strata(inside, 4)
    }

    // Rock spines through the Old Wood.
    if (r.forest > 0.05) {
      const sp = ridged(this.rock, wx * 0.0012 - 5.5, wz * 0.0012 + 2.2, 3)
      h += r.forest * away * 50 * strata(smoothstep(0.84, 0.95, sp), 2)
    }
    return h
  }
}

/** Directions of the three passes out of the valley (toward each land's heart). */
const PASSES: Array<[number, number]> = [
  [-0.866, -0.5],
  [0, 1],
  [0.866, -0.5],
]

/** Height of one of the Steps' terraces (metres). */
export const TERRACE = 16

/**
 * The Undercroft: a hall of pillars under the valley floor, south of the
 * start (client/src/hall.ts builds it). The ground is cut away inside its
 * rectangle down to the hall's floor; its roof is a stone plaza at ground
 * level, open at the skylights (local x, z: square holes `sky` across) and
 * over the ramp's mouth at the west end.
 */
export const HALL = {
  x: 60,
  z: 1400,
  hx: 210,
  hz: 150,
  depth: 70,
  sky: 20,
  skylights: [
    [-120, -60],
    [0, 60],
    [120, -30],
    [150, 90],
    [-40, -20],
  ] as Array<[number, number]>,
}

/** Is (x, z) within the Undercroft's rectangle (grown by `margin`)? */
export function inHall(x: number, z: number, margin = 0): boolean {
  return Math.abs(x - HALL.x) < HALL.hx + margin && Math.abs(z - HALL.z) < HALL.hz + margin
}

/**
 * Rock layers: a 0…1 rise quantised into `bands` steps with short, steep
 * risers, so a cliff climbs in ledges like layered stone instead of one smooth
 * ramp.
 */
function strata(t: number, bands: number): number {
  const s = t * bands
  const k = Math.floor(s)
  return Math.min(1, (k + smoothstep(0.55, 1, s - k)) / bands)
}

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
