// Striders: pale things on legs five hundred metres long, walking slowly
// across the far lands. A small spined body up where the cloud is, a long neck
// rising higher, threads hanging beneath it. Under a low sky you see only the
// legs, coming down out of the cloud. They do not come for you; they are
// going somewhere. (No jumpscares: this is what the weather is for.)
//
// Each leg is two long, thin bones: the thigh up and out from the hip to a
// high knee, the shin down to a foot planted on the ground. A foot left too
// far behind the body lifts and swings forward, one leg at a time, slowly.

import * as THREE from 'three'
import { mulberry32, SPREAD, type Terrain, SHORE } from '@titans/shared'

const LEGS = 4
const HIP = 470 // body height above the ground
const THIGH = 260
const SHIN = 560
const STEP_TIME = 5 // seconds a foot is in the air
const REACH = 210 // how far out from the body a foot rests

interface Leg {
  thigh: THREE.Mesh
  shin: THREE.Mesh
  knee: THREE.Mesh
  foot: THREE.Vector3
  from: THREE.Vector3
  to: THREE.Vector3
  swing: number // < 0: planted; 0 … 1 through a step
  angle: number // where its foot rests, around the body
}

interface Strider {
  group: THREE.Group
  body: THREE.Mesh
  neck: THREE.Mesh
  threads: THREE.LineSegments
  legs: Leg[]
  x: number
  z: number
  heading: number
  speed: number
  /** Its wandering: a loop round the far lands. */
  orbit: number
  radius: number
  phase: number
}

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _d = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const _k = new THREE.Vector3()
const _h = new THREE.Vector3()

/** Point a unit-length, base-at-origin bone from a to b. */
function bone(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
  _d.subVectors(b, a)
  const len = _d.length()
  m.position.copy(a)
  m.quaternion.setFromUnitVectors(_up, _d.divideScalar(len || 1))
  m.scale.set(1, len, 1)
}

export class Striders {
  readonly group = new THREE.Group()
  readonly striders: Strider[] = []
  /** A foot coming down (world point on the ground): dust, a thud, the ground trembling (main.ts). */
  onFootfall: (x: number, y: number, z: number) => void = () => {}

  /**
   * Push `p` (a body's centre, world) out of any strider leg it is inside, sideways; `r` its radius.
   * The legs were ghosts — the user, 2026-11-08, "the strider legs are non collideable". Each shin is
   * a tapered pole from the knee (10 m thick) down to the foot (0.6 m); the thigh from the hip (13 m)
   * to the knee (8 m). Returns true if it moved.
   */
  /** Distance from (x, y, z) to the nearest leg's surface (negative inside) — for the camera. */
  sdf(x: number, y: number, z: number): number {
    let best = Infinity
    for (const s of this.striders) {
      if (Math.abs(s.x - x) > THIGH + SHIN || Math.abs(s.z - z) > THIGH + SHIN) continue
      for (const leg of s.legs) {
        for (const [a, b, ra, rb] of [[leg.knee.position, leg.foot, 10, 0.6], [_hip.set(s.x, leg.knee.position.y, s.z), leg.knee.position, 13, 8]] as Array<[THREE.Vector3, THREE.Vector3, number, number]>) {
          _sd.subVectors(b, a)
          const l2 = _sd.lengthSq() || 1
          const t = Math.min(1, Math.max(0, ((x - a.x) * _sd.x + (y - a.y) * _sd.y + (z - a.z) * _sd.z) / l2))
          _sp.copy(a).addScaledVector(_sd, t)
          best = Math.min(best, Math.hypot(x - _sp.x, y - _sp.y, z - _sp.z) - (ra + (rb - ra) * t))
        }
      }
    }
    return best
  }

  pushOut(p: THREE.Vector3, r = 0.45): boolean {
    let moved = false
    for (const s of this.striders) {
      if (Math.abs(s.x - p.x) > THIGH + SHIN || Math.abs(s.z - p.z) > THIGH + SHIN) continue
      for (const leg of s.legs) {
        for (const [a, b, ra, rb] of [[leg.knee.position, leg.foot, 10, 0.6], [_hip.set(s.x, leg.knee.position.y, s.z), leg.knee.position, 13, 8]] as Array<[THREE.Vector3, THREE.Vector3, number, number]>) {
          // Nearest point on the segment, and the pole's radius there.
          _sd.subVectors(b, a)
          const l2 = _sd.lengthSq() || 1
          const t = Math.min(1, Math.max(0, ((p.x - a.x) * _sd.x + (p.y - a.y) * _sd.y + (p.z - a.z) * _sd.z) / l2))
          _sp.copy(a).addScaledVector(_sd, t)
          const rad = ra + (rb - ra) * t + r
          const dx = p.x - _sp.x
          const dz = p.z - _sp.z
          const dh = Math.hypot(dx, dz)
          if (dh < rad && Math.abs(p.y - _sp.y) < rad + 2) {
            const k = (rad - dh) / (dh || 1)
            p.x += (dh > 1e-3 ? dx : 1) * k
            p.z += (dh > 1e-3 ? dz : 0) * k
            moved = true
          }
        }
      }
    }
    return moved
  }
  private t = 0

  constructor(
    private readonly terrain: Terrain,
    seed: number,
    count = 3,
  ) {
    const rand = mulberry32(seed ^ 0x57e1de)
    const pale = new THREE.MeshStandardMaterial({ color: 0xbfbbb2, roughness: 0.92 })
    // A bone: base at the origin, up the y axis, one metre long, tapering.
    const thighGeo = new THREE.CylinderGeometry(8, 13, 1, 10, 1).translate(0, 0.5, 0)
    // The shin narrows to a point where it meets the ground (no flat-cut ends up close).
    const shinGeo = new THREE.CylinderGeometry(0.6, 10, 1, 12, 4).translate(0, 0.5, 0)
    const kneeGeo = new THREE.SphereGeometry(13, 14, 10)
    // The body: a long spined spindle; the neck, a thin column with a small head.
    const bodyGeo = new THREE.CylinderGeometry(20, 14, 150, 14, 6).rotateX(Math.PI / 2)
    const bp = bodyGeo.getAttribute('position')
    for (let i = 0; i < bp.count; i++) {
      const z = bp.getZ(i) / 75
      const k = 1 - z * z * 0.6
      bp.setXYZ(i, bp.getX(i) * k, bp.getY(i) * k, bp.getZ(i))
    }
    bodyGeo.computeVertexNormals()
    const spines: THREE.BufferGeometry[] = [bodyGeo]
    for (let i = 0; i < 14; i++) {
      const s = new THREE.ConeGeometry(2.5, 40 + rand() * 60, 6).translate(0, 30, 0)
      s.rotateZ((rand() - 0.5) * 1.6).rotateX(-0.5 - rand() * 0.6)
      s.translate((rand() - 0.5) * 20, 12, -60 + i * 9)
      spines.push(s)
    }
    const neckGeo = new THREE.CylinderGeometry(2.5, 9, 1, 8, 1).translate(0, 0.5, 0)
    for (let s = 0; s < count; s++) {
      const group = new THREE.Group()
      const body = new THREE.Mesh(mergeAll(spines), pale)
      const neck = new THREE.Mesh(neckGeo, pale)
      group.add(body, neck)
      // Threads hanging from the belly, swaying.
      const pos: number[] = []
      for (let i = 0; i < 26; i++) {
        const x = (rand() - 0.5) * 30
        const z = (rand() - 0.5) * 120
        const len = 120 + rand() * 220
        pos.push(x, 0, z, x, -len, z)
      }
      const tg = new THREE.BufferGeometry()
      tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      const threads = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: 0xcfcbc2, transparent: true, opacity: 0.55 }))
      group.add(threads)
      const legs: Leg[] = []
      for (let l = 0; l < LEGS; l++) {
        const thigh = new THREE.Mesh(thighGeo, pale)
        const shin = new THREE.Mesh(shinGeo, pale)
        const knee = new THREE.Mesh(kneeGeo, pale)
        thigh.castShadow = shin.castShadow = knee.castShadow = true
        group.add(thigh, shin, knee)
        legs.push({ thigh, shin, knee, foot: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), swing: -1, angle: (l / LEGS) * Math.PI * 2 + Math.PI / LEGS })
      }
      body.castShadow = neck.castShadow = true
      // (Culled part by part, as anything else: each is an ordinary posed mesh. Never culled,
      // all ~90 parts were drawn from anywhere, behind you or kilometres off.)
      const orbit = rand() * Math.PI * 2
      const radius = (1900 + rand() * 900) * SPREAD
      const st: Strider = { group, body, neck, threads, legs, x: 0, z: 0, heading: 0, speed: 3.2 + rand() * 1.6, orbit, radius, phase: rand() * 10 }
      st.x = Math.cos(orbit) * radius
      st.z = Math.sin(orbit) * radius
      for (const leg of st.legs) this.rest(st, leg, leg.foot)
      this.striders.push(st)
      this.group.add(group)
    }
  }

  /** Where a leg's foot rests now: out from the body at its angle, a little ahead. */
  private rest(s: Strider, leg: Leg, out: THREE.Vector3): THREE.Vector3 {
    const a = s.heading + leg.angle
    const x = s.x + Math.sin(a) * REACH + Math.sin(s.heading) * 90
    const z = s.z + Math.cos(a) * REACH + Math.cos(s.heading) * 90
    // (In deep water a foot goes down only so far: the sea hides the rest.)
    return out.set(x, Math.max(this.terrain.heightAt(x, z), SHORE.sea - 40), z)
  }

  update(dt: number): void {
    this.t += dt
    for (const s of this.striders) {
      // Round the far lands, slowly, the loop bending as it goes.
      const w = s.speed / s.radius
      // Due south their loop runs out past the beach: they wade out into the sea a long way,
      // and come back (STORY: "striders wading out to sea").
      const pathAt = (orbit: number): [number, number] => {
        let r = s.radius + Math.sin(orbit * 3 + s.phase) * 350 * SPREAD
        let ds = (orbit - Math.PI / 2) % (Math.PI * 2)
        if (ds > Math.PI) ds -= Math.PI * 2
        if (ds < -Math.PI) ds += Math.PI * 2
        r += Math.max(0, SHORE.coast + 3800 - r) * Math.exp(-((ds / 0.22) ** 2))
        return [Math.cos(orbit) * r, Math.sin(orbit) * r]
      }
      // (Never faster than its legs: going out to sea the loop's radius changes far faster than
      // the orbit turns, and the body ran out ahead of its feet, legs stretched across the sky.)
      let [nx, nz] = pathAt(s.orbit + w * dt)
      const moved = Math.hypot(nx - s.x, nz - s.z)
      const limit = s.speed * dt * 1.05
      if (moved > limit && moved > 1e-6) {
        const k = limit / moved
        s.orbit += w * dt * k
        ;[nx, nz] = pathAt(s.orbit)
      } else s.orbit += w * dt
      s.heading = Math.atan2(nx - s.x, nz - s.z)
      s.x = nx
      s.z = nz
      // (In the sea the body keeps up at the water, not down with the bed: the legs go down to it.)
      const ground = Math.max(this.terrain.heightAt(s.x, s.z), SHORE.sea - 40)
      const bob = Math.sin(this.t * 0.35 + s.phase) * 8
      const hip = _a.set(s.x, ground + HIP + bob, s.z)
      s.body.position.copy(hip)
      s.body.rotation.set(Math.sin(this.t * 0.2 + s.phase) * 0.05, s.heading, 0)
      // The neck rises from the front of the body, swaying; a long way up.
      const front = _b.set(s.x + Math.sin(s.heading) * 60, hip.y + 10, s.z + Math.cos(s.heading) * 60)
      const head = _h.set(front.x + Math.sin(s.heading) * 120 + Math.sin(this.t * 0.15 + s.phase) * 60, front.y + 340, front.z + Math.cos(s.heading) * 120)
      bone(s.neck, front, head)
      s.threads.position.copy(hip)
      s.threads.rotation.set(Math.sin(this.t * 0.4 + s.phase) * 0.08, s.heading, Math.cos(this.t * 0.33 + s.phase) * 0.08)
      // Legs: one in the air at a time, the one left furthest behind.
      const swinging = s.legs.some((l) => l.swing >= 0)
      let worst: Leg | null = null
      let worstD = 0
      for (const leg of s.legs) {
        const restAt = this.rest(s, leg, _b)
        const d = Math.hypot(leg.foot.x - restAt.x, leg.foot.z - restAt.z)
        if (leg.swing < 0 && d > 170 && d > worstD) {
          worst = leg
          worstD = d
        }
      }
      if (!swinging && worst) {
        worst.swing = 0
        worst.from.copy(worst.foot)
        this.rest(s, worst, worst.to)
        // Aim ahead of the rest point: the body keeps moving while it swings.
        worst.to.x += Math.sin(s.heading) * s.speed * STEP_TIME
        worst.to.z += Math.cos(s.heading) * s.speed * STEP_TIME
        worst.to.y = this.terrain.heightAt(worst.to.x, worst.to.z)
      }
      for (const leg of s.legs) {
        if (leg.swing >= 0) {
          leg.swing += dt / STEP_TIME
          const k = Math.min(1, leg.swing)
          const e = k * k * (3 - 2 * k)
          leg.foot.lerpVectors(leg.from, leg.to, e)
          leg.foot.y += Math.sin(k * Math.PI) * 90
          if (leg.swing >= 1) {
            leg.swing = -1
            // Down: it lands (the user, 2026-11-08: the legs had no impact with the ground).
            this.onFootfall(leg.foot.x, this.terrain.heightAt(leg.foot.x, leg.foot.z), leg.foot.z)
          }
        }
        // Two-bone leg: hip → knee (high and out) → foot.
        const hipL = _a.set(s.x, ground + HIP + bob - 6, s.z)
        const dx = leg.foot.x - hipL.x
        const dz = leg.foot.z - hipL.z
        const flat = Math.hypot(dx, dz) || 1
        const D = Math.min(THIGH + SHIN - 1, hipL.distanceTo(leg.foot))
        // Knee height by the law of cosines, pushed outward along the leg's direction.
        const cos = (THIGH * THIGH + D * D - SHIN * SHIN) / (2 * THIGH * D)
        const ang = Math.acos(Math.max(-1, Math.min(1, cos)))
        const down = Math.atan2(hipL.y - leg.foot.y, flat)
        const kneeA = ang - down // angle above horizontal, outward
        const knee = _k.set(hipL.x + (dx / flat) * Math.cos(kneeA) * THIGH, hipL.y + Math.sin(kneeA) * THIGH, hipL.z + (dz / flat) * Math.cos(kneeA) * THIGH)
        bone(leg.thigh, hipL, knee)
        bone(leg.shin, knee, leg.foot)
        leg.knee.position.copy(knee)
      }
      s.group.updateMatrixWorld(true)
    }
  }
}

const _hip = new THREE.Vector3()
const _sd = new THREE.Vector3()
const _sp = new THREE.Vector3()

function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Small local merge (no extra import of the utils in this module's hot path).
  const geos = parts.map((p) => (p.index ? p.toNonIndexed() : p))
  let n = 0
  for (const g of geos) n += g.getAttribute('position').count
  const pos = new Float32Array(n * 3)
  const nrm = new Float32Array(n * 3)
  let o = 0
  for (const g of geos) {
    g.computeVertexNormals()
    pos.set(g.getAttribute('position').array as Float32Array, o * 3)
    nrm.set(g.getAttribute('normal').array as Float32Array, o * 3)
    o += g.getAttribute('position').count
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  return out
}
