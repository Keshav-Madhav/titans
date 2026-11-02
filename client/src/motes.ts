// The air itself, per land (CHECKLIST A1: "dust in the Dune Sea, mist in the
// Wood"): a box of tiny things drifting round the camera, wrapped so it never
// runs out, one draw call.
//
//   sand     — the Dune Sea: fine grit streaming low with the wind
//   spores   — the Old Wood: slow motes hanging in the light
//   seeds    — the Green: a few seed tufts carried along on the breeze
//   drifts   — the Dune Sea again: soft low sheets of blown sand racing over it
//
// All of them light up when they are between you and the sun (forward
// scattering), which is most of the look: dust only shows against the light.

import * as THREE from 'three'
import { mulberry32 } from '@titans/shared'

const COUNTS = [1400, 700, 320, 300]
/** The box round the camera (metres): wide, and lower than it is wide. */
const BOX = new THREE.Vector3(56, 22, 56)

const vert = /* glsl */ `
attribute vec4 aSeed;
attribute float aKind;
uniform vec3 uCam;
uniform vec3 uBox;
uniform float uTime;
uniform vec4 uDensity;
uniform vec3 uWind;
uniform float uWindK;
uniform vec3 uSun;
uniform vec3 uSunCol;
uniform vec3 uAmb;
uniform float uPx;
/** The ground under the camera, relative to it. */
uniform float uFloor;
varying vec4 vCol;

void main() {
  int k = int(aKind + 0.5);
  float dens = k == 0 || k == 3 ? uDensity.x : k == 1 ? uDensity.y : uDensity.z;
  if (aSeed.w >= dens) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float t = uTime;
  float s = aSeed.w * 61.0;
  vec3 drift;
  vec3 base;
  float size;
  if (k == 0) {
    // Grit: fast along the wind, skipping a little.
    drift = uWind * t * (3.0 + 12.0 * uWindK) * (0.7 + 0.6 * aSeed.x) + vec3(0.0, 0.35 * sin(t * 3.1 + s), 0.0);
    base = vec3(0.6, 0.45, 0.3);
    size = 0.06;
  } else if (k == 1) {
    // Spores: hang, turn slowly, rise a little.
    drift = vec3(2.0 * sin(t * 0.13 + s), 1.4 * sin(t * 0.21 + s * 1.7) + t * 0.06, 2.0 * cos(t * 0.11 + s * 2.3)) + uWind * t * 0.35;
    base = vec3(1.0, 0.93, 0.78);
    size = 0.05;
  } else if (k == 2) {
    // Seed tufts: carried along, bobbing.
    drift = uWind * t * (1.4 + 3.0 * uWindK) + vec3(1.2 * sin(t * 0.5 + s), 0.8 * sin(t * 0.37 + s * 1.3), 1.2 * cos(t * 0.43 + s * 0.7));
    base = vec3(1.0, 0.98, 0.94);
    size = 0.2;
  } else {
    // A sheet of blown sand: big, faint, fast, hugging the ground.
    drift = uWind * t * (4.0 + 18.0 * uWindK) * (0.8 + 0.4 * aSeed.x);
    base = vec3(0.88, 0.74, 0.56);
    size = 2.6 + 2.0 * aSeed.y;
  }
  vec3 rel = mod(aSeed.xyz * uBox + drift - uCam + 0.5 * uBox, uBox) - 0.5 * uBox;
  // Grit and flies keep low: a layer a few metres deep lying on the ground.
  if (k == 0) rel.y = uFloor + (rel.y / uBox.y + 0.5) * (rel.y / uBox.y + 0.5) * 5.0;
  if (k == 3) rel.y = uFloor + 0.3 + (rel.y / uBox.y + 0.5) * 1.1;
  vec4 mv = viewMatrix * vec4(uCam + rel, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = length(rel);
  // Gone near the edge of the box (so it never shows) and right at the lens.
  float fade = (1.0 - smoothstep(0.28 * uBox.x, 0.5 * uBox.x, d)) * smoothstep(k == 3 ? 3.0 : 0.6, k == 3 ? 9.0 : 2.2, d);
  float px = size * uPx / max(-mv.z, 0.1);
  // Smaller than a pixel: draw a pixel, fainter, so they do not crawl.
  float a = fade * min(1.0, px * px);
  gl_PointSize = clamp(px, 1.0, 256.0);
  // Lit by the sun from the side, and far brighter between you and it
  // (forward scattering: dust only really shows against the light).
  float g = max(dot(normalize(rel), uSun), 0.0);
  float glow = 0.55 + 0.9 * pow(g, 3.0) + 3.0 * pow(g, 24.0);
  vec3 col = base * (uAmb + uSunCol * glow);
  if (k == 0) {
    // A grain in three turns to the sun as it tumbles: a glint.
    float spin = pow(max(sin(t * (7.0 + 9.0 * aSeed.y) + s * 5.0), 0.0), 18.0) * step(0.66, fract(s));
    col += uSunCol * spin * 2.2;
    a *= 0.75;
  } else if (k == 3) {
    // A sheet lying low over the sand: seen edge-on it shows, from above you would look down
    // through the whole layer of them at once (looking down at your feet, the dunes went white).
    float steep = abs(rel.y) / max(d, 0.1);
    a *= 0.075 * (1.0 - 0.9 * smoothstep(0.12, 0.45, steep));
  } else {
    a *= k == 1 ? 0.75 : 0.9;
  }
  vCol = vec4(col, a);
}
`

const frag = /* glsl */ `
varying vec4 vCol;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float a = vCol.a * (1.0 - smoothstep(0.18, 0.5, r));
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol.rgb, a);
}
`

export interface AirHere {
  /** 0 … 1 of each land where the camera is. */
  desert: number
  forest: number
  open: number
  /** Height of the camera above the ground (m). */
  above: number
  wind: number
  rain: number
  night: number
  /** Under a roof (the Undercroft): no sun on them. */
  indoors: number
}

export class Motes {
  readonly points: THREE.Points
  private readonly u: Record<string, THREE.IUniform>
  private time = 0
  /** Eased densities (a land's air comes and goes as you walk, never at once). */
  private readonly dens = new THREE.Vector4()

  constructor() {
    const n = COUNTS.reduce((a, b) => a + b, 0)
    const seed = new Float32Array(n * 4)
    const kind = new Float32Array(n)
    const rand = mulberry32(4401)
    let i = 0
    COUNTS.forEach((c, k) => {
      for (let j = 0; j < c; j++, i++) {
        seed.set([rand(), rand(), rand(), rand()], i * 4)
        kind[i] = k
      }
    })
    const g = new THREE.BufferGeometry()
    // Positions are made in the shader; three still wants an attribute to count.
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4))
    g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1))
    this.u = {
      uCam: { value: new THREE.Vector3() },
      uBox: { value: BOX.clone() },
      uTime: { value: 0 },
      uDensity: { value: new THREE.Vector4() },
      uWind: { value: new THREE.Vector3(1, 0, 0.4).normalize() },
      uWindK: { value: 0 },
      uSun: { value: new THREE.Vector3() },
      uSunCol: { value: new THREE.Color() },
      uAmb: { value: new THREE.Color() },
      uPx: { value: 500 },
      uFloor: { value: -2 },
    }
    const m = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
    })
    this.points = new THREE.Points(g, m)
    this.points.frustumCulled = false
    this.points.renderOrder = 3
  }

  /** How many of each kind are showing now (0 … 1), for tools. */
  get density(): THREE.Vector4 {
    return this.dens
  }

  update(dt: number, camera: THREE.PerspectiveCamera, viewH: number, sun: THREE.DirectionalLight, sunDir: THREE.Vector3, fog: THREE.Color, air: AirHere): void {
    this.time += dt
    const low = 1 - THREE.MathUtils.smoothstep(air.above, 6, 40)
    const dry = 1 - air.rain
    const day = 1 - air.night
    const want = new THREE.Vector4(
      air.desert * low * dry * (0.3 + 0.7 * air.wind),
      air.forest * dry * (0.35 + 0.65 * day) * (1 - 0.6 * air.indoors),
      air.open * (1 - air.desert) * dry * day * (0.4 + 0.6 * air.wind) * 0.8,
      0,
    )
    // A land's air eases in over a few seconds.
    const e = 1 - Math.exp(-dt * 0.6)
    this.dens.lerp(want, e)
    const u = this.u
    u.uTime.value = this.time
    ;(u.uCam.value as THREE.Vector3).copy(camera.position)
    ;(u.uDensity.value as THREE.Vector4).copy(this.dens)
    u.uWindK.value = air.wind
    ;(u.uSun.value as THREE.Vector3).copy(sunDir)
    const sc = u.uSunCol.value as THREE.Color
    sc.copy(sun.color).multiplyScalar((sun.intensity / 3) * day * (1 - air.indoors))
    ;(u.uAmb.value as THREE.Color).copy(fog).multiplyScalar(0.35)
    u.uFloor.value = -air.above
    u.uPx.value = viewH * 0.5 * camera.projectionMatrix.elements[5]
    this.points.visible = this.dens.x + this.dens.y + this.dens.z > 0.003
  }
}
