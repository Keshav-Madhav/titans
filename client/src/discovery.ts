// Discovery (user, 2026-10-31: "environmental storytelling — giants own the
// lands, they live here, we are a visitor… curious… quests about discovery
// through puzzles or targets, with rewards in the form of trinkets, artifacts,
// lore"). No plot: what there is to know is out in the land, a piece at a time.
//
//   place   — somewhere you have stood (found by going there)
//   giant   — one of the ones who live here, met (found by coming near)
//   lore    — words left on stone by those who came before you
//   relic   — taken from a giant's back (it will not thank you)
//   trinket — small things left in hard places, glinting
//
// The catalogue is fixed and written by hand; what you have found is saved.

export type FindKind = 'place' | 'giant' | 'lore' | 'relic' | 'trinket' | 'tool' | 'strange'

export interface Find {
  id: string
  kind: FindKind
  name: string
  /** What the journal says once it is found. */
  text: string
  /** Where to look, for the journal's empty line (before it is found). */
  hint: string
  /** For things carried in the bag: its drawing (bag.ts drawIcon) and colour. */
  icon?: string
  tint?: string
}

export const KIND_TITLES: Record<FindKind, string> = {
  place: 'Places',
  giant: 'Those who live here',
  lore: 'Words on stone',
  relic: 'Relics',
  trinket: 'Trinkets',
  tool: 'Tools',
  strange: 'Things you cannot explain',
}

const f = (kind: FindKind, id: string, name: string, hint: string, text: string, icon?: string, tint?: string): Find => ({ id, kind, name, hint, text, icon, tint })

export const CATALOGUE: Find[] = [
  // The first thing to find: until you have it, small things stay where they lie.
  f('trinket', 'bag', "The Traveller's Bag", 'Left at a camp on the Green, just ahead of where you woke.', 'Patched leather, deep, and somehow never full. Whoever left it here is not coming back for it.', 'bag', '#8a5a3c'),
  // Tools: things that are used, and open new ways into the land.
  f('tool', 'horn', "The Traveller's Horn", 'At a camp near the Herd, in the Dune Sea.', 'A horn made from a shell found in the sand. Blow it (H) and the nearest walker comes to see what is making the noise. Blow it from one\'s back and it walks the way you are looking.', 'horn', '#9b8a6c'),
  f('tool', 'cloak', 'The Wing-cloak', "In the traveller's bag, at the first camp.", "The traveller's cloak, cut wide and stiffened along its edges with something light and strong. Jump, and hold Space as you fall: it opens, and you sail.", 'feather', '#7a2e24'),
  f('tool', 'sight', 'The Sight-stone', 'Left in the Grove, among the giant trees.', 'A disc of clouded crystal on a cord. Hold V to look through it: marks left on the land by whoever was here before show, faint and glowing, where the eye alone sees nothing. They lead somewhere.', 'ring', '#9fc6c8'),
  f('tool', 'line', 'The grappling line', 'In the traveller\'s bag.', 'A coil of old rope, longer than it looks, and a three-pronged iron hook. Throw it where you look (G); hold G to haul yourself in; Space to let go. It bites rock, the ground, and them.', 'line', '#8a6a48'),
  f('tool', 'glass', 'The Burning-glass', 'Beside the cold ashes at the first camp.', 'A round lens in a brass rim, scratched but clear. Hold R and look through it: far things come near. In sunshine it gathers the light to a point; hold the point still on something and it smokes. Some old lamps will take fire from the sun, if not from a flint.', 'glass', '#c9a24a'),
  f('tool', 'bow', 'The Old Bow', 'On an altar at the far end of the Undercroft.', 'A bow of dark wood and horn, strung with something that is not gut, and a quiver that is never empty. Hold the right mouse button (or Q) to draw; click (or F) to loose. Somewhere, stone eyes are watching.', 'bow', '#5a3e2a'),
  // Things you cannot explain (dread.ts): witnessed, never explained.
  f('strange', 'strange-stillness', 'The stillness', 'Something that happens. You will know it when it does.', 'Every sound in the land stopped at once — the wind, the insects, the birds. Far off, beyond the hills, something walked past. You never saw it. The crickets started again one at a time, as if checking.'),
  f('strange', 'strange-walker', 'The pale walker', 'In fog, or at dusk, on open ground.', 'A pale one, thinner than the others, walking toward you through the fog. It walked for a long time and was never any nearer. When you looked straight at it, it was not there.'),
  f('strange', 'strange-footprints', 'Footprints in the morning', 'At dawn, on open ground.', 'A line of fresh footprints across the grass, each a pond by noon, where nothing walked in the night. They went somewhere. They did not come back.'),
  f('strange', 'strange-eyes', 'The eyes in the wood', 'At night, among the trees.', 'Pale lights between the trunks, in pairs, far too high above the ground. When you looked at them they closed.'),
  f('strange', 'strange-deep', 'The deep note', 'Something you will feel before you hear.', 'A sound too low to hear, or nearly — you felt it in your teeth, and the ground trembled under you, and then it was quiet, as if something very large had cleared its throat.'),
  f('trinket', 'print-gift', 'A grey scale', 'Where the footprints in the morning ended.', 'A scale the size of your hand, grey, cold, and very old. Nothing that walks here has scales.', 'shard', '#8c9092'),
  // Places
  f('place', 'green', 'The Green', 'Where you woke.', 'Grass to the horizon in every direction, and the long swells of it. Nothing here is in a hurry.'),
  f('place', 'sentinel', 'The Sentinel', 'North, on the rim of the Green.', 'It kneels with its sword before it, and it has knelt so long that moss has climbed to its knees. Whatever it was waiting for, it is still waiting.'),
  f('place', 'undercroft', 'The Undercroft', 'Under the Green, south of where you woke.', 'A hall under the grass, its roof held on pillars no person could have raised. Light falls through in shafts. Something was kept here once.'),
  f('place', 'tallgrass', 'The Tallgrass', 'Beside the Grove, in the Old Wood.', 'The grass comes up to your knees, then your shoulders, then it closes over your head and keeps going. Blades as wide as you lean together far above, and the wind goes over the top like a hand over fur. You go under.'),
  f('place', 'clocks', 'The Clock Meadow', 'Out on the grassland, west of where you woke.', 'Dandelions gone to seed, and every one of them taller than a tree. Each head is a sphere of seeds the size of a house, and when the wind gets into one it lets them all go at once, a slow white storm going off over the grass.'),
  f('place', 'shells', 'The Shells', 'Out in the valley grass.', 'Two snail shells lying in the grass, and the big one as tall as a house. Empty for a long time, bleached to the colour of old bone; the wind goes into the mouth and round the coil and comes back as a low note. Whatever carried them carried them slowly, and was in no hurry, and is gone.'),
  f('place', 'acorns', 'The Acorns', 'Under the giant trees of the Old Wood.', 'They fall from up in the crowns you can barely see, and land like boulders. Each as long as a cart, half out of its cup, sunk into the leaf litter where it hit. Some of them must have been lying here for years. One of them has started.'),
  f('place', 'feathers', 'The Feathers', 'In the snow of the High Places.', 'Two feathers lying on the snow, each longer than a house and black as a crow. Something moulted up here, or lost them in a wind. Whatever it was flies higher than the peaks, and you have never once seen it.'),
  f('place', 'board', 'The Board', 'In the Ruins, on a terrace north of the Green.', 'A square of flagstones as wide as a field, cut eight by eight, light and dark. Round stones taller than you stand on some of the dark squares. One lies tipped on its edge; one has rolled off into the grass. The game was never finished.'),
  f('place', 'urchin', 'The Urchin', 'On the Shore, west of the camp.', 'Lying on the sand above the tide: the shell of a sea urchin, wider than a house, bleached white. Where the spines were, rows of knobs; between them, bands of holes you could put an arm through. One side is broken open, and the sea wind goes in and out of it.'),
  f('place', 'web', 'The Web', 'In the Undercroft, between two of the pillars.', 'Between two of the pillars, from the capitals nearly to the floor: a web. The threads are as thick as a finger. It is old — whole sectors hang torn, and dust lies along the strands like frost. Nothing has mended it in a long time.'),
  f('place', 'lilies', 'The Lilies', 'On the pools round the Drowned One.', 'Lily leaves as wide as a room lie on the black water, and they bear you: you can cross a pool on them, leaf to leaf. The flowers stay shut, white and barrel-sized, as if waiting for something to pass over.'),
  f('place', 'grove', 'The Grove', 'Deep in the Old Wood, north-west.', 'Trees as tall as the giants, and older. Their crowns meet so far overhead that rain arrives here late.'),
  f('place', 'fallen', 'The Fallen', 'The Dune Sea, south.', 'Ribs the size of towers, and a skull half-buried a little way off. One of them, lying where it lay down. The sand is slowly taking it back.'),
  f('place', 'sword', 'The Sword', 'The Dune Sea, far to the south-west.', 'A blade standing in the sand, taller than most hills. No one who could lift it is anywhere near.'),
  f('place', 'colonnade', 'The Colonnade', 'The Steps, north-east.', 'Pillars in a row, some still standing to the clouds, most fallen. Carved all over with figures too worn to read.'),
  f('place', 'stair', 'The Great Stair', 'The Steps, east.', 'Each step a cliff. It was made for feet much larger than yours, climbing to a door that has not opened in a very long time.'),
  f('place', 'chained', 'The Chained Stones', 'The far edge of the Steps.', 'Stones that would rather float, held down by chains. Someone went to great trouble to keep them here.'),
  f('place', 'steps', 'The Hanging Steps', 'Out on the western Green.', 'Slabs of stone hanging in the air in a rising spiral, held still the way the chained stones are. Someone meant them to be climbed.'),
  f('place', 'mire', 'The Marshes', 'Low places in the Old Wood, far out.', 'Here and there the Old Wood goes down into water. Black pools, drowned trees standing grey in them, and a mist that does not lift.'),
  f('place', 'drowned', 'The Drowned One', 'In the biggest of the Old Wood\'s marshes.', 'One of them, lying on its back in the black water: a face turned to the sky, a knee drawn up, and one hand lifted out of the marsh, the fingers half curled, as if it had been reaching for something when it lay down.'),
  f('place', 'bell', 'The Great Bell', 'Hanging in a stone frame by the Colonnade, far too high to reach by hand.', 'A bronze bell as tall as a house, green with age, high in its frame. When it rang, every one of them stopped where it stood and turned toward it, and stood listening long after the sound had gone.'),
  // Eerie places (eerie.ts): nobody points you to them.
  f('place', 'pit', 'The Pit', 'Somewhere on the southern Green.', 'The Green falls in here: the grass slumps and cracks and then simply stops, and below it are walls of broken rock going down further than the light does. Cold air comes up out of it, and a sound, very low, that rises and falls like breathing. On one side the wall has fallen in. You could climb down.'),
  f('place', 'circle', 'The Circle of the Bowed', 'Far out in the Steps, to the east.', 'Seven figures in stone, taller than the giants, hooded, in a ring — every head bowed toward a black stone in the middle. Nothing grows inside the ring. Nothing sings near it.'),
  f('place', 'husk', 'The Husk', 'Out in the Dune Sea, west of the Fallen.', 'It looks like one of them lying face down in the sand. It is not. It is empty — a skin, split along the back. You can walk inside. It is very quiet in there.'),
  f('place', 'hanged', 'The Hanged', 'Among the giant trees of the Grove.', 'Bones, longer than you are tall, hanging on chains from a limb far up in one of the giant trees. They turn a little in the wind. The chains creak.'),
  f('place', 'shore', 'The Shore', 'Past the Dune Sea, due south, where the mountains break.', 'The sand goes down to water, and the water goes on to the Wall. Nobody built a boat. There was nowhere for one to go.'),
  f('place', 'high', 'The High Places', 'Past the Steps, north-east: there is a stair cut up the cliff.', 'Above the clouds the land goes on, white and silent. The air is thin. Down below, the whole world is a floor of cloud, and the tops of the giants come up out of it like islands.'),
  f('place', 'stranded', 'The Stranded', 'On the beach, a little west of due south.', 'Ribs taller than a house, standing out of the shallows in a row, the waves going in and out between them. Not one of the giants. Something that lived out there, in the water past the Wader, and came in once, and did not go back.'),
  f('place', 'wall', 'The Wall', 'Look to the edge of the world on a clear day.', 'Mountains past the mountains, higher than anything should be. On a clear day you can see that something stands behind them.'),
  // Those who live here
  f('giant', 'walker', 'The Walker of the Green', 'It walks the Green, east of where you woke.', 'It walks the Green from one end to the other and back, and has worn paths doing it. It notices you the way you notice a bird.'),
  f('giant', 'wanderer2', 'The Grey One', 'It keeps to the southern Green.', 'Slower than the other. It stops for a long time, looking at nothing you can see, and then goes on.'),
  f('giant', 'herd', 'The Herd', 'The eastern Dune Sea.', 'Five of them, keeping together: the big one in front, the young ones in the middle. They graze on something in the sand. They would prefer you kept your distance.'),
  f('giant', 'beyond', 'The Ones Beyond', 'From a high place, look past the Wall.', 'Too big to be alive, and yet one of them turned to look at you. They do not come closer. You hope they do not come closer.'),
  f('giant', 'wader', 'The Wader', 'Out in the sea beyond the Shore.', 'It stands in the deep water with its back to the land, looking out toward the Wall, as if it is waiting for the tide to go out. It has not turned round. You are not sure you want it to.'),
  f('giant', 'frozen', 'The Frozen One', 'In the glacier on the High Places.', 'One of them, standing in the ice. Its head is turned, as if it heard something on the stair a long time ago and looked round. The ice has not let it finish looking.'),
  f('giant', 'striders', 'The Striders', 'They cross the far lands on long legs.', 'Legs like threads coming down out of the cloud. They step over hills without seeming to notice them.'),
  // Words on stone: left by those who came before you (no one you will meet).
  f('lore', 'lore-knee', "A stone at the Sentinel's knee", 'Near the Sentinel, on the side that faces the Green.', 'We camped at its knee for nine days before we were sure it was not a statue. On the tenth it sighed, and the grass lay flat for a mile.'),
  f('lore', 'lore-hall', 'A stone in the Undercroft', 'On the floor of the Undercroft.', 'Not built for us. The steps are wrong for our legs, the doors too high to knock on. We sleep here when it storms. So do other things.'),
  f('lore', 'lore-stair-top', 'A stone at the top of the cliff', 'Where the stair cut up the cliff past the Steps comes out.', 'We cut this so that we could come up and look at it. It was the first of them to stop. We wanted to see why. We still do not know. We come up anyway, once in a life, and look, and go down quieter.'),
  f('lore', 'lore-fallen', 'A stone under the ribs', 'Among the bones of the Fallen.', 'This one lay down in the sand and did not get up. The others came, one at a time, over a year. They stood here a while. Then they went back to their lands.'),
  f('lore', 'lore-sword', 'A stone by the Sword', 'At the foot of the Sword.', 'No one has lifted it. No one has seen it lifted. The sand around it is undisturbed. Perhaps it grew.'),
  f('lore', 'lore-stair', 'A stone before the Gate', 'At the top of the Great Stair.', 'If you have climbed this far, you know what the steps were for. Do not knock. We knocked.'),
  f('lore', 'lore-grove', 'A stone in the Grove', 'Among the giant trees.', 'The trees here are older than the giants, and the giants know it. They walk around the Grove, never through.'),
  f('lore', 'lore-colonnade', 'A stone in the Colonnade', 'Among the pillars of the Colonnade.', 'The carvings show people as small as us, carrying things up to the giants. Offerings, or tribute, or gifts. They do not show what the giants gave back.'),
  f('lore', 'lore-token', 'A stone on a high place', 'On top of a mesa in the Dune Sea.', 'A token for whoever climbs this. We leave one on every high place we reach. Take it, or leave it, and leave one of your own.'),
  f('lore', 'lore-chains', 'A stone under the chains', 'Below one of the Chained Stones.', 'We do not know who chained the stones, or why they want to rise. When a storm comes, the chains sing.'),
  f('lore', 'lore-herd', 'A stone near the Herd', "On the edge of the Herd's grazing.", 'The herd eats the stone that grows under the sand. Keep downwind. Keep low. The big one will chase you off if it thinks you are too near the young.'),
  f('lore', 'lore-walker', 'A stone on the western Green', 'Far out on the western Green.', 'The Walker has crossed the Green ten thousand times. It has never once stepped on our camp. It knows we are here. It simply does not mind.'),
  f('lore', 'lore-bow', 'A stone by the altar', 'At the far end of the Undercroft.', 'We leave the bow for whoever comes after. The eyes in the stone have watched over their things long enough. Close them.'),
  // The traveller's pages: one at each of their camps (the first is where the bag was).
  f('lore', 'page-1', "The traveller's first page", 'At the camp just ahead of where you woke.', "First night on the Green. Something the size of a hill walked past the fire and did not even look. I have never felt so small, or so welcome. I will leave the bag here when I go on — I won't need two."),
  f('lore', 'page-2', "The traveller's second page", 'At a camp near the Herd, in the Dune Sea.', "The herd lets me near if I stay low and downwind. I made a horn from a shell in the sand; when I blow it, the walkers come. I don't think they come because they are called. I think they come to see what is making the noise."),
  f('lore', 'page-3', "The traveller's third page", 'At a camp on the edge of the Old Wood.', "The trees are older than they are. There are marks on the roots that only show when you stop looking straight at them. I left the sight-stone in the Grove. Hold it up and you'll see."),
  f('lore', 'page-4', "The traveller's fourth page", 'At a camp at the foot of the Great Stair.', "I am going up the Stair in the morning. The door at the top has been shut a long time. If I don't come back down, the cloak I made is yours — I left it in the bag for whoever came next. You'll know what it is for. Jump."),
  f('lore', 'page-5', "The traveller's fifth page", 'At a camp on the beach, where the Dune Sea runs down to the water.', "I came back down. The door at the top opened on another stair, and that one on another, and I lost my nerve. I walked south until the sand ran out. There is one of them out in the water. It walks up and down, up and down, and it has never once turned round to look at the land. I have been watching two days. I think it is waiting for something to come in from the sea."),
  f('lore', 'page-6', "The traveller's last page", 'At the top of the stair cut up the cliff, past the Steps.', "Nobody made this stair for us, but it was made to be climbed. Up here it is as quiet as snow, and there is one of them in the ice, its head turned back toward the stair as if it heard somebody coming, a long time ago. I am going to sit with it a while. You don't have to follow me any further. But look down before you go. All of it, under the clouds, and the tops of them coming up through it like islands."),
  // Watching: stand still near one of them long enough, and you learn something.
  f('lore', 'watch-walker', 'Watching the Walker', 'Stand still near the Walker a while.', 'It stops, now and then, and lowers its head to the grass as if listening. Then it goes on, a little to one side, as though something under the ground had asked it to.'),
  f('lore', 'watch-grey', 'Watching the Grey One', 'Stand still near the Grey One a while.', 'It sat down once, while you watched, and for a long time did nothing at all. When it stood again, the ground where it had sat was warm, and the grass there greener.'),
  f('lore', 'watch-herd', 'Watching the Herd', 'Stand still near the Herd a while.', 'The young ones keep to the middle. When the big one stops, they all stop. When it turns its head toward you, so do they — all five, at once, as if they were one thing.'),
  f('lore', 'lore-mound', 'A stone by the mound', 'Beside a grassy mound on the eastern Green.', 'Something is under here. We could not dig it; the ground is like iron. They could, without meaning to — if one of them were to walk this way.'),
  // What the offering shrines answer, when you bring them what they show.
  f('lore', 'offer-bell', 'The shrine in the Colonnade answers', 'A shrine among the pillars of the Colonnade; it shows a small bell.', 'When the bell is held over the bowl, the carving warms, and words come up through the stone into your hand: "They rang for us, once, to say they were near. We rang back to say we were small. It was enough."'),
  f('lore', 'offer-figure', 'The shrine at the Fallen answers', 'A shrine under the ribs of the Fallen; it shows a small kneeling figure.', '"We carved them as we saw them: kneeling, so that we could look them in the eye. This one knelt for us, at the end. We have not forgotten."'),
  f('lore', 'offer-feather', 'The shrine at the Hanging Steps answers', 'A shrine at the foot of the Hanging Steps; it shows a feather.', '"Something flies above the cloud. We have only ever found its feathers. We built the Steps to see it. We never did."'),
  f('lore', 'lore-drowned', 'A stone at the water\'s edge', 'On the bank before the Drowned One.', 'It lay down here when this was dry ground, and the water came up around it a little each year. It has not moved. Its hand has not moved. We do not go near the hand.'),
  f('lore', 'lore-pit', 'A stone at the lip of the Pit', 'At the edge of the Pit.', 'We dropped a stone. We are still listening. — Under that, in another hand: It has started to come up.'),
  f('lore', 'lore-circle', 'A stone outside the ring', 'Just outside the Circle of the Bowed.', 'We did not carve them. They were here before the giants came, and the giants will not cross the ring. We do not know what they are bowing to. We have looked. There is nothing there. There is nothing there.'),
  f('lore', 'lore-husk', 'A stone by the Husk', 'In the sand beside the Husk.', 'It was not a body. It was what one of them left behind when it grew. There are more of these, further out. Some of them are very much larger.'),
  f('lore', 'lore-hanged', 'A stone under the Hanged', 'Beneath the Hanged, among the roots.', 'We did not hang them. We do not know who did. They are not the bones of the ones who walk. They are not ours. They were already old when we came.'),
  f('lore', 'lore-sleep', 'A stone under the arch', 'Under the stone arch out on the Green.', 'They sleep where the land is low and warm. When one sleeps long enough, the grass grows over it, and then there is a hill, and then you cannot tell.'),
  // Relics: in the shrines on the giants' backs. Taking one is raiding something alive.
  f('relic', 'relic-walker', "The Walker's relic", "In the shrine on the Walker's back.", "A disc of pale stone cut with the same mark that glows in the Walker's eyes. It is warm, like something alive, and a little heavier whenever the Walker is near.", 'coin', '#bcd2e6'),
  f('relic', 'relic-grey', "The Grey One's relic", "In the shrine on the Grey One's back.", 'A stone ring worn smooth inside, as if something turned in it for a very long time.', 'ring', '#9db5c9'),
  f('relic', 'relic-herd-1', "The herd-leader's relic", "In the shrine on the back of the herd's biggest.", 'A shard of blue stone. The big one did not like you taking it. It may remember.', 'shard', '#7ea4c8'),
  f('relic', 'relic-herd-2', 'A relic from the herd', "In the shrine on one of the herd's flanks.", 'A stone bead the size of your fist, bored through by something no tool of yours could make.', 'beads', '#8fb0cf'),
  f('relic', 'relic-herd-3', 'A relic from the herd', "In the shrine on the herd's other flank.", "A flat stone scratched with five marks, the smallest scratched over and over.", 'stone', '#a3bccf'),
  f('relic', 'relic-herd-4', "A young one's relic", 'In the shrine on one of the young.', 'A pebble, still warm, that rattles as if something were inside it.', 'stone', '#b8c9d8'),
  f('relic', 'relic-herd-5', "The smallest one's relic", "In the shrine on the herd's smallest.", 'A sliver of glyph-stone. It still glows a little, and dims when you hold it, as if shy.', 'shard', '#cfe0ef'),
  // What the wisps lead to (chase the light).
  f('trinket', 'wisp-green', 'A seed of light', 'Follow the light that drifts on the western Green.', 'A smooth seed, pale as bone. In the dark of the bag it still glows, faintly, like the thing that led you to it.', 'stone', '#e8eec8'),
  f('trinket', 'wisp-wood', 'A charm of root', 'Follow the light that drifts among the giant trees.', 'A charm woven from fine root, knotted in a pattern you keep almost recognising.', 'figure', '#7a6044'),
  f('trinket', 'wisp-dunes', 'A bead of glass', 'Follow the light that drifts among the hoodoos of the Dune Sea.', 'A bead of clear glass with a single grain of sand inside it that never settles.', 'beads', '#cfe6e4'),
  // What the sunken bells wake (PLAN §4b).
  f('trinket', 'head-dunes', 'A tongue of glass', 'In the mouth of the head that rose out of the Dune Sea.', 'A long flat shard of green glass, warm, the shape of a tongue. Hold it to your ear and there is the sound of a great many people, very far off, saying one word.', 'beads', '#7fae8e'),
  f('trinket', 'stair-wood', 'A ring of bark', 'At the top of the stair that came out of the giant tree in the Old Wood.', 'A ring cut from bark as hard as stone, worn smooth inside by a finger far bigger than yours.', 'figure', '#6a5238'),
  f('trinket', 'sky-green', 'A feather of stone', 'On top of the stone that hung in the sky over the Green.', 'A flat grey stone the shape of a feather, lighter than it should be. Set it down and it does not quite touch the ground.', 'stone', '#9a9ea4'),
  // What the lantern paths lead to (light the first lamp at night; the fire runs to the ring).
  f('trinket', 'lamp-green', 'A moon of white clay', 'Light the cold lamps on the Green, at night, and follow the fire.', 'A disc of white clay, a moon pressed into it with a thumb. By day it is chalk; in the dark of the bag it is the brightest thing there.', 'stone', '#e6ecf2'),
  f('trinket', 'lamp-wood', 'A wick of moss', 'Light the cold lamps in the Old Wood, at night, and follow the fire.', 'A twist of dried moss, the kind the lamps were trimmed with. It smells of the wood after rain, and of something burning a long way off.', 'figure', '#8a9a6a'),
  f('trinket', 'lamp-dunes', 'A lamp-glass', 'Light the cold lamps of the Dune Sea, at night, and follow the fire.', 'A small cup of sea-green glass, worn smooth by sand. Hold it up and the stars through it are closer.', 'beads', '#9fd2c8'),
  // What the resonance stones kept under their slabs.
  f('trinket', 'res-steps', 'A humming stone', 'Under the slab of the ringing stones on the Steps.', 'A palm-sized stone that hums, very quietly, the note the tallest stone made. It is the only quiet thing you own.', 'stone', '#b7ad96'),
  f('trinket', 'res-wood', 'A bone flute', 'Under the slab of the ringing stones in the Old Wood.', 'A flute of pale bone with four holes. Each plays one of the stones\' notes, and no other.', 'horn', '#e2d8c0'),
  // What the stone eyes watch over (close all three of a set with the bow).
  f('trinket', 'eyes-hall', 'A lidded box', "Watched by three eyes high on the Undercroft's pillars.", 'A small stone box with a lid that will not open. When you shake it, something inside shakes back.', 'figure', '#8d8577'),
  f('trinket', 'eyes-sentinel', "The Sentinel's tear", 'Watched by three eyes set in the Sentinel itself.', 'A drop of clear stone, the size of an egg. It was lying where the Sentinel would see it, if it looked down.', 'shard', '#bfd4dc'),
  f('trinket', 'eyes-mesa', 'A sun-disc', 'Watched by three eyes in the cliffs of a mesa in the Dune Sea.', 'A disc of beaten copper, green at the edges, with a hole in the middle you can see the sky through.', 'coin', '#a86d3c'),
  // At the ends of the glyph trails (seen through the Sight-stone).
  f('trinket', 'cache-grove', 'A wooden spinner', 'At the end of the marks that wind through the Grove.', 'A spinning top carved from root, worn smooth by small hands, long ago.', 'figure', '#8a6a48'),
  f('trinket', 'cache-green', 'A bone whistle', 'At the end of the marks that start at the first camp.', "A whistle cut from a bird's bone. It makes no sound you can hear; on the Green, the grass leans toward it.", 'horn', '#e4dccb'),
  f('trinket', 'cache-steps', 'A clay tablet', 'At the end of the marks among the terraces of the Steps.', 'A tablet of fired clay pressed with rows of marks like the ones you followed here. You can almost read it.', 'stone', '#b08a62'),
  f('trinket', 'cap-feather', 'A heron\'s feather', 'On the cap of the tallest mushroom in the Marshes.', 'A grey feather as long as your arm, caught on the top of a mushroom that stands taller than a house. The birds of the marsh rest up here, out of reach of whatever walks below.', 'stone', '#8f969a'),
  f('trinket', 'clock-seed', 'A dandelion seed', 'Caught in your cloak in the Clock Meadow.', 'One seed from a clock you broke, as long as your forearm, its little umbrella of white hairs still whole. Hold it up and the slightest air lifts it out of your hand; you have to keep a finger on it.', 'stone', '#e8e4d6'),
  f('trinket', 'shell-pearl', 'A pearl', 'Just inside the mouth of the great shell, in the valley.', 'A pearl as big as your fist, dull and creamy, lying where the shell turns into the dark. Things that big make things this small, it seems, and leave them behind.', 'stone', '#e9e3d6'),
  f('trinket', 'acorn-seedling', 'A seedling', 'Growing out of a fallen acorn in the Old Wood.', 'A green shoot no longer than your hand, two leaves and a third coming, pushing up out of a crack in a nut the size of a cart. Given a few hundred years it will be one of them.', 'stone', '#5f8a32'),
  f('trinket', 'feather-barb', 'A barb', 'Come loose from a giant feather in the High Places.', 'A single barb from one of the feathers, as long as your arm and finer than a hair along its edge. It weighs nothing. Something that sheds these is out there.', 'stone', '#22232a'),
  f('trinket', 'board-piece', 'A small piece', 'On the Board, on a light square.', 'A round stone the size of your palm, carved exactly like the great pieces on the board — the bevelled rim, the ring cut in its top. Somebody made a small one.', 'stone', '#d8d0c0'),
  f('trinket', 'urchin-tooth', 'A long white tooth', 'Inside the Urchin, on the sand.', 'One tooth from the jaw that was underneath it: a white blade as long as your forearm, worn to a chisel edge. It scraped rock once.', 'tooth', '#e8e2d2'),
  f('trinket', 'web-bundle', 'A wrapped bundle', 'On the floor under the Web.', 'Something wound round and round in grey silk, fallen from far above. It is light. Whatever is inside does not rattle, and you do not unwrap it.', 'stone', '#b9b4aa'),
  f('trinket', 'lily-amber', 'A drop of nectar', 'On a lily pad in the Mire.', 'A drop of the lily\'s nectar, gone hard and gold like amber, sitting on the leaf beside the shut flower. Inside it, very small, a bubble of air from some other year.', 'stone', '#d99a2b'),
  f('trinket', 'hollow-nest', 'A nest of bark and down', 'Deep inside a fallen giant, in the Old Wood.', 'A nest woven of bark fibre and grey down, as wide as a cart wheel, old and long empty. Whatever made it lived in here, in the dark at the far end of the tree, and was big enough to need the room.', 'stone', '#8a7a62'),
  f('trinket', 'kite-steps', "A kite's spool", 'At the top of the Hanging Steps.', 'A wooden spool wound with a long, long cord, its end frayed. Whatever was flown from up here is not coming back down.', 'stone', '#a07a4c'),
  // A land's cairns all lit: an ember from them.
  f('trinket', 'ember-forest', 'An ember of the Old Wood', "Light both of the Old Wood's cairns.", 'A coal from the cairns of the Old Wood, still warm, smelling of moss and rain. It has not gone out, and you do not think it will.', 'stone', '#c06a2e'),
  f('trinket', 'ember-desert', 'An ember of the Dune Sea', "Light both of the Dune Sea's cairns.", 'A coal from the cairns of the Dune Sea, hot as noon, with red sand fused to it like glass.', 'stone', '#d0502a'),
  f('trinket', 'ember-ruins', 'An ember of the Steps', "Light both of the Steps' cairns.", 'A coal from the cairns of the Steps, cut square, as if someone had carved even the fire.', 'stone', '#b85a36'),
  // Uncovered: what was under the mound, broken open by a giant's foot.
  f('trinket', 'buried-box', 'A buried box', 'Under the mound on the eastern Green — too deep to dig.', 'A stone box the size of your two hands, split open by a giant\'s weight. Inside, wrapped in something that crumbled: a carving of a person, very small, looking up.', 'figure', '#7c776c'),
  f('trinket', 'moss-crown', 'A crown of moss', "On the Drowned One's brow, between its closed eyes.", 'A ring of living moss, woven or grown into a circle. It is still damp, and something small lives in it.', 'ring', '#5c7a3c'),
  f('trinket', 'pit-ledge', 'A cold coin', 'At the foot of the fallen slope, down in the Pit.', 'A coin, cold as if it had come up from very deep. It has a face on one side. The face has its eyes shut.', 'coin', '#8a8e92'),
  f('trinket', 'circle-stone', 'A black stone, warm', 'At the foot of the black stone in the Circle.', 'A piece of the black stone from the middle of the ring. It is warm, and the warmth does not fade. When you hold it, you feel watched — from all sides at once.', 'stone', '#18181a'),
  f('trinket', 'husk-figure', 'A little figure in a red hood', 'Inside the Husk, in the dark.', 'A small stone figure of a person in a red hood, carved with great care. It is you. You have never been here before.', 'figure', '#9b2b22'),
  f('trinket', 'hanged-ring', 'A link of chain', 'On the ground under the Hanged.', 'A link of iron chain as big as your hand, fallen from far above. It is not rusted. It is warm.', 'ring', '#3a3836'),
  // Trinkets: left on the hardest high places (a token for whoever climbs there).
  f('trinket', 'ring-hood', 'A dark ring', "On the crown of the Sentinel's hood.", 'A ring of dark metal, too large for any finger of yours and far too small for theirs.', 'ring', '#6d6a72'),
  f('trinket', 'beads-pillar', 'Clay beads', 'On top of the tallest pillar of the Colonnade.', 'Beads of fired clay on a rotten cord. Someone carried these a very long way up.', 'beads', '#b06a46'),
  f('trinket', 'figure-stair', 'A little stone giant', 'At the top of the Great Stair.', 'A small stone figure of one of them, kneeling. The carving is good. Someone loved it.', 'figure', '#9a9283'),
  f('trinket', 'key-hall', 'An iron key', 'In the darkest corner of the Undercroft.', 'An iron key. There is no lock in the Undercroft it fits. You checked.', 'key', '#5a5450'),
  f('trinket', 'tooth-skull', 'A tooth', 'On top of the skull of the Fallen.', 'A tooth from something that is not a giant. Smaller than your head. Barely.', 'tooth', '#e6dcc4'),
  f('trinket', 'horn-ribs', 'A horn cup', 'High on the ribs of the Fallen.', 'A cup carved from horn. Horn from what, you would rather not guess.', 'horn', '#c9b48a'),
  f('trinket', 'shard-sword', 'A flake of the Sword', 'Where the Sword stands in the sand.', 'A flake of the blade. It is not iron, and it does not rust, and it is very slightly warm.', 'shard', '#545c66'),
  f('trinket', 'pebble-chains', 'A chain-marked pebble', 'On top of one of the Chained Stones.', 'A pebble carved with the chain-mark. Holding it, your hand feels heavier than it should.', 'stone', '#3f4248'),
  f('trinket', 'feather-spire', 'A grey feather', 'On top of a spire in the Dune Sea.', 'A grey feather as long as your arm. Nothing you have seen has wings this size. Yet.', 'feather', '#8f8f92'),
  f('trinket', 'coin-arch', 'A stamped coin', 'On top of the stone arch out on the Green.', 'A coin with a triangle stamped on one side and nothing on the other.', 'coin', '#b89a52'),
  f('trinket', 'bell-grove', 'A small bell', 'Among the roots of the biggest tree in the Grove.', 'A bronze bell, green with age. It has no clapper, and yet when the wind is right it rings.', 'bell', '#6f8a6a'),
  f('trinket', 'ice-frozen', 'A piece of the old ice', 'At the foot of the Frozen One, among the broken shards.', 'A chip of the glacier that holds it, the size of your fist. It does not melt in your hand. Something small and dark is caught in the middle of it, and you cannot tell what.', 'shard', '#bfd4dc'),
  f('trinket', 'scale-stranded', 'A scale from the sea', 'On top of the skull of the Stranded, up the beach.', 'A scale the size of a shield, blue-grey, thin as a fingernail and stronger than anything you own. It smells of the sea even now.', 'shard', '#7ea4c8'),
  f('trinket', 'shard-mesa', 'A glassy shard', 'On top of a mesa in the Dune Sea, beside a stone.', 'A shard of black glassy stone, warm to the touch, with a single scratch on it like a tally mark.', 'shard', '#2e2a2e'),
]

export class Discoveries {
  private readonly found = new Set<string>()
  /** Found since the journal or the bag last showed them (they wear a "new" mark until then). */
  readonly unseen = new Set<string>()
  /** A new find: show it, sound it, save. */
  onFind: (find: Find) => void = () => {}

  has(id: string): boolean {
    return this.found.has(id)
  }

  /** Mark `id` found; true if it was new. */
  find(id: string): boolean {
    if (this.found.has(id)) return false
    const find = CATALOGUE.find((c) => c.id === id)
    if (!find) return false
    this.found.add(id)
    this.unseen.add(id)
    this.onFind(find)
    return true
  }

  get count(): number {
    return this.found.size
  }

  save(): string[] {
    return [...this.found]
  }

  load(ids: string[]): void {
    this.found.clear()
    for (const id of ids) if (CATALOGUE.some((c) => c.id === id)) this.found.add(id)
  }
}

/** Somewhere to be discovered by going there: within `r` metres of (x, z) — or of where `at()` says, for things that move. */
export interface Site {
  id: string
  r: number
  at: () => { x: number; z: number } | null
}

/** Check the sites against where you are, finding any you have come close enough to. */
export function visit(sites: Site[], d: Discoveries, x: number, z: number): void {
  for (const s of sites) {
    if (d.has(s.id)) continue
    const p = s.at()
    if (p && Math.hypot(p.x - x, p.z - z) < s.r) d.find(s.id)
  }
}
