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
import { mulberry32, type Terrain } from '@titans/shared'

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
        thigh.frustumCulled = shin.frustumCulled = knee.frustumCulled = false
        group.add(thigh, shin, knee)
        legs.push({ thigh, shin, knee, foot: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), swing: -1, angle: (l / LEGS) * Math.PI * 2 + Math.PI / LEGS })
      }
      body.castShadow = neck.castShadow = true
      for (const m of [body, neck]) m.frustumCulled = false
      threads.frustumCulled = false
      const orbit = rand() * Math.PI * 2
      const radius = 1900 + rand() * 900
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
    return out.set(x, this.terrain.heightAt(x, z), z)
  }

  update(dt: number): void {
    this.t += dt
    for (const s of this.striders) {
      // Round the far lands, slowly, the loop bending as it goes.
      const w = s.speed / s.radius
      s.orbit += w * dt
      const r = s.radius + Math.sin(s.orbit * 3 + s.phase) * 350
      const nx = Math.cos(s.orbit) * r
      const nz = Math.sin(s.orbit) * r
      s.heading = Math.atan2(nx - s.x, nz - s.z)
      s.x = nx
      s.z = nz
      const ground = this.terrain.heightAt(s.x, s.z)
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
          if (leg.swing >= 1) leg.swing = -1
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
