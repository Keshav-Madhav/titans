// The Wanderer: a small figure in a red cloak — the one thing in this world
// at human scale, so it has to read at a glance from far away and feel alive
// up close. Procedural: a slim body in a dark tunic, jointed legs and boots,
// arms that swing, a deep pointed hood with the face lost in shadow; and
// cloth — a long red cape and a scarf, simulated (verlet), streaming behind
// when you run, lifted by the weather's wind, never through the body or the
// ground. A small lantern at the hip glows warm in dark places.

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { type Terrain } from '@titans/shared'

const WALK = 4.2
const SPRINT = 8.5
/**
 * The long run: hold a sprint over open, level ground and the stride
 * lengthens to this (the lands are kilometres across; SotC had a horse).
 */
const LONG = 14.5
/**
 * Flight with the wing-cloak (user: "make gliding a physics based thing so
 * players can master it, not just pressing W"). A small glider: lift and drag
 * grow with the square of airspeed; W lowers the nose (less lift: you dive and
 * gain speed), S raises it (more lift: you climb, and bleed speed), A / D bank
 * you into a turn (steeper turns sink more); below ~8 m/s the cloak stalls and
 * you drop until speed returns. Air rising off steep ground ahead lifts you:
 * ride a ridge and you can stay up.
 */
const FLY_G = 11
const KL = 0.079
const CD0 = 0.04
const ACCEL = 14
const JUMP = 5.6
const GRAVITY = 18
/** Steeper than this (rise over run, ≈ 50°) you cannot walk up: you slide. */
export const MAX_SLOPE = 1.2
const SLIDE = 14

const _up = new THREE.Vector3(0, 1, 0)
const _side = new THREE.Vector3(1, 0, 0)
const _tq = new THREE.Quaternion()
const _fwd = new THREE.Vector3(0, 0, 1)
const _cx = new THREE.Vector3()
const _cy = new THREE.Vector3()
const _cz = new THREE.Vector3()
const _cm = new THREE.Matrix4()
const _v = new THREE.Vector3()
const _w = new THREE.Vector3()

const RED = 0xa3241c
const TUNIC = 0x4a4036
const LEATHER = 0x2a211a
const SKIN = 0x6a4a36

/** A sphere open at the neck, with a round face opening cut toward +Z. */
function hoodShell(radius: number, openingAngle: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(radius, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.82).toNonIndexed()
  const p = g.getAttribute('position')
  const n = g.getAttribute('normal')
  const keep: number[] = []
  const axis = new THREE.Vector3(0, -0.12, 1).normalize()
  const c = new THREE.Vector3()
  const cos = Math.cos(openingAngle)
  for (let t = 0; t < p.count; t += 3) {
    c.set(0, 0, 0)
    for (let k = 0; k < 3; k++) c.add(new THREE.Vector3().fromBufferAttribute(p, t + k))
    if (c.normalize().dot(axis) > cos) continue
    keep.push(t, t + 1, t + 2)
  }
  const out = new THREE.BufferGeometry()
  const pos = new Float32Array(keep.length * 3)
  const nrm = new Float32Array(keep.length * 3)
  keep.forEach((i, j) => {
    pos.set([p.getX(i), p.getY(i), p.getZ(i)], j * 3)
    nrm.set([n.getX(i), n.getY(i), n.getZ(i)], j * 3)
  })
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  g.dispose()
  return out
}

/** The hood: the shell, drawn back to a soft point behind the head. */
function hoodGeometry(): THREE.BufferGeometry {
  const g = hoodShell(0.165, 0.72)
  const p = g.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    const z = p.getZ(i)
    const back = Math.max(0, -z) / 0.165
    const top = Math.max(0, y) / 0.165
    p.setXYZ(i, p.getX(i) * (1 - 0.15 * back * top), y + back * top * 0.05, z - back * back * top * 0.12)
  }
  return g.scale(1, 1.15, 1.1)
}

// --- cloth ------------------------------------------------------------------------

/**
 * A sheet of cloth: a grid of verlet particles, the top row pinned to points
 * that follow the body, the rest hanging under gravity and the wind, held
 * together by distance constraints, kept out of a capsule round the body and
 * above the ground. Drawn as a double-sided mesh rebuilt each frame.
 */
class Cloth {
  readonly mesh: THREE.Mesh
  private readonly p: Float32Array
  private readonly q: Float32Array
  private ready = false
  /** The pinned spacing between neighbouring columns (set from the first pins). */
  private widths: number[] = []

  constructor(
    private readonly cols: number,
    private readonly rows: number,
    private readonly seg: number,
    material: THREE.Material,
    /** Width of the strip at each row (1 = as pinned): a scarf tapers. */
    private readonly taper: (row: number) => number = () => 1,
  ) {
    this.p = new Float32Array(cols * rows * 3)
    this.q = new Float32Array(cols * rows * 3)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cols * rows * 3), 3))
    const idx: number[] = []
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c
        idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1)
      }
    }
    g.setIndex(idx)
    this.mesh = new THREE.Mesh(g, material)
    this.mesh.castShadow = true
    this.mesh.frustumCulled = false
  }

  /**
   * Advance by dt. `pins` are the top row's world positions; `hang` the way
   * it hangs from them when still; `wind` an acceleration; the body a capsule
   * (a→b, radius r) the cloth stays outside; `ground` the land under it.
   */
  step(dt: number, pins: THREE.Vector3[], hang: THREE.Vector3, wind: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, r: number, ground: (x: number, z: number) => number): void {
    const { cols, rows, p, q } = this
    // The first time, or after a teleport: hang straight from the pins.
    if (!this.ready || pins[0].distanceTo(_v.set(p[0], p[1], p[2])) > 4) {
      this.widths = pins.slice(1).map((v, i) => v.distanceTo(pins[i]))
      for (let row = 0; row < rows; row++) {
        for (let c = 0; c < cols; c++) {
          const k = (row * cols + c) * 3
          p[k] = q[k] = pins[c].x + hang.x * this.seg * row
          p[k + 1] = q[k + 1] = pins[c].y + hang.y * this.seg * row
          p[k + 2] = q[k + 2] = pins[c].z + hang.z * this.seg * row
        }
      }
      this.ready = true
    }
    const steps = 3
    const h = Math.min(dt, 1 / 30) / steps
    for (let s = 0; s < steps; s++) {
      // Integrate: inertia (damped), gravity, the wind (gustier toward the hem).
      for (let row = 1; row < rows; row++) {
        const flutter = row / rows
        for (let c = 0; c < cols; c++) {
          const k = (row * cols + c) * 3
          const vx = (p[k] - q[k]) * 0.985
          const vy = (p[k + 1] - q[k + 1]) * 0.985
          const vz = (p[k + 2] - q[k + 2]) * 0.985
          q[k] = p[k]
          q[k + 1] = p[k + 1]
          q[k + 2] = p[k + 2]
          p[k] += vx + wind.x * h * h * flutter
          p[k + 1] += vy - 9.8 * h * h + wind.y * h * h * flutter
          p[k + 2] += vz + wind.z * h * h * flutter
        }
      }
      for (let c = 0; c < cols; c++) {
        p[c * 3] = q[c * 3] = pins[c].x
        p[c * 3 + 1] = q[c * 3 + 1] = pins[c].y
        p[c * 3 + 2] = q[c * 3 + 2] = pins[c].z
      }
      // Constraints: neighbours down and across keep their distance.
      for (let it = 0; it < 4; it++) {
        for (let row = 0; row < rows; row++) {
          const w = this.taper(row)
          for (let c = 0; c < cols; c++) {
            const i = row * cols + c
            if (row < rows - 1) this.keep(i, i + cols, this.seg, row === 0)
            if (c < cols - 1) this.keep(i, i + 1, (this.widths[c] ?? this.seg) * w, row === 0)
          }
        }
        for (let i = cols; i < cols * rows; i++) this.collide(i, a, b, r, ground)
      }
    }
    const pos = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    ;(pos.array as Float32Array).set(p)
    pos.needsUpdate = true
    this.mesh.geometry.computeVertexNormals()
  }

  private keep(i: number, j: number, len: number, pinnedI: boolean): void {
    const p = this.p
    const a = i * 3
    const b = j * 3
    const dx = p[b] - p[a]
    const dy = p[b + 1] - p[a + 1]
    const dz = p[b + 2] - p[a + 2]
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6
    const k = (d - len) / d
    if (pinnedI) {
      // A pinned point does not move: its neighbour takes all of it.
      p[b] -= dx * k
      p[b + 1] -= dy * k
      p[b + 2] -= dz * k
    } else {
      p[a] += dx * k * 0.5
      p[a + 1] += dy * k * 0.5
      p[a + 2] += dz * k * 0.5
      p[b] -= dx * k * 0.5
      p[b + 1] -= dy * k * 0.5
      p[b + 2] -= dz * k * 0.5
    }
  }

  private collide(i: number, a: THREE.Vector3, b: THREE.Vector3, r: number, ground: (x: number, z: number) => number): void {
    const p = this.p
    const k = i * 3
    _v.subVectors(b, a)
    const t = Math.max(0, Math.min(1, ((p[k] - a.x) * _v.x + (p[k + 1] - a.y) * _v.y + (p[k + 2] - a.z) * _v.z) / _v.lengthSq()))
    _w.copy(a).addScaledVector(_v, t)
    const dx = p[k] - _w.x
    const dy = p[k + 1] - _w.y
    const dz = p[k + 2] - _w.z
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (d < r && d > 1e-5) {
      p[k] = _w.x + (dx / d) * r
      p[k + 1] = _w.y + (dy / d) * r
      p[k + 2] = _w.z + (dz / d) * r
    }
    const gy = ground(p[k], p[k + 2]) + 0.03
    if (p[k + 1] < gy) p[k + 1] = gy
  }
}

// --- the body ----------------------------------------------------------------------

/** A limb segment: a tapered capsule hanging down from its joint (the group's origin). */
function limb(len: number, r0: number, r1: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group()
  const m = new THREE.Mesh(
    mergeGeometries([new THREE.CylinderGeometry(r1, r0, len, 10, 1).translate(0, -len / 2, 0).toNonIndexed(), new THREE.SphereGeometry(r0, 10, 6).toNonIndexed()])!,
    mat,
  )
  m.castShadow = true
  g.add(m)
  return g
}

interface Leg {
  hip: THREE.Group
  knee: THREE.Group
}

interface Arm {
  shoulder: THREE.Group
  elbow: THREE.Group
}

export class Wanderer {
  readonly obj = new THREE.Group()
  /** World-space things that are not children of `obj` (the cloth): add these to the scene too. */
  readonly world = new THREE.Group()
  readonly pos = new THREE.Vector3()
  readonly vel = new THREE.Vector3()
  yaw = 0
  // Previous simulation state, for interpolated rendering.
  private readonly prev = new THREE.Vector3()
  private prevYaw = 0
  grounded = true
  /** On ground too steep to stand on. */
  sliding = false
  /** Seconds left knocked off your feet (a giant stomped nearby). */
  stunned = 0
  private tilt = 0
  private stride = 0
  /** 0 … 1: how far into the long run (see LONG). */
  lope = 0
  /** Has the wing-cloak (main.ts sets it once found). */
  canGlide = false
  /** Falling with the cloak open. */
  gliding = false
  /** In flight: airspeed (m/s), flight-path angle (rad, + up), heading, bank (rad, + right). */
  airspeed = 0
  private gamma = 0
  private heading = 0
  bank = 0
  /** Rising air under you this step (m/s): for the tools and the HUD. */
  updraft = 0
  private t = 0
  /** Smoothed speed (in walks) the limbs follow. */
  private gait = 0
  private climbing = false
  private climbMoving = 0
  private readonly pelvis = new THREE.Group()
  private readonly chest = new THREE.Group()
  /** The wing-cloak spread behind the shoulders (only while gliding). */
  private readonly wing: THREE.Mesh
  private readonly head = new THREE.Group()
  private readonly legs: Leg[] = []
  private readonly arms: Arm[] = []
  /** What is in your hands (main.ts sets it while a tool is in use): its prop shows, the arms take its pose. */
  holding: 'bow' | 'horn' | 'sight' | null = null
  private readonly props: Record<'bow' | 'horn' | 'sight', THREE.Object3D>
  private readonly cape: Cloth
  private readonly scarf: Cloth
  private readonly lantern: THREE.PointLight
  private readonly lanternGlow: THREE.Mesh
  private readonly capeAnchors: THREE.Vector3[] = []
  private readonly scarfAnchors = [new THREE.Vector3(-0.05, 1.47, -0.1), new THREE.Vector3(0.05, 1.47, -0.1)]
  private readonly capePins: THREE.Vector3[]
  private readonly scarfPins = [new THREE.Vector3(), new THREE.Vector3()]
  private readonly axisA = new THREE.Vector3()
  private readonly axisB = new THREE.Vector3()
  private readonly hangDir = new THREE.Vector3()
  private readonly windV = new THREE.Vector3()

  constructor(cloak: THREE.ColorRepresentation = RED) {
    const red = new THREE.MeshStandardMaterial({ color: cloak, roughness: 0.82, side: THREE.DoubleSide })
    const tunic = new THREE.MeshStandardMaterial({ color: TUNIC, roughness: 0.92 })
    const leather = new THREE.MeshStandardMaterial({ color: LEATHER, roughness: 0.8 })
    const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.8 })
    const dark = new THREE.MeshStandardMaterial({ color: 0x0c0a09, roughness: 1 })

    // The wing-cloak: a wide sheet from wrist to wrist, bellied by the air,
    // out behind the shoulders — shown only while gliding.
    const wg = new THREE.PlaneGeometry(2.3, 1.15, 12, 4)
    const wp = wg.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < wp.count; i++) {
      const x = wp.getX(i) / 1.15
      const y = wp.getY(i) / 0.575
      const t = (y + 1) / 2 // 1 along the arms, 0 at the small of the back
      // A wing, not a sheet: wrist to wrist across the top, narrowing to the
      // small of the back, the trailing edge scalloped between the ribs.
      const nx = x * (0.18 + 0.82 * Math.pow(t, 0.7))
      wp.setX(i, nx * 1.15)
      const scallop = t < 0.01 ? 0.1 * Math.abs(Math.sin(x * Math.PI * 2.5)) : 0
      wp.setY(i, wp.getY(i) + scallop - 0.12 * x * x * t)
      // Bellied back (−z) in the middle, the lower edge trailing.
      wp.setZ(i, -0.3 * (1 - nx * nx) * t - 0.25 * (1 - t))
    }
    wg.computeVertexNormals()
    this.wing = new THREE.Mesh(wg, red)
    this.wing.position.set(0, 0.12, -0.12)
    this.wing.visible = false
    this.wing.castShadow = true

    // Pelvis at the hips; the chest, head and arms hang from it.
    this.pelvis.position.y = 0.92
    this.obj.add(this.pelvis)
    const torso = new THREE.Mesh(
      mergeGeometries([
        new THREE.CylinderGeometry(0.17, 0.145, 0.5, 12, 2).translate(0, 0.28, 0).scale(1.15, 1, 0.82).toNonIndexed(),
        new THREE.SphereGeometry(0.18, 12, 8).translate(0, 0.5, 0).scale(1.18, 0.75, 0.82).toNonIndexed(),
        // The tunic's skirt, flaring to the knee.
        new THREE.CylinderGeometry(0.15, 0.25, 0.52, 14, 2, true).translate(0, -0.18, 0).scale(1.1, 1, 0.92).toNonIndexed(),
      ])!,
      tunic,
    )
    torso.castShadow = true
    this.chest.add(torso)
    this.chest.add(this.wing)
    this.chest.add(new THREE.Mesh(new THREE.TorusGeometry(0.142, 0.022, 6, 18).rotateX(Math.PI / 2).scale(1.15, 1, 0.85).translate(0, 0.06, 0), leather))
    this.pelvis.add(this.chest)

    // Head in its hood; the face a dark hollow you never quite see into.
    this.head.position.y = 0.6
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 10).translate(0, 0.08, 0.005), dark)
    const hood = new THREE.Mesh(hoodGeometry().translate(0, 0.095, -0.015), red)
    hood.castShadow = true
    // A mantle round the shoulders: the hood's skirt.
    const mantle = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.27, 0.2, 16, 1, true).translate(0, -0.06, -0.01).scale(1, 1, 0.85), red)
    mantle.castShadow = true
    this.head.add(face, hood, mantle)
    this.chest.add(this.head)

    // Legs: thigh (tunic) and shin (boot), hung from the hips.
    for (const side of [-1, 1]) {
      const hip = limb(0.44, 0.09, 0.072, tunic)
      hip.position.set(side * 0.095, 0, 0)
      const knee = limb(0.44, 0.07, 0.06, leather)
      knee.position.y = -0.44
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.24).translate(0, -0.47, 0.05), leather)
      foot.castShadow = true
      knee.add(foot)
      hip.add(knee)
      this.pelvis.add(hip)
      this.legs.push({ hip, knee })
    }
    // Arms: sleeve, forearm, hand.
    for (const side of [-1, 1]) {
      const shoulder = limb(0.29, 0.068, 0.058, tunic)
      shoulder.position.set(side * 0.22, 0.52, 0)
      const elbow = limb(0.27, 0.056, 0.048, tunic)
      elbow.position.y = -0.29
      // A hand, not a ball: a mitten of palm and fingers, and a thumb.
      const hand = new THREE.Group()
      hand.position.y = -0.3
      hand.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8).scale(0.85, 1.35, 0.6).translate(0, -0.035, 0), skin))
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.035, 3, 6), skin)
      thumb.position.set(-side * 0.035, -0.015, 0.02)
      thumb.rotation.z = side * 0.6
      hand.add(thumb)
      elbow.add(hand)
      shoulder.add(elbow)
      this.chest.add(shoulder)
      this.arms.push({ shoulder, elbow })
    }
    // The tools, held when in use (hidden otherwise). Right hand A[0], left A[1]
    // (the body faces +z: its right is −x).
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.7 })
    const hornMat = new THREE.MeshStandardMaterial({ color: 0x9b8a6c, roughness: 0.6 })
    const bow = new THREE.Group()
    // Limbs bowed forward (along the arm, −y in the hand) from the grip at the hand.
    const limbCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.12, -0.72), new THREE.Vector3(0, -0.44, 0), new THREE.Vector3(0, -0.12, 0.72))
    bow.add(new THREE.Mesh(new THREE.TubeGeometry(limbCurve, 20, 0.018, 6), wood))
    const stringMat = new THREE.MeshBasicMaterial({ color: 0xd8d0bc })
    bow.add(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.44, 4).rotateX(Math.PI / 2).translate(0, -0.12, 0), stringMat))
    const horn = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.04, 0.02), new THREE.Vector3(0, -0.22, 0.14), new THREE.Vector3(0.02, -0.3, 0.38)), 12, 0.03, 8),
      hornMat,
    )
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.03, 0.09, 12, 1, true).rotateX(Math.PI / 2).translate(0.02, -0.3, 0.42), hornMat)
    const hornGroup = new THREE.Group()
    hornGroup.add(horn, bell)
    const sight = new THREE.Group()
    sight.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 18).rotateX(Math.PI / 2).translate(0, -0.1, 0.03), new THREE.MeshStandardMaterial({ color: 0x9fc6c8, roughness: 0.15, transparent: true, opacity: 0.8, emissive: new THREE.Color(0.1, 0.3, 0.32) })))
    this.props = { bow, horn: hornGroup, sight }
    this.arms[1].elbow.children[0].add(bow)
    this.arms[0].elbow.children[0].add(hornGroup, sight)
    for (const k of ['bow', 'horn', 'sight'] as const) this.props[k].visible = false

    // The lantern at the left hip: a small warm light.
    this.pelvis.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.11, 8).translate(-0.19, -0.12, 0.05), leather))
    this.lanternGlow = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8).translate(-0.19, -0.12, 0.1), new THREE.MeshBasicMaterial({ color: 0xffc47a }))
    this.lantern = new THREE.PointLight(0xffb066, 0.6, 9, 1.6)
    this.lantern.position.set(-0.19, -0.12, 0.12)
    this.pelvis.add(this.lanternGlow, this.lantern)

    // The cape: pinned in an arc across the shoulders and round the back, hanging to the calves.
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.1 + (0.8 * i) / 6)
      this.capeAnchors.push(new THREE.Vector3(-Math.cos(a) * 0.22, 1.44, -Math.sin(a) * 0.15 - 0.03))
    }
    this.capePins = this.capeAnchors.map(() => new THREE.Vector3())
    this.cape = new Cloth(7, 9, 0.135, red)
    this.scarf = new Cloth(2, 8, 0.15, red, (row) => 1 - row / 12)
    this.world.add(this.cape.mesh, this.scarf.mesh)
  }

  /** One fixed simulation step. `camYaw` orients WASD to the view. */
  step(dt: number, move: { x: number; y: number }, sprint: boolean, jump: boolean, camYaw: number, terrain: Terrain): void {
    this.prev.copy(this.pos)
    this.prevYaw = this.yaw
    if (this.stunned > 0) {
      // Knocked down: no control until you are back on your feet.
      this.stunned = Math.max(0, this.stunned - dt)
      move = { x: 0, y: 0 }
      jump = false
    }
    this.tilt += ((this.stunned > 0 ? 1.25 : 0) - this.tilt) * Math.min(1, dt * (this.stunned > 0 ? 10 : 3))
    // Camera looks along -Z at yaw 0, so forward is (-sin, -cos).
    const fx = -Math.sin(camYaw)
    const fz = -Math.cos(camYaw)
    let wx = fx * move.y + -fz * move.x
    let wz = fz * move.y + fx * move.x
    const len = Math.hypot(wx, wz)
    if (len > 0) {
      wx /= len
      wz /= len
    }
    // The long run builds over ~5 s of a steady sprint on ground that isn't
    // climbing, and falls away when you turn hard, climb, or stop.
    const vlen = Math.hypot(this.vel.x, this.vel.z)
    const steady = len > 0 && vlen > SPRINT * 0.8 && (this.vel.x * wx + this.vel.z * wz) / vlen > 0.92
    const rise = len > 0 ? (terrain.heightAt(this.pos.x + wx * 2, this.pos.z + wz * 2) - terrain.heightAt(this.pos.x, this.pos.z)) / 2 : 0
    if (sprint && this.grounded && steady && rise < 0.18) this.lope = Math.min(1, this.lope + dt / 5)
    else if (this.grounded || !sprint) this.lope = Math.max(0, this.lope - dt * (sprint && len > 0 ? 0.5 : 2))
    const speed = sprint ? SPRINT + (LONG - SPRINT) * this.lope * this.lope * (3 - 2 * this.lope) : WALK
    const k = Math.min(1, ACCEL * dt * (this.grounded ? 1 : 0.25))
    this.vel.x += (wx * speed - this.vel.x) * k
    this.vel.z += (wz * speed - this.vel.z) * k

    // Too steep to stand on: no walking up it, and you slide down.
    const gx = terrain.heightAt(this.pos.x + 0.5, this.pos.z) - terrain.heightAt(this.pos.x - 0.5, this.pos.z)
    const gz = terrain.heightAt(this.pos.x, this.pos.z + 0.5) - terrain.heightAt(this.pos.x, this.pos.z - 0.5)
    const steep = Math.hypot(gx, gz)
    this.sliding = this.grounded && steep > MAX_SLOPE
    if (this.sliding) {
      const ux = gx / steep
      const uz = gz / steep
      const up = this.vel.x * ux + this.vel.z * uz
      if (up > 0) {
        this.vel.x -= up * ux
        this.vel.z -= up * uz
      }
      this.vel.x -= ux * SLIDE * dt
      this.vel.z -= uz * SLIDE * dt
      jump = false
    }

    if (jump && this.grounded) {
      this.vel.y = JUMP
      this.grounded = false
    }
    this.vel.y -= GRAVITY * dt
    // The wing-cloak: falling with Space held, it opens — you sink slowly and
    // sail the way you lean (or the way you face), and land on your feet.
    const wasGliding = this.gliding
    this.gliding = this.canGlide && !this.grounded && jump && (wasGliding || this.vel.y < -1)
    if (this.gliding) {
      if (!wasGliding) {
        // Opening: take up the flight from how you were falling.
        const hs0 = Math.hypot(this.vel.x, this.vel.z)
        this.airspeed = Math.max(9, Math.hypot(hs0, this.vel.y))
        this.gamma = Math.atan2(this.vel.y, Math.max(hs0, 1))
        this.heading = hs0 > 1 ? Math.atan2(this.vel.x, this.vel.z) : this.yaw
        this.bank = 0
      }
      const cl = THREE.MathUtils.clamp(0.62 - move.y * 0.47, 0.12, 1.15)
      this.bank += (move.x * 0.75 - this.bank) * Math.min(1, dt * 2.5)
      const v = this.airspeed
      const stall = THREE.MathUtils.smoothstep(v, 7, 10)
      const lift = KL * v * v * cl * stall
      const drag = KL * v * v * (CD0 + 0.12 * cl * cl)
      this.airspeed = THREE.MathUtils.clamp(v + (-FLY_G * Math.sin(this.gamma) - drag) * dt, 2, 45)
      this.gamma = THREE.MathUtils.clamp(this.gamma + ((lift * Math.cos(this.bank) - FLY_G * Math.cos(this.gamma)) / Math.max(v, 3)) * dt, -1.35, 0.9)
      // Bank right (+): turn right — the body faces +z, its right is −x, so heading falls.
      this.heading -= ((lift * Math.sin(this.bank)) / Math.max(v, 3)) * dt
      const cg = Math.cos(this.gamma)
      this.vel.set(Math.sin(this.heading) * cg * this.airspeed, Math.sin(this.gamma) * this.airspeed, Math.cos(this.heading) * cg * this.airspeed)
      // Ridge lift: air pushed up a steep slope ahead of you, strongest low over it.
      const ax = this.pos.x + Math.sin(this.heading) * 40
      const az = this.pos.z + Math.cos(this.heading) * 40
      const below = terrain.heightAt(this.pos.x, this.pos.z)
      const rise = (terrain.heightAt(ax, az) - below) / 40
      const agl = this.pos.y - below
      this.updraft = rise > 0.25 && agl < 160 ? Math.min(7, (rise - 0.25) * 16) * (1 - agl / 160) : 0
      this.vel.y += this.updraft
      this.yaw = this.heading
    } else this.updraft = 0
    this.pos.addScaledVector(this.vel, dt)

    const ground = terrain.heightAt(this.pos.x, this.pos.z)
    if (this.pos.y <= ground) {
      this.pos.y = ground
      this.vel.y = 0
      this.grounded = true
    } else if (this.grounded && this.pos.y - ground < 0.35 && this.vel.y <= 0) {
      this.pos.y = ground // stick to the ground walking downhill
    } else {
      this.grounded = false
    }

    const hs = Math.hypot(this.vel.x, this.vel.z)
    if (hs > 0.3) {
      const target = Math.atan2(this.vel.x, this.vel.z)
      let d = target - this.yaw
      d = Math.atan2(Math.sin(d), Math.cos(d))
      this.yaw += d * Math.min(1, 12 * dt)
    }
  }

  /** A shockwave: thrown by `impulse` and knocked down for `seconds`. */
  knock(impulse: THREE.Vector3, seconds: number): void {
    this.vel.add(impulse)
    this.grounded = false
    this.stunned = Math.max(this.stunned, seconds)
  }

  /** Teleport: no interpolation across the jump. */
  place(x: number, y: number, z: number): void {
    this.pos.set(x, y, z)
    this.prev.copy(this.pos)
    this.vel.set(0, 0, 0)
  }

  /** Copy simulation state to the scene graph, `alpha` of the way from the previous step. */
  sync(alpha: number): void {
    this.climbing = false
    this.obj.position.lerpVectors(this.prev, this.pos, alpha)
    let d = this.yaw - this.prevYaw
    d = Math.atan2(Math.sin(d), Math.cos(d))
    this.obj.quaternion.setFromAxisAngle(_up, this.prevYaw + d * alpha)
    if (this.tilt > 0.01) this.obj.quaternion.multiply(_tq.setFromAxisAngle(_side, -this.tilt))
    // In flight: lean into the bank, nose with the flight path, body near level.
    if (this.gliding) {
      this.obj.quaternion.multiply(_tq.setFromAxisAngle(_fwd, this.bank * 0.9))
      this.obj.quaternion.multiply(_tq.setFromAxisAngle(_side, 0.9 - this.gamma * 0.5))
    }
  }

  /**
   * Pose on a giant's body or a rock face. On steep rock: chest to the stone,
   * head up the slope, held a little off the surface. Standing on top: upright,
   * facing `yaw`. `moving` (m/s) drives the limbs.
   */
  climbPose(_dt: number, point: THREE.Vector3, normal: THREE.Vector3, standing: boolean, yaw: number, moving: number): void {
    const o = this.obj
    this.climbing = !standing
    this.climbMoving = moving
    if (standing) {
      o.position.copy(point)
      o.quaternion.setFromAxisAngle(_up, yaw)
    } else {
      // Up the slope = world up flattened onto the rock.
      _cy.set(0, 1, 0).addScaledVector(normal, -normal.y)
      if (_cy.lengthSq() < 1e-4) _cy.set(0, 0, 1)
      _cy.normalize()
      _cz.copy(normal).negate()
      _cx.crossVectors(_cy, _cz)
      _cm.makeBasis(_cx, _cy, _cz)
      o.quaternion.setFromRotationMatrix(_cm)
      o.position.copy(point).addScaledVector(normal, 0.3).addScaledVector(_cy, -1.2)
    }
  }

  /** Back to upright after a climb (sync() only sets yaw). */
  upright(): void {
    this.obj.quaternion.setFromAxisAngle(_up, this.yaw)
  }

  /**
   * Animate the body and its cloth for this frame: the stride from the speed,
   * arms swinging, breathing; reaching and pulling when climbing; the cape and
   * scarf in the `wind` (an acceleration, m/s²). `dark` (0 … 1) brightens the lantern.
   */
  animate(dt: number, ground: (x: number, z: number) => number, wind: THREE.Vector3, dark: number): void {
    this.t += dt
    this.wing.visible = this.gliding
    if (this.gliding) this.wing.rotation.x = Math.sin(this.t * 9) * 0.03
    const hs = this.climbing ? 0 : this.speed
    this.gait += (Math.min(1.6, hs / WALK) - this.gait) * Math.min(1, dt * 6)
    // (Longer strides, not just faster ones, past a sprint.)
    this.stride += (this.climbing ? this.climbMoving * 2.4 : (hs * 1.35) / (1 + Math.max(0, hs - SPRINT) * 0.06)) * dt
    const s = this.stride
    const run = Math.max(0, this.gait - 1) / 0.6
    const L = this.legs
    const A = this.arms
    if (this.climbing) {
      // Hand over hand, legs pushing.
      const reach = this.climbMoving > 0 ? Math.sin(s * 2) : 0
      A[0].shoulder.rotation.set(-2.6 + reach * 0.4, 0, -0.25)
      A[1].shoulder.rotation.set(-2.6 - reach * 0.4, 0, 0.25)
      A[0].elbow.rotation.x = -0.5 - Math.max(0, reach) * 0.6
      A[1].elbow.rotation.x = -0.5 - Math.max(0, -reach) * 0.6
      L[0].hip.rotation.x = -0.5 - Math.max(0, -reach) * 0.5
      L[1].hip.rotation.x = -0.5 - Math.max(0, reach) * 0.5
      L[0].knee.rotation.x = 0.9
      L[1].knee.rotation.x = 0.9
      this.pelvis.position.y = 0.92
      this.chest.rotation.x = 0
      this.head.rotation.x = -0.3
    } else if (!this.grounded && !this.sliding) {
      // In the air: knees up, arms out.
      L[0].hip.rotation.x = -0.5
      L[1].hip.rotation.x = 0.2
      L[0].knee.rotation.x = 0.8
      L[1].knee.rotation.x = 0.5
      A[0].shoulder.rotation.set(-0.3, 0, -0.7)
      A[1].shoulder.rotation.set(-0.3, 0, 0.7)
      A[0].elbow.rotation.x = -0.3
      A[1].elbow.rotation.x = -0.3
      this.chest.rotation.x = 0.1
      this.head.rotation.x = 0
    } else {
      // Walking and running: legs swing from the hips, knees bend on the
      // swing; arms counter-swing; the body leans in and bobs.
      const g = this.gait
      for (let i = 0; i < 2; i++) {
        const ph = s + i * Math.PI
        const swing = Math.sin(ph) * (0.45 + run * 0.35) * Math.min(1, g)
        L[i].hip.rotation.x = -swing
        L[i].knee.rotation.x = Math.max(0, Math.cos(ph)) * (0.55 + run * 0.6) * Math.min(1, g) + 0.04
        A[i].shoulder.rotation.set(swing * (0.8 + run * 0.3), 0, (i ? 1 : -1) * (0.12 + run * 0.08))
        A[i].elbow.rotation.x = -0.2 - run * 0.9
      }
      if (this.sliding) {
        A[0].shoulder.rotation.z = -1.0
        A[1].shoulder.rotation.z = 1.0
      }
      const breathe = Math.sin(this.t * 1.6) * 0.008 * (1 - Math.min(1, g))
      this.pelvis.position.y = 0.92 - Math.abs(Math.sin(s)) * 0.035 * Math.min(1, g) + breathe
      this.chest.rotation.x = this.sliding ? -0.25 : 0.06 * g + run * 0.18
      this.head.rotation.x = -this.chest.rotation.x * 0.6
    }

    // A tool in hand: its pose over whatever the legs are doing.
    for (const k of ['bow', 'horn', 'sight'] as const) this.props[k].visible = this.holding === k
    if (this.holding === 'bow') {
      // The bow arm straight out ahead, the string hand drawn back to the cheek.
      A[1].shoulder.rotation.set(-1.52, 0, 0.12)
      A[1].elbow.rotation.x = 0
      A[0].shoulder.rotation.set(-1.45, 0.2, -0.35)
      A[0].elbow.rotation.x = -2.1
    } else if (this.holding === 'horn') {
      // The horn to the mouth, the other hand steadying it.
      A[0].shoulder.rotation.set(-1.4, 0, -0.32)
      A[0].elbow.rotation.x = -2.05
      A[1].shoulder.rotation.set(-1.4, 0, 0.5)
      A[1].elbow.rotation.x = -1.2
      this.head.rotation.x = -0.25
    } else if (this.holding === 'sight') {
      // The stone held up before the eye: upper arm out level, forearm up to the face.
      A[0].shoulder.rotation.set(-1.55, 0, -0.38)
      A[0].elbow.rotation.x = -1.75
    }

    // The cloth, in the world: pinned at the shoulders (with the chest's lean).
    this.obj.updateMatrixWorld(true)
    const m = this.obj.matrixWorld
    const lean = this.chest.rotation.x
    this.capeAnchors.forEach((a, i) => this.capePins[i].set(a.x, a.y - lean * 0.05, a.z - lean * 0.25).applyMatrix4(m))
    this.scarfAnchors.forEach((a, i) => this.scarfPins[i].set(a.x, a.y - lean * 0.05, a.z - lean * 0.25).applyMatrix4(m))
    this.hangDir.set(0, -1, -0.15).transformDirection(m)
    // The body's capsule, pelvis to chest, a little fatter than the body. (It must end below
    // the pins: a cap above them pushed the scarf's first links upward and it stood on end.)
    this.axisA.set(0, 0.55, 0).applyMatrix4(m)
    this.axisB.set(0, 1.26, -0.02).applyMatrix4(m)
    // Moving makes wind of its own: the cloth streams behind; the weather's wind gusts.
    const gust = wind.length()
    this.windV.copy(wind).multiplyScalar(0.5 + 0.5 * Math.max(0, Math.sin(this.t * 0.7) * Math.sin(this.t * 1.9)))
    this.windV.addScaledVector(this.vel, -1.1)
    this.windV.x += Math.sin(this.t * 2.3) * gust * 0.25
    this.windV.z += Math.cos(this.t * 1.7) * gust * 0.25
    this.cape.step(dt, this.capePins, this.hangDir, this.windV, this.axisA, this.axisB, 0.23, ground)
    this.windV.multiplyScalar(1.25)
    this.scarf.step(dt, this.scarfPins, this.hangDir, this.windV, this.axisA, this.axisB, 0.2, ground)

    // The lantern: brighter in the dark, a slow flicker.
    const flicker = 0.9 + 0.1 * Math.sin(this.t * 11) * Math.sin(this.t * 7.3)
    this.lantern.intensity = (0.25 + dark * 1.4) * flicker
    ;(this.lanternGlow.material as THREE.MeshBasicMaterial).color.setRGB(1, 0.77 * flicker, 0.48 * flicker)
  }

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.z)
  }
}
