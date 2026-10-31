// Trees that read as trees: crowns made of clusters of leaf cards (alpha-cut
// leaves on quads) instead of solid blobs. The cards' normals point out from
// the crown's centre, so a crown is lit softly as one rounded mass — the
// painterly trees of Shadow of the Colossus and Ghibli — while its silhouette
// stays leafy and the light comes through the gaps. Firs are tiers of drooping
// needle-branch cards. Leaves flutter; whole trees sway.
//
// One texture holds everything: leaves and needles drawn on a canvas (no
// download), plus an opaque white corner the trunks map to (their colour comes
// from the vertex colours), so a whole tree is one geometry and one material.

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { mulberry32 } from '@titans/shared'

const SIZE = 512
/** UV of the opaque white patch trunks use. */
const TRUNK_UV: [number, number] = [0.02, 0.02]
/** UV rectangles (u0, v0, u1, v1) of the leaf and needle areas. */
const LEAVES: [number, number, number, number] = [0.05, 0.0, 0.55, 1.0]
const NEEDLES: [number, number, number, number] = [0.55, 0.0, 1.0, 1.0]

/** The shared foliage texture (drawn once). */
export function foliageTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = SIZE
  const g = c.getContext('2d')!
  const rand = mulberry32(4242)
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, 16, 16)
  // Leaves: a dense clump of soft ovals, lighter toward the top.
  const lx0 = LEAVES[0] * SIZE
  const lw = (LEAVES[2] - LEAVES[0]) * SIZE
  for (let i = 0; i < 520; i++) {
    const x = lx0 + 14 + rand() * (lw - 28)
    const y = 14 + rand() * (SIZE - 28)
    // Thinner toward the edges: a rounded clump, not a square of leaves.
    const ex = (x - (lx0 + lw / 2)) / (lw / 2)
    const ey = (y - SIZE / 2) / (SIZE / 2)
    if (ex * ex + ey * ey > 0.95 + rand() * 0.1) continue
    const l = 17 + rand() * 15 + (1 - y / SIZE) * 6
    g.fillStyle = `hsl(${80 + rand() * 24}, ${40 + rand() * 20}%, ${l}%)`
    g.save()
    g.translate(x, y)
    g.rotate(rand() * Math.PI * 2)
    g.beginPath()
    g.ellipse(0, 0, 10 + rand() * 7, 4.5 + rand() * 3.5, 0, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = 'rgba(30, 40, 15, 0.35)'
    g.fillRect(-7, -0.6, 14, 1.2)
    g.restore()
  }
  // Needles: a drooping fir branch — a dark stem with needles along it.
  const nx0 = NEEDLES[0] * SIZE
  const nw = (NEEDLES[2] - NEEDLES[0]) * SIZE
  g.lineCap = 'round'
  for (let b = 0; b < 3; b++) {
    const cx = nx0 + nw * (0.2 + 0.3 * b)
    for (let i = 0; i < 230; i++) {
      const t = rand()
      const y = 8 + t * (SIZE - 16)
      const spread = (1 - Math.abs(t - 0.45) * 1.4) * nw * 0.16
      const side = rand() < 0.5 ? -1 : 1
      g.strokeStyle = `hsl(${118 + rand() * 25}, ${28 + rand() * 15}%, ${17 + rand() * 13}%)`
      g.lineWidth = 2 + rand() * 1.5
      g.beginPath()
      g.moveTo(cx, y)
      g.lineTo(cx + side * spread * (0.5 + rand() * 0.5), y + 6 + rand() * 10)
      g.stroke()
    }
    g.strokeStyle = '#3a2c1e'
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(cx, 6)
    g.lineTo(cx, SIZE - 6)
    g.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** A quad of `w` × `h`, centred on its middle (or its top edge), mapped to `uv`. */
function card(w: number, h: number, uv: [number, number, number, number], top = false): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h)
  if (top) g.translate(0, -h / 2, 0)
  const a = g.getAttribute('uv')
  for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * (uv[2] - uv[0]), uv[1] + a.getY(i) * (uv[3] - uv[1]))
  return g
}

/** Paint every vertex one colour, darker toward `centre`'s inside and bottom (ambient occlusion). */
function shade(g: THREE.BufferGeometry, hex: number, centre?: THREE.Vector3, radius = 1): THREE.BufferGeometry {
  const c = new THREE.Color(hex)
  const p = g.getAttribute('position')
  const col = new Float32Array(p.count * 3)
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    let k = 1
    if (centre) {
      v.fromBufferAttribute(p, i).sub(centre)
      k = 0.55 + 0.45 * Math.min(1, v.length() / radius) * (0.7 + 0.3 * Math.max(-1, Math.min(1, v.y / radius)))
    }
    col.set([c.r * k, c.g * k, c.b * k], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

/** Point the normals out from the crown's centre (softly), for one rounded mass of light. */
function crownNormals(g: THREE.BufferGeometry, centre: THREE.Vector3, squash = 1): void {
  const p = g.getAttribute('position')
  const n = new Float32Array(p.count * 3)
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(centre)
    v.y *= squash
    v.normalize().lerp(new THREE.Vector3(0, 1, 0), 0.15).normalize()
    n.set([v.x, v.y, v.z], i * 3)
  }
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3))
}

function trunk(r0: number, r1: number, h: number, hex: number, segs = 7): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, h, segs, 2).translate(0, h / 2, 0)
  const a = g.getAttribute('uv')
  for (let i = 0; i < a.count; i++) a.setXY(i, TRUNK_UV[0], TRUNK_UV[1])
  return shade(g, hex)
}

function finish(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!
}

/**
 * A broadleaf tree about 9–11 m tall (scaled per instance). `far`: the
 * middle-distance version — the same crown in a few big cards, a plain trunk.
 */
export function broadleafGeometry(seed: number, far = false): THREE.BufferGeometry {
  const rand = mulberry32(seed)
  // A stout trunk standing clear under the crown: from across a field a tree
  // with no visible trunk reads as a dark blob hanging in the air.
  // (Far off, thicker than true: a trunk thinner than a pixel leaves the crown hanging in the air.)
  const parts: THREE.BufferGeometry[] = [far ? trunk(1.15, 0.7, 6.9, 0x5c4836, 5) : trunk(0.62, 0.32, 6.6, 0x6b5440, 7)]
  // A few limbs reaching up into the crown.
  for (let i = 0; i < (far ? 2 : 5); i++) {
    const a = (i / 5) * Math.PI * 2 + rand()
    const limb = trunk(0.22, 0.08, 3.8, 0x6b5440, 5)
    limb.rotateZ(0.75).rotateY(a).translate(0, 5.2 + rand() * 0.8, 0)
    parts.push(limb)
  }
  const centre = new THREE.Vector3(0, 8.6, 0)
  const crown: THREE.BufferGeometry[] = []
  // Clusters on an egg-shaped shell; each a fan of crossed leaf cards.
  // A broad, flattened dome (wider than tall), so the outline is a crown, not a heart.
  const clusters = far ? 8 : 18
  for (let c = 0; c < clusters; c++) {
    const u = rand() * 1.6 - 0.6
    const t = rand() * Math.PI * 2
    const s = Math.sqrt(1 - u * u)
    const px = Math.cos(t) * s * (far ? 3.3 : 3.9)
    const py = u * 1.7 + 0.3
    const pz = Math.sin(t) * s * (far ? 3.3 : 3.9)
    for (let k = 0; k < (far ? 3 : 9); k++) {
      const q = card(far ? 4.6 : 3.0, far ? 4.6 : 3.0, LEAVES)
      q.rotateX(rand() * Math.PI).rotateY(rand() * Math.PI * 2).rotateZ((rand() - 0.5) * 0.8)
      q.translate(centre.x + px + (rand() - 0.5) * 1.1, centre.y + py + (rand() - 0.5) * 1.0, centre.z + pz + (rand() - 0.5) * 1.1)
      crown.push(q)
    }
  }
  const leaves = finish(crown)
  crownNormals(leaves, centre, 1.3)
  shade(leaves, 0xffffff, centre, 3.6)
  parts[0].computeVertexNormals()
  return finish([...parts, leaves])
}

/** A fir about 11–13 m tall (scaled per instance). `far`: fewer, bigger branch cards. */
export function coniferGeometry(seed: number, far = false): THREE.BufferGeometry {
  const rand = mulberry32(seed)
  const parts: THREE.BufferGeometry[] = [trunk(0.3, 0.08, 12.5, 0x4a3828, far ? 4 : 7)]
  const branches: THREE.BufferGeometry[] = []
  const tiers = far ? 4 : 9
  for (let t = 0; t < tiers; t++) {
    const k = t / (tiers - 1)
    const y = 2.6 + k * 9.2
    const reach = (3.1 * (1 - k) + 0.6) * (far ? 1.15 : 1)
    const n = far ? 4 : Math.max(4, Math.round(8 - k * 4))
    for (let i = 0; i < n; i++) {
      // A branch card hanging from the trunk, tipped down at the end.
      const b = card(reach * (far ? 1.3 : 0.9), reach * (far ? 1.5 : 1.25), NEEDLES, true)
      b.rotateX(-Math.PI / 2 + 0.35 + rand() * 0.2) // lying out, drooping
      b.rotateY((i / n) * Math.PI * 2 + t * 0.6 + rand() * 0.3)
      b.translate(0, y + 0.2, 0)
      branches.push(b)
    }
  }
  const needles = finish(branches)
  const centre = new THREE.Vector3(0, 6.5, 0)
  crownNormals(needles, centre, 0.7)
  shade(needles, 0xffffff, centre, 4.5)
  return finish([...parts, needles])
}

/** Where the wanderer is (world space, chest height): foliage between it and the camera thins out. */
export const foliageFocus = { value: new THREE.Vector3() }

/**
 * The foliage material: alpha-cut (with alpha-to-coverage, so cut edges stay
 * soft under multisampling), both faces lit alike (the cards' crown normals
 * are not flipped on their backs), whole trees swaying and leaves fluttering.
 */
export function foliageMaterial(map: THREE.Texture, time: { value: number }, sway: number): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.85, alphaTest: 0.42, side: THREE.DoubleSide })
  mat.alphaToCoverage = true
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time
    sh.uniforms.uFocus = foliageFocus
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uFocus;')
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vec3 root = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      // Far off, the ground's coarser mesh sags below the true hill under a tree
      // (it would hang in the air): settle far trees a little into the ground.
      transformed.y -= clamp((distance(root, cameraPosition) - 220.0) * 0.004, 0.0, 6.0);
      float phase = root.x * 0.07 + root.z * 0.05;
      float sway = sin(uTime * 1.3 + phase) * ${sway.toFixed(4)} * max(0.0, transformed.y);
      transformed.x += sway;
      transformed.z += sway * 0.6;
      // Leaves flutter (not the trunk: it maps to the corner of the texture).
      float leaf = step(0.04, uv.x);
      transformed += leaf * 0.06 * vec3(sin(uTime * 4.1 + position.y * 3.0 + phase), sin(uTime * 3.3 + position.x * 2.7), cos(uTime * 3.7 + position.z * 3.1));`,
    )
    // DoubleSide flips back-face normals; the crown normals are meant for both faces.
    // And leaves right in front of the camera dissolve (dithered), so walking
    // through a wood never fills the screen with a wall of cards.
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
      #ifdef DOUBLE_SIDED
        normal *= faceDirection;
      #endif`,
      )
      .replace(
        '#include <alphatest_fragment>',
        `#include <alphatest_fragment>
        float nearCam = length(vViewPosition);
        float dith = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
        if (nearCam < 2.2 + 2.6 * dith) discard;
        // Between the camera and the wanderer, leaves thin out (the wanderer is
        // never lost behind a tree): within a tube round that line, dithered.
        vec3 sp = (viewMatrix * vec4(uFocus, 1.0)).xyz;
        vec3 fp = -vViewPosition;
        float along = clamp(dot(fp, sp) / dot(sp, sp), 0.0, 1.0);
        float tube = length(fp - sp * along);
        if (along < 0.97 && tube < (1.4 + 2.2 * along) * (0.55 + 0.45 * dith)) discard;`,
      )
  }
  return mat
}

/**
 * A giant tree's crown, centred on the origin: `clusters` billows of leaf
 * cards on an egg-shaped shell of radius `R` (the cards `card` metres across).
 * The cards' UVs never touch the trunk corner, so the whole crown flutters.
 */
export function canopyGeometry(seed: number, R: number, card_: number, clusters: number, perCluster: number): THREE.BufferGeometry {
  const rand = mulberry32(seed)
  const parts: THREE.BufferGeometry[] = []
  const centre = new THREE.Vector3()
  for (let c = 0; c < clusters; c++) {
    // Through the whole volume (denser toward the skin), more above the middle.
    const u = rand() * 1.6 - 0.6
    const t = rand() * Math.PI * 2
    const s = Math.sqrt(1 - Math.min(1, u * u))
    const k = Math.pow(rand(), 0.3)
    const px = Math.cos(t) * s * R * k
    const py = u * R * 0.62 * k
    const pz = Math.sin(t) * s * R * k
    for (let k = 0; k < perCluster; k++) {
      const q = card(card_, card_, LEAVES)
      q.rotateX(rand() * Math.PI).rotateY(rand() * Math.PI * 2).rotateZ((rand() - 0.5) * 0.8)
      q.translate(px + (rand() - 0.5) * card_ * 0.9, py + (rand() - 0.5) * card_ * 0.7, pz + (rand() - 0.5) * card_ * 0.9)
      parts.push(q)
    }
  }
  const g = finish(parts)
  crownNormals(g, centre, 1.4)
  shade(g, 0xffffff, centre, R)
  return g
}

/**
 * A bush: a low dome of leaf cards (about 2.6 m across, 1.6 m tall), lit as
 * one soft mass. `cards` sets how full it is (a scrub is a handful).
 */
export function bushGeometry(seed: number, cards: number, size = 1): THREE.BufferGeometry {
  const rand = mulberry32(seed)
  const parts: THREE.BufferGeometry[] = []
  const centre = new THREE.Vector3(0, 0.55 * size, 0)
  for (let k = 0; k < cards; k++) {
    const a = rand() * Math.PI * 2
    const r = Math.sqrt(rand()) * 0.75 * size
    const q = card(1.5 * size, 1.5 * size, LEAVES)
    q.rotateX(rand() * Math.PI).rotateY(rand() * Math.PI * 2)
    q.translate(Math.cos(a) * r, (0.5 + rand() * 0.45) * size, Math.sin(a) * r)
    parts.push(q)
  }
  const g = finish(parts)
  crownNormals(g, centre, 1.6)
  shade(g, 0xffffff, centre, 1.2 * size)
  return g
}
