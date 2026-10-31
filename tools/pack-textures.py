"""Download the CC0 terrain textures (Poly Haven) and pack them for the game.

Each layer becomes two 1024 px JPEGs in client/public/tex/:
  <name>_c.jpg  colour (sRGB)
  <name>_n.jpg  normal X in R, normal Y in G (OpenGL convention), height in B

Raw downloads are cached in tools/.cache/ (gitignored). Run:
  python3 -I tools/pack-textures.py
"""

import json
import os
import sys
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tools', '.cache')
OUT = os.path.join(ROOT, 'client', 'public', 'tex')

# Layer order is the shader's (client/src/terrain-material.ts LAYERS).
LAYERS = [
    ('grass', 'leafy_grass'),
    ('drygrass', 'withered_grass'),
    ('forest', 'forest_leaves_04'),
    ('mud', 'brown_mud_leaves_01'),
    ('sand', 'gen:dunesand'),  # (sand_01 read as cracked plaster)
    ('redrock', 'cliff_side'),
    ('rock', 'rock_face_03'),
    ('snow', 'snow_02'),
    # Not splatted on the ground: the colossi's surfaces, generated with
    # tools/gen-textures.py (Gemini) — 'gen:<name>' reads tools/.cache/gen/<name>/.
    ('carved', 'gen:carved'),
    ('relief', 'gen:relief'),
    ('bone', 'gen:bone'),
    ('bark', 'gen:bark'),
    ('flagstone', 'gen:flagstone'),
    ('moss', 'gen:moss'),
    ('basalt', 'gen:basalt'),
    ('hide', 'gen:hide'),
]
SIZE = 1024
# Poly Haven refuses Python's default user agent.
UA = {'User-Agent': 'titans-texture-packer/1.0 (+https://polyhaven.com/license)'}


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()


def fetch(asset, kind):
    """kind: Diffuse | nor_gl | Displacement. Returns a cached local path."""
    folder = os.path.join(CACHE, asset)
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, f'{kind}.jpg')
    if os.path.exists(path):
        return path
    files = json.loads(get(f'https://api.polyhaven.com/files/{asset}'))
    url = files[kind]['1k']['jpg']['url']
    print('  get', url)
    data = get(url)
    with open(path, 'wb') as f:
        f.write(data)
    return path


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, asset in LAYERS:
        print(name, '←', asset)
        if asset.startswith('gen:'):
            folder = os.path.join(CACHE, 'gen', asset[4:])
            colour = Image.open(os.path.join(folder, 'colour.png')).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
            normal = Image.open(os.path.join(folder, 'normal.png')).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
            height = Image.open(os.path.join(folder, 'height.png')).convert('L').resize((SIZE, SIZE), Image.LANCZOS)
        else:
            colour = Image.open(fetch(asset, 'Diffuse')).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
            normal = Image.open(fetch(asset, 'nor_gl')).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
            height = Image.open(fetch(asset, 'Displacement')).convert('L').resize((SIZE, SIZE), Image.LANCZOS)
        nr, ng, _ = normal.split()
        colour.save(os.path.join(OUT, f'{name}_c.jpg'), quality=88, optimize=True)
        Image.merge('RGB', (nr, ng, height)).save(os.path.join(OUT, f'{name}_n.jpg'), quality=90, optimize=True)
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT) if f.endswith('.jpg'))
    print(f'packed {len(LAYERS)} layers, {total / 1e6:.1f} MB')


if __name__ == '__main__':
    sys.exit(main())
