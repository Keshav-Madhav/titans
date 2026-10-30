// The one shared world. The server owns the Titan (it changes the land) and
// the ordered log of terrain events; Wanderers move on their own clients and
// the server only checks they are not teleporting or flying.

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
  TitanBrain,
  TitanGait,
  titanBody,
  WORLD_SEED,
  type ChatMsg,
  type GaitEvent,
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

/** Where the first Titan stands. Must match the client's offline spawn. */
export const TITAN_SPAWN = { x: 230, z: -400, heading: Math.PI * 0.62 }

interface Seen {
  x: number
  z: number
  at: number
  /** Until when a fall (after letting go of a Titan) is allowed. */
  fallUntil: number
}

export class WorldRoom extends Room<{ state: WorldState }> {
  maxClients = 40
  autoDispose = false

  private readonly terrain = new Terrain(WORLD_SEED)
  private gait = new TitanGait(titanBody(TITAN_HEIGHT), TITAN_SPAWN.x, TITAN_SPAWN.z, TITAN_SPAWN.heading)
  /** Whoever last walked the Titan: the name its mountain will carry. */
  private lastDriver = ''
  /** When the Titan sat down with nobody driving (0 = not resting alone). */
  private restSince = 0
  private readonly dormantAfter = Number(process.env.TITANS_DORMANT_MS ?? DORMANT_AFTER_MS)
  /** Mountains by id, for climb checks without parsing schema JSON. */
  private readonly mountains = new Map<string, MountainInfo>()
  /** When nobody walks it, the Titan wanders on its own (TITANS_AI=0 turns that off). */
  private readonly brain = new TitanBrain(20261030)
  private readonly wildAfter = process.env.TITANS_AI === '0' ? Infinity : Number(process.env.TITANS_AI_DELAY_MS ?? 8000)
  private unattendedSince = Date.now()
  private readonly log: TerrainEvent[] = []
  private readonly events: GaitEvent[] = []
  private readonly snap = {} as TitanSnapshot
  private titanInput = { forward: 0, turn: 0 }
  private lastStomp = 0
  private lastCall = 0
  private readonly seen = new Map<string, Seen>()
  private readonly tokens = new Map<string, string>() // sessionId → token hash
  private readonly pending: TerrainEvent[] = []
  private store!: WorldStore
  private lastTitanSave = 0

  onCreate(): void {
    this.setState(new WorldState())
    this.state.titan = new TitanState()
    this.state.titan.driver = ''

    // Wake the world up exactly as it was: replay every terrain event in
    // order, and put the Titan back where it stood.
    this.store = new WorldStore(process.env.TITANS_DB ?? 'data/world.db')
    const events = this.store.loadEvents()
    for (const e of events) {
      this.apply(e)
      this.log.push(e)
    }
    this.state.seq = events.length ? events[events.length - 1].seq : 0
    const saved = this.store.loadTitan(1)
    if (saved) this.gait.restore(saved)
    for (const m of this.store.loadMountains()) this.addMountain(m.id, m.info)
    console.log(`world loaded: ${events.length} terrain events, Titan at ${this.gait.x.toFixed(0)}, ${this.gait.z.toFixed(0)} after ${this.gait.steps} steps`)
    this.copyTitan()
    this.setPatchRate(PATCH_MS)
    this.setFixedTimestep((ctx) => this.tick(ctx.dt), SERVER_TICK_HZ)

    this.onMessage(MSG.move, (client: Client, m: MoveMsg) => this.onMove(client, m))
    this.onMessage(MSG.titanInput, (client: Client, m: TitanInputMsg) => {
      if (client.sessionId !== this.state.titan.driver) return
      this.titanInput = { forward: clamp(+m.forward || 0, 0, 1), turn: clamp(+m.turn || 0, -1, 1) }
      this.gait.plough = m.plough !== false
      const now = Date.now()
      if (m.stomp && now - this.lastStomp > STOMP_COOLDOWN_S * 1000) {
        this.lastStomp = now
        this.gait.stompArmed = true
      }
    })
    // The Titan's call: every Wanderer is shown where it is.
    this.onMessage(MSG.call, (client: Client) => {
      const now = Date.now()
      if (client.sessionId !== this.state.titan.driver || now - this.lastCall < 8000) return
      this.lastCall = now
      const p = this.state.players.get(client.sessionId)
      this.broadcast(MSG.call, { name: p?.name ?? 'The Titan', x: this.gait.x, z: this.gait.z })
    })
    this.onMessage(MSG.role, (client: Client, m: RoleMsg) => this.onRole(client, m))
    // Sit down to rest, or stand back up.
    this.onMessage(MSG.rest, (client: Client) => {
      if (client.sessionId === this.state.titan.driver) this.gait.resting = !this.gait.resting
    })
    // The Titan heaves its shoulders; every client shakes its own climbers.
    this.onMessage(MSG.shrug, (client: Client) => {
      if (client.sessionId === this.state.titan.driver) this.broadcast(MSG.shrug, {})
    })
    this.onMessage(MSG.chat, (client: Client, m: ChatMsg) => {
      const p = this.state.players.get(client.sessionId)
      const text = String(m?.text ?? '').slice(0, 240).trim()
      if (!p || !text) return
      this.broadcast(MSG.chat, { from: p.name, color: p.color, text })
    })
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
    this.state.players.set(client.sessionId, p)
    p.climb = ''
    this.seen.set(client.sessionId, { x: sx, z: sz, at: Date.now(), fallUntil: 0 })
    // Everything the land has been through, in order: the client replays it.
    client.send(MSG.sync, { events: this.log })
  }

  onLeave(client: Client): void {
    this.savePlayer(client.sessionId)
    this.tokens.delete(client.sessionId)
    if (this.state.titan.driver === client.sessionId) {
      // Log off and your Titan sits down where it stands. If nobody takes it
      // up again, it sleeps, and becomes a mountain.
      this.state.titan.driver = ''
      this.titanInput = { forward: 0, turn: 0 }
      this.gait.resting = true
    }
    this.state.players.delete(client.sessionId)
    this.seen.delete(client.sessionId)
  }

  private onRole(client: Client, m: RoleMsg): void {
    const p = this.state.players.get(client.sessionId)
    if (!p) return
    const t = this.state.titan
    if (m?.role === 'titan' && (t.driver === '' || t.driver === client.sessionId)) {
      t.driver = client.sessionId
      p.role = 'titan'
      this.lastDriver = p.name
    } else if (m?.role === 'wanderer' && t.driver === client.sessionId) {
      t.driver = ''
      this.titanInput = { forward: 0, turn: 0 }
      p.role = 'wanderer'
    }
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
      const mtn = c.titan ? this.mountains.get(c.titan) : null
      const cx = mtn ? mtn.pose.x : this.gait.x
      const cz = mtn ? mtn.pose.z : this.gait.z
      const ok =
        (c.titan === '' || !!mtn) &&
        TITAN_PARTS.includes(c.part) &&
        [c.x, c.y, c.z].every((v) => Number.isFinite(v) && Math.abs(v) < TITAN_HEIGHT) &&
        Math.hypot(x - cx, z - cz) < TITAN_HEIGHT * 0.8 &&
        y < ground + TITAN_HEIGHT * 1.2
      if (!ok) return
      p.climb = c.titan ? `${c.titan}/${c.part}` : c.part
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
    this.store.saveTitan(1, this.gait.snapshot(this.snap))
    for (const id of this.tokens.keys()) this.savePlayer(id)
  }

  private savePlayer(sessionId: string): void {
    const token = this.tokens.get(sessionId)
    const p = this.state.players.get(sessionId)
    if (token && p) this.store.savePlayer(token, p.name, p.color, { x: p.x, y: p.y, z: p.z })
  }

  private tick(dt: number): void {
    this.events.length = 0
    const now = Date.now()
    let input = this.titanInput
    const t = this.state.titan
    if (t.driver || this.gait.resting) {
      this.unattendedSince = now
      t.wild = false
      if (!t.driver) input = { forward: 0, turn: 0 }
    } else if (now - this.unattendedSince > this.wildAfter) {
      // Nobody walks it: it walks itself.
      t.wild = true
      const o = this.brain.think(dt, this.gait, {
        heightAt: (x, z) => this.terrain.heightAt(x, z),
        avoid: [...this.mountains.values()].map((m) => ({ x: m.pose.x, z: m.pose.z, r: TITAN_HEIGHT * 2 })),
      })
      input = o
      this.gait.plough = o.plough
      if (o.stomp && now - this.lastStomp > STOMP_COOLDOWN_S * 1000) {
        this.lastStomp = now
        this.gait.stompArmed = true
      }
      if (o.call && now - this.lastCall > 8000) {
        this.lastCall = now
        this.broadcast(MSG.call, { name: 'A wild Titan', x: this.gait.x, z: this.gait.z })
      }
    } else {
      input = { forward: 0, turn: 0 }
    }
    this.gait.step(dt, input, this.events)
    for (const ev of this.events) this.emit(ev)

    // A Titan left resting with nobody driving it falls asleep.
    if (this.gait.resting && !this.state.titan.driver) {
      if (!this.restSince) this.restSince = Date.now()
      else if (Date.now() - this.restSince > this.dormantAfter) this.goDormant()
    } else {
      this.restSince = 0
    }

    // Durable before anyone could act on it: a crash loses no ground.
    this.store.appendEvents(this.pending)
    this.pending.length = 0
    if (now - this.lastTitanSave > 2000) {
      this.lastTitanSave = now
      this.store.saveTitan(1, this.gait.snapshot(this.snap))
    }
    this.copyTitan()
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
   * The resting Titan sleeps: its pose freezes into a mountain that keeps the
   * name of whoever walked it, a hill rises under it, and a new Titan
   * awakens elsewhere for the next player.
   */
  private goDormant(): void {
    const now = Date.now()
    const pose = { ...this.gait.snapshot(this.snap), resting: true }
    const id = `m${now.toString(36)}`
    const info: MountainInfo = { name: this.lastDriver || 'A nameless Titan', since: now, pose }
    this.addMountain(id, info)
    this.store.saveMountain(id, info)
    this.emit({ type: 'mountain', x: pose.x, z: pose.z })

    // Somewhere on the plain, a new one wakes.
    const n = this.mountains.size
    const a = n * 2.4 + 0.7
    const r = 650
    this.gait = new TitanGait(titanBody(TITAN_HEIGHT), Math.cos(a) * r, Math.sin(a) * r, a + Math.PI)
    this.lastDriver = ''
    this.restSince = 0
    this.store.saveTitan(1, this.gait.snapshot(this.snap))
    console.log(`${info.name}'s Titan became a mountain at ${pose.x.toFixed(0)}, ${pose.z.toFixed(0)}; a new Titan wakes at ${this.gait.x.toFixed(0)}, ${this.gait.z.toFixed(0)}`)
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
      applyFootprint(this.terrain.delta, footprintFor(H, e.x, e.z, Math.sin(e.heading), Math.cos(e.heading), e.stomp))
    }
  }

  private copyTitan(): void {
    const s = this.gait.snapshot(this.snap)
    const t = this.state.titan
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
