// The toolbar (top left): the tools you have found, each drawn, with the key
// that uses it; the one in use lights up. Nothing shows until you have one.

import { CATALOGUE, type Discoveries } from './discovery'
import { drawIcon } from './bag'

const KEYS: Record<string, string> = { line: 'G', bow: 'Q', horn: 'H', cloak: 'Space', sight: 'V' }

export class Toolbar {
  private readonly el = document.getElementById('tools')!
  private shown = ''
  private readonly cells = new Map<string, HTMLElement>()

  constructor(private readonly finds: Discoveries) {}

  /** Each frame: which tools to show, and which (if any) is in use. */
  update(active: string | null): void {
    const tools = CATALOGUE.filter((c) => c.kind === 'tool' && this.finds.has(c.id))
    const key = tools.map((t) => t.id).join(',')
    if (key !== this.shown) {
      this.shown = key
      this.el.innerHTML = ''
      this.cells.clear()
      for (const t of tools) {
        const cell = document.createElement('div')
        cell.className = 'tool'
        cell.title = t.name
        cell.appendChild(drawIcon(t.icon ?? 'stone', t.tint ?? '#b9ab8f', 96))
        const k = document.createElement('kbd')
        k.textContent = KEYS[t.id] ?? ''
        cell.appendChild(k)
        this.el.appendChild(cell)
        this.cells.set(t.id, cell)
      }
    }
    for (const [id, cell] of this.cells) cell.classList.toggle('on', id === active)
  }
}
