// Room state: the continuous things every client renders.
import { schema, t, type SchemaType } from '@colyseus/schema'

export const Player = schema(
  {
    name: t.string(),
    color: t.string(),
    role: t.string(),
    x: t.float32(),
    y: t.float32(),
    z: t.float32(),
    yaw: t.float32(),
    // Climbing: which Titan part, which boulder, where on it (part-local). '' when not climbing.
    climb: t.string(),
    lump: t.uint8(),
    lx: t.float32(),
    ly: t.float32(),
    lz: t.float32(),
  },
  'Player',
)
export type Player = SchemaType<typeof Player>

/** The Titan's gait, field for field (shared TitanSnapshot), plus who drives it. */
export const TitanState = schema(
  {
    driver: t.string(),
    x: t.float64(),
    z: t.float64(),
    heading: t.float64(),
    speed: t.float32(),
    phase: t.float32(),
    swingFoot: t.uint8(),
    swinging: t.boolean(),
    steps: t.uint32(),
    p0x: t.float64(),
    p0z: t.float64(),
    p1x: t.float64(),
    p1z: t.float64(),
    fromX: t.float64(),
    fromZ: t.float64(),
    toX: t.float64(),
    toZ: t.float64(),
    plough: t.boolean(),
    swingStomp: t.boolean(),
  },
  'TitanState',
)
export type TitanState = SchemaType<typeof TitanState>

export const WorldState = schema(
  {
    players: t.map(Player),
    titan: TitanState,
    seq: t.uint32(),
  },
  'WorldState',
)
export type WorldState = SchemaType<typeof WorldState>
