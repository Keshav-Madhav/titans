// Glyph trails, seen through the Sight-stone (user: tools that open new kinds
// of puzzles). Marks the First Ones left on the land — invisible to the eye
// alone. Hold the stone up (V) and they show, faint and glowing, in a line
// across the ground; follow one to its end, still looking, and what it leads
// to shows itself (a cache: spots.ts reveals it).

import * as THREE from 'three'
import { mulberry32, type Terrain } from '@titans/shared'

export interface TrailDef {
  /** What waits at the end (discovery.ts id). */
  id: string
  start: { x: number; z: number }
  bearing: number
  seed: number
}

const MARKS = 12

export class Glyphs {
  readonly group = new THREE.Group()
  readonly trails: Array<{ def: TrailDef; end: THREE.Vector3; mats: THREE.MeshBasicMaterial[]; marks: THREE.Mesh[]; beam: THREE.MeshBasicMaterial; done: boolean }> = []
  private readonly beams: THREE.MeshBasicMaterial[] = []
  /** 0 … 1: how far the stone is raised (the marks and the view follow it). */
  look = 0
  private readonly veil = document.getElementById('sight')!
  /** Stood at a trail's end, looking: reveal what it leads to. */
  onEnd: (id: string) => void = () => {}

  /** `blocked`: is (x, z) under a formation, a trunk, a colossus (a mark there could not be stood on)? */
  constructor(defs: TrailDef[], terrain: Terrain, blocked: (x: number, z: number) => boolean = () => false) {
    const textures = [0, 1, 2, 3].map((k) => glyphTexture(k))
    for (const def of defs) {
      const rand = mulberry32(def.seed)
      const mats: THREE.MeshBasicMaterial[] = []
      const marks: THREE.Mesh[] = []
      let x = def.start.x
      let z = def.start.z
      let a = def.bearing
      let end = new THREE.Vector3()
      for (let k = 0; k <= MARKS; k++) {
        const last = k === MARKS
        const size = last ? 8 : 3
        // Drawn over the grass (depthTest off): it is a way of seeing, not paint on the ground.
        const mat = new THREE.MeshBasicMaterial({ map: textures[last ? 0 : 1 + (k % 3)], color: new THREE.Color(1.3, 3.6, 3.9), transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false })
        const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), mat)
        const y = terrain.heightAt(x, z)
        m.position.set(x, y + 0.15, z)
        marks.push(m)
        m.rotation.y = rand() * 6.28
        m.renderOrder = 2
        this.group.add(m)
        mats.push(mat)
        if (last) {
          end = new THREE.Vector3(x, y, z)
          // A faint column of light over the end, to walk toward.
          const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 2.4, 2.6), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide })
          const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.6, 60, 12, 1, true).translate(0, 30, 0), beamMat)
          beam.position.set(x, y, z)
          this.group.add(beam)
          this.beams.push(beamMat)
        }
        a += (rand() - 0.5) * 0.9
        a = a * 0.75 + def.bearing * 0.25
        const step = 24 + rand() * 16
        // Round anything solid: try turning a little either way until the next mark is on open ground.
        let nx = x + Math.sin(a) * step
        let nz = z + Math.cos(a) * step
        for (let k2 = 1; k2 < 12 && blocked(nx, nz); k2++) {
          const turn = (k2 % 2 ? 1 : -1) * Math.ceil(k2 / 2) * 0.35
          nx = x + Math.sin(a + turn) * step
          nz = z + Math.cos(a + turn) * step
        }
        x = nx
        z = nz
      }
      this.trails.push({ def, end, mats, marks, beam: this.beams[this.beams.length - 1], done: false })
    }
  }

  /** Where a trail ends (its cache's place). */
  endOf(id: string): THREE.Vector3 | null {
    return this.trails.find((t) => t.def.id === id)?.end.clone() ?? null
  }

  /** Followed before (a loaded game): its end is no longer a secret. */
  finish(id: string): void {
    const t = this.trails.find((t) => t.def.id === id)
    if (t) t.done = true
  }

  update(dt: number, raised: boolean, player: THREE.Vector3, time: number): void {
    this.look = raised ? Math.min(1, this.look + dt / 0.6) : Math.max(0, this.look - dt / 0.4)
    this.veil.style.opacity = String(this.look)
    this.group.visible = this.look > 0.01
    if (!this.group.visible) return
    for (const t of this.trails) {
      t.beam.opacity = this.look * (t.done ? 0.05 : 0.22) * (1 - THREE.MathUtils.smoothstep(t.end.distanceTo(player), 500, 900))
      t.mats.forEach((m, k) => {
        // Brighter near you, and a slow pulse running along the line toward its end.
        const p = t.marks[k].position
        const near = 1 - THREE.MathUtils.smoothstep(p.distanceTo(player), 60, 320)
        const pulse = 0.6 + 0.4 * Math.sin(time * 2.2 - k * 0.7)
        m.opacity = this.look * near * pulse * (t.done ? 0.5 : 1)
      })
      if (!t.done && raised && this.look > 0.9 && Math.hypot(t.end.x - player.x, t.end.z - player.z) < 4.5) {
        t.done = true
        this.onEnd(t.def.id)
      }
    }
  }
}

/** A glyph: spiral, rings, branching lines — pale on clear. `k` 0 is the trail's end-mark. */
function glyphTexture(k: number): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.strokeStyle = 'rgba(255,255,255,0.95)'
  g.lineCap = 'round'
  g.lineWidth = 6
  g.beginPath()
  if (k === 0) {
    for (const r of [52, 38, 24]) g.arc(64, 64, r, 0, Math.PI * 2)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      g.moveTo(64 + Math.cos(a) * 24, 64 + Math.sin(a) * 24)
      g.lineTo(64 + Math.cos(a) * 52, 64 + Math.sin(a) * 52)
    }
  } else if (k === 1) {
    for (let t = 0; t < 14; t += 0.1) g.lineTo(64 + Math.cos(t) * t * 3.6, 64 + Math.sin(t) * t * 3.6)
  } else if (k === 2) {
    g.arc(64, 64, 40, 0.3, Math.PI * 2 - 0.3)
    g.moveTo(64, 24)
    g.lineTo(64, 104)
    g.moveTo(40, 64)
    g.lineTo(88, 64)
  } else {
    g.moveTo(64, 14)
    g.lineTo(64, 114)
    for (const y of [36, 64, 92]) {
      g.moveTo(64, y)
      g.lineTo(36, y - 18)
      g.moveTo(64, y)
      g.lineTo(92, y - 18)
    }
  }
  g.stroke()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
