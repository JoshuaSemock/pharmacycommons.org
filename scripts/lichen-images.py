#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Make the served lichen background from the source photo.

  assets/textures/lichen_bg.jpg (source photo, untouched, not served)
    -> assets/textures/lichen_bg_mint.jpg   the mint-shifted photo at q95 (reference, not served)
    -> public/textures/lichen_bg.webp       the mint-shifted photo, served on every screen size

Mint shift (2026-10-12): every hue is rotated by HUE_SHIFT_DEG in CIE LCh, so
lightness and chroma, and with them all of the photo's light, shadow and
detail, are unchanged. The lichen's dominant hue is ~112 degrees (yellow-green),
and the brand mint #62d6b2 sits at ~169 degrees, so +57 lands the lichen on the
mint. Set HUE_SHIFT_DEG = 0 to serve the original colors again.

Full resolution (2400 x 1601, the largest copy of the photo there is). No
downscaling and no separate phone crop (dropped 2026-10-01: the portrait crop
looked worse on phones than the full photo). The CSS (src/index.css,
"Background") and the preload in index.html point at the served path, so
re-running this is all an update needs. If the average color printed below
changes, update the phone placeholder (#698e82) in src/index.css and
docs/design-system.md.

  python3 scripts/lichen-images.py      (needs Pillow, numpy, scikit-image)
"""
from pathlib import Path

import numpy as np
from PIL import Image
from skimage import color

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'textures' / 'lichen_bg.jpg'
REF = ROOT / 'assets' / 'textures' / 'lichen_bg_mint.jpg'
OUT = ROOT / 'public' / 'textures'
QUALITY = 64       # the lichen is fine noise; above ~65 the file grows fast for no visible gain
HUE_SHIFT_DEG = 57.0

photo = Image.open(SRC).convert('RGB')
if HUE_SHIFT_DEG:
    lch = color.lab2lch(color.rgb2lab(np.asarray(photo) / 255.0))
    lch[..., 2] = (lch[..., 2] + np.radians(HUE_SHIFT_DEG)) % (2 * np.pi)
    rgb = np.clip(color.lab2rgb(color.lch2lab(lch)), 0, 1)
    photo = Image.fromarray((rgb * 255 + 0.5).astype(np.uint8))
    photo.save(REF, quality=95)

photo.save(OUT / 'lichen_bg.webp', quality=QUALITY, method=6)

avg = np.asarray(photo).reshape(-1, 3).mean(0).round().astype(int)
for name in ('lichen_bg.webp',):
    f = OUT / name
    with Image.open(f) as im:
        print(f'{name:24s} {im.size[0]} x {im.size[1]}  {f.stat().st_size / 1024:.0f} KB')
print(f'average color            #{avg[0]:02x}{avg[1]:02x}{avg[2]:02x}  (phone placeholder in src/index.css)')
