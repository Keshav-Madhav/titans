// Connection to the game server. Room state (players, the Titan) is read
// directly each frame; terrain events and chat arrive as ordered messages.
// If no server answers, the game runs offline, simulating the Titan itself.

import { Client, type Room } from '@colyseus/sdk'
import {
  MSG,
  ROOM_NAME,
  SERVER_PORT,
  type CallOut,
  type ChatOut,
  type JoinOptions,
  type MoveMsg,
  type Role,
  type SyncMsg,
  type TerrainEvent,
  type TitanInputMsg,
  type TitanSnapshot,
} from '@titans/shared'

export interface RemotePlayer {
  name: string
  color: string
  role: string
  x: number
  y: number
  z: number
  yaw: number
  climb: string
  lump: number
  lx: number
  ly: number
  lz: number
}

interface WorldStateView {
  players: { forEach(cb: (p: RemotePlayer, id: string) => void): void; get(id: string): RemotePlayer | undefined }
  titans: {
    forEach(cb: (t: TitanSnapshot & { driver: string; wild: boolean }, id: string) => void): void
    get(id: string): (TitanSnapshot & { driver: string; wild: boolean }) | undefined
  }
  mountains: { forEach(cb: (m: { name: string; since: number; pose: string }, id: string) => void): void }
}

export class Net {
  private room: Room | null = null
  private lastSeq = 0
  /** Fired for every terrain event, in order, exactly once (sync replay included). */
  onTerrain: (e: TerrainEvent, replay: boolean) => void = () => {}
  onChat: (m: ChatOut) => void = () => {}
  /** Fired once the join-time replay is done, with how many events it held. */
  onSynced: (events: number) => void = () => {}
  /** Fired after each state patch from the server. */
  onPatch: () => void = () => {}
  /** A Titan's driver heaved its shoulders (the Titan's slot id). */
  onShrug: (titan: string) => void = () => {}
  /** A Titan called out. */
  onCall: (c: CallOut) => void = () => {}

  get online(): boolean {
    return this.room !== null
  }

  get sessionId(): string {
    return this.room?.sessionId ?? ''
  }

  /** Server URL: `?server=` wins, else the page's host on the game port. */
  static defaultUrl(): string {
    const q = new URLSearchParams(location.search).get('server')
    if (q) return q
    const proto = location.protocol === 'https:' ? 'https' : 'http'
    return `${proto}://${location.hostname || 'localhost'}:${SERVER_PORT}`
  }

  async connect(url: string, options: JoinOptions, timeoutMs = 4000): Promise<boolean> {
    try {
      const client = new Client(url)
      const join = client.joinOrCreate(ROOM_NAME, options)
      const timeout = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))
      const room = await Promise.race([join, timeout])
      if (!room) return false
      this.room = room
      room.onMessage(MSG.sync, (m: SyncMsg) => {
        for (const e of m.events) this.accept(e, true)
        this.onSynced(m.events.length)
      })
      room.onMessage(MSG.terrain, (e: TerrainEvent) => this.accept(e, false))
      room.onMessage(MSG.chat, (m: ChatOut) => this.onChat(m))
      room.onMessage(MSG.shrug, (m: { titan: string }) => this.onShrug(m?.titan ?? 't1'))
      room.onMessage(MSG.call, (c: CallOut) => this.onCall(c))
      room.onStateChange(() => this.onPatch())
      room.onLeave(() => {
        this.room = null
      })
      return true
    } catch (err) {
      console.warn('[net] offline:', (err as Error).message)
      return false
    }
  }

  private accept(e: TerrainEvent, replay: boolean): void {
    if (e.seq <= this.lastSeq) return
    this.lastSeq = e.seq
    this.onTerrain(e, replay)
  }

  get state(): WorldStateView | null {
    return (this.room?.state as WorldStateView | undefined) ?? null
  }

  me(): RemotePlayer | undefined {
    return this.state?.players.get(this.sessionId)
  }

  sendMove(m: MoveMsg): void {
    this.room?.send(MSG.move, m)
  }

  sendTitan(m: TitanInputMsg): void {
    this.room?.send(MSG.titanInput, m)
  }

  sendRest(): void {
    this.room?.send(MSG.rest, {})
  }

  sendCall(): void {
    this.room?.send(MSG.call, {})
  }

  sendShrug(): void {
    this.room?.send(MSG.shrug, {})
  }

  requestRole(role: Role, titan?: string): void {
    this.room?.send(MSG.role, { role, ...(titan ? { titan } : {}) })
  }

  sendChat(text: string): void {
    this.room?.send(MSG.chat, { text })
  }
}
