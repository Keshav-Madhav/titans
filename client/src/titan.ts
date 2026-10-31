// The Titan: a mossy stone giant built from noise-displaced boulders, posed
// every frame from the shared gait planner. Legs use analytic two-bone IK so
// each foot sits exactly where the planner put it — which is where the
// footprint is carved.
//
// Segments are posed directly in world space between joint positions (no
// skeleton): each segment mesh is modelled hanging down -Y from its top joint
// at its true length, then placed with a basis built from the joint pair and
// the body's forward vector.

import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { makeDetailTexture } from './detail-texture'
import { LAYER, type TerrainTextures } from './terrain-material'
import { makeSimplex2, titanBody, TitanGait, type GaitEvent, type GaitInput, type Terrain, type TitanBody } from '@titans/shared'

type V3 = THREE.Vector3

interface LumpSpec {
  at: number // 0..1 along the segment
  r: [number, number, number] // radii as fractions of height
  off?: [number, number] // x, z offset as fractions of height
}

// Segment shapes, all as fractions of Titan height. Hunched, heavy, long-armed:
// the reel's silhouette.
// Shaped after the reel's giants: a hulking, gorilla-like mass of eroded
// stone — great shoulders and back, a small head sunk between them, long
// heavy arms hanging to the knees, short pillar legs. Lumps overlap so the
// body reads as one sculpted form, not a stack of boulders.
const SHAPES: Record<string, { len: number; lumps: LumpSpec[] }> = {
  torso: {
    len: 0.32,
    lumps: [
      { at: 0.06, r: [0.22, 0.12, 0.17], off: [0, -0.035] }, // the back's great hump
      { at: 0.04, r: [0.12, 0.11, 0.12], off: [0.175, -0.01] }, // shoulder caps
      { at: 0.04, r: [0.12, 0.11, 0.12], off: [-0.175, -0.01] },
      { at: 0.26, r: [0.19, 0.13, 0.15], off: [0, 0.035] }, // chest
      { at: 0.32, r: [0.17, 0.14, 0.13], off: [0, -0.05] }, // back
      { at: 0.56, r: [0.15, 0.12, 0.13], off: [0, 0.035] }, // belly
      { at: 0.62, r: [0.14, 0.12, 0.12], off: [0, -0.03] },
      { at: 0.9, r: [0.14, 0.09, 0.12] }, // hips
    ],
  },
  head: {
    len: 0.07,
    lumps: [
      { at: 0.3, r: [0.058, 0.06, 0.062], off: [0, 0.02] },
      { at: 0.15, r: [0.05, 0.03, 0.04], off: [0, 0.05] }, // brow
    ],
  },
  upperArm: {
    len: 0.25,
    lumps: [
      { at: 0.02, r: [0.1, 0.09, 0.1] },
      { at: 0.4, r: [0.085, 0.12, 0.088] },
      { at: 0.82, r: [0.075, 0.08, 0.075] },
    ],
  },
  forearm: {
    len: 0.24,
    lumps: [
      { at: 0.15, r: [0.085, 0.1, 0.088] },
      { at: 0.55, r: [0.078, 0.11, 0.08] },
      { at: 0.9, r: [0.065, 0.06, 0.068] },
    ],
  },
  hand: {
    len: 0.08,
    lumps: [
      { at: 0.45, r: [0.08, 0.07, 0.075] },
      { at: 0.8, r: [0.065, 0.04, 0.06], off: [0, 0.02] },
    ],
  },
  thigh: {
    len: 0.225,
    lumps: [
      { at: 0.08, r: [0.118, 0.1, 0.12] },
      { at: 0.45, r: [0.108, 0.12, 0.112], off: [0, 0.01] },
      { at: 0.86, r: [0.09, 0.07, 0.095] },
    ],
  },
  shin: {
    len: 0.215,
    lumps: [
      { at: 0.12, r: [0.095, 0.08, 0.1] },
      { at: 0.48, r: [0.092, 0.11, 0.094], off: [0, -0.01] },
      { at: 0.85, r: [0.085, 0.06, 0.088] },
    ],
  },
  foot: {
    len: 0.04,
    lumps: [
      { at: 0.5, r: [0.075, 0.04, 0.11], off: [0, 0.03] },
      { at: 0.7, r: [0.055, 0.035, 0.06], off: [0, 0.09] },
    ],
  },
}

// Beige sandstone with olive moss (awake); red sandstone under snow (a mountain).
const STONE = new THREE.Color(0xa59a84)
const STONE_DARK = new THREE.Color(0x7b7163)
const MOSS = new THREE.Color(0x6a7340)
const RED = new THREE.Color(0xb3684c)
const RED_DARK = new THREE.Color(0x8a4834)
const SNOW = new THREE.Color(0xf0efea)

let stoneTex: THREE.DataTexture | null = null

/**
 * Stone up close: the detail texture projected along three axes in the
 * part's own space (so it stays glued to a moving body), three scales of
 * colour variation, thin dark cracks, and a bump from the same texture's
 * screen-space slope (perturbed normal, as three's bumpMap does it).
 */
/** The giants' skin (the 'hide' layer of the texture arrays): set once before any giant is made. */
let hideTex: TerrainTextures | null = null
export function setGiantSkin(tex: TerrainTextures): void {
  hideTex = tex
}

function addStoneDetail(mat: THREE.MeshStandardMaterial): void {
  stoneTex ??= makeDetailTexture(4242)
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.stoneMap = { value: stoneTex }
    shader.uniforms.tLayerColor = { value: hideTex?.color ?? null }
    shader.uniforms.tLayerNormal = { value: hideTex?.normal ?? null }
    shader.defines = { ...(shader.defines ?? {}), ...(hideTex ? { HIDE: 1, HIDE_LAYER: `${LAYER.hide}.0` } : {}) }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vStonePos;\nvarying vec3 vStoneNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStonePos = position;\nvStoneNrm = normal;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D stoneMap;
        varying vec3 vStonePos;
        varying vec3 vStoneNrm;
        #ifdef HIDE
        uniform highp sampler2DArray tLayerColor;
        uniform highp sampler2DArray tLayerNormal;
        vec3 hideN;
        // The hide, tri-planar in the part's own space (it moves with the limb), at two scales.
        vec3 hideTri(vec3 p, vec3 w, float s, out vec3 nrm) {
          vec3 cx = texture(tLayerColor, vec3(p.zy * s, HIDE_LAYER)).rgb;
          vec3 cy = texture(tLayerColor, vec3(p.xz * s, HIDE_LAYER)).rgb;
          vec3 cz = texture(tLayerColor, vec3(p.xy * s, HIDE_LAYER)).rgb;
          vec2 nx = texture(tLayerNormal, vec3(p.zy * s, HIDE_LAYER)).rg * 2.0 - 1.0;
          vec2 ny = texture(tLayerNormal, vec3(p.xz * s, HIDE_LAYER)).rg * 2.0 - 1.0;
          vec2 nz = texture(tLayerNormal, vec3(p.xy * s, HIDE_LAYER)).rg * 2.0 - 1.0;
          nrm = vec3(nx.x * w.x + ny.x * w.y + nz.x * w.z, nx.y * w.x + ny.y * w.y + nz.y * w.z, 0.0);
          return cx * w.x + cy * w.y + cz * w.z;
        }
        #endif
        float stoneTri(vec3 p, vec3 w, float s) {
          return texture2D(stoneMap, p.yz * s).r * w.x + texture2D(stoneMap, p.xz * s).r * w.y + texture2D(stoneMap, p.xy * s).r * w.z;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 sw = pow(abs(normalize(vStoneNrm)), vec3(4.0));
        sw /= (sw.x + sw.y + sw.z);
        float sd1 = stoneTri(vStonePos, sw, 0.11);
        float sd2 = stoneTri(vStonePos, sw, 0.37);
        float sd3 = stoneTri(vStonePos, sw, 0.027);
        // Close-up detail only: cracks and bump fade out with distance, and
        // the crack line is as wide as a pixel needs it to be (no sparkle).
        float stoneNear = 1.0 - smoothstep(30.0, 220.0, length(vViewPosition));
        float cw = fwidth(sd2);
        float crackLine = 1.0 - smoothstep(cw, cw * 2.0 + 0.025, abs(sd2 - 0.5));
        float crack = 1.0 - crackLine * 0.38 * stoneNear;
        diffuseColor.rgb *= (0.78 + 0.44 * sd1) * (0.88 + 0.24 * sd3) * crack;
        float stoneH = sd1 * stoneNear;
        #ifdef HIDE
        {
          // The colossus hide over the body's own colours: cracks, lichen, matted moss.
          vec3 hn1; vec3 hn2;
          vec3 h1 = hideTri(vStonePos, sw, 1.0 / 9.0, hn1);
          vec3 h2 = hideTri(vStonePos + 31.0, sw, 1.0 / 46.0, hn2);
          vec3 hide = mix(h2, h1, 0.4 + 0.6 * stoneNear);
          float hl = dot(hide, vec3(0.299, 0.587, 0.114));
          // Keep the body's hue (sandstone, moss), take the hide's light and dark and its moss.
          diffuseColor.rgb = mix(diffuseColor.rgb * hl * 2.1, hide * 1.15, 0.45);
          hideN = mix(hn2, hn1, stoneNear) * 0.8;
        }
        #endif`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec2 dH = vec2(dFdx(stoneH), dFdy(stoneH)) * 0.9;
          vec3 sx = dFdx(-vViewPosition);
          vec3 sy = dFdy(-vViewPosition);
          vec3 r1 = cross(sy, normal);
          vec3 r2 = cross(normal, sx);
          float det = dot(sx, r1) * faceDirection;
          vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
          normal = normalize(abs(det) * normal - grad);
          #ifdef HIDE
          // The hide's relief, nudging the normal in view space (approximate, but it moves with the light).
          normal = normalize(normal + vec3(hideN.xy, 0.0));
          #endif
        }`,
      )
  }
}

/** How far a boulder's surface reaches along a unit direction (×radius). */
export type Bulge = (dx: number, dy: number, dz: number) => number

function boulderNoise(seed: number): { bulge: Bulge; noise3: (x: number, y: number, z: number) => number } {
  const n1 = makeSimplex2(seed)
  const n2 = makeSimplex2(seed + 7)
  const noise3 = (x: number, y: number, z: number) => (n1(x, y) + n1(y + 3.1, z) + n2(z - 1.7, x)) / 3
  const bulge: Bulge = (x, y, z) => 1 + 0.2 * noise3(x * 1.3, y * 1.3, z * 1.3) + 0.07 * noise3(x * 3.7 + 9, y * 3.7, z * 3.7)
  return { bulge, noise3 }
}

/**
 * One boulder of a body part, in the part's local frame: centre, radii and
 * bulge. The mesh is built from exactly this, so climbers can move over the
 * real surface analytically (no physics engine needed).
 */
export interface LumpSurface {
  c: THREE.Vector3
  r: THREE.Vector3
  bulge: Bulge
}

export interface TitanPart {
  key: string
  mesh: THREE.Mesh
  lumps: LumpSurface[]
  /** Geometry per level of detail (the mesh shows one). Climbing never uses it. */
  lods: THREE.BufferGeometry[]
}

function boulder(rx: number, ry: number, rz: number, seed: number, detail: number, mossiness = 0): THREE.BufferGeometry {
  const { bulge, noise3 } = boulderNoise(seed)
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail)
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  g = mergeVertices(g)
  const p = g.getAttribute('position')
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const k = bulge(v.x, v.y, v.z)
    p.setXYZ(i, v.x * rx * k, v.y * ry * k, v.z * rz * k)
  }
  g.computeVertexNormals()
  const nrm = g.getAttribute('normal')
  const colors = new Float32Array(p.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const s = 0.5 + 0.5 * noise3(v.x * 0.15 + 4, v.y * 0.15, v.z * 0.15)
    const up = nrm.getY(i)
    const wobble = 0.25 * noise3(v.x * 0.2, v.y * 0.2, v.z * 0.2)
    if (mossiness > 0) {
      // A mountain: weathered red sandstone, snow lying on every ledge.
      c.copy(RED).lerp(RED_DARK, s * 0.75)
      c.lerp(SNOW, THREE.MathUtils.smoothstep(up + wobble, 0.42, 0.7))
    } else {
      c.copy(STONE).lerp(STONE_DARK, s * 0.7)
      c.lerp(MOSS, THREE.MathUtils.smoothstep(up + wobble, 0.45, 0.8) * 0.85)
    }
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
}

/** Icosahedron subdivision per level of detail: near, middle, far. */
const LOD_DETAIL = [4, 3, 2]
/** Camera distance (×height) beyond which each coarser level is used. */
const LOD_FAR = [2.2, 5]

function segment(name: string, H: number, seed: number, mossiness: number): { lods: THREE.BufferGeometry[]; lumps: LumpSurface[] } {
  const shape = SHAPES[name]
  const lumps: LumpSurface[] = shape.lumps.map((l, i) => ({
    c: new THREE.Vector3((l.off?.[0] ?? 0) * H, -l.at * shape.len * H, (l.off?.[1] ?? 0) * H),
    r: new THREE.Vector3(l.r[0] * H, l.r[1] * H, l.r[2] * H),
    bulge: boulderNoise(seed + i * 31).bulge,
  }))
  const lods = LOD_DETAIL.map((detail) => {
    const parts = lumps.map((L, i) => boulder(L.r.x, L.r.y, L.r.z, seed + i * 31, detail, mossiness).translate(L.c.x, L.c.y, L.c.z))
    const geometry = mergeGeometries(parts)!
    for (const p of parts) p.dispose()
    return geometry
  })
  return { lods, lumps }
}

const _x = new THREE.Vector3()
const _sitHand = new THREE.Vector3()
const _sitBend = new THREE.Vector3()
const _sitElbow = new THREE.Vector3()
const _y = new THREE.Vector3()
const _z = new THREE.Vector3()
const _m = new THREE.Matrix4()

/** Place a segment mesh at joint A, hanging toward B, facing `fwd`. */
function place(mesh: THREE.Object3D, a: V3, b: V3, fwd: V3): void {
  _y.subVectors(a, b).normalize()
  _z.copy(fwd).addScaledVector(_y, -fwd.dot(_y))
  if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1)
  _z.normalize()
  _x.crossVectors(_y, _z)
  _m.makeBasis(_x, _y, _z)
  mesh.quaternion.setFromRotationMatrix(_m)
  mesh.position.copy(a)
}

/** Two-bone IK: knee/elbow position given root, target, lengths, bend hint. */
function solveTwoBone(root: V3, target: V3, l1: number, l2: number, bend: V3, out: V3): void {
  const d = _x.subVectors(target, root)
  let dist = d.length()
  const max = (l1 + l2) * 0.999
  if (dist > max) {
    target.copy(root).addScaledVector(d.normalize(), max)
    dist = max
    d.subVectors(target, root)
  }
  dist = Math.max(dist, Math.abs(l1 - l2) + 1e-3)
  const dir = d.normalize()
  const along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along))
  _y.copy(bend).addScaledVector(dir, -bend.dot(dir)).normalize()
  out.copy(root).addScaledVector(dir, along).addScaledVector(_y, h)
}

export class Titan {
  readonly group = new THREE.Group()
  readonly body: TitanBody
  /** Replaced when a new Titan awakens (the old one became a mountain). */
  gait: TitanGait
  /** 0 standing … 1 sitting. Eases toward the gait's `resting`. */
  restBlend = 0
  readonly H: number
  readonly pelvis = new THREE.Vector3()
  readonly chest = new THREE.Vector3()
  readonly head = new THREE.Vector3()
  private readonly meshes: Record<string, THREE.Mesh> = {}
  /** Every body part, with its boulder surfaces, for climbing. */
  readonly parts: TitanPart[] = []
  private readonly partIndex = new Map<string, TitanPart>()
  /** Seconds of shrug left: the upper body heaves to throw climbers off. */
  private shrugT = 0
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0, envMapIntensity: 1.25 })
  private readonly j = {
    hip: [new THREE.Vector3(), new THREE.Vector3()],
    knee: [new THREE.Vector3(), new THREE.Vector3()],
    ankle: [new THREE.Vector3(), new THREE.Vector3()],
    shoulder: [new THREE.Vector3(), new THREE.Vector3()],
    elbow: [new THREE.Vector3(), new THREE.Vector3()],
    hand: [new THREE.Vector3(), new THREE.Vector3()],
  }
  private readonly fwd = new THREE.Vector3()
  private readonly left = new THREE.Vector3()
  private readonly foot = { x: 0, z: 0, lift: 0 }
  private readonly tmp = new THREE.Vector3()
  private readonly tmp2 = new THREE.Vector3()
  private breath = 0

  constructor(height: number, x: number, z: number, heading: number, seed = 7, mossiness = 0) {
    this.H = height
    this.body = titanBody(height)
    this.gait = new TitanGait(this.body, x, z, heading)
    addStoneDetail(this.material)
    const add = (key: string, shape: string, s: number) => {
      const { lods, lumps } = segment(shape, height, seed + s, mossiness)
      const m = new THREE.Mesh(lods[0], this.material)
      m.castShadow = true
      m.receiveShadow = true
      this.meshes[key] = m
      this.group.add(m)
      const part = { key, mesh: m, lumps, lods }
      this.parts.push(part)
      this.partIndex.set(key, part)
    }
    add('torso', 'torso', 1)
    add('head', 'head', 2)
    for (const s of ['L', 'R']) {
      const o = s === 'L' ? 0 : 100
      add('upperArm' + s, 'upperArm', 10 + o)
      add('forearm' + s, 'forearm', 20 + o)
      add('hand' + s, 'hand', 30 + o)
      add('thigh' + s, 'thigh', 40 + o)
      add('shin' + s, 'shin', 50 + o)
      add('foot' + s, 'foot', 60 + o)
    }
    this.group.name = 'titan'
  }

  step(dt: number, input: GaitInput, out: GaitEvent[]): void {
    this.breath += dt
    this.shrugT = Math.max(0, this.shrugT - dt)
    this.gait.step(dt, input, out)
  }

  private lod = 0

  /** Pick boulder detail by distance from the camera (2.2 H and 5 H thresholds). */
  setLodFor(camera: THREE.Vector3): void {
    const d = Math.hypot(camera.x - this.gait.x, camera.y - this.pelvis.y, camera.z - this.gait.z) / this.H
    const lod = d > LOD_FAR[1] ? 2 : d > LOD_FAR[0] ? 1 : 0
    if (lod === this.lod) return
    this.lod = lod
    for (const p of this.parts) p.mesh.geometry = p.lods[lod]
  }

  part(key: string): TitanPart | undefined {
    return this.partIndex.get(key)
  }

  /** Heave the shoulders to throw off climbers. */
  shrug(seconds = 1.4): void {
    this.shrugT = seconds
  }

  get shrugging(): boolean {
    return this.shrugT > 0
  }

  /** Solve the pose for the current gait state. */
  /** A new Titan wakes at (x, z): fresh gait, standing up. */
  awaken(x: number, z: number, heading: number): void {
    this.gait = new TitanGait(this.body, x, z, heading)
  }

  pose(terrain: Terrain, dt = 1 / 60): void {
    // Sitting down (or getting up) takes a few seconds.
    const want = this.gait.resting ? 1 : 0
    this.restBlend += Math.sign(want - this.restBlend) * Math.min(Math.abs(want - this.restBlend), dt / 3)
    const rb = this.restBlend * this.restBlend * (3 - 2 * this.restBlend)
    const g = this.gait
    const b = this.body
    const H = this.H
    const J = this.j
    this.fwd.set(Math.sin(g.heading), 0, Math.cos(g.heading))
    this.left.set(this.fwd.z, 0, -this.fwd.x)

    // Feet: planner positions on the ground (+ swing arc).
    const ankleUp = 0.035 * H
    let groundSum = 0
    for (const f of [0, 1] as const) {
      g.footPos(f, this.foot)
      const gy = terrain.heightAt(this.foot.x, this.foot.z)
      groundSum += gy
      // Sitting, the feet come forward and flat.
      const fx = this.foot.x + this.fwd.x * 0.3 * H * rb
      const fz = this.foot.z + this.fwd.z * 0.3 * H * rb
      J.ankle[f].set(fx, terrain.heightAt(fx, fz) + ankleUp + this.foot.lift * (1 - rb), fz)
    }

    // Pelvis: over the body point, swaying toward the stance foot, bobbing
    // with the step, and low enough that both legs can reach their feet.
    const stance = g.isSwinging ? (g.swingFoot === 0 ? 1 : 0) : -1
    const swayAmt = stance < 0 ? 0 : (stance === 0 ? 1 : -1) * 0.022 * H * Math.sin(Math.PI * g.phase)
    const bob = g.isSwinging ? 0.012 * H * Math.sin(Math.PI * g.phase) : 0
    const groundBody = Math.max(groundSum / 2, terrain.heightAt(g.x, g.z) - 0.05 * H)
    this.pelvis
      .set(g.x, groundBody + (b.hipHeight * 0.985 + bob) * (1 - rb) + 0.075 * H * rb, g.z)
      .addScaledVector(this.left, swayAmt * (1 - rb))
      .addScaledVector(this.fwd, -0.04 * H * rb)
    const reach = (b.thigh + b.shin) * 0.985
    for (const f of [0, 1] as const) {
      J.hip[f].copy(this.pelvis).addScaledVector(this.left, f === 0 ? b.hipHalf : -b.hipHalf)
      const dx = J.hip[f].x - J.ankle[f].x
      const dz = J.hip[f].z - J.ankle[f].z
      const flat = dx * dx + dz * dz
      const maxY = J.ankle[f].y + Math.sqrt(Math.max(0, reach * reach - flat))
      if (J.hip[f].y > maxY) this.pelvis.y -= J.hip[f].y - maxY
    }
    for (const f of [0, 1] as const) J.hip[f].copy(this.pelvis).addScaledVector(this.left, f === 0 ? b.hipHalf : -b.hipHalf)

    // Legs.
    for (const f of [0, 1] as const) {
      // Knees bend forward walking, and up when sitting.
      this.tmp.copy(this.fwd).multiplyScalar(1 - rb).add(_x.set(0, rb, 0)).normalize()
      solveTwoBone(J.hip[f], J.ankle[f], b.thigh, b.shin, this.tmp, J.knee[f])
    }

    // Upper body: hunched forward, counter-rotating gently with the stride.
    // A shrug heaves it side to side, hard, for a moment.
    const breathe = Math.sin(this.breath * 0.9) * 0.004 * H
    const heave = this.shrugT > 0 ? Math.sin(this.breath * 9) * 0.03 * H * Math.min(1, this.shrugT * 2) : 0
    this.chest
      .copy(this.pelvis)
      .addScaledVector(this.fwd, 0.1 * H)
      .addScaledVector(this.left, -swayAmt * 0.6 + heave)
    // Sitting: sat on the ground, back fairly straight (it was hunched over
    // its knees, and read as a crouch), head a little bowed.
    this.chest.y += SHAPES.torso.len * H * 0.97 + breathe + Math.abs(heave) * 0.5
    this.chest.addScaledVector(this.fwd, -0.02 * H * rb)
    // The head sits low and forward, sunk between the shoulders.
    this.head.copy(this.chest).addScaledVector(this.fwd, (0.085 + 0.01 * rb) * H)
    this.head.y += (-0.005 - 0.02 * rb) * H

    // Arms swing opposite to the legs, by each foot's lead.
    for (const f of [0, 1] as const) {
      const side = f === 0 ? 1 : -1
      J.shoulder[f].copy(this.chest).addScaledVector(this.left, side * 0.2 * H)
      J.shoulder[f].y -= 0.03 * H
      const other = f === 0 ? 1 : 0
      g.footPos(other, this.foot)
      const lead = ((this.foot.x - g.x) * this.fwd.x + (this.foot.z - g.z) * this.fwd.z) / b.stepLen
      const swing = THREE.MathUtils.clamp(lead, -1, 1) * 0.42
      this.tmp.set(0, -Math.cos(swing), 0).addScaledVector(this.fwd, Math.sin(swing)).addScaledVector(this.left, side * 0.2).normalize()
      J.elbow[f].copy(J.shoulder[f]).addScaledVector(this.tmp, SHAPES.upperArm.len * H)
      const fore = swing + 0.38
      this.tmp2.set(0, -Math.cos(fore), 0).addScaledVector(this.fwd, Math.sin(fore)).addScaledVector(this.left, side * 0.08).normalize()
      J.hand[f].copy(J.elbow[f]).addScaledVector(this.tmp2, SHAPES.forearm.len * H)
      if (rb > 0) {
        // Sitting: hands rest on the knees, elbows out and back.
        _sitHand.copy(J.knee[f]).addScaledVector(this.fwd, 0.02 * H)
        _sitHand.y += 0.04 * H
        _sitBend.copy(this.fwd).negate().addScaledVector(this.left, side * 0.6).normalize()
        solveTwoBone(J.shoulder[f], _sitHand, SHAPES.upperArm.len * H, SHAPES.forearm.len * H, _sitBend, _sitElbow)
        J.elbow[f].lerp(_sitElbow, rb)
        J.hand[f].lerp(_sitHand, rb)
      }
    }

    // Place meshes.
    const M = this.meshes
    place(M.torso, this.chest, this.pelvis, this.fwd)
    this.tmp.copy(this.head)
    this.tmp.y += SHAPES.head.len * H * 0.6
    place(M.head, this.tmp, this.chest, this.fwd)
    for (const f of [0, 1] as const) {
      const s = f === 0 ? 'L' : 'R'
      place(M['upperArm' + s], J.shoulder[f], J.elbow[f], this.fwd)
      place(M['forearm' + s], J.elbow[f], J.hand[f], this.fwd)
      this.tmp.copy(J.hand[f]).addScaledVector(this.tmp2.set(0, -1, 0), 1)
      place(M['hand' + s], J.hand[f], this.tmp, this.fwd)
      place(M['thigh' + s], J.hip[f], J.knee[f], this.fwd)
      place(M['shin' + s], J.knee[f], J.ankle[f], this.fwd)
      this.tmp.copy(J.ankle[f])
      this.tmp.y -= 1
      place(M['foot' + s], J.ankle[f], this.tmp, this.fwd)
    }
  }

  /** World position of a foot's ankle (for effects and tools). */
  ankle(foot: 0 | 1): THREE.Vector3 {
    return this.j.ankle[foot]
  }
}
