// Keyboard + mouse state. Pointer lock for mouse-look; right-drag works
// without it. Tools can drive it through `press`/`release`.

export class Input {
  private readonly down = new Set<string>()
  private readonly pressedOnce = new Set<string>()
  lookX = 0
  lookY = 0
  wheel = 0
  private dragging = false

  constructor(private readonly canvas: HTMLCanvasElement) {
    addEventListener('keydown', (e) => {
      if (e.repeat) return
      this.down.add(e.code)
      this.pressedOnce.add(e.code)
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
    })
    addEventListener('keyup', (e) => this.down.delete(e.code))
    addEventListener('blur', () => this.down.clear())

    canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.()
    })
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2) this.dragging = true
    })
    addEventListener('mouseup', (e) => {
      if (e.button === 2) this.dragging = false
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

  held(code: string): boolean {
    return this.down.has(code)
  }

  /** True once per physical press. */
  pressed(code: string): boolean {
    if (!this.pressedOnce.has(code)) return false
    this.pressedOnce.delete(code)
    return true
  }

  /** Movement axes from WASD/arrows: x = strafe right, y = forward. */
  axes(): { x: number; y: number } {
    const x = (this.held('KeyD') || this.held('ArrowRight') ? 1 : 0) - (this.held('KeyA') || this.held('ArrowLeft') ? 1 : 0)
    const y = (this.held('KeyW') || this.held('ArrowUp') ? 1 : 0) - (this.held('KeyS') || this.held('ArrowDown') ? 1 : 0)
    return { x, y }
  }

  consumeLook(): { dx: number; dy: number; wheel: number } {
    const r = { dx: this.lookX, dy: this.lookY, wheel: this.wheel }
    this.lookX = 0
    this.lookY = 0
    this.wheel = 0
    return r
  }

  /** For tools: hold or release a key code. */
  press(code: string): void {
    this.down.add(code)
    this.pressedOnce.add(code)
  }

  release(code: string): void {
    this.down.delete(code)
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas
  }
}
