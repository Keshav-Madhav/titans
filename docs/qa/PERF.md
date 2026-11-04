# Performance

Measured in headless Chrome on the Mac's GPU (ANGLE), 1280×720, production build, while scenes are
played (`tools/clips.mjs`): frame times from the game's own animation frames, the first 20% (the
load) dropped. **Headless reads ~2× slower than a real window on this machine** (it is the
compositor, not the game): compare runs with each other, and confirm absolutes on the deployed
build in a real browser.

## Baseline — cycle 1 (2026-11-04, commit b2c3733)

| Scene | fps avg | 1% low | p50 ms | p99 ms | worst ms | frames >33 ms | draw calls | triangles | JS heap MB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| opening (fresh profile → the hall) | 59.7 | 38.7 | 16.7 | 16.8 | 83.4 | 1 | 373 | 779,741 | 382 |
| green (run, jump, look round) | 59.6 | 36.8 | 16.7 | 16.8 | 66.7 | 1 | 358 | 880,053 | 382 |
| climb (the Walker) | 59.7 | 41.4 | 16.7 | 16.8 | 66.7 | 1 | 365 | 843,093 | 397 |
| grapple (High Places cliff) | 59.9 | 53.0 | 16.7 | 16.8 | 33.4 | 1 | 214 | 661,887 | 410 |
| storm (Dune Sea) | 59.1 | 25.2 | 16.7 | 16.8 | **200** | 1 | **520** | 1,098,147 | 435 |
| shore (beach, surf, swim) | 59.8 | 45.9 | 16.7 | 16.8 | 50.0 | 1 | 222 | 658,038 | 401 |

Read: every scene holds 60 at the median and the 99th percentile; each has **one** long frame,
which is what pulls the 1% low down. One long frame per scene is the shape of a one-time cost (a
first sight of something), not a steady load — see Q15 (the storm's 200 ms).

## Cycle 2 — the first-gesture stall (commit e4a6f2b)

**Finding.** Every scene had one long frame, and once `clips.mjs` reported *when*, they all fell
0.07–0.21 s after the scene's first key or click. Timed directly: the first keydown ran 198 ms of
listeners; the second, 0. Of the 198 ms, `new AudioContext()` was 187 ms (the browser opening the
audio device); building the reverb and beds 14 ms, everything else ~0. Every player pays it, on the
title's "click to wake".

**A wrong first guess, recorded.** Before that, the shader warm-up was suspected (the soft scene —
rain, cloud deck, mist — is a separate pass and was never compiled ahead). Warming it showed a
storm worst frame of 50 ms once — then 233 ms on a repeat, against 216 ms for the old build. One
run had been luck. The warm-up stays (it costs nothing at load and covers the first rain) but it was
not the cause.

**Fix.** The AudioContext is made at load, suspended, behind the loading screen; the first gesture
resumes it (16 ms).

| Scene (frames after the scene's start) | 1% low before → after | worst frame before → after | frames > 33 ms |
| --- | ---: | ---: | ---: |
| green | 21.0 → **59.5** fps | 200 → **16.8** ms | 2 → 0 |
| storm | 23.3 → **59.5** fps | 67 → **16.8** ms | 3 → 0 |

## Earlier measurements (before this log; from CHECKLIST / commits)

- Main thread over a 40 s run: median 3.3 ms, p99 4.7, max 9.7 — the game logic is not the limit.
- Draw calls: the Green 581 → 507, the Grove 480 → 456 (shadow stand-ins, merged crowns).
- Grove triangles 3.24 M → 2.41 M (far terrain on a 32×32 grid).
- Frame-rate independence (`tools/fps.mjs`): 30/60/144 Hz walk + run + jump end 0.07 m apart over
  42 m, the same jump apex — the fixed 1/60 step holds.

## Open

- The storm is the busiest view (~510 draw calls, 1.1 M triangles) — fine on this GPU (no long
  frames), unmeasured on a weak one.
- The opening's one long frame (83–167 ms) comes ~16 s after waking, stepping out into the
  daylight reveal. A CPU profile of that frame is mostly idle (44.6 of 83 ms): it is GPU-side (the
  land's resources used for the first time at the camera cut), not game code. Deferred (Q23).
- The 15 s and 60 s re-warms of shaders cost ~10 ms each (40 ms the first) on the main thread.

## Cycle 4 — new scenes

| Scene | 1% low | worst ms | > 33 ms | draw calls | triangles |
| --- | ---: | ---: | ---: | ---: | ---: |
| grove (walking among the giant trees) | 53.0 | 33.4 | 0 | 316 | 1,511,101 |
| dusk (sunset into night, walking) | 59.5 | 16.8 | 0 | 424 | 957,082 |
| mire at night | 59.5 | 16.8 | 0 | 236 | 889,385 |

## Cycle 6 — graphics and fidelity, measured uncapped

Uncapped (no vsync, no frame limit), 300 frames, same view, headless on this Mac:

| Scene | mean ms | p99 ms | draw calls | triangles |
| --- | ---: | ---: | ---: | ---: |
| green (AO, grass blades, scanned boulders and stones) | 5.78 | 10.1 | 492 | 1.90 M |
| grove (densest: giant trees, blades, scans) | 7.88 | 15.9 | 437 | 3.03 M |

Each effect toggled in place on the Green (cycle 6): AO ~0.3 ms, grass blades ~0.3–0.6 ms. The
scanned boulders added ~0.08 M triangles, the stones ~0.1 M. Everything stays well inside 16.7 ms;
the Grove's 3 M triangles is the number to watch (Medium detail drops the blade ring to 10 m, Low
drops blades and AO).

## Cycle 7 — where the frame goes, and culling

**Breakdown** (the Grove, quality pinned at High and full resolution, each part toggled off in
place, bracketed by baselines before and after): terrain **3.1 ms** of ~8; half resolution saves
**3.9 ms**; AO, bloom, rays, shadows, vegetation, grass and the soft layers each **0.0–0.25 ms**.
The game is limited by per-pixel work (fill), not by triangles — the first readings, before quality
was pinned, were void: the adaptive quality dropped to Low mid-test.

**Culling.** Near trees, scanned boulders, stones, reeds, ferns and stalks were drawn all round the
camera; now per instance against the view (re-culled after 0.5 m or ~2° of camera change, 3 m
margin for shadows); grass per 12 m cell (re-laid after a 7° turn). Triangles: Green 1.91 → 1.62–1.78 M,
Grove 3.22 → 2.70–2.75 M (same session, toggled), the High Places' foot 1.53 → 1.14 M. Frame time
did not move measurably — as the breakdown predicts; it frees headroom for detail rather than time.

**Terrain shader trims.** Cliff layers did 13 texture fetches each, always: now axes under 3% of the
blend are skipped, the small-scale look is not fetched past ~160 m (where it was 12% of the colour),
and no normal maps are fetched past 650 m (where they were faded out). Visually identical on the
cliff, Grove, Sentinel and Colonnade views. Its saving could not be measured cleanly: the user's own
builds held the machine at load 25–35 and even GPU timer queries wandered 12.7–16.3 ms between
baselines. To re-measure on a quiet machine with `qa/cycle6/gputime.mjs`.

**A false alarm, recorded.** A survey after these changes showed sky through the meadow and the land
above the camera; bisecting back to the committed build showed the same. It was the survey script:
a fixed 3.5 s wait after teleporting, before the terrain had streamed in. Scripts now wait for
`terrainView.settled()`.

## Cycle 7b — the user's M5 Pro "struggling": measured at a MacBook window

The earlier numbers were taken at 1280×720, pixel ratio 1 — a quarter of a MacBook Pro's pixels.
At 1512×945 CSS, ratio 2 (GPU time per frame from timer queries, interleaved toggles, quiet machine):

| | before | after |
| --- | ---: | ---: |
| Green, ratio 2 (the governor could climb there) | 58 ms | never used now (cap 1.5) |
| Green, ratio 1.5 | 22.4 ms | **18.1 ms** |
| Green, ratio 1 (the new start) | 15 ms | ~12 ms |

- **The terrain was 10 ms of 22**, and it was not triangles (cut 5×: no change), shadows (none
  cast; receiving 1 ms) or texture fetches (trimming them: ~1 ms). It was the 8-layer blend written
  as loops over arrays indexed by a variable — on Apple GPUs (through ANGLE/Metal) such arrays live
  in memory, per pixel. Written out per layer with constant indices: **terrain ~10 → ~4.5 ms**, the
  image unchanged. This, not lowering quality, was the waste.
- **The governor could not see the GPU**: it held ratio 1.5 at 23 ms of GPU work while reading 60
  fps, and could climb to 2. It now reads GPU time (EXT_disjoint_timer_query) and steers by the
  larger of that and the frame interval; it starts at ratio 1 and may rise to 1.5.
- Dead ends, recorded: a cheaper far-terrain material (no change: far chunks cover little screen);
  per-pass timer queries (all read ~0 on this driver — only whole-frame queries work).

## Cycle 7c — where the rest of the frame goes (paired toggles)

Interleaved timing was swamped by other apps' GPU use (baselines drifted 19–48 ms between runs).
The probe now toggles each part against its own baseline, 8 alternations of ~25 frames each, and
keeps only fresh GPU readings (`qa/cycle7/pairs.mjs`). Headless at 1512×945, ratio 1.5; absolute
numbers read ~2.5× slow, differences hold:

| part | cost (headless ms) |
| --- | ---: |
| terrain (all of it) | 12.6 |
| — of which the layered ground shader (vs a plain standard material) | 5.4 |
| bloom | 3.7 |
| AO | 2.6 |
| clouds | 2.3 |
| grass | 1.9 |
| god rays | 1.6 |
| vegetation | 1.4 |
| soft layers | 1.1 |
| rocks, statues and their rubble | 0.2 |

- **Terrain density, now that the shader is cheap, does cost.** At 1.76M terrain triangles the
  far ground, seen at a low angle, was splitting into slivers a pixel or two tall: the GPU shades
  2×2 pixel quads, so slivers are shaded several times over. (In cycle 7b, a 5× cut showed nothing,
  because the array-spilling shader hid it.) Split distance 1.35 → 1.0 × chunk size: 1.29M
  triangles, **49.3 → 43.9 ms headless (−11%)**. Same frame toggled in one session: 1.9% of pixels
  differ, against 2.8% between two shots of the *same* setting (drifting cloud, the wanderer
  breathing). The difference cannot be seen; the ground's small relief is in its normal maps.
- Draw order: terrain last instead of front-to-back sorted: +2 ms. Kept sorted.
- **God rays**: drawn at a quarter of the screen instead of half, and not drawn at all while the
  sun is out of frame (they were: 56 taps a pixel that each returned black). Midday 1.56 → 0.41 ms;
  facing a low sun −3.2 ms headless. Same frame, clock frozen, A/B/A: rays at quarter differ from
  stock by 3.8 (mean |Δ|), below two stock shots' own 3.9–4.6 — unseen.
- **Rejected: bloom from a quarter of the screen** (−0.4 to −1.1 ms headless). Its blur widths are
  in pixels per level, so every level spread twice as far: mean |Δ| 10.8 against the 4 noise floor,
  a wider milky veil toward a low sun. Kept stock. (A first comparison had been confounded by the
  dawn haze changing between shots: compare with the clock frozen, A/B/A, always.)
- **The far mountains given back their triangles** (Q48), for free: chunks of 2 km and up split at
  3× their size instead of 1×. +0.6M triangles in the Green; GPU median 52.5 → 46.0 ms (k 1 → 2.5,
  i.e. noise — not slower) in the Green, 23.0 → 22.5 on the High Ice, 41.7 → 41.9 in the Dune Sea.
  Far chunks cover a thin strip of screen with large triangles: no slivers, so no quad waste. The
  waste was in the *near* terrain's foreshortened slivers (above), not in the triangle count.
