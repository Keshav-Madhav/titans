// The camp: someone stopped here on the Green, a short walk ahead of where you
// wake, and did not come back for their things. A ring of cold stones, a burnt
// log, a bedroll gone to moss, a pole with a strip of red cloth snapping in
// the wind (so you see it from where you start) — and the bag.

import * as THREE from 'three'
import { mulberry32, type Terrain } from '@titans/shared'
import { carvedStone } from './spots'

/**
 * Where it is: at the top of the Undercroft's stair, a few steps out on the
 * grass — the first close thing you see when you climb out into the light.
 */
export const CAMP = { x: -232, z: 1518 }

const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _m = new THREE.Matrix4()

export class Camp {
  readonly group = new THREE.Group()
  private readonly bag: THREE.Group
  private readonly cloth: THREE.Mesh
  /** The fire ring's middle, and the smoke over it (later camps only). */
  readonly fire: THREE.Vector3
  /** The smoke: one camera-facing quad per puff, drawn at once (40 sprites were 40 draws). */
  private smoke: THREE.InstancedMesh | null = null
  private smokeAlpha: THREE.InstancedBufferAttribute | null = null
  private readonly rest: Float32Array
  readonly bagAt = new THREE.Vector3()
  private time = 0

  /** At `where` (the first, with the bag, by default); `withBag` false for the traveller's later camps. */
  constructor(terrain: Terrain, where: { x: number; z: number } = CAMP, withBag = true) {
    const CAMP = where
    const rand = mulberry32(4711)
    const at = (dx: number, dz: number, lift = 0) => new THREE.Vector3(CAMP.x + dx, terrain.heightAt(CAMP.x + dx, CAMP.z + dz) + lift, CAMP.z + dz)
    const stone = carvedStone()
    const char = new THREE.MeshStandardMaterial({ color: 0x1e1a17, roughness: 1 })
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a4430, roughness: 0.95 })
    const roll = new THREE.MeshStandardMaterial({ color: 0x5e4a3a, roughness: 1 })
    const leather = new THREE.MeshStandardMaterial({ color: 0x7a4f33, roughness: 0.8 })
    this.fire = at(0, 0, 0)
    // At the traveller's later camps the fire is not quite out: a thin column of smoke
    // still rises from it — seen from far off, from anywhere high (nobody is there).
    if (!withBag) {
      const PUFFS = 40
      const mat = new THREE.MeshBasicMaterial({ map: smokeTexture(), color: 0x6c665e, transparent: true, depthWrite: false, fog: false })
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;')
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAlpha;').replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vAlpha;')
      }
      const geo = new THREE.PlaneGeometry(1, 1)
      this.smokeAlpha = new THREE.InstancedBufferAttribute(new Float32Array(PUFFS), 1)
      geo.setAttribute('aAlpha', this.smokeAlpha)
      this.smoke = new THREE.InstancedMesh(geo, mat, PUFFS)
      this.smoke.renderOrder = 3
      // (The column moves every frame; its bounds are set round all of it, below.)
      this.smoke.frustumCulled = false
      this.group.add(this.smoke)
    }
    // The fire ring, cold.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rand() * 0.2
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 + rand() * 0.1, 0), stone)
      s.position.copy(at(Math.cos(a) * 0.75, Math.sin(a) * 0.75, 0.08))
      s.rotation.set(rand() * 3, rand() * 3, rand() * 3)
      this.group.add(s)
    }
    const ash = new THREE.Mesh(new THREE.CircleGeometry(0.62, 16).rotateX(-Math.PI / 2), char)
    ash.position.copy(at(0, 0, 0.03))
    this.group.add(ash)
    for (const r of [0.5, -0.7]) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 6).rotateZ(Math.PI / 2).rotateY(r), char)
      log.position.copy(at(0, 0, 0.12))
      this.group.add(log)
    }
    // The bedroll, half unrolled.
    const bed = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.9, 10).rotateZ(Math.PI / 2).scale(1, 0.45, 1).rotateY(0.4), roll)
    bed.position.copy(at(-1.8, 0.9, 0.14))
    this.group.add(bed)
    // A tall pole driven into the ground, leaning, a long strip of red cloth at its top
    // (user: "the flags are too less in height… hard to spot": it was 3.6 m, lost in the
    // grass from a hundred metres; now it stands well over a shrub and streams).
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, POLE, 7).translate(0, POLE / 2, 0), wood)
    pole.position.copy(at(1.9, -1.4))
    pole.rotation.set(0.07, 0, -0.06)
    this.group.add(pole)
    // A crosspiece lashed near the top, for the cloth to hang from.
    const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.2, 5).rotateZ(Math.PI / 2).translate(0.45, POLE - 0.4, 0), wood)
    pole.add(cross)
    const geo = new THREE.PlaneGeometry(CLOTH, 0.9, 20, 3).translate(CLOTH / 2, -0.25, 0)
    this.rest = (geo.getAttribute('position').array as Float32Array).slice()
    this.cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xb8281b, roughness: 0.85, side: THREE.DoubleSide, emissive: new THREE.Color(0.09, 0.012, 0.006) }))
    this.cloth.position.set(0, POLE - 0.4, 0)
    pole.add(this.cloth)
    // A tripod over the fire, a pot hanging from it: a shape no field grows.
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.4
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 2.3, 5).translate(0, 1.15, 0), wood)
      leg.position.copy(at(Math.cos(a) * 0.85, Math.sin(a) * 0.85))
      leg.lookAt(this.fire.x, this.fire.y + 2.05, this.fire.z)
      leg.rotateX(Math.PI / 2)
      this.group.add(leg)
    }
    const pot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.7), char)
    pot.position.copy(at(0, 0, 0.75))
    this.group.add(pot)
    // Hung from where the legs meet, on a cord.
    const top = this.fire.y + 2.05
    const cordLen = top - (pot.position.y + 0.12)
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, cordLen, 4), wood)
    cord.position.set(this.fire.x, pot.position.y + 0.12 + cordLen / 2, this.fire.z)
    this.group.add(cord)
    // The ground worn bare round the fire: trampled earth, the grass kept off it (see
    // CAMP_BARE), so a camp reads as a place people stayed, not more meadow.
    const bare = bareGround(at, terrain, CAMP.x, CAMP.z)
    this.group.add(bare)
    // The bag, by the bedroll.
    this.bag = new THREE.Group()
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8).scale(1, 0.85, 0.8), leather)
    const flap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.15, 0.5, 0.95), leather)
    flap.position.y = 0.14
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.02, 4, 16, Math.PI), wood)
    strap.position.y = 0.16
    this.bag.add(body, flap, strap)
    this.bagAt.copy(at(-0.9, 1.6, 0.2))
    this.bag.position.copy(this.bagAt)
    this.bag.rotation.y = 0.7
    this.group.add(this.bag)
    this.bag.visible = withBag
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true
    })
    bare.castShadow = false
  }

  /** Close enough to take the bag (and it is still there). */
  near(p: THREE.Vector3): boolean {
    return this.bag.visible && p.distanceTo(this.bagAt) < 2.6
  }

  /** It is in your hands now. */
  take(): void {
    this.bag.visible = false
  }

  /** The cloth snaps in the wind. */
  update(dt: number, wind: number, camera?: THREE.Camera): void {
    this.time += dt
    // The smoke: puffs rising and spreading, leaning with the wind, thinning as they go.
    if (this.smoke && this.smokeAlpha && camera) {
      const n = this.smoke.count
      // From far off (the tip sends you after it from 4 km) a column a few
      // metres wide is a hair: it widens with distance, up to 2.2×, and thickens
      // a little, so it reads as the landmark it is. Up close, unchanged.
      const far = THREE.MathUtils.clamp(camera.position.distanceTo(this.fire) / 1600, 1, 2.2)
      const thick = Math.min(0.9, 0.6 * (1 + 0.45 * (far - 1)))
      for (let i = 0; i < n; i++) {
        const t = (this.time * 0.03 + i / n) % 1
        // (Tall, and full where it clears the hills: seen from the first camp 3 km off, only its
        // top hundred metres show over the land between — it must hold together up there.)
        _p.set(this.fire.x + t * t * 90 * (0.4 + wind), this.fire.y + 1 + t * 460, this.fire.z + Math.sin(t * 5 + i) * 4)
        _s.setScalar((4 + t * 62) * far)
        // (Each puff faces you, as a sprite would.)
        _m.compose(_p, camera.quaternion, _s)
        this.smoke.setMatrixAt(i, _m)
        this.smokeAlpha.setX(i, thick * Math.sin(Math.min(1, t * 5) * Math.PI * 0.5) * (1 - t * t * t))
      }
      this.smoke.instanceMatrix.needsUpdate = true
      this.smokeAlpha.needsUpdate = true
      // (One colour throughout: the order the puffs blend in hardly shows. Past 9 km, not at all.)
      this.smoke.visible = camera.position.distanceTo(this.fire) < 9000
    }
    const pos = this.cloth.geometry.getAttribute('position') as THREE.BufferAttribute
    const a = pos.array as Float32Array
    for (let i = 0; i < pos.count; i++) {
      const x = this.rest[i * 3]
      const k = x / CLOTH
      a[i * 3 + 2] = Math.sin(this.time * (3.2 + wind * 4) - x * 3.2) * 0.4 * k * (0.5 + wind)
      a[i * 3 + 1] = this.rest[i * 3 + 1] - k * k * 0.45 * (1 - wind * 0.6)
    }
    pos.needsUpdate = true
    this.cloth.geometry.computeVertexNormals()
  }
}

const POLE = 7.5
const CLOTH = 4
/** How far round a camp's fire the ground is worn bare (m): grass keeps off it. */
export const CAMP_BARE = 5.5

/** A disc of trampled earth draped on the ground, soft at its edge. */
function bareGround(at: (dx: number, dz: number, lift?: number) => THREE.Vector3, _t: Terrain, cx: number, cz: number): THREE.Mesh {
  const R = CAMP_BARE + 0.8
  const geo = new THREE.CircleGeometry(R, 28, 0, Math.PI * 2).rotateX(-Math.PI / 2)
  // (Rings of vertices, so it lies on the ground's swell rather than cutting through it.)
  const ring = new THREE.RingGeometry(0.01, R, 28, 6).rotateX(-Math.PI / 2)
  geo.dispose()
  const p = ring.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const v = at(p.getX(i), p.getZ(i), 0.05)
    p.setXYZ(i, v.x - cx, v.y, v.z - cz)
  }
  ring.computeVertexNormals()
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const rand = mulberry32(911)
  const grad = g.createRadialGradient(64, 64, 10, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,0.95)')
  grad.addColorStop(0.62, 'rgba(255,255,255,0.8)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  // Scuffs and darker patches.
  g.globalCompositeOperation = 'source-atop'
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '40,30,20' : '150,130,100'},${0.12 + rand() * 0.2})`
    g.beginPath()
    g.ellipse(rand() * 128, rand() * 128, 2 + rand() * 9, 1 + rand() * 4, rand() * 3, 0, Math.PI * 2)
    g.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  // (Ring UVs run round it; the texture wants a plain top-down mapping.)
  const uv = ring.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2 * R), 0.5 - p.getZ(i) / (2 * R))
  const mat = new THREE.MeshStandardMaterial({ color: 0x6b5340, map: tex, roughness: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  const m = new THREE.Mesh(ring, mat)
  m.position.set(cx, 0, cz)
  m.receiveShadow = true
  m.renderOrder = 1
  return m
}

/** A soft, ragged puff (for the smoke). */
function smokeTexture(): THREE.CanvasTexture {
  const S = 64
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  for (let i = 0; i < 7; i++) {
    const x = S / 2 + Math.cos(i * 2.4) * 8
    const y = S / 2 + Math.sin(i * 1.7) * 8
    const grad = g.createRadialGradient(x, y, 0, x, y, 20)
    grad.addColorStop(0, 'rgba(255,255,255,0.35)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, S, S)
  }
  return new THREE.CanvasTexture(c)
}
