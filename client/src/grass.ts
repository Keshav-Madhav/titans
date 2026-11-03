// Grass: dense fields of it, rolling in waves when the wind blows, parting
// round you as you walk. Alpha-cut cards (three crossed quads, each painted
// with dozens of blades) in 12 m cells round the camera, densest in the
// meadows, thin under trees, none in the dunes, on cliffs or under water.
// Everything that moves happens in the vertex shader; the CPU only lays out
// cells as you go. At the edge of its range the grass sinks into the ground,
// so nothing pops.

import * as THREE from 'three'
import { inHall, mulberry32, type LakeSystem, type Terrain, SHORE, seaward } from '@titans/shared'
import type { Biome } from './biome'

const CELL = 12
const RADIUS = 76
const PER_CELL = 420
const CAP = 38000
/** New cells laid per frame (the rest wait a frame or two). */
const FRESH_PER_FRAME = 3

/** The blades: a canvas of thin curved strokes, light at the tips. */
function bladesTexture(): THREE.CanvasTexture {
  const W = 256
  const H = 128
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const rand = mulberry32(777)
  for (let i = 0; i < 70; i++) {
    const x = 6 + rand() * (W - 12)
    const h = H * (0.45 + rand() * 0.55)
    const lean = (rand() - 0.5) * 26
    const w = 2.2 + rand() * 2.6
    const grad = g.createLinearGradient(0, H, 0, H - h)
    const hue = 70 + rand() * 30
    grad.addColorStop(0, `hsl(${hue}, 32%, 30%)`)
    grad.addColorStop(1, `hsl(${hue - 8}, ${34 + rand() * 18}%, ${56 + rand() * 16}%)`)
    g.fillStyle = grad
    g.beginPath()
    g.moveTo(x - w, H)
    g.quadraticCurveTo(x - w * 0.5 + lean * 0.3, H - h * 0.6, x + lean, H - h)
    g.quadraticCurveTo(x + w * 0.5 + lean * 0.3, H - h * 0.6, x + w, H)
    g.closePath()
    g.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** Three crossed quads, root at the origin, normals straight up (lit like the ground). */
function cardGeometry(): THREE.BufferGeometry {
  const parts: number[] = []
  const uvs: number[] = []
  const w = 0.55
  const h = 0.55
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI
    const cx = Math.cos(a) * w
    const cz = Math.sin(a) * w
    parts.push(-cx, 0, -cz, cx, 0, cz, cx, h, cz, -cx, 0, -cz, cx, h, cz, -cx, h, -cz)
    uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(parts, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  const n = new Float32Array(parts.length)
  for (let i = 1; i < n.length; i += 3) n[i] = 1
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3))
  return g
}

interface Cell {
  m: Float32Array
  c: Float32Array
  n: number
}

export class Grass {
  readonly mesh: THREE.InstancedMesh
  private readonly cells = new Map<number, Cell>()
  private readonly uniforms = {
    uTime: { value: 0 },
    uPlayer: { value: new THREE.Vector3() },
    uWind: { value: new THREE.Vector2(1, 0.4) },
    uGust: { value: 0.5 },
    uRadius: { value: RADIUS },
  }
  private lastKey = NaN
  private dirty = true
  /** Cards drawn now (tools). */
  count = 0

  constructor(
    private readonly terrain: Terrain,
    private readonly biome: Biome,
    private readonly lakes: LakeSystem,
    /** Something stands here (rock, a colossus): no grass. */
    private readonly occupied: (x: number, z: number) => boolean,
  ) {
    const mat = new THREE.MeshStandardMaterial({ map: bladesTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95 })
    mat.alphaToCoverage = true
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms)
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime, uGust, uRadius;\nuniform vec3 uPlayer;\nuniform vec2 uWind;\nvarying float vTip;')
        .replace(
          '#include <project_vertex>',
          `vec3 root = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vec4 wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          float tip = uv.y;
          vTip = tip;
          // Waves rolling across the field with the wind, and a flutter.
          vec2 wd = normalize(uWind);
          float wave = sin(dot(root.xz, wd) * 0.11 - uTime * 1.7) * 0.5 + 0.5;
          float bend = (0.12 + uGust * (0.25 + 0.7 * wave * wave)) * tip * tip;
          wp.xz += wd * bend * 0.75;
          wp.x += sin(uTime * 3.1 + root.z * 0.9) * 0.025 * tip;
          wp.y -= bend * 0.25;
          // Parting round you.
          vec2 away = root.xz - uPlayer.xz;
          float pd = length(away);
          float push = (1.0 - smoothstep(0.3, 1.5, pd)) * tip;
          wp.xz += normalize(away + 1e-4) * push * 0.45;
          wp.y -= push * 0.3;
          // Sinking into the ground at the edge of its range.
          float edge = 1.0 - smoothstep(uRadius - 30.0, uRadius, distance(root.xz, cameraPosition.xz));
          wp.y = mix(root.y - 0.02, wp.y, edge);
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;`,
        )
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vTip;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.72, 1.0, vTip);')
        // Both faces lit as the ground is (DoubleSide would turn the back faces' normals down: black).
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\nnormal *= faceDirection;\n#endif')
        // Blades right at the lens dissolve instead of filling the frame.
        .replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\nif (length(vViewPosition) < 0.9 + 0.8 * fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453)) discard;')
    }
    this.mesh = new THREE.InstancedMesh(cardGeometry(), mat, CAP)
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.mesh.receiveShadow = true
  }

  /** The ground changed (a giant's foot, a lake): lay those cells again. */
  markDirty(x0: number, z0: number, x1: number, z1: number): void {
    for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) this.cells.delete(key(cx, cz))
    this.dirty = true
  }

  /** How thick the grass is at (x, z): 0 … 1. */
  private density(x: number, z: number, h: number): number {
    const b = this.biome
    const slope = Math.hypot(this.terrain.heightAt(x + 1, z) - h, this.terrain.heightAt(x, z + 1) - h)
    if (slope > 0.75 || h > 330) return 0
    return (0.35 + 0.65 * b.meadow(x, z)) * (1 - 0.7 * b.forest(x, z)) * (1 - 0.97 * b.desert(x, z)) * (1 - slope * 1.2)
  }

  private wet(x: number, z: number): boolean {
    for (const l of this.lakes.lakes) {
      const b = l.basin
      if (x < b.x0 || z < b.z0 || x > b.x0 + b.w || z > b.z0 + b.h || l.level <= b.bottom + 0.2) continue
      if (l.level > this.terrain.heightAt(x, z) - 0.05) return true
    }
    return false
  }

  private cell(cx: number, cz: number): Cell {
    const k = key(cx, cz)
    let c = this.cells.get(k)
    if (c) return c
    const rand = mulberry32((cx * 92837111) ^ (cz * 689287499) ^ 0x6a55)
    const m: number[] = []
    const col: number[] = []
    const mat = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const v = new THREE.Vector3()
    const s = new THREE.Vector3()
    const tint = new THREE.Color()
    for (let i = 0; i < PER_CELL; i++) {
      const x = cx * CELL + rand() * CELL
      const z = cz * CELL + rand() * CELL
      const h = this.terrain.heightAt(x, z)
      const d = this.density(x, z, h)
      if (rand() > d || inHall(x, z, 2) || this.occupied(x, z) || this.wet(x, z) || (seaward(x, z) && this.terrain.heightAt(x, z) < SHORE.sea + 0.4)) continue
      // Clumps: taller in some places, cropped short in others.
      const clump = 0.8 + 0.55 * Math.max(0, Math.sin(x * 0.21 + Math.sin(z * 0.13) * 2) * Math.sin(z * 0.17 + Math.sin(x * 0.11) * 2))
      const sc = (0.65 + rand() * 0.5) * clump
      q.setFromAxisAngle(up, rand() * Math.PI)
      mat.compose(v.set(x, h - 0.04, z), q, s.set(Math.max(0.6, sc), sc * (0.75 + rand() * 0.45), Math.max(0.6, sc)))
      m.push(...mat.elements)
      // Lush green in the meadows, toward straw where it is dry, pale and yellow at the dunes.
      const dry = 1 - this.biome.meadow(x, z)
      const sand = this.biome.desert(x, z)
      tint.setRGB(0.85 + dry * 0.3 + sand * 0.7 + rand() * 0.1, 0.9 + sand * 0.25 + rand() * 0.08, 0.7 - dry * 0.2 - sand * 0.1 + rand() * 0.08)
      col.push(tint.r, tint.g, tint.b)
    }
    c = { m: Float32Array.from(m), c: Float32Array.from(col), n: col.length / 3 }
    this.cells.set(k, c)
    return c
  }

  update(dt: number, cam: THREE.Vector3, player: THREE.Vector3, wind: number): void {
    const u = this.uniforms
    u.uTime.value += dt
    u.uPlayer.value.copy(player)
    u.uGust.value = 0.25 + wind * 0.9
    const ccx = Math.floor(cam.x / CELL)
    const ccz = Math.floor(cam.z / CELL)
    const k = key(ccx, ccz)
    if (k === this.lastKey && !this.dirty) return
    this.lastKey = k
    this.dirty = false
    // Nearest cells first, so what is close is never missing.
    const r = Math.ceil(RADIUS / CELL)
    const order: Array<[number, number, number]> = []
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) order.push([dx * dx + dz * dz, ccx + dx, ccz + dz])
    order.sort((a, b) => a[0] - b[0])
    let n = 0
    const im = this.mesh.instanceMatrix.array as Float32Array
    const ic = this.mesh.instanceColor!.array as Float32Array
    // (New cells are laid a few a frame — nearest first — and the rest the frames after: a
    // whole new ring at once, every blade sampling the land, made a hitch at each cell crossed.)
    let fresh = 0
    for (const [d2, cx, cz] of order) {
      if (Math.sqrt(d2) * CELL > RADIUS + CELL) continue
      if (!this.cells.has(key(cx, cz))) {
        if (fresh >= FRESH_PER_FRAME) {
          this.dirty = true
          continue
        }
        fresh++
      }
      const c = this.cell(cx, cz)
      // Thinner toward the edge of its range (user: "grass rendering is in chunks and very
      // close to the player"): full near you, ~35% at the rim, so it reaches further for about
      // the same number of cards and fades out instead of stopping at a ring.
      const dist = Math.sqrt(d2) * CELL
      const keep = 1 - 0.65 * THREE.MathUtils.smoothstep(dist, 30, RADIUS)
      const fit = Math.min(Math.ceil(c.n * keep), CAP - n)
      if (fit <= 0) break
      im.set(fit >= c.n ? c.m : c.m.subarray(0, fit * 16), n * 16)
      ic.set(fit >= c.n ? c.c : c.c.subarray(0, fit * 3), n * 3)
      n += fit
    }
    this.mesh.count = n
    this.count = n
    this.mesh.instanceMatrix.needsUpdate = true
    this.mesh.instanceColor!.needsUpdate = true
    // Forget cells long out of range.
    if (this.cells.size > 600) {
      for (const [ck] of this.cells) {
        const x = Math.floor(ck / 65536) - 32768
        const z = (ck % 65536) - 32768
        if (Math.hypot(x - ccx, z - ccz) * CELL > RADIUS * 3) this.cells.delete(ck)
      }
    }
  }
}

function key(cx: number, cz: number): number {
  return (cx + 32768) * 65536 + (cz + 32768)
}
