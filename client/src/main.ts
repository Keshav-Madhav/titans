import * as THREE from 'three'
import {
  applyDrag,
  applyFootprint,
  applyImpact,
  dragFor,
  footprintFor,
  impactFor,
  LakeSystem,
  Terrain,
  TITAN_HEIGHT,
  WORLD_SEED,
  type Box,
  type GaitEvent,
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

const STEP = 1 / 60
const params = new URLSearchParams(location.search)

const canvas = document.getElementById('game') as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  // A 1.8 m Wanderer and a 120 m Titan under a 45 km sky: reversed depth keeps
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

const wanderer = new Wanderer()
wanderer.place(0, terrain.heightAt(0, 0), 0)
scene.add(wanderer.obj)

// One Titan stands in the world from the start, a short walk from spawn.
const titan = new Titan(TITAN_HEIGHT, 230, -400, Math.PI * 0.62)
scene.add(titan.group)

const TITAN_CAM: CameraProfile = {
  minDist: 0.9 * TITAN_HEIGHT,
  maxDist: 14 * TITAN_HEIGHT,
  dist: 3.1 * TITAN_HEIGHT,
  focusHeight: 0.62 * TITAN_HEIGHT,
  follow: 3,
}

type Role = 'wanderer' | 'titan'
let role: Role = 'wanderer'
/** Tools can walk the Titan while the player stays a Wanderer. */
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

// Everything one stride did to the ground, so lakes re-flood once per footfall.
const strideBox: Box = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity }
function grow(b: Box): void {
  strideBox.x0 = Math.min(strideBox.x0, b.x0)
  strideBox.z0 = Math.min(strideBox.z0, b.z0)
  strideBox.x1 = Math.max(strideBox.x1, b.x1)
  strideBox.z1 = Math.max(strideBox.z1, b.z1)
  terrainView.markDirty(b.x0, b.z0, b.x1, b.z1)
}

function onGait(ev: GaitEvent): void {
  const H = TITAN_HEIGHT
  if (ev.type === 'drag') {
    grow(applyDrag(terrain.delta, dragFor(H, ev.ax, ev.az, ev.bx, ev.bz)))
    effects.drag(ev.bx, terrain.heightAt(ev.bx, ev.bz), ev.bz, H)
    return
  }
  falls.push({ foot: ev.foot, x: ev.x, z: ev.z })
  grow(applyImpact(terrain.delta, impactFor(H, ev.x, ev.z)))
  grow(applyFootprint(terrain.delta, footprintFor(H, ev.x, ev.z, Math.sin(ev.heading), Math.cos(ev.heading))))
  lakes.onDeform(strideBox, ev.x, ev.z)
  strideBox.x0 = strideBox.z0 = Infinity
  strideBox.x1 = strideBox.z1 = -Infinity
  effects.impact(ev.x, terrain.heightAt(ev.x, ev.z), ev.z, H)
  // The ground shakes for anyone near the footfall.
  const d = Math.hypot(camera.position.x - ev.x, camera.position.z - ev.z)
  rig.shake(Math.max(0, 1 - d / (6 * H)) * (role === 'titan' ? 0.006 : 0.012) * H)
  hud.setRole(role, titan.gait.steps)
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
/** Simulation speed multiplier — tools fast-forward the Titan with it. */
const clock = { scale: 1 }

function simulate(dt: number): void {
  if (input.pressed('KeyT')) setRole(role === 'titan' ? 'wanderer' : 'titan')

  let gaitInput = autopilot
  if (role === 'titan') {
    const ax = input.axes()
    gaitInput = { forward: Math.max(0, ax.y), turn: -ax.x }
  } else {
    wanderer.step(dt, input.axes(), input.held('ShiftLeft') || input.held('ShiftRight'), input.held('Space'), rig.yaw, terrain)
  }
  gaitEvents.length = 0
  titan.step(dt, gaitInput, gaitEvents)
  for (const ev of gaitEvents) onGait(ev)
  lakes.step(dt)
}
const gaitEvents: GaitEvent[] = []
/** Every footfall so far (tools read it to measure prints and canals). */
const falls: Array<{ foot: 0 | 1; x: number; z: number }> = []

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
  // 60 Hz simulation would otherwise move the Wanderer every other frame.
  wanderer.sync(acc / STEP)
  titan.pose(terrain)
  water.sync(lakes.lakes)
  effects.update(dt)

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
  autopilot,
  clock,
  falls,
  setRole,
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
