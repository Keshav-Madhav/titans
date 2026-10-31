// Clouds: puffy cumulus drifting at a Titan's waist, as in the reel. Each
// cloud is a cluster of soft billboard puffs — lit white on top, shaded
// blue-grey underneath — all one InstancedMesh. They drift with the wind and
// wrap around the camera, and fade into the haze with distance.

import * as THREE from 'three'
import { mulberry32 } from '@titans/shared'

const CLOUDS = 120
const PUFFS = 18
const SPREAD = 7000 // clouds live within this distance of the camera (wrapping)

function puffTexture(): THREE.CanvasTexture {
  const S = 128
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.55, 'rgba(255,255,255,0.75)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  // Lumpy edges: knock out a few soft holes.
  const rand = mulberry32(31)
  g.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2
    const r = S * (0.33 + rand() * 0.15)
    const x = S / 2 + Math.cos(a) * r
    const y = S / 2 + Math.sin(a) * r
    const h = g.createRadialGradient(x, y, 0, x, y, S * 0.12)
    h.addColorStop(0, 'rgba(0,0,0,0.6)')
    h.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = h
    g.fillRect(0, 0, S, S)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export class Clouds {
  readonly mesh: THREE.InstancedMesh
  private readonly centres: THREE.Vector3[] = []
  private readonly offsets: THREE.Vector3[] = []
  private readonly sizes: number[] = []
  private readonly wind = new THREE.Vector3(3.2, 0, 1.4)
  private readonly m = new THREE.Matrix4()

  constructor() {
    const rand = mulberry32(2026)
    const shade = new Float32Array(CLOUDS * PUFFS)
    for (let c = 0; c < CLOUDS; c++) {
      const a = rand() * Math.PI * 2
      const r = Math.sqrt(rand()) * SPREAD
      // Low: about a Titan's waist and chest, as in the reel.
      this.centres.push(new THREE.Vector3(Math.cos(a) * r, 260 + rand() * rand() * 320, Math.sin(a) * r))
      const w = 120 + rand() * 160
      for (let p = 0; p < PUFFS; p++) {
        const ox = (rand() - 0.5) * 2 * w
        const oz = (rand() - 0.5) * 2 * w * 0.6
        // Puffs heap up toward the middle: a flat base, a towering crown.
        const crown = 1 - Math.min(1, Math.hypot(ox, oz) / w)
        // Flat bases, heaped crowns.
        const oy = rand() * 12 + crown * crown * 80
        this.offsets.push(new THREE.Vector3(ox, oy, oz))
        this.sizes.push(70 + rand() * 50 + crown * 80)
        shade[c * PUFFS + p] = Math.min(1, oy / 90) // 0 = base (shaded) … 1 = crown (sunlit)
      }
    }
    const geo = new THREE.PlaneGeometry(1, 1)
    geo.setAttribute('aShade', new THREE.InstancedBufferAttribute(shade, 1))
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        map: { value: puffTexture() },
        lit: { value: new THREE.Color(0xffffff) },
        dark: { value: new THREE.Color(0xa9b7c9) },
      },
      vertexShader: /* glsl */ `
        attribute float aShade;
        varying vec2 vUv;
        varying float vShade;
        varying float vFade;
        void main() {
          vec3 c = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float s = length(instanceMatrix[0].xyz);
          vec4 mv = viewMatrix * vec4(c, 1.0);
          mv.xy += position.xy * s;
          gl_Position = projectionMatrix * mv;
          vUv = uv;
          vShade = aShade;
          // Lost in the haze far off.
          vFade = 1.0 - smoothstep(4500.0, 7500.0, length(mv.xyz));
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform vec3 lit;
        uniform vec3 dark;
        varying vec2 vUv;
        varying float vShade;
        varying float vFade;
        void main() {
          vec4 t = texture2D(map, vUv);
          // Shaded underneath, sunlit on top (and toward the puff's upper edge).
          float l = clamp(vShade * 0.75 + (vUv.y - 0.3) * 0.5, 0.0, 1.0);
          gl_FragColor = vec4(mix(dark, lit, l), t.a * 0.92 * vFade);
          #include <colorspace_fragment>
        }`,
    })
    this.mesh = new THREE.InstancedMesh(geo, mat, CLOUDS * PUFFS)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3
  }

  /** Under the weather's cloud deck the puffs go grey too (0 clear … 1 storm); at night, moonlit and dim. */
  tint(dark: number, night = 0): void {
    const u = (this.mesh.material as THREE.ShaderMaterial).uniforms
    u.lit.value.setRGB(1, 1, 1).lerp(new THREE.Color(0.5, 0.53, 0.55), dark).lerp(new THREE.Color(0.2, 0.23, 0.3), night)
    u.dark.value.set(0xa9b7c9).lerp(new THREE.Color(0.26, 0.29, 0.31), dark).lerp(new THREE.Color(0.04, 0.05, 0.08), night)
  }

  update(dt: number, camera: THREE.Vector3): void {
    let i = 0
    for (let c = 0; c < CLOUDS; c++) {
      const ctr = this.centres[c]
      ctr.addScaledVector(this.wind, dt)
      // Wrap around the camera, so the sky never empties wherever you go.
      if (ctr.x - camera.x > SPREAD) ctr.x -= 2 * SPREAD
      else if (camera.x - ctr.x > SPREAD) ctr.x += 2 * SPREAD
      if (ctr.z - camera.z > SPREAD) ctr.z -= 2 * SPREAD
      else if (camera.z - ctr.z > SPREAD) ctr.z += 2 * SPREAD
      for (let p = 0; p < PUFFS; p++, i++) {
        const o = this.offsets[i]
        const s = this.sizes[i]
        this.m.makeScale(s, s, s).setPosition(ctr.x + o.x, ctr.y + o.y, ctr.z + o.z)
        this.mesh.setMatrixAt(i, this.m)
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
