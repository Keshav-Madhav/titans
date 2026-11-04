"""A second opinion from Gemini on screenshots or a short clip (the QA loop, docs/qa).

  python3 -I tools/gemini-review.py "<question>" <image.png|clip.webm|clip.mp4> [...]

Sends the files and the question to a Gemini flash model (vision; a clip goes inline, under
18 MB) and prints the answer. The key is read from .env.local and sent as a header: it is
never printed, logged or written anywhere. Every call is charged to the same spend ledger as
the texture and icon generators ($10 cap; a review is charged at $0.02, well above its real
cost). Answers are cached by the files' bytes and the question (tools/.cache/review/), so
asking again costs nothing. Treat what comes back as an opinion to check, not a finding.
"""

import base64
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util

spec = importlib.util.spec_from_file_location('gt', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gen-textures.py'))
gt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gt)

MODELS = ['gemini-3.8-flash', 'gemini-2.5-flash']
PER_REVIEW = 0.02
CACHE = os.path.join(gt.ROOT, 'tools', '.cache', 'review')
MIME = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webm': 'video/webm', '.mp4': 'video/mp4'}

SYSTEM = (
    'You are a demanding senior game art director and QA lead reviewing captures from TITANS, a '
    'single-player browser game about walking among vast, ancient giants in a quiet, weathered '
    'land (in the spirit of Shadow of the Colossus: dread from scale, weather and light, never '
    'jumpscares; a small red-hooded wanderer; environmental storytelling). Be specific and '
    'critical: name concrete visible defects (clipping, floating objects, z-fighting, aliasing, '
    'unreadable UI, poor contrast, inconsistent style, empty or cluttered composition, broken '
    'animation) with where in the frame they are, rank them by how much a player would notice, '
    'and say what would fix each. Do not praise. If something is fine, skip it.'
)


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    question, files = sys.argv[1], sys.argv[2:]
    parts, h = [], hashlib.sha256(question.encode())
    for f in files:
        data = open(f, 'rb').read()
        if len(data) > 18_000_000:
            raise SystemExit(f'{f}: too big to send inline')
        h.update(data)
        parts.append({'inlineData': {'mimeType': MIME[os.path.splitext(f)[1].lower()], 'data': base64.b64encode(data).decode()}})
    os.makedirs(CACHE, exist_ok=True)
    cached = os.path.join(CACHE, h.hexdigest()[:24] + '.txt')
    if os.path.exists(cached):
        print(open(cached).read())
        return
    if gt.spent() + PER_REVIEW > gt.CAP:
        raise SystemExit(f'spend cap reached (${gt.spent():.2f} of ${gt.CAP:.2f})')
    body = json.dumps({
        'systemInstruction': {'parts': [{'text': SYSTEM}]},
        'contents': [{'parts': parts + [{'text': question}]}],
        'generationConfig': {'temperature': 0.3, 'maxOutputTokens': 8192, 'thinkingConfig': {'thinkingBudget': 1024}},
    }).encode()
    for model in MODELS:
        req = urllib.request.Request(
            f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
            body, {'Content-Type': 'application/json', 'x-goog-api-key': gt.key()})
        try:
            res = json.load(urllib.request.urlopen(req, timeout=300))
        except urllib.error.HTTPError as e:
            if e.code in (404, 400) and model != MODELS[-1]:
                continue
            raise SystemExit(f'{model}: HTTP {e.code}')
        cand = res.get('candidates', [{}])[0]
        text = ''.join(p.get('text', '') for p in res.get('candidates', [{}])[0].get('content', {}).get('parts', []))
        gt.PER_IMAGE = PER_REVIEW  # (charge() bills at the module's rate)
        total = gt.charge(f'review ({model})')
        if cand.get('finishReason') not in (None, 'STOP'):
            text += f"\n[cut off: {cand.get('finishReason')}]"
        out = f'[{model} · spent ≈ ${total:.2f} of ${gt.CAP:.2f}]\n{text}'
        open(cached, 'w').write(out)
        print(out)
        return
    raise SystemExit('no model answered')


if __name__ == '__main__':
    main()
