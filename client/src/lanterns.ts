// Lantern paths (user's pick #8, 2026-11-05): here and there a line of old stone lamps runs off
// across a land, cold and dark, a lamp every forty-odd metres. By day there is nothing to do with
// them: the first one's wick will not take. At night it does — light it (E) and the next lamp
// catches from it, and the next, one by one, a line of pale fire running off into the dark ahead
// of you toward a place you could not have found by day: a ring of low stones round a moon-white
// slab, and what was left on it. Once lit, the path remembers: every night after, at dusk, its
// lamps come up again on their own, and go out at dawn.
//
// Cheap: a path's posts are one built formation (one draw, solid, climbable — the bell frame's
// way), the flames and their glow on the ground one draw call each; no lights (the glow is drawn,
// not lit).

import * as THREE from 'three'
import { mulberry32, type Terrain } from '@titans/shared'
import { weatheredStone } from './weathered-stone'
import { carvedStone } from './spots'
import type { Shape } from './rock-fields'

/** Hands a path's stonework to the rocks (rocks.addBuilt): drawn with the land's stone, solid. */
export type Build = (shape: Shape, geo: THREE.BufferGeometry, at: { x: number; y: number; z: number }) => void

export interface LanternDef {
  /** What waits at the end (discovery.ts id). */
  id: string
  start: { x: number; z: number }
  bearing: number
  seed: number
}

/** Lamps along a path (the last is the ring's). */
const LAMPS = 14
/** Pale, cold fire. */
const FLAME = new THREE.Color(0.7, 0.92, 1.35)
/** How long the fire takes to run from one lamp to the next (s). */
const CATCH = 1.25

interface Path {
  def: LanternDef
  lamps: THREE.Vector3[]
  /** The ring's centre (the slab). */
  end: THREE.Vector3
  /** Kindled once: comes up every night. */
  kindled: boolean
  /** Seconds since it was kindled this time (the fire running down the line), or Infinity. */
  run: number
  /** The slab's glow material (only this path's). */
  slab: THREE.MeshStandardMaterial
  /** The first lamp's index into the flame buffer. */
  base: number
}

const flameVert = /* glsl */ `
attribute float aLit;
attribute float aSeed;
uniform float uTime;
uniform float uPx;
uniform float uNight;
varying float vA;
varying float vPx;
void main() {
  vec4 mv = viewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float flick = 0.85 + 0.1 * sin(uTime * 9.0 + aSeed * 40.0) * sin(uTime * 5.3 + aSeed * 17.0);
  // A lamp seen from far off is still a point of light (that is the whole of a lamp at night).
  float px = 0.9 * uPx / max(-mv.z, 0.1);
  // (Never smaller than a few pixels: far off, the halo is what you see, and a bright core.)
  gl_PointSize = clamp(px, 14.0, 160.0);
  vPx = gl_PointSize;
  vA = aLit * flick * (0.35 + 0.65 * uNight);
  if (vA < 0.004) gl_PointSize = 0.0;
}
`
const flameFrag = /* glsl */ `
uniform vec3 uCol;
varying float vA;
varying float vPx;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  // A bright core (at least a pixel and a half across, however far) and a soft halo round it.
  float rc = r * vPx / max(1.5, vPx * 0.09);
  float a = vA * (exp(-rc * rc) * 1.8 + exp(-r * r * 10.0) * 0.32);
  if (a < 0.003) discard;
  // (Additive: the colour is the light; three's additive blend multiplies by alpha again.)
  gl_FragColor = vec4(uCol * a, 1.0);
}
`
/** The glow on the ground round each lit lamp: a disc of pale light lying on it. */
const poolVert = /* glsl */ `
attribute float aLit;
attribute vec3 aAt;
uniform float uNight;
varying float vA;
varying vec2 vUv;
void main() {
  vUv = uv;
  vA = aLit * uNight;
  vec3 p = aAt + vec3(position.x, 0.0, position.y) * 9.0;
  // (Lifted clear of the grass's ground and the terrain's coarser far mesh.)
  p.y += 0.6;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  if (vA < 0.004) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`
const poolFrag = /* glsl */ `
uniform vec3 uCol;
varying float vA;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = vA * 0.26 * exp(-r * r * 4.0);
  if (a < 0.002) discard;
  // (Additive: the colour is the light; three's additive blend multiplies by alpha again.)
  gl_FragColor = vec4(uCol * a, 1.0);
}
`

/** A lamp post: a worn stone shaft, a slab on four short pillars (the lamp's house), a cap. */
function lampGeometry(seed: number): { geo: THREE.BufferGeometry; flameY: number } {
  const rand = mulberry32(seed)
  const parts: THREE.BufferGeometry[] = []
  const add = (g: THREE.BufferGeometry): void => {
    parts.push(g.index ? g.toNonIndexed() : g)
  }
  add(weatheredStone(0.5, 1.25, 0.5, rand, false, 0.12).translate(0, 0, 0))
  add(new THREE.BoxGeometry(0.78, 0.12, 0.78).translate(0, 1.31, 0))
  for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) add(new THREE.BoxGeometry(0.11, 0.4, 0.11).translate(x, 1.57, z))
  add(new THREE.ConeGeometry(0.58, 0.34, 4, 1).rotateY(Math.PI / 4).translate(0, 1.94, 0))
  for (const p of parts) {
    p.deleteAttribute('uv')
    if (!p.getAttribute('normal')) p.computeVertexNormals()
  }
  const geo = mergeAll(parts)
  return { geo, flameY: 1.56 }
}

function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0
  for (const p of parts) n += p.getAttribute('position').count
  const pos = new Float32Array(n * 3)
  const nor = new Float32Array(n * 3)
  let o = 0
  for (const p of parts) {
    pos.set(p.getAttribute('position').array as Float32Array, o * 3)
    nor.set(p.getAttribute('normal').array as Float32Array, o * 3)
    o += p.getAttribute('position').count
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  return g
}

export class Lanterns {
  readonly group = new THREE.Group()
  readonly paths: Path[] = []
  private readonly lit: Float32Array
  private readonly litAttr: THREE.BufferAttribute
  private readonly poolLit: THREE.InstancedBufferAttribute
  private readonly flameMat: THREE.ShaderMaterial
  private readonly poolMat: THREE.ShaderMaterial
  private time = 0
  private night = 0
  /** A lamp caught (index along its path): the sound. */
  onCatch: (i: number, at: THREE.Vector3) => void = () => {}
  /** The fire reached a path's ring (first time, at night): reveal what is there. */
  onArrive: (id: string) => void = () => {}

  constructor(defs: LanternDef[], terrain: Terrain, build: Build, blocked: (x: number, z: number) => boolean = () => false) {
    const { geo, flameY } = lampGeometry(811)
    const flamePos: number[] = []
    const seeds: number[] = []
    const q = new THREE.Quaternion()
    const s1 = new THREE.Vector3(1, 1, 1)
    for (const def of defs) {
      const rand = mulberry32(def.seed)
      const lamps: THREE.Vector3[] = []
      let x = def.start.x
      let z = def.start.z
      let a = def.bearing
      for (let k = 0; k < LAMPS; k++) {
        const y = terrain.heightAt(x, z)
        lamps.push(new THREE.Vector3(x, y, z))
        a += (rand() - 0.5) * 0.7
        a = a * 0.7 + def.bearing * 0.3
        const step = 38 + rand() * 14
        let nx = x + Math.sin(a) * step
        let nz = z + Math.cos(a) * step
        for (let k2 = 1; k2 < 12 && blocked(nx, nz); k2++) {
          const turn = (k2 % 2 ? 1 : -1) * Math.ceil(k2 / 2) * 0.35
          nx = x + Math.sin(a + turn) * step
          nz = z + Math.cos(a + turn) * step
        }
        x = nx
        z = nz
      }
      // The ring: the path's way on, past its last lamp, a little farther.
      const last = lamps[LAMPS - 1]
      const ex = last.x + Math.sin(a) * 22
      const ez = last.z + Math.cos(a) * 22
      const end = new THREE.Vector3(ex, terrain.heightAt(ex, ez), ez)
      const base = flamePos.length / 3
      const o = lamps[0]
      const posts: THREE.Matrix4[] = []
      /** Each post's footprint in the path's frame: centre, half-width, height. */
      const boxes: Array<[number, number, number, number, number]> = []
      for (const l of lamps) {
        // Leaning a touch, sunk a little where the ground slopes.
        q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.06, rand() * 6.28, (rand() - 0.5) * 0.06))
        posts.push(new THREE.Matrix4().compose(new THREE.Vector3(l.x - o.x, l.y - 0.15 - o.y, l.z - o.z), q.clone(), s1))
        boxes.push([l.x - o.x, l.y - 0.15 - o.y, l.z - o.z, 0.3, 2.05])
        flamePos.push(l.x, l.y - 0.15 + flameY, l.z)
        seeds.push(rand())
      }
      // Five low lamp-stones round the slab: they light last, together.
      for (let k = 0; k < 5; k++) {
        const t = (k / 5) * Math.PI * 2 + a
        const lx = ex + Math.sin(t) * 6.5
        const lz = ez + Math.cos(t) * 6.5
        const ly = terrain.heightAt(lx, lz)
        q.setFromEuler(new THREE.Euler(0, t, 0))
        posts.push(new THREE.Matrix4().compose(new THREE.Vector3(lx - o.x, ly - 0.75 - o.y, lz - o.z), q.clone(), new THREE.Vector3(0.8, 0.65, 0.8)))
        boxes.push([lx - o.x, ly - 0.75 - o.y, lz - o.z, 0.26, 1.33])
        flamePos.push(lx, ly - 0.75 + flameY * 0.65, lz)
        seeds.push(rand())
      }
      // The slab: a flat round of pale stone, a moon cut into it that glows when the fire arrives.
      const slabMat = carvedStone().clone()
      slabMat.emissive = FLAME.clone().multiplyScalar(0.5)
      slabMat.emissiveIntensity = 0
      const slab = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.5, 20, 1), [carvedStone(), slabMat, carvedStone()])
      slab.position.set(ex, end.y + 0.1, ez)
      slab.castShadow = slab.receiveShadow = true
      this.group.add(slab)
      // The stonework, one formation: drawn as the land's stone is, and solid (you can stand on a
      // lamp's cap, on the slab).
      const merged = mergeAll(posts.map((m) => geo.clone().applyMatrix4(m)))
      let hx = 0, hz = 0, y0 = Infinity, y1 = -Infinity
      for (const [bx, by, bz, , bh] of boxes) {
        hx = Math.max(hx, Math.abs(bx) + 1); hz = Math.max(hz, Math.abs(bz) + 1); y0 = Math.min(y0, by); y1 = Math.max(y1, by + bh)
      }
      const sx = ex - o.x, sy = end.y + 0.1 - o.y, sz = ez - o.z
      hx = Math.max(hx, Math.abs(sx) + 4); hz = Math.max(hz, Math.abs(sz) + 4)
      const shape: Shape = {
        field: (lx, ly, lz) => {
          let d = Math.max(Math.hypot(lx - sx, lz - sz) - 2.5, Math.abs(ly - sy) - 0.25)
          for (const [bx, by, bz, w, bh] of boxes) {
            if (Math.abs(lx - bx) > d + w || Math.abs(lz - bz) > d + w) continue
            d = Math.min(d, Math.max(Math.abs(lx - bx) - w, Math.abs(lz - bz) - w, Math.abs(ly - by - bh / 2) - bh / 2))
          }
          return d
        },
        hx,
        hz,
        hy: (Math.max(y1, sy + 0.3) - Math.min(y0, sy - 0.3)) / 2 + 1,
        cy: (Math.max(y1, sy + 0.3) + Math.min(y0, sy - 0.3)) / 2,
      }
      build(shape, merged, { x: o.x, y: o.y, z: o.z })
      this.paths.push({ def, lamps, end, kindled: false, run: Infinity, slab: slabMat, base })
    }
    // Flames (one point each).
    const n = flamePos.length / 3
    this.lit = new Float32Array(n)
    const fg = new THREE.BufferGeometry()
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(flamePos), 3))
    fg.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(seeds), 1))
    this.litAttr = new THREE.BufferAttribute(this.lit, 1)
    fg.setAttribute('aLit', this.litAttr)
    this.flameMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPx: { value: 500 }, uNight: { value: 0 }, uCol: { value: FLAME } },
      vertexShader: flameVert,
      fragmentShader: flameFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const flames = new THREE.Points(fg, this.flameMat)
    flames.frustumCulled = false
    flames.renderOrder = 4
    this.group.add(flames)

    // Glow pools on the ground (instanced quads).
    const pg = new THREE.InstancedBufferGeometry()
    const quad = new THREE.PlaneGeometry(1, 1)
    pg.index = quad.index
    pg.setAttribute('position', quad.getAttribute('position'))
    pg.setAttribute('uv', quad.getAttribute('uv'))
    const at = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      at[i * 3] = flamePos[i * 3]
      at[i * 3 + 1] = terrain.heightAt(flamePos[i * 3], flamePos[i * 3 + 2])
      at[i * 3 + 2] = flamePos[i * 3 + 2]
    }
    pg.setAttribute('aAt', new THREE.InstancedBufferAttribute(at, 3))
    this.poolLit = new THREE.InstancedBufferAttribute(this.lit, 1)
    pg.setAttribute('aLit', this.poolLit)
    pg.instanceCount = n
    this.poolMat = new THREE.ShaderMaterial({
      uniforms: { uNight: { value: 0 }, uCol: { value: FLAME } },
      vertexShader: poolVert,
      fragmentShader: poolFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const pools = new THREE.Mesh(pg, this.poolMat)
    pools.frustumCulled = false
    pools.renderOrder = 2
    this.group.add(pools)
  }

  /** The first lamp of a path not yet kindled, within reach of `p`. */
  near(p: THREE.Vector3, r = 3): Path | null {
    for (const path of this.paths) {
      const l = path.lamps[0]
      if (Math.hypot(l.x - p.x, l.z - p.z) < r && Math.abs(l.y - p.y) < 3 && !(path.kindled && this.night > 0.5)) return path
    }
    return null
  }

  /** Is it dark enough for the wicks to take? */
  get dark(): boolean {
    return this.night > 0.55
  }

  /** Light a path's first lamp: the fire runs down the line from it. */
  kindle(path: Path): void {
    path.kindled = true
    path.run = 0
  }

  /** The kindled paths (the save). */
  save(): string[] {
    return this.paths.filter((p) => p.kindled).map((p) => p.def.id)
  }

  load(ids: string[]): void {
    for (const p of this.paths) if (ids.includes(p.def.id)) p.kindled = true
  }

  update(dt: number, night: number, camera: THREE.PerspectiveCamera, viewH: number): void {
    this.time += dt
    this.night = night
    this.flameMat.uniforms.uTime.value = this.time
    this.flameMat.uniforms.uPx.value = viewH * 0.5 * camera.projectionMatrix.elements[5]
    this.flameMat.uniforms.uNight.value = night
    this.poolMat.uniforms.uNight.value = night
    // A kindled path's lamps burn while it is dark (they come up at dusk, go out at dawn).
    const burn = THREE.MathUtils.smoothstep(night, 0.35, 0.65)
    for (const p of this.paths) {
      if (!p.kindled) continue
      const n = LAMPS + 5
      if (p.run < Infinity) {
        const before = p.run
        p.run += dt
        // The fire runs lamp to lamp; the ring's five catch together after the last.
        for (let i = 0; i < n; i++) {
          const at = Math.min(i, LAMPS) * CATCH
          if (before < at && p.run >= at && (i < LAMPS || i === LAMPS)) this.onCatch(Math.min(i, LAMPS), i < LAMPS ? p.lamps[i] : p.end)
        }
        if (before < LAMPS * CATCH + 1 && p.run >= LAMPS * CATCH + 1) this.onArrive(p.def.id)
        if (p.run > LAMPS * CATCH + 6) p.run = Infinity
      }
      for (let i = 0; i < n; i++) {
        const at = Math.min(i, LAMPS) * CATCH
        // Catching: a flare, then settling to a steady burn.
        const since = p.run < Infinity ? p.run - at : 99
        const v = since < 0 ? 0 : burn * Math.min(1, since * 3) * (1 + 0.6 * Math.exp(-since * 2.5))
        this.lit[p.base + i] = v
      }
      p.slab.emissiveIntensity = (p.run < Infinity ? THREE.MathUtils.smoothstep(p.run, LAMPS * CATCH, LAMPS * CATCH + 3) : 1) * burn * 0.22
    }
    this.litAttr.needsUpdate = true
    this.poolLit.needsUpdate = true
  }
}
