// The map: a minimap in the corner and the whole map on M — old paper, the
// land washed in sepia where you have seen it, contours inked every 25 m,
// lakes, the colossi you have seen, the giants walking, and you.
//
// It starts blank and is uncovered as you go: as far as you can see — about
// three-quarters of a kilometre on the ground, much further from up high, so
// climbing a giant or a pillar is how you see the world. What you have seen
// is saved.
//
// (User, 2026-11-01: the UI "flat… not polished". The old map showed the whole
// 26 km world at 51 m a pixel and uncovered 260 m round you: after a long walk,
// a dot in a blank square.) Now the relief is a slippy map — tiles at seven
// levels of detail, painted a few milliseconds a frame as they come into view,
// a coarser one standing in until each is ready — and the map opens framed on
// what you have seen; the wheel zooms, a drag pans.

import { actionOf } from './input'
import { shown } from './water-view'
import * as THREE from 'three'
import { inBasin, WORLD_HALF, type Lake, type RegionName, type Terrain } from '@titans/shared'

const SPAN = WORLD_HALF * 2
const FOG = 512 // seen-grid cells across the whole world

/** A cell's hash, 0 … 1. */
function hash2(i: number, j: number): number {
  const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
  return h - Math.floor(h)
}
/** Smooth value noise over the seen grid (features every `s` cells), 0 … 1. */
function valueNoise(x: number, z: number, s: number): number {
  const fx = x / s
  const fz = z / s
  const i = Math.floor(fx)
  const j = Math.floor(fz)
  const u = fx - i
  const v = fz - j
  const a = hash2(i, j) + (hash2(i + 1, j) - hash2(i, j)) * u
  const b = hash2(i, j + 1) + (hash2(i + 1, j + 1) - hash2(i, j + 1)) * u
  return a + (b - a) * v
}
/** How far a reveal reaches at this cell (a factor on the squared radius): a ragged edge. */
function edgeNoise(gx: number, gz: number): number {
  const k = 0.62 * valueNoise(gx, gz, 7) + 0.38 * valueNoise(gx + 91, gz + 37, 2.5)
  const f = 0.74 + 0.42 * k
  return f * f
}
const TILE = 256 // relief tile, pixels
const MAX_LEVEL = 6 // the finest tiles: 26 km / 64 / 256 ≈ 1.6 m a pixel
const MINI_R = 900 // the minimap shows this far around you (metres)

/** The lands as washes of colour (the map is multiplied onto the paper). */
const LAND: Record<RegionName, [number, number, number]> = {
  valley: [206, 208, 168],
  forest: [166, 180, 138],
  desert: [232, 214, 172],
  ruins: [212, 202, 178],
  mire: [176, 186, 158],
}
const WATER: [number, number, number] = [156, 176, 184]
const PAPER = 'rgb(222, 210, 184)'
const INK = 'rgba(46, 36, 24, 0.9)'
const SERIF_TITLE = "'IM Fell English', Georgia, serif"
const SERIF = "'EB Garamond', Georgia, serif"

/** The lands' names on the map (each written at the middle of its land). */
const LAND_TITLES: Partial<Record<RegionName, string>> = { valley: 'The Green', forest: 'The Old Wood', desert: 'The Dune Sea', ruins: 'The Steps' }

export interface MapPlace {
  name: string | null
  kind: 'colossus' | 'tree' | 'stone' | 'hall'
  x: number
  z: number
}

type At = (x: number, z: number) => [number, number]

export class WorldMap {
  /** Seen cells (1 = uncovered), FOG × FOG over the world. */
  readonly seen = new Uint8Array(FOG * FOG)
  /** The seen cells as a mask (opaque where seen), for drawing. */
  private readonly fog = document.createElement('canvas')
  /** The same mask in sepia ink (the pooled edge of the wash). */
  private readonly ink = document.createElement('canvas')
  private readonly tiles = new Map<string, HTMLCanvasElement>()
  private wanted: string[] = []
  private building: { key: string; L: number; tx: number; tz: number; canvas: HTMLCanvasElement; row: number; rowZ?: number } | null = null
  /** A row of heights, and the next (shared between neighbouring pixels while painting). */
  private readonly rowA = new Float64Array(TILE + 1)
  private readonly rowB = new Float64Array(TILE + 1)
  private lakeSigs = new Map<number, string>()
  private lakes: readonly Lake[] = []
  /** Tools: how many times a lake's change asked its tiles to be painted again. */
  lakeRepaints = 0
  /** Tiles whose land or water changed: still drawn, queued to be painted again. */
  private readonly stale = new Set<string>()
  private lakeCheckAt = 0
  private lastReveal = new THREE.Vector3(1e9, 0, 0)
  private readonly mini: HTMLCanvasElement
  private miniCache: HTMLCanvasElement | null = null
  private readonly miniAt = new THREE.Vector3()
  private miniWhen = 0
  private readonly full: HTMLCanvasElement
  private readonly panel: HTMLElement
  private readonly scratch = document.createElement('canvas')
  private sinceMini = 0
  private readonly landNames: Array<[string, number, number]> = []
  /** The full map's view: centre and width (metres). */
  private view = { x: 0, z: 0, span: 6000 }
  private drag: { x: number; y: number; vx: number; vz: number } | null = null
  /** Opened or closed (the game releases the pointer and keys). */
  onToggle: (open: boolean) => void = () => {}
  /** Can it be opened yet (the traveller's map is in the bag)? */
  allowed: () => boolean = () => true

  constructor(
    private readonly terrain: Terrain,
    private readonly places: MapPlace[],
  ) {
    this.fog.width = this.fog.height = FOG
    this.ink.width = this.ink.height = FOG
    this.mini = document.getElementById('minimap') as HTMLCanvasElement
    this.full = document.getElementById('map-canvas') as HTMLCanvasElement
    this.panel = document.getElementById('map')!
    addEventListener('keydown', (e) => {
      if (actionOf(e.code) === 'KeyM' && this.allowed()) this.toggle()
      else if (e.code === 'Escape' && this.open) this.toggle()
    })
    // Click outside the sheet to put it away; on it, drag to pan and wheel to zoom.
    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.toggle()
    })
    this.full.addEventListener('wheel', (e) => this.zoom(e), { passive: false })
    this.full.addEventListener('pointerdown', (e) => {
      this.drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vz: this.view.z }
      this.full.setPointerCapture(e.pointerId)
    })
    this.full.addEventListener('pointermove', (e) => {
      if (!this.drag) return
      const k = this.view.span / this.full.clientWidth
      this.view.x = this.drag.vx - (e.clientX - this.drag.x) * k
      this.view.z = this.drag.vz - (e.clientY - this.drag.y) * k
      this.clampView()
    })
    this.full.addEventListener('pointerup', () => (this.drag = null))
    this.drawFog()
    // Where to write each land's name: the middle of where it lies (sampled).
    const sum = new Map<RegionName, [number, number, number]>()
    for (let j = 0; j < 80; j++)
      for (let i = 0; i < 80; i++) {
        const x = -WORLD_HALF * 0.8 + (i / 79) * WORLD_HALF * 1.6
        const z = -WORLD_HALF * 0.8 + (j / 79) * WORLD_HALF * 1.6
        const r = terrain.base.regions.name(x, z)
        const a = sum.get(r) ?? [0, 0, 0]
        sum.set(r, [a[0] + x, a[1] + z, a[2] + 1])
      }
    for (const [r, [x, z, n]] of sum) if (LAND_TITLES[r] && n > 20) this.landNames.push([LAND_TITLES[r]!, x / n, z / n])
    // The coarsest tile first: something to show anywhere.
    this.want(0, 0, 0)
  }

  get open(): boolean {
    return this.panel.style.display === 'flex'
  }

  toggle(): void {
    const open = !this.open
    if (open) this.frameSeen()
    this.panel.style.display = open ? 'flex' : 'none'
    if (open && document.pointerLockElement) document.exitPointerLock()
    this.onToggle(open)
  }

  // ── The view ──────────────────────────────────────────────────────

  /** Open on what you have seen (with room round it), not the whole world. */
  private frameSeen(): void {
    let x0 = FOG
    let x1 = -1
    let z0 = FOG
    let z1 = -1
    for (let j = 0; j < FOG; j++)
      for (let i = 0; i < FOG; i++)
        if (this.seen[j * FOG + i]) {
          if (i < x0) x0 = i
          if (i > x1) x1 = i
          if (j < z0) z0 = j
          if (j > z1) z1 = j
        }
    const cell = SPAN / FOG
    if (x1 < 0) {
      this.view = { x: 0, z: 0, span: 6000 }
      return
    }
    const w = Math.max(x1 - x0 + 1, z1 - z0 + 1) * cell
    this.view = { x: -WORLD_HALF + ((x0 + x1 + 1) / 2) * cell, z: -WORLD_HALF + ((z0 + z1 + 1) / 2) * cell, span: Math.max(3200, w * 1.4) }
    this.clampView()
  }

  private zoom(e: WheelEvent): void {
    e.preventDefault()
    const r = this.full.getBoundingClientRect()
    const fx = (e.clientX - r.left) / r.width - 0.5
    const fz = (e.clientY - r.top) / r.height - 0.5
    // Keep the point under the cursor where it is.
    const wx = this.view.x + fx * this.view.span
    const wz = this.view.z + fz * this.view.span
    this.view.span = THREE.MathUtils.clamp(this.view.span * Math.pow(1.0015, e.deltaY), 1200, SPAN)
    this.view.x = wx - fx * this.view.span
    this.view.z = wz - fz * this.view.span
    this.clampView()
  }

  private clampView(): void {
    const h = WORLD_HALF - this.view.span / 2
    this.view.x = h > 0 ? THREE.MathUtils.clamp(this.view.x, -h, h) : 0
    this.view.z = h > 0 ? THREE.MathUtils.clamp(this.view.z, -h, h) : 0
  }

  // ── Seeing ────────────────────────────────────────────────────────

  /** Uncover the land round (x, z): as far as you can see, further the higher you stand above the ground. */
  private reveal(p: THREE.Vector3): void {
    const above = Math.max(0, p.y - this.terrain.heightAt(p.x, p.z))
    this.uncover(p.x, p.z, Math.min(2600, 750 + above * 2.6))
  }

  /** Uncover a circle of radius `r` round (x, z) (a lit cairn). */
  revealAround(x: number, z: number, r: number): void {
    this.uncover(x, z, r)
  }

  private uncover(x: number, z: number, r: number): void {
    const cell = SPAN / FOG
    const cx = Math.floor((x + WORLD_HALF) / cell)
    const cz = Math.floor((z + WORLD_HALF) / cell)
    const n = Math.ceil(r / cell)
    let changed = false
    for (let j = -n; j <= n; j++) {
      for (let i = -n; i <= n; i++) {
        const gx = cx + i
        const gz = cz + j
        // (A ragged edge, as a wash on paper spreads: not a compass-drawn circle.)
        if (i * i + j * j > n * n * edgeNoise(gx, gz)) continue
        if (gx < 0 || gz < 0 || gx >= FOG || gz >= FOG || this.seen[gz * FOG + gx]) continue
        this.seen[gz * FOG + gx] = 1
        changed = true
      }
    }
    if (changed) this.drawFog()
  }

  private drawFog(): void {
    const ctx = this.fog.getContext('2d')!
    const img = ctx.createImageData(FOG, FOG)
    for (let k = 0; k < FOG * FOG; k++) {
      img.data[k * 4 + 3] = this.seen[k] ? 255 : 0
    }
    ctx.putImageData(img, 0, 0)
    // The same, in sepia ink: drawn blurred under the wash, it darkens the edge where the
    // pigment pools.
    const ink = this.ink.getContext('2d')!
    ink.clearRect(0, 0, FOG, FOG)
    ink.drawImage(this.fog, 0, 0)
    ink.globalCompositeOperation = 'source-in'
    ink.fillStyle = 'rgb(104, 72, 40)'
    ink.fillRect(0, 0, FOG, FOG)
    ink.globalCompositeOperation = 'source-over'
  }

  private isSeen(x: number, z: number): boolean {
    const cell = SPAN / FOG
    const i = Math.floor((x + WORLD_HALF) / cell)
    const j = Math.floor((z + WORLD_HALF) / cell)
    return i >= 0 && j >= 0 && i < FOG && j < FOG && this.seen[j * FOG + i] === 1
  }

  // ── The relief, in tiles ──────────────────────────────────────────

  private key(L: number, tx: number, tz: number): string {
    return `${L}/${tx}/${tz}`
  }

  private want(L: number, tx: number, tz: number): void {
    const k = this.key(L, tx, tz)
    if (!this.tiles.has(k) && !this.wanted.includes(k)) this.wanted.push(k)
  }

  /** One pixel of the map: the land's wash, hill shading, contours, water. */
  /** `h`, `hE`, `hS`: the heights here and one step east and south, when the caller has them. */
  private paint(x: number, z: number, m: number, lakes: readonly Lake[], h0?: number, hE?: number, hS?: number): [number, number, number] {
    const T = this.terrain
    const h = h0 ?? T.heightAt(x, z)
    for (const l of lakes) {
      const b = l.basin
      // Water where the lake is, not its whole basin: a half-full lake painted to the brim showed shores
      // the world doesn't have (hard edges on the map, out on dry land).
      if (x >= b.x0 && z >= b.z0 && x < b.x0 + b.w && z < b.z0 + b.h && inBasin(b, Math.round(x), Math.round(z)) && h < shown(l)) return WATER
    }
    const e = Math.max(m, 2)
    const hx = (hE ?? T.heightAt(x + e, z)) - h
    const hz = (hS ?? T.heightAt(x, z + e)) - h
    // Light from the north-west: a wash, not a photograph — but the land's shape must read
    // (at 0.32 the Green came out one flat olive disc).
    const shade = THREE.MathUtils.clamp(1 - ((hx + hz) / e) * 0.62, 0.62, 1.14)
    let [r, g, b] = LAND[T.base.regions.name(x, z)]
    const high = THREE.MathUtils.clamp((h - 140) / 260, 0, 1)
    r += (196 - r) * high
    g += (186 - g) * high
    b += (170 - b) * high
    if (h > 430) [r, g, b] = [238, 234, 224]
    // Contours: every 25 m, and a heavier one every 100.
    const step = m > 30 ? 100 : 25
    const band = (v: number) => Math.floor(v / step)
    let c = 1
    if (band(h) !== band(h + hx * (m / e)) || band(h) !== band(h + hz * (m / e))) c = Math.floor((h + 1e-3) / 100) !== Math.floor((h + Math.max(hx, hz) * (m / e)) / 100) ? 0.62 : 0.76
    return [r * shade * c, g * shade * c, b * shade * c]
  }

  /** Paint more of the tiles wanted (a few milliseconds a frame). */
  private build(budgetMs: number): void {
    const t0 = performance.now()
    while (performance.now() - t0 < budgetMs) {
      if (!this.building) {
        const k = this.wanted.shift()
        if (!k) return
        if (this.tiles.has(k) && !this.stale.has(k)) continue
        const [L, tx, tz] = k.split('/').map(Number)
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = TILE
        this.building = { key: k, L, tx, tz, canvas, row: 0 }
      }
      const b = this.building
      const span = SPAN / (1 << b.L)
      const m = span / TILE
      const x0 = -WORLD_HALF + b.tx * span
      const z0 = -WORLD_HALF + b.tz * span
      const lakes = this.lakes.filter((l) => l.level > l.basin.bottom + 0.3 && l.basin.x0 < x0 + span && l.basin.x0 + l.basin.w > x0 && l.basin.z0 < z0 + span && l.basin.z0 + l.basin.h > z0)
      const ctx = b.canvas.getContext('2d')!
      // (A step of at least 2 m is one pixel: the east and south neighbours' heights are the
      // next pixel's and the next row's — sampled once and shared, not three times a pixel.)
      const share = m >= 2
      while (b.row < TILE && performance.now() - t0 < budgetMs) {
        const img = ctx.createImageData(TILE, 1)
        const z = z0 + (b.row + 0.5) * m
        if (share) {
          if (b.rowZ !== z) {
            for (let i = 0; i <= TILE; i++) this.rowA[i] = this.terrain.heightAt(x0 + (i + 0.5) * m, z)
          } else this.rowA.set(this.rowB)
          for (let i = 0; i <= TILE; i++) this.rowB[i] = this.terrain.heightAt(x0 + (i + 0.5) * m, z + m)
          b.rowZ = z + m
        }
        for (let i = 0; i < TILE; i++) {
          const [r, g, bl] = share ? this.paint(x0 + (i + 0.5) * m, z, m, lakes, this.rowA[i], this.rowA[i + 1], this.rowB[i]) : this.paint(x0 + (i + 0.5) * m, z, m, lakes)
          img.data[i * 4] = r
          img.data[i * 4 + 1] = g
          img.data[i * 4 + 2] = bl
          img.data[i * 4 + 3] = 255
        }
        ctx.putImageData(img, 0, b.row)
        b.row++
      }
      if (b.row >= TILE) {
        this.tiles.set(b.key, b.canvas)
        this.stale.delete(b.key)
        this.building = null
      }
    }
  }

  /** A lake changed: the tiles under it are painted again. */
  private watchLakes(lakes: readonly Lake[]): void {
    this.lakes = lakes
    // (At most every 2 s: the water settles over a few seconds after each footfall.)
    const now = performance.now()
    if (now - this.lakeCheckAt < 2000) return
    this.lakeCheckAt = now
    for (const l of lakes) {
      // (The level to half a metre: the shore moves as it fills, without repainting every step.)
      const sig = `${l.basin.sorted.length}.${l.level > l.basin.bottom + 0.3 ? Math.round(shown(l) * 2) : 'dry'}`
      if (this.lakeSigs.get(l.id) === sig) continue
      this.lakeRepaints = (this.lakeRepaints ?? 0) + 1
      const was = this.lakeSigs.has(l.id)
      this.lakeSigs.set(l.id, sig)
      if (!was && this.tiles.size === 0) continue
      const b = l.basin
      for (const k of [...this.tiles.keys()]) {
        const [L, tx, tz] = k.split('/').map(Number)
        const span = SPAN / (1 << L)
        const x0 = -WORLD_HALF + tx * span
        const z0 = -WORLD_HALF + tz * span
        // (Kept on screen until its repaint is done: deleted, a blurry coarser tile stood in for it —
        // and beside a walking giant whose footprints keep changing the lakes, 56 times in ten seconds,
        // the minimap was always half blurred squares — the user, 2026-11-07.)
        if (b.x0 < x0 + span && b.x0 + b.w > x0 && b.z0 < z0 + span && b.z0 + b.h > z0 && !this.stale.has(k)) {
          this.stale.add(k)
          this.wanted.push(k)
        }
      }
    }
  }

  /**
   * Draw the world window [x0 … x0+span] × [z0 … z0+span] into `ctx` (S px),
   * only where seen, its edge soft. Tiles not ready yet are asked for, and a
   * coarser one stands in.
   */
  private drawLand(ctx: CanvasRenderingContext2D, x0: number, z0: number, span: number, S: number): number {
    const sc = this.scratch
    if (sc.width !== S) sc.width = sc.height = S
    const g = sc.getContext('2d')!
    g.clearRect(0, 0, S, S)
    g.imageSmoothingEnabled = true
    const want = Math.ceil(Math.log2(SPAN / (TILE * (span / S))))
    const L = THREE.MathUtils.clamp(want, 0, MAX_LEVEL)
    const n = 1 << L
    const ts = SPAN / n
    const i0 = Math.max(0, Math.floor((x0 + WORLD_HALF) / ts))
    const i1 = Math.min(n - 1, Math.floor((x0 + span + WORLD_HALF) / ts))
    const j0 = Math.max(0, Math.floor((z0 + WORLD_HALF) / ts))
    const j1 = Math.min(n - 1, Math.floor((z0 + span + WORLD_HALF) / ts))
    // (Nearest the middle first.)
    const order: Array<[number, number]> = []
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) order.push([i, j])
    const ci = (i0 + i1) / 2
    const cj = (j0 + j1) / 2
    order.sort((a, b) => (a[0] - ci) ** 2 + (a[1] - cj) ** 2 - ((b[0] - ci) ** 2 + (b[1] - cj) ** 2))
    const fresh: string[] = []
    for (const [i, j] of order) {
      // Only where some of it has been seen (no use painting the unknown).
      if (!this.anySeen(-WORLD_HALF + i * ts, -WORLD_HALF + j * ts, ts)) continue
      const dx = ((-WORLD_HALF + i * ts - x0) / span) * S
      const dz = ((-WORLD_HALF + j * ts - z0) / span) * S
      const dw = (ts / span) * S
      const tile = this.tiles.get(this.key(L, i, j))
      if (tile) {
        g.drawImage(tile, dx, dz, dw + 0.5, dw + 0.5)
        continue
      }
      fresh.push(this.key(L, i, j))
      // A coarser tile in its place for now.
      for (let up = L - 1; up >= 0; up--) {
        const f = 1 << (L - up)
        const anc = this.tiles.get(this.key(up, Math.floor(i / f), Math.floor(j / f)))
        if (!anc) continue
        const sub = TILE / f
        g.drawImage(anc, (i % f) * sub, (j % f) * sub, sub, sub, dx, dz, dw + 0.5, dw + 0.5)
        break
      }
    }
    // The newest wants go first (what you are looking at now), the coarse world tile always.
    this.wanted = [...fresh, ...this.wanted.filter((k) => !fresh.includes(k))].slice(0, 48)
    for (const k of this.stale) if (!this.wanted.includes(k)) this.wanted.push(k)
    this.missing = fresh.length
    if (!this.tiles.has('0/0/0') && !this.wanted.includes('0/0/0')) this.wanted.push('0/0/0')
    // Only where you have seen: the mask, softened at its edge.
    g.globalCompositeOperation = 'destination-in'
    const cell = SPAN / FOG
    const blur = Math.max(1.5, (cell / span) * S * 0.9)
    g.filter = `blur(${blur.toFixed(1)}px)`
    g.drawImage(this.fog, ((x0 + WORLD_HALF) / SPAN) * FOG, ((z0 + WORLD_HALF) / SPAN) * FOG, (span / SPAN) * FOG, (span / SPAN) * FOG, 0, 0, S, S)
    // The pooled edge: the ink mask, wider and softer, under what is there.
    g.globalCompositeOperation = 'destination-over'
    g.filter = `blur(${(blur * 1.3).toFixed(1)}px)`
    g.globalAlpha = 0.38
    g.drawImage(this.ink, ((x0 + WORLD_HALF) / SPAN) * FOG, ((z0 + WORLD_HALF) / SPAN) * FOG, (span / SPAN) * FOG, (span / SPAN) * FOG, 0, 0, S, S)
    g.globalAlpha = 1
    g.filter = 'none'
    g.globalCompositeOperation = 'source-over'
    ctx.drawImage(sc, 0, 0)
    return this.missing
  }

  /** Tiles the last drawing wanted and did not have yet. */
  private missing = 0
  /** The minimap's land is not all painted yet: paint faster and redraw it sooner. */
  private miniMissing = 0

  private anySeen(x: number, z: number, w: number): boolean {
    const cell = SPAN / FOG
    const i0 = Math.max(0, Math.floor((x + WORLD_HALF) / cell))
    const j0 = Math.max(0, Math.floor((z + WORLD_HALF) / cell))
    const i1 = Math.min(FOG - 1, Math.floor((x + w + WORLD_HALF) / cell))
    const j1 = Math.min(FOG - 1, Math.floor((z + w + WORLD_HALF) / cell))
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (this.seen[j * FOG + i]) return true
    return false
  }

  // ── Each frame ────────────────────────────────────────────────────

  /** Each frame: paint relief, uncover land, redraw the minimap now and then. */
  update(dt: number, player: THREE.Vector3, yaw: number, giants: Array<{ x: number; z: number }>, lakes: readonly Lake[]): void {
    this.watchLakes(lakes)
    this.build(this.open ? 6 : this.miniMissing ? 5 : 2.5)
    if (player.distanceTo(this.lastReveal) > 25) {
      this.lastReveal.copy(player)
      this.reveal(player)
    }
    // The minimap every frame (a slide of its cached land, and the marks): at ten a second it
    // moved under you in jumps. The full map a little less often.
    if (document.body.classList.contains('has-map') && !this.open) this.drawMini(player, yaw, giants)
    this.sinceMini += dt
    if (this.open && this.sinceMini > 0.05) {
      this.sinceMini = 0
      this.drawFull(player, yaw, giants)
    }
  }

  private drawMini(p: THREE.Vector3, yaw: number, giants: Array<{ x: number; z: number }>): void {
    const S = this.mini.width
    const ctx = this.mini.getContext('2d')!
    ctx.save()
    ctx.clearRect(0, 0, S, S)
    ctx.beginPath()
    ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, S, S)
    // The land, from a cache twice the view across: redrawn when you have gone half a view
    // or every few seconds (new tiles, new ground seen), otherwise only slid under you. Drawn
    // fresh ten times a second (two blurred passes each) it was the minimap's lag and its chunks.
    const now = performance.now()
    // (Sooner while some of its land is still being painted — the user, 2026-11-05: a fresh place
    // showed as blank parchment for a long while.)
    if (!this.miniCache || Math.hypot(p.x - this.miniAt.x, p.z - this.miniAt.z) > MINI_R * 0.5 || now - this.miniWhen > (this.miniMissing ? 500 : 3000)) {
      if (!this.miniCache) {
        this.miniCache = document.createElement('canvas')
        this.miniCache.width = this.miniCache.height = S * 2
      }
      const cc = this.miniCache.getContext('2d')!
      cc.clearRect(0, 0, S * 2, S * 2)
      this.miniMissing = this.drawLand(cc, p.x - MINI_R * 2, p.z - MINI_R * 2, MINI_R * 4, S * 2)
      this.miniAt.set(p.x, 0, p.z)
      this.miniWhen = now
    }
    ctx.globalCompositeOperation = 'multiply'
    const ox = ((p.x - (this.miniAt.x - MINI_R * 2)) / (MINI_R * 4)) * S * 2 - S / 2
    const oz = ((p.z - (this.miniAt.z - MINI_R * 2)) / (MINI_R * 4)) * S * 2 - S / 2
    ctx.drawImage(this.miniCache, ox, oz, S, S, 0, 0, S, S)
    ctx.globalCompositeOperation = 'source-over'
    const at: At = (x, z) => [S / 2 + ((x - p.x) / (MINI_R * 2)) * S, S / 2 + ((z - p.z) / (MINI_R * 2)) * S]
    this.drawMarks(ctx, at, giants, 0.8, false)
    ctx.translate(S / 2, S / 2)
    this.drawYou(ctx, yaw, 0.95)
    ctx.restore()
    // North, at the top of the ring.
    ctx.fillStyle = 'rgba(46, 36, 24, 0.85)'
    ctx.font = `13px ${SERIF_TITLE}`
    ctx.textAlign = 'center'
    ctx.fillText('N', S / 2, 15)
    // A soft inner shadow under the rim.
    const rim = ctx.createRadialGradient(S / 2, S / 2, S / 2 - 14, S / 2, S / 2, S / 2)
    rim.addColorStop(0, 'rgba(60, 40, 20, 0)')
    rim.addColorStop(1, 'rgba(60, 40, 20, 0.35)')
    ctx.fillStyle = rim
    ctx.beginPath()
    ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2)
    ctx.fill()
  }

  private drawFull(p: THREE.Vector3, yaw: number, giants: Array<{ x: number; z: number }>): void {
    const S = this.full.width
    const seen = document.getElementById('map-explored')
    if (seen) seen.textContent = `${(this.explored * 100).toFixed(1)}% seen`
    const ctx = this.full.getContext('2d')!
    ctx.clearRect(0, 0, S, S)
    const { span } = this.view
    const x0 = this.view.x - span / 2
    const z0 = this.view.z - span / 2
    this.drawLand(ctx, x0, z0, span, S)
    const at: At = (x, z) => [((x - x0) / span) * S, ((z - z0) / span) * S]
    const k = THREE.MathUtils.clamp(Math.sqrt(9000 / span), 0.9, 1.6)
    // The lands' names, once seen: wide-spaced capitals in the old face.
    ctx.textAlign = 'center'
    for (const [name, x, z] of this.landNames) {
      if (!this.isSeen(x, z)) continue
      const [mx, mz] = at(x, z)
      ctx.font = `italic ${Math.round(26 * k)}px ${SERIF_TITLE}`
      ctx.fillStyle = 'rgba(70, 52, 30, 0.55)'
      ctx.fillText(name, mx, mz)
    }
    this.drawMarks(ctx, at, giants, k, true)
    const [mx, mz] = at(p.x, p.z)
    ctx.save()
    ctx.translate(mx, mz)
    this.drawYou(ctx, yaw, 1.3)
    ctx.restore()
    this.drawFrame(ctx, S, span)
  }

  /** You: a red arrowhead with an ink edge, pointing the way you face. */
  private drawYou(ctx: CanvasRenderingContext2D, yaw: number, k: number): void {
    ctx.save()
    ctx.rotate(Math.PI - yaw)
    ctx.scale(k, k)
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
    ctx.shadowBlur = 3
    ctx.fillStyle = '#b3311f'
    ctx.beginPath()
    ctx.moveTo(0, -9)
    ctx.lineTo(6, 7)
    ctx.lineTo(0, 3.5)
    ctx.lineTo(-6, 7)
    ctx.closePath()
    // Told by its brightness, not its red alone (under red-green colour blindness the red went
    // olive and sank into the paper): a dark halo, a pale rim, then the red and its ink edge.
    ctx.lineJoin = 'round'
    ctx.strokeStyle = 'rgba(24, 16, 8, 0.72)'
    ctx.lineWidth = 5.2
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.strokeStyle = '#f7eed6'
    ctx.lineWidth = 2.6
    ctx.stroke()
    ctx.fill()
    ctx.strokeStyle = '#2a1c10'
    ctx.lineWidth = 0.9
    ctx.stroke()
    ctx.restore()
  }

  /** The sheet's furniture: a ruled border, a compass rose, a scale. */
  private drawFrame(ctx: CanvasRenderingContext2D, S: number, span: number): void {
    ctx.save()
    ctx.strokeStyle = INK
    ctx.lineWidth = 2
    ctx.strokeRect(8, 8, S - 16, S - 16)
    ctx.lineWidth = 0.8
    ctx.strokeRect(14, 14, S - 28, S - 28)
    // The rose.
    const rx = S - 70
    const ry = 72
    ctx.translate(rx, ry)
    ctx.fillStyle = 'rgba(46, 36, 24, 0.85)'
    for (let i = 0; i < 8; i++) {
      const long = i % 2 === 0
      const r = long ? 38 : 22
      ctx.save()
      ctx.rotate((i * Math.PI) / 4)
      ctx.beginPath()
      ctx.moveTo(0, -r)
      ctx.lineTo(5, 0)
      ctx.lineTo(0, 4)
      ctx.lineTo(-5, 0)
      ctx.closePath()
      ctx.fillStyle = long ? 'rgba(46, 36, 24, 0.85)' : 'rgba(46, 36, 24, 0.5)'
      ctx.fill()
      ctx.restore()
    }
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(0, 0, 28, 0, Math.PI * 2)
    ctx.stroke()
    ctx.font = `18px ${SERIF_TITLE}`
    ctx.textAlign = 'center'
    ctx.fillStyle = INK
    ctx.fillText('N', 0, -44)
    ctx.restore()
    // The scale: a round length about a fifth of the sheet.
    const nice = [250, 500, 1000, 2000, 5000, 10000].find((v) => v >= span * 0.15) ?? 10000
    const w = (nice / span) * S
    const x = 34
    const y = S - 36
    ctx.save()
    ctx.fillStyle = INK
    ctx.strokeStyle = INK
    ctx.lineWidth = 1.2
    ctx.strokeRect(x, y, w, 6)
    ctx.fillRect(x, y, w / 2, 6)
    ctx.font = `italic 15px ${SERIF}`
    ctx.textAlign = 'left'
    ctx.fillText(nice >= 1000 ? `${nice / 1000} km` : `${nice} m`, x, y - 7)
    ctx.restore()
  }

  /** Places you have seen, and the giants walking where you have been. */
  private drawMarks(ctx: CanvasRenderingContext2D, at: At, giants: Array<{ x: number; z: number }>, k: number, names: boolean): void {
    ctx.textAlign = 'left'
    for (const pl of this.places) {
      if (!this.isSeen(pl.x, pl.z)) continue
      const [x, y] = at(pl.x, pl.z)
      ctx.fillStyle = pl.kind === 'tree' ? 'rgba(52, 76, 40, 0.9)' : pl.kind === 'stone' ? 'rgba(80, 76, 70, 0.9)' : INK
      ctx.strokeStyle = 'rgba(240, 228, 200, 0.8)'
      ctx.lineWidth = 1
      ctx.beginPath()
      if (pl.kind === 'colossus') {
        // A colossus: a small standing figure.
        ctx.moveTo(x, y - 7 * k)
        ctx.lineTo(x + 4 * k, y + 4 * k)
        ctx.lineTo(x - 4 * k, y + 4 * k)
        ctx.closePath()
      } else if (pl.kind === 'hall') ctx.rect(x - 4 * k, y - 4 * k, 8 * k, 8 * k)
      else ctx.arc(x, y, 2.6 * k, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      if (pl.name && names) {
        // (Larger, on a pale halo: at 14 px, scaled down onto the page, a name was ~6 px of
        // ink lost in the drawn hills.)
        ctx.font = `italic ${Math.round(19 * k)}px ${SERIF}`
        ctx.lineJoin = 'round'
        ctx.lineWidth = 4 * k
        ctx.strokeStyle = 'rgba(244, 232, 204, 0.85)'
        ctx.strokeText(pl.name, x + 8 * k, y + 5 * k)
        ctx.fillStyle = 'rgba(40, 30, 18, 0.95)'
        ctx.fillText(pl.name, x + 8 * k, y + 5 * k)
      }
    }
    for (const g of giants) {
      if (!this.isSeen(g.x, g.z)) continue
      const [x, y] = at(g.x, g.z)
      ctx.fillStyle = 'rgba(128, 44, 28, 0.9)'
      ctx.strokeStyle = 'rgba(240, 228, 200, 0.85)'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(x, y, 4.5 * k, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
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
