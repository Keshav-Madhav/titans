# TITANS — plan of record

A persistent, browser-based 3D world where some players are the size of people and some are the
size of mountains. Titans reshape the land by walking: every footprint becomes a lake, and a Titan
that rests long enough becomes a mountain. Wanderers explore, follow and climb the Titans, and build
settlements in the land they leave behind.

Origin: a 24-second concept trailer ("making trailers for games i wish existed", by bonkbureau —
no such game exists), expanded by the user into a full GDD + technical spec (2026-10-30). That spec
is the design source. This file turns it into an engineering blueprint and records every decision
that narrows or reorders it. **If this file and the spec disagree, this file wins** — it holds the
constraints the spec was written without.

---

## 1. Constraints on record (user, 2026-10-30)

- **Free, for now.** Every library, asset, host and service must be free. Paid infrastructure is a
  later conversation, not a design assumption. This is why the spec's Postgres + Redis + S3 +
  managed hosting is replaced below by a single process with SQLite until real load says otherwise.
- **AI means two different things here.**
  - Townsfolk, wildlife, caravans and AI Titans that fill an empty world are **traditional game AI**
    — state machines, steering, utility scoring. No LLM.
  - An LLM is only ever for **storytelling** (a chronicler that turns world events into myths and
    quests). It is **off for now** and will be revisited later. Nothing may depend on it.
- **Small phases.** The spec's "first build" (enter a world, see another player, become a Titan,
  deform the land, watch lakes form, be climbed, log out and come back) is the target for **Beta 1**.
  Development reaches it through the small phases in §9, each one playable and gated.
- **First slice: Titan + Wanderer.** City building lands after the Titan/Wanderer loop works.

## 2. Story (from the spec, adopted)

The world was flat and silent until the First Ones — beings of impossible scale — walked it. Where
they walked, valleys formed; where they slept, mountains rose; where they wept, oceans appeared.
When they vanished, their bodies became the foundations of the world, and civilisations grew among
their remains. Now the old mountains are moving, lakes are appearing where no water was, and new
Titans are waking. Players are those Titans, and the people living around them.

The central mystery: the First Ones did not just make the world — **they were trying to escape
something.** It is told through the environment (ruins, monuments, carvings on dormant Titans,
world changes), never through mandatory quest chains. Arc: The Awakening → The Shaping → The
Civilisations → The Forgotten → The Return → The Beyond.

## 3. Engine and stack decisions

| Area | Decision | Why |
| --- | --- | --- |
| Rendering | **three.js** (WebGL2), strict TypeScript, Vite | The spec allowed three.js or Babylon. The user's game repos (jurassic-stack, minecraft-JS) are three.js; the hard parts here (deformable heightfield, lakes, a procedural giant) are custom code in either engine, so the familiar one wins. WebGPU stays a later option. |
| UI | **Plain DOM HUD now, React later** | The early phases have about four HUD elements. React arrives with the first real UI (chat, building palette, inventory), mounted as an overlay, with the simulation kept outside its render cycle as the spec requires. |
| Physics | **Rapier3D** (`@dimforge/rapier3d-compat`), from the climbing phase | The Wanderer walks on an analytic heightfield, so it needs no physics engine until climbing and buildings. |
| Multiplayer | **Colyseus** (Node + TypeScript), authoritative | As in the spec. |
| Persistence | **SQLite** (`node:sqlite`) in the game-server process | Free, zero-ops, and enough for 20–40 players on one world. The schema in §7 stays Postgres-compatible, so the spec's Postgres move is a driver swap when load requires it. **No Redis** until there is more than one server process. |
| Hosting | **Undecided — free tier, chosen at the multiplayer phase** | Front end: any static host (Vercel / Cloudflare Pages). Game server: needs an always-on Node process with WebSockets. Leading free candidate: Oracle Cloud Always Free ARM VM. Render's free tier sleeps, and a sleeping server cannot simulate. |
| Assets | CC0 only (Poly Haven, ambientCG, Kenney, Quaternius) + procedural | The Titan and the Wanderer start procedural (see §6), so the first phases need no downloads. |
| Voice | LiveKit, much later | Spec item, out of scope until Beta 1 ships. |

### Repository layout (npm workspaces)

```
titans/
  shared/   @titans/shared — code that MUST give the same answer on client and server:
            seeded noise, base terrain height, deformation kernels, lake basin fill,
            titan gait planner, protocol types, world constants
  client/   Vite + three.js app (the game)
  server/   Colyseus game server + SQLite (arrives in the multiplayer phase)
  tools/    playwright-core harness scripts (screenshots, gates, benches) -> shots/
```

`@titans/shared` is consumed as TypeScript source, with no build step, by Vite (client) and tsx
(server).

## 4. World and terrain

- **Units:** 1 world unit = 1 metre. The world is a square centred on the origin. The playable core
  is 8 km × 8 km. Terrain keeps generating past it, so mountains on the horizon are real.
- **Height = base + delta.**
  - `baseHeight(x, z)` is pure and seeded: domain-warped fBm plains, rolling hills, and a ridged
    mountain belt whose mask grows with distance from spawn. It is never stored; anyone can compute it.
  - `delta` is the record of what players did: sparse 64 m × 64 m tiles at 1 m resolution, created
    only where something changed. Persisted, never generated.
- **Deformation is events, not vertices** (spec §11). A Titan footstep is
  `{ seq, kind: 'footprint', x, z, heading, size, depth }`. The server orders events, clients apply
  them through the same shared kernel, and the server persists the event log plus periodic baked
  delta snapshots per region. **Kernels use only + − × ÷ and polynomials** (no `sin`/`exp`), so they
  are bit-exact across browser engines and the server.
- **Rendering:** CDLOD-style quadtree of chunks, each 64 × 64 quads plus skirts, from 64 m leaves
  (1 m/quad) up to a 16 km root. Splits use 3D camera distance, so a Titan's high camera
  automatically sees coarser, wider terrain. Chunk builds are time-sliced per frame. A deformation
  event dirties only the chunks it touches.

## 5. Water: footprints become lakes, drag trenches become canals

Titans **drag** their feet (user, 2026-10-30): the swing foot barely lifts and ploughs a trench
from its last print to its next, so each foot leaves a canal linking its prints. Each footfall
also punches a wide, shallow **impact crater** with an ejecta rim, plus cosmetic dust and debris.
Kernels: `applyDrag` (capsule trench, `lowerTo` so overlapping segments never double-dig, banks
only beside the segment), `applyImpact` (parabolic bowl in squared distance), `applyFootprint`.

Water is **fill–spill–merge** (Barnes, Callaghan & Wickert 2020), run incrementally:
full lakes pass excess to the lake downhill of their exit; spill that runs into a hollow with no
lake makes a pool there (≤ 8,000 cells; tiny pits fill at once and the water runs on); lakes whose
surfaces meet merge, each flooded at its own level to the true combined outlet. A flood that grows
past 40,000 cells (≈ 4 ha) is water spreading into natural lowland: it is runoff, not a lake (this
world is dry until Titans bring water), and the river phase will route it.

1. A footprint carves a foot-shaped depression with a raised rim of displaced soil.
2. The server runs a **priority-flood** (Barnes et al. 2014) on a local window around the
   depression. It finds the basin's **spill height** (the lowest rim point water would escape over)
   and the cells that would hold water.
3. A lake entity `{ id, cells/bbox, bottom, spill, level }` fills toward `spill` at a rain rate
   (game-time configurable: seconds for the demo, longer in the live world).
4. A new footprint that overlaps an existing lake re-runs the fill on the union, so lakes merge
   into the reel's chained lakes.
5. Clients render each lake as a flat mesh over its flooded cells, reflecting the sky. Rivers
   (spill → downhill flow) come later.

## 6. Titans and Wanderers

- **Scale:** Wanderer 1.8 m. Titans start at **180 m** (raised from 120 m at the user's request;
  spec range: 30 m to kilometres; more scale is a progression axis). A 180 m Titan drags 50 m
  strides about 5.4 s apart (≈ 9 m/s): dynamic similarity says time ∝ √size, and the extra factor
  is weight. Slowness is part of how it reads as huge.
- **The Titan is procedural:** a hierarchy of noise-displaced boulders (pelvis, spine, chest, head,
  arms, legs) for the reel's mossy stone look. Locomotion is procedural, with analytic two-bone
  leg IK: **the gait planner (shared) decides where each foot lands, and that exact point is where
  the footprint event fires.** The animation solves to the planner, never the reverse.
- **Representations by distance** (spec §11): near is the full boulder rig; medium uses merged,
  reduced boulders; far is an impostor silhouette; a dormant Titan becomes terrain plus a static mesh.
- **The Wanderer is procedural too:** a red-cloaked figure (cloak, hood, legs), so animation can stay
  simple at first. It is replaceable later by a CC0 rigged character.
- **Climbing:** each Titan body part carries a kinematic Rapier collider tagged climbable. A
  climbing Wanderer stores its position **relative to a body part** `(titanId, part, localPos)`, so
  the Titan carries it. It replicates the same way, so other clients see climbers stuck to the
  body even while the Titan's interpolation differs.
- **Rest → mountain:** a resting Titan settles. After a timeout (or on logout) it becomes
  **dormant**: its pose freezes, and its body becomes static terrain-like geometry with a delta
  mound under it, named in the world ("afk_mountain · AFK · 4 YEARS").

## 7. Multiplayer and persistence blueprint

**Server:** one Colyseus `WorldRoom` per world (20–40 players to start, per the spec), ticking at
20 Hz. Interest management uses region cells (512 m): clients receive entities in nearby cells, and
Titans everywhere (they are landmarks), at reduced rate when far.

**Authority:**
- Wanderer movement is **predicted on the client and validated on the server** (speed caps, ground
  height from shared terrain, teleport rejection). This is a co-op world, not a competitive shooter,
  so full rollback is not worth its cost.
- Titan movement is **fully server-simulated** from inputs, because it changes the world.
- Deformation, lakes, buildings and ownership are server-only.

**Protocol** (Colyseus schema + messages):

```
client → server   input { seq, move: [x,z], yaw, jump, sprint }       20 Hz
                  climb { titanId, part, local: [x,y,z] } / release
                  become_titan / become_wanderer / rest
                  chat { text }
server → client   state: players{ id, name, color, role, x,y,z, yaw, climb? }
                         titans{ id, owner, x,z, heading, gaitPhase, steps, state }
                         lakes{ id, x,z, level, spill }
                  terrain_event { seq, kind, params }   (ordered; client applies via shared kernel)
                  terrain_sync { fromSeq, events[] }     (on join / reconnect / region enter)
```

**Schema** (SQLite now, Postgres-compatible):

```
players         id, name, color, token_hash, role, x, y, z, created_at, last_seen
titans          id, owner_id, name, x, z, heading, scale, steps, state(walking|resting|dormant), pose_json, updated_at
terrain_events  seq PK, region, kind, params_json, created_at          -- append-only log
region_snaps    region PK, upto_seq, delta_blob, updated_at             -- baked delta tiles
lakes           id, region, cx, cz, bottom, spill, level, cells_blob, updated_at
settlements     id, owner_id, name, cx, cz, created_at                  -- settlement phase
buildings       id, settlement_id, kind, x, y, z, rot, owner_id, created_at
```

**Identity:** a guest identity (name + colour + secret token in `localStorage`) to start, the same
pattern as the portfolio's cursor identity. Real accounts come later; all of it is free.

## 8. World AI (traditional, no LLM)

- **AI Titan:** while no human Titan is online, an AI walks a Titan along long, wandering routes, so
  lakes keep forming and there is always something to follow and climb.
- **Wildlife:** herds driven by steering and a finite-state machine (graze, drift, flee from Titan
  footfalls).
- **Caravans and townsfolk:** utility-scored routines (follow the Titan, make camp, trade), added
  with settlements.

## 9. Phases → Beta 1

Each phase ends playable, is gated (build + scripted check + screenshot), and is committed.
`CHECKLIST.md` is the ledger.

| # | Phase | Playable result |
| --- | --- | --- |
| P0 | Bootstrap | Repo, workspaces, build gate, harness, `window.__g` test hooks |
| P1 | The land | Procedural terrain with LOD, sky, sun, fog, shadows: a world worth standing in |
| P2 | The Wanderer | Red-cloaked third-person character: walk, sprint, jump, orbit camera |
| P3 | The Titan | Procedural stone giant with IK walk and a scale-aware camera; switch roles with a key |
| P4 | Footprints | Deterministic footprint events deform terrain; chunks rebuild locally |
| P5 | Lakes | Basin fill + rain: chained lakes form in the footprints (the reel shot) |
| P6 | Together | Colyseus server: guests see each other move, Titan replicated, events synced, chat |
| P7 | Memory | SQLite persistence: leave, restart the server, come back to the same lakes |
| P8 | Climbing | Rapier colliders on the Titan; grab, climb and ride it, replicated |
| P9 | Rest | Resting Titan → dormant mountain on rest or logout |
| P10 | A living world | AI Titan when no human holds one; wildlife herds |
| P11 | Settlement | One small buildable settlement beside a lake, persistent, with ownership |
| P12 | Beta polish | Clouds, water shading, audio, onboarding, perf pass, free hosting → **Beta 1** |

**Beta 1 acceptance** (the spec's key demonstration): three players enter the same world. One
becomes a Titan and walks; another follows it; the third climbs onto its body. The footsteps leave
depressions that rain fills into a chain of lakes. The players build a settlement beside one lake,
then all disconnect. The next day, the lakes and the settlement are exactly where they left them.

## 10. Performance budget (from the spec)

60 FPS target, 30 minimum, on a mainstream desktop. Server at 20 Hz; movement replication target
50–100 ms. The initial load is under 15 s. Never load the whole world. Every phase keeps a live perf
readout (fps, draw calls, triangles, chunk count), and the gates record it.
