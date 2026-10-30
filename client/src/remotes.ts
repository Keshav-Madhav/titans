// Other players: a cloaked Wanderer per remote player, in their colour, with
// a name label. Positions arrive at the patch rate (20 Hz); each remote is
// rendered 100 ms in the past, between the two samples that bracket that
// moment, so motion is smooth regardless of network jitter.

import * as THREE from 'three'
import { Wanderer } from './wanderer'
import type { RemotePlayer } from './net'
import type { Titan } from './titan'
import { holdToWorld, type Hold } from './climb'
import { toScreen } from './screen'

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
  /** Where on the Titan they hold, if climbing (part-local, smoothed toward the latest report). */
  hold: Hold | null
  shown: Hold | null
}

export class Remotes {
  readonly group = new THREE.Group()
  private readonly list = new Map<string, Remote>()
  private readonly layer = document.getElementById('labels')!
  private readonly v = new THREE.Vector3()
  private readonly n = new THREE.Vector3()
  private readonly px = { x: 0, y: 0 }

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
        r = { body, label, samples: [], role: p.role, hold: null, shown: null }
        this.list.set(id, r)
        this.group.add(body.obj)
      }
      r.role = p.role
      // The server sends "part" for the awake Titan, "mountainId/part" for a dormant one.
      const slash = p.climb ? p.climb.indexOf('/') : -1
      r.hold = p.climb
        ? { titan: slash < 0 ? '' : p.climb.slice(0, slash), part: p.climb.slice(slash + 1), lump: p.lump, x: p.lx, y: p.ly, z: p.lz }
        : null
      if (!r.hold || r.shown?.titan !== r.hold.titan || r.shown?.part !== r.hold.part || r.shown.lump !== r.hold.lump) r.shown = r.hold && { ...r.hold }
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

  update(dt: number, camera: THREE.Camera, titanOf: (id: string) => Titan | undefined): void {
    const t = performance.now() - DELAY_MS
    for (const r of this.list.values()) {
      // A remote who is driving the Titan has no body on the ground.
      r.body.obj.visible = r.role === 'wanderer'
      if (r.hold && r.shown) {
        // Climbing: glue them to the part they hold, on OUR pose of the Titan.
        const k = 1 - Math.exp(-10 * dt)
        r.shown.x += (r.hold.x - r.shown.x) * k
        r.shown.y += (r.hold.y - r.shown.y) * k
        r.shown.z += (r.hold.z - r.shown.z) * k
        if (holdToWorld(titanOf, r.shown, this.v, this.n)) {
          r.body.climbPose(dt, this.v, this.n, this.n.y > 0.62, r.samples[r.samples.length - 1]?.yaw ?? 0, 0)
        }
        this.placeLabel(r, camera, true)
        continue
      }
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

      this.placeLabel(r, camera, false)
    }
  }

  /**
   * Label above the hood, hidden behind the camera or far away — except
   * climbers, who are marked at any range (the Titan wants to see them).
   */
  private placeLabel(r: Remote, camera: THREE.Camera, climbing: boolean): void {
    this.v.copy(r.body.obj.position)
    this.v.y += 2.3
    const dist = this.v.distanceTo(camera.position)
    const show = r.body.obj.visible && (climbing || dist < 400) && toScreen(this.v, camera, this.px)
    r.label.style.display = show ? 'block' : 'none'
    r.label.classList.toggle('climbing', climbing)
    if (show) r.label.style.transform = `translate(-50%, -100%) translate(${this.px.x}px, ${this.px.y}px)`
  }

  /** Remote players currently on the Titan. */
  get climbers(): number {
    let n = 0
    for (const r of this.list.values()) if (r.hold) n++
    return n
  }

  get count(): number {
    return this.list.size
  }

  positions(): Array<{ x: number; z: number }> {
    return [...this.list.values()].map((r) => ({ x: r.body.obj.position.x, z: r.body.obj.position.z }))
  }
}
