// Other players: a cloaked Wanderer per remote player, in their colour, with
// a name label. Positions arrive at the patch rate (20 Hz); each remote is
// rendered 100 ms in the past, between the two samples that bracket that
// moment, so motion is smooth regardless of network jitter.

import * as THREE from 'three'
import { Wanderer } from './wanderer'
import type { RemotePlayer } from './net'

const DELAY_MS = 100

interface Sample {
  t: number
  x: number
  y: number
  z: number
  yaw: number
}

interface Remote {
  body: Wanderer
  label: HTMLDivElement
  samples: Sample[]
  role: string
}

export class Remotes {
  readonly group = new THREE.Group()
  private readonly list = new Map<string, Remote>()
  private readonly layer = document.getElementById('labels')!
  private readonly v = new THREE.Vector3()

  /** Record the latest server state for every remote player. */
  ingest(players: { forEach(cb: (p: RemotePlayer, id: string) => void): void }, selfId: string): void {
    const now = performance.now()
    const live = new Set<string>()
    players.forEach((p, id) => {
      if (id === selfId) return
      live.add(id)
      let r = this.list.get(id)
      if (!r) {
        const body = new Wanderer(p.color)
        const label = document.createElement('div')
        label.className = 'label'
        label.textContent = p.name
        this.layer.appendChild(label)
        r = { body, label, samples: [], role: p.role }
        this.list.set(id, r)
        this.group.add(body.obj)
      }
      r.role = p.role
      const last = r.samples[r.samples.length - 1]
      if (!last || last.x !== p.x || last.z !== p.z || last.y !== p.y || now - last.t > 200) {
        r.samples.push({ t: now, x: p.x, y: p.y, z: p.z, yaw: p.yaw })
        if (r.samples.length > 12) r.samples.shift()
      }
    })
    for (const [id, r] of this.list) {
      if (live.has(id)) continue
      this.group.remove(r.body.obj)
      r.label.remove()
      this.list.delete(id)
    }
  }

  update(dt: number, camera: THREE.Camera): void {
    const t = performance.now() - DELAY_MS
    for (const r of this.list.values()) {
      // A remote who is driving the Titan has no body on the ground.
      r.body.obj.visible = r.role === 'wanderer'
      const s = r.samples
      if (s.length === 0) continue
      let a = s[0]
      let b = s[0]
      for (let i = 0; i < s.length - 1; i++) {
        if (s[i].t <= t && s[i + 1].t >= t) {
          a = s[i]
          b = s[i + 1]
          break
        }
        if (s[i + 1].t < t) a = b = s[i + 1]
      }
      const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1
      let dyaw = b.yaw - a.yaw
      dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw))
      r.body.drive(dt, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k, a.yaw + dyaw * k)

      // Label above the hood, hidden behind the camera or far away.
      this.v.copy(r.body.obj.position)
      this.v.y += 2.3
      const dist = this.v.distanceTo(camera.position)
      this.v.project(camera)
      const show = r.body.obj.visible && this.v.z < 1 && dist < 400
      r.label.style.display = show ? 'block' : 'none'
      if (show) {
        r.label.style.transform = `translate(-50%, -100%) translate(${((this.v.x + 1) / 2) * innerWidth}px, ${((1 - this.v.y) / 2) * innerHeight}px)`
      }
    }
  }

  get count(): number {
    return this.list.size
  }

  positions(): Array<{ x: number; z: number }> {
    return [...this.list.values()].map((r) => ({ x: r.body.obj.position.x, z: r.body.obj.position.z }))
  }
}
