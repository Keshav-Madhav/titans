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

## 2g. Horror, never a jumpscare (user, 2026-10-31: "it still gets very scary often… bring in
## more horrorful elements too, without jumpscares")
Fear here is the slow kind: something is wrong and you notice it late. Nothing leaps, nothing
screams, nothing can hurt you — the dread is that the land is bigger and older than you and some of
it is paying attention. Rules: every unsettling thing **arrives slowly**, is **seen at the edge**
or **heard before seen**, is **never explained**, and **leaves when looked at directly** or goes on
as if you were not there. Rare: each is an event of minutes, not a feature of every walk.
- **The Watchers** (exist): tall shapes at the edge of sight in heavy weather, gone when you turn.
- **Footprints that were not there**: a line of giant footprints across the Green in the morning
  — fresh, filled with water — though no giant walked there in the night.
- **The pale walker**: in fog at dusk, a giant far off walks *toward* you, never closer, never
  further, however you run; when the fog thins it is not there.
- **Stillness**: now and then every sound in the land stops — wind, insects, birds — for half a
  minute; something enormous passes beyond the hills; then the crickets start again, one at a time.
- **The eyes in the wood**: at night in the Old Wood, pairs of pale lights between the trunks,
  far too high above the ground, that close when you look.
- **The hand moves**: the Drowned One's lifted hand is not always as you left it.
- **The deep note**: under the score, very rarely, a sound too low to hear well, as if the ground
  itself had spoken.

## 3. The world

One continuous landscape ringed by mountains (CDLOD terrain, deformable, with lakes): the lands
reach ~10.4 km from the centre (`LAND_EDGE`), the mountains rise fully by ~17 km, the Wall — a
range 1.5–3 km high — stands at 18–28 km, and beyond it, 30 km out and 9.5 km tall, the Ones
Beyond. A day is 24 minutes (four-fifths of it light); weather cycles overcast → storm → breaking
→ clear, and the cloud comes down in storms.

| Land | Look | Its enormous things |
| --- | --- | --- |
| **The Green** (centre, where you wake) | vast smooth rolling grass, nearly empty; wildflowers, tall stems, hares | the Sentinel kneeling on its north rim; the Walker and the Grey One; the Undercroft beneath it; the Hanging Steps |
| **The Old Wood** (north-west) | broadleaf and pine forest, ferns, giant trees; marsh patches in its low ground | the Grove of giant trees; the Drowned One lying in the biggest marsh, one hand lifted |
| **The Dune Sea** (south) | rippled dunes, red rock mesas and hoodoos, canyons; sandstorms | the Fallen (ribs and skull); the Sword; the herd of five |
| **The Steps** (north-east) | terraced ruins, dry grass, pines | the Colonnade; the Great Stair and the sealed Gate; the chained stones |

Still to come (`STORY.md` §6): **the Shore** beyond the Dune Sea, **the High Places** beyond the
Steps.

**Carved, not rolling.** The heightfield carries the big forms (an escarpment round the Green,
fault walls, mesas, canyons, rock spines, marsh hollows); signed-distance rock formations carry
arches, caves, overhangs, hoodoos, spires and the colossi. Rock is climbable; anything steeper
than ~50° cannot be walked up.

## 4. What you do

No plot (§2f): you are a visitor, curious. **Verbs:** walk, sprint (a long run on open ground),
jump; **climb** giants, colossi and rock (grip); **ride** a walking giant; **glide** with the
wing-cloak (real flight: dive, pull up, bank, stall, ridge lift); **shoot** the bow; **call** with
the horn; **look through** the sight-stone; **read**, **take**, **strike**, **offer**, **light**.

**Controls:** WASD move · mouse look (click to capture; right-drag without) · Shift run (hold:
long run) · Space jump / hold to glide · E climb, read, take, use · Q (or right mouse) draw the bow,
F (or click) loose · H blow the horn · V look through the sight-stone · M map · J journal · I bag.

**What there is to find** — the discovery roster (`discovery.ts`, journal and bag):
places and those who live here (found by going there); words on stone; the traveller's camps and
pages; trinkets on the high places; relics raided from the giants' backs; wisps to chase; ringing
stones; stone eyes for the bow; glyph trails for the sight-stone; the Hanging Steps; the mound a
giant must break; watching the giants; offering shrines; cairns (and their embers); the
awakening of the Ones Beyond. Tools found in the world open new kinds of these: the bag, the horn,
the bow, the wing-cloak, the sight-stone.

## 5. Systems

| System | Module |
| --- | --- |
| Regions, terrain, marsh pools | `shared/src/regions.ts`, `terrain.ts`, `mire.ts` |
| Ground look | `terrain-view.ts`, `terrain-material.ts` (texture arrays, splat, tri-planar cliffs) |
| Plants, trees, grass | `vegetation.ts`, `trees.ts`, `grass.ts` |
| Rock and colossi | `rock-fields.ts` (SDF shapes), `rocks.ts` (meshing on workers, collision), `colossi.ts` |
| Giants | `titan.ts`, `armor.ts`, `herd.ts`, `shared/src/gait.ts`, `brain.ts` |
| Sky, weather, air | `sky.ts` (day and night), `weather.ts`, `atmosphere.ts`, `clouds.ts`, `mist.ts`, `post.ts` |
| Life | `ambience.ts` (fireflies, butterflies, birds, hares), `life.ts`, `wildlife.ts`, `striders.ts`, `leviathans.ts`, `watchers.ts` |
| You | `wanderer.ts` (body, cloth, flight), `climb.ts`, `cliff.ts`, `camera-rig.ts` |
| Discovery | `discovery.ts`, `journal.ts`, `bag.ts`, `toolbar.ts`, `spots.ts`, `camp.ts`, `wisps.ts`, `resonance.ts`, `eyes.ts`, `bow.ts`, `glyphs.ts`, `parkour.ts`, `offerings.ts`, `cairns.ts`, `awakening.ts` |
| Map, save, sound | `map.ts`, `save.ts` (key v3), `audio.ts` (all synthesised) |

## 6. Phases

Done (see `CHECKLIST.md`): A0 wanderer only · A1 the land, carved · A2 map, the long run ·
A3 colossi, dread, eroded giants · D discovery (bag, journal, tools, the roster) · E day and night ·
F hands and toolbar · G a living land · H a bigger world, marshes.

Next, a little of each at a time:
- **B1 — Dread.** §2g, one piece at a time, each rare and slow.
- **B2 — More adventure.** New roster pieces and new tools; finds that connect across lands.
- **B3 — The Shore**, then **B4 — the High Places.**
- **B5 — Polish.** Title screen and settings, region soundscapes, performance pass.

## 7. Performance budget

60 fps on a recent laptop at 1080p; quality governor keeps it there. Draw calls < 600, triangles
< 3 M, texture memory < 256 MB. Nothing in the frame loop allocates per frame.
