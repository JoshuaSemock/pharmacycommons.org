#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Make the served lichen backgrounds from the source photo.

  assets/textures/lichen_bg.jpg (source, not served)
    -> public/textures/lichen_bg.webp         full width, for screens > 780px
    -> public/textures/lichen_bg_mobile.webp  portrait crop from the centre,
                                               full source height, for <= 780px

Both keep the source's full resolution: no downscaling. Phones get a portrait
crop because `background-size: cover` on a tall screen would otherwise blow a
landscape image up several times. The CSS (src/index.css, "Background") and
the preloads in index.html point at these same paths, so replacing the source
photo and re-running this is all an update needs.

  python3 scripts/lichen-images.py      (needs Pillow)
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'textures' / 'lichen_bg.jpg'
OUT = ROOT / 'public' / 'textures'
PORTRAIT = 2 / 3      # width / height of the phone crop
QUALITY = 64       # the lichen is fine noise; above ~65 the file grows fast for no visible gain

photo = Image.open(SRC).convert('RGB')
w, h = photo.size
photo.save(OUT / 'lichen_bg.webp', quality=QUALITY, method=6)

cw = round(h * PORTRAIT)
x0 = (w - cw) // 2
photo.crop((x0, 0, x0 + cw, h)).save(OUT / 'lichen_bg_mobile.webp', quality=QUALITY, method=6)

for name in ('lichen_bg.webp', 'lichen_bg_mobile.webp'):
    f = OUT / name
    with Image.open(f) as im:
        print(f'{name:24s} {im.size[0]} x {im.size[1]}  {f.stat().st_size / 1024:.0f} KB')
