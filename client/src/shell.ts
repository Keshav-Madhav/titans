// Open shells (a bell, a bowl, a lathed hood) are one surface: drawn from outside only, seen from
// underneath or within they vanish — the user, 2026-11-07, looking up into the gate bell and seeing
// the sky through it. `withInside` gives such a shape its inside: the same surface moved in by the
// wall's thickness, turned to face the hollow, merged with the outside into one geometry (still one
// draw, still single-sided and back-face culled).

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export function withInside(outer: THREE.BufferGeometry, thickness: number): THREE.BufferGeometry {
  const out = outer.index ? outer.toNonIndexed() : outer.clone()
  if (!out.getAttribute('normal')) out.computeVertexNormals()
  const inn = out.clone()
  const p = inn.getAttribute('position') as THREE.BufferAttribute
  const n = inn.getAttribute('normal') as THREE.BufferAttribute
  // In by the wall's thickness, along the surface's own normal.
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) - n.getX(i) * thickness, p.getY(i) - n.getY(i) * thickness, p.getZ(i) - n.getZ(i) * thickness)
  // Each triangle's winding reversed (so the hollow side is the front), and the normals turned in.
  const swap = (a: THREE.BufferAttribute, i: number, j: number) => {
    for (let k = 0; k < a.itemSize; k++) {
      const t = a.getComponent(i, k)
      a.setComponent(i, k, a.getComponent(j, k))
      a.setComponent(j, k, t)
    }
  }
  for (const name of Object.keys(inn.attributes)) {
    const a = inn.getAttribute(name) as THREE.BufferAttribute
    for (let i = 0; i < a.count; i += 3) swap(a, i + 1, i + 2)
  }
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i))
  // (Only the attributes both share, so they merge.)
  for (const name of Object.keys(out.attributes)) if (!inn.getAttribute(name)) out.deleteAttribute(name)
  return mergeGeometries([out, inn])!
}
