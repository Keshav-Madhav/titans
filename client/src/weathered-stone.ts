// Stone blocks that have stood a long time (resonance rings, lore slabs).
import * as THREE from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

/**
 * A standing stone that has stood a long time (QA cycle 7: they were clean boxes with knife edges,
 * like concrete posts set down on the grass): a tapering block with rounded corners (a squircle
 * section), weather-rounded top edges, small dents, and — `broken` — a corner of the top gone.
 */
export function weatheredStone(w: number, h: number, d: number, rand: () => number, broken = true, taper = 0.22, flatTop = false): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry = new THREE.BoxGeometry(w, h, d, 6, Math.max(6, Math.round(h * 3)), 4)
  const p = geo.getAttribute('position') as THREE.BufferAttribute
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute
  // The box's own face normals: which vertices belong to a top or bottom face (mapped in x, z).
  const faceN = geo.getAttribute('normal') as THREE.BufferAttribute
  const s1 = rand() * 100
  const breakSide = rand() < 0.5 ? -1 : 1
  const breakDepth = broken ? 0.06 + rand() * 0.12 : 0
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) / (w / 2)
    let z = p.getZ(i) / (d / 2)
    const y = p.getY(i)
    const t = (y + h / 2) / h
    // Square section → squircle: the corners worn round.
    const m = Math.max(Math.abs(x), Math.abs(z))
    const ux = m > 1e-6 ? x / m : 0
    const uz = m > 1e-6 ? z / m : 0
    // (At a face's very centre ux = uz = 0: 1/0 made the position NaN — the sweep caught it.)
    const k = m > 1e-6 ? 1 / Math.pow(ux ** 4 + uz ** 4, 0.25) : 1
    x = ux * k * m
    z = uz * k * m
    // Taper, and the top edges rounded over the last ~12%.
    const top = Math.max(0, (t - 0.88) / 0.12)
    const shrink = (1 - taper * t) * (1 - (flatTop ? 0.12 : 0.35) * top * top)
    // Dents and swells: a slow hash noise, a few centimetres.
    const n = Math.sin(x * 3.1 + y * 2.3 + s1) * Math.sin(z * 2.7 - y * 1.9 + s1 * 1.3) * 0.035
    let px = x * (w / 2) * shrink * (1 + n)
    let pz = z * (d / 2) * shrink * (1 + n)
    // (flatTop: things rest on it — the altar's bow, offerings — so its top stays at its height.)
    let py = flatTop ? y : y - top * top * h * 0.03
    // A corner of the top broken off, long ago (a slanting cut).
    if (breakDepth > 0) {
      const cut = h / 2 - h * breakDepth * Math.max(0, x * breakSide * 0.7 + 0.3)
      if (py > cut) py = cut + (py - cut) * 0.15
    }
    p.setXYZ(i, px, py, pz)
    // (Texture in metres, not one tile per face: on a 4 m stone the carving stretched into wood grain.)
    // (Tops and bottoms in x, z: mapped like the sides they streaked into stripes.)
    if (Math.abs(faceN.getY(i)) > 0.5) uv.setXY(i, px * 0.55, pz * 0.55)
    else uv.setXY(i, (px + pz) * 0.55, py * 0.55)
  }
  // Smooth normals across the old box edges: the faces' vertices are split there (each face has its
  // own UVs), so take normals from a position-only merged copy and hand them back by position.
  const solid = mergeVertices(new THREE.BufferGeometry().setAttribute('position', p.clone()).setIndex(geo.getIndex()), 1e-4)
  solid.computeVertexNormals()
  const key = (x: number, y: number, z: number) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`
  const byPos = new Map<string, [number, number, number]>()
  const sp = solid.getAttribute('position')
  const sn = solid.getAttribute('normal')
  for (let i = 0; i < sp.count; i++) byPos.set(key(sp.getX(i), sp.getY(i), sp.getZ(i)), [sn.getX(i), sn.getY(i), sn.getZ(i)])
  geo.computeVertexNormals()
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const v = byPos.get(key(p.getX(i), p.getY(i), p.getZ(i)))
    if (v) nrm.setXYZ(i, v[0], v[1], v[2])
  }
  return geo
}

