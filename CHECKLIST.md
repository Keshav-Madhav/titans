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
- [x] The wild Titan: when nobody walks it (8 s; `TITANS_AI_DELAY_MS`, `TITANS_AI=0` off), a
      traditional-AI mind (`shared/src/brain.ts`: wander/pause state machine, seeded) walks it to
      far points on the low plains, avoiding the mountain belt and dormant Titans; mostly ploughs,
      sometimes strides, now and then stomps or calls out. A player takes it over with T at any time.
      Offline play without a server runs the same mind. Label over the Titan in the reel's style:
      driver name or "A wild Titan" · TITAN · N STEPS
- [x] Gate `tools/wild.mjs`: alone, it walks itself (3 steps, events arrive, labelled); taken over,
      it stands still for the player; stepped out, it goes wild again
- [x] Fixed on the way: DOM labels for things BEHIND the camera mirrored into view under the
      reversed depth buffer (`client/src/screen.ts` now tests view-space depth)
- [x] Wildlife (`client/src/wildlife.ts`): 4 herds of plains striders (34 animals), traditional AI —
      herd FSM graze → travel → drink (thirst rises; a thirsty herd walks to the nearest lake a Titan
      made and drinks at the shore) and flee (footfalls, stomps, walking Titans, a Wanderer running at
      them); per-animal flocking (separation, cohesion, alignment), never into deep water; drawn as
      four instanced meshes with every leg animated. Client-side for now (single player first).
- [x] Gate `shot.mjs wildlife`: herds on the ground; thirsty herd 174 m away → travel → drink, 16.6 m
      from the water; startled 45 m away → flees to 65 m in 2.5 s

## Polish round (user: "fix up all the rough edges", 2026-10-30)
- [x] Back-lit Titan read as a navy silhouette → sky/ground fill + shadowless skylight opposite the sun
- [x] Boulders smooth and flat up close → tri-planar stone detail in part space, antialiased cracks,
      derivative bump, faded with distance; three boulder LODs by camera distance
- [x] Sitting read as a crouch → sat on the ground, legs forward, back straight
- [x] Lakes dark at low angles → ripple normal map (procedural), lighter body, in-water glow
- [x] ~1M triangles → quality governor (fps-driven; terrain split distance, chunk resolution 64/32,
      pixel ratio, shadow size; `?quality=0|1|2`): 1.03M / 838k / 242k triangles
- [x] Neighbouring lakes stuck as two → mutual full pairs settled by window depression-filling;
      lakes gate now requires 0 mutual pairs
- [x] Overflow vanished → streams drawn to the lake it feeds or out over the plain
- [x] One awake Titan → N slots (`TITANS_COUNT`, default 2): nearest free on T, per-slot wild minds,
      persistence, dormancy; MP gate: A and B walk two Titans at once, C sees both named
- [x] Footfalls carry their heading vector (no per-engine Math.sin); chat names readable
- [ ] Not code: free hosting (needs a provider choice); server-authoritative lake levels (design note)

## Single player first (user, 2026-10-30: "hold for multiplayer, single player is default unless I apply multiplayer")
- [x] Default mode is single player: no network unless multiplayer is switched on (world panel —
      the mode chip or M — persisted; or `?mp` / `?server=`). Multiplayer stays built and gated.
- [x] Single-player save (localStorage): compact terrain-event log, every Titan's gait, mountains,
      where you stood; reload replays it; New world wipes it. Offline dormancy follows the server's
      rule (resting alone for a minute → mountain), and leaving while walking a Titan sits it down.
- [x] Gate `tools/single.mjs`: default is single player and Titans wander; reload → identical craters,
      Titan 0.00 m from where it stood, sitting; six hours away → our named mountain; panel → online and back

## P11 — Settlement
- [x] Build mode (B): hut, house, well, watchtower (1–4), aim at the ground, green/red preview, Q/E
      turn, click to place. Procedural buildings in the reel's style (white walls, slate roofs, stone,
      thatch). The first building founds a named town and must stand near a lake a Titan made; later
      ones within 140 m, on dry, fairly level ground, clear of each other.
- [x] Townsfolk (traditional AI): one per hut, two per house; idle → walk to the well, the shore or a
      door → idle; flee a nearby Titan and come home. Wild Titans give the town a wide berth.
- [x] A Titan's footfall, stomp or drag crushes what it hits (rubble, word in the chat); saved.
- [x] Persisted in the single-player save. (Ownership is implicit in single player: the town is
      yours; per-player ownership arrives with multiplayer.)
- [x] Gates: `shot.mjs settlement` (refused far from water / in the lake / out of bounds; Mossbrook
      founded with 6 buildings; 6 townsfolk, 5 walking; a footfall crushes all 6 under it and spares
      one 75 m away); `single.mjs` builds a house by hand (B, 2, aim, click) and the town survives reload

## P12 — Beta polish → Beta 1
- [ ] Clouds, water shading, audio, onboarding, perf pass, free hosting
- [ ] Beta 1 acceptance (PLAN.md §9)
