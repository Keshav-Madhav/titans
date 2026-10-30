// Wire protocol between the game server and clients. Room state carries the
// continuous things (players, the Titan's gait); messages carry the discrete,
// ordered things (terrain events, chat).

import type { GaitEvent } from './gait'

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
export type TerrainEvent = GaitEvent & { seq: number }

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
}
export interface TitanInputMsg {
  forward: number
  turn: number
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

export const MSG = {
  move: 'move',
  titanInput: 'titan',
  role: 'role',
  chat: 'chat',
  sync: 'sync',
  terrain: 'terrain',
} as const

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
}
