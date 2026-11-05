// Terrain height = baseHeight (pure, seeded, never stored)
//                + delta      (sparse tiles of what players did, persisted).
//
// Everything here is shared by client and server, so it must stay
// deterministic: noise from ./noise, polynomials only, no transcendental math.

import { makeSimplex2, smoothstep, type Noise2 } from './noise'
import { Regions, type RegionWeights } from './regions'
import { DELTA_TILE, LAND_EDGE, MOUNTAINS_FULL, SPREAD } from './constants'
import { poolBowl } from './mire'

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
/**
 * Dune crests (QA cycle 7: the ridged noise made symmetric V ridges — two flat planes meeting at a
 * knife edge, read as geometry, not sand). As ridged, but the first octave's crest is rounded (a
 * smooth |n|) and its flanks unequal: a long gentle side and a steeper slip face.
 */
function duneRidge(n: Noise2, x: number, y: number, octaves: number): number {
  let sum = 0
  let amp = 0.5
  let weight = 1
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    const a = n(x, y)
    // (Smooth |a|, rounded over ~0.07 of the crest; one side 0.55×, the other 0.8× as steep as before — a
    // steeper slip face crossed the rock threshold and painted red cliff on the sand.)
    const s = a >= 0 ? a * 0.55 : -a * 0.8
    const e = o === 0 ? 0.07 : 0.02
    let r = Math.max(0, 1 - (Math.sqrt(s * s + e * e) - e))
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
  private readonly w: RegionWeights = { valley: 0, forest: 0, desert: 0, ruins: 0, mire: 0 }

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
    // (Measured before the Pit exists: NaN skips it in height().)
    this.pitTop = this.height(PIT.x + PIT.r + 40, PIT.z)
    // Where the High Places' stair starts, the ground it starts from.
    {
      const R = (HIGH.foot + HIGH.lip) / 2
      const a = HIGH.axis + (HIGH.a0 * R) / (HIGH.foot - 220)
      this.stairY0 = this.height(Math.sin(a) * (HIGH.foot - 220), Math.cos(a) * (HIGH.foot - 220))
    }
  }

  /** Ground level at the Undercroft (its roof); the floor is HALL.depth below. */
  hallTop = NaN
  /** Ground level round the Pit's lip. */
  pitTop = NaN
  /** Ground level at the foot of the High Places' stair. */
  stairY0 = NaN

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
      const crest = duneRidge(this.dunes, u * 0.0042, v * 0.0013, 3)
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
    // Marsh: where the Wood's hills give way (its weight is taken from the
    // Wood's, so the hills fade out here) — a low hollow among them, hummocks a
    // metre or two high, the pools sunk four metres into it.
    if (r.mire > 0.001) {
      h += r.mire * (1.6 * fbm(this.hills, wx * 0.006 + 9.9, wz * 0.006 - 4.1, 2) - 3)
      h -= r.mire * 4 * poolBowl(x, z)
    }
    if (!Number.isNaN(this.hallTop)) {
      h += dell(x, z, this.hills)
      const out = Math.max(Math.abs(x - HALL.x) - HALL.hx, Math.abs(z - HALL.z) - HALL.hz)
      // The ground meets the Undercroft's roof all round it (its stair lands
      // on the grass, not under a step of roof edge), easing out over 200 m.
      if (out < 220) h += (this.hallTop - h) * (1 - smoothstep(10, 220, out))
      // The pit: sheer sides, a flat floor. (The drop all inside the hall's walls,
      // under the roof's edge: outside them the grass is flush with the plaza, no lip
      // too steep to walk up where the stair comes out.)
      if (inHall(x, z, 4)) h += (this.hallTop - HALL.depth - h) * (1 - smoothstep(-5, -0.2, out))
    }
    // The Pit: a sinkhole in the Green (user: "a perfectly round hole reads
    // badly — a realistic sinkhole instead"). The ground slumps and cracks
    // toward a ragged rim; below it, walls of broken rock in layers, going down
    // a long way; on one side the wall has collapsed into a steep slope of
    // rubble you can climb down into the dark.
    const pdx = x - PIT.x
    const pdz = z - PIT.z
    const pd = Math.sqrt(pdx * pdx + pdz * pdz)
    if (!Number.isNaN(this.pitTop) && pd < PIT.r * 2.2) {
      const ux = pd > 1e-3 ? pdx / pd : 1
      const uz = pd > 1e-3 ? pdz / pd : 0
      // The rim wanders in and out round the hole.
      const edge = PIT.r * (1 + 0.3 * this.rock(ux * 1.6 + 3.1, uz * 1.6 - 1.7) + 0.12 * this.rock(ux * 4.3 - 2.2, uz * 4.3 + 5.5))
      const t = pd / edge + 0.04 * this.rock(x * 0.09, z * 0.09)
      // The slump: the ground sags and breaks toward the rim.
      if (t < 1.5) {
        const sag = 1 - smoothstep(0.95, 1.5, t)
        h += (this.pitTop - h) * 0.7 * (1 - smoothstep(1.0, 1.5, t)) - 7 * sag * sag
      }
      if (t < 1.02) {
        // Walls of broken rock, in layers, down to a rubble floor far below.
        const wall = PIT.depth * strata(smoothstep(1.02, 0.7, t), 6) + 9 * this.rock(x * 0.05 + 4, z * 0.05)
        // The collapse: one side fallen in, a slope of rubble (~40°) down to about half the depth.
        const side = smoothstep(0.25, 0.55, this.rock(ux * 1.1 - 6.3, uz * 1.1 + 2.9))
        const slope = Math.min(PIT.depth * 0.55, (1.02 - t) * edge * 0.85) + 4 * this.rock(x * 0.12, z * 0.12)
        h -= wall + (slope - wall) * side * smoothstep(0.15, 0.4, t)
      }
    }

    // The Shore: the Dune Sea goes down a long beach into the sea (the mountains break for it).
    const sector = shoreSector(x, z)
    if (sector > 0) {
      const ang = Math.atan2(x, z)
      // The coast wanders in and out.
      const coast = SHORE.coast + 520 * this.mask(ang * 3.3 + 2.1, 7.3) + 160 * this.rock(x * 0.0021, z * 0.0021)
      const u = d - coast
      const sea = SHORE.sea
      // Inland: the dunes come down to a beach a few metres above the water; out from the edge
      // the bed shelves gently, then falls away to the deep (and deeper still where the Wader stands).
      const trench = Math.exp(-((x / 2900) ** 2) - (((z - SHORE.waderD) / 1000) ** 2))
      const bed = sea + 6 * (1 - smoothstep(-500, 0, u)) - 26 * smoothstep(0, 900, u) - 70 * smoothstep(900, 3200, u) - 120 * trench
      const ripple = 1.4 * this.dunes(x * 0.02, z * 0.006) * (1 - smoothstep(0, 400, u))
      const k = sector * smoothstep(-2400, -1100, u)
      h += (bed + ripple - h) * k
    }

    // The High Places: a cliff up to a plateau, and a stair cut up its face.
    const hsec = highSector(x, z)
    if (hsec > 0 && d > HIGH.foot - 900 && d < HIGH.far + 1200) {
      const top = HIGH.top + 22 * fbm(this.hills, x * 0.0011 + 1.7, z * 0.0011 - 6.2, 3)
      const rise = smoothstep(HIGH.foot, HIGH.lip, d + 90 * this.mask(x * 0.0009 + 3.3, z * 0.0009))
      // Layered rock, ledge over ledge, all the way up.
      const cliff = top * strata(rise, 9) * (1 - smoothstep(HIGH.far, HIGH.far + 1200, d))
      let up = Math.max(h, cliff)
      // The stair: a straight cut in (distance, arc) — a long diagonal across the face.
      let a = Math.atan2(x, z) - HIGH.axis
      a = Math.atan2(Math.sin(a), Math.cos(a))
      const R = (HIGH.foot + HIGH.lip) / 2
      const p0d = HIGH.foot - 220, p0a = HIGH.a0 * R
      const p1d = HIGH.lip + 160, p1a = HIGH.a1 * R
      const sd = p1d - p0d, sa = p1a - p0a
      const len = Math.hypot(sd, sa)
      const qd = d - p0d, qa = a * R - p0a
      const t = Math.min(1, Math.max(0, (qd * sd + qa * sa) / (len * len)))
      const side = Math.abs(qd * sa - qa * sd) / len
      if (side < 16 && t > 0 && t < 1) {
        // From the land at its foot to the plateau, in 3 m steps, evenly (measured from the
        // ground under each step, the Steps' terraces made parts of it a 59° climb).
        const base = Number.isNaN(this.stairY0) ? h : this.stairY0
        const sh = base + (HIGH.top - base) * t
        // (2 m risers, each over half a step's run: ~37° at the riser, walkable; 3 m on a short
        // riser was a 63° wall at every step.)
        const step = 2
        const k = sh / step
        const stepped = (Math.floor(k) + smoothstep(0.5, 1, k - Math.floor(k))) * step
        const w = 1 - smoothstep(7, 16, side)
        up += (stepped - up) * w
      }
      h += (up - h) * hsec
    }

    // Mountains ring the world from ~2.7 km, irregular via their own noise. A
    // broad massif lifts the range; ridges are carved into it at a long
    // wavelength so the skyline reads as ranges, not needles.
    // (Grown with the world: wider ranges, higher, further out.)
    const mk = 0.0006 / SPREAD
    const belt = smoothstep(LAND_EDGE, MOUNTAINS_FULL, d + 700 * SPREAD * this.mask(x * mk - 9.1, z * mk + 4.4))
    // (Over the High Places' plateau the mountains hold back until its far side.)
    const beltHold = 1 - hsec * (1 - smoothstep(HIGH.far, HIGH.far + 1500, d))
    if (belt > 0 && sector < 1 && beltHold > 0) {
      const massif = 0.5 + 0.5 * fbm(this.mask, wx * 0.0002 + 3.3, wz * 0.0002 - 8.8, 3)
      const rr = ridged(this.peaks, wx * 0.00026, wz * 0.00026, 6)
      h += belt * (1 - sector) * beltHold * (massif * 620 + rr * rr * 1000 * (0.4 + massif))
    }

    // The Wall (user, 2026-10-31: "very very far edge mountains, very tall…
    // unreachable… silhouettes in the fog's background, still smaller than
    // giants"): a range 1.5–3 km high from ~13 km out, seen whole only on a
    // clear day. You are small beside it; the colossi beyond it stand two or
    // three times its height, their chests and heads clear above its crest.
    const wk = 0.00009
    const wallD = d + 2600 * this.mask(x * wk + 5.5, z * wk - 2.2)
    const wall = smoothstep(18000, 22000, wallD) * (1 - smoothstep(25000, 28000, wallD))
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
      // (Rarer than they were: a mesa should stand alone on its plain.) Sheer
      // sides, and a narrow band: where the noise only just reaches the top, a
      // wide band raised a smooth stepped cone (pale pyramids on the skyline).
      const top = smoothstep(0.4, 0.405, m)
      if (top > 0) {
        // Only where the mesa is broad (Q57: where the noise only just peaked over the line, a
        // 70–150 m column stood on a footprint of a few metres and meshed as a smooth cone). Look
        // 30 m round: a real mesa's edge has stone on its inward side; a needle has none.
        let inside = 0
        for (let k = 0; k < 6; k++) {
          const ax = wx + Math.cos(k * 1.047) * 30
          const az = wz + Math.sin(k * 1.047) * 30
          if (fbm(this.rock, ax * 0.00085 + 4.4, az * 0.00085 - 9.9, 3) > 0.4) inside++
        }
        const broad = smoothstep(0.5, 2.5, inside)
        if (broad > 0) h += stone * strata(top, 4) * broad * (70 + 80 * (0.5 + 0.5 * this.rock(wx * 0.0006 + 3.1, wz * 0.0006 - 5.3)))
      }
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
/** The Pit on the Green: centre, radius, depth. */
export const PIT = { x: 1700, z: 1950, r: 46, depth: 240 }

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

/**
 * The dell (user, 2026-11-03: "when i exit the dungeon… 3 walking giants, one flying, 2
 * colossi and more… all spoiler"): the Undercroft's stair comes up in a shallow bowl of
 * grass. A rim of rises 30–70 m high about 450 m out hides the land beyond, all but one
 * gap where the Walker is (the opening shot looks out through it). Climb the rim and the
 * Green opens out.
 */
export const DELL = { x: -150, z: 1525, crest: 470, fall: 1050, gapX: 1100, gapZ: 900 }

function dell(x: number, z: number, hills: Noise2): number {
  const ex = x - DELL.x
  const ez = z - DELL.z
  const r = Math.sqrt(ex * ex + ez * ez)
  if (r < 240 || r > DELL.fall + 450) return 0
  // East, the Undercroft's roof runs 420 m on from the stair (and the ground round it is held
  // flat): the rim stands farther out there, and taller, to hide as much.
  const east = smoothstep(0.1, 0.75, ex / r)
  const crest = DELL.crest + 380 * east
  const rise = smoothstep(240 + 380 * east, crest, r) * (1 - smoothstep(crest + 150, DELL.fall + 450 * east, r))
  // The gap: open within ~14° of the Walker's way, closed past ~26°.
  const gx = DELL.gapX - DELL.x
  const gz = DELL.gapZ - DELL.z
  const c = (ex * gx + ez * gz) / (r * Math.sqrt(gx * gx + gz * gz))
  const open = smoothstep(Math.cos(0.46), Math.cos(0.24), c)
  // Rises of different heights, not a wall: the noise goes round the bowl.
  const a = Math.atan2(ez, ex)
  const tall = (60 + 45 * east) * (0.7 + 0.6 * fbm(hills, Math.cos(a) * 2.2 + 40, Math.sin(a) * 2.2 - 13, 3)) + 6 * hills(x * 0.01, z * 0.01)
  return rise * (1 - open) * tall
}

/**
 * The Shore (CHECKLIST: "the Shore, beyond the Dune Sea"): due south, where the mountains
 * that ring the world break, the Dune Sea runs down a long beach into a sea that goes out to
 * the Wall. `sea` its level; `coast` how far out (from the centre) the water's edge lies, on
 * average; `half` the half-width of the gap in the mountains (radians from due south).
 * Out in it, deep water: one of them stands there (client: the Wader).
 */
export const SHORE = { sea: -4, coast: 9700, half: 0.42, waderD: 12000 }

/** 0 … 1: how much of (x, z)'s direction is the Shore's gap (1 toward due south). */
export function shoreSector(x: number, z: number): number {
  const a = Math.abs(Math.atan2(x, z))
  return 1 - smoothstep(SHORE.half * 0.75, SHORE.half * 1.25, a)
}

/** Is (x, z) out past the beach (where the sea may be)? (The water's edge itself is wherever the ground goes under SHORE.sea.) */
export function seaward(x: number, z: number): boolean {
  return shoreSector(x, z) > 0.02 && Math.hypot(x, z) > SHORE.coast - 1200
}

/**
 * The High Places (CHECKLIST: "beyond the Steps"): north-east, past the Steps, the land stands
 * up in one great cliff to a plateau above the cloud deck's base, snow on it. A stair is cut
 * up the cliff's face on a long diagonal (~21°, in 2 m steps: walkable). On top, a glacier, and one
 * of them frozen in it (client: the Frozen One).
 * `axis` the direction (atan2(x, z)); `half` the sector's half-width; `foot`/`lip` the cliff's
 * foot and top (metres from the centre); `top` the plateau's height; `far` where the mountains
 * take over again. The stair runs from (`foot` − 220, axis + `a0`) to (`lip` + 160, axis + `a1`).
 */
export const HIGH = { axis: Math.atan2(0.866, -0.5), half: 0.24, foot: 11900, lip: 12550, top: 820, far: 15600, a0: -0.07, a1: 0.065, frozenD: 13900 }

/** 0 … 1: how much of (x, z)'s direction is the High Places'. */
export function highSector(x: number, z: number): number {
  let a = Math.atan2(x, z) - HIGH.axis
  a = Math.atan2(Math.sin(a), Math.cos(a))
  return 1 - smoothstep(HIGH.half * 0.7, HIGH.half * 1.2, Math.abs(a))
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
/** A millisecond clock that works in the browser and in Node (shared code). */
const nowMs = (): number => (globalThis as { performance?: { now(): number } }).performance?.now() ?? Date.now()

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

  /**
   * Fill the base-height tiles round (x, z) out to `r` metres ahead of need, for at most `budgetMs`
   * (true when all are filled). A walking giant's next footfalls land on fresh ground, and filling
   * their tiles then (4096 noise samples each) was most of a footstep's lake work — 7 ms a step, 20
   * at worst (the user, 2026-11-05: "whenever giants take a step, there is big frame lag").
   */
  warmCells(x: number, z: number, r: number, budgetMs: number): boolean {
    const t0 = nowMs()
    const tx0 = Math.floor((x - r) / DELTA_TILE)
    const tx1 = Math.floor((x + r) / DELTA_TILE)
    const tz0 = Math.floor((z - r) / DELTA_TILE)
    const tz1 = Math.floor((z + r) / DELTA_TILE)
    for (let tz = tz0; tz <= tz1; tz++)
      for (let tx = tx0; tx <= tx1; tx++) {
        if (this.baseTiles.has(DeltaField.key(tx, tz))) continue
        if (nowMs() - t0 > budgetMs) return false
        this.cellHeight(tx * DELTA_TILE, tz * DELTA_TILE)
      }
    return true
  }

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
