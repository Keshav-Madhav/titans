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

1. **View culling** (written, building after the sweep): near trees, scanned boulders, stones,
   reeds and ferns culled per instance; grass culled per cell. They were drawn all round the camera.
2. **Everything to one standard** (the user: "having good rocks in a shitty-texture game is off
   too"): a fresh survey of the common views after the sweep, worst-first — the mid/far grassland
   (most of every frame), cliffs and ravine walls, the Sentinel's tatters, far trees.
3. **Compressed ground textures** (KTX2/Basis) to afford 2K ground at today's GPU memory (~190 MB
   for 34 maps at 1K uncompressed; 2K uncompressed would be ~760 MB). Needs an encoder
   (`ktx2-encoder`, MIT, WebAssembly) and the terrain's texture arrays loading as compressed
   arrays — a project, not a tweak.
4. Q36 (a stray water slab), Q24 (sunset mist), Q23 (one GPU hitch at the reveal).

## Not verified here (limits)

No phone, no other GPU, no human ears, no new player watched. Headless frame times read ~2× slow:
the deployed build in a real window is the number that counts.
