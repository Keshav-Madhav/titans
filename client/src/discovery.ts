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

export type FindKind = 'place' | 'giant' | 'lore' | 'relic' | 'trinket' | 'tool'

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
}

const f = (kind: FindKind, id: string, name: string, hint: string, text: string, icon?: string, tint?: string): Find => ({ id, kind, name, hint, text, icon, tint })

export const CATALOGUE: Find[] = [
  // The first thing to find: until you have it, small things stay where they lie.
  f('trinket', 'bag', "The Traveller's Bag", 'Left at a camp on the Green, just ahead of where you woke.', 'Patched leather, deep, and somehow never full. Whoever left it here is not coming back for it.', 'bag', '#8a5a3c'),
  // Tools: things that are used, and open new ways into the land.
  f('tool', 'horn', "The Traveller's Horn", 'At a camp near the Herd, in the Dune Sea.', 'A horn made from a shell found in the sand. Blow it (H) and the nearest walker comes to see what is making the noise. Blow it from one\'s back and it walks the way you are looking.', 'horn', '#9b8a6c'),
  f('tool', 'cloak', 'The Wing-cloak', 'Left at the top of the Great Stair.', "The traveller's cloak, cut wide and stiffened along its edges with something light and strong. Jump, and hold Space as you fall: it opens, and you sail.", 'feather', '#7a2e24'),
  f('tool', 'sight', 'The Sight-stone', 'Left in the Grove, among the giant trees.', 'A disc of clouded crystal on a cord. Hold V to look through it: marks the First Ones left on the land show, faint and glowing, where the eye alone sees nothing. They lead somewhere.', 'ring', '#9fc6c8'),
  f('tool', 'bow', 'The Old Bow', 'On an altar at the far end of the Undercroft.', 'A bow of dark wood and horn, strung with something that is not gut, and a quiver that is never empty. Hold the right mouse button (or Q) to draw; click (or F) to loose. Somewhere, stone eyes are watching.', 'bow', '#5a3e2a'),
  // Places
  f('place', 'green', 'The Green', 'Where you woke.', 'Grass to the horizon in every direction, and the long swells of it. Nothing here is in a hurry.'),
  f('place', 'sentinel', 'The Sentinel', 'North, on the rim of the Green.', 'It kneels with its sword before it, and it has knelt so long that moss has climbed to its knees. Whatever it was waiting for, it is still waiting.'),
  f('place', 'undercroft', 'The Undercroft', 'Under the Green, south of where you woke.', 'A hall under the grass, its roof held on pillars no person could have raised. Light falls through in shafts. Something was kept here once.'),
  f('place', 'grove', 'The Grove', 'Deep in the Old Wood, north-west.', 'Trees as tall as the giants, and older. Their crowns meet so far overhead that rain arrives here late.'),
  f('place', 'fallen', 'The Fallen', 'The Dune Sea, south.', 'Ribs the size of towers, and a skull half-buried a little way off. One of them, lying where it lay down. The sand is slowly taking it back.'),
  f('place', 'sword', 'The Sword', 'The Dune Sea, far to the south-west.', 'A blade standing in the sand, taller than most hills. No one who could lift it is anywhere near.'),
  f('place', 'colonnade', 'The Colonnade', 'The Steps, north-east.', 'Pillars in a row, some still standing to the clouds, most fallen. Carved all over with figures too worn to read.'),
  f('place', 'stair', 'The Great Stair', 'The Steps, east.', 'Each step a cliff. It was made for feet much larger than yours, climbing to a door that has not opened in a very long time.'),
  f('place', 'chained', 'The Chained Stones', 'The far edge of the Steps.', 'Stones that would rather float, held down by chains. Someone went to great trouble to keep them here.'),
  f('place', 'steps', 'The Hanging Steps', 'Out on the western Green.', 'Slabs of stone hanging in the air in a rising spiral, held still the way the chained stones are. Someone meant them to be climbed.'),
  f('place', 'wall', 'The Wall', 'Look to the edge of the world on a clear day.', 'Mountains past the mountains, higher than anything should be. On a clear day you can see that something stands behind them.'),
  // Those who live here
  f('giant', 'walker', 'The Walker of the Green', 'It walks the Green, east of where you woke.', 'It walks the Green from one end to the other and back, and has worn paths doing it. It notices you the way you notice a bird.'),
  f('giant', 'wanderer2', 'The Grey One', 'It keeps to the southern Green.', 'Slower than the other. It stops for a long time, looking at nothing you can see, and then goes on.'),
  f('giant', 'herd', 'The Herd', 'The eastern Dune Sea.', 'Five of them, keeping together: the big one in front, the young ones in the middle. They graze on something in the sand. They would prefer you kept your distance.'),
  f('giant', 'beyond', 'The Ones Beyond', 'From a high place, look past the Wall.', 'Too big to be alive, and yet one of them turned to look at you. They do not come closer. You hope they do not come closer.'),
  f('giant', 'striders', 'The Striders', 'They cross the far lands on long legs.', 'Legs like threads coming down out of the cloud. They step over hills without seeming to notice them.'),
  // Words on stone: left by those who came before you (no one you will meet).
  f('lore', 'lore-knee', "A stone at the Sentinel's knee", 'Near the Sentinel, on the side that faces the Green.', 'We camped at its knee for nine days before we were sure it was not a statue. On the tenth it sighed, and the grass lay flat for a mile.'),
  f('lore', 'lore-hall', 'A stone in the Undercroft', 'On the floor of the Undercroft.', 'Not built for us. The steps are wrong for our legs, the doors too high to knock on. We sleep here when it storms. So do other things.'),
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
  f('lore', 'page-4', "The traveller's last page", 'At a camp at the foot of the Great Stair.', "I am going up the Stair in the morning. The door at the top has been shut a long time. If I don't come back down, the cloak I made is yours — it is waiting at the top. You'll know what it is for. Jump."),
  // Watching: stand still near one of them long enough, and you learn something.
  f('lore', 'watch-walker', 'Watching the Walker', 'Stand still near the Walker a while.', 'It stops, now and then, and lowers its head to the grass as if listening. Then it goes on, a little to one side, as though something under the ground had asked it to.'),
  f('lore', 'watch-grey', 'Watching the Grey One', 'Stand still near the Grey One a while.', 'It sat down once, while you watched, and for a long time did nothing at all. When it stood again, the ground where it had sat was warm, and the grass there greener.'),
  f('lore', 'watch-herd', 'Watching the Herd', 'Stand still near the Herd a while.', 'The young ones keep to the middle. When the big one stops, they all stop. When it turns its head toward you, so do they — all five, at once, as if they were one thing.'),
  f('lore', 'lore-mound', 'A stone by the mound', 'Beside a grassy mound on the eastern Green.', 'Something is under here. We could not dig it; the ground is like iron. They could, without meaning to — if one of them were to walk this way.'),
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
  f('trinket', 'kite-steps', "A kite's spool", 'At the top of the Hanging Steps.', 'A wooden spool wound with a long, long cord, its end frayed. Whatever was flown from up here is not coming back down.', 'stone', '#a07a4c'),
  // A land's cairns all lit: an ember from them.
  f('trinket', 'ember-forest', 'An ember of the Old Wood', "Light both of the Old Wood's cairns.", 'A coal from the cairns of the Old Wood, still warm, smelling of moss and rain. It has not gone out, and you do not think it will.', 'stone', '#c06a2e'),
  f('trinket', 'ember-desert', 'An ember of the Dune Sea', "Light both of the Dune Sea's cairns.", 'A coal from the cairns of the Dune Sea, hot as noon, with red sand fused to it like glass.', 'stone', '#d0502a'),
  f('trinket', 'ember-ruins', 'An ember of the Steps', "Light both of the Steps' cairns.", 'A coal from the cairns of the Steps, cut square, as if someone had carved even the fire.', 'stone', '#b85a36'),
  // Uncovered: what was under the mound, broken open by a giant's foot.
  f('trinket', 'buried-box', 'A buried box', 'Under the mound on the eastern Green — too deep to dig.', 'A stone box the size of your two hands, split open by a giant\'s weight. Inside, wrapped in something that crumbled: a carving of a person, very small, looking up.', 'figure', '#7c776c'),
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
  f('trinket', 'shard-mesa', 'A glassy shard', 'On top of a mesa in the Dune Sea, beside a stone.', 'A shard of black glassy stone, warm to the touch, with a single scratch on it like a tally mark.', 'shard', '#2e2a2e'),
]

export class Discoveries {
  private readonly found = new Set<string>()
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
