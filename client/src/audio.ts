// Sound, synthesised (no downloaded assets): wind over the plains, the boom
// of a Titan's footfall (heard late from far away — sound travels 343 m/s),
// a stomp's deeper crack, a Titan's horn-like call, and rubble. Starts on the
// first click or key (browsers require a gesture). On/off in the world panel.

const SPEED_OF_SOUND = 343

export class Sound {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  private on: boolean

  constructor(enabled: boolean) {
    this.on = enabled
    const start = () => {
      this.start()
      removeEventListener('pointerdown', start)
      removeEventListener('keydown', start)
    }
    addEventListener('pointerdown', start)
    addEventListener('keydown', start)
  }

  get enabled(): boolean {
    return this.on
  }

  set enabled(v: boolean) {
    this.on = v
    if (this.master) this.master.gain.value = v ? 0.9 : 0
  }

  private start(): void {
    if (this.ctx) return
    try {
      this.ctx = new AudioContext()
    } catch {
      return
    }
    const ctx = this.ctx
    this.master = ctx.createGain()
    this.master.gain.value = this.on ? 0.9 : 0
    this.master.connect(ctx.destination)
    // Two seconds of white noise, reused by everything.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const d = this.noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    this.wind()
  }

  /** Wind: band-passed noise, breathing slowly. */
  private wind(): void {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 420
    band.Q.value = 0.6
    const gain = ctx.createGain()
    gain.gain.value = 0.045
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.07
    const depth = ctx.createGain()
    depth.gain.value = 0.03
    lfo.connect(depth).connect(gain.gain)
    const sweep = ctx.createGain()
    sweep.gain.value = 180
    lfo.connect(sweep).connect(band.frequency)
    src.connect(band).connect(gain).connect(this.master!)
    src.start()
    lfo.start()
  }

  /** How loud something `d` metres away is, and when it arrives. */
  private at(d: number, loud: number): { when: number; vol: number } | null {
    if (!this.ctx || !this.on) return null
    const vol = loud / (1 + (d / 260) * (d / 260))
    if (vol < 0.01) return null
    return { when: this.ctx.currentTime + d / SPEED_OF_SOUND, vol }
  }

  /** A Titan's foot coming down `d` metres away. */
  footfall(d: number, stomp: boolean): void {
    const t = this.at(d, stomp ? 1.6 : 1)
    if (!t) return
    const ctx = this.ctx!
    // The body of it: a sine dropping through the floor.
    const osc = ctx.createOscillator()
    osc.frequency.setValueAtTime(stomp ? 62 : 54, t.when)
    osc.frequency.exponentialRampToValueAtTime(24, t.when + (stomp ? 1.4 : 0.9))
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t.when)
    g.gain.exponentialRampToValueAtTime(0.7 * t.vol, t.when + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t.when + (stomp ? 1.8 : 1.1))
    osc.connect(g).connect(this.master!)
    osc.start(t.when)
    osc.stop(t.when + 2)
    // The crunch of earth on top.
    this.burst(t.when, t.vol * (stomp ? 0.6 : 0.35), stomp ? 900 : 380, stomp ? 1.2 : 0.6)
  }

  /** A Titan's call: two low horns a fifth apart, with a slow waver. */
  call(d: number): void {
    const t = this.at(d * 0.5, 0.9) // a call carries
    if (!t) return
    const ctx = this.ctx!
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 420
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t.when)
    g.gain.exponentialRampToValueAtTime(0.25 * t.vol, t.when + 0.6)
    g.gain.setValueAtTime(0.25 * t.vol, t.when + 2.2)
    g.gain.exponentialRampToValueAtTime(0.0001, t.when + 3.6)
    lp.connect(g).connect(this.master!)
    const vib = ctx.createOscillator()
    vib.frequency.value = 4.5
    const vibDepth = ctx.createGain()
    vibDepth.gain.value = 1.5
    vib.connect(vibDepth)
    for (const f of [55, 82.5]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f
      vibDepth.connect(o.frequency)
      o.connect(lp)
      o.start(t.when)
      o.stop(t.when + 3.8)
    }
    vib.start(t.when)
    vib.stop(t.when + 3.8)
  }

  /** Something crushed `d` metres away. */
  rubble(d: number): void {
    const t = this.at(d, 0.8)
    if (t) this.burst(t.when, t.vol * 0.5, 300, 1.5)
  }

  private burst(when: number, vol: number, freq: number, len: number): void {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, when)
    g.gain.exponentialRampToValueAtTime(vol, when + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, when + len)
    src.connect(f).connect(g).connect(this.master!)
    src.start(when)
    src.stop(when + len + 0.1)
  }

  /** Has the context started (a gesture happened)? */
  get running(): boolean {
    return this.ctx !== null
  }
}
