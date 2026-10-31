// The journal (J): everything you have found, by kind, in the order the
// catalogue lists it — and, for what you have not, a line of where to look.
// Also the title card that rises when you find something.

import { CATALOGUE, KIND_TITLES, type Discoveries, type Find, type FindKind } from './discovery'

// (Relics and trinkets are things, not knowledge: they are in the bag.)
const ORDER: FindKind[] = ['place', 'giant', 'lore']

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export class Journal {
  private readonly panel = document.getElementById('journal')!
  private readonly body = document.getElementById('journal-body')!
  private readonly count = document.getElementById('journal-count')!
  private readonly card = document.getElementById('found')!
  private cardTimer = 0
  /** Opened or closed (the game releases the pointer and keys). */
  onToggle: (open: boolean) => void = () => {}

  constructor(private readonly finds: Discoveries) {
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyJ') this.toggle()
      else if (e.code === 'Escape' && this.open) this.toggle()
    })
    this.panel.addEventListener('click', () => this.toggle())
  }

  get open(): boolean {
    return this.panel.style.display === 'flex'
  }

  toggle(): void {
    const open = !this.open
    if (open) this.render()
    this.panel.style.display = open ? 'flex' : 'none'
    if (open && document.pointerLockElement) document.exitPointerLock()
    this.onToggle(open)
  }

  private render(): void {
    const known = CATALOGUE.filter((c) => ORDER.includes(c.kind))
    this.count.textContent = `${known.filter((c) => this.finds.has(c.id)).length} of ${known.length} found`
    this.body.innerHTML = ORDER.map((kind) => {
      const all = CATALOGUE.filter((c) => c.kind === kind)
      if (!all.length) return ''
      const got = all.filter((c) => this.finds.has(c.id)).length
      const rows = all
        .map((c) =>
          this.finds.has(c.id)
            ? `<li><b>${esc(c.name)}</b><span>${esc(c.text)}</span></li>`
            : `<li class="unfound"><b>—</b><span>${esc(c.hint)}</span></li>`,
        )
        .join('')
      return `<section><h2>${KIND_TITLES[kind]} <small>${got} / ${all.length}</small></h2><ul>${rows}</ul></section>`
    }).join('')
  }

  /** The card that rises when something is found: what kind, and its name. */
  announce(find: Find): void {
    const word = { place: 'Discovered', giant: 'Met', lore: 'Read', relic: 'Taken', trinket: 'Found' }[find.kind]
    this.card.innerHTML = `<small>${word}</small><b>${esc(find.name)}</b>`
    this.card.classList.add('on')
    clearTimeout(this.cardTimer)
    this.cardTimer = window.setTimeout(() => this.card.classList.remove('on'), 4200)
  }
}
