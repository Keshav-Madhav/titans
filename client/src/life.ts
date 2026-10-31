// Small life that makes the land feel lived in. Traditional game AI, all
// instanced (a few draw calls whatever the numbers):
//
//   Birds  — flocks wheeling over lakes and towns near you, wings beating
//   Smoke  — chimney smoke rising from houses near you, drifting downwind
//   Sheep  — flocks grazing by the fields of each town; they scatter from giants
//   Boats  — fishers rowing about the lakes beside the towns

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { inBasin, mulberry32, type Lake, type Terrain } from '@titans/shared'
import type { Threat } from './wildlife'

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _e = new THREE.Euler()
const _up = new THREE.Vector3(0, 1, 0)
const _leg = new THREE.Matrix4()

// --- birds ---------------------------------------------------------------------

const FLOCKS = 6
const PER_FLOCK = 16

interface Bird {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
}

interface Flock {
  birds: Bird[]
  /** What it circles: a lake or a town. */
  cx: number
  cz: number
  cy: number
  radius: number
  spin: number
  retarget: number
}

export class Birds {
  readonly mesh: THREE.InstancedMesh
  private readonly flocks: Flock[] = []
  private readonly time = { value: 0 }
  private readonly rand = mulberry32(808)

  constructor(private readonly terrain: Terrain) {
    // A bird: two wing triangles meeting at the body; the tips (marked) beat.
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.35, -1, 0, -0.1, 0, 0, -0.35, 0, 0, 0.35, 0, 0, -0.35, 1, 0, -0.1], 3))
    g.setAttribute('aTip', new THREE.Float32BufferAttribute([0, 1, 0, 0, 0, 1], 1))
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3))
    const phase = new Float32Array(FLOCKS * PER_FLOCK)
    for (let i = 0; i < phase.length; i++) phase[i] = this.rand() * 6.28
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1))
    const mat = new THREE.MeshBasicMaterial({ color: 0x2f2b28, side: THREE.DoubleSide })
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.time
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aTip;\nattribute float aPhase;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += aTip * sin(uTime * 9.0 + aPhase) * 0.7;')
    }
    this.mesh = new THREE.InstancedMesh(g, mat, FLOCKS * PER_FLOCK)
    this.mesh.frustumCulled = false
    for (let f = 0; f < FLOCKS; f++) {
      const birds: Bird[] = []
      for (let i = 0; i < PER_FLOCK; i++) birds.push({ x: 0, y: 1e5, z: 0, vx: 0, vy: 0, vz: 0 })
      this.flocks.push({ birds, cx: 0, cz: 0, cy: 60, radius: 70, spin: this.rand() < 0.5 ? 1 : -1, retarget: 0 })
    }
  }

  /** `spots`: places worth circling near the camera (lakes, towns). */
  step(dt: number, camera: THREE.Vector3, spots: ReadonlyArray<{ x: number; z: number }>): void {
    this.time.value += dt
    for (const f of this.flocks) {
      f.retarget -= dt
      const far = Math.hypot(f.cx - camera.x, f.cz - camera.z) > 1300
      if ((f.retarget <= 0 || far) && spots.length) {
        const near = spots.filter((s) => Math.hypot(s.x - camera.x, s.z - camera.z) < 1100)
        const pool = near.length ? near : spots
        const s = pool[Math.floor(this.rand() * pool.length)]
        f.cx = s.x + (this.rand() - 0.5) * 80
        f.cz = s.z + (this.rand() - 0.5) * 80
        f.cy = this.terrain.heightAt(f.cx, f.cz) + 35 + this.rand() * 70
        f.radius = 40 + this.rand() * 80
        f.retarget = 40 + this.rand() * 60
        if (far) for (const b of f.birds) Object.assign(b, { x: f.cx + (this.rand() - 0.5) * 30, y: f.cy, z: f.cz + (this.rand() - 0.5) * 30 })
      }
      // Each bird circles the spot, loosely, and keeps a little apart from the next.
      for (let i = 0; i < f.birds.length; i++) {
        const b = f.birds[i]
        const dx = b.x - f.cx
        const dz = b.z - f.cz
        const d = Math.hypot(dx, dz) || 1
        // Tangent (orbit) + pull to the ring + to the height.
        let ax = (-dz / d) * f.spin * 14 + (dx / d) * (f.radius - d) * 0.25 - b.vx
        let az = (dx / d) * f.spin * 14 + (dz / d) * (f.radius - d) * 0.25 - b.vz
        let ay = (f.cy + Math.sin(this.time.value * 0.7 + i) * 6 - b.y) * 0.5 - b.vy
        const o = f.birds[(i + 1) % f.birds.length]
        const ox = b.x - o.x
        const oz = b.z - o.z
        const od = Math.hypot(ox, oz, b.y - o.y)
        if (od < 4 && od > 0) {
          ax += (ox / od) * 20
          az += (oz / od) * 20
        }
        b.vx += ax * dt * 1.5
        b.vy += ay * dt * 1.5
        b.vz += az * dt * 1.5
        b.x += b.vx * dt
        b.y += b.vy * dt
        b.z += b.vz * dt
      }
    }
  }

  render(): void {
    let n = 0
    for (const f of this.flocks) {
      for (const b of f.birds) {
        _e.set(0, Math.atan2(b.vx, b.vz), Math.max(-0.5, Math.min(0.5, -b.vy * 0.05)))
        _q.setFromEuler(_e)
        _m.compose(_p.set(b.x, b.y, b.z), _q, _s.set(1, 1, 1))
        this.mesh.setMatrixAt(n++, _m)
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }
}

// --- chimney smoke ---------------------------------------------------------------

const PUFFS = 700

interface Puff {
  x: number
  y: number
  z: number
  age: number
  life: number
  size: number
}

export class Smoke {
  readonly mesh: THREE.InstancedMesh
  private readonly puffs: Puff[] = []
  private readonly alpha: THREE.InstancedBufferAttribute
  private next = 0
  private timers = new Map<number, number>()
  private readonly rand = mulberry32(99)
  private readonly wind = new THREE.Vector3(1.1, 0, 0.5)

  constructor() {
    const plane = new THREE.PlaneGeometry(1, 1)
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(PUFFS), 1)
    plane.setAttribute('aAlpha', this.alpha)
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color(0xd8d4cc) } },
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        varying float vAlpha;
        varying vec2 vUv;
        void main() {
          vec3 c = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float s = length(instanceMatrix[0].xyz);
          vec4 mv = viewMatrix * vec4(c, 1.0);
          mv.xy += position.xy * s;
          gl_Position = projectionMatrix * mv;
          vUv = uv;
          vAlpha = aAlpha;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        varying vec2 vUv;
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = dot(p, p);
          if (r > 1.0) discard;
          gl_FragColor = vec4(uColor, (1.0 - r) * (1.0 - r) * vAlpha);
          #include <colorspace_fragment>
        }`,
    })
    this.mesh = new THREE.InstancedMesh(plane, mat, PUFFS)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 2
    for (let i = 0; i < PUFFS; i++) this.puffs.push({ x: 0, y: 0, z: 0, age: 1, life: 1, size: 0 })
  }

  /** `chimneys`: tops of chimneys (id, position) near the camera. */
  step(dt: number, chimneys: ReadonlyArray<{ id: number; x: number; y: number; z: number }>): void {
    for (const c of chimneys) {
      // Not every hearth is lit.
      if (c.id % 3 === 0) continue
      const t = (this.timers.get(c.id) ?? this.rand() * 2) - dt
      if (t > 0) {
        this.timers.set(c.id, t)
        continue
      }
      this.timers.set(c.id, 1.1 + this.rand() * 0.8)
      const p = this.puffs[this.next]
      this.next = (this.next + 1) % PUFFS
      p.x = c.x + (this.rand() - 0.5) * 0.4
      p.y = c.y
      p.z = c.z + (this.rand() - 0.5) * 0.4
      p.age = 0
      p.life = 8 + this.rand() * 4
      p.size = 0.9 + this.rand() * 0.5
    }
    for (let i = 0; i < PUFFS; i++) {
      const p = this.puffs[i]
      if (p.age >= p.life) {
        this.alpha.setX(i, 0)
        continue
      }
      p.age += dt
      const t = p.age / p.life
      p.y += (1.4 - t) * dt
      p.x += this.wind.x * t * dt * 2
      p.z += this.wind.z * t * dt * 2
      const s = p.size * (1 + t * 4)
      _m.makeScale(s, s, s).setPosition(p.x, p.y, p.z)
      this.mesh.setMatrixAt(i, _m)
      this.alpha.setX(i, 0.45 * Math.min(1, t * 8) * (1 - t))
    }
    this.mesh.instanceMatrix.needsUpdate = true
    this.alpha.needsUpdate = true
  }
}

// --- sheep -----------------------------------------------------------------------

interface Sheep {
  x: number
  z: number
  heading: number
  tx: number
  tz: number
  wait: number
  stride: number
  moving: boolean
}

interface SheepFlock {
  sheep: Sheep[]
  hx: number
  hz: number
  /** Running from a giant, until. */
  scared: number
}

const MAX_SHEEP = 600

export class Livestock {
  readonly group = new THREE.Group()
  readonly flocks: SheepFlock[] = []
  private readonly bodies: THREE.InstancedMesh
  private readonly heads: THREE.InstancedMesh
  private readonly legs: THREE.InstancedMesh
  private readonly rand = mulberry32(4711)

  constructor(private readonly terrain: Terrain) {
    const wool = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 1 })
    const dark = new THREE.MeshStandardMaterial({ color: 0x2d2723, roughness: 0.9 })
    const body = new THREE.IcosahedronGeometry(1, 1).scale(0.45, 0.4, 0.65).translate(0, 0.75, 0)
    const head = new THREE.BoxGeometry(0.24, 0.26, 0.34).translate(0, 0.85, 0.72)
    const leg = new THREE.CylinderGeometry(0.05, 0.045, 0.5, 5).translate(0, -0.25, 0)
    this.bodies = new THREE.InstancedMesh(body, wool, MAX_SHEEP)
    this.heads = new THREE.InstancedMesh(head, dark, MAX_SHEEP)
    this.legs = new THREE.InstancedMesh(leg, dark, MAX_SHEEP * 4)
    for (const m of [this.bodies, this.heads, this.legs]) {
      m.count = 0
      m.castShadow = true
      m.frustumCulled = false
      this.group.add(m)
    }
  }

  /** A flock grazes about (x, z) — by a town's fields. */
  addFlock(x: number, z: number, n: number): void {
    const sheep: Sheep[] = []
    for (let i = 0; i < n; i++) {
      const a = this.rand() * 6.28
      const r = this.rand() * 14
      sheep.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, heading: this.rand() * 6.28, tx: x, tz: z, wait: this.rand() * 5, stride: this.rand() * 6, moving: false })
    }
    this.flocks.push({ sheep, hx: x, hz: z, scared: 0 })
  }

  get count(): number {
    return this.flocks.reduce((a, f) => a + f.sheep.length, 0)
  }

  step(dt: number, camera: THREE.Vector3, threats: readonly Threat[], wet: (x: number, z: number) => boolean): void {
    for (const f of this.flocks) {
      if (Math.hypot(f.hx - camera.x, f.hz - camera.z) > 700) continue
      f.scared -= dt
      let fx = 0
      let fz = 0
      for (const t of threats) {
        if (Math.hypot(t.x - f.hx, t.z - f.hz) < t.r * 1.2) {
          f.scared = 6
          fx = f.hx - t.x
          fz = f.hz - t.z
        }
      }
      for (const s of f.sheep) {
        s.wait -= dt
        if (f.scared > 0 && (fx || fz)) {
          const d = Math.hypot(fx, fz) || 1
          s.tx = s.x + (fx / d) * 30
          s.tz = s.z + (fz / d) * 30
          s.wait = 0
        } else if (s.wait <= 0 && !s.moving) {
          // Amble to another mouthful near home.
          const a = this.rand() * 6.28
          const r = this.rand() * 22
          s.tx = f.hx + Math.cos(a) * r
          s.tz = f.hz + Math.sin(a) * r
          s.moving = true
        }
        const dx = s.tx - s.x
        const dz = s.tz - s.z
        const d = Math.hypot(dx, dz)
        if (d < 0.5) {
          if (s.moving) {
            s.moving = false
            s.wait = 3 + this.rand() * 9
          }
          continue
        }
        const sp = f.scared > 0 ? 4 : 0.7
        const nx = s.x + (dx / d) * sp * dt
        const nz = s.z + (dz / d) * sp * dt
        if (wet(nx, nz)) {
          s.tx = s.x
          s.tz = s.z
          continue
        }
        s.x = nx
        s.z = nz
        s.stride += sp * dt * 4
        let dh = Math.atan2(dx, dz) - s.heading
        dh = Math.atan2(Math.sin(dh), Math.cos(dh))
        s.heading += dh * Math.min(1, dt * 4)
      }
    }
  }

  render(camera: THREE.Vector3): void {
    let n = 0
    for (const f of this.flocks) {
      if (Math.hypot(f.hx - camera.x, f.hz - camera.z) > 700) continue
      for (const s of f.sheep) {
        if (n >= MAX_SHEEP) break
        _q.setFromAxisAngle(_up, s.heading)
        _m.compose(_p.set(s.x, this.terrain.heightAt(s.x, s.z), s.z), _q, _s.set(1, 1, 1))
        this.bodies.setMatrixAt(n, _m)
        this.heads.setMatrixAt(n, _m)
        const sw = s.moving || f.scared > 0 ? Math.sin(s.stride) * 0.5 : 0
        const legs: Array<[number, number, number]> = [
          [-0.22, 0.38, sw],
          [0.22, 0.38, -sw],
          [-0.22, -0.38, -sw],
          [0.22, -0.38, sw],
        ]
        legs.forEach(([x, z, a], k) => {
          _leg.makeRotationX(a).setPosition(x, 0.52, z)
          this.legs.setMatrixAt(n * 4 + k, _leg.premultiply(_m))
        })
        n++
      }
    }
    this.bodies.count = this.heads.count = n
    this.legs.count = n * 4
    for (const m of [this.bodies, this.heads, this.legs]) m.instanceMatrix.needsUpdate = true
  }
}

// --- boats -----------------------------------------------------------------------

const MAX_BOATS = 48
const _eb = new THREE.Euler(0, 0, 0, 'YXZ')
/** Water this deep, at least, under a boat. */
const DRAFT = 0.9

interface Boat {
  lake: number
  x: number
  z: number
  heading: number
  tx: number
  tz: number
  /** Seconds left fishing where it is. */
  wait: number
  oar: number
  phase: number
}

/** Vertex-coloured parts merged into one geometry. */
function painted(parts: Array<[THREE.BufferGeometry, number]>): THREE.BufferGeometry {
  return mergeGeometries(
    parts.map(([g, hex]) => {
      const n = g.index ? g.toNonIndexed() : g
      const c = new THREE.Color(hex)
      const col = new Float32Array(n.getAttribute('position').count * 3)
      for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i)
      n.setAttribute('color', new THREE.BufferAttribute(col, 3))
      n.deleteAttribute('uv')
      return n
    }),
  )!
}

export class Boats {
  readonly group = new THREE.Group()
  readonly boats: Boat[] = []
  private readonly hulls: THREE.InstancedMesh
  private readonly oars: THREE.InstancedMesh
  private readonly rand = mulberry32(9090)
  private t = 0
  private replace = 0

  constructor(private readonly terrain: Terrain) {
    // A rowing boat with a fisher in a brown cloak, sitting astern of the oars.
    const hull = new THREE.BoxGeometry(1.3, 0.5, 4, 2, 1, 4)
    const p = hull.getAttribute('position')
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i)
      // A pointed bow and a narrower, raised stern; the keel narrower than the gunwale.
      const k = z > 0 ? 1 - Math.pow(z / 2, 2) * 0.85 : 1 - Math.pow(-z / 2, 2) * 0.35
      const y = p.getY(i)
      p.setX(i, p.getX(i) * k * (y < 0 ? 0.6 : 1))
      p.setY(i, y + Math.pow(z / 2, 2) * 0.25)
    }
    hull.computeVertexNormals()
    const geo = painted([
      [hull.translate(0, 0.15, 0), 0x6b5137],
      [new THREE.BoxGeometry(1.1, 0.08, 0.35).translate(0, 0.32, -0.2), 0x5a4330], // thwart
      [new THREE.ConeGeometry(0.42, 1.0, 8).translate(0, 0.8, -0.2), 0x6e5238], // cloak
      [new THREE.SphereGeometry(0.2, 8, 6).translate(0, 1.38, -0.2), 0xc9a47e], // head
    ])
    const oar = painted([[new THREE.BoxGeometry(2.6, 0.06, 0.12).translate(1.3, 0, 0), 0x8a6a48]])
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })
    this.hulls = new THREE.InstancedMesh(geo, mat, MAX_BOATS)
    this.oars = new THREE.InstancedMesh(oar, mat, MAX_BOATS * 2)
    for (const m of [this.hulls, this.oars]) {
      m.count = 0
      m.castShadow = true
      m.frustumCulled = false
      this.group.add(m)
    }
  }

  /**
   * Keep a few boats out on the lake beside each town (three for an old
   * village, one for a hamlet), going where the water is deep enough.
   */
  step(dt: number, lakes: readonly Lake[], towns: ReadonlyArray<{ cx: number; cz: number; layout?: string }>): void {
    this.t += dt
    this.replace -= dt
    if (this.replace <= 0) {
      this.replace = 5
      this.man(lakes, towns)
    }
    for (const b of this.boats) {
      const lake = lakes.find((l) => l.id === b.lake)
      if (!lake) continue
      b.wait -= dt
      const dx = b.tx - b.x
      const dz = b.tz - b.z
      const d = Math.hypot(dx, dz)
      if (d < 2 || b.wait > 0) {
        if (d < 2 && b.wait <= 0) {
          // Arrived: fish a while, then row somewhere else.
          b.wait = 12 + this.rand() * 30
          const to = this.deepSpot(lake)
          if (to) [b.tx, b.tz] = to
        }
        continue
      }
      let dh = Math.atan2(dx, dz) - b.heading
      dh = Math.atan2(Math.sin(dh), Math.cos(dh))
      b.heading += dh * Math.min(1, dt * 0.6)
      const sp = 1.1 * Math.max(0, Math.cos(dh))
      const nx = b.x + Math.sin(b.heading) * sp * dt
      const nz = b.z + Math.cos(b.heading) * sp * dt
      if (!this.deep(lake, nx, nz)) {
        // Shallows ahead: somewhere else.
        const to = this.deepSpot(lake)
        if (to) [b.tx, b.tz] = to
        continue
      }
      b.x = nx
      b.z = nz
      b.oar += dt * 3.2
    }
  }

  private deep(lake: Lake, x: number, z: number): boolean {
    const ix = Math.round(x)
    const iz = Math.round(z)
    return inBasin(lake.basin, ix, iz) && lake.level - this.terrain.cellHeight(ix, iz) > DRAFT
  }

  /** A random spot on the lake with water enough under it. */
  private deepSpot(lake: Lake): [number, number] | null {
    const b = lake.basin
    for (let tries = 0; tries < 60; tries++) {
      const x = b.x0 + Math.floor(this.rand() * b.w)
      const z = b.z0 + Math.floor(this.rand() * b.h)
      if (this.deep(lake, x, z)) return [x, z]
    }
    return null
  }

  /** Each town's boats on its nearest sizeable lake; boats whose lake is gone are taken in. */
  private man(lakes: readonly Lake[], towns: ReadonlyArray<{ cx: number; cz: number; layout?: string }>): void {
    for (let i = this.boats.length - 1; i >= 0; i--) {
      const lake = lakes.find((l) => l.id === this.boats[i].lake)
      if (!lake || !this.deep(lake, this.boats[i].x, this.boats[i].z)) this.boats.splice(i, 1)
    }
    for (const t of towns) {
      let best: Lake | null = null
      let bd = 420
      for (const l of lakes) {
        if (l.basin.sorted.length < 700 || l.level < l.basin.spill - 0.5) continue
        const d = Math.hypot(l.basin.bx - t.cx, l.basin.bz - t.cz)
        if (d < bd) {
          bd = d
          best = l
        }
      }
      if (!best) continue
      const want = t.layout === 'street' ? 3 : 1
      // Boats already on that lake count toward any town sharing it.
      let have = this.boats.filter((b) => b.lake === best.id).length
      while (have < want && this.boats.length < MAX_BOATS) {
        const at = this.deepSpot(best)
        if (!at) break
        const to = this.deepSpot(best) ?? at
        this.boats.push({ lake: best.id, x: at[0], z: at[1], heading: this.rand() * 6.28, tx: to[0], tz: to[1], wait: this.rand() * 10, oar: 0, phase: this.rand() * 6.28 })
        have++
      }
    }
  }

  render(lakes: readonly Lake[]): void {
    let n = 0
    for (const b of this.boats) {
      const lake = lakes.find((l) => l.id === b.lake)
      if (!lake) continue
      // Bob on the swell, rolling a little.
      const bob = Math.sin(this.t * 1.3 + b.phase) * 0.06
      _eb.set(Math.sin(this.t * 0.9 + b.phase) * 0.03, b.heading, Math.sin(this.t * 1.1 + b.phase * 2) * 0.05)
      _q.setFromEuler(_eb)
      _m.compose(_p.set(b.x, lake.level - 0.12 + bob, b.z), _q, _s.set(1, 1, 1))
      this.hulls.setMatrixAt(n, _m)
      // Oars sweep while rowing, rest level while fishing.
      const rowing = b.wait <= 0
      const sweep = rowing ? Math.sin(b.oar) * 0.6 : 0.15
      const dip = rowing ? Math.cos(b.oar) * 0.25 - 0.1 : -0.2
      for (const side of [-1, 1]) {
        _leg.makeRotationFromEuler(_eb.set(0, side < 0 ? Math.PI - sweep : sweep, side * dip))
        _leg.setPosition(side * 0.55, 0.45, 0.2)
        this.oars.setMatrixAt(n * 2 + (side < 0 ? 0 : 1), _leg.premultiply(_m))
      }
      n++
    }
    this.hulls.count = n
    this.oars.count = n * 2
    this.hulls.instanceMatrix.needsUpdate = true
    this.oars.instanceMatrix.needsUpdate = true
  }
}
