// What makes a giant read as a colossus and not a heap of rock (Shadow of
// the Colossus): carved stone plating grown onto the body — a mask with
// eyes that glow, pauldrons, a breastplate, shells down the spine, a girdle,
// bracers, greaves — and matted fur in the gaps between the plates.
//
// A plate is a patch of the part's own boulder surface (the same bulging
// ellipsoid the climber holds), raised a couple of metres: it follows the
// rock exactly, rises steeply at its edges like a cut plate, and tucks into
// the stone at its border. Fur is crossed cards of strands rooted on the
// surface, lying back along the limb. Both are built in the part's own
// frame and ride on its mesh.

import * as THREE from 'three'
import { weatheredStone } from './weathered-stone'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { mulberry32 } from '@titans/shared'
import { LAYER, type TerrainTextures } from './terrain-material'
import type { LumpSurface } from './titan'

/** A plate: on lump `lump`, centred on direction `dir` (lump-normalised), `a` × `b` radians, `t` thick (× height). */
interface PlateSpec {
  lump: number
  dir: [number, number, number]
  a: number
  b: number
  t?: number
  /** Mirror x on the right side (for plates on one side of a limb). */
  side?: boolean
}

const PLATES: Record<string, PlateSpec[]> = {
  torso: [
    { lump: 3, dir: [0, 0.15, 1], a: 0.55, b: 0.5 }, // breastplate
    { lump: 3, dir: [0.62, 0.2, 0.75], a: 0.3, b: 0.38 },
    { lump: 3, dir: [-0.62, 0.2, 0.75], a: 0.3, b: 0.38 },
    { lump: 5, dir: [0, -0.1, 1], a: 0.5, b: 0.42 }, // belly
    { lump: 0, dir: [0, 0.55, -0.83], a: 0.5, b: 0.28 }, // shells down the spine
    { lump: 0, dir: [0, -0.05, -1], a: 0.48, b: 0.28 },
    { lump: 4, dir: [0, 0.1, -1], a: 0.5, b: 0.32 },
    { lump: 6, dir: [0, 0, -1], a: 0.46, b: 0.34 },
    { lump: 1, dir: [0.35, 1, 0.05], a: 0.75, b: 0.75, t: 0.016 }, // pauldrons
    { lump: 2, dir: [-0.35, 1, 0.05], a: 0.75, b: 0.75, t: 0.016 },
  ],
  // (Fewer plates on the limbs than there were: banded all over, it read as a
  // machine; the body should be rock and hide, the armour a few great pieces.)
  head: [
    { lump: 0, dir: [0, -0.05, 1], a: 0.78, b: 0.7, t: 0.006 }, // the mask
    { lump: 0, dir: [0, 1, -0.35], a: 0.7, b: 0.6, t: 0.006 }, // helm
  ],
  upperArm: [{ lump: 1, dir: [1, 0.1, 0.2], a: 0.62, b: 0.55, side: true }],
  forearm: [{ lump: 1, dir: [1, 0.15, 0.3], a: 0.5, b: 0.7, side: true }],
  hand: [],
  thigh: [{ lump: 2, dir: [0, -0.2, 1], a: 0.58, b: 0.55, t: 0.012 }], // knee
  shin: [{ lump: 1, dir: [0, 0, 1], a: 0.66, b: 0.72 }], // greave
  foot: [],
}

/** Where fur grows: lump index and a test on the (lump-normalised) direction. */
const FUR: Record<string, Array<[number, (d: THREE.Vector3) => boolean]>> = {
  torso: [
    [0, (d) => d.z < 0.1 && Math.abs(d.x) > 0.42],
    [0, (d) => d.y > 0.5 && d.z < 0],
    [4, (d) => d.z < -0.2 && Math.abs(d.x) > 0.45],
    [6, (d) => d.z < 0 && Math.abs(d.x) > 0.5],
  ],
  head: [[0, (d) => d.z < -0.35]],
  upperArm: [[1, (d) => d.z < 0.1], [0, () => true]],
  forearm: [[2, (d) => d.y < 0.4]],
  thigh: [[1, (d) => d.z < 0.2], [0, (d) => d.z < -0.3]],
  shin: [[1, (d) => d.z < -0.35], [2, (d) => d.z < -0.2]],
}

const _d = new THREE.Vector3()

/** The surface point of a lump along unit direction d. */
function surface(L: LumpSurface, d: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const k = L.bulge(d.x, d.y, d.z)
  return out.set(L.c.x + L.r.x * d.x * k, L.c.y + L.r.y * d.y * k, L.c.z + L.r.z * d.z * k)
}

/** A tangent frame round unit vector n. */
function frame(n: THREE.Vector3, t1: THREE.Vector3, t2: THREE.Vector3): void {
  t1.set(0, 1, 0)
  if (Math.abs(n.y) > 0.9) t1.set(0, 0, 1)
  t1.addScaledVector(n, -t1.dot(n)).normalize()
  t2.crossVectors(n, t1)
}

/** One plate as a raised patch of the lump's surface (grid N×N), its edges rising steeply. */
function plate(L: LumpSurface, spec: PlateSpec, H: number, mirror: number, seed: number): THREE.BufferGeometry {
  const N = 14
  const rand = mulberry32(seed)
  const d0 = new THREE.Vector3(spec.dir[0] * (spec.side ? mirror : 1), spec.dir[1], spec.dir[2]).normalize()
  const t1 = new THREE.Vector3()
  const t2 = new THREE.Vector3()
  frame(d0, t1, t2)
  const thick = (spec.t ?? 0.009) * H
  const pos: number[] = []
  const col: number[] = []
  const p = new THREE.Vector3()
  const q = new THREE.Vector3()
  const grid: THREE.Vector3[] = []
  // A rounded rectangle: chamfer the corners; a slight random skew so plates differ.
  const skew = (rand() - 0.5) * 0.15
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const u = (i / N) * 2 - 1
      const v = (j / N) * 2 - 1
      _d.copy(d0)
        .addScaledVector(t1, v * spec.b)
        .addScaledVector(t2, (u + v * skew) * spec.a)
        .normalize()
      surface(L, _d, p)
      grid.push(p.clone())
    }
  }
  // Raise each grid point along the surface normal (from its neighbours), by a profile.
  const idx = (i: number, j: number) => j * (N + 1) + i
  const out: THREE.Vector3[] = []
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const a = grid[idx(Math.min(N, i + 1), j)].clone().sub(grid[idx(Math.max(0, i - 1), j)])
      const b = grid[idx(i, Math.min(N, j + 1))].clone().sub(grid[idx(i, Math.max(0, j - 1))])
      const n = new THREE.Vector3().crossVectors(b, a).normalize()
      // Outward: away from the lump's centre.
      if (n.dot(q.copy(grid[idx(i, j)]).sub(L.c)) < 0) n.negate()
      const u = Math.abs((i / N) * 2 - 1)
      const v = Math.abs((j / N) * 2 - 1)
      // Rounded-rectangle distance to the border (0 at the edge, 1 inside).
      const e = Math.pow(Math.pow(u, 6) + Math.pow(v, 6), 1 / 6)
      const h = e >= 1 ? -0.3 : Math.min(1, (1 - e) / 0.12)
      out.push(grid[idx(i, j)].clone().addScaledVector(n, thick * h - (e >= 1 ? thick * 0.3 : 0)))
      // Darker in a groove just inside the edge (a carved border), lighter on the face.
      const groove = Math.max(0, 1 - Math.abs(e - 0.82) / 0.05)
      const k = 0.92 + 0.12 * rand() - 0.35 * groove
      col.push(k, k, k)
    }
  }
  for (const v of out) pos.push(v.x, v.y, v.z)
  const index: number[] = []
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = idx(i, j)
      index.push(a, a + 1, a + N + 1, a + 1, a + N + 2, a + N + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(index)
  g.computeVertexNormals()
  // Wind every face outward (the grid's handedness depends on the frame).
  const nrm = g.getAttribute('normal')
  let outward = 0
  for (let i = 0; i < nrm.count; i++) outward += nrm.getX(i) * (out[i].x - L.c.x) + nrm.getY(i) * (out[i].y - L.c.y) + nrm.getZ(i) * (out[i].z - L.c.z)
  if (outward < 0) {
    for (let t = 0; t < index.length; t += 3) [index[t + 1], index[t + 2]] = [index[t + 2], index[t + 1]]
    g.setIndex(index)
    g.computeVertexNormals()
  }
  return g.toNonIndexed()
}

/** Strands of fur on a canvas: long, thin, curling a little, dark at the root, pale at the tip. */
let furTex: THREE.CanvasTexture | null = null
function furTexture(): THREE.CanvasTexture {
  if (furTex) return furTex
  const W = 128
  const Hh = 256
  const c = document.createElement('canvas')
  c.width = W
  c.height = Hh
  const g = c.getContext('2d')!
  const rand = mulberry32(5150)
  // Locks of hair, not a sheet of it: strands rooted along the bottom (v = 0,
  // the root, is the canvas's bottom row) gathering toward a shared tip and
  // thinning out to nothing, with gaps between the locks. (Drawn the other
  // way up, every card ended in a hard, full edge — rows of tiles.)
  for (let lock = 0; lock < 9; lock++) {
    const rootX = 10 + rand() * (W - 20)
    const tipX = rootX + (rand() - 0.5) * 34
    const reach = Hh * (0.6 + rand() * 0.38)
    const hue = 24 + rand() * 14
    const strands = 7 + Math.floor(rand() * 7)
    for (let i = 0; i < strands; i++) {
      const x0 = rootX + (rand() - 0.5) * 22
      const len = reach * (0.7 + rand() * 0.3)
      const x1 = tipX + (rand() - 0.5) * 8
      const grad = g.createLinearGradient(0, Hh, 0, Hh - len)
      grad.addColorStop(0, `hsla(${hue}, 24%, ${12 + rand() * 6}%, 1)`)
      grad.addColorStop(0.55, `hsla(${hue + 4}, 20%, ${24 + rand() * 10}%, 1)`)
      grad.addColorStop(1, `hsla(${hue + 6}, 16%, ${36 + rand() * 12}%, 0)`)
      g.strokeStyle = grad
      g.lineWidth = 2.4 + rand() * 2.8
      g.lineCap = 'round'
      g.beginPath()
      g.moveTo(x0, Hh)
      g.quadraticCurveTo(x0 + (x1 - x0) * 0.2 + (rand() - 0.5) * 10, Hh - len * 0.55, x1, Hh - len)
      g.stroke()
    }
  }
  furTex = new THREE.CanvasTexture(c)
  furTex.colorSpace = THREE.SRGBColorSpace
  furTex.anisotropy = 4
  return furTex
}

/** Fur: crossed cards rooted on the surface, lying back along the limb (local −y). */
function fur(lumps: LumpSurface[], zones: Array<[number, (d: THREE.Vector3) => boolean]>, H: number, seed: number, avoid: Array<{ lump: number; d: THREE.Vector3; r: number }>): THREE.BufferGeometry | null {
  const rand = mulberry32(seed)
  const parts: THREE.BufferGeometry[] = []
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  const down = new THREE.Vector3()
  const side = new THREE.Vector3()
  for (const [li, test] of zones) {
    const L = lumps[li]
    if (!L) continue
    const area = (L.r.x * L.r.y + L.r.y * L.r.z + L.r.x * L.r.z) / (H * H)
    const tufts = Math.round(area * 19000)
    for (let k = 0; k < tufts; k++) {
      _d.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1)
      if (_d.lengthSq() > 1 || _d.lengthSq() < 0.01) continue
      _d.normalize()
      if (!test(_d) || avoid.some((a) => a.lump === li && a.d.angleTo(_d) < a.r)) continue
      surface(L, _d, p)
      // Normal of the ellipsoid there (ignoring the bulge: near enough for fur).
      n.set(_d.x / L.r.x, _d.y / L.r.y, _d.z / L.r.z).normalize()
      // Lying back along the limb, lifted off the surface a little.
      down.set(0, -1, 0).addScaledVector(n, n.y).normalize()
      if (down.lengthSq() < 0.01) down.set(0, 0, -1)
      side.crossVectors(n, down).normalize()
      // Long, heavy and combed down by its own weight: it hangs, it doesn't bristle.
      const len = (0.028 + rand() * 0.035) * H
      const w = len * 0.42
      for (const turn of [0, 1]) {
        const across = turn ? n.clone().multiplyScalar(0.35).addScaledVector(side, 0.65).normalize() : side
        const dir = down.clone().multiplyScalar(0.94).addScaledVector(n, 0.2 + rand() * 0.08).normalize()
        const root = p.clone().addScaledVector(n, -0.004 * H)
        const tip = root.clone().addScaledVector(dir, len)
        const a = root.clone().addScaledVector(across, -w / 2)
        const b = root.clone().addScaledVector(across, w / 2)
        const c = tip.clone().addScaledVector(across, w / 2)
        const e = tip.clone().addScaledVector(across, -w / 2)
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.Float32BufferAttribute([a, b, c, a, c, e].flatMap((v) => [v.x, v.y, v.z]), 3))
        g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2))
        const nn = [n.x, n.y, n.z]
        g.setAttribute('normal', new THREE.Float32BufferAttribute([...nn, ...nn, ...nn, ...nn, ...nn, ...nn], 3))
        parts.push(g)
      }
    }
  }
  return parts.length ? mergeGeometries(parts)! : null
}

/** Carved stone, tri-planar in the part's own space (it moves with the limb). */
function plateMaterial(tex: TerrainTextures, tint: THREE.Color): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, color: tint })
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tLayerColor = { value: tex.color }
    sh.uniforms.tLayerNormal = { value: tex.normal }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPlatePos;\nvarying vec3 vPlateN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPlatePos = position;\nvPlateN = normal;')
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform highp sampler2DArray tLayerColor;
        uniform highp sampler2DArray tLayerNormal;
        varying vec3 vPlatePos;
        varying vec3 vPlateN;
        vec2 plateNrm;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 w = pow(abs(normalize(vPlateN)), vec3(4.0));
          w /= (w.x + w.y + w.z);
          // Weathered rock, carved in patches (QA cycle 7: the 'carved' layer is rows of masonry
          // blocks — the plates read as a wall walking about, which the concept warns against).
          float s = 1.0 / 7.0;
          float LR = ${LAYER.rock}.0;
          float LC = ${LAYER.relief}.0;
          vec3 c = texture(tLayerColor, vec3(vPlatePos.zy * s, LR)).rgb * w.x + texture(tLayerColor, vec3(vPlatePos.xz * s, LR)).rgb * w.y + texture(tLayerColor, vec3(vPlatePos.xy * s, LR)).rgb * w.z;
          // (The terrain's own tints: raw, the rock texture is khaki — the plates came out leather-brown.)
          c *= vec3(1.12, 1.38, 1.65);
          plateNrm = (texture(tLayerNormal, vec3(vPlatePos.zy * s, LR)).rg * w.x + texture(tLayerNormal, vec3(vPlatePos.xz * s, LR)).rg * w.y + texture(tLayerNormal, vec3(vPlatePos.xy * s, LR)).rg * w.z) * 2.0 - 1.0;
          // Where a slow pattern rises, the old carving shows through (worn to nothing elsewhere).
          float patchK = smoothstep(0.15, 0.55, sin(vPlatePos.x * 0.045 + 1.3) * sin(vPlatePos.y * 0.038) * sin(vPlatePos.z * 0.041 + 0.7) + 0.2);
          if (patchK > 0.01) {
            float s2 = 1.0 / 9.0;
            vec3 cc = texture(tLayerColor, vec3(vPlatePos.zy * s2, LC)).rgb * w.x + texture(tLayerColor, vec3(vPlatePos.xz * s2, LC)).rgb * w.y + texture(tLayerColor, vec3(vPlatePos.xy * s2, LC)).rgb * w.z;
            vec2 cn = (texture(tLayerNormal, vec3(vPlatePos.zy * s2, LC)).rg * w.x + texture(tLayerNormal, vec3(vPlatePos.xz * s2, LC)).rg * w.y + texture(tLayerNormal, vec3(vPlatePos.xy * s2, LC)).rg * w.z) * 2.0 - 1.0;
            c = mix(c, cc * vec3(0.92, 0.86, 0.74) * 1.25, patchK * 0.85);
            plateNrm = mix(plateNrm, cn, patchK * 0.85);
          }
          // (Toward the body's grey-green: warm plates stood out as tan patches on a grey giant.)
          c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))) * vec3(0.92, 1.0, 0.96), 0.75);
          diffuseColor.rgb *= c * 1.35;
        }`,
      )
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(normal + vec3(plateNrm * 0.6, 0.0));')
  }
  return mat
}

const materials = new Map<string, THREE.Material>()

/**
 * The plating, fur and eyes for one part (key like 'forearmL'), in the part's
 * frame, as one group to add to the part's mesh. `petrified`: a sleeping
 * giant's (red stone, no glow in the eyes).
 */
export function armorFor(key: string, shape: string, lumps: LumpSurface[], H: number, seed: number, tex: TerrainTextures, petrified: boolean): THREE.Group {
  const group = new THREE.Group()
  const mirror = key.endsWith('R') ? -1 : 1
  const specs = PLATES[shape] ?? []
  const plates = specs.filter((s) => lumps[s.lump]).map((s, i) => plate(lumps[s.lump], s, H, mirror, seed + i * 17))
  const mk = petrified ? 'plate-red' : 'plate'
  if (!materials.has(mk)) materials.set(mk, plateMaterial(tex, petrified ? new THREE.Color(0.7, 0.55, 0.47) : new THREE.Color(0.56, 0.54, 0.5)))
  if (plates.length) {
    const m = new THREE.Mesh(mergeGeometries(plates)!, materials.get(mk))
    m.castShadow = true
    m.receiveShadow = true
    group.add(m)
  }
  // Fur, avoiding the plates.
  const avoid = specs.map((s) => ({ lump: s.lump, d: new THREE.Vector3(s.dir[0] * (s.side ? mirror : 1), s.dir[1], s.dir[2]).normalize(), r: Math.max(s.a, s.b) * 1.15 }))
  const furGeo = FUR[shape] ? fur(lumps, FUR[shape], H, seed + 999, avoid) : null
  if (furGeo) {
    const fk = petrified ? 'fur-red' : 'fur'
    if (!materials.has(fk)) {
      const fm = new THREE.MeshStandardMaterial({ map: furTexture(), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 1, color: petrified ? new THREE.Color(0.75, 0.6, 0.5) : new THREE.Color(0.85, 0.82, 0.76) })
      fm.alphaToCoverage = true
      // Near — climbing it, or within a hundred metres — the cards show as what they are, flat planks:
      // there the fur thins away (dithered) and the hide under it is what you hold.
      fm.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vFurW;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvFurW = (modelMatrix * vec4(transformed, 1.0)).xyz;')
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vFurW;')
          .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\nnormal *= faceDirection;\n#endif')
          .replace(
            '#include <alphatest_fragment>',
            `#include <alphatest_fragment>
            float furNear = smoothstep(40.0, 120.0, distance(vFurW, cameraPosition));
            if (fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) > furNear) discard;`,
          )
      }
      fm.customProgramCacheKey = () => 'fur-near-fade'
      materials.set(fk, fm)
    }
    const fm = new THREE.Mesh(furGeo, materials.get(fk))
    fm.castShadow = true
    group.add(fm)
  }
  // A shrine on its back: a slab on the hump, stumps of columns, and a glyph
  // that glows — where a climb is going (Shadow of the Colossus's sigils).
  if (shape === 'torso' && lumps[0]) {
    const L = lumps[0]
    _d.set(0, 1, -0.25).normalize()
    const top = surface(L, _d, new THREE.Vector3())
    const parts: THREE.BufferGeometry[] = []
    const rand = mulberry32(seed + 31)
    const S = H / 300
    // (Weathered — QA cycle 7: hard boxes on a worn stone giant; the slab's top stays flat, the
    // column stumps stand on it.)
    parts.push(weatheredStone(46 * S, 4 * S, 34 * S, rand, false, 0, true).translate(top.x, top.y + 1.5 * S, top.z))
    for (const [cx, cz] of [[-17, -12], [17, -12], [-17, 12], [17, 12], [0, -14]]) {
      const h = (5 + rand() * 13) * S
      const g = new THREE.CylinderGeometry(2.6 * S, 3 * S, h, 14, 2).translate(top.x + cx * S, top.y + 3.5 * S + h / 2, top.z + cz * S)
      parts.push(g.toNonIndexed())
      if (rand() < 0.5) parts.push(weatheredStone(7 * S, 2.4 * S, 5 * S, rand, true, 0.1).rotateY(rand() * 3).translate(top.x + (cx + (rand() - 0.5) * 12) * S, top.y + 4.7 * S, top.z + (cz + (rand() - 0.5) * 8) * S))
    }
    const shrine = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!
    shrine.deleteAttribute('uv')
    shrine.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(shrine.getAttribute('position').count * 3).fill(0.9), 3))
    const sm = new THREE.Mesh(shrine, materials.get(mk))
    sm.castShadow = true
    sm.receiveShadow = true
    group.add(sm)
    if (!petrified) {
      if (!materials.has('glyph')) materials.set('glyph', new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.5, 1.9), fog: false, transparent: true, opacity: 0.85 }))
      const glyph = new THREE.Mesh(new THREE.TorusGeometry(5.5 * S, 0.7 * S, 8, 40), materials.get('glyph'))
      glyph.rotation.x = Math.PI / 2
      glyph.position.set(top.x, top.y + 3.7 * S, top.z)
      // Found by name: its relic can be taken (main.ts), and then it goes dark.
      glyph.name = 'glyph'
      const inner = new THREE.Mesh(new THREE.TorusGeometry(2.6 * S, 0.45 * S, 6, 6), materials.get('glyph'))
      inner.rotation.x = Math.PI / 2
      inner.position.copy(glyph.position)
      inner.name = 'glyph-inner'
      group.add(glyph, inner)
    }
  }
  // The eyes, in the mask: deep sockets, a pale glow far inside.
  if (shape === 'head' && lumps[0]) {
    const L = lumps[0]
    const ek = petrified ? 'eye-dead' : 'eye'
    if (!materials.has(ek)) materials.set(ek, new THREE.MeshBasicMaterial({ color: petrified ? new THREE.Color(0.05, 0.05, 0.05) : new THREE.Color(1.15, 1.4, 1.65), fog: false }))
    if (!materials.has('socket')) materials.set('socket', new THREE.MeshBasicMaterial({ color: 0x050505 }))
    for (const sx of [-1, 1]) {
      _d.set(sx * 0.36, 0.12, 1).normalize()
      const at = surface(L, _d, new THREE.Vector3())
      const r = 0.011 * H
      const socket = new THREE.Mesh(new THREE.SphereGeometry(r * 1.5, 16, 10).scale(1.3, 0.75, 0.6), materials.get('socket'))
      socket.position.copy(at).addScaledVector(_d, 0.004 * H)
      // The glow sits just proud of the socket's dark, so it is never swallowed by it.
      const eye = new THREE.Mesh(new THREE.SphereGeometry(r * 0.44, 14, 10).scale(1.3, 0.6, 0.5), materials.get(ek))
      eye.position.copy(at).addScaledVector(_d, 0.0125 * H)
      group.add(socket, eye)
    }
    // Horns of stone swept far back from the brow: uneven, some broken off short.
    const crown: THREE.BufferGeometry[] = []
    const rand = mulberry32(seed + 77)
    for (let i = 0; i < 5; i++) {
      const a = (i / 4 - 0.5) * 1.9 + (rand() - 0.5) * 0.25
      _d.set(Math.sin(a) * 0.7, 0.62, -0.35 + Math.cos(a) * 0.15).normalize()
      const at = surface(L, _d, new THREE.Vector3())
      const broken = rand() < 0.35
      const h = (broken ? 0.012 + rand() * 0.008 : 0.03 + 0.025 * (1 - Math.abs(i / 4 - 0.5) * 2) + rand() * 0.012) * H
      const base = (0.011 + rand() * 0.004) * H
      // A broken horn ends in a flat stump, not a point.
      const g = new THREE.CylinderGeometry(broken ? base * 0.55 : 0, base, h, 5).translate(0, h / 2, 0)
      g.rotateX(-1.05 - rand() * 0.3)
      g.rotateZ(-Math.sin(a) * 0.7)
      g.translate(at.x, at.y, at.z)
      crown.push(g.toNonIndexed())
    }
    const cm = new THREE.Mesh(mergeGeometries(crown)!, materials.get(mk))
    // Cones have no vertex colours: give them white.
    const cg = cm.geometry
    cg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(cg.getAttribute('position').count * 3).fill(0.85), 3))
    cm.castShadow = true
    group.add(cm)
  }
  return group
}
