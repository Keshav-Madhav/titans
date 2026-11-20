// Giant ferns round the Grove (the user: "things should generally be huge"): fronds of the giants'
// age arching five to nine metres over you in the deep wood. Their own model — the ordinary fern's
// flat cards, scaled up, read as bright zig-zag paper — a spine of many segments per frond, curling
// up and over, with leaflets in pairs down both sides that droop and shorten toward the tip.

import * as THREE from 'three'
import { setInstances } from './instances'
import { foliageFocus } from './trees'
import { mulberry32, type Terrain } from '@titans/shared'

const GROVE = { x: -0.866 * 4300, z: -0.5 * 4300, r: 1900 }
const CELL = 40
/** Drawn within this of the camera. */
const FAR = 420
const CAP = 1600
/** The fine look within this (m). */
const NEAR_R = 110

/** One fern, 1 m tall (scaled per instance): fronds from a crown, each a curling spine with leaflets. */
/** `fine`: folded leaflets and 30 segments a frond (near); otherwise 12 and one triangle a leaflet. */
function fernGeometry(fine: boolean): THREE.BufferGeometry {
  const pos: number[] = []
  const col: number[] = []
  const nrm: number[] = []
  const rand = mulberry32(0xfe4)
  const FRONDS = 9
  const SEG = fine ? 30 : 12
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ca: number[], cb: number[], cc: number[]) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize()
    // (Leaves lit from above whichever way they face: a frond's underside was black.)
    if (n.y < 0) n.negate()
    n.y = Math.max(n.y, 0.35)
    n.normalize()
    for (const [p, cl] of [[a, ca], [b, cb], [c, cc]] as const) {
      pos.push(p.x, p.y, p.z)
      col.push(cl[0], cl[1], cl[2])
      nrm.push(n.x, n.y, n.z)
    }
  }
  for (let f = 0; f < FRONDS; f++) {
    const az = (f / FRONDS) * Math.PI * 2 + rand() * 0.5
    const len = 0.85 + rand() * 0.3
    const rise = 1.05 + rand() * 0.35
    const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az))
    const side = new THREE.Vector3(-dir.z, 0, dir.x)
    const tint = rand()
    // The spine: out and up, then curling over and down toward its tip.
    const spine: THREE.Vector3[] = []
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG
      const out = len * t
      const up = rise * Math.sin(t * Math.PI * 0.62) - 0.25 * t * t
      spine.push(new THREE.Vector3(dir.x * out, up, dir.z * out))
    }
    const stem = [0.16, 0.2, 0.08]
    for (let s = 0; s < SEG; s++) {
      const t = s / SEG
      const a = spine[s]
      const b = spine[s + 1]
      // The spine itself, a thin strip.
      const w = 0.012 * (1 - t)
      tri(a.clone().addScaledVector(side, -w), a.clone().addScaledVector(side, w), b, stem, stem, stem)
      if (t < 0.06) continue
      // Leaflets, both sides: long narrow strips (a fold down their middle, a pointed tip), longest a
      // third of the way out, shortening and drooping toward the frond's tip. (Single fat triangles
      // read as paper cones up close — the tour.)
      const L = 0.34 * Math.sin(Math.min(1, (t - 0.04) / 0.96) * Math.PI) * (1 - 0.3 * t)
      const W = 0.022 + 0.012 * (1 - t)
      const g = [0.11 + 0.07 * tint + 0.06 * t, 0.24 + 0.07 * tint + 0.05 * t, 0.06 + 0.03 * t]
      const g2 = [g[0] * 0.7, g[1] * 0.74, g[2] * 0.76]
      const g3 = [g[0] * 1.15, g[1] * 1.12, g[2]]
      const mid = a.clone().lerp(b, 0.5)
      const along = new THREE.Vector3().subVectors(b, a).normalize()
      for (const sgn of [-1, 1]) {
        const out = side.clone().multiplyScalar(sgn).addScaledVector(dir, 0.35).normalize()
        const tip = mid.clone().addScaledVector(out, L)
        tip.y -= L * 0.5
        const kneeP = mid.clone().addScaledVector(out, L * 0.55)
        kneeP.y -= L * 0.12
        // The leaflet's two edges either side of its fold, the fold a little raised.
        const e1 = kneeP.clone().addScaledVector(along, W)
        const e2 = kneeP.clone().addScaledVector(along, -W)
        const fold = kneeP.clone()
        fold.y += W * 0.6
        if (fine) {
          tri(mid, e1, fold, g2, g, g3)
          tri(mid, fold, e2, g2, g3, g)
          tri(e1, tip, fold, g, g3, g3)
          tri(fold, tip, e2, g3, g3, g)
        } else tri(a, b, tip, g2, g2, g)
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  return geo
}

/**
 * A frond's picture (near look): a dark midrib up the middle, leaflets out both sides angled toward the
 * tip, each a long blade with toothed edges and its own midvein, longest a third of the way up, the
 * gaps between them transparent. Painted once.
 */
function frondTexture(): THREE.CanvasTexture {
  const W = 256
  const H = 1024
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const c = cv.getContext('2d')!
  c.clearRect(0, 0, W, H)
  const rand = mulberry32(0xf20d)
  const PAIRS = 26
  for (let i = 0; i < PAIRS; i++) {
    const t = (i + 0.6) / PAIRS
    // v: 0 at the frond's foot (bottom of the canvas) … 1 at its tip (top).
    const y = H * (1 - t)
    const len = (W / 2 - 6) * Math.sin(Math.min(1, (t + 0.02) / 1.0) * Math.PI) ** 0.8 * (1 - 0.25 * t)
    const wid = 13 + 8 * (1 - t)
    for (const sgn of [-1, 1]) {
      const g = 0.32 + 0.12 * rand() + 0.12 * t
      c.save()
      c.translate(W / 2, y)
      // (Out from the midrib to its side — mirrored for the left — and angled up toward the tip: turned by
      // a right angle less a little, every leaflet pointed down along the midrib and they lay on each
      // other as one solid band, the first try.)
      c.scale(sgn, 1)
      c.rotate(-0.42)
      // The leaflet: a long blade, toothed, along +x from the midrib (scaled to the side by the rotation).
      c.beginPath()
      c.moveTo(0, 0)
      const teeth = 9
      for (let k = 0; k <= teeth; k++) {
        const u = k / teeth
        const hw = wid * Math.sin(Math.PI * Math.min(1, u * 1.1 + 0.05)) * (1 - 0.6 * u) + (k % 2 ? 1.6 : 0)
        c.lineTo(u * len, -hw)
      }
      for (let k = teeth; k >= 0; k--) {
        const u = k / teeth
        const hw = wid * Math.sin(Math.PI * Math.min(1, u * 1.1 + 0.05)) * (1 - 0.6 * u) + (k % 2 ? 1.6 : 0)
        c.lineTo(u * len, hw)
      }
      c.closePath()
      const grd = c.createLinearGradient(0, 0, len, 0)
      // (Brighter than looks right on the canvas: sRGB, darkened again by the lighting under the trees.)
      grd.addColorStop(0, `rgb(${Math.round(60 + 40 * g)},${Math.round(110 + 60 * g)},${Math.round(30 + 25 * g)})`)
      grd.addColorStop(1, `rgb(${Math.round(110 + 50 * g)},${Math.round(160 + 50 * g)},${Math.round(55 + 30 * g)})`)
      c.fillStyle = grd
      c.fill()
      // Its midvein.
      c.strokeStyle = 'rgba(30,55,18,0.55)'
      c.lineWidth = 1.4
      c.beginPath()
      c.moveTo(0, 0)
      c.lineTo(len * 0.92, 0)
      c.stroke()
      c.restore()
    }
  }
  // The midrib.
  c.strokeStyle = 'rgb(58,62,24)'
  for (let y = 0; y < H; y += 4) {
    c.lineWidth = 7 - 5 * (1 - y / H)
    c.beginPath()
    c.moveTo(W / 2, y)
    c.lineTo(W / 2, y + 4)
    c.stroke()
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/**
 * The near fern as ribbons: each frond a curved strip along its spine, folded into a shallow V down its
 * midrib, with the frond's picture on it (the leaflets' outline from the picture's transparency). The
 * leaflets as triangles read as a comb of separately lit pale teeth up close, the tour.
 */
function fernRibbonGeometry(): THREE.BufferGeometry {
  const pos: number[] = []
  const nrm: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const rand = mulberry32(0xfe4)
  const FRONDS = 9
  const SEG = 16
  for (let f = 0; f < FRONDS; f++) {
    const az = (f / FRONDS) * Math.PI * 2 + rand() * 0.5
    const len = 0.85 + rand() * 0.3
    const rise = 1.05 + rand() * 0.35
    rand()
    const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az))
    const side = new THREE.Vector3(-dir.z, 0, dir.x)
    const spine = (t: number) => new THREE.Vector3(dir.x * len * t, rise * Math.sin(t * Math.PI * 0.62) - 0.25 * t * t, dir.z * len * t)
    const base = pos.length / 3
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG
      const a = spine(t)
      const b = spine(Math.min(1, t + 0.01))
      const along = b.sub(a).normalize()
      const nUp = new THREE.Vector3().crossVectors(side, along).normalize()
      if (nUp.y < 0) nUp.negate()
      // Half-width: the leaflets' reach (the picture's), drooping at the edges.
      const hw = 0.36 * Math.max(0.05, Math.sin(Math.min(1, t + 0.02) * Math.PI) ** 0.8 * (1 - 0.25 * t))
      const droop = hw * 0.4
      for (const k of [-1, 0, 1]) {
        const p = a.clone().addScaledVector(side, k * hw)
        if (k !== 0) p.y -= droop
        pos.push(p.x, p.y, p.z)
        const n = nUp.clone().addScaledVector(side, -k * 0.35).normalize()
        nrm.push(n.x, n.y, n.z)
        uv.push(0.5 + k * 0.5, t)
      }
      if (s < SEG) {
        const i = base + s * 3
        idx.push(i, i + 3, i + 1, i + 1, i + 3, i + 4, i + 1, i + 4, i + 2, i + 2, i + 4, i + 5)
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

export class GiantFerns {
  readonly mesh = new THREE.Group()
  private readonly near: THREE.InstancedMesh
  private readonly far: THREE.InstancedMesh
  private readonly time = { value: 0 }
  private readonly cells = new Map<number, Float32Array>()
  private lastX = Infinity
  private lastZ = Infinity
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly s = new THREE.Vector3()
  private readonly p = new THREE.Vector3()
  private readonly up = new THREE.Vector3(0, 1, 0)

  constructor(
    private readonly terrain: Terrain,
    private readonly forest: (x: number, z: number) => number,
    private readonly blocked: (x: number, z: number) => boolean,
  ) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide })
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.time
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // A slow heavy sway, more toward the frond tips.
        vec3 fr = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float fs = sin(uTime * 0.6 + fr.x * 0.05 + fr.z * 0.04) * 0.04 * position.y * length(position.xz);
        transformed.x += fs;
        transformed.z += fs * 0.6;`,
      )
      // The fronds' undersides are darker (a fern right over you, lantern-lit from below, read as
      // flat bright yellow triangles — night tour).
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= gl_FrontFacing ? 1.0 : 0.5;')
    }
    // (Two looks: the folded leaflets close by, a light one past NEAR_R — 2,400 triangles a fern for
    // all ~230 round the Grove dropped it to Medium detail at the lowest resolution.)
    // (Near: ribbons with the frond's picture; the leaflet triangles stay for the far look.)
    const nearMat = new THREE.MeshStandardMaterial({ map: frondTexture(), roughness: 0.8, side: THREE.DoubleSide, alphaTest: 0.5 })
    nearMat.alphaToCoverage = true
    nearMat.onBeforeCompile = (sh, r) => {
      mat.onBeforeCompile(sh, r)
      // Far down the mip chain the leaflets' alpha averages with the gaps to under the cut, and the frond
      // thins away: alpha lifted by how far down the chain this pixel reads (as the trees do).
      sh.uniforms.uFocus = foliageFocus
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uFocus;').replace(
        '#include <alphatest_fragment>',
        `{
          vec2 fdx = dFdx(vMapUv) * 1024.0;
          vec2 fdy = dFdy(vMapUv) * 1024.0;
          float flod = max(0.0, 0.5 * log2(max(dot(fdx, fdx), dot(fdy, fdy))));
          diffuseColor.a *= 1.0 + flod * 0.25;
          // (As the trees' leaves: thinned right at the lens, and in a tube round the line to the
          // wanderer — zoomed out in the Grove, a frond by the camera was a wall of flat green slabs
          // over the screen and the wanderer, tour 1118e spot 3. Through coverage: a soft thinning.)
          float fadeK = smoothstep(1.6, 3.2, length(vViewPosition));
          vec3 sp = (viewMatrix * vec4(uFocus, 1.0)).xyz;
          vec3 fp = -vViewPosition;
          float along = clamp(dot(fp, sp) / dot(sp, sp), 0.0, 1.0);
          if (along < 0.97) {
            float r = 1.4 + 2.2 * along;
            fadeK *= smoothstep(r * 0.7, r * 1.05, length(fp - sp * along));
          }
          diffuseColor.a *= fadeK;
        }
        #include <alphatest_fragment>`,
      )
    }
    this.near = new THREE.InstancedMesh(fernRibbonGeometry(), nearMat, 300)
    this.far = new THREE.InstancedMesh(fernGeometry(false), mat, CAP)
    for (const m of [this.near, this.far]) {
      m.count = 0
      m.visible = false
      m.frustumCulled = false
      m.receiveShadow = true
      this.mesh.add(m)
    }
    this.near.castShadow = true
  }

  private cell(cx: number, cz: number): Float32Array {
    const k = cx * 100003 + cz
    let c = this.cells.get(k)
    if (c) return c
    const rand = mulberry32((cx * 92821) ^ (cz * 68917) ^ 0xfe41)
    const out: number[] = []
    const n = Math.floor(rand() * 4)
    for (let i = 0; i < n; i++) {
      const x = (cx + rand()) * CELL
      const z = (cz + rand()) * CELL
      const size = 5 + rand() * 4
      const turn = rand() * Math.PI * 2
      const gd = Math.hypot(x - GROVE.x, z - GROVE.z)
      if (gd > GROVE.r || this.forest(x, z) < 0.55 || rand() > 1 - gd / GROVE.r * 0.7 || this.blocked(x, z)) continue
      out.push(x, this.terrain.heightAt(x, z) - 0.2, z, size, turn)
    }
    c = new Float32Array(out)
    this.cells.set(k, c)
    return c
  }

  update(dt: number, cam: THREE.Vector3): void {
    this.time.value += dt
    const near = Math.hypot(cam.x - GROVE.x, cam.z - GROVE.z) < GROVE.r + FAR
    this.mesh.visible = near
    if (!near || Math.hypot(cam.x - this.lastX, cam.z - this.lastZ) < 20) return
    this.lastX = cam.x
    this.lastZ = cam.z
    const r = Math.ceil(FAR / CELL)
    const c0x = Math.floor(cam.x / CELL)
    const c0z = Math.floor(cam.z / CELL)
    let n = 0
    let nn = 0
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const cx = c0x + dx
        const cz = c0z + dz
        if (Math.hypot((cx + 0.5) * CELL - cam.x, (cz + 0.5) * CELL - cam.z) > FAR + CELL) continue
        const c = this.cell(cx, cz)
        for (let i = 0; i + 4 < c.length && n < CAP; i += 5) {
          this.q.setFromAxisAngle(this.up, c[i + 4])
          this.m.compose(this.p.set(c[i], c[i + 1], c[i + 2]), this.q, this.s.set(c[i + 3], c[i + 3], c[i + 3]))
          if (nn < 300 && Math.hypot(c[i] - cam.x, c[i + 2] - cam.z) < NEAR_R) this.near.setMatrixAt(nn++, this.m)
          else this.far.setMatrixAt(n++, this.m)
        }
      }
    }
    setInstances(this.far, n)
    setInstances(this.near, nn)
    if (this.cells.size > 3000) this.cells.clear()
  }
}
