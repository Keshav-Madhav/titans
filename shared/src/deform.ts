// Terrain deformation kernels. Each takes an event's explicit parameters and
// writes into the delta field using only + − × ÷ — no trig, no exp — so
// every client and the server carve bit-identical craters from the same event.

import { type DeltaField } from './terrain'

/** A Titan footprint, as it travels over the network and into the log. */
export interface FootprintEvent {
  kind: 'footprint'
  x: number
  z: number
  /** Unit heading vector (forward = (hx, hz)); computed once by the authority. */
  hx: number
  hz: number
  len: number
  width: number
  depth: number
}

export interface Box {
  x0: number
  z0: number
  x1: number
  z1: number
}

const RIM_OUT = 2.4 // rim extends to q = RIM_OUT (q = 1 is the footprint outline)
const RIM_SHARE = 0.3 // rim height as a share of depth: displaced soil heaps at the edge

/**
 * Carve a foot-shaped depression with a raised rim. Heel narrower than the
 * toes; steep walls and a rounded floor, so rain makes a crisp-edged pool.
 * Returns the box of samples it touched.
 */
export function applyFootprint(delta: DeltaField, e: FootprintEvent): Box {
  const a = e.len / 2
  const b0 = e.width / 2
  // Bounding radius of the rim along the long axis.
  const reach = a * 1.62 + 2
  const x0 = Math.floor(e.x - reach)
  const x1 = Math.ceil(e.x + reach)
  const z0 = Math.floor(e.z - reach)
  const z1 = Math.ceil(e.z + reach)
  const rimH = e.depth * RIM_SHARE

  for (let iz = z0; iz <= z1; iz++) {
    for (let ix = x0; ix <= x1; ix++) {
      const px = ix - e.x
      const pz = iz - e.z
      const du = px * e.hx + pz * e.hz // along the foot
      const dv = px * e.hz - pz * e.hx // across it
      let along = du / a
      if (along < -1) along = -1
      else if (along > 1) along = 1
      const b = b0 * (0.8 + 0.3 * along) // heel narrow, toes wide
      const q = (du / a) * (du / a) + (dv / b) * (dv / b)
      let h: number
      if (q < 1) {
        // Steep walls, a broad flat floor: the reel's footprint pools.
        const q2 = q * q
        h = -e.depth * (1 - q2 * q2)
      } else if (q < RIM_OUT) {
        const s = (q - 1) / (RIM_OUT - 1)
        const r = 1 - s
        h = rimH * 6.75 * s * r * r // peaks (1.0) at s = 1/3
      } else {
        continue
      }
      delta.add(ix, iz, h)
    }
  }
  return { x0, z0, x1, z1 }
}

/** The round crater a footfall punches around the print. */
export interface ImpactEvent {
  kind: 'impact'
  x: number
  z: number
  radius: number
  depth: number
}

const EJECTA_OUT = 4 // ejecta apron reaches q = 4, i.e. twice the radius

/**
 * A shallow parabolic bowl with an ejecta rim. Works in squared distance, so
 * there is no sqrt either.
 */
export function applyImpact(delta: DeltaField, e: ImpactEvent): Box {
  const R2 = e.radius * e.radius
  const reach = e.radius * 2 + 1
  const x0 = Math.floor(e.x - reach)
  const x1 = Math.ceil(e.x + reach)
  const z0 = Math.floor(e.z - reach)
  const z1 = Math.ceil(e.z + reach)
  const rimH = e.depth * 0.45
  for (let iz = z0; iz <= z1; iz++) {
    for (let ix = x0; ix <= x1; ix++) {
      const dx = ix - e.x
      const dz = iz - e.z
      const q = (dx * dx + dz * dz) / R2
      if (q < 1) {
        delta.add(ix, iz, -e.depth * (1 - q))
      } else if (q < EJECTA_OUT) {
        const s = (q - 1) / (EJECTA_OUT - 1)
        const r = 1 - s
        delta.add(ix, iz, rimH * 6.75 * s * r * r)
      }
    }
  }
  return { x0, z0, x1, z1 }
}

/** The trench a dragging foot cuts between two points. */
export interface DragEvent {
  kind: 'drag'
  ax: number
  az: number
  bx: number
  bz: number
  width: number
  depth: number
}

const BANK_OUT = 3.2 // banks reach q = 3.2 beside the trench

/**
 * A capsule-shaped trench with heaped banks. The cut uses `lowerTo`, so the
 * overlapping ends of consecutive segments never dig twice, and it cuts
 * straight through older rims (that is what lets canals reach the lakes).
 * Banks only rise beside the segment, never at its end caps, and never fill
 * an existing hollow.
 */
export function applyDrag(delta: DeltaField, e: DragEvent): Box {
  const dx = e.bx - e.ax
  const dz = e.bz - e.az
  const len2 = dx * dx + dz * dz
  const hw = e.width / 2
  const w2 = hw * hw
  const reach = hw * 1.8 + 1
  const x0 = Math.floor(Math.min(e.ax, e.bx) - reach)
  const x1 = Math.ceil(Math.max(e.ax, e.bx) + reach)
  const z0 = Math.floor(Math.min(e.az, e.bz) - reach)
  const z1 = Math.ceil(Math.max(e.az, e.bz) + reach)
  const bankH = e.depth * 0.35
  for (let iz = z0; iz <= z1; iz++) {
    for (let ix = x0; ix <= x1; ix++) {
      const px = ix - e.ax
      const pz = iz - e.az
      let t = len2 > 0 ? (px * dx + pz * dz) / len2 : 0
      const inside = t > 0 && t < 1
      if (t < 0) t = 0
      else if (t > 1) t = 1
      const ox = px - dx * t
      const oz = pz - dz * t
      const q = (ox * ox + oz * oz) / w2
      if (q < 1) {
        const u = 1 - q
        delta.lowerTo(ix, iz, -e.depth * u * (2 - u))
      } else if (inside && q < BANK_OUT) {
        const s = (q - 1) / (BANK_OUT - 1)
        const r = 1 - s
        const bank = bankH * 6.75 * s * r * r
        const cur = delta.at(ix, iz)
        if (cur >= 0 && bank > cur) delta.set(ix, iz, bank)
      }
    }
  }
  return { x0, z0, x1, z1 }
}

/** Impact crater for a Titan of a given height. A stomp hits far harder. */
export function impactFor(height: number, x: number, z: number, stomp = false): ImpactEvent {
  const k = stomp ? 1.6 : 1
  return { kind: 'impact', x, z, radius: 0.13 * height * k, depth: 0.009 * height * (stomp ? 3 : 1) }
}

/** Drag trench for a Titan of a given height. */
export function dragFor(height: number, ax: number, az: number, bx: number, bz: number): DragEvent {
  return { kind: 'drag', ax, az, bx, bz, width: 0.075 * height, depth: 0.016 * height }
}

/** Footprint parameters for a Titan of a given height. */
export function footprintFor(height: number, x: number, z: number, hx: number, hz: number, stomp = false): FootprintEvent {
  return {
    kind: 'footprint',
    x,
    z,
    hx,
    hz,
    len: 0.2 * height,
    width: 0.105 * height,
    depth: 0.034 * height * (stomp ? 1.8 : 1),
  }
}

/** The hill that rises under a Titan that has gone dormant: it is becoming a mountain. */
export interface MountainEvent {
  kind: 'mountain'
  x: number
  z: number
  radius: number
  height: number
}

/** A smooth polynomial mound, (1 − q)² in squared distance — no sqrt, no trig. */
export function applyMountain(delta: DeltaField, e: MountainEvent): Box {
  const R2 = e.radius * e.radius
  const x0 = Math.floor(e.x - e.radius)
  const x1 = Math.ceil(e.x + e.radius)
  const z0 = Math.floor(e.z - e.radius)
  const z1 = Math.ceil(e.z + e.radius)
  for (let iz = z0; iz <= z1; iz++) {
    for (let ix = x0; ix <= x1; ix++) {
      const dx = ix - e.x
      const dz = iz - e.z
      const q = (dx * dx + dz * dz) / R2
      if (q >= 1) continue
      const u = 1 - q
      delta.add(ix, iz, e.height * u * u)
    }
  }
  return { x0, z0, x1, z1 }
}

export function mountainFor(height: number, x: number, z: number): MountainEvent {
  return { kind: 'mountain', x, z, radius: 0.6 * height, height: 0.1 * height }
}
