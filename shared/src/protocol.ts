// Wire protocol between the game server and clients. Room state carries the
// continuous things (players, the Titan's gait); messages carry the discrete,
// ordered things (terrain events, chat).

import type { GaitEvent } from './gait'

/** A dormant Titan's hill rising, as a terrain event. */
export interface MountainRise {
  type: 'mountain'
  x: number
  z: number
}

export const ROOM_NAME = 'world'
export const SERVER_PORT = 2567

/** Server simulation and state-patch rates. */
export const SERVER_TICK_HZ = 60
export const PATCH_MS = 50

/** How often clients send their Wanderer's position. */
export const MOVE_SEND_MS = 50

/** Server-side sanity limits for client-reported Wanderer movement. */
export const MAX_WANDERER_SPEED = 9 // sprint is 8.5 m/s
export const MAX_ABOVE_GROUND = 6 // a jump peaks under 1 m; slack for slopes and lag

/** A terrain-changing event, numbered by the server in the order it happened. */
export type TerrainEvent = (GaitEvent | MountainRise) & { seq: number }

/** A Titan resting this long with nobody driving it goes dormant and becomes a mountain. */
export const DORMANT_AFTER_MS = 60000

export interface JoinOptions {
  name: string
  color: string
  /** Private per-browser secret; the server keeps only its hash. Returning players wake where they left. */
  token?: string
}

export type Role = 'wanderer' | 'titan'

/** client → server */
export interface MoveMsg {
  x: number
  y: number
  z: number
  yaw: number
  /** Present while climbing a Titan: which Titan ('' = the awake one, else a mountain id), and the hold in the body part's local frame. */
  climb?: { titan: string; part: string; lump: number; x: number; y: number; z: number }
}
export interface TitanInputMsg {
  forward: number
  turn: number
  plough: boolean
  /** One-shot: arm a stomp for the next step (the server enforces the cooldown). */
  stomp?: boolean
}
export interface RoleMsg {
  role: Role
}
export interface ChatMsg {
  text: string
}

/** server → client */
export interface SyncMsg {
  events: TerrainEvent[]
}
export interface ChatOut {
  from: string
  color: string
  text: string
}
export interface CallOut {
  name: string
  x: number
  z: number
}

export const MSG = {
  move: 'move',
  titanInput: 'titan',
  role: 'role',
  chat: 'chat',
  sync: 'sync',
  terrain: 'terrain',
  shrug: 'shrug',
  call: 'call',
  rest: 'rest',
} as const

/** Body parts a climber can hold (must match the client's Titan). */
export const TITAN_PARTS = [
  'torso',
  'head',
  ...['L', 'R'].flatMap((s) => ['upperArm', 'forearm', 'hand', 'thigh', 'shin', 'foot'].map((p) => p + s)),
]

/** After letting go of a Titan, how long a fall the server accepts without calling it flying. */
export const FALL_GRACE_MS = 15000

/** Everything a client needs to pose the Titan exactly as the server has it. */
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

/** A Titan that slept and became a mountain: who it was, when, and the pose it froze in. */
export interface MountainInfo {
  name: string
  since: number
  pose: TitanSnapshot
}
