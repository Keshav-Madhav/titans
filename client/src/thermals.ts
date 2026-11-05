// Thermals (user, 2026-11-05: "thermals i like"): over the Dune Sea's sun-baked flats, here and
// there, a column of rising air. By day you can find one by what it carries: a dust devil twisting
// up off the sand at its foot, and high above, a few birds turning in slow circles without a wing
// beat. Glide into it and circle, and it takes you up — hundreds of metres, as high as the birds.
// Gone at night (the sand cools) and in rain.
//
// One draw call: every grain of every devil and every bird is a point placed in the vertex shader.

import * as THREE from 'three'
import { mulberry32 } from '@titans/shared'

const N = 9
const DUST = 160
const BIRDS = 4
/** The column: full lift within CORE of its middle, none past EDGE; up to TOP above the ground. */
const CORE = 40
const EDGE = 85
const TOP = 650
const LIFT = 9

export interface Thermal {
  x: number
  z: number
  ground: number
  phase: number
}

const vert = /* glsl */ `
attribute vec4 aP;
attribute float aKind;
uniform vec4 uCol[${N}];
uniform float uTime;
uniform vec3 uCam;
uniform float uPx;
uniform float uShow;
uniform vec3 uSun;
uniform vec3 uSunCol;
uniform vec3 uAmb;
varying vec4 vCol;
varying float vBird;
varying float vFlap;
void main() {
  vec4 c = uCol[int(aP.x + 0.5)];
  vec3 p;
  float size;
  float a = 0.0;
  vBird = aKind;
  if (aKind < 0.5) {
    // A grain in the devil: up the twisting column, wider as it rises, round again.
    // (Most of it low: a devil is a thick twist at the sand that frays out above.)
    float t = pow(fract(aP.y + uTime * (0.07 + 0.04 * aP.w)), 1.7);
    float r = 0.8 + 6.5 * pow(t, 1.3) * (0.55 + 0.45 * aP.w);
    float ang = aP.z * 6.2832 + uTime * (3.2 - 1.6 * t) + c.w;
    // (The devil wanders a little over the sand.)
    vec2 drift = vec2(sin(uTime * 0.11 + c.w), cos(uTime * 0.09 + c.w * 1.3)) * 6.0;
    p = vec3(c.x + drift.x + cos(ang) * r, c.y + t * 34.0, c.z + drift.y + sin(ang) * r);
    // Big soft puffs that overlap into a veil (small dots read as a spray of beads in the air).
    size = (3.0 + 5.0 * t) * (0.7 + 0.6 * aP.w);
    a = 0.34 * smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.4, 1.0, t));
  } else {
    // A bird, circling high in it without a wing beat (most of the time).
    float h = 140.0 + aP.z * 150.0;
    float rr = 24.0 + aP.w * 22.0;
    float ang = aP.y * 6.2832 + uTime * (0.16 + 0.06 * aP.w) * (aP.z > 0.5 ? 1.0 : -1.0);
    p = vec3(c.x + cos(ang) * rr, c.y + h + sin(uTime * 0.3 + aP.y * 9.0) * 4.0, c.z + sin(ang) * rr);
    size = 1.8;
    a = 0.9;
    vFlap = pow(max(sin(uTime * 0.7 + aP.y * 17.0), 0.0), 30.0);
  }
  vec3 rel = p - uCam;
  float d = length(rel);
  a *= uShow * (1.0 - smoothstep(aKind < 0.5 ? 900.0 : 2400.0, aKind < 0.5 ? 1300.0 : 3000.0, d));
  if (a < 0.003) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float px = size * uPx / max(-mv.z, 0.1);
  // (A bird stays a speck far off — the speck is how you find the air; dust thins to haze.)
  gl_PointSize = clamp(px, aKind < 0.5 ? 1.0 : 2.5, 320.0);
  if (aKind < 0.5) a *= min(1.0, px * px);
  float g = max(dot(rel / max(d, 0.1), uSun), 0.0);
  vec3 col = aKind < 0.5 ? vec3(0.6, 0.46, 0.33) * (uAmb + uSunCol * (0.7 + 1.4 * pow(g, 4.0))) : vec3(0.07, 0.065, 0.06) + uAmb * 0.08;
  vCol = vec4(col, a);
}
`
const frag = /* glsl */ `
varying vec4 vCol;
varying float vBird;
varying float vFlap;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float a;
  if (vBird > 0.5) {
    // A shallow V (wings held out, the tips a little up; a beat now and then lifts them).
    float wing = abs(q.x) * (0.55 + 0.6 * vFlap);
    float line = abs(-q.y - wing + 0.04);
    a = (1.0 - smoothstep(0.035, 0.07, line)) * step(abs(q.x), 0.46);
  } else {
    float r = length(q);
    a = exp(-r * r * 14.0) * (1.0 - smoothstep(0.4, 0.5, r));
  }
  a *= vCol.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol.rgb, a);
}
`

export class Thermals {
  readonly points: THREE.Points
  readonly cols: Thermal[] = []
  private readonly u: Record<string, THREE.IUniform>
  private time = 0
  private show = 0
  /** The last lift worked out (0 … 1), for the sound and tools. */
  lastK = 0

  constructor(seed: number, heightAt: (x: number, z: number) => number, desert: (x: number, z: number) => number, blocked: (x: number, z: number) => boolean) {
    const rand = mulberry32(seed + 7101)
    for (let i = 0; i < 6000 && this.cols.length < N; i++) {
      const a = rand() * Math.PI * 2
      const d = 2000 + rand() * 8500
      const x = Math.sin(a) * d
      const z = Math.cos(a) * d
      if (desert(x, z) < 0.85 || this.cols.some((c) => Math.hypot(c.x - x, c.z - z) < 900)) continue
      // Open, level-ish sand (a devil wanders over it).
      const h = heightAt(x, z)
      let ok = !blocked(x, z)
      for (let k = 0; k < 6 && ok; k++) ok = Math.abs(heightAt(x + Math.cos(k) * 20, z + Math.sin(k) * 20) - h) < 4
      if (!ok) continue
      this.cols.push({ x, z, ground: h, phase: rand() * 6.28 })
    }
    const per = DUST + BIRDS
    const n = per * this.cols.length
    const aP = new Float32Array(n * 4)
    const aKind = new Float32Array(n)
    const r2 = mulberry32(seed + 7102)
    for (let j = 0; j < this.cols.length; j++)
      for (let i = 0; i < per; i++) {
        const o = j * per + i
        aP.set([j, r2(), r2(), r2()], o * 4)
        aKind[o] = i < DUST ? 0 : 1
      }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    geo.setAttribute('aP', new THREE.BufferAttribute(aP, 4))
    geo.setAttribute('aKind', new THREE.BufferAttribute(aKind, 1))
    const cols = Array.from({ length: N }, (_, j) => {
      const c = this.cols[j]
      return c ? new THREE.Vector4(c.x, c.ground, c.z, c.phase) : new THREE.Vector4(0, -1e5, 0, 0)
    })
    this.u = {
      uCol: { value: cols },
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uPx: { value: 500 },
      uShow: { value: 0 },
      uSun: { value: new THREE.Vector3() },
      uSunCol: { value: new THREE.Color() },
      uAmb: { value: new THREE.Color() },
    }
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false }))
    this.points.frustumCulled = false
    this.points.renderOrder = 3
  }

  /** The lift at `p` (m/s): strong in the column's middle, easing off at its edge and near its top. */
  liftAt(p: THREE.Vector3): number {
    if (this.show < 0.2) return (this.lastK = 0)
    let best = 0
    for (const c of this.cols) {
      const d = Math.hypot(p.x - c.x, p.z - c.z)
      if (d > EDGE) continue
      const agl = p.y - c.ground
      const k = (1 - THREE.MathUtils.smoothstep(d, CORE, EDGE)) * (1 - THREE.MathUtils.smoothstep(agl, TOP * 0.7, TOP)) * THREE.MathUtils.smoothstep(agl, 2, 12)
      best = Math.max(best, k)
    }
    this.lastK = best * this.show
    return LIFT * this.lastK
  }

  /** `day` 0 … 1 (and strongest round midday), `rain` 0 … 1. */
  update(dt: number, camera: THREE.PerspectiveCamera, viewH: number, sun: THREE.DirectionalLight, sunDir: THREE.Vector3, fog: THREE.Color, day: number, rain: number): void {
    this.time += dt
    const want = THREE.MathUtils.smoothstep(day, 0.3, 0.8) * (1 - rain)
    this.show += (want - this.show) * Math.min(1, dt * 0.2)
    const u = this.u
    u.uTime.value = this.time
    u.uShow.value = this.show
    ;(u.uCam.value as THREE.Vector3).copy(camera.position)
    ;(u.uSun.value as THREE.Vector3).copy(sunDir)
    ;(u.uSunCol.value as THREE.Color).copy(sun.color).multiplyScalar((sun.intensity / 3) * day)
    ;(u.uAmb.value as THREE.Color).copy(fog).multiplyScalar(0.6)
    u.uPx.value = viewH * 0.5 * camera.projectionMatrix.elements[5]
    this.points.visible = this.show > 0.01 && this.cols.length > 0
  }
}
