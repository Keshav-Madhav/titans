// The one shared world. The server owns the Titans (they change the land)
// and the ordered log of terrain events; Wanderers move on their own clients
// and the server only checks they are not teleporting or flying.
//
// The world keeps a few Titan slots awake at once (TITANS_COUNT, default 2):
// some players are giants. Each slot walks for its driver, or — nobody
// driving — for its own wild mind. A slot whose Titan falls asleep (becomes a
// mountain) wakes a fresh one elsewhere.

import { Room, type Client } from 'colyseus'
import {
  applyDrag,
  applyFootprint,
  applyImpact,
  applyMountain,
  DORMANT_AFTER_MS,
  dragFor,
  mountainFor,
  FALL_GRACE_MS,
  TITAN_PARTS,
  footprintFor,
  impactFor,
  MAX_ABOVE_GROUND,
  MAX_WANDERER_SPEED,
  MSG,
  PATCH_MS,
  SERVER_TICK_HZ,
  STOMP_COOLDOWN_S,
  Terrain,
  TITAN_HEIGHT,
  TITAN_SPAWNS,
  TitanBrain,
  TitanGait,
  titanBody,
  WORLD_SEED,
  type ChatMsg,
  type GaitEvent,
  type GaitInput,
  type JoinOptions,
  type MountainInfo,
  type MoveMsg,
  type RoleMsg,
  type TerrainEvent,
  type TitanInputMsg,
  type TitanSnapshot,
} from '@titans/shared'
import { Mountain, Player, TitanState, WorldState } from './schema'
import { hashToken, WorldStore } from './store'

interface Seen {
  x: number
  z: number
  at: number
  /** Until when a fall (after letting go of a Titan) is allowed. */
  fallUntil: number
}

/** One awake Titan and everything the server tracks about it. */
interface Awake {
  id: string // 't1', 't2', … (the slot; it outlives the Titan in it)
  slot: number
  gait: TitanGait
  brain: TitanBrain
  input: GaitInput
  /** Whoever last walked it: the name its mountain will carry. */
  lastDriver: string
  /** When it sat down with nobody driving (0 = not resting alone). */
  restSince: number
  unattendedSince: number
  lastStomp: number
  lastCall: number
}

export class WorldRoom extends Room<{ state: WorldState }> {
  maxClients = 40
  autoDispose = false

  private readonly terrain = new Terrain(WORLD_SEED)
  private readonly titans = new Map<string, Awake>()
  private readonly dormantAfter = Number(process.env.TITANS_DORMANT_MS ?? DORMANT_AFTER_MS)
  /** Mountains by id, for climb checks without parsing schema JSON. */
  private readonly mountains = new Map<string, MountainInfo>()
  /** When nobody walks a Titan, it wanders on its own (TITANS_AI=0 turns that off). */
  private readonly wildAfter = process.env.TITANS_AI === '0' ? Infinity : Number(process.env.TITANS_AI_DELAY_MS ?? 8000)
  private readonly log: TerrainEvent[] = []
  private readonly events: GaitEvent[] = []
  private readonly snap = {} as TitanSnapshot
  private readonly seen = new Map<string, Seen>()
  private readonly tokens = new Map<string, string>() // sessionId → token hash
  private readonly pending: TerrainEvent[] = []
  private store!: WorldStore
  private lastTitanSave = 0

  onCreate(): void {
    this.setState(new WorldState())

    // Wake the world up exactly as it was: replay every terrain event in
    // order, and put each Titan back where it stood.
    this.store = new WorldStore(process.env.TITANS_DB ?? 'data/world.db')
    const events = this.store.loadEvents()
    for (const e of events) {
      this.apply(e)
      this.log.push(e)
    }
    this.state.seq = events.length ? events[events.length - 1].seq : 0
    for (const m of this.store.loadMountains()) this.addMountain(m.id, m.info)
    const count = Math.max(1, Math.min(TITAN_SPAWNS.length, Number(process.env.TITANS_COUNT ?? 2)))
    for (let slot = 1; slot <= count; slot++) {
      const sp = TITAN_SPAWNS[slot - 1]
      const t = this.wake(slot, sp.x, sp.z, sp.heading)
      const saved = this.store.loadTitan(slot)
      if (saved) t.gait.restore(saved)
    }
    console.log(`world loaded: ${events.length} terrain events, ${this.titans.size} Titans awake, ${this.mountains.size} asleep`)
    this.setPatchRate(PATCH_MS)
    this.setFixedTimestep((ctx) => this.tick(ctx.dt), SERVER_TICK_HZ)

    this.onMessage(MSG.move, (client: Client, m: MoveMsg) => this.onMove(client, m))
    this.onMessage(MSG.titanInput, (client: Client, m: TitanInputMsg) => {
      const t = this.drivenBy(client.sessionId)
      if (!t) return
      t.input = { forward: clamp(+m.forward || 0, 0, 1), turn: clamp(+m.turn || 0, -1, 1) }
      t.gait.plough = m.plough !== false
      const now = Date.now()
      if (m.stomp && now - t.lastStomp > STOMP_COOLDOWN_S * 1000) {
        t.lastStomp = now
        t.gait.stompArmed = true
      }
    })
    // A Titan's call: every Wanderer is shown where it is.
    this.onMessage(MSG.call, (client: Client) => {
      const t = this.drivenBy(client.sessionId)
      const now = Date.now()
      if (!t || now - t.lastCall < 8000) return
      t.lastCall = now
      const p = this.state.players.get(client.sessionId)
      this.broadcast(MSG.call, { name: p?.name ?? 'A Titan', x: t.gait.x, z: t.gait.z })
    })
    this.onMessage(MSG.role, (client: Client, m: RoleMsg) => this.onRole(client, m))
    // Sit down to rest, or stand back up.
    this.onMessage(MSG.rest, (client: Client) => {
      const t = this.drivenBy(client.sessionId)
      if (t) t.gait.resting = !t.gait.resting
    })
    // A Titan heaves its shoulders; every client shakes its own climbers off that one.
    this.onMessage(MSG.shrug, (client: Client) => {
      const t = this.drivenBy(client.sessionId)
      if (t) this.broadcast(MSG.shrug, { titan: t.id })
    })
    this.onMessage(MSG.chat, (client: Client, m: ChatMsg) => {
      const p = this.state.players.get(client.sessionId)
      const text = String(m?.text ?? '').slice(0, 240).trim()
      if (!p || !text) return
      this.broadcast(MSG.chat, { from: p.name, color: p.color, text })
    })
  }

  /** Put a fresh Titan in a slot. */
  private wake(slot: number, x: number, z: number, heading: number): Awake {
    const id = `t${slot}`
    const t: Awake = {
      id,
      slot,
      gait: new TitanGait(titanBody(TITAN_HEIGHT), x, z, heading),
      brain: new TitanBrain(20261030 + slot * 7919),
      input: { forward: 0, turn: 0 },
      lastDriver: '',
      restSince: 0,
      unattendedSince: Date.now(),
      lastStomp: 0,
      lastCall: 0,
    }
    this.titans.set(id, t)
    let s = this.state.titans.get(id)
    if (!s) {
      s = new TitanState()
      s.driver = ''
      this.state.titans.set(id, s)
    }
    s.driver = ''
    this.copyTitan(t)
    return t
  }

  private drivenBy(sessionId: string): Awake | undefined {
    for (const t of this.titans.values()) if (this.state.titans.get(t.id)?.driver === sessionId) return t
    return undefined
  }

  onJoin(client: Client, options: JoinOptions): void {
    const p = new Player()
    p.name = String(options?.name ?? 'Wanderer').slice(0, 24)
    p.color = /^#[0-9a-f]{6}$/i.test(options?.color ?? '') ? options.color : '#b8352a'
    p.role = 'wanderer'
    // A returning Wanderer wakes where they left; a new one near the origin.
    const token = typeof options?.token === 'string' && options.token.length >= 16 ? hashToken(options.token) : ''
    if (token) this.tokens.set(client.sessionId, token)
    const back = token ? this.store.loadPlayer(token) : null
    const sx = back ? back.x : (Math.random() - 0.5) * 20
    const sz = back ? back.z : (Math.random() - 0.5) * 20
    p.x = sx
    p.z = sz
    p.y = this.terrain.heightAt(sx, sz)
    p.climb = ''
    this.state.players.set(client.sessionId, p)
    this.seen.set(client.sessionId, { x: sx, z: sz, at: Date.now(), fallUntil: 0 })
    // Everything the land has been through, in order: the client replays it.
    client.send(MSG.sync, { events: this.log })
  }

  onLeave(client: Client): void {
    this.savePlayer(client.sessionId)
    this.tokens.delete(client.sessionId)
    const t = this.drivenBy(client.sessionId)
    if (t) {
      // Log off and your Titan sits down where it stands. If nobody takes it
      // up again, it sleeps, and becomes a mountain.
      this.state.titans.get(t.id)!.driver = ''
      t.input = { forward: 0, turn: 0 }
      t.gait.resting = true
    }
    this.state.players.delete(client.sessionId)
    this.seen.delete(client.sessionId)
  }

  /** Take a Titan (the one asked for, else the nearest free one) or step out of yours. */
  private onRole(client: Client, m: RoleMsg): void {
    const p = this.state.players.get(client.sessionId)
    if (!p) return
    const mine = this.drivenBy(client.sessionId)
    if (m?.role === 'wanderer') {
      if (mine) {
        this.state.titans.get(mine.id)!.driver = ''
        mine.input = { forward: 0, turn: 0 }
      }
      p.role = 'wanderer'
      return
    }
    if (m?.role !== 'titan' || mine) return
    const free = [...this.titans.values()].filter((t) => this.state.titans.get(t.id)!.driver === '')
    const want = m.titan ? free.find((t) => t.id === m.titan) : free.sort((a, b) => Math.hypot(a.gait.x - p.x, a.gait.z - p.z) - Math.hypot(b.gait.x - p.x, b.gait.z - p.z))[0]
    if (!want) return
    this.state.titans.get(want.id)!.driver = client.sessionId
    want.lastDriver = p.name
    p.role = 'titan'
  }

  /** Accept a Wanderer's reported position unless it is impossible. */
  private onMove(client: Client, m: MoveMsg): void {
    const p = this.state.players.get(client.sessionId)
    const s = this.seen.get(client.sessionId)
    if (!p || !s || p.role !== 'wanderer') return
    const x = +m.x
    const y = +m.y
    const z = +m.z
    if (![x, y, z].every(Number.isFinite)) return
    const now = Date.now()
    const dt = Math.max(0.05, (now - s.at) / 1000)
    const d = Math.hypot(x - s.x, z - s.z)
    const ground = this.terrain.heightAt(x, z)
    const c = m.climb
    if (c) {
      // On a Titan the Titan carries you: no speed limit, but you must be on it.
      const awake = this.titans.get(c.titan)
      const mtn = awake ? null : this.mountains.get(c.titan)
      const cx = awake ? awake.gait.x : mtn?.pose.x
      const cz = awake ? awake.gait.z : mtn?.pose.z
      const ok =
        cx !== undefined &&
        cz !== undefined &&
        TITAN_PARTS.includes(c.part) &&
        [c.x, c.y, c.z].every((v) => Number.isFinite(v) && Math.abs(v) < TITAN_HEIGHT) &&
        Math.hypot(x - cx, z - cz) < TITAN_HEIGHT * 0.8 &&
        y < ground + TITAN_HEIGHT * 1.2
      if (!ok) return
      p.climb = `${c.titan}/${c.part}`
      p.lump = c.lump | 0
      p.lx = c.x
      p.ly = c.y
      p.lz = c.z
      s.fallUntil = now + FALL_GRACE_MS
    } else {
      // Fresh off a Titan you may be falling fast from high up; otherwise
      // too fast or too high means cheating (the client snaps back).
      const falling = now < s.fallUntil
      const maxD = MAX_WANDERER_SPEED * dt * (falling ? 4 : 1.5) + 2
      if (d > maxD || (!falling && y > ground + MAX_ABOVE_GROUND)) return
      p.climb = ''
    }
    p.x = x
    p.y = Math.max(y, ground - 1)
    p.z = z
    p.yaw = +m.yaw || 0
    s.x = x
    s.z = z
    s.at = now
  }

  onBeforeShutdown(): void {
    this.saveAll()
    super.onBeforeShutdown()
  }

  onDispose(): void {
    this.saveAll()
    this.store.close()
  }

  private saveAll(): void {
    for (const t of this.titans.values()) this.store.saveTitan(t.slot, t.gait.snapshot(this.snap))
    for (const id of this.tokens.keys()) this.savePlayer(id)
  }

  private savePlayer(sessionId: string): void {
    const token = this.tokens.get(sessionId)
    const p = this.state.players.get(sessionId)
    if (token && p) this.store.savePlayer(token, p.name, p.color, { x: p.x, y: p.y, z: p.z })
  }

  private tick(dt: number): void {
    const now = Date.now()
    const avoid = [...this.mountains.values()].map((m) => ({ x: m.pose.x, z: m.pose.z, r: TITAN_HEIGHT * 2 }))
    // Titans keep out of each other's way too.
    for (const t of this.titans.values()) avoid.push({ x: t.gait.x, z: t.gait.z, r: TITAN_HEIGHT * 2.5 })

    for (const t of [...this.titans.values()]) {
      const s = this.state.titans.get(t.id)!
      let input: GaitInput = t.input
      if (s.driver || t.gait.resting) {
        t.unattendedSince = now
        s.wild = false
        if (!s.driver) input = { forward: 0, turn: 0 }
      } else if (now - t.unattendedSince > this.wildAfter) {
        // Nobody walks it: it walks itself.
        s.wild = true
        const o = t.brain.think(dt, t.gait, {
          heightAt: (x, z) => this.terrain.heightAt(x, z),
          avoid: avoid.filter((a) => a.x !== t.gait.x || a.z !== t.gait.z),
        })
        input = o
        t.gait.plough = o.plough
        if (o.stomp && now - t.lastStomp > STOMP_COOLDOWN_S * 1000) {
          t.lastStomp = now
          t.gait.stompArmed = true
        }
        if (o.call && now - t.lastCall > 8000) {
          t.lastCall = now
          this.broadcast(MSG.call, { name: 'A wild Titan', x: t.gait.x, z: t.gait.z })
        }
      } else {
        input = { forward: 0, turn: 0 }
      }
      this.events.length = 0
      t.gait.step(dt, input, this.events)
      for (const ev of this.events) this.emit(ev)

      // A Titan left resting with nobody driving it falls asleep.
      if (t.gait.resting && !s.driver) {
        if (!t.restSince) t.restSince = now
        else if (now - t.restSince > this.dormantAfter) this.goDormant(t)
      } else {
        t.restSince = 0
      }
      this.copyTitan(this.titans.get(t.id)!)
    }

    // Durable before anyone could act on it: a crash loses no ground.
    this.store.appendEvents(this.pending)
    this.pending.length = 0
    if (now - this.lastTitanSave > 2000) {
      this.lastTitanSave = now
      for (const t of this.titans.values()) this.store.saveTitan(t.slot, t.gait.snapshot(this.snap))
    }
  }

  /** Number, apply, log and broadcast one terrain event. */
  private emit(ev: TerrainEvent | Omit<TerrainEvent, 'seq'>): void {
    const e = { ...ev, seq: ++this.state.seq } as TerrainEvent
    this.apply(e)
    this.log.push(e)
    this.pending.push(e)
    this.broadcast(MSG.terrain, e)
  }

  /**
   * A resting Titan sleeps: its pose freezes into a mountain that keeps the
   * name of whoever walked it, a hill rises under it, and a new Titan wakes
   * in the same slot somewhere else on the plain.
   */
  private goDormant(t: Awake): void {
    const now = Date.now()
    const pose = { ...t.gait.snapshot(this.snap), resting: true }
    const id = `m${now.toString(36)}${t.slot}`
    const info: MountainInfo = { name: t.lastDriver || 'A nameless Titan', since: now, pose }
    this.addMountain(id, info)
    this.store.saveMountain(id, info)
    this.emit({ type: 'mountain', x: pose.x, z: pose.z })

    const n = this.mountains.size
    const a = n * 2.4 + 0.7 + t.slot
    const r = 650
    const fresh = this.wake(t.slot, Math.cos(a) * r, Math.sin(a) * r, a + Math.PI)
    this.store.saveTitan(t.slot, fresh.gait.snapshot(this.snap))
    console.log(`${info.name}'s Titan became a mountain at ${pose.x.toFixed(0)}, ${pose.z.toFixed(0)}; a new Titan wakes at ${fresh.gait.x.toFixed(0)}, ${fresh.gait.z.toFixed(0)}`)
  }

  private addMountain(id: string, info: MountainInfo): void {
    this.mountains.set(id, info)
    const m = new Mountain()
    m.name = info.name
    m.since = info.since
    m.pose = JSON.stringify(info.pose)
    this.state.mountains.set(id, m)
  }

  /** The server keeps its own copy of the land, to validate against and to persist. */
  private apply(e: TerrainEvent): void {
    const H = TITAN_HEIGHT
    if (e.type === 'mountain') {
      applyMountain(this.terrain.delta, mountainFor(H, e.x, e.z))
    } else if (e.type === 'drag') {
      applyDrag(this.terrain.delta, dragFor(H, e.ax, e.az, e.bx, e.bz))
    } else {
      applyImpact(this.terrain.delta, impactFor(H, e.x, e.z, e.stomp))
      applyFootprint(this.terrain.delta, footprintFor(H, e.x, e.z, e.hx ?? Math.sin(e.heading), e.hz ?? Math.cos(e.heading), e.stomp))
    }
  }

  private copyTitan(a: Awake): void {
    const s = a.gait.snapshot(this.snap)
    const t = this.state.titans.get(a.id)!
    t.x = s.x
    t.z = s.z
    t.heading = s.heading
    t.speed = s.speed
    t.phase = s.phase
    t.swingFoot = s.swingFoot
    t.swinging = s.swinging
    t.steps = s.steps
    t.p0x = s.p0x
    t.p0z = s.p0z
    t.p1x = s.p1x
    t.p1z = s.p1z
    t.fromX = s.fromX
    t.fromZ = s.fromZ
    t.toX = s.toX
    t.toZ = s.toZ
    t.plough = s.plough
    t.swingStomp = s.swingStomp
    t.resting = s.resting
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
