// The wanderer's body (user, 2026-11-05: "everything is bad about the wanderer except the idea" —
// a free rigged character, heavily customised). Quaternius' Male Ranger outfit (CC0: hood, coat,
// gloved arms, legs, boots — one skinned body on a 65-bone rig, tools/avatar/build.mjs) moved by the
// Universal Animation Library's clips (CC0, same rig), in the wanderer's colours: the red hood, the
// dark hollow where a face would be, a worn brown coat.
//
// Locomotion is not crossfaded clip to clip: idle, walk, jog and sprint play together on one stride
// phase, weighted by speed, so the feet never fall out of step in a blend, and the phase runs at the
// rate the ground goes by (no sliding). Jumps, swimming and the pick-up crossfade over it.

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/** The figure's height (m, to the hood's top) — the old wanderer's. */
const HEIGHT = 1.74
const SOURCE_HEIGHT = 1.87
export const AVATAR_SCALE = HEIGHT / SOURCE_HEIGHT

/** Each locomotion clip: how far one cycle carries you (m, at the scale above). */
const STRIDE = { Walk_Loop: 1.55, Jog_Fwd_Loop: 2.7, Sprint_Loop: 4.4 }

export interface AvatarState {
  speed: number
  grounded: boolean
  swimming: boolean
  /** Rising (m/s, + up). */
  vy: number
  /** Not on your feet: what the body is doing instead (each has its clip). */
  mode: 'ground' | 'climb' | 'glide' | 'slide' | 'hang'
  /** Kneeling to take something (0 … 1 of the way through, or −1). */
  take: number
  /** How fast you climb (0 still … 1). */
  climbRate: number
}

const ease = (x: number): number => x * x * (3 - 2 * x)

export class Avatar {
  readonly root = new THREE.Group()
  readonly bones = new Map<string, THREE.Bone>()
  private readonly mixer: THREE.AnimationMixer
  private readonly act = new Map<string, THREE.AnimationAction>()
  private phase = 0
  private air = 0
  private wasGrounded = true
  private landT = 1
  private startT = 1
  private swim = 0
  private posedW = 0
  private vS = 0
  private readonly modeW = { climb: 0, glide: 0, slide: 0, hang: 0 }
  /** The hood's red (the wanderer's cloak material, shared). */
  readonly meshes: THREE.SkinnedMesh[] = []
  /** The hollow in the hood (placed by the wanderer, in its own frame). */
  faceMesh: THREE.Mesh | null = null

  private constructor(scene: THREE.Group, clips: THREE.AnimationClip[], red: THREE.Material) {
    this.root.add(scene)
    scene.scale.setScalar(AVATAR_SCALE)
    scene.traverse((o) => {
      if ((o as THREE.Bone).isBone) this.bones.set(o.name, o as THREE.Bone)
      const m = o as THREE.SkinnedMesh
      if (!m.isSkinnedMesh) return
      m.castShadow = true
      m.receiveShadow = true
      m.frustumCulled = false
      this.meshes.push(m)
      // (No armour: the shoulder plate was the ranger's, not a wanderer's — and the cape caught on it.)
      if (/Pauldron/.test(m.name)) {
        m.visible = false
        return
      }
      if (/Hood/.test(m.name)) m.material = red
      else {
        // The outfit's own colours, pulled toward the wanderer's: a worn, dark, warm brown.
        const mat = (m.material as THREE.MeshStandardMaterial).clone()
        mat.envMapIntensity = 0.6
        m.material = mat
      }
    })
    // Where a face would be: a dark hollow, deep in the hood.
    const head = this.bones.get('Head')
    if (head) {
      // A hollow, not a ball: the inside of a bowl facing out of the hood, black at its depth and a
      // shade lighter toward its rim (where the hood's lining would catch a little light). A flat
      // black sphere read as a black ball stuck in the hood.
      const g = new THREE.SphereGeometry(0.1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55)
      g.rotateX(-Math.PI / 2) // (a sphere's top cap, turned so its open side faces +z, out of the hood)
      const pos = g.getAttribute('position')
      const col = new Float32Array(pos.count * 3)
      for (let i = 0; i < pos.count; i++) {
        const depth = THREE.MathUtils.clamp(-pos.getZ(i) / 0.1, 0, 1) // 0 at the rim … 1 deepest
        const c = 0.05 + 0.13 * (1 - depth) ** 2
        col.set([c * 1.1, c * 0.82, c * 0.7], i * 3)
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3))
      const face = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: true }))
      head.add(face)
      this.faceMesh = face
    }
    this.mixer = new THREE.AnimationMixer(scene)
    for (const c of clips) {
      // (Root bone translation would carry the body off its place: the game moves it.)
      c.tracks = c.tracks.filter((t) => !/^root\.position/.test(t.name))
      const a = this.mixer.clipAction(c)
      a.enabled = true
      a.setEffectiveWeight(0)
      a.play()
      this.act.set(c.name, a)
    }
  }

  static async load(red: THREE.Material): Promise<Avatar> {
    const loader = new GLTFLoader()
    const base = `${import.meta.env.BASE_URL}avatar/`
    const [body, anims] = await Promise.all([loader.loadAsync(`${base}ranger.gltf`), loader.loadAsync(`${base}anims.glb`)])
    return new Avatar(body.scene, anims.animations, red)
  }

  bone(name: string): THREE.Bone | undefined {
    return this.bones.get(name)
  }

  private w(name: string, weight: number): void {
    this.act.get(name)?.setEffectiveWeight(weight)
  }

  private at(name: string, t01: number): void {
    const a = this.act.get(name)
    if (a) a.time = t01 * a.getClip().duration
  }

  update(dt: number, s: AvatarState): void {
    // (The speed changes on the simulation's 60 Hz steps: eased, so at 120 Hz the blend and the
    // stride's rate do not move in a staircase.)
    this.vS += ((s.grounded && !s.swimming ? s.speed : 0) - this.vS) * Math.min(1, dt * 14)
    const v = this.vS
    // The locomotion blend: idle → walk → jog → sprint by ground speed.
    const kW = THREE.MathUtils.smoothstep(v, 0.15, 1.2)
    const kJ = THREE.MathUtils.smoothstep(v, 2.4, 4.6)
    const kS = THREE.MathUtils.smoothstep(v, 6.5, 9.5)
    const wIdle = 1 - kW
    const wWalk = kW * (1 - kJ)
    const wJog = kW * kJ * (1 - kS)
    const wSprint = kW * kJ * kS
    // One phase for all three: advanced at the rate this blend's stride needs at this speed.
    const moving = wWalk + wJog + wSprint
    // (Standing, no stride: the walk's, so the phase never divides 0 by 0 — a NaN phase froze the legs.)
    const stride = moving > 1e-3 ? (wWalk * STRIDE.Walk_Loop + wJog * STRIDE.Jog_Fwd_Loop + wSprint * STRIDE.Sprint_Loop) / moving : STRIDE.Walk_Loop
    // (Past a sprint the stride lengthens rather than the legs blurring: capped at 2 cycles a second.)
    this.phase = (this.phase + Math.min(2.0, v / stride) * dt) % 1
    if (!Number.isFinite(this.phase)) this.phase = 0
    // The air: a take-off, the fall held, a landing that settles into the run.
    const inAir = !s.grounded && !s.swimming
    if (inAir && this.wasGrounded && s.vy > 1) this.startT = 0
    if (!inAir && !this.wasGrounded) this.landT = 0
    this.wasGrounded = !inAir
    this.air += ((inAir ? 1 : 0) - this.air) * Math.min(1, dt * 10)
    this.startT += dt
    this.landT += dt
    this.swim += ((s.swimming ? 1 : 0) - this.swim) * Math.min(1, dt * 5)
    // The other modes, each eased in and out over ~0.12 s.
    const want = { climb: s.mode === 'climb' ? 1 : 0, glide: s.mode === 'glide' ? 1 : 0, slide: s.mode === 'slide' ? 1 : 0, hang: s.mode === 'hang' ? 1 : 0 }
    for (const k of ['climb', 'glide', 'slide', 'hang'] as const) this.modeW[k] += (want[k] - this.modeW[k]) * Math.min(1, dt * 8)
    this.posedW = Math.min(1, this.modeW.climb + this.modeW.glide + this.modeW.slide + this.modeW.hang)
    const ground = (1 - this.air) * (1 - this.swim)
    // A landing: the clip's crouch, over the first 0.45 s of being down, then the run carries on.
    const land = ground * Math.max(0, 1 - this.landT / 0.45) * Math.min(1, this.landT * 12)
    const start = this.air * Math.max(0, 1 - this.startT / 0.35)
    this.w('Idle_Loop', ground * wIdle * (1 - land))
    this.w('Walk_Loop', ground * wWalk * (1 - land))
    this.w('Jog_Fwd_Loop', ground * wJog * (1 - land))
    this.w('Sprint_Loop', ground * wSprint * (1 - land))
    this.w('Jump_Land', land)
    this.w('Jump_Start', start)
    this.w('Jump_Loop', this.air * (1 - start))
    const swimGo = THREE.MathUtils.smoothstep(s.speed, 0.3, 1.6)
    this.w('Swim_Fwd_Loop', this.swim * swimGo)
    this.w('Swim_Idle_Loop', this.swim * (1 - swimGo))
    // Taking something from the ground: down on one knee (the kneeling clip, held), over everything
    // else, eased in and out (it was the pick-up-from-a-table clip, standing, mixed half with idle).
    const t = s.take
    const take = t < 0 ? 0 : t < 0.3 ? ease(t / 0.3) : t < 0.62 ? 1 : 1 - ease((t - 0.62) / 0.38)
    for (const a of this.act.values()) a.setEffectiveWeight(a.getEffectiveWeight() * (1 - take))
    this.w('Fixing_Kneeling', take)
    // Everything above scaled down while another mode takes the body, and that mode's clip in.
    for (const a of this.act.values()) a.setEffectiveWeight(a.getEffectiveWeight() * (1 - this.posedW))
    // Climbing: hand over hand (the push, its arms reaching ahead — on a wall, they reach up);
    // flying: the leap's hold, arms out; sliding: crouched; on the line: the leap's hold.
    this.w('Push_Loop', this.modeW.climb)
    this.w('Jump_Loop', this.act.get('Jump_Loop')!.getEffectiveWeight() + this.modeW.glide + this.modeW.hang)
    this.w('Crouch_Idle_Loop', this.modeW.slide)
    for (const n of ['Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop']) this.at(n, this.phase)
    this.at('Jump_Start', Math.min(0.99, 0.25 + this.startT / 1.33))
    this.at('Jump_Land', Math.min(0.99, this.landT / 0.6 * 0.55 + 0.1))
    this.at('Fixing_Kneeling', 0.3)
    // Idle, the jump's hold and swimming run on their own clocks.
    this.mixer.update(0)
    for (const n of ['Idle_Loop', 'Jump_Loop', 'Swim_Fwd_Loop', 'Swim_Idle_Loop', 'Push_Loop', 'Crouch_Idle_Loop']) {
      const a = this.act.get(n)
      // (Climbing moves at the pace you climb: still when you hold still.)
      const rate = n === 'Swim_Fwd_Loop' ? 0.6 + 0.5 * s.speed / 3 : n === 'Push_Loop' ? s.climbRate : 1
      if (a) a.time = (a.time + dt * rate) % a.getClip().duration
    }
    this.mixer.update(0)
  }

  /** Stride phase (0 … 1): a foot comes down at 0 and 0.5 (the game's footsteps listen). */
  get stride(): number {
    return this.phase
  }

  /** How much the clips hold the body now (0: another pose has it). */
  get clipsWeight(): number {
    return 1 - this.posedW
  }
}
