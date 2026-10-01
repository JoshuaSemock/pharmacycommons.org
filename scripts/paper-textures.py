#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Build the page-sheet textures from the two source photos in assets/textures/.

Inputs (source files, not served):
  assets/textures/paper-texture.png   flat scan of fibrous paper
  assets/textures/paper.png           torn sheet of paper on transparency

Outputs (served from public/textures/, used by "Background" in src/index.css):
  paper-grain.webp       seamless grain tile. Neutral gray = no change; it is
                         laid over the paper color with soft-light, so it adds
                         the fibres and flecks without changing the paper's
                         color (works on floral white and black olive alike).
  paper-edge-l.webp      the left / right torn edges of paper.png, straightened
  paper-edge-r.webp      and made to tile vertically. Alpha = the torn outline
                         (used as the mask); RGB = the edge's relief (rim
                         fibres, bites), high-passed around neutral gray and
                         laid over with soft-light.
  paper-shadow-l.webp    the same outline, spread and blurred: a soft shadow
  paper-shadow-r.webp    the sheet casts on the lichen.

  python3 scripts/paper-textures.py      (needs Pillow, numpy, scipy)

Re-run after replacing either photo, then update the numbers it prints in the
"Background" block of src/index.css: --edge-r-ratio (right tile width / left
tile width) and --edge-l-reach / --edge-r-reach (how far into each tile the
tear reaches; content is padded by that much so nothing paints over a bite).
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, grey_dilation

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'textures'
OUT = ROOT / 'public' / 'textures'

# ── Grain ────────────────────────────────────────────────────────────────────
GRAIN_CROP = 1200       # px of the scan per tile (shown at half size: 2x sharp)
GRAIN_SIGMA = 24        # high-pass radius: keeps fibres and flecks, drops shading
GRAIN_GAIN = 1.5        # strength baked into the tile (CSS opacity tunes it down)


def luminance(rgb: np.ndarray) -> np.ndarray:
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def make_seamless(img: np.ndarray) -> np.ndarray:
    """Blend the tile with a half-offset copy of itself so opposite edges meet."""
    h, w = img.shape
    shifted = np.roll(np.roll(img, h // 2, axis=0), w // 2, axis=1)
    y = np.abs(np.linspace(-1, 1, h))[:, None]
    x = np.abs(np.linspace(-1, 1, w))[None, :]
    # weight 1 in the middle of the original, 0 at its edges (where the shifted copy is seamless)
    weight = np.clip(1 - np.maximum(x, y), 0, 1) ** 0.6
    weight = np.clip(weight * 1.6, 0, 1)
    return img * weight + shifted * (1 - weight)


def build_grain() -> None:
    scan = np.asarray(Image.open(SRC / 'paper-texture.png').convert('RGB'), dtype=np.float32)
    h, w, _ = scan.shape
    y0, x0 = (h - GRAIN_CROP) // 2, (w - GRAIN_CROP) // 2
    lum = luminance(scan[y0:y0 + GRAIN_CROP, x0:x0 + GRAIN_CROP])
    detail = lum - gaussian_filter(lum, GRAIN_SIGMA)
    detail = make_seamless(detail)
    gray = np.clip(128 + detail * GRAIN_GAIN, 0, 255).astype(np.uint8)
    Image.fromarray(gray, 'L').convert('RGB').save(OUT / 'paper-grain.webp', quality=72, method=6)


# ── Edges ────────────────────────────────────────────────────────────────────
# Rows of paper.png to draw each side from (clear of the corners), and how far
# past the outermost / innermost point of the tear to keep.
EDGE_ROWS = {'l': (760, 3330), 'r': (660, 3420)}
OUTSIDE, INSIDE = 24, 70
SEARCH = 260            # rows at each end searched for the best place to cut the loop
FADE = 90               # rows cross-faded across the loop seam
SCALE = 0.5             # output px per photo px (still ~2x sharp at the CSS sizes used)
TREND_DEGREE = 3       # removes the slow bow of the sheet; the tear itself stays
RELIEF_SIGMA = 40
RELIEF_GAIN = 2.2


def edge_x(alpha: np.ndarray, side: str) -> np.ndarray:
    xs = np.empty(alpha.shape[0])
    for i, row in enumerate(alpha):
        idx = np.flatnonzero(row > 128)
        xs[i] = idx[0] if side == 'l' else idx[-1]
    return xs


def build_edge(side: str) -> tuple[int, int]:
    photo = np.asarray(Image.open(SRC / 'paper.png').convert('RGBA'), dtype=np.float32)
    ya, yb = EDGE_ROWS[side]
    band = photo[ya:yb]
    alpha = band[..., 3]
    ex = edge_x(alpha, side)

    # Straighten: remove the sheet's overall slant, keep the tear's own wander.
    ys = np.arange(len(ex))
    trend = np.polyval(np.polyfit(ys, ex, TREND_DEGREE), ys)
    resid = ex - trend
    sign = 1 if side == 'l' else -1                 # +x points into the paper
    inward = resid * sign
    lo = int(np.floor(inward.min())) - OUTSIDE       # outermost point, plus margin
    hi = int(np.ceil(inward.max())) + INSIDE         # innermost point, plus margin
    width = hi - lo

    # Paper color under fully transparent pixels, so the relief has no halo.
    lum_full = luminance(band[..., :3])
    face = np.median(lum_full[alpha > 250])
    lum_full = np.where(alpha > 8, lum_full, face)
    relief_full = lum_full - gaussian_filter(lum_full, RELIEF_SIGMA)

    strip_a = np.zeros((len(ex), width), np.float32)
    strip_r = np.zeros((len(ex), width), np.float32)
    cols = np.arange(lo, hi)
    for i in ys:
        x = np.round(trend[i] + sign * cols).astype(int)
        x = np.clip(x, 0, band.shape[1] - 1)
        strip_a[i] = alpha[i, x]
        strip_r[i] = relief_full[i, x]
    # Fade the relief out over the inside margin, so the photo's own grain
    # hands over smoothly to the grain tile instead of stopping at a line.
    deepest = int(np.ceil(inward.max())) - lo        # strip column of the innermost tear point
    ramp = np.clip(1 - (np.arange(width) - deepest - 8) / (width - deepest - 8), 0, 1)
    strip_r *= ramp[None, :]
    if side == 'r':                                  # store outside on the right
        strip_a, strip_r = strip_a[:, ::-1], strip_r[:, ::-1]

    # Loop it: cut where the outline at the end best matches the start.
    best = None
    for a in range(0, SEARCH):
        for b in range(len(ex) - SEARCH, len(ex) - FADE):
            d = abs(resid[a] - resid[b]) + 0.5 * abs((resid[a + 8] - resid[a]) - (resid[b + 8] - resid[b]))
            if best is None or d < best[0]:
                best = (d, a, b)
    _, a, b = best
    n = b - a
    t = np.linspace(0, 1, FADE)[:, None]
    tile_a = strip_a[a:b].copy()
    tile_r = strip_r[a:b].copy()
    tile_a[:FADE] = strip_a[b:b + FADE] * (1 - t) + strip_a[a:a + FADE] * t
    tile_r[:FADE] = strip_r[b:b + FADE] * (1 - t) + strip_r[a:a + FADE] * t

    w_out, h_out = round(width * SCALE), round(n * SCALE)
    a_img = Image.fromarray(np.clip(tile_a, 0, 255).astype(np.uint8), 'L').resize((w_out, h_out), Image.LANCZOS)
    r_img = Image.fromarray(np.clip(128 + tile_r * RELIEF_GAIN, 0, 255).astype(np.uint8), 'L').resize((w_out, h_out), Image.LANCZOS)
    Image.merge('RGBA', (r_img, r_img, r_img, a_img)).save(OUT / f'paper-edge-{side}.webp', quality=88, method=6)

    # Shadow: the outline spread a little and blurred.
    sa = np.asarray(a_img, dtype=np.float32)
    sa = grey_dilation(sa, size=(1, 5))
    sa = gaussian_filter(sa, 4)
    black = Image.new('L', (w_out, h_out), 0)
    shadow = Image.fromarray(np.clip(sa, 0, 255).astype(np.uint8), 'L')
    Image.merge('RGBA', (black, black, black, shadow)).save(OUT / f'paper-shadow-{side}.webp', quality=85, method=6)
    # Fraction of the tile width that is always solid paper (inside the deepest bite).
    return w_out, h_out, 1 - (deepest + 2) / width


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    build_grain()
    for s in ('l', 'r'):
        w, h, solid = build_edge(s)
        print(f'paper-edge-{s}.webp  {w} x {h}  width {w}px · tear reaches {1 - solid:.3f} of the width')
    for f in sorted(OUT.glob('paper-*.webp')):
        print(f'{f.name:22s} {f.stat().st_size / 1024:7.1f} KB')
