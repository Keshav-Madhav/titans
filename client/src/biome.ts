// Where things grow. Deterministic fields from the world seed, shared by the
// terrain's colouring (so a forest reads as dark canopy from far away) and
// the vegetation that stands on it up close (so the trees are where the
// canopy is).

import { makeSimplex2, smoothstep, type Noise2 } from '@titans/shared'

export class Biome {
  private readonly a: Noise2
  private readonly b: Noise2
  private readonly c: Noise2

  constructor(seed: number) {
    this.a = makeSimplex2(seed + 5101)
    this.b = makeSimplex2(seed + 5202)
    this.c = makeSimplex2(seed + 5303)
  }

  /** 0 open … 1 deep forest. Woods and copses across the plain, the start kept open. */
  forest(x: number, z: number): number {
    const n = 0.62 * this.a(x * 0.0011, z * 0.0011) + 0.28 * this.a(x * 0.0042 + 7, z * 0.0042 - 3) + 0.1 * this.a(x * 0.017, z * 0.017)
    // Open plains about spawn and the Titans' ground (the reel's wide views);
    // the woods begin out beyond, with copses scattered between.
    const open = smoothstep(500, 1100, Math.hypot(x, z)) * 0.85 + 0.15 * smoothstep(0.55, 0.75, n)
    return smoothstep(0.12, 0.52, n) * open
  }

  /** 0 dry steppe … 1 lush meadow. */
  meadow(x: number, z: number): number {
    return smoothstep(-0.25, 0.55, this.b(x * 0.0016 + 3, z * 0.0016 - 9))
  }

  /** Patches of wildflowers: 0 none … 1 thick. */
  flowers(x: number, z: number): number {
    return smoothstep(0.35, 0.75, this.c(x * 0.012, z * 0.012))
  }
}
