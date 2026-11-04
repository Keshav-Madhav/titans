// Scanned boulders → game boulders (graphics pass, 2026-11-04: the user — "a flat 10-triangle rock
// doesn't match"; "baking and minute fidelity"). CC0 photogrammetry scans from Poly Haven (each
// 110–180k triangles, with colour, normal and AO/roughness/metal maps baked from the full scan)
// are cut down to two levels of detail for instancing:
//   near — ~4,000 triangles, with the scan's own maps: the fine relief (chips, cracks, grain) rides
//          in the baked normal map, not in triangles;
//   far  — ~600 triangles, geometry only (it borrows the near one's material in the game).
// Each is centred, scaled so its widest half-extent is 1 (the game scales per instance) and set so
// its base sits a little under the ground line.
//
//   node tools/build-rocks.mjs <dir of downloaded scans>   →  client/public/models/rocks/*.glb
//
// Sources and licences: client/public/models/rocks/README.md.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, simplify, weld, getBounds, transformMesh } from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'
import { mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = process.argv[2]
const OUT = new URL('../client/public/models/rocks/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
await MeshoptSimplifier.ready

const tris = (doc) => {
  let n = 0
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) n += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3
  return Math.round(n)
}

async function build(name, file, target, keepTextures) {
  const doc = await io.read(file)
  await doc.transform(dedup(), weld())
  const before = tris(doc)
  // Centred, unit-sized, base just under the ground.
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]
  const b = getBounds(scene)
  const cx = (b.min[0] + b.max[0]) / 2
  const cz = (b.min[2] + b.max[2]) / 2
  const half = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]) / 2
  const s = 1 / half
  // Bake every node's transform into the mesh, then centre and scale.
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const m = node.getWorldMatrix()
    transformMesh(mesh, m)
    node.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    const t = [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, -cx * s, -b.min[1] * s - 0.22, -cz * s, 1]
    transformMesh(mesh, t)
  }
  for (const n of doc.getRoot().listNodes()) if (n.getMesh()) n.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
  await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: target / before, error: 0.02, lockBorder: false }))
  if (!keepTextures) {
    for (const t of doc.getRoot().listTextures()) t.dispose()
    for (const m of doc.getRoot().listMaterials()) m.dispose()
  }
  await doc.transform(prune())
  const out = join(OUT, `${name}-${keepTextures ? 'near' : 'far'}.glb`)
  await io.write(out, doc)
  console.log(`${name} ${keepTextures ? 'near' : 'far'}: ${before} → ${tris(doc)} triangles, ${(statSync(out).size / 1024).toFixed(0)} KB`)
}

for (const name of readdirSync(SRC)) {
  const dir = join(SRC, name)
  if (!statSync(dir).isDirectory()) continue
  const file = join(dir, `${name}.gltf`)
  await build(name, file, 4000, true)
  await build(name, file, 600, false)
}
