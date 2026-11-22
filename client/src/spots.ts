// Spots: the things in the land you walk up to and press E at — the stones
// with words on them, and the trinkets left on high places. Stones are always
// there to read again; a trinket, once taken, is gone from the world (it is
// in the bag). Trinkets glint now and then, small and steady on the screen,
// so you can see one from a long way off and wonder how to get up there.

import * as THREE from 'three'
import { mulberry32 } from '@titans/shared'
import { weatheredStone } from './weathered-stone'

/**
 * Dressed, carved stone for the small made things (the stones with words,
 * the ringing stones, the camp's fire ring): the colossi's generated
 * texture, so they read as the same people's work (plain grey boxes read as
 * placeholders). Loaded once, shared.
 */
let carved: THREE.MeshStandardMaterial | null = null
export function carvedStone(): THREE.MeshStandardMaterial {
  if (carved) return carved
  const load = new THREE.TextureLoader()
  const map = load.load(`${import.meta.env.BASE_URL}tex/carved_c.jpg`)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.repeat.set(0.6, 0.6)
  map.anisotropy = 4
  carved = new THREE.MeshStandardMaterial({ map, color: new THREE.Color(0.92, 0.9, 0.84), roughness: 0.95 })
  return carved
}

export interface Spot {
  /** The catalogue id this gives (discovery.ts). */
  id: string
  /** A stone with words; a page (words too, held down under a pebble at a camp); a trinket. */
  kind: 'stone' | 'page' | 'trinket'
  at: THREE.Vector3
  /** Not there until something reveals it (a wisp settling: wisps.ts). */
  hidden?: boolean
  /** Shown instead of the small glinting token (the bow on its altar). */
  model?: THREE.Object3D
}

const REACH = 2.8

export class Spots {
  readonly group = new THREE.Group()
  private readonly marks = new Map<string, THREE.Object3D>()
  private readonly glints: Array<{ id: string; sprite: THREE.Sprite; phase: number }> = []
  private time = 0
  /**
   * Distance culling: each mark sits in a wrapper drawn only within `r` of you
   * (a 7 cm pebble or a carved line is nothing past a few hundred metres; the
   * glints show where things are from afar). The wrapper's visibility is ours
   * alone; what is found or revealed still shows and hides the mark itself.
   */
  private readonly culled: Array<{ wrap: THREE.Group; at: THREE.Object3D; r: number }> = []
  /** `at`: whose position is the distance's (the mark itself, placed in world coordinates). */
  private wrap(o: THREE.Object3D, r: number, parent: THREE.Object3D = this.group, at: THREE.Object3D = o): void {
    const w = new THREE.Group()
    parent.add(w)
    w.add(o)
    this.culled.push({ wrap: w, at, r })
  }

  constructor(readonly spots: Spot[]) {
    const slab = carvedStone()
    const rune = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.95, 0.85, 0.6), transparent: true, opacity: 0.55 })
    const thing = new THREE.MeshStandardMaterial({ color: 0xc9b07a, roughness: 0.4, metalness: 0.6, emissive: new THREE.Color(0.25, 0.2, 0.1) })
    const glint = glintTexture()
    for (const s of this.spots) {
      if (s.kind === 'page') {
        // A page weighted down with a pebble, curling at the corners.
        const g = new THREE.Group()
        const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.56, 3, 3).rotateX(-Math.PI / 2), paperMaterial())
        const pa = sheet.geometry.getAttribute('position') as THREE.BufferAttribute
        for (let i = 0; i < pa.count; i++) pa.setY(i, 0.02 + 0.03 * Math.abs(pa.getX(i) * pa.getZ(i)) * 10)
        sheet.geometry.computeVertexNormals()
        const pebble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.07, 0), slab)
        pebble.position.set(0.05, 0.06, -0.08)
        g.add(sheet, pebble)
        g.position.copy(s.at)
        g.rotation.y = Math.random() * 6.28
        this.wrap(g, 250)
        this.marks.set(s.id, g)
      } else if (s.kind === 'stone') {
        // A standing slab, leaning a little, a carved line catching the light,
        // and a few pebbles stacked at its foot.
        const g = new THREE.Group()
        // (Weathered: worn round, a corner of its top gone — QA cycle 7; untapered so the carving
        // stays on its face.)
        const body = new THREE.Mesh(weatheredStone(0.95, 1.8, 0.3, mulberry32(Math.round(s.at.x * 13 + s.at.z * 7)), true, 0), slab)
        body.position.y = 0.85
        const line = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 1.1), rune)
        line.position.set(0, 0.95, 0.158)
        const line2 = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.06), rune)
        line2.position.set(0, 1.25, 0.158)
        g.add(body)
        // (The carving and the pebbles: only close by.)
        const detail = new THREE.Group()
        detail.add(line, line2)
        for (let k = 0; k < 4; k++) {
          const pb = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 + k * 0.02, 0), slab)
          pb.position.set(0.55 - k * 0.04, 0.08 + (3 - k) * 0.12, 0.25)
          detail.add(pb)
        }
        g.position.copy(s.at)
        g.rotation.set(0.05, Math.atan2(-s.at.x, -s.at.z), 0.04)
        g.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true
        })
        detail.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true
        })
        this.wrap(g, 900)
        this.wrap(detail, 160, g, g)
        this.marks.set(s.id, g)
      } else {
        const m = s.model ?? new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), thing)
        if (s.model) m.position.copy(s.at)
        else m.position.copy(s.at).add(new THREE.Vector3(0, 0.25, 0))
        this.wrap(m, s.model ? 600 : 250)
        this.marks.set(s.id, m)
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glint, color: new THREE.Color(5.5, 4.8, 3.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false, fog: false }))
        sprite.position.copy(m.position)
        // (Standing on the thing, not centred on it: a glint's lower half in the ground, seen far off over a
        // dune, read as a glowing half-disc on the horizon — a second sun at dawn; golden tour 1122g.)
        sprite.center.set(0.5, 0.25)
        sprite.renderOrder = 3
        this.group.add(sprite)
        this.glints.push({ id: s.id, sprite, phase: Math.random() * 10 })
        m.visible = sprite.visible = !s.hidden
      }
    }
  }

  /** Move a spot (and what shows it) to `at` (where something is left only when it happens). */
  place(id: string, at: THREE.Vector3): void {
    const s = this.spots.find((s) => s.id === id)
    if (!s) return
    s.at.copy(at)
    const m = this.marks.get(id)
    if (m) m.position.copy(at).add(new THREE.Vector3(0, s.model ? 0 : 0.25, 0))
    const gl = this.glints.find((g) => g.id === id)
    if (gl) gl.sprite.position.copy(at).add(new THREE.Vector3(0, 0.25, 0))
  }

  /** It is there now (and can be taken). */
  reveal(id: string): void {
    const s = this.spots.find((s) => s.id === id)
    if (!s) return
    s.hidden = false
    const m = this.marks.get(id)
    if (m) m.visible = true
    const gl = this.glints.find((g) => g.id === id)
    if (gl) gl.sprite.visible = true
  }

  /** The spot within reach of `p` (nearest), if any; `taken` filters out trinkets already in the bag. */
  near(p: THREE.Vector3, taken: (id: string) => boolean): Spot | null {
    let best: Spot | null = null
    let bd = REACH
    for (const s of this.spots) {
      if (s.hidden || (s.kind === 'trinket' && taken(s.id))) continue
      const d = s.at.distanceTo(p)
      if (d < bd) {
        bd = d
        best = s
      }
    }
    return best
  }

  /** A trinket has gone into the bag: it leaves the world. */
  /**
   * Taken: gone (on load), or — `hand` given — a flash where it lay, and it rises into
   * your hand as you reach for it (user: "picking up stuff… too subtle": it just vanished).
   */
  take(id: string, hand?: () => THREE.Vector3): void {
    const m = this.marks.get(id)
    const gl = this.glints.find((g) => g.id === id)
    if (!hand || !m) {
      if (m) m.visible = false
      if (gl) gl.sprite.visible = false
      return
    }
    m.getWorldPosition(this.tmp)
    this.taking.push({ m, from: this.tmp.clone(), scale: m.scale.x, hand, t: 0, flash: gl?.sprite ?? null })
  }

  private readonly tmp = new THREE.Vector3()
  private readonly taking: Array<{ m: THREE.Object3D; from: THREE.Vector3; scale: number; hand: () => THREE.Vector3; t: number; flash: THREE.Sprite | null }> = []

  private stepTaking(dt: number): void {
    for (let i = this.taking.length - 1; i >= 0; i--) {
      const k = this.taking[i]
      k.t += dt
      // Held a moment while the hand comes down; then up into it, shrinking away.
      const u = THREE.MathUtils.smoothstep(k.t, 0.42, 1.05)
      const to = k.hand()
      const parentInv = k.m.parent ? k.m.parent.matrixWorld.clone().invert() : null
      this.tmp.lerpVectors(k.from, to, u)
      this.tmp.y += Math.sin(u * Math.PI) * 0.18
      if (parentInv) this.tmp.applyMatrix4(parentInv)
      k.m.position.copy(this.tmp)
      k.m.scale.setScalar(k.scale * (1 - 0.75 * u))
      if (k.flash) {
        // The glint, right there: a bright star as you touch it, fading.
        const f = Math.max(0, 1 - Math.abs(k.t - 0.45) / 0.45)
        k.flash.visible = f > 0
        k.flash.position.copy(k.m.getWorldPosition(this.tmp))
        k.flash.material.opacity = f
        k.flash.scale.set(0.02 + 0.045 * f, 0.02 + 0.045 * f, 1)
      }
      if (k.t >= 1.1) {
        k.m.visible = false
        if (k.flash) k.flash.visible = false
        this.taking.splice(i, 1)
      }
    }
  }

  /** The glints: a slow twinkle, a few hundred metres to a couple of kilometres off. */
  update(dt: number, camera: THREE.Camera): void {
    this.time += dt
    this.stepTaking(dt)
    for (const n of this.culled) n.wrap.visible = n.at.position.distanceToSquared(camera.position) < n.r * n.r
    for (const g of this.glints) {
      if (!g.sprite.visible || this.taking.some((k) => k.flash === g.sprite)) continue
      const d = g.sprite.position.distanceTo(camera.position)
      // Near, the thing itself is enough; very far, nothing would show.
      // (And a little up close too: a small thing lying in the grass — the Burning-glass by the first
      // camp — was found in the playtest only by its prompt, the glint gone and the thing hidden.)
      const far = Math.max(0.3 * (1 - THREE.MathUtils.smoothstep(d, 10, 16)), THREE.MathUtils.smoothstep(d, 12, 40)) * (1 - THREE.MathUtils.smoothstep(d, 1800, 2600))
      const tw = Math.pow(0.5 + 0.5 * Math.sin(this.time * 1.7 + g.phase), 6)
      // (Bright enough for the bloom to catch: against a pale sky a dim glint is invisible.)
      g.sprite.material.opacity = far * (0.4 + 0.6 * tw)
      // (Not drawn at all where it has faded out — past 2.6 km, and where the thing itself shows —
      // rather than drawn clear. By the material: the sprite's own `visible` says taken or hidden.)
      g.sprite.material.visible = far > 0.003
      const s = 0.02 + 0.028 * tw
      g.sprite.scale.set(s, s, 1)
    }
    for (const [id, m] of this.marks) {
      const s = this.spots.find((s) => s.id === id)
      if (s?.kind === 'trinket' && !s.model) m.rotation.y += dt * 0.8
    }
  }
}

/** A four-pointed star of light. */
function glintTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  // (A small core and a thin halo, the rays doing the glinting: the old wide halo, through the bloom,
  // was a glowing disc as big as the sun on the horizon at dawn — golden tour 1122g.)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.1, 'rgba(255,240,210,0.55)')
  grad.addColorStop(0.35, 'rgba(255,240,210,0.08)')
  grad.addColorStop(1, 'rgba(255,240,210,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  g.fillStyle = 'rgba(255,250,235,0.9)'
  g.beginPath()
  g.moveTo(32, 0)
  g.lineTo(34, 30)
  g.lineTo(64, 32)
  g.lineTo(34, 34)
  g.lineTo(32, 64)
  g.lineTo(30, 34)
  g.lineTo(0, 32)
  g.lineTo(30, 30)
  g.closePath()
  g.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

let paper: THREE.MeshStandardMaterial | null = null
/** Old paper: pale, warm, a few lines of faded writing. */
function paperMaterial(): THREE.MeshStandardMaterial {
  if (paper) return paper
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 84
  const g = c.getContext('2d')!
  g.fillStyle = '#ddd2b8'
  g.fillRect(0, 0, 64, 84)
  g.strokeStyle = 'rgba(70, 55, 40, 0.55)'
  for (let y = 12; y < 76; y += 7) {
    g.beginPath()
    g.moveTo(8, y)
    g.lineTo(20 + Math.random() * 36, y)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  paper = new THREE.MeshStandardMaterial({ map: t, roughness: 1, side: THREE.DoubleSide })
  return paper
}
