// The Mire's pools (beyond the Old Wood, north-west): round, shallow, dark.
// One possible pool per 110 m cell, jittered; where there is one, the ground
// is carved into a bowl (terrain.ts) and the client lays still water in it at
// the rim's level (water-view). Pure and seeded: the same pools everywhere.

import { makeSimplex2, mulberry32 } from './noise'

/** Wobbles every pool's edge, so a shore is never a circle. */
const shore = makeSimplex2(0x5107e)

export const POOL_CELL = 110

export interface Pool {
  x: number
  z: number
  r: number
}

const cache = new Map<number, Pool | null>()

/** The pool in cell (cx, cz), if it has one. */
export function poolInCell(cx: number, cz: number): Pool | null {
  const k = cx * 100003 + cz
  if (cache.has(k)) return cache.get(k)!
  const rand = mulberry32((cx * 73856093) ^ (cz * 19349663) ^ 0x51f0)
  let p: Pool | null = null
  if (rand() < 0.62) {
    const r = 14 + rand() * 26
    // Kept inside the cell so pools never overlap.
    const m = r + 4
    p = { x: cx * POOL_CELL + m + rand() * (POOL_CELL - 2 * m), z: cz * POOL_CELL + m + rand() * (POOL_CELL - 2 * m), r }
  }
  if (cache.size > 20000) cache.clear()
  cache.set(k, p)
  return p
}

/** 0 … 1: how deep into a pool's bowl (x, z) is (1 at its middle). */
export function poolBowl(x: number, z: number): number {
  const p = poolInCell(Math.floor(x / POOL_CELL), Math.floor(z / POOL_CELL))
  if (!p) return 0
  const d = Math.hypot(x - p.x, z - p.z) / p.r + 0.28 * shore(x * 0.045, z * 0.045) + 0.1 * shore(x * 0.13 + 7, z * 0.13)
  if (d >= 1.3) return 0
  // A flat floor, a soft bank.
  const t = Math.min(1, Math.max(0, (1.3 - d) / 0.5))
  return t * t * (3 - 2 * t)
}

/**
 * How far out from its middle pool `p` (in cell cx, cz) is carved, along angle `a` (m): where
 * poolBowl ends (its wobbled shore, or the cell's edge, which it never crosses). The water is laid
 * to this outline, not a circle — a circle either hung past the bank or left the bowl dry.
 */
export function poolReach(p: Pool, cx: number, cz: number, a: number): number {
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  let last = 0.6 * p.r
  for (let k = 0.6; k <= 1.8; k += 0.03) {
    const x = p.x + ca * k * p.r
    const z = p.z + sa * k * p.r
    if (Math.floor(x / POOL_CELL) !== cx || Math.floor(z / POOL_CELL) !== cz) return last
    const d = k + 0.28 * shore(x * 0.045, z * 0.045) + 0.1 * shore(x * 0.13 + 7, z * 0.13)
    if (d >= 1.3) return last
    last = k * p.r
  }
  return last
}
