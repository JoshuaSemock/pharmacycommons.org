# Drug page redesign (2026-11-03)

Destination: `docs/drug-page-redesign-plan.md`

Scope: the drug page (`/drugs/:slug`, `src/DrugDetail.tsx`). Concept, class and list pages are untouched.

## Goals (Joshua, 2026-11-03)

1. The Quick facts rail runs the full height of the page instead of a sticky box capped at the viewport height.
2. The drug name, INN and brand names move to the right column.
3. Other appearance improvements, recommended first and then built (below).

## Decisions

- The page header sits in the right column, above the Overview. This replaces the logged order "header → jump link → Quick facts" for desktop. On phones the order is unchanged: header, jump link, Quick facts, Overview.
- The rail scrolls with the page. Only the "On this page" index is sticky. (Joshua did not choose between "scrolls with the page" and "sticky at full viewport height"; the first was recommended and built. Say if you want the other.)
- No colour is added anywhere. New controls use the existing embossed/debossed classes; group labels are flat.

## Plan and status

| # | Change | Files | Status |
| --- | --- | --- | --- |
| 1 | Header into the right column; DOM order is header first, then rail (visual order on phones kept by `order-*`) | `DrugDetail.tsx` | Done |
| 2 | Rail: drop `lg:sticky`, `max-h` and `overflow-y-auto`; `lg:self-stretch` so it spans the row | `DrugDetail.tsx` | Done |
| 3 | Header: one "drug · INN" subtitle (INN stamp removed); Network, Edit/History/Sign in, Save in one action row beside the title; brand chips capped at 6 with "+n more" | `DrugDetail.tsx`, `CommunityPage.tsx` (`PageTools inline`), `BrandNames.tsx` | Done |
| 4 | Quick facts in three groups (From the label, Class and status, Safety flags); Boxed warning first | `DrugDetail.tsx` | Done |
| 5 | Long values (Indications, Dosing, Contraindications) clamp to about five lines with Show more / Show less, only when cut off | `DrugDetail.tsx` (`Clamp`) | Done |
| 6 | Single structure drawing gets a shorter well (`h-40`); multi-component drawings keep 4:3 | `StructureDrawing.tsx` | Done |
| 7 | Raw `[@dailymed:…]` citation text shown as "DailyMed label" and linked to DailyMed | `infobox.ts`, `InfoboxFact.tsx`, `infobox.test.ts` | Done |
| 8 | Hierarchy: combination products fold to one line ("Show 49 combination products") above 12; denser tiles, up to four columns at 2xl | `DrugDetail.tsx` | Done |
| 9 | "On this page" index (Overview, then every top-level section) pinned in the empty space under Identifiers; desktop only | `DrugDetail.tsx` (reuses `pages/OnThisPage.tsx`) | Done |
| 10 | Identifiers can be hidden (open by default) | `DrugDetail.tsx` | Done |
| 11 | Phones: Quick facts shows the label group first; the other two groups sit behind "Show class, status and safety flags" | `DrugDetail.tsx` | Done |

Not changed: the mobile overflow on Browse (separate, fix centrally per the 2026-10-18 decision), the reading order on phones, label text, Quick facts editing.

## Verification (2026-11-03)

- `pnpm exec tsc --noEmit` clean; `pnpm exec vitest run` 63 files, 689 tests pass (3 new, for keyed citations).
- Built from current `main` (70c76ce) plus the patch, run with `vite` and opened in the browser against live data (metformin):
  - 1440 px wide: rail 5,876 px tall, equal to the grid; no overflow or max-height; the index stays at the nav line while scrolling; header and brand chips in the right column.
  - 375 px wide: header first, no horizontal overflow, the "Show class…" button present.
- Not checked: a signed-in editor view, and pages for a salt, brand or combination (several drawings), a drug with no label, or a biologic with no drawing.

## Follow-ups

- Add a What's new entry in `src/updates.ts` when this ships.
- `docs/design-system.md` has no section on the drug page layout; none was added.
