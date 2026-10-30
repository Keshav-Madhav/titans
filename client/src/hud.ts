// DOM HUD over the canvas: perf readout, role chip, control hints.

import type * as THREE from 'three'
import type { TerrainView } from './terrain-view'

const HINTS = {
  wanderer:
    'Click to look · <kbd>W A S D</kbd> move · <kbd>Shift</kbd> run · <kbd>Space</kbd> jump · <kbd>E</kbd> grab a Titan · <kbd>T</kbd> become the Titan · <kbd>Enter</kbd> chat',
  climbing: '<kbd>W A S D</kbd> climb · <kbd>E</kbd> let go · <kbd>Space</kbd> leap off · rest on top to get your grip back',
  titan: '<kbd>W</kbd> walk · <kbd>A</kbd> <kbd>D</kbd> turn · <kbd>Q</kbd> shrug off climbers · <kbd>T</kbd> step out as a Wanderer',
}

export class Hud {
  private readonly perf = document.getElementById('perf')!
  private readonly role = document.getElementById('role')!
  private readonly hint = document.getElementById('hint')!
  private frames = 0
  private since = performance.now()
  last = { fps: 0, calls: 0, tris: 0 }

  setRole(role: 'wanderer' | 'titan' | 'climbing', steps: number, climbers = 0): void {
    const html =
      role === 'titan'
        ? `<b>Titan</b> · ${steps.toLocaleString()} steps${climbers ? ` · ${climbers} climbing you` : ''}`
        : role === 'climbing'
          ? '<b>Climbing</b>'
          : '<b>Wanderer</b>'
    if (html !== this.roleHtml) this.role.innerHTML = this.roleHtml = html
    if (role !== this.hintRole) {
      this.hint.innerHTML = HINTS[role]
      this.hintRole = role
    }
  }

  private roleHtml = ''
  private hintRole = ''
  private readonly grip = document.getElementById('grip')!
  private readonly gripBar = this.grip.firstElementChild as HTMLElement

  /** Grip stamina bar, shown only while climbing. */
  setGrip(stamina: number | null): void {
    this.grip.style.display = stamina === null ? 'none' : 'block'
    if (stamina === null) return
    this.gripBar.style.width = `${Math.round(stamina * 100)}%`
    this.grip.classList.toggle('low', stamina < 0.25)
  }

  private readonly netEl = document.getElementById('net')!
  private netText = ''

  net(mode: 'connecting' | 'online' | 'offline', players: number): void {
    const t = mode === 'online' ? `<b>●</b> online · ${players} here` : mode === 'connecting' ? 'connecting…' : 'offline'
    if (t !== this.netText) this.netEl.innerHTML = this.netText = t
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
