// First steps: a short run of hints that advance as you actually do things
// (walk, climb a giant, stand high on one). Shown once per browser; the ✕
// dismisses them for good.

const KEY = 'titans.adventure.tips'

export interface TipState {
  moved: number // metres walked
  climbed: boolean // has taken hold of a giant
  high: number // highest climbed, metres above the ground
}

const TIPS: Array<{ text: string; done: (s: TipState) => boolean }> = [
  { text: 'Click the world to look around. <kbd>W A S D</kbd> to walk, <kbd>Shift</kbd> to run.', done: (s) => s.moved > 25 },
  { text: 'A giant walks the plain nearby. Go to it, and at its foot press <kbd>E</kbd> to take hold.', done: (s) => s.climbed },
  { text: 'Climb with <kbd>W A S D</kbd>. Your grip tires: rest where you can stand. Reach its shoulders.', done: (s) => s.high > 150 },
]

export class Tips {
  private readonly el = document.getElementById('tips')!
  private step: number

  constructor(enabled: boolean) {
    let saved = 0
    try {
      saved = Number(localStorage.getItem(KEY) ?? 0) || 0
    } catch {
      // first time, as far as we can tell
    }
    this.step = enabled ? saved : TIPS.length
    this.el.querySelector('button')?.addEventListener('click', () => this.finish())
    this.show()
  }

  update(s: TipState): void {
    if (this.step >= TIPS.length) return
    let moved = false
    while (this.step < TIPS.length && TIPS[this.step].done(s)) {
      this.step++
      moved = true
    }
    if (moved) {
      this.persist()
      this.show()
    }
  }

  private show(): void {
    const done = this.step >= TIPS.length
    this.el.style.display = done ? 'none' : 'flex'
    if (!done) this.el.querySelector('span')!.innerHTML = TIPS[this.step].text
  }

  private finish(): void {
    this.step = TIPS.length
    this.persist()
    this.show()
  }

  private persist(): void {
    try {
      localStorage.setItem(KEY, String(this.step))
    } catch {
      // they will show again next time; harmless
    }
  }

  get current(): number {
    return this.step
  }
}
