// The world panel: single player (the default) or multiplayer (only when you
// switch it on), the server address, and starting a fresh single-player
// world. Opened from the mode chip (top right) or with M.

import type { Settings } from './save'

export class Menu {
  private readonly el = document.getElementById('menu')!
  private readonly sp = document.getElementById('menu-sp') as HTMLInputElement
  private readonly mp = document.getElementById('menu-mp') as HTMLInputElement
  private readonly server = document.getElementById('menu-server') as HTMLInputElement
  private readonly serverRow = document.getElementById('menu-server-row')!
  onApply: (s: Settings) => void = () => {}
  onNewWorld: () => void = () => {}
  onOpen: () => void = () => {}

  constructor(current: Settings) {
    this.sp.checked = !current.multiplayer
    this.mp.checked = current.multiplayer
    this.server.value = current.server
    const sync = () => (this.serverRow.style.display = this.mp.checked ? 'flex' : 'none')
    this.sp.addEventListener('change', sync)
    this.mp.addEventListener('change', sync)
    sync()
    document.getElementById('net')!.addEventListener('click', () => this.toggle())
    document.getElementById('menu-close')!.addEventListener('click', () => this.close())
    document.getElementById('menu-apply')!.addEventListener('click', () =>
      this.onApply({ multiplayer: this.mp.checked, server: this.server.value.trim() || current.server }),
    )
    document.getElementById('menu-new')!.addEventListener('click', () => {
      if (confirm('Start a new world? Your single-player world will be forgotten.')) this.onNewWorld()
    })
    addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return
      if (e.code === 'KeyM') this.toggle()
      if (e.code === 'Escape' && this.open) this.close()
    })
  }

  get open(): boolean {
    return this.el.style.display === 'block'
  }

  toggle(): void {
    if (this.open) this.close()
    else {
      if (document.pointerLockElement) document.exitPointerLock()
      this.onOpen()
      this.el.style.display = 'block'
    }
  }

  close(): void {
    this.el.style.display = 'none'
  }
}
