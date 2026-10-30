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
- [x] Priority-flood basin + spill height in shared code
- [x] Rain fill toward spill; overlapping basins merge
- [x] Lake meshes with sky reflection
- [x] Gate: the chained-lakes shot

Gate result (2026-10-30): 14 steps → 11 lakes (early steps merge), all 11 filled to their spill height
(`node tools/shot.mjs lakes`, shot `shots/p5-lakes.png`). Overflow is discarded for now — rivers come later.

## P5b — Heavier Titans (user feedback, 2026-10-30)
- [x] Titan 120 → 180 m, slower (5.4 s strides, ≈ 9 m/s)
- [x] Foot drag: swing foot ploughs a trench between prints (canals); impact crater per footfall
- [x] Dust + flying debris on impact, dust along the drag (client-only, pooled)
- [x] Water: spill → downstream pools → merges (fill–spill–merge), lowland runoff capped
- [x] Wanderer rendering: face sphere poked through the hood; detached shadow (0.6 m normal bias,
      hem too high); 60 Hz sim un-interpolated on 120 Hz displays (judder); single-sided cloak
- [x] Gates: trail 40/40 prints in craters (min −10.6 m); lakes gate fills canals; scale shot

## P6 — Together
- [x] Colyseus 0.18 `WorldRoom`, guest identity (name + cloak colour in localStorage), join/leave
- [x] Wanderer prediction + server validation (speed, height); remotes interpolated 100 ms behind
- [x] Server-simulated Titan (60 Hz fixed step, one driver at a time); terrain events numbered,
      logged, broadcast; joiners replay the log; clients extrapolate the Titan between patches
- [x] Text chat (Enter)
- [x] Gate (`node tools/mp.mjs`): 3 players see each other; A drives, B is refused; 4 footfalls with
      identical crater depth on A/B/C; Titan gap 0.1 m; C sees B walk; chat delivered. `shots/p6-together.png`
- Offline fallback: no server (or `?offline`) → the client simulates the Titan itself, as before

## P7 — Memory
- [x] SQLite (`node:sqlite`, `server/data/world.db`, gitignored): `terrain_events` (appended every
      tick in a transaction, tagged with a 512 m region), `titans` (every 2 s + shutdown), `players`
      (keyed by a hash of a private per-browser token; saved on leave)
- [x] Boot replays the log; returning Wanderers wake where they left; lakes come back full
      (`LakeSystem.fillAll` fills, spills and merges to equilibrium)
- [x] Gate (`node tools/persist.mjs`, own server on :2568): Titan walks, Wanderer leaves, server
      **SIGKILLed**, restarted → craters identical at every footfall, Titan 0.00 m from where it
      stopped, Wanderer 0.00 m from where they left, all lakes full. Passed 3/3 runs.
- [ ] Deferred: `region_snaps` compaction (replaying the log is fine at this size) and
      server-authoritative lake levels (clients derive lakes from the same events today)

## P8 — Climbing
- [x] Analytic climbing on the Titan's real boulder surfaces (no Rapier needed); part-local holds;
      grip stamina (steep drain, walking/shrug/footfall penalties, regen on top); E grab/let go,
      Space leap; walkers pushed out of the Titan's feet and legs
- [x] Replicated climbers (hold sent as part + boulder + local point; drawn on each client's pose);
      climbers marked at any range for the Titan; the Titan's shrug (Q) reaches every client
- [x] Gate (`node tools/shot.mjs climb`): foot → shin → thigh → torso → shoulder, standing at
      133 m of 180 m with full grip; then rode three strides (carried 136 m as the Titan moved
      134 m). MP gate: C draws B's climber 0.01 m from where B is; shrug seen by C.

## P8b — Titan verbs (PLAN.md §6b)
- [x] Plough / stride toggle (R): stride lifts the feet clean — no trench, lakes only
- [x] Stomp (F, 6 s cooldown): the foot rises high and slams; print −15.9 m vs −10.6 m; a dust
      shockwave knocks Wanderers within ~0.6 H off their feet and shakes climbers' grip
- [x] Call out (C): every Wanderer gets a marker pointing at the Titan, with the distance
- [x] Gates: `shot.mjs verbs` (stride trench-free, plough −2.88 m, stomp deeper, Wanderer 101 m away
      knocked down, marker shown); MP: stomp print identical on A/B/C (−15.875 m), call reaches C

## P9 — Rest
- [x] Rest (X): the Titan sits — feet forward, knees up, hands on knees, head bowed — over ~3 s
- [x] Log off while driving and your Titan sits where it stands; resting with nobody driving for
      `DORMANT_AFTER_MS` (60 s; `TITANS_DORMANT_MS` overrides) it falls asleep: a mossy mountain in
      its frozen pose, a hill (`mountain` terrain event) rising under it, labelled with its last
      driver's name and how long it has slept; a new Titan wakes ~650 m from the origin
- [x] Mountains persist (`mountains` table), replicate (room state), and can be climbed (holds
      carry a Titan id); a climber on a Titan that falls asleep stays on the same rock
- [x] Gates: `shot.mjs rest` (offline: 1 mountain, hill +18 m, new Titan 978 m away, label, climbable);
      `tools/dormant.mjs` (online: A walks, sits, logs off → B sees the mountain 0.0 m from where
      it sat, ground +17.2 m, new Titan 1,083 m away with 0 steps, A's name on it; survives SIGKILL)

## P10 — A living world
- [ ] AI Titan when no human Titan is online
- [ ] Wildlife herds (steering + FSM)

## P11 — Settlement
- [ ] Place a small building kit, persistent, with ownership

## P12 — Beta polish → Beta 1
- [ ] Clouds, water shading, audio, onboarding, perf pass, free hosting
- [ ] Beta 1 acceptance (PLAN.md §9)
