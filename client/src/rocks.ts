// Rock formations the heightfield cannot make: natural arches, caves with a
// chamber inside, hoodoos, overhangs you can shelter under, spires, piles of
// boulders (shapes in ./rock-fields.ts). Meshed in a worker when you come
// near, textured tri-planar with the ground's own rock layers (red in the
// Dune Sea; moss, litter or sand settling on top). The same fields are their
// collision: you walk through a cave, under an arch, onto a ledge.

import * as THREE from 'three'
import { mulberry32, SPREAD, type RegionName, type Terrain } from '@titans/shared'
import { LAYER, type TerrainTextures } from './terrain-material'
import { make, PLAN, type RockMesh, type Shape, type ShapeKind } from './rock-fields'

interface Formation extends Shape {
  id: number
  /** 'built': architecture with its own geometry (see `addBuilt`). */
  kind: ShapeKind | 'built'
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
  /** A colossus's coarse twin, shown from afar (null until built; undefined: none needed). */
  far?: THREE.Mesh | null
  farQueued?: boolean
  /** Mesh resolution (cells across its longest side). */
  res: number
  /** Built at once and kept, however far away (the colossi). */
  always: boolean
  /** Texture layers (sides, tops), metres per side texture tile, and a tint. */
  layers: [number, number]
  scale: number
  tint: [number, number, number]
  /** Hanging in the air, bobbing and turning slowly (no collision). */
  float: { amp: number; phase: number; spin: number } | null
}

/** How a colossus looks and where it stands (see `Rocks.addColossus`). */
export interface ColossusPlacement {
  kind: ShapeKind
  x: number
  z: number
  /** Ground level under it; default: the lowest ground under its footprint, minus `sink`. */
  y?: number
  sink?: number
  rot: number
  seed: number
  layers: [number, number]
  scale?: number
  tint?: [number, number, number]
  res?: number
  float?: { amp: number; phase: number; spin: number }
}

// --- material -------------------------------------------------------------------

/** Tri-planar rock from the ground's texture arrays; moss or sand settles on top. */
/**
 * `occlusion`: GLSL defining `float occlusion(vec3 worldPos, vec3 worldNormal)` (0 … 1, how
 * much of the sky a point sees), for built stone whose shape is known — corners where a wall
 * meets the floor go dark as they do in life — and its uniforms.
 */
export function rockMaterial(tex: TerrainTextures, occlusion?: { glsl: string; uniforms: Record<string, THREE.IUniform>; key: string }): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })
  if (occlusion) mat.customProgramCacheKey = () => 'rock-ao-' + occlusion.key
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tLayerColor = { value: tex.color }
    sh.uniforms.tLayerNormal = { value: tex.normal }
    if (occlusion) {
      Object.assign(sh.uniforms, occlusion.uniforms)
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + occlusion.glsl)
        .replace(
          '#include <aomap_fragment>',
          `#include <aomap_fragment>
          {
            float occ = occlusion(vRockPos, normalize(vRockN));
            reflectedLight.indirectDiffuse *= occ;
            reflectedLight.indirectSpecular *= occ;
            reflectedLight.directDiffuse *= mix(1.0, occ, 0.6);
          }`,
        )
    }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aLayer;\nvarying vec3 vLayer;\nvarying vec3 vRockPos;\nvarying vec3 vRockN;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vLayer = aLayer;
        #ifdef USE_INSTANCING
          vRockPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
          vRockN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
        #else
          vRockPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vRockN = normalize(mat3(modelMatrix) * objectNormal);
        #endif`,
      )
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform highp sampler2DArray tLayerColor;
        uniform highp sampler2DArray tLayerNormal;
        varying vec3 vLayer;
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
        vec3 cA = triTex(vLayer.x, 1.0 / vLayer.z, vRockPos, rN, nA);
        vec3 cB = triTex(vLayer.y, 1.0 / 3.2, vRockPos, rN, nB);
        // Moss, leaf litter or sand on the faces that look up — in patches, the
        // stone showing through (a big flat top must not read as one green sheet).
        vec3 nTmp;
        float patchy = triTex(vLayer.x, 1.0 / (vLayer.z * 6.0), vRockPos + 17.0, rN, nTmp).g;
        float topT = smoothstep(0.55, 0.8, rN.y + 0.15 * (cA.r - 0.3)) * smoothstep(0.25, 0.55, patchy + 0.12);
        // Ground layers on top get the ground's green; generated moss is coloured already.
        vec3 topTint = vLayer.y < 7.5 ? vec3(0.8, 1.15, 0.7) : vec3(0.72, 0.8, 0.66);
        diffuseColor.rgb = mix(cA, cB * topTint, topT) * vColor.rgb;
        rockN = normalize(mix(nA, nB, topT));`,
      )
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(rockN, 0.0)).xyz);')
  }
  return mat
}

// --- the set --------------------------------------------------------------------

const BUILD_R = 1700
const DROP_R = 2300

/** Past this a big colossus shows its coarse twin (metres). Far jobs' ids are offset by FAR_ID. */
const LOD_R = 1600
const FAR_ID = 1_000_000

export class Rocks {
  private readonly farWaiting: Formation[] = []
  readonly group = new THREE.Group()
  readonly formations: Formation[] = []
  private readonly material: THREE.MeshStandardMaterial
  private readonly textures: TerrainTextures
  /** A small pool of meshing workers; each takes one formation at a time. */
  private readonly workers: Worker[] = []
  private readonly idle: Worker[] = []
  private readonly waiting: Formation[] = []
  /** Meshes built so far (tools wait on it). */
  built = 0

  constructor(
    private readonly terrain: Terrain,
    private readonly seed: number,
    textures: TerrainTextures,
    /** Somewhere a formation must not stand (lakes, the start). */
    keepClear: (x: number, z: number, r: number) => boolean,
  ) {
    this.material = rockMaterial(textures)
    this.textures = textures
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1))
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./rocks-worker.ts', import.meta.url), { type: 'module' })
      w.onmessage = (e: MessageEvent<{ id: number; mesh: RockMesh }>) => {
        this.idle.push(w)
        this.receive(e.data.id, e.data.mesh)
      }
      this.workers.push(w)
      this.idle.push(w)
    }
    const rand = mulberry32(seed ^ 0x40c45)
    const regions = terrain.base.regions
    for (const land of Object.keys(PLAN) as RegionName[]) {
      for (const [kind, count] of PLAN[land]) {
        let placed = 0
        for (let tries = 0; tries < count * 60 && placed < count; tries++) {
          const a = rand() * Math.PI * 2
          const d = (land === 'valley' ? 250 + rand() * 650 : 700 + rand() * 2000) * SPREAD
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
          const layers: [number, number] = [land === 'desert' ? LAYER.redrock : LAYER.rock, land === 'desert' ? LAYER.sand : land === 'forest' ? LAYER.forest : LAYER.grass]
          this.formations.push({ id: this.formations.length, kind, seed: fseed, x, y: lo, z, rot, cos: Math.cos(rot), sin: Math.sin(rot), ...made, land, mesh: null, queued: false, res: 64, always: false, layers, scale: 9, tint: [1.15, 1.25, 1.4], float: null })
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

  /**
   * Add one of the colossi (hand-placed). It is meshed at once (before any
   * rock) and kept whatever the distance; unless it floats, it is solid.
   */
  addColossus(p: ColossusPlacement): void {
    const made = make(p.kind, p.seed, this.seed)
    let y = p.y
    if (y === undefined) {
      const r = Math.min(Math.max(made.hx, made.hz), 160)
      let lo = this.terrain.heightAt(p.x, p.z)
      for (let k = 0; k < 12; k++) lo = Math.min(lo, this.terrain.heightAt(p.x + Math.cos(k * 0.524) * r * 0.6, p.z + Math.sin(k * 0.524) * r * 0.6))
      y = lo - (p.sink ?? 0)
    }
    this.formations.push({
      id: this.formations.length,
      kind: p.kind,
      seed: p.seed,
      x: p.x,
      y,
      z: p.z,
      rot: p.rot,
      cos: Math.cos(p.rot),
      sin: Math.sin(p.rot),
      ...made,
      land: this.terrain.base.regions.name(p.x, p.z),
      mesh: null,
      queued: false,
      res: p.res ?? 110,
      always: true,
      layers: p.layers,
      scale: p.scale ?? 12,
      tint: p.tint ?? [1, 1, 1],
      float: p.float ?? null,
    })
  }

  /**
   * A built colossus (architecture: pillars, stairs, gates): its own crisp
   * geometry (local, y up from `y`), and an exact field for collision.
   */
  addBuilt(shape: Shape, geometry: THREE.BufferGeometry, p: { x: number; y: number; z: number; rot: number; layers: [number, number]; scale: number; tint?: [number, number, number]; occlusion?: Parameters<typeof rockMaterial>[1] }): void {
    const n = geometry.getAttribute('position').count
    const tint = p.tint ?? [1, 1, 1]
    const col = new Float32Array(n * 3)
    const layer = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      col.set(tint, i * 3)
      layer.set([p.layers[0], p.layers[1], p.scale], i * 3)
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(col, 3))
    geometry.setAttribute('aLayer', new THREE.BufferAttribute(layer, 3))
    geometry.computeBoundingSphere()
    const mesh = new THREE.Mesh(geometry, p.occlusion ? rockMaterial(this.textures, p.occlusion) : this.material)
    mesh.position.set(p.x, p.y, p.z)
    mesh.rotation.y = p.rot
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.name = 'colossus-built'
    this.group.add(mesh)
    this.formations.push({
      id: this.formations.length,
      kind: 'built',
      seed: 0,
      x: p.x,
      y: p.y,
      z: p.z,
      rot: p.rot,
      cos: Math.cos(p.rot),
      sin: Math.sin(p.rot),
      ...shape,
      land: this.terrain.base.regions.name(p.x, p.z),
      mesh,
      queued: false,
      res: 0,
      always: true,
      layers: p.layers,
      scale: p.scale,
      tint,
      float: null,
    })
  }

  /** Floating colossi bob and turn. */
  animate(t: number): void {
    for (const f of this.formations) {
      if (!f.float || !f.mesh) continue
      f.mesh.position.y = f.y + Math.sin(t * 0.13 + f.float.phase) * f.float.amp
      f.mesh.rotation.y = f.rot + t * f.float.spin
      if (f.far) {
        f.far.position.y = f.mesh.position.y
        f.far.rotation.y = f.mesh.rotation.y
      }
    }
  }

  /** Mesh formations coming near (in the worker, nearest first); drop far ones. */
  update(cam: THREE.Vector3): void {
    for (const f of this.formations) {
      const d = Math.hypot(f.x - cam.x, f.z - cam.z)
      // A big colossus seen from afar: its coarse twin (built first — it is quick), the
      // detailed mesh only within LOD_R. (At 2 km a 200-cell mesh was ~half a million
      // triangles for a few hundred pixels.)
      if (f.always && f.res >= 100) {
        if (f.far === undefined) f.far = null
        if (!f.far && !f.farQueued) {
          f.farQueued = true
          this.farWaiting.push(f)
        }
        const useFar = !!f.far && (d > LOD_R || !f.mesh)
        if (f.far) f.far.visible = useFar
        if (f.mesh) f.mesh.visible = !useFar
      }
      if ((d < BUILD_R || f.always) && !f.mesh && !f.queued) {
        f.queued = true
        this.waiting.push(f)
      } else if (d > DROP_R && f.mesh && !f.always) {
        this.group.remove(f.mesh)
        f.mesh.geometry.dispose()
        f.mesh = null
      }
    }
    while (this.idle.length && this.farWaiting.length) {
      const f = this.farWaiting.pop()!
      this.idle.pop()!.postMessage({ id: f.id + FAR_ID, kind: f.kind, seed: f.seed, worldSeed: this.seed, res: Math.max(48, Math.round(f.res * 0.34)) })
    }
    if (!this.idle.length || !this.waiting.length) return
    // The colossi first (they are seen from everywhere), then the nearest rock.
    const key = (f: Formation) => (f.always ? -1e9 : 0) + Math.hypot(f.x - cam.x, f.z - cam.z)
    this.waiting.sort((a, b) => key(b) - key(a))
    while (this.idle.length && this.waiting.length) {
      const f = this.waiting.pop()!
      this.idle.pop()!.postMessage({ id: f.id, kind: f.kind, seed: f.seed, worldSeed: this.seed, res: f.res })
    }
  }

  /** Nothing left to mesh near the camera. */
  get settled(): boolean {
    return this.idle.length === this.workers.length && this.waiting.length === 0 && this.farWaiting.length === 0
  }

  private receive(id: number, m: RockMesh): void {
    const far = id >= FAR_ID
    const f = this.formations[far ? id - FAR_ID : id]
    if (far) f.farQueued = false
    else f.queued = false
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(m.position, 3))
    g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3))
    const col = new Float32Array(m.ao.length * 3)
    const layer = new Float32Array(m.ao.length * 3)
    const [tr, tg, tb] = f.tint
    for (let i = 0; i < m.ao.length; i++) {
      col.set([m.ao[i] * tr, m.ao[i] * tg, m.ao[i] * tb], i * 3)
      layer.set([f.layers[0], f.layers[1], f.scale], i * 3)
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.setAttribute('aLayer', new THREE.BufferAttribute(layer, 3))
    g.setIndex(new THREE.BufferAttribute(m.index, 1))
    g.computeBoundingSphere()
    const mesh = new THREE.Mesh(g, this.material)
    mesh.position.set(f.x, f.y, f.z)
    mesh.rotation.y = f.rot
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.name = `rock-${f.kind}${far ? '-far' : ''}`
    if (far) {
      f.far = mesh
      // (Only seen from afar: it need not cast the near shadows.)
      mesh.castShadow = false
      this.group.add(mesh)
      return
    }
    f.mesh = mesh
    this.group.add(mesh)
    this.built++
  }

  /** Formations near (x, z) within `r`. */
  private near(x: number, z: number, r: number): Formation[] {
    // (A stone held still — a chained one, float with no drift — is solid
    // like any other: you can climb it and stand on it.)
    return this.formations.filter((f) => (!f.float || (f.float.amp === 0 && f.float.spin === 0)) && Math.abs(f.x - x) < f.hx + f.hz + r && Math.abs(f.z - z) < f.hx + f.hz + r)
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

  /**
   * A climbable solid just ahead of `p` (facing `yaw`): the formation and the
   * point where reaching out meets it, or null.
   */
  solidAhead(p: THREE.Vector3, yaw: number): { solid: { sdf(x: number, y: number, z: number): number }; at: THREE.Vector3 } | null {
    const fx = Math.sin(yaw)
    const fz = Math.cos(yaw)
    // Reach out from the chest (outside the rock) until the hand meets the
    // surface: the hold is on the face you are looking at, never inside.
    for (const f of this.near(p.x, p.z, 3)) {
      if (this.sdf(f, p.x, p.y, p.z) <= 0) continue
      for (let t = 0; t <= 2.2; t += 0.1) {
        const x = p.x + fx * t
        const z = p.z + fz * t
        if (this.sdf(f, x, p.y, z) < 0.05) return { solid: { sdf: (a, b, c) => this.sdf(f, a, b, c) }, at: new THREE.Vector3(x, p.y, z) }
      }
    }
    return null
  }

  /** Distance to the nearest solid rock at a point (Infinity when none is near). */
  sdfAt(x: number, y: number, z: number): number {
    let d = Infinity
    for (const f of this.near(x, z, 2)) d = Math.min(d, this.sdf(f, x, y, z))
    return d
  }

  /** The highest solid surface over (x, z) among the formations (null if none is there). */
  topAt(x: number, z: number): number | null {
    let best: number | null = null
    for (const f of this.near(x, z, 1)) {
      let y = f.y + f.cy + f.hy + 2
      const lo = f.y + f.cy - f.hy - 2
      for (; y > lo; y -= 0.5) if (this.sdf(f, x, y, z) < 0) break
      if (y <= lo) continue
      let a = y
      let b = y + 0.5
      for (let k = 0; k < 8; k++) {
        const m = (a + b) / 2
        if (this.sdf(f, x, m, z) < 0) a = m
        else b = m
      }
      if (best === null || b > best) best = b
    }
    return best
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
    for (const f of this.formations) {
      if (f.float) continue
      // Cheap reject, then the field itself near the ground.
      if (Math.abs(f.x - x) > f.hx + f.hz || Math.abs(f.z - z) > f.hx + f.hz) continue
      if (!f.always && Math.hypot(f.x - x, f.z - z) < Math.max(f.hx, f.hz) * 0.75) return true
      if (f.always && this.sdf(f, x, this.terrain.heightAt(x, z) + 2, z) < 3) return true
    }
    return false
  }
}
