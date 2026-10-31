// Cairns: stacks of old stones on the hardest high places — the highest
// peaks and mesas of each land, the top of the tallest pillar, the crown of
// the Sentinel's hood. Reach one and light it (E): a flame catches, a pale
// beam rises into the sky where everyone could see it if there were anyone,
// and the land below is uncovered on your map. They are how the world is
// explored: by climbing up and looking out.

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { mulberry32 } from '@titans/shared'

export interface CairnPlace {
  name: string
  x: number
  y: number
  z: number
}

interface Cairn extends CairnPlace {
  lit: boolean
  flame: THREE.Mesh
  beam: THREE.Mesh
  /** Seconds since it was lit (the beam rises). */
  since: number
}

/** A stack of flat stones with an iron bowl on top. */
function stackGeometry(seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed)
  const parts: THREE.BufferGeometry[] = []
  let y = 0
  for (let i = 0; i < 6; i++) {
    const r = 0.75 - i * 0.09 + rand() * 0.1
    const h = 0.22 + rand() * 0.1
    const g = new THREE.DodecahedronGeometry(1, 0).scale(r, h, r * (0.8 + rand() * 0.3))
    g.rotateY(rand() * 3).translate((rand() - 0.5) * 0.12, y + h * 0.8, (rand() - 0.5) * 0.12)
    parts.push(g.index ? g.toNonIndexed() : g)
    y += h * 1.5
  }
  parts.push(new THREE.CylinderGeometry(0.45, 0.25, 0.3, 10, 1).translate(0, y + 0.15, 0).toNonIndexed())
  const g = mergeGeometries(parts)!
  g.computeVertexNormals()
  g.userData.top = y + 0.3
  return g
}

export class Cairns {
  readonly group = new THREE.Group()
  readonly cairns: Cairn[] = []
  private t = 0
  private readonly beamMat: THREE.ShaderMaterial

  constructor(places: CairnPlace[]) {
    const stone = new THREE.MeshStandardMaterial({ color: 0x8c8678, roughness: 0.95 })
    const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.0, 2.2, 0.8), toneMapped: true, fog: false })
    this.beamMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying float vY;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vY = position.y;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - w.xyz);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying float vY;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          // Soft at its sides, fading as it rises, shimmering a little.
          float core = pow(abs(dot(vN, vV)), 2.0);
          float up = 1.0 - smoothstep(0.0, 900.0, vY);
          float shimmer = 0.85 + 0.15 * sin(vY * 0.05 - uTime * 2.0);
          float a = core * up * shimmer * 0.7;
          gl_FragColor = vec4(vec3(1.0, 0.82, 0.55) * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
    const beamGeo = new THREE.CylinderGeometry(7, 5, 900, 16, 1, true).translate(0, 450, 0)
    places.forEach((p, i) => {
      const geo = stackGeometry(100 + i)
      const stack = new THREE.Mesh(geo, stone)
      stack.position.set(p.x, p.y - 0.05, p.z)
      stack.castShadow = true
      stack.receiveShadow = true
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 8).translate(0, 0.45, 0), flameMat)
      flame.position.set(p.x, p.y + geo.userData.top, p.z)
      flame.visible = false
      const beam = new THREE.Mesh(beamGeo, this.beamMat)
      beam.position.copy(flame.position)
      beam.visible = false
      beam.renderOrder = 5
      beam.frustumCulled = false
      this.group.add(stack, flame, beam)
      this.cairns.push({ ...p, lit: false, flame, beam, since: 0 })
    })
  }

  /** The unlit cairn within `r` of `p`, if any. */
  near(p: THREE.Vector3, r = 3.5): Cairn | null {
    for (const c of this.cairns) if (!c.lit && Math.hypot(c.x - p.x, c.z - p.z) < r && Math.abs(c.y - p.y) < 3) return c
    return null
  }

  light(c: Cairn, instant = false): void {
    c.lit = true
    c.since = instant ? 99 : 0
    c.flame.visible = true
    c.beam.visible = true
  }

  update(dt: number): void {
    this.t += dt
    this.beamMat.uniforms.uTime.value = this.t
    for (const c of this.cairns) {
      if (!c.lit) continue
      c.since += dt
      // The beam rises out of the flame over a few seconds; the flame flickers.
      const k = Math.min(1, c.since / 4)
      c.beam.scale.set(1, Math.max(0.001, k * k * (3 - 2 * k)), 1)
      const f = 0.85 + 0.15 * Math.sin(this.t * 13 + c.x) * Math.sin(this.t * 7.7 + c.z)
      c.flame.scale.set(f, 0.8 + 0.4 * f, f)
    }
  }

  /** Names of the lit cairns (the save). */
  save(): string[] {
    return this.cairns.filter((c) => c.lit).map((c) => c.name)
  }

  load(names: string[]): Cairn[] {
    const lit = this.cairns.filter((c) => names.includes(c.name))
    for (const c of lit) this.light(c, true)
    return lit
  }

  get litCount(): number {
    return this.cairns.filter((c) => c.lit).length
  }
}
