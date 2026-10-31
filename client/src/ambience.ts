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
  private readonly butter: THREE.InstancedMesh
  private readonly butterState: Array<{ x: number; y: number; z: number; a: number; ph: number; hue: number }> = []
  private readonly circlers: THREE.InstancedMesh
  private time = 0
  private readonly rand = mulberry32(8181)

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
          gl_PointSize = (2.0 + 5.0 * vGlow) * clamp(60.0 / -mv.z, 0.6, 3.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOn;
        varying float vGlow;
        void main() {
          float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
          gl_FragColor = vec4(vec3(1.6, 2.4, 0.5) * vGlow * uOn, a * vGlow * uOn);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
    this.fly = new THREE.Points(g, this.flyMat)
    this.fly.frustumCulled = false
    this.group.add(this.fly)

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
  }

  /**
   * Each frame. `dusk` 0 … 1 (fireflies), `day` 0 … 1 and `rain` (butterflies),
   * and the heads to circle (a giant's head, and its height for the size of the circle).
   */
  update(dt: number, camera: THREE.Vector3, dusk: number, day: number, rain: number, heads: Array<{ at: THREE.Vector3; H: number }>): void {
    this.time += dt
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
    }
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
