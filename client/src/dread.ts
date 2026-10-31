// Dread (user, 2026-10-31: "bring in more horrorful elements, without
// jumpscares"; PLAN.md §2g). A director of rare, slow, unexplained things.
// Each arrives slowly, at the edge of sight or as a sound first; none can
// hurt you; none is explained; most leave when looked at. Rare: one at a time,
// minutes apart, and each kind only now and then.
//
//   stillness   — every sound in the land stops; far off, something enormous
//                 walks past beyond the hills (felt, heard, not seen); then the
//                 insects start again, one at a time
//   pale walker — in fog or at dusk, a pale giant far off walks toward you and
//                 is never any nearer, however you go; stare at it, or let the
//                 fog thin, and it is not there
//   footprints  — at dawn: a line of fresh giant footprints across the grass
//                 near you, where nothing walked in the night (they lead
//                 somewhere)
//   eyes        — at night in the Old Wood: pairs of pale lights between the
//                 trunks, far too high above the ground; they close when looked at
//   deep note   — a sound too low to hear well, and the ground trembling
//
// The director only decides when and where; main.ts gives it the means
// (sound, footprints, narration) through `hooks`.

import * as THREE from 'three'
import { mulberry32, type GaitEvent } from '@titans/shared'
import { Titan } from './titan'

export type DreadKind = 'stillness' | 'walker' | 'footprints' | 'eyes' | 'deep'

export interface DreadHooks {
  /** Silence the land (true) or let it come back (false). */
  hush: (on: boolean) => void
  /** A far, heavy footfall (d metres away). */
  farStep: (d: number) => void
  /** The deep note. */
  deep: () => void
  /** The ground trembles (0 … 1). */
  shake: (k: number) => void
  /** Lay a giant's footprint at (x, z), heading (hx, hz). */
  footprint: (x: number, z: number, hx: number, hz: number) => void
  /** Where the footprints end: something is left there. */
  footprintsEnd: (x: number, z: number) => void
  /** A line at the lower left, after a while. */
  say: (text: string) => void
  /** Something witnessed (a journal entry). */
  witness: (kind: DreadKind) => void
}

export interface DreadWorld {
  player: THREE.Vector3
  camera: THREE.Camera
  /** 0 day … 1 deep night; and twilight. */
  night: number
  dusk: number
  /** The weather's darkness (0 … 1). */
  dark: number
  /** 0 … 1 through the day (sky.time). */
  time: number
  forest: number
  open: number
  heightAt: (x: number, z: number) => number
  /** No event may begin while something else holds the player (an awakening, a climb). */
  busy: boolean
}

const EYE_PAIRS = 6

export class Dread {
  readonly group = new THREE.Group()
  /** What is happening now (null: nothing). */
  now: DreadKind | null = null
  private t = 0
  /** Seconds until the next thing may begin. */
  private wait: number
  private readonly last = new Map<DreadKind, number>()
  private clock = 0
  private readonly rand: () => number
  readonly walker: Titan
  private walkerA = 0
  private stare = 0
  readonly eyes: THREE.Sprite[] = []
  private readonly eyeOpen: number[] = []
  private prints: { x: number; z: number; hx: number; hz: number; i: number; n: number } | null = null
  private dawnSeen = -1

  constructor(
    private readonly hooks: DreadHooks,
    seed: number,
  ) {
    this.rand = mulberry32(seed ^ 0xd4ead)
    this.wait = 6 * 60 + this.rand() * 6 * 60
    // The pale walker: a giant drawn pale and thin against the fog.
    this.walker = new Titan(320, 0, 0, 0, 913, 0)
    this.walker.restBlend = 0
    this.walker.group.visible = false
    this.walker.group.scale.set(0.72, 1, 0.72)
    this.walker.group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (m && 'color' in m) {
        const c = m.clone()
        c.color = new THREE.Color(0.86, 0.85, 0.82)
        c.transparent = true
        c.opacity = 0
        ;(o as THREE.Mesh).material = c
      }
    })
    this.group.add(this.walker.group)
    // Eyes: pale, small, in pairs.
    const tex = eyeTexture()
    for (let i = 0; i < EYE_PAIRS * 2; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(2.2, 2.3, 2.2), transparent: true, opacity: 0, depthWrite: false, fog: false }))
      s.scale.set(1.5, 0.8, 1)
      s.visible = false
      this.eyes.push(s)
      this.eyeOpen.push(0)
      this.group.add(s)
    }
  }

  private since(kind: DreadKind): number {
    return this.clock - (this.last.get(kind) ?? -1e9)
  }

  /** Begin one now (tools; or the director). Returns false if it cannot happen here and now. */
  begin(kind: DreadKind, w: DreadWorld): boolean {
    if (this.now) return false
    const p = w.player
    if (kind === 'walker') {
      // Somewhere ahead and to one side, far: it will walk toward you.
      const fwd = new THREE.Vector3()
      w.camera.getWorldDirection(fwd)
      this.walkerA = Math.atan2(fwd.x, fwd.z) + (this.rand() - 0.5) * 1.2
      this.placeWalker(w, 1100)
      this.walker.group.visible = true
      this.stare = 0
    } else if (kind === 'eyes') {
      for (let i = 0; i < EYE_PAIRS; i++) {
        const a = this.rand() * Math.PI * 2
        const d = 28 + this.rand() * 34
        const x = p.x + Math.cos(a) * d
        const z = p.z + Math.sin(a) * d
        const y = w.heightAt(x, z) + 7 + this.rand() * 6
        const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(0.8)
        this.eyes[i * 2].position.set(x, y, z).add(side)
        this.eyes[i * 2 + 1].position.set(x, y, z).sub(side)
        this.eyes[i * 2].visible = this.eyes[i * 2 + 1].visible = true
        this.eyeOpen[i * 2] = this.eyeOpen[i * 2 + 1] = 0.001
      }
    } else if (kind === 'footprints') {
      // A line across the grass 250–500 m off, crossing your way, ending somewhere.
      const a = this.rand() * Math.PI * 2
      const d = 250 + this.rand() * 250
      const hx = Math.cos(a + Math.PI / 2)
      const hz = Math.sin(a + Math.PI / 2)
      this.prints = { x: p.x + Math.cos(a) * d - hx * 300, z: p.z + Math.sin(a) * d - hz * 300, hx, hz, i: 0, n: 16 }
    } else if (kind === 'stillness') {
      this.hooks.hush(true)
    } else if (kind === 'deep') {
      this.hooks.deep()
    }
    this.now = kind
    this.t = 0
    this.last.set(kind, this.clock)
    return true
  }

  private placeWalker(w: DreadWorld, d: number): void {
    const x = w.player.x + Math.sin(this.walkerA) * d
    const z = w.player.z + Math.cos(this.walkerA) * d
    this.walker.gait.x = x
    this.walker.gait.z = z
    // It faces you.
    this.walker.gait.heading = this.walkerA + Math.PI
  }

  /** End whatever is happening (tools). */
  stop(w: DreadWorld): void {
    this.end(w)
  }

  private end(_w: DreadWorld): void {
    const kind = this.now
    if (!kind) return
    if (kind === 'stillness') this.hooks.hush(false)
    if (kind === 'walker') this.walker.group.visible = false
    if (kind === 'eyes') for (const e of this.eyes) e.visible = false
    this.now = null
    this.wait = 7 * 60 + this.rand() * 9 * 60
  }

  /** Each frame. `discard` collects the walker's gait events (it leaves no prints). */
  update(dt: number, w: DreadWorld, terrain: { heightAt: (x: number, z: number) => number }): void {
    this.clock += dt
    if (!this.now) {
      // Dawn: once a day, the footprints (on open ground).
      const dawn = w.time > 0.11 && w.time < 0.16
      const day = Math.floor(this.clock / (24 * 60))
      if (dawn && this.dawnSeen !== day && w.open > 0.5 && !w.busy && this.rand() < dt * 0.05) {
        this.dawnSeen = day
        this.begin('footprints', w)
        return
      }
      this.wait -= dt
      if (this.wait > 0 || w.busy) return
      // What fits now and here, and has not happened lately.
      const can: DreadKind[] = []
      if (this.since('stillness') > 25 * 60) can.push('stillness')
      if ((w.dark > 0.45 || w.dusk > 0.5) && w.open > 0.4 && this.since('walker') > 30 * 60) can.push('walker')
      if (w.night > 0.6 && w.forest > 0.4 && this.since('eyes') > 20 * 60) can.push('eyes')
      if (this.since('deep') > 35 * 60) can.push('deep')
      if (!can.length) {
        this.wait = 60
        return
      }
      this.begin(can[Math.floor(this.rand() * can.length)], w)
      return
    }
    this.t += dt
    const t = this.t
    const kind = this.now
    if (kind === 'stillness') {
      // Something passes beyond the hills: slow, heavy steps, felt more than heard.
      if (t > 6 && t < 30 && Math.floor((t - dt) / 3.4) !== Math.floor(t / 3.4)) {
        this.hooks.farStep(2600 - (t - 6) * 20)
        this.hooks.shake(0.05)
      }
      if (t > 38) {
        this.hooks.witness('stillness')
        this.end(w)
      }
    } else if (kind === 'walker') {
      // Fade in over 8 s; walk toward you, held at the same distance.
      const vis = Math.min(1, t / 8)
      this.discardEvents.length = 0
      this.walker.step(dt * 0.6, { forward: 0.7, turn: 0 }, this.discardEvents)
      this.placeWalker(w, 1100)
      this.walker.pose(terrain as never, dt)
      // Looked at straight on for long, or the fog thins, or three minutes: gone.
      const to = new THREE.Vector3(this.walker.gait.x - w.player.x, 0, this.walker.gait.z - w.player.z).normalize()
      const fwd = new THREE.Vector3()
      w.camera.getWorldDirection(fwd)
      fwd.y = 0
      fwd.normalize()
      const looking = fwd.dot(to) > Math.cos(0.12)
      this.stare = looking ? this.stare + dt : Math.max(0, this.stare - dt * 0.5)
      if (looking && t > 10) this.hooks.witness('walker')
      const leave = this.stare > 4 || (w.dark < 0.3 && w.dusk < 0.3) || t > 180
      this.leaving = leave ? Math.min(1, this.leaving + dt / 2.5) : 0
      const op = vis * (1 - this.leaving) * 0.85
      this.walker.group.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
        if (m && 'opacity' in m) m.opacity = op
      })
      if (this.leaving >= 1) {
        this.leaving = 0
        this.end(w)
      }
    } else if (kind === 'eyes') {
      let open = 0
      const fwd = new THREE.Vector3()
      w.camera.getWorldDirection(fwd)
      for (let i = 0; i < this.eyes.length; i++) {
        const e = this.eyes[i]
        if (!e.visible) continue
        const to = e.position.clone().sub(w.camera.position).normalize()
        // They open slowly; looked at, they close (and are gone).
        if (to.dot(fwd) > Math.cos(0.09) && this.eyeOpen[i] > 0.5) {
          this.eyeOpen[i] = -1
          this.hooks.witness('eyes')
        }
        if (this.eyeOpen[i] < 0) {
          e.material.opacity = Math.max(0, e.material.opacity - dt * 3)
          if (e.material.opacity <= 0) e.visible = false
        } else {
          this.eyeOpen[i] = Math.min(1, this.eyeOpen[i] + dt / 6)
          // A slow blink now and then.
          const blink = Math.sin(this.clock * 0.7 + i) > 0.985 ? 0 : 1
          e.material.opacity = this.eyeOpen[i] * 0.9 * blink
          open++
        }
      }
      if (open === 0 || t > 120 || w.night < 0.3) this.end(w)
    } else if (kind === 'footprints') {
      const pr = this.prints!
      // Laid all at once, out of sight; it is the morning that shows them.
      while (pr.i < pr.n) {
        const s = pr.i * 38
        const side = pr.i % 2 ? 1 : -1
        this.hooks.footprint(pr.x + pr.hx * s - pr.hz * side * 22, pr.z + pr.hz * s + pr.hx * side * 22, pr.hx, pr.hz)
        pr.i++
      }
      if (t > 1) {
        this.hooks.footprintsEnd(pr.x + pr.hx * (pr.n + 1) * 38, pr.z + pr.hz * (pr.n + 1) * 38)
        this.hooks.say('There are footprints in the grass that were not there last night.')
        this.hooks.witness('footprints')
        this.prints = null
        this.end(w)
      }
    } else if (kind === 'deep') {
      if (t < 7) this.hooks.shake(0.04 * (1 - t / 7))
      if (t > 9) {
        this.hooks.witness('deep')
        this.end(w)
      }
    }
  }

  private leaving = 0
  private readonly discardEvents: GaitEvent[] = []
}

/** A pale eye: a soft oval glow, a darker centre. */
function eyeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 40
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 20, 2, 32, 20, 26)
  grad.addColorStop(0, 'rgba(255,255,240,1)')
  grad.addColorStop(0.35, 'rgba(230,240,220,0.7)')
  grad.addColorStop(1, 'rgba(230,240,220,0)')
  g.fillStyle = grad
  g.beginPath()
  g.ellipse(32, 20, 30, 14, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = 'rgba(20,24,20,0.8)'
  g.beginPath()
  g.ellipse(32, 20, 3, 8, 0, 0, Math.PI * 2)
  g.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
