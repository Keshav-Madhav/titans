// The settlement: a small town Wanderers build beside a lake a Titan made.
// The first building founds it (it must stand near water); the rest must
// stay within its bounds, on dry, fairly level ground, clear of each other.
// Buildings are procedural, in the reel's style: white walls, slate roofs,
// stone and thatch. A Titan's footfall, stomp or drag crushes what it hits.

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { inBasin, mulberry32, type LakeSystem, type Terrain } from '@titans/shared'

export type BuildingKind = 'hut' | 'house' | 'well' | 'tower'
export const KINDS: BuildingKind[] = ['hut', 'house', 'well', 'tower']
export const KIND_NAME: Record<BuildingKind, string> = { hut: 'Hut', house: 'House', well: 'Well', tower: 'Watchtower' }

/** Footprint radius (m) per kind: placement spacing and crush test. */
const RADIUS: Record<BuildingKind, number> = { hut: 3.8, house: 5.4, well: 1.8, tower: 3.2 }
/** How far from its centre a settlement may grow, and how near water it must start. */
export const TOWN_RADIUS = 140
const WATER_NEAR = 110

export interface Building {
  id: number
  kind: BuildingKind
  x: number
  z: number
  rot: number
  mesh: THREE.Group
}

export interface SettlementSave {
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
function model(kind: BuildingKind): THREE.Group {
  const g = new THREE.Group()
  const parts: Partial<Record<keyof typeof C, THREE.BufferGeometry[]>> = {}
  const add = (m: keyof typeof C, geo: THREE.BufferGeometry) => (parts[m] ??= []).push(geo)
  switch (kind) {
    case 'hut':
      add('stone', new THREE.CylinderGeometry(2.9, 3.1, 2.4, 14).translate(0, 1.2, 0))
      add('thatch', new THREE.ConeGeometry(3.7, 2.8, 14).translate(0, 3.8, 0))
      add('dark', new THREE.BoxGeometry(1, 1.7, 0.4).translate(0, 0.85, 2.95))
      break
    case 'house':
      add('timber', new THREE.BoxGeometry(6.2, 0.8, 8.2).translate(0, 0.4, 0))
      add('wall', new THREE.BoxGeometry(6, 3.6, 8).translate(0, 2.6, 0))
      add('slate', gable(6.9, 8.8, 2.9).translate(0, 4.4, 0))
      add('stone', new THREE.BoxGeometry(0.8, 2.2, 0.8).translate(1.8, 6.2, -2.2))
      add('dark', new THREE.BoxGeometry(1.2, 2, 0.3).translate(0, 1.2, 4.05))
      for (const x of [-1.9, 1.9]) add('dark', new THREE.BoxGeometry(0.9, 0.9, 0.2).translate(x, 2.9, 4.05))
      break
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
  }
  for (const [m, geos] of Object.entries(parts) as Array<[keyof typeof C, THREE.BufferGeometry[]]>) {
    const merged = mergeGeometries(geos.map((x) => x.toNonIndexed()))!
    merged.computeVertexNormals()
    const mesh = new THREE.Mesh(merged, MATS[m])
    mesh.castShadow = true
    mesh.receiveShadow = true
    g.add(mesh)
  }
  return g
}

const PREFIX = ['Lake', 'Still', 'Stride', 'Giant', 'Moss', 'Step', 'Rain', 'Cairn', 'Drag', 'Mere']
const SUFFIX = ['ford', 'mere', 'stead', 'hollow', 'wick', 'shore', 'rest', 'well', 'by', 'brook']

export class Settlement {
  readonly group = new THREE.Group()
  readonly buildings: Building[] = []
  name: string | null = null
  cx = 0
  cz = 0
  private nextId = 1
  private ghost: THREE.Group | null = null
  private ghostKind: BuildingKind | null = null
  private readonly ghostOk = new THREE.MeshBasicMaterial({ color: 0x7fe08a, transparent: true, opacity: 0.45, depthWrite: false })
  private readonly ghostBad = new THREE.MeshBasicMaterial({ color: 0xe0705a, transparent: true, opacity: 0.45, depthWrite: false })

  constructor(
    private readonly terrain: Terrain,
    private readonly lakes: LakeSystem,
  ) {
    this.group.name = 'settlement'
  }

  /** Why (x, z) will not do for `kind`, or null if it will. */
  whyNot(kind: BuildingKind, x: number, z: number): string | null {
    const r = RADIUS[kind]
    if (this.name) {
      if (Math.hypot(x - this.cx, z - this.cz) > TOWN_RADIUS) return `Too far from ${this.name}.`
    } else if (!this.nearWater(x, z)) {
      return 'A settlement must start near water — build beside a lake a Titan made.'
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
    if (hi - lo > (kind === 'well' ? 1.2 : 2.4)) return 'Too steep to build on.'
    for (const b of this.buildings) if (Math.hypot(b.x - x, b.z - z) < RADIUS[b.kind] + r + 0.8) return `Too close to the ${KIND_NAME[b.kind].toLowerCase()}.`
    return null
  }

  /** Place a building (founding the settlement with the first). Returns it, or a reason it cannot go there. */
  place(kind: BuildingKind, x: number, z: number, rot: number): Building | string {
    const why = this.whyNot(kind, x, z)
    if (why) return why
    if (!this.name) {
      const rand = mulberry32(Math.floor(x * 31 + z * 17))
      this.name = PREFIX[Math.floor(rand() * PREFIX.length)] + SUFFIX[Math.floor(rand() * SUFFIX.length)]
      this.cx = x
      this.cz = z
    }
    return this.add(kind, x, z, rot)
  }

  private add(kind: BuildingKind, x: number, z: number, rot: number): Building {
    const mesh = model(kind)
    mesh.position.set(x, this.lowest(kind, x, z), z)
    mesh.rotation.y = rot
    this.group.add(mesh)
    const b = { id: this.nextId++, kind, x, z, rot, mesh }
    this.buildings.push(b)
    return b
  }

  /** Sit on the lowest ground under the footprint, so no corner floats. */
  private lowest(kind: BuildingKind, x: number, z: number): number {
    const r = RADIUS[kind] * 0.8
    let lo = this.terrain.heightAt(x, z)
    for (let a = 0; a < 8; a++) lo = Math.min(lo, this.terrain.heightAt(x + Math.cos(a * 0.785) * r, z + Math.sin(a * 0.785) * r))
    return lo
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
    this.group.remove(b.mesh)
    for (const m of b.mesh.children) (m as THREE.Mesh).geometry.dispose()
    this.buildings.splice(this.buildings.indexOf(b), 1)
  }

  /** Re-seat every building after the ground under it changed. */
  reseat(): void {
    for (const b of this.buildings) b.mesh.position.y = this.lowest(b.kind, b.x, b.z)
  }

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
    for (const m of this.ghost!.children) {
      const mesh = m as THREE.Mesh
      mesh.material = why ? this.ghostBad : this.ghostOk
      mesh.castShadow = false
    }
    this.ghost!.visible = true
    this.ghost!.position.set(x, this.lowest(kind, x, z), z)
    this.ghost!.rotation.y = rot
    return why
  }

  save(): SettlementSave | null {
    if (!this.name) return null
    return { name: this.name, cx: this.cx, cz: this.cz, buildings: this.buildings.map((b) => ({ kind: b.kind, x: b.x, z: b.z, rot: b.rot })) }
  }

  load(s: SettlementSave): void {
    this.name = s.name
    this.cx = s.cx
    this.cz = s.cz
    for (const b of s.buildings) this.add(b.kind, b.x, b.z, b.rot)
  }

  /** Doors, wells and the like, for townsfolk to walk between. */
  places(): Array<{ x: number; z: number; kind: BuildingKind }> {
    return this.buildings.map((b) => ({
      kind: b.kind,
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
