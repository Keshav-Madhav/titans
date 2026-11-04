// The pause: the world stops and the settings are to hand (user, 2026-11-01:
// "resolution, quality…" — and nowhere to change them but the address bar).
// It opens when you let go of the view (Esc) with nothing else open; Go on
// takes the view back. Every change applies at once and is kept.

import { DEFAULT_SETTINGS, type Settings } from './save'

type Choice<T> = Array<[T, string]>

const RESOLUTIONS: Choice<Settings['resolution']> = [
  ['auto', 'Auto'],
  [1, 'Full'],
  [0.75, '¾'],
  [0.5, '½'],
]
const DETAILS: Choice<Settings['detail']> = [
  ['auto', 'Auto'],
  [0, 'High'],
  [1, 'Medium'],
  [2, 'Low'],
]

/** The keys, as the README has them. */
const CONTROLS: Array<[string, string]> = [
  ['W A S D', 'Move'],
  ['Mouse', 'Look (click the world to capture it)'],
  ['Shift', 'Run (hold on open ground: the long run)'],
  ['Space', 'Jump; with the wing-cloak, hold to glide'],
  ['E', 'Climb, take hold, read, take, use'],
  ['Q · F', 'The bow: Q (or right mouse) draw, F (or click) loose'],
  ['G', 'The grappling line: throw where you look, hold G to reel in, Space to let go (with a kick)'],
  ['H', 'The horn: call a giant; on its back, steer it'],
  ['V', 'The sight-stone (hold)'],
  ['M · J · I', 'Map · Journal · Bag'],
  ['Esc · ?', 'This page: controls and settings'],
]

export class Pause {
  private readonly panel = document.getElementById('pause')!
  private readonly body = document.getElementById('pause-body')!
  /** Settings changed (apply and save them). */
  onChange: (s: Settings) => void = () => {}
  /** Go on: close and take the view back. */
  onResume: () => void = () => {}
  /** Begin again (after you said yes). */
  onNewAdventure: () => void = () => {}
  /** Opened or closed. */
  onToggle: (open: boolean) => void = () => {}

  constructor(private settings: Settings) {
    document.getElementById('pause-resume')!.addEventListener('click', () => this.resume())
    const again = document.getElementById('pause-new')!
    const sure = document.getElementById('pause-sure')!
    again.addEventListener('click', () => {
      sure.style.display = 'flex'
      again.style.display = 'none'
    })
    document.getElementById('pause-yes')!.addEventListener('click', () => this.onNewAdventure())
    document.getElementById('pause-no')!.addEventListener('click', () => {
      sure.style.display = 'none'
      again.style.display = ''
    })
    document.getElementById('pause-defaults')!.addEventListener('click', () => {
      this.settings = { ...DEFAULT_SETTINGS }
      this.render()
      this.onChange(this.settings)
    })
    this.render()
  }

  get open(): boolean {
    return this.panel.style.display === 'flex'
  }

  show(): void {
    if (this.open) return
    this.render()
    document.getElementById('pause-sure')!.style.display = 'none'
    document.getElementById('pause-new')!.style.display = ''
    this.panel.style.display = 'flex'
    this.onToggle(true)
  }

  resume(): void {
    if (!this.open) return
    this.panel.style.display = 'none'
    this.onToggle(false)
    this.onResume()
  }

  private set<K extends keyof Settings>(k: K, v: Settings[K]): void {
    this.settings = { ...this.settings, [k]: v }
    this.onChange(this.settings)
  }

  private render(): void {
    const s = this.settings
    this.body.innerHTML = ''
    const section = (title: string) => {
      const h = document.createElement('h2')
      h.textContent = title
      this.body.appendChild(h)
    }
    const row = (label: string, control: HTMLElement) => {
      const r = document.createElement('label')
      r.className = 'pause-row'
      const l = document.createElement('span')
      l.textContent = label
      r.append(l, control)
      this.body.appendChild(r)
    }
    const slider = (k: 'volume' | 'music' | 'sensitivity' | 'shake', min: number, max: number, step: number) => {
      const i = document.createElement('input')
      i.type = 'range'
      i.min = String(min)
      i.max = String(max)
      i.step = String(step)
      i.value = String(s[k])
      i.addEventListener('input', () => this.set(k, Number(i.value)))
      return i
    }
    const toggle = (k: 'sound' | 'invertY' | 'softFlash') => {
      const b = document.createElement('button')
      b.className = 'pause-toggle'
      const draw = () => {
        b.textContent = this.settings[k] ? 'On' : 'Off'
        b.classList.toggle('on', this.settings[k])
      }
      draw()
      b.addEventListener('click', (e) => {
        e.preventDefault()
        this.set(k, !this.settings[k])
        draw()
      })
      return b
    }
    const choose = <K extends 'resolution' | 'detail'>(k: K, options: Choice<Settings[K]>) => {
      const g = document.createElement('span')
      g.className = 'pause-choice'
      for (const [v, name] of options) {
        const b = document.createElement('button')
        b.textContent = name
        b.classList.toggle('on', s[k] === v)
        b.addEventListener('click', (e) => {
          e.preventDefault()
          this.set(k, v)
          for (const c of g.children) c.classList.toggle('on', c === b)
        })
        g.appendChild(b)
      }
      return g
    }
    // The controls (user: "no way to see controls"): every key, here where you look for settings.
    section('Controls')
    const keys = document.createElement('div')
    keys.className = 'pause-keys'
    for (const [k, what] of CONTROLS) {
      const r = document.createElement('div')
      r.className = 'pause-key'
      const kk = document.createElement('span')
      kk.innerHTML = k.split(' · ').map((x) => x.split(' ').map((y) => (y.length <= 6 && /^[A-Z0-9?/]|^Shift|^Space|^Esc|^Mouse|^Click|^F1/.test(y) ? `<kbd>${y}</kbd>` : y)).join(' ')).join(' · ')
      const w = document.createElement('span')
      w.textContent = what
      r.append(kk, w)
      keys.appendChild(r)
    }
    this.body.appendChild(keys)
    section('Sound')
    row('Sound', toggle('sound'))
    row('Volume', slider('volume', 0, 1, 0.01))
    row('Music', slider('music', 0, 1, 0.01))
    section('Looking')
    row('Mouse speed', slider('sensitivity', 0.3, 2.5, 0.05))
    row('Invert up and down', toggle('invertY'))
    section('Picture')
    row('Resolution', choose('resolution', RESOLUTIONS))
    row('Detail', choose('detail', DETAILS))
    section('Comfort')
    row('Ground shake', slider('shake', 0, 1, 0.05))
    row('Soft lightning', toggle('softFlash'))
  }
}
