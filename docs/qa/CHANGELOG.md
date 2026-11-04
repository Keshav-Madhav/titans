# Changelog (QA loop)

Newest first. Each entry: what changed, why, how it was verified. Commit hashes in brackets.

## 2026-11-04 — cycle 6 (graphics and fidelity)

- **Ambient occlusion** (Q31): from the soft layers' depth — no second scene render; ~0.3 ms.
- **Broken boulders** (Q32): fractured shapes, three variants near (~5k triangles), a lighter one far.
- **Real grass blades** within 16 m (Q33): 30-blade tufts replace the flat cards near you; ~0.3–0.6 ms;
  ring 16/10/0 m by quality.
- **The wanderer's body** (Q34): shaped limbs, coat skirt halves that stride, coat sleeves.
- **The lean answers the change of speed** (Q30).
- Effect costs measured uncapped (no vsync), toggled in place: everything on 6.0–6.6 ms a frame.
- Next on the fidelity list (survey, cycle 6): tree trunks up close (thin, faceted); the lakes' hard
  white shoreline and flat water.

## 2026-11-04 — cycle 5

- **Feet stay where they land** (Q28): foot IK; planted slip walk 19% → 1%, run → 5%, sprint → 6% of body speed.
- **Stops take a few strides** (Q29): braking capped at 22 m/s² when you let go.
- **Far grass colour** (Q26, partial), **grip gauge** (Q27), **night cloak** (Q25).

- **You read at night** (Q25): the red cloak glows faintly in its own colour as it gets dark. Cycle-4 sweep: 51 passed.
- **Sunset clouds** (Q22), **new scenes** (grove, dusk, mire) — cycle 4, ef2faac.

## 2026-11-04 — cycle 3
- **Adversarial QA** (`tools/adversary.mjs`, in the sweep): reloads mid-waking, key mashing, page
  flipping, pause/resize mid-climb, focus loss, a fall with the line spammed. Found: the pages stacked
  (Q21) — now one page at a time.
- **Loading screen** (Q16): the key art instead of a bare gradient; the title placed clear of the
  giant at every screen shape. Full gate sweep on the cycle-3 build: 50 passed.
- **Terminology** (Q20): the one stray "First Ones" in player text replaced.

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
