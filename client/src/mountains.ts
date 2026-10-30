// Dormant Titans. A Titan left resting with nobody to walk it falls asleep,
// and its body becomes a mountain where it sat: mossier, half-buried in the
// hill that rose under it, labelled with the name of whoever walked it last
// and how long it has slept (the reel's "afk_mountain · AFK · 4 YEARS").
// They can be climbed like the awake Titan.

import * as THREE from 'three'
import { TITAN_HEIGHT, type MountainInfo, type Terrain } from '@titans/shared'
import { Titan } from './titan'
import type { ClimbTarget } from './climb'

interface Entry {
  titan: Titan
  label: HTMLDivElement
  info: MountainInfo
}

function slept(ms: number): string {
  const m = ms / 60000
  if (m < 1) return 'just now'
  if (m < 60) return `${Math.floor(m)} min`
  const h = m / 60
  if (h < 48) return `${Math.floor(h)} h`
  const d = h / 24
  return d < 730 ? `${Math.floor(d)} days` : `${Math.floor(d / 365)} years`
}

export class Mountains {
  readonly group = new THREE.Group()
  private readonly list = new Map<string, Entry>()
  private readonly layer = document.getElementById('labels')!
  private readonly v = new THREE.Vector3()

  /** Make the set match the server's (or offline list). Returns ids that are new. */
  sync(all: { forEach(cb: (m: { name: string; since: number; pose: string }, id: string) => void): void }): string[] {
    const live = new Set<string>()
    const fresh: string[] = []
    all.forEach((m, id) => {
      live.add(id)
      if (!this.list.has(id)) {
        this.add(id, { name: m.name, since: m.since, pose: JSON.parse(m.pose) })
        fresh.push(id)
      }
    })
    for (const [id, e] of this.list) if (!live.has(id)) this.remove(id, e)
    return fresh
  }

  add(id: string, info: MountainInfo): void {
    const p = info.pose
    const titan = new Titan(TITAN_HEIGHT, p.x, p.z, p.heading, 7, 1)
    titan.gait.restore({ ...p, resting: true })
    titan.restBlend = 1
    const label = document.createElement('div')
    label.className = 'label mountain'
    this.layer.appendChild(label)
    this.list.set(id, { titan, label, info })
    this.group.add(titan.group)
  }

  private remove(id: string, e: Entry): void {
    this.group.remove(e.titan.group)
    e.label.remove()
    this.list.delete(id)
  }

  /** Pose on today's ground (the hill under them rises after they sleep), and place labels. */
  update(terrain: Terrain, camera: THREE.Camera, now: number): void {
    for (const e of this.list.values()) {
      e.titan.pose(terrain, 0)
      e.titan.group.updateMatrixWorld(true)
      this.v.copy(e.titan.head)
      this.v.y += 0.12 * TITAN_HEIGHT
      const dist = this.v.distanceTo(camera.position)
      this.v.project(camera)
      const show = this.v.z < 1 && dist < 4000
      e.label.style.display = show ? 'block' : 'none'
      if (!show) continue
      e.label.innerHTML = `<b>${escapeHtml(e.info.name)}</b><small>DORMANT · ${slept(now - e.info.since)}</small>`
      e.label.style.transform = `translate(-50%, -100%) translate(${((this.v.x + 1) / 2) * innerWidth}px, ${((1 - this.v.y) / 2) * innerHeight}px)`
    }
  }

  get(id: string): Titan | undefined {
    return this.list.get(id)?.titan
  }

  targets(): ClimbTarget[] {
    return [...this.list].map(([id, e]) => ({ id, titan: e.titan }))
  }

  get count(): number {
    return this.list.size
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
