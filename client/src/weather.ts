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
import { groundShade } from './terrain-material'
import { HALL, mulberry32 } from '@titans/shared'
import type { SkySystem } from './sky'
import type { Post } from './post'
import { soft, SOFT_GLSL } from './soft'

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
  /**
   * The deck's underside (metres). It comes down in a storm until the giants
   * walk with their heads in it and the high ground is lost (the reference
   * images: "getting cut off by storm clouds").
   */
  base: number
}

const PRESETS: Record<WeatherName, State> = {
  clear: { cover: 0.22, dark: 0, rain: 0, fog: 1, wind: 0.3, rays: 0.6, base: 330 },
  overcast: { cover: 0.8, dark: 0.55, rain: 0, fog: 2.2, wind: 0.5, rays: 0.25, base: 250 },
  storm: { cover: 0.97, dark: 0.85, rain: 1, fog: 3.4, wind: 1, rays: 0.1, base: 185 },
  breaking: { cover: 0.62, dark: 0.35, rain: 0.05, fog: 1.8, wind: 0.6, rays: 1.4, base: 275 },
}

/** How long each state holds (seconds), and what follows it. */
const CYCLE: Array<[WeatherName, number]> = [
  ['overcast', 360],
  ['storm', 210],
  ['breaking', 200],
  ['overcast', 300],
  ['clear', 150],
]

/** The sky an awakening opens: the deck thinned to rags, the air clear, the sun through. */
const PARTED: State = { cover: 0.3, dark: 0.2, rain: 0, fog: 1, wind: 0.2, rays: 0.8, base: 340 }

/** The cloud deck: how thick it is (its base moves with the weather: State.base). */
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
    uNight: { value: 0 },
    uSand: { value: 0 },
    uSun: { value: new THREE.Vector3() },
    uFog: { value: new THREE.Color() },
    uFlash: { value: 0 },
    uFlashAt: { value: new THREE.Vector2() },
    uNoise: { value: null as THREE.Texture | null },
    uWind: { value: new THREE.Vector2(1, 0.4) },
  }
  private readonly rainUniforms = { uTime: { value: 0 }, uRain: { value: 0 }, uWind: { value: 0.5 }, uRoof: { value: 0 }, uSand: { value: 0 }, uSnow: { value: 0 }, uNight: { value: 0 } }
  /**
   * How much of where you stand is the Dune Sea (main.ts sets it): there a
   * storm brings no rain but sand — ochre air, grit driven flat by the wind.
   */
  desert = 0
  /** Settings: lightning as a soft glow, not a white flash. */
  softFlash = false
  /** 0 … 1: up on the High Places (it snows there). */
  high = 0
  private readonly shadeDrift = new THREE.Vector2()
  /** 0 … 1: how much of the storm is sand right now. */
  sand = 0
  /** How much of where you stand is the Mire (main.ts sets it): the air there is thick, low and green-grey. */
  mire = 0
  private mireK = 0
  /** Wet air after rain (decays): a rainbow when the sun comes back. */
  private wet = 0
  private readonly rainbow: THREE.Mesh
  readonly deck: THREE.Mesh[] = []
  readonly rain: THREE.InstancedMesh
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
        uniforms: { ...this.uniforms, ...soft, uLayer: { value: k / (CLOUD_LAYERS - 1) } },
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vWorld = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: /* glsl */ `
          #include <packing>
          ${SOFT_GLSL}
          uniform float uTime, uCover, uDark, uLayer, uFlash, uNight, uSand;
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
            c += vec3(1.0, 0.93, 0.8) * sunward * (1.0 - d) * 0.9 * (1.0 - uNight);
            // At night the deck is a dark mass, its thin edges silvered by the moon.
            c = mix(c, vec3(0.05, 0.06, 0.09) + vec3(0.1, 0.12, 0.16) * (1.0 - d), uNight);
            // Lightning inside the cloud.
            c += vec3(0.75, 0.8, 1.0) * uFlash * exp(-distance(vWorld.xz, uFlashAt) / 1400.0) * 2.5;
            // In a sandstorm the deck is the dust itself: ochre, the colour of the air.
            c = mix(c, uFog * (0.85 + 0.3 * uLayer), uSand);
            // Far away the deck melts into the haze.
            c = mix(c, uFog, smoothstep(2500.0, 12000.0, dist) * 0.85);
            float a = d * 0.42 * (1.0 - smoothstep(10000.0, 14500.0, dist));
            // From far above it (the High Places), the deck is a sea of cloud: thicker, and its
            // tops lit — not a thin milky haze over the land.
            float above = smoothstep(120.0, 420.0, cameraPosition.y - vWorld.y);
            a = mix(a, min(1.0, d * 0.95), above * smoothstep(0.15, 0.55, d));
            c = mix(c, c * 1.12 + vec3(0.05), above * uLayer);
            // (Up among the clouds — on a giant's shoulders, in a long glide — a layer at
            // your own height passed edge-on through the view as a hard, flat, see-through
            // panel. A cloud has no surface: each layer thins away as the eye nears its
            // height, and close by.)
            a *= smoothstep(6.0, 60.0, abs(cameraPosition.y - vWorld.y)) * smoothstep(15.0, 160.0, dist);
            // Seen edge-on — toward the horizon, or from up near its height — a sheet's noise smeared
            // into long horizontal bands, its dark belly into dark lines across the whole screen that
            // stayed put as you turned (the deck is level: turning never moves it) — the user,
            // 2026-11-06: "black horizontal blurry lines… at the same position on my screen always
            // no matter where i look". Each sheet thins and greys into the haze as the eye nears its
            // plane; from well above, the sea of cloud stays.
            float graze = abs(toCam.y);
            float face = mix(smoothstep(0.03, 0.22, graze), 1.0, above);
            c = mix(uFog, c, mix(smoothstep(0.02, 0.3, graze), 1.0, above));
            a *= face;
            // Thinning out into whatever it meets (a giant, a cliff): no cut line.
            a *= softFade(60.0, 0.35);
            gl_FragColor = vec4(c, a);
            if (uSoftDebug > 0.5) gl_FragColor = vec4(softDbg(), 1.0);
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
          uniform float uTime, uRain, uWind, uRoof, uSand, uSnow;
          varying float vA;
          varying vec2 vUv;
          float h(float n) { return fract(sin(n) * 43758.5453); }
          void main() {
            float id = float(gl_InstanceID);
            vec3 o = vec3(h(id) - 0.5, h(id * 1.7 + 3.1), h(id * 2.3 + 7.7) - 0.5) * vec3(140.0, 60.0, 140.0);
            // Fall, and wrap round the camera.
            // (Sand: barely falls, low to the ground, and races sideways with the wind.)
            float y = mix(mod(o.y - uTime * (24.0 + 6.0 * h(id * 3.7)), 60.0) - 20.0, mod(o.y * 0.25 - uTime * 1.5, 14.0) - 3.0, uSand);
            // Snow: slow (1–2 m/s), wandering as it falls.
            y = mix(y, mod(o.y - uTime * (1.1 + 0.9 * h(id * 3.7)), 60.0) - 20.0, uSnow);
            o.x += uTime * uSand * (26.0 + 10.0 * h(id * 9.3)) + uSnow * (sin(uTime * 0.7 + id) * 1.5 + uTime * uWind * 2.0);
            o.z += uSnow * cos(uTime * 0.53 + id * 1.7) * 1.5;
            // Fixed in the world, wrapped to a 140 m column round the camera.
            vec3 base = vec3(cameraPosition.x + mod(o.x - cameraPosition.x + 70.0, 140.0) - 70.0, cameraPosition.y + y, cameraPosition.z + mod(o.z - cameraPosition.z + 70.0, 140.0) - 70.0);
            // Face the camera about the vertical; lean with the wind.
            vec3 toCam = normalize(vec3(cameraPosition.x - base.x, 0.0, cameraPosition.z - base.z));
            vec3 side = vec3(toCam.z, 0.0, -toCam.x);
            // (Sand: a short, wide, soft wisp — drawn as rain's thin 2 m streak laid flat, it read
            // as white wires scratched across the screen.)
            vec3 p = base + side * position.x * mix(1.0, 5.0, uSand) + mix(vec3(uWind * 0.35, 1.0, 0.0), vec3(0.9, 0.08, 0.12), uSand) * position.y;
            // (A flake: a small square card, not a streak.)
            p = mix(p, base + side * position.x * 8.0 + vec3(0.0, position.y * 0.09, 0.0), uSnow);
            vUv = uv;
            // (Faded out right at the lens too: a 1.4 m streak passing half a metre from the camera
            // was a long white bar slashed across the whole frame.)
            // (Rain from 3 m out, full by 7.5: within a few metres a streak was a thick white bar across
            // the view — storm tour, 2026-11-07.)
            float dc = distance(base + vec3(0.0, 0.7, 0.0), cameraPosition);
            // (Sand wisps only near: far off, a few pixels each, they rendered as rows of dark
            // dashes over a cliff. The ochre fog carries the storm out there.)
            vA = (h(id * 5.1) < uRain ? 1.0 : 0.0) * (1.0 - smoothstep(mix(25.0, 10.0, uSand), mix(70.0, 25.0, uSand), dc)) * smoothstep(mix(3.0, 2.0, max(uSand, uSnow)), mix(7.5, 6.0, max(uSand, uSnow)), dc);
            // No rain under the Undercroft's roof.
            vec2 hq = abs(base.xz - vec2(${HALL.x.toFixed(1)}, ${HALL.z.toFixed(1)}));
            if (hq.x < ${HALL.hx.toFixed(1)} && hq.y < ${HALL.hz.toFixed(1)} && base.y < uRoof - 2.0) vA = 0.0;
            gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uSand, uSnow, uNight;
          varying float vA;
          varying vec2 vUv;
          void main() {
            if (vA < 0.01) discard;
            // Sand is soft at its edges and its ends; rain stays a crisp streak; snow a soft round flake.
            // (Rain tapers too: a crisp streak, end to end, read in a still as a white stick planted in
            // the grass — a field of fence posts, storm tour review 2026-11-08. Brightest a third of the
            // way down, fading to nothing at both ends, soft across.)
            float rainSoft = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y)) * (1.0 - 0.6 * abs(vUv.x * 2.0 - 1.0));
            float soft = mix(rainSoft, (1.0 - abs(vUv.x * 2.0 - 1.0)) * sin(vUv.y * 3.14159), uSand);
            float flake = 1.0 - smoothstep(0.2, 0.5, length(vUv - 0.5));
            soft = mix(soft, flake, uSnow);
            vec3 col = mix(mix(vec3(0.72, 0.77, 0.82), vec3(0.85, 0.68, 0.46), uSand), vec3(0.96, 0.97, 1.0), uSnow);
            // (At night the falling water takes the dark: a constant grey, it was bright white streaks
            // slashed across a black frame — night storm tour, 2026-11-07. The lantern still lights the near.)
            col *= mix(1.0, 0.32, uNight);
            gl_FragColor = vec4(col, mix(0.34 + 0.28 * uSand, 0.85, uSnow) * vA * soft * mix(1.0, 0.7, uNight));
          }`,
        transparent: true,
        depthWrite: false,
      }),
      COUNT,
    )
    // The rainbow: a ring 42° round the point opposite the sun, red outside, violet in.
    const R = 6000 * Math.tan((42 * Math.PI) / 180)
    this.rainbow = new THREE.Mesh(
      new THREE.RingGeometry(R * 0.955, R * 1.0, 96, 1),
      new THREE.ShaderMaterial({
        uniforms: { uA: { value: 0 } },
        vertexShader: 'varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `
          uniform float uA;
          varying vec2 vP;
          vec3 spectrum(float t) { return clamp(vec3(1.5 - abs(t * 4.0 - 3.0), 1.5 - abs(t * 4.0 - 2.0), 1.5 - abs(t * 4.0 - 1.0)), 0.0, 1.0); }
          void main() {
            float t = (length(vP) / ${R.toFixed(1)} - 0.955) / 0.045;
            float edge = smoothstep(0.0, 0.15, t) * smoothstep(1.0, 0.85, t);
            gl_FragColor = vec4(spectrum(t), uA * edge * 0.6);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    )
    this.rainbow.visible = false
    scene.add(this.rainbow)
    this.rain.frustumCulled = false
    this.rain.renderOrder = 3
    this.group.add(this.rain)
  }

  /** The Undercroft's roof height (rain stops under it). */
  set roof(y: number) {
    this.rainUniforms.uRoof.value = y
  }

  /** 0 … 1: how far the cloud is drawn back from something you must see. */
  part = 0
  /** What the sky shows this frame: the weather, parted by `part`. */
  private readonly seen: State = { ...PRESETS.clear }

  /**
   * A first visit's weather: breaking cloud and shafts of sun for the walk out
   * (the land shown at its best), a little clear sky, and the first storm held
   * back until a quarter of an hour in.
   */
  opening(): void {
    this.set('breaking', true)
    this.left = 420
    this.step = CYCLE.length - 2
  }

  /** Change the weather (instantly for tools, else eased in over a minute). */
  set(name: WeatherName, instant = false): void {
    // (An unknown name — ?weather= from the address bar, a tool — is refused, not a broken frame:
    // `this.target` undefined threw every frame after.)
    if (!PRESETS[name]) {
      console.warn(`[weather] no weather called "${name}"`)
      return
    }
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
    // The cloud drawn back (an awakening), whatever the weather was doing.
    const w = this.seen
    for (const key of Object.keys(this.now) as Array<keyof State>) w[key] = this.now[key] + (PARTED[key] - this.now[key]) * this.part

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
    const flash = (t > 0 ? (t > 0.35 ? 1 : t > 0.27 ? 0.15 : t > 0.2 ? 0.8 : t / 0.2 * 0.4) : 0) * (this.softFlash ? 0.3 : 1)

    const u = this.uniforms
    u.uTime.value += dt
    u.uCover.value = w.cover
    u.uDark.value = w.dark
    u.uSun.value.copy(this.sky.sunDir)
    u.uFlash.value = flash
    u.uWind.value.set(1, 0.4).multiplyScalar(0.5 + w.wind)
    this.deck.forEach((m, i) => m.position.set(camera.position.x, w.base + i * CLOUD_GAP, camera.position.z))
    this.rainUniforms.uTime.value += dt
    // In the Dune Sea a storm's rain is sand.
    this.sand += (this.desert * THREE.MathUtils.smoothstep(w.rain, 0.3, 0.9) - this.sand) * Math.min(1, dt * 0.4)
    // On the High Places it snows: what falls is flakes, and even on a fair day a few drift by.
    this.rainUniforms.uRain.value = Math.max(w.rain, this.sand, this.high * (0.35 + 0.65 * w.rain))
    this.rainUniforms.uWind.value = w.wind
    // (What falls is sand wherever you stand in the Dune Sea, at once: eased with the storm, a storm met
    // on arriving there rained for half a minute over the dunes first — tour 8 review.)
    this.rainUniforms.uSand.value = Math.max(this.sand, this.desert * THREE.MathUtils.smoothstep(w.rain, 0.05, 0.3)) * (1 - this.high)
    this.rainUniforms.uSnow.value = this.high
    this.rain.visible = w.rain > 0.02 || this.high > 0.02

    // Light: the sun dims and greys under the cloud; the sky's diffuse light
    // takes over. Lightning lights everything for a moment.
    // (The time of day sets the light first — sky.lightBase — and the weather dims that.)
    const sky = this.sky
    const b = this.base
    const lb = sky.lightBase
    const day = 1 - sky.night
    // How lit the air is now, from the time of day's own fog colour (0.56 at noon): the weather's
    // tints follow it through dusk. (By 1 − night alone they stayed at noon's brightness until the
    // stars were out: a sandstorm at sunset glowed twice as bright as a clear sky at that hour —
    // night tour 1118n, spot 2.)
    const fc = lb.fogColor
    const lit = Math.min(1, (0.2126 * fc.r + 0.7152 * fc.g + 0.0722 * fc.b) / 0.56)
    // (And the sun all but gone in a sandstorm: the dunes kept crisp sunlit ripples and hard shadows
    // under it — a fine day with a brown sky. The sky's own light takes over.)
    sky.sun.intensity = lb.sun * (1 - 0.82 * w.dark) * (1 - 0.75 * this.sand)
    sky.fill.intensity = lb.fill * (1 + 0.9 * w.dark * day) + flash * 2.2
    sky.fill.color.copy(lb.fillSky).lerp(new THREE.Color(0.62, 0.68, 0.72), w.dark * day)
    this.scene.environmentIntensity = lb.env * (1 - 0.35 * w.dark)
    this.mireK += (this.mire - this.mireK) * Math.min(1, dt * 0.18)
    sky.fog.density = b.fog * w.fog * lb.haze * (1 + this.sand * 24) * (1 + this.mireK * 2.2)
    u.uSand.value = this.sand
    sky.sky.material.uniforms.uSand.value = this.sand * Math.max(0.15, lit)
    // How much of a tall thing the deck swallows: none in clear air, nearly all in a storm.
    // In a flash the cloud goes thin for an instant: whatever stands in it
    // (and beyond the Wall) shows as a shape, then is gone again.
    sky.fog.cloud = Math.max(0, Math.min(0.97, (w.cover - 0.3) * 1.45)) * (1 - 0.85 * flash)
    sky.fog.base = w.base
    sky.fog.color.copy(lb.fogColor).lerp(new THREE.Color(0.37, 0.41, 0.43).multiplyScalar(Math.max(0.12, lit)), w.dark)
    // The Mire's air: green-grey and close.
    sky.fog.color.lerp(new THREE.Color(0.42, 0.47, 0.4).multiplyScalar(Math.max(0.12, lit)), this.mireK * 0.6)
    // A sandstorm: the air thick and ochre (dimmer as the day goes).
    sky.fog.color.lerp(new THREE.Color(0.62, 0.46, 0.29).multiplyScalar(Math.max(0.15, lit)), this.sand * 0.92)
    // After rain, with the sun back low behind you: a rainbow opposite it.
    this.wet = Math.max(this.wet - dt / 150, w.rain > 0.3 && this.sand < 0.3 ? 1 : 0)
    const sunUp = sky.sunDir.y
    const bow = this.wet * (1 - THREE.MathUtils.smoothstep(w.rain, 0.05, 0.2)) * THREE.MathUtils.smoothstep(sunUp, 0.05, 0.15) * (1 - THREE.MathUtils.smoothstep(sunUp, 0.55, 0.7)) * (1 - THREE.MathUtils.smoothstep(w.cover, 0.6, 0.85))
    this.rainbow.visible = bow > 0.02
    if (this.rainbow.visible) {
      const anti = sky.sunDir.clone().negate()
      this.rainbow.position.copy(camera.position).addScaledVector(anti, 6000)
      this.rainbow.lookAt(camera.position)
      ;(this.rainbow.material as THREE.ShaderMaterial).uniforms.uA.value = bow * 0.5
    }
    u.uNight.value = Math.max(sky.night, sky.dusk * 0.75)
    // (What falls dims with the light too, not only with night: at sunset in a sandstorm the haze had
    // gone a dim brown but the streaks stayed near-white, snow slashed across the dusk — night colossi
    // tour 1118gn, the Husk. The deck keeps its own night look.)
    this.rainUniforms.uNight.value = Math.max(u.uNight.value, 1 - lit)
    u.uFog.value.copy(sky.fog.color)
    const su = sky.sky.material.uniforms
    su.cloudCoverage.value = 0.32 + 0.6 * w.cover
    su.cloudDensity.value = 0.55 + 0.4 * w.dark
    su.uOvercast.value = w.dark
    // Cloud shadows sliding over the land: with the sun out and scattered cloud (none under a full deck).
    this.shadeDrift.x += dt * (6 + 14 * w.wind)
    this.shadeDrift.y += dt * (2.5 + 6 * w.wind)
    groundShade.value.set(this.shadeDrift.x, this.shadeDrift.y, 0.7 - w.cover * 0.32, 0.42 * (1 - THREE.MathUtils.smoothstep(w.dark, 0.3, 0.65)) * (1 - sky.dusk) * (1 - this.sand))
    // The grade and the sun's shafts.
    if (this.post) {
      const g = this.post.grade.uniforms
      // (A sandstorm is not a grey storm: the grade keeps its colour, warm and thick.)
      g.mood.value = w.dark * (1 - 0.75 * this.sand)
      g.flash.value = flash
      g.rayStrength.value = 0.32 * w.rays
    }
  }
}
