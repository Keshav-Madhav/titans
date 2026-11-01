// The shapes the game saves and replays: terrain events, where the giants
// wake, a giant's pose, and a sleeping giant's record. (This was the wire
// protocol when the game had a server; the server is gone, the shapes stay.)

import type { GaitEvent } from './gait'
import { SPREAD } from './constants'

/** A dormant Titan's hill rising, as a terrain event. */
export interface MountainRise {
  type: 'mountain'
  x: number
  z: number
}

/** Anything that changes the ground, in the order it happened. */
export type TerrainEvent = GaitEvent | MountainRise

/**
 * Where each giant slot first wakes. Slot 1 is the one near spawn (tools rely on it).
 */
export const TITAN_SPAWNS = [
  // The lone giant of the Green, walking its empty east (not beside the Sentinel) — near
  // enough to the Undercroft's stair that it sees you when you first climb out (a newcomer
  // ran two minutes after it from 2 km and was still half a kilometre short).
  { x: 1100, z: 900, heading: -Math.PI * 0.4 },
  { x: -460 * SPREAD, z: 420 * SPREAD, heading: -Math.PI * 0.3 },
  { x: 700 * SPREAD, z: 520 * SPREAD, heading: Math.PI * 1.2 },
  { x: -620 * SPREAD, z: -560 * SPREAD, heading: Math.PI * 0.2 },
]

/** A giant resting this long falls asleep and becomes a mountain. */
export const DORMANT_AFTER_MS = 60000

/** Everything needed to pose a giant exactly as it stood. */
export interface TitanSnapshot {
  x: number
  z: number
  heading: number
  speed: number
  phase: number
  swingFoot: 0 | 1
  swinging: boolean
  steps: number
  p0x: number
  p0z: number
  p1x: number
  p1z: number
  fromX: number
  fromZ: number
  toX: number
  toZ: number
  plough: boolean
  swingStomp: boolean
  resting: boolean
}

/** A giant that slept and became a mountain: what it is called, when, and the pose it froze in. */
export interface MountainInfo {
  name: string
  since: number
  pose: TitanSnapshot
}
