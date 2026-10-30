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
  type TitanSnapshot,
  TitanBrain,
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
import { toScreen } from './screen'
import { Quality } from './quality'

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
const mountains = new Mountains()
scene.add(mountains.group)
/** Any Titan by climb id: '' is the awake one, anything else a mountain. */
const titanOf = (id: string) => (id === '' ? titan : mountains.get(id))
const climber = new Climber(() => [{ id: '', titan }, ...mountains.targets()])
/** Offline, with no server to run it, the wild Titan's mind runs here. */
const brain = new TitanBrain(20261030)
const titanLabel = document.createElement('div')
titanLabel.className = 'label titan-name'
document.getElementById('labels')!.appendChild(titanLabel)
let titanName = ''

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
    if (climber.active) climber.release(0)
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
net.onShrug = () => titan.shrug()
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
  titan.gait.restore(s.titan)
  // Who walks it: a player's name, or nobody (it walks itself).
  const driver = s.titan.driver ? s.players.get(s.titan.driver) : undefined
  titanName = driver ? driver.name : s.titan.wild ? 'A wild Titan' : 'A waiting Titan'
  for (const id of mountains.sync(s.mountains)) holdOnAsItSleeps(id)
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
// Tools open ?offline and need a Titan that stands still; real offline play gets the wild one.
let wildOffline = params.has('wild')
if (mode === 'connecting') {
  net.connect(Net.defaultUrl(), identity).then((ok) => {
    mode = ok ? 'online' : 'offline'
    if (!ok) wildOffline = true
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
    if (!chat.typing) {
      if (input.pressed('KeyQ')) shrug()
      if (input.pressed('KeyR')) ploughMode = !ploughMode
      if (input.pressed('KeyF')) stomp()
      if (input.pressed('KeyC')) callOut()
      if (input.pressed('KeyX')) {
        if (mode === 'online') net.sendRest()
        else titan.gait.resting = !titan.gait.resting
      }
    }
    if (mode !== 'online') titan.gait.plough = ploughMode
  } else if (climber.active) {
    if (!chat.typing && input.pressed('KeyE')) letGo(0.6)
    else if (!chat.typing && input.pressed('Space')) letGo(4.5)
    else if (
      !climber.step(
        dt,
        input.axes(),
        rig.yaw,
        climber.target?.id === '' ? titan.gait.speed / titan.gait.maxSpeed : 0,
        climber.target?.id === '' && titan.shrugging,
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

  // Offline (no server found, or ?wild), an unattended Titan wanders by itself.
  if (mode === 'offline' && wildOffline && role !== 'titan' && autopilot.forward === 0 && !titan.gait.resting) {
    const o = brain.think(dt, titan.gait, {
      heightAt: (x, z) => terrain.heightAt(x, z),
      avoid: mountains.targets().map((m) => ({ x: m.titan.gait.x, z: m.titan.gait.z, r: TITAN_HEIGHT * 2 })),
    })
    gaitInput = o
    titan.gait.plough = o.plough
    if (o.stomp) titan.gait.stompArmed = true
    if (o.call) {
      hud.showCall('A wild Titan', titan.gait.x, titan.gait.z)
      chat.system('A wild Titan calls out.')
    }
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

const chest = new THREE.Vector3()

const labelPos = new THREE.Vector3()
const labelPx = { x: 0, y: 0 }
/** "Morag_77 · TITAN · 1,412 STEPS", over the awake Titan's head (the reel's label). */
function placeTitanLabel(): void {
  const name = mode === 'online' ? titanName : role === 'titan' ? identity.name : wildOffline ? 'A wild Titan' : 'A waiting Titan'
  labelPos.copy(titan.head)
  labelPos.y += 0.12 * TITAN_HEIGHT
  const dist = labelPos.distanceTo(camera.position)
  const show = role !== 'titan' && dist < 5000 && !titan.gait.resting && toScreen(labelPos, camera, labelPx)
  titanLabel.style.display = show ? 'block' : 'none'
  if (!show) return
  titanLabel.innerHTML = `<b>${name.replace(/[&<>]/g, '')}</b><small>TITAN · ${titan.gait.steps.toLocaleString()} STEPS</small>`
  titanLabel.style.transform = `translate(-50%, -100%) translate(${labelPx.x}px, ${labelPx.y}px)`
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
  else titan.gait.stompArmed = true
}

function callOut(): void {
  if (mode === 'online') return net.sendCall()
  hud.showCall(identity.name, titan.gait.x, titan.gait.z)
  chat.system(`${identity.name}, the Titan, calls out.`)
}

/**
 * The awake Titan just became the mountain `id`. Anyone holding on stays on
 * the same rock — now a mountain — instead of being carried off by the new
 * Titan that wakes elsewhere.
 */
function holdOnAsItSleeps(id: string): void {
  const m = mountains.get(id)
  if (!m || !climber.active || climber.target?.id !== '') return
  if (Math.hypot(m.gait.x - climber.world.x, m.gait.z - climber.world.z) < TITAN_HEIGHT) climber.retarget({ id, titan: m })
}

/** Offline stand-in for the server's dormancy: the Titan sleeps here, a new one wakes. */
function goDormant(): void {
  const id = `local-${mountains.count + 1}`
  mountains.add(id, { name: identity.name, since: Date.now(), pose: { ...titan.gait.snapshot({} as TitanSnapshot), resting: true } })
  holdOnAsItSleeps(id)
  onGait({ type: 'mountain', x: titan.gait.x, z: titan.gait.z })
  const a = mountains.count * 2.4 + 0.7
  titan.awaken(Math.cos(a) * 650, Math.sin(a) * 650, a + Math.PI)
  titan.restBlend = 0
  if (role === 'titan') setRole('wanderer')
}

function shrug(): void {
  if (mode === 'online') net.sendShrug() // comes back to everyone, us included
  else titan.shrug()
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
  titan.pose(terrain, dt)
  titan.group.updateMatrixWorld(true)
  titan.setLodFor(camera.position)
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
  remotes.update(dt, camera, titanOf)
  placeTitanLabel()
  hud.setRole(role === 'wanderer' && climber.active ? 'climbing' : role, titan.gait.steps, remotes.climbers, {
    plough: titan.gait.plough,
    stompReady: now - lastStomp >= STOMP_COOLDOWN_S * 1000,
  })
  hud.setGrip(climber.active ? climber.stamina : null)

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
  hud.frame(now, renderer, terrainView, focusBase, camera, quality.level)
  if (ready) quality.frame(now)
  hud.net(mode, remotes.count + (mode === 'online' ? 1 : 0))
  hud.updateBeacon(now, focusBase, rig.yaw)
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
  mountains,
  climber,
  goDormant,
  brain,
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
  stomp,
  callOut,
  setPlough(on: boolean) {
    ploughMode = on
    if (mode !== 'online') titan.gait.plough = on
  },
  teleport(x: number, z: number) {
    wanderer.place(x, terrain.heightAt(x, z), z)
  },
  /** Walk up to the Titan's left foot from outside and grab it. */
  grabTitan(): boolean {
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
      height: climber.world.y - terrain.heightAt(titan.gait.x, titan.gait.z),
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
