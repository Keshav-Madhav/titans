// Automatic quality. Watches the real frame rate and trades detail for
// smoothness on machines that cannot hold it: terrain detail (split
// distance), pixel ratio, shadow-map size. Steps down quickly when slow,
// steps back up slowly (with hysteresis) when there is headroom.
// `?quality=0|1|2` pins a level.

import type * as THREE from 'three'
import type { TerrainView } from './terrain-view'

interface Level {
  splitK: number
  res: number
  maxDpr: number
  shadow: number
}

const LEVELS: Level[] = [
  { splitK: 1.6, res: 64, maxDpr: 2, shadow: 4096 },
  { splitK: 1.35, res: 64, maxDpr: 1.5, shadow: 2048 },
  { splitK: 1.35, res: 32, maxDpr: 1, shadow: 1024 },
]

export class Quality {
  level = 0
  private readonly pinned: boolean
  private frames = 0
  private since = performance.now()
  private goodFor = 0

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly terrain: TerrainView,
    private readonly sun: THREE.DirectionalLight,
    pin: string | null,
  ) {
    this.pinned = pin !== null && /^[012]$/.test(pin)
    this.apply(this.pinned ? Number(pin) : 0)
  }

  private apply(level: number): void {
    this.level = level
    const L = LEVELS[level]
    this.terrain.splitK = L.splitK
    this.terrain.setResolution(L.res)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, L.maxDpr))
    this.renderer.setSize(innerWidth, innerHeight, false)
    if (this.sun.shadow.mapSize.x !== L.shadow) {
      this.sun.shadow.mapSize.set(L.shadow, L.shadow)
      this.sun.shadow.map?.dispose()
      this.sun.shadow.map = null
    }
  }

  /** Call once per rendered frame (not while the loading veil is up). */
  frame(now: number): void {
    this.frames++
    const span = now - this.since
    if (span < 2000) return
    const fps = (this.frames * 1000) / span
    this.frames = 0
    this.since = now
    if (this.pinned) return
    if (fps < 45 && this.level < LEVELS.length - 1) {
      this.apply(this.level + 1)
      this.goodFor = 0
    } else if (fps > 58) {
      this.goodFor += span
      // Only climb back after a long, steady stretch: no oscillating.
      if (this.goodFor > 20000 && this.level > 0) {
        this.apply(this.level - 1)
        this.goodFor = 0
      }
    } else {
      this.goodFor = 0
    }
  }
}
