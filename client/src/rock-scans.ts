// Scanned boulders (CC0, Poly Haven; processed by tools/build-rocks.mjs into public/models/rocks):
// loaded in the background after the world is up; until they arrive — or if they never do — the
// made boulders stand in.

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const SCANS = ['namaqualand_boulder_02', 'namaqualand_boulder_03', 'namaqualand_boulder_05']

function firstMesh(root: THREE.Object3D): { geo: THREE.BufferGeometry; mat: THREE.Material } | null {
  const geos: THREE.BufferGeometry[] = []
  let mat: THREE.Material | null = null
  root.updateMatrixWorld(true)
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    geos.push(m.geometry.clone().applyMatrix4(m.matrixWorld))
    mat ??= Array.isArray(m.material) ? m.material[0] : m.material
  })
  if (!geos.length) return null
  const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos)!
  geo.computeBoundingSphere()
  return { geo, mat: mat ?? new THREE.MeshStandardMaterial() }
}

export async function loadRockScans(): Promise<{ near: Array<{ geo: THREE.BufferGeometry; mat: THREE.Material }>; far: THREE.BufferGeometry; pebble?: { geo: THREE.BufferGeometry; mat: THREE.Material } } | null> {
  const base = import.meta.env.BASE_URL ?? '/'
  const loader = new GLTFLoader()
  try {
    const near = await Promise.all(SCANS.map((n) => loader.loadAsync(`${base}models/rocks/${n}-near.glb`).then((g) => firstMesh(g.scene))))
    const far = firstMesh((await loader.loadAsync(`${base}models/rocks/${SCANS[0]}-far.glb`)).scene)
    if (near.some((x) => !x) || !far) return null
    // The small stones (Poly Haven rock_09, ~300 triangles).
    const pebble = await loader.loadAsync(`${base}models/rocks/rock_09-near.glb`).then((g) => firstMesh(g.scene)).catch(() => null)
    for (const n of near) {
      const m = n!.mat as THREE.MeshStandardMaterial
      // (Lit as the land is: the sky's light and the sun; the scan's own roughness and AO.)
      m.envMapIntensity = 1
      m.metalness = 0
    }
    if (pebble) (pebble.mat as THREE.MeshStandardMaterial).metalness = 0
    return { near: near as Array<{ geo: THREE.BufferGeometry; mat: THREE.Material }>, far: far.geo, pebble: pebble ?? undefined }
  } catch (e) {
    console.warn('[rocks] scans not loaded; the made boulders stay', e)
    return null
  }
}
