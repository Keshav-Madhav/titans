// Narration: short lines of story and guidance at the lower left. Recent
// lines fade out after a while.

/**
 * How long a line stays: long enough to read it unhurried (~15 characters a second, plus a
 * moment), within bounds. A fixed 14 s kept "You lost your grip." up as long as a stone's words.
 */
function holdMs(text: string): number {
  return Math.min(20000, Math.max(5000, 2500 + text.length * 65))
}

export class Narration {
  private readonly log = document.getElementById('narration')!
  /** Each line's time left (ms): it only runs while no page is open (`paused`). */
  private readonly left = new Map<HTMLElement, number>()
  /** A page (bag, journal, map, pause) is open: lines wait, out of sight, to be read after. */
  paused = false

  constructor() {
    let last = performance.now()
    setInterval(() => {
      const now = performance.now()
      const dt = now - last
      last = now
      if (this.paused) return
      for (const [line, ms] of this.left) {
        if (ms - dt > 0) {
          this.left.set(line, ms - dt)
          continue
        }
        this.left.delete(line)
        line.classList.add('old')
        // Gone from the page once faded (an invisible line still took its room in the column).
        setTimeout(() => line.remove(), 1800)
      }
    }, 200)
  }

  /** A line of narration (`from` names a speaker, if any). */
  say(text: string, from?: string): void {
    const line = document.createElement('div')
    line.className = 'line'
    if (from) {
      const who = document.createElement('b')
      who.textContent = from
      line.append(who, document.createTextNode(' '))
    }
    line.append(document.createTextNode(text))
    this.log.appendChild(line)
    // Three at most: the found things' words are long, and a stack of them hides the land.
    while (this.log.children.length > 3) {
      const first = this.log.firstChild as HTMLElement
      this.left.delete(first)
      first.remove()
    }
    // Not a wall of words: past ~300 characters on screen, the oldest lines go early (fading,
    // in a second or so) — three found things' paragraphs at once covered a fifth of the view.
    let chars = 0
    const live = [...this.log.children].filter((e) => !e.classList.contains('old')) as HTMLElement[]
    for (const e of live) chars += e.textContent?.length ?? 0
    for (const e of live) {
      if (chars <= 300 || e === line) break
      chars -= e.textContent?.length ?? 0
      this.left.set(e, Math.min(this.left.get(e) ?? 0, 1200))
    }
    this.left.set(line, holdMs(line.textContent ?? ''))
  }

  /** Everything said so far (tools). */
  get lines(): string[] {
    return [...this.log.children].map((e) => e.textContent ?? '')
  }
}
