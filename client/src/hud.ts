// DOM HUD over the canvas: perf readout, what you are doing, control hints, grip.

import type * as THREE from 'three'
import type { TerrainView } from './terrain-view'

const HINTS = {
  wanderer: 'Click to look · <kbd>W A S D</kbd> move · <kbd>Shift</kbd> run · <kbd>Space</kbd> jump · <kbd>E</kbd> climb · <kbd>M</kbd> map · <kbd>J</kbd> journal · <kbd>I</kbd> bag',
  climbing: '<kbd>W A S D</kbd> climb · <kbd>E</kbd> let go · <kbd>Space</kbd> leap off · rest on top to get your grip back',
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
    for (const k of this.hint.querySelectorAll('kbd')) {
      if (k.textContent === 'J') k.classList.toggle('news', journal)
      if (k.textContent === 'I') k.classList.toggle('news', bag)
    }
  }

  setMode(mode: 'wanderer' | 'climbing'): void {
    if (mode === this.mode) return
    this.mode = mode
    this.role.innerHTML = mode === 'climbing' ? '<b>Climbing</b>' : '<b>Wanderer</b>'
    this.hint.innerHTML = HINTS[mode]
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
