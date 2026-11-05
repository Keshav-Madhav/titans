// Inspect a .gltf/.glb: skins (joint names), meshes, materials, images, animations (name, duration).
import fs from 'node:fs'
const f = process.argv[2]
let json
const buf = fs.readFileSync(f)
if (f.endsWith('.glb')) { const len = buf.readUInt32LE(12); json = JSON.parse(buf.subarray(20, 20 + len).toString()) } else json = JSON.parse(buf.toString())
const nodes = json.nodes ?? []
const out = { meshes: (json.meshes ?? []).map((m) => m.name), materials: (json.materials ?? []).map((m) => m.name), images: (json.images ?? []).map((i) => i.uri ?? i.name ?? i.mimeType), skins: (json.skins ?? []).map((s) => ({ name: s.name, joints: s.joints.length, first: s.joints.slice(0, 70).map((j) => nodes[j].name) })) }
if (json.animations) {
  out.animations = json.animations.map((a) => {
    let dur = 0
    for (const s of a.samplers) { const acc = json.accessors[s.input]; dur = Math.max(dur, acc.max?.[0] ?? 0) }
    return `${a.name} ${dur.toFixed(2)}s`
  })
}
console.log(JSON.stringify(out, null, 1))
