# Pharmacy Commons design system

**The one reference for how the site looks.** Last reconciled with the code on
2026-10-02. It replaces `docs/design-paper-and-dark-mode.md` and the styling notes
that used to live in `CLAUDE.md`. Tokens live in `src/index.css`; this file explains
them. When the two disagree, fix whichever is wrong in the same commit.

---

## 1. The idea in one paragraph

The site is a **sheet of floral-white paper with torn edges, lying on lichen**.
Everything on the sheet is **stamped from the paper itself**, letterpress style:
buttons, cards, fields and labels are **embossed** (raised) or **debossed** (pressed
in), and that relief is the only thing that tells you what is clickable, open or
chosen. There are no colored fills, colored rims, colored focus rings or text
shadows. All text is one ink color. In dark mode the paper turns black olive and the
ink turns floral white; nothing else about the design changes.

**Rules that hold everywhere**

1. **Colorless controls.** Buttons, toggles, tabs, chips, fields, dropdowns, menus,
   cards and labels get no fill, tint or colored border. State is shown with
   emboss and deboss only (§6).
2. **All text is ink** (`text-ink`). Headings, body, links, labels and placeholders
   alike. Never put a palette color on text.
3. **No text shadows**, anywhere. The relief is in the paper; the ink stays crisp.
   (Enforced: `* { text-shadow: none !important }`.)
4. **No hover lift.** Paper doesn't float, so nothing moves on hover. Pressing in
   while clicked (`.lp-press`) is fine.
5. **Boxes only where they mean something** (§8). Reading content is separated by
   scored rules, not boxes.
6. **No native `<select>` or `<input type="date">`.** The OS draws their lists and
   calendars in its own colors. Use `PaperSelect` / `PaperDatePicker` (§7).
7. **One typeface** (§4).

---

## 2. The page: paper on lichen

Back to front:

| Layer | Element | What it paints |
| --- | --- | --- |
| Lichen | `.page-background::before` | `public/textures/lichen_bg.webp`, fixed, still (no parallax), full strength, `cover` |
| Sheet shadow | `.page-content::before` | `--paper-shadow` through the shadow tiles |
| Paper | `.paper-sheet` (first child of `.page-content`) | `--color-paper`, cut to the torn outline by the edge tiles plus a solid middle |
| Grain | `.paper-sheet::before` | `paper-grain.webp` tile, `mix-blend-mode: hard-light`, `--grain-strength` |
| Rim relief | `.paper-sheet::after` | the edge tiles again, `hard-light`, `--relief-strength` |

- `.page-content` is the page column (nav, page, footer). It is a little narrower
  than the viewport so lichen shows down both sides, and it is padded by how far the
  deepest tear reaches, so nothing ever paints over a tear.
- Grain and relief blend only with the paper color; neutral gray in the textures
  means "no change", so one set of textures serves both themes.
- Surfaces that sit above the sheet carry the same grain with `.pc-grain` (the sticky
  nav bar, the site menu, every dropdown panel). The element must already be
  positioned.

**Knobs** (on `.page-content`; dark values in brackets): `--sheet-gutter`
`clamp(4px, 1.6vw, 32px)`, `--edge-w` `clamp(17px, 3.4vw, 46px)` (scale of the tear),
`--grain-size` 600px, `--grain-strength` 0.16 [0.42], `--relief-strength` 0.61 [1],
`--paper-shadow` `rgb(0 0 0 / .65)`. `--edge-r-ratio`, `--edge-l-reach`,
`--edge-r-reach` are printed by the texture script; don't hand-edit them.

**Where the images come from.** Sources in `assets/textures/` are not served.
`scripts/paper-textures.py` turns `paper.png` (torn sheet) and `paper-texture.png`
(fibre scan) into `public/textures/paper-grain.webp` (1200px tile, shown at 600px),
`paper-grain-sm.webp` (900px, phones), `paper-edge-l/r.webp` and
`paper-shadow-l/r.webp`. `scripts/lichen-images.py` makes `lichen_bg.webp` at the
source's full resolution. Rerun the script after replacing a source and copy the
numbers it prints into `src/index.css`.

**Phones (≤ 780px).** The lichen is fetched only after load (`.pc-bg-ready`, added by
`index.html`); until then the strips show `#878a6e`, the photo's average color.
Phones get the lighter grain tile, which is the mobile LCP image. Wider screens
preload the lichen.

---

## 3. Color

### Paper and ink

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--color-paper` (`bg-paper`) | `#faf9f5` floral white | `#3a3a3a` black olive | the sheet; "same as the page" surfaces |
| `--color-ink` (`text-ink`) | `#3a3a3a` black olive (= neutral-800) | `#faf9f5` floral white (= neutral-50) | every piece of text |
| `body` background | `#faf9f5` | `#3a3a3a` | shows only on overscroll / before the lichen loads |
| `<meta name="theme-color">` | `#faf9f5` | `#3a3a3a` | phone browser chrome (set by `src/theme.ts`) |
| `--color-white` | white | `#464645` | a surface one step above the paper (rarely needed now) |

Code panels (`.pc-code`, `CODE_SURFACE` in `src/developers/Console.tsx`) are the one
exception: a dark well in both themes with floral-white ink.

### The palette

Seven OKLCH ramps, steps 50–950, base 400. Lightness is locked across hues, so a step
number carries the same weight in every color. 50–600 come from the swatch sheet;
700–950 are derived at the same hue.

| Ramp | Base 400 | Role |
| --- | --- | --- |
| mint (aquamarine) | `#62d6b2` | primary: brand mark, the logo |
| hepatica (purple) | `#cbabfd` | secondary: link underlines |
| salmon | `#ffa08d` | accent (currently unused in code) |
| rose | `#fe9fbc` | meaning: warning / high risk / error |
| marigold | `#f6cf7d` | meaning: caution / moderate risk |
| sky | `#64cfe8` | meaning: information |
| neutral | floral white 50 `#faf9f5` → black olive 800 `#3a3a3a` → 950 `#181818` | the paper and ink themselves |

**Where palette color is allowed:** meaning, not decoration or state. Risk and
severity badges (eco-risk level, controlled-substance schedule), alert and callout
washes (rose / marigold / sky), diff and status coloring in the Developers console,
and link underlines (`decoration-*`). Ramps are for fills, borders, rings and
underlines, never text. Interactive state (hover, active, selected, open, focus)
never uses color.

**Still colored today** (known, per the rule above or awaiting Joshua's call, §11):

- Link underlines: `underline decoration-hepatica-300 underline-offset-2
  hover:decoration-hepatica-600` (some footer/legal/markdown links use mint-300).
- Washes: `bg-mint-50/100` behind a few list, class, label and developer rows;
  `bg-rose/marigold/sky-50…100` callouts and badges; `data.ts` eco-risk levels.
- Small marks: the mint "Signed In" dot, list-rank bars, the Developers endpoint list
  (`bg-hepatica-100` when selected, `hover:bg-mint-50`), diff gutters.
- The global scrollbar thumb is `mint-200` (dropdown panels override it to neutral).
- The creatinine clearance widget (`src/tools/crcl/*.css`) still has its own mint
  borders, segmented buttons and hepatica focus ring. Only its dropdowns and date
  field are letterpress.

### Dark mode

- One attribute: `<html data-theme="light|dark">`, set before first paint by the
  inline script in `index.html` from `localStorage['pc-theme']`, else the system
  setting (which it keeps following while nothing is saved). Visitors switch in
  **Site menu → Appearance** (System / Light / Dark). `src/theme.ts` is the React side;
  keep its storage key and rules in step with the script.
- `:root[data-theme="dark"]` swaps paper and ink and **flips every ramp end for end**
  (50↔950, 100↔900, 200↔800, 300↔700, 400↔600, 500 stays). So `bg-rose-100` is a pale
  wash on light paper and a deep tint on dark paper with no `dark:` class. The block
  is generated from the light values; regenerate it if a ramp changes.
- The letterpress shadow colors swap too (§6).
- `dark:` (keyed to `data-theme`, not the media query) exists for the rare exception.

---

## 4. Typography

**One typeface: IBM Plex Sans Condensed** (sans-serif), for every heading, body line,
label and control. Weights loaded: 300, 400, 500, 600, 700 and 400 italic. Body is 400;
emphasis is 500 (`font-medium`) or 600 (`font-semibold`).

- `--font-sans` and `--font-display` both resolve to it. `font-display` survives only
  so older classes keep working; don't reach for it in new code.
- **IBM Plex Mono** (400/500/600, `font-mono`) is used only for machine strings:
  PCIDs, codes (ATC, NDC), JSON, API paths, numbers in tool inputs. It is not a second
  reading face.
- Fonts load in one non-blocking Google Fonts request from `index.html` (preconnected),
  never `@import` in CSS.

**Letter-spacing:** the font's own spacing everywhere. No base tracking is set.
Deliberate exceptions, all Tailwind utilities:
- `tracking-[-0.01em]` on the Nav wordmark and `.pc-hero-title` (the home title is the
  wordmark, larger: same family, weight 500, tracking).
- `tracking-[-0.015em]` on the large page titles in `SearchView.tsx` and `ClassPage.tsx`.
- Small uppercase labels with `tracking-[0.08em]`–`[0.1em]` in `LabelSections.tsx` and
  `MachinePanels.tsx` (FDA label section headings, machine panel labels).
- `tracking-[0.02em]` on group headings inside `PaperSelect`.

**Size: one golden-ratio scale** (φ = 1.618, base 16px), as Tailwind `--text-*` tokens:

| Token | Size | |
| --- | --- | --- |
| `text-xs` | 0.618rem (9.9px) | φ⁻¹ |
| `text-sm` | 0.786rem (12.6px) | φ⁻⁰·⁵ |
| `text-base` | 1rem (16px) | body |
| `text-lg` | 18.6 → 20.4px | φ⁰·⁵, fluid |
| `text-xl` | 21.6 → 25.9px | φ¹ |
| `text-2xl` | 25.0 → 32.9px | φ¹·⁵ |
| `text-3xl` | 29.1 → 41.9px | φ² |
| `text-4xl` | 33.7 → 53.3px | φ²·⁵ |
| `text-5xl` | 39.2 → 67.8px | φ³ |

`lg` and up scale with the viewport via `clamp()`. Bare headings use the scale:
h1 = 4xl, h2 = 3xl, h3 = 2xl, h4 = xl, h5 = lg, h6 = base/600. Much of the UI sets
pixel sizes with arbitrary values (`text-[13px]`, `text-[14px]`); that is the existing
practice for control and label text.

⚠ The h1–h6 size rules are unlayered, so they beat Tailwind's `text-*` utilities: a
`text-[22px]` on an `h2` is ignored. Wrapping them in `@layer base` fixes it but
resizes headings site-wide (Joshua's call). Until then, set heading sizes with a class
like `.pc-hero-title`, or use a `<p>` styled as a heading.

**Other text rules:** placeholders are full-strength ink (Tailwind's 50% fade is
undone). On phones and touch screens every input, select and textarea is at least
16px, because iOS Safari zooms the page when a smaller field gets focus. Don't "fix"
that with `maximum-scale=1`; it blocks pinch zoom on Android.

---

## 5. Spacing, layout and shape

- **Spacing:** Tailwind's default spacing scale for every margin, padding and gap.
  There are no custom spacing tokens.
- **Width:** `--container-page: 80rem` (1280px). Nav, footer and every page container
  use `max-w-page`, so their edges line up. Change it only there. Page gutters are
  `px-4 sm:px-6`.
- **Breakpoints:** Tailwind defaults. The nav becomes one 56px row (`h-14`) at `md`
  (48rem) and is a two-row grid below it. Image and grain swaps happen at 780px.
- **Overflow:** every direct child of `.page-content` is pinned to the column width
  (`width: 100%; min-width: 0; overflow-wrap: break-word`), so a wide child can't
  scroll the whole page sideways. Fix overflow there, centrally, not per page.
- **Corners:** `rounded-md` for buttons, fields, cards, stamps and day tiles (stiff
  card stock holds a tight die-cut corner); `rounded-lg` for floating dropdown panels;
  `rounded` (4px) for small stamps; `rounded-full` only for dots.
- **Focus:** a neutral ink outline, `focus-visible:outline-2
  focus-visible:outline-offset-2 focus-visible:outline-ink/40`. Text fields show focus
  by pressing in instead, with no outline.
- **Motion:** shadow transitions of 120–150ms; the menu slide and the hamburger-to-X
  animation are about 200–300ms. Every transition is off under
  `prefers-reduced-motion`.

---

## 6. Letterpress relief

Light comes from the top left. A metal die crushes the fibres into a near-vertical
wall, so every edge is a crisp 0–1px micro-shadow. The only soft layer is a 2–3px
falloff on the shaded wall.

**Recipes** (`@theme`, used as `shadow-emboss` / `shadow-deboss` or the classes below):

```
--shadow-emboss: -1px -1px 0 var(--lp-rim), 1px 1px 2px var(--lp-edge),
                 2px 2px 4px var(--lp-ambient),
                 inset 1px 1px 0 var(--lp-bevel-light), inset -1px -1px 0 var(--lp-bevel-dark);
--shadow-deboss: inset 1px 1px 1px var(--lp-wall), inset 2px 2px 3px var(--lp-slope),
                 inset 0 0 0 1px var(--lp-crease), inset -1px -1px 0 var(--lp-floor);
```

**Light and shade** (`:root`, swapped under `[data-theme="dark"]`):

| Var | Light | Dark |
| --- | --- | --- |
| `--lp-rim` (lit top-left edge) | white / .9 | white / .12 |
| `--lp-edge` (drop edge) | black / .15 | black / .6 |
| `--lp-ambient` | black / .04 | black / .3 |
| `--lp-bevel-light` / `--lp-bevel-dark` | white / .7, black / .06 | white / .08, black / .3 |
| `--lp-wall` / `--lp-slope` (inner shaded wall) | black / .15, / .07 | black / .6, / .3 |
| `--lp-crease` | black / .06 | black / .25 |
| `--lp-floor` (lit inner wall) | white / .9 | white / .12 |
| `--lp-drop` (floating panels only) | black / .14 | black / .55 |

The colors are vars because Tailwind inlines `@theme` shadow values into utilities,
so redefining `--shadow-*` for dark mode would do nothing.

**Classes: one per behaviour**

| Class | At rest | Pressed in when |
| --- | --- | --- |
| `.lp-raised` | embossed | never (labels, cards, plain buttons) |
| `.lp-sunken` | debossed | always (wells, the "Signed In" badge) |
| `.lp-field` | embossed | focused: `:focus-within`, i.e. while typing. Put it on the wrapper round the input. No outline. |
| `.lp-toggle` | embossed | `aria-pressed/expanded/selected/checked="true"`, `aria-current="page"`, or `.lp-on` |
| `.lp-flat` | flat | `aria-current="page"`, `aria-pressed="true"` or `aria-selected="true"` |
| `.lp-press` | (add to a raised link or card) | while clicked (`:active`) |
| `.lp-popover` | embossed rim plus a soft drop | (floating panel; neutral scrollbar) |
| `.lp-option` | flat | embossed while active (`data-active="true"`); debossed when chosen (`aria-selected="true"`). Autocomplete rows set `data-autocomplete` so only `data-active` shows. |

**Rules instead of borders:** `.lp-rule-t`, `.lp-rule-b`, `.lp-rule-y`,
`.lp-rule-t-until-md` (on a container), `.lp-score` / `.lp-score-v` (a 1px line
element), `.lp-divide-y` (between list children). Each is a shaded line with a lit
line beside it, scored into the paper.

**Where each state is used**

| Thing | Treatment |
| --- | --- |
| Search bars (header, home, browse, classes, list filter) | `.lp-field`: embossed, debossed while typing |
| Nav: Browse · Lists · Tools | `.lp-flat`: flat, debossed on the current page |
| Nav: "Log in / Register" | `.lp-raised .lp-press` |
| Nav: "Signed In" | `.lp-sunken` |
| Hamburger | `.lp-toggle`: embossed, debossed while open; three bars fold into an X |
| Logo tile | `.lp-raised` |
| Site menu links | `.lp-flat`, debossed on the current page |
| Appearance switch | `.lp-toggle` radios, the chosen one debossed |
| Buttons (`Button.tsx`) | embossed; `selected` makes a toggle, debossed when pressed |
| Cards (`Card.tsx`), Browse drug cards, link tiles | embossed, no colored rim, no hover movement; `sunken` for a well |
| Stamps (`Stamp.tsx`): "Feature", "Tool", "machine-assisted", "History", "View JSON record" | `.lp-raised`, no color |
| A–Z letters, tabs | `.lp-flat`, debossed when selected |
| Chips / segmented radios | embossed, debossed when checked |
| Dropdown trigger (`PaperSelect`, `PaperDatePicker`, Browse page size) | `.lp-toggle`, debossed while its list is open |
| Dropdown rows, calendar days | flat; embossed when active or hovered; debossed when chosen |

---

## 7. Components

All in `src/components/` unless noted. Default exports, no `any`.

- **`Button`**: letterpress button. `size` `sm | md`; `selected` turns it into a
  toggle (`aria-pressed`). `variant` is accepted for old callers and does nothing.
- **`Card`**: letterpress panel, `rounded-md`, `p-6` unless `padded={false}`;
  `sunken` for a well.
- **`Stamp`**: small non-interactive label, raised or `sunken`.
- **`PaperSelect`**: replaces every `<select>`. Options come from `options`
  (`{ value, label, sublabel?, badge?, group?, disabled? }`) or from `<option>` /
  `<optgroup>` children, so converting a native select is a rename. `onChange(value)`.
  A search field appears past 12 options (`searchable` overrides). Badges are raised
  stamps. Keyboard: Enter, Space, ↑ or ↓ open; ↑ ↓ Home End move; Enter picks; Escape
  or Tab closes; typing jumps to a match. The trigger is a `<button>`, so a wrapping
  `<label>` names it. The panel renders in a portal with fixed positioning, so it is
  never clipped, and flips above the trigger when there is more room there. Pass
  layout and type to `className`, not shadows.
- **`PaperDatePicker`**: replaces every `<input type="date">`. ISO strings in and out
  (`'YYYY-MM-DD'`, `''` for none); `min` / `max`; month and year menus (so a date of
  birth decades back is two picks); the chosen day is debossed, today has a small ink
  dot, days outside the month are lighter; Today and Clear buttons. Arrow keys,
  Home/End, PageUp/PageDown (Shift for a year).
- **`nativeBridge.tsx` → `enhanceNativeControls(root)`**: for DOM-built widgets (the
  CrCl calculator). It hides each native select and date input, mounts the paper
  control beside it, and writes back with real `input` / `change` events.
- **`popover.tsx`**: shared placement, outside-click and nested-panel plumbing.
- **Site menu** (`src/SiteMenu.tsx`): drops down full width from the bar's bottom
  edge, grained paper, dims the page behind it, Escape closes.
- **Autocomplete lists** (header and home search, med rec name search, the API ref
  picker): `.lp-popover .pc-grain bg-paper` panel, `.lp-option` rows with
  `data-active`, plain stamps for badges.

---

## 8. Boxes: where they stay

A box (a raised or sunken panel) stays only when the box itself carries meaning:

- **Things you click as a unit:** Browse drug cards, list cards, hierarchy and
  related-drug tiles.
- **Things that warn or inform:** the FDA boxed warning, the eco-risk card, callouts,
  account status notes, the registration clickwrap, med rec's "Check before you
  finish".
- **Tool output and editing state:** days supply results, the medication editor, live
  readouts, the printable med list.
- **Controls and code:** inputs, dropdowns, buttons, chips, code blocks, copyable
  citations.

Everything else is ruled, not boxed: label sections and accordions, rail panels,
version history, class lists, list and comparison tables, the med rec table,
Developers reference panels, account panels, markdown tables, empty-state notes.

---

## 9. Print

Plain paper: no lichen, torn edge, grain or shadow; full width. A page whose `<main>`
has `data-print-page` prints only its `[data-print]` block (the med rec printable
list), with nav and footer removed; that page sets landscape itself.

---

## 10. Files

| What | Where |
| --- | --- |
| Tokens, theme flip, letterpress classes, page/paper CSS | `src/index.css` |
| Theme script (before paint), font request, static shell | `index.html` |
| Theme choice (React) | `src/theme.ts` |
| Letterpress components | `src/components/` |
| Nav and site menu | `src/Nav.tsx`, `src/SiteMenu.tsx` |
| Texture sources / scripts / output | `assets/textures/` → `scripts/paper-textures.py`, `scripts/lichen-images.py` → `public/textures/` |
| CrCl widget theme bridge | `src/tools/crcl/crcl-theme.css` |

---

## 11. Open design questions (Joshua's call)

- **Remaining color** listed in §3: link underlines, mint/hepatica row washes, the
  Developers endpoint list, the mint scrollbar, the "Signed In" dot, the CrCl widget.
  Keep each as meaning, or take it colorless.
- **Tracked uppercase labels** in the FDA label sections and machine panels conflict
  with "no decorative tracked all-caps labels" (CLAUDE.md, Design philosophy).
- **Heading sizes:** move the h1–h6 rules into `@layer base` (§4).
- **`font-display`:** retire the alias and its uses, now that there is one typeface.
