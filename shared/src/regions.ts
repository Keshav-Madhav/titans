// The four lands of the world, as weights that sum to 1 at every point:
//
//   valley — the quiet green valley at the centre, where you start
//   forest — the Old Wood, to the north-west
//   desert — the Dune Sea, to the south
//   ruins  — the Steps of the First Ones, to the north-east
//   mire   — the Mire, beyond the Old Wood (north-west, from ~7.3 km): low,
//            flooded, the trees drowned
//
// Beyond about 7 km, all three rise into the mountains that ring the world.
// Terrain shape, ground textures, plants and air all read these weights, so a
// border is the same border for each. Pure and seeded: same answer every time.

import { makeSimplex2, smoothstep, type Noise2 } from './noise'
import { SPREAD } from './constants'

export interface RegionWeights {
  valley: number
  forest: number
  desert: number
  ruins: number
  mire: number
}

/** Where the Mire begins and is full, beyond the Old Wood. */
export const MIRE_RADIUS: [number, number] = [7300, 8400]

export type RegionName = keyof RegionWeights

/** Unit directions from the centre toward the heart of each land. */
const AXES: Array<[RegionName, number, number]> = [
  ['forest', -0.866, -0.5],
  ['desert', 0, 1],
  ['ruins', 0.866, -0.5],
]

/** The Green (the valley) gives way to the three lands between these distances (metres). */
export const VALLEY_RADIUS: [number, number] = [800 * SPREAD, 1400 * SPREAD]

export class Regions {
  private readonly warp: Noise2

  constructor(seed: number) {
    this.warp = makeSimplex2(seed + 7070)
  }

  /** Weights at (x, z), written into `out`. */
  at(x: number, z: number, out: RegionWeights = { valley: 0, forest: 0, desert: 0, ruins: 0, mire: 0 }): RegionWeights {
    // Bend the borders so they wander instead of running straight out.
    const k = 0.0006 / SPREAD
    const wx = x + 420 * SPREAD * this.warp(x * k, z * k)
    const wz = z + 420 * SPREAD * this.warp(x * k + 41.3, z * k - 12.7)
    const d = Math.sqrt(wx * wx + wz * wz)
    const valley = 1 - smoothstep(VALLEY_RADIUS[0], VALLEY_RADIUS[1], d)
    out.valley = valley
    out.mire = 0
    if (d < 1) {
      out.forest = out.desert = out.ruins = (1 - valley) / 3
      return out
    }
    // Each land claims the directions nearest its axis; the sixth power makes
    // the borders a few hundred metres wide instead of a smear.
    let sum = 0
    for (const [name, ax, az] of AXES) {
      const s = Math.max(0, (wx * ax + wz * az) / d + 0.5)
      const s2 = s * s
      const w = s2 * s2 * s2
      out[name] = w
      sum += w
    }
    for (const [name] of AXES) out[name] = ((1 - valley) * out[name]) / sum
    // The Mire: the Old Wood's outer reaches, gone low and wet.
    const m = out.forest * smoothstep(MIRE_RADIUS[0], MIRE_RADIUS[1], d)
    out.mire = m
    out.forest -= m
    return out
  }

  /** The land that holds most of (x, z). */
  name(x: number, z: number): RegionName {
    const w = this.at(x, z, scratch)
    let best: RegionName = 'valley'
    for (const k of ['forest', 'desert', 'ruins', 'mire'] as const) if (w[k] > w[best]) best = k
    return best
  }
}

const scratch: RegionWeights = { valley: 0, forest: 0, desert: 0, ruins: 0, mire: 0 }
