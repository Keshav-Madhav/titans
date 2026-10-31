// The map: a minimap in the corner and the whole map on M. Shaded relief of
// the world, the lands' colours, contours every 25 m, the lakes, the colossi
// you have seen, the giants walking, and you. It starts blank: the land is
// uncovered as you go — further the higher you stand, so climbing a giant or
// a pillar is how you see the world. What you have seen is saved.
//
// The relief is drawn once, a few rows a frame after the world loads.

import * as THREE from 'three'
import { inBasin, WORLD_HALF, type Lake, type RegionName, type Terrain } from '@titans/shared'

const SIZE = 512 // relief, pixels across the whole world
const FOG = 256 // seen-grid cells across the whole world
const SPAN = WORLD_HALF * 2
const MINI_R = 900 // the minimap shows this far around you (metres)

const LAND: Record<RegionName, [number, number, number]> = {
  valley: [124, 146, 88],
  forest: [70, 96, 58],
  desert: [200, 176, 128],
  ruins: [148, 148, 116],
}

const LAND_NAMES: Array<[string, number, number]> = [
  ['The Valley', 0, 120],
  ['The Old Wood', -1700, -950],
  ['The Dune Sea', 0, 1900],
  ['The Steps', 1700, -950],
]

export interface MapPlace {
  name: string | null
  kind: 'colossus' | 'tree' | 'stone' | 'hall'
  x: number
  z: number
}

export class WorldMap {
  /** Seen cells (1 = uncovered), FOG × FOG over the world. */
  readonly seen = new Uint8Array(FOG * FOG)
  private readonly relief = document.createElement('canvas')
  private readonly fog = document.createElement('canvas')
  private readonly lakesLayer = document.createElement('canvas')
  private row = 0
  private lastReveal = new THREE.Vector3(1e9, 0, 0)
  private lakeSig = ''
  private readonly mini: HTMLCanvasElement
  private readonly full: HTMLCanvasElement
  private readonly panel: HTMLElement
  private sinceMini = 0
  /** Opened or closed (the game releases the pointer and keys). */
  onToggle: (open: boolean) => void = () => {}

  constructor(
    private readonly terrain: Terrain,
    private readonly places: MapPlace[],
  ) {
    this.relief.width = this.relief.height = SIZE
    this.fog.width = this.fog.height = FOG
    this.lakesLayer.width = this.lakesLayer.height = SIZE
    this.mini = document.getElementById('minimap') as HTMLCanvasElement
    this.full = document.getElementById('map-canvas') as HTMLCanvasElement
    this.panel = document.getElementById('map')!
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') this.toggle()
      else if (e.code === 'Escape' && this.open) this.toggle()
    })
    this.panel.addEventListener('click', () => this.toggle())
    this.drawFog()
  }

  get open(): boolean {
    return this.panel.style.display === 'flex'
  }

  toggle(): void {
    const open = !this.open
    this.panel.style.display = open ? 'flex' : 'none'
    if (open && document.pointerLockElement) document.exitPointerLock()
    this.onToggle(open)
  }

  /** Draw a few more rows of relief (call each frame until done). */
  private buildRows(budgetMs: number): void {
    if (this.row >= SIZE) return
    const ctx = this.relief.getContext('2d')!
    const t0 = performance.now()
    const m = SPAN / SIZE
    while (this.row < SIZE && performance.now() - t0 < budgetMs) {
      const img = ctx.createImageData(SIZE, 1)
      const z = -WORLD_HALF + (this.row + 0.5) * m
      for (let i = 0; i < SIZE; i++) {
        const x = -WORLD_HALF + (i + 0.5) * m
        const h = this.terrain.heightAt(x, z)
        const hx = this.terrain.heightAt(x + m, z) - h
        const hz = this.terrain.heightAt(x, z + m) - h
        // Light from the north-west; steep ground darker.
        const shade = Math.max(0.35, Math.min(1.25, 0.95 - (hx + hz) / m * 0.55))
        let [r, g, b] = LAND[this.terrain.base.regions.name(x, z)]
        // High ground greys, then snow.
        const high = Math.max(0, Math.min(1, (h - 140) / 260))
        r += (150 - r) * high
        g += (144 - g) * high
        b += (136 - b) * high
        if (h > 430) [r, g, b] = [228, 228, 232]
        // Contours every 25 m.
        const c = Math.floor(h / 25) !== Math.floor((h + hx) / 25) || Math.floor(h / 25) !== Math.floor((h + hz) / 25) ? 0.82 : 1
        const o = i * 4
        img.data[o] = r * shade * c
        img.data[o + 1] = g * shade * c
        img.data[o + 2] = b * shade * c
        img.data[o + 3] = 255
      }
      ctx.putImageData(img, 0, this.row)
      this.row++
    }
  }

  /** Uncover the land round (x, z): further the higher you stand above the ground. */
  private reveal(p: THREE.Vector3): void {
    const above = Math.max(0, p.y - this.terrain.heightAt(p.x, p.z))
    const r = Math.min(1600, 260 + above * 2.2)
    const cell = SPAN / FOG
    const cx = Math.floor((p.x + WORLD_HALF) / cell)
    const cz = Math.floor((p.z + WORLD_HALF) / cell)
    const n = Math.ceil(r / cell)
    let changed = false
    for (let j = -n; j <= n; j++) {
      for (let i = -n; i <= n; i++) {
        if (i * i + j * j > n * n) continue
        const x = cx + i
        const z = cz + j
        if (x < 0 || z < 0 || x >= FOG || z >= FOG) continue
        if (!this.seen[z * FOG + x]) {
          this.seen[z * FOG + x] = 1
          changed = true
        }
      }
    }
    if (changed) this.drawFog()
  }

  private drawFog(): void {
    const ctx = this.fog.getContext('2d')!
    const img = ctx.createImageData(FOG, FOG)
    for (let k = 0; k < FOG * FOG; k++) {
      // Unseen: the colour of old paper.
      img.data[k * 4] = 214
      img.data[k * 4 + 1] = 204
      img.data[k * 4 + 2] = 180
      img.data[k * 4 + 3] = this.seen[k] ? 0 : 255
    }
    ctx.putImageData(img, 0, 0)
  }

  /** Lakes, redrawn when they change. */
  private drawLakes(lakes: readonly Lake[]): void {
    const sig = lakes.map((l) => `${l.id}.${l.basin.sorted.length}`).join(',')
    if (sig === this.lakeSig) return
    this.lakeSig = sig
    const ctx = this.lakesLayer.getContext('2d')!
    ctx.clearRect(0, 0, SIZE, SIZE)
    ctx.fillStyle = 'rgb(72, 98, 122)'
    const m = SPAN / SIZE
    for (const l of lakes) {
      if (l.level <= l.basin.bottom + 0.3) continue
      const b = l.basin
      for (let z = b.z0; z < b.z0 + b.h; z += m) {
        for (let x = b.x0; x < b.x0 + b.w; x += m) {
          if (inBasin(b, Math.round(x), Math.round(z))) ctx.fillRect(Math.floor((x + WORLD_HALF) / m), Math.floor((z + WORLD_HALF) / m), 1, 1)
        }
      }
    }
  }

  /** Each frame: build relief, uncover land, redraw the minimap now and then. */
  update(dt: number, player: THREE.Vector3, yaw: number, giants: Array<{ x: number; z: number }>, lakes: readonly Lake[]): void {
    this.buildRows(4)
    if (player.distanceTo(this.lastReveal) > 25) {
      this.lastReveal.copy(player)
      this.reveal(player)
    }
    this.sinceMini += dt
    if (this.sinceMini > 0.1) {
      this.sinceMini = 0
      this.drawLakes(lakes)
      this.drawMini(player, yaw, giants)
      if (this.open) this.drawFull(player, yaw, giants)
    }
  }

  private px(v: number, size: number): number {
    return ((v + WORLD_HALF) / SPAN) * size
  }

  private isSeen(x: number, z: number): boolean {
    const cell = SPAN / FOG
    const i = Math.floor((x + WORLD_HALF) / cell)
    const j = Math.floor((z + WORLD_HALF) / cell)
    return i >= 0 && j >= 0 && i < FOG && j < FOG && this.seen[j * FOG + i] === 1
  }

  private drawMini(p: THREE.Vector3, yaw: number, giants: Array<{ x: number; z: number }>): void {
    const S = this.mini.width
    const ctx = this.mini.getContext('2d')!
    ctx.save()
    ctx.clearRect(0, 0, S, S)
    ctx.beginPath()
    ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2)
    ctx.clip()
    // The window of the world round the player, north up.
    const src = (MINI_R * 2 * SIZE) / SPAN
    const sx = this.px(p.x, SIZE) - src / 2
    const sz = this.px(p.z, SIZE) - src / 2
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(this.relief, sx, sz, src, src, 0, 0, S, S)
    ctx.drawImage(this.lakesLayer, sx, sz, src, src, 0, 0, S, S)
    const fsrc = (MINI_R * 2 * FOG) / SPAN
    ctx.drawImage(this.fog, this.px(p.x, FOG) - fsrc / 2, this.px(p.z, FOG) - fsrc / 2, fsrc, fsrc, 0, 0, S, S)
    const toMini = (x: number, z: number) => [S / 2 + ((x - p.x) / (MINI_R * 2)) * S, S / 2 + ((z - p.z) / (MINI_R * 2)) * S]
    this.drawMarks(ctx, toMini, giants, 0.8)
    // You: an arrow pointing where you face.
    ctx.translate(S / 2, S / 2)
    ctx.rotate(Math.PI - yaw)
    ctx.fillStyle = '#c0392b'
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, -8)
    ctx.lineTo(5.5, 6)
    ctx.lineTo(0, 3)
    ctx.lineTo(-5.5, 6)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
    // A rim.
    ctx.strokeStyle = 'rgba(30, 28, 24, 0.6)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(S / 2, S / 2, S / 2 - 1.5, 0, Math.PI * 2)
    ctx.stroke()
  }

  private drawFull(p: THREE.Vector3, yaw: number, giants: Array<{ x: number; z: number }>): void {
    const S = this.full.width
    const seen = document.getElementById('map-explored')
    if (seen) seen.textContent = `${(this.explored * 100).toFixed(1)}% SEEN`
    const ctx = this.full.getContext('2d')!
    ctx.clearRect(0, 0, S, S)
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(this.relief, 0, 0, S, S)
    ctx.drawImage(this.lakesLayer, 0, 0, S, S)
    ctx.drawImage(this.fog, 0, 0, S, S)
    const toFull = (x: number, z: number) => [this.px(x, S), this.px(z, S)]
    this.drawMarks(ctx, toFull, giants, 1.3)
    // The lands' names, once you have seen them.
    ctx.textAlign = 'center'
    ctx.font = 'italic 600 15px ui-serif, Georgia, serif'
    for (const [name, x, z] of LAND_NAMES) {
      if (!this.isSeen(x, z)) continue
      const [mx, mz] = toFull(x, z)
      ctx.fillStyle = 'rgba(40, 34, 26, 0.75)'
      ctx.fillText(name, mx, mz)
    }
    const [mx, mz] = toFull(p.x, p.z)
    ctx.save()
    ctx.translate(mx, mz)
    ctx.rotate(Math.PI - yaw)
    ctx.fillStyle = '#c0392b'
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, -9)
    ctx.lineTo(6, 7)
    ctx.lineTo(0, 3.5)
    ctx.lineTo(-6, 7)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  /** Places you have seen, and the giants walking where you have been. */
  private drawMarks(ctx: CanvasRenderingContext2D, at: (x: number, z: number) => number[], giants: Array<{ x: number; z: number }>, k: number): void {
    ctx.textAlign = 'left'
    ctx.font = `600 ${Math.round(10 * k)}px ui-sans-serif, system-ui, sans-serif`
    for (const pl of this.places) {
      if (!this.isSeen(pl.x, pl.z)) continue
      const [x, y] = at(pl.x, pl.z)
      ctx.fillStyle = pl.kind === 'tree' ? 'rgba(40, 70, 36, 0.9)' : pl.kind === 'stone' ? 'rgba(90, 90, 96, 0.9)' : 'rgba(40, 32, 24, 0.92)'
      ctx.beginPath()
      if (pl.kind === 'colossus' || pl.kind === 'hall') {
        ctx.moveTo(x, y - 5 * k)
        ctx.lineTo(x + 4 * k, y)
        ctx.lineTo(x, y + 5 * k)
        ctx.lineTo(x - 4 * k, y)
        ctx.closePath()
      } else ctx.arc(x, y, 2.6 * k, 0, Math.PI * 2)
      ctx.fill()
      if (pl.name) {
        ctx.fillStyle = 'rgba(30, 26, 20, 0.85)'
        ctx.fillText(pl.name, x + 6 * k, y + 3.5 * k)
      }
    }
    for (const g of giants) {
      if (!this.isSeen(g.x, g.z)) continue
      const [x, y] = at(g.x, g.z)
      ctx.fillStyle = 'rgba(110, 40, 30, 0.9)'
      ctx.beginPath()
      ctx.arc(x, y, 4 * k, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  /** What you have seen, for the save: the seen grid as bits, base64. */
  save(): string {
    const bits = new Uint8Array(this.seen.length / 8)
    for (let i = 0; i < this.seen.length; i++) if (this.seen[i]) bits[i >> 3] |= 1 << (i & 7)
    let s = ''
    for (let i = 0; i < bits.length; i += 4096) s += String.fromCharCode(...bits.subarray(i, i + 4096))
    return btoa(s)
  }

  load(data: string): void {
    try {
      const s = atob(data)
      for (let i = 0; i < this.seen.length; i++) this.seen[i] = (s.charCodeAt(i >> 3) >> (i & 7)) & 1
      this.drawFog()
    } catch {
      // an old or broken save: the map starts blank
    }
  }

  /** How much of the world you have seen (0 … 1). */
  get explored(): number {
    let n = 0
    for (const v of this.seen) n += v
    return n / this.seen.length
  }
}
