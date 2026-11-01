// The interface's materials (user, 2026-11-01: "inventory and ui… very flat,
// basic, AI-generated and not polished"). Nothing downloaded but two free
// typefaces (OFL): IM Fell English, an old printer's face, for titles; EB
// Garamond for reading. The rest is made here at start-up, by hand, in a
// canvas: aged paper (fibres, foxing, a darker edge), tooled leather (grain,
// creases, wear), and a pencil-grey paper for the journal's margins. Each is
// handed to the stylesheet (ui.css) as a CSS variable.

import '@fontsource/im-fell-english/latin-400.css'
import '@fontsource/im-fell-english/latin-400-italic.css'
import '@fontsource/eb-garamond/latin-400.css'
import '@fontsource/eb-garamond/latin-400-italic.css'
import '@fontsource/eb-garamond/latin-600.css'
import './ui.css'

let seed = 20261101
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

/** Smooth value noise on a wrapping grid (so the textures tile). */
function noise2(size: number, cells: number): (x: number, y: number) => number {
  const g = new Float32Array(cells * cells).map(() => rnd())
  const at = (i: number, j: number) => g[((j % cells) + cells) % cells * cells + (((i % cells) + cells) % cells)]
  return (x, y) => {
    const fx = (x / size) * cells
    const fy = (y / size) * cells
    const i = Math.floor(fx)
    const j = Math.floor(fy)
    const u = fx - i
    const v = fy - j
    const s = u * u * (3 - 2 * u)
    const t = v * v * (3 - 2 * v)
    return (at(i, j) * (1 - s) + at(i + 1, j) * s) * (1 - t) + (at(i, j + 1) * (1 - s) + at(i + 1, j + 1) * s) * t
  }
}

function texture(size: number, paint: (x: number, y: number) => [number, number, number]): string {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const img = g.createImageData(size, size)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const [r, gg, b] = paint(x, y)
      const k = (y * size + x) * 4
      img.data[k] = r
      img.data[k + 1] = gg
      img.data[k + 2] = b
      img.data[k + 3] = 255
    }
  g.putImageData(img, 0, 0)
  return c.toDataURL('image/png')
}

/** Old paper: warm, uneven, with fibres and a few brown foxing spots. */
function paper(size: number, base: [number, number, number], depth: number): string {
  const big = noise2(size, 4)
  const mid = noise2(size, 16)
  const fine = noise2(size, 96)
  // Fibres: short random strokes, baked into a field.
  const fib = new Float32Array(size * size)
  for (let n = 0; n < size * 3; n++) {
    let x = rnd() * size
    let y = rnd() * size
    const a = rnd() * Math.PI
    const len = 4 + rnd() * 14
    const k = (rnd() - 0.5) * 0.06
    for (let s = 0; s < len; s++) {
      fib[((Math.floor(y) + size) % size) * size + ((Math.floor(x) + size) % size)] += k
      x += Math.cos(a)
      y += Math.sin(a)
    }
  }
  const fox: Array<[number, number, number]> = Array.from({ length: 7 }, () => [rnd() * size, rnd() * size, 3 + rnd() * 9])
  return texture(size, (x, y) => {
    let l = 1 + (big(x, y) - 0.5) * 0.12 * depth + (mid(x, y) - 0.5) * 0.07 * depth + (fine(x, y) - 0.5) * 0.06 + fib[y * size + x]
    let warm = 0
    for (const [fx, fy, r] of fox) {
      const d = Math.hypot(((x - fx + size * 1.5) % size) - size / 2, ((y - fy + size * 1.5) % size) - size / 2) / r
      if (d < 1) warm += (1 - d) * 0.35 * depth
    }
    l -= warm * 0.12
    return [base[0] * l + warm * 6, base[1] * l - warm * 4, base[2] * l - warm * 14]
  })
}

/** Leather: dark, a fine pebbled grain, long soft creases, scuffed lighter in places. */
function leather(size: number): string {
  const grain = noise2(size, 128)
  const pebble = noise2(size, 48)
  const crease = noise2(size, 3)
  const scuff = noise2(size, 10)
  const tone = noise2(size, 5)
  return texture(size, (x, y) => {
    // (Faint, long creases: strong ones read as cracked mud, not hide.)
    const c = crease(x, y)
    const ridge = Math.exp(-Math.pow((c - 0.5) * 16, 2)) * 0.06 - (tone(x, y) - 0.5) * 0.12
    const l = 0.82 + (grain(x, y) - 0.5) * 0.22 + (pebble(x, y) - 0.5) * 0.18 - ridge + Math.max(0, scuff(x, y) - 0.62) * 0.7
    return [86 * l, 56 * l, 36 * l]
  })
}

/** Make the textures and hand them to the stylesheet. */
export function installSkin(): void {
  const root = document.documentElement.style
  root.setProperty('--tex-paper', `url(${paper(256, [216, 202, 172], 1)})`)
  root.setProperty('--tex-page', `url(${paper(256, [226, 214, 188], 0.7)})`)
  root.setProperty('--tex-leather', `url(${leather(256)})`)
}
