"""Generate surface textures with Gemini image models (user's key, 2026-10-31:
"go ham for textures"), for the things no CC0 library has: the First Ones'
carved stone, a colossus's bones, a giant tree's bark.

  python3 -I tools/gen-textures.py [name ...]      (default: every texture below)

Reads GEMINI_API_KEY from .env.local (git-ignored). For each texture:
  1. asks the model for a flat, evenly lit, front-on surface filling the frame;
  2. makes it seamless (blends it with a half-offset copy across its edges);
  3. derives height (high-passed luminance) and a normal map (Sobel);
  4. writes tools/.cache/gen/<name>/{raw,colour,height,normal}.png.
tools/pack-textures.py then packs them like the Poly Haven layers. A texture
already generated is not asked for again (delete its folder to redo it).
"""

import base64
import json
import os
import sys
import urllib.error
import urllib.request

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tools', '.cache', 'gen')
MODELS = ['gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image']
# Spend: the user's cap is $10 (2026-10-31). Each 1K image is estimated at $0.05; the
# running total is kept in tools/.cache/gen/spend.json and checked before every call.
CAP = 10.0
PER_IMAGE = 0.05
LEDGER = os.path.join(OUT, 'spend.json')


def spent():
    try:
        with open(LEDGER) as f:
            return json.load(f)['total']
    except (OSError, ValueError, KeyError):
        return 0.0


def charge(what):
    os.makedirs(OUT, exist_ok=True)
    try:
        with open(LEDGER) as f:
            led = json.load(f)
    except (OSError, ValueError):
        led = {'total': 0.0, 'items': []}
    led['total'] = round(led['total'] + PER_IMAGE, 3)
    led['items'].append(what)
    with open(LEDGER, 'w') as f:
        json.dump(led, f, indent=1)
    return led['total']

STYLE = (
    'Seamless tileable texture for a video game. A perfectly flat surface seen exactly front-on '
    '(orthographic, no perspective, no horizon, no vanishing point), filling the entire square frame '
    'edge to edge. Even, soft, shadowless diffuse light (an albedo map: no cast shadows, no '
    'highlights, no vignette). Rich, painterly but physically believable detail, like the stone in '
    'Shadow of the Colossus. No text, no letters, no watermark, no border, no frame, no objects.'
)

TEXTURES = {
    'carved': 'Ancient megalithic stone wall of enormous fitted blocks, deeply weathered, worn smooth '
    'by ages of wind and rain, with faint shallow carved bands of geometric glyphs and spirals almost '
    'worn away, hairline cracks, patches of pale lichen. Cool grey-green stone.',
    'bone': 'The surface of an enormous ancient bone, bleached and weathered: smooth ivory-grey with '
    'fine porous texture, long hairline cracks, shallow pits, faint banding, a little sand-coloured '
    'staining in the cracks.',
    'bark': 'Bark of an immense ancient tree: deep vertical furrows and thick ridges, rough fibrous '
    'texture, dark brown with grey weathering on the ridges and green moss in the furrows.',
    'flagstone': 'Ancient flagstone paving of large irregular stone slabs, edges worn round, grass and '
    'small weeds growing in the joints between the slabs, moss in the hollows, muted grey-brown stone.',
    'moss': 'Thick soft moss covering stone, dense cushions of deep green and yellow-green moss with '
    'tiny highlights of lighter tips, a few dark gaps where stone shows through.',
    'basalt': 'A slab of very dark slate-grey igneous rock, almost black, rough-hewn and pitted, with '
    'sparse pale mineral specks, faint cracks running in one direction and a dull weathered sheen.',
    'hide': 'The stone skin of a colossal ancient giant, like the body of a colossus in Shadow of the '
    'Colossus: rough eroded grey-brown rock with deep winding cracks and fissures, pitted and worn, '
    'patches of pale lichen, and clumps of coarse matted dark moss growing in the cracks like fur.',
    'relief': 'Weathered warm sandstone carved with a worn, shallow relief frieze of interlocking '
    'geometric bands and abstract giant figures, eroded by sand and wind until barely legible, fine '
    'grain, pale ochre with darker weathering in the grooves.',
}


def key():
    with open(os.path.join(ROOT, '.env.local')) as f:
        for line in f:
            if line.startswith('GEMINI_API_KEY='):
                return line.split('=', 1)[1].strip()
    raise SystemExit('GEMINI_API_KEY missing from .env.local')


def generate(prompt, what='image', aspect='1:1'):
    if spent() + PER_IMAGE > CAP:
        raise SystemExit(f'spend cap reached (${spent():.2f} of ${CAP:.2f})')
    body = json.dumps({
        'contents': [{'parts': [{'text': prompt}]}],
        'generationConfig': {'responseModalities': ['IMAGE'], 'imageConfig': {'aspectRatio': aspect, 'imageSize': '1K'}},
    }).encode()
    for model in MODELS:
        url = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key()}'
        try:
            res = json.load(urllib.request.urlopen(urllib.request.Request(url, body, {'Content-Type': 'application/json'}), timeout=180))
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:300]
            if e.code == 404:
                continue
            raise SystemExit(f'{model}: HTTP {e.code}: {msg}')
        for part in res.get('candidates', [{}])[0].get('content', {}).get('parts', []):
            if 'inlineData' in part:
                total = charge(f'{what} ({model})')
                print(f'  spent so far ≈ ${total:.2f} of ${CAP:.2f}')
                return base64.b64decode(part['inlineData']['data']), model
        raise SystemExit(f'{model}: no image in the response: {json.dumps(res)[:300]}')
    raise SystemExit('no image model answered')


def seamless(img):
    """Blend with a half-offset copy across the edges: the result tiles."""
    a = np.asarray(img, dtype=np.float32)
    h, w = a.shape[:2]
    b = np.roll(np.roll(a, h // 2, 0), w // 2, 1)
    # Weight for the offset copy: 1 at the edges, 0 over the middle.
    y = np.abs(np.linspace(-1, 1, h))[:, None]
    x = np.abs(np.linspace(-1, 1, w))[None, :]
    m = np.clip((np.maximum(x, y) - 0.55) / 0.4, 0, 1)
    m = (m * m * (3 - 2 * m))[..., None]
    return Image.fromarray(np.clip(a * (1 - m) + b * m, 0, 255).astype(np.uint8))


def height_and_normal(colour):
    """Height: luminance minus its blur (fine relief only); normal from its slopes (OpenGL)."""
    l = np.asarray(colour.convert('L'), dtype=np.float32) / 255
    blur = np.asarray(colour.convert('L').filter(ImageFilter.GaussianBlur(24)), dtype=np.float32) / 255
    hgt = np.clip((l - blur) * 2.2 + 0.5, 0, 1)
    gx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * 2.5
    gy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) * 2.5
    n = np.stack([-gx, gy, np.ones_like(hgt)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    normal = Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8))
    return Image.fromarray((hgt * 255).astype(np.uint8)), normal


def main():
    names = sys.argv[1:] or list(TEXTURES)
    for name in names:
        folder = os.path.join(OUT, name)
        os.makedirs(folder, exist_ok=True)
        raw = os.path.join(folder, 'raw.png')
        if not os.path.exists(raw):
            data, model = generate(f'{STYLE} Subject: {TEXTURES[name]}', name)
            with open(raw, 'wb') as f:
                f.write(data)
            print(f'{name}: generated with {model}')
        img = Image.open(raw).convert('RGB').resize((1024, 1024), Image.LANCZOS)
        colour = seamless(img)
        height, normal = height_and_normal(colour)
        colour.save(os.path.join(folder, 'colour.png'))
        height.save(os.path.join(folder, 'height.png'))
        normal.save(os.path.join(folder, 'normal.png'))
        print(f'{name}: ready')


if __name__ == '__main__':
    sys.exit(main())
