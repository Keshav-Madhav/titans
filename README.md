# TITANS

A single-player, open-world adventure about megalophobia, in the browser. You are a small
wanderer among giants three hundred metres tall, the colossal ruins of the First Ones, and things
far bigger beyond the edge of the world. Explore, climb, ride, glide, and find what was left
behind. No combat, no survival meters.

## Run it

```
npm install
npm run dev        # http://localhost:5173
npm run build && npm run preview   # the production build on :4317
```

## Controls

| | |
| --- | --- |
| Move / look | W A S D · mouse (click the world to capture it; right-drag works without) |
| Run | Shift (hold on open ground: the long run) |
| Jump / glide | Space (with the wing-cloak, hold while falling: W dive, S pull up, A D bank) |
| Climb, read, take, use | E |
| The bow | Q or right mouse to draw, F or click to loose |
| The horn | H (on the ground: call a giant; on its back: steer it) |
| The sight-stone | V (hold) |
| Map · Journal · Bag | M · J · I |

The tools are found in the world; the first thing to find is a bag.

## Develop

`PLAN.md` is the plan of record, `CHECKLIST.md` the ledger, `CLAUDE.md` the working rules.
`tools/gates.sh` runs every gate against the preview server.
