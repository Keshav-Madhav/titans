// After a frame gone NaN (the user's black screen, 2026-11-07, Zen/Firefox): an eased value that once
// takes a NaN keeps it for ever (x += (target − x)·k stays NaN). This puts every number, vector and
// colour an object keeps back to something finite, so the next frame computes them afresh.

import * as THREE from 'three'

export function scrubNaN(obj: object, depth = 1): number {
  let fixed = 0
  const self = obj as Record<string, unknown>
  for (const k of Object.keys(self)) {
    const v = self[k]
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) {
        self[k] = 0
        fixed++
      }
    } else if (v instanceof THREE.Vector3 || v instanceof THREE.Vector2) {
      if (!Number.isFinite((v as THREE.Vector3).x + (v as THREE.Vector3).y + ((v as THREE.Vector3).z ?? 0))) {
        v.setScalar(0)
        fixed++
      }
    } else if (v instanceof THREE.Color) {
      if (!Number.isFinite(v.r + v.g + v.b)) {
        v.setRGB(0.6, 0.64, 0.7)
        fixed++
      }
    } else if (depth > 0 && v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof THREE.Object3D) && !(v instanceof THREE.Material) && !(v instanceof THREE.Texture)) {
      fixed += scrubNaN(v, depth - 1)
    }
  }
  return fixed
}
