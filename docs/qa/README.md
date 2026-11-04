# QA — playing, looking, fixing (docs/qa)

The game is played, recorded and measured in short cycles: **play → observe → critique → research →
fix → verify → repeat**. These files are the record. They are kept as the work goes, not written at
the end.

| File | What it is |
| --- | --- |
| [AUDIT.md](AUDIT.md) | The audit, area by area: what was looked at, what was found, how bad it is |
| [ISSUES.md](ISSUES.md) | The issue tracker: every finding, with priority, repro, evidence, cause, fix, status, verification |
| [EVIDENCE.md](EVIDENCE.md) | The evidence log: each capture, what it tested, what it showed |
| [PERF.md](PERF.md) | Performance: the baseline, bottlenecks, what changed, the numbers after |
| [NARRATIVE.md](NARRATIVE.md) | Story, world and completeness: gaps, contradictions, what is missing |
| [CHANGELOG.md](CHANGELOG.md) | What was changed, cycle by cycle, and why |
| [ASSESSMENT.md](ASSESSMENT.md) | An honest state of the game now, and what should come next |

## How the game is played here

All of it drives the real game in headless Chrome (ANGLE on the Mac's GPU) against the production
build (`npm run build`, served on 4317):

- **`tools/clips.mjs <dir> [clip …]`** — scenes played with Playwright's real keyboard and mouse
  (keys held and released, the right button dragged to look): the opening from a fresh profile, a
  run on the Green, climbing the Walker, the grappling line, a storm in the Dune Sea, the Shore. Each
  is recorded to video and measured (frame times, 1% lows, draw calls, triangles, heap); a frame a
  second is tiled into a contact sheet.
- **`tools/firsthour.mjs <dir>`** — the first hour as a new player plays it (title, waking, the
  hall, the bag, the Walker, the map, the walk to the second camp), with real keys; ~25 snapshots.
- **`tools/gates.sh <dir>`** — 50 scripted gates (each a scene with an assertion that throws).
- **`tools/vision.mjs`** (colour-vision emulation), **`tools/fps.mjs`** (30/60/144 Hz),
  **`tools/keys.mjs`** (rebinding, a simulated pad), **`tools/respect.mjs`** (saves, the crash card).
- **`tools/gemini-review.py "<question>" <frames or clip>`** — a second opinion (Gemini flash with
  vision). The key is read from `.env.local` and sent as a header, never printed; each call is charged
  to the spend ledger (`tools/.cache/gen/spend.json`, $10 cap) and cached. Its claims are checked
  against the frames before anything is done about them: in cycle 1, 3 of its 9 top claims were wrong.

Raw captures (video, full frames) stay in `qa/` (git-ignored). Contact sheets and before/after pairs
worth keeping are in [evidence/](evidence/).

## Limits, said plainly

- Headless Chrome on this Mac: frame times read about twice as slow as a real browser window, so
  absolute fps is for comparing runs; the deployed build in a real window is the true number.
- Nothing here has been played on a phone or a low-end GPU.
- Sound cannot be heard by these tools: they prove sounds load and play, not that the mix is good.
- Playwright's input is real browser input events, but not a person: feel (is the jump satisfying?)
  is judged from recordings and frame traces, and the user's own playtests (CHECKLIST P2, P3) remain
  the ground truth.
