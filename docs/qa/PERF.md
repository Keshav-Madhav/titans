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
- The opening's 83 ms frame comes at the title → waking hand-over (a camera cut and the hall's
  first frames); not yet traced.
