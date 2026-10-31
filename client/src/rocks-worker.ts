// Meshes rock formations and colossi off the main thread (see ./rocks.ts, ./colossi.ts).

import { make, meshShape, type ShapeKind } from './rock-fields'

self.onmessage = (e: MessageEvent<{ id: number; kind: ShapeKind; seed: number; worldSeed: number; res?: number }>) => {
  const { id, kind, seed, worldSeed, res } = e.data
  const mesh = meshShape(make(kind, seed, worldSeed), res)
  ;(self as unknown as Worker).postMessage({ id, mesh }, [mesh.position.buffer, mesh.normal.buffer, mesh.ao.buffer, mesh.index.buffer])
}
