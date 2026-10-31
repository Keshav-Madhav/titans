// Climbing rock: at a wall too steep to walk up, E takes hold and you climb
// the land itself, as you climb a giant — W/S up and down the wall, A/D
// across it, your grip tiring as you go. Where the rock lays back enough to
// stand on, you are up. If your grip gives out, you fall.

import * as THREE from 'three'
import type { Terrain } from '@titans/shared'
import { MAX_SLOPE } from './wanderer'

const SPEED = 1.6 // metres a second along the rock
const DRAIN_HOLD = 0.012 // per second, hanging still
const DRAIN_MOVE = 0.03 // per second, climbing
const REGEN = 0.25 // per second, on your feet
/** Gentler than this, you are standing again (rise over run). */
const TOP = 0.85

export class CliffClimb {
  active = false
  stamina = 1
  moving = false
  readonly world = new THREE.Vector3()
  readonly normal = new THREE.Vector3(0, 1, 0)
  private gx = 0
  private gz = 0

  /** The first rock too steep to walk, just ahead of `pos` facing `yaw` (null if none). */
  wallAhead(pos: THREE.Vector3, yaw: number, terrain: Terrain): { x: number; z: number } | null {
    for (const d of [0.3, 0.8, 1.4, 2.0]) {
      const x = pos.x + Math.sin(yaw) * d
      const z = pos.z + Math.cos(yaw) * d
      if (this.slope(x, z, terrain) > MAX_SLOPE * 0.9 && terrain.heightAt(x, z) > pos.y + 0.3) return { x, z }
    }
    return null
  }

  /** Take hold of the rock at (x, z). */
  start(x: number, z: number, terrain: Terrain): void {
    this.active = true
    this.world.set(x, terrain.heightAt(x, z), z)
    this.slope(x, z, terrain)
  }

  /**
   * One step. `move.y` climbs up the wall, `move.x` goes across it (right as
   * the camera sees it). Returns 'climbing', 'top' (standing again) or 'fell'.
   */
  step(dt: number, move: { x: number; y: number }, camYaw: number, terrain: Terrain): 'climbing' | 'top' | 'fell' {
    const s = this.slope(this.world.x, this.world.z, terrain)
    // Up the wall (horizontal direction of steepest ascent) and across it.
    const ux = this.gx / (s || 1)
    const uz = this.gz / (s || 1)
    // Across: perpendicular to up-the-wall, toward the camera's right
    // (the camera looks along (-sin yaw, -cos yaw), so its right is (cos yaw, -sin yaw)).
    let ax = -uz
    let az = ux
    if (ax * Math.cos(camYaw) - az * Math.sin(camYaw) < 0) {
      ax = -ax
      az = -az
    }
    // A metre up a slope of s covers 1/√(1+s²) of ground; a metre across covers a metre.
    this.moving = move.x !== 0 || move.y !== 0
    const both = move.x !== 0 && move.y !== 0 ? Math.SQRT1_2 : 1
    const step = SPEED * dt * both
    const up = move.y / Math.sqrt(1 + s * s)
    const nx = this.world.x + (ux * up + ax * move.x) * step
    const nz = this.world.z + (uz * up + az * move.x) * step
    this.world.set(nx, terrain.heightAt(nx, nz), nz)
    this.stamina = Math.max(0, this.stamina - (this.moving ? DRAIN_MOVE : DRAIN_HOLD) * dt)
    const now = this.slope(nx, nz, terrain)
    if (now < TOP) {
      this.active = false
      return 'top'
    }
    if (this.stamina <= 0) {
      this.active = false
      return 'fell'
    }
    return 'climbing'
  }

  /** On your feet: the grip comes back. */
  rest(dt: number): void {
    this.stamina = Math.min(1, this.stamina + REGEN * dt)
  }

  /** Slope (rise over run) at (x, z); also sets the gradient and the surface normal. */
  private slope(x: number, z: number, terrain: Terrain): number {
    this.gx = terrain.heightAt(x + 0.5, z) - terrain.heightAt(x - 0.5, z)
    this.gz = terrain.heightAt(x, z + 0.5) - terrain.heightAt(x, z - 0.5)
    this.normal.set(-this.gx, 1, -this.gz).normalize()
    return Math.hypot(this.gx, this.gz)
  }
}
