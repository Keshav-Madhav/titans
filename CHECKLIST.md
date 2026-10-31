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
- [ ] Giant trees in the Old Wood
- [ ] Air per region (dust in the Dune Sea, mist in the Wood)

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
- [ ] Vertigo ledges

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
- [ ] Riding a walking giant across a land (call one? a route walker?)

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
- [x] D10 The Sight-stone (the Grove, as the third page said): hold V — the view darkens at the
      edges and the First Ones' marks show, glowing, over the grass in a line, a column of light at
      the end; stand at the end still looking and the cache there shows itself. Three trails (from the
      stone through the Grove, from the first camp across the Green, from the Colonnade over the
      terraces), stepping round anything solid. Gate: `shot.mjs sight`
- [x] D11 Parkour: the Hanging Steps (`parkour.ts`) on the western Green — 26 slabs and blocks held
      still in a rising spiral: hop the short gaps, climb every third, a trinket at the top (50 m).
      Gate: `shot.mjs steps` (every slab stood on)
- [ ] Still to come from the roster: uncover (a giant stamps something open), watching the giants,
      offerings, a land's cairns all lit → an artifact
- [x] Made stones (words, ringing stones, the camp) in the carved texture, not plain grey boxes
- [x] Chained stones are solid now (they were skipped as "floating": unclimbable though still)
- [x] Gate: `shot.mjs discover`, `bag`, `spots` (every trinket placed on a level top and taken)

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
