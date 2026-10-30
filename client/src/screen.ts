// World → screen for DOM labels. "Is it in front of the camera?" is asked in
// view space: with a reversed depth buffer, a projected point BEHIND the
// camera can still land inside the NDC depth range, and labels for things
// behind you used to mirror into view.

import * as THREE from 'three'

const _v = new THREE.Vector3()

/** Writes CSS pixel coords into `out` (x, y); returns false if the point is behind the camera or off-screen. */
export function toScreen(world: THREE.Vector3, camera: THREE.Camera, out: { x: number; y: number }): boolean {
  _v.copy(world).applyMatrix4(camera.matrixWorldInverse)
  if (_v.z > -0.1) return false
  _v.copy(world).project(camera)
  if (_v.x < -1.2 || _v.x > 1.2 || _v.y < -1.2 || _v.y > 1.2) return false
  out.x = ((_v.x + 1) / 2) * innerWidth
  out.y = ((1 - _v.y) / 2) * innerHeight
  return true
}
