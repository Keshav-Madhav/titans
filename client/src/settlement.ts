// Towns. The world starts with a few old villages on the plain — a square
// with a well and market stalls, a church, streets of houses, a windmill,
// fields, dirt roads out to the next village — and you can found your own
// beside a lake a Titan made (its first building must stand near water).
// A town with a well grows by itself: new homes go up along its streets.
// Buildings are procedural, in the reel's style: white walls, slate roofs,
// stone and thatch. A Titan's footfall, stomp or drag crushes what it hits.

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { inBasin, mulberry32, type LakeSystem, type Terrain } from '@titans/shared'
import type { PaintField } from './paint'

export type BuildingKind = 'hut' | 'house' | 'well' | 'tower' | 'church' | 'stall' | 'windmill' | 'field'
export const KINDS: BuildingKind[] = ['hut', 'house', 'well', 'tower', 'church', 'stall', 'windmill', 'field']
export const KIND_NAME: Record<BuildingKind, string> = {
  hut: 'Hut',
  house: 'House',
  well: 'Well',
  tower: 'Watchtower',
  church: 'Church',
  stall: 'Market stall',
  windmill: 'Windmill',
  field: 'Field',
}

/** Footprint radius (m) per kind: placement spacing and crush test. */
const RADIUS: Record<BuildingKind, number> = { hut: 3.8, house: 5.4, well: 1.8, tower: 3.2, church: 8, stall: 2.4, windmill: 4, field: 12 }
/** How far from its centre a town may grow, and how near water a new one must start. */
export const TOWN_RADIUS = 140
const WATER_NEAR = 110
const MAX_BUILDINGS = 44
/** Seconds between new buildings in a growing town. */
const GROW_EVERY = 40

export interface Town {
  id: number
  name: string
  cx: number
  cz: number
  /** Main street direction (radians). */
  dir: number
  /** Founded by the player (vs an old village). */
  player: boolean
  /** How far its street has been extended by growth (plots used). */
  grown: number
  growTimer: number
}

export interface Building {
  id: number
  kind: BuildingKind
  x: number
  z: number
  rot: number
  town: number
  mesh: THREE.Group
}

export interface SettlementSave {
  v: 2
  towns: Array<Omit<Town, 'growTimer'>>
  buildings: Array<{ kind: BuildingKind; x: number; z: number; rot: number; town: number }>
  roads: Array<[number, number, number, number, number]>
}

/** A save from before towns could be many (one player town). */
interface SettlementSaveV1 {
  name: string
  cx: number
  cz: number
  buildings: Array<{ kind: BuildingKind; x: number; z: number; rot: number }>
}

const C = {
  wall: 0xe6e0d2,
  timber: 0x6b5137,
  slate: 0x4a5059,
  stone: 0x9d968a,
  thatch: 0xb39657,
  dark: 0x2e2620,
  cloth: 0xe9e2cf,
  red: 0xa8432f,
  ochre: 0xc49a3b,
  wheat: 0xc8a957,
  crop: 0x6e8a36,
}

function mat(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
}
const MATS = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, mat(v)])) as Record<keyof typeof C, THREE.MeshStandardMaterial>

/** A gabled roof as a triangular prism: width w (x), length l (z), height h. */
function gable(w: number, l: number, h: number): THREE.BufferGeometry {
  const s = new THREE.Shape()
  s.moveTo(-w / 2, 0)
  s.lineTo(w / 2, 0)
  s.lineTo(0, h)
  s.closePath()
  return new THREE.ExtrudeGeometry(s, { depth: l, bevelEnabled: false }).translate(0, 0, -l / 2)
}

/** Build one building's meshes (one per material), at the origin, facing +Z. */
function model(kind: BuildingKind, seed = 0): THREE.Group {
  const g = new THREE.Group()
  const parts: Partial<Record<keyof typeof C, THREE.BufferGeometry[]>> = {}
  const add = (m: keyof typeof C, geo: THREE.BufferGeometry) => (parts[m] ??= []).push(geo)
  const rand = mulberry32(seed + 99)
  switch (kind) {
    case 'hut':
      add('stone', new THREE.CylinderGeometry(2.9, 3.1, 2.4, 14).translate(0, 1.2, 0))
      add('thatch', new THREE.ConeGeometry(3.7, 2.8, 14).translate(0, 3.8, 0))
      add('dark', new THREE.BoxGeometry(1, 1.7, 0.4).translate(0, 0.85, 2.95))
      break
    case 'house': {
      // Some are long, some tall; slate or thatch.
      const w = 5.6 + rand() * 1.2
      const l = 7.4 + rand() * 2
      const hgt = 3.4 + rand() * 1.4
      const roof = rand() < 0.75 ? 'slate' : 'thatch'
      add('timber', new THREE.BoxGeometry(w + 0.2, 0.8, l + 0.2).translate(0, 0.4, 0))
      add('wall', new THREE.BoxGeometry(w, hgt, l).translate(0, 0.8 + hgt / 2, 0))
      add(roof, gable(w + 0.9, l + 0.8, 2.6 + rand() * 0.8).translate(0, 0.8 + hgt, 0))
      add('stone', new THREE.BoxGeometry(0.8, 2.4, 0.8).translate(w * 0.3, 2.2 + hgt, -l * 0.28))
      add('dark', new THREE.BoxGeometry(1.2, 2, 0.3).translate(0, 1.2, l / 2 + 0.05))
      for (const x of [-w * 0.32, w * 0.32]) add('dark', new THREE.BoxGeometry(0.9, 0.9, 0.2).translate(x, 0.8 + hgt * 0.6, l / 2 + 0.05))
      break
    }
    case 'well':
      add('stone', new THREE.CylinderGeometry(1.3, 1.4, 0.9, 16, 1, true).translate(0, 0.45, 0))
      add('dark', new THREE.CircleGeometry(1.25, 16).rotateX(-Math.PI / 2).translate(0, 0.6, 0))
      for (const x of [-1.1, 1.1]) add('timber', new THREE.BoxGeometry(0.18, 2.3, 0.18).translate(x, 1.15, 0))
      add('slate', gable(2.8, 1.8, 0.9).translate(0, 2.3, 0))
      break
    case 'tower':
      add('stone', new THREE.BoxGeometry(4.2, 11, 4.2).translate(0, 5.5, 0))
      for (let i = 0; i < 4; i++) {
        for (const s of [-1, 1]) {
          const along = s * 1.4
          const box = new THREE.BoxGeometry(0.8, 0.9, 0.8)
          if (i < 2) box.translate(along, 11.45, i === 0 ? 1.8 : -1.8)
          else box.translate(i === 2 ? 1.8 : -1.8, 11.45, along)
          add('stone', box)
        }
      }
      add('dark', new THREE.BoxGeometry(1.1, 2, 0.3).translate(0, 1, 2.15))
      add('dark', new THREE.BoxGeometry(0.6, 1, 0.3).translate(0, 8, 2.15))
      break
    case 'church':
      // A nave, and a bell tower with a slate spire over the door.
      add('timber', new THREE.BoxGeometry(7.4, 0.8, 13.4).translate(0, 0.4, -1.5))
      add('wall', new THREE.BoxGeometry(7, 5.5, 13).translate(0, 3.55, -1.5))
      add('slate', gable(8, 13.8, 3.6).translate(0, 6.3, -1.5))
      add('stone', new THREE.BoxGeometry(3.8, 11, 3.8).translate(0, 5.5, 5.6))
      add('slate', new THREE.ConeGeometry(2.9, 7.5, 4).rotateY(Math.PI / 4).translate(0, 14.75, 5.6))
      add('dark', new THREE.BoxGeometry(1.6, 2.6, 0.3).translate(0, 1.3, 7.55))
      add('dark', new THREE.BoxGeometry(0.9, 1.3, 0.3).translate(0, 9, 7.55))
      for (const z of [-5, -1.5, 2]) for (const x of [-3.55, 3.55]) add('dark', new THREE.BoxGeometry(0.2, 2, 0.8).translate(x, 3.6, z))
      break
    case 'stall': {
      for (const x of [-1.6, 1.6]) for (const z of [-1.1, 1.1]) add('timber', new THREE.BoxGeometry(0.15, 2.4, 0.15).translate(x, 1.2, z))
      add('timber', new THREE.BoxGeometry(3.3, 0.9, 1.6).translate(0, 0.45, 0.2))
      const cloth = rand() < 0.5 ? 'red' : 'ochre'
      add(cloth, gable(3.9, 2.9, 0.7).translate(0, 2.4, 0))
      for (let i = 0; i < 5; i++) add(rand() < 0.5 ? 'wheat' : 'crop', new THREE.BoxGeometry(0.45, 0.35, 0.45).translate(-1.2 + i * 0.6, 1.05, 0.4))
      break
    }
    case 'windmill':
      add('stone', new THREE.CylinderGeometry(2.3, 3.2, 9.5, 14).translate(0, 4.75, 0))
      add('thatch', new THREE.ConeGeometry(2.9, 3.4, 14).translate(0, 11.2, 0))
      add('dark', new THREE.BoxGeometry(1.1, 2, 0.3).translate(0, 1, 3.15))
      break
    case 'field': {
      // Rows of crop on a ploughed plot, wheat or green.
      const crop = rand() < 0.55 ? 'wheat' : 'crop'
      add('timber', new THREE.BoxGeometry(17, 0.25, 23).translate(0, 0.05, 0))
      for (let i = 0; i < 11; i++) add(crop, new THREE.BoxGeometry(0.9, 0.7 + rand() * 0.15, 22).translate(-7.5 + i * 1.5, 0.45, 0))
      break
    }
  }
  for (const [m, geos] of Object.entries(parts) as Array<[keyof typeof C, THREE.BufferGeometry[]]>) {
    const merged = mergeGeometries(geos.map((x) => x.toNonIndexed()))!
    merged.computeVertexNormals()
    const mesh = new THREE.Mesh(merged, MATS[m])
    mesh.castShadow = kind !== 'field'
    mesh.receiveShadow = true
    g.add(mesh)
  }
  if (kind === 'windmill') {
    // Sails: a timber cross with cloth, turning in the wind.
    const sails = new THREE.Group()
    sails.name = 'sails'
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group()
      arm.rotation.z = (i * Math.PI) / 2
      const spar = new THREE.Mesh(new THREE.BoxGeometry(0.25, 7.5, 0.2).translate(0, 3.75, 0), MATS.timber)
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(1.5, 5.6, 0.08).translate(0.85, 4.3, 0), MATS.cloth)
      spar.castShadow = cloth.castShadow = true
      arm.add(spar, cloth)
      sails.add(arm)
    }
    sails.position.set(0, 9.2, 3.4)
    g.add(sails)
  }
  return g
}

const PREFIX = ['Lake', 'Still', 'Stride', 'Giant', 'Moss', 'Step', 'Rain', 'Cairn', 'Drag', 'Mere', 'Old', 'Ash', 'Thorn', 'Wold', 'Stone']
const SUFFIX = ['ford', 'mere', 'stead', 'hollow', 'wick', 'shore', 'rest', 'well', 'by', 'brook', 'ham', 'ton', 'field', 'cross']

export class Settlement {
  readonly group = new THREE.Group()
  readonly buildings: Building[] = []
  readonly towns: Town[] = []
  /** Painted roads (kept to save and to repaint). */
  readonly roads: Array<[number, number, number, number, number]> = []
  /**
   * Each town is drawn as one merged mesh per material (a whole village in a
   * dozen draw calls), rebuilt when a building goes up, falls or settles.
   */
  private readonly batches = new Map<number, THREE.Mesh[]>()
  private readonly dirtyTowns = new Set<number>()
  private nextId = 1
  private nextTown = 1
  private ghost: THREE.Group | null = null
  private ghostKind: BuildingKind | null = null
  private readonly ghostOk = new THREE.MeshBasicMaterial({ color: 0x7fe08a, transparent: true, opacity: 0.45, depthWrite: false })
  private readonly ghostBad = new THREE.MeshBasicMaterial({ color: 0xe0705a, transparent: true, opacity: 0.45, depthWrite: false })
  /** A town grew (for the chat). */
  onGrow: (town: Town, b: Building) => void = () => {}

  constructor(
    private readonly terrain: Terrain,
    private readonly lakes: LakeSystem,
    private readonly paint: PaintField,
  ) {
    this.group.name = 'settlement'
  }

  // --- the player's town (what build mode, the HUD and the tools talk about) --

  private get mine(): Town | undefined {
    for (let i = this.towns.length - 1; i >= 0; i--) if (this.towns[i].player) return this.towns[i]
    return undefined
  }
  get name(): string | null {
    return this.mine?.name ?? null
  }
  get cx(): number {
    return this.mine?.cx ?? 0
  }
  get cz(): number {
    return this.mine?.cz ?? 0
  }

  townAt(x: number, z: number): Town | undefined {
    let best: Town | undefined
    let bd = TOWN_RADIUS
    for (const t of this.towns) {
      const d = Math.hypot(x - t.cx, z - t.cz)
      if (d <= bd) {
        bd = d
        best = t
      }
    }
    return best
  }

  townById(id: number): Town | undefined {
    return this.towns.find((t) => t.id === id)
  }

  /** Why (x, z) will not do for `kind`, or null if it will. */
  whyNot(kind: BuildingKind, x: number, z: number): string | null {
    const r = RADIUS[kind]
    if (!this.townAt(x, z) && !this.nearWater(x, z)) {
      return this.mine
        ? `Too far from ${this.mine.name}. A new town must start near water.`
        : 'A settlement must start near water — build beside a lake a Titan made.'
    }
    // Dry and fairly level across the footprint.
    let lo = Infinity
    let hi = -Infinity
    for (let a = 0; a < 8; a++) {
      for (const d of [0, r * 0.6, r]) {
        const px = x + Math.cos(a * 0.785) * d
        const pz = z + Math.sin(a * 0.785) * d
        const h = this.terrain.heightAt(px, pz)
        lo = Math.min(lo, h)
        hi = Math.max(hi, h)
        if (this.wet(px, pz)) return 'That ground is under water.'
      }
    }
    if (hi - lo > (kind === 'well' || kind === 'stall' ? 1.2 : kind === 'field' ? 3 : 2.4)) return 'Too steep to build on.'
    // Streets stay open (wells and stalls belong on the square).
    if (kind !== 'well' && kind !== 'stall' && this.paint.at(x, z) > 0.5) return 'That is the street.'
    for (const b of this.buildings) if (Math.hypot(b.x - x, b.z - z) < RADIUS[b.kind] + r + 0.8) return `Too close to the ${KIND_NAME[b.kind].toLowerCase()}.`
    return null
  }

  /** Place a building (founding a town if it is the first here). Returns it, or a reason it cannot go there. */
  place(kind: BuildingKind, x: number, z: number, rot: number): Building | string {
    const why = this.whyNot(kind, x, z)
    if (why) return why
    let town = this.townAt(x, z)
    if (!town) town = this.found(x, z, true, Math.atan2(Math.sin(rot), Math.cos(rot)))
    return this.add(kind, x, z, rot, town.id)
  }

  private found(x: number, z: number, player: boolean, dir: number, name?: string): Town {
    const rand = mulberry32(Math.floor(x * 31 + z * 17) ^ 0x2545f491)
    const t: Town = {
      id: this.nextTown++,
      name: name ?? PREFIX[Math.floor(rand() * PREFIX.length)] + SUFFIX[Math.floor(rand() * SUFFIX.length)],
      cx: x,
      cz: z,
      dir,
      player,
      grown: 0,
      growTimer: GROW_EVERY * (0.5 + rand()),
    }
    this.towns.push(t)
    return t
  }

  private add(kind: BuildingKind, x: number, z: number, rot: number, town: number): Building {
    const id = this.nextId++
    const mesh = model(kind, id * 7 + Math.floor(x))
    mesh.position.set(x, this.lowest(kind, x, z), z)
    mesh.rotation.y = rot
    mesh.updateMatrixWorld(true)
    // Moving parts (windmill sails) are drawn on their own; the rest goes in the town's batch.
    const sails = mesh.getObjectByName('sails')
    if (sails) {
      sails.removeFromParent()
      sails.position.applyMatrix4(mesh.matrix)
      sails.rotation.y = rot
      sails.name = `sails:${id}`
      this.group.add(sails)
    }
    const b = { id, kind, x, z, rot, town, mesh }
    this.buildings.push(b)
    this.dirtyTowns.add(town)
    return b
  }

  /** Sit on the lowest ground under the footprint, so no corner floats. */
  private lowest(kind: BuildingKind, x: number, z: number): number {
    const r = RADIUS[kind] * 0.8
    let lo = this.terrain.heightAt(x, z)
    for (let a = 0; a < 8; a++) lo = Math.min(lo, this.terrain.heightAt(x + Math.cos(a * 0.785) * r, z + Math.sin(a * 0.785) * r))
    return lo - (kind === 'field' ? 0.15 : 0)
  }

  /** A Titan's foot came down (or dragged) here: everything within r is crushed. Returns what was. */
  crush(x: number, z: number, r: number): Building[] {
    const gone = this.buildings.filter((b) => Math.hypot(b.x - x, b.z - z) < r + RADIUS[b.kind] * 0.6)
    for (const b of gone) this.remove(b)
    return gone
  }

  /** Crush along a dragged foot's path. */
  crushAlong(ax: number, az: number, bx: number, bz: number, r: number): Building[] {
    const dx = bx - ax
    const dz = bz - az
    const len2 = dx * dx + dz * dz || 1
    const gone = this.buildings.filter((b) => {
      const t = Math.max(0, Math.min(1, ((b.x - ax) * dx + (b.z - az) * dz) / len2))
      return Math.hypot(b.x - (ax + dx * t), b.z - (az + dz * t)) < r + RADIUS[b.kind] * 0.6
    })
    for (const b of gone) this.remove(b)
    return gone
  }

  private remove(b: Building): void {
    b.mesh.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose()
    })
    const sails = this.group.getObjectByName(`sails:${b.id}`)
    if (sails) this.group.remove(sails)
    this.buildings.splice(this.buildings.indexOf(b), 1)
    this.dirtyTowns.add(b.town)
  }

  /** Re-merge a town's buildings into one mesh per material. */
  private rebatch(town: number): void {
    for (const m of this.batches.get(town) ?? []) {
      this.group.remove(m)
      m.geometry.dispose()
    }
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>()
    for (const b of this.buildings) {
      if (b.town !== town) continue
      b.mesh.updateMatrixWorld(true)
      for (const child of b.mesh.children) {
        const m = child as THREE.Mesh
        if (!m.isMesh) continue
        const list = byMat.get(m.material as THREE.Material) ?? []
        list.push(m.geometry.clone().applyMatrix4(m.matrixWorld))
        byMat.set(m.material as THREE.Material, list)
      }
    }
    const meshes: THREE.Mesh[] = []
    for (const [material, geos] of byMat) {
      const merged = mergeGeometries(geos)!
      for (const g of geos) g.dispose()
      const mesh = new THREE.Mesh(merged, material)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.matrixAutoUpdate = false
      this.group.add(mesh)
      meshes.push(mesh)
    }
    this.batches.set(town, meshes)
  }

  /** Is (x, z) under a building? (Nothing grows there.) */
  occupies(x: number, z: number): boolean {
    for (const b of this.buildings) if (Math.abs(b.x - x) < 13 && Math.abs(b.z - z) < 13 && Math.hypot(b.x - x, b.z - z) < RADIUS[b.kind] + 1) return true
    return false
  }

  /** Re-seat every building after the ground under it changed. */
  reseat(): void {
    for (const b of this.buildings) {
      const y = this.lowest(b.kind, b.x, b.z)
      if (Math.abs(y - b.mesh.position.y) < 0.01) continue
      b.mesh.position.y = y
      this.dirtyTowns.add(b.town)
      const sails = this.group.getObjectByName(`sails:${b.id}`)
      if (sails) sails.position.y = y + 9.2
    }
  }

  // --- old villages ------------------------------------------------------------

  /**
   * Lay out the old villages for a fresh world: on low, open ground away from
   * spawn and the Titans, each with a square, a well, stalls, a church,
   * streets of houses and huts, a windmill and fields; dirt roads join them
   * and lead one in from where you start.
   */
  generate(seed: number, count: number, avoid: Array<{ x: number; z: number; r: number }>, forest: (x: number, z: number) => number): void {
    const rand = mulberry32(seed ^ 0x9e3779b9)
    const centres: Array<{ x: number; z: number }> = []
    for (let tries = 0; tries < 400 && centres.length < count; tries++) {
      const a = rand() * Math.PI * 2
      const r = 480 + rand() * 900
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      if (this.terrain.heightAt(x, z) > 35 || forest(x, z) > 0.25) continue
      if (avoid.some((p) => Math.hypot(p.x - x, p.z - z) < p.r)) continue
      if (centres.some((c) => Math.hypot(c.x - x, c.z - z) < 650)) continue
      // Fairly level over the whole square.
      let lo = Infinity
      let hi = -Infinity
      for (let i = 0; i < 16; i++) {
        const h = this.terrain.heightAt(x + Math.cos(i * 0.39) * 40, z + Math.sin(i * 0.39) * 40)
        lo = Math.min(lo, h)
        hi = Math.max(hi, h)
      }
      if (hi - lo > 6) continue
      centres.push({ x, z })
    }
    for (const c of centres) this.village(c.x, c.z, rand)
    // Roads between neighbouring villages, and one in from the start.
    for (let i = 0; i < centres.length; i++) {
      const j = (i + 1) % centres.length
      if (centres.length > 1 && (centres.length > 2 || i === 0)) this.road(centres[i].x, centres[i].z, centres[j].x, centres[j].z, 3.2)
    }
    const near = [...centres].sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0]
    if (near) this.road(near.x, near.z, 0, 0, 3)
  }

  private road(ax: number, az: number, bx: number, bz: number, w: number): void {
    this.roads.push([ax, az, bx, bz, w])
    this.paint.line(ax, az, bx, bz, w)
  }

  private village(cx: number, cz: number, rand: () => number): void {
    const dir = rand() * Math.PI
    const t = this.found(cx, cz, false, dir)
    const fx = Math.sin(dir)
    const fz = Math.cos(dir)
    const px = fz
    const pz = -fx
    const L = 100
    this.road(cx - fx * L, cz - fz * L, cx + fx * L, cz + fz * L, 5)
    this.road(cx - px * 55, cz - pz * 55, cx + px * 55, cz + pz * 55, 4)
    this.paint.disc(cx, cz, 13)
    this.roads.push([cx, cz, cx, cz, 26])
    const put = (kind: BuildingKind, x: number, z: number, rot: number, jitter = 3) => {
      for (let k = 0; k < 6; k++) {
        const jx = x + (k ? (rand() - 0.5) * jitter : 0)
        const jz = z + (k ? (rand() - 0.5) * jitter : 0)
        if (!this.whyNotGen(kind, jx, jz)) {
          this.add(kind, jx, jz, rot, t.id)
          return true
        }
      }
      return false
    }
    // The square: a well, stalls round it, the church on one side facing in.
    put('well', cx, cz, 0, 0)
    for (let i = 0; i < 3; i++) {
      const a = dir + Math.PI / 4 + (i * Math.PI) / 2
      put('stall', cx + Math.sin(a) * 9, cz + Math.cos(a) * 9, a + Math.PI, 1.5)
    }
    // The church on a corner of the square (between the streets), its door to the well.
    const qx = (fx + px) * 0.7071
    const qz = (fz + pz) * 0.7071
    put('church', cx + qx * 23, cz + qz * 23, Math.atan2(-qx, -qz), 3)
    // Houses along both streets, doors to the street.
    const along = (sx: number, sz: number, ox: number, oz: number, n: number, start: number) => {
      for (let i = 0; i < n; i++) {
        const s = start + i * 14
        for (const side of [-1, 1]) {
          const x = cx + sx * s + ox * side * 11
          const z = cz + sz * s + oz * side * 11
          put(rand() < 0.7 ? 'house' : 'hut', x, z, Math.atan2(-ox * side, -oz * side), 2.5)
        }
      }
    }
    along(fx, fz, px, pz, 5, 26)
    along(-fx, -fz, px, pz, 5, 26)
    along(px, pz, fx, fz, 2, 40)
    along(-px, -pz, fx, fz, 2, 40)
    t.grown = 5
    // A windmill on the edge of town, fields beyond the houses.
    put('windmill', cx + fx * (L + 20) + px * 22, cz + fz * (L + 20) + pz * 22, dir + Math.PI, 8)
    for (const [s, side] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      put('field', cx + fx * s * 70 + px * side * 42, cz + fz * s * 70 + pz * side * 42, dir, 10)
    }
  }

  /** Generation rules: like the player's, minus the need for a Titan's lake. */
  private whyNotGen(kind: BuildingKind, x: number, z: number): string | null {
    const r = RADIUS[kind]
    let lo = Infinity
    let hi = -Infinity
    for (let a = 0; a < 8; a++) {
      for (const d of [0, r]) {
        const h = this.terrain.heightAt(x + Math.cos(a * 0.785) * d, z + Math.sin(a * 0.785) * d)
        lo = Math.min(lo, h)
        hi = Math.max(hi, h)
      }
    }
    if (hi - lo > (kind === 'field' ? 3.5 : 2.6)) return 'steep'
    if (kind !== 'well' && kind !== 'stall' && this.paint.at(x, z) > 0.5) return 'street'
    for (const b of this.buildings) if (Math.hypot(b.x - x, b.z - z) < RADIUS[b.kind] + r + 0.8) return 'crowded'
    return null
  }

  // --- growth ------------------------------------------------------------------

  /** Towns with a well and a few homes put up a new home every so often. */
  grow(dt: number): void {
    for (const t of this.towns) {
      const mine = this.buildings.filter((b) => b.town === t.id)
      if (mine.length >= MAX_BUILDINGS || !mine.some((b) => b.kind === 'well')) continue
      if (mine.filter((b) => b.kind === 'house' || b.kind === 'hut').length < (t.player ? 2 : 3)) continue
      t.growTimer -= dt
      if (t.growTimer > 0) continue
      t.growTimer = GROW_EVERY
      const b = this.growOne(t)
      if (b) this.onGrow(t, b)
    }
  }

  /** Catch up after time away: up to `n` new buildings per town. */
  catchUp(n: number): number {
    let built = 0
    for (const t of this.towns) {
      for (let i = 0; i < n; i++) {
        const mine = this.buildings.filter((b) => b.town === t.id)
        if (mine.length >= MAX_BUILDINGS || !mine.some((b) => b.kind === 'well')) break
        if (this.growOne(t)) built++
      }
    }
    return built
  }

  private growOne(t: Town): Building | null {
    const rand = mulberry32(t.id * 7919 + t.grown * 104729 + this.buildings.length)
    const fx = Math.sin(t.dir)
    const fz = Math.cos(t.dir)
    const px = fz
    const pz = -fx
    for (let tries = 0; tries < 16; tries++) {
      t.grown++
      let x: number
      let z: number
      let rot: number
      if (!t.player) {
        // Extend the main street outward, a plot at a time, both ends, both sides.
        const s = 26 + Math.floor(t.grown / 4) * 14
        const end = t.grown % 2 ? 1 : -1
        const side = (t.grown >> 1) % 2 ? 1 : -1
        x = t.cx + fx * end * s + px * side * 11
        z = t.cz + fz * end * s + pz * side * 11
        rot = Math.atan2(-px * side, -pz * side)
        if (s > 100) this.road(t.cx + fx * end * (s - 14), t.cz + fz * end * (s - 14), t.cx + fx * end * (s + 4), t.cz + fz * end * (s + 4), 5)
      } else {
        // A player's town grows in rings about its first building, a path to each door.
        const ring = 1 + Math.floor(t.grown / 8)
        const a = t.dir + (t.grown % 8) * (Math.PI / 4) + ring * 0.4
        const d = 14 + ring * 13
        x = t.cx + Math.sin(a) * d
        z = t.cz + Math.cos(a) * d
        rot = a + Math.PI
      }
      if (Math.hypot(x - t.cx, z - t.cz) > TOWN_RADIUS) continue
      const kind: BuildingKind = rand() < 0.65 ? 'house' : 'hut'
      if (this.whyNotGen(kind, x, z) || this.wet(x, z)) continue
      if (t.player) this.road(x + Math.sin(rot) * (RADIUS[kind] + 1), z + Math.cos(rot) * (RADIUS[kind] + 1), t.cx, t.cz, 2.4)
      return this.add(kind, x, z, rot, t.id)
    }
    return null
  }

  /** Turn the windmills' sails, and re-merge any town that changed. */
  update(dt: number): void {
    for (const o of this.group.children) if (o.name.startsWith('sails:')) o.rotateZ(dt * 0.6)
    for (const t of this.dirtyTowns) this.rebatch(t)
    this.dirtyTowns.clear()
  }

  /** Draw calls the towns cost (tools). */
  get drawCalls(): number {
    let n = 0
    for (const m of this.batches.values()) n += m.length
    return n
  }

  // --- build mode --------------------------------------------------------------

  /** The see-through preview shown in build mode; green if it fits. Null hides it. */
  preview(kind: BuildingKind | null, x = 0, z = 0, rot = 0): string | null {
    if (!kind) {
      if (this.ghost) this.ghost.visible = false
      return null
    }
    if (this.ghostKind !== kind) {
      if (this.ghost) this.group.remove(this.ghost)
      this.ghost = model(kind)
      this.ghostKind = kind
      this.group.add(this.ghost)
    }
    const why = this.whyNot(kind, x, z)
    this.ghost!.traverse((m) => {
      const mesh = m as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = why ? this.ghostBad : this.ghostOk
      mesh.castShadow = false
    })
    this.ghost!.visible = true
    this.ghost!.position.set(x, this.lowest(kind, x, z), z)
    this.ghost!.rotation.y = rot
    return why
  }

  // --- saving --------------------------------------------------------------------

  save(): SettlementSave | null {
    if (this.towns.length === 0) return null
    return {
      v: 2,
      towns: this.towns.map(({ growTimer: _, ...t }) => t),
      buildings: this.buildings.map((b) => ({ kind: b.kind, x: b.x, z: b.z, rot: b.rot, town: b.town })),
      roads: this.roads,
    }
  }

  load(s: SettlementSave | SettlementSaveV1): void {
    if (!('v' in s)) {
      // One player town, from before towns could be many.
      const t = this.found(s.cx, s.cz, true, 0, s.name)
      for (const b of s.buildings) this.add(b.kind, b.x, b.z, b.rot, t.id)
      return
    }
    for (const t of s.towns) {
      this.towns.push({ ...t, growTimer: GROW_EVERY * 0.5 })
      this.nextTown = Math.max(this.nextTown, t.id + 1)
    }
    for (const r of s.roads) {
      this.roads.push(r)
      if (r[4] > 20) this.paint.disc(r[0], r[1], r[4] / 2)
      else this.paint.line(r[0], r[1], r[2], r[3], r[4])
    }
    for (const b of s.buildings) this.add(b.kind, b.x, b.z, b.rot, b.town)
  }

  /** Doors, wells and the like, for townsfolk to walk between. */
  places(): Array<{ x: number; z: number; kind: BuildingKind; town: number }> {
    return this.buildings.map((b) => ({
      kind: b.kind,
      town: b.town,
      // In front of the door (+Z of the model, rotated).
      x: b.x + Math.sin(b.rot) * (RADIUS[b.kind] + 1.5),
      z: b.z + Math.cos(b.rot) * (RADIUS[b.kind] + 1.5),
    }))
  }

  private nearWater(x: number, z: number): boolean {
    for (const l of this.lakes.lakes) {
      const b = l.basin
      if (l.level <= b.bottom + 0.3) continue
      if (x < b.x0 - WATER_NEAR || x > b.x0 + b.w + WATER_NEAR || z < b.z0 - WATER_NEAR || z > b.z0 + b.h + WATER_NEAR) continue
      for (let j = 0; j < b.h; j += 2) for (let i = 0; i < b.w; i += 2) if (b.mask[j * b.w + i] && Math.hypot(b.x0 + i - x, b.z0 + j - z) < WATER_NEAR) return true
    }
    return false
  }

  wet(x: number, z: number): boolean {
    const ix = Math.round(x)
    const iz = Math.round(z)
    for (const l of this.lakes.lakes) if (inBasin(l.basin, ix, iz) && l.level > this.terrain.cellHeight(ix, iz) + 0.05) return true
    return false
  }
}
