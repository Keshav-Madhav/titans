// The Tallgrass (the user, 2026-11-08: "an area within the old woods, to the side of the giant
// trees, which is basically giant grass, dense long tall grass, tall enough to be megalophobic —
// things should generally be huge"). A clearing at the Grove's edge where the grass goes up and up:
// knee-high at the rim, then over your head, then three and four times the height of a person in
// the middle, blades a metre wide leaning together over you. It sways with the wind and parts round
// you as you push through; the blades between the camera and you fade, so you see yourself small
// inside it rather than a wall of green.

import * as THREE from 'three'
import { makeSimplex2, mulberry32, type Terrain } from '@titans/shared'

/** Where it is: a clearing on the Grove's north-east side. */
export const TALL = { x: -4366, z: -589, r: 380 }

const CELL = 16
/** Full density within this of the camera; a thinner silhouette out to FAR. */
const NEAR = 150
const FAR = 650
const PER_CELL = 15
const PER_CELL_FAR = 5
const CAP = 16000
const BLADES = 9
const SEGS = 4

const edgeNoise = makeSimplex2(0x7a11)

/** 0 … 1: how much of the Tallgrass (x, z) is (soft, wobbly edge). */
export function tallAt(x: number, z: number): number {
  const d = Math.hypot(x - TALL.x, z - TALL.z) / TALL.r + 0.16 * edgeNoise(x * 0.006, z * 0.006)
  return 1 - THREE.MathUtils.smoothstep(d, 0.62, 1)
}

/** One clump: BLADES narrow, tapering blades arching out from a root, height 1 (scaled per instance). */
function clumpGeometry(): THREE.BufferGeometry {
  const pos: number[] = []
  const nrm: number[] = []
  const col: number[] = []
  const acr: number[] = []
  const idx: number[] = []
  const rand = mulberry32(0x7a1155)
  for (let b = 0; b < BLADES; b++) {
    const a = rand() * Math.PI * 2
    const off = 0.04 + rand() * 0.14
    const ox = Math.cos(a) * off
    const oz = Math.sin(a) * off
    // Out from the clump and arching over: the tip droops past the line of the lean.
    const lean = 0.22 + rand() * 0.34
    const h = 0.68 + rand() * 0.32
    const w = 0.026 + rand() * 0.024
    // The blade's face turned across its lean (a ribbon, not a vane pointing at you).
    const fx = -Math.sin(a)
    const fz = Math.cos(a)
    const tint = rand()
    const base = pos.length / 3
    for (let s = 0; s <= SEGS; s++) {
      const t = s / SEGS
      const bend = lean * Math.pow(t, 1.6)
      const y = h * (t - 0.18 * Math.pow(t, 3) * lean * 2)
      const cx = ox + Math.cos(a) * bend
      const cz = oz + Math.sin(a) * bend
      const ww = w * (1 - Math.pow(t, 1.4) * 0.94)
      pos.push(cx - fx * ww, y, cz - fz * ww, cx + fx * ww, y, cz + fz * ww)
      // (Where across the blade: -1 one edge, 1 the other — veins, a midrib.)
      acr.push(-1, 1)
      // Rounded across the blade: each edge's normal turned out a little (a flat strip read as paper).
      const nx = Math.cos(a) * (1 - t * 0.5)
      const ny = 0.35 + t * 0.6
      const nz = Math.sin(a) * (1 - t * 0.5)
      for (const side of [-1, 1]) {
        const v = new THREE.Vector3(nx + fx * side * 0.7, ny, nz + fz * side * 0.7).normalize()
        nrm.push(v.x, v.y, v.z)
      }
      // Dark and wet at the root, green up the blade, dry straw at the tip (each blade its own).
      const k = Math.min(1, t * 1.25)
      const r = THREE.MathUtils.lerp(0.035, THREE.MathUtils.lerp(0.2, 0.44, tint), k) + 0.2 * t * t * tint
      const g = THREE.MathUtils.lerp(0.055, THREE.MathUtils.lerp(0.31, 0.42, tint), k) + 0.07 * t * t
      const bl = THREE.MathUtils.lerp(0.025, 0.09, t) + 0.07 * t * t * tint
      col.push(r, g, bl, r, g, bl)
      if (s < SEGS) {
        const i = base + s * 2
        idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2)
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.setAttribute('aAcross', new THREE.Float32BufferAttribute(acr, 1))
  geo.setIndex(idx)
  return geo
}

export class Tallgrass {
  readonly mesh: THREE.InstancedMesh
  private readonly uniforms = {
    uTime: { value: 0 },
    uWind: { value: 0.3 },
    uPlayer: { value: new THREE.Vector3() },
    /** Toward the sun (world). */
    uSun: { value: new THREE.Vector3(0, 1, 0) },
  }
  /** Per cell: its clumps, [x, y, z, height, turn] × PER_CELL (computed once, kept). */
  private readonly cells = new Map<number, Float32Array>()
  private lastX = Infinity
  private lastZ = Infinity
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly s = new THREE.Vector3()
  private readonly p = new THREE.Vector3()
  private readonly up = new THREE.Vector3(0, 1, 0)

  constructor(private readonly terrain: Terrain) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: THREE.DoubleSide })
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms)
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;\nuniform vec3 uPlayer;\nattribute float aAcross;\nvarying vec3 vTallW;\nvarying float vTallT;\nvarying float vAcross;')
        .replace(
          '#include <project_vertex>',
          `vec4 tw = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          vec3 troot = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float tH = length((instanceMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          float th = clamp(position.y, 0.0, 1.0);
          // Wind: slow heavy swells across the field, a quicker flutter at the tips.
          float tph = troot.x * 0.035 + troot.z * 0.027;
          float tsw = sin(uTime * 0.7 + tph) * 0.65 + sin(uTime * 1.9 + tph * 2.3) * 0.25;
          vec2 tdir = normalize(vec2(1.0, 0.4));
          tw.xz += tdir * tsw * th * th * tH * (0.05 + 0.09 * uWind);
          // Parting round you: pushed out from your body, and bowed down a little.
          vec2 tpd = tw.xz - uPlayer.xz;
          float tpl = length(tpd);
          float tpush = (1.0 - smoothstep(0.6, 3.8, tpl)) * th * step(tw.y - 1.0, uPlayer.y + tH);
          tw.xz += (tpl > 1e-3 ? tpd / tpl : vec2(0.0)) * tpush * 2.4;
          tw.y -= tpush * tH * 0.08;
          vTallW = tw.xyz;
          vTallT = th;
          vAcross = aAcross;
          vec4 mvPosition = viewMatrix * tw;
          gl_Position = projectionMatrix * mvPosition;`,
        )
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uPlayer;\nuniform vec3 uSun;\nvarying vec3 vTallW;\nvarying float vTallT;\nvarying float vAcross;')
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          {
            // Between the camera and you (a cylinder round that line), and right in front of the lens:
            // dissolved, so you are seen small inside it, not lost behind a wall of blades.
            vec3 ca = cameraPosition;
            vec3 cb = uPlayer + vec3(0.0, 1.0, 0.0);
            vec3 cab = cb - ca;
            float ct = clamp(dot(vTallW - ca, cab) / max(dot(cab, cab), 1e-3), 0.0, 1.0);
            float cd = length(vTallW - (ca + cab * ct));
            float keep = mix(1.0, smoothstep(1.7, 2.4, cd), step(0.02, ct) * step(ct, 0.97));
            keep *= smoothstep(1.6, 2.3, distance(vTallW, cameraPosition));
            // (A clean cut at the middle, not a dither: dithered over whole blades a metre wide, the
            // near ones were a coarse screen-door pattern filling half the frame.)
            if (keep < 0.5) discard;
          }`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            // Fine parallel veins down the blade, a paler midrib, edges a little darker and drier: a
            // blade a metre wide read as a flat cut-out with nothing on it.
            float ta = abs(vAcross);
            // (Unevenly spaced: evenly ruled lines read as corduroy.)
            float vein = 0.89 + 0.11 * sin(vAcross * 34.0 + sin(vAcross * 9.0) * 1.6);
            float rib = 1.0 + 0.16 * (1.0 - smoothstep(0.0, 0.14, ta));
            diffuseColor.rgb *= vein * rib;
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.05, 0.95, 0.7), smoothstep(0.75, 1.0, ta) * 0.6);
          }`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          // Light through the blades high up (thin, lit from behind), none down in the dark at the roots;
          // and much more looking toward the sun through them — the blades glow (they were flat dark paper
          // against a bright sky, the tour, 2026-11-17).
          vec3 tV = normalize(vTallW - cameraPosition);
          float tBack = pow(max(dot(tV, normalize(uSun)), 0.0), 3.0) * smoothstep(-0.05, 0.25, uSun.y);
          totalEmissiveRadiance += diffuseColor.rgb * (0.22 + 0.9 * tBack) * smoothstep(0.3, 1.0, vTallT);`,
        )
    }
    this.mesh = new THREE.InstancedMesh(clumpGeometry(), mat, CAP)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.mesh.receiveShadow = true
  }

  private cell(cx: number, cz: number): Float32Array {
    const k = cx * 100003 + cz
    let c = this.cells.get(k)
    if (c) return c
    const rand = mulberry32((cx * 73856093) ^ (cz * 19349663) ^ 0x7a11)
    const out: number[] = []
    for (let i = 0; i < PER_CELL; i++) {
      const x = (cx + rand()) * CELL
      const z = (cz + rand()) * CELL
      const t = tallAt(x, z)
      const turn = rand() * Math.PI * 2
      const jitter = 0.78 + rand() * 0.44
      if (t < 0.03) {
        out.push(x, 0, z, 0, turn)
        continue
      }
      // Knee-high at the rim, over your head soon after, 3–4 times your height in the middle.
      const h = (2.2 + 11.5 * Math.pow(t, 0.8)) * jitter
      out.push(x, this.terrain.heightAt(x, z) - 0.3, z, h, turn)
    }
    c = new Float32Array(out)
    this.cells.set(k, c)
    return c
  }

  update(dt: number, cam: THREE.Vector3, player: THREE.Vector3, wind: number, sun?: THREE.Vector3): void {
    this.uniforms.uTime.value += dt
    if (sun) this.uniforms.uSun.value.copy(sun)
    this.uniforms.uWind.value = wind
    this.uniforms.uPlayer.value.copy(player)
    const far = Math.hypot(cam.x - TALL.x, cam.z - TALL.z) - TALL.r
    this.mesh.visible = far < FAR
    if (!this.mesh.visible) return
    if (Math.hypot(cam.x - this.lastX, cam.z - this.lastZ) < 12) return
    this.lastX = cam.x
    this.lastZ = cam.z
    const r = Math.ceil((TALL.r + 40) / CELL)
    const c0x = Math.floor(TALL.x / CELL)
    const c0z = Math.floor(TALL.z / CELL)
    let n = 0
    for (let dz = -r; dz <= r && n < CAP; dz++) {
      for (let dx = -r; dx <= r && n < CAP; dx++) {
        const cx = c0x + dx
        const cz = c0z + dz
        const mx = (cx + 0.5) * CELL
        const mz = (cz + 0.5) * CELL
        if (Math.hypot(mx - TALL.x, mz - TALL.z) > TALL.r * 1.2) continue
        const d = Math.hypot(mx - cam.x, mz - cam.z)
        if (d > FAR) continue
        const per = d < NEAR ? PER_CELL : PER_CELL_FAR
        const c = this.cell(cx, cz)
        for (let i = 0; i < per && n < CAP; i++) {
          const h = c[i * 5 + 3]
          if (h <= 0) continue
          // (Far off, only the tall ones: the field's silhouette, not its rim.)
          if (d >= NEAR && h < 6) continue
          this.q.setFromAxisAngle(this.up, c[i * 5 + 4])
          // (Far off, each clump stands for the ones not drawn: wider, so the field reads solid.)
          const wide = d < NEAR ? 0.7 : 1.25
          this.m.compose(this.p.set(c[i * 5], c[i * 5 + 1], c[i * 5 + 2]), this.q, this.s.set(h * wide, h, h * wide))
          this.mesh.setMatrixAt(n++, this.m)
        }
      }
    }
    this.mesh.count = n
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
