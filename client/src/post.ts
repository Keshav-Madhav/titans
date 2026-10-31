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
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
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

  setSize(w: number, h: number): void {
    this.target.setSize(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2)))
  }

  render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    this.uniforms.tScene.value = read.texture
    renderer.setRenderTarget(this.target)
    this.quad.render(renderer)
  }
}

/**
 * Clamp the HDR scene before bloom and rays read it: the sky's sun disk is
 * thousands of times brighter than the land, and spread by bloom it would
 * flood the frame. (Past tone mapping a luminance of 6 is white anyway.)
 */
class ClampPass extends Pass {
  private readonly quad: FullScreenQuad
  private readonly uniforms = { tScene: { value: null as THREE.Texture | null }, limit: { value: 6.0 } }

  constructor() {
    super()
    this.quad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: /* glsl */ `
          uniform sampler2D tScene;
          uniform float limit;
          varying vec2 vUv;
          void main() {
            vec3 c = texture2D(tScene, vUv).rgb;
            // A bad pixel (NaN, infinity, a mirror-sharp highlight) must not
            // become a glowing blot: scrub it, and cap each channel as well as
            // the brightness (a huge red+blue with no green passed the
            // brightness cap and bloomed magenta on the cliffs).
            if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
            c = max(c, vec3(0.0));
            float l = max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
            c *= min(1.0, limit / l);
            gl_FragColor = vec4(min(c, vec3(limit * 1.5)), 1.0);
          }`,
        depthTest: false,
        depthWrite: false,
      }),
    )
  }

  render(renderer: THREE.WebGLRenderer, write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    this.uniforms.tScene.value = read.texture
    renderer.setRenderTarget(write)
    this.quad.render(renderer)
  }
}

const GRADE = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tRays: { value: null as THREE.Texture | null },
    rayColor: { value: new THREE.Color(1.0, 0.86, 0.66) },
    rayStrength: { value: 0.32 },
    exposure: { value: 0.84 },
    /** The weather's mood: 0 a clear day … 1 a storm (greyer, cooler, dimmer). */
    mood: { value: 0 },
    /** Lightning, this instant. */
    flash: { value: 0 },
    time: { value: 0 },
    aspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tRays;
    uniform vec3 rayColor;
    uniform float rayStrength;
    uniform float exposure;
    uniform float mood;
    uniform float flash;
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
      // Faint lens fringing toward the edges.
      vec2 off = (vUv - 0.5) * 0.0016;
      vec3 c;
      c.r = texture2D(tDiffuse, vUv + off).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv - off).b;
      c += texture2D(tRays, vUv).rgb * rayColor * rayStrength;
      c = aces(c * exposure * (1.0 - 0.12 * mood) * (1.0 + flash * 0.8));

      // Grade: less saturated (much less under storm), warm in the light and
      // cool in the shade — and under cloud, grey-green-teal throughout.
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, mix(0.86, 0.55, mood));
      c *= mix(vec3(0.93, 0.97, 1.06), vec3(1.05, 1.0, 0.92), smoothstep(0.05, 0.75, l) * (1.0 - 0.7 * mood));
      c *= mix(vec3(1.0), vec3(0.9, 0.98, 0.97), mood);
      // Lifted blacks and a soft shoulder: the bright, milky SotC air.
      c = c * 0.94 + 0.035;
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.35);

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

  constructor(private readonly rays: GodRaysPass) {
    super()
    this.quad = new FullScreenQuad(
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: GRADE.vertexShader, fragmentShader: GRADE.fragmentShader, depthTest: false, depthWrite: false }),
    )
  }

  render(renderer: THREE.WebGLRenderer, write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    this.uniforms.tDiffuse.value = read.texture
    this.uniforms.tRays.value = this.rays.target.texture
    renderer.setRenderTarget(this.renderToScreen ? null : write)
    this.quad.render(renderer)
  }
}

export class Post {
  readonly composer: EffectComposer
  readonly bloom: UnrealBloomPass
  readonly rays = new GodRaysPass()
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
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 })
    this.composer = new EffectComposer(renderer, target)
    this.composer.addPass(new RenderPass(scene, camera))
    this.composer.addPass(new ClampPass())
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.34, 0.7, 1.25)
    this.composer.addPass(this.bloom)
    this.composer.addPass(this.rays)
    this.grade = new GradePass(this.rays)
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
    u.sunSeen.value = facing * edge
    const g = this.grade.uniforms
    g.time.value += dt
    g.aspect.value = innerWidth / innerHeight
    this.composer.render(dt)
  }
}
