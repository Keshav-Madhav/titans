# Evidence log

Raw captures are under `qa/` (git-ignored, on this machine); kept sheets are in `evidence/`.

| Capture | Tests | Observed | Issue | P | Fix | Fixed | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `qa/cycle1/opening.webm` · evidence/c1-opening-sheet.jpg | A fresh profile: title, wake, the hall | Input answers 2.5 s after the click (getting up); 4 identical frames were the clip's own idle wait | none (checked by trace) | — | — | — | `wake` probe: moving from 3 s |
| `qa/cycle1/green.webm` · evidence/c1-green-sheet.jpg | Running, jumping, looking on the Green | Clean; a "sliver in the sky" is a far flying giant | Q17 not a bug | — | — | — | frame checked |
| `qa/cycle1/climb.webm` · evidence/c1-climb-sheet.jpg | Climbing the Walker | The giant fills the frame; no scale | Q14 | P2 | — | open | — |
| `qa/cycle1/storm.webm` | A storm in the Dune Sea | First take: the crash card (bad weather name) | Q3 | P0 | names checked | yes | storm re-recorded, 0 errors |
| `qa/cycle1/storm-13.png` · evidence/c1-cape-before-after.jpg | The cape in a gale | Stands up over the head like a board on a slope | Q6 | P1 | cloth ceiling | yes | hem 1.57 → 1.15 m |
| `qa/cycle1/shore-15.png` | Captions on the Shore | Three paragraphs ≈ 20% of the view | Q8 | P2 | character budget | yes | probe 3 → 2 lines |
| `qa/cycle1/perf.json`, `qa/cycle2*/perf*.json` | Frame times while playing | One long frame per scene, each right after the first input | Q15 | P1 | AudioContext at load | yes | 1% low 21 → 59.5 fps |
| `scratchpad fh5/19-second-camp.png` | The first hour | Swimming against a crater lake's bank, 17 min | Q4 | P0 | climb prompt while swimming | yes | fh6 reached the camp |
| `fh5/12-bag-open.png`, `fh6/12-bag-open.png` | The bag at the first camp | Found card, then captions, showing through | Q10, Q9 | P2 | hidden behind pages | yes | bag gate; narration probe |
| `sweep30/wisp.png` | Following the Old Wood's wisp | All teal: the camera under a Mire pool | Q5 | P1 | wisps keep off pools | yes | wisp gate |
| `vision/tile.png` → `vision2/tile.png` | Colour vision | Map arrow lost (protan/deutan) | Q12 | P2 | halo + rim | yes | all four read |
| `qa/cycle1/gemini-1.txt` | Second opinion on 5 frames | 9 ranked claims: 3 wrong (Q17–Q19), 3 real (Q6, Q8, Q14), 3 already done or by design | — | — | — | — | each checked against its frame |
