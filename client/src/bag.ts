// The bag (user, 2026-10-31: "an inventory… a bag, but we don't have it, we
// find it… the first thing we find is a bag, it is unlimited, all future
// trinkets go in"). Until you find it, small things stay where they lie; after,
// everything you pick up goes in, and I opens it: each thing drawn, named, and
// what it is (as far as you can tell).

import { actionOf } from './input'
import { CATALOGUE, type Discoveries, type Find } from './discovery'

/** The things the bag holds: tools, relics and trinkets (the bag itself is the container, not an item). */
const carried = (c: Find) => (c.kind === 'tool' || c.kind === 'relic' || c.kind === 'trinket') && c.id !== 'bag'
/** Tools first (they are what you use), then the rest in the order found in the catalogue. */
const rank = (c: Find) => (c.kind === 'tool' ? 0 : 1)

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export class Bag {
  private readonly panel = document.getElementById('bag')!
  private readonly grid = document.getElementById('bag-grid')!
  private readonly detail = document.getElementById('bag-detail')!
  private readonly count = document.getElementById('bag-count')!
  /** Opened or closed (the game releases the pointer and keys). */
  onToggle: (open: boolean) => void = () => {}
  /** Asked to open before there is a bag. */
  onNoBag: () => void = () => {}

  constructor(private readonly finds: Discoveries) {
    addEventListener('keydown', (e) => {
      if (actionOf(e.code) === 'KeyI') this.toggle()
      else if (e.code === 'Escape' && this.open) this.toggle()
    })
    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.toggle()
    })
  }

  /** Found it yet? */
  get have(): boolean {
    return this.finds.has('bag')
  }

  get open(): boolean {
    return this.panel.style.display === 'flex'
  }

  toggle(): void {
    if (!this.open && !this.have) return this.onNoBag()
    const open = !this.open
    if (open) this.render()
    this.panel.style.display = open ? 'flex' : 'none'
    if (open && document.pointerLockElement) document.exitPointerLock()
    this.onToggle(open)
  }

  private render(): void {
    const items = CATALOGUE.filter((c) => carried(c) && this.finds.has(c.id)).sort((a, b) => rank(a) - rank(b))
    const left = CATALOGUE.filter((c) => carried(c) && !this.finds.has(c.id)).length
    this.count.textContent = items.length ? `${items.length} thing${items.length === 1 ? '' : 's'}${left ? ` · ${left} more out there` : ''}` : 'Empty, for now'
    this.grid.innerHTML = ''
    for (const item of items) {
      const cell = document.createElement('button')
      cell.className = 'bag-cell'
      cell.title = item.name
      cell.appendChild(drawIcon(item.icon ?? 'stone', item.tint ?? '#b9ab8f', 128))
      if (this.finds.unseen.has(item.id)) cell.classList.add('new')
      cell.addEventListener('click', () => this.show(item, cell))
      this.grid.appendChild(cell)
    }
    for (const item of items) this.finds.unseen.delete(item.id)
    if (items.length) this.show(items[items.length - 1], this.grid.lastElementChild as HTMLElement)
    else this.detail.innerHTML = '<p>Deep, patched, and somehow never full. Small things you find will go in here.</p>'
  }

  private show(item: Find, cell: HTMLElement): void {
    for (const c of this.grid.children) c.classList.toggle('on', c === cell)
    this.detail.innerHTML = `<b>${esc(item.name)}</b><p>${esc(item.text)}</p>`
  }
}

/**
 * A small drawing of a thing (64 px): enough to tell a ring from a feather at
 * a glance, in the journal's ink on its paper.
 */
/** The painted icons (tools/gen-icons.py; user: "the icons still look bad" — line drawings). */
const PAINTED = ['line', 'stone', 'shard', 'ring', 'key', 'horn', 'figure', 'feather', 'coin', 'tooth', 'beads', 'bell', 'bow', 'bag', 'tablet', 'peak', 'giant']
const painted = new Map<string, HTMLImageElement>()
/** Load them all once at start (drawn as line art until they are in). */
export function loadIcons(): Promise<void> {
  return Promise.all(
    PAINTED.map(
      (name) =>
        new Promise<void>((res) => {
          const img = new Image()
          img.onload = () => {
            painted.set(name, img)
            res()
          }
          img.onerror = () => res()
          img.src = `${import.meta.env.BASE_URL}icons/${name}.png`
        }),
    ),
  ).then(() => undefined)
}

/**
 * An item's icon: the painting, toned toward the item's own colour (one painting serves every
 * ring, every shard), so a jade ring and an iron one still differ.
 */
export function drawIcon(icon: string, tint: string, size = 64): HTMLCanvasElement {
  const img = painted.get(icon)
  if (img) {
    const c = document.createElement('canvas')
    c.width = c.height = size
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0, size, size)
    // Tone: the item's colour laid over in 'color' blend, held within the painting's shape.
    if (TONED.includes(icon)) {
      g.globalCompositeOperation = 'color'
      g.globalAlpha = 0.55
      g.fillStyle = tint
      g.fillRect(0, 0, size, size)
      g.globalAlpha = 1
      g.globalCompositeOperation = 'destination-in'
      g.drawImage(img, 0, 0, size, size)
    }
    return c
  }
  return drawLineIcon(icon, tint, size)
}

/** Shapes several different things share (recoloured per item); the rest are one thing each. */
const TONED = ['stone', 'shard', 'ring', 'horn', 'figure', 'feather', 'coin']

function drawLineIcon(icon: string, tint: string, size = 64): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  g.scale(size / 64, size / 64)
  g.lineJoin = g.lineCap = 'round'
  g.strokeStyle = '#3a3226'
  g.lineWidth = 2.2
  g.fillStyle = tint
  const shape = (draw: () => void, fill = true) => {
    g.beginPath()
    draw()
    if (fill) g.fill()
    g.stroke()
  }
  switch (icon) {
    case 'glass':
      // A round lens in a brass rim, on a short handle.
      g.lineWidth = 6
      g.strokeStyle = tint
      shape(() => g.arc(28, 26, 15, 0, Math.PI * 2), false)
      g.lineWidth = 2
      g.strokeStyle = '#3a3226'
      g.fillStyle = 'rgba(200, 225, 230, 0.55)'
      shape(() => g.arc(28, 26, 12, 0, Math.PI * 2))
      shape(() => g.arc(28, 26, 18, 0, Math.PI * 2), false)
      g.fillStyle = '#6a4a2e'
      shape(() => {
        g.moveTo(39, 38)
        g.lineTo(54, 55)
        g.lineTo(50, 59)
        g.lineTo(35, 42)
        g.closePath()
      })
      g.strokeStyle = 'rgba(255, 255, 255, 0.8)'
      shape(() => g.arc(24, 21, 5, Math.PI * 1.05, Math.PI * 1.55), false)
      break
    case 'ring':
      g.lineWidth = 7
      g.strokeStyle = tint
      shape(() => g.arc(32, 34, 15, 0, Math.PI * 2), false)
      g.lineWidth = 2
      g.strokeStyle = '#3a3226'
      shape(() => g.arc(32, 34, 18.5, 0, Math.PI * 2), false)
      shape(() => g.arc(32, 34, 11.5, 0, Math.PI * 2), false)
      shape(() => g.ellipse(32, 15, 6, 4, 0, 0, Math.PI * 2))
      break
    case 'shard':
      shape(() => {
        g.moveTo(32, 6)
        g.lineTo(44, 26)
        g.lineTo(38, 58)
        g.lineTo(24, 52)
        g.lineTo(20, 22)
        g.closePath()
      })
      shape(() => {
        g.moveTo(32, 6)
        g.lineTo(30, 40)
        g.lineTo(38, 58)
      }, false)
      break
    case 'feather':
      shape(() => {
        g.moveTo(16, 56)
        g.bezierCurveTo(14, 30, 34, 8, 50, 6)
        g.bezierCurveTo(50, 26, 36, 46, 16, 56)
      })
      shape(() => {
        g.moveTo(12, 60)
        g.lineTo(44, 14)
      }, false)
      break
    case 'coin':
      shape(() => g.arc(32, 32, 20, 0, Math.PI * 2))
      shape(() => g.arc(32, 32, 14, 0, Math.PI * 2), false)
      shape(() => {
        g.moveTo(32, 22)
        g.lineTo(38, 36)
        g.lineTo(26, 36)
        g.closePath()
      }, false)
      break
    case 'beads':
      g.lineWidth = 1.5
      shape(() => g.arc(32, 26, 20, 0.15 * Math.PI, 0.85 * Math.PI), false)
      g.lineWidth = 2.2
      for (let i = 0; i < 7; i++) {
        const a = 0.18 * Math.PI + (i / 6) * 0.64 * Math.PI
        shape(() => g.arc(32 + Math.cos(a) * 20, 26 + Math.sin(a) * 20, 5, 0, Math.PI * 2))
      }
      break
    case 'key':
      shape(() => g.arc(22, 22, 11, 0, Math.PI * 2))
      shape(() => g.arc(22, 22, 4, 0, Math.PI * 2), false)
      shape(() => {
        g.moveTo(30, 30)
        g.lineTo(54, 54)
        g.moveTo(46, 46)
        g.lineTo(40, 52)
        g.moveTo(52, 52)
        g.lineTo(47, 57)
      }, false)
      break
    case 'figure':
      shape(() => g.ellipse(32, 15, 7, 8, 0, 0, Math.PI * 2))
      shape(() => {
        g.moveTo(22, 58)
        g.quadraticCurveTo(18, 26, 32, 24)
        g.quadraticCurveTo(46, 26, 42, 58)
        g.closePath()
      })
      break
    case 'bell':
      shape(() => {
        g.moveTo(18, 48)
        g.quadraticCurveTo(20, 14, 32, 12)
        g.quadraticCurveTo(44, 14, 46, 48)
        g.closePath()
      })
      shape(() => g.arc(32, 52, 4, 0, Math.PI * 2))
      shape(() => {
        g.moveTo(32, 12)
        g.lineTo(32, 6)
      }, false)
      break
    case 'tooth':
      shape(() => {
        g.moveTo(20, 10)
        g.quadraticCurveTo(32, 4, 44, 10)
        g.quadraticCurveTo(46, 30, 36, 58)
        g.quadraticCurveTo(30, 40, 20, 10)
      })
      break
    case 'horn':
      shape(() => {
        g.moveTo(10, 44)
        g.quadraticCurveTo(30, 52, 54, 18)
        g.lineTo(58, 24)
        g.quadraticCurveTo(34, 62, 10, 52)
        g.closePath()
      })
      break
    case 'peak':
      shape(() => {
        g.moveTo(6, 54)
        g.lineTo(24, 20)
        g.lineTo(34, 36)
        g.lineTo(42, 24)
        g.lineTo(58, 54)
        g.closePath()
      })
      shape(() => {
        g.moveTo(24, 20)
        g.lineTo(19, 30)
        g.lineTo(28, 28)
        g.closePath()
      }, false)
      break
    case 'giant':
      // A hunched figure, arms hanging long.
      shape(() => g.ellipse(32, 14, 6, 6, 0, 0, Math.PI * 2))
      shape(() => {
        g.moveTo(18, 24)
        g.quadraticCurveTo(32, 16, 46, 24)
        g.lineTo(50, 46)
        g.lineTo(44, 46)
        g.lineTo(40, 32)
        g.lineTo(40, 58)
        g.lineTo(34, 58)
        g.lineTo(32, 42)
        g.lineTo(30, 58)
        g.lineTo(24, 58)
        g.lineTo(24, 32)
        g.lineTo(20, 46)
        g.lineTo(14, 46)
        g.closePath()
      })
      break
    case 'tablet':
      shape(() => {
        g.moveTo(18, 58)
        g.lineTo(20, 10)
        g.quadraticCurveTo(32, 4, 44, 10)
        g.lineTo(46, 58)
        g.closePath()
      })
      g.lineWidth = 1.6
      for (const y of [20, 28, 36, 44]) shape(() => {
        g.moveTo(25, y)
        g.lineTo(39, y)
      }, false)
      break
    case 'bow':
      g.lineWidth = 3.4
      g.strokeStyle = tint
      shape(() => {
        g.moveTo(16, 6)
        g.quadraticCurveTo(52, 32, 16, 58)
      }, false)
      g.lineWidth = 1.2
      g.strokeStyle = '#3a3226'
      shape(() => {
        g.moveTo(16, 6)
        g.lineTo(16, 58)
      }, false)
      g.lineWidth = 2
      shape(() => {
        g.moveTo(10, 32)
        g.lineTo(54, 32)
        g.moveTo(54, 32)
        g.lineTo(47, 28)
        g.moveTo(54, 32)
        g.lineTo(47, 36)
      }, false)
      break
    case 'bag':
      shape(() => {
        g.moveTo(16, 24)
        g.quadraticCurveTo(10, 58, 32, 58)
        g.quadraticCurveTo(54, 58, 48, 24)
        g.closePath()
      })
      shape(() => {
        g.moveTo(14, 24)
        g.quadraticCurveTo(32, 14, 50, 24)
      }, false)
      break
    default: {
      // A carved pebble with a glyph.
      shape(() => g.ellipse(32, 34, 20, 15, -0.3, 0, Math.PI * 2))
      shape(() => {
        g.moveTo(24, 34)
        g.lineTo(32, 26)
        g.lineTo(40, 34)
        g.lineTo(32, 42)
        g.closePath()
      }, false)
    }
  }
  // Light on it: from the top left, over the drawing only — a highlight, a shaded side,
  // and a little grain, so it reads as a thing and not a flat sticker.
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalCompositeOperation = 'source-atop'
  const light = g.createLinearGradient(0, 0, size, size)
  light.addColorStop(0, 'rgba(255, 248, 230, 0.38)')
  light.addColorStop(0.45, 'rgba(255, 248, 230, 0)')
  light.addColorStop(0.6, 'rgba(30, 18, 6, 0)')
  light.addColorStop(1, 'rgba(30, 18, 6, 0.32)')
  g.fillStyle = light
  g.fillRect(0, 0, size, size)
  let seed = icon.length * 7919 + tint.length
  for (let i = 0; i < size * size * 0.18; i++) {
    seed = (seed * 16807) % 2147483647
    const x = seed % size
    seed = (seed * 16807) % 2147483647
    const y = seed % size
    g.fillStyle = seed % 2 ? 'rgba(255, 245, 220, 0.07)' : 'rgba(20, 12, 4, 0.08)'
    g.fillRect(x, y, 1, 1)
  }
  g.globalCompositeOperation = 'source-over'
  return c
}
