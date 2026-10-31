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

export type FindKind = 'place' | 'giant' | 'lore' | 'relic' | 'trinket'

export interface Find {
  id: string
  kind: FindKind
  name: string
  /** What the journal says once it is found. */
  text: string
  /** Where to look, for the journal's empty line (before it is found). */
  hint: string
}

export const KIND_TITLES: Record<FindKind, string> = {
  place: 'Places',
  giant: 'Those who live here',
  lore: 'Words on stone',
  relic: 'Relics',
  trinket: 'Trinkets',
}

const f = (kind: FindKind, id: string, name: string, hint: string, text: string): Find => ({ id, kind, name, hint, text })

export const CATALOGUE: Find[] = [
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
  f('place', 'wall', 'The Wall', 'Look to the edge of the world on a clear day.', 'Mountains past the mountains, higher than anything should be. On a clear day you can see that something stands behind them.'),
  // Those who live here
  f('giant', 'walker', 'The Walker of the Green', 'It walks the Green, east of where you woke.', 'It walks the Green from one end to the other and back, and has worn paths doing it. It notices you the way you notice a bird.'),
  f('giant', 'wanderer2', 'The Grey One', 'It keeps to the southern Green.', 'Slower than the other. It stops for a long time, looking at nothing you can see, and then goes on.'),
  f('giant', 'herd', 'The Herd', 'The eastern Dune Sea.', 'Five of them, keeping together: the big one in front, the young ones in the middle. They graze on something in the sand. They would prefer you kept your distance.'),
  f('giant', 'beyond', 'The Ones Beyond', 'From a high place, look past the Wall.', 'Too big to be alive, and yet one of them turned to look at you. They do not come closer. You hope they do not come closer.'),
  f('giant', 'striders', 'The Striders', 'They cross the far lands on long legs.', 'Legs like threads coming down out of the cloud. They step over hills without seeming to notice them.'),
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
