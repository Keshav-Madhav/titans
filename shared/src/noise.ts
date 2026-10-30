// Seeded 2D simplex noise (after Stefan Gustavson's public-domain reference).
//
// Deliberately free of Math.sin/cos/exp: only +, -, *, floor and one sqrt
// (which IEEE 754 requires to be correctly rounded). That makes every value
// bit-identical in every JS engine, so the server and all browsers agree on
// the base terrain without ever sending it.

/** Small, fast, seedable PRNG. Same seed, same sequence, everywhere. */
export function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const F2 = 0.5 * (Math.sqrt(3) - 1)
const G2 = (3 - Math.sqrt(3)) / 6
// Eight unit-ish gradient directions, interleaved x,y.
const GRAD = new Float64Array([1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1])

export type Noise2 = (x: number, y: number) => number

/** Returns a 2D simplex function in roughly [-1, 1] for the given seed. */
export function makeSimplex2(seed: number): Noise2 {
  const rand = mulberry32(seed)
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const t = p[i]
    p[i] = p[j]
    p[j] = t
  }
  const perm = new Uint8Array(512)
  const grad = new Uint8Array(512)
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255]
    grad[i] = (perm[i] % 8) * 2
  }

  return (x: number, y: number): number => {
    const s = (x + y) * F2
    const i = Math.floor(x + s)
    const j = Math.floor(y + s)
    const t = (i + j) * G2
    const x0 = x - (i - t)
    const y0 = y - (j - t)
    const i1 = x0 > y0 ? 1 : 0
    const j1 = 1 - i1
    const x1 = x0 - i1 + G2
    const y1 = y0 - j1 + G2
    const x2 = x0 - 1 + 2 * G2
    const y2 = y0 - 1 + 2 * G2
    const ii = i & 255
    const jj = j & 255

    let n = 0
    let t0 = 0.5 - x0 * x0 - y0 * y0
    if (t0 > 0) {
      const g = grad[ii + perm[jj]]
      t0 *= t0
      n += t0 * t0 * (GRAD[g] * x0 + GRAD[g + 1] * y0)
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1
    if (t1 > 0) {
      const g = grad[ii + i1 + perm[jj + j1]]
      t1 *= t1
      n += t1 * t1 * (GRAD[g] * x1 + GRAD[g + 1] * y1)
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2
    if (t2 > 0) {
      const g = grad[ii + 1 + perm[jj + 1]]
      t2 *= t2
      n += t2 * t2 * (GRAD[g] * x2 + GRAD[g + 1] * y2)
    }
    return 70 * n
  }
}

/** Polynomial smoothstep — the only easing allowed in shared code. */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = x <= e0 ? 0 : x >= e1 ? 1 : (x - e0) / (e1 - e0)
  return t * t * (3 - 2 * t)
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
