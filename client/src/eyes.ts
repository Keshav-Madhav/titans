// Stone eyes: what the bow is for. Sets of three, set high in stone — on the
// Undercroft's pillars, on the Sentinel, in a mesa's cliff — each a disc of
// carved stone with an amber iris that glows. An arrow closes one. Close all
// three of a set and what they were watching over is let go (a trinket:
// spots.ts reveals it).

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { carvedStone } from './spots'

export interface EyeSet {
  /** The trinket they watch over (discovery.ts id). */
  id: string
  eyes: Array<{ at: THREE.Vector3; normal: THREE.Vector3 }>
  /** Where it is let go. */
  reward: THREE.Vector3
}

const RADIUS = 2.6

export class Eyes {
  readonly group = new THREE.Group()
  private readonly irises: Array<{ set: EyeSet; k: number; at: THREE.Vector3; normal: THREE.Vector3; mat: THREE.MeshBasicMaterial; halo: THREE.Sprite; shut: boolean }> = []
  /** An eye closed; all of a set closed (`done`). */
  onShut: (set: EyeSet, done: boolean) => void = () => {}

  constructor(readonly sets: EyeSet[]) {
    // (Big enough to find on a 400 m statue from the grass below.)
    const disc = new THREE.CylinderGeometry(2.6, 2.9, 0.9, 24).rotateX(Math.PI / 2)
    // An eye, not a lamp: a round amber disc in a ring on a pillar read as a porthole light (screenshot
    // review, 2026-11-06). The iris an almond between carved lids, a dark slit of pupil down it.
    const almond = (w: number, h: number) => {
      const sh = new THREE.Shape()
      sh.moveTo(-w, 0)
      sh.quadraticCurveTo(0, h * 2, w, 0)
      sh.quadraticCurveTo(0, -h * 2, -w, 0)
      return new THREE.ShapeGeometry(sh, 16)
    }
    const iris = almond(1.55, 0.62)
    const pupil = almond(0.5, 0.13).rotateZ(Math.PI / 2)
    // The lids: a heavy carved ridge over the eye and a lighter one under it.
    const lid = (up: number) => {
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-1.9, 0, 0), new THREE.Vector3(0, up * 1.75, 0), new THREE.Vector3(1.9, 0, 0))
      return new THREE.TubeGeometry(curve, 16, up > 0 ? 0.26 : 0.17, 6)
    }
    // (The stone and its two lids one mesh — they never move apart: six draws an eye were three of
    // stone, and three more into the shadow map.)
    const stone = mergeGeometries([disc, lid(1).translate(0, 0, 0.5), lid(-0.8).translate(0, 0, 0.5)])!
    for (const set of sets) {
      set.eyes.forEach((e, k) => {
        const g = new THREE.Group()
        const body = new THREE.Mesh(stone, carvedStone())
        body.castShadow = body.receiveShadow = true
        // (Amber, not so far over 1 that the bloom took it to white.)
        const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 0.95, 0.22) })
        const i = new THREE.Mesh(iris, mat)
        i.position.z = 0.46
        const r = new THREE.Mesh(pupil, new THREE.MeshBasicMaterial({ color: 0x140f0a }))
        r.position.z = 0.47
        // A soft amber glow over the open iris, so an eye reads from far off.
        // (fog: false — a sprite's shader has no 'transformed' for the patched fog to read: it would not compile.)
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: new THREE.Color(1.6, 0.9, 0.3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))
        halo.scale.setScalar(5.5)
        halo.position.z = 0.6
        g.add(body, i, r, halo)
        g.position.copy(e.at)
        g.lookAt(e.at.clone().add(e.normal))
        this.group.add(g)
        this.irises.push({ set, k, at: e.at.clone().addScaledVector(e.normal, 0.45), normal: e.normal.clone().normalize(), mat, halo, shut: false })
      })
    }
  }

  /**
   * The glow only from in front (user: "the targets look weird when looking from behind"):
   * a sprite always faces you, so from behind or beside an eye its 6.5 m glow hung in the
   * air next to the stone. It fades as you come round to the eye's side.
   */
  update(camera: THREE.Camera): void {
    for (const e of this.irises) {
      if (e.shut) continue
      this._to.copy(camera.position).sub(e.at).normalize()
      const front = THREE.MathUtils.smoothstep(this._to.dot(e.normal), 0.05, 0.45)
      e.halo.material.opacity = front
      e.halo.visible = front > 0.01
    }
  }

  private readonly _to = new THREE.Vector3()

  /** Does the segment from→to pass through an open eye (no side effects)? */
  test(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const seg = to.clone().sub(from)
    const len = seg.length()
    if (len < 1e-6) return false
    seg.divideScalar(len)
    return this.irises.some((e) => !e.shut && from.clone().addScaledVector(seg, THREE.MathUtils.clamp(e.at.clone().sub(from).dot(seg), 0, len)).distanceTo(e.at) < RADIUS)
  }

  /** Did the segment from→to pass through an open eye? Closes it; returns where. */
  hit(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 | null {
    const seg = to.clone().sub(from)
    const len = seg.length()
    if (len < 1e-6) return null
    seg.divideScalar(len)
    for (const e of this.irises) {
      if (e.shut) continue
      const t = THREE.MathUtils.clamp(e.at.clone().sub(from).dot(seg), 0, len)
      const p = from.clone().addScaledVector(seg, t)
      if (p.distanceTo(e.at) < RADIUS) {
        this.shut(e)
        const done = this.irises.filter((o) => o.set === e.set).every((o) => o.shut)
        this.onShut(e.set, done)
        return p
      }
    }
    return null
  }

  private shut(e: (typeof this.irises)[number]): void {
    e.shut = true
    e.mat.color.set(0x15130f)
    e.halo.visible = false
  }

  /** Closed before (a loaded game). */
  close(id: string): void {
    for (const e of this.irises) if (e.set.id === id) this.shut(e)
  }

  /** Open eyes in a set (for tools). */
  open(id: string): number {
    return this.irises.filter((e) => e.set.id === id && !e.shut).length
  }

  /** The open eyes' positions (for tools). */
  targets(): THREE.Vector3[] {
    return this.irises.filter((e) => !e.shut).map((e) => e.at)
  }
}

let halo: THREE.CanvasTexture | null = null
/** A soft round glow. */
function haloTexture(): THREE.CanvasTexture {
  if (halo) return halo
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  // (Falling off like light, not a cone: from 0.35 at a third out to nothing at the rim, it read close
  // up as a flat disc of orange painted on the wall round the eye — screenshot review, 2026-11-06.)
  for (let i = 0; i <= 12; i++) {
    const t = i / 12
    grad.addColorStop(t, `rgba(255,${Math.round(200 - 30 * t)},${Math.round(130 - 40 * t)},${(0.85 * Math.exp(-t * t * 9) * (1 - t)).toFixed(3)})`)
  }
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  halo = new THREE.CanvasTexture(c)
  halo.colorSpace = THREE.SRGBColorSpace
  return halo
}
