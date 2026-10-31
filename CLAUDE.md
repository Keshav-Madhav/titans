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
- `server/src` — Colyseus 0.18 `WorldRoom` (schema v5 `schema()` builders, `setFixedTimestep`), run
  with tsx. Persistence (SQLite) arrives in P7.
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
- **Single player is the default** (user, 2026-10-30). Multiplayer only when switched on: the world
  panel (mode chip / M, saved in localStorage), `?mp`, or `?server=…`. `?offline` is tool mode: a
  fresh, unsaved world whose Titans stand still unless `?wild`.
- Verify before claiming done: `npm run build`, then the phase's gate against `npm run preview`
  (port 4317): `node tools/shot.mjs <scene>` (tool mode), `node tools/single.mjs` (the real default),
  and for multiplayer `node tools/mp.mjs` (opens `?mp`) with a fresh `npm run server` (port 2567);
  `persist`/`dormant`/`wild.mjs` start their own servers. Anything touching `shared/src/water.ts`:
  `npx tsx tools/fill-bench.ts` (Node, no browser) — the refill must truly settle (more rain merges
  nothing), restore exactly, and keep a lake step under half a frame.
- Online, the server owns the Titan and the terrain-event order; the client never applies its own
  Titan events online (it extrapolates the gait and discards them). Offline, it simulates both.
