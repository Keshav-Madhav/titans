# Changelog (QA loop)

Newest first. Each entry: what changed, why, how it was verified. Commit hashes in brackets.

## 2026-11-04 — cycle 7 (one standard everywhere; the M5 Pro "struggling")

Fidelity (the user: "good rocks in a shitty-texture game is off too"):
- **Scanned stone** (CC0 photogrammetry, baked maps, two LODs) for boulders and pebbles [f885019, eba16e5].
- **Trees**: rounded trunks with root flares; no screen-door branches, none through cliffs [877d157, b8701bf].
- **Lakes**: a thin waterline, water kept inside its lake [f9875d8, fc4bef0].
- **Snow** reads as snow: wind-carved drifts, cold hollows, glitter [09e0adf].
- **Statues** (Q42–Q46, the user): no one-texture repeat; bone aged; sand not green; weathering
  from the ground up; rubble and fallen fragments of their own stone, ferns in it; carving worn
  [192798e … 852ac7d].
- **The cloak stays red against the sun** [8d431bd].
- **The horizon mountains get their ridgelines back** (Q48): the far ring was 256–512 m triangles [85b8227].

Performance (measured at a MacBook's real 1512×945 ×2, GPU timer queries):
- **Terrain blend unrolled** — arrays indexed by a variable spilled to memory on Apple GPUs: 10 → 4.5 ms;
  the governor reads GPU time, starts at ratio 1, caps at 1.5 [443e662, b027c5a].
- **View culling** of instanced near things [d4f05b2].
- **Near terrain no longer split into sub-pixel slivers**: −11% GPU, image unchanged [a93343f].
- **God rays** quarter size and skipped when the sun is out of frame: midday 1.56 → 0.41 ms [3618222].
- Paired-toggle breakdown of what remains (PERF.md, cycle 7c). Rejected, with evidence: a far terrain
  material, quarter-size bloom (visibly widened the glow).

Tools: `tools/guarded.sh` (browser runs only on a quiet machine) and a load monitor, after the
machine nearly went down twice [9e009d3, 36a31c4, fc4e0c9]; the bell gate aims exactly [4932194].

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
