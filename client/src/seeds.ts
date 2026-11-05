// Wind-carried seeds (user's pick #5, 2026-11-05): out on the Green, here and there a meadow lets
// go of its seed — a long river of white tufts that lifts off the grass and climbs away on the
// west wind, a few hundred metres downwind and a hundred up before it thins out. From afar it is
// a line of glitter against the sun; close, a slow storm of tufts all round you. Glide into one
// and its air takes the cloak: you are lifted along it, and a flat land you could not climb into
// the sky from gives you the sky.
//
// One draw call: every tuft is a point placed on its river's path in the vertex shader (the paths
// sit in a small float texture, 32 points each). The lift is worked out against the same paths.

import * as THREE from 'three'
import { mulberry32, PIT, inHall, DELL } from '@titans/shared'

const NS = 8
const NP = 32
const PER = 1400
/** The wind the seeds go with (the weather's: from the west-south-west). */
const WIND = new THREE.Vector2(1, 0.4).normalize()

export interface SeedRiver {
  /** Path points (world), NP of them, start (on the grass) to end (high, thinning). */
  pts: THREE.Vector3[]
  /** Bounds (x0, z0, x1, z1), grown by the widest the river gets. */
  box: [number, number, number, number]
  len: number
}

/** The tube's radius `s` (0 … 1) along a river: tight where it lifts off, spreading as it goes. */
function radius(s: number): number {
  return 3 + 13 * s
}

const vert = /* glsl */ `
precision highp sampler2D;
uniform sampler2D tPath;
uniform float uTime;
uniform vec3 uCam;
uniform vec3 uSun;
uniform vec3 uSunCol;
uniform vec3 uAmb;
uniform float uPx;
uniform float uShow;
uniform vec4 uLen0;
uniform vec4 uLen1;
attribute vec4 aP;
attribute vec2 aQ;
varying vec4 vCol;

vec3 pathAt(int river, float s) {
  float f = s * ${(NP - 1).toFixed(1)};
  int i = int(min(floor(f), ${(NP - 2).toFixed(1)}));
  vec3 a = texelFetch(tPath, ivec2(i, river), 0).xyz;
  vec3 b = texelFetch(tPath, ivec2(i + 1, river), 0).xyz;
  return mix(a, b, f - float(i));
}

void main() {
  int river = int(aP.x + 0.5);
  float len = river < 4 ? uLen0[river] : uLen1[river - 4];
  // Along the river at a few metres a second (the slow ones a little slower), round and round.
  float speed = (3.2 + 2.2 * aQ.y) / len;
  float s = fract(aP.y + uTime * speed);
  vec3 c = pathAt(river, s);
  vec3 ahead = pathAt(river, min(s + 0.02, 1.0)) - pathAt(river, max(s - 0.02, 0.0));
  vec3 t = normalize(ahead);
  vec3 side = normalize(cross(t, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(side, t);
  // Turning slowly round the river's line, out a little and back.
  float ang = aP.z * 6.2832 + uTime * (0.25 + 0.3 * aQ.x) * (aQ.y > 0.5 ? 1.0 : -1.0);
  float r = ${radius(0).toFixed(1)} + ${(radius(1) - radius(0)).toFixed(1)} * s;
  r *= sqrt(aP.w) * (0.85 + 0.15 * sin(uTime * 0.7 + aP.w * 40.0));
  vec3 p = c + (side * cos(ang) + up * sin(ang) * 0.7) * r;
  // A bob, so they tumble rather than slide.
  p.y += 0.6 * sin(uTime * (0.9 + aQ.x) + aP.z * 30.0);
  vec3 rel = p - uCam;
  float d = length(rel);
  // Lift off the grass, thin out at the far end.
  float a = smoothstep(0.0, 0.06, s) * (1.0 - smoothstep(0.78, 1.0, s)) * uShow;
  a *= 1.0 - smoothstep(1400.0, 1900.0, d);
  if (a < 0.002) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float px = (0.3 + 0.25 * aQ.x) * uPx / max(-mv.z, 0.1);
  // Sub-pixel far off: one pixel, fainter, so the river reads as a haze of glints, not a crawl.
  a *= max(min(1.0, px * px), 0.45) * smoothstep(0.5, 2.0, d);
  gl_PointSize = clamp(px, 1.0, 64.0);
  // Lit like the air's motes: far brighter between you and the sun.
  float g = max(dot(rel / max(d, 0.1), uSun), 0.0);
  float glow = 1.1 + 1.2 * pow(g, 3.0) + 3.2 * pow(g, 20.0);
  vCol = vec4(vec3(1.0, 0.985, 0.95) * (uAmb + uSunCol * glow), a * 0.92);
}
`

const frag = /* glsl */ `
varying vec4 vCol;
void main() {
  // A tuft: a soft core with a fainter fuzz round it.
  float r = length(gl_PointCoord - 0.5);
  float a = vCol.a * (0.55 * (1.0 - smoothstep(0.05, 0.22, r)) + 0.45 * (1.0 - smoothstep(0.15, 0.5, r)));
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol.rgb, a);
}
`

export class Seeds {
  readonly points: THREE.Points
  readonly rivers: SeedRiver[] = []
  private readonly u: Record<string, THREE.IUniform>
  private time = 0
  /** The last lift worked out (0 … 1 of full), for the sound and tools. */
  lastK = 0
  private show = 1

  constructor(seed: number, heightAt: (x: number, z: number) => number, open: (x: number, z: number) => number) {
    const rand = mulberry32(seed + 9071)
    const starts: Array<[number, number]> = []
    for (let tries = 0; tries < 4000 && this.rivers.length < NS; tries++) {
      const a = rand() * Math.PI * 2
      const d = 900 + rand() * 4600
      const x = Math.sin(a) * d
      const z = Math.cos(a) * d
      if (open(x, z) < 0.85) continue
      if (inHall(x, z, 300) || Math.hypot(x - PIT.x, z - PIT.z) < 400 || Math.hypot(x - DELL.x, z - DELL.z) < 700) continue
      if (starts.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 1100)) continue
      // A meadow, not a slope: and the whole run must stay out on the Green.
      const sl = Math.hypot(heightAt(x + 4, z) - heightAt(x - 4, z), heightAt(x, z + 4) - heightAt(x, z - 4)) / 8
      if (sl > 0.12) continue
      const turn = (rand() - 0.5) * 0.6
      const dx = WIND.x * Math.cos(turn) - WIND.y * Math.sin(turn)
      const dz = WIND.x * Math.sin(turn) + WIND.y * Math.cos(turn)
      const len = 460 + rand() * 220
      if (open(x + dx * len, z + dz * len) < 0.6) continue
      starts.push([x, z])
      const amp = 18 + rand() * 30
      const ph = rand() * 6.28
      const top = 80 + rand() * 40
      const pts: THREE.Vector3[] = []
      for (let i = 0; i < NP; i++) {
        const s = i / (NP - 1)
        // Meandering a little across the wind, more as it goes.
        const off = amp * Math.sin(s * Math.PI * 1.4 + ph) * s
        const px = x + dx * len * s - dz * off
        const pz = z + dz * len * s + dx * off
        // Lifting off steeply, then levelling out high up.
        const h = 1.5 + top * (1 - (1 - Math.min(1, s / 0.8)) ** 2)
        pts.push(new THREE.Vector3(px, heightAt(px, pz) + h, pz))
      }
      // Smooth the line over the ground's bumps (it is air, not a carpet), never into the ground.
      for (let pass = 0; pass < 3; pass++)
        for (let i = 1; i < NP - 1; i++) {
          const p = pts[i]
          p.y = Math.max((pts[i - 1].y + 2 * p.y + pts[i + 1].y) / 4, heightAt(p.x, p.z) + 1.5 + 6 * (i / (NP - 1)))
        }
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
      for (const p of pts) {
        x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z)
      }
      const g = radius(1) * 1.5
      this.rivers.push({ pts, box: [x0 - g, z0 - g, x1 + g, z1 + g], len })
    }

    const data = new Float32Array(NP * NS * 4)
    this.rivers.forEach((r, j) => r.pts.forEach((p, i) => data.set([p.x, p.y, p.z, 1], (j * NP + i) * 4)))
    const tex = new THREE.DataTexture(data, NP, NS, THREE.RGBAFormat, THREE.FloatType)
    tex.needsUpdate = true

    const n = PER * this.rivers.length
    const aP = new Float32Array(n * 4)
    const aQ = new Float32Array(n * 2)
    const r2 = mulberry32(seed + 9072)
    for (let i = 0; i < n; i++) {
      aP.set([Math.floor(i / PER), r2(), r2(), r2()], i * 4)
      aQ.set([r2(), r2()], i * 2)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    geo.setAttribute('aP', new THREE.BufferAttribute(aP, 4))
    geo.setAttribute('aQ', new THREE.BufferAttribute(aQ, 2))
    const lens = this.rivers.map((r) => r.len).concat([1, 1, 1, 1, 1, 1, 1, 1])
    this.u = {
      tPath: { value: tex },
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uSun: { value: new THREE.Vector3() },
      uSunCol: { value: new THREE.Color() },
      uAmb: { value: new THREE.Color() },
      uPx: { value: 500 },
      uShow: { value: 1 },
      uLen0: { value: new THREE.Vector4(lens[0], lens[1], lens[2], lens[3]) },
      uLen1: { value: new THREE.Vector4(lens[4], lens[5], lens[6], lens[7]) },
    }
    const m = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false })
    this.points = new THREE.Points(geo, m)
    this.points.frustumCulled = false
    this.points.renderOrder = 3
    this.points.visible = this.rivers.length > 0
  }

  /**
   * How much a river's air lifts you at `p`: 0 … 1 of full (full in its core, nothing a little
   * past its edge), and the river's way there in `dir` (unit, horizontal).
   */
  liftAt(p: THREE.Vector3, dir?: THREE.Vector2): number {
    // (No seeds flying — in rain — no river.)
    if (this.show < 0.3) return 0
    let best = 0
    for (const r of this.rivers) {
      const [x0, z0, x1, z1] = r.box
      if (p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1) continue
      const pts = r.pts
      for (let i = 0; i < NP - 1; i++) {
        const a = pts[i]
        const b = pts[i + 1]
        const ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z
        const l2 = ex * ex + ey * ey + ez * ez
        let t = ((p.x - a.x) * ex + (p.y - a.y) * ey + (p.z - a.z) * ez) / l2
        t = Math.max(0, Math.min(1, t))
        const dx = a.x + ex * t - p.x, dy = a.y + ey * t - p.y, dz = a.z + ez * t - p.z
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
        const s = (i + t) / (NP - 1)
        const R = radius(s)
        if (d > R * 1.4) continue
        // Full in the core, easing off past the edge; nothing where it lifts off the grass or thins out.
        const k = (1 - THREE.MathUtils.smoothstep(d, R * 0.7, R * 1.4)) * THREE.MathUtils.smoothstep(s, 0.0, 0.04) * (1 - THREE.MathUtils.smoothstep(s, 0.82, 1))
        if (k > best) {
          best = k
          if (dir) dir.set(ex, ez).normalize()
        }
      }
    }
    return best * this.show
  }

  update(dt: number, camera: THREE.PerspectiveCamera, viewH: number, sun: THREE.DirectionalLight, sunDir: THREE.Vector3, fog: THREE.Color, day: number, show: number): void {
    this.time += dt
    const u = this.u
    u.uTime.value = this.time
    ;(u.uCam.value as THREE.Vector3).copy(camera.position)
    ;(u.uSun.value as THREE.Vector3).copy(sunDir)
    // (Lit as the air's motes are, so the two read as one air.)
    ;(u.uSunCol.value as THREE.Color).copy(sun.color).multiplyScalar((sun.intensity / 3) * day)
    ;(u.uAmb.value as THREE.Color).copy(fog).multiplyScalar(0.6)
    u.uPx.value = viewH * 0.5 * camera.projectionMatrix.elements[5]
    u.uShow.value = show
    this.show = show
    this.points.visible = show > 0.01 && this.rivers.length > 0
  }
}
