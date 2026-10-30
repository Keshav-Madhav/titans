// DOM HUD over the canvas: perf readout, role chip, control hints.

import type * as THREE from 'three'
import type { TerrainView } from './terrain-view'

const HINTS = {
  wanderer:
    'Click to look · <kbd>W A S D</kbd> move · <kbd>Shift</kbd> run · <kbd>Space</kbd> jump · <kbd>E</kbd> grab a Titan · <kbd>T</kbd> become the Titan · <kbd>Enter</kbd> chat',
  climbing: '<kbd>W A S D</kbd> climb · <kbd>E</kbd> let go · <kbd>Space</kbd> leap off · rest on top to get your grip back',
  titan:
    '<kbd>W</kbd> walk · <kbd>A</kbd> <kbd>D</kbd> turn · <kbd>R</kbd> plough/stride · <kbd>F</kbd> stomp · <kbd>Q</kbd> shrug · <kbd>C</kbd> call · <kbd>X</kbd> rest · <kbd>T</kbd> step out',
}

export class Hud {
  private readonly perf = document.getElementById('perf')!
  private readonly role = document.getElementById('role')!
  private readonly hint = document.getElementById('hint')!
  private frames = 0
  private since = performance.now()
  last = { fps: 0, calls: 0, tris: 0 }

  setRole(role: 'wanderer' | 'titan' | 'climbing', steps: number, climbers = 0, titan?: { plough: boolean; stompReady: boolean }): void {
    const html =
      role === 'titan'
        ? `<b>Titan</b> · ${steps.toLocaleString()} steps · ${titan?.plough ? 'ploughing' : 'striding'}${titan?.stompReady ? '' : ' · stomp recharging'}${climbers ? ` · ${climbers} climbing you` : ''}`
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

  private readonly beaconEl = document.getElementById('beacon')!
  private beacon: { name: string; x: number; z: number; until: number } | null = null

  /** A Titan called out: point everyone at it for a while. */
  showCall(name: string, x: number, z: number): void {
    this.beacon = { name, x, z, until: performance.now() + 25000 }
  }

  /** Keep the call marker pointing at the Titan from where we stand. */
  updateBeacon(now: number, from: THREE.Vector3, camYaw: number): void {
    const b = this.beacon
    if (!b || now > b.until) {
      this.beaconEl.style.display = 'none'
      this.beacon = null
      return
    }
    const dx = b.x - from.x
    const dz = b.z - from.z
    // Bearing relative to where the camera looks (yaw 0 looks along -Z).
    const rel = Math.atan2(dx, dz) - (camYaw + Math.PI)
    const km = Math.hypot(dx, dz) / 1000
    this.beaconEl.style.display = 'flex'
    ;(this.beaconEl.firstElementChild as HTMLElement).style.transform = `rotate(${-rel}rad)`
    this.beaconEl.lastElementChild!.textContent = `${b.name} calls · ${km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`}`
  }

  /** Grip stamina bar, shown only while climbing. */
  setGrip(stamina: number | null): void {
    this.grip.style.display = stamina === null ? 'none' : 'block'
    if (stamina === null) return
    this.gripBar.style.width = `${Math.round(stamina * 100)}%`
    this.grip.classList.toggle('low', stamina < 0.25)
  }

  private readonly netEl = document.getElementById('net')!
  private netText = ''

  /** The mode chip (click it, or press M, for the world panel). */
  net(mode: 'connecting' | 'online' | 'offline', players: number, single: boolean): void {
    const t =
      mode === 'online' ? `<b>●</b> online · ${players} here` : mode === 'connecting' ? 'connecting…' : single ? 'single player ⚙' : 'offline'
    if (t !== this.netText) this.netEl.innerHTML = this.netText = t
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
