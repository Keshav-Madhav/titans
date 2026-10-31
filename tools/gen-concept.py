"""Concept paintings: art-direction targets for the game's look (Gemini; within the
same spend cap as gen-textures.py).

  python3 -I tools/gen-concept.py [name ...]

Writes concept/<name>.jpg (committed: these are the targets the game is held to).
"""

import io
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util

spec = importlib.util.spec_from_file_location('gen', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gen-textures.py'))
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STYLE = (
    'Cinematic concept painting for a video game in the spirit of Shadow of the Colossus and The Last '
    'Guardian: soft, hazy, painterly but grounded, muted grey-green and warm ochre palette, heavy '
    'atmospheric perspective, low overcast sky, a sense of overwhelming scale and quiet dread (no gore, '
    'no monsters attacking). A tiny figure in a red hooded cloak gives the scale. Wide 16:9 frame. '
    'No text, no logo, no frame, no watermark. Scene: '
)
SCENES = {
    'kneeling-giant': 'A wide grassy plain at the foot of layered rock cliffs. Far away across the haze, '
    'a robed stone giant kilometres tall kneels with both hands on a planted sword, its hooded head '
    'lost inside a low ceiling of storm cloud; shafts of pale sun break through a gap and light its '
    'shoulder. The tiny red-cloaked wanderer stands in the grass in the foreground, looking up.',
    'stilt-walker': 'A pale desert of wind-carved dunes and red mesas. An enormous ribcage of a fallen '
    'giant arches out of the sand in the middle distance. Beyond it, a spindly pale creature on four '
    'impossibly long thin legs walks slowly across the dunes, its small body and long neck far up '
    'inside the clouds. Dust blowing. The tiny red-cloaked wanderer on a dune crest.',
    'old-wood': 'An ancient forest of trees as tall as towers, trunks like cliffs with roots like '
    'ridges, mist between them, dim green light. Between two distant trunks, half lost in fog, a gaunt '
    'figure of twisted branches far taller than the trees stands perfectly still, one long arm '
    'pointing. The tiny red-cloaked wanderer on a mossy root, unaware.',
    'awakening': 'Seen from a ruined stone terrace at dusk: on the horizon, beyond a range of mountains, '
    'a colossal stone giant so large the mountains reach only to its knees slowly turns its head; '
    'clouds tear around it, dust falls from its shoulders in curtains. The tiny red-cloaked wanderer '
    'on the terrace, frozen, watching.',
}


def main():
    names = sys.argv[1:] or list(SCENES)
    for name in names:
        out = os.path.join(ROOT, 'concept', f'{name}.jpg')
        if os.path.exists(out):
            continue
        data, model = gen.generate(STYLE + SCENES[name], f'concept {name}', '16:9')
        Image.open(io.BytesIO(data)).convert('RGB').save(out, quality=86)
        print(f'{name}: {model}')


if __name__ == '__main__':
    sys.exit(main())
