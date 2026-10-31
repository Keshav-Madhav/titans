# TITANS — plan of record

**A single-player, open-world guided adventure about megalophobia.** You are a small wanderer in a
land of colossal things: giants three hundred metres tall who walk the world as weather does, and
the ruins of the First Ones, built at their scale. You do not fight them and you are not trying to
survive. You explore, you climb, you solve the world, and you get things done — Shadow of the
Colossus and The Last Guardian are the touchstones, minus the killing.

Decided by the user, 2026-10-31 ("scrap the plan… a full game made around Megalophobia,
singleplayer as a wanderer… an open-world guided adventure… not stressing about having to survive
but instead accomplishing things… get rid of the towns… good textures… a lot more stuff"). The
earlier plan (a multiplayer world where some players are Titans and others build towns) lives in
git at the tag `pre-adventure`; nothing in it binds this one.

---

## 1. Constraints on record

- **Free only.** Every library and asset is free: CC0 textures (Poly Haven, ambientCG), CC0
  models (Kenney, Quaternius, Poly Haven), procedural everything else. (user, 2026-10-30)
- **No LLM in gameplay.** Quests, dialogue and lore are written by hand; creatures and giants run
  traditional game AI. (user, 2026-10-30)
- **Single player, in the browser.** No server, no accounts. Progress saves in the browser.
- **No survival.** No health bar, no hunger, no enemies. A long fall fades out and wakes you at the
  last safe ground, with nothing lost. The only meter is grip, while climbing.
- **Small phases**, each one playable, gated and committed (CHECKLIST.md is the ledger).

## 2. Pillars

1. **Scale is the experience.** Every region is built so something enormous is always in view:
   a giant walking through the haze, a statue whose head is a hill, stairs with ten-metre steps.
   Camera, fog, sound (footfalls arriving late, at the speed of sound) and framing all serve the
   feeling of being very small next to something very large.
2. **Guided, never lost.** One clear next thing to do at any moment — the light of your lantern
   points to it — but the world is open and rewards wandering off.
3. **Accomplishment, not survival.** Progress comes from figuring things out and reaching places:
   climbing a giant to the glyph on its brow, ringing a bell to call one, leading one with fire.
4. **The world is the puzzle.** Puzzles are made of the world's own big pieces (giants, water,
   bells, braziers, stairs, wind), not of menus or inventories.

## 2b. Art direction (user, 2026-10-31)

"Very good looking graphics — not realistic, but good. See Shadow of the Colossus." Not
photorealism: a soft, bright, hazy world where light blooms off stone and sky and pours through
whatever stands in front of the sun; colours muted and warm; detailed (textured) ground and stone
under a painterly air. The look comes from light, air and grading as much as from assets:

- **Post pipeline** (`client/src/post.ts`): HDR scene → wide soft bloom → screen-space god rays →
  grade (ACES, gentle desaturation, warm highlights / cool shadows, lifted blacks, soft shoulder,
  film grain, vignette, faint lens fringing).
- **Aerial perspective** (`client/src/atmosphere.ts`): height haze with a warm glow toward the sun;
  distance melts into milky light, but a giant must always read as a silhouette.
- **Textured, art-directed ground**: CC0 PBR layers, each tinted toward the palette (muted greens,
  pale warm sand, grey stone).
- Next: richer trees and giant trees, stone with real texture on the giants and ruins, wind in the
  grass, dust and pollen in the light, soft ambient occlusion.

## 3. The world

One continuous landscape, about 8 × 8 km of playable ground ringed by mountains (the existing
CDLOD terrain, deformable, with lakes). Spawn is a quiet green valley at the centre; three regions
open around it, each with its own ground, plants, sky tint, sound and giant.

| Region | Look | Megalophobia set pieces |
| --- | --- | --- |
| **The Old Wood** | mossy forest floor, ferns, enormous trees (60–150 m) in drifting mist | a sleeping giant grown over with moss and trees; trunks like towers; a giant moving between them, seen only in pieces |
| **The Dune Sea** | wind-shaped sand dunes, red rock arches, heat haze, dust | a giant walking a long loop over the dunes; a colossus buried to the chest; the ribs of a fallen First One |
| **The Steps** | terraced ruins of the First Ones: stairs, colonnades, bridges, bell towers, all at giant scale | the Great Stair; three bell towers; the sealed Gate; the Eldest, the largest giant, waiting beyond it |

Base terrain is shaped per region (`shared/src/terrain.ts`): rolling hills in the Wood, long dune
ridges in the Dune Sea, stepped terraces in the Steps. Region weights are a deterministic function
of position, shared by terrain height, texturing, vegetation and atmosphere.

## 4. What you do

**Verbs:** walk, sprint, jump; **climb** (giants, mossy and carved surfaces) with a grip meter;
**interact** (touch glyphs, ring bells, light braziers, pull levers, read Echo stones); **ride**
(stand on a walking giant and let it carry you); later **glide** (the First Ones' cloak, unlocked
in the story) and **call** (a horn that turns giants' heads toward you).

**The main thread — "The Three Bells":**
- *Prologue (the valley):* wake by a shrine; follow the lantern's light; learn to climb on a ruin;
  touch the first glyph and see a giant stop walking and turn its head toward you.
- *The Old Wood:* the bell tower is sealed by roots. The sleeping giant's body blocks the pass.
  Climb it, touch the glyph on its brow; it wakes, stands (the ground shakes, birds explode out of
  the trees), and walks — its footsteps become the lakes that drown the roots.
- *The Dune Sea:* the bell hangs high in a ruin the walking giant passes under on its loop. Light
  the braziers to bend its path, climb aboard as it goes by, ride it to the ruin and jump across.
- *The Steps:* the three bells ring; the Gate opens; the Eldest rises. The final climb is the
  largest thing in the game, to its crown, where the story ends (and what the First Ones were
  running from is finally seen).

**Everywhere else:** Echo stones (lore, ~30, the First Ones' story in fragments); viewpoints
(climb a high place to light a cairn and reveal that part of the map); shrine puzzles (pressure
plates, rotating rings, reflected light); giants to watch, follow and ride; places nobody points
you to.

## 5. Systems

| System | Module | Notes |
| --- | --- | --- |
| Regions | `shared/src/regions.ts` | region weights from (x, z), deterministic; used by terrain, textures, plants, air |
| Terrain look | `client/src/terrain-view.ts` + `terrain-material` | CC0 PBR texture arrays splatted by region, slope and height; tri-planar on cliffs; two tiling scales against repetition |
| Plants | `client/src/vegetation.ts` | per-region sets; giant trees in the Wood; desert scrub and rock arches |
| Ruins and landmarks | `client/src/structures/*` | textured stone kit at giant scale; every landmark placed by hand in `world.ts` |
| Giants | `client/src/titan.ts`, `shared/src/gait.ts` | AI only: wander, follow a route, sleep, wake, turn to look, follow fire |
| Interaction | `client/src/interact.ts` | registry of things you can use: prompt, range, action |
| Quests | `client/src/quests.ts` | data-driven steps: objective position, conditions on world events, journal text |
| Guidance | `client/src/guide.ts` | the lantern beam to the objective, a compass on the HUD |
| Journal and map | `client/src/journal.ts` | quest log, Echo stones read, map of discovered ground |
| Save | `client/src/save.ts` | world deltas, lakes, quest state, discoveries, where you stand |
| Safety | `client/src/wanderer.ts` | track last safe ground; a fatal fall fades and wakes you there |

Kept from before: CDLOD terrain, deformation kernels, lakes (fill–spill–merge, saved and restored),
the giants' gait and IK, climbing, sky and atmosphere, clouds, birds, wildlife herds, sound.
Removed: towns, townsfolk, caravans, sheep, smoke, boats, settlers, build mode, playing as a
giant, multiplayer, the server.

## 6. Phases

- **A0 — Wanderer only.** Strip towns, building, playing as a giant, multiplayer and the server.
  Giants run their own AI. Everything still walks, climbs, deforms and saves.
- **A1 — The land.** Three regions with their own terrain shape; CC0 textured ground (splatting,
  tri-planar cliffs); per-region plants and air.
- **A2 — The adventure core.** Interaction, quests and journal, the lantern's guiding light,
  narration lines, safe falls, progress in the save.
- **A3 — The First Ones' ruins.** A textured stone kit at giant scale; the Great Stair, bell
  towers, the Gate, the buried colossus, the ribs; Echo stones and viewpoints.
- **A4 — Giants with purpose.** Sleeping giant that wakes and stands; route walker you can ride;
  a giant that follows fire; heads that turn to look at you.
- **A5 — The Three Bells.** The main questline from prologue to the Eldest.
- **A6 — More to find.** Shrine puzzles, the gliding cloak, the horn, the map filling in.
- **A7 — Polish.** Region soundscapes and music, title screen and settings, performance pass.

## 7. Performance budget

60 fps on a recent laptop at 1080p; quality governor keeps it there. Draw calls < 600, triangles
< 3 M, texture memory < 256 MB. Nothing in the frame loop allocates per frame.
