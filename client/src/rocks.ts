// Rock formations the heightfield cannot make: natural arches, caves with a
// chamber inside, hoodoos, overhangs you can shelter under, spires, piles of
// boulders (shapes in ./rock-fields.ts). Meshed in a worker when you come
// near, textured tri-planar with the ground's own rock layers (red in the
// Dune Sea; moss, litter or sand settling on top). The same fields are their
// collision: you walk through a cave, under an arch, onto a ledge.

import * as THREE from 'three'
import { mulberry32, type RegionName, type Terrain } from '@titans/shared'
import { LAYER, type TerrainTextures } from './terrain-material'
import { make, PLAN, type FormationKind, type RockMesh, type Shape } from './rock-fields'

interface Formation extends Shape {
  id: number
  kind: FormationKind
  seed: number
  x: number
  y: number
  z: number
  rot: number
  cos: number
  sin: number
  land: RegionName
  mesh: THREE.Mesh | null
  queued: boolean
}

// --- material -------------------------------------------------------------------

/** Tri-planar rock from the ground's texture arrays; moss or sand settles on top. */
function rockMaterial(tex: TerrainTextures): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tLayerColor = { value: tex.color }
    sh.uniforms.tLayerNormal = { value: tex.normal }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aLayer;\nvarying vec2 vLayer;\nvarying vec3 vRockPos;\nvarying vec3 vRockN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvLayer = aLayer;\nvRockPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvRockN = normalize(mat3(modelMatrix) * objectNormal);')
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform highp sampler2DArray tLayerColor;
        uniform highp sampler2DArray tLayerNormal;
        varying vec2 vLayer;
        varying vec3 vRockPos;
        varying vec3 vRockN;
        vec3 rockN;
        vec3 triTex(float L, float s, vec3 p, vec3 N, out vec3 nrm) {
          vec3 w = pow(abs(N), vec3(4.0));
          w /= (w.x + w.y + w.z);
          vec3 cx = texture(tLayerColor, vec3(p.zy * s, L)).rgb;
          vec3 cy = texture(tLayerColor, vec3(p.xz * s, L)).rgb;
          vec3 cz = texture(tLayerColor, vec3(p.xy * s, L)).rgb;
          vec2 nx = texture(tLayerNormal, vec3(p.zy * s, L)).rg * 2.0 - 1.0;
          vec2 ny = texture(tLayerNormal, vec3(p.xz * s, L)).rg * 2.0 - 1.0;
          vec2 nz = texture(tLayerNormal, vec3(p.xy * s, L)).rg * 2.0 - 1.0;
          nx.y = -nx.y; ny.y = -ny.y; nz.y = -nz.y;
          vec3 tx = vec3(nx + N.zy, N.x);
          vec3 ty = vec3(ny + N.xz, N.y);
          vec3 tz = vec3(nz + N.xy, N.z);
          nrm = normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);
          return cx * w.x + cy * w.y + cz * w.z;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `vec3 rN = normalize(vRockN);
        vec3 nA; vec3 nB;
        vec3 cA = triTex(vLayer.x, 1.0 / 9.0, vRockPos, rN, nA) * vec3(1.15, 1.25, 1.4);
        vec3 cB = triTex(vLayer.y, 1.0 / 3.2, vRockPos, rN, nB);
        // Moss, leaf litter or sand on the faces that look up.
        float topT = smoothstep(0.55, 0.8, rN.y + 0.15 * (cA.r - 0.3));
        diffuseColor.rgb = mix(cA, cB * vec3(0.8, 1.15, 0.7), topT) * vColor.rgb;
        rockN = normalize(mix(nA, nB, topT));`,
      )
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(rockN, 0.0)).xyz);')
  }
  return mat
}

// --- the set --------------------------------------------------------------------

const BUILD_R = 1700
const DROP_R = 2300

export class Rocks {
  readonly group = new THREE.Group()
  readonly formations: Formation[] = []
  private readonly material: THREE.MeshStandardMaterial
  private readonly worker: Worker
  /** Formations being meshed (by id): one at a time in the worker. */
  private busy = false
  private readonly waiting: Formation[] = []
  /** Meshes built so far (tools wait on it). */
  built = 0

  constructor(
    terrain: Terrain,
    private readonly seed: number,
    textures: TerrainTextures,
    /** Somewhere a formation must not stand (lakes, the start). */
    keepClear: (x: number, z: number, r: number) => boolean,
  ) {
    this.material = rockMaterial(textures)
    this.worker = new Worker(new URL('./rocks-worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (e: MessageEvent<{ id: number; mesh: RockMesh }>) => this.receive(e.data.id, e.data.mesh)
    const rand = mulberry32(seed ^ 0x40c45)
    const regions = terrain.base.regions
    for (const land of Object.keys(PLAN) as RegionName[]) {
      for (const [kind, count] of PLAN[land]) {
        let placed = 0
        for (let tries = 0; tries < count * 60 && placed < count; tries++) {
          const a = rand() * Math.PI * 2
          const d = land === 'valley' ? 250 + rand() * 650 : 700 + rand() * 2000
          const x = Math.cos(a) * d
          const z = Math.sin(a) * d
          if (regions.name(x, z) !== land) continue
          const fseed = (rand() * 4294967296) >>> 0
          const made = make(kind, fseed, seed)
          const r = Math.max(made.hx, made.hz)
          if (!keepClear(x, z, r) || this.formations.some((f) => Math.hypot(f.x - x, f.z - z) < Math.max(f.hx, f.hz) + r + 30)) continue
          // On ground level enough for its footprint (it sits on the lowest point).
          let lo = Infinity
          let hi = -Infinity
          for (let k = 0; k < 8; k++) {
            const h = terrain.heightAt(x + Math.cos(k * 0.785) * r * 0.7, z + Math.sin(k * 0.785) * r * 0.7)
            lo = Math.min(lo, h)
            hi = Math.max(hi, h)
          }
          if (hi - lo > Math.max(6, r * 0.35)) continue
          const rot = rand() * Math.PI * 2
          this.formations.push({ id: this.formations.length, kind, seed: fseed, x, y: lo, z, rot, cos: Math.cos(rot), sin: Math.sin(rot), ...made, land, mesh: null, queued: false })
          placed++
        }
      }
    }
  }

  /** The field in world space (rotated, translated). */
  sdf(f: Formation, x: number, y: number, z: number): number {
    const dx = x - f.x
    const dz = z - f.z
    return f.field(dx * f.cos - dz * f.sin, y - f.y, dx * f.sin + dz * f.cos)
  }

  /** Mesh formations coming near (in the worker, nearest first); drop far ones. */
  update(cam: THREE.Vector3): void {
    for (const f of this.formations) {
      const d = Math.hypot(f.x - cam.x, f.z - cam.z)
      if (d < BUILD_R && !f.mesh && !f.queued) {
        f.queued = true
        this.waiting.push(f)
      } else if (d > DROP_R && f.mesh) {
        this.group.remove(f.mesh)
        f.mesh.geometry.dispose()
        f.mesh = null
      }
    }
    if (this.busy || !this.waiting.length) return
    this.waiting.sort((a, b) => Math.hypot(b.x - cam.x, b.z - cam.z) - Math.hypot(a.x - cam.x, a.z - cam.z))
    const f = this.waiting.pop()!
    this.busy = true
    this.worker.postMessage({ id: f.id, kind: f.kind, seed: f.seed, worldSeed: this.seed })
  }

  /** Nothing left to mesh near the camera. */
  get settled(): boolean {
    return !this.busy && this.waiting.length === 0
  }

  private receive(id: number, m: RockMesh): void {
    this.busy = false
    const f = this.formations[id]
    f.queued = false
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(m.position, 3))
    g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3))
    const col = new Float32Array(m.ao.length * 3)
    const layer = new Float32Array(m.ao.length * 2)
    const rockL = f.land === 'desert' ? LAYER.redrock : LAYER.rock
    const topL = f.land === 'desert' ? LAYER.sand : f.land === 'forest' ? LAYER.forest : LAYER.grass
    for (let i = 0; i < m.ao.length; i++) {
      col.set([m.ao[i], m.ao[i], m.ao[i]], i * 3)
      layer.set([rockL, topL], i * 2)
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.setAttribute('aLayer', new THREE.BufferAttribute(layer, 2))
    g.setIndex(new THREE.BufferAttribute(m.index, 1))
    g.computeBoundingSphere()
    const mesh = new THREE.Mesh(g, this.material)
    mesh.position.set(f.x, f.y, f.z)
    mesh.rotation.y = f.rot
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.name = `rock-${f.kind}`
    f.mesh = mesh
    this.group.add(mesh)
    this.built++
  }

  /** Formations near (x, z) within `r`. */
  private near(x: number, z: number, r: number): Formation[] {
    return this.formations.filter((f) => Math.abs(f.x - x) < f.hx + f.hz + r && Math.abs(f.z - z) < f.hx + f.hz + r)
  }

  /**
   * The rock floor under a body at (x, y, z), if a formation's surface lies
   * between `y + reach` and `y - drop` (null if none): a ledge, an arch's
   * top, a cave floor.
   */
  floorAt(x: number, y: number, z: number, reach = 0.6, drop = 3): number | null {
    for (const f of this.near(x, z, 2)) {
      if (this.sdf(f, x, y + reach, z) < 0) continue // our head is in rock: not a floor
      for (let t = reach; t >= -drop; t -= 0.2) {
        if (this.sdf(f, x, y + t, z) < 0) {
          // Refine to the surface between this step and the one above.
          let lo = y + t
          let hi = y + t + 0.2
          for (let k = 0; k < 6; k++) {
            const m = (lo + hi) / 2
            if (this.sdf(f, x, m, z) < 0) lo = m
            else hi = m
          }
          return hi
        }
      }
    }
    return null
  }

  /** Push a body of radius `r` (its centre at `p`) out of any rock. */
  pushOut(p: THREE.Vector3, r = 0.45): boolean {
    let moved = false
    for (const f of this.near(p.x, p.z, r)) {
      const d = this.sdf(f, p.x, p.y, p.z)
      if (d >= r) continue
      const e = 0.15
      let gx = this.sdf(f, p.x + e, p.y, p.z) - this.sdf(f, p.x - e, p.y, p.z)
      let gy = this.sdf(f, p.x, p.y + e, p.z) - this.sdf(f, p.x, p.y - e, p.z)
      let gz = this.sdf(f, p.x, p.y, p.z + e) - this.sdf(f, p.x, p.y, p.z - e)
      const gl = Math.hypot(gx, gy, gz) || 1
      gx /= gl
      gy /= gl
      gz /= gl
      p.x += gx * (r - d)
      p.y += gy * (r - d)
      p.z += gz * (r - d)
      moved = true
    }
    return moved
  }

  /** Is (x, z) under or inside a formation's footprint (plants keep off)? */
  occupies(x: number, z: number): boolean {
    for (const f of this.formations) if (Math.hypot(f.x - x, f.z - z) < Math.max(f.hx, f.hz) * 0.75) return true
    return false
  }
}
