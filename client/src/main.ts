// TITANS — a single-player adventure among giants. You are a wanderer; the
// giants walk on their own, reshaping the land (footprints become lakes,
// sleeping giants become mountains), and you explore, follow and climb them.

import * as THREE from 'three'
import {
  applyDrag,
  applyFootprint,
  applyImpact,
  applyMountain,
  dragFor,
  mountainFor,
  footprintFor,
  impactFor,
  DORMANT_AFTER_MS,
  LakeSystem,
  Terrain,
  SPREAD,
  TITAN_HEIGHT,
  WORLD_SEED,
  HALL,
  inHall,
  type Box,
  type GaitEvent,
  type GaitInput,
  type MountainRise,
  TitanBrain,
  TITAN_SPAWNS,
  type TitanSnapshot as Snap,
} from '@titans/shared'
import * as shared from '@titans/shared'
import { TerrainView } from './terrain-view'
import { loadTerrainTextures } from './terrain-material'
import { SkySystem } from './sky'
import { Input } from './input'
import { Wanderer } from './wanderer'
import { setGiantSkin, Titan } from './titan'
import { WaterView } from './water-view'
import { Effects } from './effects'
import { CameraRig, WANDERER_CAM } from './camera-rig'
import { Hud } from './hud'
import { Narration } from './narration'
import { Climber } from './climb'
import { CliffClimb } from './cliff'
import { Mountains } from './mountains'
import { Wildlife, type Threat } from './wildlife'
import { ancientTrails } from './ancient'
import { Rocks, rockMaterial } from './rocks'
import { Colossi } from './colossi'
import { Leviathans } from './leviathans'
import { Undercroft } from './hall'
import { WorldMap, type MapPlace } from './map'
import { Cairns, type CairnPlace } from './cairns'
import { Striders } from './striders'
import { Watchers } from './watchers'
import { Mist } from './mist'
import { Awakening } from './awakening'
import { Herd } from './herd'
import { CATALOGUE, Discoveries, visit, type Site } from './discovery'
import { Journal } from './journal'
import { Bag } from './bag'
import { Camp } from './camp'
import { Spots, type Spot } from './spots'
import { Wisps } from './wisps'
import { Resonance } from './resonance'
import { Eyes, type EyeSet } from './eyes'
import { Bow, type ArrowHit, type Pick } from './bow'
import { carvedStone } from './spots'
import { Birds } from './life'
import { Clouds } from './clouds'
import { Biome } from './biome'
import { PaintField } from './paint'
import { Vegetation } from './vegetation'
import { foliageFocus } from './trees'
import { Grass } from './grass'
import { Sound } from './audio'
import { Tips } from './tips'
import { Quality } from './quality'
import { installAtmosphere } from './atmosphere'
import { Post } from './post'
import { Weather } from './weather'
import { clearWorld, loadSettings, loadWorld, packEvent, saveWorld, unpackEvent, type SaveData, type SavedEvent } from './save'

const STEP = 1 / 60
const params = new URLSearchParams(location.search)
/** Tools open ?offline: a fresh, unsaved world whose giants stand still unless ?wild. */
const toolMode = params.has('offline')

const canvas = document.getElementById('game') as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  // A 1.8 m wanderer and a 300 m giant under a 45 km sky: reversed depth keeps
  // precision at both ends. Falls back to the standard buffer without EXT_clip_control.
  reversedDepthBuffer: params.get('rdb') !== '0',
})
renderer.setSize(innerWidth, innerHeight, false)
// ACES plus a warm grade (atmosphere.ts patches CustomToneMapping).
renderer.toneMapping = THREE.CustomToneMapping
renderer.toneMappingExposure = 0.84
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
// Counted across every pass of a frame (post.ts renders several), reset per frame.
renderer.info.autoReset = false

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.15, 90000)

const terrain = new Terrain(WORLD_SEED)
// The ground's textures load under the loading screen, before anything is built.
const terrainTex = await loadTerrainTextures(renderer)
const terrainView = new TerrainView(terrain, WORLD_SEED, terrainTex)
setGiantSkin(terrainTex)
scene.add(terrainView.group)
const biome = new Biome(WORLD_SEED, terrain.base.regions)
const paint = new PaintField()
const pave = new PaintField()
terrainView.biome = biome

const sky = new SkySystem(scene, renderer)
installAtmosphere(sky.sunDir, { hall: { ...HALL, top: terrain.base.hallTop } })
const quality = new Quality(renderer, terrainView, sky.sun, params.get('quality'))
// Bloom, god rays and the grade (?post=0 renders straight to the screen).
const post = new Post(renderer, scene, camera)
const LOWEST = 2
quality.onApply = (level) => {
  post.enabled = params.get('post') !== '0' && level < LOWEST
  post.resize()
}
quality.onApply(quality.level)
// The weather: a low cloud deck the tall things vanish into, storms, breaks of sun.
const weather = new Weather(sky, post, scene, WORLD_SEED)
scene.add(weather.group)
weather.onLightning = (d) => sound.thunder(d)
weather.roof = terrain.base.hallTop
if (params.get('weather')) weather.set(params.get('weather') as Parameters<Weather['set']>[0], true)

// New pools only in hollows a giant dug (natural hollows stay dry).
const lakes = new LakeSystem(terrain.cellHeight, undefined, (x, z) => terrain.delta.at(x, z) < -0.05)
const water = new WaterView()
scene.add(water.group)
const effects = new Effects((x, z) => terrain.heightAt(x, z))
scene.add(effects.group)
const wildlife = new Wildlife(terrain, lakes)
scene.add(wildlife.group)
const clouds = new Clouds()
scene.add(clouds.mesh)
const birds = new Birds(terrain)
scene.add(birds.mesh)
// The First Ones' trails come from the seed alone, so they are the same in every session.
const trails = ancientTrails(WORLD_SEED, TITAN_HEIGHT, (x, z) => terrain.heightAt(x, z))
const trailPoints = trails.flatMap((t) => t.events.map((e) => (e.type === 'drag' ? { x: e.bx, z: e.bz } : { x: e.x, z: e.z })))
// Arches, caves, hoodoos, overhangs, spires and boulders, clear of the start and the old trails.
const rocks = new Rocks(terrain, WORLD_SEED, terrainTex, (x, z, r) => Math.hypot(x, z) > 600 + r && !trailPoints.some((p) => Math.hypot(p.x - x, p.z - z) < r + 60))
scene.add(rocks.group)
// The colossi: the Sentinel, the fallen First One's bones, the colonnade, the
// Great Stair and the Gate, the giant trees, the stones hanging in the sky.
const crownWind = { value: 0 }
const colossi = new Colossi(terrain, rocks, WORLD_SEED, crownWind)
scene.add(colossi.group)
// Striders: pale things on legs five hundred metres long, walking the far lands.
const striders = new Striders(terrain, WORLD_SEED)
scene.add(striders.group)
// Mist lying in the hollows and gathered round the colossi's feet.
const mist = new Mist(terrain, WORLD_SEED, [...colossi.places].filter(([k]) => !k.startsWith('stone')).map(([, v]) => v))
scene.add(mist.mesh)
// Watchers: gaunt figures on the ridges, seen only under a heavy sky; gone when you come close.
const watchers = new Watchers(terrain, WORLD_SEED, (x, z) => rocks.occupies(x, z))
scene.add(watchers.group)
// Leviathans swimming through the sky a kilometre up.
const leviathans = new Leviathans(WORLD_SEED)
scene.add(leviathans.group)
/** Where the giants must not walk: through a colossus. */
const colossusAvoid = rocks.formations.filter((f) => f.always && !f.float).map((f) => ({ x: f.x, z: f.z, r: Math.max(f.hx, f.hz) + 160 }))
// The Undercroft: a hall of pillars under the valley floor.
const undercroft = new Undercroft(terrain, rocks)
scene.add(undercroft.group)
// The map: uncovered as you explore (more from up high); M opens it.
const NAMES: Record<string, string> = {
  sentinel: 'The Sentinel',
  ribcage: 'The Fallen',
  sword: 'The Sword',
  colonnade: 'The Colonnade',
  gate: 'The Gate',
}
const mapPlaces: MapPlace[] = [
  ...[...colossi.places].filter(([k]) => k !== 'skull' && k !== 'stair').map(([k, v]): MapPlace => ({
    name: NAMES[k] ?? null,
    kind: k.startsWith('tree') ? 'tree' : k.startsWith('stone') ? 'stone' : 'colossus',
    x: v.x,
    z: v.z,
  })),
  { name: 'The Undercroft', kind: 'hall', x: HALL.x, z: HALL.z },
]
const worldMap = new WorldMap(terrain, mapPlaces)
worldMap.onToggle = () => input.releaseAll()

// Cairns on the hardest high places: light one and the land below is uncovered.
const cairnPlaces: CairnPlace[] = []
{
  // The two highest peaks of each land (well apart), inside the mountains.
  const NAMES: Record<string, string[]> = {
    forest: ['Moss Crown', 'Rootwatch'],
    desert: ['The Red Tooth', 'Dune Watch'],
    ruins: ['The High Terrace', 'The Last Step'],
  }
  for (const land of ['forest', 'desert', 'ruins'] as const) {
    const peaks: Array<{ x: number; z: number; h: number }> = []
    const R = 2500 * SPREAD
    for (let z = -R; z <= R; z += 120) {
      for (let x = -R; x <= R; x += 120) {
        if (Math.hypot(x, z) > R || terrain.base.regions.name(x, z) !== land || inHall(x, z, 60)) continue
        const h = terrain.heightAt(x, z)
        if (h > 330) continue // the snow line: out of reach for now
        let top = true
        for (let k = 0; k < 8 && top; k++) if (terrain.heightAt(x + Math.cos(k * 0.785) * 200, z + Math.sin(k * 0.785) * 200) > h) top = false
        if (top) peaks.push({ x, z, h })
      }
    }
    peaks.sort((a, b) => b.h - a.h)
    const chosen: typeof peaks = []
    for (const p of peaks) if (chosen.length < 2 && chosen.every((c) => Math.hypot(c.x - p.x, c.z - p.z) > 900 * SPREAD)) chosen.push(p)
    chosen.forEach((p, i) => cairnPlaces.push({ name: NAMES[land][i], x: p.x, y: terrain.heightAt(p.x, p.z), z: p.z }))
  }
  // The top of the tallest standing pillar of the colonnade.
  const pillar = rocks.formations.filter((f) => f.kind === 'built' && f.hx < 80 && f.hy > 200).sort((a, b) => b.hy - a.hy)[0]
  const pillarTop = pillar && rocks.topAt(pillar.x, pillar.z)
  if (pillar && pillarTop !== null) cairnPlaces.push({ name: 'The Tallest Pillar', x: pillar.x, y: pillarTop, z: pillar.z })
  // The crown of the Sentinel's hood: its highest point.
  const sen = colossi.places.get('sentinel')
  if (sen) {
    let best = { x: sen.x, z: sen.z, y: -Infinity }
    for (let dz = -60; dz <= 60; dz += 4) {
      for (let dx = -60; dx <= 60; dx += 4) {
        const y = rocks.topAt(sen.x + dx, sen.z + dz)
        if (y !== null && y > best.y) best = { x: sen.x + dx, z: sen.z + dz, y }
      }
    }
    if (best.y > 0) cairnPlaces.push({ name: "The Sentinel's Hood", ...best })
  }
}
const cairns = new Cairns(cairnPlaces)

// Chase the light: wisps that lead you somewhere, and leave something there.
const wisps = new Wisps(
  [
    { id: 'wisp-green', start: { x: -2150, z: 950 }, bearing: -Math.PI / 2, seed: 61 },
    { id: 'wisp-wood', start: { x: -3500, z: -2400 }, bearing: -2.2, seed: 62 },
    { id: 'wisp-dunes', start: { x: 1300, z: 3700 }, bearing: 0.3, seed: 63 },
  ],
  terrain,
)
scene.add(wisps.group)

// Resonance stones: strike them in the order carved on the slab.
/** The levellest ground within `r` of (x, z) for something `size` across. */
function levelNear(x: number, z: number, r: number, size: number): { x: number; z: number } {
  let best = { x, z, spread: Infinity }
  for (let dz = -r; dz <= r; dz += 20) {
    for (let dx = -r; dx <= r; dx += 20) {
      let lo = Infinity
      let hi = -Infinity
      for (let k = 0; k < 8; k++) {
        const h = terrain.heightAt(x + dx + Math.cos(k * 0.785) * size, z + dz + Math.sin(k * 0.785) * size)
        lo = Math.min(lo, h)
        hi = Math.max(hi, h)
      }
      const spread = hi - lo + Math.hypot(dx, dz) * 0.002
      const clear = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([u, v]) => !rocks.occupies(x + dx + u * (size + 4), z + dz + v * (size + 4)))
      if (spread < best.spread && clear) best = { x: x + dx, z: z + dz, spread }
    }
  }
  return best
}
const resonance = new Resonance(
  [
    { id: 'res-steps', ...levelNear(3900, -900, 300, 10), order: [1, 3, 0, 2] },
    { id: 'res-wood', ...levelNear(-2800, -3200, 300, 10), order: [2, 0, 3, 1] },
  ],
  terrain,
)
scene.add(resonance.group)

// The bow's targets: sets of stone eyes (placed with the spots, below).
const eyeSets: EyeSet[] = []

// Words on stone, and trinkets on the high places (spots.ts; the words themselves are in discovery.ts).
const spots = (() => {
  const H = (x: number, z: number) => terrain.heightAt(x, z)
  const ground = (x: number, z: number) => new THREE.Vector3(x, H(x, z), z)
  /** The top of the rock at (x, z) if it is level enough to stand on (else null: you would slide off). */
  const flatTop = (x: number, z: number) => {
    const y = rocks.topAt(x, z)
    if (y === null) return null
    for (const [dx, dz] of [[0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]]) {
      const n = rocks.topAt(x + dx, z + dz)
      if (n === null || Math.abs(n - y) > 0.45) return null
    }
    return y
  }
  /** The highest standable top within `r` of (x, z) (formations and colossi), or null. */
  const topNear = (x: number, z: number, r: number) => {
    let best: THREE.Vector3 | null = null
    const step = Math.max(1.5, r / 8)
    for (let dz = -r; dz <= r; dz += step) {
      for (let dx = -r; dx <= r; dx += step) {
        const y = flatTop(x + dx, z + dz)
        if (y !== null && (!best || y > best.y)) best = new THREE.Vector3(x + dx, y, z + dz)
      }
    }
    return best
  }
  const P = (n: string) => colossi.places.get(n)
  const cairnAt = (n: string) => cairnPlaces.find((c) => c.name === n)
  const regions = terrain.base.regions
  const formation = (kind: string, land: string) => rocks.formations.find((f) => f.kind === kind && regions.name(f.x, f.z) === land)
  // A mesa top in the Dune Sea: high above its surroundings, flat on top.
  let mesa: THREE.Vector3 | null = null
  for (let z = 2800; z <= 6400 && !mesa; z += 150) {
    for (let x = -3600; x <= 3600 && !mesa; x += 150) {
      if (regions.name(x, z) !== 'desert') continue
      const h = H(x, z)
      let ring = 0
      let flat = 0
      for (let k = 0; k < 8; k++) {
        ring += H(x + Math.cos(k * 0.785) * 160, z + Math.sin(k * 0.785) * 160) / 8
        flat = Math.max(flat, Math.abs(H(x + Math.cos(k * 0.785) * 14, z + Math.sin(k * 0.785) * 14) - h))
      }
      if (h - ring > 45 && flat < 1.5) mesa = ground(x, z)
    }
  }
  const list: Array<[string, Spot['kind'], THREE.Vector3 | null | undefined]> = []
  const sen = P('sentinel')
  if (sen) list.push(['lore-knee', 'stone', ground(sen.x + 25, sen.z + 205)])
  list.push(['lore-hall', 'stone', ground(HALL.x + 150, HALL.z - 95)])
  list.push(['key-hall', 'trinket', ground(HALL.x - 192, HALL.z - 132)])
  const rib = P('ribcage')
  if (rib) {
    list.push(['lore-fallen', 'stone', ground(rib.x, rib.z)])
    list.push(['horn-ribs', 'trinket', topNear(rib.x, rib.z, 120)])
  }
  const sk = P('skull')
  if (sk) list.push(['tooth-skull', 'trinket', topNear(sk.x, sk.z, 60)])
  const sw = P('sword')
  if (sw) {
    list.push(['lore-sword', 'stone', ground(sw.x + 55, sw.z + 35)])
    // On the crossguard: the highest top in a ring round the blade (the pommel, dead centre, is too small to stand on).
    let guard: THREE.Vector3 | null = null
    for (let r = 10; r <= 40; r += 3) {
      for (let k = 0; k < 24; k++) {
        const x = sw.x + Math.cos((k / 24) * Math.PI * 2) * r
        const z = sw.z + Math.sin((k / 24) * Math.PI * 2) * r
        const y = flatTop(x, z)
        if (y !== null && y > H(x, z) + 20 && (!guard || y > guard.y)) guard = new THREE.Vector3(x, y, z)
      }
    }
    // (It has no level place to stand: then in the sand at the blade's foot, where a flake would fall.)
    list.push(['shard-sword', 'trinket', guard ?? ground(sw.x + 16, sw.z + 10)])
  }
  const gate = P('gate')
  if (gate) {
    const y = rocks.floorAt(gate.x, gate.y + 4, gate.z, 0.6, 12) ?? gate.y
    list.push(['lore-stair', 'stone', new THREE.Vector3(gate.x, y, gate.z)])
    const y2 = rocks.floorAt(gate.x + 6, gate.y + 4, gate.z + 4, 0.6, 12) ?? y
    list.push(['figure-stair', 'trinket', new THREE.Vector3(gate.x + 6, y2, gate.z + 4)])
  }
  let big = { x: 0, z: 0, h: -1 }
  for (let i = 1; i <= 30; i++) {
    const t = P(`tree-${i}`)
    if (!t) break
    const h = rocks.topAt(t.x, t.z) ?? 0
    if (h > big.h) big = { x: t.x, z: t.z, h }
  }
  if (big.h > 0) {
    list.push(['lore-grove', 'stone', ground(big.x + 95, big.z + 40)])
    const gy = H(big.x + 40, big.z)
    list.push(['bell-grove', 'trinket', new THREE.Vector3(big.x + 40, rocks.floorAt(big.x + 40, gy + 40, big.z, 0.6, 45) ?? gy, big.z)])
  }
  const col = P('colonnade')
  if (col) list.push(['lore-colonnade', 'stone', ground(col.x + 0.866 * 60, col.z - 0.5 * 60)])
  if (mesa) {
    list.push(['lore-token', 'stone', mesa])
    list.push(['shard-mesa', 'trinket', ground(mesa.x + 5, mesa.z + 3)])
  }
  const st = P('stone-1')
  if (st) {
    list.push(['lore-chains', 'stone', ground(st.x + 40, st.z + 25)])
    list.push(['pebble-chains', 'trinket', topNear(st.x, st.z, 20)])
  }
  list.push(['lore-herd', 'stone', ground(2550, 3450)])
  list.push(['lore-walker', 'stone', ground(-2300, 400)])
  const arch = formation('arch', 'valley')
  if (arch) {
    list.push(['lore-sleep', 'stone', ground(arch.x, arch.z)])
    list.push(['coin-arch', 'trinket', topNear(arch.x, arch.z, Math.max(arch.hx, arch.hz))])
  }
  const spire = formation('spire', 'desert')
  if (spire) list.push(['feather-spire', 'trinket', topNear(spire.x, spire.z, Math.max(spire.hx, spire.hz) * 0.6)])
  const hood = cairnAt("The Sentinel's Hood")
  if (hood) list.push(['ring-hood', 'trinket', new THREE.Vector3(hood.x + 2, (rocks.topAt(hood.x + 2, hood.z) ?? hood.y), hood.z)])
  const pillar = cairnAt('The Tallest Pillar')
  if (pillar) list.push(['beads-pillar', 'trinket', new THREE.Vector3(pillar.x + 1.5, (rocks.topAt(pillar.x + 1.5, pillar.z) ?? pillar.y), pillar.z)])
  // The bow, on an altar at the Undercroft's far end, with a stone beside it.
  const altarAt = ground(HALL.x + 186, HALL.z)
  const altar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 1.3), carvedStone())
  altar.position.set(altarAt.x, altarAt.y + 0.55, altarAt.z)
  altar.castShadow = altar.receiveShadow = true
  scene.add(altar)
  list.push(['lore-bow', 'stone', ground(HALL.x + 179, HALL.z + 7)])
  const bowModel = new THREE.Group()
  const limb = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.035, 6, 24, Math.PI * 0.9), new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.7 }))
  limb.rotation.set(Math.PI / 2, 0, Math.PI * 0.05)
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.48, 4), new THREE.MeshBasicMaterial({ color: 0xcfc6b2 }))
  string.rotation.z = Math.PI / 2
  string.position.z = 0.1
  bowModel.add(limb, string)

  // The stone eyes, three to a set, each where a ray toward the stone first meets it.
  const meet = (from: THREE.Vector3, to: THREE.Vector3) => {
    const dir = to.clone().sub(from)
    const len = dir.length()
    dir.normalize()
    const p = new THREE.Vector3()
    for (let t = 0; t < len; t += 0.8) {
      p.copy(from).addScaledVector(dir, t)
      if (rocks.sdfAt(p.x, p.y, p.z) < 0.5 || H(p.x, p.z) > p.y) return { at: from.clone().addScaledVector(dir, Math.max(0, t - 0.6)), normal: dir.clone().negate() }
    }
    return null
  }
  const set = (id: string, rays: Array<[THREE.Vector3, THREE.Vector3]>, reward: THREE.Vector3) => {
    const eyes = rays.map(([a, b]) => meet(a, b)).filter((e): e is { at: THREE.Vector3; normal: THREE.Vector3 } => !!e)
    if (eyes.length === 3) {
      eyeSets.push({ id, eyes, reward })
      list.push([id, 'trinket', reward])
    }
  }
  const floor = altarAt.y
  set(
    'eyes-hall',
    // (Not straight down the aisle: that runs between the rows of pillars and meets nothing.)
    [-2.6, 3.0, 2.6].map((a, k) => [new THREE.Vector3(altarAt.x - 6, floor + 30 + k * 5, altarAt.z), new THREE.Vector3(altarAt.x - 6 + Math.cos(a) * 420, floor + 30 + k * 5, altarAt.z + Math.sin(a) * 420)] as [THREE.Vector3, THREE.Vector3]),
    ground(HALL.x + 166, HALL.z - 12),
  )
  if (sen) {
    const gy = H(sen.x, sen.z)
    set(
      'eyes-sentinel',
      [-45, 0, 45].map((lat, k) => [new THREE.Vector3(sen.x + lat, gy + 120 + k * 60, sen.z + 330), new THREE.Vector3(sen.x + lat * 0.3, gy + 120 + k * 60, sen.z)] as [THREE.Vector3, THREE.Vector3]),
      ground(sen.x - 25, sen.z + 212),
    )
  }
  if (mesa) {
    const y = mesa.y - 22
    set(
      'eyes-mesa',
      [0.5, 2.6, 4.4].map((a) => [new THREE.Vector3(mesa!.x + Math.cos(a) * 260, y, mesa!.z + Math.sin(a) * 260), new THREE.Vector3(mesa!.x, y, mesa!.z)] as [THREE.Vector3, THREE.Vector3]),
      ground(mesa.x + Math.cos(0.5) * 120, mesa.z + Math.sin(0.5) * 120),
    )
  }
  const placed: Spot[] = list.filter((e): e is [string, Spot['kind'], THREE.Vector3] => !!e[2]).map(([id, kind, at]) => ({ id, kind, at, hidden: id.startsWith('eyes-') }))
  placed.push({ id: 'bow', kind: 'trinket', at: new THREE.Vector3(altarAt.x, altarAt.y + 1.12, altarAt.z), model: bowModel })
  for (const id of ['wisp-green', 'wisp-wood', 'wisp-dunes']) placed.push({ id, kind: 'trinket', at: wisps.endOf(id)!, hidden: true })
  for (const r of resonance.rings) placed.push({ id: r.def.id, kind: 'trinket', at: r.reward.clone(), hidden: true })
  return new Spots(placed)
})()
// The bow and its eyes.
const eyes = new Eyes(eyeSets)
scene.add(eyes.group)
eyes.onShut = (set, done) => {
  sound.stone(done ? 196 : 262)
  if (!done) return
  sound.resolve([196, 247, 294, 392])
  narration.say('The last eye closes. What it watched over is let go.')
  setTimeout(() => spots.reveal(set.id), 1500)
}
const bow = new Bow()
scene.add(bow.group)
bow.onLoose = () => sound.loose()
const arrowHit: ArrowHit = (a, b) => {
  const e = eyes.hit(a, b)
  if (e) return { at: e, stop: true }
  const h = terrain.heightAt(b.x, b.z)
  if (b.y < h) return { at: b.clone().setY(h), stop: false }
  if (rocks.sdfAt(b.x, b.y, b.z) < 0) return { at: a.clone(), stop: false }
  return null
}
const aimFwd = new THREE.Vector3()
const pick: Pick = (from, dir, max) => {
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  for (let t = 0; t < max; t += 2) {
    a.copy(from).addScaledVector(dir, t)
    b.copy(from).addScaledVector(dir, t + 2)
    if (eyes.test(a, b) || b.y < terrain.heightAt(b.x, b.z) || rocks.sdfAt(b.x, b.y, b.z) < 0) return t + 2
  }
  return max
}
resonance.onStrike = (pitch, wrong) => sound.stone(pitch, wrong)
resonance.onSolve = (id, pitches) => {
  sound.resolve(pitches)
  narration.say('The stones answer each other. The slab sinks slowly into the earth.')
  setTimeout(() => spots.reveal(id), 6000)
}
wisps.onSettle = (id) => {
  spots.reveal(id)
  sound.chime()
  narration.say('The light sinks into the ground. Something is left where it went in.')
}
scene.add(spots.group)
scene.add(cairns.group)
const promptEl = document.getElementById('prompt')!
let promptHtml = ''
const CAIRN_LINES = ['The land below opens to you.', 'From here you can see a long way.', 'The flame catches. The wind takes the smoke.', 'Someone stood here once, and looked out as you do.']
/** Keep a clearing round each cairn (they are placed further down; plants grow later, lazily). */
const nearCairn = (x: number, z: number) => cairnPlaces.some((c) => Math.abs(c.x - x) < 9 && Math.abs(c.z - z) < 9)
const vegetation = new Vegetation(terrain, biome, lakes, paint, pave, (x, z) => rocks.occupies(x, z) || inHall(x, z, 6) || nearCairn(x, z), rockMaterial(terrainTex))
scene.add(vegetation.group)
// Dense grass round you, rolling in the wind.
const grass = new Grass(terrain, biome, lakes, (x, z) => rocks.occupies(x, z) || nearCairn(x, z))
scene.add(grass.mesh)
quality.vegetation = vegetation
quality.refresh()
terrainView.fresh = (x, z) => vegetation.isFresh(x, z)
vegetation.onRegrow = (x0, z0, x1, z1) => terrainView.markDirty(x0, z0, x1, z1)

const input = new Input(canvas)
const rig = new CameraRig(camera)
// The camera stays out of rock (formations, colossi, the Undercroft).
rig.occluder = (x, y, z) => rocks.sdfAt(x, y, z)
rig.setProfile(WANDERER_CAM)
sky.setShadowRadius(260)
const hud = new Hud()
const narration = new Narration()

// Discovery: places, the ones who live here, words on stone, relics, trinkets.
const finds = new Discoveries()
const journal = new Journal(finds)
journal.onToggle = () => input.releaseAll()
// The bag: found at a camp just ahead of where you wake; everything small goes in it.
const bag = new Bag(finds)
bag.onToggle = (open) => {
  input.releaseAll()
  if (open) tipState.looked = true
}
bag.onNoBag = () => narration.say('You have nothing to carry things in. Not yet.')
const camp = new Camp(terrain)
scene.add(camp.group)
finds.onFind = (f) => {
  journal.announce(f)
  sound.chime()
  setTimeout(() => narration.say(f.text), 1600)
  saveDirty = true
}
const near = (x: number, z: number) => () => ({ x, z })
const placeAt = (name: string) => () => colossi.places.get(name) ?? null
const sites: Site[] = [
  { id: 'green', r: 500, at: near(0, 0) },
  { id: 'sentinel', r: 520, at: placeAt('sentinel') },
  { id: 'undercroft', r: 280, at: near(HALL.x, HALL.z) },
  { id: 'grove', r: 950, at: near(-0.866 * 4300, -0.5 * 4300) },
  { id: 'fallen', r: 650, at: placeAt('ribcage') },
  { id: 'sword', r: 420, at: placeAt('sword') },
  { id: 'colonnade', r: 600, at: placeAt('colonnade') },
  { id: 'stair', r: 520, at: placeAt('stair') },
  { id: 'chained', r: 700, at: () => {
    const p = wanderer.pos
    let best: { x: number; z: number } | null = null
    for (let i = 1; i <= 4; i++) {
      const s = colossi.places.get(`stone-${i}`)
      if (s && (!best || Math.hypot(s.x - p.x, s.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z))) best = s
    }
    return best
  } },
  { id: 'walker', r: 750, at: () => titans.get('t1')?.titan.gait ?? null },
  { id: 'wanderer2', r: 750, at: () => titans.get('t2')?.titan.gait ?? null },
  { id: 'herd', r: 950, at: () => {
    const c = herd.centre()
    return { x: c.x, z: c.y }
  } },
  { id: 'striders', r: 900, at: () => {
    const p = wanderer.pos
    let best: { x: number; z: number } | null = null
    for (const s of striders.striders) if (!best || Math.hypot(s.x - p.x, s.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z)) best = s
    return best
  } },
]
let visitClock = 0

const wanderer = new Wanderer(0xa8291f)
wanderer.place(0, terrain.heightAt(0, 0), 0)
scene.add(wanderer.obj, wanderer.world)

/** The waking giants, by slot id ('t1', 't2'). Slot 1 stands a short walk from spawn (tools rely on it). */
interface AwakeTitan {
  titan: Titan
  /** Since when it has rested (0 = not): long enough, it sleeps and becomes a mountain. */
  aloneSince: number
  brain: TitanBrain
}
const titans = new Map<string, AwakeTitan>()
function addTitan(id: string, x: number, z: number, heading: number): AwakeTitan {
  const slot = Number(id.slice(1)) || 1
  const titan = new Titan(TITAN_HEIGHT, x, z, heading, 7 + (slot - 1) * 13)
  scene.add(titan.group)
  const a = { titan, brain: new TitanBrain(20261030 + slot * 7919), aloneSince: 0 }
  titans.set(id, a)
  return a
}
for (let i = 0; i < 2; i++) addTitan(`t${i + 1}`, TITAN_SPAWNS[i].x, TITAN_SPAWNS[i].z, TITAN_SPAWNS[i].heading)
/** Slot 1: the giant near spawn. Tools address it as `g.titan`. */
const first = () => titans.get('t1')!.titan
const mountains = new Mountains()
scene.add(mountains.group)
/**
 * Beyond the mountains, far bigger than any giant you can reach: colossi
 * kilometres tall, standing in the haze, facing the valley. Never reached;
 * always there.
 */
const farGiants: Titan[] = []
// Beyond the Wall (the outer range, 1.5–3 km high): they stand two or three
// times its height, chest and head clear above its crest.
for (const a of [0.45, 2.55, 4.4]) {
  const r = 24500
  const t = new Titan(8000, Math.cos(a) * r, Math.sin(a) * r, Math.atan2(-Math.cos(a), -Math.sin(a)), 50 + Math.round(a * 10), 1)
  t.restBlend = 0
  t.silhouette(0.12)
  scene.add(t.group)
  farGiants.push(t)
}
// Awakenings: rarely, a colossus beyond the mountains moves, and the camera turns to watch it.
const awakening = new Awakening(farGiants, sky.sunDir)
awakening.on = (what) => {
  if (what === 'begin') {
    input.releaseAll()
    sound.hush(true)
    setTimeout(() => sound.farHorn(), 1800)
  } else if (what === 'step') {
    // The sound of it, long after (it is kilometres away).
    setTimeout(() => {
      sound.colossal()
      rig.shake(0.35)
    }, 6500)
  } else {
    sound.hush(false)
    narration.say(AWAKE_LINES[Math.floor(Math.random() * AWAKE_LINES.length)])
    setTimeout(() => finds.find('beyond'), 5000)
  }
}
const AWAKE_LINES = ['Something very far away moved.', 'It turned toward you. You are almost sure of it.', 'The ground remembers it for a long time after.']
/** A herd of smaller giants roaming the eastern Dune Sea together. */
const herd = new Herd(terrain, WORLD_SEED)
for (const t of herd.giants) scene.add(t.group)
const climber = new Climber(() => [
  ...[...titans].map(([id, a]) => ({ id, titan: a.titan })),
  ...herd.giants.map((titan, i) => ({ id: `h${i + 1}`, titan })),
  ...mountains.targets(),
])
/** Climbing the land itself: cliffs, canyon walls, the escarpment. */
const cliff = new CliffClimb()

// ---------------------------------------------------------------------------
// Terrain events: the giants' footfalls, drags, and the hills that rise under
// a giant gone to sleep.

// Everything one stride did to the ground, so lakes re-flood once per footfall.
const strideBox: Box = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity }
function grow(b: Box): void {
  strideBox.x0 = Math.min(strideBox.x0, b.x0)
  strideBox.z0 = Math.min(strideBox.z0, b.z0)
  strideBox.x1 = Math.max(strideBox.x1, b.x1)
  strideBox.z1 = Math.max(strideBox.z1, b.z1)
  terrainView.markDirty(b.x0, b.z0, b.x1, b.z1)
  // A giant's foot flattens whatever grew there; it greens over again later.
  // (Replays and the First Ones' trails are old ground already.)
  if (!replaying) vegetation.trample(b.x0, b.z0, b.x1, b.z1)
  else vegetation.markDirty(b.x0, b.z0, b.x1, b.z1)
  grass.markDirty(b.x0, b.z0, b.x1, b.z1)
}
/** True while applying events that are not happening now (loading, ancient trails). */
let replaying = false
/** True while laying down the First Ones' trails (their footfalls are not "steps" anyone saw). */
let ancient = false

/** Every footfall so far (tools read it to measure prints and canals). */
const falls: Array<{ foot: 0 | 1; x: number; z: number; stomp: boolean }> = []

/** Apply one terrain event. `replay` = catching up on load: no dust, no shake. */
function onGait(ev: GaitEvent | MountainRise, replay = false): void {
  replaying = replay
  const H = TITAN_HEIGHT
  if (ev.type === 'mountain') {
    // A giant fell asleep: the hill rising under it.
    const box = applyMountain(terrain.delta, mountainFor(H, ev.x, ev.z))
    terrainView.markDirty(box.x0, box.z0, box.x1, box.z1)
    lakes.onDeform(box)
    if (!replay) rig.shake(Math.max(0, 1 - Math.hypot(camera.position.x - ev.x, camera.position.z - ev.z) / (8 * H)) * 0.01 * H)
    return
  }
  if (ev.type === 'drag') {
    grow(applyDrag(terrain.delta, dragFor(H, ev.ax, ev.az, ev.bx, ev.bz)))
    if (!replay) effects.drag(ev.bx, terrain.heightAt(ev.bx, ev.bz), ev.bz, H)
    return
  }
  if (!ancient) falls.push({ foot: ev.foot, x: ev.x, z: ev.z, stomp: !!ev.stomp })
  grow(applyImpact(terrain.delta, impactFor(H, ev.x, ev.z, ev.stomp)))
  grow(applyFootprint(terrain.delta, footprintFor(H, ev.x, ev.z, ev.hx ?? Math.sin(ev.heading), ev.hz ?? Math.cos(ev.heading), ev.stomp)))
  lakes.onDeform(strideBox, ev.x, ev.z)
  strideBox.x0 = strideBox.z0 = Infinity
  strideBox.x1 = strideBox.z1 = -Infinity
  if (replay) return
  sound.footfall(Math.hypot(camera.position.x - ev.x, camera.position.y - terrain.heightAt(ev.x, ev.z), camera.position.z - ev.z), !!ev.stomp)
  // Herds within earshot bolt.
  wildlife.alarm(ev.x, ev.z, ev.stomp ? 650 : 280)
  // Every footfall jolts whoever is hanging on; a stomp nearly shakes them off.
  if (climber.active) climber.stamina = Math.max(0, climber.stamina - (ev.stomp ? 0.35 : 0.03))
  const gy = terrain.heightAt(ev.x, ev.z)
  if (ev.stomp) {
    effects.shockwave(ev.x, gy, ev.z, H)
    // The shockwave throws a wanderer on the ground off their feet.
    const dx = wanderer.pos.x - ev.x
    const dz = wanderer.pos.z - ev.z
    const dw = Math.hypot(dx, dz)
    if (!climber.active && dw < 0.6 * H) {
      const k = 1 - dw / (0.6 * H)
      wanderer.knock(new THREE.Vector3((dx / (dw || 1)) * 14 * k, 5 + 5 * k, (dz / (dw || 1)) * 14 * k), 0.8 + 1.2 * k)
    }
  } else {
    effects.impact(ev.x, gy, ev.z, H)
  }
  // The ground shakes near the footfall.
  const d = Math.hypot(camera.position.x - ev.x, camera.position.z - ev.z)
  rig.shake(Math.max(0, 1 - d / (6 * H)) * 0.012 * H * (ev.stomp ? 2.5 : 1))
}

const settings = loadSettings()
/** The giants wander by themselves (tools' fresh worlds keep them still unless ?wild). */
let wild = !toolMode || params.has('wild')
/** The adventure keeps itself in this browser (not in tool mode). */
let localSave = !toolMode
const sound = new Sound(settings.sound)
const tips = new Tips(!toolMode)
const tipState = { moved: 0, climbed: false, high: 0, bag: false, looked: false }
let lastTip = 0

// ---------------------------------------------------------------------------
// The save. Every terrain event is recorded; the world, the giants, the
// sleeping giants and where you stood are saved every few seconds and when
// the page goes away; loading replays it all.

const localEvents: SavedEvent[] = []
let lastSave = 0
let saveDirty = false

function record(ev: GaitEvent | MountainRise): void {
  if (!localSave) return
  const p = packEvent(ev as unknown as { type: string } & Record<string, unknown>)
  if (p) {
    localEvents.push(p)
    saveDirty = true
  }
}

function saveLocal(): void {
  if (!localSave) return
  const data: SaveData = {
    v: 1,
    savedAt: Date.now(),
    events: localEvents,
    titans: Object.fromEntries([...titans].map(([id, a]) => [id, { pose: { ...a.titan.gait.snapshot({} as Snap) }, aloneSince: a.aloneSince }])),
    mountains: mountains.infos(),
    player: { x: wanderer.pos.x, y: wanderer.pos.y, z: wanderer.pos.z },
    lakes: lakes.save(),
    seen: worldMap.save(),
    cairns: cairns.save(),
    found: finds.save(),
  }
  if (!saveWorld(data)) narration.say('Could not save (browser storage is full or blocked).')
  saveDirty = false
}

/** Back where you left off. False if there was nothing to load. */
function loadLocal(): boolean {
  const d = loadWorld()
  if (!d) return false
  for (const e of d.events) {
    localEvents.push(e)
    onGait(unpackEvent(e), true)
  }
  for (const [id, m] of Object.entries(d.mountains)) mountains.add(id, m)
  for (const [id, t] of Object.entries(d.titans)) {
    const a = titans.get(id) ?? addTitan(id, t.pose.x, t.pose.z, t.pose.heading)
    a.titan.gait.restore(t.pose)
    a.titan.restBlend = t.pose.resting ? 1 : 0
    a.aloneSince = t.aloneSince ?? 0
  }
  wanderer.place(d.player.x, terrain.heightAt(d.player.x, d.player.z), d.player.z)
  // Time has passed: the rain has fallen. The lakes come back as they were,
  // brim-full (and settle whatever was still merging when you left).
  if (d.seen) worldMap.load(d.seen)
  if (d.cairns) cairns.load(d.cairns)
  if (d.found) finds.load(d.found)
  if (finds.has('bag')) {
    camp.take()
    tipState.bag = true
  }
  for (const s of spots.spots) if (s.kind === 'trinket' && finds.has(s.id)) spots.take(s.id)
  for (const id of ['wisp-green', 'wisp-wood', 'wisp-dunes']) if (finds.has(id)) wisps.finish(id)
  for (const r of resonance.rings) if (finds.has(r.def.id)) resonance.open(r.def.id)
  for (const s of eyeSets) if (finds.has(s.id)) eyes.close(s.id)
  for (const [gid, relic] of Object.entries(RELIC_OF)) {
    const t = giantFor(gid)
    if (t && finds.has(relic)) darkenGlyph(t)
  }
  if (d.lakes) lakes.restore(d.lakes)
  lakes.fillAll()
  // A giant resting long enough while you were away fell asleep.
  for (const [id, a] of titans) if (a.titan.gait.resting && a.aloneSince && Date.now() - a.aloneSince > DORMANT_AFTER_MS) goDormant(id)
  return true
}

/** A new adventure: the First Ones' old trails, their lakes and rivers grown over. */
function newWorld(): void {
  ancient = true
  for (const trail of trails) {
    for (const ev of trail.events) {
      const packed = packEvent(ev as unknown as { type: string } & Record<string, unknown>)
      const exact = packed ? (unpackEvent(packed) as GaitEvent) : ev
      onGait(exact, true)
      record(exact)
    }
  }
  ancient = false
  lakes.fillAll()
}

addEventListener('pagehide', () => saveLocal())
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveLocal()
})

// The debug readout is out of the way unless asked for: ` toggles it (or ?debug).
if (params.has('debug')) document.body.classList.add('debug')
addEventListener('keydown', (e) => {
  if (e.code === 'Backquote') document.body.classList.toggle('debug')
})

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight, false)
  post.resize()
})

// ---------------------------------------------------------------------------
// Loop: fixed 60 Hz simulation, render every frame, paused while hidden.

let acc = 0
let last = performance.now()
let ready = false
/** Simulation speed multiplier — tools fast-forward the giants with it. */
const clock = { scale: 1 }
/** Tools can walk giant 1 by hand. */
const autopilot = { forward: 0, turn: 0 }
const gaitEvents: GaitEvent[] = []
const threats: Threat[] = []
const chest = new THREE.Vector3()
const still: GaitInput = { forward: 0, turn: 0 }

// Falls. Nothing hurts you — but a fall too long to walk away from fades to
// black, and you wake where you last stood on safe ground. (So a climb is
// worth something: let go at a giant's shoulder and it is lost.)
const FATAL_FALL = 24
/** Where you last stood on safe ground. */
const lastSafe = new THREE.Vector3(0, 0, 0)
let safeFor = 0
/** The highest point of the current fall (NaN on the ground). */
let fallTop = NaN
/** Seconds left blacked out after a fall (the world goes on). */
let blackout = 0
const fadeEl = document.getElementById('fade')!

function watchFalls(dt: number): void {
  if (blackout > 0) {
    blackout -= dt
    if (blackout <= 0) fadeEl.classList.remove('on')
    return
  }
  if (climber.active || cliff.active) {
    fallTop = NaN
    return
  }
  const p = wanderer.pos
  if (!wanderer.grounded) {
    fallTop = Number.isNaN(fallTop) ? p.y : Math.max(fallTop, p.y)
    return
  }
  // Landed.
  if (!Number.isNaN(fallTop) && fallTop - p.y > FATAL_FALL) {
    fallTop = NaN
    blackout = 1.8
    fadeEl.classList.add('on')
    narration.say(FALL_LINES[Math.floor(Math.random() * FALL_LINES.length)])
    // Wake at the last safe ground once it is dark.
    setTimeout(() => {
      wanderer.place(lastSafe.x, terrain.heightAt(lastSafe.x, lastSafe.z), lastSafe.z)
      onRock()
    }, 420)
    return
  }
  fallTop = NaN
  // Safe ground: standing (not sliding), gentle, not on a giant, a moment at least.
  safeFor += dt
  if (!wanderer.sliding && safeFor > 1.5) {
    const h = terrain.heightAt(p.x, p.z)
    const flat = Math.abs(terrain.heightAt(p.x + 1, p.z) - h) + Math.abs(terrain.heightAt(p.x, p.z + 1) - h) < 0.9
    if (flat && Math.abs(p.y - h) < 0.4) {
      lastSafe.copy(p)
      safeFor = 0
    }
  }
}
const FALL_LINES = ['You fell a long way.', 'The ground came up hard.', 'Darkness, and then the grass again.', 'You wake where you last stood.']

function simulate(dt: number): void {
  watchFalls(dt)
  if (awakening.active) {
    // Held: you watch. (Gravity and the world go on.)
    wanderer.step(dt, { x: 0, y: 0 }, false, false, rig.yaw, terrain)
    return
  }
  if (climber.active) {
    raid()
    if (input.pressed('KeyE')) letGo(0.6)
    else if (input.pressed('Space')) letGo(4.5)
    else if (!climber.step(dt, input.axes(), rig.yaw, heldAwake() ? heldAwake()!.gait.speed / heldAwake()!.gait.maxSpeed : 0, !!heldAwake()?.shrugging)) {
      narration.say('You lost your grip.')
      letGo(1.2)
    } else {
      // The body rides along, for the camera and the moment we let go.
      wanderer.place(climber.world.x, climber.world.y, climber.world.z)
    }
  } else if (cliff.active) {
    if (input.pressed('KeyE')) letGoCliff(0.5)
    else if (input.pressed('Space')) letGoCliff(3.5)
    else {
      const r = cliff.step(dt, input.axes(), rig.yaw, terrain)
      if (r === 'fell') {
        narration.say('Your grip gave out.')
        letGoCliff(1)
      } else {
        wanderer.place(cliff.world.x, cliff.world.y, cliff.world.z)
        // Up on top of a solid: stand on it.
        if (r === 'top') onRock()
      }
    }
  } else {
    const cairn = cairns.near(wanderer.pos)
    const spot = spots.near(wanderer.pos, (id) => finds.has(id))
    if (camp.near(wanderer.pos) && input.pressed('KeyE')) {
      camp.take()
      finds.find('bag')
      tipState.bag = true
    } else if (resonance.near(wanderer.pos) && input.pressed('KeyE')) {
      const r = resonance.near(wanderer.pos)!
      resonance.strike(r.ring, r.stone)
    } else if (spot && input.pressed('KeyE')) {
      if (spot.kind === 'stone') {
        // Read it (again, if you like).
        if (!finds.find(spot.id)) narration.say(CATALOGUE.find((c) => c.id === spot.id)?.text ?? '')
      } else if (!bag.have) narration.say('You have nothing to carry it in. Not yet.')
      else {
        finds.find(spot.id)
        spots.take(spot.id)
      }
    } else if (cairn && input.pressed('KeyE')) {
      // Light the cairn: the beam rises, the land round it is uncovered.
      cairns.light(cairn)
      worldMap.revealAround(cairn.x, cairn.z, 1400)
      sound.chime()
      narration.say(`${cairn.name}. ${CAIRN_LINES[cairns.litCount % CAIRN_LINES.length]}`)
      // The first time you look out from a high place, something answers.
      if (cairns.litCount === 1) setTimeout(() => awakening.begin(camera), 6000)
      // From up here, on a clear enough day, the edge of the world.
      setTimeout(() => finds.find('wall'), 2500)
      saveDirty = true
    } else if (input.pressed('KeyE')) {
      chest.set(wanderer.pos.x, wanderer.pos.y + 0.9, wanderer.pos.z)
      climber.tryGrab(chest)
      // No giant within reach: a rock formation or colossus; else the land, if there is a wall to hand.
      if (!climber.active) {
        const solid = rocks.solidAhead(chest, wanderer.yaw)
        if (solid) cliff.startOn(solid.solid, solid.at)
        else {
          const wall = cliff.wallAhead(wanderer.pos, wanderer.yaw, terrain)
          if (wall) cliff.start(wall.x, wall.z, terrain)
        }
      }
    }
    if (!climber.active && !cliff.active) {
      wanderer.step(dt, input.axes(), input.held('ShiftLeft') || input.held('ShiftRight'), input.held('Space'), rig.yaw, terrain)
      climber.pushOut(wanderer.pos)
      onRock()
      if (wanderer.grounded) cliff.rest(dt)
    }
  }

  if (wild) herd.step(dt)
  for (const [id, a] of titans) {
    const t = a.titan
    const driven = id === 't1' && autopilot.forward !== 0
    let inp: GaitInput = driven ? autopilot : still
    if (wild && !driven && !t.gait.resting) {
      const o = a.brain.think(dt, t.gait, {
        heightAt: (x, z) => terrain.heightAt(x, z),
        avoid: [
          ...colossusAvoid,
          ...mountains.targets().map((m) => ({ x: m.titan.gait.x, z: m.titan.gait.z, r: TITAN_HEIGHT * 2 })),
          ...[...titans.values()].filter((b) => b !== a).map((b) => ({ x: b.titan.gait.x, z: b.titan.gait.z, r: TITAN_HEIGHT * 2.5 })),
        ],
      })
      inp = o
      t.gait.plough = o.plough
      if (o.stomp) t.gait.stompArmed = true
      if (o.call) sound.call(Math.hypot(camera.position.x - t.gait.x, camera.position.z - t.gait.z))
    }
    gaitEvents.length = 0
    t.step(dt, inp, gaitEvents)
    for (const ev of gaitEvents) {
      // Apply exactly what is saved (positions rounded to the millimetre), so
      // a reloaded world is the same to the last digit.
      const packed = packEvent(ev as unknown as { type: string } & Record<string, unknown>)
      const exact = packed ? (unpackEvent(packed) as GaitEvent) : ev
      onGait(exact)
      record(exact)
    }
    // Resting long enough, a giant falls asleep.
    if (t.gait.resting && !toolMode) {
      if (!a.aloneSince) a.aloneSince = Date.now()
      else if (Date.now() - a.aloneSince > DORMANT_AFTER_MS) goDormant(id)
    } else {
      a.aloneSince = 0
    }
  }
  // A refill that ran out of loading time carries on a little each frame.
  if (lakes.settling) lakes.settle(4)
  else lakes.step(dt)
  // Big things to keep clear of: every waking giant (more so when it walks),
  // and a wanderer running right at them.
  threats.length = 0
  for (const a of titans.values()) {
    const g = a.titan.gait
    threats.push({ x: g.x, z: g.z, r: g.speed > 0.5 ? 0.9 * TITAN_HEIGHT : 0.45 * TITAN_HEIGHT })
  }
  if (!climber.active && wanderer.speed > 6) threats.push({ x: wanderer.pos.x, z: wanderer.pos.z, r: 14 })
  wildlife.step(dt, threats)
  if (!climber.active && !cliff.active) tipState.moved += wanderer.speed * dt
  else if (climber.active) {
    tipState.climbed = true
    tipState.high = Math.max(tipState.high, climber.world.y - terrain.heightAt(climber.world.x, climber.world.z))
  }
}

/** The waking giant the climber holds, if any (sleeping giants do not walk or shrug). */
/**
 * Raiding: each walking giant carries a relic in the glowing shrine on its
 * back. Climb to it and it is yours — and the giant feels it: it shrugs hard
 * and does its best to shake you off. The glyph goes dark.
 */
const RELIC_OF: Record<string, string> = { t1: 'relic-walker', t2: 'relic-grey', h1: 'relic-herd-1', h2: 'relic-herd-2', h3: 'relic-herd-3', h4: 'relic-herd-4', h5: 'relic-herd-5' }
const DISPLEASED = ['It felt that.', 'The whole body shudders under you. It knows.', 'A sound comes up through the stone, low and long. It is not pleased.']
const glyphAt = new THREE.Vector3()
const darkGlyph = new THREE.MeshBasicMaterial({ color: 0x2a2c30 })
let noBagWarned = false
function giantFor(id: string): Titan | undefined {
  return id.startsWith('h') ? herd.giants[Number(id.slice(1)) - 1] : titans.get(id)?.titan
}
function darkenGlyph(t: Titan): void {
  for (const name of ['glyph', 'glyph-inner']) {
    const m = t.group.getObjectByName(name) as THREE.Mesh | undefined
    if (m) m.material = darkGlyph
  }
}
function raid(): void {
  const id = climber.target?.id
  const relic = id && RELIC_OF[id]
  if (!relic || finds.has(relic)) return
  const t = giantFor(id)
  const glyph = t?.group.getObjectByName('glyph')
  if (!t || !glyph) return
  glyph.getWorldPosition(glyphAt)
  if (climber.world.distanceTo(glyphAt) > t.H * 0.07) return
  if (!bag.have) {
    if (!noBagWarned) narration.say('Something glows here, set into the stone. You have nothing to carry it in.')
    noBagWarned = true
    return
  }
  finds.find(relic)
  darkenGlyph(t)
  t.shrug(3.5)
  sound.call(0)
  setTimeout(() => narration.say(DISPLEASED[Math.floor(Math.random() * DISPLEASED.length)]), 2400)
}

function heldAwake(): Titan | undefined {
  const id = climber.target?.id
  return id ? giantFor(id) : undefined
}

/** Let go of the giant: fall with its motion plus a push off the rock. */
function letGo(push: number): void {
  const v = climber.release(push)
  const w = climber.world
  wanderer.place(w.x + climber.normal.x * 0.6, w.y + climber.normal.y * 0.6, w.z + climber.normal.z * 0.6)
  wanderer.vel.copy(v)
  wanderer.grounded = false
}

const body = new THREE.Vector3()
/** Rock formations: walls push the wanderer out; ledges, arch tops and cave floors hold them up. */
function onRock(): void {
  const p = wanderer.pos
  body.set(p.x, p.y + 0.9, p.z)
  if (rocks.pushOut(body)) p.set(body.x, body.y - 0.9, body.z)
  if (wanderer.vel.y > 0.5) return // leaving the ground in a jump
  const floor = rocks.floorAt(p.x, p.y, p.z)
  if (floor !== null && floor > terrain.heightAt(p.x, p.z) - 0.05) {
    p.y = floor
    wanderer.vel.y = 0
    wanderer.grounded = true
  }
}

/** Let go of the rock: pushed off it, falling. */
function letGoCliff(push: number): void {
  cliff.active = false
  cliff.solid = null
  const n = cliff.normal
  wanderer.place(cliff.world.x + n.x * 0.6, cliff.world.y + n.y * 0.6, cliff.world.z + n.z * 0.6)
  wanderer.vel.set(n.x * push, Math.max(0, n.y) * push, n.z * push)
  wanderer.grounded = false
}

/**
 * The waking giant just became the sleeping giant `id`. Anyone holding on
 * stays on the same rock — now a mountain — instead of being carried off by
 * the new giant that wakes elsewhere.
 */
function holdOnAsItSleeps(id: string): void {
  const m = mountains.get(id)
  if (!m || !climber.active || !heldAwake()) return
  if (Math.hypot(m.gait.x - climber.world.x, m.gait.z - climber.world.z) < TITAN_HEIGHT) climber.retarget({ id, titan: m })
}

/** The giant sleeps here and becomes a mountain; a new one wakes in its slot. */
function goDormant(id = 't1'): void {
  const t = titans.get(id)?.titan
  if (!t) return
  const mid = `local-${mountains.count + 1}`
  mountains.add(mid, { name: 'A sleeping giant', since: Date.now(), pose: { ...t.gait.snapshot({} as Snap), resting: true } })
  titans.get(id)!.aloneSince = 0
  holdOnAsItSleeps(mid)
  const rise = { type: 'mountain' as const, x: t.gait.x, z: t.gait.z }
  onGait(rise)
  record(rise)
  const a = mountains.count * 2.4 + 0.7
  t.awaken(Math.cos(a) * 650, Math.sin(a) * 650, a + Math.PI)
  t.restBlend = 0
}

/**
 * Walking giants crumble: stones shaken loose from the body fall, faster the
 * faster it goes (a slow trickle even standing).
 */
const shedClock = new Map<Titan, number>()
function shedRubble(dt: number): void {
  for (const t of [...[...titans.values()].map((a) => a.titan), ...herd.giants]) {
    if (t.gait.resting) continue
    const pace = t.gait.speed / t.gait.maxSpeed
    let c = (shedClock.get(t) ?? 0) + dt * (0.15 + 1.6 * pace)
    while (c >= 1) {
      c -= 1
      const k = Math.random()
      const a = Math.random() * Math.PI * 2
      const r = t.H * (0.05 + Math.random() * 0.1)
      const fx = Math.sin(t.gait.heading) * t.gait.speed
      const fz = Math.cos(t.gait.heading) * t.gait.speed
      effects.shed(t.gait.x + Math.cos(a) * r, t.pelvis.y + (t.chest.y - t.pelvis.y) * (0.2 + k), t.gait.z + Math.sin(a) * r, fx, fz, t.H)
    }
    shedClock.set(t, c)
  }
}

function frame(now: number): void {
  requestAnimationFrame(frame)
  if (document.hidden) {
    last = now
    return
  }
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  acc += dt * clock.scale
  while (acc >= STEP) {
    simulate(STEP)
    acc -= STEP
  }

  // Render between the last two simulation states: on a 120 Hz display the
  // 60 Hz simulation would otherwise move the wanderer every other frame.
  for (const a of titans.values()) {
    a.titan.pose(terrain, dt)
    a.titan.group.updateMatrixWorld(true)
    a.titan.setLodFor(camera.position)
  }
  mountains.update(terrain, camera)
  shedRubble(dt)
  for (const t of [...farGiants, ...herd.giants]) {
    t.pose(terrain, dt)
    t.group.updateMatrixWorld(true)
    t.setLodFor(camera.position)
  }
  leviathans.update(dt)
  striders.update(dt)
  watchers.update(dt, wanderer.pos, weather.now.dark, camera)
  if (climber.active) {
    // Glued to the hold through the giant's pose of THIS frame.
    climber.sync(dt)
    wanderer.climbPose(dt, climber.world, climber.normal, climber.standing, rig.yaw + Math.PI, climber.moving)
  } else if (cliff.active) {
    wanderer.climbPose(dt, cliff.world, cliff.normal, false, rig.yaw + Math.PI, cliff.moving ? 1 : 0)
  } else {
    wanderer.sync(acc / STEP)
  }
  // Limbs, cape and scarf; the weather's wind blows from the west-south-west.
  clothWind.set(1, 0, 0.4).normalize().multiplyScalar(0.8 + weather.now.wind * weather.now.wind * 7)
  wanderer.animate(dt, groundAt, clothWind, Math.max(weather.now.dark, inHall(wanderer.pos.x, wanderer.pos.z) && wanderer.pos.y < terrain.base.hallTop - 10 ? 1 : 0))
  water.sync(lakes.lakes)
  water.syncStreams(dt, lakes, (x, z) => terrain.heightAt(x, z))
  water.update(dt)
  effects.update(dt)
  clouds.update(dt, camera.position)
  birdSpots.length = 0
  for (const l of lakes.lakes) if (l.basin.sorted.length > 400 && l.level > l.basin.bottom + 0.5) birdSpots.push({ x: l.basin.bx, z: l.basin.bz })
  for (const [, c] of colossi.places) birdSpots.push({ x: c.x, z: c.z })
  birds.step(dt, camera.position, birdSpots)
  birds.render()
  sky.tick(dt)
  weather.part = awakening.reveal
  weather.update(dt, camera)
  undercroft.update(sky.sun.intensity / 3)
  mapGiants.length = 0
  for (const a of titans.values()) mapGiants.push({ x: a.titan.gait.x, z: a.titan.gait.z })
  worldMap.update(dt, wanderer.pos, wanderer.yaw, mapGiants, lakes.lakes)
  clouds.tint(weather.now.dark)
  mist.update(sky.fog.color, sky.sunDir, weather.now.dark)
  sound.mood(weather.now.dark, weather.now.rain, weather.now.wind, awe())
  vegetation.update(dt, camera.position)
  grass.update(dt, camera.position, wanderer.pos, weather.now.wind)
  rocks.update(camera.position)
  cairns.update(dt)
  camp.update(dt, weather.now.wind)
  spots.update(dt, camera)
  wisps.update(dt, wanderer.pos)
  {
    const has = finds.has('bow')
    const drawing = has && !climber.active && !cliff.active && !awakening.active && !journal.open && !bag.open && (input.held('Mouse2') || input.held('KeyQ'))
    const loose = has && (input.clicked() || input.pressed('KeyF'))
    camera.getWorldDirection(aimFwd)
    bow.update(dt, drawing, loose, wanderer.pos.clone().add(new THREE.Vector3(0, 1.45, 0)).addScaledVector(aimFwd, 0.5), camera, arrowHit, pick)
  }
  resonance.update(dt)
  visitClock -= dt
  if (visitClock <= 0 && ready) {
    visitClock = 0.5
    visit(sites, finds, wanderer.pos.x, wanderer.pos.z)
  }
  // What E would do here.
  const free = !climber.active && !cliff.active
  const spotNear = free ? spots.near(wanderer.pos, (id) => finds.has(id)) : null
  const html =
    free && camp.near(wanderer.pos)
      ? `<kbd>E</kbd>Take the bag`
      : free && resonance.near(wanderer.pos)
        ? `<kbd>E</kbd>Strike the stone`
        : spotNear
          ? `<kbd>E</kbd>${spotNear.kind === 'stone' ? 'Read the stone' : 'Pick it up'}`
        : free && cairns.near(wanderer.pos)
          ? `<kbd>E</kbd>Light the cairn`
          : ''
  if (html !== promptHtml) {
    promptHtml = html
    promptEl.innerHTML = html
    promptEl.style.display = html ? 'block' : 'none'
  }
  crownWind.value += dt
  rocks.animate(crownWind.value)
  wildlife.render()
  hud.setMode(climber.active || cliff.active ? 'climbing' : 'wanderer')
  hud.setGrip(climber.active ? climber.stamina : cliff.active ? cliff.stamina : null)

  const look = input.consumeLook()
  const focus = wanderer.obj.position
  if (freeCam) {
    camera.position.copy(freeCam.from)
    camera.lookAt(freeCam.at)
  } else {
    rig.update(dt, awakening.active ? 0 : look.dx, awakening.active ? 0 : look.dy, awakening.active ? 0 : look.wheel, focus, terrain)
    // Drawing the bow: the camera comes in over the right shoulder, the view narrows, you face where you aim.
    if (bow.draw > 0 && !awakening.active) {
      camera.getWorldDirection(aimFwd).setY(0).normalize()
      // (Low and close, a little to the right: your hood and shoulder in the corner of the view.)
      const shoulder = wanderer.pos.clone().add(new THREE.Vector3(-aimFwd.z * 0.72, 1.5, aimFwd.x * 0.72)).addScaledVector(aimFwd, -1.55)
      camera.position.lerp(shoulder, bow.draw * 0.9)
      wanderer.yaw = Math.atan2(aimFwd.x, aimFwd.z)
    }
    // The long run widens the view a little: speed you feel at the edges.
    if (!awakening.active) {
      const fov = 58 + 7 * wanderer.lope - 14 * bow.draw
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
    }
    // An awakening takes the camera's gaze (the rig still keeps its place).
    awakening.update(dt, camera)
  }
  // The camera pressed right up to you (a wall behind): see past yourself, not into your hood.
  const tooClose = camera.position.distanceTo(_head.copy(wanderer.obj.position).setY(wanderer.obj.position.y + 1.2)) < 1.6
  foliageFocus.value.copy(_head)
  wanderer.obj.visible = !tooClose
  wanderer.world.visible = !tooClose
  terrainView.update(camera.position, ready ? 5 : 40)
  sky.follow(focus, camera)
  renderer.info.reset()
  post.render(dt, sky.sunDir)

  if (!ready && terrainView.settled()) {
    ready = true
    hud.loaded()
  }
  hud.frame(now, renderer, terrainView, focus, camera, quality.level)
  if (ready) quality.frame(now)
  if (saveDirty && now - lastSave > 5000) {
    lastSave = now
    saveLocal()
  }
  if (now - lastTip > 500) {
    lastTip = now
    tips.update(tipState)
  }
}
const birdSpots: Array<{ x: number; z: number }> = []
const mapGiants: Array<{ x: number; z: number }> = []
const clothWind = new THREE.Vector3()
const _head = new THREE.Vector3()
/** The ground the cloth must stay above: the land, or the rock you stand on. */
const groundAt = (x: number, z: number) => {
  const p = wanderer.pos
  const t = terrain.heightAt(x, z)
  // Standing on rock (a ledge, the plaza, a cave floor): the cloth rests on it too.
  return p.y > t + 0.3 && Math.hypot(x - p.x, z - p.z) < 3 ? Math.max(t, p.y - 0.05) : t
}
/** How near something enormous is (0 … 1): the score swells under the colossi. */
function awe(): number {
  const p = wanderer.pos
  let a = 0
  for (const f of colossusAvoid) a = Math.max(a, 1 - Math.hypot(f.x - p.x, f.z - p.z) / (f.r * 3))
  for (const t of titans.values()) a = Math.max(a, 1 - Math.hypot(t.titan.gait.x - p.x, t.titan.gait.z - p.z) / 900)
  for (const t of herd.giants) a = Math.max(a, 1 - Math.hypot(t.gait.x - p.x, t.gait.z - p.z) / (t.H * 3))
  return Math.max(0, a)
}
/** Tools: a camera placed anywhere, looking at anything (null: the rig follows the wanderer). */
let freeCam: { from: THREE.Vector3; at: THREE.Vector3 } | null = null
// While the land wakes: the story, a line at a time.
const LORE = [
  'Before memory, the world was flat and silent.',
  'Then came the First Ones.',
  'Where they walked, valleys formed. Where they slept, mountains rose.',
  'They are walking again.',
]
let loreAt = 0
const loreEl = document.getElementById('loading-text')!
loreEl.textContent = LORE[0]
const lore = setInterval(() => {
  if (ready) return clearInterval(lore)
  loreAt = (loreAt + 1) % LORE.length
  loreEl.textContent = LORE[loreAt]
}, 2400)
hud.setMode('wanderer')
// You wake facing north, across the Green to the Sentinel kneeling on its rim:
// the first thing you see is the biggest thing you can reach.
rig.yaw = 0
if (!(localSave && loadLocal()) && !params.has('noancient')) newWorld()
requestAnimationFrame(frame)

// ---------------------------------------------------------------------------
// Test hooks for tools/*.mjs. Tools wait on `ready`, never on timeouts.

const g = {
  get ready() {
    return ready
  },
  THREE,
  shared,
  scene,
  camera,
  renderer,
  terrain,
  terrainView,
  input,
  rig,
  wanderer,
  /** Slot 1, the giant near spawn. */
  get titan() {
    return first()
  },
  titans,
  mountains,
  wildlife,
  rocks,
  colossi,
  undercroft,
  worldMap,
  cairns,
  leviathans,
  striders,
  watchers,
  mist,
  awakening,
  farGiants,
  herd,
  finds,
  journal,
  bag,
  camp,
  spots,
  wisps,
  resonance,
  eyes,
  bow,
  pick,
  birds,
  vegetation,
  grass,
  paint,
  biome,
  clouds,
  sound,
  tips,
  narration,
  /** A giant's foot coming down at (x, z), through the real event path (tools). */
  footfallAt(x: number, z: number, stomp = false) {
    onGait({ type: 'footfall', foot: 0, x, z, heading: 0, hx: 0, hz: 1, step: 0, ...(stomp ? { stomp } : {}) })
  },
  climber,
  cliff,
  get lastSafe() {
    return lastSafe.clone()
  },
  goDormant,
  setWild(on: boolean) {
    wild = on
  },
  lakes,
  sky,
  weather,
  quality,
  post,
  autopilot,
  clock,
  falls,
  get localSave() {
    return localSave
  },
  saveLocal,
  /** Forget the saved adventure (the next load starts fresh). */
  newAdventure() {
    clearWorld()
    localSave = false
  },
  savedEvents: () => localEvents.length,
  setPlough(on: boolean) {
    for (const a of titans.values()) a.titan.gait.plough = on
  },
  teleport(x: number, z: number, y?: number) {
    wanderer.place(x, y ?? terrain.heightAt(x, z), z)
    fallTop = NaN
  },
  /** Walk up to giant 1's left foot from outside and grab it. */
  grabTitan(): boolean {
    const titan = first()
    titan.group.updateMatrixWorld(true)
    const foot = titan.part('footL')!
    const c = foot.lumps[0].c.clone().applyMatrix4(foot.mesh.matrixWorld)
    const out = new THREE.Vector3(c.x - titan.gait.x, 0, c.z - titan.gait.z).normalize()
    for (let d = 40; d > 0; d -= 0.5) {
      const x = c.x + out.x * d
      const z = c.z + out.z * d
      wanderer.place(x, terrain.heightAt(x, z), z)
      chest.set(x, wanderer.pos.y + 0.9, z)
      if (climber.tryGrab(chest)) {
        climber.stamina = 1
        return true
      }
    }
    return false
  },
  climbState() {
    return {
      active: climber.active,
      part: climber.part?.key ?? null,
      standing: climber.standing,
      stamina: climber.stamina,
      x: climber.world.x,
      y: climber.world.y,
      z: climber.world.z,
      height: climber.world.y - terrain.heightAt(first().gait.x, first().gait.z),
    }
  },
  /**
   * Tools: frame `at` from about `dist` away, the camera `height` above the
   * ground, from the first direction (searching out from `yaw`, which points
   * from the subject toward the camera) with a clear line of sight over the
   * land; the wanderer stands a few metres ahead of the camera, in frame, for
   * scale. Returns false if no clear view was found.
   */
  frame(at: [number, number, number], dist: number, height = 2.5, yaw = 0): boolean {
    const T = new THREE.Vector3(...at)
    for (let k = 0; k < 40; k++) {
      const a = yaw + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.16
      for (const dd of [dist, dist * 0.75, dist * 1.35]) {
        const x = T.x + Math.sin(a) * dd
        const z = T.z + Math.cos(a) * dd
        const y = terrain.heightAt(x, z) + height
        // Not among trees (they would fill the frame), nor in rock.
        let clear = biome.forest(x, z) < 0.2 && !rocks.occupies(x, z)
        for (let t = 0.03; t < 0.97 && clear; t += 0.015) {
          const px = x + (T.x - x) * t
          const pz = z + (T.z - z) * t
          if (terrain.heightAt(px, pz) > y + (T.y - y) * t - 1.5) clear = false
          // Woods across the first stretch of the view would hide everything behind.
          if (t * dd < 120 && biome.forest(px, pz) > 0.3) clear = false
        }
        if (!clear) continue
        // The wanderer a few metres toward the subject, on the ground.
        const ux = (T.x - x) / dd
        const uz = (T.z - z) / dd
        const wx = x + ux * 9
        const wz = z + uz * 9
        wanderer.place(wx, terrain.heightAt(wx, wz), wz)
        wanderer.yaw = Math.atan2(ux, uz)
        freeCam = { from: new THREE.Vector3(x, y, z), at: T }
        return true
      }
    }
    return false
  },
  /** Put the camera at `from`, looking at `at` (tools); `lookFrom(null)` hands it back to the rig. */
  lookFrom(from: [number, number, number] | null, at?: [number, number, number]) {
    freeCam = from && at ? { from: new THREE.Vector3(...from), at: new THREE.Vector3(...at) } : null
  },
  setCam(yaw: number, pitch: number, dist?: number) {
    rig.yaw = yaw
    rig.pitch = pitch
    if (dist !== undefined) rig.distance = dist
  },
  player() {
    const p = wanderer.pos
    return { x: p.x, y: p.y, z: p.z, grounded: wanderer.grounded, speed: wanderer.speed }
  },
  titanState() {
    const t = first().gait
    return { x: t.x, z: t.z, heading: t.heading, speed: t.speed, steps: t.steps, plant: t.plant.map((p) => ({ ...p })) }
  },
  heightAt: (x: number, z: number) => terrain.heightAt(x, z),
  deltaAt: (x: number, z: number) => terrain.delta.sample(x, z),
  lakeStats() {
    return lakes.lakes.map((l) => ({
      id: l.id,
      cells: l.basin.sorted.length,
      bottom: +l.basin.bottom.toFixed(2),
      spill: +l.basin.spill.toFixed(2),
      level: +l.level.toFixed(2),
      full: l.level >= l.basin.spill - 0.01,
    }))
  },
  stats: () => ({ ...hud.last, ...terrainView.stats, lakes: lakes.lakes.length }),
}
;(window as unknown as { __g: typeof g }).__g = g
