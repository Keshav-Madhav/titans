// Build the wanderer's avatar assets (user, 2026-11-05: a free rigged character, heavily customised).
// Sources (CC0, Quaternius): Modular Character Outfits – Fantasy (the Male Ranger outfit: hood, body,
// arms with gloved hands, legs, boots) and the Universal Animation Library (clips on the same 65-bone
// rig). Input: the extracted folder (argv[2]); output: client/public/avatar/.
//   ranger.gltf + ranger.bin + textures (resized by tools/avatar/textures.py)
//   anims.glb   — the skeleton's nodes and the clips we use; no mesh, skin or materials.
import fs from 'node:fs'
import path from 'node:path'

const SRC = process.argv[2]
const OUT = path.resolve('client/public/avatar')
fs.mkdirSync(OUT, { recursive: true })
const CLIPS = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Jump_Start', 'Jump_Loop', 'Jump_Land', 'Roll', 'Swim_Fwd_Loop', 'Swim_Idle_Loop', 'Idle_Torch_Loop', 'Fixing_Kneeling', 'PickUp_Table', 'Push_Loop', 'Crouch_Idle_Loop', 'Interact']

// --- the outfit: copied, its images pointed at the resized files ---
const outfitDir = path.join(SRC, 'out/Modular Character Outfits - Fantasy[Standard]/Exports/glTF (Godot-Unreal)/Outfits')
const g = JSON.parse(fs.readFileSync(path.join(outfitDir, 'Male_Ranger.gltf'), 'utf8'))
for (const img of g.images ?? []) {
  const base = img.uri.replace(/\.png$/i, '')
  const isNormal = /Normal/i.test(base)
  img.uri = `${base}${isNormal ? '.png' : '.jpg'}`
  img.mimeType = isNormal ? 'image/png' : 'image/jpeg'
}
g.buffers[0].uri = 'ranger.bin'
fs.writeFileSync(path.join(OUT, 'ranger.gltf'), JSON.stringify(g))
fs.copyFileSync(path.join(outfitDir, 'Male_Ranger.bin'), path.join(OUT, 'ranger.bin'))

// --- the clips: repacked ---
const glbPath = path.join(SRC, 'ual/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb')
const glb = fs.readFileSync(glbPath)
const jsonLen = glb.readUInt32LE(12)
const J = JSON.parse(glb.subarray(20, 20 + jsonLen).toString())
const binStart = 20 + jsonLen + 8
const BIN = glb.subarray(binStart, binStart + glb.readUInt32LE(20 + jsonLen))
const anims = J.animations.filter((a) => CLIPS.includes(a.name))
const missing = CLIPS.filter((c) => !anims.some((a) => a.name === c))
if (missing.length) console.warn('missing clips:', missing)
const accMap = new Map()
const accessors = []
const views = []
const chunks = []
let offset = 0
const useAcc = (i) => {
  if (accMap.has(i)) return accMap.get(i)
  const a = { ...J.accessors[i] }
  const v = J.bufferViews[a.bufferView]
  const start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0)
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type]
  const size = { 5126: 4, 5123: 2, 5125: 4, 5121: 1 }[a.componentType]
  const len = a.count * comps * size
  if (v.byteStride && v.byteStride !== comps * size) throw new Error('strided accessor')
  const pad = (4 - (offset % 4)) % 4
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad }
  chunks.push(BIN.subarray(start, start + len))
  views.push({ buffer: 0, byteOffset: offset, byteLength: len })
  offset += len
  a.bufferView = views.length - 1
  delete a.byteOffset
  accessors.push(a)
  accMap.set(i, accessors.length - 1)
  return accessors.length - 1
}
const outAnims = anims.map((a) => ({ name: a.name, channels: a.channels, samplers: a.samplers.map((s) => ({ ...s, input: useAcc(s.input), output: useAcc(s.output) })) }))
const nodes = J.nodes.map((n) => { const m = { ...n }; delete m.mesh; delete m.skin; return m })
const out = { asset: J.asset, scene: J.scene ?? 0, scenes: J.scenes, nodes, animations: outAnims, accessors, bufferViews: views, buffers: [{ byteLength: offset }] }
const js = Buffer.from(JSON.stringify(out))
const jsPad = Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)
const bin = Buffer.concat(chunks)
const binPad = Buffer.alloc((4 - (bin.length % 4)) % 4)
const head = Buffer.alloc(12)
head.write('glTF', 0); head.writeUInt32LE(2, 4)
const total = 12 + 8 + js.length + jsPad.length + 8 + bin.length + binPad.length
head.writeUInt32LE(total, 8)
const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length + jsPad.length, 0); jh.write('JSON', 4)
const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length + binPad.length, 0); bh.writeUInt32LE(0x004e4942, 4)
fs.writeFileSync(path.join(OUT, 'anims.glb'), Buffer.concat([head, jh, js, jsPad, bh, bin, binPad]))
fs.writeFileSync(path.join(OUT, 'LICENSE.txt'), `The wanderer's body, outfit and animations: Quaternius (https://quaternius.com) —
Modular Character Outfits – Fantasy (Male Ranger) and the Universal Animation Library.
CC0 1.0 Universal (Public Domain Dedication): https://creativecommons.org/publicdomain/zero/1.0/
Customised for TITANS (colours, cloak, props, procedural layers) by tools/avatar/.
`)
console.log('clips', outAnims.map((a) => a.name).join(', '), '| anims.glb', (total / 1024).toFixed(0), 'KB')
