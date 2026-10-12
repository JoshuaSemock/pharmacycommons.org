#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Make the served lichen flank strips from the source photo.

  assets/textures/lichen_bg.jpg (source photo, untouched, not served)
    -> assets/textures/lichen_bg_mint.jpg     the mint-shifted photo at q95 (reference, not served)
    -> public/textures/lichen-flank-l.webp    left flank,  FLANK_W x 1601   (screens > 780px)
    -> public/textures/lichen-flank-r.webp    right flank, FLANK_W x 1601
    -> public/textures/lichen-flank-l-sm.webp left flank,  FLANK_W_SM x 1601 (phones)
    -> public/textures/lichen-flank-r-sm.webp right flank, FLANK_W_SM x 1601

Mint shift (2026-10-12): every hue is rotated by HUE_SHIFT_DEG in CIE LCh, so
lightness and chroma, and with them all of the photo's light, shadow and
detail, are unchanged. The lichen's dominant hue is ~112 degrees (yellow-green),
and the brand mint #62d6b2 sits at ~169 degrees, so +57 lands the lichen on the
mint. Set HUE_SHIFT_DEG = 0 to serve the original colors again.

Flank strips (2026-10-12): the lichen only ever shows in the two strips beside
the paper sheet, so instead of the whole 2400 x 1601 photo the site serves two
full-height columns cut from its most vibrant band, at the source's native
resolution (nothing is scaled). Both strips meet at column SEAM: the left strip
is SEAM..SEAM+W, the right strip SEAM-W..SEAM, so the column at each viewport
edge (the part every screen shows) is the most vibrant one, the two flanks never
repeat each other, and they read left to right like the photo. SEAM = 1220 is
where mint chroma, weighted toward the outer edges, peaks (about 1.4x the
photo's own edges, which is what `cover` used to show).

Widths: on a screen of height H the strip is drawn at H / 1601, so FLANK_W = 720
covers a flank of 0.45 H (a 2560 x 1440 monitor needs ~0.42 H) without any more
enlargement than the full photo had; wider screens enlarge it a little.
Phones show at most ~45 CSS px of lichen per side, which FLANK_W_SM = 180 covers
with room to spare at the same sharpness the full photo had.

If the average color printed below changes, update the phone placeholder
(#698e82) in src/index.css and docs/design-system.md.

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
QUALITY = 70       # the lichen is fine noise; 64 was the old full-photo setting, strips can afford a little more
HUE_SHIFT_DEG = 57.0
SEAM = 1220
FLANK_W = 720
FLANK_W_SM = 180

photo = Image.open(SRC).convert('RGB')
if HUE_SHIFT_DEG:
    lch = color.lab2lch(color.rgb2lab(np.asarray(photo) / 255.0))
    lch[..., 2] = (lch[..., 2] + np.radians(HUE_SHIFT_DEG)) % (2 * np.pi)
    rgb = np.clip(color.lab2rgb(color.lch2lab(lch)), 0, 1)
    photo = Image.fromarray((rgb * 255 + 0.5).astype(np.uint8))
    photo.save(REF, quality=95)

w, h = photo.size
assert FLANK_W <= SEAM <= w - FLANK_W, 'SEAM must leave room for both strips'

outputs = {
    'lichen-flank-l.webp': (SEAM, SEAM + FLANK_W),
    'lichen-flank-r.webp': (SEAM - FLANK_W, SEAM),
    'lichen-flank-l-sm.webp': (SEAM, SEAM + FLANK_W_SM),
    'lichen-flank-r-sm.webp': (SEAM - FLANK_W_SM, SEAM),
}
for name, (x0, x1) in outputs.items():
    photo.crop((x0, 0, x1, h)).save(OUT / name, quality=QUALITY, method=6)

avg = np.asarray(photo.crop((SEAM - FLANK_W_SM, 0, SEAM + FLANK_W_SM, h))).reshape(-1, 3).mean(0).round().astype(int)
for name in outputs:
    f = OUT / name
    with Image.open(f) as im:
        print(f'{name:26s} {im.size[0]:4d} x {im.size[1]}  {f.stat().st_size / 1024:.0f} KB')
print(f'average color (phone strips) #{avg[0]:02x}{avg[1]:02x}{avg[2]:02x}  (phone placeholder in src/index.css)')
