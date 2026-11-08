// Keyboard + mouse + gamepad state. Pointer lock for mouse-look; right-drag works
// without it. Tools can drive it through `press`/`release`.
//
// The game asks about keys by their default code ('KeyE' is "use"); the binding table
// maps the player's own key to that code, so a rebound key arrives as the action's
// default, and the default key, if moved elsewhere, does nothing. A pad's buttons and
// sticks arrive the same way.

/**
 * Ask for the mouse (pointer lock), quietly: a browser may refuse — Firefox and Zen without a fresh
 * click, inside a frame, or the user said no — and the refusal came back as an unhandled error on
 * every click (the user's Zen console, and the playtest's first click). Refused, the view still
 * turns by dragging with the right button.
 */
export function lockPointer(el: HTMLElement): void {
  try {
    const r = (el.requestPointerLock as unknown as (() => Promise<void> | void) | undefined)?.call(el)
    if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {})
  } catch {
    /* refused: drag to look */
  }
}

/** Every rebindable action: its default code (what the game asks about) and its name. */
export const ACTIONS: ReadonlyArray<readonly [string, string]> = [
  ['KeyW', 'Forward'],
  ['KeyS', 'Back'],
  ['KeyA', 'Left'],
  ['KeyD', 'Right'],
  ['ShiftLeft', 'Run'],
  ['Space', 'Jump, glide'],
  ['KeyC', 'Crouch (on a slope: slide)'],
  ['KeyE', 'Climb, take, use'],
  ['KeyQ', 'Draw the bow'],
  ['KeyF', 'Loose'],
  ['KeyG', 'Grappling line'],
  ['KeyH', 'Horn'],
  ['KeyV', 'Sight-stone'],
  ['KeyR', 'Burning-glass'],
  ['KeyM', 'Map'],
  ['KeyJ', 'Journal'],
  ['KeyI', 'Bag'],
]

/** Actions that can be a toggle instead of a hold (settings: "Holds as toggles"). */
export const TOGGLEABLE = new Set(['ShiftLeft', 'KeyQ', 'KeyV', 'Mouse2'])

/** The rebinding page is listening for a key: the game ignores keys meanwhile. */
export const capture = { on: false }

/** The player's keys: action (default code) → the key they chose. Missing = the default. */
let bindings: Record<string, string> = {}

export function setBindings(b: Record<string, string>): void {
  bindings = { ...b }
}

/** The key bound to an action (its default code when not rebound). */
export function keyFor(action: string): string {
  return bindings[action] ?? action
}

/**
 * The action a physical key stands for: the action it is bound to; or the key itself if it is
 * no action's default, or an action's default still bound to it; else nothing (moved away).
 */
export function actionOf(code: string): string | null {
  for (const a in bindings) if (bindings[a] === code) return a
  if (bindings[code] !== undefined && bindings[code] !== code) return null
  return code
}

/** A key's name for prompts: "E", "Shift", "Space", "Mouse 4"… */
export function keyName(code: string): string {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Shift')) return 'Shift'
  if (code.startsWith('Control')) return 'Ctrl'
  if (code.startsWith('Alt')) return 'Alt'
  if (code.startsWith('Arrow')) return code.slice(5)
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6)
  if (code.startsWith('Mouse')) return 'Mouse ' + code.slice(5)
  return code
}

// A pad, standard mapping: what each button stands for.
const PAD_BUTTONS: Record<number, string> = {
  0: 'Space', // A: jump
  1: 'KeyG', // B: the line
  2: 'KeyE', // X: use
  3: 'KeyH', // Y: horn
  4: 'KeyV', // LB: sight-stone
  5: 'ShiftLeft', // RB: run
  6: 'Mouse2', // LT: draw
  7: 'KeyF', // RT: loose (as F, not a click as well: that loosed twice)
  8: 'KeyM', // Back: map
  12: 'KeyJ', // up: journal
  13: 'KeyI', // down: bag
  11: 'KeyC', // right stick press: crouch
}
const PAD_DEAD = 0.18

/** How long a press waits to be read (a few frames even at a slow frame rate). */
const PRESS_FRESH_MS = 300

export class Input {
  private readonly down = new Set<string>()
  /**
   * Presses not yet read, with when they happened. A press nothing reads soon is gone: a Space pressed
   * to jump on foot (walking reads Space as held, never as a press) was still waiting when you later
   * took hold of a giant — and threw you off it on the first step of the climb.
   */
  private readonly pressedOnce = new Map<string, number>()
  lookX = 0
  lookY = 0
  wheel = 0
  private dragging = false
  private clicks = 0

  constructor(private readonly canvas: HTMLCanvasElement) {
    addEventListener('keydown', (e) => {
      // Typing in chat is not walking; a key being bound is not an action.
      if (e.repeat || (e.target as HTMLElement | null)?.tagName === 'INPUT' || capture.on) return
      const a = actionOf(e.code)
      if (a) {
        if (this.toggles && TOGGLEABLE.has(a)) this.flip(a)
        this.down.add(a)
        this.pressedOnce.set(a, performance.now())
      }
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
    })
    addEventListener('keyup', (e) => {
      const a = actionOf(e.code)
      if (a) this.down.delete(a)
    })
    addEventListener('blur', () => {
      this.down.clear()
      this.padHeld.clear()
    })

    canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== canvas) lockPointer(canvas)
    })
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2) this.dragging = true
      // A left click while looking around (pointer locked) is an action, not a lock request.
      if (e.button === 0 && document.pointerLockElement === canvas) this.clicks++
      // While looking around, the right button is held like a key (drawing the bow).
      if (e.button === 2 && document.pointerLockElement === canvas) {
        if (this.toggles) this.flip('Mouse2')
        this.down.add('Mouse2')
      }
    })
    addEventListener('mouseup', (e) => {
      if (e.button === 2) {
        this.dragging = false
        this.down.delete('Mouse2')
      }
    })
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas || this.dragging) {
        this.lookX += e.movementX
        this.lookY += e.movementY
      }
    })
    canvas.addEventListener(
      'wheel',
      (e) => {
        this.wheel += Math.sign(e.deltaY)
        e.preventDefault()
      },
      { passive: false },
    )
  }

  /** Holds as toggles (settings): a press holds it, the next press lets go. */
  toggles = false
  private readonly latched = new Set<string>()

  private flip(a: string): void {
    if (this.latched.has(a)) this.latched.delete(a)
    else this.latched.add(a)
  }

  held(code: string): boolean {
    if (this.toggles && TOGGLEABLE.has(code)) return this.latched.has(code)
    return this.down.has(code) || this.padHeld.has(code)
  }

  // ── The pad ──
  private readonly padHeld = new Set<string>()
  private padStick = { x: 0, y: 0 }
  private padWas: boolean[] = []
  /** A pad has been used since the last key or mouse (prompts could show its buttons). */
  padActive = false
  /** Escape from the pad's Start button (main opens the pause). */
  onPadStart: () => void = () => {}
  /** A page is open (pause, bag, journal, map): the d-pad, A and B move about it instead. */
  uiOpen: () => boolean = () => false
  onPadNav: (k: 'up' | 'down' | 'left' | 'right' | 'ok' | 'back') => void = () => {}

  /**
   * Read the pad, once a frame: the left stick walks (a round dead zone, the rest rescaled
   * from zero, so a slow walk is smooth), the right stick looks, buttons press and hold like
   * their keys, RT also clicks (loose).
   */
  pollPad(dt: number): void {
    const pads = navigator.getGamepads?.() ?? []
    let pad: Gamepad | null = null
    for (const p of pads) if (p && p.connected) pad = pad ?? p
    if (!pad) {
      if (this.padHeld.size) this.padHeld.clear()
      this.padStick.x = this.padStick.y = 0
      return
    }
    const stick = (x: number, y: number) => {
      const m = Math.hypot(x, y)
      if (m < PAD_DEAD) return { x: 0, y: 0 }
      const k = Math.min(1, (m - PAD_DEAD) / (1 - PAD_DEAD)) / m
      return { x: x * k, y: y * k }
    }
    const l = stick(pad.axes[0] ?? 0, pad.axes[1] ?? 0)
    this.padStick = { x: l.x, y: -l.y }
    const r = stick(pad.axes[2] ?? 0, pad.axes[3] ?? 0)
    // (As if the mouse moved: about 700 px a second at full tilt, eased in for fine aim.)
    const curve = (v: number) => Math.sign(v) * v * v
    this.lookX += curve(r.x) * 700 * dt
    this.lookY += curve(r.y) * 520 * dt
    if (l.x || l.y || r.x || r.y) this.padActive = true
    pad.buttons.forEach((b, i) => {
      const on = b.pressed || b.value > 0.5
      const was = this.padWas[i] ?? false
      this.padWas[i] = on
      if (on) this.padActive = true
      if (i === 9) {
        if (on && !was) this.onPadStart()
        return
      }
      if (this.uiOpen()) {
        const nav = ({ 12: 'up', 13: 'down', 14: 'left', 15: 'right', 0: 'ok', 1: 'back' } as const)[i as 12]
        if (nav && on && !was) this.onPadNav(nav)
        if (nav) return
      }
      const a = PAD_BUTTONS[i]
      if (!a) return
      if (on && !was) {
        if (this.toggles && TOGGLEABLE.has(a)) this.flip(a)
        this.padHeld.add(a)
        this.pressedOnce.set(a, performance.now())
      } else if (!on && was) this.padHeld.delete(a)
    })
  }

  /** Is there a fresh press of `code` waiting (without taking it)? */
  peek(code: string): boolean {
    const at = this.pressedOnce.get(code)
    return at !== undefined && performance.now() - at < PRESS_FRESH_MS
  }

  /** True once per physical press. */
  pressed(code: string): boolean {
    const at = this.pressedOnce.get(code)
    if (at === undefined) return false
    this.pressedOnce.delete(code)
    return performance.now() - at < PRESS_FRESH_MS
  }

  /** Movement axes from WASD/arrows: x = strafe right, y = forward. */
  axes(): { x: number; y: number } {
    const x = (this.held('KeyD') || this.held('ArrowRight') ? 1 : 0) - (this.held('KeyA') || this.held('ArrowLeft') ? 1 : 0)
    const y = (this.held('KeyW') || this.held('ArrowUp') ? 1 : 0) - (this.held('KeyS') || this.held('ArrowDown') ? 1 : 0)
    // Keys win; else the pad's stick, part-way over as it is.
    if (x || y) return { x, y }
    return { x: this.padStick.x, y: this.padStick.y }
  }

  consumeLook(): { dx: number; dy: number; wheel: number } {
    const r = { dx: this.lookX, dy: this.lookY, wheel: this.wheel }
    this.lookX = 0
    this.lookY = 0
    this.wheel = 0
    return r
  }

  /** True once per left click made while looking around. */
  clicked(): boolean {
    if (this.clicks === 0) return false
    this.clicks--
    return true
  }

  /** For tools: a click. */
  click(): void {
    this.clicks++
  }

  /** Drop every held key (focus moved to chat, etc.). */
  releaseAll(): void {
    this.latched.clear()
    this.down.clear()
    this.padHeld.clear()
    this.pressedOnce.clear()
  }

  /** For tools: hold or release a key code. */
  press(code: string): void {
    this.down.add(code)
    this.pressedOnce.set(code, performance.now())
  }

  release(code: string): void {
    this.down.delete(code)
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas
  }
}

/** A default key's name as written in prompts ("E", "Shift", "Space") → its code. */
function codeOfLabel(t: string): string | null {
  if (/^[A-Z]$/.test(t)) return 'Key' + t
  if (t === 'Shift') return 'ShiftLeft'
  if (t === 'Space') return 'Space'
  return null
}

/**
 * Every prompt's keycaps show the player's own keys: a <kbd> written with the default
 * ("<kbd>E</kbd>", "<kbd>W A S D</kbd>") is shown with what the action is bound to now.
 * The text as written is kept (data-k), so a rebinding relabels it again.
 */
export function relabelKeys(root: ParentNode): void {
  for (const k of root.querySelectorAll<HTMLElement>('kbd')) {
    const orig = k.dataset.k ?? k.textContent ?? ''
    k.dataset.k = orig
    const out = orig
      .split(' ')
      .map((t) => {
        const c = codeOfLabel(t)
        return c ? keyName(keyFor(c)) : t
      })
      .join(' ')
    if (k.textContent !== out) k.textContent = out
  }
}

/** Relabel keycaps wherever they appear, as they appear. */
export function watchKeycaps(): void {
  relabelKeys(document.body)
  new MutationObserver((ms) => {
    for (const m of ms)
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue
        const el = n as HTMLElement
        if (el.tagName === 'KBD') relabelKeys(el.parentElement ?? el)
        else if (el.querySelector?.('kbd')) relabelKeys(el)
      }
  }).observe(document.body, { childList: true, subtree: true })
}
