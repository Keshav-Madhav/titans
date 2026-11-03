// DOM HUD over the canvas: perf readout, what you are doing, control hints, grip.

import type * as THREE from 'three'
import type { TerrainView } from './terrain-view'

// (The wanderer's line grows as you find things: see setHave.)
const HINTS = {
  wanderer: 'Click to look · <kbd>W A S D</kbd> move · <kbd>Shift</kbd> run · <kbd>Space</kbd> jump · <kbd>E</kbd> climb',
  climbing: '<kbd>W A S D</kbd> climb · <kbd>E</kbd> let go · <kbd>Space</kbd> leap off · rest on top to get your grip back',
  flying: '<kbd>W</kbd> dive (speed) · <kbd>S</kbd> pull up (height) · <kbd>A D</kbd> bank · slow too much and you stall · steep ground ahead lifts you · let go of <kbd>Space</kbd> to drop',
}

export class Hud {
  private readonly perf = document.getElementById('perf')!
  private readonly role = document.getElementById('role')!
  private readonly hint = document.getElementById('hint')!
  private frames = 0
  private since = performance.now()
  last = { fps: 0, calls: 0, tris: 0 }

  /** What you are doing now: the chip at the top right and the hint line. */
  /** Mark the J / I keys while something found has not been looked at yet. */
  news(journal: boolean, bag: boolean): void {
    const any = journal || bag
    if (any && !this.hasNews) this.newsAge = 0
    this.hasNews = any
    for (const k of this.hint.querySelectorAll('kbd')) {
      if (k.textContent === 'J') k.classList.toggle('news', journal)
      if (k.textContent === 'I') k.classList.toggle('news', bag)
    }
  }

  private still = 0
  private modeAge = 0
  private hasNews = false
  /** Seconds since J / I last gained news (the strip comes back a while to show it). */
  private newsAge = 99
  /**
   * Once you know the controls (`practised`), the key strip gets out of the picture while you
   * move: it fades away after a few seconds on the go, and comes back when you stand still a
   * while, for a few seconds after you start climbing or flying, or when J / I has news.
   */
  settle(dt: number, moving: boolean, practised: boolean): void {
    this.still = moving ? 0 : this.still + dt
    this.modeAge += dt
    this.newsAge += dt
    const show = !practised || this.still > 2.5 || this.modeAge < 6 || this.newsAge < 8
    this.hint.classList.toggle('away', !show)
  }

  setMode(mode: 'wanderer' | 'climbing' | 'flying'): void {
    if (mode === this.mode) return
    this.mode = mode
    this.modeAge = 0
    this.role.innerHTML = mode === 'climbing' ? '<b>Climbing</b>' : mode === 'flying' ? '<b>Flying</b>' : '<b>Wanderer</b>'
    this.hint.innerHTML = HINTS[mode] + (mode === 'wanderer' && this.haveBag ? ' · <kbd>M</kbd> map · <kbd>J</kbd> journal · <kbd>I</kbd> bag' : '')
  }

  private haveBag = false
  /**
   * What you have (the hint line and the minimap show only what you can use:
   * a newcomer is not shown keys for a map and a bag they do not have).
   */
  setHave(bag: boolean): void {
    if (bag === this.haveBag) return
    this.haveBag = bag
    document.body.classList.toggle('has-map', bag)
    const m = this.mode
    this.mode = ''
    this.setMode((m || 'wanderer') as 'wanderer')
  }

  /** The title: the land is ready; wait for a click to wake. */
  titleReady(onWake: () => void): void {
    const el = document.getElementById('loading')!
    el.classList.add('title')
    document.body.classList.add('titling')
    document.getElementById('loading-text')!.textContent = 'click to wake'
    el.addEventListener(
      'click',
      () => {
        document.body.classList.remove('titling')
        onWake()
      },
      { once: true },
    )
  }

  private mode = ''
  private readonly grip = document.getElementById('grip')!
  private readonly gripBar = this.grip.firstElementChild as HTMLElement

  /** Grip stamina bar, shown only while climbing. */
  setGrip(stamina: number | null): void {
    this.grip.style.display = stamina === null ? 'none' : 'block'
    if (stamina === null) return
    this.gripBar.style.width = `${Math.round(stamina * 100)}%`
    this.grip.classList.toggle('low', stamina < 0.25)
  }

  loaded(): void {
    document.getElementById('loading')!.classList.add('done')
  }

  frame(now: number, renderer: THREE.WebGLRenderer, terrain: TerrainView, focus: THREE.Vector3, cam: THREE.Camera, quality = 0): void {
    this.frames++
    if (now - this.since < 250) return
    const fps = (this.frames * 1000) / (now - this.since)
    this.frames = 0
    this.since = now
    const info = renderer.info.render
    this.last = { fps: Math.round(fps), calls: info.calls, tris: info.triangles }
    const s = terrain.stats
    this.perf.textContent =
      `${this.last.fps} fps   ${info.calls} calls   ${(info.triangles / 1000).toFixed(0)}k tris\n` +
      `chunks ${s.shown} shown  ${s.queued} queued  ${s.buildMs.toFixed(1)} ms  q${quality}\n` +
      `pos ${focus.x.toFixed(0)}, ${focus.y.toFixed(1)}, ${focus.z.toFixed(0)}   cam y ${cam.position.y.toFixed(0)}`
  }
}
