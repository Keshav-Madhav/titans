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
import { HALL, type Terrain } from '@titans/shared'
import { LAYER } from './terrain-material'
import type { Rocks } from './rocks'
import type { Shape } from './rock-fields'

const ROOF = 12 // roof thickness: from -ROOF to +1 (ground level is 0)
const TILE = 20
const PILLAR = 8 // half width
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
    for (const x of PX) for (const z of PZ) parts.push(block(x, (-D - ROOF) / 2, z, PILLAR, (D - ROOF) / 2, PILLAR))
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
    const geo = mergeGeometries(parts.map((p) => p.toNonIndexed()))!
    geo.deleteAttribute('uv')

    const field = (x: number, y: number, z: number) => {
      // Roof slab, minus its open tiles.
      let roof = box(x, y - (1 - ROOF) / 2, z, HALL.hx, (ROOF + 1) / 2, HALL.hz)
      // (Holes a little wider than their tiles: an open tile at the roof's edge would
      // otherwise leave the slab's outer face standing in the field, an invisible wall.)
      for (const [cx, cz] of holes) roof = Math.max(roof, -box(x - cx, y - (1 - ROOF) / 2, z - cz, TILE / 2 + 0.6, ROOF, TILE / 2 + 0.6))
      let d = roof
      // Nearest pillar only (they are on a grid).
      const px = PX.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a))
      const pz = PZ.reduce((a, b) => (Math.abs(b - z) < Math.abs(a - z) ? b : a))
      d = Math.min(d, box(x - px, y + (D + ROOF) / 2, z - pz, PILLAR, (D - ROOF) / 2, PILLAR))
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
    rocks.addBuilt(shape, geo, { x: HALL.x, y: top, z: HALL.z, rot: 0, layers: [LAYER.dressed, LAYER.blocks], scale: 7, tint: [0.95, 0.94, 0.9] })
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
  }

  /** The shafts are as bright as the sun is: faint under storm, strong when it breaks. */
  update(sunStrength: number): void {
    this.shaftMat.uniforms.strength.value = 0.35 + sunStrength
  }
}
