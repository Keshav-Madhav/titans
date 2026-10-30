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
  MOVE_SEND_MS,
  STOMP_COOLDOWN_S,
  Terrain,
  TITAN_HEIGHT,
  WORLD_SEED,
  type Box,
  type GaitEvent,
  type GaitInput,
  type MountainRise,
  type Role,
  TitanBrain,
  TITAN_SPAWNS,
  type TitanSnapshot as Snap,
} from '@titans/shared'
import * as shared from '@titans/shared'
import { TerrainView } from './terrain-view'
import { SkySystem } from './sky'
import { Input } from './input'
import { Wanderer } from './wanderer'
import { Titan } from './titan'
import { WaterView } from './water-view'
import { Effects } from './effects'
import { CameraRig, WANDERER_CAM, type CameraProfile } from './camera-rig'
import { Hud } from './hud'
import { Net } from './net'
import { Remotes } from './remotes'
import { Chat } from './chat'
import { loadIdentity } from './identity'
import { Climber } from './climb'
import { Mountains } from './mountains'
import { Wildlife, type Threat } from './wildlife'
import { toScreen } from './screen'
import { Quality } from './quality'
import { Menu } from './menu'
import { clearWorld, loadSettings, loadWorld, packEvent, saveSettings, saveWorld, unpackEvent, type SaveData, type SavedEvent } from './save'

const STEP = 1 / 60
const params = new URLSearchParams(location.search)

const canvas = document.getElementById('game') as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  // A 1.8 m Wanderer and a 180 m Titan under a 45 km sky: reversed depth keeps
  // precision at both ends. Falls back to the standard buffer without EXT_clip_control.
  reversedDepthBuffer: params.get('rdb') !== '0',
})
renderer.setSize(innerWidth, innerHeight, false)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.82
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.15, 90000)

const terrain = new Terrain(WORLD_SEED)
const terrainView = new TerrainView(terrain, WORLD_SEED)
scene.add(terrainView.group)

const sky = new SkySystem(scene, renderer)
const quality = new Quality(renderer, terrainView, sky.sun, params.get('quality'))

const lakes = new LakeSystem(terrain.cellHeight)
const water = new WaterView()
scene.add(water.group)
const effects = new Effects((x, z) => terrain.heightAt(x, z))
scene.add(effects.group)
const wildlife = new Wildlife(terrain, lakes)
scene.add(wildlife.group)

const input = new Input(canvas)
const rig = new CameraRig(camera)
const hud = new Hud()
const chat = new Chat()
const identity = loadIdentity()
const net = new Net()
const remotes = new Remotes()
scene.add(remotes.group)

const wanderer = new Wanderer(identity.color)
wanderer.place(0, terrain.heightAt(0, 0), 0)
scene.add(wanderer.obj)

/**
 * The awake Titans, by slot id ('t1', 't2', …). Some players are giants: the
 * world keeps a few awake at once. Slot 1 stands a short walk from spawn
 * (tools rely on it); the server's TITAN_SPAWNS place them all.
 */
interface AwakeTitan {
  titan: Titan
  label: HTMLDivElement
  /** Since when it has rested with nobody walking it (0 = not). Offline dormancy. */
  aloneSince: number
  /** Whoever last walked it: its mountain will carry the name. */
  lastDriver: string
  /** Who walks it: a player's name, 'A wild Titan' or 'A waiting Titan'. */
  name: string
  /** Offline, with no server to run it, its wild mind runs here. */
  brain: TitanBrain
}
const titans = new Map<string, AwakeTitan>()
function addTitan(id: string, x: number, z: number, heading: number): AwakeTitan {
  const slot = Number(id.slice(1)) || 1
  const titan = new Titan(TITAN_HEIGHT, x, z, heading, 7 + (slot - 1) * 13)
  scene.add(titan.group)
  const label = document.createElement('div')
  label.className = 'label titan-name'
  document.getElementById('labels')!.appendChild(label)
  const a = { titan, label, name: 'A waiting Titan', brain: new TitanBrain(20261030 + slot * 7919), aloneSince: 0, lastDriver: '' }
  titans.set(id, a)
  return a
}
for (let i = 0; i < 2; i++) addTitan(`t${i + 1}`, TITAN_SPAWNS[i].x, TITAN_SPAWNS[i].z, TITAN_SPAWNS[i].heading)
/** Slot 1: the Titan near spawn. Tools address it as `g.titan`. */
const first = () => titans.get('t1')!.titan
/** Which Titan this player walks ('' = none). */
let driving = ''
/** The Titan we walk, or the first one (for HUD and tools when we walk none). */
const mine = () => titans.get(driving)?.titan ?? first()
const mountains = new Mountains()
scene.add(mountains.group)
/** Any Titan by id: an awake slot or a mountain. */
const titanOf = (id: string) => titans.get(id)?.titan ?? mountains.get(id)
const climber = new Climber(() => [...[...titans].map(([id, a]) => ({ id, titan: a.titan })), ...mountains.targets()])

const TITAN_CAM: CameraProfile = {
  minDist: 0.9 * TITAN_HEIGHT,
  maxDist: 14 * TITAN_HEIGHT,
  dist: 3.1 * TITAN_HEIGHT,
  focusHeight: 0.62 * TITAN_HEIGHT,
  follow: 3,
}

let role: Role = 'wanderer'
/** Tools can walk the Titan while the player stays a Wanderer (offline only). */
const autopilot = { forward: 0, turn: 0 }

function setRole(next: Role, titanId = driving): void {
  if (next === 'wanderer' && role === 'titan') {
    // Step out beside the left foot of the Titan we were walking.
    const t = mine()
    const a = t.ankle(0)
    const ox = a.x + Math.cos(t.gait.heading) * 0.12 * TITAN_HEIGHT
    const oz = a.z - Math.sin(t.gait.heading) * 0.12 * TITAN_HEIGHT
    wanderer.place(ox, terrain.heightAt(ox, oz), oz)
  }
  role = next
  driving = next === 'titan' ? titanId : ''
  const taken = titans.get(driving)
  if (taken) taken.lastDriver = identity.name
  if (role === 'titan') {
    if (climber.active) climber.release(0)
    wanderer.obj.visible = false
    rig.setProfile(TITAN_CAM)
    rig.yaw = mine().gait.heading + Math.PI
    rig.pitch = 0.32
    sky.setShadowRadius(4.3 * TITAN_HEIGHT)
  } else {
    wanderer.obj.visible = true
    rig.setProfile(WANDERER_CAM)
    sky.setShadowRadius(260)
  }
  hud.setRole(role, mine().gait.steps)
}

// ---------------------------------------------------------------------------
// Terrain events: from the local Titan offline, from the server online.

// Everything one stride did to the ground, so lakes re-flood once per footfall.
const strideBox: Box = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity }
function grow(b: Box): void {
  strideBox.x0 = Math.min(strideBox.x0, b.x0)
  strideBox.z0 = Math.min(strideBox.z0, b.z0)
  strideBox.x1 = Math.max(strideBox.x1, b.x1)
  strideBox.z1 = Math.max(strideBox.z1, b.z1)
  terrainView.markDirty(b.x0, b.z0, b.x1, b.z1)
}

/** Every footfall so far (tools read it to measure prints and canals). */
const falls: Array<{ foot: 0 | 1; x: number; z: number; stomp: boolean }> = []

/** Apply one terrain event. `replay` = catching up on join: no dust, no shake. */
function onGait(ev: GaitEvent | MountainRise, replay = false): void {
  const H = TITAN_HEIGHT
  if (ev.type === 'mountain') {
    // A Titan fell asleep: the hill rising under it.
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
  falls.push({ foot: ev.foot, x: ev.x, z: ev.z, stomp: !!ev.stomp })
  grow(applyImpact(terrain.delta, impactFor(H, ev.x, ev.z, ev.stomp)))
  grow(applyFootprint(terrain.delta, footprintFor(H, ev.x, ev.z, ev.hx ?? Math.sin(ev.heading), ev.hz ?? Math.cos(ev.heading), ev.stomp)))
  lakes.onDeform(strideBox, ev.x, ev.z)
  strideBox.x0 = strideBox.z0 = Infinity
  strideBox.x1 = strideBox.z1 = -Infinity
  if (replay) return
  // Herds within earshot bolt.
  wildlife.alarm(ev.x, ev.z, ev.stomp ? 650 : 280)
  // Every footfall jolts whoever is hanging on; a stomp nearly shakes them off.
  if (climber.active) climber.stamina = Math.max(0, climber.stamina - (ev.stomp ? 0.35 : 0.03))
  const gy = terrain.heightAt(ev.x, ev.z)
  if (ev.stomp) {
    effects.shockwave(ev.x, gy, ev.z, H)
    // The shockwave throws Wanderers on the ground off their feet.
    const dx = wanderer.pos.x - ev.x
    const dz = wanderer.pos.z - ev.z
    const dw = Math.hypot(dx, dz)
    if (role === 'wanderer' && !climber.active && dw < 0.6 * H) {
      const k = 1 - dw / (0.6 * H)
      wanderer.knock(new THREE.Vector3((dx / (dw || 1)) * 14 * k, 5 + 5 * k, (dz / (dw || 1)) * 14 * k), 0.8 + 1.2 * k)
    }
  } else {
    effects.impact(ev.x, gy, ev.z, H)
  }
  // The ground shakes for anyone near the footfall.
  const d = Math.hypot(camera.position.x - ev.x, camera.position.z - ev.z)
  rig.shake(Math.max(0, 1 - d / (6 * H)) * (role === 'titan' ? 0.006 : 0.012) * H * (ev.stomp ? 2.5 : 1))
}

// ---------------------------------------------------------------------------
// Network. Online, the server owns the Titan: each patch the local Titan
// adopts the server's gait, then extrapolates until the next one.

net.onTerrain = (e, replay) => onGait(e, replay)
net.onChat = (m) => chat.add(m)
net.onShrug = (id) => titans.get(id)?.titan.shrug()
net.onCall = (c) => {
  hud.showCall(c.name, c.x, c.z)
  chat.system(`${c.name}, the Titan, calls out.`)
}
// A world you come back to has had its rain: its lakes are already full.
net.onSynced = (n) => {
  if (n > 0) lakes.fillAll()
}
net.onPatch = () => {
  const s = net.state
  if (!s) return
  let mineNow = ''
  s.titans.forEach((st, id) => {
    const a = titans.get(id) ?? addTitan(id, st.x, st.z, st.heading)
    a.titan.gait.restore(st)
    // Who walks it: a player's name, or nobody (it walks itself).
    const driver = st.driver ? s.players.get(st.driver) : undefined
    a.name = driver ? driver.name : st.wild ? 'A wild Titan' : 'A waiting Titan'
    if (st.driver === net.sessionId) mineNow = id
  })
  for (const id of mountains.sync(s.mountains)) holdOnAsItSleeps(id)
  remotes.ingest(s.players, net.sessionId)
  const me = net.me()
  if (me && (me.role !== role || (role === 'titan' && mineNow !== driving))) setRole(me.role as Role, mineNow)
  // The server refused a move (too fast, or flying): go back to where it has us.
  if (me && role === 'wanderer' && Math.hypot(me.x - wanderer.pos.x, me.z - wanderer.pos.z) > 12) {
    wanderer.place(me.x, me.y, me.z)
  }
}
chat.onOpen = () => input.releaseAll()
chat.onSend = (text) => {
  if (net.online) net.sendChat(text)
  else chat.add({ from: identity.name, color: identity.color, text })
}

// Single player is the default. Multiplayer only when switched on (the world
// panel, ?mp, or ?server=…). Tools open ?offline: a fresh, unsaved world
// whose Titans stand still unless ?wild.
const settings = loadSettings(Net.defaultUrl())
const toolMode = params.has('offline')
const wantsMp = !toolMode && (params.has('mp') || params.has('server') || settings.multiplayer)
let mode: 'connecting' | 'online' | 'offline' = wantsMp ? 'connecting' : 'offline'
let wildOffline = !toolMode || params.has('wild')
/** Single player keeps its world in this browser. */
let localSave = !toolMode && !wantsMp
if (mode === 'connecting') {
  net.connect(params.get('server') ?? settings.server, identity).then((ok) => {
    mode = ok ? 'online' : 'offline'
    if (!ok) {
      wildOffline = true
      localSave = true
      loadLocal()
    }
    chat.system(ok ? `You are ${identity.name}. Enter to talk, T to take the nearest Titan.` : 'Multiplayer server not reachable: playing single player.')
  })
}

const menu = new Menu(settings)
menu.onOpen = () => input.releaseAll()
menu.onApply = (next) => {
  saveSettings(next)
  saveLocal()
  // Drop any ?mp/?server/?offline so the stored choice decides.
  location.replace(location.pathname)
}
menu.onNewWorld = () => {
  clearWorld()
  localSave = false // do not write the old world back on the way out
  location.replace(location.pathname)
}

// ---------------------------------------------------------------------------
// Single-player memory. Every terrain event is recorded; the world, the
// Titans, the mountains and where you stood are saved every few seconds and
// when the page goes away; loading replays it all.

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
  if (!localSave || mode !== 'offline') return
  const data: SaveData = {
    v: 1,
    savedAt: Date.now(),
    name: identity.name,
    events: localEvents,
    titans: Object.fromEntries(
      [...titans].map(([id, a]) => {
        const yours = role === 'titan' && id === driving
        return [id, { pose: { ...a.titan.gait.snapshot({} as Snap) }, yours, aloneSince: a.aloneSince, lastDriver: a.lastDriver }]
      }),
    ),
    mountains: mountains.infos(),
    player: { x: wanderer.pos.x, y: wanderer.pos.y, z: wanderer.pos.z },
  }
  if (!saveWorld(data)) chat.system('Could not save the world (browser storage is full or blocked).')
  saveDirty = false
}

function loadLocal(): void {
  const d = loadWorld()
  if (!d) return
  for (const e of d.events) {
    const ev = unpackEvent(e)
    localEvents.push(e)
    onGait(ev, true)
  }
  for (const [id, m] of Object.entries(d.mountains)) mountains.add(id, m)
  for (const [id, t] of Object.entries(d.titans)) {
    const a = titans.get(id) ?? addTitan(id, t.pose.x, t.pose.z, t.pose.heading)
    a.titan.gait.restore(t.pose)
    a.titan.restBlend = t.pose.resting ? 1 : 0
    a.aloneSince = t.aloneSince ?? 0
    a.lastDriver = t.lastDriver ?? ''
  }
  wanderer.place(d.player.x, terrain.heightAt(d.player.x, d.player.z), d.player.z)
  // Time has passed: the rain has fallen.
  lakes.fillAll()
  // You left while walking a Titan: it sat down where it stood, alone from
  // the moment you left. A Titan resting alone long enough slept, and is a
  // mountain now.
  for (const [id, t] of Object.entries(d.titans)) {
    const a = titans.get(id)!
    if (t.yours) {
      a.titan.gait.resting = true
      a.titan.restBlend = 1
      a.aloneSince = d.savedAt
      a.lastDriver = d.name
    }
    if (a.titan.gait.resting && a.aloneSince && Date.now() - a.aloneSince > DORMANT_AFTER_MS) goDormant(id)
  }
  chat.system(`Welcome back, ${d.name}. Your world remembers ${d.events.length.toLocaleString()} footsteps and drags.`)
}

addEventListener('pagehide', () => saveLocal())
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveLocal()
})

/** Take the nearest free Titan (or the one named), or step out of yours. */
function toggleRole(want?: string): void {
  const next: Role = role === 'titan' ? 'wanderer' : 'titan'
  if (next === 'wanderer') {
    if (mode === 'online') net.requestRole('wanderer')
    else setRole('wanderer')
    return
  }
  const taken = (id: string) => mode === 'online' && (net.state?.titans.get(id)?.driver ?? '') !== ''
  const free = [...titans].filter(([id, a]) => !taken(id) && !a.titan.gait.resting)
  const pick = want
    ? free.find(([id]) => id === want)
    : free.sort(([, a], [, b]) => Math.hypot(a.titan.gait.x - wanderer.pos.x, a.titan.gait.z - wanderer.pos.z) - Math.hypot(b.titan.gait.x - wanderer.pos.x, b.titan.gait.z - wanderer.pos.z))[0]
  if (!pick) {
    chat.system('Every Titan has someone walking it.')
    return
  }
  if (mode === 'online') net.requestRole('titan', pick[0]) // the role changes when the server's patch says so
  else setRole('titan', pick[0])
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight, false)
})

// ---------------------------------------------------------------------------
// Loop: fixed 60 Hz simulation, render every frame, paused while hidden.

let acc = 0
let last = performance.now()
let ready = false
let lastMoveSent = 0
/** Simulation speed multiplier — tools fast-forward the Titan with it (offline). */
const clock = { scale: 1 }
const gaitEvents: GaitEvent[] = []
const discard: GaitEvent[] = []

function simulate(dt: number): void {
  if (!chat.typing && input.pressed('KeyT')) toggleRole()

  let gaitInput: GaitInput = autopilot
  if (role === 'titan') {
    const ax = input.axes()
    gaitInput = { forward: Math.max(0, ax.y), turn: -ax.x }
    if (!chat.typing) {
      if (input.pressed('KeyQ')) shrug()
      if (input.pressed('KeyR')) ploughMode = !ploughMode
      if (input.pressed('KeyF')) stomp()
      if (input.pressed('KeyC')) callOut()
      if (input.pressed('KeyX')) {
        if (mode === 'online') net.sendRest()
        else mine().gait.resting = !mine().gait.resting
      }
    }
    if (mode !== 'online') mine().gait.plough = ploughMode
  } else if (climber.active) {
    if (!chat.typing && input.pressed('KeyE')) letGo(0.6)
    else if (!chat.typing && input.pressed('Space')) letGo(4.5)
    else if (
      !climber.step(
        dt,
        input.axes(),
        rig.yaw,
        heldAwake() ? heldAwake()!.gait.speed / heldAwake()!.gait.maxSpeed : 0,
        !!heldAwake()?.shrugging,
      )
    ) {
      chat.system('You lost your grip.')
      letGo(1.2)
    } else {
      // The physics body rides along, for the camera, the server, and the moment we let go.
      wanderer.place(climber.world.x, climber.world.y, climber.world.z)
    }
  } else {
    if (!chat.typing && input.pressed('KeyE')) {
      chest.set(wanderer.pos.x, wanderer.pos.y + 0.9, wanderer.pos.z)
      climber.tryGrab(chest)
    }
    if (!climber.active) {
      wanderer.step(dt, input.axes(), input.held('ShiftLeft') || input.held('ShiftRight'), input.held('Space'), rig.yaw, terrain)
      climber.pushOut(wanderer.pos)
    }
  }

  for (const [id, a] of titans) {
    const t = a.titan
    const ours = role === 'titan' && id === driving
    if (mode === 'online') {
      // Extrapolate the server's Titans between patches. Their events are
      // the server's to make; ours are thrown away.
      const predict = ours ? gaitInput : { forward: t.gait.speed > 0.05 ? 1 : 0, turn: 0 }
      discard.length = 0
      t.step(dt, predict, discard)
      continue
    }
    // Offline: we walk ours; tools drive slot 1 by autopilot; with no server
    // found (or ?wild) the rest wander by themselves.
    let inp: GaitInput = ours ? gaitInput : id === 't1' ? autopilot : { forward: 0, turn: 0 }
    if (!ours && wildOffline && !(id === 't1' && autopilot.forward !== 0) && !t.gait.resting) {
      const o = a.brain.think(dt, t.gait, {
        heightAt: (x, z) => terrain.heightAt(x, z),
        avoid: [
          ...mountains.targets().map((m) => ({ x: m.titan.gait.x, z: m.titan.gait.z, r: TITAN_HEIGHT * 2 })),
          ...[...titans.values()].filter((b) => b !== a).map((b) => ({ x: b.titan.gait.x, z: b.titan.gait.z, r: TITAN_HEIGHT * 2.5 })),
        ],
      })
      inp = o
      t.gait.plough = o.plough
      if (o.stomp) t.gait.stompArmed = true
      if (o.call) {
        hud.showCall('A wild Titan', t.gait.x, t.gait.z)
        chat.system('A wild Titan calls out.')
      }
    }
    gaitEvents.length = 0
    t.step(dt, inp, gaitEvents)
    for (const ev of gaitEvents) {
      onGait(ev)
      record(ev)
    }
    // The server's rule, offline: resting with nobody walking it, it falls asleep.
    if (t.gait.resting && !ours && !toolMode) {
      if (!a.aloneSince) a.aloneSince = Date.now()
      else if (Date.now() - a.aloneSince > DORMANT_AFTER_MS) goDormant(id)
    } else {
      a.aloneSince = 0
    }
  }
  lakes.step(dt)
  // Big things to keep clear of: every awake Titan (more so when it walks),
  // and a Wanderer running right at them.
  threats.length = 0
  for (const a of titans.values()) {
    const g = a.titan.gait
    threats.push({ x: g.x, z: g.z, r: g.speed > 0.5 ? 0.9 * TITAN_HEIGHT : 0.45 * TITAN_HEIGHT })
  }
  if (role === 'wanderer' && !climber.active && wanderer.speed > 6) threats.push({ x: wanderer.pos.x, z: wanderer.pos.z, r: 14 })
  wildlife.step(dt, threats)
}
const threats: Threat[] = []

const chest = new THREE.Vector3()

const labelPos = new THREE.Vector3()
const labelPx = { x: 0, y: 0 }
/** "Morag_77 · TITAN · 1,412 STEPS", over each awake Titan's head (the reel's label). */
function placeTitanLabels(): void {
  for (const [id, a] of titans) {
    const t = a.titan
    const name = mode === 'online' ? a.name : role === 'titan' && id === driving ? identity.name : wildOffline ? 'A wild Titan' : 'A waiting Titan'
    labelPos.copy(t.head)
    labelPos.y += 0.12 * TITAN_HEIGHT
    const dist = labelPos.distanceTo(camera.position)
    const show = !(role === 'titan' && id === driving) && dist < 5000 && !t.gait.resting && toScreen(labelPos, camera, labelPx)
    a.label.style.display = show ? 'block' : 'none'
    if (!show) continue
    a.label.innerHTML = `<b>${name.replace(/[&<>]/g, '')}</b><small>TITAN · ${t.gait.steps.toLocaleString()} STEPS</small>`
    a.label.style.transform = `translate(-50%, -100%) translate(${labelPx.x}px, ${labelPx.y}px)`
  }
}

/** The awake Titan the climber holds, if any (mountains do not walk or shrug). */
function heldAwake(): Titan | undefined {
  return climber.target ? titans.get(climber.target.id)?.titan : undefined
}

/** Let go of the Titan: fall with its motion plus a push off the rock. */
function letGo(push: number): void {
  const v = climber.release(push)
  const w = climber.world
  wanderer.place(w.x + climber.normal.x * 0.6, w.y + climber.normal.y * 0.6, w.z + climber.normal.z * 0.6)
  wanderer.vel.copy(v)
  wanderer.grounded = false
}

/** Drag the feet (canals) or stride clean (lakes only). */
let ploughMode = true
let stompRequest = false
let lastStomp = -Infinity

function stomp(): void {
  const now = performance.now()
  if (now - lastStomp < STOMP_COOLDOWN_S * 1000) return
  lastStomp = now
  if (mode === 'online') stompRequest = true // goes out with the next Titan input
  else mine().gait.stompArmed = true
}

function callOut(): void {
  if (mode === 'online') return net.sendCall()
  hud.showCall(identity.name, mine().gait.x, mine().gait.z)
  chat.system(`${identity.name}, the Titan, calls out.`)
}

/**
 * The awake Titan just became the mountain `id`. Anyone holding on stays on
 * the same rock — now a mountain — instead of being carried off by the new
 * Titan that wakes elsewhere.
 */
function holdOnAsItSleeps(id: string): void {
  const m = mountains.get(id)
  if (!m || !climber.active || !heldAwake()) return
  if (Math.hypot(m.gait.x - climber.world.x, m.gait.z - climber.world.z) < TITAN_HEIGHT) climber.retarget({ id, titan: m })
}

/** Offline stand-in for the server's dormancy: the Titan sleeps here, a new one wakes in its slot. */
function goDormant(id = driving || 't1'): void {
  const t = titans.get(id)?.titan
  if (!t) return
  const mid = `local-${mountains.count + 1}`
  const owner = titans.get(id)!
  mountains.add(mid, { name: owner.lastDriver || 'A nameless Titan', since: Date.now(), pose: { ...t.gait.snapshot({} as Snap), resting: true } })
  owner.aloneSince = 0
  owner.lastDriver = ''
  holdOnAsItSleeps(mid)
  const rise = { type: 'mountain' as const, x: t.gait.x, z: t.gait.z }
  onGait(rise)
  record(rise)
  const a = mountains.count * 2.4 + 0.7
  t.awaken(Math.cos(a) * 650, Math.sin(a) * 650, a + Math.PI)
  t.restBlend = 0
  if (role === 'titan' && id === driving) setRole('wanderer')
}

function shrug(): void {
  if (mode === 'online') net.sendShrug() // comes back to everyone, us included
  else mine().shrug()
}

function frame(now: number): void {
  requestAnimationFrame(frame)
  if (document.hidden) {
    last = now
    return
  }
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  acc += dt * (mode === 'online' ? 1 : clock.scale)
  while (acc >= STEP) {
    simulate(STEP)
    acc -= STEP
  }

  if (mode === 'online' && now - lastMoveSent >= MOVE_SEND_MS) {
    lastMoveSent = now
    if (role === 'titan') {
      const ax = input.axes()
      net.sendTitan({ forward: Math.max(0, ax.y), turn: -ax.x, plough: ploughMode, stomp: stompRequest })
      stompRequest = false
    } else {
      const hold = climber.hold()
      net.sendMove({ x: wanderer.pos.x, y: wanderer.pos.y, z: wanderer.pos.z, yaw: wanderer.yaw, ...(hold ? { climb: hold } : {}) })
    }
  }

  // Render between the last two simulation states: on a 120 Hz display the
  // 60 Hz simulation would otherwise move the Wanderer every other frame.
  for (const a of titans.values()) {
    a.titan.pose(terrain, dt)
    a.titan.group.updateMatrixWorld(true)
    a.titan.setLodFor(camera.position)
  }
  mountains.update(terrain, camera, Date.now())
  if (climber.active) {
    // Glued to the hold through the Titan's pose of THIS frame.
    climber.sync(dt)
    wanderer.climbPose(dt, climber.world, climber.normal, climber.standing, rig.yaw + Math.PI, climber.moving)
  } else {
    wanderer.sync(acc / STEP)
  }
  water.sync(lakes.lakes)
  water.syncStreams(dt, lakes, (x, z) => terrain.heightAt(x, z))
  water.update(dt)
  effects.update(dt)
  wildlife.render()
  remotes.update(dt, camera, titanOf)
  placeTitanLabels()
  hud.setRole(role === 'wanderer' && climber.active ? 'climbing' : role, mine().gait.steps, remotes.climbers, {
    plough: mine().gait.plough,
    stompReady: now - lastStomp >= STOMP_COOLDOWN_S * 1000,
  })
  hud.setGrip(climber.active ? climber.stamina : null)

  const look = input.consumeLook()
  const t0 = mine()
  const focusBase = role === 'titan' ? tmpFocus.set(t0.gait.x, t0.pelvis.y - t0.body.hipHeight, t0.gait.z) : wanderer.obj.position
  rig.update(dt, look.dx, look.dy, look.wheel, focusBase, terrain)
  terrainView.update(camera.position, ready ? 5 : 40)
  sky.follow(focusBase, camera)
  renderer.render(scene, camera)

  if (!ready && terrainView.settled()) {
    ready = true
    hud.loaded()
  }
  hud.frame(now, renderer, terrainView, focusBase, camera, quality.level)
  if (ready) quality.frame(now)
  hud.net(mode, remotes.count + (mode === 'online' ? 1 : 0), !toolMode)
  if (saveDirty && now - lastSave > 5000) {
    lastSave = now
    saveLocal()
  }
  hud.updateBeacon(now, focusBase, rig.yaw)
}
const tmpFocus = new THREE.Vector3()
setRole('wanderer')
rig.yaw = Math.PI * 0.85
if (localSave) loadLocal()
requestAnimationFrame(frame)

// ---------------------------------------------------------------------------
// Test hooks for tools/*.mjs. Tools wait on `ready`, never on timeouts.

const g = {
  get ready() {
    return ready
  },
  get role() {
    return role
  },
  get mode() {
    return mode
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
  /** Slot 1, the Titan near spawn. */
  get titan() {
    return first()
  },
  titans,
  get driving() {
    return driving
  },
  mountains,
  wildlife,
  climber,
  goDormant,
  setWild(on: boolean) {
    wildOffline = on
  },
  lakes,
  sky,
  quality,
  net,
  remotes,
  chat,
  identity,
  autopilot,
  clock,
  falls,
  setRole,
  toggleRole,
  get localSave() {
    return localSave
  },
  saveLocal,
  savedEvents: () => localEvents.length,
  stomp,
  callOut,
  setPlough(on: boolean) {
    ploughMode = on
    if (mode !== 'online') for (const a of titans.values()) a.titan.gait.plough = on
  },
  teleport(x: number, z: number) {
    wanderer.place(x, terrain.heightAt(x, z), z)
  },
  /** Walk up to the Titan's left foot from outside and grab it. */
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
