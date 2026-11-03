// The reveal (the new-player pass: "we start in the middle already facing a
// giant, no surprise or awe of discovery"). You wake in the dark under the
// Green and climb out; the first time you step onto the grass, the camera
// leaves you — rises behind you, and turns to show you the land: the Green
// going on and on, one of them walking across it far off, the Sentinel
// kneeling beyond. Then it comes back to you. Once, and only once.

import * as THREE from 'three'

const LENGTH = 10.5
const RISE = 3.4
const BACK = 2.4
/** Where the shot stands: behind you (away from what it shows) and above. */
const SHOT_BACK = 18
const SHOT_UP = 6
/** How much of a swing the view turns back toward what it shows (0: straight past you). */
const AIM = 0.7

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))

export class Reveal {
  /** Seconds in (null: not happening). */
  t: number | null = null
  private readonly target = new THREE.Vector3()
  private readonly from = new THREE.Vector3()
  private readonly shotPos = new THREE.Vector3()
  private readonly shotQ = new THREE.Quaternion()
  private readonly rigQ = new THREE.Quaternion()
  private readonly look = new THREE.Matrix4()
  private skip = false
  private readonly bars = document.getElementById('bars')

  constructor() {
    addEventListener('keydown', () => {
      if (this.t !== null && this.t > 2.5) this.skip = true
    })
  }

  get active(): boolean {
    return this.t !== null
  }

  /**
   * Begin: `player` where you stand, `target` what to show (far off, up in the
   * sky: a giant's chest, a colossus's head); `clutter` scores how much what stands at a
   * point should stay out of the shot (the hall's roof, most; a tree near the eye).
   */
  begin(player: THREE.Vector3, target: THREE.Vector3, ground: (x: number, z: number) => number, clutter: (x: number, z: number) => number = () => 0): void {
    this.t = 0
    this.skip = false
    this.from.copy(player)
    this.target.copy(target)
    // Behind you and a little above, on the side away from it: you, small, in
    // the bottom of the frame, and it, far off, in the top of it. (Swung round
    // you a little either way, whichever keeps the most clutter out of the view.)
    const base = Math.atan2(player.x - target.x, player.z - target.z)
    let bestA = base
    let bestN = Infinity
    for (const swing of [0, 0.3, -0.3, 0.55, -0.55]) {
      const a = base + swing
      const cx = player.x + Math.sin(a) * SHOT_BACK
      const cz = player.z + Math.cos(a) * SHOT_BACK
      // Along the view out to 400 m (dense near: a tree close by fills the frame), across it at ±15°.
      const view = a + Math.PI - swing * AIM
      let n = Math.abs(swing) * 2
      for (let d = 8; d <= 400; d += d < 120 ? 8 : 20)
        for (const side of [-0.26, 0, 0.26]) {
          const vx = Math.sin(view + side)
          const vz = Math.cos(view + side)
          n += clutter(cx + vx * d, cz + vz * d) * (d < 120 ? 2 : 1)
        }
      if (n < bestN) {
        bestN = n
        bestA = a
      }
    }
    const away = new THREE.Vector3(Math.sin(bestA), 0, Math.cos(bestA))
    this.shotPos.copy(player).addScaledVector(away, SHOT_BACK)
    this.shotPos.y = Math.max(player.y, ground(this.shotPos.x, this.shotPos.z)) + SHOT_UP
    // Facing mostly toward it (a shot swung aside to dodge clutter still has it in frame; you,
    // off to one side, in the bottom of the frame).
    const view = bestA + Math.PI - (bestA - base) * AIM
    const dir = new THREE.Vector3(Math.sin(view), 0, Math.cos(view))
    // The pitch that holds both: halfway between where you are and where it is (and a touch up).
    const flat = (p: THREE.Vector3) => Math.hypot(p.x - this.shotPos.x, p.z - this.shotPos.z)
    const toYou = Math.atan2(player.y + 0.9 - this.shotPos.y, flat(player))
    const toIt = Math.atan2(target.y - this.shotPos.y, flat(target))
    // (Halfway put you on the letterbox's edge, cut by the bar, and the drift up sank you
    // further: keep you ~11° under the middle, so long as it stays in the top of the frame.)
    const pitch = Math.min(0.3, Math.max(toIt - 0.28, Math.min(toYou + 0.2, (toYou + toIt) / 2 + 0.04)))
    const look = this.shotPos.clone().add(new THREE.Vector3(dir.x * Math.cos(pitch), Math.sin(pitch), dir.z * Math.cos(pitch)))
    this.look.lookAt(this.shotPos, look, new THREE.Vector3(0, 1, 0))
    this.shotQ.setFromRotationMatrix(this.look)
    this.bars?.classList.add('on')
    document.body.classList.add('cine')
  }

  /** Each frame after the rig has placed the camera: blend toward the shot. Returns true while it holds the camera. */
  update(dt: number, camera: THREE.PerspectiveCamera, baseFov: number): boolean {
    if (this.t === null) return false
    this.t += dt
    if (this.skip && this.t < LENGTH - BACK) this.t = LENGTH - BACK
    const t = this.t
    const k = t < RISE ? ease(t / RISE) : t < LENGTH - BACK ? 1 : 1 - ease((t - (LENGTH - BACK)) / BACK)
    // A slow drift sideways and up while it holds: the land turning under the eye.
    const drift = new THREE.Vector3((t - RISE) * 0.7, (t - RISE) * 0.1, 0)
    this.rigQ.copy(camera.quaternion)
    camera.position.lerp(this.shotPos.clone().add(drift.applyQuaternion(this.shotQ)), k)
    camera.quaternion.copy(this.rigQ).slerp(this.shotQ, k)
    camera.fov = baseFov + (46 - baseFov) * k
    camera.updateProjectionMatrix()
    if (t > LENGTH - BACK * 0.6) {
      this.bars?.classList.remove('on')
      document.body.classList.remove('cine')
    }
    if (t >= LENGTH) {
      this.t = null
      camera.fov = baseFov
      camera.updateProjectionMatrix()
      return false
    }
    return true
  }
}
