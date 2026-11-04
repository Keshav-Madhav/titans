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
  DELL,
  SHORE,
  seaward,
  shoreSector,
  HIGH,
  highSector,
  PIT,
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
import { loadTerrainTextures, LAYER } from './terrain-material'
import { SkySystem } from './sky'
import { Input } from './input'
import { MAX_SLOPE, Wanderer } from './wanderer'
import { setGiantSkin, Titan } from './titan'
import { WaterView } from './water-view'
import { Effects } from './effects'
import { CameraRig, RIDE_CAM, WANDERER_CAM } from './camera-rig'
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
import { Motes } from './motes'
import { Awakening } from './awakening'
import { Herd } from './herd'
import { CATALOGUE, Discoveries, visit, type Site } from './discovery'
import { Journal } from './journal'
import { Bag, loadIcons } from './bag'
import { Camp, CAMP, CAMP_BARE } from './camp'
import { soft, softScene, softSwitch } from './soft'
import { Prints } from './prints'
import { Sea } from './sea'
import { Frozen } from './frozen'
import { Grapple, RANGE as GRAPPLE_RANGE } from './grapple'
import { Spots, type Spot } from './spots'
import { Wisps } from './wisps'
import { Resonance } from './resonance'
import { Eyes, type EyeSet } from './eyes'
import { Bow, type ArrowHit, type Pick } from './bow'
import { Glyphs } from './glyphs'
import { hangingSteps } from './parkour'
import { Toolbar } from './toolbar'
import { Ambience } from './ambience'
import { Offerings } from './offerings'
import { MireView, poolWater } from './mire'
import { Dread } from './dread'
import { Bell } from './bell'
import { Eerie } from './eerie'
import { ScaleDirector, type BigThing } from './scale'
import { Reveal } from './reveal'
import { isColossus } from './rock-fields'
import { carvedStone } from './spots'
import { Birds } from './life'
import { Clouds } from './clouds'
import { Biome } from './biome'
import { PaintField } from './paint'
import { Vegetation } from './vegetation'
import { foliageFocus } from './trees'
import { Grass } from './grass'
import { Sound, type Surface } from './audio'
import { installSkin } from './ui-skin'
import { Wake } from './wake'
import { Pause } from './pause'
import { Tips } from './tips'
import { Quality } from './quality'
import { installAtmosphere } from './atmosphere'
import { Post } from './post'
import { Weather } from './weather'
import { crash, isBroken, watchErrors } from './crash'
import { clearWorld, loadSettings, loadWorld, packEvent, saveSettings, saveWorld, unpackEvent, type SaveData, type SavedEvent, type Settings } from './save'

const STEP = 1 / 60
installSkin()
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
const [terrainTex] = await Promise.all([loadTerrainTextures(renderer), loadIcons()])
const terrainView = new TerrainView(terrain, WORLD_SEED, terrainTex)
setGiantSkin(terrainTex)
scene.add(terrainView.group)
const biome = new Biome(WORLD_SEED, terrain.base.regions)
const paint = new PaintField()
const pave = new PaintField()
terrainView.biome = biome

const sky = new SkySystem(scene, renderer)
// The day goes by in play; the tools hold it still (and set it) so shots are repeatable.
sky.running = !toolMode
installAtmosphere(sky.sunDir, { hall: { ...HALL, top: terrain.base.hallTop }, pit: { ...PIT, top: terrain.base.pitTop } })
const quality = new Quality(renderer, terrainView, sky.sun, params.get('quality'))
// Bloom, god rays and the grade (?post=0 renders straight to the screen).
const post = new Post(renderer, scene, camera)
// (The post pipeline is the look — tone, grade, haze, shafts — and stays on at every level:
// switching it off with the quality level changed the whole picture in one frame.)
quality.onApply = () => {
  post.enabled = params.get('post') !== '0'
  post.resize()
}
quality.onApply(quality.level)
// The weather: a low cloud deck the tall things vanish into, storms, breaks of sun.
const weather = new Weather(sky, post, scene, WORLD_SEED)
scene.add(weather.group)
// (The cloud deck's sheets, the puffs and the mist draw after the world, fading into it: soft.ts.)
for (const m of weather.deck) softScene.add(m)
// (Rain too, last: drawn before the deck, the deck painted over every streak against the sky.)
softScene.add(weather.rain)
weather.rain.renderOrder = 5
weather.onLightning = (d) => sound.thunder(d)
weather.roof = terrain.base.hallTop
if (params.get('weather')) weather.set(params.get('weather') as Parameters<Weather['set']>[0], true)

// New pools only in hollows a giant dug (natural hollows stay dry).
const lakes = new LakeSystem(terrain.cellHeight, undefined, (x, z) => terrain.delta.at(x, z) < -0.05)
const water = new WaterView()
// The sea beyond the Dune Sea (the Shore).
const sea = new Sea(terrain)
scene.add(sea.mesh)
const wake = new Wake()
scene.add(wake.group)
scene.add(water.group)
const effects = new Effects((x, z) => terrain.heightAt(x, z))
scene.add(effects.group)
const wildlife = new Wildlife(terrain, lakes)
scene.add(wildlife.group)
const clouds = new Clouds()
softScene.add(clouds.mesh)
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
softScene.add(mist.mesh)
const motes = new Motes()
scene.add(motes.points)
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
  stranded: 'The Stranded',
}
const mapPlaces: MapPlace[] = [
  ...[...colossi.places].filter(([k]) => k !== 'skull' && k !== 'stair' && k !== 'stranded-skull').map(([k, v]): MapPlace => ({
    name: NAMES[k] ?? null,
    kind: k.startsWith('tree') ? 'tree' : k.startsWith('stone') ? 'stone' : 'colossus',
    x: v.x,
    z: v.z,
  })),
  { name: 'The Undercroft', kind: 'hall', x: HALL.x, z: HALL.z },
  { name: 'The Wader', kind: 'colossus', x: 0, z: SHORE.waderD },
  { name: 'The Frozen One', kind: 'colossus', x: Math.sin(HIGH.axis) * HIGH.frozenD, z: Math.cos(HIGH.axis) * HIGH.frozenD },
]
const worldMap = new WorldMap(terrain, mapPlaces)
worldMap.onToggle = (open?: boolean) => {
  input.releaseAll()
  if (open && tipState.high > 150) tipState.mapped = true
  sound.ui(open === false ? 'close' : 'page')
}
worldMap.allowed = () => toolMode || finds.has('bag')

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
  // The High Places: on the cliff's edge beside the top of the stair, looking down over the sea of
  // cloud — and on the Shore, on the Stranded's skull, looking out over the water.
  {
    const R = (HIGH.foot + HIGH.lip) / 2
    const d = HIGH.lip + 70
    const a = HIGH.axis + (HIGH.a1 * R) / R - 0.03
    const x = Math.sin(a) * d
    const z = Math.cos(a) * d
    cairnPlaces.push({ name: "The Cloud's Edge", x, y: terrain.heightAt(x, z), z })
  }
  const sk2 = colossi.places.get('stranded-skull')
  if (sk2) {
    let best = { x: sk2.x, z: sk2.z, y: -Infinity }
    for (let dz = -40; dz <= 40; dz += 3) {
      for (let dx = -40; dx <= 40; dx += 3) {
        const y = rocks.topAt(sk2.x + dx, sk2.z + dz)
        if (y !== null && y > best.y) best = { x: sk2.x + dx, z: sk2.z + dz, y }
      }
    }
    if (best.y > -50) cairnPlaces.push({ name: 'The Sea-Skull', ...best })
  }
}
const cairns = new Cairns(cairnPlaces)

// The mound (uncover): something buried on the eastern Green, too deep to dig; a giant's foot can open it.
const MOUND = { x: 950, z: 620 }
const mound = (() => {
  const g = new THREE.Group()
  const y = terrain.heightAt(MOUND.x, MOUND.z)
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(10, 3.2, 9), new THREE.MeshStandardMaterial({ color: 0x5f6b3c, roughness: 1 }))
  earth.position.set(MOUND.x, y - 0.4, MOUND.z)
  earth.receiveShadow = true
  // A corner of carved stone pokes out of it: the hint.
  const corner = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 1.1), carvedStone())
  corner.position.set(MOUND.x + 4.5, y + 1.2, MOUND.z - 2)
  corner.rotation.set(0.3, 0.6, 0.2)
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 1.0), carvedStone())
  box.position.set(MOUND.x, y - 0.6, MOUND.z)
  box.visible = false
  g.add(earth, corner, box)
  scene.add(g)
  return { group: g, earth, corner, box, open: false }
})()
function uncover(instant = false): void {
  mound.open = true
  mound.earth.visible = false
  mound.corner.visible = false
  mound.box.visible = true
  mound.box.position.y = terrain.heightAt(MOUND.x, MOUND.z) + 0.3
  if (instant) return
  spots.reveal('buried-box')
  sound.rubble(Math.hypot(camera.position.x - MOUND.x, camera.position.z - MOUND.z))
  setTimeout(() => narration.say('The mound is gone, trodden flat. In the broken ground, a stone box.'), 1200)
}

// The Hanging Steps: a parkour line on the western Green (hop, climb, up to the top).
const STEPS_AT = { x: -1700, z: 300 }
const hanging = hangingSteps(rocks, terrain, STEPS_AT.x, STEPS_AT.z)
scene.add(hanging.decor)
const stepsTop = hanging.top

// Offering shrines: each shows a small thing found elsewhere; bring it, and it answers.
const offerings = (() => {
  const col = colossi.places.get('colonnade')
  const rib = colossi.places.get('ribcage')
  return new Offerings(
    [
      ...(col ? [{ id: 'offer-bell', wants: 'bell-grove', x: col.x - 40, z: col.z + 30 }] : []),
      ...(rib ? [{ id: 'offer-figure', wants: 'figure-stair', x: rib.x + 70, z: rib.z - 40 }] : []),
      { id: 'offer-feather', wants: 'feather-spire', x: STEPS_AT.x + 22, z: STEPS_AT.z - 8 },
    ],
    terrain,
  )
})()
scene.add(offerings.group)

// Chase the light: wisps that lead you somewhere, and leave something there.
const wisps = new Wisps(
  [
    { id: 'wisp-green', start: { x: -2150, z: 950 }, bearing: -Math.PI / 2, seed: 61 },
    { id: 'wisp-wood', start: { x: -3500, z: -2400 }, bearing: -2.2, seed: 62 },
    { id: 'wisp-dunes', start: { x: 1300, z: 3700 }, bearing: 0.3, seed: 63 },
  ],
  terrain,
  poolWater(terrain, (x, z) => biome.mire(x, z)).wetAt,
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

// Eerie places: the Pit, the Circle of the Bowed, the Hanged (and the Husk, a colossus).
const eerie = (() => {
  const c = levelNear(7300, 1500, 500, 300)
  const tree = colossi.places.get('tree-4') ?? colossi.places.get('tree-1')!
  const hangY = terrain.heightAt(tree.x, tree.z) + 175
  const e = new Eerie(terrain, c, { x: tree.x + 40, y: hangY, z: tree.z + 30 })
  // The Circle: seven hooded figures, heads bowed, facing the middle.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3
    const x = c.x + Math.cos(a) * e.circle.r
    const z = c.z + Math.sin(a) * e.circle.r
    rocks.addColossus({ kind: 'mourner', x, z, y: terrain.heightAt(x, z) - 3, rot: Math.atan2(c.x - x, c.z - z), seed: 900 + i, layers: [LAYER.carved, LAYER.moss], scale: 10, tint: [0.78, 0.76, 0.72], res: 110 })
  }
  // The black stone in the middle of the ring.
  rocks.addColossus({ kind: 'monolith', x: c.x, z: c.z, y: terrain.heightAt(c.x, c.z) + 20, rot: 0.4, seed: 777, layers: [LAYER.basalt, LAYER.basalt], scale: 14, tint: [0.35, 0.35, 0.38] })
  const f = rocks.formations[rocks.formations.length - 1]
  f.float = { amp: 0, phase: 0, spin: 0 }
  return e
})()
scene.add(eerie.group)

// The bow's targets: sets of stone eyes (placed with the spots, below).
const eyeSets: EyeSet[] = []
// The traveller's later camps (the first, with the bag, is `camp`): each with a page; the second with the horn.
const travellerCamps: Camp[] = []
// Glyph trails, seen through the Sight-stone (made with the spots: the Grove's starts at the stone).
let glyphs: Glyphs

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
  {
    // The High Places: a stone where the stair comes out on top; the old ice by the Frozen One.
    const R = (HIGH.foot + HIGH.lip) / 2
    const a = HIGH.axis + (HIGH.a1 * R) / R + 0.012
    const d = HIGH.lip + 200
    list.push(['lore-stair-top', 'stone', ground(Math.sin(a) * d, Math.cos(a) * d)])
    const fx = Math.sin(HIGH.axis + 0.02) * (HIGH.frozenD - 330)
    const fz = Math.cos(HIGH.axis + 0.02) * (HIGH.frozenD - 330)
    list.push(['ice-frozen', 'trinket', ground(fx, fz)])
  }
  const sk = P('skull')
  if (sk) list.push(['tooth-skull', 'trinket', topNear(sk.x, sk.z, 60)])
  const strandedSkull = P('stranded-skull')
  if (strandedSkull) list.push(['scale-stranded', 'trinket', topNear(strandedSkull.x, strandedSkull.z, 45)])
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
      if (rocks.sdfAt(p.x, p.y, p.z) < 0.5 || H(p.x, p.z) > p.y) return settle(from.clone().addScaledVector(dir, Math.max(0, t - 0.6)), dir.clone().negate())
    }
    return null
  }
  // Set flush in the stone and wholly on its face (user: "the targets look weird when
  // looking from behind": each faced back along the ray that found it, tilted to the wall,
  // and some sat at a pillar's corner with half the disc hanging out past it).
  const sdf = (q: THREE.Vector3) => rocks.sdfAt(q.x, q.y, q.z)
  const settle = (at: THREE.Vector3, fallback: THREE.Vector3) => {
    const e = 0.6
    // (In the ground's own cliff, not a rock formation: as found, facing back along the ray.)
    if (sdf(at) > 2) return { at, normal: fallback }
    const n = new THREE.Vector3(
      sdf(at.clone().setX(at.x + e)) - sdf(at.clone().setX(at.x - e)),
      sdf(at.clone().setY(at.y + e)) - sdf(at.clone().setY(at.y - e)),
      sdf(at.clone().setZ(at.z + e)) - sdf(at.clone().setZ(at.z - e)),
    )
    if (n.lengthSq() < 1e-6) return { at, normal: fallback }
    n.normalize()
    const u = new THREE.Vector3().crossVectors(n, Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize()
    const v = new THREE.Vector3().crossVectors(n, u)
    const q = new THREE.Vector3()
    // Slide inward while any point of the rim (3.2 m round, just behind the face) is in the open.
    for (let step = 0; step < 16; step++) {
      const out = new THREE.Vector3()
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2
        q.copy(at).addScaledVector(u, Math.cos(a) * 3.2).addScaledVector(v, Math.sin(a) * 3.2).addScaledVector(n, -0.6)
        if (sdf(q) > 0) out.addScaledVector(u, Math.cos(a)).addScaledVector(v, Math.sin(a))
      }
      if (out.lengthSq() < 1e-6) break
      at.addScaledVector(out.normalize(), -0.6)
      // (Back onto the surface after the slide.)
      at.addScaledVector(n, -sdf(at) + 0.1)
    }
    return { at, normal: n }
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
  // The traveller's trail: the first camp's page, then three more camps across the lands.
  list.push(['page-1', 'page', ground(CAMP.x + 1.1, CAMP.z + 1.4)])
  const stairAt = P('stair')
  const trail: Array<{ page: string; x: number; z: number }> = [
    { page: 'page-2', x: 2350, z: 3000 },
    { page: 'page-3', x: -3000, z: -1700 },
  ]
  if (stairAt) {
    const l = Math.hypot(stairAt.x, stairAt.z)
    trail.push({ page: 'page-4', x: stairAt.x - (stairAt.x / l) * 330, z: stairAt.z - (stairAt.z / l) * 330 })
  }
  // They came back down. South to the Shore (a camp on the beach, looking out at the Wader)…
  trail.push({ page: 'page-5', x: 420, z: 8950 })
  // …and then up the stair beyond the Steps, to the top of the cliff: the last camp.
  {
    const R = (HIGH.foot + HIGH.lip) / 2
    const d = HIGH.lip + 260
    const a = HIGH.axis + (HIGH.a1 * R) / R + 0.004
    trail.push({ page: 'page-6', x: Math.sin(a) * d, z: Math.cos(a) * d })
  }
  for (const c of trail) {
    const camp = new Camp(terrain, { x: c.x, z: c.z }, false)
    scene.add(camp.group)
    travellerCamps.push(camp)
    list.push([c.page, 'page', ground(c.x + 1.1, c.z + 1.4)])
  }
  // The Sight-stone in the Grove, and the glyph trails: from it, from the first camp, from the Colonnade.
  const sightAt = ground(big.x + 70, big.z + 55)
  const colAt = P('colonnade') ?? new THREE.Vector3(3068, 0, -2808)
  glyphs = new Glyphs(
    [
      { id: 'cache-grove', start: { x: sightAt.x + 6, z: sightAt.z }, bearing: -2.4, seed: 71 },
      { id: 'cache-green', start: { x: CAMP.x + 4, z: CAMP.z - 3 }, bearing: 1.9, seed: 72 },
      { id: 'cache-steps', start: { x: colAt.x + 0.866 * 70, z: colAt.z - 0.5 * 70 }, bearing: 0.9, seed: 73 },
    ],
    terrain,
    (x, z) => rocks.occupies(x, z) || rocks.sdfAt(x, H(x, z) + 1, z) < 2,
  )
  scene.add(glyphs.group)
  const sightModel = new THREE.Group()
  sightModel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 16), new THREE.MeshStandardMaterial({ color: 0x9fc6c8, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 })))
  sightModel.position.y = 0.02
  const hornModel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 14, Math.PI * 0.8), new THREE.MeshStandardMaterial({ color: 0x9b8a6c, roughness: 0.6 }))
  hornModel.rotation.set(Math.PI / 2, 0, 0.6)
  const placed: Spot[] = list.filter((e): e is [string, Spot['kind'], THREE.Vector3] => !!e[2]).map(([id, kind, at]) => ({ id, kind, at, hidden: id.startsWith('eyes-') }))
  placed.push({ id: 'bow', kind: 'trinket', at: new THREE.Vector3(altarAt.x, altarAt.y + 1.12, altarAt.z), model: bowModel })
  // The wing-cloak, folded, at the top of the Great Stair (where the last page said it would be).
  if (gate) {
    const cy = rocks.floorAt(gate.x - 5, gate.y + 4, gate.z - 3, 0.6, 12) ?? gate.y
    const cloakModel = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.55), new THREE.MeshStandardMaterial({ color: 0x7a2e24, roughness: 0.95 }))
    cloakModel.position.y = 0.06
    const wrap = new THREE.Group()
    wrap.add(cloakModel)
    placed.push({ id: 'cloak', kind: 'trinket', at: new THREE.Vector3(gate.x - 5, cy, gate.z - 3), model: wrap })
  }
  placed.push({ id: 'sight', kind: 'trinket', at: sightAt, model: sightModel })
  placed.push({ id: 'kite-steps', kind: 'trinket', at: stepsTop.clone() })
  // The eerie places: a stone at each, and something to take.
  {
    // The Pit: find its fallen side (the highest ground part-way in); the coin
    // lies at the foot of that rubble slope, down in the dark; the stone stands
    // on the far lip.
    let best = { a: 0, h: -Infinity }
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * Math.PI * 2
      const hh = H(PIT.x + Math.cos(a) * PIT.r * 0.55, PIT.z + Math.sin(a) * PIT.r * 0.55)
      if (hh > best.h) best = { a, h: hh }
    }
    let foot = ground(PIT.x, PIT.z)
    for (let d = PIT.r * 0.6; d >= 0; d -= 2) {
      const p = ground(PIT.x + Math.cos(best.a) * d, PIT.z + Math.sin(best.a) * d)
      if (p.y < foot.y + 1 || d === PIT.r * 0.6) foot = p
    }
    placed.push({ id: 'pit-ledge', kind: 'trinket', at: foot })
    placed.push({ id: 'lore-pit', kind: 'stone', at: ground(PIT.x - Math.cos(best.a) * PIT.r * 1.9, PIT.z - Math.sin(best.a) * PIT.r * 1.9) })
    const c = eerie.circle
    const out = Math.atan2(c.x, c.z)
    placed.push({ id: 'lore-circle', kind: 'stone', at: ground(c.x - Math.sin(out) * (c.r + 70), c.z - Math.cos(out) * (c.r + 70)) })
    placed.push({ id: 'circle-stone', kind: 'trinket', at: ground(c.x + 14, c.z + 10) })
    const hk = P('husk')
    if (hk) {
      placed.push({ id: 'lore-husk', kind: 'stone', at: ground(hk.x + 150, hk.z - 40) })
      // Inside, on the sand under its back.
      placed.push({ id: 'husk-figure', kind: 'trinket', at: ground(hk.x + Math.sin(0.9) * 30, hk.z + Math.cos(0.9) * 30) })
    }
    const hg = eerie.hanged
    placed.push({ id: 'lore-hanged', kind: 'stone', at: ground(hg.x - 30, hg.z - 25) })
    placed.push({ id: 'hanged-ring', kind: 'trinket', at: ground(hg.x + 6, hg.z + 4) })
  }
  // Where the footprints in the morning end (placed when they appear: dread.ts).
  placed.push({ id: 'print-gift', kind: 'trinket', at: new THREE.Vector3(0, -1000, 0), hidden: true })
  const dro = P('drowned')
  if (dro) {
    const back = Math.atan2(-dro.x, -dro.z)
    placed.push({ id: 'lore-drowned', kind: 'stone', at: ground(dro.x + Math.sin(back) * 520, dro.z + Math.cos(back) * 520) })
    // On its brow (the face is 270 m from its middle, toward its head: rot 2.2 in colossi.ts).
    const crown = topNear(dro.x + Math.sin(2.2) * 268, dro.z + Math.cos(2.2) * 268, 30)
    if (crown) placed.push({ id: 'moss-crown', kind: 'trinket', at: crown })
  }
  placed.push({ id: 'buried-box', kind: 'trinket', at: ground(MOUND.x + 0.8, MOUND.z), hidden: true })
  placed.push({ id: 'lore-mound', kind: 'stone', at: ground(MOUND.x - 16, MOUND.z + 12) })
  for (const t of glyphs.trails) placed.push({ id: t.def.id, kind: 'trinket', at: t.end.clone(), hidden: true })
  placed.push({ id: 'horn', kind: 'trinket', at: ground(trail[0].x - 0.9, trail[0].z + 1.6).add(new THREE.Vector3(0, 0.12, 0)), model: hornModel })
  for (const id of ['wisp-green', 'wisp-wood', 'wisp-dunes']) placed.push({ id, kind: 'trinket', at: wisps.endOf(id)!, hidden: true })
  for (const r of resonance.rings) placed.push({ id: r.def.id, kind: 'trinket', at: r.reward.clone(), hidden: true })
  return new Spots(placed)
})()
// The Great Bell, by the Colonnade: ring it with an arrow and every giant turns to it.
const bell = (() => {
  const col = colossi.places.get('colonnade') ?? new THREE.Vector3(3068, 0, -2808)
  // A little in front of the colonnade, toward the Green, on the axis of the row.
  const bx = col.x - 0.866 * 260
  const bz = col.z + 0.5 * 260
  // (The frame faces the Green: its posts stand along the colonnade's row, not
  // across the way you come — edge-on, a post hid the bell from the shot.)
  return new Bell(rocks, terrain, bx, bz, -Math.PI / 3)
})()
scene.add(bell.group)
bell.onStrike = () => {
  sound.bell(camera.position.distanceTo(bell.at))
  finds.find('bell')
  const until = performance.now() + 50000
  for (const id of titans.keys()) hornOrders.set(id, { kind: 'look', until, x: bell.at.x, z: bell.at.z })
  herd.look(bell.at.x, bell.at.z, 50)
  setTimeout(() => narration.say('The note rolls out over every land. Far off, something stops walking.'), 3000)
}

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
  const rung = bell.hit(a, b)
  if (rung) return { at: rung, stop: true }
  const h = terrain.heightAt(b.x, b.z)
  if (b.y < h) return { at: b.clone().setY(h), stop: false }
  if (rocks.sdfAt(b.x, b.y, b.z) < 0) return { at: a.clone(), stop: false }
  return null
}
const aimFwd = new THREE.Vector3()
const _eye = new THREE.Vector3()
// The scale director: the lens, the camera's height and distance, a gaze that drifts up (scale.ts).
const scaleDir = new ScaleDirector()
const bigThings: BigThing[] = []
let shadowR = 260
function gatherBig(): BigThing[] {
  bigThings.length = 0
  const add = (x: number, z: number, H: number) => {
    const base = terrain.heightAt(x, z)
    bigThings.push({ x, z, base, top: base + H })
  }
  for (const a of titans.values()) add(a.titan.gait.x, a.titan.gait.z, a.titan.H)
  for (const t of herd.giants) add(t.gait.x, t.gait.z, t.H)
  for (const t of farGiants) add(t.gait.x, t.gait.z, t.H)
  for (const f of rocks.formations) {
    if (!isColossus(f.kind as never) || f.float) continue
    bigThings.push({ x: f.x, z: f.z, base: f.y, top: f.y + f.cy + f.hy })
  }
  return bigThings
}
let circleSilent = false
const pick: Pick = (from, dir, max) => {
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  for (let t = 0; t < max; t += 2) {
    a.copy(from).addScaledVector(dir, t)
    b.copy(from).addScaledVector(dir, t + 2)
    if (eyes.test(a, b) || bell.test(a, b) || b.y < terrain.heightAt(b.x, b.z) || rocks.sdfAt(b.x, b.y, b.z) < 0) return t + 2
  }
  return max
}
glyphs.onEnd = (id) => {
  sound.chime()
  narration.say('The marks end here. Something has been waiting a long time to be looked at.')
  spots.reveal(id)
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
/** The cairns of each land (all of one land's lit → an ember: discovery.ts). */
const CAIRN_LANDS: Record<string, string[]> = {
  forest: ['Moss Crown', 'Rootwatch'],
  desert: ['The Red Tooth', 'Dune Watch'],
  ruins: ['The High Terrace', 'The Last Step'],
}
/**
 * Watching: stand still near one of them long enough and you learn something
 * of how it lives. Returns how far along (0 … 1) for the prompt.
 */
const watch = { id: '', t: 0 }
const WATCH_FOR = 18
function watching(dt: number): number {
  const p = wanderer.pos
  let id = ''
  if (!climber.active && !cliff.active && wanderer.speed < 0.3) {
    const t1 = titans.get('t1')?.titan
    const t2 = titans.get('t2')?.titan
    const c = herd.centre()
    if (t1 && Math.hypot(t1.gait.x - p.x, t1.gait.z - p.z) < t1.H * 2.5 && !finds.has('watch-walker')) id = 'watch-walker'
    else if (t2 && Math.hypot(t2.gait.x - p.x, t2.gait.z - p.z) < t2.H * 2.5 && !finds.has('watch-grey')) id = 'watch-grey'
    else if (Math.hypot(c.x - p.x, c.y - p.z) < 700 && !finds.has('watch-herd')) id = 'watch-herd'
  }
  if (id !== watch.id) {
    watch.id = id
    watch.t = 0
  }
  if (!id) return 0
  watch.t += dt
  if (watch.t >= WATCH_FOR) {
    finds.find(id)
    watch.id = ''
    return 0
  }
  return watch.t / WATCH_FOR
}
let watchProgress = 0
const CAIRN_LINES = ['The land below opens to you.', 'From here you can see a long way.', 'The flame catches. The wind takes the smoke.', 'Someone stood here once, and looked out as you do.']
/** Keep a clearing round each cairn (they are placed further down; plants grow later, lazily). */
const nearCairn = (x: number, z: number) => cairnPlaces.some((c) => Math.abs(c.x - x) < 9 && Math.abs(c.z - z) < 9)
const vegetation = new Vegetation(terrain, biome, lakes, paint, pave, (x, z) => rocks.occupies(x, z) || inHall(x, z, 6) || nearCairn(x, z), rockMaterial(terrainTex))
scene.add(vegetation.group)
// Dense grass round you, rolling in the wind.
const bareAt = (x: number, z: number) => Math.hypot(x - CAMP.x, z - CAMP.z) < CAMP_BARE || travellerCamps.some((c) => Math.hypot(x - c.fire.x, z - c.fire.z) < CAMP_BARE)
// (Not on the beds of the Mire's pools, under the water: mireView is made below, and asked only once the game runs.)
const grass = new Grass(terrain, biome, lakes, (x, z) => rocks.occupies(x, z) || nearCairn(x, z) || bareAt(x, z) || mireView.wetAt(x, z))
scene.add(grass.mesh)
quality.vegetation = vegetation
quality.refresh()
terrainView.fresh = (x, z) => vegetation.isFresh(x, z)
vegetation.onRegrow = (x0, z0, x1, z1) => terrainView.markDirty(x0, z0, x1, z1)

const input = new Input(canvas)
const rig = new CameraRig(camera)
// The camera stays out of rock (formations, colossi, the Undercroft).
// (And the giant you hold: riding pulls the camera back, and it must not end up inside a leg.)
rig.occluder = (x, y, z) => {
  const held = climber.active ? heldAwake() : undefined
  return Math.min(rocks.sdfAt(x, y, z), held ? held.roughSdf(x, y, z) : Infinity)
}
rig.setProfile(WANDERER_CAM)
sky.setShadowRadius(260)
const hud = new Hud()
const narration = new Narration()

// Discovery: places, the ones who live here, words on stone, relics, trinkets.
const finds = new Discoveries()
const handAt = new THREE.Vector3()
const _focus = new THREE.Vector3()
const journal = new Journal(finds)
journal.haveBag = () => bag.have
const toolbar = new Toolbar(finds)
// The Mire: its pools' still water and its drowned trees, near you.
const mireView = new MireView(terrain, (x, z) => biome.mire(x, z))
scene.add(mireView.group)
// Small life: fireflies, butterflies, big birds circling the giants' heads; insects and birdsong.
const lush = (x: number, z: number) => 1 - biome.desert(x, z)
const wetland = (x: number, z: number) => biome.mire(x, z)
const ambience = new Ambience(terrain, lush)
scene.add(ambience.group)
ambience.onFlush = () => sound.flush()

// Dread (PLAN.md §2g): rare, slow, unexplained things. Never a jumpscare; none can hurt you.
const STRANGE: Record<string, string> = { stillness: 'strange-stillness', walker: 'strange-walker', footprints: 'strange-footprints', eyes: 'strange-eyes', deep: 'strange-deep' }
const dread = new Dread(
  {
    hush: (on) => sound.still(on),
    farStep: (d) => sound.footfall(d, false),
    deep: () => sound.deep(),
    shake: (k) => rig.shake(k),
    footprint: (x, z, hx, hz) => {
      const ev: GaitEvent = { type: 'footfall', foot: 0, x, z, heading: Math.atan2(hx, hz), hx, hz, step: 0 }
      onGait(ev, true)
      record(ev)
      // Fresh: bare earth, the grass trodden flat (a replayed print would read as old ground).
      vegetation.trample(x - 24, z - 24, x + 24, z + 24)
      terrainView.markDirty(x - 30, z - 30, x + 30, z + 30)
    },
    footprintsEnd: (x, z) => {
      const s = spots.spots.find((p) => p.id === 'print-gift')
      if (!s || finds.has('print-gift')) return
      spots.place('print-gift', new THREE.Vector3(x, terrain.heightAt(x, z), z))
      spots.reveal('print-gift')
    },
    say: (text) => setTimeout(() => narration.say(text), 2500),
    witness: (kind) => {
      if (STRANGE[kind]) finds.find(STRANGE[kind])
    },
  },
  WORLD_SEED,
)
scene.add(dread.group)
function dreadWorld() {
  return {
    player: wanderer.pos,
    camera,
    night: sky.night,
    dusk: sky.dusk,
    dark: weather.now.dark,
    time: sky.time,
    forest: biome.forest(wanderer.pos.x, wanderer.pos.z),
    open: biome.open(wanderer.pos.x, wanderer.pos.z),
    heightAt: (x: number, z: number) => terrain.heightAt(x, z),
    // (Tools trigger them by hand: dreadBegin.)
    busy: awakening.active || climber.active || toolMode,
  }
}
journal.onToggle = (open?: boolean) => {
  input.releaseAll()
  sound.ui(open === false ? 'close' : 'page')
}
journal.allowed = () => toolMode || bag.have
// The bag: found at a camp just ahead of where you wake; everything small goes in it.
const bag = new Bag(finds)
bag.onToggle = (open) => {
  input.releaseAll()
  sound.ui(open ? 'open' : 'close')
  if (open) tipState.looked = true
}
bag.onNoBag = () => narration.say('You have nothing to carry things in. Not yet.')
const camp = new Camp(terrain)
scene.add(camp.group)
finds.onFind = (f) => {
  journal.announce(f)
  // Finding one of them (or a colossal place) from the ground: the dolly zoom.
  if ((f.kind === 'giant' || f.kind === 'place') && wanderer.grounded && !climber.active && opening === 'done') scaleDir.vertigo(camera.fov)
  sound.chime()
  setTimeout(() => narration.say(f.text), 1600)
  saveDirty = true
}
const near = (x: number, z: number) => () => ({ x, z })
const placeAt = (name: string) => () => colossi.places.get(name) ?? null
const sites: Site[] = [
  { id: 'green', r: 500, at: near(0, 0) },
  { id: 'steps', r: 160, at: near(STEPS_AT.x, STEPS_AT.z) },
  { id: 'pit', r: 160, at: near(PIT.x, PIT.z) },
  { id: 'circle', r: 480, at: () => ({ x: eerie.circle.x, z: eerie.circle.z }) },
  { id: 'husk', r: 380, at: placeAt('husk') },
  { id: 'hanged', r: 200, at: () => ({ x: eerie.hanged.x, z: eerie.hanged.z }) },
  { id: 'mire', r: 500, at: () => {
    // The nearest marsh: wherever you stand in one.
    const p = wanderer.pos
    return biome.mire(p.x, p.z) > 0.6 ? { x: p.x, z: p.z } : null
  } },
  { id: 'drowned', r: 650, at: placeAt('drowned') },
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
  // The Shore: down on the beach. And from it, out in the water, the one who stands there.
  { id: 'shore', r: 700, at: () => {
    const p = wanderer.pos
    if (!seaward(p.x, p.z)) return null
    const a = Math.atan2(p.x, p.z)
    return { x: Math.sin(a) * SHORE.coast, z: Math.cos(a) * SHORE.coast }
  } },
  // (Met from the beach, looking out at it: within 5.6 km it was "met" inside the Husk, in the
  // Dune Sea, with dunes and mountains between.)
  { id: 'wader', r: 3500, at: () => (seaward(wanderer.pos.x, wanderer.pos.z) || Math.hypot(wanderer.pos.x, wanderer.pos.z) > SHORE.coast - 1500 ? { x: wader.gait.x, z: wader.gait.z } : null) },
  { id: 'stranded', r: 420, at: placeAt('stranded') },
  // The High Places: up on the plateau. And there, in the ice, the Frozen One.
  { id: 'high', r: 600, at: () => {
    const p = wanderer.pos
    return highSector(p.x, p.z) > 0.5 && p.y > HIGH.top - 60 ? { x: p.x, z: p.z } : null
  } },
  { id: 'frozen', r: 1500, at: () => ({ x: Math.sin(HIGH.axis) * HIGH.frozenD, z: Math.cos(HIGH.axis) * HIGH.frozenD }) },
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
/**
 * The opening (the new-player pass): a new adventure does not begin on the
 * Green facing a giant. It begins at the title; a click and you wake on the
 * floor of the Undercroft, in the dark, light falling through a hole far
 * above; you find the way up; the first time you step onto the grass the
 * land is shown to you (reveal.ts). Tools and loaded saves skip it.
 */
type Opening = 'title' | 'waking' | 'hall' | 'reveal' | 'done'
let opening: Opening = toolMode ? 'done' : 'title'
let openT = 0
// Under a skylight in the middle of the hall, the stair rising away to the left toward the light.
const WAKE_AT = { x: HALL.x - 4, z: HALL.z + 54 }
const reveal = new Reveal()
if (toolMode) wanderer.place(0, terrain.heightAt(0, 0), 0)
else wanderer.place(WAKE_AT.x, terrain.heightAt(WAKE_AT.x, WAKE_AT.z), WAKE_AT.z)
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
  const r = 30500
  const t = new Titan(9500, Math.cos(a) * r, Math.sin(a) * r, Math.atan2(-Math.cos(a), -Math.sin(a)), 50 + Math.round(a * 10), 1)
  t.restBlend = 0
  t.silhouette(0.12)
  // (A dark silhouette 30 km off: its plates and fur add nothing but ~40 draw calls each.)
  t.showArmor(false)
  scene.add(t.group)
  farGiants.push(t)
}
// The Wader (the Shore): one of them standing out in the deep water, thigh-deep, its back to
// the land, looking out toward the Wall. It does not turn round.
const wader = new Titan(1000, -1400, SHORE.waderD, Math.PI / 2, 4242, 1)
wader.restBlend = 0
wader.silhouette(0.45)
// It wades slowly to and fro along the coast, out in the deep (standing still, from behind,
// it read as a pillar of rock; walking, it is one of them). Its footfalls are its own: the
// sea bed keeps no prints.
let waderTo = 1400
const waderEvents: GaitEvent[] = []
function stepWader(dt: number): void {
  const gt = wader.gait
  if (Math.abs(gt.x - waderTo) < 150) waderTo = -waderTo
  let dh = Math.atan2(waderTo - gt.x, SHORE.waderD - gt.z) - gt.heading
  dh = Math.atan2(Math.sin(dh), Math.cos(dh))
  waderEvents.length = 0
  wader.step(dt, { forward: Math.cos(dh) > 0.4 ? 0.28 : 0, turn: THREE.MathUtils.clamp(dh * 1.2, -0.6, 0.6) }, waderEvents)
}
scene.add(wader.group)
// The Frozen One, in the glacier on the High Places.
const frozen = new Frozen(terrain)
scene.add(frozen.group)
// Awakenings: rarely, a colossus beyond the mountains moves, and the camera turns to watch it.
const awakening = new Awakening(farGiants, sky.sunDir)
/** The Ones Beyond: 0 hidden … 1 shown (see the frame loop); latched on once out of the dell. */
let skyline = 0
let skylineOn = false
/** You have stood in the dell (since this page loaded, its opening done). */
let wasInDell = false
const skylineMats: THREE.Material[] = []
const skylineBase = new Map<THREE.Material, THREE.Color>()
awakening.on = (what) => {
  if (what === 'begin') {
    input.releaseAll()
    sound.hush(true)
    setTimeout(() => sound.farHorn(), 1800)
  } else if (what === 'step') {
    // The sound of it, long after (it is kilometres away).
    setTimeout(() => {
      sound.colossal()
      rig.shake(0.3)
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
// Their footfalls: dust, the ground's shake near them, the sound arriving late.
/**
 * How hard a giant's footfall (height H, d metres off) shakes the ground under you, 0…1:
 * full beside its foot, half at 0.6 H, almost nothing a kilometre from one of the big ones.
 */
function tremor(d: number, H: number): number {
  const k = d / (0.6 * H)
  return 0.6 / (1 + k * k)
}
herd.onFootfall = (x, z, H) => {
  const d = Math.hypot(camera.position.x - x, camera.position.z - z)
  if (d > 2500) return
  effects.impact(x, terrain.heightAt(x, z), z, H)
  sound.footfall(Math.hypot(d, camera.position.y - terrain.heightAt(x, z)), false)
  rig.shake(tremor(d, H))
}
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

/**
 * Apply one terrain event. `replay` = catching up on load: no dust, no shake.
 * `from` is the giant whose step it is (its footfalls jolt whoever holds on to it).
 */
function onGait(ev: GaitEvent | MountainRise, replay = false, from?: string): void {
  replaying = replay
  const H = TITAN_HEIGHT
  if (ev.type === 'mountain') {
    // A giant fell asleep: the hill rising under it.
    const box = applyMountain(terrain.delta, mountainFor(H, ev.x, ev.z))
    terrainView.markDirty(box.x0, box.z0, box.x1, box.z1)
    lakes.onDeform(box)
    if (!replay) rig.shake(tremor(Math.hypot(camera.position.x - ev.x, camera.position.z - ev.z), H) * 1.4)
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
  // A giant's foot on the mound breaks open what we could not dig.
  if (!ancient && !mound.open && Math.hypot(ev.x - MOUND.x, ev.z - MOUND.z) < 34) uncover()
  // Birds burst up round the foot when it lands within sight on green ground.
  if (Math.hypot(camera.position.x - ev.x, camera.position.z - ev.z) < 900 && biome.desert(ev.x, ev.z) < 0.5 && Math.random() < 0.6) ambience.flushAt(ev.x, ev.z, 40)
  // Every footfall jolts whoever is hanging on to that giant; a stomp nearly
  // shakes them off. (Only that giant's: another's stomp two kilometres off
  // used to take a third of your grip.)
  // (A stomp already swinging when you took hold, on your first climb: a step.)
  if (climber.active && from !== undefined && climber.target?.id === from) climber.stamina = Math.max(0, climber.stamina - (ev.stomp && firstClimbDone ? 0.35 : 0.03))
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
  rig.shake(tremor(d, H) * (ev.stomp ? 1.7 : 1))
}

const settings = loadSettings()
/** The giants wander by themselves (tools' fresh worlds keep them still unless ?wild). */
let wild = !toolMode || params.has('wild')
/** The adventure keeps itself in this browser (not in tool mode). */
let localSave = !toolMode
const sound = new Sound(settings.sound)
const tips = new Tips(!toolMode)
const tipState = { moved: 0, climbed: false, high: 0, bag: false, looked: false, out: false, mapped: false, page2: false, found: 0 }
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
  if (!localSave || isBroken()) return
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
    opened: opening === 'done' || opening === 'reveal'
  }
  if (!saveWorld(data)) narration.say('Could not save (browser storage is full or blocked).')
  saveDirty = false
}

/** Back where you left off. False if there was nothing to load. */
function loadLocal(): boolean {
  const got = loadWorld()
  if (!got) return false
  const d = got.data
  // (The last save would not read: this is the one before it, a few seconds older.)
  if (got.fromBackup) setTimeout(() => narration.say('The last save was damaged. You wake from the one before it.'), 2500)
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
  // Mid-opening when last saved (still in the hall): pick up from there; otherwise it is over.
  opening = d.opened === false ? 'hall' : 'done'
  if (finds.has('bag')) {
    camp.take()
    tipState.bag = true
  }
  for (const s of spots.spots) if (s.kind === 'trinket' && finds.has(s.id)) spots.take(s.id)
  // (A save from before the line was its own find: it came with the bag.)
  if (finds.has('bag') && !finds.has('line')) finds.load([...finds.save(), 'line'])
  for (const id of ['wisp-green', 'wisp-wood', 'wisp-dunes']) if (finds.has(id)) wisps.finish(id)
  for (const r of resonance.rings) if (finds.has(r.def.id)) resonance.open(r.def.id)
  for (const s of eyeSets) if (finds.has(s.id)) eyes.close(s.id)
  for (const t of glyphs.trails) if (finds.has(t.def.id)) glyphs.finish(t.def.id)
  if (finds.has('buried-box')) uncover(true)
  for (const s of offerings.shrines) if (finds.has(s.def.id)) offerings.answer(s.def.id)
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
  sound.away(document.hidden)
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
  if (wanderer.swimming) {
    // (Water catches you from any height.)
    if (!Number.isNaN(fallTop) && fallTop - p.y > 2) sound.land('water', Math.min(1, (fallTop - p.y) / 10))
    fallTop = NaN
    return
  }
  if (!wanderer.grounded) {
    // (Under the open cloak you are not falling: you land soft from any height.)
    fallTop = wanderer.gliding || wanderer.hanging || Number.isNaN(fallTop) ? p.y : Math.max(fallTop, p.y)
    return
  }
  // Landed.
  if (!Number.isNaN(fallTop) && fallTop - p.y > 0.9) sound.land(surfaceAt(p), Math.min(1, (fallTop - p.y) / 14))
  if (!Number.isNaN(fallTop) && fallTop - p.y > 1.6 && surfaceAt(p) !== 'water') effects.land(p.x, p.y, p.z, Math.min(1, (fallTop - p.y) / 14))
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

/**
 * The horn: blown on the ground, the nearest walker comes to see what made
 * the noise; blown from one's back, it walks the way you are looking.
 */
const hornOrders = new Map<string, { kind: 'come' | 'ride' | 'look'; until: number; x?: number; z?: number }>()
/** The horn stays at your mouth this long after a blow (for the pose). */
let hornHeldUntil = 0
function blowHorn(): void {
  sound.horn()
  hornHeldUntil = performance.now() + 2600
  const now = performance.now()
  const held = climber.active ? climber.target?.id : undefined
  if (held && titans.has(held)) {
    hornOrders.set(held, { kind: 'ride', until: now + 30000 })
    setTimeout(() => narration.say('It feels the note through its bones, and turns the way you are looking.'), 900)
    return
  }
  let best: string | null = null
  let bd = 3500
  for (const [id, a] of titans) {
    const d = Math.hypot(a.titan.gait.x - wanderer.pos.x, a.titan.gait.z - wanderer.pos.z)
    if (d < bd && !a.titan.gait.resting) {
      bd = d
      best = id
    }
  }
  if (!best) return void setTimeout(() => narration.say('The note rolls out over the land. Nothing answers.'), 1500)
  hornOrders.set(best, { kind: 'come', until: now + 150000 })
  setTimeout(() => narration.say('Far off, a head turns. It is coming to see what made the noise.'), 1500)
}
/**
 * First contact (playtest: a newcomer ran flat out for two minutes after the
 * Walker and was still half a kilometre short — it walks 12 m/s, you run 14.5).
 * Until you have climbed one of them, the first time you come near one it
 * notices you: it stops and turns to watch you, for up to three-quarters of a
 * minute, long enough to reach its feet. "They do not mind visitors. Mostly."
 */
const noticed = new Map<string, { at: number; stage: 'come' | 'look' }>()
let toldNoticed = false
function firstContact(): void {
  if (tipState.climbed || opening !== 'done') return
  const now = performance.now()
  for (const [id, a] of titans) {
    const t = a.titan
    const d = Math.hypot(t.gait.x - wanderer.pos.x, t.gait.z - wanderer.pos.z)
    const order = hornOrders.get(id)
    const n = noticed.get(id)
    if (n && order && order.until > now) {
      // Watching you: its gaze follows you as you come, and it waits as long as you are
      // about (up to four minutes from when it first saw you).
      if (order.kind === 'look') {
        order.x = wanderer.pos.x
        order.z = wanderer.pos.z
        if (d < 1600 && now - n.at < 240000) order.until = Math.max(order.until, now + 4000)
      }
      continue
    }
    // It came part of the way; now it stands and watches, a while longer.
    if (n?.stage === 'come' && now - n.at < 50000) {
      n.stage = 'look'
      hornOrders.set(id, { kind: 'look', until: now + 60000, x: wanderer.pos.x, z: wanderer.pos.z })
      continue
    }
    if (order || d > 1500 || t.gait.resting || (n && now < n.at + 150000)) continue
    // It notices you: turns, and comes a little way toward you.
    noticed.set(id, { at: now, stage: 'come' })
    hornOrders.set(id, { kind: 'come', until: now + 35000 })
    if (!toldNoticed) {
      toldNoticed = true
      setTimeout(() => narration.say('Far off, it has stopped. It has turned, slowly, and it is coming to see what you are.'), 1500)
    }
  }
}

function hornInput(id: string, t: Titan): GaitInput | null {
  const order = hornOrders.get(id)
  if (!order) return null
  if (order.until < performance.now()) {
    hornOrders.delete(id)
    return null
  }
  let tx: number
  let tz: number
  let f = 0.72
  if (order.kind === 'look') {
    // The bell: stand still, and turn to face it.
    let dh = Math.atan2(order.x! - t.gait.x, order.z! - t.gait.z) - t.gait.heading
    dh = Math.atan2(Math.sin(dh), Math.cos(dh))
    return { forward: 0, turn: THREE.MathUtils.clamp(dh * 1.4, -1, 1) }
  }
  if (order.kind === 'come') {
    tx = wanderer.pos.x
    tz = wanderer.pos.z
    // Close enough to see you: it stops and stands there, looking (near: lead it over something and it walks over it).
    if (Math.hypot(tx - t.gait.x, tz - t.gait.z) < t.H * 0.32) f = 0
  } else {
    camera.getWorldDirection(aimFwd)
    tx = t.gait.x + aimFwd.x * 600
    tz = t.gait.z + aimFwd.z * 600
  }
  let dh = Math.atan2(tx - t.gait.x, tz - t.gait.z) - t.gait.heading
  dh = Math.atan2(Math.sin(dh), Math.cos(dh))
  t.gait.plough = false
  return { forward: Math.cos(dh) > 0.25 ? f : 0, turn: THREE.MathUtils.clamp(dh * 1.4, -1, 1) }
}

function simulate(dt: number): void {
  wanderer.canGlide = finds.has('cloak')
  watchProgress = watching(dt)
  watchFalls(dt)
  if (finds.has('horn') && input.pressed('KeyH')) blowHorn()
  // G: throw the line (held, it reels in; Space lets go; standing on the ground with it slack a
  // moment, it comes back on its own).
  if (bag.have && input.pressed('KeyG') && !climber.active && !cliff.active && !wanderer.swimming) {
    if (!grapple.busy) {
      const aim = grappleAim()
      wanderer.handWorld(_gHand)
      if (aim) grapple.throw(_gHand, aim.at, { at: aim.at.clone(), follow: aim.follow })
      else {
        camera.getWorldDirection(_gDir)
        grapple.throw(_gHand, _gHand.clone().addScaledVector(_gDir, GRAPPLE_RANGE * 0.6), null)
      }
      sound.loose()
    }
  }
  if (grapple.attached && wanderer.grounded && !input.held('KeyG')) {
    slackFor += dt
    if (slackFor > 1.2) grapple.release()
  } else slackFor = 0
  // (Taking hold of a giant or a rock face drops the line.)
  if ((climber.active || cliff.active) && grapple.busy) grapple.release()
  if (grapple.busy) grapple.draw(wanderer.handWorld(_gHand))
  if (awakening.active || reveal.active || opening === 'title' || (opening === 'waking' && openT < 2.4)) {
    // Held: you watch. (Gravity and the world go on — and the rock you stand on still holds you.)
    wanderer.step(dt, { x: 0, y: 0 }, false, false, rig.yaw, terrain)
    climber.pushOut(wanderer.pos)
    onRock()
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
    // (An unlit cairn comes before anything lying beside it: on the tallest pillar both share the top.)
    const spot = cairn ? null : spots.near(wanderer.pos, (id) => finds.has(id))
    if (camp.near(wanderer.pos) && input.pressed('KeyE')) {
      wanderer.reachDown()
      sound.pickUp()
      camp.take()
      finds.find('bag')
      tipState.bag = true
      setTimeout(() => narration.say('Folded inside: a map, mostly blank, and an empty notebook. And under them, a coil of rope.'), 2600)
      setTimeout(() => finds.find('line'), 6500)
    } else if (offerings.near(wanderer.pos) && input.pressed('KeyE')) {
      const s = offerings.near(wanderer.pos)!
      const want = CATALOGUE.find((c) => c.id === s.def.wants)
      if (s.answered) narration.say(CATALOGUE.find((c) => c.id === s.def.id)?.text ?? '')
      else if (finds.has(s.def.wants)) {
        offerings.answer(s.def.id)
        sound.resolve([196, 247, 294, 392])
        narration.say(`You hold ${want?.name.toLowerCase() ?? 'it'} over the bowl. The carving above it warms.`)
        setTimeout(() => finds.find(s.def.id), 1800)
      } else narration.say('Carved above the worn bowl: one small thing. You have nothing like it. Not yet.')
    } else if (resonance.near(wanderer.pos) && input.pressed('KeyE')) {
      const r = resonance.near(wanderer.pos)!
      resonance.strike(r.ring, r.stone)
    } else if (spot && input.pressed('KeyE')) {
      if (spot.kind !== 'trinket') {
        // (A page on the ground: you kneel to pick it up and read it.)
        if (spot.kind === 'page') {
          wanderer.reachDown()
          sound.pickUp()
        }
        // Read it (again, if you like).
        if (!finds.find(spot.id)) narration.say(CATALOGUE.find((c) => c.id === spot.id)?.text ?? '')
      } else if (!bag.have && CATALOGUE.find((c) => c.id === spot.id)?.kind !== 'tool' && !inHall(spot.at.x, spot.at.z, 2)) narration.say('You have nothing to carry it in. Not yet.')
      else {
        // (Below, before you have the bag, a small thing goes in a pocket: you wake in the
        // Undercroft, and few would come back down for it.)

        // (A tool goes over your shoulder, bag or no bag: the bow lies in the Undercroft you
        // wake in, and few would come back down for it once out in the light.)
        wanderer.reachDown()
        spots.take(spot.id, () => wanderer.handWorld(handAt))
        sound.pickUp()
        finds.find(spot.id)
      }
    } else if (cairn && input.pressed('KeyE')) {
      // Light the cairn: the beam rises, the land round it is uncovered. (You kneel to the
      // tinder at its foot: an action, not just a light coming on.)
      wanderer.reachDown()
      cairns.light(cairn)
      worldMap.revealAround(cairn.x, cairn.z, 1400)
      sound.chime()
      narration.say(`${cairn.name}. ${CAIRN_LINES[cairns.litCount % CAIRN_LINES.length]}`)
      // The first time you look out from a high place, something answers.
      if (cairns.litCount === 1) setTimeout(() => awakening.begin(camera), 6000)
      // From up here, on a clear enough day, the edge of the world.
      setTimeout(() => finds.find('wall'), 2500)
      // A land's cairns all lit: an ember from them.
      const lit = cairns.save()
      for (const [land, names] of Object.entries(CAIRN_LANDS)) if (names.includes(cairn.name) && names.every((n) => lit.includes(n))) setTimeout(() => finds.find(`ember-${land}`), 4000)
      saveDirty = true
    } else if (input.pressed('KeyE')) {
      chest.set(wanderer.pos.x, wanderer.pos.y + 0.9, wanderer.pos.z)
      climber.tryGrab(chest)
      // No giant within reach: a rock formation or colossus; else the land, if there is a wall to hand.
      if (!climber.active) {
        const solid = rocks.solidAhead(chest, pushYaw())
        if (solid) cliff.startOn(solid.solid, solid.at)
        else {
          const wall = cliff.wallAhead(wanderer.pos, pushYaw(), terrain)
          if (wall) cliff.start(wall.x, wall.z, terrain)
        }
      }
    }
    if (!climber.active && !cliff.active) {
      if (mantle.t >= 0) stepMantle(dt)
      else {
        wanderer.waterLevel = waterAt(wanderer.pos.x, wanderer.pos.z)
        // On the line, Space lets go with a kick (a swing turned into a leap), not a jump.
        const onLine = grapple.attached && !wanderer.grounded
        if (onLine && input.pressed('Space')) {
          grapple.release()
          const f = new THREE.Vector3(wanderer.vel.x, 0, wanderer.vel.z)
          if (f.lengthSq() > 0.01) f.setLength(3)
          wanderer.vel.add(f).add(new THREE.Vector3(0, 6, 0))
        }
        wanderer.step(dt, input.axes(), input.held('ShiftLeft') || input.held('ShiftRight'), input.held('Space') && !onLine, rig.yaw, terrain)
        if (grapple.busy) {
          const ev = grapple.step(dt, wanderer.pos, wanderer.vel, input.held('KeyG') && grapple.attached, wanderer.grounded)
          if (ev === 'caught') sound.ui('tick')
          // Reeled in to a giant: you take hold of it where the hook bit (and start climbing).
          if (grapple.attached && grapple.anchor?.follow && wanderer.pos.distanceTo(grapple.anchor.at) < 3.5) {
            chest.set(wanderer.pos.x, wanderer.pos.y + 0.9, wanderer.pos.z)
            if (climber.tryGrab(chest)) {
              grapple.release()
              tipState.climbed = true
            }
          }
          if (grapple.attached && wanderer.pos.y > terrain.heightAt(wanderer.pos.x, wanderer.pos.z) + 0.4) wanderer.grounded = false
        }
        wanderer.hanging = grapple.attached && !wanderer.grounded
        climber.pushOut(wanderer.pos)
        onRock()
        if (wanderer.grounded) cliff.rest(dt)
        tryMantle(dt)
      }
    }
  }

  if (wild) herd.step(dt)
  if (wild) firstContact()
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
      // Your first climb (until you let go, having been high on it): the giant you hold
      // lets you — no stomps, and an amble, not its full stride. A newcomer on
      // its shin was shaken off within seconds when it set off.
      const firstClimb = climber.active && climber.target?.id === id && !firstClimbDone
      climber.gentle = !firstClimbDone
      if (firstClimb) inp = { ...o, forward: o.forward * 0.4 }
      if (firstClimb) t.gait.stompArmed = false
      else if (o.stomp) t.gait.stompArmed = true
      if (o.call) sound.call(Math.hypot(camera.position.x - t.gait.x, camera.position.z - t.gait.z))
    }
    // A horn's call overrides its own wandering for a while.
    inp = hornInput(id, t) ?? inp
    gaitEvents.length = 0
    t.step(dt, inp, gaitEvents)
    for (const ev of gaitEvents) {
      // Apply exactly what is saved (positions rounded to the millimetre), so
      // a reloaded world is the same to the last digit.
      const packed = packEvent(ev as unknown as { type: string } & Record<string, unknown>)
      const exact = packed ? (unpackEvent(packed) as GaitEvent) : ev
      onGait(exact, false, id)
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

/** Has this session's first real climb ended (let go after being 150 m up)? Until then giants go gently. */
let firstClimbDone = false

/** Let go of the giant: fall with its motion plus a push off the rock. */
function letGo(push: number): void {
  if (tipState.high >= 150) firstClimbDone = true
  const v = climber.release(push)
  const w = climber.world
  wanderer.place(w.x + climber.normal.x * 0.6, w.y + climber.normal.y * 0.6, w.z + climber.normal.z * 0.6)
  wanderer.vel.copy(v)
  wanderer.grounded = false
}

const body = new THREE.Vector3()

/** The water's surface over (x, z) — a lake or a marsh pool — or NaN where it is dry. */
function waterAt(x: number, z: number): number {
  const l = lakes.levelAt(x, z)
  if (!Number.isNaN(l)) return l
  const m = mireView.levelAt(x, z)
  return Number.isNaN(m) ? sea.levelAt(x, z) : m
}

/** What you are standing on (for your footsteps). */
function surfaceAt(p: THREE.Vector3): Surface {
  const w = waterAt(p.x, p.z)
  if (!Number.isNaN(w) && w > p.y + 0.05) return 'water'
  if (wanderer.onStone || inHall(p.x, p.z, 0.5)) return 'stone'
  const land = terrain.base.regions.name(p.x, p.z)
  if (land === 'desert') return 'sand'
  // (The High Places' snow: soft underfoot, and it keeps your prints.)
  if (highSector(p.x, p.z) > 0.5 && p.y > HIGH.top - 60) return 'sand'
  if (biome.mire(p.x, p.z) > 0.55) return 'mud'
  const g = Math.hypot(terrain.heightAt(p.x + 0.5, p.z) - terrain.heightAt(p.x - 0.5, p.z), terrain.heightAt(p.x, p.z + 0.5) - terrain.heightAt(p.x, p.z - 0.5))
  return g > 0.9 ? 'stone' : 'grass'
}
const prints = new Prints()
scene.add(prints.mesh)
const snowPrints = new Prints(new THREE.Color(0.42, 0.5, 0.62))
scene.add(snowPrints.mesh)
// The grappling line (comes with the bag: a coil of rope and an iron hook).
const grapple = new Grapple()
scene.add(grapple.line)
const _gFrom = new THREE.Vector3()
const _gDir = new THREE.Vector3()
const _gHand = new THREE.Vector3()
let slackFor = 0
/** Where the line would catch along the view: rock, the ground, or a giant (and which part). */
function grappleAim(): { at: THREE.Vector3; follow: { obj: THREE.Object3D; local: THREE.Vector3 } | null } | null {
  camera.getWorldDirection(_gDir)
  _gFrom.copy(camera.position)
  const p = new THREE.Vector3()
  // (From the camera, out to the line's range measured from you.)
  const reach = camera.position.distanceTo(wanderer.pos) + GRAPPLE_RANGE
  // (Not before you: from behind your shoulder the ray first crosses the ground at your feet.)
  const skip = camera.position.distanceTo(wanderer.pos) + 2
  for (let t = skip; t < reach; t += 0.75) {
    p.copy(_gFrom).addScaledVector(_gDir, t)
    for (const a of titans.values()) {
      if (a.titan.roughSdf(p.x, p.y, p.z) < 0) {
        // The part it caught: the nearest one's frame.
        let best: THREE.Object3D | null = null
        let bd = Infinity
        for (const part of a.titan.parts) {
          const d = part.mesh.getWorldPosition(new THREE.Vector3()).distanceTo(p)
          if (d < bd) {
            bd = d
            best = part.mesh
          }
        }
        if (!best) return null
        return { at: p.clone(), follow: { obj: best, local: best.worldToLocal(p.clone()) } }
      }
    }
    if (p.y < terrain.heightAt(p.x, p.z) || rocks.sdfAt(p.x, p.y, p.z) < 0) {
      return p.distanceTo(wanderer.pos) <= GRAPPLE_RANGE ? { at: p.clone(), follow: null } : null
    }
  }
  return null
}
wanderer.onStep = (pace) => {
  const surf = surfaceAt(wanderer.pos)
  sound.step(surf, pace)
  // Wading: each footfall rings the water.
  if (surf === 'water') {
    const wl = waterAt(wanderer.pos.x, wanderer.pos.z)
    if (!Number.isNaN(wl)) wake.step(wanderer.pos.x, wl, wanderer.pos.z, pace)
  }
  // In sand, mud or snow, you leave prints (blue-grey hollows in snow).
  const snow = highSector(wanderer.pos.x, wanderer.pos.z) > 0.5 && wanderer.pos.y > HIGH.top - 60
  if (surf === 'sand' || surf === 'mud') (snow ? snowPrints : prints).step(wanderer.pos.x, terrain.heightAt(wanderer.pos.x, wanderer.pos.z), wanderer.pos.z, wanderer.yaw, surf === 'sand' ? 1 : 0.8)
  // Running on loose ground, each footfall kicks up a little dust behind you.
  const loose = snow ? 0 : surf === 'sand' ? 1 : surf === 'grass' && biome.desert(wanderer.pos.x, wanderer.pos.z) > 0.2 ? 0.4 : 0
  if (loose > 0 && pace > 0.5) effects.kick(wanderer.pos.x, wanderer.pos.y, wanderer.pos.z, wanderer.vel.x, wanderer.vel.z, loose * pace)
}

// Mantling (user, 2026-11-01: "getting stuck in small cliffs which should be
// climbable"). Push on into a ledge you could pull yourself onto — its top up to
// chest-and-a-bit above your feet, room to stand on it — and you do: a hand on
// the edge, up, and over. Taller than that is a real climb (E).
const MANTLE_MIN = 0.4
const MANTLE_MAX = 2.5
const mantle = { t: -1, len: 0, push: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), dir: new THREE.Vector3() }

/** A ledge top ahead of you (facing `yaw`) to pull yourself onto, or null. */
function ledgeAhead(yaw: number): THREE.Vector3 | null {
  const p = wanderer.pos
  const dx = Math.sin(yaw)
  const dz = Math.cos(yaw)
  // Is anything in the way at all? (A riser in the land, or rock at your knees.)
  const ax = p.x + dx * 0.7
  const az = p.z + dz * 0.7
  const riser = terrain.heightAt(ax, az) - p.y > 0.35
  const rock = rocks.sdfAt(p.x + dx * 0.6, p.y + 0.6, p.z + dz * 0.6) < 0.4
  if (!riser && !rock) return null
  for (const d of [0.7, 1.0, 1.35, 1.75]) {
    const x = p.x + dx * d
    const z = p.z + dz * d
    const land = terrain.heightAt(x, z)
    const stone = rocks.floorAt(x, p.y + MANTLE_MAX + 0.3, z, 0.3, MANTLE_MAX + 0.2)
    const top = Math.max(land, stone ?? -Infinity)
    const rise = top - p.y
    if (rise > MANTLE_MAX) return null // a wall: climb it
    if (rise < MANTLE_MIN) continue
    // Somewhere to stand: level enough (the land) and room for you above it.
    if (top === land) {
      const g = Math.hypot(terrain.heightAt(x + 0.4, z) - terrain.heightAt(x - 0.4, z), terrain.heightAt(x, z + 0.4) - terrain.heightAt(x, z - 0.4)) / 0.8
      if (g > MAX_SLOPE * 0.85) continue
    }
    if (rocks.sdfAt(x, top + 1.0, z) < 0.35 || rocks.sdfAt(x, top + 1.7, z) < 0.35) continue
    return new THREE.Vector3(x, top, z)
  }
  return null
}

/**
 * Which way you mean to go: the way you push (WASD about the camera), else the
 * way you face. Sliding back down the scree at a cliff's foot turns you to face
 * downhill — looking for the wall that way found none (no prompt, E did nothing).
 */
function pushYaw(): number {
  const ax = input.axes()
  if (Math.hypot(ax.x, ax.y) < 0.3) return wanderer.yaw
  const wx = -Math.sin(rig.yaw) * ax.y + Math.cos(rig.yaw) * ax.x
  const wz = -Math.cos(rig.yaw) * ax.y - Math.sin(rig.yaw) * ax.x
  return Math.atan2(wx, wz)
}

/** Pushed up against rock you could take hold of (for the prompt): a land cliff or a solid. */
let wallSeen = { at: 0, yes: false }
function wallToClimb(): boolean {
  if (mantle.push < 0.3 || !wanderer.grounded) return false
  const now = performance.now()
  if (now - wallSeen.at > 250) {
    chest.set(wanderer.pos.x, wanderer.pos.y + 0.9, wanderer.pos.z)
    const yaw = pushYaw()
    wallSeen = { at: now, yes: !!(cliff.wallAhead(wanderer.pos, yaw, terrain) || rocks.solidAhead(chest, yaw)) }
  }
  return wallSeen.yes
}

/**
 * Vertigo (CHECKLIST, dread by height): standing at the lip of a long drop — a mesa's edge, a
 * cliff top, a giant's shoulders — the view widens a little and breathes, a faint sway, and the
 * wind rises. 0 … 1, eased (it comes on over a couple of seconds, lets go a little faster).
 */
let vertigo = 0
let vertigoT = 0
let vertigoSeen = { at: 0, want: 0 }
function vertigoWant(): number {
  const now = performance.now()
  if (now - vertigoSeen.at < 250) return vertigoSeen.want
  let want = 0
  if (climber.active && climber.standing) {
    // On a giant: how high above the land you stand.
    const h = climber.world.y - terrain.heightAt(climber.world.x, climber.world.z)
    want = 0.8 * THREE.MathUtils.smoothstep(h, 60, 200)
  } else if (wanderer.grounded && !climber.active && !cliff.active && !wanderer.swimming) {
    // On your feet: the deepest drop round you (eight ways, out to 9 m) where the land falls
    // away steeply — a cliff's lip, not a hillside — and no rock holds you near your height.
    // (Cliffs here are steep slopes, not sheer: 2 m out the escarpment is only a few metres down.)
    const p = wanderer.pos
    let drop = 0
    for (let k = 0; k < 8; k++) {
      const cx = Math.cos(k * 0.785)
      const cz = Math.sin(k * 0.785)
      if (rocks.floorAt(p.x + cx * 2, p.y + 0.5, p.z + cz * 2, 0.6, 3) !== null) continue
      for (const d of [2.5, 5, 9]) {
        const below = p.y - terrain.heightAt(p.x + cx * d, p.z + cz * d)
        if (below > d * 1.2) drop = Math.max(drop, below)
      }
    }
    want = THREE.MathUtils.smoothstep(drop, 10, 60)
  }
  vertigoSeen = { at: now, want }
  return want
}

/** Close enough to a giant to take hold (for the prompt; looked at four times a second). */
let giantSeen = { at: 0, yes: false }
function giantToHold(): boolean {
  if (!wanderer.grounded && !wanderer.swimming) return false
  const now = performance.now()
  if (now - giantSeen.at > 250) {
    chest.set(wanderer.pos.x, wanderer.pos.y + 0.9, wanderer.pos.z)
    giantSeen = { at: now, yes: climber.inReach(chest) }
  }
  return giantSeen.yes
}

/** After a step on your feet: pushing into a ledge for a moment, you take it. */
function tryMantle(dt: number): void {
  const ax = input.axes()
  const pushing = (wanderer.grounded || wanderer.swimming) && !wanderer.gliding && Math.hypot(ax.x, ax.y) > 0.5 && bow.draw < 0.05
  // Pushing but barely moving, or sliding back: blocked.
  const blocked = pushing && (wanderer.sliding || wanderer.speed < (wanderer.swimming ? 0.8 : 1.2))
  mantle.push = blocked ? mantle.push + dt : 0
  if (mantle.push < 0.12) return
  const to = ledgeAhead(wanderer.yaw)
  if (!to) return
  const rise = to.y - wanderer.pos.y
  mantle.t = 0
  mantle.len = 0.32 + rise * 0.24
  mantle.push = 0
  mantle.from.copy(wanderer.pos)
  mantle.to.copy(to)
  mantle.dir.set(to.x - wanderer.pos.x, 0, to.z - wanderer.pos.z).normalize()
  sound.scramble(rise)
}

/** Up and over: the body rises first (hands on the edge), then comes forward onto the top. */
function stepMantle(dt: number): void {
  mantle.t += dt
  const k = Math.min(1, mantle.t / mantle.len)
  const up = THREE.MathUtils.smoothstep(k, 0, 0.62)
  const over = THREE.MathUtils.smoothstep(k, 0.35, 1)
  const p = wanderer.pos
  p.x = mantle.from.x + (mantle.to.x - mantle.from.x) * over
  p.z = mantle.from.z + (mantle.to.z - mantle.from.z) * over
  p.y = mantle.from.y + (mantle.to.y + 0.05 - mantle.from.y) * up
  wanderer.vel.set(0, 0, 0)
  wanderer.grounded = true
  wanderer.yaw = Math.atan2(mantle.dir.x, mantle.dir.z)
  if (k >= 1) {
    mantle.t = -1
    onRock()
    // Carry on walking out of it.
    wanderer.vel.set(mantle.dir.x * 2.5, 0, mantle.dir.z * 2.5)
  }
}
/** Rock formations: walls push the wanderer out; ledges, arch tops and cave floors hold them up. */
function onRock(): void {
  const p = wanderer.pos
  body.set(p.x, p.y + 0.9, p.z)
  if (rocks.pushOut(body)) p.set(body.x, body.y - 0.9, body.z)
  wanderer.onStone = false
  if (wanderer.vel.y > 0.5) return // leaving the ground in a jump
  const floor = rocks.floorAt(p.x, p.y, p.z)
  if (floor !== null && floor > terrain.heightAt(p.x, p.z) - 0.05) {
    p.y = floor
    wanderer.vel.y = 0
    wanderer.grounded = true
    wanderer.onStone = true
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

/** The main thread's work per frame, the last 1200 (ms; tools read it to find hitches). */
const work: number[] = []
function frame(now: number): void {
  if (isBroken()) return
  requestAnimationFrame(frame)
  try {
    frameBody(now)
  } catch (err) {
    crash(err, `frame (${opening})`)
  }
}

// QA (?qa=throw): a frame breaks on purpose 8 s in, to prove the card and that the save survives.
let qaThrowAt = params.get('qa') === 'throw' ? 8000 : 0

function frameBody(now: number): void {
  if (qaThrowAt && now > qaThrowAt) {
    qaThrowAt = 0
    throw new Error('qa: a frame broken on purpose')
  }
  if (document.hidden) {
    last = now
    return
  }
  const t0 = performance.now()
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  // (Paused: the world waits.)
  acc += dt * clock.scale * (pause.open ? 0 : 1)
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
  // The Ones Beyond stay lost in the haze while you are down in the dell you wake in (at
  // 30 km and 9.5 km tall no rise can hide them; out of the stair you saw everything at
  // once). The first time you are out over its rim they come out of it, and stay.
  const dellD = Math.hypot(wanderer.pos.x - DELL.x, wanderer.pos.z - DELL.z)
  if (dellD < 520 && opening === 'done') wasInDell = true
  if (!skylineOn && (dellD > 560 || awakening.active || tipState.high >= 150)) {
    skylineOn = true
    // Up out of the dell the first time on foot: the land opens, and they are there.
    // (Once: not on every load somewhere else.)
    let said = false
    if (wasInDell && !awakening.active && wanderer.grounded && !toolMode) {
      try {
        said = localStorage.getItem('titans-over-the-rise') === '1'
        localStorage.setItem('titans-over-the-rise', '1')
      } catch {
        /* (no storage: say it this once) */
      }
    }
    if (wasInDell && !said && !awakening.active && wanderer.grounded && !toolMode) {
      setTimeout(() => narration.say('Over the rise the Green opens out, on and on. And beyond the mountains, taller than the mountains, things are standing in the haze.'), 4000)
    }
  }
  const sk = Math.min(1, Math.max(0, skyline + (skylineOn ? dt : -dt) / 20))
  if (sk !== skyline || skylineMats.length === 0) {
    skyline = sk
    if (skylineMats.length === 0) {
      for (const t of farGiants) t.group.traverse((o) => {
        const m = (o as THREE.Mesh).material
        if ((o as THREE.Mesh).isMesh && m && !Array.isArray(m) && !skylineMats.includes(m)) skylineMats.push(m)
      })
    }
    // Out of the haze, literally: while it fades in it is lit like the fog (an emissive of the
    // fog's colour, its own colour scaled away), and its own darkness comes up through it.
    // (Faded by opacity it was a giant of blue glass; dithered, a speckled ghost.)
    for (const m of skylineMats as THREE.MeshStandardMaterial[]) {
      if (!m.color || !m.emissive) continue
      let base = skylineBase.get(m)
      if (!base) {
        base = m.color.clone()
        skylineBase.set(m, base)
      }
      m.color.copy(base).multiplyScalar(sk)
      m.emissive.copy(sky.fog.color).multiplyScalar(0.9 * (1 - sk))
    }
    for (const t of farGiants) t.group.visible = sk > 0
  }
  if (Math.abs(camera.position.z - SHORE.waderD) < 9000) stepWader(dt)
  wader.showArmor(Math.hypot(camera.position.x - wader.gait.x, camera.position.z - wader.gait.z) < 3000)
  frozen.update(dt, terrain, camera.position)
  for (const t of [...farGiants, ...herd.giants, wader]) {
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
  // What is in your hands: the tool in use (the pose and the prop follow), and the toolbar.
  wanderer.holding = bow.draw > 0.05 ? 'bow' : performance.now() < hornHeldUntil ? 'horn' : glyphs.look > 0.05 ? 'sight' : null
  toolbar.update(wanderer.holding ?? (wanderer.gliding ? 'cloak' : grapple.busy ? 'line' : null))
  // The keys for the map, the journal and the bag show once you have the bag (the map and the notebook are in it).
  hud.setHave(toolMode || bag.have)
  wanderer.hasBag = toolMode || bag.have
  document.body.classList.toggle('early', !toolMode && tipState.moved < 25)
  if (finds.unseen.size) {
    let j = false
    let b = false
    for (const id of finds.unseen) {
      const k = CATALOGUE.find((c) => c.id === id)?.kind
      if (k === 'place' || k === 'giant' || k === 'lore' || k === 'strange') j = true
      else if (id !== 'bag') b = true
    }
    hud.news(j, b)
  } else hud.news(false, false)
  wanderer.animate(dt, groundAt, clothWind, Math.max(weather.now.dark, sky.night, sky.dusk * 0.8, inHall(wanderer.pos.x, wanderer.pos.z) && wanderer.pos.y < terrain.base.hallTop - 10 ? 1 : 0))
  water.sync(lakes.lakes, (x, z) => terrain.heightAt(x, z))
  water.syncStreams(dt, lakes, (x, z) => terrain.heightAt(x, z))
  water.update(dt)
  water.weather(weather.now.dark, weather.now.rain, [sea.mesh.material as THREE.MeshStandardMaterial])
  sea.update(dt, camera.position)
  wake.update(dt, wanderer.swimming, wanderer.pos, wanderer.waterLevel, wanderer.speed)
  // The air going past: gliding at speed, or falling (from about a 4 m drop on).
  const fallV = wanderer.grounded || wanderer.swimming ? 0 : Math.max(0, -wanderer.vel.y)
  sound.rush(wanderer.gliding ? (wanderer.airspeed - 6) / 30 : (fallV - 7) / 25)
  effects.update(dt)
  clouds.update(dt, camera.position)
  birdSpots.length = 0
  for (const l of lakes.lakes) if (l.basin.sorted.length > 400 && l.level > l.basin.bottom + 0.5) birdSpots.push({ x: l.basin.bx, z: l.basin.bz })
  for (const [, c] of colossi.places) birdSpots.push({ x: c.x, z: c.z })
  // Seabirds wheeling over the beach.
  for (const a of SHORE_BIRDS) birdSpots.push({ x: Math.sin(a) * (SHORE.coast - 80), z: Math.cos(a) * (SHORE.coast - 80), pale: true })
  birds.step(dt, camera.position, birdSpots)
  birds.render()
  sky.tick(dt)
  sky.advance(dt)
  weather.part = awakening.reveal
  weather.desert = biome.desert(camera.position.x, camera.position.z)
  weather.high = highSector(camera.position.x, camera.position.z) * THREE.MathUtils.smoothstep(camera.position.y, HIGH.top - 200, HIGH.top - 40)
  weather.mire = biome.mire(camera.position.x, camera.position.z)
  weather.update(dt, camera)
  // The night is dark, but not so dark you cannot walk in it by the moon: open the eye a little.
  // (The eye opens as the light goes: the low-sun hours and the night are not just darker days.)
  // (With the dusk too, not only the deep night: between sunset and the moon taking over the key
  // light, twilight measured ~20% darker than midnight — the darkest moment of the day.)
  post.grade.uniforms.exposure.value = 0.84 + 0.42 * Math.max(sky.night, sky.dusk * 0.85) + 0.34 * sky.glow
  undercroft.update(sky.sun.intensity / 3)
  mapGiants.length = 0
  for (const a of titans.values()) mapGiants.push({ x: a.titan.gait.x, z: a.titan.gait.z })
  worldMap.update(dt, wanderer.pos, wanderer.yaw, mapGiants, lakes.lakes)
  clouds.tint(weather.now.dark, sky.night, sky.dusk)
  // Mist lies thickest in the hollows at dawn and at dusk.
  const t = sky.time
  const dawnMist = Math.max(1 - Math.abs(t - 0.17) / 0.08, 1 - Math.abs(t - 0.88) / 0.05, 0) * 0.9
  mist.update(sky.fog.color, sky.sunDir, Math.max(weather.now.dark, dawnMist))
  {
    const cx = camera.position.x
    const cz = camera.position.z
    motes.update(dt, camera, renderer.domElement.height, sky.sun, sky.sunDir, sky.fog.color, {
      desert: biome.desert(cx, cz),
      forest: biome.forest(cx, cz),
      open: biome.open(cx, cz),
      above: camera.position.y - terrain.heightAt(cx, cz),
      wind: weather.now.wind,
      // (Under water, none: the murk is its own air.)
      // (In the Dune Sea a storm's "rain" is sand: that is when the air is fullest of it.)
      rain: Math.max(weather.now.rain * (1 - biome.desert(cx, cz)), post.grade.uniforms.under.value as number),
      night: sky.night,
      indoors: inHall(cx, cz) && camera.position.y < terrain.base.hallTop - 10 ? 1 : 0,
    })
  }
  // (At a long drop the wind rises: vertigo is heard as much as seen.)
  sound.mood(weather.now.dark, weather.now.rain, Math.min(1, weather.now.wind + 0.45 * vertigo), awe())
  vegetation.update(dt, camera.position)
  grass.update(dt, camera.position, wanderer.pos, weather.now.wind)
  rocks.update(camera.position)
  cairns.update(dt)
  camp.update(dt, weather.now.wind)
  for (const c of travellerCamps) c.update(dt, weather.now.wind, camera)
  spots.update(dt, camera)
  prints.update(dt)
  snowPrints.update(dt)
  eyes.update(camera)
  dread.update(dt, dreadWorld(), terrain)
  mireView.update(camera.position)
  {
    const heads: Array<{ at: THREE.Vector3; H: number }> = []
    for (const a of titans.values()) heads.push({ at: a.titan.head, H: a.titan.H })
    heads.push({ at: herd.giants[0].head, H: herd.giants[0].H })
    const dusk = Math.max(sky.dusk, sky.night)
    ambience.update(dt, camera.position, dusk, 1 - dusk, weather.now.rain, heads, { pos: wanderer.pos, speed: wanderer.speed, yaw: wanderer.yaw })
    const here = lush(wanderer.pos.x, wanderer.pos.z)
    // (Frogs where it is wet: the Mire most of all.)
    sound.ambience(Math.max(sky.night, sky.dusk * 0.7), 1 - sky.dusk, weather.now.rain, here, Math.min(1, here * 0.4 + wetland(wanderer.pos.x, wanderer.pos.z) * 1.6))
  }
  wisps.update(dt, wanderer.pos)
  bell.update(dt)
  eerie.update(dt)
  {
    // Their sounds; and near the Circle, the land falls silent.
    const n = eerie.near(wanderer.pos.x, wanderer.pos.z)
    sound.eerie(n.pit, n.hanged)
    {
      // The Shore's waves within ~1.5 km of the water's edge; the High Places' wind up on the plateau.
      const p = camera.position
      const dc = Math.abs(Math.hypot(p.x, p.z) - SHORE.coast)
      const shoreK = seaward(p.x, p.z) || shoreSector(p.x, p.z) > 0.5 ? 1 - THREE.MathUtils.smoothstep(dc, 300, 1600) : 0
      const highK = highSector(p.x, p.z) * THREE.MathUtils.smoothstep(p.y, HIGH.top - 260, HIGH.top - 20)
      sound.lands(shoreK, highK)
    }
    const silent = n.circle > 0.5
    if (silent !== circleSilent && dread.now !== 'stillness') {
      circleSilent = silent
      sound.still(silent)
    }
  }
  glyphs.update(dt, finds.has('sight') && input.held('KeyV') && !climber.active && !journal.open && !bag.open, wanderer.pos, crownWind.value)
  {
    const has = finds.has('bow')
    const drawing = has && !climber.active && !cliff.active && !awakening.active && !journal.open && !bag.open && (input.held('Mouse2') || input.held('KeyQ'))
    const loose = has && (input.clicked() || input.pressed('KeyF'))
    camera.getWorldDirection(aimFwd)
    bow.update(dt, drawing, loose, wanderer.pos.clone().add(new THREE.Vector3(0, 1.45, 0)).addScaledVector(aimFwd, 0.5), camera, arrowHit, pick)
  }
  resonance.update(dt)
  visitClock -= dt
  if (visitClock <= 0 && ready && opening !== 'title' && opening !== 'waking' && opening !== 'reveal' && (opening !== 'hall' || tipState.moved > 25)) {
    visitClock = 0.5
    visit(sites, finds, wanderer.pos.x, wanderer.pos.z)
  }
  // What E would do here.
  const free = !climber.active && !cliff.active
  const spotNear = free && !cairns.near(wanderer.pos) ? spots.near(wanderer.pos, (id) => finds.has(id)) : null
  const html =
    free && camp.near(wanderer.pos)
      ? `<kbd>E</kbd>Take the bag`
      : free && offerings.near(wanderer.pos)
        ? `<kbd>E</kbd>${offerings.near(wanderer.pos)!.answered ? 'Listen' : finds.has(offerings.near(wanderer.pos)!.def.wants) ? 'Hold it over the bowl' : 'Look at the carving'}`
        : free && resonance.near(wanderer.pos)
        ? `<kbd>E</kbd>Strike the stone`
        : spotNear
          ? `<kbd>E</kbd>${spotNear.kind === 'stone' ? 'Read the stone' : spotNear.kind === 'page' ? 'Read the page' : 'Pick it up'}`
        : free && cairns.near(wanderer.pos)
          ? `<kbd>E</kbd>Light the cairn`
          : free && giantToHold()
            ? `<kbd>E</kbd>Take hold`
          : free && wallToClimb()
            ? `<kbd>E</kbd>Climb${finds.has('line') ? ' · <kbd>G</kbd>Throw the line' : ''}`
          : grapple.attached && !wanderer.grounded
            ? `<kbd>G</kbd>Haul in · <kbd>Space</kbd>Let go`
          : watchProgress > 0.08
            ? `Watching… <span class="dots">${'●'.repeat(Math.ceil(watchProgress * 5))}${'○'.repeat(5 - Math.ceil(watchProgress * 5))}</span>`
            : ''
  if (html !== promptHtml) {
    promptHtml = html
    promptEl.innerHTML = html
    promptEl.style.display = html ? 'block' : 'none'
  }
  crownWind.value += dt
  rocks.animate(crownWind.value)
  wildlife.render()
  hud.setMode(climber.active || cliff.active ? 'climbing' : wanderer.gliding ? 'flying' : 'wanderer')
  hud.settle(dt, wanderer.speed > 0.5 || climber.moving > 0 || wanderer.gliding, tipState.high >= 150)
  hud.setGrip(climber.active ? climber.stamina : cliff.active ? cliff.stamina : null)

  const look = input.consumeLook()
  // (On a giant or a rock face the camera's focus stands off the surface, out along the hold.)
  const focus = climber.active || cliff.active ? _focus.copy(wanderer.obj.position).addScaledVector(climber.active ? climber.normal : cliff.normal, 2) : wanderer.obj.position
  if (freeCam) {
    camera.position.copy(freeCam.from)
    camera.lookAt(freeCam.at)
  } else {
    // Riding: standing on a walking giant's back — the camera pulls back and up and turns,
    // slowly, to look the way it walks (until you look about yourself).
    const ridden = climber.active ? heldAwake() : undefined
    const riding = !!ridden && ridden.gait.speed > 0.4
    rig.blendTo(riding ? RIDE_CAM : WANDERER_CAM)
    rig.ease(dt)
    if (riding && Math.abs(look.dx) < 1) {
      let dy = ridden!.gait.heading + Math.PI - rig.yaw
      dy = Math.atan2(Math.sin(dy), Math.cos(dy))
      rig.yaw += dy * Math.min(1, dt * 0.35)
      // …and from a little above, looking down over the land going by.
      if (Math.abs(look.dy) < 1) rig.pitch += (0.32 - rig.pitch) * Math.min(1, dt * 0.5)
    }
    rig.update(dt, awakening.active ? 0 : look.dx, awakening.active ? 0 : look.dy, awakening.active ? 0 : look.wheel, focus, terrain)
    // In flight the camera swings round behind you (you steer the body, not the view).
    if (wanderer.gliding) {
      let dy = wanderer.yaw + Math.PI - rig.yaw
      dy = Math.atan2(Math.sin(dy), Math.cos(dy))
      rig.yaw += dy * Math.min(1, dt * 2.2)
    }
    // Drawing the bow: the camera comes in over the right shoulder, the view narrows, you face where you aim.
    if (bow.draw > 0 && !awakening.active) {
      camera.getWorldDirection(aimFwd).setY(0).normalize()
      // (Low and close, a little to the right: your hood and shoulder in the corner of the view.)
      const shoulder = wanderer.pos.clone().add(new THREE.Vector3(-aimFwd.z * 0.72, 1.5, aimFwd.x * 0.72)).addScaledVector(aimFwd, -1.55)
      camera.position.lerp(shoulder, bow.draw * 0.9)
      wanderer.yaw = Math.atan2(aimFwd.x, aimFwd.z)
    }
    // The scale director: how big what fills your sky is, shown through the lens and the camera.
    camera.getWorldDirection(aimFwd)
    const sc = scaleDir.update(
      dt,
      gatherBig(),
      _eye.copy(wanderer.pos).setY(wanderer.pos.y + 1.6),
      aimFwd,
      Math.abs(look.dx) + Math.abs(look.dy),
      wanderer.speed < 0.4,
      rig.pitch,
      wanderer.grounded && !climber.active && !cliff.active && bow.draw < 0.05,
    )
    rig.drop = sc.drop
    rig.distMul = sc.dist
    if (sc.pitch !== null && !awakening.active) rig.pitch += (sc.pitch - rig.pitch) * Math.min(1, dt * 0.55)
    // A giant near you casts its shadow over you: the shadow map reaches out to it.
    const dom = scaleDir.dominant
    const wantR = dom && dom.dist < 1400 ? Math.min(1100, Math.max(260, dom.dist + (dom.thing.top - dom.thing.base) * 1.4)) : 260
    shadowR += (wantR - shadowR) * Math.min(1, dt * 0.5)
    sky.setShadowRadius(Math.round(shadowR / 20) * 20)
    // The long run widens the view a little: speed you feel at the edges.
    if (!awakening.active) {
      const w = vertigoWant()
      vertigo += (w - vertigo) * Math.min(1, dt * (w > vertigo ? 0.6 : 1.2))
      vertigoT += dt
      const fov = 58 + 7 * wanderer.lope - 14 * bow.draw + sc.fov + vertigo * (4 + 2 * Math.sin(vertigoT * 0.5))
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
      // (The rig sets the camera afresh each frame: a roll added here is only ever this frame's.)
      if (vertigo > 0.01) camera.rotateZ(Math.sin(vertigoT * 0.7) * Math.sin(vertigoT * 0.29 + 1) * 0.016 * vertigo)
    }
    // The opening: waking (the camera low on the stone, looking up at the light, rising as you
    // stand), the hall, and the reveal when you first step out onto the grass.
    if (opening === 'waking') {
      const was = openT
      openT += dt
      const k = THREE.MathUtils.smoothstep(openT, 0, 4.5)
      rig.drop = sc.drop + 1.0 * (1 - k)
      if (openT < 4.5) rig.pitch = -0.3 + 0.42 * k
      if (was < 1.4 && openT >= 1.4) narration.say('You wake on cold stone, in the dark. Far above, light comes through a hole in the roof.')
      if (openT >= 4.5) opening = 'hall'
    } else if (opening === 'hall' && wanderer.grounded && wanderer.pos.y > terrain.base.hallTop - 1.2) {
      // Up the stair into the light (the hint to find the way up is done)…
      tipState.out = true
    }
    if (opening === 'hall' && wanderer.grounded && !inHall(wanderer.pos.x, wanderer.pos.z, 5)) {
      // …and off the stone onto the grass for the first time: the land, shown.
      opening = 'reveal'
      tipState.out = true
      // One of them walking the Green (they are what you came to see); failing
      // that, the Sentinel kneeling at its far rim.
      const sen = colossi.places.get('sentinel') ?? new THREE.Vector3(0, 0, -1600)
      const target = sen.clone().setY(sen.y + 210)
      // (The one striding fastest, within reach of the eye: the Grey One ambling at 3 m/s,
      // hunched and mossy and seen from behind 1.3 km off, read as a rock pillar. A giant
      // crossing the land at a stride is what tells you it is alive.)
      let best = -1
      let near = 4500
      for (const a of titans.values()) {
        const d = a.titan.chest.distanceTo(wanderer.pos)
        const pace = a.titan.gait.resting || d > 2500 ? 0 : a.titan.gait.speed
        if (pace > best + 0.5 || (Math.abs(pace - best) <= 0.5 && d < near)) {
          best = pace
          near = d
          target.copy(a.titan.chest)
        }
      }
      if (near >= 4500) target.copy(sen).setY(sen.y + 210)
      reveal.begin(wanderer.pos.clone(), target, (x, z) => terrain.heightAt(x, z), (x, z) => (inHall(x, z, 2) ? 4 : 0) + (vegetation.treeNear(x, z, 7) ? 1 : 0))
      sound.chime()
    }
    if (reveal.active) reveal.update(dt, camera, camera.fov)
    else if (opening === 'reveal') {
      // (Named once the shot is over: the card would sit right across what it shows.)
      opening = 'done'
      saveDirty = true
      finds.find('green')
    }
    // An awakening takes the camera's gaze (the rig still keeps its place).
    if (skylineOn) awakening.update(dt, camera)
    // The camera keeps above water (you swim with your head up; the view should too).
    const wl = waterAt(camera.position.x, camera.position.z)
    if (!Number.isNaN(wl) && camera.position.y < wl + 0.3 && wanderer.pos.y + 1.5 > wl) camera.position.y = wl + 0.3
  }
  // …and if it is under all the same (sunk, or the water came up over it), the murk.
  {
    const wl = waterAt(camera.position.x, camera.position.z)
    const want = !Number.isNaN(wl) && camera.position.y < wl ? 1 : 0
    const u = post.grade.uniforms.under
    u.value += (want - u.value) * Math.min(1, dt * 8)
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
  work.push(performance.now() - t0)
  if (work.length > 1200) work.shift()

  if (!ready && terrainView.settled()) {
    ready = true
    // Compile every shader now, behind the title (user: "game hitches" — the first sight of
    // the water, a colossus, the bow, the fireflies at dusk each stalled a frame compiling
    // its program). Again a little later, for what is still being built then.
    const warm = () => renderer.compileAsync(scene, camera).catch(() => {})
    if (!params.has('nowarm')) {
      warm()
      setTimeout(warm, 15000)
      setTimeout(warm, 60000)
    }
    if (opening === 'title')
      hud.titleReady(() => {
        hud.loaded()
        canvas.requestPointerLock?.()
        opening = 'waking'
        openT = 0
      })
    else hud.loaded()
  }
  hud.frame(now, renderer, terrainView, focus, camera, quality.level)
  if (ready) quality.frame(now)
  if (saveDirty && now - lastSave > 5000) {
    lastSave = now
    saveLocal()
  }
  if (now - lastTip > 500) {
    lastTip = now
    tipState.page2 = finds.has('page-2')
    tipState.found = finds.save().length
    tips.update(tipState)
  }
}
const birdSpots: Array<{ x: number; z: number; pale?: boolean }> = []
const SHORE_BIRDS = [-0.3, -0.18, -0.06, 0.06, 0.24, 0.33]
const mapGiants: Array<{ x: number; z: number }> = []
const clothWind = new THREE.Vector3()
const _head = new THREE.Vector3()
/** The ground the cloth must stay above: the land, or the rock you stand on. */
const groundAt = (x: number, z: number) => {
  const p = wanderer.pos
  const t = terrain.heightAt(x, z)
  // Swimming: the cloth floats on the water.
  if (wanderer.swimming) return Math.max(t, wanderer.waterLevel - 0.03)
  // Hanging on a giant or a rock face: nothing under the cape but air (where you hold on is
  // at your chest, and taking that for the ground pushed the whole cape up round your
  // shoulders the whole climb).
  if ((climber.active && !climber.standing) || cliff.active) return t
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
// (No plot: the land, and why you came.)
const LORE = [
  'You came a long way to see them.',
  'Nobody knows how old they are.',
  'Walk carefully. Everything here is bigger than you.',
  'They do not mind visitors. Mostly.',
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
// Tools stand at the centre facing north; a new adventure wakes in the Undercroft facing the
// light at the stair's foot (the camera looks along (−sin yaw, −cos yaw)).
rig.yaw = toolMode ? 0 : Math.atan2(-((HALL.x - 100) - WAKE_AT.x), -((HALL.z + 125) - WAKE_AT.z))
if (!(localSave && loadLocal()) && !params.has('noancient')) newWorld()
// A first visit: the weather at its best for the walk out.
if (opening === 'title' && !params.get('weather')) weather.opening()
// The pause and the settings: applied now, and whenever they change.
const pause = new Pause(settings)
function applySettings(s: Settings): void {
  sound.enabled = s.sound
  sound.setVolume(s.volume)
  sound.setMusic(s.music)
  rig.sensitivity = s.sensitivity
  rig.invertY = s.invertY
  rig.shakeScale = s.shake
  weather.softFlash = s.softFlash
  if (!toolMode) quality.choose(s.resolution, s.detail)
}
applySettings(settings)
pause.onChange = (s) => {
  applySettings(s)
  saveSettings(s)
}
pause.onToggle = (open) => {
  input.releaseAll()
  sound.ui(open ? 'open' : 'close')
}
pause.onResume = () => canvas.requestPointerLock?.()
pause.onNewAdventure = () => {
  clearWorld()
  try {
    localStorage.removeItem('titans.adventure.tips3')
  } catch {
    // (a fresh start all the same)
  }
  localSave = false
  location.reload()
}
const anyOpen = () => bag.open || journal.open || worldMap.open || pause.open
// Letting go of the view (Esc) with nothing else open: the pause.
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement || toolMode || !ready || opening === 'title') return
  setTimeout(() => {
    if (!document.pointerLockElement && !anyOpen()) pause.show()
  }, 60)
})
addEventListener('keydown', (e) => {
  // ? or F1: the controls (on the pause page).
  if ((e.key === '?' || e.code === 'F1') && !toolMode && opening !== 'title') {
    e.preventDefault()
    if (pause.open) return
    if (document.pointerLockElement) document.exitPointerLock()
    setTimeout(() => !anyOpen() && pause.show(), 0)
    return
  }
  if (e.code !== 'Escape' || toolMode || opening === 'title') return
  if (pause.open) pause.resume()
  else if (!anyOpen()) {
    // (Browsers usually take Esc to let go of the view themselves — then the lock change
    // above opens the pause; where the key reaches us first, let go and open it here.)
    if (document.pointerLockElement) document.exitPointerLock()
    setTimeout(() => !anyOpen() && pause.show(), 0)
  }
})

watchErrors()
requestAnimationFrame(frame)

// ---------------------------------------------------------------------------
// Test hooks for tools/*.mjs. Tools wait on `ready`, never on timeouts.

const g = {
  get ready() {
    return ready
  },
  get opening() {
    return opening
  },
  work,
  ledgeAhead,
  get mantling() {
    return mantle.t >= 0
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
  motes,
  /** The first-steps progress (tools). */
  tipState,
  grapple,
  grappleAim,
  sea,
  wader,
  frozen,
  HIGH,
  softSwitch,
  soft,
  effects,
  prints,
  /** 0 … 1: how strongly a long drop at your feet is felt (tools). */
  get vertigo() {
    return vertigo
  },
  /** 0 … 1: how far the Ones Beyond are out of the haze (tools). */
  get skyline() {
    return skyline
  },
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
  hornOrders,
  uncover,
  offerings,
  mireView,
  ambience,
  dread,
  bell,
  eerie,
  scaleDir,
  dreadBegin(kind: 'stillness' | 'walker' | 'footprints' | 'eyes' | 'deep') {
    dread.stop(dreadWorld())
    return dread.begin(kind, { ...dreadWorld(), busy: false })
  },
  get glyphs() {
    return glyphs
  },
  birds,
  vegetation,
  grass,
  paint,
  biome,
  clouds,
  sound,
  tips,
  narration,
  pause,
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
  /** Tools: take hold of a giant's foot (`id`, or the first giant). */
  grabTitan(id?: string): boolean {
    const titan = (id && titans.get(id)?.titan) || first()
    titan.group.updateMatrixWorld(true)
    // (Either foot: one may be lifted mid-stride.)
    for (const name of ['footL', 'footR']) {
      const foot = titan.part(name)!
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
      // (Above the ground under you: whichever giant it is.)
      height: climber.world.y - terrain.heightAt(climber.world.x, climber.world.z),
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
