"""Build a before/after comparison page from two folders of screenshots.

  python3 -I tools/compare.py <before-dir> <after-dir> <out-dir> "<title>" [label=caption ...]

Pairs images by file name: before on the left, after on the right. Images that
exist only in <after-dir> are shown alone as new. Every image is re-encoded as
JPEG into <out-dir>/img/, so the page is self-contained; open <out-dir>/index.html.
"""

import html
import os
import sys

from PIL import Image


def jpeg(src, dst):
    Image.open(src).convert('RGB').save(dst, quality=84, optimize=True)


def main():
    before, after, out, title = sys.argv[1:5]
    captions = dict(a.split('=', 1) for a in sys.argv[5:] if '=' in a and not a.startswith('--'))
    # --targets=<dir>: images shown first, as what the game is aiming for.
    targets = next((a.split('=', 1)[1] for a in sys.argv[5:] if a.startswith('--targets=')), None)
    os.makedirs(os.path.join(out, 'img'), exist_ok=True)
    names = sorted(f for f in os.listdir(after) if f.endswith('.png'))
    rows = []
    if targets:
        imgs = []
        for t in sorted(os.listdir(targets)):
            if not t.lower().endswith(('.jpg', '.png')):
                continue
            dst = f'img/target-{t.rsplit(".", 1)[0]}.jpg'
            jpeg(os.path.join(targets, t), os.path.join(out, dst))
            imgs.append(f'<figure><img src="{dst}" loading="lazy"><figcaption>{html.escape(t.rsplit(".", 1)[0].replace("-", " "))}</figcaption></figure>')
        rows.append('<section><h2>The targets <em>concept paintings</em></h2><div class="pair">' + ''.join(imgs) + '</div></section>')
    for n in names:
        stem = n[:-4]
        a_dst = f'img/{stem}-after.jpg'
        jpeg(os.path.join(after, n), os.path.join(out, a_dst))
        b_src = os.path.join(before, n)
        cap = html.escape(captions.get(stem, stem.replace('-', ' ')))
        if os.path.exists(b_src):
            b_dst = f'img/{stem}-before.jpg'
            jpeg(b_src, os.path.join(out, b_dst))
            rows.append(f'<section><h2>{cap}</h2><div class="pair"><figure><img src="{b_dst}" loading="lazy"><figcaption>before</figcaption></figure>'
                        f'<figure><img src="{a_dst}" loading="lazy"><figcaption>after</figcaption></figure></div></section>')
        else:
            rows.append(f'<section><h2>{cap} <em>new</em></h2><div class="one"><figure><img src="{a_dst}" loading="lazy"></figure></div></section>')
    page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title><style>
:root {{ --bg: #16171a; --ink: #ece7dd; --dim: #9a948a; --accent: #c0392b; }}
* {{ box-sizing: border-box; }}
body {{ margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; }}
header {{ padding: 28px 24px 8px; }}
h1 {{ margin: 0; font: italic 700 28px/1.2 ui-serif, Georgia, serif; }}
header p {{ margin: 6px 0 0; color: var(--dim); }}
section {{ padding: 18px 24px 8px; }}
h2 {{ margin: 0 0 10px; font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--dim); }}
h2 em {{ font-style: normal; color: var(--accent); margin-left: 8px; }}
.pair {{ display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }}
.one {{ max-width: 960px; }}
figure {{ margin: 0; }}
img {{ width: 100%; display: block; border-radius: 6px; cursor: zoom-in; background: #000; }}
figcaption {{ margin-top: 4px; font-size: 12px; color: var(--dim); }}
#zoom {{ position: fixed; inset: 0; background: rgba(0,0,0,0.92); display: none; align-items: center; justify-content: center; cursor: zoom-out; }}
#zoom img {{ max-width: 96vw; max-height: 96vh; width: auto; cursor: zoom-out; }}
@media (max-width: 760px) {{ .pair {{ grid-template-columns: 1fr; }} }}
</style></head><body>
<header><h1>{html.escape(title)}</h1><p>Before on the left, after on the right. Click any image to see it full size.</p></header>
{''.join(rows)}
<div id="zoom"><img alt=""></div>
<script>
const z = document.getElementById('zoom');
document.querySelectorAll('section img').forEach((i) => i.addEventListener('click', () => {{ z.firstElementChild.src = i.src; z.style.display = 'flex'; }}));
z.addEventListener('click', () => (z.style.display = 'none'));
addEventListener('keydown', (e) => {{ if (e.key === 'Escape') z.style.display = 'none'; }});
</script></body></html>'''
    with open(os.path.join(out, 'index.html'), 'w') as f:
        f.write(page)
    print(f'{len(rows)} views → {os.path.join(out, "index.html")}')


if __name__ == '__main__':
    sys.exit(main())
