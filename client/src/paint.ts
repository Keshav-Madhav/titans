// Painted ground: dirt roads, village squares, fields. A sparse 1 m grid of
// tiles (only where something is painted) that the terrain reads when it
// colours itself; painting marks the touched chunks for rebuild.

const TILE = 64

export class PaintField {
  private readonly tiles = new Map<number, Uint8Array>()
  /** Called with the painted box, so the terrain can rebuild those chunks. */
  onPaint: (x0: number, z0: number, x1: number, z1: number) => void = () => {}

  private static key(tx: number, tz: number): number {
    return (tx + 32768) * 65536 + (tz + 32768)
  }

  /** 0 … 1 at integer cell (x, z). */
  at(x: number, z: number): number {
    const ix = Math.round(x)
    const iz = Math.round(z)
    const tx = Math.floor(ix / TILE)
    const tz = Math.floor(iz / TILE)
    const t = this.tiles.get(PaintField.key(tx, tz))
    return t ? t[(iz - tz * TILE) * TILE + (ix - tx * TILE)] / 255 : 0
  }

  private put(ix: number, iz: number, v: number): void {
    const tx = Math.floor(ix / TILE)
    const tz = Math.floor(iz / TILE)
    const k = PaintField.key(tx, tz)
    let t = this.tiles.get(k)
    if (!t) {
      t = new Uint8Array(TILE * TILE)
      this.tiles.set(k, t)
    }
    const i = (iz - tz * TILE) * TILE + (ix - tx * TILE)
    t[i] = Math.max(t[i], Math.round(v * 255))
  }

  /** A road from a to b, `width` metres wide, soft-edged. */
  line(ax: number, az: number, bx: number, bz: number, width: number, strength = 1): void {
    const dx = bx - ax
    const dz = bz - az
    const len2 = dx * dx + dz * dz || 1
    const hw = width / 2
    const x0 = Math.floor(Math.min(ax, bx) - hw - 1)
    const x1 = Math.ceil(Math.max(ax, bx) + hw + 1)
    const z0 = Math.floor(Math.min(az, bz) - hw - 1)
    const z1 = Math.ceil(Math.max(az, bz) + hw + 1)
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2))
        const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t))
        if (d < hw + 1) this.put(x, z, strength * Math.min(1, hw + 1 - d))
      }
    }
    this.onPaint(x0, z0, x1, z1)
  }

  /** A round patch (a square, a threshing floor). */
  disc(x: number, z: number, r: number, strength = 1): void {
    this.line(x, z, x, z, r * 2, strength)
  }
}
