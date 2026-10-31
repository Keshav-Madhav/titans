// Spots: the things in the land you walk up to and press E at — the stones
// with words on them, and the trinkets left on high places. Stones are always
// there to read again; a trinket, once taken, is gone from the world (it is
// in the bag). Trinkets glint now and then, small and steady on the screen,
// so you can see one from a long way off and wonder how to get up there.

import * as THREE from 'three'

export interface Spot {
  /** The catalogue id this gives (discovery.ts). */
  id: string
  kind: 'stone' | 'trinket'
  at: THREE.Vector3
}

const REACH = 2.8

export class Spots {
  readonly group = new THREE.Group()
  private readonly marks = new Map<string, THREE.Object3D>()
  private readonly glints: Array<{ id: string; sprite: THREE.Sprite; phase: number }> = []
  private time = 0

  constructor(readonly spots: Spot[]) {
    const slab = new THREE.MeshStandardMaterial({ color: 0x7d786c, roughness: 0.95 })
    const rune = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.95, 0.85, 0.6), transparent: true, opacity: 0.55 })
    const thing = new THREE.MeshStandardMaterial({ color: 0xc9b07a, roughness: 0.4, metalness: 0.6, emissive: new THREE.Color(0.25, 0.2, 0.1) })
    const glint = glintTexture()
    for (const s of this.spots) {
      if (s.kind === 'stone') {
        // A standing slab, leaning a little, a carved line catching the light,
        // and a few pebbles stacked at its foot.
        const g = new THREE.Group()
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.8, 0.3, 1, 3, 1), slab)
        const p = body.geometry.getAttribute('position') as THREE.BufferAttribute
        for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.5) p.setX(i, p.getX(i) * 0.82)
        body.geometry.computeVertexNormals()
        body.position.y = 0.85
        const line = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 1.1), rune)
        line.position.set(0, 0.95, 0.152)
        const line2 = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.06), rune)
        line2.position.set(0, 1.25, 0.152)
        g.add(body, line, line2)
        for (let k = 0; k < 4; k++) {
          const pb = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 + k * 0.02, 0), slab)
          pb.position.set(0.55 - k * 0.04, 0.08 + (3 - k) * 0.12, 0.25)
          g.add(pb)
        }
        g.position.copy(s.at)
        g.rotation.set(0.05, Math.atan2(-s.at.x, -s.at.z), 0.04)
        g.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true
        })
        this.group.add(g)
        this.marks.set(s.id, g)
      } else {
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), thing)
        m.position.copy(s.at).add(new THREE.Vector3(0, 0.25, 0))
        this.group.add(m)
        this.marks.set(s.id, m)
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glint, color: new THREE.Color(7, 6, 4.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false, fog: false }))
        sprite.position.copy(m.position)
        sprite.renderOrder = 3
        this.group.add(sprite)
        this.glints.push({ id: s.id, sprite, phase: Math.random() * 10 })
      }
    }
  }

  /** The spot within reach of `p` (nearest), if any; `taken` filters out trinkets already in the bag. */
  near(p: THREE.Vector3, taken: (id: string) => boolean): Spot | null {
    let best: Spot | null = null
    let bd = REACH
    for (const s of this.spots) {
      if (s.kind === 'trinket' && taken(s.id)) continue
      const d = s.at.distanceTo(p)
      if (d < bd) {
        bd = d
        best = s
      }
    }
    return best
  }

  /** A trinket has gone into the bag: it leaves the world. */
  take(id: string): void {
    const m = this.marks.get(id)
    if (m) m.visible = false
    const gl = this.glints.find((g) => g.id === id)
    if (gl) gl.sprite.visible = false
  }

  /** The glints: a slow twinkle, a few hundred metres to a couple of kilometres off. */
  update(dt: number, camera: THREE.Camera): void {
    this.time += dt
    for (const g of this.glints) {
      if (!g.sprite.visible) continue
      const d = g.sprite.position.distanceTo(camera.position)
      // Near, the thing itself is enough; very far, nothing would show.
      const far = THREE.MathUtils.smoothstep(d, 12, 40) * (1 - THREE.MathUtils.smoothstep(d, 1800, 2600))
      const tw = Math.pow(0.5 + 0.5 * Math.sin(this.time * 1.7 + g.phase), 6)
      // (Bright enough for the bloom to catch: against a pale sky a dim glint is invisible.)
      g.sprite.material.opacity = far * (0.4 + 0.6 * tw)
      const s = 0.022 + 0.034 * tw
      g.sprite.scale.set(s, s, 1)
    }
    for (const [id, m] of this.marks) {
      if (this.spots.find((s) => s.id === id)?.kind === 'trinket') m.rotation.y += dt * 0.8
    }
  }
}

/** A four-pointed star of light. */
function glintTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.15, 'rgba(255,240,210,0.6)')
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
