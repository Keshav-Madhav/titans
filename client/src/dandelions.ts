// The Clock Meadow (the user: "things should generally be huge"): a stretch of the valley where
// dandelions have gone to seed and stand fifteen and twenty metres high — pale stems swaying, each
// carrying a clock of seeds the size of a house. Walk into one, glide through it, or loose an arrow at
// it, and its seeds let go and drift off down the wind, leaving the bald head nodding.
//
// Their own model, built for the scale: a tapering stem with a slight lean, a receptacle at the top,
// and a sphere of seeds — each a fine stalk out from the centre and a little feathered umbrella at
// its end.

import * as THREE from 'three'
import { makeSimplex2, mulberry32, type Terrain } from '@titans/shared'

/** Where it is: open valley ground, flat and far from the giants. */
export const CLOCKS = { x: -1200, z: -300, r: 260 }

const CELL = 40
/** Drawn within this of the camera. */
const FAR = 900
const CAP = 600
/** Seeds on a clock. */
const SEEDS = 150
/** The clock's radius and the stem's height, in the 1 m model. */
const HEAD_R = 0.14

const edge = makeSimplex2(0xd411)

/** 0 … 1: how much of the meadow (x, z) is. */
export function clocksAt(x: number, z: number): number {
  const d = Math.hypot(x - CLOCKS.x, z - CLOCKS.z) / CLOCKS.r + 0.18 * edge(x * 0.005, z * 0.005)
  return 1 - THREE.MathUtils.smoothstep(d, 0.55, 1)
}

/**
 * One dandelion clock, 1 m tall (scaled per instance). `aSeed` marks the seeds' vertices (they go
 * when the clock is blown).
 */
function clockGeometry(): THREE.BufferGeometry {
  const pos: number[] = []
  const nrm: number[] = []
  const col: number[] = []
  const seed: number[] = []
  const rand = mulberry32(0xd41)
  const push = (p: THREE.Vector3, n: THREE.Vector3, c: number[], s: number) => {
    pos.push(p.x, p.y, p.z)
    nrm.push(n.x, n.y, n.z)
    col.push(c[0], c[1], c[2])
    seed.push(s)
  }
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ca: number[], cb: number[], cc: number[], s: number, n?: THREE.Vector3) => {
    const nn = n ?? new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize()
    push(a, nn, ca, s)
    push(b, nn, cb, s)
    push(c, nn, cc, s)
  }
  // The stem: a tapering tube with a gentle lean and bow, pale green going paler up it.
  const SIDES = 6
  const SEG = 10
  const top = 1 - HEAD_R
  const at = (t: number) => new THREE.Vector3(0.035 * Math.sin(t * 2.2) * t, top * t, 0.02 * t * t)
  for (let s = 0; s < SEG; s++) {
    const t0 = s / SEG
    const t1 = (s + 1) / SEG
    const p0 = at(t0)
    const p1 = at(t1)
    const r0 = 0.012 * (1 - 0.45 * t0)
    const r1 = 0.012 * (1 - 0.45 * t1)
    const c0 = [0.3 + 0.12 * t0, 0.36 + 0.08 * t0, 0.18 + 0.1 * t0]
    const c1 = [0.3 + 0.12 * t1, 0.36 + 0.08 * t1, 0.18 + 0.1 * t1]
    for (let k = 0; k < SIDES; k++) {
      const a0 = (k / SIDES) * Math.PI * 2
      const a1 = ((k + 1) / SIDES) * Math.PI * 2
      const n0 = new THREE.Vector3(Math.cos(a0), 0, Math.sin(a0))
      const n1 = new THREE.Vector3(Math.cos(a1), 0, Math.sin(a1))
      const v00 = p0.clone().addScaledVector(n0, r0)
      const v01 = p0.clone().addScaledVector(n1, r0)
      const v10 = p1.clone().addScaledVector(n0, r1)
      const v11 = p1.clone().addScaledVector(n1, r1)
      push(v00, n0, c0, 0); push(v10, n0, c1, 0); push(v11, n1, c1, 0)
      push(v00, n0, c0, 0); push(v11, n1, c1, 0); push(v01, n1, c0, 0)
    }
  }
  // The receptacle: a small, pitted brown-green knob where the seeds are held.
  const head = at(1)
  const knob = new THREE.IcosahedronGeometry(0.016, 1).toNonIndexed()
  const kp = knob.getAttribute('position')
  for (let i = 0; i < kp.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(kp, i).add(head)
    const b = new THREE.Vector3().fromBufferAttribute(kp, i + 1).add(head)
    const c = new THREE.Vector3().fromBufferAttribute(kp, i + 2).add(head)
    const kc = [0.36, 0.33, 0.2]
    tri(a, b, c, kc, kc, kc, 0)
  }
  // The seeds: spread evenly over a sphere (a golden spiral), each a fine stalk and an umbrella of
  // fine white hairs (a shallow cone of narrow spokes) at its end.
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < SEEDS; i++) {
    const yv = 1 - (i / (SEEDS - 1)) * 1.7 // (not quite all the way round: the underside is bare)
    const rr = Math.sqrt(Math.max(0, 1 - yv * yv))
    const th = golden * i
    const dir = new THREE.Vector3(Math.cos(th) * rr, yv, Math.sin(th) * rr).normalize()
    // (A little irregular: no two the same length or angle.)
    dir.x += (rand() - 0.5) * 0.12
    dir.z += (rand() - 0.5) * 0.12
    dir.normalize()
    const len = HEAD_R * (0.82 + rand() * 0.18)
    const base = head.clone().addScaledVector(dir, 0.016)
    const end = head.clone().addScaledVector(dir, len * 0.78)
    // The stalk: a thin ribbon facing out of the plane of the stalk and "up".
    const side = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize()
    const sw = 0.0009
    const cStalk = [0.62, 0.6, 0.5]
    tri(base.clone().addScaledVector(side, -sw), base.clone().addScaledVector(side, sw), end, [0.4, 0.38, 0.28], [0.4, 0.38, 0.28], cStalk, 1, dir)
    // The umbrella: spokes out from the stalk's end, a shallow cone opening outward.
    const up2 = new THREE.Vector3().crossVectors(dir, side).normalize()
    const SPOKES = 7
    const ur = len * 0.24
    const cHair = [0.93, 0.92, 0.88]
    for (let k = 0; k < SPOKES; k++) {
      const a = (k / SPOKES) * Math.PI * 2 + rand() * 0.4
      const out = side.clone().multiplyScalar(Math.cos(a)).addScaledVector(up2, Math.sin(a))
      const tip = end.clone().addScaledVector(out, ur).addScaledVector(dir, ur * 0.55)
      const w = out.clone().cross(dir).normalize().multiplyScalar(ur * 0.07)
      tri(end, tip.clone().add(w), tip.clone().sub(w), cStalk, cHair, cHair, 1, dir)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1))
  return geo
}

/** The seeds that have let go: points drifting off down the wind. */
class Drift {
  readonly points: THREE.Points
  private readonly pos: Float32Array
  private readonly vel: Float32Array
  private readonly life: Float32Array
  private next = 0
  constructor(private readonly n = 3000) {
    this.pos = new Float32Array(n * 3).fill(-1e5)
    this.vel = new Float32Array(n * 3)
    this.life = new Float32Array(n)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    // (A soft round seed, not a square: plain points drew as white squares, blooming into blobs near the lens.)
    const cv = document.createElement('canvas')
    cv.width = cv.height = 32
    const cx = cv.getContext('2d')!
    const gr = cx.createRadialGradient(16, 16, 0, 16, 16, 16)
    gr.addColorStop(0, 'rgba(255,255,250,1)')
    gr.addColorStop(0.35, 'rgba(250,248,238,0.6)')
    gr.addColorStop(1, 'rgba(250,248,238,0)')
    cx.fillStyle = gr
    cx.fillRect(0, 0, 32, 32)
    const m = new THREE.PointsMaterial({ color: 0xf2f0e6, size: 0.18, map: new THREE.CanvasTexture(cv), sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false })
    this.points = new THREE.Points(g, m)
    this.points.frustumCulled = false
  }
  /** Let `count` seeds go from a clock at `c` of radius `r`. */
  burst(c: THREE.Vector3, r: number, count: number, rand: () => number): void {
    for (let i = 0; i < count; i++) {
      const j = this.next
      this.next = (this.next + 1) % this.n
      const a = rand() * Math.PI * 2
      const y = rand() * 1.6 - 0.6
      const rr = Math.sqrt(Math.max(0, 1 - y * y))
      this.pos[j * 3] = c.x + Math.cos(a) * rr * r
      this.pos[j * 3 + 1] = c.y + y * r
      this.pos[j * 3 + 2] = c.z + Math.sin(a) * rr * r
      this.vel[j * 3] = Math.cos(a) * 0.6
      this.vel[j * 3 + 1] = 0.25 + rand() * 0.4
      this.vel[j * 3 + 2] = Math.sin(a) * 0.6
      this.life[j] = 25 + rand() * 20
    }
  }
  update(dt: number, wind: THREE.Vector2, t: number): void {
    let any = false
    for (let j = 0; j < this.n; j++) {
      if (this.life[j] <= 0) continue
      any = true
      this.life[j] -= dt
      // Carried by the wind, rising and sinking a little, each its own way.
      const wob = Math.sin(t * 0.7 + j * 1.3)
      this.vel[j * 3] += (wind.x * 2.2 - this.vel[j * 3]) * dt * 0.4
      this.vel[j * 3 + 2] += (wind.y * 2.2 - this.vel[j * 3 + 2]) * dt * 0.4
      this.vel[j * 3 + 1] += (0.06 * wob - 0.04 - this.vel[j * 3 + 1] * 0.3) * dt
      this.pos[j * 3] += this.vel[j * 3] * dt
      this.pos[j * 3 + 1] += this.vel[j * 3 + 1] * dt
      this.pos[j * 3 + 2] += this.vel[j * 3 + 2] * dt
      if (this.life[j] <= 0) this.pos[j * 3 + 1] = -1e5
    }
    if (any) (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
  }
}

export class Dandelions {
  readonly mesh = new THREE.Group()
  private readonly clocks: THREE.InstancedMesh
  private readonly blown: THREE.InstancedBufferAttribute
  private readonly drift = new Drift()
  private readonly time = { value: 0 }
  /** Every clock in the meadow, made once: x, y, z, height, turn (by cell). */
  private readonly all: Array<{ x: number; y: number; z: number; h: number; turn: number; key: number }> = []
  /** Clocks blown (by key), so they stay bald while you are near. */
  private readonly gone = new Set<number>()
  private lastX = Infinity
  private lastZ = Infinity
  private readonly shown: number[] = []
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly s = new THREE.Vector3()
  private readonly p = new THREE.Vector3()
  private readonly up = new THREE.Vector3(0, 1, 0)
  private readonly rand = mulberry32(0xd4110)
  /** Called when a clock is blown (sound, a find). */
  onBlow: ((at: THREE.Vector3, first: boolean) => void) | null = null

  constructor(terrain: Terrain, blocked: (x: number, z: number) => boolean) {
    const geo = clockGeometry()
    this.blown = new THREE.InstancedBufferAttribute(new Float32Array(CAP), 1)
    geo.setAttribute('aBlown', this.blown)
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide })
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.time
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aSeed;\nattribute float aBlown;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          // A blown clock's seeds are gone (collapsed out of sight into the receptacle).
          if (aSeed > 0.5 && aBlown > 0.5) transformed = vec3(0.0, ${(1 - HEAD_R).toFixed(3)}, 0.0);
          // A slow sway, the head most of all (the stem bends from the root).
          vec3 dr = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float sw = position.y * position.y;
          transformed.x += sin(uTime * 0.45 + dr.x * 0.03 + dr.z * 0.02) * 0.05 * sw;
          transformed.z += sin(uTime * 0.37 + dr.z * 0.03) * 0.035 * sw;`,
        )
      // The hairs are fine and let light through: lit a little from behind as well (the head glows
      // against a low sun), never black.
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= gl_FrontFacing ? 1.0 : 0.85;')
    }
    this.clocks = new THREE.InstancedMesh(geo, mat, CAP)
    this.clocks.count = 0
    this.clocks.frustumCulled = false
    this.clocks.castShadow = true
    this.clocks.receiveShadow = true
    this.mesh.add(this.clocks, this.drift.points)
    // The meadow's clocks, scattered in loose drifts (a few close together, then open grass).
    const r = Math.ceil(CLOCKS.r / CELL) + 1
    const c0x = Math.floor(CLOCKS.x / CELL)
    const c0z = Math.floor(CLOCKS.z / CELL)
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const cx = c0x + dx
        const cz = c0z + dz
        const rnd = mulberry32((cx * 73856) ^ (cz * 19349) ^ 0xd4)
        const n = Math.floor(rnd() * 4)
        for (let i = 0; i < n; i++) {
          const x = (cx + rnd()) * CELL
          const z = (cz + rnd()) * CELL
          const k = clocksAt(x, z)
          if (k < 0.05 || rnd() > k || blocked(x, z)) continue
          this.all.push({ x, y: terrain.heightAt(x, z) - 0.3, z, h: 14 + rnd() * 10 * (0.5 + 0.5 * k), turn: rnd() * Math.PI * 2, key: cx * 100003 + cz * 7 + i })
        }
      }
  }

  /** Clocks (their heads) within `r` of (x, y, z): for blowing them by walking, gliding, an arrow. */
  touch(x: number, y: number, z: number, r: number): void {
    for (let i = 0; i < this.shown.length; i++) {
      const c = this.all[this.shown[i]]
      if (this.gone.has(c.key)) continue
      const hy = c.y + c.h * (1 - HEAD_R)
      const hr = c.h * HEAD_R
      if (Math.hypot(x - c.x, y - hy, z - c.z) < hr + r) this.blow(this.shown[i], i)
    }
  }

  /** The stem's distance (across the ground) from (x, z) — negative inside — for the camera's lens. */
  stemSdf(x: number, y: number, z: number): number {
    let best = 99
    for (const i of this.shown) {
      const c = this.all[i]
      if (y < c.y - 1 || y > c.y + c.h) continue
      best = Math.min(best, Math.hypot(x - c.x, z - c.z) - c.h * 0.012)
    }
    return best
  }

  /** Keep a walker out of the stems (each a circle at its foot, plus the body's), pushed out sideways. */
  stemPush(p: THREE.Vector3): void {
    for (const i of this.shown) {
      const c = this.all[i]
      if (p.y < c.y - 1 || p.y > c.y + c.h * 0.8) continue
      const r = c.h * 0.012 + 0.3
      const ex = p.x - c.x
      const ez = p.z - c.z
      const d = Math.hypot(ex, ez)
      if (d >= r) continue
      if (d < 1e-4) p.x = c.x + r
      else {
        p.x = c.x + (ex / d) * r
        p.z = c.z + (ez / d) * r
      }
    }
  }

  private blow(idx: number, slot: number): void {
    const c = this.all[idx]
    const first = this.gone.size === 0
    this.gone.add(c.key)
    this.blown.setX(slot, 1)
    this.blown.needsUpdate = true
    const head = new THREE.Vector3(c.x, c.y + c.h * (1 - HEAD_R), c.z)
    this.drift.burst(head, c.h * HEAD_R, 140, this.rand)
    this.onBlow?.(head, first)
  }

  update(dt: number, cam: THREE.Vector3, wind: THREE.Vector2): void {
    this.time.value += dt
    this.drift.update(dt, wind, this.time.value)
    const near = Math.hypot(cam.x - CLOCKS.x, cam.z - CLOCKS.z) < CLOCKS.r + FAR
    this.clocks.visible = near
    if (!near) {
      // (Far away, the meadow grows back: come again and the clocks are whole.)
      if (this.gone.size && Math.hypot(cam.x - CLOCKS.x, cam.z - CLOCKS.z) > CLOCKS.r + FAR * 2) this.gone.clear()
      return
    }
    if (Math.hypot(cam.x - this.lastX, cam.z - this.lastZ) < 25) return
    this.lastX = cam.x
    this.lastZ = cam.z
    this.shown.length = 0
    let n = 0
    for (let i = 0; i < this.all.length && n < CAP; i++) {
      const c = this.all[i]
      if (Math.hypot(c.x - cam.x, c.z - cam.z) > FAR) continue
      this.q.setFromAxisAngle(this.up, c.turn)
      this.m.compose(this.p.set(c.x, c.y, c.z), this.q, this.s.set(c.h, c.h, c.h))
      this.clocks.setMatrixAt(n, this.m)
      this.blown.setX(n, this.gone.has(c.key) ? 1 : 0)
      this.shown.push(i)
      n++
    }
    this.clocks.count = n
    this.clocks.instanceMatrix.needsUpdate = true
    this.blown.needsUpdate = true
  }
}
