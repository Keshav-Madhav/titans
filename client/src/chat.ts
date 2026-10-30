// Text chat: Enter opens the input, Enter sends, Escape closes. Recent lines
// fade out after a while; they come back while the input is open.

import type { ChatOut } from '@titans/shared'

const FADE_MS = 14000

export class Chat {
  private readonly log = document.getElementById('chat-log')!
  private readonly input = document.getElementById('chat-input') as HTMLInputElement
  onSend: (text: string) => void = () => {}
  onOpen: () => void = () => {}

  constructor() {
    addEventListener('keydown', (e) => {
      if (e.code !== 'Enter' || document.activeElement === this.input) return
      e.preventDefault()
      this.open()
    })
    this.input.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') {
        const text = this.input.value.trim()
        if (text) this.onSend(text)
        this.close()
      } else if (e.code === 'Escape') {
        this.close()
      }
      e.stopPropagation()
    })
  }

  get typing(): boolean {
    return document.activeElement === this.input
  }

  private open(): void {
    if (document.pointerLockElement) document.exitPointerLock()
    this.onOpen()
    this.log.classList.add('open')
    this.input.style.display = 'block'
    this.input.focus()
  }

  private close(): void {
    this.input.value = ''
    this.input.blur()
    this.input.style.display = 'none'
    this.log.classList.remove('open')
  }

  add(m: ChatOut): void {
    const line = document.createElement('div')
    line.className = 'line'
    const who = document.createElement('b')
    who.textContent = m.from
    who.style.color = m.color
    line.append(who, document.createTextNode(` ${m.text}`))
    this.log.appendChild(line)
    while (this.log.children.length > 40) this.log.firstChild?.remove()
    setTimeout(() => line.classList.add('old'), FADE_MS)
  }

  system(text: string): void {
    this.add({ from: '·', color: '#f2c14e', text })
  }
}
