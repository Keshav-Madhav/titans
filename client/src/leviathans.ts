// Leviathans: things the size of the giants' ships, if the giants had ships,
// swimming through the sky a kilometre up. Long pale bodies, wing-like fins
// beating once every ten seconds, a slow wave running down to the tail; their
// shadows cross the land. They do nothing to you. That is not the point.

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { mulberry32 } from '@titans/shared'

interface Beast {
  mesh: THREE.Mesh
  /** Its loop: centre, radii, height, speed (radians a second), phase. */
  cx: number
  cz: number
  rx: number
  rz: number
  y: number
  w: number
  phase: number
  scale: number
}

/**
 * A fin: a curved, swept surface out to one side — broad at the root,
 * narrowing to a rounded tip, drooping as it goes. `aFlap` grows to the tip.
 */
function fin(side: number, rootZ: number, span: number, chord: number, sweep: number, droop: number, rootX: number): THREE.BufferGeometry {
  const U = 10
  const V = 3
  const pos: number[] = []
  const flap: number[] = []
  for (let i = 0; i <= U; i++) {
    const u = i / U
    const c = chord * (Math.pow(1 - u, 0.55) * 0.9 + 0.1) * (1 - 0.6 * u * u * u)
    const lead = rootZ - sweep * u * u
    for (let j = 0; j <= V; j++) {
      const v = j / V
      pos.push(side * (rootX + span * u), -droop * u * u - 6 * Math.sin(v * Math.PI) * (1 - u), lead - c * v)
      flap.push(Math.pow(u, 1.4))
    }
  }
  const index: number[] = []
  for (let i = 0; i < U; i++) {
    for (let j = 0; j < V; j++) {
      const a = i * (V + 1) + j
      const b = a + V + 1
      if (side > 0) index.push(a, b, a + 1, a + 1, b, b + 1)
      else index.push(a, a + 1, b, a + 1, b + 1, b)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('aFlap', new THREE.Float32BufferAttribute(flap, 1))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}

/** A body along +z (head forward), broad fins out to the sides, flukes at the tail. `aFlap`: how far a vertex beats. */
function beastGeometry(): THREE.BufferGeometry {
  const L = 560
  // Body: a lathe of a whale's profile (blunt head, long tapering tail), turned to lie along z.
  const profile: THREE.Vector2[] = []
  for (let i = 0; i <= 48; i++) {
    const t = i / 48 // 0 tail … 1 head
    const r = 82 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.62)), 0.7) * (0.18 + 0.82 * Math.pow(t, 0.8)) + 3
    profile.push(new THREE.Vector2(r, (t - 0.5) * L))
  }
  const body = new THREE.LatheGeometry(profile, 32).rotateX(Math.PI / 2)
  // Flattened underneath; a ridge along the back.
  const bp = body.getAttribute('position')
  for (let i = 0; i < bp.count; i++) {
    const y = bp.getY(i)
    const x = bp.getX(i)
    if (y < 0) bp.setY(i, y * 0.7)
    else bp.setY(i, y * (1 + 0.15 * Math.exp(-(x * x) / 200)))
  }
  body.computeVertexNormals()
  body.setAttribute('aFlap', new THREE.Float32BufferAttribute(new Float32Array(bp.count), 1))
  const parts: THREE.BufferGeometry[] = [body]
  for (const side of [-1, 1]) {
    // Great fins behind the head; a smaller pair toward the tail.
    parts.push(fin(side, 150, 330, 190, 110, 60, 55))
    parts.push(fin(side, -110, 140, 90, 50, 25, 35))
  }
  // Tail flukes: a broad crescent.
  for (const side of [-1, 1]) {
    const f = fin(side, -255, 130, 70, 60, -10, 4)
    parts.push(f)
  }
  const all = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p
    g.deleteAttribute('uv')
    return g
  })
  const g = mergeGeometries(all)!
  // Pale belly, darker mottled back.
  const pos = g.getAttribute('position')
  const col = new Float32Array(pos.count * 3)
  const back = new THREE.Color(0x5f6a73)
  const belly = new THREE.Color(0xd9d3c4)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const z = pos.getZ(i)
    c.copy(back).lerp(belly, THREE.MathUtils.smoothstep(y, 12, -30))
    const mottle = 0.86 + 0.14 * Math.sin(z * 0.06) * Math.sin(pos.getX(i) * 0.08 + z * 0.02)
    col.set([c.r * mottle, c.g * mottle, c.b * mottle], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

export class Leviathans {
  readonly group = new THREE.Group()
  readonly beasts: Beast[] = []
  private readonly time = { value: 0 }
  private readonly tmp = new THREE.Vector3()

  constructor(seed: number, count = 3) {
    const rand = mulberry32(seed ^ 0x1e71a7)
    const geo = beastGeometry()
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide })
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.time
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aFlap;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          // Each beast keeps its own time (its world position offsets the phase).
          float ph = modelMatrix[3].x * 0.001 + modelMatrix[3].z * 0.0013;
          // The fins beat slowly; a wave runs down the body to the tail.
          transformed.y += sin(uTime * 0.6 + ph - aFlap * 0.8) * aFlap * 85.0;
          float tail = smoothstep(120.0, -300.0, position.z);
          transformed.x += sin(uTime * 0.45 + ph + position.z * 0.006) * tail * 26.0;
          transformed.y += cos(uTime * 0.45 + ph + position.z * 0.006) * tail * 10.0;`,
        )
    }
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, mat)
      mesh.castShadow = true
      mesh.frustumCulled = false
      const scale = 0.8 + rand() * 0.5
      mesh.scale.setScalar(scale)
      this.group.add(mesh)
      this.beasts.push({
        mesh,
        cx: (rand() - 0.5) * 1600,
        cz: (rand() - 0.5) * 1600,
        rx: 1600 + rand() * 1400,
        rz: 1300 + rand() * 1400,
        y: 950 + i * 260 + rand() * 200,
        w: (0.0055 + rand() * 0.003) * (i % 2 ? 1 : -1),
        phase: rand() * 6.28,
        scale,
      })
    }
  }

  update(dt: number): void {
    this.time.value += dt
    const t = this.time.value
    for (const b of this.beasts) {
      const a = b.phase + t * b.w
      const x = b.cx + Math.cos(a) * b.rx
      const z = b.cz + Math.sin(a) * b.rz
      // Heading along the loop (its derivative), banking into the turn.
      const dx = -Math.sin(a) * b.rx * b.w
      const dz = Math.cos(a) * b.rz * b.w
      b.mesh.position.set(x, b.y + Math.sin(t * 0.05 + b.phase) * 60, z)
      b.mesh.rotation.set(0, Math.atan2(dx, dz), 0)
      b.mesh.rotateZ(Math.sign(b.w) * 0.12)
      b.mesh.rotateX(Math.sin(t * 0.05 + b.phase) * 0.04)
    }
  }

  /** The nearest beast's position (tools). */
  nearest(p: THREE.Vector3): THREE.Vector3 {
    let best = this.beasts[0].mesh.position
    for (const b of this.beasts) if (b.mesh.position.distanceTo(p) < best.distanceTo(p)) best = b.mesh.position
    return this.tmp.copy(best)
  }
}
