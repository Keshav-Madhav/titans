// The one shared world. The server owns the Titan (it changes the land) and
// the ordered log of terrain events; Wanderers move on their own clients and
// the server only checks they are not teleporting or flying.

import { Room, type Client } from 'colyseus'
import {
  applyDrag,
  applyFootprint,
  applyImpact,
  dragFor,
  footprintFor,
  impactFor,
  MAX_ABOVE_GROUND,
  MAX_WANDERER_SPEED,
  MSG,
  PATCH_MS,
  SERVER_TICK_HZ,
  Terrain,
  TITAN_HEIGHT,
  TitanGait,
  titanBody,
  WORLD_SEED,
  type ChatMsg,
  type GaitEvent,
  type JoinOptions,
  type MoveMsg,
  type RoleMsg,
  type TerrainEvent,
  type TitanInputMsg,
  type TitanSnapshot,
} from '@titans/shared'
import { Player, TitanState, WorldState } from './schema'

/** Where the first Titan stands. Must match the client's offline spawn. */
export const TITAN_SPAWN = { x: 230, z: -400, heading: Math.PI * 0.62 }

interface Seen {
  x: number
  z: number
  at: number
}

export class WorldRoom extends Room<{ state: WorldState }> {
  maxClients = 40
  autoDispose = false

  private readonly terrain = new Terrain(WORLD_SEED)
  private readonly gait = new TitanGait(titanBody(TITAN_HEIGHT), TITAN_SPAWN.x, TITAN_SPAWN.z, TITAN_SPAWN.heading)
  private readonly log: TerrainEvent[] = []
  private readonly events: GaitEvent[] = []
  private readonly snap = {} as TitanSnapshot
  private titanInput: TitanInputMsg = { forward: 0, turn: 0 }
  private readonly seen = new Map<string, Seen>()

  onCreate(): void {
    this.setState(new WorldState())
    this.state.titan = new TitanState()
    this.state.titan.driver = ''
    this.copyTitan()
    this.setPatchRate(PATCH_MS)
    this.setFixedTimestep((ctx) => this.tick(ctx.dt), SERVER_TICK_HZ)

    this.onMessage(MSG.move, (client: Client, m: MoveMsg) => this.onMove(client, m))
    this.onMessage(MSG.titanInput, (client: Client, m: TitanInputMsg) => {
      if (client.sessionId !== this.state.titan.driver) return
      this.titanInput = { forward: clamp(+m.forward || 0, 0, 1), turn: clamp(+m.turn || 0, -1, 1) }
    })
    this.onMessage(MSG.role, (client: Client, m: RoleMsg) => this.onRole(client, m))
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
    const sx = (Math.random() - 0.5) * 20
    const sz = (Math.random() - 0.5) * 20
    p.x = sx
    p.z = sz
    p.y = this.terrain.heightAt(sx, sz)
    this.state.players.set(client.sessionId, p)
    this.seen.set(client.sessionId, { x: sx, z: sz, at: Date.now() })
    // Everything the land has been through, in order: the client replays it.
    client.send(MSG.sync, { events: this.log })
  }

  onLeave(client: Client): void {
    if (this.state.titan.driver === client.sessionId) {
      this.state.titan.driver = ''
      this.titanInput = { forward: 0, turn: 0 }
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
    if (d > MAX_WANDERER_SPEED * dt * 1.5 + 2 || y > ground + MAX_ABOVE_GROUND) {
      // Too fast or flying: hold them where they were (the client snaps back).
      return
    }
    p.x = x
    p.y = Math.max(y, ground - 1)
    p.z = z
    p.yaw = +m.yaw || 0
    s.x = x
    s.z = z
    s.at = now
  }

  private tick(dt: number): void {
    this.events.length = 0
    this.gait.step(dt, this.state.titan.driver ? this.titanInput : { forward: 0, turn: 0 }, this.events)
    for (const ev of this.events) {
      const e = { ...ev, seq: ++this.state.seq } as TerrainEvent
      this.apply(e)
      this.log.push(e)
      this.broadcast(MSG.terrain, e)
    }
    this.copyTitan()
  }

  /** The server keeps its own copy of the land, to validate against (and to persist, next phase). */
  private apply(e: TerrainEvent): void {
    const H = TITAN_HEIGHT
    if (e.type === 'drag') {
      applyDrag(this.terrain.delta, dragFor(H, e.ax, e.az, e.bx, e.bz))
    } else {
      applyImpact(this.terrain.delta, impactFor(H, e.x, e.z))
      applyFootprint(this.terrain.delta, footprintFor(H, e.x, e.z, Math.sin(e.heading), Math.cos(e.heading)))
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
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
