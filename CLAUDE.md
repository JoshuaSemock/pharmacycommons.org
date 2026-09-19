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

## Identifier scheme & data architecture — confirmed from Drug_Matrix_Master.xlsx (2026-09-19)
The canonical scheme is **PCID only**, allocated in 9 blocks, per the workbook's own
`PCID_Blocks` sheet (this supersedes any earlier 3-block description in this doc):

| Block | Entity kind | Range | Slug prefix | Sheet |
| --- | --- | --- | --- | --- |
| 1 | Active moiety | 1000001–1999999 | `pc:moiety:` | `Drug_Index` |
| 2 | Combination product | 2000001–2999999 | `pc:combination:` | `Combinations` |
| 3 | Precise form (salt/ester/stereoisomer) | 3000001–3999999 | `pc:precise_form:` | `Precise_Forms` |
| 4 | Marketed formulation (brand/proprietary) | 4000001–4999999 | `pc:formulation:` | `Formulations` |
| 5 | Pharmacologic class | 5000001–5999999 | `pc:class:` | `Class_Definitions` |
| 6 | Clinical concept | 6000001–6999999 | `pc:clinical:` | `Clinical_Concepts` |
| 7 | Measurement | 7000001–7999999 | `pc:measurement:` | `Measurements` |
| 8 | Biological target | 8000001–8999999 | `pc:target:` | `Biological_Targets` |
| 9 | Functional group | 9000001–9999999 | `pc:functional:` | `Functional_Groups` |

**Known swap (intentional, do not "fix"):** the written spec put Precise_Forms in
block 2 and Combinations in block 3; live Supabase data already used
`PCID-2000001..2000168` for combinations, so blocks 2 and 3 are swapped from spec in
the table above. No identifier changes or redirects needed — the table above is
correct as the live scheme.

**DAM is retired as of 2026-09-19** — do not create, reference, or design around a
DAM/moiety-level key anywhere (schema, ETL, API types, docs). The `Legacy_DAM` column
still present in the pre-cleanup workbook is being removed by Joshua; treat any
`DAM-XXXXXXX` value as dead data, not a key to migrate. The older
API-XXXX → PIN-XXXX → FRM-XXXX (plus CS-XXXX) hierarchy remains legacy/superseded too
— do not propose, extend, or blend either scheme.

- PCID is the **only native key**. Surrogate integer primary keys are explicitly
  ruled out. CAS, ChemOnt ID, FDA application number, DrugBank ID, UNII, InChIKey, and
  ATC codes are all foreign-sourced identifiers, never keys.
- **Relationships between PCIDs are modeled as a triple store, not FK junction tables
  per relationship type.** The `Clinical_Statements` sheet is the provenance/assertion
  engine: `statement_id, Subject_PCID, Predicate, Object_*, Quantifier_*, Evidence_Level,
  Evidence_Source`. The `Sandbox` sheet's `Legend_Key`-registered predicate vocabulary
  (`treats`, `inhibits`, `induces`, `is_substrate_of`, `has_pgx_association`,
  `contraindicated_with`, `causes`, `monitored_by`, `derived_from`, `member_of`,
  `has_component`, `has_warning`, `has_side_effect`, `has_contraindication`, etc.) is
  the controlled predicate list — do not invent new predicates without adding them to
  `Legend_Key` first. **Ingredient/moiety relationships (e.g. a combination's
  component moieties) use the `has_component` predicate against Block-1 PCIDs**, not a
  separate moiety identifier or a bespoke junction table. Confirm with Joshua only if a
  relationship doesn't fit an existing predicate.
- PCIDs vacated during block migration are **permanently retired**, logged for
  permalink routing. Never reissue a retired PCID.
- Routes are slug-based (`Slug_URI` / `Slug` columns); the API layer resolves
  slug↔PCID in both directions. `Slug_Suggested` is a derived proposal column only —
  never treat it as the published slug until promoted by hand.
- **ID stability:** PCID and Slug_URI are static, hand-set values, not live formulas —
  sorting/deleting workbook rows does not renumber them. New IDs come from each
  block's `Next_PCID` in `PCID_Blocks`, never by incrementing the last row.

**Known contradiction to fix, not follow:** `.md/api-spec.md` describes PCID as a
SHA-256 hash of the drug name (first 7 hex chars → decimal). That is incompatible with
block allocation. The block scheme above is correct; the hash description is wrong.

## Stale files — treat as historical, not authoritative
These predate the schema rebuild and/or the DAM retirement, and describe either the
legacy identifier scheme or a database state that no longer exists:
- `docs/data-model-decisions.md` §4 — slug↔UID layer over API/PIN/FRM
- `docs/schema-updates.sql` — ALTERs against `api`, `pin`, `frm`, `frm_api_junction`
- `src/data.ts` — mock entries carrying `apiUid: 'API-00NN'` and `SUB-0001`
- `src/api.generated.ts` — currently has no DAM references, but re-check before
  extending it; anything modeling moiety-level identity should use the
  `Clinical_Statements` triple store (`has_component`, etc.), not a new identifier
- `.md/README.md`, `.md/AGENT3_*.md`, `.md/INTEGRATION_GUIDE.md` — assert "23 drugs
  loaded," stored functions deployed, eco metrics populated, all checklists green.
  None of this is true; Supabase `public` was cleared.
- Any prior mention of `DAM-XXXXXXX` or "DAM mirrors PCID" anywhere in docs/code is
  obsolete — DAM no longer exists as an identifier.
- Earlier drafts of this doc describing "Block 3 = wiki-editable class pages
  (ATC/ChemOnt sub-ranges)" — wrong; see the confirmed 9-block table above.

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

## Static drug catalog — being retired
`public/drug-catalog.json` currently ships the full PCID spine (3,433 entries, ~47 KB
gzipped) so search and routing work with no backend, via `src/catalog.ts`
(`searchCatalog()`, `getBySlug()`, `getDrug()`). **Joshua is moving off this static
path**: once Supabase is loaded from the cleaned `Drug_Matrix_Master.xlsx` CSVs, the
static catalog and its `'partial'`/`'full'` completeness split go away in favor of
querying Supabase directly. Don't invest further in the static-catalog path
(regeneration scripts, completeness fallback logic) beyond what's needed to keep the
site functional during the transition — treat it as scaffolding being dismantled, not
a permanent architecture layer.

`src/main.tsx` does not currently call `setHydrator`/`getDrugBySlug` — the hydration
wiring described in earlier versions of this doc was never activated. Given the move
away from the static catalog entirely, don't wire it now; build the Supabase-backed
data path directly instead.

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

## Source workbook structure (Drug_Matrix_Master.xlsx, confirmed 2026-09-19)
- **Real header row is row 4**, not row 3 — row 3 holds the sheet title + a
  description note, columns A–B are blank, row 4 is the actual column header. Any
  script reading these sheets must skip three rows (`range: 3` in SheetJS,
  `min_row=4` in openpyxl).
- Sheet inventory: `Table_Contents`, `Sandbox` (predicate scratch/triple staging),
  `Dispatch_Log` (audit trail of sandbox routing runs), `Legend_Key` (controlled
  vocabularies: Controlled_Schedule, Evidence_Level, Predicate, plus formula/notes
  documentation), `PCID_Blocks` (the 9-block registry above, with `Next_PCID` per
  block), then the 9 entity sheets (`Drug_Index`, `Combinations`, `Precise_Forms`,
  `Formulations`, `Class_Definitions`, `Clinical_Concepts`, `Measurements`,
  `Biological_Targets`, `Functional_Groups`), plus `Clinical_Statements` (the triple
  store) and `Unclassified_Holding` (staging for rows with no PCID minted yet —
  `Term_Type = 'Unclassified'`, triage into a block before assigning an ID).
- Entity sheets 1–5 (`Drug_Index` through `Class_Definitions`) share one column
  spine: `Row_No, PCID, Slug_URI, <Name field>, Class_PCID, Class_Name, Is_Controlled,
  Controlled_Schedule, PCID_Label, Slug, Slug_Suggested, Origin, Term_Type, Base_Name,
  Synonym_Of_PCID, Block_Exception, Legacy_DAM, Primary_Brand, DrugBank_ID, CAS, UNII,
  InChI_Key, ChemOnt_IDs, NDC_Codes, FDA_ApplNos, LactMed_ID, Legal_Status,
  Statute_Citation, MPJE_Relevance, FDA_Marketing_Status, Rx_Status, Primary_Source,
  Source_Count, Created_At, Updated_At`. `Class_Definitions` itself is narrower:
  `Row_No, PCID, Slug_URI, Class_Name, MOA, PE, CS, Source_Agency, Source_Ref,
  Updated_At`.
- `Legacy_DAM` is the column being dropped in Joshua's cleanup pass — expect it gone
  in the next version delivered.
- `Block_Exception`: 136 entities hold a live block-1 PCID but classify as salt,
  combination, or brand under `Term_Type` — the live ID wins; this column just
  records the conflict for later triage, don't "fix" it by reassigning the PCID.
- `Synonym_Of_PCID`: 96 rows claimed a PCID already held by a better-matching row;
  they got their own ID and point back at the retained entity via this column.
- **`class_id` is empty across all 3,433 spine rows.** The DrugBank ID → PCID backfill
  is therefore the only path to populating chemical-class links, not an optimization.
- **Slash-named rows:** a slash can be a unit or serotype separator, not a moiety
  boundary. `loperamide oral liquid` and `elecsys htlv-i/ii` are intentionally solos.
- **Mojibake:** UTF-8 bytes decoded as cp1252 corrupted spine files and the DrugBank
  Vocabulary; corrected in project files, but re-check any new import from these sources.
- **ETL failure modes already known:** 3,295 FDA products drop if parent application
  rows load second (load `fda_applications` first); nullable integers serialize as
  floats (`8.0` vs `8`), breaking FK lookups.
- Joshua is currently editing `Drug_Matrix_Master.xlsx` directly to produce clean,
  upload-ready CSVs (dropping `Legacy_DAM` and other pre-cleanup artifacts) — treat
  the next version he provides as the authoritative spine, superseding both the
  3,433-row static catalog snapshot and the pre-cleanup structure noted above.

## Design philosophy
Lean into the subject matter — the drug hierarchy, environmental data, Playfair for serif and for san serif Figtree
typographic character — rather than generic SaaS conventions. Avoid AI-design tells:
uniform card grids, decorative tracked all-caps labels, scroll-triggered animation on
every element.

## Current status (2026-09-19)
**Done:** legal foundation drafted, domain live via GitHub Pages, landing page deployed,
Excel drug matrix built (9-block PCID architecture, confirmed above), static drug
catalog generated and committed (now being retired — see above).

**Supabase is empty.** The `public` schema was cleared; `auth` and `storage` are intact.
Migration history shows `init_schema` → `drop_old_fk_constraints` →
`add_new_fk_constraints_to_drugs` → `drop_obsolete_views_and_tables`, with nothing
rebuilding the schema since. **`01_core_schema_v2.sql` does not exist anywhere
retrievable** (not in this repo, not in `.md/`/`docs/`, not in Supabase migration
history) — it needs to be authored from scratch against the confirmed 9-block,
PCID-only, triple-store architecture above.

**Gone and needing regeneration:** `02_transform.py`, `03_load.sql`, `04_validate.py`,
and the load-ready CSVs. Any rebuild must match whatever schema is authored, and Joshua
is producing the cleaned CSV source directly from `Drug_Matrix_Master.xlsx`.

**Next:** author the core schema (9 entity tables + `clinical_statements` triple store,
PCID-only, no DAM) against the cleaned CSVs; deploy it to Supabase; load and validate;
drop the static-catalog path once Supabase is live; CAS Common Chemistry backfill of
`physiochemical` (SMILES, InChI/InChIKey, formula, log Kow, pKa, water solubility) for
RQ/PEC/MEC; resolve `drug_id` nulls in chemical-class links; openFDA ingestion;
PPCP/ECOTOX refinement (EPA Methods 1694/1698 seed list, ~101 compounds, via
gaftp.epa.gov bulk export — direct scraping is blocked by robots.txt); moderator review
UI; license resolution; USPTO filing.

## Open items requiring Joshua's clinical judgment
- `_unresolved_merges.csv` — 8 `Synonym_Of_PCID` targets reference PCIDs absent from
  the spine.
- `merge_candidates.csv` — typo-fix pairs `amobrarbital` and `tetrahydrocannabidiol`
  are possible duplicate merges; the THC pair has **disagreeing controlled substance
  schedules**. Do not resolve autonomously.
- The spine was 3,433 rows in `ID_Supabase.xlsx` but 3,437 in a since-superseded
  repaired migrated file; `public/drug-catalog.json` was generated from the 3,433.
  Superseded once Joshua delivers the cleaned `Drug_Matrix_Master.xlsx` CSVs.

## Other unresolved items
- GitHub Pages 404 handling for direct navigation to client-side routes.
- Community contribution/moderation workflow and moderator review UI — not yet designed.
- `RxGlyph()` in `src/Nav.tsx` is likely dead code, candidate for removal.
- `src/data.ts` mock entries are now redundant with the static catalog (itself being
  retired); delete them along with their `API-00NN` identifiers.

## Response style
- Be direct and technical; skip beginner-level explanations of tools Joshua already
  uses daily (Supabase, Tailwind, GitHub Actions, pnpm).
- Confirm before deciding on canonical schema or data-architecture questions (e.g.
  which table is the authoritative spine) rather than resolving them autonomously.
- Surface licensing or legal inconsistencies (e.g. stray MIT references) if you spot
  them, rather than passing over them.
