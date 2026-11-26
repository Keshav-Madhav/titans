// Giant feathers on the High Places' snow (the user: "things should generally be huge"): moulted by
// something that flies above the peaks, lying where they fell, twenty metres from quill to tip and
// dark against the white — whatever lost them is never seen.
//
// Their own model, the giant ferns' way: a quill (a long tapering tube, built through rocks.addBuilt so
// you can walk along it) and two vanes, each a ribbon carrying a painted vane — barbs in fine parallel
// lines angled toward the tip, ragged and split here and there — cut out by its transparency, the
// outer edges lifting a little off the snow as a feather's do.

import * as THREE from 'three'
import { mulberry32 } from '@titans/shared'
import type { Shape } from './rock-fields'

/** The feather's length (m); vanes and quill scale with it. */
export interface Feather {
  x: number
  z: number
  y: number
  rot: number
  L: number
}

/** The quill's centre line in the feather's own frame: along +x, a gentle curve sideways (z). */
function quillAt(t: number, L: number): THREE.Vector3 {
  return new THREE.Vector3(t * L, 0, 0.06 * L * Math.sin(t * Math.PI * 0.9))
}

/** The vane's picture: barbs angled toward the tip off a dark rachis edge, ragged, with splits. */
function vaneTexture(seed: number): THREE.CanvasTexture {
  const W = 1024
  const H = 256
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const c = cv.getContext('2d')!
  c.clearRect(0, 0, W, H)
  const rand = mulberry32(seed)
  // u along the feather (0 quill end … 1 tip), v across the vane (0 at the quill … 1 the outer edge).
  // The vane's outline: narrow at the base, broad through the middle, rounding to the tip.
  const width = (u: number) => H * Math.max(0, Math.sin(Math.min(1, u * 1.15 + 0.05) * Math.PI) ** 0.6) * (0.75 + 0.25 * (1 - u))
  // Splits: a few gaps where the barbs have come apart.
  const splits = [0.31 + rand() * 0.05, 0.58 + rand() * 0.08, 0.8 + rand() * 0.05]
  // (The vane solid, the barbs as light and dark lines across it: drawn as separate thin lines with gaps
  // between, most of it was transparent and the feather read as a thin jagged strip in the snow.)
  for (let x = 0; x < W; x += 1) {
    const u = x / W
    if (splits.some((s) => Math.abs(u - s) < 0.006)) continue
    const w = width(u) * (0.92 + 0.08 * Math.sin(u * 90 + rand()))
    // (A dark feather, not a hole in the snow: at 16-40 of 255, flat, it read as a black cut-out in a
    // snowfield, storm look 2026-11-26. Slate, each barb darker at the rachis and lighter, a little blue,
    // toward the thinning edge, as a black feather's edge catches the light.)
    const shade = 34 + Math.floor(14 * rand()) + ((x >> 1) % 3 === 0 ? 18 : 0)
    const grd = c.createLinearGradient(x, 0, x + w * 0.55, w)
    grd.addColorStop(0, `rgb(${Math.round(shade * 0.55)},${Math.round(shade * 0.58)},${Math.round(shade * 0.66)})`)
    grd.addColorStop(0.7, `rgb(${shade + 3},${shade + 6},${shade + 14})`)
    grd.addColorStop(1, `rgb(${shade + 26},${shade + 32},${shade + 44})`)
    c.strokeStyle = grd
    c.lineWidth = 2.2
    c.beginPath()
    c.moveTo(x, 0)
    c.lineTo(x + w * 0.55, w)
    c.stroke()
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** One vane (side = ±1): a ribbon from the quill out to its edge, the edge lifted off the ground. */
function vaneGeometry(L: number, side: number): THREE.BufferGeometry {
  const SEG = 40
  const ACROSS = 4
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const reach = 0.17 * L
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG
    const q = quillAt(t, L)
    for (let j = 0; j <= ACROSS; j++) {
      const v = j / ACROSS
      const p = q.clone()
      p.z += side * v * reach
      // (The vane lies along the snow and lifts toward its edge, so it reads from the ground.)
      p.y = 0.12 + 0.07 * L * v * v
      pos.push(p.x, p.y, p.z)
      uv.push(t, 1 - v)
    }
  }
  for (let i = 0; i < SEG; i++)
    for (let j = 0; j < ACROSS; j++) {
      const a = i * (ACROSS + 1) + j
      const b = a + ACROSS + 1
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** The quill: a tube along the curve, thick at the base and tapering to nothing at the tip. */
export function quillGeometry(L: number): THREE.BufferGeometry {
  const r0 = 0.018 * L
  const pts = Array.from({ length: 24 }, (_, i) => quillAt(i / 23, L))
  const curve = new THREE.CatmullRomCurve3(pts)
  const g = new THREE.TubeGeometry(curve, 48, 1, 8, false)
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  // Taper: scale each ring's offset from the curve by the radius at that point.
  for (let i = 0; i < pos.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(pos, i)
    const t = Math.min(1, Math.max(0, p.x / L))
    const c = quillAt(t, L)
    const r = r0 * (1 - 0.92 * t)
    const off = p.sub(c).multiplyScalar(r)
    pos.setXYZ(i, c.x + off.x, c.y + off.y + r * 0.6, c.z + off.z)
  }
  g.computeVertexNormals()
  return g
}

export function quillShape(L: number): Shape {
  const r0 = 0.018 * L
  const field = (x: number, y: number, z: number): number => {
    const t = Math.min(1, Math.max(0, x / L))
    const c = quillAt(t, L)
    const r = r0 * (1 - 0.92 * t)
    return Math.hypot(y - r * 0.6, z - c.z) - r + (x < 0 ? -x : x > L ? x - L : 0)
  }
  return { field, hx: L, hy: r0 * 2, hz: L * 0.3, cy: 0 }
}

/** The two vanes of a feather, placed (a Group); the quill is the caller's (rocks.addBuilt). */
export function featherVanes(f: Feather, seed: number): THREE.Group {
  const mat = new THREE.MeshStandardMaterial({ map: vaneTexture(seed), roughness: 0.75, side: THREE.DoubleSide, alphaTest: 0.4 })
  mat.alphaToCoverage = true
  const g = new THREE.Group()
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(vaneGeometry(f.L, side), mat)
    m.castShadow = true
    m.receiveShadow = true
    g.add(m)
  }
  g.position.set(f.x, f.y, f.z)
  g.rotation.y = f.rot
  return g
}
