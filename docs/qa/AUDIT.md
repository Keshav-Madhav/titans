# Game audit

What was looked at, how, and what was found. Findings carry their tracker ID (ISSUES.md, Q…) or
point to CHECKLIST.md where older. Priorities: P0 critical · P1 high · P2 medium · P3 low.

**Method.** The game was played in headless Chrome with real keyboard and mouse input
(`tools/clips.mjs`, `tools/firsthour.mjs`), recorded, and the recordings looked at frame by frame;
50 scripted gates; a colour-vision pass; frame-rate and input proofs; a second opinion from Gemini
on frames, checked against the frames before acting.

## A. Graphics and visual quality

**Identity.** Strong and consistent: a small red-hooded figure in a pale, weathered, painterly land;
giants as stone; low cloud that tall things vanish into; dusk and storm grades. Assets read as one
universe (procedural + generated textures in one palette). Kept; nothing here argues for a change of
direction.

| Finding | P | Status |
| --- | --- | --- |
| Cape stood up over the head like a board in a gale on a slope | P1 | fixed (Q6) |
| A Mire pool's water disc floats over low ground on slopes (one-sided; unseen from below) | P2 | water test fixed (Q5); the float itself deferred — every geometric level rule drained half the Mire |
| Climbing camera too close: the giant fills the screen, no scale, no sense of where you are on it | P2 | open (Q14) |
| Cliff strata on the High Places' stair read as regular horizontal steps | P3 | by design (a cut stair); noted |
| Grass edge visible from a height (P3 playtest item) | P2 | open (CHECKLIST P3) |
| Loading: ~5 s on a bare sky gradient and one line | P3 | open (Q16) |

Rendering: no z-fighting, flicker or transparency sorting faults seen in the cycle-1 clips; soft
particles and the deck verified earlier (same-frame on/off). Shadows: stand-ins for colossi and
crowns. Not tested: a non-Apple GPU.

## B. UI and UX

One design system already (leather bag, notebook journal, paper map, ink keycaps, serif captions).
This audit's work was making it hold under pressure:

| Finding | P | Status |
| --- | --- | --- |
| "Go on" below the fold on the pause page | P1 | fixed (Q7) |
| Captions as a wall of words; captions cut by panels; the found card through the bag | P2 | fixed (Q8, Q9, Q10) |
| A swimmer at a sheer bank was never told E climbs it | P0 | fixed (Q4) |
| "Watching…" never said what | P2 | fixed (Q11) |
| Key strip ran under the minimap at large text | P2 | fixed |
| Rebinding, pad navigation, text size, holds as toggles, shake/flash comfort | P1/P2 | added (CHECKLIST detail-bar audit) |
| Map arrow lost under red-green colour blindness | P2 | fixed (Q12) |

Open: the bottom key strip stays on screen while you play (it fades once you know the keys — it
should be checked that it does fade in the first hour); a first-time player's understanding of the
grip bar (unlabelled yellow bar) has not been tested with a person.

## C. Gameplay and mechanics

Core loop: walk the lands, find things (114 finds: places, lore, trinkets, relics, tools, giants),
climb giants and cliffs, use tools (bow, horn, wing-cloak, sight-stone, grappling line). The first
hour now plays through end to end from a fresh profile (fh6: the second camp reached, page two
found, never stuck).

| Finding | P | Status |
| --- | --- | --- |
| A lake in a giant's footprint could trap a swimmer | P0 | fixed (Q4) |
| A wisp led you to swim to a light underwater | P1 | fixed (Q5) |
| First click/key stalled 200 ms | P1 | fixed (Q15) |
| Frame-rate independence | — | proved (30/60/144 Hz) |
| Running animation (user: "still buggy") | P2 | open — waiting on the user's specifics (CHECKLIST P3) |

## D. Completeness and cohesion

See NARRATIVE.md. Essential completion: none blocking the first hour. Important polish: the climb
camera, the loading screen, music quality (unheard by tools). Optional: more of each find kind in
the far lands (the Shore and the High Places are thinner than the Green). Deliberately excluded:
plot, survival meters, combat — on record as the user's direction (PLAN.md §1, §2f).

## E. Audio

Recorded CC0 sound for steps, landings and the pages; the score, weather, giants, horn and bell are
synthesised. Untested by a person (CHECKLIST: "mix not yet heard by a person").

## F. Performance

PERF.md. Median 60 everywhere measured; the one systematic stall (the first gesture) is gone.

## G. Adversarial

Bad `?weather=` (fixed, Q3), a thrown frame (card, Q1), a damaged save (Q2), rebinding conflicts and
Esc while listening (keys gate), focus loss (keys released), a hidden tab (sound suspends, save on
hide). `tools/adversary.mjs` (in the sweep) now also does: three reloads during the title → waking
hand-over; every key mashed while running; the pages flipped fast; pause/resume twelve times in a
second mid-climb and the window resized four ways; let-go keys pressed while paused on a giant
(ignored, as they should be); focus lost with W held (stops); a fall from the Colonnade spamming
jump and the line. One real bug: the pages stacked (Q21, fixed). Nothing threw; the wanderer was
always somewhere sane.
