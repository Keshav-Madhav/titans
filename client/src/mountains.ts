// Sleeping giants. A giant that rests long enough falls asleep, and its body
// becomes a mountain where it sat: mossier, half-buried in the hill that rose
// under it. They can be climbed like the waking giants.

import * as THREE from 'three'
import { TITAN_HEIGHT, type MountainInfo, type Terrain } from '@titans/shared'
import { Titan } from './titan'
import type { ClimbTarget } from './climb'

interface Entry {
  titan: Titan
  info: MountainInfo
}

export class Mountains {
  readonly group = new THREE.Group()
  private readonly list = new Map<string, Entry>()

  add(id: string, info: MountainInfo): void {
    const p = info.pose
    const titan = new Titan(TITAN_HEIGHT, p.x, p.z, p.heading, 7, 1)
    // Mountains stand, as in the reel: a giant turned to stone mid-stride.
    titan.gait.restore({ ...p, resting: false, swinging: false })
    titan.restBlend = 0
    this.list.set(id, { titan, info })
    this.group.add(titan.group)
  }

  /** Pose on today's ground (the hill under them rises after they sleep). */
  update(terrain: Terrain, camera: THREE.Camera): void {
    for (const e of this.list.values()) {
      e.titan.pose(terrain, 0)
      e.titan.group.updateMatrixWorld(true)
      e.titan.setLodFor(camera.position)
    }
  }

  /** Everything needed to bring them back (single-player save). */
  infos(): Record<string, MountainInfo> {
    return Object.fromEntries([...this.list].map(([id, e]) => [id, e.info]))
  }

  get(id: string): Titan | undefined {
    return this.list.get(id)?.titan
  }

  targets(): ClimbTarget[] {
    return [...this.list].map(([id, e]) => ({ id, titan: e.titan }))
  }

  get count(): number {
    return this.list.size
  }
}
