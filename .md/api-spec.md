# Pharmacy Commons — Project Instructions for Claude

## What this project is
Pharmacy Commons (pharmacycommons.org) is an open-access, public-trust pharmacology
reference platform. It restructures FDA/WHO/NIH drug data into queryable, versioned,
wiki-editable pages, and layers on ecopharmacovigilance metrics (RQ, PEC, MEC, DPD
environmental risk quotients) to support greener prescribing. It is solo-developed by
Dr. Joshua Semock, PharmD, working primarily through GitHub's web UI.

Treat Joshua as the domain expert (PharmD) and technical decision-maker. Act as an
implementation partner: default to concrete, ready-to-use output (full files, working
code, exact commands) over abstract discussion.

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
  succinate). A solo drug's DAM **numerically mirrors** its PCID.
- PCID and DAM are the **only native keys**. Surrogate integer primary keys are
  explicitly ruled out. CAS, ChemOnt ID, FDA application number, DrugBank ID, and
  ATC codes are all foreign-sourced identifiers, never keys.
- PCIDs vacated during block migration are **permanently retired**, logged in
  `pcid_retired` for permalink/404 routing. Never reissue a retired PCID.
- Routes are slug-based with the PCID appended, e.g. `/drugs/ibuprofen/PCID-1000233`.
  The API layer resolves slug↔PCID in both directions.

**Known contradiction to fix, not follow:** `docs/api-spec.md` describes PCID as a
SHA-256 hash of the drug name (first 7 hex chars → decimal). That is incompatible with
block allocation and with DAM mirroring. The block scheme is correct; the hash
description is wrong.

## Stale files — treat as historical, not authoritative
These predate the schema rebuild and still describe the legacy scheme or a database
state that no longer exists:
- `docs/data-model-decisions.md` §4 — slug↔UID layer over API/PIN/FRM
- `schema-updates.sql` — ALTERs against `api`, `pin`, `frm`, `frm_api_junction`
- `src/data.ts` — mock entries carrying `apiUid: 'API-00NN'` and `SUB-0001`
- `README.md`, `AGENT3_*.md` — assert "23 drugs loaded," stored functions deployed,
  eco metrics populated, all checklists green. Unverified against the rebuilt schema.

Deployed functions can reference empty tables without raising errors, so **never trust
a doc's claim about loaded data**. Verify with `list_tables` (`verbose: True`,
`schemas: ['public']`) before building on it.

## Tech stack
- **Frontend:** Vite + React + TypeScript, deployed via GitHub Actions to GitHub Pages.
- **Styling:** Tailwind CSS v4, CSS-first config only (no `tailwind.config.js` — all
  tokens live in `src/index.css` inside `@theme {}`). Watch for token-name collisions
  with Tailwind built-ins.
- **Design system:** OKLCH color space, sage-toned 9-step scale plus sparser aqua/
  violet/coral/amber (amber reserved for eco-risk accents); phi (1.618) spacing scale;
  Fraunces (display serif) + IBM Plex Sans/Mono (body/data); lichen texture overlay
  (multiply blend, ~10% light / overlay ~6% dark).
- **Routing:** React Router v7, slug-based URLs, `useViewNavigate` hook preserving the
  legacy `onNavigate(view: View)` interface.
- **Backend:** Supabase (PostgreSQL), project ID `nenwovhyrdcdkhxzjiiv`. Row Level
  Security enabled; `security definer` stored functions are the only write path to live
  tables (edits route through a `revisions` staging queue, approved via
  `approve_revision()`).
- **Data sources:** openFDA (adverse events, NDC directory, labeling), WHO/NIH,
  CAS Common Chemistry API, EPA ECOTOX bulk ASCII export (gaftp.epa.gov/ecotox/ —
  direct site scraping is blocked by robots.txt), DrugBank.
- **Package manager:** pnpm.

## How Joshua works — match this
- No persistent local dev environment. Default to **GitHub's web UI** for edits;
  use **GitHub Codespaces** only when something requires a local shell (e.g.,
  `pnpm add` + regenerating `pnpm-lock.yaml`).
- Prefers **full, consolidated files** over diffs/patches, especially before touching
  live systems.
- Commits separate clean baselines (e.g., a raw Figma export) from substantive changes.
- Design rationale gets written down in `docs/` (e.g., `docs/data-model-decisions.md`).
- When editing uploaded zips in the sandbox: `cp -r` the original directory first,
  `rm` the specific target file, then `create_file` the new version — never write
  first and copy after, since `cp -r` will silently clobber new files.
- Static assets referenced in CSS must live under `public/`, served from the site
  root (Vite only serves `public/` at root).

## Database working patterns
- Large SQL files: stage at `/home/claude/`, deliver via `present_files`, paste into
  the Supabase SQL Editor. Use the `execute_sql` MCP tool for verification queries and
  targeted updates only.
- DDL constraint changes require `apply_migration`, not `execute_sql`. Drop and add
  constraints in **separate** migration calls.
- Cascading table drops require dropping dependent views first with `CASCADE`.
- Mixed-case column names must be quoted (e.g. `"Drug_Rows"`).
- Chunked inserts: ~620 rows is the validated working limit for `fda_products`-scale
  rows with long string fields.
- `ON CONFLICT DO NOTHING` is the standard re-runnable insert convention. Conflict
  targets must match an existing unique constraint — omit the clause entirely if
  constraint status is unknown.

## Design philosophy
Lean into the subject matter — the drug hierarchy, environmental data, Playfair on google fonts for serif and FigTree on google font for sans serif. Avoid AI-design tells:
uniform card grids, decorative tracked all-caps labels, scroll-triggered animation on
every element. Highlightable buttons responsive to hovering. Inspection discriptions on buttons when hovering.

## Current status (2026-09-13)
**Done:** legal foundation drafted, domain live via GitHub Pages, landing page
deployed, Excel drug matrix built needing transition to Supabase, schema rebuilt from scratch on the PCID
architecture, ETL pipeline and data audit complete.

**ETL deliverables produced (built, not yet loaded):**
- Repaired `ID_Supabase_migrated.xlsx` (3,437 rows)
- `01_core_schema_v2.sql` — PCID/DAM as PostgreSQL domains; trigger blocking invalid
  self-references in `drug_moieties`
- `02_transform.py` — emits 24 load-ready CSVs (727K+ rows)
- `04_validate.py` — simulates all PKs/FKs/CHECKs before touching the database
- `03_load.sql` — `\copy` in dependency order with post-load row-count assertions
- Supporting CSVs: `pcid_map`, `pcid_retired`, `drug_moieties`, `class_pcids`,
  `slug_changes`, `merge_candidates`

**Next:** load the 24 CSVs into Supabase and run post-load validation; CAS Common
Chemistry backfill of `physiochemical` (SMILES, InChI/InChIKey, formula, log Kow, pKa,
water solubility) for RQ/PEC/MEC; resolve `drug_id` nulls in `chemical_class_links`
(DrugBank ID → PCID); openFDA ingestion scripts; PPCP/ECOTOX CAS list refinement
(EPA Methods 1694/1698 seed list, ~101 compounds); moderator review UI; license
resolution; USPTO filing.

## Open items requiring Joshua's clinical judgment
- `_unresolved_merges.csv` — 8 `Synonym_Of_PCID` targets reference PCIDs absent from
  the spine.
- `merge_candidates.csv` — typo-fix pairs `amobrarbital` and `tetrahydrocannabidiol`
  are possible duplicate merges; the THC pair has **disagreeing controlled substance
  schedules**. Do not resolve autonomously.

## Other unresolved items
- Slug→PCID lookup behavior inside `DrugDetail`.
- GitHub Pages 404 handling for direct navigation to client-side routes.
- Community contribution/moderation workflow and moderator review UI — not yet designed.
- `RxGlyph()` in `Nav.tsx` is likely dead code, candidate for removal.

## Data quirks worth remembering
- **Slash-named rows:** a slash can be a unit or serotype separator, not a moiety
  boundary. `loperamide oral liquid` and `elecsys htlv-i/ii` are intentionally solos.
- **Mojibake:** UTF-8 bytes decoded as cp1252 corrupted spine files and the DrugBank
  Vocabulary; corrected in project files, but re-check any new import from these sources.
- **ETL bugs already handled:** 3,295 FDA products would drop on missing parent
  application rows; nullable integers serialize as floats (`8.0` vs `8`), breaking FK
  lookups.

## Response style
- Be direct and technical; skip beginner-level explanations of tools Joshua already
  uses daily (Supabase, Tailwind, GitHub Actions, pnpm).
- Confirm before deciding on canonical schema or data-architecture questions (e.g.
  which table is the authoritative spine) rather than resolving them autonomously.
- Surface licensing or legal inconsistencies (e.g. stray MIT references) if you spot
  them, rather than passing over them.
