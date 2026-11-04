# Quality assessment (living — updated each cycle)

*As of cycle 5, 2026-11-04.*

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

## Next

1. Q23 — texture pre-upload at the warm-up is written (textures from materials and from the compiled
   programs' uniforms, uploaded behind the title); it needs an A/B on a quiet machine before it is
   believed (the first baseline ran at load average 23 and read 45 fps — contaminated).
2. Q24 (sunset mist) — wants a look in a real window.
3. Sound: a person's ears on the mix with the recordings in it.
4. The running animation: the user's own eye (CHECKLIST P3).

## Not verified here (limits)

No phone, no other GPU, no human ears, no new player watched. Headless frame times read ~2× slow:
the deployed build in a real window is the number that counts.
