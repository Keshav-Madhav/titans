# Resize the outfit's textures for the browser: colour and ORM/roughness as JPEG, normals as PNG.
# Usage: python3 -I tools/avatar/textures.py <extracted folder>   (writes client/public/avatar/)
import sys, os
from PIL import Image
import colorsys

def wanderer_palette(im):
    # The ranger's greens to the wanderer's worn brown wool (light green: tunic; dark green: leggings,
    # darker still), its bright metal dulled to old iron; the leather left as it is, a little greyed.
    im = im.convert('RGB')
    px = im.load()
    W, H = im.size
    for y in range(H):
        for x in range(W):
            r, g, b = (c / 255 for c in px[x, y])
            h, s, v = colorsys.rgb_to_hsv(r, g, b)
            deg = h * 360
            if 65 <= deg <= 175 and s > 0.18:
                # Green cloth -> brown wool: the darker the green, the darker the brown.
                nh = 26 / 360
                ns = 0.38 + 0.12 * (1 - v)
                nv = 0.1 + 0.78 * v
                r, g, b = colorsys.hsv_to_rgb(nh, ns, min(1, nv))
            elif s < 0.16 and v > 0.62:
                # Polished metal -> dull iron.
                k = 0.42 + 0.25 * (v - 0.62)
                r, g, b = r * k * 1.02, g * k, b * k * 0.95
            else:
                # Leather and the rest: a touch less saturated, a touch darker (worn).
                ns, nv = s * 0.85, v * 0.92
                r, g, b = colorsys.hsv_to_rgb(h, ns, nv)
            px[x, y] = (int(r * 255), int(g * 255), int(b * 255))
    return im

src = os.path.join(sys.argv[1], 'out/Modular Character Outfits - Fantasy[Standard]/Exports/glTF (Godot-Unreal)/Outfits')
out = os.path.join(os.getcwd(), 'client/public/avatar')
os.makedirs(out, exist_ok=True)
for f in sorted(os.listdir(src)):
    if not f.lower().endswith('.png'):
        continue
    im = Image.open(os.path.join(src, f))
    size = 1024 if 'Ranger' in f else 512
    im = im.resize((size, size), Image.LANCZOS)
    base = f[:-4]
    if f == 'T_Ranger_BaseColor.png':
        im = wanderer_palette(im)
    if 'Normal' in f:
        im.convert('RGB').save(os.path.join(out, base + '.png'), optimize=True)
    else:
        im.convert('RGB').save(os.path.join(out, base + '.jpg'), quality=88)
    print(f, '->', size)
