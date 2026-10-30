// First steps: a short run of hints that advance as you actually do things
// (walk, find a Titan, see a lake form, build). Shown once per browser;
// the ✕ dismisses them for good.

const KEY = 'titans.tips'

export interface TipState {
  moved: number // metres walked
  nearTitan: boolean // within ~600 m of an awake Titan
  titanOrClimb: boolean // has walked a Titan or climbed one
  lakes: number
  town: boolean
}

const TIPS: Array<{ text: string; done: (s: TipState) => boolean }> = [
  { text: 'Click the world to look around. <kbd>W A S D</kbd> to walk, <kbd>Shift</kbd> to run.', done: (s) => s.moved > 25 },
  {
    text: 'A Titan stands on the plain nearby. Walk up to it — <kbd>T</kbd> to become it, or <kbd>E</kbd> at its foot to climb.',
    done: (s) => s.titanOrClimb,
  },
  { text: 'Every step a Titan takes leaves a lake. Walk one with <kbd>W</kbd>, or watch one wander.', done: (s) => s.lakes >= 3 },
  { text: 'Life follows the water. Build beside a lake: <kbd>B</kbd>.', done: (s) => s.town },
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
