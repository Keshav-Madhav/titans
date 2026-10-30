# TITANS

A persistent, browser-based 3D world where some players are mountain-sized Titans who reshape the
land by walking (footprints become lakes; rested Titans become mountains), and others are
human-scale Wanderers who follow, climb and build around them.

- `PLAN.md` is the plan of record: constraints, story, stack, terrain/water/titan design, protocol,
  schema, phases. Read it before designing anything. If it conflicts with anything else, PLAN.md wins.
- `CHECKLIST.md` is the phase ledger. Work one phase at a time; tick a box only when it is proven
  (build + gate) and committed.

## Standing constraints (user, 2026-10-30)

- **Free only, for now.** No paid services, hosts, or assets. CC0/MIT preferred.
- **No LLM in gameplay.** NPC/world AI is traditional (FSM, steering, utility). The LLM storyteller is
  deferred, and nothing may depend on it.
- **Small phases**, each one playable. Beta 1 = the spec's 8-point first build.

## Layout

- `shared/src` — `@titans/shared`: everything that must give identical answers on client and server
  (noise, base terrain, deformation kernels, basin fill, gait planner, protocol, constants).
  Consumed as TS source with no build step. **No DOM or three.js imports here.**
- `client/src` — the game: flat modules, entry `main.ts`. DOM HUD in `client/index.html`.
- `server/` — Colyseus + SQLite (from P6).
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
- Verify before claiming done: `npm run build`, then the phase's gate (`node tools/shot.mjs …`) against
  `npm run preview`.
