# TITANS — phase ledger

Tick a box only when it is proven (`npm run build` clean + the phase gate passes) and committed.
Each phase ends playable. Phases are in PLAN.md §6.

# The adventure (user, 2026-10-31: "scrap the plan… a full game made around Megalophobia")

## A0 — Wanderer only
- [x] Checkpoint of the old world committed and tagged `pre-adventure`
- [x] Removed: towns, townsfolk, caravans, sheep, smoke, boats, settlers, build mode, playing as a
      giant, multiplayer (client net code, the Colyseus server workspace and its gates)
- [x] The giants walk by their own AI; footprints, lakes, sleeping giants and climbing unchanged
- [x] Narration log replaces chat; hints rewritten for the wanderer (walk, take hold, climb high)
- [x] Fresh save key (`titans.adventure.v1`): the new land will not match old worlds' ground
- [x] Gates: `single.mjs` rewritten (hints, sound, giants wander, exact reload, a resting giant falls
      asleep while you are away, new adventure); shots ground, aerial, closeup, walk, titan, climb,
      rest, ruins, sky, titanlook, wildlife, trail, lakes (now waits for merged lakes to fill)

## A1 — The land
- [x] Regions (`shared/src/regions.ts`): valley, Old Wood, Dune Sea, Steps, ringed by mountains
      from ~2.7 km; weights shared by terrain, ground, plants
- [x] Terrain shaped per region: rolling woods, dune crests across the wind, 16 m terraces
- [x] CC0 textured ground (8 Poly Haven layers, 6.8 MB, `tools/pack-textures.py`): texture arrays,
      splat weights per vertex by land, slope, height and giants' digging; height-blended;
      tri-planar cliffs; far sample + detail noise against tiling; per-layer art-directed tints;
      canopy colour from afar in the Old Wood
- [x] The look (user, 2026-10-31: "very good looking… see Shadow of the Colossus"): post pipeline
      — bloom, god rays, grade, grain, vignette (`client/src/post.ts`); off at the lowest quality
- [x] No trees in the Dune Sea; dry scrub there; greener tufts in the meadows
- [x] Leaf-card trees (`client/src/trees.ts`): crowns of alpha-cut leaf cards with crown normals
      (soft, painterly), firs of drooping needle-branch cards; leaves flutter; one drawn texture
- [x] Giant trees in the Old Wood (`colossi.ts`: 22 trunks of bark and moss, crowns at every limb's
      end meeting into a roof; the Grove)
- [x] Air per region (`client/src/motes.ts`, one draw call round the camera): grit and low sheets
      of blown sand in the Dune Sea, spores hanging in the Old Wood, seed tufts on the Green; lit
      bright against the sun; eased in as you cross a border; none in rain, none up high

## A1b — Carved land (user, 2026-10-31: "hills, massive rock walls and cliffs and valleys and
## caverns… properly carved terrain like Colossus or ARK")
- [x] Carving in the base terrain (`BaseTerrain.carve`): an escarpment of layered rock ringing the
      valley with a pass toward each land; fault walls stepping the land up 25–70 m; big mesas with
      banded sides; a few deep winding canyons with flat floors; rock spines through the Old Wood.
      `npx tsx tools/terrain-map.ts` draws the whole map (no browser) for shaping
- [x] Slopes steeper than ~50° cannot be walked up: you slide
- [x] Cliff climbing (`client/src/cliff.ts`): E at a wall takes hold of the rock itself; W/S up and
      down, A/D across; grip drains; standing again where it lays back; fall when spent
- [x] Rock formations (`client/src/rocks.ts`, `rock-fields.ts`, `rocks-worker.ts`): ~96 arches,
      caves with chambers, hoodoos, overhangs, spires and boulder piles — signed distance fields
      meshed by surface nets in a worker, gradient normals, field occlusion, tri-planar rock with
      moss/sand on top; their fields are collision (walk through caves, onto ledges)
- [x] Terrain diagonals alternate (no rows of saw teeth on distant cliffs); the sun's HDR clamped
      before bloom and rays (looking into it no longer floods the frame); rays only near the frame;
      clouds above the raised land; no green bushes in the Dune Sea
- [x] The First Ones' trails keep to the valley inside the cliffs (the old walkers steer round
      the start and away from rising ground)
- [x] Lakes: the memory of pairs already tried is keyed by shape (lowest cell + size), not id —
      spill re-made the same pool under new ids and the refill cycled for ever; settles in 0.4 s
- [x] Gates: `shot.mjs carved` (each land's tallest wall; climbs the desert's), `shot.mjs rocks`
      (one of each formation; walks into a cave); all earlier gates re-run green

## A3a — The colossi (user, 2026-10-31: "again megalophobia, not just trees or giants, everything")
- [x] The Sentinel: a First One ~380 m tall, kneeling on the valley floor's north edge, robed and
      hooded (nothing but dark under the hood), hands on a planted sword — the first thing you see
- [x] The Dune Sea: the ribs (11 arches along a buried spine) and skull of a fallen First One; a
      stone sword 300 m long driven into the dunes
- [x] The Steps: a colonnade of nine fluted pillars up to ~840 m, into the clouds, some broken with
      their drums fallen; the Great Stair (12 m steps) up to a platform and the sealed Gate
- [x] The Old Wood: eleven giant trees (150–240 m), root buttresses like ridges, crowns of leaf cards
- [x] The sky: nine monoliths hanging in the air (the low ones held down by iron chains); three
      leviathans (~560 m, finned) swimming a kilometre up, their shadows crossing the land
- [x] Beyond the mountains: three colossi 2.6 km tall standing in the haze, facing the valley
- [x] All of it solid (fields as collision) and climbable: climbing generalised from terrain to any
      distance-field solid (`CliffClimb.startOn`), holds found by reaching out to the face you
      look at; giants steer round the colossi
- [x] Stonework textures (2 more CC0 layers: large sandstone blocks, dressed stone); bones in pale
      stone; flat-ground site finder for every colossus; sun moved to the south-west so the view
      north to the Sentinel is lit; free camera for tools (`g.lookFrom`)
- [x] Gate: `shot.mjs colossi` (each colossus from where a wanderer stands; a leviathan; a far
      giant; climbs a pillar)

## A3b — Dread: weather, striders, sound (user, 2026-10-31, reference images: "scary… by
## ambience, music, lighting, weather and general megalophobia")
- [x] Weather (`weather.ts`): overcast / storm / breaking / clear, eased between on a cycle; a
      7-layer noise cloud deck from ~255 m that giants' heads, the Sentinel's hood and the pillars
      vanish into; GPU rain; lightning flickering inside the cloud; sky, sun, fill, fog, puffs
      and the grade (mood: greyer, teal, dimmer) follow it; sun disk clamped under cloud
- [x] Striders (`striders.ts`): three pale things on 4 legs ~800 m long, a spined body at ~470 m,
      a neck rising higher, threads hanging; walking the far lands, one foot at a time
- [x] Score and weather sound (`audio.ts`): long hall reverb; a slow generative pad through five
      sad chords; sparse glass notes (fewer under storm); far horns groaning; rain; storm wind;
      thunder arriving late; the drone swells under storm and near colossi (`awe`)
- [x] Framing tool for screenshots (`g.frame`): clear line of sight over land and out of the
      woods, camera low, the wanderer in frame for scale (shots were looking at hillsides)
- [x] The First Ones' trails keep wide of the giants' starting places (a giant stood over an
      old 17 m crater and could not be climbed)
- [x] The Undercroft (`hall.ts`, shared `HALL`): a hall of 24 pillars 16 m square, 70 m under the
      valley floor south of the start — the ground cut away in the base terrain; a stone plaza roof
      with skylights; a long stair down from the west rim; shafts of daylight; darkness baked into
      the atmosphere shader (everything under the roof dimmed, lit under the skylights); no rain
      under the roof; invisible-wall fix (roof holes a little wider than their tiles in the field)
- [x] Gate: `shot.mjs undercroft` (plaza, floor, rows, stair; walks down the stair)
- [x] Watchers (`watchers.ts`, user's reference: a gaunt stick giant in fog): nine figures of
      branch and root, 34–70 m, on rounded rises below the cloud deck; seen only under a heavy
      sky, coming slowly out of the haze; they turn to face you over a minute; gone (thinned into
      the fog) before you can reach one. Lesson: a fading transparent mesh must still write depth,
      or the cloud deck and puffs drawn after it — though farther away — paint over it
- [x] Vertigo ledges: at the lip of a long steep drop (out to 9 m, eight ways, steeper than 1.2:1, no
      rock underfoot; 10 m faint … 60 m full) or high on a giant's shoulders (60–200 m), the view
      widens up to ~6° and breathes, a faint sway, the wind rises; eased in over ~2 s. A 140 m lip:
      0.84 → 1.0 (fov 67°); 40 m back from it: 0. `__g.vertigo` for tools

## A1c — The wanderer and the grass (user, 2026-10-31: "focus on visuals and feel")
- [x] The wanderer (`wanderer.ts`): a body (tunic, jointed legs, boots, swinging arms), a deep
      pointed hood with the face in shadow, a mantle; a cape and a scarf simulated as verlet cloth
      (pinned at the shoulders, kept out of the body and the ground, streaming when you run,
      gusting in the weather's wind); walk/run/idle/air/slide/climb poses; a lantern at the hip
      that makes a warm pool of light in dark places. Gate: `shot.mjs hero`
- [x] Grass (`grass.ts`): up to 30k alpha-cut cards round the camera, densest in meadows; waves
      rolling with the wind (flat in storms), parting round you, sinking away at its range edge

## A2a — The map (user, 2026-10-31: "have a map/minimap openable")
- [x] `map.ts`: a round minimap (north-up, 1.8 km across) and the whole map on M — shaded relief,
      the lands' colours, contours every 25 m, lakes, the colossi you have seen (named), giants
      walking, you; uncovered as you explore, much further the higher you stand; saved (packed
      bits); `% seen`
- [x] Gate: `shot.mjs map` (wandering uncovers it; climbing high uncovers far more)

## A2b — Impossibly far (user, 2026-10-31: "a rare event which causes that thing to animate and
## the game snatches the camera… to smooth pan to it and see it move with a kind of dread")
- [x] `awakening.ts`: rarely (25–60 min), and once after the first cairn is lit, a colossus beyond
      the mountains moves — never one standing in the sun's glare. Bars close in, the wind and
      score fall away, a far horn; the camera turns to it on a longer lens that keeps the land in
      front; the cloud parts (`weather.part`); it turns toward you and takes one step; the sound
      of it arrives seconds later with a long low rumble (`audio.colossal`); control comes back
- [x] Aerial perspective: haze averaged exactly along the ray (thick low air counts on a climb up
      to a tall far thing), and a floor of haze over kilometres; the cloud fade never a flat cut-out
- [x] The block giants: a ruined shrine on the back's hump, a glowing glyph unless petrified;
      smaller eyes; uneven stone horns, some broken. Colossi meshed on a pool of up to 3 workers
- [x] Gate: `shot.mjs awakening` (stepped: true), `giant` (giant-shrine), single, climb, rocks

## A1d — Space (user, 2026-10-31: "it feels overcrowded… much bigger, distance the giants… a lone
## giant looming, or a herd, or a big tree forest, or huge empty rolling plains")
- [x] The world grows 2.6× (`SPREAD`): lands to ~7 km, wider and higher mountains, terrain root
      65 km, map 21 km (512² seen-grid), save key v2; far colossi 4.8 km tall at 21 km
- [x] The Green: the centre is now vast smooth rolling grass (swells ~70 m, ~1.2 km apart), its
      trees, scrub and stones thinned to almost nothing; the ground levelled round the Undercroft
- [x] One idea per place: the Sentinel alone at the Green's north rim; the lone giant walking its
      empty east; 16 giant trees together as one forest in the Old Wood; the dead colossus (ribs,
      skull) and the sword kilometres apart in the Dune Sea; the chained stones in a row at the back
      of the Steps; rock formations spread over 7× the area with not quite twice the count; mesas
      rarer, sheer and ragged; canyons and faults longer and grander
- [x] Broadleaf trees: a stout visible trunk and a broad flattened crown (they read as dark blobs
      floating over the grass)
- [x] Gate: `shot.mjs vistas` (from spawn toward each land), lands, fill-bench, single, climb,
      undercroft, cairns, rocks, fall
- [x] A herd (`herd.ts`): five giants of 120–190 m roaming the eastern Dune Sea together — the
      biggest leads, two flank, the young keep to the middle; they drift to a far open point,
      graze a while, move on, keeping room between them; climbable (`h1`…`h5`). Gate: `shot.mjs herd`
- [x] The Wall (user: "very very far edge mountains… very tall… unreachable… silhouettes in the
      fog's background, still smaller than giants"): a range 1.5–3 km high from ~13 km out; the
      colossi stand beyond it, 8 km tall at 24.5 km, darkened to silhouettes, chest and head clear
      above its crest; aerial haze thins with height. Gate: `shot.mjs wall`, awakening (stepped)
- [x] The long run: a held sprint over open, level ground lengthens over ~5 s from 8.5 to 14.5 m/s
      (longer strides, not just faster; the view widens a little); it falls away on a hard turn, a
      climb or a stop. Gate: `shot.mjs run`
- [x] Riding a walking giant across a land: blow the horn from its back and it walks the way you look (D, the horn)

## A3c — Colossi of eroded rock (user: "comprehensible giants… like the gemini inspiration shots")
- [x] Held to `concept/awakening.jpg`: the body is eroded rock — broad swellings, folded ridges,
      grit (bulge noise ~4× what it was; climbing walks the same surface) — under the weathered,
      cracked hide whether awake or asleep (dressed masonry read as a building that walks); darker
      stone; armour cut to a few great pieces (breastplate, pauldrons, spine shells, mask, knee,
      greave, one bracer) in darker weathered stone; fur drawn as tapering locks (it was drawn
      upside down: every card ended in a hard full edge, rows of tiles)
- [x] Walking giants crumble: stones shaken loose fall from the body with a little dust, faster
      the faster they go (`effects.shed`)
- [x] Gate: `shot.mjs giant`, herd, climb (peak 242 m, rides), single

## A3d — Dread at this scale (user: "more scary without jumpscares")
- [x] The cloud comes down in a storm: the deck's base moves with the weather (clear 330 m,
      breaking 275, overcast 250, storm 185 — packed with the cover into the fog's `far`), so in a
      storm the giants walk with their heads in cloud and the high ground is lost
- [x] Lightning reveals: in a flash the cloud goes thin for an instant — whatever stands in it, and
      the colossi beyond the Wall, show as shapes and are gone again
- [x] The presence (`audio.presenceBed`): a low, slow-breathing hum and rumble that rises over
      seconds when something enormous is near (giants, the herd, the colossi), louder in the murk
      where you can't see it — never a sting
- [x] Gate: `shot.mjs weather` (storm swallows the Sentinel to the waist)

## D — Discovery (user: environmental storytelling; "a lot of mechanics"; "the first thing we find is a bag")
- [x] D1 `discovery.ts` (hand-written catalogue + what is found, saved), `journal.ts` (J: places,
      those who live here, words on stone; a hint for each missing one; the card that rises)
- [x] D1 Places and giants found by going to them (the Green, the Sentinel, the Undercroft, the
      Grove, the Fallen, the Sword, the Colonnade, the Great Stair, the Chained Stones, the Wall;
      the Walker, the Grey One, the Herd, the Ones Beyond, the Striders)
- [x] D2 The bag (`bag.ts`, `camp.ts`): the first thing you find, at a camp just ahead of the start
      (red cloth snapping in the wind); until then small things stay where they lie; I opens it —
      each thing drawn (`drawIcon`), named, described; unlimited
- [x] D3 Words on stone (`spots.ts`): 12 carved stones by those who came before (E to read, again any
      time) — at the Sentinel's knee, in the Undercroft, under the ribs, by the Sword, before the
      Gate, in the Grove, the Colonnade, on a mesa, under the chains, near the Herd, the western
      Green, under the arch
- [x] D3 Trinkets on the high places: 12, each on a standable top (the Sentinel's hood 370 m up,
      the tallest pillar 812 m, a chained stone 373 m, the ribs, the skull, the Stair, a spire, the
      arch…), glinting bright enough for the bloom to catch from far off
- [x] D4 Raiding: a relic in the glowing shrine on each walking giant's back (the Walker, the Grey
      One, the herd's five); climb to it and it is yours — the giant shrugs hard to shake you, the
      glyph goes dark (saved). Gate: `shot.mjs raid` (taken at 258 m, it shrugged)
- [x] D5 Chase the light (`wisps.ts`): three wisps (the western Green, the Grove, the Dune Sea's
      hoodoos); come near and it darts to its next place up the land and waits; at the end it sinks
      into the ground and leaves a trinket. Gate: `shot.mjs wisp`
- [x] D6 Resonance stones (`resonance.ts`): two rings (the Steps, an Old Wood clearing) of four
      stones of different heights; each hums its own note when struck (tall low, short high); the
      slab's carving shows the order as bars of heights; wrong → silence, start again; right → they
      answer each other and the slab sinks, leaving what it kept. Gate: `shot.mjs resonance`
- [x] D7 Tools — progression (user: "artifacts found become items that can be used… a bow… bow
      type puzzles unlock"). The Old Bow (`bow.ts`) on an altar at the Undercroft's far end, a stone
      beside it: hold right mouse / Q to draw (camera over the shoulder, a mark), click / F to loose;
      arrows fly a solved arc to whatever is under the mark. Stone eyes (`eyes.ts`): three sets of
      three (the Undercroft's pillars, the Sentinel, a mesa's cliff); close a set and what it watched
      over is let go. Tools sit first in the bag. Gate: `shot.mjs bow` (every set closed, all taken)
- [x] D8 The traveller's trail: four camps (the bag's, the Dune Sea near the Herd, the Old Wood's
      edge, the foot of the Great Stair), a page at each (E to read) — one visitor's journey, and
      where they left their things
- [x] D8 The Horn (camp 2): H blown on the ground — the nearest walker comes to see what made the
      noise and stands looking; blown from its back — it walks the way you look (30 s): riding.
      Gate: `shot.mjs horn` (came 1.4 km → 130 m; rode 279 m east)
- [x] D9 The Wing-cloak (top of the Great Stair, where the last page said): falling with Space held,
      it opens — a wing from wrist to wrist — you sink at 2.6 m/s and sail at 15 m/s the way you
      lean, and land soft from any height. Gate: `shot.mjs glide` (sailed 437 m coming down 172 m)
- [x] D9b Flight as physics (user: "so players can master it and it isn't just pressing W"): lift and
      drag with the square of airspeed; W lowers the nose (dive, gain speed), S raises it (climb,
      bleed speed), A/D bank (turns; steep turns sink); below ~8 m/s the cloak stalls; ridge lift
      off steep ground ahead. Body leans with bank and pitch; the camera swings round behind; its
      own hints and a "Flying" badge. Gate: `shot.mjs flight` (hands-off 362 m in 25 s losing 59 m;
      held W dives to 35 m/s; held S stalls at 5 m/s)
- [x] D10 The Sight-stone (the Grove, as the third page said): hold V — the view darkens at the
      edges and the First Ones' marks show, glowing, over the grass in a line, a column of light at
      the end; stand at the end still looking and the cache there shows itself. Three trails (from the
      stone through the Grove, from the first camp across the Green, from the Colonnade over the
      terraces), stepping round anything solid. Gate: `shot.mjs sight`
- [x] D11 Parkour: the Hanging Steps (`parkour.ts`) on the western Green — 26 slabs and blocks held
      still in a rising spiral: hop the short gaps, climb every third, a trinket at the top (50 m).
      Gate: `shot.mjs steps` (every slab stood on)
- [x] D12 Uncover: a grassy mound on the eastern Green with a carved corner poking out (a stone beside
      it: "we could not dig it… they could"); a giant's foot on it breaks it open — lead the Walker
      across it with the horn — and the stone box inside is yours. Gate: `shot.mjs uncover`
- [x] D12 Watching: stand still near the Walker, the Grey One or the Herd for 18 s ("Watching… ●●●○○")
      and you learn something of how it lives
- [x] D12 A land's cairns all lit → an ember from them (the Old Wood, the Dune Sea, the Steps)
- [x] Offerings: a shrine that takes a trinket and gives back words (`offerings.ts`; gate `shot.mjs offer`)
- [x] Made stones (words, ringing stones, the camp) in the carved texture, not plain grey boxes
- [x] Chained stones are solid now (they were skipped as "floating": unclimbable though still)
- [x] Gate: `shot.mjs discover`, `bag`, `spots` (every trinket placed on a level top and taken)

## E — Day and night (user: "a day night cycle with a bright moon and starry sky"; "make the night much shorter")
- [x] A 24-minute day (`sky.ts`): the sun rises east, crosses the south no higher than 40°, sets
      west over four-fifths of it; a short night. Twilight (the physical sky goes black under the
      horizon): deep blue-violet overhead, warm where the sun went; the air the same colour. Night:
      the moon opposite (the key light then — moonlit shadows), 4 200 stars with a milky band, the
      cloud deck and puffs moonlit and dark, the wanderer's lantern lit, the eye opened a little
      (exposure). The weather dims whatever the time of day sets (`sky.lightBase`). Tools hold the
      clock still (`sky.running`) and set it. Gate: `shot.mjs daynight`

## F — In hand, and the toolbar (user: "work on ui and icons… even hand models")
- [x] Hands: a mitten of palm and fingers and a thumb (they were balls)
- [x] Tools held in use, each with its pose: the bow in the left hand, arm straight out, the string
      hand drawn to the cheek; the horn to the mouth; the sight-stone before the eye
- [x] The toolbar (top left): the tools you have found, drawn, with their keys; the one in use lifts
      and lights. Gate: `shot.mjs hands`
- [x] "New": what you found since you last looked wears a mark in the journal and the bag, and the
      J / I keys in the hint bar glow until you do; the journal's entries carry a drawn icon of
      their kind (a peak, a giant, a carved tablet)

## G — A fuller, living world (user: "fireflies and bug noises, small animals… distant birds… more plants… fuller, more real, within performance")
- [x] `ambience.ts`: fireflies at dusk and night low over the Green and the Old Wood (none on sand),
      each blinking its own slow pattern (one draw call); butterflies by day out of the rain; big
      dark birds turning slow circles round the giants' heads (something to measure them by)
- [x] Sounds of the living land (`audio.ts`): crickets at night, cicadas by day (both quieter in rain,
      louder where it is green), birdsong now and then by day, frogs croaking at night
- [x] Far trees keep a trunk you can see (a crown with a sub-pixel trunk hung in the air)
- [x] Weather of the lands: in the Dune Sea a storm is a sandstorm — ochre sky, deck and air, thick
      (fog ×10), grit racing flat on the wind, the grade keeping its warmth; after rain, with the
      sun low behind you, a rainbow (42° round the anti-sun point); mist thickest in the hollows at
      dawn and dusk. Gate: `shot.mjs lands_weather`
- [x] More plants: ferns over the Old Wood's floor and along its edges (arching fronds), stands of tall
      flowering stems out on the Green's meadows (four colours); trees and plants grow to 400 m again
      (the lands stand higher since the world grew — a 200 m cap had bared the high woods)
- [x] Small birds burst up out of the grass ahead of you as you run through it by day (wingbeats,
      alarm chips)
- [x] The herd's footfalls: dust, the ground shaking near them, the sound arriving late (they were silent)
- [x] Looming: on the ground near a giant the lens widens a little (up to 9°): the near huge thing huger
- [x] D13 Offerings (`offerings.ts`): three shrines (the Colonnade, the Fallen, the Hanging Steps), each
      with a carving of a small thing found elsewhere — the picture is the puzzle; hold it over the
      bowl and the carving lights and it answers (lore). Gate: `shot.mjs offer`
- [x] Hares in the grass near you (by day and dusk, on green ground): they sit and nibble, and bolt
      in zigzag hops when you come within 14 m
- [x] Riding camera: on a walking giant the view pulls back and up and slowly turns to its way; the
      camera's occluder knows the held giant's body (it no longer ends up inside a leg)

## H — A bigger world, and the Mire (user: "make the map bigger too, we are not limited")
- [x] The lands reach ~10.4 km before the mountains (`LAND_EDGE`, `MOUNTAINS_FULL`), the Wall moves
      out to 18–28 km, the colossi beyond it to 30.5 km and 9.5 km tall; the map covers 26 km;
      save key v3
- [x] The Mire (a fifth land, `regions.mire`, beyond the Old Wood from 7.3 km): the land let down
      into a wide, nearly level basin with hummocks; round pools with wobbling shores sunk 4 m into
      it (`shared/mire.ts`, the same pools for the ground and the water); still black water in
      them (`client/mire.ts`), drowned grey trees, reeds thick on the banks, black mud and leaf-rot,
      no living trees, green-grey close air (fog ×3), mist, frogs, fireflies
- [x] The Drowned One: a kneeling colossus sunk to the chest at the Mire's heart, mossy; a stone on
      the bank, a crown of moss on its hood. Gate: `shot.mjs mire`
- [x] (user: "a giant repeated… marsh is supposed to be more patchy and not this big… terrain
      simplified… trees floating") The marsh is patches now — low hollows among the Old Wood's hills
      a few hundred metres across (its weight taken from the Wood's, so the hills fade out there,
      not a flattened basin), the biggest round the Drowned One; the outer north-west is Old Wood
      again. The Drowned One has its own form (`reclining`): lying on its back, only the face, the
      chest, a drawn-up knee and one lifted hand, fingers half curled, above the black water. The
      free-floating stones are bare dark rock (mossy, they read as floating trees); far trees settle
      a little into the ground (the coarser far mesh sags under a hill's crest)
- [x] Trees have trunks: every trunk and limb had sampled the leaf texture's transparent corner (the
      canvas is flipped on upload) and was cut away, so all crowns floated; both corners opaque now.
      Conifers fuller (13 tiers of wide boughs); giant trees crown halfway along each limb too
- [x] The Shore (2026-11-04): due south the mountains break and the Dune Sea runs down a broad beach
      into a sea that goes out to the Wall (shared SHORE, `shoreSector`, `seaward`; the coast wanders
      9.4–10.2 km out; the bed shelves, then falls away; nothing grows on it). The sea (`sea.ts`): one
      sheet at its level, only in the gap; it knows its bed near the coast (a coarse map filled a little
      each frame once you are near): clear and green over the shallows, surf rolling in lines onto the
      sand, deep blue out beyond. You swim in it (`waterAt`). The Wader: one of them, 1 km tall, wading
      slowly to and fro along the coast 2 km out in a trench, thigh-deep (standing still from behind it
      read as a pillar of rock; walking, it is one of them); its footfalls leave the sea bed alone.
      Found: "The Shore" (place) and "The Wader" (giant, from the beach); on the map. Gate: `shot.mjs
      shore` (in the sweep)
- [x] The High Places (2026-11-04): past the Steps the land stands up in one layered cliff (9 strata,
      ~180 → 820 m) to a snow plateau above the cloud deck; the mountains hold back over it (shared
      HIGH, `highSector`). A stair cut diagonally up the face: ~21° measured from one start height
      (from the ground under each step the Steps' terraces made a 59° stretch), 2 m steps on half-run
      risers (3 m on short risers was a 63° wall each step); running up it gains 64 m in 20 s. On top
      the Frozen One (`frozen.ts`): one of them, 520 m, standing in a block of glacier ice (a generated
      texture: fracture planes, bubbles, old snow bands), head turned back toward the stair; shards
      about its foot. Found: The High Places (on the plateau), The Frozen One. Gate: `shot.mjs high`
- [x] The traveller's trail goes on: page 5 at a camp on the beach (the Wader), page 6, the last, at
      the top of the cliff stair (its smoke a beacon on the cliff); page 4 is "the fourth page" now
- [x] Striders wade out to sea: due south their loop runs ~5 km out past the beach and back (the body
      keeps up at the water; the feet only so far down)
- [x] Wet sand: a darker, smoother band just above the waterline along the Shore

## W — Wrap-up (user: "wrap up everything so far first")
- [x] `tools/gates.sh`: every gate in one run (lakes, save, and a scene per mechanic and look);
      PLAN.md §3–6 rewritten to the game as it is (world, controls, roster, systems, phases);
      README.md (run it, controls); STORY.md marked superseded by §2f
- [x] Fixes found by the full run: an unlit cairn comes before a trinket lying beside it (the
      tallest pillar's top holds both); the Wall's views look from a height (the lands are 10 km
      across now)

## B1 — Dread, and places to find that are frightening to find (user: "more horrorful elements,
## without jumpscares… things to discover really which is scary to discover")
- [x] `dread.ts`, a director of rare, slow, unexplained things (PLAN.md §2g), each witnessed going
      in the journal under "Things you cannot explain": the stillness (every sound stops, something
      walks past beyond the hills), the pale walker (in fog or at dusk, never any nearer; gone when
      stared at), footprints in the morning (fresh, where nothing walked; a grey scale where they
      end), eyes in the wood (pale, too high, closing when looked at), the deep note.
      Gate: `shot.mjs dread`
- [x] Eerie places (`eerie.ts`), each with a stone and something to take: the Pit — a sinkhole
      (user: "a perfectly round hole reads badly, a realistic sinkhole"): a slumped, ragged rim,
      layered broken walls, a collapsed side to climb down, the depths darkened, cold mist, a moan;
      the Circle of the Bowed — seven hooded stone figures (`mourner`), heads bowed toward a black
      stone, the land silent near them; the Husk — a giant's shed skin, hollow, a figure of you
      inside; the Hanged — long bones on chains from a giant tree, creaking. Gate: `shot.mjs eerie`
- [x] The Great Bell (`bell.ts`) by the Colonnade: ring it with an arrow and every giant stops and
      turns toward it for a while. Gate: `shot.mjs bell`
- [x] (user nitpicks) The lantern reaches ~26 m and comes up by itself as it gets dark; a few
      fireflies carry real light; tree trunks have bark (drawn in the shader, furrows and cracks)

## S — Scale (user: "more scale of bigness… tricks like fov and camera angles… dynamic fov… we control
## the user's experience, we need them to feel a certain feeling")
- [x] `scale.ts`, the scale director, from the thing filling most of your sky: loom (lens up to +17°,
      the camera lower and nearer the ground), look up (tilting up widens it further), drift (still,
      mouse idle 1.5 s, under one — the gaze rises to its upper body), stare (hold a huge far thing
      near the centre: a slow dolly — you keep your size, it rises behind you), vertigo (finding a
      giant or colossal place from the ground: a 5.5 s dolly zoom). The rig takes a focus drop and a
      distance multiplier (the multiplier could only shorten the camera before — fixed)
- [x] A near giant's shadow reaches you: the shadow map stretches to it (up to 1.1 km)
- [x] Cloud shadows a kilometre across slide over the land with the wind (fair days, broken cloud)
- [x] A giant's footfall within sight on green ground puts up a flock of birds round the foot
- [x] Gate: `shot.mjs scale` (off/on, drift, stare, vertigo, cloud shadows, birds)

## N — The new player (user, 2026-10-31: "a pass which is just yourself seeing the game and curating
## it for a new player with typical normal gameplay progressions — how games reveal stuff as you play
## more and more. A hint: we start in the middle already facing a giant, no surprise or awe of
## discovery." Next, after the scale round.)
- [x] Play it from a fresh save as a newcomer would (`tools/newplayer.mjs`: a fresh browser on the
      real game, photographed and logged at each moment). Found: old-plot loading lines; the first
      frame facing the Sentinel with the Green "discovered" before a step; every key on screen,
      J glowing "new" with nothing in it; the camp missed walking straight ahead; no title, no waking
- [x] The opening, in order:
  - [x] A title: TITANS, "click to wake" (nothing else on screen over it)
  - [x] Waking on the Undercroft's floor under a skylight: the camera low on the stone, rising as you
        stand; held still a moment; "You wake on cold stone, in the dark…"
  - [x] The stair toward the light (hint: "There is light at the end of the hall. Find the way up")
  - [x] The reveal, the first time you step off the stone onto the grass: letterbox bars, the camera
        rises behind you and shows the nearest giant walking the Green (the Sentinel if none is
        near), you small at the bottom of the frame; skippable after 2.5 s; once only (saved)
  - [x] The Green named after the shot (the card would sit across what it shows)
  - [x] The camp a few steps on at the stair's mouth: the traveller's page, then the bag
  - [x] The map, the journal and the bag (keys, minimap) only once you have the bag; the key strip
        waits until you have taken your first steps
  - [x] The first visit's weather: breaking cloud for the walk out; the first storm ~15 min in
  - [x] No dread for the first ~half hour
- [x] Fixes found on the way (all bugs a player would have hit):
  - [x] Held by the camera (the reveal, an awakening) the wanderer skipped rock collision: fell
        through the stair, blacked out, woke on the hall floor
  - [x] An invisible wall where the stair comes out: the roof's holes stopped 0.6 m past the slab,
        leaving its outer face in the collision field as a thin shell
  - [x] The ground's drop into the hall reached 3 m past its walls: a lip too steep to walk up
        (now all inside the walls); and the slope of the land under a rock no longer makes you
        slide while you stand on the rock
  - [x] The tip box overlapped the narration column
- [ ] Reveal in order beyond the opening: what the first hour opens, what is saved for later

## P — The user's playtest (2026-11-01: "way too many issues… self check alot… unoptimized or bad feel or bad look")
- [x] Stuck on small cliffs: 13/14 hillside risers stopped you → a scramble band (50–62°), a mantle onto
      ledges up to 2.5 m, an E Climb prompt at real cliffs (3/14 left, all true cliffs)
- [x] Underwater clear → swimming (float, slower, breaststroke; falls into water are safe), the camera
      kept above water, an underwater grade as backstop
- [x] Screenshake → trauma 0–1, squared, smooth, inverse-square falloff (was up to 3.6 m, linear to 2 km)
- [x] Lighting/weather snapping → post never switched off by the quality level; sun→moon crossfade;
      sand and marsh air ease over 6–8 s (time-lapse: biggest frame step ~1%)
- [x] Sounds → your own footsteps by surface, landings, mantle, UI; a limiter (a close stomp clipped)
- [x] Resolution/quality → dynamic resolution on the median frame; detail drops only at the floor
- [x] Cape glitches → carried with the body, reach limit, leg collision, woven texture, flare
- [x] Hitches → measured: travel is smooth on the CPU (1 frame >33 ms in 50 s); teleports spike;
      shaders warmed behind the title (no measurable change headless; kept)
- [x] UI flat → leather bag, notebook journal, paper slippy map, captions, fonts (OFL), sounds
- [x] Also: warm low-sun light (no black sunsets), depth-aware water, the wanderer dressed (knit, wraps,
      boots, the bag's strap and satchel), the Hanging Steps as torn-loose rock with chains
- [x] Second wave: the glide wing (a pose, billowing, seams); a wake round the swimmer; pillars on bases;
      a pause with settings (Esc); rushing air; landing dust; first contact (the Walker sees you, comes a
      little way, waits — camp to its feet in 128 s, was not caught in 2 min); no cloud-layer panels or fur
      shards on the climb; trees culled in wedges + a faint far tier (forest 8.1M -> 5.9M tris); colossi
      coarse twins from afar (Green 4.9M -> 3.9M tris)
- [x] The cape at rest: folds (zero-mean, shaped about each row's middle), a flared hem with slack,
      a slow ambient breeze (hem sways 3–5 cm, folds ±6 cm; it was 7 mm, a flat board)
- [x] Shadow pass: the Giant Wood's crowns and the Steps' chains were never culled (a forest 5 km
      off in every shadow map): tiled 400 m and culled; near trees past 70 m cast through a
      simple stand-in on a shadow-only layer. Green frame 3.92M → 2.74M triangles
- [x] The crowns from afar: a LOD per tile (2,520 → 720 → 240 triangles). Green 2.74M → 1.93M
- [x] No white veil under a high sun (the bloom spread the bright sky over everything): it fades
      with the sun's height; dawn, sunset and night keep it
- [x] The camp smoke: 340 m, full where it clears the land (from the first camp it must rise ~100 m)
- [x] The first hour, played (`tools/firsthour.mjs`: newplayer's route, then the bag, the walking
      giant climbed, the map, down, the traveller's smoke followed to the second camp, its page):
  - [x] Every giant's footfall took grip from whoever was climbing — any giant, anywhere: the Walker's
        stomp 2 km off took a third of your grip on the other one. Now only the giant you hold
  - [x] No prompt at a giant's foot (the tip says "E to take hold"; cliffs had one): `E Take hold`
  - [x] The first climb shook newcomers off the shin within seconds of the giant setting off (a stomp
        queued before you took hold, then its full stride): until you let go after being 150 m up,
        the giant you hold ambles at 40% and does not stomp. 44 m → 185 m on the same route
  - [x] The traveller's smoke, which the tip sends you after from 4 km, was a hair from the Green:
        it widens with distance (to 2.2×), rises to 460 m and thickens a little far off
  - [x] A long fall stood the cape on your head in a thin red spike (from ~20 m/s): the rising air
        is capped and streams it behind; the cloth trails the body at most 3 cm a frame
  - [x] At the escarpment's foot, pushing into the wall slid you back down the scree and turned you
        to face downhill — the wall was looked for that way: no `E Climb`, and E did nothing. Now
        the way you push (WASD about the camera)
  - [x] At a cliff's foot the cape climbed the rock and stood over your head (the hem hangs back over
        the wall, and the ground under it lifted it straight up): ground well above your feet is a
        wall — the cloth is pushed back toward you there, not up it (3/3 climb-and-land runs hang)
  - [x] Terrain at a cliff's foot: steep quads split along the diagonal whose corners are nearest in
        height (follows the wall; the shared checkerboard cut across it in hard faceted slabs). Only
        chunks with steep quads get their own index; build time unchanged (5.6 ms median)
  - [x] Twilight was the darkest moment of the day (ground ~20% darker than midnight just after
        sunset and before dawn: the key light hands over at nothing, and the fill stayed at the
        night's). The blue hour is lit by the whole sky now (fill and env rise with the dusk) and
        the eye opens with the dusk too: 0.91 78.7 → 87.4, 0.09 80.4 → 90.0 (midnight 95.7)
  - [x] Rain: a streak passing right by the lens was a long white bar slashed across the frame —
        faded out within 2–6 m of the camera
  - [x] Sandstorm: its grit was rain's thin 2 m streak laid flat (white wires across the screen) —
        now short, wide, soft wisps; and the air's blown sand no longer switched off in it (a storm's
        "rain" in the Dune Sea is sand)
  - [x] The mantle: a short straight cone (a red lampshade, the shoulder caps poking out under its
        brim) → a draped capelet, curved over the shoulders, wider across than deep, longer at the
        back, a soft wave at the hem; checked from four sides and with the arms raised
  - [x] Under a high sun the lit ground itself bloomed: the Dune Sea's sand far past the bloom's
        threshold, a milky veil over the whole view and the wanderer a pale peach ghost on it. The
        threshold rises with the sun (1.25 → 3.45 at noon); low sun and night keep their bloom
  - [x] A lit cairn up close: its 14 m beam's near wall hazed half the view, its bottom rim a hard
        line across the land below. The beam fades within 20–80 m of the camera and softens at its
        foot (still the landmark from afar); the flame a glowing teardrop sprite (was a solid white cone)
  - [x] The lantern: a dark box with a flat cream ball on its front → a small iron lantern (cap,
        ring, bars, base) round a glass that glows dim amber by day and warm in the dark
  - [x] Hands: two big bare brown eggs at the sleeves' ends → smaller gloved hands with a wrapped cuff
  - [x] The bag's strap stood off the body in a hoop (deeper than the chest, the sky seen through it
        from the side): it now lies on the body
  - [x] Leaves dissolving near the camera: an ordered 4×4 dither (an even screen-door) instead of
        white noise (crawling grey static over a fir branch passing the lens)
  - [x] Dissolving near-fir leaves came out purple (post only): the grade's lens fringing read red
        and blue a fraction of a pixel aside, and on the 1-px dither bright sky bled into those two
        channels of each dark leaf pixel (found by reading the scene buffer: the pixel was green
        there). Fringing removed: 13,088 purple pixels in the test view → 0
  - [x] The key strip sat at the bottom of the screen for good: once you know the keys (the first
        climb done) it fades while you move, and is back when you stand still ~2.5 s, for 6 s after
        you start climbing or flying, and for 8 s when J / I gain news
  - [x] Captions held for a fixed 14 s whatever their length: now as long as they take to read
        (5 s for "You lost your grip.", ~11 s for a long line, 20 s at most); faded lines leave the page
  - [x] The pause screen in a narrow window: Detail's buttons ran past the page, "Mouse speed" broke
        over two lines, "Begin again" fell to its own line — the choice rows now span the width
  - [x] The satchel: a plain brown box → a soft leather bag (rounded, a darker flap over its front,
        an iron buckle)
  - [x] Tools: `grabTitan(id)`; `climbState().height` above the ground under you (any giant)
- [x] Where a first climber can rest on the torso: less steep rock (a bulge's upper side) takes up to
      60% less grip, and the first climb drains at 70%. The scripted first climb (which only climbs
      straight up, never looking for easier rock) varies with the giant's path: 205–240 m over two
      runs, once standing on the shoulders (it was 185–220, never)
- [ ] Still to look at: GPU-side frame spikes on real hardware

## P2 playtest (user, 2026-11-03: "i like it alot, there are still small issues… dont hyperfocus")
- [x] Undercroft: the bow is the only thing below, and it can't be picked up before going up (most
      players won't come back down) — a tool goes over your shoulder, bag or no bag; and the
      Undercroft's iron key (the other thing down there) goes in a pocket before you have the bag
      ("In your pocket, for now" on its card); elsewhere the bag still matters
- [x] The targets look odd from behind, walking up to the bow (small) — each stone eye's 6.5 m glow
      is a sprite that always faces you, so from behind it hung in the air beside the pillar: it fades
      unless you are in front. And each eye faced back along the ray that found it (tilted to the
      wall, some at a pillar's corner, half the disc in the air): now flush with the stone (the
      surface's normal) and slid in until all of it is on the face
- [x] Wall/pillar/floor corners aren't darker (no contact shadow; looks odd) — the Undercroft's shape
      is known, so its stone gets SDF ambient occlusion per pixel (pillars, stepped bases, capitals,
      pit walls, floor, roof underside): corners darken over ~3 m
- [x] Camp flags too short, the ground there looks like anywhere else: camps are hard to spot — a
      7.5 m pole (was 3.6) with a 3 m strip of red cloth from a crosspiece; a tripod and pot over the
      fire; the ground worn bare round it (trampled earth, the grass kept off)
- [x] Out of the Undercroft's stairs you see 3 walkers, a flier, 2 colossi…: every giant spoiled at
      once. Only the flier and the opening colossus should show; the rest hidden by trees, ruins, rock.
      The stair now comes up in a dell: rises 30–70 m high ~470 m out (farther and taller east, past
      the hall's roof) close the horizon at 5–15°, all but a gap to the Walker, which the opening
      shot frames. The Grey One starts 3 km off at the Wood's edge (was 1.1 km, in sight); no
      Watcher within 2 km (one stood 670 m off); the Ones Beyond (9.5 km tall, 30 km out: no rise
      hides them) stay in the haze until you are first out over the rim, then come out of it over
      20 s, and awakenings wait for that. From the stair: the Walker through its gap, the far range
      — nothing else. First-hour route unchanged (climb 185 m, camp 2, page 2)
- [x] Cloud/fog layers are flat planes: where one meets a giant or a wall the cut line shows — the
      solid world is drawn first and its depth kept; the deck's sheets, the cumulus puffs and the
      mist banks draw after it (soft.ts) and thin out as they near what stands behind them (soft
      particles). Rain draws last (under the deck it vanished against the sky). (First version did
      nothing: the depth texture was attached after the target's framebuffer was built, never
      written; and the fade's reach, 4% of the distance, was far shorter than how far in front of
      a giant a sheet crosses the view from above. Now made with the target, reaching 35% of the
      distance for the deck: from the ground in a storm the giant was crossed by stacked hard
      bands, one per sheet; now it hazes smoothly into the cloud (its head still lost in it); from
      above, its middle no longer cut by a hard line —
      `softSwitch` / `soft.uSoftDebug` on the debug handle compare and show the depth read)
- [x] The save gate: a giant whose dragged foot was still swinging when the gate froze the world
      landed it on reload (its print's rim lifted a stomp crater beside it 1.1 m). The gate waits for
      both feet down; the game was right
- [x] Some text and actions too subtle, picking things up especially — taking something: you kneel
      and reach, it flashes and rises into your hand, a rustle and a small bright note; the card
      has a soft dark pool behind it (white on bright sky vanished), says where it went ("Into your
      bag · I") and stays 5.6 s; the E prompt is larger, on a soft dark pill
- [x] Walk and run gaits too slow for the speed (sliding); the wanderer's animation matters most:
      the wanderer is in almost every frame — cadence now set so the planted foot's backward sweep
      matches the ground (LEG · swing · dφ/dt = speed): walk 2.0 → 2.7 steps/s, a longer swing,
      the planted foot's median speed 2.49 → 1.43 m/s (its minimum ~0.3); hips ride up over the
      planted leg and dip between, turn with the leg going forward, shoulders turn against them,
      head held level; running, the knee folds high and the heel kicks up, the leg reaching
      forward stays bent (it read as a goose-step), arms pump bent
- [x] The wanderer, carried: leans into a turn (with speed), tips forward setting off and sits back
      pulling up, leans into a climb; lands into the knees (deeper the harder the fall); standing a
      few seconds, the weight shifts leg to leg and the head turns slowly to look round
- [x] Camp banner readable from 150 m (4 m by 0.9 m, a stronger red); copses along the dell's rim
      (wooded hills, not a smooth green wall; first-hour route 0 stuck, was 12)
- [x] Over the rise, the first time on foot: a line as the Ones Beyond come out of the haze; you
      kneel to pick up a page and read it
- [x] Climbing: hand over hand (one arm reaching high and straight, the other bent and pulling),
      legs stepping on the diagonal, knees out, hips swaying; a held reach when still (both arms
      straight up read as a surrender). The cape hangs down your back on a giant or a rock face —
      the cloth took your grip (at your chest) for the ground under it and was pushed up round
      your shoulders the whole climb; and its own wind is how the body really moves there, not
      the run you had before taking hold
- [x] Swimming: the cape stood straight up out of the lake like a fin while you trod water (the
      cliff-foot rule took the water's surface for a wall and shoved it in toward you); now it
      floats spread on the surface, and trails on it as you swim
- [x] Contact shade outside too: every rock formation, ruin and colossus darkens where it meets the
      ground (per vertex, 0.5 at the grass line rising over a few metres; the ground sampled on a
      24×24 grid over each formation and read back bilinearly — no per-vertex terrain lookups)
- [x] Feel: your own footprints in sand and mud (left, right, fading over half a minute as the wind
      fills them); a little dust kicked back running on sand; winded after a long run; a long fall
      flails; clouds rose at dusk, grey-blue at night; fireflies pinpricks, not balls
- [x] Sandstorm: barely there (the fog 10× a clear day's still let you see half a kilometre), and
      the far sand wisps — a few pixels each — rendered as rows of dark dashes over a cliff. The
      storm's air 25× as thick now, wisps only within ~25 m, the grit sand-coloured. (Isolated by
      hiding layers in the frame: motes, then the streaks, then each post pass.) Also: the
      Undercroft's key goes in a pocket before the bag; map names larger; wading rings the water
- [x] The Stranded (the Shore): something from the sea, long dead, its ribs arching along the waterline
      out into the shallows, the skull up the beach; a place to find, on the map, and a trinket on the
      skull ("A scale from the sea")
- [x] Two cairns in the new lands: The Cloud's Edge on the cliff's lip beside the top of the stair
      (834 m, over the sea of cloud), The Sea-Skull on the Stranded's skull (106 m, over the water)
- [x] Snow on the High Places: up on the plateau what falls is slow, wandering flakes (a flurry
      even on a fair day, thick in a storm); the Frozen One's ice block widened (its arms came out
      through the sides)
- [x] The run, re-timed: a foot is down for half its cycle at a walk and a third at a full run (in the
      air the rest), sweeping back at a steady rate, the cadence set from that (π·f·v / LEG·sin amp);
      longer walk stride. Planted foot: walk median 0.86 m/s (was 1.22), run ~5 (was 7–8, much of the
      rest is the airborne phase); walk 3.7 steps/s, full run 6

## P3 playtest (user, 2026-11-04: "this is all again not priority, continue work, pick these along the way")
- [x] The icons still look bad — painted (tools/gen-icons.py, Gemini, $0.80 for 16): one painting per shape in one storybook style on a keyed-out ground, toned toward each item's colour where one shape serves several things; in the bag, journal, toolbar and offering shrines; the line drawings remain only as a fallback while they load
- [~] Climbing a giant: the camera fights it, the body goes into the rock, nowhere to rest so grip runs out —
      the camera's line to you started inside the giant's rough shape and counted as blocked at once
      (pulled to 1.7 m, into your back): it now ignores rock until the line is out in the open, and
      looks at a focus stood off the surface (6.0/1.7 m → a steady 7 m); the body sits 0.45 m off
      the hold (0.3: chest and knees in the lumps); holding still halves the drain, and where the
      surface leans back past ~17° it gives grip back (the key strip says so). Scripted first climb
      228 m. Then the body 0.8 m off the hold and the camera's focus 2 m out: the climber visible in 22 of 24 frames of a climb, was 19 (counted by the cape's red pixels); a bulge still hides you now and then
- [~] Running animation still buggy; the cape doesn't move with the shoulders — the cape and scarf are pinned to the chest now (they hung square while the shoulders twisted); the run itself: which part looks wrong? (gaits re-checked side-on and from behind)
- [x] Raining, no sun, and the water still shows sun glints — its roughness and ripples follow the weather
- [~] Grass and foliage drawn in chunks, very close to the player — reaches 76 m (was 52), thinning toward the rim and fading into the ground over 30 m (was a 14 m ring); +17% cards, same frame time. Then thinned to 5% at the rim (12k cards, was 20k, no visible loss) and grassland ground toned toward the cards' colour; the edge where the field of blades meets bare ground still shows from a height (mostly a hill crest with the slope beyond out of range): a far grass impostor in the ground shader would be the real fix
- [x] Traversal slow: a physics grappling hook? — the grappling line (`grapple.ts`, with the bag): G throws it where you look (rock, ground, a giant — it rides along with the part it caught) up to 70 m; a rope, not a winch: you swing under gravity at full stretch, holding G reels in at 13 m/s, Space lets go with a kick (a swing into a leap), slack on the ground it comes back; arms up on the rope; a long swing is not a fall. Tested: caught 62 m up the High Places' cliff, reeled 36 m in 2.8 s. Gate: `shot.mjs grapple` (in the sweep, 46)
- [x] No way to see the controls — a Controls section heads the pause page; `?` or F1 opens it in play, and the key strip says so
- [x] The minimap lags, re-renders a lot, in chunks — a cached land slid every frame (was a full redraw with two blur passes at 10 Hz, moving in jumps)
- [~] Lag, performance: LODs — measured what the GPU is given per scene part: the land was 1.1–1.2 M triangles a frame everywhere. Far chunks (1 km+, seen from 1.6 km+) now built on half the quads, and the top quality splits at 1.35× (was 1.6): 1,217k → 654k on the Green, 1,078k → 599k at the Shore, distant land unchanged to look at. Far trees (past ~340 m, where the ground's canopy colour takes over) thinned to 40% by 750 m, an even hashed scatter: the Grove's trees 745k → 485k (its land 1,152k → 610k). Shadows: the shadow pass adds ~0.1 M triangles on the Green, 1.3 M in the Grove (its giant trees' crowns and trunks, near you, rightly casting); culling casters by distance saved nothing (three already culls to the shadow camera) and was reverted — shadow-only low-detail twins would be the next step — done: colossi and giant trees cast from their coarse twins, the giant crowns from 720-triangle stand-ins (Grove 3.24 → 2.41 M triangles a frame, the shadows the same). Draw calls: far giants' plates and fur hidden on silhouettes, the Frozen One's detail chosen at any distance and its ice one mesh (Green 581 → 507 calls). Smoothness measured: a 40 s run across the world, main thread median 3.3 ms, p99 4.7, worst 9.7 (none over 12); the camera behind you steady (your screen height sd 0.5%). Not measurable here: GPU time on real hardware. Seen: a walking giant's fur cards right at the camera read as dark shards
- [~] No music — the score was a quiet drone and a lone glass note every 7–30 s. Now every minute or so a slow phrase (4–7 notes, mostly by step from the chord's tones in D minor, ending low and long) on a plucked voice, sometimes over a low bowed line; the pad a little louder; fewer in the dark, none in a stillness. Offline: two phrases peak −14.4 dB; the worst-case pile-up −1.6 dB, nothing clipped. Not listened to: by ear, the user's call

## Detail-bar audit (user pasted the "game detail bar", 3D-scenes and open-world guides, 2026-11-04)

Held against the bar, honestly. ✅ already met · 🔧 done in this round · ⬜ open.

- ✅ Fixed 1/60 step for logic; real-time easing; compileAsync warm-up behind the title; keys released on blur.
- ✅ Chunked terrain with far grid LOD, instanced vegetation per tile, shadow stand-ins, adaptive resolution (DPR steps).
- ✅ Contact shadows, one shadowed sun, fog for depth, ACES grade, settings stored apart from the save.
- 🔧 Saves: a backup of the save before the last; a damaged save loads it and says so; loads are shape-checked (respect gate).
- 🔧 Errors: a frame that throws shows a card ("The world stumbled": Wake again / Copy details), never a frozen frame; nothing saves after; `?qa=throw` (respect gate).
- 🔧 Comfort: ground-shake slider, soft lightning; both default from prefers-reduced-motion.
- 🔧 All sound suspends while the tab is hidden.
- 🔧 Pause page: "Go on" always in reach (it sat below the fold at 760 px); short-window layout (pause gate checks overflow).
- 🔧 Nitpicks found by review: the Wader "met" from inside the Husk; the Old Wood's wisp waiting under a Mire pool; grass on pool beds.
- 🔧 Gamepad: left stick walks (round dead zone, part-way walks slower), right stick looks, A jump, X use, B line, Y horn, RB run, LT/RT bow, LB sight, Back map, d-pad journal/bag, Start pause (keys gate, simulated pad). On an open page the d-pad moves (pause: focus ring, left/right nudge sliders), A presses, B goes back.
- 🔧 Rebinding: one binding table (input.ts ACTIONS); click a keycap on the pause page, press the new key, Esc keeps it, a key in use swaps, reset; saved with the settings; every prompt's keycaps relabel to the player's keys (keys gate). Mouse buttons are not rebindable.
- 🔧 Holds as toggles (setting): run, draw (Q / right mouse / LT), sight-stone. G stays a hold: a press throws the line, holding reels.
- 🔧 Text size (As made / Larger / Largest): captions, prompts, cards, bag, journal and pause grow together; panels divide their screen-relative sizes by it; the key strip wraps clear of the minimap (no line starting with a dot); captions lift above it (pause gate checks at the largest size, desktop and phone).
- 🔧 Recorded SFX: 57 CC0 takes (Kenney) for footsteps by surface (grass, stone, sand, snow, mud), landings, the bag, journal, map, pause, picking up, the line biting, and the pause page's hover/press/toggle/denied. AUDIO.md lists each (source, bytes, use, processing; tools/build-sfx.sh). Random take never repeated, ±5% pitch, 20-voice cap, 45 ms per-group limit; synthesised stand-ins until loaded (sfx gate). Still synthesised: the score, weather, giants, horn, bell. Mix not yet heard by a person.
- ✅ Seeded randomness: the world (land, pools, wisps, giants' paths) is seeded (WORLD_SEED, mulberry32). The Math.random left is cosmetic or atmosphere only (narration line picks, trail jitter, shed motes, when a far giant stirs); nothing rewards or rolls on it.
- 🔧 Frame-rate proof (fps gate): the same walk + run + jump at 30, 60 and 144 frames a second — distance within 0.07 m over 42 m, jump apex identical (0.825 m).
- 🔧 Colour vision (tools/vision.mjs, Chrome's emulation): under protanopia/deuteranopia your red map arrow went olive into the paper — now a dark halo and pale rim carry it by brightness. The J/I news glow fades in colour but still pulses.
- — Touch/phone play: out of scope (a desktop mouse-look game); the pause and crash cards are checked at phone width only.

## Known issues
- [x] The save gate failed once in three (2026-10-31): a crater 1.2 m shallower after reload.
      Cause: a giant resting a minute of real time turns to stone on load (a hill rises under it);
      when the gate's wait for the giants to settle ran past a minute, the reload did exactly that.
      The game is right; the gate now starts their rest at the save

## Design drafts
- [x] `STORY.md` (draft for the user): the mystery (recommended: the sky is coming down), the
      Three Bells refined, side quests, progression without levels (grip from Echoes; lantern,
      horn, cloak, pitons), exploration, the lands to come (the Green, the Mire, the Shore, the
      High Places), and the decisions waiting on the user

# Archive: the multiplayer world (tag `pre-adventure`)

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

## A living land (user, 2026-10-31: "the world still looks really empty and plain and the village has just 2 houses")
- [x] Vegetation (`vegetation.ts`, `biome.ts`): forests and copses (conifer + broadleaf), lone trees,
      boulders, bushes at forest edges and shores, grass tufts and wildflowers near you, reeds in the
      lakes' shallows; seeded per 96 m cell, instanced, two tree looks by distance, swaying; the
      terrain shows the same forests as canopy from afar; Titans flatten what they tread on;
      vegetation radii follow the quality governor
- [x] Old villages (`settlement.ts`): a fresh world starts with 3 — square, well, 3 market stalls,
      church with a spire, ~27 houses and huts along two streets, a windmill with turning sails,
      4 fields; dirt roads (`paint.ts`, painted into the terrain) between them and in from spawn
- [x] Towns grow: one with a well and a few homes adds a home every 40 s (old villages along their
      main street, yours in rings with paths), up to 44 buildings; catch-up growth while away
- [x] Build mode gains church, market stall, windmill, field (1–8)
- [x] Townsfolk for every town (one per hut, two per house, a merchant per stall; up to 140),
      instanced; buildings merged per town per material: a village street went 1,003 → 189 draw calls,
      all towns together 36
- [x] Fixed on the way: offline events are applied exactly as saved (mm-rounded), so a reload is
      identical to the last digit; returning worlds refill with real rain until stable (merges that
      only happen on overflow used to leave lakes part-filled); a pair settled once and still
      mutual stops circling its water
- [x] Gates: `shot.mjs village` (3 villages with church/well/≥15 homes; your town 3 → 33 and the
      village to its cap in 20 simulated minutes; 36 calls); all other gates re-run green

## Toward the reel (user, 2026-10-31: "see the reel again and keep striving to get closer to its visuals")
`node tools/shot.mjs reel` recreates five reel shots (the giant on the plain, the trail of lakes,
the square with a giant behind the cathedral, a climber, the mountain); `tools/sky-measure.mjs`
measures sky colour against the reel's (about rgb 62, 84, 109 high up).
- [x] Air: height haze with a warm glow toward the sun, patched into every material
      (`atmosphere.ts`); ACES + a warm, slightly desaturated grade in CustomToneMapping; vignette
- [x] Sky: muted reel blue graded by elevation (measured 57, 76, 111 away from the sun), the Sky
      shader's own drifting cumulus; low billboard clouds about the giants' waists
- [x] Light: stronger sun, weaker neutral fill — shadows read as shadows (were olive film)
- [x] Land: arid tan-olive savanna; open plains about spawn, woods beyond
- [x] Giants: 300 m (from 180), hulking gorilla build (shoulder hump, sunken head, arms to the
      knees, pillar legs), sandstone with olive moss; mountains stand, red sandstone under snow
- [x] Towns: 3–4 storey townhouses in terraces (≈52 per village), a twin-spired cathedral with a
      rose window, cobbled streets and square (`pave` layer + cobble shader), green awnings,
      brown-cloaked townsfolk; the single-player adventurer wears the reel's red
- [x] Water: deep, sky-mirroring blue; labels with the reel's leader line; debug readout hidden (`)
- [x] Scaled for 300 m: climbing 3 m/s and a slower grip drain (shoulders reachable on one grip),
      lake caps (9 ha), growth cap 110; all gates re-run green
- [x] Second pass: footprint pools with steep walls and a flat floor (1 − q⁴), pale sandy rims and
      walls (the reel's craters); window panes instead of black holes; finer cobbles
- [x] Caravans (`caravan.ts`, the reel's "your city can follow the giant"): six covered wagons with
      oxen follow the nearest walking giant ~1.25 H behind, in file, round water; when it stops they
      circle up round a fire. Traditional AI; single player for now
- [x] Returning worlds settle up to 1,500 merge rounds (capped at 2.5 s, under the loading screen):
      300 m giants make many more merges (superseded: lakes are now saved, see below)

## A lived-in world (user, 2026-10-31: "still too barren… villages don't form around water…
## villages don't start popping up around giants which have left… add life")
- [x] The First Ones' trails (`ancient.ts`): a fresh world starts with three old giant trails, laid
      with the real gait, kernels and water: chains of old footprint lakes joined by dragged
      channels, grown over (no fresh-earth tint; plants regrow). Saved like any other ground
- [x] Old villages stand on those lakes' shores, streets running down to the water; up to four
      hamlets by other old lakes
- [x] Settlers: hamlets spring up by lakes that have stood full a while, at the foot of a giant
      gone to sleep (a few minutes after it becomes a mountain), and where a caravan camps long
      enough; each says so in the chat
- [x] Life: birds wheeling over lakes and towns, chimney smoke, sheep in fenced fields (scatter
      from giants), travellers on the roads between towns, haystacks
- [x] Land: shrubs on the open plain, copses and lone trees, trampled ground greening over (5 min)
- [x] Ruins of the First Ones: stone circles, colonnades, a colossal hand, a buried face
- [x] Lakes, made robust for long trails (`tools/fill-bench.ts`, the Node lake gate):
      spill only makes new pools in hollows a Titan dug (natural hollows stay dry — before, full
      lakes spilled from hollow to hollow down whole valleys: 2.2 s of lake work a minute, 67 ms
      hitches); a pair that merged and came apart never re-merges (it cycled forever);
      "settled" now means step() changed nothing at all. Refill 0.7 s (was > 10 s, never settled);
      a minute of play 51 ms of lake work, worst step 0.3 ms
- [x] Lakes are saved with the world (outlines run-length encoded, ≈ 28 KB, plus what was learned
      merging them): a reload rebuilds them in 18 ms instead of re-running the rain; a refill that
      outlasts its loading budget carries on a few ms a frame
- [x] Building onto an old village joins it ("The people of X take in your house") — it used to
      say "You founded null"

## P12 — Beta polish → Beta 1
- [x] Clouds: cumulus clusters of billboard puffs (lit crowns, shaded bases) at a Titan's waist,
      drifting, wrapping round the camera, fading into the haze
- [x] Water shading (polish round)
- [x] Sound, synthesised (no assets): wind, footfall booms arriving at the speed of sound, stomps, the
      Titan's call, rubble; starts on the first gesture; on/off in the world panel
- [x] Onboarding: four hints that advance as you do things (walk, a Titan, lakes, a town), once per
      browser; the First Ones' story on the loading screen
- [x] Perf pass: quality governor (polish round)
- [ ] Free hosting — on hold by the user (single player first)
- [ ] Beta 1 acceptance (PLAN.md §9) — its multiplayer half waits for hosting; every part of it is
      already proven locally (mp, persist, dormant, climb and settlement gates)
