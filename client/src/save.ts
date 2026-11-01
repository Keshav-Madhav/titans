// The adventure, saved in this browser: the ordered terrain events the giants
// made (rounded to the millimetre, compact arrays), every giant's gait, the
// sleeping giants, the lakes, and where you stood. Loading replays the events.
//
// Settings live here too.

import type { LakesSave, MountainInfo, TitanSnapshot } from '@titans/shared'

// v3: the world grew again (the lands to ~10 km, the Mire); an older save's lakes and map belong to the old land.
const SAVE_KEY = 'titans.adventure.v3'
const SETTINGS_KEY = 'titans.adventure.settings'

export type SavedEvent =
  | ['d', number, number, number, number] // drag: ax, az, bx, bz
  | ['f', 0 | 1, number, number, number, number, number, number, 0 | 1] // footfall: foot, x, z, heading, hx, hz, step, stomp
  | ['m', number, number] // mountain rising: x, z

export interface SavedTitan {
  pose: TitanSnapshot
  /** Since when it has rested (0 = not); long enough, it sleeps. */
  aloneSince?: number
}

export interface SaveData {
  v: 1
  savedAt: number
  events: SavedEvent[]
  titans: Record<string, SavedTitan>
  mountains: Record<string, MountainInfo>
  player: { x: number; y: number; z: number }
  /** The lakes as they stood (rebuilding them from the events alone means re-running all the rain). */
  lakes?: LakesSave
  /** The land you have seen (the map's uncovered grid, packed). */
  seen?: string
  /** The cairns you have lit, by name. */
  cairns?: string[]
  /** What you have found (discovery.ts ids). */
  found?: string[]
  /** Whether the opening is over (woken, climbed out, shown the land). Missing: an older save — yes. */
  opened?: boolean
}

export interface Settings {
  sound: boolean
  /** Overall volume and the score's, 0 … 1. */
  volume: number
  music: number
  /** Mouse look speed (1 = as made) and whether up is down. */
  sensitivity: number
  invertY: boolean
  /** Render resolution: 'auto' (held to 60 a second), or a fixed share of the screen's pixels. */
  resolution: 'auto' | number
  /** Detail (terrain, shadows, plants): 'auto', or 0 high, 1 medium, 2 low. */
  detail: 'auto' | 0 | 1 | 2
}

export const DEFAULT_SETTINGS: Settings = { sound: true, volume: 0.85, music: 0.8, sensitivity: 1, invertY: false, resolution: 'auto', detail: 'auto' }

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

export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>
    return { ...DEFAULT_SETTINGS, ...s, sound: s.sound !== false }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // settings simply will not stick
  }
}
