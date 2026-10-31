// Where things grow. Deterministic fields from the world seed and the lands
// (shared ./regions), read by the ground's look (so the Old Wood reads as
// canopy from far away) and by the vegetation standing on it up close (so the
// trees are where the canopy is).

import { makeSimplex2, smoothstep, type Noise2, type RegionWeights, type Regions } from '@titans/shared'

export class Biome {
  private readonly a: Noise2
  private readonly b: Noise2
  private readonly c: Noise2
  private readonly w: RegionWeights = { valley: 0, forest: 0, desert: 0, ruins: 0 }

  constructor(
    seed: number,
    private readonly regions: Regions,
  ) {
    this.a = makeSimplex2(seed + 5101)
    this.b = makeSimplex2(seed + 5202)
    this.c = makeSimplex2(seed + 5303)
  }

  /**
   * 0 open … 1 deep forest. The Old Wood is trees with clearings; the valley
   * has woods and copses, the Steps a few; the Dune Sea none. The start is
   * kept open.
   */
  forest(x: number, z: number): number {
    const n = 0.62 * this.a(x * 0.0011, z * 0.0011) + 0.28 * this.a(x * 0.0042 + 7, z * 0.0042 - 3) + 0.1 * this.a(x * 0.017, z * 0.017)
    const r = this.regions.at(x, z, this.w)
    const woods = smoothstep(0.12, 0.52, n) * smoothstep(220, 520, Math.hypot(x, z))
    return r.forest * smoothstep(-0.4, 0.15, n) + r.valley * woods * 0.6 + r.ruins * woods * 0.35
  }

  /** 0 dry steppe … 1 lush meadow (never in the Dune Sea). */
  meadow(x: number, z: number): number {
    const r = this.regions.at(x, z, this.w)
    return smoothstep(-0.25, 0.55, this.b(x * 0.0016 + 3, z * 0.0016 - 9)) * (1 - r.desert)
  }

  /** Copses: small clumps of trees out on open ground. 0 … 1. */
  copse(x: number, z: number): number {
    const r = this.regions.at(x, z, this.w)
    return smoothstep(0.5, 0.78, this.c(x * 0.0065 + 11, z * 0.0065 - 7)) * (1 - r.desert)
  }

  /** Scrub: how thick the low bushes are. 0.2 … 1 (thin in the Dune Sea). */
  scrub(x: number, z: number): number {
    const r = this.regions.at(x, z, this.w)
    return (0.2 + 0.8 * smoothstep(-0.4, 0.6, this.b(x * 0.0042 - 3, z * 0.0042 + 5))) * (1 - 0.7 * r.desert)
  }

  /** Patches of wildflowers: 0 none … 1 thick (the valley, and the Wood's clearings). */
  flowers(x: number, z: number): number {
    const r = this.regions.at(x, z, this.w)
    return smoothstep(0.35, 0.75, this.c(x * 0.012, z * 0.012)) * (r.valley + 0.4 * r.forest)
  }

  /** How much of the Dune Sea (x, z) is: 0 … 1. */
  desert(x: number, z: number): number {
    return this.regions.at(x, z, this.w).desert
  }
}
