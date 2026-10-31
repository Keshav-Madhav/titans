// Meshes rock formations off the main thread (see ./rocks.ts).

import { make, meshShape, type FormationKind } from './rock-fields'

self.onmessage = (e: MessageEvent<{ id: number; kind: FormationKind; seed: number; worldSeed: number }>) => {
  const { id, kind, seed, worldSeed } = e.data
  const mesh = meshShape(make(kind, seed, worldSeed))
  ;(self as unknown as Worker).postMessage({ id, mesh }, [mesh.position.buffer, mesh.normal.buffer, mesh.ao.buffer, mesh.index.buffer])
}
