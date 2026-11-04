// The pause: the world stops and the settings are to hand (user, 2026-11-01:
// "resolution, quality…" — and nowhere to change them but the address bar).
// It opens when you let go of the view (Esc) with nothing else open; Go on
// takes the view back. Every change applies at once and is kept.

import { ACTIONS, actionOf, capture, keyFor, keyName, relabelKeys, setBindings } from './input'
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

/** The keys that are not rebound: the mouse, the arrows, the pause. */
const FIXED: Array<[string, string]> = [
  ['<kbd>Mouse</kbd>', 'Look (click the world to capture it)'],
  ['<kbd>Right mouse</kbd> · <kbd>Click</kbd>', 'Draw the bow · loose'],
  ['<kbd>Arrows</kbd>', 'Walk, as well'],
  ['<kbd>Esc</kbd> · <kbd>?</kbd>', 'This page'],
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
      setBindings({})
      relabelKeys(document.body)
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

  private setKeys(keys: Record<string, string>): void {
    setBindings(keys)
    this.set('keys', keys)
    this.render()
    relabelKeys(document.body)
  }

  /** Waiting for the new key for `action` (the next key pressed; Esc keeps the old one). */
  private listen(action: string, b: HTMLButtonElement): void {
    if (capture.on) return
    capture.on = true
    b.textContent = 'press a key…'
    b.classList.add('listening')
    const done = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopImmediatePropagation()
      removeEventListener('keydown', done, true)
      // (Let the key's own up and the game's next frame pass before keys count again.)
      setTimeout(() => (capture.on = false), 0)
      b.classList.remove('listening')
      const code = e.code
      if (code === 'Escape' || code === 'F1' || code === 'Backquote' || !code) {
        b.textContent = keyName(keyFor(action))
        return
      }
      const keys = { ...this.settings.keys }
      const was = keyFor(action)
      // The key already does something else: that action gets this one's old key.
      const other = actionOf(code)
      if (other && other !== action && ACTIONS.some(([a]) => a === other)) keys[other] = was
      keys[action] = code
      // (Bound back to its own default: no entry.)
      for (const [a, k] of Object.entries(keys)) if (a === k) delete keys[a]
      this.setKeys(keys)
    }
    addEventListener('keydown', done, true)
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
    // Click a key to change it: press the new one (Esc to keep the old); a key already in use
    // swaps with it.
    section('Controls')
    const keys = document.createElement('div')
    keys.className = 'pause-keys pause-bind'
    for (const [a, what] of ACTIONS) {
      const r = document.createElement('div')
      r.className = 'pause-key'
      const b = document.createElement('button')
      b.className = 'pause-bindkey'
      b.textContent = keyName(keyFor(a))
      b.classList.toggle('moved', keyFor(a) !== a)
      b.title = `Change the key for: ${what}`
      b.addEventListener('click', (e) => {
        e.preventDefault()
        this.listen(a, b)
      })
      const w = document.createElement('span')
      w.textContent = what
      r.append(b, w)
      keys.appendChild(r)
    }
    this.body.appendChild(keys)
    const fixed = document.createElement('div')
    fixed.className = 'pause-keys'
    for (const [k, what] of FIXED) {
      const r = document.createElement('div')
      r.className = 'pause-key fixed'
      const kk = document.createElement('span')
      kk.innerHTML = k
      const w = document.createElement('span')
      w.textContent = what
      r.append(kk, w)
      fixed.appendChild(r)
    }
    this.body.appendChild(fixed)
    const reset = document.createElement('button')
    reset.className = 'quiet pause-resetkeys'
    reset.textContent = 'Keys as they were made'
    reset.disabled = Object.keys(s.keys).length === 0
    reset.addEventListener('click', (e) => {
      e.preventDefault()
      this.setKeys({})
    })
    this.body.appendChild(reset)
    const pad = document.createElement('p')
    pad.className = 'pause-pad'
    pad.textContent = 'With a pad: left stick walk, right stick look · A jump · X climb, take · B line · Y horn · RB run · LT draw, RT loose · LB sight-stone · Back map · up journal, down bag · Start this page.'
    this.body.appendChild(pad)
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
