// The Web (the user: "things should generally be huge"): in the Undercroft, between two pillars, from
// the capitals nearly to the floor — an orb web forty metres across, threads as thick as a finger.
// Old: whole sectors hang torn, dust lies along the strands. Nothing has mended it in a long time, and
// nothing is in it now. A shaft of daylight from the skylight beside it catches the near threads.
//
// Its own model, built for the scale: radial spokes out to a frame of bridge threads tied to the
// pillars' faces and the capital above, a capture spiral that sags a little between spokes, gaps and
// torn sectors, one guy line down to the floor. Drawn as lines (always a pixel wide, so it reads from
// across the hall) plus a scatter of dust beads along the threads that catch the light.

import * as THREE from 'three'
import { mulberry32 } from '@titans/shared'

/** Where a ray from the hub at angle `a` meets the frame polygon (the frame's corners, in order). */
function rimAt(frame: Array<[number, number]>, a: number): number {
  const dx = Math.cos(a)
  const dy = Math.sin(a)
  let best = Infinity
  for (let i = 0; i < frame.length; i++) {
    const [x0, y0] = frame[i]
    const [x1, y1] = frame[(i + 1) % frame.length]
    const ex = x1 - x0
    const ey = y1 - y0
    const den = dx * ey - dy * ex
    if (Math.abs(den) < 1e-9) continue
    const t = (x0 * ey - y0 * ex) / den
    const u = (x0 * dy - y0 * dx) / den
    if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t)
  }
  return best
}

export interface WebSpec {
  /** The frame's corners round the hub (local x across, y up), metres. */
  frame: Array<[number, number]>
  /** A guy line from this frame point down this far (to the floor). */
  guy?: { at: [number, number]; down: number }
  seed: number
}

/** The web's threads (as line segments) and its dust beads, in its own plane (z = 0). */
export function webGeometry(spec: WebSpec): { lines: THREE.BufferGeometry; beads: THREE.BufferGeometry } {
  const rand = mulberry32(spec.seed)
  const seg: number[] = []
  const bead: number[] = []
  // (Not flat: the whole web bows a little out of its plane, most at the hub — a drawn-flat web read
  // as a diagram, first look.)
  const R0 = Math.max(...spec.frame.map(([x, y]) => Math.hypot(x, y)))
  const bow = (x: number, y: number) => 0.9 * Math.max(0, 1 - Math.hypot(x, y) / R0) ** 1.5
  const line = (x0: number, y0: number, x1: number, y1: number, sag = 0) => {
    // (A thread sags: the middle drawn down a little, in two halves.)
    if (sag > 0) {
      const mx = (x0 + x1) / 2
      const my = (y0 + y1) / 2 - sag
      seg.push(x0, y0, bow(x0, y0), mx, my, bow(mx, my), mx, my, bow(mx, my), x1, y1, bow(x1, y1))
    } else seg.push(x0, y0, bow(x0, y0), x1, y1, bow(x1, y1))
    // Dust along it, here and there.
    const len = Math.hypot(x1 - x0, y1 - y0)
    for (let s = rand() * 0.9; s < len; s += 0.5 + rand() * 1.4) {
      if (rand() < 0.55) continue
      const t = s / len
      const bx = x0 + (x1 - x0) * t
      const by = y0 + (y1 - y0) * t - sag * 4 * t * (1 - t)
      bead.push(bx, by, bow(bx, by) + (rand() - 0.5) * 0.04)
    }
  }
  const F = spec.frame
  // The frame: bridge threads round the outside, doubled here and there.
  for (let i = 0; i < F.length; i++) {
    const [x0, y0] = F[i]
    const [x1, y1] = F[(i + 1) % F.length]
    line(x0, y0, x1, y1, Math.hypot(x1 - x0, y1 - y0) * 0.012)
    if (rand() < 0.5) line(x0, y0 + 0.3, x1, y1 + 0.25, Math.hypot(x1 - x0, y1 - y0) * 0.015)
  }
  if (spec.guy) line(spec.guy.at[0], spec.guy.at[1], spec.guy.at[0] + 1.2, spec.guy.at[1] - spec.guy.down)
  // The torn sectors: three wedges where most of the capture spiral has gone.
  const torn = [rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2]
  const isTorn = (a: number, r: number) => torn.some((t, k) => Math.abs(Math.atan2(Math.sin(a - t), Math.cos(a - t))) < 0.3 + 0.12 * k && r > 4 + 3 * k)
  // The spokes: from the hub out to the frame, unevenly spaced.
  const N = 30
  const ang: number[] = []
  for (let i = 0; i < N; i++) ang.push(((i + (rand() - 0.5) * 0.45) / N) * Math.PI * 2)
  const rim = ang.map((a) => rimAt(F, a))
  for (let i = 0; i < N; i++) {
    // (A few spokes snapped: they end partway, a loose end hanging.)
    const end = isTorn(ang[i], rim[i]) && rand() < 0.6 ? rim[i] * (0.35 + rand() * 0.3) : rim[i]
    const ex = Math.cos(ang[i]) * end
    const ey = Math.sin(ang[i]) * end
    line(0, 0, ex, ey)
    if (end < rim[i]) line(ex, ey, ex + (rand() - 0.5) * 0.8, ey - 2 - rand() * 3)
  }
  // The hub: a close mesh of short rings.
  for (let k = 1; k <= 5; k++) {
    const r = 0.35 * k
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N
      line(Math.cos(ang[i]) * r, Math.sin(ang[i]) * r, Math.cos(ang[j]) * r, Math.sin(ang[j]) * r)
    }
  }
  // The capture spiral, ring after ring outward, wider spaced toward the rim; a ring stops short of
  // the frame (the free zone), and threads go missing: few near the hub, many in the torn wedges.
  let r = 3
  while (true) {
    let any = false
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N
      const ri = r + (i / N) * 0.6
      const rj = r + (j === 0 ? 0.6 : (j / N) * 0.6)
      if (ri > rim[i] * 0.9 || rj > rim[j] * 0.9) continue
      any = true
      const mid = (ang[i] + ang[j] + (j === 0 ? Math.PI * 2 : 0)) / 2
      if (isTorn(mid, ri) ? rand() < 0.92 : rand() < 0.1) continue
      // (Each crossing a little off: a spiral laid by hand, not by compass.)
      const wi = ri * (1 + (rand() - 0.5) * 0.05)
      const wj = rj * (1 + (rand() - 0.5) * 0.05)
      const x0 = Math.cos(ang[i]) * wi
      const y0 = Math.sin(ang[i]) * wi
      const x1 = Math.cos(ang[j]) * wj
      const y1 = Math.sin(ang[j]) * wj
      line(x0, y0, x1, y1, Math.hypot(x1 - x0, y1 - y0) * 0.06)
    }
    if (!any) break
    r += (0.6 + r * 0.025) * (0.8 + rand() * 0.45)
  }
  // Loose ends in the torn wedges: broken threads hanging down from the spokes.
  for (const t of torn) {
    for (let k = 0; k < 7; k++) {
      const a = t + (rand() - 0.5) * 0.8
      const rr = 7 + rand() * 10
      const x = Math.cos(a) * rr
      const y = Math.sin(a) * rr
      if (rr > rimAt(F, a) * 0.9) continue
      line(x, y, x + (rand() - 0.5) * 0.6, y - 1.5 - rand() * 3.5)
    }
  }
  const lines = new THREE.BufferGeometry()
  lines.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3))
  const beads = new THREE.BufferGeometry()
  beads.setAttribute('position', new THREE.Float32BufferAttribute(bead, 3))
  return { lines, beads }
}

/** The web as drawn: grey-silver threads and dust beads (dim: it hangs in the dark). */
export function webObject(spec: WebSpec): THREE.Group {
  const { lines, beads } = webGeometry(spec)
  const g = new THREE.Group()
  const thread = new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: 0x7d8288, transparent: true, opacity: 0.36, depthWrite: false }))
  const dust = new THREE.Points(beads, new THREE.PointsMaterial({ color: 0xa9abae, size: 0.06, transparent: true, opacity: 0.7, depthWrite: false }))
  thread.renderOrder = dust.renderOrder = 3
  g.add(thread, dust)
  return g
}
