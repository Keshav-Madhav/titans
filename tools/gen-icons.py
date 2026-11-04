"""Painted item icons (user, 2026-11-04: "the icons still look bad" — they were canvas line drawings).

  python3 -I tools/gen-icons.py [name ...]     (default: every icon below)

Uses tools/gen-textures.py's model call, key and spend ledger ($10 cap). Each icon is asked
for once, as a single object painted in one consistent style on a flat pure-green ground; the
ground is keyed out to transparency, the object trimmed, centred and saved as a 256 px PNG in
client/public/icons/<name>.png. The game tints by item colour (bag.ts) over a neutral painting,
so each shape is generated once and recoloured per item. Already generated: skipped.
"""

import importlib.util
import io
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('gt', os.path.join(ROOT, 'tools', 'gen-textures.py'))
gt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gt)

OUT = os.path.join(ROOT, 'client', 'public', 'icons')
RAW = os.path.join(ROOT, 'tools', '.cache', 'gen', 'icons')

STYLE = (
    'A single game inventory icon, painted: one object alone, centred, filling about 70% of a square '
    'frame, seen from a three-quarter angle, soft warm light from the upper left, gentle painterly '
    'brushwork like the item art of an old storybook adventure, muted natural colours, a thin darker '
    'edge, no outline glow. The background is one flat, perfectly uniform pure green (#00ff00) colour '
    'with nothing else on it: no shadow on the ground, no table, no gradient, no texture. No text, no '
    'letters, no border, no frame, no other objects.'
)

ICONS = {
    'stone': 'a small smooth river stone, pale grey, slightly flattened, with a faint carved line across it',
    'shard': 'a sharp flake of dark glassy stone, like obsidian, with a few chipped facets catching the light',
    'ring': 'a heavy plain ring of dark old metal, slightly worn, seen at an angle',
    'key': 'an old iron key, long shank, ornate round bow, a simple bit, dark and a little rusted',
    'horn': 'a curved horn made from a large pale spiral shell, a small worn mouthpiece at its narrow end',
    'figure': 'a small carved stone figurine of a hunched kneeling giant, worn smooth, palm-sized',
    'feather': 'one long grey feather, slightly curved, its vanes a little ruffled',
    'coin': 'an old thick coin of dull gold, a simple triangle stamped on its face, worn edges',
    'tooth': 'one large pointed animal tooth, ivory coloured, a little chipped, with a darker root',
    'beads': 'a short loop of fired clay beads on a frayed cord, warm terracotta colour',
    'bell': 'a small bronze hand bell, green with age, with a short handle',
    'bow': 'a short recurve bow of dark wood and horn, strung, seen whole',
    'bag': 'a soft patched leather satchel with a flap and a single buckle, worn brown',
    'tablet': 'a small weathered stone tablet carved with rows of worn unreadable glyphs',
    'peak': 'a tiny painted landscape vignette: one tall pale mountain with a little snow, on a small floating disc of grass',
    'line': 'a neat coil of thick old hemp rope with a small three-pronged iron grappling hook tied to its end',
    'giant': 'a tiny carved stone statuette of a huge hunched gorilla-like giant made of mossy rock, standing',
}


def key_out(img):
    """Pure green → transparent, with the green spill taken off the edge."""
    a = np.asarray(img.convert('RGB')).astype(np.float32) / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    green = g - np.maximum(r, b)
    alpha = 1 - np.clip((green - 0.12) / 0.25, 0, 1)
    # Spill: where it is greenish, pull green down to the others' level.
    g2 = np.where(green > 0, np.maximum(r, b) + np.minimum(green, 0.04), g)
    out = np.dstack([r, g2, b, alpha])
    im = Image.fromarray((out * 255).astype(np.uint8), 'RGBA')
    # Soften the cut edge a hair.
    al = im.getchannel('A').filter(ImageFilter.GaussianBlur(0.6))
    im.putalpha(al)
    return im


def fit(im, size=256, fill=0.86):
    bbox = im.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    w, h = im.size
    k = size * fill / max(w, h)
    im = im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.paste(im, ((size - im.size[0]) // 2, (size - im.size[1]) // 2), im)
    return canvas


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(RAW, exist_ok=True)
    names = sys.argv[1:] or list(ICONS)
    print(f'  spent so far ≈ ${gt.spent():.2f} of ${gt.CAP:.2f}')
    for name in names:
        dst = os.path.join(OUT, f'{name}.png')
        raw = os.path.join(RAW, f'{name}.png')
        if not os.path.exists(raw):
            if gt.spent() + gt.PER_IMAGE > gt.CAP:
                print(f'{name}: over the cap, stopping')
                break
            data, model = gt.generate(f'{STYLE} The object: {ICONS[name]}.', what=f'icon:{name}')
            Image.open(io.BytesIO(data)).save(raw)
            print(f'{name}: generated with {model}')
        fit(key_out(Image.open(raw))).save(dst)
        print(f'{name}: ready')


if __name__ == '__main__':
    main()
