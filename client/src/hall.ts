// The Undercroft: a hall of pillars seventy metres under the valley floor.
// From outside it is a stone plaza, flush with the grass, with square holes
// in it; look down one and there is nothing but dark, and the tops of
// pillars. A long stair goes down from the west end. Inside: twenty-four
// pillars sixteen metres square, a floor you could lose a town on, and shafts
// of daylight falling through the holes in the roof. (The darkness itself is
// in atmosphere.ts, so everything inside is dimmed alike.)
//
// The pit is cut in the base terrain (shared HALL); this builds the stone.

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { HALL, mulberry32, type Terrain } from '@titans/shared'
import { LAYER } from './terrain-material'
import type { Rocks } from './rocks'
import type { Shape } from './rock-fields'

const ROOF = 12 // roof thickness: from -ROOF to +1 (ground level is 0)
const TILE = 20
const PILLAR = 8 // half width
/** A pillar's base (on the floor) and capital (under the roof): heights. */
const BASE_H = 1.6
const CAP_H = 2.2
const PX = [-150, -90, -30, 30, 90, 150]
const PZ = [-90, -30, 30, 90]
/** The stair: a band along the north wall, from the west rim down to the floor. */
const RAMP = { z0: 108, z1: 142, x0: -215, top: -180, bottom: 20 }

const rampY = (x: number) => (x <= RAMP.top ? 0 : -Math.min(HALL.depth, ((x - RAMP.top) / (RAMP.bottom - RAMP.top)) * HALL.depth))

const box = (x: number, y: number, z: number, bx: number, by: number, bz: number) => {
  const qx = Math.abs(x) - bx
  const qy = Math.abs(y) - by
  const qz = Math.abs(z) - bz
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0)
}

const block = (cx: number, cy: number, cz: number, bx: number, by: number, bz: number) => new THREE.BoxGeometry(bx * 2, by * 2, bz * 2).translate(cx, cy, cz)

/** Is this roof tile open (a skylight, or over the stair's mouth)? */
function open(cx: number, cz: number): boolean {
  if (cx <= -60 && cz >= 90) return true
  return HALL.skylights.some(([sx, sz]) => Math.max(Math.abs(cx - sx), Math.abs(cz - sz)) < HALL.sky * 0.75)
}

export class Undercroft {
  readonly group = new THREE.Group()
  private readonly shaftMat: THREE.ShaderMaterial
  /** Where its middle is, on the floor (tools). */
  readonly floor: THREE.Vector3

  constructor(terrain: Terrain, rocks: Rocks) {
    const top = terrain.base.hallTop
    const D = HALL.depth
    const parts: THREE.BufferGeometry[] = []
    const holes: Array<[number, number]> = []
    // The roof, tile by tile, leaving the holes open.
    for (let cx = -HALL.hx + TILE / 2; cx < HALL.hx; cx += TILE) {
      for (let cz = -HALL.hz + TILE / 2; cz < HALL.hz; cz += TILE) {
        if (open(cx, cz)) holes.push([cx, cz])
        else parts.push(block(cx, (1 - ROOF) / 2, cz, TILE / 2, (ROOF + 1) / 2, TILE / 2))
      }
    }
    // The pillars, the walls lining the pit, the floor.
    for (const x of PX)
      for (const z of PZ) {
        parts.push(block(x, (-D - ROOF) / 2, z, PILLAR, (D - ROOF) / 2, PILLAR))
        // A stepped base on the floor and a capital under the roof: built, not boxes.
        parts.push(block(x, -D + 0.5 + BASE_H / 2, z, PILLAR + 2.2, BASE_H / 2, PILLAR + 2.2))
        parts.push(block(x, -D + 0.5 + BASE_H + 0.6, z, PILLAR + 1.1, 0.6, PILLAR + 1.1))
        parts.push(block(x, -ROOF - CAP_H / 2, z, PILLAR + 1.8, CAP_H / 2, PILLAR + 1.8))
        parts.push(block(x, -ROOF - CAP_H - 0.5, z, PILLAR + 0.8, 0.5, PILLAR + 0.8))
      }
    parts.push(block(0, (-D - ROOF) / 2, HALL.hz - 3, HALL.hx, (D - ROOF) / 2, 3))
    parts.push(block(0, (-D - ROOF) / 2, -HALL.hz + 3, HALL.hx, (D - ROOF) / 2, 3))
    parts.push(block(HALL.hx - 3, (-D - ROOF) / 2, 0, 3, (D - ROOF) / 2, HALL.hz))
    parts.push(block(-HALL.hx + 3, (-D - ROOF) / 2, 0, 3, (D - ROOF) / 2, HALL.hz))
    parts.push(block(0, -D + 0.25, 0, HALL.hx, 0.75, HALL.hz))
    // The stair: a flat landing at the rim, then steps all the way down.
    const rz = (RAMP.z0 + RAMP.z1) / 2
    const rw = (RAMP.z1 - RAMP.z0) / 2
    parts.push(block((RAMP.x0 + RAMP.top) / 2, -2, rz, (RAMP.top - RAMP.x0) / 2, 2.5, rw))
    const run = 2
    for (let x = RAMP.top; x < RAMP.bottom; x += run) {
      const y = rampY(x + run)
      parts.push(block(x + run / 2, (y - D) / 2, rz, run / 2, (D + y) / 2, rw))
    }
    // A parapet round the plaza's rim, broken in places; fallen blocks lying on it.
    const rand = mulberry32(4041)
    const walls: Array<[number, number, number, number]> = [] // cx, cz, half-x, half-z
    const H2 = 1.1
    for (let cx = -HALL.hx + 10; cx < HALL.hx; cx += 20) {
      for (const sz of [-1, 1]) {
        if (rand() < 0.3 || (sz > 0 && cx <= -60)) continue // gaps; the stair's mouth stays open
        walls.push([cx, sz * (HALL.hz - 1), 9.2 - rand() * 2, 0.9])
      }
    }
    for (let cz = -HALL.hz + 10; cz < HALL.hz; cz += 20) {
      for (const sx of [-1, 1]) {
        if (rand() < 0.3 || (sx < 0 && cz >= 90)) continue
        walls.push([sx * (HALL.hx - 1), cz, 0.9, 9.2 - rand() * 2])
      }
    }
    for (const [cx, cz, bx, bz] of walls) parts.push(block(cx, 1 + H2 * (0.6 + rand() * 0.6), cz, bx, H2 * (0.6 + rand() * 0.6), bz))
    for (let k = 0; k < 14; k++) {
      const cx = (rand() - 0.5) * HALL.hx * 1.7
      const cz = (rand() - 0.5) * HALL.hz * 1.7
      if (open(Math.round(cx / TILE) * TILE + TILE / 2, Math.round(cz / TILE) * TILE + TILE / 2)) continue
      parts.push(block(cx, 1.5, cz, 1.5 + rand() * 1.5, 0.6 + rand() * 0.6, 1.2 + rand()).rotateY(rand()).translate(0, 0, 0))
    }
    const geo = mergeGeometries(parts.map((p) => p.toNonIndexed()))!
    geo.deleteAttribute('uv')

    // Each hole as a box (centre x, z, half x, z), reaching 3 m out past the roof where it meets the edge.
    const holeBoxes = holes.map(([cx, cz]) => {
      const ext = (c: number, half: number) => {
        const lo = c - TILE / 2 - (c - TILE / 2 <= -half + 0.01 ? 3 : 0.6)
        const hi = c + TILE / 2 + (c + TILE / 2 >= half - 0.01 ? 3 : 0.6)
        return [(lo + hi) / 2, (hi - lo) / 2]
      }
      const [x, hx] = ext(cx, HALL.hx)
      const [z, hz] = ext(cz, HALL.hz)
      return [x, z, hx, hz]
    })
    const field = (x: number, y: number, z: number) => {
      // Roof slab, minus its open tiles.
      let roof = box(x, y - (1 - ROOF) / 2, z, HALL.hx, (ROOF + 1) / 2, HALL.hz)
      // (Holes a little wider than their tiles, and at the roof's edge reaching well
      // past it: a cut that stops just short leaves the slab's outer face standing
      // in the field as a thin shell — an invisible wall right where the stair comes out.)
      for (const h of holeBoxes) roof = Math.max(roof, -box(x - h[0], y - (1 - ROOF) / 2, z - h[1], h[2], ROOF + 4, h[3]))
      let d = roof
      for (const [cx, cz, bx, bz] of walls) d = Math.min(d, box(x - cx, y - 1 - H2 * 0.6, z - cz, bx, H2 * 1.2, bz))
      // Nearest pillar only (they are on a grid).
      const px = PX.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a))
      const pz = PZ.reduce((a, b) => (Math.abs(b - z) < Math.abs(a - z) ? b : a))
      d = Math.min(d, box(x - px, y + (D + ROOF) / 2, z - pz, PILLAR, (D - ROOF) / 2, PILLAR))
      d = Math.min(d, box(x - px, y - (-D + 0.5 + BASE_H / 2), z - pz, PILLAR + 2.2, BASE_H / 2, PILLAR + 2.2))
      d = Math.min(d, box(x - px, y - (-D + 0.5 + BASE_H + 0.6), z - pz, PILLAR + 1.1, 0.6, PILLAR + 1.1))
      d = Math.min(d, box(x, y + (D + ROOF) / 2, z - HALL.hz + 3, HALL.hx, (D - ROOF) / 2, 3))
      d = Math.min(d, box(x, y + (D + ROOF) / 2, z + HALL.hz - 3, HALL.hx, (D - ROOF) / 2, 3))
      d = Math.min(d, box(x - HALL.hx + 3, y + (D + ROOF) / 2, z, 3, (D - ROOF) / 2, HALL.hz))
      d = Math.min(d, box(x + HALL.hx - 3, y + (D + ROOF) / 2, z, 3, (D - ROOF) / 2, HALL.hz))
      d = Math.min(d, box(x, y + D - 0.25, z, HALL.hx, 0.75, HALL.hz))
      // The stair: solid under its slope.
      if (z > RAMP.z0 - 4 && z < RAMP.z1 + 4 && x > RAMP.x0 - 4 && x < RAMP.bottom + 4) {
        const inBand = box(x - (RAMP.x0 + RAMP.bottom) / 2, y + D / 2, z - rz, (RAMP.bottom - RAMP.x0) / 2, D / 2 + 0.5, rw)
        d = Math.min(d, Math.max(inBand, (y - rampY(x)) * 0.94))
      }
      return d
    }
    const shape: Shape = { field, hx: HALL.hx + 10, hy: D / 2 + 8, hz: HALL.hz + 10, cy: -D / 2 }
    // Contact shade (user: "the corners where pillars or wall meet floor are not darker… an
    // odd visual feeling"): the hall's shape is known, so each point asks how close stone
    // stands round it — a few steps out along its normal, how much room there is (SDF
    // ambient occlusion). Pillars, their stepped bases and capitals, the pit's walls, the
    // floor and the roof's underside.
    const f = (n: number) => n.toFixed(2)
    const occlusion = {
      key: 'undercroft',
      uniforms: { uHallO: { value: new THREE.Vector3(HALL.x, top, HALL.z) } },
      glsl: /* glsl */ `
        uniform vec3 uHallO;
        float hallBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
        float hallSdf(vec3 p) {
          float d = p.y - ${f(-D + 1)};
          d = min(d, ${f(-ROOF)} - p.y);
          d = min(d, min(${f(HALL.hx - 6)} - abs(p.x), ${f(HALL.hz - 6)} - abs(p.z)));
          vec2 c = vec2(clamp(floor((p.x - ${f(PX[0])}) / ${f(PX[1] - PX[0])} + 0.5), 0.0, ${f(PX.length - 1)}) * ${f(PX[1] - PX[0])} + ${f(PX[0])},
                        clamp(floor((p.z - ${f(PZ[0])}) / ${f(PZ[1] - PZ[0])} + 0.5), 0.0, ${f(PZ.length - 1)}) * ${f(PZ[1] - PZ[0])} + ${f(PZ[0])});
          vec3 q = p - vec3(c.x, 0.0, c.y);
          d = min(d, hallBox(q - vec3(0.0, ${f(-(D + ROOF) / 2)}, 0.0), vec3(${f(PILLAR)}, ${f((D - ROOF) / 2)}, ${f(PILLAR)})));
          d = min(d, hallBox(q - vec3(0.0, ${f(-D + 0.5 + BASE_H / 2)}, 0.0), vec3(${f(PILLAR + 2.2)}, ${f(BASE_H / 2)}, ${f(PILLAR + 2.2)})));
          d = min(d, hallBox(q - vec3(0.0, ${f(-D + 0.5 + BASE_H + 0.6)}, 0.0), vec3(${f(PILLAR + 1.1)}, 0.6, ${f(PILLAR + 1.1)})));
          d = min(d, hallBox(q - vec3(0.0, ${f(-ROOF - CAP_H / 2)}, 0.0), vec3(${f(PILLAR + 1.8)}, ${f(CAP_H / 2)}, ${f(PILLAR + 1.8)})));
          d = min(d, hallBox(q - vec3(0.0, ${f(-ROOF - CAP_H - 0.5)}, 0.0), vec3(${f(PILLAR + 0.8)}, 0.5, ${f(PILLAR + 0.8)})));
          return d;
        }
        float occlusion(vec3 wp, vec3 n) {
          vec3 p = wp - uHallO;
          // (Out on the plaza and the roof's top: open sky.)
          if (p.y > ${f(-ROOF + 0.5)}) return 1.0;
          float o = 0.0;
          float w = 1.0;
          for (int i = 1; i <= 5; i++) {
            float h = 0.75 * float(i);
            o += w * max(0.0, h - hallSdf(p + n * h));
            w *= 0.62;
          }
          return clamp(1.0 - 0.42 * o, 0.22, 1.0);
        }
        #define ROCK_WEATHER
        float hallN(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          vec2 m = mod(i, 289.0);
          float a = fract(sin(dot(m, vec2(12.9898, 78.233))) * 43758.5);
          float b = fract(sin(dot(m + vec2(1.0, 0.0), vec2(12.9898, 78.233))) * 43758.5);
          float c = fract(sin(dot(m + vec2(0.0, 1.0), vec2(12.9898, 78.233))) * 43758.5);
          float d = fract(sin(dot(m + vec2(1.0, 1.0), vec2(12.9898, 78.233))) * 43758.5);
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
        // The plaza's top weathered (from the meadow it was a flat untextured grey sheet — the tour,
        // 2026-11-17): broad patches of moss and damp, darker toward the rim where the grass creeps in,
        // big enough to read from across the meadow, not a tile's grain.
        vec3 weather(vec3 wp, vec3 n) {
          vec3 p = wp - uHallO;
          if (p.y < 0.4 || n.y < 0.7) return vec3(1.0);
          vec2 q = p.xz;
          // (Plaza coordinates kept small: the hash of big values lost its precision and gave one flat value.)
          float m = hallN(q * 0.035 + 11.0) * 0.6 + hallN(q * 0.11 + 7.3) * 0.3 + hallN(q * 0.37 + 2.1) * 0.1;
          float rim = 1.0 - smoothstep(0.0, 30.0, min(${f(HALL.hx)} - abs(p.x), ${f(HALL.hz)} - abs(p.z)));
          float moss = smoothstep(0.28, 0.48, m + rim * 0.3);
          float damp = smoothstep(0.35, 0.6, hallN(q * 0.05 + 3.7));
          // (Strong: the stone's own grey is pale, and at a meadow's distance a light tint vanished.)
          vec3 t = mix(vec3(1.0), vec3(0.42, 0.55, 0.26), moss * 0.9);
          return t * mix(1.0, 0.72, damp * 0.7);
        }`,
    }
    rocks.addBuilt(shape, geo, { x: HALL.x, y: top, z: HALL.z, rot: 0, layers: [LAYER.carved, LAYER.flagstone], scale: 9, tint: [0.82, 0.82, 0.8], occlusion })
    this.floor = new THREE.Vector3(HALL.x, top - D, HALL.z)

    // Shafts of daylight down through the skylights: soft, brightest at the top.
    this.shaftMat = new THREE.ShaderMaterial({
      uniforms: { strength: { value: 1 } },
      vertexShader: /* glsl */ `
        varying float vY;
        varying vec3 vN;
        varying vec3 vView;
        void main() {
          vY = position.y;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * normal);
          vView = normalize(cameraPosition - w.xyz);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float strength;
        varying float vY;
        varying vec3 vN;
        varying vec3 vView;
        void main() {
          // Faces seen edge-on are the soft sides of the beam.
          float edge = pow(1.0 - abs(dot(vN, vView)), 1.5);
          float a = (1.0 - edge * 0.7) * smoothstep(-${D.toFixed(1)}, 0.0, vY) * 0.16 * strength;
          gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
    const shaftGeo = new THREE.BoxGeometry(HALL.sky * 0.9, D, HALL.sky * 0.9, 1, 8, 1).translate(0, -D / 2, 0)
    for (const [sx, sz] of HALL.skylights) {
      const m = new THREE.Mesh(shaftGeo, this.shaftMat)
      m.position.set(HALL.x + sx, top, HALL.z + sz)
      m.renderOrder = 4
      this.group.add(m)
    }
    // And down the stair, where the roof is open over it: daylight falling on the steps, each shaft
    // only as deep as the stair is there — the way out you can see from across the hall (a new player
    // wandered the dark walls for minutes with nothing pointing up, the headed playtest).
    const sz0 = (RAMP.z0 + RAMP.z1) / 2
    for (let x = RAMP.top + 10; x < -60; x += 22) {
      const depth = Math.max(4, -rampY(x)) + 2
      const g = new THREE.BoxGeometry(18, depth, RAMP.z1 - RAMP.z0 - 6, 1, 6, 1).translate(0, -depth / 2, 0)
      const m = new THREE.Mesh(g, this.shaftMat)
      m.position.set(HALL.x + x, top, HALL.z + sz0)
      m.renderOrder = 4
      this.group.add(m)
    }
  }

  /** The shafts are as bright as the sun is: faint under storm, strong when it breaks. */
  update(sunStrength: number): void {
    this.shaftMat.uniforms.strength.value = 0.35 + sunStrength
  }
}
