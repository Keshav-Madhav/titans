# Quality assessment (living — updated each cycle)

*As of cycle 7, 2026-11-04.*

## Where it stands

TITANS reads as a game with a point of view: a small figure, very large slow things, weather and
light doing the work. Since the QA loop began (cycles 1–6):

- **It holds up when played.** The first hour plays through from a fresh profile without getting
  stuck. Nine scenes (opening, Green, climb, grapple, storm, Shore, Grove, dusk, Mire at night)
  hold 60 fps at the median; after the first-gesture fix, eight of them have no frame over 33 ms.
- **It holds up when abused.** Reloads mid-waking, key mashing, page flipping, pause/resize
  mid-climb, focus loss: nothing throws, the wanderer is always somewhere sane, and one page opens
  at a time (Q21). A broken frame shows a card and keeps the save; a damaged save falls back.
- **The first impression improved.** The loading screen is now the key art (Q16); the first click
  no longer stalls (Q15); the climb shows the giant (Q14); captions do not pile up (Q8, Q9).

- **It moves like a body now.** Cycle 5 measured the user's longest-standing complaint ("walking
  looks like sliding"): planted feet slid at ~19% of body speed and sank up to 10 cm. Foot IK pins
  them (walk 1%, run 5%, sprint 6%), and a run takes a few strides to stop instead of a quarter
  second (Q28, Q29). The grip gauge stopped looking like a debug bar (Q27); you read at night (Q25).

Would someone mistake it for a prototype? Less often — the remaining tells:

1. **Sound** — recorded steps and pages, synthesised score and giants; the mix is unheard by a
   person.
2. **The running animation** — feet now hold the ground; the user's own eye on it is still the
   test (CHECKLIST P3). Gemini's other notes (arm counter-rotation, a dynamic lean) are unverified.
3. **Light at the edges of the day** — sunset clouds now warm (Q22) but subtly; the sunset mist
   (Q24) wants a look in a real window.
4. **One GPU hitch at the daylight reveal** (Q23) — once, at a camera cut.

## Cycle 7, in short

- **Performance on the user's M5 Pro**: the terrain's spilled arrays (10 → 4.5 ms), a governor that
  reads GPU time, near terrain without sub-pixel slivers (−11%), god rays only when seen. Every
  change compared same-frame; two tried and rejected (PERF.md).
- **One standard everywhere**: scanned stone, aged statues with rubble at their feet, worn carving,
  snow, trees, lakes, the horizon mountains' ridgelines (Q48), and no white veil facing a low sun (Q47).

## Next

1. **What still costs** (PERF.md 7c): the terrain's layered shader (~5 ms headless of ~45), bloom,
   AO, clouds, grass. Find waste like the spilled arrays, not cuts in quality.
2. **Compressed ground textures** (KTX2/Basis) to afford 2K ground in today's GPU memory.
3. Q36 (a stray water slab), Q24 (sunset mist), Q23 (one GPU hitch at the reveal).
4. Statue cracks and earth heaped against their feet (Q45, the part not yet done).

## Not verified here (limits)

No phone, no other GPU, no human ears, no new player watched. Headless frame times read ~2× slow:
the deployed build in a real window is the number that counts.
