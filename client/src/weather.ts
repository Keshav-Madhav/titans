// Weather: the mood of the world. Not a hazard — nothing here hurts you —
// but the thing that makes the giants frightening. Most of the time a low,
// heavy cloud deck hangs over the land, and anything tall enough goes up into
// it: a giant's head, the Sentinel's hood, the pillars, the striders. Storms
// roll in, with rain and lightning flickering inside the cloud; then the
// cloud breaks and shafts of sun come down through the gaps.
//
//   overcast → storm → breaking → overcast …   (and, now and then, clear)
//
// Each state is a set of numbers (cover, darkness, rain, fog, wind, rays);
// the world eases between them over a minute. The cloud deck is a stack of
// noise layers following the camera; light, sky, fog and the grade follow
// the numbers; rain falls entirely on the GPU.

import * as THREE from 'three'
import { HALL, mulberry32 } from '@titans/shared'
import type { SkySystem } from './sky'
import type { Post } from './post'

export type WeatherName = 'clear' | 'overcast' | 'storm' | 'breaking'

interface State {
  /** How much of the sky the cloud deck covers (0 … 1). */
  cover: number
  /** How dark and grey the light is. */
  dark: number
  rain: number
  /** Fog density, as a multiple of the clear day's. */
  fog: number
  wind: number
  /** How strongly the sun's shafts come through. */
  rays: number
}

const PRESETS: Record<WeatherName, State> = {
  clear: { cover: 0.22, dark: 0, rain: 0, fog: 1, wind: 0.3, rays: 0.6 },
  overcast: { cover: 0.8, dark: 0.55, rain: 0, fog: 2.2, wind: 0.5, rays: 0.25 },
  storm: { cover: 0.97, dark: 0.85, rain: 1, fog: 3.4, wind: 1, rays: 0.1 },
  breaking: { cover: 0.62, dark: 0.35, rain: 0.05, fog: 1.8, wind: 0.6, rays: 1.4 },
}

/** How long each state holds (seconds), and what follows it. */
const CYCLE: Array<[WeatherName, number]> = [
  ['overcast', 360],
  ['storm', 210],
  ['breaking', 200],
  ['overcast', 300],
  ['clear', 150],
]

/** The cloud deck: its base, and how thick it is. */
export const CLOUD_BASE = 255
const CLOUD_LAYERS = 7
const CLOUD_GAP = 26

/** Tileable value noise, four octaves in four channels. */
function noiseTexture(seed: number): THREE.DataTexture {
  const S = 256
  const rand = mulberry32(seed)
  const data = new Uint8Array(S * S * 4)
  for (let ch = 0; ch < 4; ch++) {
    const cells = 4 << ch
    const grid = new Float32Array(cells * cells).map(() => rand())
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const gx = (x / S) * cells
        const gy = (y / S) * cells
        const x0 = Math.floor(gx)
        const y0 = Math.floor(gy)
        const fx = gx - x0
        const fy = gy - y0
        const sx = fx * fx * (3 - 2 * fx)
        const sy = fy * fy * (3 - 2 * fy)
        const at = (i: number, j: number) => grid[((j + cells) % cells) * cells + ((i + cells) % cells)]
        const v = (at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy
        data[(y * S + x) * 4 + ch] = Math.round(v * 255)
      }
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.needsUpdate = true
  return t
}

export class Weather {
  readonly group = new THREE.Group()
  /** The numbers right now (eased toward the target state). */
  readonly now: State = { ...PRESETS.overcast }
  name: WeatherName = 'overcast'
  private target: State = PRESETS.overcast
  private step = 0
  private left = CYCLE[0][1]
  private readonly uniforms = {
    uTime: { value: 0 },
    uCover: { value: 0.8 },
    uDark: { value: 0.5 },
    uSun: { value: new THREE.Vector3() },
    uFog: { value: new THREE.Color() },
    uFlash: { value: 0 },
    uFlashAt: { value: new THREE.Vector2() },
    uNoise: { value: null as THREE.Texture | null },
    uWind: { value: new THREE.Vector2(1, 0.4) },
  }
  private readonly rainUniforms = { uTime: { value: 0 }, uRain: { value: 0 }, uWind: { value: 0.5 }, uRoof: { value: 0 } }
  private readonly deck: THREE.Mesh[] = []
  private readonly rain: THREE.InstancedMesh
  private flashLeft = 0
  private nextFlash = 6
  private readonly rand = mulberry32(9191)
  /** Called with (distance) when lightning strikes, for the thunder. */
  onLightning: (distance: number) => void = () => {}
  /** Clear-day values the weather scales from. */
  private readonly base: { fog: number; fogColor: THREE.Color; sun: number; fill: number; fillSky: THREE.Color; env: number }

  constructor(
    private readonly sky: SkySystem,
    private readonly post: Post | null,
    private readonly scene: THREE.Scene,
    seed: number,
  ) {
    this.base = {
      fog: sky.fog.density,
      fogColor: sky.fog.color.clone(),
      sun: sky.sun.intensity,
      fill: sky.fill.intensity,
      fillSky: sky.fill.color.clone(),
      env: scene.environmentIntensity,
    }
    this.uniforms.uNoise.value = noiseTexture(seed)
    const geo = new THREE.PlaneGeometry(30000, 30000, 1, 1).rotateX(-Math.PI / 2)
    for (let k = 0; k < CLOUD_LAYERS; k++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { ...this.uniforms, uLayer: { value: k / (CLOUD_LAYERS - 1) } },
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vWorld = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime, uCover, uDark, uLayer, uFlash;
          uniform vec3 uSun, uFog;
          uniform vec2 uFlashAt, uWind;
          uniform sampler2D uNoise;
          varying vec3 vWorld;
          float fbm(vec2 p) {
            return texture2D(uNoise, p).r * 0.5 + texture2D(uNoise, p * 2.03 + 0.31).g * 0.27
              + texture2D(uNoise, p * 4.11 - 0.17).b * 0.15 + texture2D(uNoise, p * 8.3 + 0.7).a * 0.08;
          }
          void main() {
            vec2 p = vWorld.xz * 0.00021 + uWind * uTime * 0.0012 * (0.8 + uLayer * 0.4);
            // Thickest in the middle of the deck, ragged at its base and top.
            float shape = 1.0 - abs(uLayer - 0.45) * 1.3;
            float n = fbm(p) + 0.12 * (texture2D(uNoise, vWorld.xz * 0.0011 + uTime * 0.003).g - 0.5);
            float d = smoothstep(1.0 - uCover, 1.0 - uCover + 0.16, n * (0.78 + 0.32 * shape));
            float dist = distance(vWorld, cameraPosition);
            if (d < 0.01) discard;
            // Dark bellies, paler tops; brighter toward the sun at thin edges.
            vec3 belly = vec3(0.30, 0.33, 0.35) * (1.0 - 0.45 * uDark);
            vec3 top = vec3(0.82, 0.83, 0.84) * (1.0 - 0.35 * uDark);
            vec3 c = mix(belly, top, uLayer * 0.8 + 0.1);
            // Billows: thick cloud darker underneath, thin cloud paler.
            c *= mix(1.15, 0.72, d * (1.0 - uLayer));
            vec3 toCam = normalize(vWorld - cameraPosition);
            float sunward = pow(max(dot(toCam, normalize(uSun)), 0.0), 8.0);
            c += vec3(1.0, 0.93, 0.8) * sunward * (1.0 - d) * 0.9;
            // Lightning inside the cloud.
            c += vec3(0.75, 0.8, 1.0) * uFlash * exp(-distance(vWorld.xz, uFlashAt) / 1400.0) * 2.5;
            // Far away the deck melts into the haze.
            c = mix(c, uFog, smoothstep(2500.0, 12000.0, dist) * 0.85);
            float a = d * 0.42 * (1.0 - smoothstep(10000.0, 14500.0, dist));
            gl_FragColor = vec4(c, a);
          }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      })
      const m = new THREE.Mesh(geo, mat)
      m.frustumCulled = false
      m.renderOrder = 2
      this.deck.push(m)
      this.group.add(m)
    }

    // Rain: streaks in a column round the camera, falling on the GPU.
    const streak = new THREE.PlaneGeometry(0.03, 1.4).translate(0, 0.7, 0)
    const COUNT = 9000
    this.rain = new THREE.InstancedMesh(
      streak,
      new THREE.ShaderMaterial({
        uniforms: this.rainUniforms,
        vertexShader: /* glsl */ `
          uniform float uTime, uRain, uWind, uRoof;
          varying float vA;
          float h(float n) { return fract(sin(n) * 43758.5453); }
          void main() {
            float id = float(gl_InstanceID);
            vec3 o = vec3(h(id) - 0.5, h(id * 1.7 + 3.1), h(id * 2.3 + 7.7) - 0.5) * vec3(140.0, 60.0, 140.0);
            // Fall, and wrap round the camera.
            float y = mod(o.y - uTime * (24.0 + 6.0 * h(id * 3.7)), 60.0) - 20.0;
            // Fixed in the world, wrapped to a 140 m column round the camera.
            vec3 base = vec3(cameraPosition.x + mod(o.x - cameraPosition.x + 70.0, 140.0) - 70.0, cameraPosition.y + y, cameraPosition.z + mod(o.z - cameraPosition.z + 70.0, 140.0) - 70.0);
            // Face the camera about the vertical; lean with the wind.
            vec3 toCam = normalize(vec3(cameraPosition.x - base.x, 0.0, cameraPosition.z - base.z));
            vec3 side = vec3(toCam.z, 0.0, -toCam.x);
            vec3 p = base + side * position.x + vec3(uWind * 0.35, 1.0, 0.0) * position.y;
            vA = (h(id * 5.1) < uRain ? 1.0 : 0.0) * (1.0 - smoothstep(25.0, 70.0, distance(base, cameraPosition)));
            // No rain under the Undercroft's roof.
            vec2 hq = abs(base.xz - vec2(${HALL.x.toFixed(1)}, ${HALL.z.toFixed(1)}));
            if (hq.x < ${HALL.hx.toFixed(1)} && hq.y < ${HALL.hz.toFixed(1)} && base.y < uRoof - 2.0) vA = 0.0;
            gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          varying float vA;
          void main() {
            if (vA < 0.01) discard;
            gl_FragColor = vec4(0.72, 0.77, 0.82, 0.22 * vA);
          }`,
        transparent: true,
        depthWrite: false,
      }),
      COUNT,
    )
    this.rain.frustumCulled = false
    this.rain.renderOrder = 3
    this.group.add(this.rain)
  }

  /** The Undercroft's roof height (rain stops under it). */
  set roof(y: number) {
    this.rainUniforms.uRoof.value = y
  }

  /** Change the weather (instantly for tools, else eased in over a minute). */
  set(name: WeatherName, instant = false): void {
    this.name = name
    this.target = PRESETS[name]
    if (instant) Object.assign(this.now, this.target)
  }

  update(dt: number, camera: THREE.Camera): void {
    // The cycle.
    this.left -= dt
    if (this.left <= 0) {
      this.step = (this.step + 1) % CYCLE.length
      this.left = CYCLE[this.step][1]
      this.set(CYCLE[this.step][0])
    }
    const k = Math.min(1, dt / 45)
    for (const key of Object.keys(this.now) as Array<keyof State>) this.now[key] += (this.target[key] - this.now[key]) * k
    const w = this.now

    // Lightning, in storms: a flicker in the cloud, thunder after.
    this.nextFlash -= dt
    if (w.rain > 0.5 && this.nextFlash <= 0) {
      this.nextFlash = 5 + this.rand() * 14
      this.flashLeft = 0.45
      const a = this.rand() * Math.PI * 2
      const d = 800 + this.rand() * 3500
      this.uniforms.uFlashAt.value.set(camera.position.x + Math.cos(a) * d, camera.position.z + Math.sin(a) * d)
      this.onLightning(d)
    }
    this.flashLeft = Math.max(0, this.flashLeft - dt)
    const t = this.flashLeft
    const flash = t > 0 ? (t > 0.35 ? 1 : t > 0.27 ? 0.15 : t > 0.2 ? 0.8 : t / 0.2 * 0.4) : 0

    const u = this.uniforms
    u.uTime.value += dt
    u.uCover.value = w.cover
    u.uDark.value = w.dark
    u.uSun.value.copy(this.sky.sunDir)
    u.uFlash.value = flash
    u.uWind.value.set(1, 0.4).multiplyScalar(0.5 + w.wind)
    this.deck.forEach((m, i) => m.position.set(camera.position.x, CLOUD_BASE + i * CLOUD_GAP, camera.position.z))
    this.rainUniforms.uTime.value += dt
    this.rainUniforms.uRain.value = w.rain
    this.rainUniforms.uWind.value = w.wind
    this.rain.visible = w.rain > 0.02

    // Light: the sun dims and greys under the cloud; the sky's diffuse light
    // takes over. Lightning lights everything for a moment.
    const sky = this.sky
    const b = this.base
    sky.sun.intensity = b.sun * (1 - 0.82 * w.dark)
    sky.fill.intensity = b.fill * (1 + 0.9 * w.dark) + flash * 2.2
    sky.fill.color.copy(b.fillSky).lerp(new THREE.Color(0.62, 0.68, 0.72), w.dark)
    this.scene.environmentIntensity = b.env * (1 - 0.35 * w.dark)
    sky.fog.density = b.fog * w.fog
    // How much of a tall thing the deck swallows: none in clear air, nearly all in a storm.
    sky.fog.cloud = Math.max(0, Math.min(0.97, (w.cover - 0.3) * 1.45))
    sky.fog.color.copy(b.fogColor).lerp(new THREE.Color(0.37, 0.41, 0.43), w.dark)
    u.uFog.value.copy(sky.fog.color)
    const su = sky.sky.material.uniforms
    su.cloudCoverage.value = 0.32 + 0.6 * w.cover
    su.cloudDensity.value = 0.55 + 0.4 * w.dark
    su.uOvercast.value = w.dark
    // The grade and the sun's shafts.
    if (this.post) {
      const g = this.post.grade.uniforms
      g.mood.value = w.dark
      g.flash.value = flash
      g.rayStrength.value = 0.32 * w.rays
    }
  }
}
