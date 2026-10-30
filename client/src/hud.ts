// DOM HUD over the canvas: perf readout, role chip, control hints.

import type * as THREE from 'three'
import type { TerrainView } from './terrain-view'

const HINTS = {
  wanderer:
    'Click to look · <kbd>W A S D</kbd> move · <kbd>Shift</kbd> run · <kbd>Space</kbd> jump · <kbd>T</kbd> become the Titan · wheel zoom',
  titan: '<kbd>W</kbd> walk · <kbd>A</kbd> <kbd>D</kbd> turn · <kbd>T</kbd> step out as a Wanderer · wheel zoom',
}

export class Hud {
  private readonly perf = document.getElementById('perf')!
  private readonly role = document.getElementById('role')!
  private readonly hint = document.getElementById('hint')!
  private frames = 0
  private since = performance.now()
  last = { fps: 0, calls: 0, tris: 0 }

  setRole(role: 'wanderer' | 'titan', steps: number): void {
    this.role.innerHTML = role === 'titan' ? `<b>Titan</b> · ${steps.toLocaleString()} steps` : '<b>Wanderer</b>'
    this.hint.innerHTML = HINTS[role]
  }

  loaded(): void {
    document.getElementById('loading')!.classList.add('done')
  }

  frame(now: number, renderer: THREE.WebGLRenderer, terrain: TerrainView, focus: THREE.Vector3, cam: THREE.Camera): void {
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
      `chunks ${s.shown} shown  ${s.queued} queued  ${s.buildMs.toFixed(1)} ms\n` +
      `pos ${focus.x.toFixed(0)}, ${focus.y.toFixed(1)}, ${focus.z.toFixed(0)}   cam y ${cam.position.y.toFixed(0)}`
  }
}
