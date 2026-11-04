// The look. Shadow of the Colossus does not try to be realistic; it is soft,
// bright and hazy, light blooming off stone and sky, the sun pouring through
// whatever stands in front of it, colours muted and warm. This is that
// pipeline (after the scene's own haze, atmosphere.ts):
//
//   scene (HDR, multisampled)
//   → clamp: the sun's disk would otherwise flood everything below
//   → bloom: wide and soft, from the brightest light only
//   → god rays: radial blur of the bright sky toward the sun, at half size;
//     giants, trees and ridges cut shafts out of it
//   → grade: exposure, ACES, gentle desaturation, warm highlights and cool
//     shadows, a soft glow, film grain, vignette, faint lens fringing
//
// At the lowest quality the scene renders straight to the screen instead
// (tone mapping then comes from atmosphere.ts's CustomToneMapping).

import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { soft, softScene, softSwitch } from './soft'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { AOPass } from './ao'
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js'

/** Screen-space light shafts (GPU Gems 3, ch. 13), into a half-size target. */
class GodRaysPass extends Pass {
  readonly uniforms = {
    tScene: { value: null as THREE.Texture | null },
    sunUv: { value: new THREE.Vector2(0.5, 0.5) },
    /** 0 when the sun is behind the camera or well off screen. */
    sunSeen: { value: 1 },
    threshold: { value: 2.4 },
  }
  readonly target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false })
  private readonly quad: FullScreenQuad

  constructor() {
    super()
    this.needsSwap = false
    this.quad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D tScene;
          uniform vec2 sunUv;
          uniform float sunSeen;
          uniform float threshold;
          varying vec2 vUv;
          const int N = 56;
          // Only light brighter than the lit ground counts: the sky near the sun.
          vec3 bright(vec2 uv) {
            vec3 c = texture2D(tScene, uv).rgb;
            float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
            return c * smoothstep(threshold, threshold * 2.2, l);
          }
          void main() {
            if (sunSeen <= 0.0) { gl_FragColor = vec4(0.0); return; }
            vec2 delta = (vUv - sunUv) * (0.92 / float(N));
            vec2 uv = vUv;
            float decay = 1.0;
            vec3 sum = vec3(0.0);
            // Dither the start so the steps do not band.
            uv -= delta * fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
            for (int i = 0; i < N; i++) {
              uv -= delta;
              sum += bright(uv) * decay;
              decay *= 0.968;
            }
            gl_FragColor = vec4(sum / float(N) * sunSeen, 1.0);
          }`,
        depthTest: false,
        depthWrite: false,
      }),
    )
  }

  /** Tools: the size the shafts are drawn at, as a divisor of the screen (2 = half). */
  static div = 4
  private cleared = false

  setSize(w: number, h: number): void {
    // (Quarter size: the shafts are a long radial blur, and at half size 56 taps a pixel cost more
    // than the bloom. Nothing in them is sharp enough to need the pixels.)
    const d = GodRaysPass.div
    this.target.setSize(Math.max(1, Math.floor(w / d)), Math.max(1, Math.floor(h / d)))
  }

  render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    // The sun out of frame (most of the time): no shafts, so nothing to draw — the target is
    // cleared once and kept black.
    if (this.uniforms.sunSeen.value <= 0) {
      if (!this.cleared) {
        const c = renderer.getClearColor(new THREE.Color())
        const a = renderer.getClearAlpha()
        renderer.setRenderTarget(this.target)
        renderer.setClearColor(0x000000, 0)
        renderer.clear(true, false, false)
        renderer.setClearColor(c, a)
        this.cleared = true
      }
      return
    }
    this.cleared = false
    this.uniforms.tScene.value = read.texture
    renderer.setRenderTarget(this.target)
    this.quad.render(renderer)
  }
}

/**
 * The bloom, with its size a tool can change. (Tried 2, 2026-11-04: starting the blur chain at a
 * quarter of the screen saved ~0.4 ms but every level spread twice as far — toward a low sun the
 * haze became a wide milky veil, the thing the threshold below was tuned against. Kept stock.)
 */
class SizedBloom extends UnrealBloomPass {
  /** Tools: 2 starts the chain at a quarter of the screen (to compare). */
  static div = 1
  /**
   * The bloom is added in the grade pass (one read of the frame it makes anyway) instead of by its
   * own additive draw over the whole frame — a full-size read and write saved. Tools: false = stock.
   */
  static fold = true
  render(renderer: THREE.WebGLRenderer, write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget, dt: number, mask: boolean): void {
    this.blendMaterial.visible = !SizedBloom.fold
    super.render(renderer, write, read, dt, mask)
  }
  setSize(w: number, h: number): void {
    super.setSize(Math.max(1, Math.round(w / SizedBloom.div)), Math.max(1, Math.round(h / SizedBloom.div)))
  }
}
export const bloomSize = SizedBloom
export const raysSize = GodRaysPass

const GRADE = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tRays: { value: null as THREE.Texture | null },
    /** The bloom, added here instead of by its own full-screen additive draw (SizedBloom.fold). */
    tBloom: { value: null as THREE.Texture | null },
    bloomOn: { value: 0 },
    rayColor: { value: new THREE.Color(1.0, 0.86, 0.66) },
    rayStrength: { value: 0.32 },
    exposure: { value: 0.84 },
    /** The weather's mood: 0 a clear day … 1 a storm (greyer, cooler, dimmer). */
    mood: { value: 0 },
    /** Lightning, this instant. */
    flash: { value: 0 },
    /** The eye under water: 0 … 1 (murk, a green-blue cast, the light wavering). */
    under: { value: 0 },
    time: { value: 0 },
    aspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tRays;
    uniform sampler2D tBloom;
    uniform float bloomOn;
    uniform vec3 rayColor;
    uniform float rayStrength;
    uniform float exposure;
    uniform float mood;
    uniform float flash;
    uniform float under;
    uniform float time;
    uniform float aspect;
    varying vec2 vUv;

    // three.js's ACES fit (Stephen Hill's), as the materials used before.
    vec3 rrtOdt(vec3 v) {
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }
    vec3 aces(vec3 color) {
      const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      return clamp(OUT * rrtOdt(IN * (color / 0.6)), 0.0, 1.0);
    }
    vec3 toSrgb(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      // (No lens fringing: red and blue read a fraction of a pixel aside, and wherever fine detail
      // alternates pixel by pixel — the dither of leaves dissolving near the camera — bright sky
      // bled into those two channels only and dark green leaves came out purple.)
      // Under water the picture wavers.
      vec2 uv = vUv + under * 0.006 * vec2(sin(vUv.y * 38.0 + time * 2.1), cos(vUv.x * 31.0 + time * 1.7));
      vec3 c = texture2D(tDiffuse, uv).rgb;
      if (bloomOn > 0.5) c += texture2D(tBloom, uv).rgb;
      c += texture2D(tRays, vUv).rgb * rayColor * rayStrength;
      c = aces(c * exposure * (1.0 - 0.12 * mood) * (1.0 + flash * 0.8));

      // Grade: less saturated (much less under storm), warm in the light and
      // cool in the shade — and under cloud, grey-green-teal throughout.
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, mix(0.86, 0.55, mood));
      c *= mix(vec3(0.93, 0.97, 1.06), vec3(1.05, 1.0, 0.92), smoothstep(0.05, 0.75, l) * (1.0 - 0.7 * mood));
      c *= mix(vec3(1.0), vec3(0.9, 0.98, 0.97), mood);
      // Lifted blacks and a soft shoulder: the bright, milky SotC air.
      c = c * 0.955 + 0.024;
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.35);
      // Under water: the light thick and green-blue, brightest straight up, nothing far seen.
      if (under > 0.0) {
        float lum = dot(c, vec3(0.3, 0.5, 0.2));
        vec3 murk = mix(vec3(0.02, 0.07, 0.08), vec3(0.16, 0.34, 0.33), smoothstep(0.0, 1.0, vUv.y));
        c = mix(c, murk + lum * vec3(0.18, 0.32, 0.3), under * 0.88);
      }

      vec2 q = vUv - 0.5;
      q.x *= aspect;
      c *= 1.0 - 0.32 * smoothstep(0.35, 1.05, length(q));

      c = toSrgb(clamp(c, 0.0, 1.0));
      // Film grain, in display space.
      c += (hash(vUv * 1000.0 + fract(time * 7.13)) - 0.5) * 0.028;
      gl_FragColor = vec4(c, 1.0);
    }`,
}

class GradePass extends Pass {
  readonly uniforms = THREE.UniformsUtils.clone(GRADE.uniforms) as typeof GRADE.uniforms
  private readonly quad: FullScreenQuad

  constructor(
    private readonly rays: GodRaysPass,
    private readonly bloom: SizedBloom,
  ) {
    super()
    this.quad = new FullScreenQuad(
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: GRADE.vertexShader, fragmentShader: GRADE.fragmentShader, depthTest: false, depthWrite: false }),
    )
  }

  render(renderer: THREE.WebGLRenderer, write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    this.uniforms.tDiffuse.value = read.texture
    this.uniforms.tRays.value = this.rays.target.texture
    this.uniforms.tBloom.value = this.bloom.renderTargetsHorizontal[0].texture
    this.uniforms.bloomOn.value = this.bloom.enabled && SizedBloom.fold ? 1 : 0
    renderer.setRenderTarget(this.renderToScreen ? null : write)
    this.quad.render(renderer)
  }
}

/**
 * The scene, then the soft layers over it (soft.ts): the first draw's depth is resolved into
 * the target's depth texture, which the second reads to fade clouds and mist into solids.
 */
class SceneThenSoft extends Pass {
  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
  ) {
    super()
    this.needsSwap = false
  }

  render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    renderer.setRenderTarget(read)
    renderer.clear()
    renderer.render(this.scene, this.camera)
    soft.tSoftDepth.value = read.depthTexture
    soft.uSoftOn.value = softSwitch.on ? 1 : 0
    soft.uSoftRes.value.set(read.width, read.height)
    soft.uSoftNF.value.set(this.camera.near, this.camera.far)
    softScene.fog = this.scene.fog
    const auto = renderer.autoClear
    renderer.autoClear = false
    renderer.render(softScene, this.camera)
    renderer.autoClear = auto
  }
}

export class Post {
  /** How far the bloom backs off facing a low sun (Q47); 0 = not at all (tools compare). */
  static lowSunTame = 0.8
  readonly composer: EffectComposer
  readonly bloom: UnrealBloomPass
  readonly rays = new GodRaysPass()
  readonly ao: AOPass
  readonly grade: GradePass
  /** Off: render straight to the screen (the lowest quality). */
  enabled = true
  private readonly sunWorld = new THREE.Vector3()
  private readonly ndc = new THREE.Vector3()
  private readonly look = new THREE.Vector3()

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
  ) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2())
    // (With its depth as a texture, made with the target: added later, after its framebuffer
    // was built, it was never written, and every soft layer read "nothing behind".)
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(size.x, size.y, THREE.FloatType) })
    this.composer = new EffectComposer(renderer, target)
    this.composer.addPass(new SceneThenSoft(scene, camera))
    // Ambient occlusion from that depth (ao.ts): before the clamp, the bloom and the grade.
    this.ao = new AOPass(camera)
    // (It ends with the HDR clamp the bloom and rays need — once its own full-screen pass.)
    this.composer.addPass(this.ao)
    this.bloom = new SizedBloom(new THREE.Vector2(size.x, size.y), 0.34, 0.7, 1.25)
    this.composer.addPass(this.bloom)
    this.composer.addPass(this.rays)
    this.grade = new GradePass(this.rays, this.bloom as SizedBloom)
    this.composer.addPass(this.grade)
  }

  /** Follow the renderer's size and pixel ratio (the quality governor changes them). */
  resize(): void {
    this.composer.setPixelRatio(this.renderer.getPixelRatio())
    this.composer.setSize(innerWidth, innerHeight)
  }

  render(dt: number, sunDir: THREE.Vector3): void {
    if (!this.enabled) {
      this.renderer.render(this.scene, this.camera)
      // (No depth to read here: the soft layers draw as plain cards.)
      soft.uSoftOn.value = 0
      softScene.fog = this.scene.fog
      const auto = this.renderer.autoClear
      this.renderer.autoClear = false
      this.renderer.render(softScene, this.camera)
      this.renderer.autoClear = auto
      return
    }
    // Where the sun is on screen, and how much it faces us.
    this.sunWorld.copy(this.camera.position).addScaledVector(sunDir, 10000)
    this.ndc.copy(this.sunWorld).project(this.camera)
    this.camera.getWorldDirection(this.look)
    const facing = THREE.MathUtils.smoothstep(this.look.dot(sunDir), -0.1, 0.45)
    // Shafts only while the sun is in (or just outside) the frame.
    const edge = 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(this.ndc.x), Math.abs(this.ndc.y)), 0.85, 1.25)
    const u = this.rays.uniforms
    u.sunUv.value.set(this.ndc.x * 0.5 + 0.5, this.ndc.y * 0.5 + 0.5)
    // (Shafts belong to a low sun: high up, the blur only spread a milky veil over everything.)
    u.sunSeen.value = facing * edge * (1 - THREE.MathUtils.smoothstep(sunDir.y, 0.3, 0.6))
    // A high sun lights a broad patch of sky past the bloom's threshold, and the bloom spread it
    // into a white veil over the whole view (looking toward it from the first camp, the way the
    // traveller's trail leads; at noon, anywhere). The sky is bright well past any threshold then,
    // so under a high sun the bloom fades almost away. A low sun, and the night's lights, keep it.
    const high = THREE.MathUtils.smoothstep(sunDir.y, 0.15, 0.45)
    // (And a low sun in frame did the same (Q47): the bright sky round it spread over a third of
    // the view at dawn and dusk, the land under it washed grey-white. Facing a risen sun, the bloom
    // backs off too — the sun itself keeps a glow; the haze and the rays carry the rest.)
    const up = THREE.MathUtils.smoothstep(sunDir.y, -0.03, 0.05)
    const glare = Math.max(high * Math.max(facing, 0.75), facing * edge * up * Post.lowSunTame)
    this.bloom.strength = 0.34 * (1 - 0.85 * glare)
    // And the lit ground itself: under a high sun the Dune Sea's sand is far past 1.25 — the whole
    // ground bloomed into a milky veil and the wanderer on it read as a pale ghost. The threshold
    // rises with the sun (a low sun and the night's lights keep the bloom they had).
    this.bloom.threshold = 1.25 + 2.2 * Math.max(high, facing * edge * up * Post.lowSunTame * 0.5)
    const g = this.grade.uniforms
    g.time.value += dt
    g.aspect.value = innerWidth / innerHeight
    this.composer.render(dt)
  }
}
