// Chase the light (user, 2026-10-31: "sometimes it can be something fun like
// chase the light"). A wisp hangs near a landmark. Come close and it darts
// away to its next place and waits; keep after it — up slopes, over ridges,
// through trees — and at the end of its path it sinks into the ground, and
// where it went in, something is left (a trinket: spots.ts reveals it).

import * as THREE from 'three'
import { mulberry32, type Terrain } from '@titans/shared'
import { softDot } from './eerie'

export interface WispDef {
  /** The trinket it leads to (discovery.ts id). */
  id: string
  start: { x: number; z: number }
  /** Roughly where it heads (radians, 0 = +z). */
  bearing: number
  seed: number
}

const STEPS = 9
const SHY = 16 // come this close and it goes
const SPEED = 11

interface Wisp {
  def: WispDef
  path: THREE.Vector3[]
  i: number
  pos: THREE.Vector3
  flying: boolean
  done: boolean
  sprite: THREE.Sprite
  motes: THREE.Points
  trail: Float32Array
}

export class Wisps {
  readonly group = new THREE.Group()
  readonly wisps: Wisp[] = []
  private time = 0
  /** It reached the end of its path: reveal what it leads to at `at`. */
  onSettle: (id: string, at: THREE.Vector3) => void = () => {}

  constructor(
    defs: WispDef[],
    terrain: Terrain,
    /** Standing water at (x, z): it never waits over it (you would have to swim to it). */
    wet: (x: number, z: number) => boolean = () => false,
  ) {
    const tex = orbTexture()
    for (const def of defs) {
      const rand = mulberry32(def.seed)
      // Its path: a wandering line, each hop 45–80 m, preferring the way up.
      const path: THREE.Vector3[] = []
      let x = def.start.x
      let z = def.start.z
      // (The Old Wood's started in the middle of a Mire pool, glowing under the water.)
      for (let r = 6; r <= 120 && wet(x, z); r += 6) {
        for (let k = 0; k < 12; k++) {
          const tx = def.start.x + Math.cos(k * 0.5236) * r
          const tz = def.start.z + Math.sin(k * 0.5236) * r
          if (!wet(tx, tz)) {
            x = tx
            z = tz
            break
          }
        }
      }
      let a = def.bearing
      for (let k = 0; k < STEPS; k++) {
        path.push(new THREE.Vector3(x, terrain.heightAt(x, z) + 1.8, z))
        let best = { x, z, score: -Infinity, a }
        for (let c = 0; c < 6; c++) {
          const ca = a + (rand() - 0.5) * 1.6
          const d = 45 + rand() * 35
          const nx = x + Math.sin(ca) * d
          const nz = z + Math.cos(ca) * d
          const rise = terrain.heightAt(nx, nz) - terrain.heightAt(x, z)
          // Up is good (it leads you somewhere), a sheer wall is not (you could not follow).
          const score = Math.min(rise, 18) - Math.max(0, rise - 30) * 3 + rand() * 6 - (wet(nx, nz) ? 1000 : 0)
          if (score > best.score) best = { x: nx, z: nz, score, a: ca }
        }
        x = best.x
        z = best.z
        a = best.a * 0.6 + def.bearing * 0.4
      }
      const dot = softDot()
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(5, 5.5, 3.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))
      sprite.scale.setScalar(1.6)
      const trail = new Float32Array(24 * 3)
      const mg = new THREE.BufferGeometry()
      mg.setAttribute('position', new THREE.BufferAttribute(trail, 3))
      // (A soft round dot: without one each mote was drawn as a flat square — up close, a pale box
      // hanging in the air beside you; the user, 2026-11-06.)
      const motes = new THREE.Points(mg, new THREE.PointsMaterial({ color: new THREE.Color(3, 3.3, 2), map: dot, size: 0.22, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))
      motes.frustumCulled = false
      const pos = path[0].clone()
      for (let k = 0; k < 24; k++) trail.set([pos.x, pos.y, pos.z], k * 3)
      this.group.add(sprite, motes)
      this.wisps.push({ def, path, i: 0, pos, flying: false, done: false, sprite, motes, trail })
    }
  }

  /** Where a wisp's path ends (its trinket's place). */
  endOf(id: string): THREE.Vector3 | null {
    const w = this.wisps.find((w) => w.def.id === id)
    return w ? w.path[w.path.length - 1].clone().setY(w.path[w.path.length - 1].y - 1.8) : null
  }

  /** Already followed to the end (a loaded game): gone. */
  finish(id: string): void {
    const w = this.wisps.find((w) => w.def.id === id)
    if (!w) return
    w.done = true
    w.sprite.visible = w.motes.visible = false
  }

  update(dt: number, player: THREE.Vector3): void {
    this.time += dt
    for (const w of this.wisps) {
      if (w.done) continue
      const target = w.path[w.i]
      if (w.flying) {
        const to = target.clone().sub(w.pos)
        const d = to.length()
        if (d < 0.5) w.flying = false
        else w.pos.addScaledVector(to, Math.min(1, (SPEED * dt) / d))
      } else if (Math.hypot(w.pos.x - player.x, w.pos.z - player.z) < SHY && Math.abs(w.pos.y - player.y) < 30) {
        // (Across, not straight-line: below it on a steep rise you are still close.)
        if (w.i === w.path.length - 1) {
          // The end: it sinks into the ground and is gone; something is left.
          w.done = true
          w.sprite.visible = w.motes.visible = false
          this.onSettle(w.def.id, this.endOf(w.def.id)!)
          continue
        }
        w.i++
        w.flying = true
      }
      // Bob and flicker; a short trail of motes behind it.
      const bob = Math.sin(this.time * 2.3 + w.def.seed) * 0.35
      w.sprite.position.set(w.pos.x, w.pos.y + bob, w.pos.z)
      const flick = 0.85 + 0.15 * Math.sin(this.time * 17 + w.def.seed) * Math.sin(this.time * 7.3)
      w.sprite.material.opacity = flick
      // Seen only from nearer than ~700 m (a far light on the Green is a distraction, not a lure).
      const far = player.distanceTo(w.pos)
      w.sprite.visible = w.motes.visible = far < 700
      w.trail.copyWithin(3, 0, w.trail.length - 3)
      w.trail.set([w.sprite.position.x + (Math.random() - 0.5) * 0.4, w.sprite.position.y + (Math.random() - 0.5) * 0.4, w.sprite.position.z + (Math.random() - 0.5) * 0.4], 0)
      ;(w.motes.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    }
  }
}

/** A soft round glow with a bright core. */
function orbTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,240,1)')
  grad.addColorStop(0.18, 'rgba(255,250,215,0.85)')
  grad.addColorStop(0.45, 'rgba(230,240,200,0.25)')
  grad.addColorStop(1, 'rgba(230,240,200,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
