// Single-player memory: the world you made survives a reload. Saved in
// localStorage — the ordered terrain events (rounded to the millimetre,
// compact arrays), every Titan's gait, the mountains, the lakes, and where
// you stood.
// Loading replays the events exactly as joining a server does.
//
// Settings (single player vs multiplayer, server address) live here too.

import type { LakesSave, MountainInfo, TitanSnapshot } from '@titans/shared'
import type { SettlementSave } from './settlement'

const SAVE_KEY = 'titans.world.v1'
const SETTINGS_KEY = 'titans.settings'

export type SavedEvent =
  | ['d', number, number, number, number] // drag: ax, az, bx, bz
  | ['f', 0 | 1, number, number, number, number, number, number, 0 | 1] // footfall: foot, x, z, heading, hx, hz, step, stomp
  | ['m', number, number] // mountain rising: x, z

export interface SavedTitan {
  pose: TitanSnapshot
  /** You were walking it when you left (it sits down; long enough away, it sleeps). */
  yours: boolean
  /** Since when it has rested with nobody walking it (0 = not). */
  aloneSince?: number
  /** Whoever last walked it: its mountain will carry the name. */
  lastDriver?: string
}

export interface SaveData {
  v: 1
  savedAt: number
  name: string
  events: SavedEvent[]
  titans: Record<string, SavedTitan>
  mountains: Record<string, MountainInfo>
  player: { x: number; y: number; z: number }
  settlement?: SettlementSave | null
  /** The lakes as they stood (rebuilding them from the events alone means re-running all the rain). */
  lakes?: LakesSave
}

export interface Settings {
  multiplayer: boolean
  server: string
  sound: boolean
}

const mm = (v: number) => Math.round(v * 1000) / 1000

export function packEvent(e: { type: string } & Record<string, unknown>): SavedEvent | null {
  const n = (k: string) => mm(e[k] as number)
  if (e.type === 'drag') return ['d', n('ax'), n('az'), n('bx'), n('bz')]
  if (e.type === 'mountain') return ['m', n('x'), n('z')]
  if (e.type === 'footfall')
    return ['f', e.foot as 0 | 1, n('x'), n('z'), e.heading as number, e.hx as number, e.hz as number, e.step as number, e.stomp ? 1 : 0]
  return null
}

export function unpackEvent(s: SavedEvent) {
  if (s[0] === 'd') return { type: 'drag' as const, foot: 0 as const, ax: s[1], az: s[2], bx: s[3], bz: s[4] }
  if (s[0] === 'm') return { type: 'mountain' as const, x: s[1], z: s[2] }
  return { type: 'footfall' as const, foot: s[1], x: s[2], z: s[3], heading: s[4], hx: s[5], hz: s[6], step: s[7], ...(s[8] ? { stomp: true } : {}) }
}

export function loadWorld(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as SaveData
    return d.v === 1 ? d : null
  } catch {
    return null
  }
}

/** Returns false if the browser refused (storage full or blocked). */
export function saveWorld(d: SaveData): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(d))
    return true
  } catch {
    return false
  }
}

export function clearWorld(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    // nothing to clear
  }
}

export function loadSettings(defaultServer: string): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>
    return { multiplayer: s.multiplayer === true, server: s.server || defaultServer, sound: s.sound !== false }
  } catch {
    return { multiplayer: false, server: defaultServer, sound: true }
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // settings simply will not stick
  }
}
