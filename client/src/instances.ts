// Instance buffers to the GPU, just the part in use.

import type * as THREE from 'three'

/**
 * Send a mesh's first n instances to the GPU, not its whole capacity: a bare needsUpdate re-sends
 * every buffer at full size, ~34 MB of matrices and colours across the kinds, and each repack or
 * cull froze the frame for 230-300 ms (the p95 frames everywhere, 2026-11-18).
 */
export function sendInstances(mesh: THREE.InstancedMesh, n: number): void {
  const m = mesh.instanceMatrix
  m.clearUpdateRanges()
  m.addUpdateRange(0, n * 16)
  m.needsUpdate = true
  const c = mesh.instanceColor
  if (c) {
    c.clearUpdateRanges()
    c.addUpdateRange(0, n * 3)
    c.needsUpdate = true
  }
}
