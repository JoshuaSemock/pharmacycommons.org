#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Make the served lichen background from the source photo.

  assets/textures/lichen_bg.jpg (source, not served)
    -> public/textures/lichen_bg.webp   full resolution, used on every screen size

No downscaling and no separate phone crop (dropped 2026-10-01: the portrait
crop looked worse on phones than the full photo). The CSS (src/index.css,
"Background") and the preload in index.html point at this path, so replacing
the source photo and re-running this is all an update needs.

  python3 scripts/lichen-images.py      (needs Pillow)
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'textures' / 'lichen_bg.jpg'
OUT = ROOT / 'public' / 'textures'
QUALITY = 64       # the lichen is fine noise; above ~65 the file grows fast for no visible gain

photo = Image.open(SRC).convert('RGB')
w, h = photo.size
photo.save(OUT / 'lichen_bg.webp', quality=QUALITY, method=6)

for name in ('lichen_bg.webp',):
    f = OUT / name
    with Image.open(f) as im:
        print(f'{name:24s} {im.size[0]} x {im.size[1]}  {f.stat().st_size / 1024:.0f} KB')
