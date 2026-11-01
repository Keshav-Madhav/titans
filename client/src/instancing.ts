// Static instanced things spread over the land (the Giant Wood's crowns, the
// Steps' chains) were one mesh each, never culled: every leaf card of a forest
// 5 km away went through the shadow pass every frame (0.9 M triangles from the
// Green). Split into tiles, each culled on its own, they cost nothing until
// you are near — and only the tiles in view (or in the shadow map's box) then.

import * as THREE from 'three'

/**
 * `src`'s instances, regrouped by `tile`-metre squares into culled meshes (same
 * material). `farther`: coarser geometries and the distance (from the tile's
 * middle) each takes over at — a tile then is a THREE.LOD.
 */
export function splitByTile(src: THREE.InstancedMesh, tile: number, farther: Array<[THREE.BufferGeometry, number]> = []): THREE.Group {
  const group = new THREE.Group()
  const a = src.instanceMatrix.array
  const byTile = new Map<string, number[]>()
  for (let i = 0; i < src.count; i++) {
    const k = `${Math.floor(a[i * 16 + 12] / tile)},${Math.floor(a[i * 16 + 14] / tile)}`
    let list = byTile.get(k)
    if (!list) byTile.set(k, (list = []))
    list.push(i)
  }
  for (const list of byTile.values()) {
    // (The tile's middle: where a LOD measures its distance from.)
    const mid = new THREE.Vector3()
    for (const i of list) mid.x += a[i * 16 + 12] / list.length
    for (const i of list) mid.y += a[i * 16 + 13] / list.length
    for (const i of list) mid.z += a[i * 16 + 14] / list.length
    const levels = [src.geometry, ...farther.map(([g]) => g)].map((geo) => {
      const m = new THREE.InstancedMesh(geo, src.material, list.length)
      list.forEach((i, j) => {
        m.instanceMatrix.array.set(a.subarray(i * 16, i * 16 + 16), j * 16)
        if (src.instanceColor) {
          if (!m.instanceColor) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3)
          m.instanceColor.array.set(src.instanceColor.array.subarray(i * 3, i * 3 + 3), j * 3)
        }
      })
      m.castShadow = src.castShadow
      m.receiveShadow = src.receiveShadow
      m.frustumCulled = true
      if (farther.length) m.position.copy(mid).negate()
      m.computeBoundingSphere()
      return m
    })
    if (!farther.length) {
      group.add(levels[0])
      continue
    }
    const lod = new THREE.LOD()
    lod.position.copy(mid)
    levels.forEach((m, k) => {
      // (The far levels draw no shadows: the shadow map only reaches a few hundred metres.)
      if (k > 0) m.castShadow = false
      lod.addLevel(m, k === 0 ? 0 : farther[k - 1][1])
    })
    group.add(lod)
  }
  return group
}
