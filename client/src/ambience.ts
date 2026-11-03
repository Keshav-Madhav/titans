// Ambience (user, 2026-10-31: "fireflies and bug noises, small animals to add
// ambience and scale like distant birds, bugs… making the world fuller, more
// real, within performance"). Small things, near you, cheap:
//
//   fireflies   — at dusk and at night, low over the grass of the Green and
//                 the Old Wood (none in the Dune Sea), each blinking its own
//                 slow pattern, drifting; a few hundred points, one draw call
//   butterflies — by day, fluttering low in pairs of wings, a few dozen
//   circlers    — big dark birds turning slow circles round the giants' heads,
//                 so a 300 m giant finally has something to be measured by
//
// Everything wraps round the camera: you only ever see the ones near you.

import * as THREE from 'three'
import { mulberry32, type Terrain } from '@titans/shared'

const FIREFLIES = 360
const FLY_R = 70
const BUTTERFLIES = 48
const BUTTER_R = 45
/** Small birds flushed out of the grass as you run through it. */
const FLUSH = 14
/** Hares in the grass near you: they sit, nibble, and bolt when you come close. */
const HARES = 14
const HARE_R = 90

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)

export class Ambience {
  readonly group = new THREE.Group()
  private readonly fly: THREE.Points
  private readonly flyPos: Float32Array
  private readonly flyPhase: Float32Array
  private readonly flyMat: THREE.ShaderMaterial
  /** A few of the fireflies carry a real light (the grass round them glows as they blink). */
  private readonly flyLights: THREE.PointLight[] = []
  private readonly butter: THREE.InstancedMesh
  private readonly butterState: Array<{ x: number; y: number; z: number; a: number; ph: number; hue: number }> = []
  private readonly circlers: THREE.InstancedMesh
  private readonly flushed: THREE.InstancedMesh
  private readonly hares: THREE.InstancedMesh
  readonly hareState: Array<{ x: number; z: number; a: number; run: number; hop: number; zig: number }> = []
  private readonly flushState: Array<{ p: THREE.Vector3; v: THREE.Vector3; age: number; size: number }> = []
  private flushClock = 8
  private time = 0
  private readonly rand = mulberry32(8181)
  /**
   * A giant's foot comes down near you: a flock bursts up from the ground
   * round it and scatters (specks beside the foot: its size).
   */
  flushAt(x: number, z: number, r: number): void {
    for (const b of this.flushState) {
      if (b.age < 3) continue
      const a = this.rand() * Math.PI * 2
      const d = r * (0.6 + this.rand() * 0.8)
      b.p.set(x + Math.cos(a) * d, this.terrain.heightAt(x + Math.cos(a) * d, z + Math.sin(a) * d) + 0.5, z + Math.sin(a) * d)
      b.v.set(Math.cos(a) * (7 + this.rand() * 5), 6 + this.rand() * 4, Math.sin(a) * (7 + this.rand() * 5))
      b.age = 0
      b.size = 0.32
    }
  }

  /** Birds burst up out of the grass (for their sound). */
  onFlush: () => void = () => {}

  constructor(
    private readonly terrain: Terrain,
    /** 0 … 1: how much of the land at (x, z) is open grass or wood (fireflies, butterflies live there). */
    private readonly lush: (x: number, z: number) => number,
  ) {
    // Fireflies.
    this.flyPos = new Float32Array(FIREFLIES * 3)
    this.flyPhase = new Float32Array(FIREFLIES)
    for (let i = 0; i < FIREFLIES; i++) {
      this.flyPos.set([(this.rand() - 0.5) * 2 * FLY_R, 1, (this.rand() - 0.5) * 2 * FLY_R], i * 3)
      this.flyPhase[i] = this.rand() * 100
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.flyPos, 3))
    g.setAttribute('aPhase', new THREE.BufferAttribute(this.flyPhase, 1))
    this.flyMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOn: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aPhase;
        uniform float uTime;
        varying float vGlow;
        void main() {
          // A slow blink: dark most of the time, a soft rise and fall now and then.
          float b = sin(uTime * (0.7 + fract(aPhase * 0.37) * 0.8) + aPhase);
          vGlow = smoothstep(0.55, 1.0, b);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // (Pinpricks with a little halo: at up to 21 px, bloomed, they were green tennis balls.)
          gl_PointSize = (2.5 + 5.0 * vGlow) * clamp(40.0 / -mv.z, 0.7, 2.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOn;
        varying float vGlow;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          float a = exp(-r * r * 9.0) + 0.25 * exp(-r * r * 2.5) * (1.0 - r);
          gl_FragColor = vec4(vec3(2.2, 3.2, 0.7) * vGlow * uOn, clamp(a, 0.0, 1.0) * vGlow * uOn);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
    this.fly = new THREE.Points(g, this.flyMat)
    this.fly.frustumCulled = false
    this.group.add(this.fly)
    // (Always present, dark by day: a light that comes and goes would recompile every shader.)
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xcfff70, 0, 7, 1.6)
      this.flyLights.push(l)
      this.group.add(l)
    }

    // Butterflies: two wings that flap, pale and warm colours.
    const wing = new THREE.PlaneGeometry(0.11, 0.08).translate(0.055, 0, 0)
    const wings = new THREE.BufferGeometry()
    const w1 = wing.clone()
    const w2 = wing.clone().scale(-1, 1, 1)
    const pos = new Float32Array([...(w1.getAttribute('position').array as Float32Array), ...(w2.getAttribute('position').array as Float32Array)])
    wings.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const idx = [...(w1.index!.array as Uint16Array)]
    wings.setIndex([...idx, ...idx.map((i) => i + 4)])
    wings.computeVertexNormals()
    this.butter = new THREE.InstancedMesh(wings, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: false }), BUTTERFLIES)
    this.butter.frustumCulled = false
    const col = new THREE.Color()
    for (let i = 0; i < BUTTERFLIES; i++) {
      const hue = [0.12, 0.08, 0.15, 0.58, 0.02][i % 5]
      this.butterState.push({ x: (this.rand() - 0.5) * 2 * BUTTER_R, y: 0.8, z: (this.rand() - 0.5) * 2 * BUTTER_R, a: this.rand() * 6.28, ph: this.rand() * 10, hue })
      this.butter.setColorAt(i, col.setHSL(hue, 0.55, 0.62))
    }
    this.group.add(this.butter)

    // Circlers: a long-winged dark bird shape (a shallow V).
    const bird = new THREE.BufferGeometry()
    bird.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.4, -2.2, 0.35, -0.2, 0, 0, -0.5, 0, 0, 0.4, 0, 0, -0.5, 2.2, 0.35, -0.2], 3))
    bird.computeVertexNormals()
    this.circlers = new THREE.InstancedMesh(bird, new THREE.MeshBasicMaterial({ color: 0x1d1c1b, side: THREE.DoubleSide }), 24)
    this.circlers.frustumCulled = false
    this.group.add(this.circlers)
    this.flushed = new THREE.InstancedMesh(bird, new THREE.MeshBasicMaterial({ color: 0x4a3f33, side: THREE.DoubleSide }), FLUSH)
    this.flushed.frustumCulled = false
    this.flushed.count = 0
    for (let i = 0; i < FLUSH; i++) this.flushState.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), age: 99, size: 0.12 })
    this.group.add(this.flushed)
    // A hare: a round body, a smaller head, two tall ears, a white scut.
    const hare = mergeHare()
    this.hares = new THREE.InstancedMesh(hare, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), HARES)
    this.hares.frustumCulled = false
    this.hares.castShadow = true
    for (let i = 0; i < HARES; i++) this.hareState.push({ x: (this.rand() - 0.5) * 2 * HARE_R, z: (this.rand() - 0.5) * 2 * HARE_R, a: this.rand() * 6.28, run: 0, hop: 0, zig: 0 })
    this.group.add(this.hares)
  }

  /**
   * Each frame. `dusk` 0 … 1 (fireflies), `day` 0 … 1 and `rain` (butterflies),
   * and the heads to circle (a giant's head, and its height for the size of the circle).
   */
  update(dt: number, camera: THREE.Vector3, dusk: number, day: number, rain: number, heads: Array<{ at: THREE.Vector3; H: number }>, runner?: { pos: THREE.Vector3; speed: number; yaw: number }): void {
    this.time += dt
    // Running through the grass by day: now and then a few small birds burst up ahead of you.
    if (runner && runner.speed > 6 && day > 0.4 && rain < 0.3 && this.lush(runner.pos.x, runner.pos.z) > 0.5) {
      this.flushClock -= dt
      if (this.flushClock <= 0) {
        this.flushClock = 10 + this.rand() * 16
        const ax = runner.pos.x + Math.sin(runner.yaw) * 6
        const az = runner.pos.z + Math.cos(runner.yaw) * 6
        for (const b of this.flushState) {
          const a = runner.yaw + (this.rand() - 0.5) * 2
          b.p.set(ax + (this.rand() - 0.5) * 4, this.terrain.heightAt(ax, az) + 0.3, az + (this.rand() - 0.5) * 4)
          b.v.set(Math.sin(a) * (6 + this.rand() * 4), 5 + this.rand() * 3, Math.cos(a) * (6 + this.rand() * 4))
          b.age = 0
          b.size = 0.12
        }
        this.onFlush()
      }
    }
    // Hares: by day and dusk, on lush ground; sit, then bolt (zigzag hops) from you.
    const hOn = (day > 0.2 || dusk > 0) && rain < 0.6
    this.hares.visible = hOn
    if (hOn && runner) {
      this.hareState.forEach((h, i) => {
        if (h.x - camera.x > HARE_R) h.x -= 2 * HARE_R
        else if (camera.x - h.x > HARE_R) h.x += 2 * HARE_R
        if (h.z - camera.z > HARE_R) h.z -= 2 * HARE_R
        else if (camera.z - h.z > HARE_R) h.z += 2 * HARE_R
        const dx = h.x - runner.pos.x
        const dz = h.z - runner.pos.z
        const d = Math.hypot(dx, dz)
        if (h.run <= 0 && d < 14) {
          h.run = 2.5 + this.rand() * 1.5
          h.a = Math.atan2(dx, dz)
        }
        let hopY = 0
        if (h.run > 0) {
          h.run -= dt
          h.zig -= dt
          if (h.zig <= 0) {
            h.zig = 0.35 + this.rand() * 0.4
            h.a = Math.atan2(dx, dz) + (this.rand() - 0.5) * 1.4
          }
          h.hop += dt * 9
          h.x += Math.sin(h.a) * 11 * dt
          h.z += Math.cos(h.a) * 11 * dt
          hopY = Math.abs(Math.sin(h.hop)) * 0.35
        } else if (this.rand() < dt * 0.15) h.a += (this.rand() - 0.5) * 1.5
        const live = this.lush(h.x, h.z) > 0.5
        const y = live ? this.terrain.heightAt(h.x, h.z) + hopY : -1e4
        _q.setFromAxisAngle(_up, h.a)
        _m.compose(_p.set(h.x, y, h.z), _q, _s.set(1, h.run > 0 ? 0.85 : 1, h.run > 0 ? 1.25 : 1))
        this.hares.setMatrixAt(i, _m)
      })
      this.hares.instanceMatrix.needsUpdate = true
    }
    let fk = 0
    for (const b of this.flushState) {
      if (b.age > 6) continue
      b.age += dt
      b.v.y = Math.max(1.2, b.v.y - 1.5 * dt)
      b.p.addScaledVector(b.v, dt)
      const flap = Math.sin(this.time * 30 + b.p.x) * 0.5
      _q.setFromEuler(new THREE.Euler(flap, Math.atan2(b.v.x, b.v.z), 0))
      _m.compose(b.p, _q, _s.set(b.size, b.size, b.size))
      this.flushed.setMatrixAt(fk++, _m)
    }
    this.flushed.count = fk
    this.flushed.instanceMatrix.needsUpdate = true
    // Fireflies: wrap round the camera, sit 0.4–2.6 m over the ground, drift.
    const on = dusk * (1 - rain)
    this.flyMat.uniforms.uTime.value = this.time
    this.flyMat.uniforms.uOn.value = on
    this.fly.visible = on > 0.02
    if (this.fly.visible) {
      const p = this.flyPos
      for (let i = 0; i < FIREFLIES; i++) {
        let x = p[i * 3]
        let z = p[i * 3 + 2]
        const ph = this.flyPhase[i]
        x += Math.sin(this.time * 0.3 + ph) * 0.4 * dt
        z += Math.cos(this.time * 0.27 + ph * 1.3) * 0.4 * dt
        if (x - camera.x > FLY_R) x -= 2 * FLY_R
        else if (camera.x - x > FLY_R) x += 2 * FLY_R
        if (z - camera.z > FLY_R) z -= 2 * FLY_R
        else if (camera.z - z > FLY_R) z += 2 * FLY_R
        // Where the land is not lush (sand, rock), they hide underground.
        const live = this.lush(x, z) > 0.35
        p[i * 3] = x
        p[i * 3 + 2] = z
        p[i * 3 + 1] = live ? this.terrain.heightAt(x, z) + 0.4 + (0.5 + 0.5 * Math.sin(this.time * 0.5 + ph)) * 2.2 : -1e4
      }
      ;(this.fly.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
      // The lit ones: the nearest few to you, glowing as they blink (the same blink as the shader's).
      this.flyLights.forEach((l, k) => {
        const i = k * 37 + 5
        const b = Math.sin(this.time * (0.7 + ((this.flyPhase[i] * 0.37) % 1) * 0.8) + this.flyPhase[i])
        const glow = THREE.MathUtils.smoothstep(b, 0.55, 1)
        l.position.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2])
        l.intensity = glow * on * 1.6
      })
    } else for (const l of this.flyLights) l.intensity = 0
    // Butterflies: by day, out of the rain, fluttering where the land is lush.
    const bOn = day * (1 - rain) > 0.3
    this.butter.visible = bOn
    if (bOn) {
      this.butterState.forEach((b, i) => {
        b.a += Math.sin(this.time * 0.9 + b.ph) * 1.6 * dt
        b.x += Math.sin(b.a) * 1.4 * dt
        b.z += Math.cos(b.a) * 1.4 * dt
        if (b.x - camera.x > BUTTER_R) b.x -= 2 * BUTTER_R
        else if (camera.x - b.x > BUTTER_R) b.x += 2 * BUTTER_R
        if (b.z - camera.z > BUTTER_R) b.z -= 2 * BUTTER_R
        else if (camera.z - b.z > BUTTER_R) b.z += 2 * BUTTER_R
        const live = this.lush(b.x, b.z) > 0.35
        const y = live ? this.terrain.heightAt(b.x, b.z) + 0.6 + 0.5 * Math.abs(Math.sin(this.time * 1.3 + b.ph)) : -1e4
        const flap = Math.sin(this.time * 18 + b.ph * 7) * 1.1
        _q.setFromAxisAngle(_up, b.a)
        // Two wings fold together: squash x by the flap (cheap: one matrix per butterfly).
        _s.set(Math.max(0.15, Math.abs(Math.cos(flap))), 1, 1)
        _m.compose(_p.set(b.x, y, b.z), _q, _s)
        this.butter.setMatrixAt(i, _m)
      })
      this.butter.instanceMatrix.needsUpdate = true
    }
    // Circlers: four big birds round each giant's head, slow, on tilted rings.
    let k = 0
    for (const h of heads) {
      for (let j = 0; j < 4 && k < 24; j++, k++) {
        const r = h.H * (0.22 + j * 0.06)
        const a = this.time * (0.18 - j * 0.02) + j * 1.7 + h.at.x * 0.001
        const x = h.at.x + Math.cos(a) * r
        const z = h.at.z + Math.sin(a) * r
        const y = h.at.y + h.H * (0.04 + 0.03 * Math.sin(a * 2 + j))
        const flap = Math.sin(this.time * 3 + j) > 0.85 ? 0.35 : 0
        _q.setFromEuler(new THREE.Euler(flap, -a, 0.25))
        const sz = Math.max(1, h.H / 300) * 1.4
        _m.compose(_p.set(x, y, z), _q, _s.set(sz, sz, sz))
        this.circlers.setMatrixAt(k, _m)
      }
    }
    this.circlers.count = k
    this.circlers.instanceMatrix.needsUpdate = true
  }
}

/** A small hare, about 45 cm long, facing +z: brown-grey, a white scut, tall ears. */
function mergeHare(): THREE.BufferGeometry {
  const parts: Array<[THREE.BufferGeometry, number]> = [
    [new THREE.SphereGeometry(0.13, 10, 8).scale(1, 0.95, 1.55).translate(0, 0.15, -0.02), 0x7b6650],
    [new THREE.SphereGeometry(0.075, 8, 6).scale(0.9, 1, 1.2).translate(0, 0.27, 0.19), 0x7b6650],
    [new THREE.CapsuleGeometry(0.018, 0.13, 3, 6).rotateX(-0.3).translate(-0.03, 0.4, 0.15), 0x6d5944],
    [new THREE.CapsuleGeometry(0.018, 0.13, 3, 6).rotateX(-0.3).translate(0.03, 0.4, 0.15), 0x6d5944],
    [new THREE.SphereGeometry(0.04, 6, 5).translate(0, 0.17, -0.22), 0xece6da],
  ]
  let n = 0
  const ni = parts.map(([g, c]) => {
    const t = g.index ? g.toNonIndexed() : g
    n += t.getAttribute('position').count
    return [t, c] as const
  })
  const pos = new Float32Array(n * 3)
  const nrm = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  let o = 0
  const c = new THREE.Color()
  for (const [g, hex] of ni) {
    const k = g.getAttribute('position').count
    pos.set(g.getAttribute('position').array as Float32Array, o * 3)
    nrm.set(g.getAttribute('normal').array as Float32Array, o * 3)
    c.set(hex)
    for (let i = 0; i < k; i++) col.set([c.r, c.g, c.b], (o + i) * 3)
    o += k
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  out.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return out
}
