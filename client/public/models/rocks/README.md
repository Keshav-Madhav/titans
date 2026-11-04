# Scanned boulders

CC0 (public domain) photogrammetry scans from [Poly Haven](https://polyhaven.com), by Rico Cilliers
(the Namaqualand collection), downloaded 2026-11-04 at 1K textures:

| File | Poly Haven asset | Source triangles | Near | Far |
| --- | --- | ---: | ---: | ---: |
| namaqualand_boulder_02-{near,far}.glb | namaqualand_boulder_02 | 183,681 | 3,998 | 599 |
| namaqualand_boulder_03-{near,far}.glb | namaqualand_boulder_03 | 121,546 | 4,000 | 600 |
| namaqualand_boulder_05-{near,far}.glb | namaqualand_boulder_05 | 117,622 | 4,000 | 600 |

| rock_09-near.glb | rock_09 (by Jenelle van Heerden) | 23,280 | 150 | — |

The small stones in the grass are `rock_09`, one level only (`NEAR=150 FAR=0`).

`tools/build-rocks.mjs` makes them: welded, centred, scaled so the widest half-extent is 1, base set
just under the ground line, simplified with meshoptimizer. The near file keeps the scan's colour,
normal (OpenGL) and AO/roughness/metal maps — the fine relief rides in the normal map baked from the
full scan, not in triangles; the far file is geometry only (it uses the near file's material).
(`boulder_01` was tried and dropped: it would not simplify below 54k triangles.)
