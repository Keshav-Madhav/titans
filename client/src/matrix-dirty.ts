import * as THREE from 'three'

/**
 * Dirty-checked local matrices. three recomposes every object's matrix from its position, rotation
 * and scale every frame, and so marks its world matrix stale, and so every child's — 3,000-odd
 * objects, most of which never move, walked on every scene render. Here an object recomposes only
 * when one of those ten numbers changed, so a still subtree costs a few compares and no matrix
 * products. (Objects that set `matrix` by hand already turn matrixAutoUpdate off; three's own
 * `applyMatrix4` writes position/quaternion/scale, so it is seen.) An object given a new parent is
 * marked stale, since its own numbers did not change but its world did.
 */
const proto = THREE.Object3D.prototype as THREE.Object3D & { _trs?: Float64Array }
proto.updateMatrix = function (this: THREE.Object3D & { _trs?: Float64Array }): void {
  const p = this.position, q = this.quaternion, s = this.scale
  let c = this._trs
  if (c === undefined) c = this._trs = new Float64Array(10).fill(NaN)
  if (c[0] === p.x && c[1] === p.y && c[2] === p.z && c[3] === q.x && c[4] === q.y && c[5] === q.z && c[6] === q.w && c[7] === s.x && c[8] === s.y && c[9] === s.z) return
  c[0] = p.x; c[1] = p.y; c[2] = p.z; c[3] = q.x; c[4] = q.y; c[5] = q.z; c[6] = q.w; c[7] = s.x; c[8] = s.y; c[9] = s.z
  this.matrix.compose(p, q, s)
  this.matrixWorldNeedsUpdate = true
}
const add = proto.add
proto.add = function (this: THREE.Object3D, ...objects: THREE.Object3D[]) {
  for (const o of objects) o.matrixWorldNeedsUpdate = true
  return add.apply(this, objects)
}
