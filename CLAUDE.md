# TITANS

A single-player, open-world guided adventure about megalophobia, in the browser. You are a small
wanderer among giants three hundred metres tall and the colossal ruins of the First Ones: explore,
climb, solve the world. No combat, no survival meters. (The earlier multiplayer world — players as
Titans, town building — is in git at the tag `pre-adventure`.)

- `PLAN.md` is the plan of record: constraints, story, stack, terrain/water/titan design, protocol,
  schema, phases. Read it before designing anything. If it conflicts with anything else, PLAN.md wins.
- `CHECKLIST.md` is the phase ledger. Work one phase at a time; tick a box only when it is proven
  (build + gate) and committed.

## Standing constraints (user, 2026-10-30)

- **Free only, for now.** No paid services, hosts, or assets. CC0/MIT preferred.
- **No LLM in gameplay.** NPC/world AI is traditional (FSM, steering, utility). The LLM storyteller is
  deferred, and nothing may depend on it.
- **Small phases**, each one playable (PLAN.md §6).
- **Single player only.** No server. **No survival:** no health, hunger or enemies; a fatal fall
  wakes you at the last safe ground.

## Layout

- `shared/src` — `@titans/shared`: the pure, deterministic core (noise, regions, base terrain,
  deformation kernels, lakes, gait planner, giant AI, saved shapes, constants), also run by Node
  tools. Consumed as TS source with no build step. **No DOM or three.js imports here.**
- `client/src` — the game: flat modules, entry `main.ts`. DOM HUD in `client/index.html`.
- `client/public/tex` — packed CC0 terrain textures (`python3 -I tools/pack-textures.py`).
- `tools/` — playwright-core `.mjs` harness scripts; screenshots go to `shots/` (gitignored).

## Rules that bite

- **Determinism:** deformation and basin code in `shared` uses only + − × ÷ and polynomials — no
  `Math.sin/cos/exp/pow` with non-integer exponents — so every engine computes the same bits.
- **Height = baseHeight (pure, seeded) + delta (sparse tiles, persisted).** Never store base height;
  never generate delta.
- The simulation runs on a fixed 60 Hz step with clamped dt, and pauses on `document.hidden`. Nothing
  in the frame loop allocates per frame.
- Test hooks live on `window.__g` (`ready`, `teleport`, `setCam`, `player`, `stats`, …). Tools wait on
  `window.__g.ready`, never on `networkidle` or fixed sleeps.
- `?offline` is tool mode: a fresh, unsaved world whose giants stand still unless `?wild`.
- Verify before claiming done: `npm run build`, then the phase's gate against `npm run preview`
  (port 4317): `node tools/shot.mjs <scene>` (tool mode) and `node tools/single.mjs` (the real game,
  with its save). Anything touching `shared/src/water.ts`: `npx tsx tools/fill-bench.ts` (Node, no
  browser) — the refill must truly settle (more rain merges nothing), restore exactly, and keep a
  lake step under half a frame.
