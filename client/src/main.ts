import * as THREE from 'three'
import {
  applyDrag,
  applyFootprint,
  applyImpact,
  dragFor,
  footprintFor,
  impactFor,
  LakeSystem,
  MOVE_SEND_MS,
  Terrain,
  TITAN_HEIGHT,
  WORLD_SEED,
  type Box,
  type GaitEvent,
  type GaitInput,
  type Role,
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
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
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

const lakes = new LakeSystem(terrain.cellHeight)
const water = new WaterView()
scene.add(water.group)
const effects = new Effects((x, z) => terrain.heightAt(x, z))
scene.add(effects.group)

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

// One Titan stands in the world from the start, a short walk from spawn
// (the server's TITAN_SPAWN matches this).
const titan = new Titan(TITAN_HEIGHT, 230, -400, Math.PI * 0.62)
scene.add(titan.group)

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

function setRole(next: Role): void {
  role = next
  if (role === 'titan') {
    wanderer.obj.visible = false
    rig.setProfile(TITAN_CAM)
    rig.yaw = titan.gait.heading + Math.PI
    rig.pitch = 0.32
    sky.setShadowRadius(4.3 * TITAN_HEIGHT)
  } else {
    // Step out beside the left foot.
    const a = titan.ankle(0)
    const ox = a.x + Math.cos(titan.gait.heading) * 0.12 * TITAN_HEIGHT
    const oz = a.z - Math.sin(titan.gait.heading) * 0.12 * TITAN_HEIGHT
    wanderer.place(ox, terrain.heightAt(ox, oz), oz)
    wanderer.obj.visible = true
    rig.setProfile(WANDERER_CAM)
    sky.setShadowRadius(260)
  }
  hud.setRole(role, titan.gait.steps)
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
const falls: Array<{ foot: 0 | 1; x: number; z: number }> = []

/** Apply one terrain event. `replay` = catching up on join: no dust, no shake. */
function onGait(ev: GaitEvent, replay = false): void {
  const H = TITAN_HEIGHT
  if (ev.type === 'drag') {
    grow(applyDrag(terrain.delta, dragFor(H, ev.ax, ev.az, ev.bx, ev.bz)))
    if (!replay) effects.drag(ev.bx, terrain.heightAt(ev.bx, ev.bz), ev.bz, H)
    return
  }
  falls.push({ foot: ev.foot, x: ev.x, z: ev.z })
  grow(applyImpact(terrain.delta, impactFor(H, ev.x, ev.z)))
  grow(applyFootprint(terrain.delta, footprintFor(H, ev.x, ev.z, Math.sin(ev.heading), Math.cos(ev.heading))))
  lakes.onDeform(strideBox, ev.x, ev.z)
  strideBox.x0 = strideBox.z0 = Infinity
  strideBox.x1 = strideBox.z1 = -Infinity
  if (replay) return
  effects.impact(ev.x, terrain.heightAt(ev.x, ev.z), ev.z, H)
  // The ground shakes for anyone near the footfall.
  const d = Math.hypot(camera.position.x - ev.x, camera.position.z - ev.z)
  rig.shake(Math.max(0, 1 - d / (6 * H)) * (role === 'titan' ? 0.006 : 0.012) * H)
  hud.setRole(role, ev.step)
}

// ---------------------------------------------------------------------------
// Network. Online, the server owns the Titan: each patch the local Titan
// adopts the server's gait, then extrapolates until the next one.

net.onTerrain = (e, replay) => onGait(e, replay)
net.onChat = (m) => chat.add(m)
net.onPatch = () => {
  const s = net.state
  if (!s) return
  titan.gait.restore(s.titan)
  remotes.ingest(s.players, net.sessionId)
  const me = net.me()
  if (me && me.role !== role) setRole(me.role as Role)
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

let mode: 'connecting' | 'online' | 'offline' = params.has('offline') ? 'offline' : 'connecting'
if (mode === 'connecting') {
  net.connect(Net.defaultUrl(), identity).then((ok) => {
    mode = ok ? 'online' : 'offline'
    chat.system(ok ? `You are ${identity.name}. Enter to talk, T to take the Titan.` : 'No server found: playing offline.')
  })
}

function toggleRole(): void {
  const next: Role = role === 'titan' ? 'wanderer' : 'titan'
  if (mode !== 'online') return setRole(next)
  const driver = net.state?.titan.driver ?? ''
  if (next === 'titan' && driver && driver !== net.sessionId) {
    chat.system('Someone else is walking the Titan.')
    return
  }
  net.requestRole(next) // the role changes when the server's patch says so
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
  } else {
    wanderer.step(dt, input.axes(), input.held('ShiftLeft') || input.held('ShiftRight'), input.held('Space'), rig.yaw, terrain)
  }

  if (mode === 'online') {
    // Extrapolate the server's Titan between patches. Its events are the
    // server's to make; ours are thrown away.
    const t = titan.gait
    const predict = role === 'titan' ? gaitInput : { forward: t.speed > 0.05 ? 1 : 0, turn: 0 }
    discard.length = 0
    titan.step(dt, predict, discard)
  } else {
    gaitEvents.length = 0
    titan.step(dt, gaitInput, gaitEvents)
    for (const ev of gaitEvents) onGait(ev)
  }
  lakes.step(dt)
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
      net.sendTitan({ forward: Math.max(0, ax.y), turn: -ax.x })
    } else {
      net.sendMove({ x: wanderer.pos.x, y: wanderer.pos.y, z: wanderer.pos.z, yaw: wanderer.yaw })
    }
  }

  // Render between the last two simulation states: on a 120 Hz display the
  // 60 Hz simulation would otherwise move the Wanderer every other frame.
  wanderer.sync(acc / STEP)
  titan.pose(terrain)
  water.sync(lakes.lakes)
  effects.update(dt)
  remotes.update(dt, camera)

  const look = input.consumeLook()
  const focusBase = role === 'titan' ? tmpFocus.set(titan.gait.x, titan.pelvis.y - titan.body.hipHeight, titan.gait.z) : wanderer.obj.position
  rig.update(dt, look.dx, look.dy, look.wheel, focusBase, terrain)
  terrainView.update(camera.position, ready ? 5 : 40)
  sky.follow(focusBase, camera)
  renderer.render(scene, camera)

  if (!ready && terrainView.settled()) {
    ready = true
    hud.loaded()
  }
  hud.frame(now, renderer, terrainView, focusBase, camera)
  hud.net(mode, remotes.count + (mode === 'online' ? 1 : 0))
}
const tmpFocus = new THREE.Vector3()
setRole('wanderer')
rig.yaw = Math.PI * 0.85
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
  titan,
  lakes,
  sky,
  net,
  remotes,
  chat,
  identity,
  autopilot,
  clock,
  falls,
  setRole,
  toggleRole,
  teleport(x: number, z: number) {
    wanderer.place(x, terrain.heightAt(x, z), z)
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
    const t = titan.gait
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
