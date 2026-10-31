// Sound, synthesised (no downloaded assets): wind over the plains, the boom
// of a giant's footfall (heard late from far away — sound travels 343 m/s),
// a stomp's deeper crack, a giant's horn-like call, and rubble. Starts on the
// first click or key (browsers require a gesture).
//
// And the score, which is mostly not there: a slow pad drifting through a few
// low, sad chords, a glassy note now and then, deep horns groaning far off;
// rain, storm wind and thunder from the weather. It all goes into a long
// reverb, so the world sounds as big as it is. `mood()` steers it: under a
// storm, or near something huge, the drone swells and the melody thins.

const SPEED_OF_SOUND = 343

/** The pad's chords (Hz, low to high): D minor, B♭, F over A, G minor, A sus4 — slow and sad. */
const CHORDS: number[][] = [
  [73.42, 146.83, 174.61, 220.0],
  [58.27, 116.54, 146.83, 174.61],
  [55.0, 130.81, 174.61, 220.0],
  [49.0, 116.54, 146.83, 196.0],
  [55.0, 110.0, 146.83, 164.81],
]

export class Sound {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  private on: boolean
  /** The hall: everything big goes through it. */
  private space: ConvolverNode | null = null
  private padGain: GainNode | null = null
  private padFilter: BiquadFilterNode | null = null
  private padVoices: OscillatorNode[] = []
  private rainGain: GainNode | null = null
  private windGain: GainNode | null = null
  private state = { dark: 0.5, rain: 0, wind: 0.5, awe: 0 }
  private chord = 0
  private nextChord = 0
  private nextNote = 6
  private nextHorn = 25

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
    this.hall()
    this.wind()
    this.pad()
    this.rainBed()
    // Run the score on its own clock.
    setInterval(() => this.score(), 250)
  }

  /** A long, dark reverb: five seconds of decaying noise, wider in stereo. */
  private hall(): void {
    const ctx = this.ctx!
    const len = ctx.sampleRate * 5
    const ir = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < 600 ? i / 600 : 1)
    }
    this.space = ctx.createConvolver()
    this.space.buffer = ir
    const wet = ctx.createGain()
    wet.gain.value = 0.7
    this.space.connect(wet).connect(this.master!)
  }

  /** The pad: four voices, each two detuned oscillators, through a breathing low-pass. */
  private pad(): void {
    const ctx = this.ctx!
    this.padFilter = ctx.createBiquadFilter()
    this.padFilter.type = 'lowpass'
    this.padFilter.frequency.value = 600
    this.padFilter.Q.value = 0.4
    this.padGain = ctx.createGain()
    this.padGain.gain.value = 0
    this.padFilter.connect(this.padGain)
    this.padGain.connect(this.master!)
    this.padGain.connect(this.space!)
    const breath = ctx.createOscillator()
    breath.frequency.value = 0.045
    const depth = ctx.createGain()
    depth.gain.value = 260
    breath.connect(depth).connect(this.padFilter.frequency)
    breath.start()
    const chord = CHORDS[0]
    for (let v = 0; v < 4; v++) {
      for (const det of [-6, 5]) {
        const o = ctx.createOscillator()
        o.type = v === 0 ? 'sine' : 'triangle'
        o.frequency.value = chord[v]
        o.detune.value = det
        const g = ctx.createGain()
        g.gain.value = v === 0 ? 0.14 : 0.07
        o.connect(g).connect(this.padFilter)
        o.start()
        this.padVoices.push(o)
      }
    }
  }

  /** Rain: hissing noise, high-passed; silent until the weather says otherwise. */
  private rainBed(): void {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 1200
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 7000
    this.rainGain = ctx.createGain()
    this.rainGain.gain.value = 0
    src.connect(hp).connect(lp).connect(this.rainGain).connect(this.master!)
    src.start()
  }

  /**
   * The weather and the world, for the score: how dark (0 … 1), how hard it
   * rains, how windy, and how close something enormous is (awe, 0 … 1).
   */
  mood(dark: number, rain: number, wind: number, awe: number): void {
    this.state = { dark, rain, wind, awe }
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.rainGain?.gain.setTargetAtTime(rain * 0.11, t, 2)
    this.windGain?.gain.setTargetAtTime(0.03 + wind * 0.07, t, 3)
    // The drone swells under storm and near the colossi.
    this.padGain?.gain.setTargetAtTime(0.05 + dark * 0.05 + awe * 0.09, t, 4)
    this.padFilter?.frequency.setTargetAtTime(380 + (1 - dark) * 420 + awe * 300, t, 4)
  }

  /** Every quarter second: chord changes, the odd high note, a far horn. */
  private score(): void {
    if (!this.ctx || !this.on) return
    const t = this.ctx.currentTime
    if (t > this.nextChord) {
      // A new chord every half-minute or so, gliding there over eight seconds.
      this.nextChord = t + 24 + Math.random() * 20
      this.chord = (this.chord + 1 + Math.floor(Math.random() * 2)) % CHORDS.length
      const c = CHORDS[this.chord]
      this.padVoices.forEach((o, i) => o.frequency.linearRampToValueAtTime(c[Math.floor(i / 2)], t + 8))
    }
    if (t > this.nextNote) {
      // Sparse: fewer notes the darker it is.
      this.nextNote = t + 7 + Math.random() * 14 + this.state.dark * 10
      if (Math.random() > this.state.dark * 0.6) this.glass(CHORDS[this.chord])
    }
    if (t > this.nextHorn) {
      this.nextHorn = t + 45 + Math.random() * 70
      this.farHorn()
    }
  }

  /** A glassy note from the chord, high up, fading into the hall. */
  private glass(chord: number[]): void {
    const ctx = this.ctx!
    const t = ctx.currentTime
    const f = chord[1 + Math.floor(Math.random() * 3)] * (Math.random() < 0.5 ? 4 : 8)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.8)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 7)
    g.connect(this.space!)
    g.connect(this.master!)
    for (const [type, mul] of [['sine', 1], ['triangle', 2.001]] as const) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = f * mul
      const og = ctx.createGain()
      og.gain.value = mul === 1 ? 1 : 0.15
      o.connect(og).connect(g)
      o.start(t)
      o.stop(t + 7.2)
    }
  }

  /** A cairn catches: three glass notes rising from the chord, into the hall. */
  chime(): void {
    if (!this.ctx || !this.on) return
    const c = CHORDS[this.chord]
    ;[0, 0.45, 0.95].forEach((d, i) => setTimeout(() => this.glass([c[0], c[1 + i], c[1 + i], c[1 + i]]), d * 1000))
  }

  /** Something enormous, very far away, groaning: a deep horn sliding down, mostly reverb. */
  farHorn(): void {
    if (!this.ctx || !this.on) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(260, t)
    lp.frequency.linearRampToValueAtTime(140, t + 7)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.09, t + 2.2)
    g.gain.setValueAtTime(0.09, t + 4.5)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 8)
    lp.connect(g)
    g.connect(this.space!)
    const dry = ctx.createGain()
    dry.gain.value = 0.25
    g.connect(dry).connect(this.master!)
    const base = 41 + Math.random() * 8
    for (const [mul, type] of [[1, 'sawtooth'], [1.498, 'sawtooth'], [0.5, 'sine']] as const) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.setValueAtTime(base * mul, t)
      o.frequency.exponentialRampToValueAtTime(base * mul * 0.82, t + 7.5)
      o.connect(lp)
      o.start(t)
      o.stop(t + 8.2)
    }
  }

  /** Thunder, `d` metres away: it arrives late, rolling. */
  thunder(d: number): void {
    if (!this.ctx || !this.on) return
    const when = this.ctx.currentTime + d / SPEED_OF_SOUND
    const vol = 0.5 / (1 + d / 1500)
    // A crack (if near), then the long roll: low-passed noise in a few swells.
    if (d < 1500) this.burst(when, vol * 0.5, 2400, 0.4)
    for (let i = 0; i < 4; i++) this.burst(when + 0.2 + i * (0.5 + Math.random() * 0.6), vol * (0.9 - i * 0.18), 160 + Math.random() * 120, 2.6)
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
    this.windGain = gain
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
