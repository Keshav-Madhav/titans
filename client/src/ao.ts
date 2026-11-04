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
//   3. Apply: the colour darkened by it, fading out into fog and the far distance.

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
      if (z > 1800.0 || z < 0.2) { gl_FragColor = vec4(1.0); return; }
      vec3 p = viewPosAt(vUv, vz);
      // The normal from depth: of the two neighbours each way, the nearer in depth (an edge picks
      // the surface this pixel is on, not the one behind it).
      vec2 px = 1.0 / uRes;
      vec3 pr = viewPosAt(vUv + vec2(px.x, 0.0), viewZAt(vUv + vec2(px.x, 0.0)));
      vec3 pl = viewPosAt(vUv - vec2(px.x, 0.0), viewZAt(vUv - vec2(px.x, 0.0)));
      vec3 pu = viewPosAt(vUv + vec2(0.0, px.y), viewZAt(vUv + vec2(0.0, px.y)));
      vec3 pd = viewPosAt(vUv - vec2(0.0, px.y), viewZAt(vUv - vec2(0.0, px.y)));
      vec3 dx = abs(pr.z - p.z) < abs(p.z - pl.z) ? pr - p : p - pl;
      vec3 dy = abs(pu.z - p.z) < abs(p.z - pd.z) ? pu - p : p - pd;
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
        occ += max(0.0, nv - 0.08) * (1.0 - smoothstep(R * R * 0.6, R * R * 1.6, d2));
      }
      float ao = 1.0 - occ / 12.0 * 2.8;
      gl_FragColor = vec4(vec3(clamp(ao, 0.0, 1.0)), 1.0);
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
      float z0 = -viewZAt(vUv);
      vec2 px = 1.0 / uRes;
      float sum = 0.0;
      float w = 0.0;
      for (int y = -1; y <= 1; y++)
        for (int x = -1; x <= 1; x++) {
          vec2 uv = vUv + vec2(float(x), float(y)) * px * 1.5;
          float z = -viewZAt(uv);
          float wi = 1.0 / (1.0 + abs(z - z0) / (0.02 * z0 + 0.05) * 4.0);
          sum += texture2D(tAO, uv).r * wi;
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
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    ${DEPTH_GLSL}
    uniform sampler2D tColor;
    uniform sampler2D tAO;
    uniform float uStrength;
    uniform float uDebug;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tColor, vUv);
      float z = -viewZAt(vUv);
      float ao = texture2D(tAO, vUv).r;
      // Out into the haze it fades: the air between washes contact shadows out.
      float k = uStrength * (1.0 - smoothstep(250.0, 1400.0, z));
      float m = mix(1.0, ao, k);
      gl_FragColor = uDebug > 0.5 ? vec4(vec3(m), 1.0) : vec4(c.rgb * m, c.a);
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

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width / 2))
    const h = Math.max(1, Math.round(height / 2))
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
