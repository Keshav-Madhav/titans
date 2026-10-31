// A shaded top-down map of the base terrain (no browser): for shaping the land.
//   npx tsx tools/terrain-map.ts [out.png] [halfSizeMetres] [metresPerPixel]
// Writes a raw RGB file next to `out` and converts it with Python (PIL).

import { writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { Terrain, WORLD_SEED } from '@titans/shared'

const out = process.argv[2] ?? 'shots/terrain-map.png'
const half = Number(process.argv[3] ?? 3200)
const mpp = Number(process.argv[4] ?? 6)
const t = new Terrain(WORLD_SEED)
const n = Math.floor((2 * half) / mpp)
const H = new Float32Array(n * n)
const t0 = performance.now()
for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) H[j * n + i] = t.base.height(-half + i * mpp, -half + j * mpp)
const rgb = new Uint8Array(n * n * 3)
const tint = { valley: [120, 150, 80], forest: [70, 105, 55], desert: [205, 180, 130], ruins: [160, 150, 110] }
for (let j = 1; j < n - 1; j++) {
  for (let i = 1; i < n - 1; i++) {
    const k = j * n + i
    const dx = (H[k + 1] - H[k - 1]) / (2 * mpp)
    const dz = (H[k + n] - H[k - n]) / (2 * mpp)
    // Light from the north-west, slope-shaded; cliffs (slope > 1) darkened.
    const len = Math.hypot(dx, dz, 1)
    const lit = Math.max(0, (dx * 0.6 + dz * 0.6 + 1) / len / 1.5)
    const steep = Math.min(1, Math.max(0, (Math.hypot(dx, dz) - 0.8) / 1.5))
    const name = t.base.regions.name(-half + i * mpp, -half + j * mpp)
    const c = H[k] > 420 ? [235, 235, 240] : tint[name]
    for (let q = 0; q < 3; q++) rgb[k * 3 + q] = Math.min(255, c[q] * (0.35 + 0.9 * lit) * (1 - 0.45 * steep))
  }
}
writeFileSync(out + '.rgb', rgb)
execFileSync('python3', ['-I', '-c', `from PIL import Image; import sys; Image.frombytes('RGB', (${n}, ${n}), open(sys.argv[1], 'rb').read()).save(sys.argv[2])`, out + '.rgb', out])
let steep = 0
for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) if (Math.hypot(H[j * n + i + 1] - H[j * n + i - 1], H[(j + 1) * n + i] - H[(j - 1) * n + i]) / (2 * mpp) > 1.2) steep++
console.log(`${n}×${n} px, ${mpp} m/px, ${((performance.now() - t0) / 1000).toFixed(1)} s; cliffs (>50°) cover ${((steep / (n * n)) * 100).toFixed(1)}% → ${out}`)
