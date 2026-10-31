// Offerings (the roster: "a shrine that takes a trinket and gives back
// words"). Low stone shrines with a worn bowl, and above it a carving of one
// small thing — the picture is the puzzle: it is something you can find
// somewhere else. Bring it and hold it over the bowl (E): the shrine's carving
// lights, and it answers. (It takes nothing: it only wanted to see it.)

import * as THREE from 'three'
import type { Terrain } from '@titans/shared'
import { CATALOGUE } from './discovery'
import { drawIcon } from './bag'
import { carvedStone } from './spots'

export interface ShrineDef {
  /** What it answers with (a lore id). */
  id: string
  /** What it wants to see (a trinket id). */
  wants: string
  x: number
  z: number
}

export class Offerings {
  readonly group = new THREE.Group()
  readonly shrines: Array<{ def: ShrineDef; at: THREE.Vector3; glow: THREE.MeshBasicMaterial; answered: boolean }> = []

  constructor(defs: ShrineDef[], terrain: Terrain) {
    for (const def of defs) {
      const y = terrain.heightAt(def.x, def.z)
      const g = new THREE.Group()
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 1.2), carvedStone())
      base.position.y = 0.3
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.3, 0.22, 16, 1, true), carvedStone())
      bowl.position.y = 0.76
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.7, 0.3), carvedStone())
      back.position.set(0, 1.2, -0.5)
      // The carving: what it wants, drawn on the stone (dim until answered).
      const want = CATALOGUE.find((c) => c.id === def.wants)
      const tex = new THREE.CanvasTexture(drawIcon(want?.icon ?? 'stone', '#d8ccb0', 128))
      tex.colorSpace = THREE.SRGBColorSpace
      const glow = new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: new THREE.Color(0.5, 0.46, 0.4) })
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), glow)
      plaque.position.set(0, 1.35, -0.34)
      g.add(base, bowl, back, plaque)
      g.position.set(def.x, y, def.z)
      // Facing the land's centre.
      g.rotation.y = Math.atan2(-def.x, -def.z)
      g.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true
      })
      this.group.add(g)
      this.shrines.push({ def, at: new THREE.Vector3(def.x, y, def.z), glow, answered: false })
    }
  }

  near(p: THREE.Vector3): (typeof this.shrines)[number] | null {
    return this.shrines.find((s) => Math.hypot(s.at.x - p.x, s.at.z - p.z) < 2.6) ?? null
  }

  /** It has seen what it wanted: the carving lights. */
  answer(id: string): void {
    const s = this.shrines.find((s) => s.def.id === id)
    if (!s) return
    s.answered = true
    s.glow.color.setRGB(2.4, 2.0, 1.2)
  }
}
