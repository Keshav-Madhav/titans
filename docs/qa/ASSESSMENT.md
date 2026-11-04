# Quality assessment (living — updated each cycle)

*As of cycle 4, 2026-11-04.*

## Where it stands

TITANS reads as a game with a point of view: a small figure, very large slow things, weather and
light doing the work. Since the QA loop began (cycles 1–4):

- **It holds up when played.** The first hour plays through from a fresh profile without getting
  stuck. Nine scenes (opening, Green, climb, grapple, storm, Shore, Grove, dusk, Mire at night)
  hold 60 fps at the median; after the first-gesture fix, eight of them have no frame over 33 ms.
- **It holds up when abused.** Reloads mid-waking, key mashing, page flipping, pause/resize
  mid-climb, focus loss: nothing throws, the wanderer is always somewhere sane, and one page opens
  at a time (Q21). A broken frame shows a card and keeps the save; a damaged save falls back.
- **The first impression improved.** The loading screen is now the key art (Q16); the first click
  no longer stalls (Q15); the climb shows the giant (Q14); captions do not pile up (Q8, Q9).

Would someone mistake it for a prototype? Less often — the remaining tells:

1. **Sound** — recorded steps and pages, synthesised score and giants; the mix is unheard by a
   person.
2. **The running animation** — the user called it buggy (CHECKLIST P3); specifics awaited.
3. **Light at the edges of the day** — sunset clouds now warm (Q22) but subtly; the sunset mist
   (Q24) wants a look in a real window.
4. **One GPU hitch at the daylight reveal** (Q23) — once, at a camera cut.

## Next

1. The sweep for cycle 4 (running).
2. A Gemini pass on the dusk/Mire/Grove frames, checked frame by frame.
3. The grass edge seen from a height (CHECKLIST P3).
4. Q24 and Q23 when there is a real window to look through.

## Not verified here (limits)

No phone, no other GPU, no human ears, no new player watched. Headless frame times read ~2× slow:
the deployed build in a real window is the number that counts.
