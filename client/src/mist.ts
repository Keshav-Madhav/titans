// Mist: banks of low fog lying in the hollows and gathered round the feet of
// the colossi, so the huge things rise out of it (the concept paintings).
// Wide, flat, soft sheets turned toward the camera about the vertical,
// coloured by the fog itself (lit a little toward the sun), thickest under a
// heavy sky, thinning to nothing as you walk into one — so you are in the
// mist, not looking at a card.

import * as THREE from 'three'
import { mulberry32, SPREAD, type Terrain } from '@titans/shared'
import { soft, SOFT_GLSL } from './soft'

const BANKS = 1800

/** A soft bank: dense low in the middle, fading to the top, the bottom and the sides. */
function bankTexture(): THREE.CanvasTexture {
  const W = 256
  const H = 128
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const img = g.createImageData(W, H)
  const rand = mulberry32(77)
  // A few soft blobs stacked along the bottom third make the outline lumpy.
  const blobs = Array.from({ length: 9 }, () => ({ x: 0.12 + rand() * 0.76, y: 0.55 + rand() * 0.2, r: 0.18 + rand() * 0.16 }))
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W
      const v = y / H
      let a = 0
      for (const b of blobs) {
        const dx = (u - b.x) / b.r
        const dy = ((v - b.y) / b.r) * 2.2
        a = Math.max(a, Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy)))
      }
      // Fade at the very bottom, where it meets the ground.
      a *= Math.min(1, (1 - v) / 0.18)
      const k = (y * W + x) * 4
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255
      img.data[k + 3] = Math.round(255 * a * a * (3 - 2 * a))
    }
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export class Mist {
  readonly mesh: THREE.InstancedMesh
  private readonly uniforms = {
    map: { value: bankTexture() },
    uColor: { value: new THREE.Color() },
    uSun: { value: new THREE.Vector3() },
    uAmount: { value: 1 },
  }

  constructor(terrain: Terrain, seed: number, gather: THREE.Vector3[]) {
    const rand = mulberry32(seed ^ 0x3157)
    const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0)
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, ...soft },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vFade;
        varying vec3 vWorld;
        void main() {
          vec3 c = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float w = length(instanceMatrix[0].xyz);
          float h = length(instanceMatrix[1].xyz);
          // Face the camera about the vertical (a standing sheet of mist).
          vec3 toCam = cameraPosition - c;
          vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + 1e-5);
          vec3 p = c + right * position.x * w + vec3(0.0, position.y * h, 0.0);
          vWorld = p;
          vUv = uv;
          float d = length(toCam.xz);
          // Gone when you are in it; faded far off (the haze has it there).
          vFade = smoothstep(w * 0.15, w * 0.55, d) * (1.0 - smoothstep(4500.0, 7000.0, d));
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        #include <packing>
        ${SOFT_GLSL}
        uniform sampler2D map;
        uniform vec3 uColor;
        uniform vec3 uSun;
        uniform float uAmount;
        varying vec2 vUv;
        varying float vFade;
        varying vec3 vWorld;
        void main() {
          // (A standing sheet meeting the ground, a wall or a giant's leg: it thins into it.)
          float a = texture2D(map, vUv).a * vFade * uAmount * 0.3 * softFade(4.0, 0.03);
          if (a < 0.004) discard;
          vec3 toCam = normalize(cameraPosition - vWorld);
          float sunward = pow(max(dot(-toCam, normalize(uSun)), 0.0), 4.0);
          vec3 col = uColor * (1.04 + 0.12 * vUv.y) + vec3(1.0, 0.92, 0.78) * sunward * 0.25;
          gl_FragColor = vec4(col, a);
        }`,
      transparent: true,
      depthWrite: false,
      fog: false,
    })
    this.mesh = new THREE.InstancedMesh(geo, mat, BANKS)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 1
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    let n = 0
    const add = (x: number, z: number, w: number, h: number) => {
      if (n >= BANKS) return
      m.compose(new THREE.Vector3(x, terrain.heightAt(x, z) - h * 0.12, z), q, new THREE.Vector3(w, h, 1))
      this.mesh.setMatrixAt(n++, m)
    }
    // Round the feet of the colossi.
    for (const c of gather) {
      for (let k = 0; k < 16; k++) {
        const a = rand() * Math.PI * 2
        const d = 60 + rand() * 260
        add(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d, 90 + rand() * 110, 34 + rand() * 30)
      }
    }
    // In the hollows: try spots, keep the low ones.
    for (let tries = 0; tries < 16000 && n < BANKS; tries++) {
      const a = rand() * Math.PI * 2
      const d = 200 + Math.sqrt(rand()) * 3400 * SPREAD
      const x = Math.cos(a) * d
      const z = Math.sin(a) * d
      const h = terrain.heightAt(x, z)
      let ring = 0
      for (let k = 0; k < 6; k++) ring += terrain.heightAt(x + Math.cos(k * 1.05) * 160, z + Math.sin(k * 1.05) * 160)
      if (h > ring / 6 - 6) continue // only where the ground dips
      add(x, z, 80 + rand() * 120, 24 + rand() * 26)
    }
    this.mesh.count = n
  }

  /** The fog's colour and the weather's heaviness (0 clear … 1 storm). */
  update(fog: THREE.Color, sunDir: THREE.Vector3, heavy: number): void {
    this.uniforms.uColor.value.copy(fog)
    this.uniforms.uSun.value.copy(sunDir)
    this.uniforms.uAmount.value = 0.35 + heavy * 0.85
  }
}
