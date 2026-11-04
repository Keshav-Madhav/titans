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
/** The bark strip trunks wrap round: u 0 … BARK_U, v BARK_V. (Below the leaves' u 0.05.) */
const BARK_U = 0.036
const BARK_V: [number, number] = [0.07, 0.93]
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
  // The trunks' opaque corner. (Both corners: the texture is flipped on upload
  // (flipY), so UV (0.02, 0.02) is the canvas's bottom-left — with only the top
  // one painted, every trunk sampled transparency and was cut away, leaving
  // the crowns hanging in the air.)
  g.fillRect(0, 0, 16, 16)
  g.fillRect(0, SIZE - 16, 16, 16)
  // Bark: a strip down the left edge (u 0 … BARK_U, between the corners) that
  // the trunks wrap round — pale (the vertex colour gives the hue), with long
  // dark furrows and a few cross cracks.
  {
    const bw = Math.round(BARK_U * SIZE)
    const y0 = Math.round(BARK_V[0] * SIZE)
    const y1 = Math.round(BARK_V[1] * SIZE)
    g.fillStyle = '#e4e0d8'
    g.fillRect(0, y0, bw, y1 - y0)
    const brand = mulberry32(5150)
    for (let i = 0; i < 9; i++) {
      let x = brand() * bw
      g.strokeStyle = `rgba(70, 58, 46, ${0.45 + brand() * 0.35})`
      g.lineWidth = 1 + brand() * 1.6
      g.beginPath()
      g.moveTo(x, y0)
      for (let y = y0; y < y1; y += 12) {
        x = Math.max(0, Math.min(bw, x + (brand() - 0.5) * 2.4))
        g.lineTo(x, y)
      }
      g.stroke()
    }
    for (let i = 0; i < 26; i++) {
      const y = y0 + brand() * (y1 - y0)
      g.fillStyle = `rgba(90, 76, 60, ${0.3 + brand() * 0.3})`
      g.fillRect(brand() * bw * 0.6, y, 3 + brand() * 6, 1.2)
    }
  }
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
  // Round the trunk once, up its length once: the bark strip (inset a little from its edges).
  const a = g.getAttribute('uv')
  for (let i = 0; i < a.count; i++) a.setXY(i, 0.002 + a.getX(i) * (BARK_U - 0.004), BARK_V[0] + 0.01 + a.getY(i) * (BARK_V[1] - BARK_V[0] - 0.02))
  return shade(g, hex)
}

/**
 * A near tree's trunk (graphics pass, 2026-11-04: up close it was a seven-sided pole): fourteen
 * sides, eight rings; at the foot a root flare spreading into lobes, the trunk bending a little as
 * it rises, bark in shallow vertical ridges. Same bark strip as the plain one.
 */
function trunkNear(r0: number, r1: number, h: number, hex: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, h, 14, 8).translate(0, h / 2, 0)
  const p = g.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const t = y / h
    const a = Math.atan2(z, x)
    // Roots: out at the foot in four or five lobes, dying away in the first metre or so.
    const lobes = 0.55 + 0.45 * Math.abs(Math.cos(a * 2.5 + seed))
    let k = 1 + 0.75 * Math.exp(-t * 11) * lobes
    // Bark ridges.
    k *= 1 + 0.035 * Math.sin(a * 11 + t * 3 + seed)
    // A slight bend, more toward the top.
    const bx = Math.sin(seed * 1.7) * 0.18 * t * t
    const bz = Math.cos(seed * 1.3) * 0.18 * t * t
    p.setXYZ(i, x * k + bx, y, z * k + bz)
  }
  g.computeVertexNormals()
  const a = g.getAttribute('uv')
  for (let i = 0; i < a.count; i++) a.setXY(i, 0.002 + a.getX(i) * (BARK_U - 0.004), BARK_V[0] + 0.01 + a.getY(i) * (BARK_V[1] - BARK_V[0] - 0.02))
  return shade(g, hex)
}

function finish(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!
}

/**
 * A broadleaf tree about 9–11 m tall (scaled per instance). `far`: the
 * middle-distance version — the same crown in a few big cards, a plain trunk.
 */
export function broadleafGeometry(seed: number, far = false, faint = false): THREE.BufferGeometry {
  const rand = mulberry32(seed)
  // A stout trunk standing clear under the crown: from across a field a tree
  // with no visible trunk reads as a dark blob hanging in the air.
  // (Far off, thicker than true: a trunk thinner than a pixel leaves the crown hanging in the air.)
  const parts: THREE.BufferGeometry[] = [far ? trunk(1.15, 0.7, 6.9, 0x5c4836, faint ? 3 : 5) : trunkNear(0.62, 0.32, 6.6, 0x6b5440, seed)]
  // A few limbs reaching up into the crown.
  for (let i = 0; i < (faint ? 0 : far ? 2 : 5); i++) {
    const a = (i / 5) * Math.PI * 2 + rand()
    const limb = trunk(0.22, 0.08, 3.8, 0x6b5440, far ? 5 : 8)
    limb.rotateZ(0.75).rotateY(a).translate(0, 5.2 + rand() * 0.8, 0)
    parts.push(limb)
  }
  const centre = new THREE.Vector3(0, 8.6, 0)
  const crown: THREE.BufferGeometry[] = []
  // Clusters on an egg-shaped shell; each a fan of crossed leaf cards.
  // A broad, flattened dome (wider than tall), so the outline is a crown, not a heart.
  // (Faint: a few hundred metres off, a tree is a few pixels: half the cards, bigger.)
  const clusters = faint ? 5 : far ? 8 : 18
  for (let c = 0; c < clusters; c++) {
    const u = rand() * 1.6 - 0.6
    const t = rand() * Math.PI * 2
    const s = Math.sqrt(1 - u * u)
    const px = Math.cos(t) * s * (far ? 3.3 : 3.9)
    const py = u * 1.7 + 0.3
    const pz = Math.sin(t) * s * (far ? 3.3 : 3.9)
    for (let k = 0; k < (faint ? 2 : far ? 3 : 9); k++) {
      const q = card(faint ? 5.6 : far ? 4.6 : 3.0, faint ? 5.6 : far ? 4.6 : 3.0, LEAVES)
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
export function coniferGeometry(seed: number, far = false, faint = false): THREE.BufferGeometry {
  const rand = mulberry32(seed)
  const parts: THREE.BufferGeometry[] = [trunk(0.3, 0.08, 12.5, 0x4a3828, faint ? 3 : far ? 4 : 7)]
  const branches: THREE.BufferGeometry[] = []
  // (Full: tier on tier of wide, overlapping boughs, so it reads as a dark
  // green spire, not a pole with a few fronds — it did, once its trunk showed.)
  const tiers = faint ? 4 : far ? 6 : 13
  for (let t = 0; t < tiers; t++) {
    const k = t / (tiers - 1)
    const y = 2.2 + k * 9.8
    const reach = (3.5 * (1 - k) + 0.7) * (faint ? 1.35 : far ? 1.2 : 1)
    const n = faint ? 4 : far ? 6 : Math.max(5, Math.round(10 - k * 5))
    for (let i = 0; i < n; i++) {
      // A branch card hanging from the trunk, tipped down at the end.
      const b = card(reach * (far ? 1.5 : 1.25), reach * (far ? 1.6 : 1.35), NEEDLES, true)
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
    // Bark, drawn here rather than sampled (the strip is too few pixels to hold
    // it): u round the trunk, v up it — deep furrows that wander, ridges between,
    // a few cross cracks; and the light catches the ridges.
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      if (vMapUv.x < ${BARK_U.toFixed(4)}) {
        float ba = vMapUv.x / ${BARK_U.toFixed(4)};
        float bh = vMapUv.y;
        float wob = sin(bh * 41.0 + ba * 9.0) * 0.35 + sin(bh * 113.0) * 0.12;
        float ridge = abs(sin((ba * 9.0 + wob) * 3.14159));
        float furrow = smoothstep(0.0, 0.55, ridge);
        float crack = step(0.93, fract(sin(floor(bh * 70.0) * 12.9898 + floor(ba * 9.0) * 78.233) * 43758.5)) * (1.0 - smoothstep(0.0, 0.25, ridge));
        diffuseColor.rgb *= (0.42 + 0.68 * furrow) * (1.0 - 0.35 * crack) * (0.9 + 0.2 * fract(sin(floor(bh * 23.0) * 7.31) * 913.7));
      }`,
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
        // An ordered 4×4 (Bayer) threshold: an even screen-door, not white noise (which read as
        // crawling grey static across a fir branch passing close to the camera).
        ivec2 bq = ivec2(mod(gl_FragCoord.xy, 4.0));
        int bi = bq.x + bq.y * 4;
        float bayer[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
        float dith = (bayer[bi] + 0.5) / 16.0;
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
