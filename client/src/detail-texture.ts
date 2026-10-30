// Procedural detail texture shared by the ground and the Titans' stone:
// tileable value noise, no downloaded asset.

import * as THREE from 'three'

/** Tileable multi-octave value noise, one channel, 256². */
export function makeDetailTexture(seed: number): THREE.DataTexture {
  const S = 256
  const data = new Uint8Array(S * S * 4)
  let s = seed | 0
  const rand = () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const acc = new Float32Array(S * S)
  let amp = 1
  let total = 0
  for (const cells of [4, 8, 16, 32, 64]) {
    const grid = new Float32Array(cells * cells).map(rand)
    const cs = S / cells
    for (let y = 0; y < S; y++) {
      const gy = y / cs
      const y0 = Math.floor(gy)
      const ty = gy - y0
      const sy = ty * ty * (3 - 2 * ty)
      for (let x = 0; x < S; x++) {
        const gx = x / cs
        const x0 = Math.floor(gx)
        const tx = gx - x0
        const sx = tx * tx * (3 - 2 * tx)
        const a = grid[(y0 % cells) * cells + (x0 % cells)]
        const b = grid[(y0 % cells) * cells + ((x0 + 1) % cells)]
        const c = grid[((y0 + 1) % cells) * cells + (x0 % cells)]
        const d = grid[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)]
        acc[y * S + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy)
      }
    }
    total += amp
    amp *= 0.6
  }
  for (let i = 0; i < S * S; i++) {
    const v = Math.round((acc[i] / total) * 255)
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  const tex = new THREE.DataTexture(data, S, S)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = 8
  tex.needsUpdate = true
  return tex
}

