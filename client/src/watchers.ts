// Watchers: gaunt figures of branch and root, thirty to seventy metres tall,
// standing on the ridges. You only see them when the sky is heavy, and only
// at the edge of your sight: look straight at one and it thins into the haze.
// Over a minute they turn to face you. Walk toward one and it is not there
// when you arrive. Nothing else. (Where they point is worth going: the story
// will put things there.)

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { inHall, mulberry32, type Terrain } from '@titans/shared'

/** A tapering tube along points (radius r0 at the first, r1 at the last). */
function branch(points: THREE.Vector3[], r0: number, r1: number, sides = 7): THREE.BufferGeometry {
  // Thick enough to read as a silhouette from a few hundred metres, still gaunt.
  r0 *= 1.7
  r1 *= 1.7
  const curve = new THREE.CatmullRomCurve3(points)
  const segs = Math.max(4, points.length * 4)
  const pos: number[] = []
  const idx: number[] = []
  const frames = curve.computeFrenetFrames(segs, false)
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const c = curve.getPointAt(t)
    const r = r0 + (r1 - r0) * t
    const n = frames.normals[i]
    const b = frames.binormals[i]
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2
      // Knotted: the radius swells here and there.
      const knot = 1 + 0.25 * Math.max(0, Math.sin(t * 23 + k)) * Math.max(0, Math.sin(t * 7))
      pos.push(c.x + (n.x * Math.cos(a) + b.x * Math.sin(a)) * r * knot, c.y + (n.y * Math.cos(a) + b.y * Math.sin(a)) * r * knot, c.z + (n.z * Math.cos(a) + b.z * Math.sin(a)) * r * knot)
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let k = 0; k < sides; k++) {
      const a = i * sides + k
      const b = i * sides + ((k + 1) % sides)
      idx.push(a, a + sides, b, b, a + sides, b + sides)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g.toNonIndexed()
}

/** A wandering line from `a` toward `b`: `n` points, jittered sideways by `jit`. */
function path(rand: () => number, a: THREE.Vector3, b: THREE.Vector3, n: number, jit: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const p = a.clone().lerp(b, t)
    if (i > 0 && i < n - 1) p.add(new THREE.Vector3((rand() - 0.5) * jit, (rand() - 0.5) * jit * 0.5, (rand() - 0.5) * jit))
    out.push(p)
  }
  return out
}

/** One watcher, `H` metres tall, facing +z, one arm pointing out along +z. */
function watcherGeometry(seed: number, H: number): THREE.BufferGeometry {
  const rand = mulberry32(seed)
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x * H, y * H, z * H)
  const parts: THREE.BufferGeometry[] = []
  const hip = V(0, 0.55, 0)
  const shoulder = V(0, 0.84, 0.03)
  // Legs, a little apart, knees slightly bent.
  for (const s of [-1, 1]) {
    const foot = V(s * (0.08 + rand() * 0.04), 0, (rand() - 0.5) * 0.06)
    const knee = V(s * 0.07, 0.28, 0.03 + rand() * 0.02)
    parts.push(branch([hip.clone().add(V(s * 0.03, 0, 0)), knee, foot], H * 0.018, H * 0.008))
    // Roots at the feet.
    for (let r = 0; r < 3; r++) {
      const a = rand() * Math.PI * 2
      parts.push(branch([foot, foot.clone().add(V(Math.cos(a) * 0.05, -0.01, Math.sin(a) * 0.05))], H * 0.008, H * 0.002, 4))
    }
  }
  // The body: a bundle of three twisting stems, hunched forward.
  for (let k = 0; k < 3; k++) parts.push(branch(path(rand, hip.clone().add(V((k - 1) * 0.015, 0, 0)), shoulder.clone().add(V((k - 1) * 0.02, 0, 0)), 5, H * 0.03), H * 0.014, H * 0.01))
  // The head: small, long, crowned with twigs.
  const head = V(0, 0.95, 0.06)
  parts.push(branch([shoulder, V(0, 0.9, 0.05), head], H * 0.012, H * 0.016))
  for (let k = 0; k < 9; k++) {
    const a = rand() * Math.PI * 2
    parts.push(branch(path(rand, head, head.clone().add(V(Math.cos(a) * 0.04, 0.06 + rand() * 0.06, Math.sin(a) * 0.04)), 3, H * 0.01), H * 0.005, H * 0.001, 4))
  }
  // The pointing arm, out and a little down, gnarled fingers at its end.
  const pr = V(0.06, 0.84, 0.02)
  const hand = V(0.12, 0.8, 0.42)
  parts.push(branch(path(rand, pr, hand, 6, H * 0.02), H * 0.011, H * 0.005))
  for (let k = 0; k < 4; k++) parts.push(branch(path(rand, hand, hand.clone().add(V((rand() - 0.5) * 0.04, -0.02 - rand() * 0.03, 0.05 + rand() * 0.04)), 3, H * 0.008), H * 0.004, H * 0.001, 4))
  // The other arm, hanging to the knee, fingers trailing.
  const pl = V(-0.06, 0.84, 0.02)
  const hand2 = V(-0.1, 0.32, 0.07)
  parts.push(branch(path(rand, pl, hand2, 6, H * 0.025), H * 0.011, H * 0.005))
  for (let k = 0; k < 5; k++) parts.push(branch(path(rand, hand2, hand2.clone().add(V((rand() - 0.5) * 0.05, -0.08 - rand() * 0.06, (rand() - 0.5) * 0.04)), 3, H * 0.01), H * 0.004, H * 0.001, 4))
  // Strands hanging from the arms and body.
  for (let k = 0; k < 10; k++) {
    const from = rand() < 0.5 ? pr.clone().lerp(hand, rand()) : hip.clone().lerp(shoulder, rand())
    parts.push(branch([from, from.clone().add(V((rand() - 0.5) * 0.02, -0.06 - rand() * 0.14, (rand() - 0.5) * 0.02))], H * 0.002, H * 0.0008, 3))
  }
  return mergeGeometries(parts)!
}

interface Watcher {
  mesh: THREE.Mesh
  mat: THREE.MeshStandardMaterial
  x: number
  z: number
  /** Where it points (yaw), and where it is turned now. */
  yaw: number
  /** 0 … 1: how much there it is. */
  seen: number
  /** How close you can come before it thins away. */
  near: number
}

export class Watchers {
  readonly group = new THREE.Group()
  readonly watchers: Watcher[] = []
  private readonly look = new THREE.Vector3()
  private readonly to = new THREE.Vector3()
  private readonly geos: THREE.BufferGeometry[]

  constructor(
    terrain: Terrain,
    seed: number,
    /** Somewhere nothing may stand (rock, a colossus). */
    occupied: (x: number, z: number) => boolean,
    count = 9,
  ) {
    const rand = mulberry32(seed ^ 0x3a7c4)
    this.geos = [watcherGeometry(seed + 1, 1), watcherGeometry(seed + 2, 1), watcherGeometry(seed + 3, 1)]
    // On ridges and rises (silhouettes against the sky), away from each other.
    const cands: Array<{ x: number; z: number; rise: number }> = []
    for (let i = 0; i < 900; i++) {
      const a = rand() * Math.PI * 2
      const d = 400 + rand() * 2100
      const x = Math.cos(a) * d
      const z = Math.sin(a) * d
      if (terrain.base.regions.name(x, z) === 'desert' || inHall(x, z, 80) || occupied(x, z)) continue
      const h = terrain.heightAt(x, z)
      // Under the cloud deck (its base is ~255 m): only their heads may reach into it.
      if (h > 160) continue
      // A rounded rise, not a mesa: the ground falls away gently all round, so
      // the figure stands against the sky from below instead of hiding behind an edge.
      let ring = 0
      let rough = 0
      for (let k = 0; k < 8; k++) {
        const near = terrain.heightAt(x + Math.cos(k * 0.785) * 60, z + Math.sin(k * 0.785) * 60)
        const far = terrain.heightAt(x + Math.cos(k * 0.785) * 220, z + Math.sin(k * 0.785) * 220)
        rough = Math.max(rough, Math.abs(h - near), Math.abs(near - far) / 2)
        ring += far
      }
      if (rough > 14) continue
      cands.push({ x, z, rise: h - ring / 8 })
    }
    cands.sort((a, b) => b.rise - a.rise)
    for (const c of cands) {
      if (this.watchers.length >= count) break
      if (this.watchers.some((w) => Math.hypot(w.x - c.x, w.z - c.z) < 650)) continue
      const H = 34 + rand() * 36
      // Writes depth even while fading: otherwise the cloud deck and puffs, drawn after it
      // though farther away, paint straight over it.
      const mat = new THREE.MeshStandardMaterial({ color: 0x1d1e1b, roughness: 1, transparent: true, opacity: 0, depthWrite: true })
      const mesh = new THREE.Mesh(this.geos[this.watchers.length % 3], mat)
      mesh.scale.setScalar(H)
      mesh.position.set(c.x, terrain.heightAt(c.x, c.z) - 0.5, c.z)
      const yaw = rand() * Math.PI * 2
      mesh.rotation.y = yaw
      mesh.castShadow = false
      mesh.visible = false
      this.group.add(mesh)
      this.watchers.push({ mesh, mat, x: c.x, z: c.z, yaw, seen: 0, near: 140 + H })
    }
  }

  /**
   * Each frame. `heavy` (0 … 1): how overcast it is — they only show under a
   * heavy sky. They turn toward `player`, slowly; they are gone when you come close.
   */
  update(dt: number, player: THREE.Vector3, heavy: number, camera: THREE.Camera): void {
    camera.getWorldDirection(this.look)
    for (const w of this.watchers) {
      const d = Math.hypot(w.x - player.x, w.z - player.z)
      // Where you are looking: straight at it, it is not there.
      this.to.set(w.x, w.mesh.position.y + w.mesh.scale.x * 0.6, w.z).sub(camera.position).normalize()
      const gaze = THREE.MathUtils.smoothstep(this.look.dot(this.to), 0.995, 0.96)
      // There: under a heavy sky, beyond arm's reach, not so far the haze takes them anyway.
      const want = gaze * THREE.MathUtils.smoothstep(heavy, 0.3, 0.6) * THREE.MathUtils.smoothstep(d, w.near, w.near * 1.5) * (1 - THREE.MathUtils.smoothstep(d, 2400, 3200))
      // They come slowly and go quickly.
      w.seen += (want - w.seen) * Math.min(1, dt * (want > w.seen ? 0.25 : 0.9))
      w.mesh.visible = w.seen > 0.01
      if (!w.mesh.visible) continue
      w.mat.opacity = w.seen
      // Turning toward you, over a minute or so.
      const to = Math.atan2(player.x - w.x, player.z - w.z)
      let dy = to - w.yaw
      dy = Math.atan2(Math.sin(dy), Math.cos(dy))
      w.yaw += dy * Math.min(1, dt * 0.03)
      w.mesh.rotation.y = w.yaw
    }
  }

  /** How many are there now (tools). */
  get showing(): number {
    return this.watchers.filter((w) => w.seen > 0.5).length
  }
}
