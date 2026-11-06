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
    // Thinner toward the edges: a lobed clump well inside its card, never touching the card's edge
    // (filled to the edge, the mipmaps far off turned every card into a solid square and the far
    // crowns read as stacks of blocks — cycle 7, the Green's hilltop trees).
    const ex = (x - (lx0 + lw / 2)) / (lw / 2)
    const ey = (y - SIZE / 2) / (SIZE / 2)
    const ang = Math.atan2(ey, ex)
    const lobe = 0.7 + 0.12 * Math.sin(ang * 5 + 1.3) + 0.06 * Math.sin(ang * 9 + 0.4)
    if (Math.hypot(ex, ey) > lobe + rand() * 0.08) continue
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
      // (A touch lighter than true-dark: at 17–30% the firs read as black cut-outs against the green.)
      g.strokeStyle = `hsl(${116 + rand() * 25}, ${30 + rand() * 15}%, ${21 + rand() * 15}%)`
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
 * A near tree's limb (QA cycle 7, the Old Wood: straight eight-sided poles jutting from the trunk
 * like sticks pushed into it): a tapered tube along a curve that leaves the trunk, arcs outward and
 * turns up into the crown, with a smaller fork part way along. Base at the origin, reaching along
 * +x; the caller turns it round the trunk.
 */
function limbNear(len: number, r0: number, rand: () => number, hex: number, depth = 0): THREE.BufferGeometry {
  const lift = 0.35 + rand() * 0.3
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(len * 0.35, len * 0.12, (rand() - 0.5) * len * 0.12),
    new THREE.Vector3(len * 0.7, len * (0.3 + lift * 0.3), (rand() - 0.5) * len * 0.2),
    new THREE.Vector3(len * 0.9, len * (0.55 + lift * 0.5), (rand() - 0.5) * len * 0.25),
  ])
  const SEG = depth ? 5 : 9
  const RAD = depth ? 5 : 8
  const frames = curve.computeFrenetFrames(SEG, false)
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG
    const c = curve.getPointAt(t)
    // Tapering to a point-ish tip; a little swelling where it leaves the trunk.
    const r = r0 * (1 - 0.72 * t) * (1 + 0.35 * Math.exp(-t * 14))
    const n = frames.normals[i]
    const b = frames.binormals[i]
    for (let j = 0; j <= RAD; j++) {
      const a = (j / RAD) * Math.PI * 2
      const cs = Math.cos(a)
      const sn = Math.sin(a)
      pos.push(c.x + r * (cs * n.x + sn * b.x), c.y + r * (cs * n.y + sn * b.y), c.z + r * (cs * n.z + sn * b.z))
      uv.push(0.002 + (j / RAD) * (BARK_U - 0.004), BARK_V[0] + 0.01 + t * (BARK_V[1] - BARK_V[0] - 0.02))
    }
  }
  for (let i = 0; i < SEG; i++)
    for (let j = 0; j < RAD; j++) {
      const a = i * (RAD + 1) + j
      const b = a + RAD + 1
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }
  let g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  g = shade(g, hex)
  if (depth === 0) {
    // A fork: a thinner limb from about halfway, turned off to one side and up.
    const at = 0.45 + rand() * 0.2
    const p = curve.getPointAt(at)
    const fork = limbNear(len * 0.5, r0 * 0.5, rand, hex, 1)
    fork.rotateZ(0.35 + rand() * 0.3).rotateY((rand() < 0.5 ? -1 : 1) * (0.6 + rand() * 0.5)).translate(p.x, p.y, p.z)
    g = finish([g, fork])
  }
  return g
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
    const limb = far ? trunk(0.22, 0.08, 3.8, 0x6b5440, 5).rotateZ(0.75) : limbNear(3.9 + rand() * 0.8, 0.24, rand, 0x56432f).rotateZ(0.18 + rand() * 0.2)
    limb.rotateY(a).translate(0, 5.0 + rand() * 1.0, 0)
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
      const q = card(faint ? 6.4 : far ? 5.3 : 3.4, faint ? 6.4 : far ? 5.3 : 3.4, LEAVES)
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
/** Tools: alpha lift per mip level for foliage cut-outs (0 = off, to compare). */
export const foliageMipLift = { value: 0.3 }

export function foliageMaterial(map: THREE.Texture, time: { value: number }, sway: number): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.85, alphaTest: 0.42, side: THREE.DoubleSide })
  mat.alphaToCoverage = true
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time
    sh.uniforms.uFocus = foliageFocus
    sh.uniforms.uMipLift = foliageMipLift
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uFocus;\nuniform float uMipLift;')
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
      float barkH = -1.0;
      if (vMapUv.x < ${BARK_U.toFixed(4)}) {
        float ba = vMapUv.x / ${BARK_U.toFixed(4)};
        float bh = vMapUv.y;
        // (Denser, finer, broken — QA cycle 7: up close nine furrows round a trunk read as a few
        // wavy lines painted on a smooth post.)
        float wob = sin(bh * 41.0 + ba * 17.0) * 0.35 + sin(bh * 113.0 + ba * 5.0) * 0.14 + sin(bh * 271.0) * 0.05;
        float ridge = abs(sin((ba * 17.0 + wob) * 3.14159));
        float furrow = smoothstep(0.0, 0.5, ridge);
        // Fine ridges between the furrows, and short broken plates across them.
        float fine = abs(sin((ba * 53.0 + wob * 2.3 + sin(bh * 190.0) * 0.2) * 3.14159));
        float plate = fract(sin(floor(bh * 140.0 + ba * 9.0) * 12.9898 + floor(ba * 17.0 + wob) * 78.233) * 43758.5);
        float crack = step(0.86, plate) * (1.0 - smoothstep(0.0, 0.3, ridge));
        diffuseColor.rgb *= (0.36 + 0.74 * furrow) * (0.86 + 0.14 * smoothstep(0.1, 0.8, fine)) * (1.0 - 0.4 * crack) * (0.88 + 0.24 * plate * smoothstep(0.4, 0.9, ridge));
        // The same pattern as relief (bumped below): ridges stand, furrows and cracks sink.
        barkH = furrow * 0.7 + smoothstep(0.1, 0.8, fine) * 0.2 - crack * 0.3;
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
      #endif
      // Bark in relief, bumped from the pattern's screen derivatives (three's perturbNormalArb):
      // the furrows catch the light and shade (QA cycle 7: colour alone read as painted).
      if (barkH > -0.5) {
        vec3 bSx = dFdx(-vViewPosition);
        vec3 bSy = dFdy(-vViewPosition);
        vec3 bR1 = cross(bSy, normal);
        vec3 bR2 = cross(normal, bSx);
        float bDet = dot(bSx, bR1);
        vec2 bdH = vec2(dFdx(barkH), dFdy(barkH)) * 0.035;
        vec3 bGrad = sign(bDet) * (bdH.x * bR1 + bdH.y * bR2);
        normal = normalize(abs(bDet) * normal - bGrad);
      }`,
      )
      .replace(
        '#include <alphatest_fragment>',
        `// Far off the mipmaps average thin needles and leaf edges into faint alpha, the cut takes most
        // of it, and a fir became a bare dark skeleton (QA cycle 7, the Green's edge): lift alpha
        // by how far down the mip chain this pixel reads (alpha-test mip compensation).
        {
          vec2 tdx = dFdx(vMapUv) * ${SIZE}.0;
          vec2 tdy = dFdy(vMapUv) * ${SIZE}.0;
          float tlod = max(0.0, 0.5 * log2(max(dot(tdx, tdx), dot(tdy, tdy))));
          diffuseColor.a *= 1.0 + tlod * uMipLift;
        }
        #include <alphatest_fragment>
        float nearCam = length(vViewPosition);
        // An ordered 4×4 (Bayer) threshold: an even screen-door, not white noise (which read as
        // crawling grey static across a fir branch passing close to the camera).
        // (Computed, not looked up: a table indexed by a variable goes to memory per pixel on Apple
        // GPUs — the terrain's 10 ms, cycle 7. 4·b2(low bits) + b2(high bits), b2 the 2×2 matrix.)
        ivec2 bq = ivec2(mod(gl_FragCoord.xy, 4.0));
        int b2lo = ((bq.x ^ bq.y) & 1) * 2 + (bq.y & 1);
        ivec2 bh = bq >> 1;
        int b2hi = ((bh.x ^ bh.y) & 1) * 2 + (bh.y & 1);
        float dith = (float(4 * b2lo + b2hi) + 0.5) / 16.0;
        // (A narrow band: over 2.6 m of depth the whole near branch was a screen-door — QA cycle 6, a
        // forest frame half covered in an even dot grid. Over 0.6 m it is a soft edge, not a pattern.)
        // (Faded through coverage, not cut: with alpha-to-coverage on 4× MSAA a falling alpha thins a
        // leaf by sub-samples, so the dither only has to break up four levels, and the fade reads as a
        // soft thinning — cut by the dither alone it was a coarse grid of dots, tour review 2026-11-07.)
        float fadeK = smoothstep(2.6, 3.8, nearCam + 0.25 * (dith - 0.5));
        // Between the camera and the wanderer, leaves thin out (the wanderer is
        // never lost behind a tree): within a tube round that line, dithered.
        vec3 sp = (viewMatrix * vec4(uFocus, 1.0)).xyz;
        vec3 fp = -vViewPosition;
        float along = clamp(dot(fp, sp) / dot(sp, sp), 0.0, 1.0);
        float tube = length(fp - sp * along);
        if (along < 0.97) {
          float r = 1.4 + 2.2 * along;
          fadeK *= smoothstep(r * 0.7, r * 1.05, tube + 0.12 * r * (dith - 0.5));
        }
        diffuseColor.a *= fadeK;
        if (diffuseColor.a < 0.02) discard;`,
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
