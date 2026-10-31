// Narration: short lines of story and guidance at the lower left. Recent
// lines fade out after a while.

const FADE_MS = 14000

export class Narration {
  private readonly log = document.getElementById('narration')!

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
    while (this.log.children.length > 3) this.log.firstChild?.remove()
    setTimeout(() => line.classList.add('old'), FADE_MS)
  }

  /** Everything said so far (tools). */
  get lines(): string[] {
    return [...this.log.children].map((e) => e.textContent ?? '')
  }
}
