// Automatic quality (user, 2026-11-01: "resolution, quality… game hitches").
//
// Two levers, used very differently:
//
//   resolution — the main one. The render's pixel ratio moves in small steps
//                (an eighth at a time) to hold the frame time: down when the
//                *median* frame over a few seconds is over budget (a hitch or
//                two does not count), back up after a steady stretch with room
//                to spare. Cheap to change, barely seen.
//   detail     — terrain resolution, shadow map, vegetation reach. Changing
//                these rebuilds the land and pops things in and out, so only
//                as a last resort: when the resolution is already at its floor
//                and frames are still long, a step down — and never back up in
//                the same session (no pops while you play).
//
// The old governor averaged frames over 2 s and changed the detail level on
// any bad window: one loading hitch dropped the whole game to pixel ratio 1,
// half-resolution terrain and small shadows, rebuilt everything (a hitch of
// its own, and a visible pop), and on a 60 Hz screen rarely climbed back.
// `?quality=0|1|2` pins a detail level (tools; the resolution then stays put too).

import { aoSwitch } from './ao'
import { grassQuality } from './grass'
import type * as THREE from 'three'
import type { TerrainView } from './terrain-view'

interface Level {
  splitK: number
  res: number
  shadow: number
  /** Vegetation: detailed trees, simple trees, grass radii. */
  veg: [number, number, number]
}

const LEVELS: Level[] = [
  { splitK: 1.35, res: 64, shadow: 4096, veg: [170, 750, 70] },
  { splitK: 1.35, res: 64, shadow: 2048, veg: [130, 550, 50] },
  { splitK: 1.35, res: 32, shadow: 1024, veg: [95, 380, 32] },
]

/** The frame time we hold (ms): 60 a second, a little slack. */
const BUDGET = 17.6
/** Resolution steps, and its floor (as a pixel ratio). */
const DPR_STEP = 0.125
const DPR_FLOOR = 0.875
/** How long a window of frames is judged over (ms). */
const WINDOW = 2500

export class Quality {
  level = 0
  /** The pixel ratio we render at now. */
  dpr: number
  private readonly maxDpr: number
  private readonly pinned: boolean
  private times: number[] = []
  private since = performance.now()
  private last = 0
  private goodFor = 0
  private badAtFloor = 0

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly terrain: TerrainView,
    private readonly sun: THREE.DirectionalLight,
    pin: string | null,
    /** Set later (it is built after the governor). */
    public vegetation: { nearR: number; midR: number; grassR: number; markDirty?: unknown } | null = null,
  ) {
    this.pinned = pin !== null && /^[012]$/.test(pin)
    // Sharp on a high-density screen, but not 4× the pixels of a normal one to start with.
    this.maxDpr = Math.min(devicePixelRatio, 2)
    this.dpr = Math.min(this.maxDpr, 1.5)
    this.apply(this.pinned ? Number(pin) : 0)
  }

  /** Told after every change of level or resolution (the post pipeline follows the size). */
  onApply: (level: number) => void = () => {}

  /** Re-apply the current level (after late-built parts attach). */
  refresh(): void {
    this.apply(this.level)
  }

  private apply(level: number): void {
    this.level = level
    const L = LEVELS[level]
    // Ambient occlusion (ao.ts): on at High and Medium, off at Low (a full-screen pass at half size).
    aoSwitch.quality = level < 2
    // Real grass blades round you (grass.ts): 16 m at High, 10 at Medium, none at Low.
    grassQuality.bladeR = [16, 10, 0][level]
    // Ambient occlusion (ao.ts): on at High and Medium, off at Low (a full-screen pass at half size).
    aoSwitch.quality = level < 2
    this.terrain.splitK = L.splitK
    if (this.vegetation) [this.vegetation.nearR, this.vegetation.midR, this.vegetation.grassR] = L.veg
    this.terrain.setResolution(L.res)
    this.setDpr(this.dpr)
    if (this.sun.shadow.mapSize.x !== L.shadow) {
      this.sun.shadow.mapSize.set(L.shadow, L.shadow)
      this.sun.shadow.map?.dispose()
      this.sun.shadow.map = null
    }
  }

  private setDpr(dpr: number): void {
    this.dpr = dpr
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(innerWidth, innerHeight, false)
    this.onApply(this.level)
  }

  private fixedRes: number | null = null
  private fixedDetail: number | null = null

  /**
   * The player's choice (settings): resolution 'auto' or a fixed share of the
   * screen's pixels; detail 'auto' or a fixed level. Fixed means the governor
   * leaves that lever alone.
   */
  choose(resolution: 'auto' | number, detail: 'auto' | number): void {
    this.fixedRes = resolution === 'auto' ? null : Math.max(0.5, Math.min(2, devicePixelRatio * resolution))
    this.fixedDetail = detail === 'auto' ? null : detail
    if (this.fixedDetail !== null && this.fixedDetail !== this.level) this.apply(this.fixedDetail)
    if (this.fixedRes !== null) this.setDpr(this.fixedRes)
    else if (resolution === 'auto' && this.dpr > this.maxDpr) this.setDpr(this.maxDpr)
  }

  /** Call once per rendered frame (not while the loading veil is up). */
  frame(now: number): void {
    if (this.last) this.times.push(now - this.last)
    this.last = now
    const span = now - this.since
    if (span < WINDOW) return
    this.since = now
    const t = this.times.sort((a, b) => a - b)
    this.times = []
    if (this.pinned || t.length < 20 || (this.fixedRes !== null && this.fixedDetail !== null)) return
    // The median frame: what the game is running at, not its worst moments.
    const med = t[t.length >> 1]
    if (med > BUDGET) {
      this.goodFor = 0
      if (this.fixedRes === null && this.dpr > DPR_FLOOR + 1e-3) {
        // Further over budget, a bigger step.
        const steps = med > BUDGET * 1.5 ? 2 : 1
        this.setDpr(Math.max(DPR_FLOOR, this.dpr - DPR_STEP * steps))
      } else if (this.fixedDetail === null && ++this.badAtFloor >= 3 && this.level < LEVELS.length - 1) {
        // At the floor and still slow for three windows running: less detail, for good.
        this.apply(this.level + 1)
        this.badAtFloor = 0
      }
    } else {
      this.badAtFloor = 0
      // Clear headroom for a steady stretch: a little sharper.
      if (med < BUDGET * 0.8) this.goodFor += span
      else this.goodFor = 0
      if (this.fixedRes === null && this.goodFor > 8000 && this.dpr < this.maxDpr - 1e-3) {
        this.setDpr(Math.min(this.maxDpr, this.dpr + DPR_STEP))
        this.goodFor = 0
      }
    }
  }
}
