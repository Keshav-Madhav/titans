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
        const t = 1 - q
        h = -e.depth * t * (2 - t)
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

/** Footprint parameters for a Titan of a given height. */
export function footprintFor(height: number, x: number, z: number, hx: number, hz: number): FootprintEvent {
  return {
    kind: 'footprint',
    x,
    z,
    hx,
    hz,
    len: 0.2 * height,
    width: 0.105 * height,
    depth: 0.034 * height,
  }
}
