// The sea beyond the Dune Sea (shared SHORE): one wide sheet of water at the sea's level,
// only where the Shore's gap in the mountains is (elsewhere the ground's depth test and a
// discard keep it out). It knows the bed under it near the coast — a coarse map of the
// ground's height, filled a little each frame the first time you come near — so the water
// is clear and green over the shallows, deep blue beyond, and the surf breaks along the
// beach in slow moving lines.

import * as THREE from 'three'
import { SHORE, type Terrain } from '@titans/shared'
import { rippleNormals } from './water-view'

/** The coarse bed map: its extent (world metres) and cell size. */
const BX0 = -6400
const BZ0 = 7200
const BW = 12800
const BH = 6400
const CELL = 32
const NX = BW / CELL
const NZ = BH / CELL

export class Sea {
  readonly mesh: THREE.Mesh
  private readonly bedTex: THREE.DataTexture
  private filled = 0
  private readonly time = { value: 0 }

  constructor(private readonly terrain: Terrain) {
    // (Half floats: metres above the sea's level, signed.)
    const data = new Uint16Array(NX * NZ).fill(THREE.DataUtils.toHalfFloat(-200))
    this.bedTex = new THREE.DataTexture(data, NX, NZ, THREE.RedFormat, THREE.HalfFloatType)
    this.bedTex.magFilter = this.bedTex.minFilter = THREE.LinearFilter
    this.bedTex.needsUpdate = true
    // Only the Shore's gap: a wedge of ring from just inside the coast out past the Wall. (A
    // plane over half the world with the rest discarded paid its shader wherever it covered the
    // screen — a discard turns off the early depth test on many GPUs.)
    const half = SHORE.half * 1.25
    // (Ring in XY, turned to face up: its angle −π/2 lands due south, +z.)
    const geo = new THREE.RingGeometry(SHORE.coast - 1400, 40000, 48, 4, -Math.PI / 2 - half, half * 2).rotateX(-Math.PI / 2)
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 13, pos.getZ(i) / 13)
    const mat = new THREE.MeshStandardMaterial({
      color: 0x24506f,
      // (Less of a mirror: at 0.06 rough and 2.4x the sky, from the beach under a pale sky the whole sea
      // went white to the horizon — the playtest — and the swimmer stood in milk.)
      roughness: 0.14,
      metalness: 0.05,
      envMapIntensity: 1.35,
      emissive: 0x0b2436,
      normalMap: rippleNormals(),
      normalScale: new THREE.Vector2(0.26, 0.26),
      transparent: true,
    })
    const u = {
      uBed: { value: this.bedTex },
      uBedO: { value: new THREE.Vector2(BX0, BZ0) },
      uBedS: { value: new THREE.Vector2(BW, BH) },
      uSea: { value: SHORE.sea },
      uCoast: { value: SHORE.coast },
      uHalf: { value: SHORE.half },
      uTime: this.time,
    }
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u)
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSeaW;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvSeaW = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vSeaW;
          uniform sampler2D uBed;
          uniform vec2 uBedO, uBedS;
          uniform float uSea, uCoast, uHalf, uTime;
          float sHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float sNoise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(sHash(i), sHash(i + vec2(1, 0)), f.x), mix(sHash(i + vec2(0, 1)), sHash(i + vec2(1, 1)), f.x), f.y);
          }`,
        )
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          // (The mesh is the Shore's gap already: nothing to discard, the mountains close its sides.)`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec2 sUv = (vSeaW.xz - uBedO) / uBedS;
          float inMap = step(0.0, sUv.x) * step(sUv.x, 1.0) * step(0.0, sUv.y) * step(sUv.y, 1.0);
          float sDepth = mix(200.0, -texture2D(uBed, sUv).r, inMap);
          float sDeep = smoothstep(0.2, 4.0, sDepth);
          diffuseColor.rgb = mix(vec3(0.22, 0.44, 0.40), diffuseColor.rgb, sDeep);
          // (Opaque once deep: at 0.97 a swimmer's legs showed through as a pale ghost under them.)
          diffuseColor.a = mix(0.25, 1.0, smoothstep(0.0, 3.0, sDepth));
          // Surf: lines of foam rolling in over the shallows, breaking on the sand.
          float sN = sNoise(vSeaW.xz * 0.35 + uTime * 0.08) * 0.6 + sNoise(vSeaW.xz * 1.3 - uTime * 0.15) * 0.4;
          float sRoll = sin(sDepth * 2.2 + uTime * 1.3 + sN * 2.0);
          // (Over a narrower band: the shore's shelf is wide and shallow, and surf across all of it read as
          // a milky white sheet out to the horizon — the playtest, wading in.)
          float sSurf = (1.0 - smoothstep(0.0, 1.1, sDepth)) * smoothstep(0.62, 0.97, sRoll * 0.5 + 0.5 + (sN - 0.5) * 0.4);
          float sEdge = (1.0 - smoothstep(0.0, 0.35, sDepth)) * smoothstep(0.3, 0.6, sN + (0.35 - sDepth));
          float sFoam = max(sSurf * 0.75, sEdge) * step(-0.05, sDepth);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.94, 0.92), sFoam * 0.7);
          diffuseColor.a = max(diffuseColor.a, sFoam * 0.9);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance *= sDeep;`,
        )
    }
    mat.customProgramCacheKey = () => 'sea-water'
    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.position.y = SHORE.sea
    this.mesh.renderOrder = 1
    this.mesh.receiveShadow = true
    this.mesh.frustumCulled = false
  }

  /** The sea's level at (x, z), or NaN where there is no sea (or the ground is above it). */
  levelAt(x: number, z: number): number {
    const a = Math.abs(Math.atan2(x, z))
    if (a > SHORE.half * 1.2 || Math.hypot(x, z) < SHORE.coast - 1200) return NaN
    return this.terrain.heightAt(x, z) < SHORE.sea ? SHORE.sea : NaN
  }

  /** Each frame: the ripples drift; the bed map fills in (a little each frame) once you are near. */
  update(dt: number, camera: THREE.Vector3): void {
    this.time.value += dt
    const map = this.mesh.material as THREE.MeshStandardMaterial
    map.normalMap?.offset.set(this.time.value * 0.01, this.time.value * 0.006)
    this.mesh.visible = camera.z > 3000
    if (this.filled >= NX * NZ || Math.hypot(camera.x, camera.z) < SHORE.coast - 5000) return
    const data = this.bedTex.image.data as Uint16Array
    const end = Math.min(NX * NZ, this.filled + 2400)
    for (let i = this.filled; i < end; i++) {
      const ix = i % NX
      const iz = Math.floor(i / NX)
      const h = this.terrain.base.height(BX0 + (ix + 0.5) * CELL, BZ0 + (iz + 0.5) * CELL) - SHORE.sea
      data[i] = THREE.DataUtils.toHalfFloat(Math.max(-200, Math.min(200, h)))
    }
    this.filled = end
    if (this.filled >= NX * NZ || this.filled % 24000 < 2400) this.bedTex.needsUpdate = true
  }
}
