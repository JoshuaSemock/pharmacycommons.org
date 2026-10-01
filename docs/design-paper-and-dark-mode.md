# Paper sheet, lichen and dark mode (2026-10-01)

## What changed
- **The page is one sheet of paper.** `.page-content` (the column holding nav, page
  and footer) is painted as a sheet: floral white `#faf9f5` in light mode, black olive
  `#3a3a3a` in dark, with a real paper grain over it. Its left and right edges are
  real torn edges from a photo, and the lichen photo shows around it at full strength
  (it used to be a 15% multiply wash over the whole page).
- **Default text** is black olive on light, floral white on dark (`text-ink`). Most
  components still set their own mint/sage text colors, which win over the default.
- **Dark mode.** `<html data-theme="light|dark">` is set before first paint by the
  inline script in `index.html`: the saved choice (`localStorage['pc-theme']`, set in
  Site menu → Appearance) or, if none, the system setting, which it keeps following.
  `src/theme.ts` is the React side.
- **Fewer boxes.** Containers that only hold reading content lost their border,
  background and rounding and became ruled sections (a top rule, or rules between rows).

## How the paper is drawn
Everything comes from two photos Joshua supplied in `assets/textures/` (source
files, not served): `paper.png`, a torn sheet on transparency, and
`paper-texture.png`, a flat scan of fibrous paper. `scripts/paper-textures.py`
turns them into `public/textures/`:

| File | What it is |
| --- | --- |
| `paper-grain.webp` | 1200 px seamless tile of the scan's fibres and flecks, high-passed around neutral gray (shown at 600 px, so it is 2x sharp) |
| `paper-edge-l.webp`, `paper-edge-r.webp` | the photo's real left and right tears, straightened and looped to repeat; alpha = outline, RGB = the rim's relief |
| `paper-shadow-l.webp`, `paper-shadow-r.webp` | the outline spread and blurred |

Layers inside `.page-content`, back to front:

| Layer | Element | Paint |
| --- | --- | --- |
| shadow | `.page-content::before` | `--paper-shadow`, masked by the shadow tiles |
| paper face | `.paper-sheet` (first child, in `App.tsx` and the static shell in `index.html`) | `--color-paper`, masked by the edge tiles + a solid middle |
| grain | `.paper-sheet::before` | grain tile, `hard-light`, `--grain-strength` |
| rim relief | `.paper-sheet::after` | edge tiles, `hard-light`, `--relief-strength` |

Grain and relief are children of the masked sheet, so they are clipped to the paper and
blend only with the paper color. Neutral gray means "no change", which is why one set
of textures works on floral white and black olive. Knobs on `.page-content`:
`--sheet-gutter`, `--edge-w` (scale of the tear), `--grain-size`, `--grain-strength`,
`--relief-strength` (each has a dark-mode value). Content is padded by how far the
deepest bite reaches into each tile (`--edge-l-reach`, `--edge-r-reach`, printed by the
script), so nothing paints over a tear. After replacing a photo, rerun the script and
copy the numbers it prints into the Background block of `src/index.css`.

## How dark mode colors work
`:root[data-theme="dark"]` redefines every palette step as its partner step's light
value (50↔950, 100↔900, 200↔800, 300↔700, 400↔600, 500 stays) — generated, so if
a ramp changes, regenerate the block. Because the ramps are symmetric in lightness,
text steps keep their contrast (700 on floral white ≥ 5:1 → 300 on black olive ≈ 7:1),
washes become deep tints, and borders stay quiet. `white` becomes a raised surface
one step lighter than the paper. Use `bg-paper` / `text-ink` for "same as the page".
Exceptions: `dark:` variant (keyed to `data-theme`), and `.pc-code` (keeps code
panels dark in both themes). The CrCl widget maps its tokens to site variables, so it
follows along (its own `prefers-color-scheme` block stays pinned off).

## Where boxes stay, and why
A box stays when the box itself carries meaning:
- **Things you click as a unit:** Browse drug cards, list cards on /lists, hierarchy and
  related-drug tiles on drug, class and list pages.
- **Things that warn or inform:** FDA boxed warning, eco-risk card, sky/rose/marigold
  callouts, account status notes, the registration clickwrap, the med-rec
  "Check before you finish" panel.
- **Tool output and editing state:** days-supply result columns, the medication editor,
  live calculation readouts, the printable med list.
- **Controls and code:** inputs, selects, buttons, chips, dropdowns, code blocks,
  copyable citations.

Unboxed (now ruled): label header and accordion sections, drug/class/list rail panels,
version history, class lists, list and comparison tables, med-rec table and substance
sections, Developers endpoints/feature list/schema table/console panels, account
panels and saved list, legal contact aside, markdown tables, empty-list notes.
