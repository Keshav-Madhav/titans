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

## 2c. Dread, not jumpscares (user, 2026-10-31, with reference images)

"Scary, but not by jumpscare — by ambience, music, lighting, weather and the general megalophobia
of seeing hugeness." The references: a pale, spindly many-legged thing towering over hills under
a winter sky; a robed figure in grey-green fog beside a gaunt stick giant; wind-turbine bases on a
green field (mundane hugeness); a long-necked creature whose head is lost in storm cloud while
shafts of sun come down ("the idea of getting cut off by storm clouds"); the Tokyo flood tunnels'
pillared hall; someone sitting on a ledge of a giant clock tower (vertigo).

So:
- **Weather is the main instrument** (`client/src/weather.ts`): a low cloud deck (base ~255 m)
  that tall things vanish into; overcast as the resting mood; storms with rain and lightning
  flickering in the cloud; breaks with sun shafts. The grade, sky, light and fog follow it.
- **Things too big to understand, at a distance**: striders on 500 m legs whose bodies are lost
  in cloud (`client/src/striders.ts`), leviathans, colossi beyond the mountains. They never chase
  you. Nothing jumps out.
- **Sound carries it** (`client/src/audio.ts`): a slow, sad generative pad, sparse glass notes,
  far horns groaning, rain, wind, thunder arriving late; a long hall reverb; the drone swells
  under storm and near colossi.
- **Vast, dim spaces and vertigo**: pillared halls in the dark; ledges high on the colossi.

## 2d. Impossibly big, impossibly far (user, 2026-10-31, with a Shadow of the Colossus still)

"Being able to see into the distance and still see something so impossibly big that you know you
can't reach it — and if you ever did, its size would be incomprehensible. The scary part: a rare
event where that thing animates, and the game takes the camera to pan smoothly to it, and you watch
it move, with dread." So:
- **A much bigger world** — lands far larger and more open, so the big things look bigger still,
  and some things are clearly beyond the world's edge ("offworld").
- **Rare awakenings**: a far colossus moves (turns its head, takes a step, lifts an arm) maybe once
  an hour; the camera is taken, pans to it, holds, the sound drops to a drone, then gives control
  back. Never a jumpscare: slow, inevitable, and you see it coming.

## 2e. Space (user, 2026-10-31: "it feels overcrowded… make it much bigger, distance the giants
## a lot too… either a lone giant looming over hugely, or smaller but big giants together like a
## herd, or a big tree forest, or a huge rolling plains — even huge empty rolling plains with
## grass give the feel of megalophobia")
Big things next to big things cancel each other out; emptiness and distance carry the scale. So:
- **The world grows ~2.6×** (`SPREAD` in `shared/constants.ts`): the lands reach ~7 km before the
  mountains, the mountains are wider and higher, the far colossi stand ~21 km out and ~5 km tall.
- **One idea per place**, with long empty approaches between them:
  - *the Green* (the centre, where you wake): vast smooth rolling grass, almost nothing on it; a
    lone giant walks it, far off; the Sentinel kneels at its northern rim, alone, looming;
  - *the Old Wood*: the giant trees together, a forest of them, nothing else that big;
  - *the Dune Sea*: the dead colossus (ribs and skull) as one scene, the sword far from it;
  - *the Steps*: the Great Stair and Gate, the colonnade, the chained stones;
  - *a herd*: several smaller giants (120–200 m) roaming together across open ground.
- Travel stays a pleasure: a faster run on open ground, and riding a walking giant to cross a land.

## 2f. Discovery, not plot (user, 2026-10-31)
"Environmental storytelling: giants own the lands, they live here, they don't go anywhere; we are a
visitor, simply curious… quests about discovery through puzzles or targets or missions, rewards
in trinkets, artifacts, lore." And: "a lot of mechanics so it doesn't get boring or repetitive —
lore stones, abandoned camps, raiding something, chase the light, terraform this to uncover, a
puzzle, a parkour thing… find more."

Knowledge goes in the **journal** (J: places, those who live here, words on stone); things go in
the **bag** (I: relics, trinkets) — and the bag is itself the first thing you find (a camp just
ahead of the start; until then small things stay where they lie).

The mechanics roster — each a kind of thing placed many times, each with its own reward:
1. **Words on stone** — carved stones left by earlier visitors; read one (E) → lore.
2. **Abandoned camps** — one traveller's camps across the lands, in order: a page and a thing at
   each; follow them and you follow their journey (the bag is at the first).
3. **High places** — trinkets left on the hardest tops (spires, mesas, pillars, the Sentinel's
   hood), glinting so you see the target from far off; climb to them.
4. **Raiding the giants** — a relic in the shrine on each walking giant's back; climb it while it
   walks and take it. It is not pleased: it shrugs hard, and may try to shake you off.
5. **Chase the light** — a wisp near a ruin: it flees as you come, leading you somewhere; keep up
   and it settles on what it was showing you.
6. **Resonance stones** — standing stones that hum when struck; the carving says in what order.
   Right, and the ground opens / something rises.
7. **Uncover** — something buried: get a giant to stamp the ground open (lead it, or stand where
   the herd grazes), or drain a pool, and see what was underneath.
8. **Parkour** — floating stones and broken pillars in a line, a jump and a climb each; a trinket
   at the end.
9. **Watching** — things the giants do, seen from close: the Walker drinking, the herd's young,
   a giant lying down; stay still long enough and you learn something (lore).
10. **Riding** — stay on a walking giant across a land (a page from someone who did it first).
11. **Cairns** — the high places' beacons (exist); all of a land's lit → an artifact.
12. **Offerings** — a shrine that takes a trinket from your bag and gives back words.

**Tools — progression (user: "artifacts found become items that can be used, like a bow is found
and then bow type puzzles unlock").** Each tool is found somewhere that teaches it, and opens a
kind of thing you could see before but not reach:
- **The Old Bow** (the Undercroft's altar) → stone eyes high in stone (three to a set: close them
  all and what they watch over is let go); later, bells on chains to ring or drop, wisps to pin.
- **The Horn** (from the herd's grazing) → call a giant to you (and ride it); make the ringing
  stones answer from far off; startle the herd.
- **The Wing-cloak** (top of the Great Stair) → glide from high places: the floating stones, the
  chasm crossings, the long way down from the Sentinel's hood.
- **The Sight-stone** (the Grove) → hold it up to see the glyph-trails the First Ones left: hidden
  paths to caches, doors that are only there when looked at.

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

**More lands, eventually** (user, 2026-10-31: "distinct biome zones… very curvy smooth green
rolling hills with dense grass, desert, mountains, swampy, forest, old forest, ocean/beachy…
progressive, pick it eventually"). The roster and each land's enormous thing are drafted in
`STORY.md` §6; they arrive one at a time.

**Carved, not rolling** (user, 2026-10-31: "massive rock walls and cliffs and valleys and caverns…
like Colossus or ARK"). The heightfield carries the big forms — an escarpment ringing the valley
with three passes, fault walls, mesas, canyons, rock spines — and rock formations made as signed
distance fields carry what a heightfield cannot: arches, caves, overhangs, hoodoos, spires. Rock is
climbable (grip), and anything steeper than ~50° cannot be walked up.

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
