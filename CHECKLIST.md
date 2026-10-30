# TITANS — phase ledger

Tick a box only when it is proven (`npm run build` clean + the phase gate passes) and committed.
Each phase ends playable. Phase details are in PLAN.md §9.

## P0 — Bootstrap
- [x] npm workspaces (`shared`, `client`), strict TS, Vite, `npm run build` clean
- [x] `window.__g` test hooks + `ready` flag
- [x] `tools/shot.mjs` harness (playwright-core, headless Chrome, ANGLE)

## P1 — The land
- [x] Seeded base terrain: plains, hills, distant ridged mountains (shared, pure)
- [x] Quadtree LOD chunks with skirts, time-sliced builds
- [x] Sky, sun, fog / aerial perspective, shadows, environment map
- [x] Gate: ground + aerial screenshots look right; perf HUD shows fps, calls, tris, chunks

## P2 — The Wanderer
- [x] Red-cloaked procedural character, walk/sprint/jump on the heightfield
- [x] Orbit camera (pointer lock, wheel zoom), terrain-aware
- [x] Gate: scripted walk moves the player; screenshot from behind

## P3 — The Titan
- [x] Procedural stone giant (noise-displaced boulders on a part hierarchy)
- [x] Shared gait planner + two-bone leg IK; feet land where the planner says
- [x] Role switch key; scale-aware camera
- [x] Gate: Wanderer looking up at a walking Titan (the reel's scale shot)

## P4 — Footprints
- [x] Shared footprint kernel (polynomial only) on sparse 1 m delta tiles
- [x] Footfall emits an event; only touched chunks rebuild
- [x] Gate: 20 steps → 20 craters with measured depth; screenshot of the trail

Gate results (2026-10-30, headless Chrome/ANGLE, 1280×760): P1 ground 60 fps · 352 chunks · ~1.0M tris;
P2 sprint walk 20.8 m, grounded; P3 Titan walked 5 steps toward the Wanderer (scale shot `shots/p3-scale-2.png`);
P4 20 steps → 39/40 planted-foot samples in a crater deeper than 2 m (min −4.08 m).

## P5 — Lakes
- [ ] Priority-flood basin + spill height in shared code
- [ ] Rain fill toward spill; overlapping basins merge
- [ ] Lake meshes with sky reflection
- [ ] Gate: the chained-lakes shot

## P6 — Together
- [ ] Colyseus `WorldRoom`, guest identity, join/leave
- [ ] Wanderer prediction + server validation; interpolation of remotes
- [ ] Server-simulated Titan; terrain events ordered + synced
- [ ] Text chat
- [ ] Gate: three headless clients see the same Titan, the same craters, each other

## P7 — Memory
- [ ] SQLite: players, titans, terrain_events, region_snaps, lakes
- [ ] Gate: walk, kill the server, restart, rejoin → identical craters and lakes

## P8 — Climbing
- [ ] Rapier kinematic colliders on Titan parts; climb state with part-local attach
- [ ] Replicated climbers
- [ ] Gate: climb from foot to shoulder while the Titan walks

## P9 — Rest
- [ ] Rest → dormant mountain, persisted, labelled

## P10 — A living world
- [ ] AI Titan when no human Titan is online
- [ ] Wildlife herds (steering + FSM)

## P11 — Settlement
- [ ] Place a small building kit, persistent, with ownership

## P12 — Beta polish → Beta 1
- [ ] Clouds, water shading, audio, onboarding, perf pass, free hosting
- [ ] Beta 1 acceptance (PLAN.md §9)
