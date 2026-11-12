// Ambient occlusion from the depth the scene already wrote (graphics pass, 2026-11-04: "keep working
// on graphics… while still being extremely performant"). Where things meet — grass and ground, a
// boulder and the earth, a giant's arm and its side, the pillars' feet — the light is shut out a
// little; without it everything sat on the land like a sticker and the scenes read flat.
//
// No second render of the scene (the usual AO passes draw it again for normals, ~500 draws): the
// soft layers already keep the scene's depth, and that is all this reads. Half resolution:
//   1. AO: the view position and normal rebuilt from depth; 12 taps on a spiral, turned per pixel,
//      within a radius in metres (a little wider far off, so a giant's folds darken too).
//   2. Blur: 9 taps, weighted by depth so it never bleeds across an edge.
//   3. Apply: the colour darkened by it, fading out into fog and the far distance; then the HDR
//      clamp for bloom (formerly its own pass).

import * as THREE from 'three'
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js'
import { soft } from './soft'

/** Tools: false leaves the AO out (to compare, same frame). */
export const aoSwitch = { on: true, debug: false, /** Off at the lowest detail (quality.ts). */ quality: true }

const DEPTH_GLSL = /* glsl */ `
  #include <packing>
  uniform sampler2D tDepth;
  uniform vec2 uNF;
  uniform vec2 uProj; // projection[0][0], projection[1][1]
  float viewZAt(vec2 uv) { return perspectiveDepthToViewZ(texture2D(tDepth, uv).r, uNF.x, uNF.y); }
  vec3 viewPosAt(vec2 uv, float vz) { vec2 ndc = uv * 2.0 - 1.0; return vec3(ndc.x * -vz / uProj.x, ndc.y * -vz / uProj.y, vz); }
`

const aoMat = new THREE.ShaderMaterial({
  uniforms: {
    tDepth: { value: null },
    uNF: { value: new THREE.Vector2() },
    uProj: { value: new THREE.Vector2() },
    uRes: { value: new THREE.Vector2() },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    ${DEPTH_GLSL}
    uniform vec2 uRes;
    varying vec2 vUv;
    void main() {
      float vz = viewZAt(vUv);
      float z = -vz;
      // The sky and the far land: nothing to shut the light out from.
      // (Its depth goes out with it in .g, for the blur: one small texture read, not two.)
      if (z > 1800.0 || z < 0.2) { gl_FragColor = vec4(1.0, z, 0.0, 1.0); return; }
      vec3 p = viewPosAt(vUv, vz);
      // The normal from depth: of the two neighbours each way, the nearer in depth (an edge picks
      // the surface this pixel is on, not the one behind it).
      vec2 px = 1.0 / uRes;
      vec3 pr = viewPosAt(vUv + vec2(px.x, 0.0), viewZAt(vUv + vec2(px.x, 0.0)));
      vec3 pl = viewPosAt(vUv - vec2(px.x, 0.0), viewZAt(vUv - vec2(px.x, 0.0)));
      vec3 pu = viewPosAt(vUv + vec2(0.0, px.y), viewZAt(vUv + vec2(0.0, px.y)));
      vec3 pd = viewPosAt(vUv - vec2(0.0, px.y), viewZAt(vUv - vec2(0.0, px.y)));
      // (Both sides, averaged, where they agree — on a plain surface: one side alone carried each
      // row's depth rounding into the normal, tipping it row by row, and the AO came out in fine
      // horizontal stripes fixed to the screen over flat ground.)
      float ex = abs((pr.z - p.z) - (p.z - pl.z));
      float ey = abs((pu.z - p.z) - (p.z - pd.z));
      vec3 dx = ex < 0.02 * z ? (pr - pl) * 0.5 : abs(pr.z - p.z) < abs(p.z - pl.z) ? pr - p : p - pl;
      vec3 dy = ey < 0.02 * z ? (pu - pd) * 0.5 : abs(pu.z - p.z) < abs(p.z - pd.z) ? pu - p : p - pd;
      vec3 n = normalize(cross(dx, dy));
      // The reach: about a metre near you, wider far off; in pixels, kept on screen-sane terms.
      float R = clamp(0.9 + z * 0.012, 0.9, 7.0);
      float rPx = clamp(R * uProj.y / z * uRes.y * 0.5, 2.0, 70.0);
      // Turned per pixel (interleaved gradient noise); the blur takes the grain out.
      float a0 = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      float occ = 0.0;
      for (int i = 0; i < 12; i++) {
        float t = (float(i) + 0.5) / 12.0;
        float a = a0 + float(i) * 2.399963;
        vec2 o = vec2(cos(a), sin(a)) * t * rPx * px;
        vec2 suv = vUv + o;
        vec3 q = viewPosAt(suv, viewZAt(suv));
        vec3 v = q - p;
        float d2 = dot(v, v);
        float nv = dot(n, v) / sqrt(d2 + 1e-4);
        // (Only what rises above the surface, and only near: a far wall behind is not a crease.)
        // (And only what truly rises off it — a few centimetres, more far off: on flat ground seen
        // low, depth's rounding steps every screen row, the normal from depth tips row by row, and
        // a bare tilt-past-threshold darkened alternate rows — fine horizontal stripes fixed to the
        // screen over the camp's earth, the user's "black lines", 2026-11-07.)
        float rise = dot(n, v);
        occ += max(0.0, nv - 0.08) * smoothstep(0.02 + z * 0.002, 0.06 + z * 0.004, rise) * (1.0 - smoothstep(R * R * 0.6, R * R * 1.6, d2));
      }
      float ao = 1.0 - occ / 12.0 * 2.8;
      gl_FragColor = vec4(clamp(ao, 0.0, 1.0), z, 0.0, 1.0);
    }`,
  depthTest: false,
  depthWrite: false,
})

const blurMat = new THREE.ShaderMaterial({
  uniforms: {
    tAO: { value: null },
    tDepth: { value: null },
    uNF: { value: new THREE.Vector2() },
    uProj: { value: new THREE.Vector2() },
    uRes: { value: new THREE.Vector2() },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    ${DEPTH_GLSL}
    uniform sampler2D tAO;
    uniform vec2 uRes;
    varying vec2 vUv;
    void main() {
      // (The AO pass wrote each pixel's distance in .g beside its value: no full-size depth reads.)
      float z0 = texture2D(tAO, vUv).g;
      vec2 px = 1.0 / uRes;
      float sum = 0.0;
      float w = 0.0;
      for (int y = -1; y <= 1; y++)
        for (int x = -1; x <= 1; x++) {
          vec2 uv = vUv + vec2(float(x), float(y)) * px * 1.5;
          vec2 t = texture2D(tAO, uv).rg;
          float wi = 1.0 / (1.0 + abs(t.g - z0) / (0.02 * z0 + 0.05) * 4.0);
          sum += t.r * wi;
          w += wi;
        }
      gl_FragColor = vec4(vec3(sum / w), 1.0);
    }`,
  depthTest: false,
  depthWrite: false,
})

const applyMat = new THREE.ShaderMaterial({
  uniforms: {
    tColor: { value: null },
    tAO: { value: null },
    tDepth: { value: null },
    uNF: { value: new THREE.Vector2() },
    uProj: { value: new THREE.Vector2() },
    uStrength: { value: 0.75 },
    uDebug: { value: 0 },
    /** The HDR clamp's brightness limit (past tone mapping, 6 is white anyway). */
    uLimit: { value: 6.0 },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    ${DEPTH_GLSL}
    uniform sampler2D tColor;
    uniform sampler2D tAO;
    uniform float uStrength;
    uniform float uDebug;
    uniform float uLimit;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tColor, vUv);
      float z = -viewZAt(vUv);
      float ao = texture2D(tAO, vUv).r;
      // Out into the haze it fades: the air between washes contact shadows out.
      float k = uStrength * (1.0 - smoothstep(250.0, 1400.0, z));
      float m = mix(1.0, ao, k);
      if (uDebug > 0.5) { gl_FragColor = vec4(vec3(m), 1.0); return; }
      // Then the HDR clamp, before bloom and rays read it (it was its own full-screen pass right
      // after this one — a whole frame read and written again for a few instructions): the sun
      // disk is thousands of times brighter than the land, and a bad pixel (NaN, infinity, a
      // mirror-sharp highlight) must not become a glowing blot. Each channel is capped as well as
      // the brightness (a huge red+blue with no green bloomed magenta on the cliffs).
      vec3 col = c.rgb * m;
      if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
      col = max(col, vec3(0.0));
      float l = max(dot(col, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
      col *= min(1.0, uLimit / l);
      gl_FragColor = vec4(min(col, vec3(uLimit * 1.5)), 1.0);
    }`,
  depthTest: false,
  depthWrite: false,
})

export class AOPass extends Pass {
  private readonly quad = new FullScreenQuad()
  private readonly aoRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false })
  private readonly blurRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false })

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    super()
    this.needsSwap = true
  }

  /** Its buffer's share of the frame (tools may set it; null: by the frame's size). */
  static div: number | null = null
  setSize(width: number, height: number): void {
    // (Half the frame — a quarter past ~2400 px across, i.e. at full resolution on a Retina panel:
    // occlusion is soft and blurred anyway, and there the half-size buffer was as many pixels as the
    // whole frame at ratio 1.)
    const div = AOPass.div ?? (width > 2400 ? 4 : 2)
    const w = Math.max(1, Math.round(width / div))
    const h = Math.max(1, Math.round(height / div))
    this.aoRT.setSize(w, h)
    this.blurRT.setSize(w, h)
  }

  render(renderer: THREE.WebGLRenderer, write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    const depth = soft.tSoftDepth.value
    const on = aoSwitch.on && aoSwitch.quality && !!depth
    const nf = soft.uSoftNF.value
    const proj = this.camera.projectionMatrix.elements
    for (const m of [aoMat, blurMat, applyMat]) {
      m.uniforms.tDepth.value = depth
      m.uniforms.uNF.value.copy(nf)
      m.uniforms.uProj.value.set(proj[0], proj[5])
    }
    if (on) {
      aoMat.uniforms.uRes.value.set(this.aoRT.width, this.aoRT.height)
      renderer.setRenderTarget(this.aoRT)
      this.quad.material = aoMat
      this.quad.render(renderer)
      blurMat.uniforms.tAO.value = this.aoRT.texture
      blurMat.uniforms.uRes.value.set(this.blurRT.width, this.blurRT.height)
      renderer.setRenderTarget(this.blurRT)
      this.quad.material = blurMat
      this.quad.render(renderer)
    }
    applyMat.uniforms.tColor.value = read.texture
    applyMat.uniforms.tAO.value = this.blurRT.texture
    applyMat.uniforms.uStrength.value = on ? 0.75 : 0
    applyMat.uniforms.uDebug.value = aoSwitch.debug ? 1 : 0
    renderer.setRenderTarget(this.renderToScreen ? null : write)
    this.quad.material = applyMat
    this.quad.render(renderer)
  }

  dispose(): void {
    this.aoRT.dispose()
    this.blurRT.dispose()
    this.quad.dispose()
  }
}
