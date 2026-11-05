// Waystones (user, 2026-11-05: "gameplay and stuff to do, waystones"). The cairns you have lit
// are the waystones: at one, E opens this card — the other lit cairns, and the first camp — and
// you go there: a fade, and you stand beside that cairn. The cairns sit on the hardest high places
// of each land, so a waystone is also a place to glide down from. Lighting them is the way to earn
// the travel: the world is walked first, then crossed.

export interface Destination {
  name: string
  x: number
  y: number
  z: number
}

export class Waystones {
  private readonly panel = document.getElementById('travel')!
  private readonly list = document.getElementById('travel-list')!
  private dests: Destination[] = []
  /** You chose one (the caller fades, moves you, and fades back). */
  onGo: (d: Destination) => void = () => {}
  onToggle: (open: boolean) => void = () => {}

  constructor() {
    addEventListener('keydown', (e) => {
      if (!this.open) return
      if (e.code === 'Escape' || e.code === 'KeyE') {
        e.preventDefault()
        this.close()
        return
      }
      const n = Number(e.key)
      if (n >= 1 && n <= this.dests.length) {
        e.preventDefault()
        this.go(this.dests[n - 1])
      }
    })
    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.close()
    })
  }

  get open(): boolean {
    return this.panel.style.display === 'flex'
  }

  /** At `here` (a lit cairn's name): the others, nearest first. */
  show(here: string, from: { x: number; z: number }, dests: Destination[]): void {
    this.dests = dests.filter((d) => d.name !== here).sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z))
    this.list.innerHTML = ''
    if (!this.dests.length) {
      const p = document.createElement('p')
      p.className = 'travel-none'
      p.textContent = 'No other fire is lit. Light another, and the way between them opens.'
      this.list.append(p)
    }
    this.dests.slice(0, 9).forEach((d, i) => {
      const b = document.createElement('button')
      const km = Math.hypot(d.x - from.x, d.z - from.z) / 1000
      b.innerHTML = `<kbd>${i + 1}</kbd><span>${d.name}</span><small>${km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`}</small>`
      b.addEventListener('click', () => this.go(d))
      this.list.append(b)
    })
    this.panel.style.display = 'flex'
    if (document.pointerLockElement) document.exitPointerLock()
    this.onToggle(true)
  }

  close(): void {
    if (!this.open) return
    this.panel.style.display = 'none'
    this.onToggle(false)
  }

  private go(d: Destination): void {
    this.close()
    this.onGo(d)
  }
}
