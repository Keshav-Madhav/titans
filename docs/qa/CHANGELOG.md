# Changelog (QA loop)

Newest first. Each entry: what changed, why, how it was verified. Commit hashes in brackets.

## 2026-11-04 — cycle 3

- **Climbing camera** (Q14): further out on a giant (10 m) and a rock face (8 m); left alone, it
  tilts to look up along the body against the sky. A stronger tilt (−0.32) was tried and rejected —
  it put the wanderer off the bottom of the frame (evidence/c3-climb-*.jpg).

## 2026-11-04 — cycle 2

- **The first click no longer stalls 200 ms** [e4a6f2b]. `new AudioContext()` took 187 ms on the
  first gesture; it is now made at load and resumed by the gesture. 1% low 21 → 59.5 fps in the
  green and storm clips, no frame over 33 ms.
- **Shaders warmed for the soft scene and for hidden objects** [e4a6f2b]. No measurable gain alone
  (a wrong first guess for the stall, recorded in PERF.md); kept for the first rain.
- **clips.mjs measures from each scene's start and says when each long frame came** [e4a6f2b] —
  which is what found the stall.

## 2026-11-04 — cycle 1

- **QA tools** [b2c3733]: `tools/clips.mjs` (play with real input, record, measure, contact sheets);
  `tools/gemini-review.py` (a second opinion; key as a header, spend-capped, cached).
- **The cape no longer stands over the head in a gale** [b2c3733]: cloth capped 0.1 m over its pins
  unless falling or gliding.
- **Unknown weather names refused** [b2c3733]: `?weather=sandstorm` broke every frame.
- **Captions: no wall of words** [ff10071]: past ~300 characters the oldest fade early.
- **Captions wait behind open pages, clocks stopped** [fd6aeae].
- Before this log (same day, see CHECKLIST detail-bar audit): the crash card and save backup, comfort
  settings, rebinding and pad, recorded sounds, the swimmer's climb prompt, the wisp and the Mire,
  the found card behind pages, "Watching the Walker", the map arrow under colour blindness.
