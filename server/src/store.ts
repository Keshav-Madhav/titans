// The world's memory, in SQLite (node:sqlite — built in, free, zero-ops).
// Postgres-compatible shapes (PLAN.md §7) so moving later is a driver swap.
//
// Terrain events are appended every tick inside a transaction, so a crash
// loses nothing that clients saw. The Titan is saved every couple of seconds
// and on shutdown; players are saved when they leave.

import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createHash } from 'node:crypto'
import type { MountainInfo, TerrainEvent, TitanSnapshot } from '@titans/shared'

export interface SavedPlayer {
  x: number
  y: number
  z: number
}

/** 512 m region cell of an event, for future streaming and compaction. */
function regionOf(e: TerrainEvent): string {
  const x = e.type === 'drag' ? e.bx : e.x
  const z = e.type === 'drag' ? e.bz : e.z
  return `${Math.floor(x / 512)},${Math.floor(z / 512)}`
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export class WorldStore {
  private readonly db: DatabaseSync
  private readonly insertEvent: StatementSync
  private readonly upsertTitan: StatementSync
  private readonly upsertPlayer: StatementSync
  private readonly selectPlayer: StatementSync

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS terrain_events (
        seq        INTEGER PRIMARY KEY,
        region     TEXT    NOT NULL,
        kind       TEXT    NOT NULL,
        params     TEXT    NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS terrain_events_region ON terrain_events(region);
      CREATE TABLE IF NOT EXISTS titans (
        id         INTEGER PRIMARY KEY,
        state      TEXT    NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS mountains (
        id    TEXT    PRIMARY KEY,
        name  TEXT    NOT NULL,
        state TEXT    NOT NULL,
        since INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS players (
        token_hash TEXT PRIMARY KEY,
        name       TEXT    NOT NULL,
        color      TEXT    NOT NULL,
        x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL,
        created_at INTEGER NOT NULL,
        last_seen  INTEGER NOT NULL
      );
    `)
    this.insertEvent = this.db.prepare('INSERT INTO terrain_events (seq, region, kind, params, created_at) VALUES (?, ?, ?, ?, ?)')
    this.upsertTitan = this.db.prepare(
      'INSERT INTO titans (id, state, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at',
    )
    this.upsertPlayer = this.db.prepare(
      `INSERT INTO players (token_hash, name, color, x, y, z, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(token_hash) DO UPDATE SET name = excluded.name, color = excluded.color,
         x = excluded.x, y = excluded.y, z = excluded.z, last_seen = excluded.last_seen`,
    )
    this.selectPlayer = this.db.prepare('SELECT x, y, z FROM players WHERE token_hash = ?')
  }

  loadEvents(): TerrainEvent[] {
    const rows = this.db.prepare('SELECT params FROM terrain_events ORDER BY seq').all() as Array<{ params: string }>
    return rows.map((r) => JSON.parse(r.params) as TerrainEvent)
  }

  appendEvents(events: readonly TerrainEvent[]): void {
    if (events.length === 0) return
    const now = Date.now()
    this.db.exec('BEGIN')
    try {
      for (const e of events) this.insertEvent.run(e.seq, regionOf(e), e.type, JSON.stringify(e), now)
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  loadTitan(id: number): TitanSnapshot | null {
    const row = this.db.prepare('SELECT state FROM titans WHERE id = ?').get(id) as { state: string } | undefined
    return row ? (JSON.parse(row.state) as TitanSnapshot) : null
  }

  saveTitan(id: number, s: TitanSnapshot): void {
    this.upsertTitan.run(id, JSON.stringify(s), Date.now())
  }

  loadMountains(): Array<{ id: string; info: MountainInfo }> {
    const rows = this.db.prepare('SELECT id, state FROM mountains ORDER BY since').all() as Array<{ id: string; state: string }>
    return rows.map((r) => ({ id: r.id, info: JSON.parse(r.state) as MountainInfo }))
  }

  saveMountain(id: string, info: MountainInfo): void {
    this.db.prepare('INSERT OR REPLACE INTO mountains (id, name, state, since) VALUES (?, ?, ?, ?)').run(id, info.name, JSON.stringify(info), info.since)
  }

  loadPlayer(tokenHash: string): SavedPlayer | null {
    return (this.selectPlayer.get(tokenHash) as SavedPlayer | undefined) ?? null
  }

  savePlayer(tokenHash: string, name: string, color: string, p: SavedPlayer): void {
    const now = Date.now()
    this.upsertPlayer.run(tokenHash, name, color, p.x, p.y, p.z, now, now)
  }

  close(): void {
    this.db.close()
  }
}
