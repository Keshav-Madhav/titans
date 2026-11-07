// The colossi: the things in this world that are far too big. Placed by hand,
// built when the world loads, seen from everywhere.
//
//   the valley   — the Sentinel: a First One kneeling on the cliff rim, its
//                  hands on a sword, nothing but dark under its hood
//   the Dune Sea — the ribs and skull of a fallen First One; a stone sword
//                  three hundred metres long driven into the dunes
//   the Steps    — a colonnade whose pillars rise into the clouds, some
//                  broken; the Great Stair, each step a cliff, up to the Gate
//   the Old Wood — giant trees, roots like ridges, crowns above the clouds' feet
//   the sky      — stones hanging in the air, some held down by chains
//
// Organic shapes are fields meshed in the rock worker (./rock-fields.ts);
// architecture is built here as geometry with an exact field beside it. Both
// are solid (rocks.ts) — and, like any rock, climbable.

import * as THREE from 'three'
import { withInside } from './shell'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { DROWNED_AT, mulberry32, SHORE, SPREAD, type Terrain } from '@titans/shared'
import { LAYER } from './terrain-material'
import type { Formation, Rocks } from './rocks'
import type { Shape } from './rock-fields'
import { canopyGeometry, foliageMaterial, foliageTexture } from './trees'
import { splitByTile } from './instancing'

const BONE: [number, number, number] = [1.0, 0.97, 0.9]
/** Each colossus its own stone, so they never read as one beige material. */
const STONE: [number, number, number] = [0.78, 0.8, 0.78] // the Sentinel: weathered, green-grey
const SANDSTONE: [number, number, number] = [1.05, 1.0, 0.94]
const LIMESTONE: [number, number, number] = [1.12, 1.1, 1.06]
const BASALT: [number, number, number] = [1, 1, 1.04]
const IRON: [number, number, number] = [0.85, 0.86, 0.9]

/** Box SDF (exact). */
const box = (x: number, y: number, z: number, bx: number, by: number, bz: number) => {
  const qx = Math.abs(x) - bx
  const qy = Math.abs(y) - by
  const qz = Math.abs(z) - bz
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0)
}

/** A box geometry from its centre and half extents. */
const block = (cx: number, cy: number, cz: number, bx: number, by: number, bz: number, seg = 1) => new THREE.BoxGeometry(bx * 2, by * 2, bz * 2, seg, seg, seg).translate(cx, cy, cz)

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!
  g.deleteAttribute('uv')
  return g
}

/** A fluted column of radius r and height h, with a plinth; `broken` leaves a jagged top instead of a capital. */
function column(r: number, h: number, broken: boolean, rand: () => number): THREE.BufferGeometry {
  const segs = 56
  const rows = Math.max(8, Math.round(h / 18))
  const shaft = new THREE.CylinderGeometry(r * 0.94, r, h, segs, rows, true).translate(0, h / 2, 0)
  const p = shaft.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const z = p.getZ(i)
    const y = p.getY(i)
    const a = Math.atan2(z, x)
    // Flutes, and the drums' joints.
    const flute = 1 - 0.045 * Math.pow(Math.max(0, Math.cos(a * 20)), 6)
    const joint = 1 - 0.02 * Math.pow(Math.max(0, Math.cos(((y / 34) * Math.PI) * 2)), 30)
    let k = flute * joint
    // A broken top: the last rows jagged and torn.
    if (broken && y > h - 20) k *= 0.9 + 0.1 * rand()
    p.setXYZ(i, x * k, broken && y > h - 1 ? y - rand() * 16 : y, z * k)
  }
  shaft.computeVertexNormals()
  // (A broken one is open at the top: its inside, the wall's thickness in, or from above you saw
  // through the far wall — the user, 2026-11-07, "several things are unrendering from the inside".)
  const parts: THREE.BufferGeometry[] = [broken ? withInside(shaft, r * 0.08) : shaft, block(0, 6, 0, r * 1.45, 6, r * 1.45, 2), block(0, 17, 0, r * 1.25, 5, r * 1.25, 2)]
  if (!broken) {
    parts.push(new THREE.CylinderGeometry(r * 1.35, r * 0.95, 14, segs, 2).translate(0, h + 7, 0))
    parts.push(block(0, h + 20, 0, r * 1.5, 6, r * 1.5, 2))
  } else {
    // The rubble-choked floor of the break, under the lowest of the jagged rim (it was at 8 m down,
    // above where the rim tears to 17 m: its edge stood out of the wall), inside the inner wall.
    parts.push(new THREE.CircleGeometry(r * 0.9, segs).rotateX(-Math.PI / 2).translate(0, h - 19, 0))
  }
  return merged(parts)
}

export class Colossi {
  readonly group = new THREE.Group()
  /** Where each colossus is, for tools and the guide (name → position). */
  readonly places = new Map<string, THREE.Vector3>()
  /** The free stones hanging in the sky, by place name (a sunken bell can call one down). */
  readonly skyStones = new Map<string, Formation>()
  /** The Old Wood's giant trees (a sunken bell raises a stair round one). */
  readonly giantTrees: Array<{ f: Formation; h: number }> = []

  constructor(
    private readonly terrain: Terrain,
    rocks: Rocks,
    seed: number,
    /** The crowns' wind clock. */
    time: { value: number },
  ) {
    const foliage = foliageTexture()
    const rand = mulberry32(seed ^ 0xc0105)
    const H = (x: number, z: number) => terrain.heightAt(x, z)
    const place = (name: string, x: number, z: number, y = H(x, z)) => this.places.set(name, new THREE.Vector3(x, y, z))
    /** The flattest ground within `search` of (x, z) for something `r` across: where it can stand. */
    const site = (x: number, z: number, r: number, search: number) => {
      let best = { x, z, y: H(x, z), spread: Infinity }
      for (let dz = -search; dz <= search; dz += 30) {
        for (let dx = -search; dx <= search; dx += 30) {
          if (dx * dx + dz * dz > search * search) continue
          const px = x + dx
          const pz = z + dz
          let lo = H(px, pz)
          let hi = lo
          for (let k = 0; k < 12; k++) {
            for (const f of [0.5, 1]) {
              const h = H(px + Math.cos(k * 0.524) * r * f, pz + Math.sin(k * 0.524) * r * f)
              lo = Math.min(lo, h)
              hi = Math.max(hi, h)
            }
          }
          // Flat first; then near where it was meant to be.
          const spread = hi - lo + Math.hypot(dx, dz) * 0.01
          if (spread < best.spread) best = { x: px, z: pz, y: lo, spread }
        }
      }
      return best
    }

    // The Sentinel kneels alone at the Green's northern rim, facing the start
    // across kilometres of empty grass: the first thing you see.
    const sen = site(0, -640 * SPREAD, 110, 400)
    rocks.addColossus({ kind: 'sentinel', x: sen.x, z: sen.z, y: sen.y - 6, rot: Math.atan2(-sen.x, -sen.z), seed: 7, layers: [LAYER.carved, LAYER.moss], scale: 22, tint: STONE, res: 195 })
    place('sentinel', sen.x, sen.z, sen.y)

    // The Drowned One: lying on its back in the biggest marsh, all but its
    // face, chest, a raised knee and one lifted hand under the black water.
    const dr = site(DROWNED_AT.x, DROWNED_AT.z, 200, 300)
    rocks.addColossus({ kind: 'reclining', x: dr.x, z: dr.z, y: dr.y - 8, rot: 2.2, seed: 8, layers: [LAYER.moss, LAYER.hide], scale: 16, tint: [0.62, 0.66, 0.56], res: 210 })
    place('drowned', dr.x, dr.z, dr.y)

    // The Husk: a shed skin lying face down in the Dune Sea, hollow, split along the back.
    const hk = site(-1800, 6500, 140, 500)
    rocks.addColossus({ kind: 'husk', x: hk.x, z: hk.z, y: hk.y - 6, rot: 0.9, seed: 9, layers: [LAYER.hide, LAYER.sand], scale: 14, tint: [0.92, 0.86, 0.76], res: 190 })
    place('husk', hk.x, hk.z, hk.y)

    // The Dune Sea: a fallen First One — ribs along a buried spine, the skull at its head.
    const ribRot = 0.35
    const rib = site(250 * SPREAD, 1950 * SPREAD, 220, 500)
    rocks.addColossus({ kind: 'ribcage', x: rib.x, z: rib.z, y: rib.y - 10, rot: ribRot, seed: 11, layers: [LAYER.bone, LAYER.sand], scale: 10, tint: BONE, res: 120 })
    place('ribcage', rib.x, rib.z, rib.y)
    const sk = site(rib.x + Math.sin(ribRot) * 380, rib.z + Math.cos(ribRot) * 380, 110, 120)
    rocks.addColossus({ kind: 'skull', x: sk.x, z: sk.z, y: sk.y - 18, rot: ribRot + 0.5, seed: 13, layers: [LAYER.bone, LAYER.sand], scale: 10, tint: BONE, res: 110 })
    place('skull', sk.x, sk.z, sk.y)
    // The Shore: something from the sea, long dead, lying where the surf left it — its ribs
    // standing out of the shallows along the waterline, the skull up the beach, bleached.
    {
      const a = 0.18
      const d = SHORE.coast - 120
      const sx = Math.sin(a) * d
      const sz = Math.cos(a) * d
      const along = Math.atan2(Math.cos(a), -Math.sin(a))
      rocks.addColossus({ kind: 'ribcage', x: sx, z: sz, y: Math.min(H(sx, sz), SHORE.sea + 2) - 6, rot: along, seed: 41, layers: [LAYER.bone, LAYER.sand], scale: 7, tint: BONE, res: 110 })
      place('stranded', sx, sz, H(sx, sz))
      const kx = sx + Math.sin(along) * 300 - Math.sin(a) * 60
      const kz = sz + Math.cos(along) * 300 - Math.cos(a) * 60
      rocks.addColossus({ kind: 'skull', x: kx, z: kz, y: H(kx, kz) - 12, rot: along + 2.4, seed: 43, layers: [LAYER.bone, LAYER.sand], scale: 7, tint: BONE, res: 100 })
      place('stranded-skull', kx, kz, H(kx, kz))
    }
    // The sword stands alone, kilometres from the bones (each its own scene).
    const sw = site(-3300, 4500, 70, 450)
    rocks.addColossus({ kind: 'sword', x: sw.x, z: sw.z, y: sw.y, rot: 1.1, seed: 17, layers: [LAYER.basalt, LAYER.sand], scale: 12, tint: IRON })
    place('sword', sw.x, sw.z, sw.y)

    // The Old Wood's giant trees.
    const trees: Array<{ x: number; y: number; z: number; h: number; tips: THREE.Vector3[] }> = []
    for (let tries = 0; tries < 2500 && trees.length < 22; tries++) {
      // Together, as one forest of them (nothing else that big near).
      const a = rand() * Math.PI * 2
      const d = Math.sqrt(rand()) * 1150
      const x = -0.866 * 4300 + Math.cos(a) * d
      const z = -0.5 * 4300 + Math.sin(a) * d
      if (terrain.base.regions.name(x, z) !== 'forest' || trees.some((t) => Math.hypot(t.x - x, t.z - z) < 250)) continue
      let lo = Infinity
      let hi = -Infinity
      for (let k = 0; k < 8; k++) {
        const h = H(x + Math.cos(k * 0.785) * 40, z + Math.sin(k * 0.785) * 40)
        lo = Math.min(lo, h)
        hi = Math.max(hi, h)
      }
      if (hi - lo > 18) continue
      const tseed = 100 + trees.length
      const rot = rand() * 6.28
      rocks.addColossus({ kind: 'trunk', x, z, y: lo - 2, rot, seed: tseed, layers: [LAYER.bark, LAYER.moss], scale: 9, tint: [3.0, 2.85, 2.6], res: 120 })
      const f = rocks.formations[rocks.formations.length - 1]
      // Its crowns: one at each limb's end (local → world: mesh.rotation.y = rot).
      const c = Math.cos(rot)
      const sn = Math.sin(rot)
      const tips = (f.tips ?? []).map(([tx, ty, tz]) => new THREE.Vector3(x + tx * c + tz * sn, lo - 2 + ty, z - tx * sn + tz * c))
      trees.push({ x, y: lo - 2, z, h: f.cy + f.hy, tips })
      this.giantTrees.push({ f, h: (f.hy * 2 - 12) / 1.32 })
      place(`tree-${trees.length}`, x, z, lo)
    }
    // Their crowns: billows of leaf cards at every limb's end — and a smaller
    // one halfway along each limb, so the canopy reaches down to the trunk
    // and reads as one tree (tip crowns alone, over a hill that hid the trunk,
    // hung in the air like clouds).
    const count = trees.reduce((n, t) => n + t.tips.length * 2, 0)
    const crown = new THREE.InstancedMesh(canopyGeometry(31, 64, 15, 90, 14), foliageMaterial(foliage, time, 0.0004), count)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    let ci = 0
    for (const t of trees) {
      t.tips.forEach((tip, k) => {
        // Broad: close enough together, their crowns meet into a roof far overhead.
        const s = (k === t.tips.length - 1 ? 0.85 : 0.58) * (0.85 + rand() * 0.35)
        m.compose(tip, q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28), new THREE.Vector3(s, s * (0.75 + rand() * 0.3), s))
        crown.setMatrixAt(ci++, m)
        const fork = new THREE.Vector3(t.x, t.y + t.h * 0.72, t.z)
        const mid = fork.lerp(tip, 0.55)
        const s2 = s * 0.62
        m.compose(mid, q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28), new THREE.Vector3(s2, s2 * 0.8, s2))
        crown.setMatrixAt(ci++, m)
      })
    }
    crown.castShadow = true
    crown.receiveShadow = true
    crown.count = ci
    // (Far off, the same crowns from fewer, bigger cards: 2,520 triangles each to 720, then 240.)
    // (Their shadows from the 720-triangle crowns, not the 2,520: in the Grove the crowns'
    // shadows were ~0.8 M triangles a frame, as much as everything you could see.)
    const mid = canopyGeometry(31, 64, 24, 90, 4)
    this.group.add(
      splitByTile(
        crown,
        400,
        [
          [mid, 900],
          [canopyGeometry(31, 64, 32, 60, 2), 2200],
        ],
        mid,
      ),
    )

    // The Steps: a colonnade rising into the clouds, some pillars broken.
    const cx0 = 1180 * SPREAD
    const cz0 = -1080 * SPREAD
    const along = new THREE.Vector2(0.5, 0.866)
    for (let i = 0; i < 9; i++) {
      const x = cx0 + along.x * (i - 4) * 175
      const z = cz0 + along.y * (i - 4) * 175
      const broken = i % 3 === 1 || rand() < 0.2
      const r = 26 + rand() * 6
      const h = broken ? 160 + rand() * 220 : 520 + rand() * 320
      const y = Math.min(H(x, z), H(x + r, z), H(x - r, z), H(x, z + r), H(x, z - r)) - 4
      const shape: Shape = {
        // (A broken one is hollow at its top, down to the rubble floor 19 m under the break: you
        // stand in the break, not on air over it.)
        field: (lx, ly, lz) => Math.min(Math.max(Math.hypot(lx, lz) - r, Math.abs(ly - h / 2) - h / 2, broken ? -Math.max(Math.hypot(lx, lz) - r * 0.9, h - 19 - ly) : -Infinity), box(lx, ly - 11, lz, r * 1.45, 11, r * 1.45), broken ? Infinity : box(lx, ly - h - 14, lz, r * 1.5, 14, r * 1.5)),
        hx: r * 1.6,
        hy: h / 2 + 30,
        hz: r * 1.6,
        cy: h / 2,
      }
      rocks.addBuilt(shape, column(r, h, broken, rand), { x, y, z, rot: rand() * 6.28, layers: [LAYER.relief, LAYER.moss], scale: 16, tint: SANDSTONE })
      if (broken) {
        // Its fallen drums, lying in the grass.
        for (let k = 0; k < 3; k++) {
          const a = rand() * 6.28
          const dd = 60 + rand() * 120
          const fx = x + Math.cos(a) * dd
          const fz = z + Math.sin(a) * dd
          const len = 30 + rand() * 20
          const fy = H(fx, fz) + r * 0.55
          const drumShape: Shape = { field: (lx, ly, lz) => Math.max(Math.hypot(ly, lz) - r * 0.95, Math.abs(lx) - len / 2), hx: len / 2 + 4, hy: r + 4, hz: r + 4, cy: 0 }
          const drum = new THREE.CylinderGeometry(r * 0.95, r * 0.95, len, 40, 2).rotateZ(Math.PI / 2)
          rocks.addBuilt(drumShape, merged([drum]), { x: fx, y: fy - r * 0.4, z: fz, rot: rand() * 6.28, layers: [LAYER.relief, LAYER.moss], scale: 16, tint: SANDSTONE })
        }
      }
    }
    place('colonnade', cx0, cz0)

    // The Great Stair, each step a cliff, up to a platform and the sealed Gate.
    const st = site(1900 * SPREAD, -560 * SPREAD, 160, 600)
    this.stairAndGate(rocks, st.x, st.z)

    // Stones hanging in the sky. The chained ones stand in a row at the back
    // of the Steps, under the mountains; the free ones drift high over the lands.
    const chains: Array<[THREE.Vector3, THREE.Vector3]> = []
    const stones: Array<[number, number, number, boolean]> = [
      [3330, -4750, 290, true],
      [4890, -3820, 330, true],
      [5540, -2020, 270, true],
      [6280, -550, 310, true],
      [-3000, 900, 640, false],
      [-4810, 3250, 560, false],
      [4290, 4550, 720, false],
      [-5980, -4160, 820, false],
      [-780, 2600, 520, false],
    ]
    stones.forEach(([x, z, alt, chained], i) => {
      const y = H(x, z) + alt
      // (The free ones bare dark stone: moss on a stone in the sky read as a tree floating.)
      rocks.addColossus({ kind: 'monolith', x, z, y, rot: i * 1.3, seed: 300 + i, layers: chained ? [LAYER.basalt, LAYER.moss] : [LAYER.basalt, LAYER.basalt], scale: 14, tint: BASALT, float: chained ? undefined : { amp: 12, phase: i * 1.7, spin: 0.004 * (i % 2 ? 1 : -1) } })
      const f = rocks.formations[rocks.formations.length - 1]
      if (chained) {
        // Static: chains hold it. Three run down to anchors on the ground.
        f.float = { amp: 0, phase: 0, spin: 0 }
        const bottom = y - (f.hy - 8) * 0.9
        for (let k = 0; k < 3; k++) {
          const a = i * 1.3 + (k / 3) * Math.PI * 2
          const ax = x + Math.cos(a) * (160 + 50 * k)
          const az = z + Math.sin(a) * (160 + 50 * k)
          chains.push([new THREE.Vector3(x + Math.cos(a) * 12, bottom, z + Math.sin(a) * 12), new THREE.Vector3(ax, H(ax, az) - 1, az)])
        }
      }
      place(`stone-${i + 1}`, x, z, y)
      if (!chained) this.skyStones.set(`stone-${i + 1}`, f)
    })
    this.group.add(splitByTile(this.chainMesh(chains), 400))
  }

  /** The Great Stair and the Gate, facing the valley from (x, z). */
  private stairAndGate(rocks: Rocks, x: number, z: number): void {
    const steps = 10
    const rise = 12
    const tread = 24
    const W = 90
    const depth = steps * tread
    // Local: the stair climbs toward -z; the platform behind it; the Gate on the platform.
    const top = steps * rise
    const pd = 70
    const field = (lx: number, ly: number, lz: number) => {
      // Step i occupies z in [-(i+1)·tread, -i·tread] and rises to (i+1)·rise.
      const i = Math.max(0, Math.min(steps - 1, Math.floor(-lz / tread)))
      let d = box(lx, ly - ((i + 1) * rise - 60) / 2, lz + (i + 0.5) * tread, W, ((i + 1) * rise + 60) / 2, tread / 2)
      // Neighbouring steps (for the edges between them).
      for (const j of [i - 1, i + 1]) if (j >= 0 && j < steps) d = Math.min(d, box(lx, ly - ((j + 1) * rise - 60) / 2, lz + (j + 0.5) * tread, W, ((j + 1) * rise + 60) / 2, tread / 2))
      // The platform, and the Gate on it: two towers, a lintel, the sealed door.
      d = Math.min(d, box(lx, ly - (top - 60) / 2, lz + depth + pd, W + 40, (top + 60) / 2, pd))
      for (const sx of [-1, 1]) d = Math.min(d, box(lx - sx * 70, ly - top - 150, lz + depth + pd, 26, 150, 30))
      d = Math.min(d, box(lx, ly - top - 290, lz + depth + pd, 100, 16, 34))
      d = Math.min(d, box(lx, ly - top - 132, lz + depth + pd + 6, 44, 132, 10))
      return d
    }
    const parts: THREE.BufferGeometry[] = []
    for (let i = 0; i < steps; i++) parts.push(block(0, ((i + 1) * rise - 60) / 2, -(i + 0.5) * tread, W, ((i + 1) * rise + 60) / 2, tread / 2, 2))
    parts.push(block(0, (top - 60) / 2, -(depth + pd), W + 40, (top + 60) / 2, pd, 4))
    for (const sx of [-1, 1]) parts.push(block(sx * 70, top + 150, -(depth + pd), 26, 150, 30, 6))
    parts.push(block(0, top + 290, -(depth + pd), 100, 16, 34, 4))
    parts.push(block(0, top + 132, -(depth + pd) + 6, 44, 132, 10, 6))
    // Toward the valley.
    const rot = Math.atan2(-x, -z)
    // On the lowest ground under its foot, so no step floats.
    let y = Infinity
    for (let k = 0; k < 10; k++) {
      const lz = -(k / 9) * depth
      y = Math.min(y, this.terrain.heightAt(x + Math.sin(rot) * lz, z + Math.cos(rot) * lz))
    }
    const shape: Shape = { field, hx: W + 50, hy: (top + 340 + 60) / 2, hz: depth + 2 * pd + 20, cy: (top + 340 - 60) / 2 }
    // The field's z runs toward the gate as negative; centre the bounds on the whole build.
    rocks.addBuilt(shape, merged(parts), { x, y, z, rot, layers: [LAYER.carved, LAYER.flagstone], scale: 26, tint: LIMESTONE })
    this.places.set('stair', new THREE.Vector3(x, y, z))
    this.places.set('gate', new THREE.Vector3(x - Math.sin(rot) * (depth + pd), y + top, z - Math.cos(rot) * (depth + pd)))
  }

  /** Iron chains, link by link, sagging between their two ends. */
  private chainMesh(chains: Array<[THREE.Vector3, THREE.Vector3]>): THREE.InstancedMesh {
    const LINK = 7
    const geo = new THREE.TorusGeometry(3.2, 1.0, 8, 14).scale(1, 1.6, 1)
    const total = chains.reduce((n, [a, b]) => n + Math.ceil(a.distanceTo(b) / LINK) + 1, 0)
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x45403a, metalness: 0.55, roughness: 0.55 }), total)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const q2 = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const p = new THREE.Vector3()
    const next = new THREE.Vector3()
    const dir = new THREE.Vector3()
    const one = new THREE.Vector3(1, 1, 1)
    const at = (a: THREE.Vector3, b: THREE.Vector3, t: number, sag: number, out: THREE.Vector3) => out.lerpVectors(a, b, t).addScaledVector(up, -sag * 4 * t * (1 - t))
    let n = 0
    for (const [a, b] of chains) {
      const count = Math.ceil(a.distanceTo(b) / LINK)
      const sag = a.distanceTo(b) * 0.06
      for (let i = 0; i <= count; i++) {
        at(a, b, i / count, sag, p)
        at(a, b, Math.min(1, (i + 1) / count), sag, next)
        dir.subVectors(next, p).normalize()
        if (dir.lengthSq() < 0.5) dir.set(0, -1, 0)
        // Link along the chain, every other one turned a quarter about it.
        q.setFromUnitVectors(up, dir)
        if (i % 2) q.multiply(q2.setFromAxisAngle(up, Math.PI / 2))
        m.compose(p, q, one)
        mesh.setMatrixAt(n++, m)
      }
    }
    mesh.count = n
    mesh.castShadow = true
    return mesh
  }
}
