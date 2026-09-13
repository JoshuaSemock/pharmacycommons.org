# Pharmacy Commons — Project Instructions for Claude

## What this project is
Pharmacy Commons (pharmacycommons.org) is an open-access, public-trust pharmacology
reference platform. It restructures FDA/WHO/NIH drug data into queryable, versioned,
wiki-editable pages, and layers on ecopharmacovigilance metrics (RQ, PEC, MEC, DPD
environmental risk quotients) to support greener prescribing. It is solo-developed by
Dr. Joshua Semock, PharmD, working primarily through GitHub's web UI.

Treat Joshua as the domain expert (PharmD) and technical decision-maker. Act as an
implementation partner: default to concrete, ready-to-use output (full files, working
code, exact commands) over abstract discussion. **Always state the destination path
for every file produced.**

## Legal & governance context (don't contradict these)
- Structured as a single-member LLC (no non-profit board), with future intent to
  convert to a non-profit.
- Codebase license: **GPL-3.0** (copyleft, blocks private monetization). Aggregated
  datasets: **Creative Commons**. Note: project docs have historically mixed up MIT
  and GPL-3.0 — always use GPL-3.0 for the codebase unless Joshua says otherwise, and
  flag it if you see MIT referenced anywhere.
- Domain via Porkbun; future USPTO Intent-to-Use trademark filing planned (software/
  database, Class 42) under "Pharmacy Commons." The MIT/GPL-3.0 inconsistency blocks
  this filing and is still unresolved.

## Identifier scheme — settled, do not reopen
The canonical scheme is **PCID / DAM**. The older API-XXXX → PIN-XXXX → FRM-XXXX
(plus CS-XXXX) hierarchy is **legacy and superseded** — do not propose it, extend it,
or blend it into a hybrid.

- **PCID-XXXXXXX** — drug entity identifier, allocated in blocks:
  - `PCID-1XXXXXX` — solo medications
  - `PCID-2XXXXXX` — combination products
  - `PCID-3XXXXXX` — wiki-editable class pages
    (ATC: 3000001–3099999; ChemOnt: 3100001–3199999)
- **DAM-1XXXXXX** — moiety-level active ingredient (metoprolol, not metoprolol
  succinate). A solo drug's DAM **numerically mirrors** its PCID. Combination
  products have no single mirrored DAM; `DAM-2XXXXXX` is not a valid identifier.
- PCID and DAM are the **only native keys**. Surrogate integer primary keys are
  explicitly ruled out. CAS, ChemOnt ID, FDA application number, DrugBank ID, and
  ATC codes are all foreign-sourced identifiers, never keys.
- PCIDs vacated during block migration are **permanently retired**, logged in
  `pcid_retired` for permalink routing. Never reissue a retired PCID.
- Routes are slug-based; the API layer resolves slug↔PCID in both directions.

**Known contradiction to fix, not follow:** `.md/api-spec.md` describes PCID as a
SHA-256 hash of the drug name (first 7 hex chars → decimal). That is incompatible with
block allocation and with DAM mirroring. The block scheme is correct; the hash
description is wrong.

## Stale files — treat as historical, not authoritative
These predate the schema rebuild and describe either the legacy identifier scheme or
a database state that no longer exists:
- `docs/data-model-decisions.md` §4 — slug↔UID layer over API/PIN/FRM
- `docs/schema-updates.sql` — ALTERs against `api`, `pin`, `frm`, `frm_api_junction`
- `src/data.ts` — mock entries carrying `apiUid: 'API-00NN'` and `SUB-0001`
- `.md/README.md`, `.md/AGENT3_*.md`, `.md/INTEGRATION_GUIDE.md` — assert "23 drugs
  loaded," stored functions deployed, eco metrics populated, all checklists green.
  None of this is true; Supabase `public` was cleared.

Deployed functions can reference empty tables without raising errors, so **never trust
a doc's claim about loaded data**. Verify with `list_tables` (`verbose: True`,
`schemas: ['public']`) before building on it.

## Tech stack
- **Frontend:** Vite + React 19 + TypeScript, deployed via GitHub Actions to GitHub Pages.
- **Styling:** Tailwind CSS v4, CSS-first config only (no `tailwind.config.js` — all
  tokens live in `src/index.css` inside `@theme {}`). Watch for token-name collisions
  with Tailwind built-ins.
- **Design system:** OKLCH color space, sage-toned 9-step scale plus sparser aqua/
  violet/coral/amber (amber reserved for eco-risk accents); phi (1.618) spacing scale;
  Fraunces (display serif) + IBM Plex Sans/Mono (body/data); lichen texture overlay
  (multiply blend, ~10% light / overlay ~6% dark).
- **Routing:** React Router v7, slug-based URLs.
- **Backend:** Supabase (PostgreSQL), project ID `nenwovhyrdcdkhxzjiiv`. Row Level
  Security enabled; `security definer` stored functions are the only write path to live
  tables (edits route through a `revisions` staging queue, applied by
  `approve_revision()`).
- **Package manager:** pnpm, version pinned via `packageManager` in `package.json`.
  **Never add a `version:` key to `pnpm/action-setup` in the workflow** — declaring it
  in both places is a hard error.

## Repository layout — get paths right
GitHub's web UI makes it easy to commit a correctly-written file to the wrong path,
where it silently does nothing. Canonical locations:

| What | Path |
| --- | --- |
| Deploy workflow | `.github/workflows/deploy.yml` (nowhere else runs) |
| React source | `src/` |
| Static assets served at site root | `public/` |
| Build/ETL scripts | `scripts/` |
| Design rationale | `docs/` |
| Historical/handoff docs | `.md/` |
| SQL schema | `db/` (or pasted straight into the Supabase SQL Editor) |

`public/drug-catalog.json` in particular must be under `public/` — anywhere else and
the runtime fetch 404s while the build stays green. Same for `public/404.html`, which
the GitHub Pages SPA redirect depends on.

## Static drug catalog
`public/drug-catalog.json` ships the full PCID spine (3,433 entries, ~47 KB gzipped) so
search and routing work with no backend. `src/catalog.ts` reads it and exposes
`searchCatalog()`, `getBySlug()`, and `getDrug()`. Slug is the join key.

When Supabase is live, register the hydrator in `src/main.tsx`:
```ts
import { setHydrator } from './catalog'
import { getDrugBySlug } from './api'
setHydrator(getDrugBySlug)
```
Components don't change; they read `completeness` (`'partial'` | `'full'`) to decide how
much detail to render. A backend outage degrades detail, never availability.

Regenerate with `scripts/build-catalog.mjs` when the spine changes.

## How Joshua works — match this
- No persistent local dev environment. Default to **GitHub's web UI** for edits;
  use **GitHub Codespaces** only when something requires a shell (e.g. `pnpm install`
  + regenerating `pnpm-lock.yaml`).
- Prefers **full, consolidated files** over diffs/patches, especially before touching
  live systems.
- Commits separate clean baselines (e.g. a raw Figma export) from substantive changes.
- Design rationale gets written down in `docs/`.
- When editing uploaded zips in the sandbox: `cp -r` the original directory first,
  `rm` the specific target file, then `create_file` the new version — never write
  first and copy after, since `cp -r` will silently clobber new files.

## Database working patterns
- Large SQL files: stage in the sandbox, deliver via `present_files`, paste into the
  Supabase SQL Editor. Use `execute_sql` for verification queries and targeted updates
  only.
- DDL constraint changes require `apply_migration`, not `execute_sql`. Drop and add
  constraints in **separate** migration calls.
- Cascading table drops require dropping dependent views first with `CASCADE`.
- Mixed-case column names must be quoted (e.g. `"Drug_Rows"`).
- Chunked inserts: ~620 rows is the validated limit for `fda_products`-scale rows with
  long string fields.
- `ON CONFLICT DO NOTHING` is the standard re-runnable insert convention. Conflict
  targets must match an existing unique constraint — omit the clause entirely if
  constraint status is unknown.

## Source workbook quirks
- **Headers are on row 3**, not row 1; columns A–B are blank. Any script reading these
  must skip two rows (`range: 2` in SheetJS, `min_row=3` in openpyxl).
- **`class_id` is empty across all 3,433 spine rows.** The DrugBank ID → PCID backfill
  is therefore the only path to populating `chemical_class_links`, not an optimization.
- **Slash-named rows:** a slash can be a unit or serotype separator, not a moiety
  boundary. `loperamide oral liquid` and `elecsys htlv-i/ii` are intentionally solos.
- **Mojibake:** UTF-8 bytes decoded as cp1252 corrupted spine files and the DrugBank
  Vocabulary; corrected in project files, but re-check any new import from these sources.
- **ETL failure modes already known:** 3,295 FDA products drop if parent application
  rows load second (load `fda_applications` first); nullable integers serialize as
  floats (`8.0` vs `8`), breaking FK lookups.

## Design philosophy
Lean into the subject matter — the drug hierarchy, environmental data, Playfair for serif and for san serif Figtree
typographic character — rather than generic SaaS conventions. Avoid AI-design tells:
uniform card grids, decorative tracked all-caps labels, scroll-triggered animation on
every element.

## Current status (2026-09-13)
**Done:** legal foundation drafted, domain live via GitHub Pages, landing page deployed,
Excel drug matrix built, static drug catalog generated and committed.

**Supabase is empty.** The `public` schema was cleared; `auth` and `storage` are intact.
`01_core_schema_v2.sql` (25 tables, 9 functions, RLS throughout) has been rebuilt from
the locked architectural decisions but not yet deployed.

**Gone and needing regeneration:** `02_transform.py`, `03_load.sql`, `04_validate.py`,
and the 24 load-ready CSVs. Any rebuild must match the table and column names in
`01_core_schema_v2.sql` exactly.

**Next:** deploy the schema; regenerate the ETL; load and validate; CAS Common Chemistry
backfill of `physiochemical` (SMILES, InChI/InChIKey, formula, log Kow, pKa, water
solubility) for RQ/PEC/MEC; resolve `drug_id` nulls in `chemical_class_links`; openFDA
ingestion; PPCP/ECOTOX refinement (EPA Methods 1694/1698 seed list, ~101 compounds, via
gaftp.epa.gov bulk export — direct scraping is blocked by robots.txt); moderator review
UI; license resolution; USPTO filing.

## Open items requiring Joshua's clinical judgment
- `_unresolved_merges.csv` — 8 `Synonym_Of_PCID` targets reference PCIDs absent from
  the spine.
- `merge_candidates.csv` — typo-fix pairs `amobrarbital` and `tetrahydrocannabidiol`
  are possible duplicate merges; the THC pair has **disagreeing controlled substance
  schedules**. Do not resolve autonomously.
- The spine is 3,433 rows in `ID_Supabase.xlsx` but was 3,437 in the repaired migrated
  file. Those four rows are unaccounted for; `public/drug-catalog.json` was generated
  from the 3,433.

## Other unresolved items
- GitHub Pages 404 handling for direct navigation to client-side routes.
- Community contribution/moderation workflow and moderator review UI — not yet designed.
- `RxGlyph()` in `src/Nav.tsx` is likely dead code, candidate for removal.
- `src/data.ts` mock entries are now redundant with the static catalog; delete them
  along with their `API-00NN` identifiers.

## Response style
- Be direct and technical; skip beginner-level explanations of tools Joshua already
  uses daily (Supabase, Tailwind, GitHub Actions, pnpm).
- Confirm before deciding on canonical schema or data-architecture questions (e.g.
  which table is the authoritative spine) rather than resolving them autonomously.
- Surface licensing or legal inconsistencies (e.g. stray MIT references) if you spot
  them, rather than passing over them.
