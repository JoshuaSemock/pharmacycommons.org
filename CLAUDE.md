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

**DAM is retired as of 2026-09-19 — removal confirmed complete.** Joshua deleted the
`Legacy_DAM` column from the cleaned workbook. Do not create, reference, or design
around a DAM/moiety-level key anywhere (schema, ETL, API types, docs). Any
`DAM-XXXXXXX` value seen in old files is dead data, not a key to migrate. The older
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
The corresponding dead function (`generate_pcid_from_name`) was dropped from Supabase
on 2026-09-19 during schema deployment cleanup (see "Current status" below) — the doc
was wrong and the deployed artifact matching it is now gone too.

## Stale files — treat as historical, not authoritative
These predate the schema rebuild and/or the DAM retirement, and describe either the
legacy identifier scheme or a database state that no longer exists:
- `docs/data-model-decisions.md` §4 — slug↔UID layer over API/PIN/FRM
- `docs/schema-updates.sql` — ALTERs against `api`, `pin`, `frm`, `frm_api_junction`
- `src/data.ts` — as of Phase 3 this file no longer carries mock entries (see
  "Current status"); this stale-files note is kept for the historical record only
- `src/api.generated.ts` — currently has no DAM references, but re-check before
  extending it; anything modeling moiety-level identity should use the
  `Clinical_Statements` triple store (`has_component`, etc.), not a new identifier
- `.md/README.md`, `.md/AGENT3_*.md`, `.md/INTEGRATION_GUIDE.md` — assert "23 drugs
  loaded," stored functions deployed, eco metrics populated, all checklists green.
  This was already wrong as of 2026-09-19 (schema deployed, data empty) and is now
  wrong in the other direction too — the data is fully loaded (see "Current status"),
  so don't trust these files' numbers either way.
- Any prior mention of `DAM-XXXXXXX` or "DAM mirrors PCID" anywhere in docs/code is
  obsolete — DAM no longer exists as an identifier, and the `Legacy_DAM` column itself
  is gone from the source workbook.
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
- **Design system:** OKLCH color space. Palette (2026-09): mint (primary), hepatica
  (secondary), salmon (accent), rose (warning), marigold (caution — also eco-risk
  "moderate"), sky (info), neutral (floral white #faf9f5 → black olive #3a3a3a).
  Steps 50–950, base = 400; 50–600 are fills only, 700+ are the text steps (≥5:1 on
  floral white). Legacy sage/aqua/violet/coral/amber names are aliases in
  `src/index.css` pending component migration. Newsreader (display) + IBM Plex Sans
  Condensed/Mono; moss texture overlay (multiply, 12%); phi (1.618) type scale.
- **Routing:** React Router v7, slug-based URLs.
- **Backend:** Supabase (PostgreSQL), project ID `nenwovhyrdcdkhxzjiiv`. Row Level
  Security enabled on every table (`public_read` policy on all data tables); the only
  write path to live entity/statement tables is `approve_revision()`
  (`SECURITY DEFINER`, public/anon/authenticated `EXECUTE` revoked — only callable
  from a trusted server context, not directly via REST RPC), which applies edits
  staged in the `revisions` table.
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
| SQL schema | `db/` (currently mirrored in the Project docs at `db/01_core_schema_v2.sql`; not yet committed to the GitHub repo — pending) |

## Static drug catalog — fully retired (Phase 3 complete)
`public/drug-catalog.json` used to ship the full PCID spine so search and routing
worked with no backend. As of Phase 3, `src/catalog.ts` reads the live
`public.catalog_entries` Supabase view instead (see "Current status" below). The
JSON file is no longer read by any code path; Joshua has confirmed the rewritten
`catalog.ts`/`api.ts` are committed, the CI test suite is green, and the live site
renders real Supabase-backed drug pages — `public/drug-catalog.json` is safe to
delete from `public/` whenever Joshua gets to it (low priority now that nothing
depends on it, not a blocker for anything else).

`src/main.tsx` does not call any hydration wiring — `catalog.ts`'s earlier
`setHydrator`/`isBackendConfigured`/`getDrug` functions were never activated and have
been removed in the Phase 3 rewrite along with the static-JSON path they supported.

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
  Supabase SQL Editor, or apply directly via `apply_migration`. Use `execute_sql` for
  verification queries and targeted updates only.
- DDL constraint changes require `apply_migration`, not `execute_sql`. Drop and add
  constraints in **separate** migration calls.
- **Postgres CHECK constraints cannot contain subqueries.** Cross-table validation
  (e.g. "this PCID falls inside its declared block's range") must use a
  `BEFORE INSERT OR UPDATE` trigger instead — see `enforce_pcid_in_block()` in
  `db/01_core_schema_v2.sql`.
- Cascading table drops require dropping dependent views first with `CASCADE`; a
  `DROP FUNCTION` blocked by a dependent event trigger means drop/recreate the
  trigger's function definition instead of dropping it outright (see
  `rls_auto_enable()`, which `ensure_rls` depends on — never drop it).
- Every `SECURITY DEFINER` function needs `SET search_path = public` (mutable
  search_path is a real privilege-escalation vector, not just a lint nag) and an
  explicit `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` unless it is meant to
  be called directly over the public REST RPC surface. Run
  `get_advisors(type: security)` after every DDL migration and treat new
  `*_security_definer_function_executable` findings as blocking, not informational.
- A view exposed to anon/authenticated should be created `WITH (security_invoker =
  true)` and given an explicit `GRANT SELECT`, so RLS on the underlying tables
  governs it rather than the view owner's privileges — see `catalog_entries` below.
- Mixed-case column names must be quoted (e.g. `"Drug_Rows"`).
- Chunked inserts: ~620 rows is the validated limit for `fda_products`-scale rows with
  long string fields.
- `ON CONFLICT DO NOTHING` is the standard re-runnable insert convention. Conflict
  targets must match an existing unique constraint — omit the clause entirely if
  constraint status is unknown.
- PostgREST embeds across a table with multiple FKs into the same target (e.g.
  `clinical_statements` → `entities` via `subject_pcid`/`object_pcid`/
  `comparator_pcid`) need an explicit `alias:target!constraint_name(cols)` hint —
  plain `column_name(cols)` embedding is ambiguous and Supabase will refuse to guess.

## Source workbook structure (Drug_Matrix_Master.xlsx, confirmed 2026-09-19, re-confirmed against Joshua's cleaned version)
- **Real header row is row 1** in the cleaned workbook Joshua delivered after removing
  `Legacy_DAM` and other pre-cleanup artifacts (the earlier pre-cleanup version had
  headers on row 4, with row 3 holding a title/description row — that offset no
  longer applies; any script reading the current sheets should assume `min_row=1` /
  no `range` skip in openpyxl/SheetJS, but always verify against the actual file in
  hand before writing a transform script, since this has changed once already).
- Sheet inventory: `Table_Contents`, `Sandbox` (predicate scratch/triple staging),
  `Dispatch_Log` (audit trail of sandbox routing runs), `Legend_Key` (controlled
  vocabularies: Controlled_Schedule, Evidence_Level, Predicate, plus formula/notes
  documentation), `PCID_Blocks` (the 9-block registry above, with `Next_PCID` per
  block), then the 9 entity sheets (`Drug_Index`, `Combinations`, `Precise_Forms`,
  `Formulations`, `Class_Definitions`, `Clinical_Concepts`, `Measurements`,
  `Biological_Targets`, `Functional_Groups`), plus `Clinical_Statements` (the triple
  store), `Drug_ChemOnt` (junction sheet added in the cleaned version — 189,452 rows
  of `Drug_PCID, ChemOnt_ID, Ord`, replacing the raw pipe-delimited `ChemOnt_IDs` text
  column as the ETL source for `chemont_links`), and `Unclassified_Holding` (staging
  for rows with no PCID minted yet — `Term_Type = 'Unclassified'`, ~1,524 rows,
  excluded from the Phase 2 load; triage into a block before assigning an ID).
- Entity sheets 1–4 (`Drug_Index` through `Formulations`) share one column
  spine: `Row_No, PCID, Slug_URI, <Name field>, Class_PCID, Class_Name, Is_Controlled,
  Controlled_Schedule, PCID_Label, Slug, Slug_Suggested, Origin, Term_Type, Base_Name,
  Synonym_Of_PCID, Block_Exception, Primary_Brand, DrugBank_ID, CAS, UNII,
  InChI_Key, ChemOnt_IDs, NDC_Codes, FDA_ApplNos, LactMed_ID, Legal_Status,
  Statute_Citation, MPJE_Relevance, FDA_Marketing_Status, Rx_Status, Primary_Source,
  Source_Count, Created_At, Updated_At` (`Legacy_DAM` removed by Joshua — no longer
  present). `Class_Definitions` itself is narrower:
  `Row_No, PCID, Slug_URI, Class_Name, MOA, PE, CS, Source_Agency, Source_Ref,
  Updated_At`.
- `Block_Exception`: 136 entities hold a live block-1 PCID but classify as salt,
  combination, or brand under `Term_Type` — the live ID wins; this column just
  records the conflict for later triage, don't "fix" it by reassigning the PCID.
- `Synonym_Of_PCID`: 96 rows claimed a PCID already held by a better-matching row;
  they got their own ID and point back at the retained entity via this column.
- **`class_id` is empty across all spine rows.** Populating it needs an
  external backfill — see "Current status" for the corrected approach (UNII
  via RxNav/RxClass, not DrugBank ID as this section originally implied).
- **Slash-named rows:** a slash can be a unit or serotype separator, not a moiety
  boundary. `loperamide oral liquid` and `elecsys htlv-i/ii` are intentionally solos.
- **Mojibake:** UTF-8 bytes decoded as cp1252 corrupted spine files and the DrugBank
  Vocabulary; corrected in project files, but re-check any new import from these sources.
- **ETL failure modes already known:** 3,295 FDA products drop if parent application
  rows load second (load `fda_applications` first); nullable integers serialize as
  floats (`8.0` vs `8`), breaking FK lookups.
- **Full audit of the cleaned workbook (2026-09-19):** 25,318 total PCIDs across all
  blocks, 0 duplicate PCIDs, 0 out-of-block-range PCIDs, 0 orphaned FKs (Class_PCID,
  Synonym_Of_PCID, Drug_ChemOnt.Drug_PCID, Clinical_Statements Subject/Object_PCID all
  clean), all 37 predicates registered in `Legend_Key` and used consistently.
  **Two known, accepted-as-is issues carried into Phase 2 ETL** (per Joshua: "we will
  continue without other changes" — do not re-litigate, just handle at load time):
  - 3 exact-duplicate `clinical_statements` triples (workbook rows 24/94, 82/110,
    247/256) — deduped during transform (confirmed: live `clinical_statements` has
    252 rows, 0 duplicate triples).
  - `Unclassified_Holding` (~1,524 rows) — excluded from this load batch entirely.

## Design philosophy
Lean into the subject matter — the drug hierarchy, environmental data, Playfair for serif and for san serif Figtree
typographic character — rather than generic SaaS conventions. Avoid AI-design tells:
uniform card grids, decorative tracked all-caps labels, scroll-triggered animation on
every element.

## Current status (2026-09-19)
**Done:** legal foundation drafted, domain live via GitHub Pages, landing page deployed,
Excel drug matrix built and cleaned (9-block PCID architecture, `Legacy_DAM` fully
removed, `Drug_ChemOnt` junction sheet added), full structural audit passed (see above).

**Core schema deployed to Supabase.** `01_core_schema_v2.sql` (checked into Project
docs at `db/01_core_schema_v2.sql`) was authored against the confirmed
9-block/PCID-only/triple-store architecture and applied as Supabase migration
`core_schema_v2`. 15 tables exist, all RLS-enabled.

Post-deployment security hardening also done: dropped 9 dangling `SECURITY DEFINER`
functions left over from the pre-cleanup schema (including `generate_pcid_from_name`,
the SHA-256 PCID generator flagged above as wrong, and 8 others referencing tables
that no longer exist — all were still publicly callable via REST RPC); added
`SET search_path = public` to `enforce_pcid_in_block()`; revoked public/anon/
authenticated `EXECUTE` on `approve_revision()` and `rls_auto_enable()` (kept
`rls_auto_enable()` itself — `ensure_rls` event trigger depends on it).

**Phase 2 ETL COMPLETE (2026-09-19) — all 12 tables loaded and validated.**
`scripts/02_transform.py` produced the 12 load-ready CSVs; Joshua imported all of
them via Supabase's Table Editor CSV importer (FK-safe order: `01_entities.csv` →
the four block 1–4 satellite CSVs → the five block 5–9 satellite CSVs →
`04_chemont_links.csv` → `05_clinical_statements.csv`). `pcid_retired` and
`revisions` remain empty by design (populated later by retirements and user edits).

**Full validation run against live Supabase (via `list_tables` + `execute_sql`,
not assumed):**
- Row counts match the workbook audit exactly: `entities`=25,318, `moieties`=14,813,
  `combinations`=1,866, `precise_forms`=1,265, `formulations`=6,581,
  `drug_classes`=618, `clinical_concepts`=76, `measurements`=13,
  `biological_targets`=27, `functional_groups`=59, `chemont_links`=189,452,
  `clinical_statements`=252 (down from the pre-dedupe raw count, confirming the
  3 known duplicate triples were correctly dropped).
- Block satellite tables sum exactly to `entities` (25,318) — every entity landed in
  exactly one block table, none missing, none duplicated.
- Zero orphaned FKs across the board: `class_pcid` and `synonym_of_pcid` on all four
  block 1–4 tables, `chemont_links.pcid`, and `clinical_statements`
  subject/object/comparator PCIDs all resolve cleanly to `entities`.
- Zero duplicate `entities.pcid`, zero out-of-block-range PCIDs, zero duplicate
  `clinical_statements` triples, all statement predicates registered in `predicates`,
  and the `unique_statement_triple` constraint is present and active.
- `get_advisors(type: security)` clean except the pre-existing, unrelated
  Auth-level "leaked password protection disabled" toggle — no new findings from
  this load.
- `scripts/04_validate.py` (delivered) codifies this exact check set — rerun it after
  any future re-import or bulk edit; it exits non-zero on any regression.

**Phase 3 COMPLETE (2026-09-19) — frontend cut over to Supabase, live and verified.**
Four files rewritten, delivered, committed by Joshua via GitHub's web UI, and
confirmed working (CI green, live site rendering real Supabase-backed drug pages):

- **New: `public.catalog_entries` view** (migration `catalog_entries_view`,
  `security_invoker = true` so RLS on the underlying tables governs access, not
  the view owner). Unions `entities` with whichever of `moieties` /
  `combinations` / `precise_forms` / `formulations` (blocks 1–4 only) each PCID
  belongs to, exposing `pcid, slug, name, entity_type, primary_brand,
  controlled_schedule, is_controlled`. 24,525 rows — confirmed to match
  moieties+combinations+precise_forms+formulations exactly. This is what
  `catalog.ts` now reads instead of the retired `public/drug-catalog.json`.
  `get_advisors(type: security)` re-run clean after creating it — no new findings.
- **`src/supabaseClient.ts`** (new) — the one `createClient()` call, using the
  modern `sb_publishable_…` key rather than the legacy anon JWT. Both `api.ts`
  and `catalog.ts` import from here so neither imports the other.
- **`src/catalog.ts`** (rewrite) — `loadCatalog()` now paginates
  `catalog_entries` (1,000 rows/page) instead of `fetch()`-ing the static JSON.
  Public surface (`searchCatalog`, `browse`, the A–Z bucket machinery, `toDrug`,
  `pcidOf`, …) is unchanged on purpose — `SearchView.tsx`, `Home.tsx`, and
  `Nav.tsx` needed no changes. `CatalogEntry.type` now spans all four
  browsable blocks (0=moiety, 1=combination, 2=precise_form, 3=formulation)
  instead of just ingredient/combination; existing `type === 1` checks for
  "combination product" still work. Dropped `damOf()` (DAM is retired) and the
  never-activated `setHydrator`/`isBackendConfigured`/`getDrug` hydration
  machinery — nothing called it (confirmed by search), and Supabase is now the
  only source, so there's nothing left to hydrate onto.
- **`src/api.ts`** (rewrite) — no more `BACKEND_ENABLED` flag or catalog
  fallback; queries Supabase directly and throws on a real failure rather than
  degrading to a cached manifest. `getDrugBySlug` reads `entities` then the
  matching block 1–4 satellite table, plus `clinical_statements` for
  `components` (`has_component` predicate) and `interactions`.
  **Correction to this doc's earlier predicate note:** interactions use
  `has_contraindication`, not `contraindicated_with` — `contraindicated_with`
  is in the `Legend_Key` vocabulary but the live 2026-09-19 load only actually
  uses `has_contraindication` (confirmed via `execute_sql` against the real
  data, 10 rows). The interaction's object is often a drug class or clinical
  concept rather than another drug (e.g. "Strong CYP3A4 Inhibitors", "Sulfa
  Allergy") — `entities` spans every block so the join resolves a name/slug
  either way. `eco` stays `null` everywhere — no eco-metrics table exists yet;
  that's Phase 4. `status` on every `DrugListItem`/`DrugDetail` is now always
  `'full'` — the `'partial'` (catalog-only) status from the old architecture no
  longer applies since there is no catalog-only path anymore.
- **`src/data.ts`** (rewrite) — the `DRUGS` mock array (`API-00NN`/`SUB-0001`
  identifiers) and the unused `CATEGORIES` array are deleted. Kept only
  `EcoRisk` and `ECO_RISK_COLORS`, since `DrugDetail.tsx` still imports those
  for the risk-panel colors — everything else in the old file was dead weight
  once `api.ts` stopped depending on it (confirmed via subagent search: no
  other file imports from `data.ts`).
- **`tests/api.test.ts`** (rewrite) — the old suite stubbed `global.fetch` to
  only answer `drug-catalog.json` and throw on anything else, which was a
  guard against the pre-Phase-3 architecture; against the Supabase-direct
  `api.ts` it meant every test hit the live network with nothing intercepting
  it, so all 24 network-touching tests hung to the 5s vitest default and
  failed in CI. Rewritten to mock `@/supabaseClient` with a small in-memory
  fake query builder (`select/eq/in/or/order/range/maybeSingle`, thenable)
  against a ~205-row fixture, so it runs offline with no credentials, same
  guarantee as before. Two assertions changed to match real `api.ts` behavior:
  `status` is always `'full'` now (not `'partial'`), and the brand-based
  "Also marketed as X" description only appears from `listDrugs`/
  `searchDrugs`, not `getDrugBySlug` (whose description comes from
  `class_name`). Verified in an isolated sandbox: `tsc --noEmit` clean, and
  `vitest run` 34/34 passing, before delivery. CI confirmed green after commit.

All four Phase 3 source files were type-checked in an isolated `tsc --strict`
sandbox against the real `api.generated.ts` and `@supabase/supabase-js` types
before delivery — clean, no errors. `catalog.ts`'s consumer contract (every
field/function `SearchView.tsx`, `Home.tsx`, and `Nav.tsx` use) was verified by
reading those three files directly, not assumed.

**Phase 3 is done.** `public/drug-catalog.json` is now dead weight — safe to
delete whenever Joshua gets to it, not urgent.

**Phase 4 IN PROGRESS (2026-09-19) — two of four workstreams scaffolded.**
Scope check against live Supabase before starting: no `physiochemical`,
`eco_metrics`, `fda_products`, or `fda_applications` tables existed yet, and
**`class_pcid` is NULL on all 25,318 entities** (0% populated — bigger gap
than the earlier "empty across all spine rows" note implied, this confirms
it's the whole spine, not a handful of rows). `drugbank_id` is populated on
13,523/14,813 moieties (91%), `cas` on 8,896/14,813 (60%) — the leverage for
the two backfills below.

- **New: `fda_applications` / `fda_products` tables** (migration
  `phase4_fda_ingestion_tables`, mirrored at
  `db/phase4_fda_ingestion_tables.sql`). `pcid` on both is nullable by
  design — raw openFDA ingestion never infers it; a separate matching pass
  against the existing `ndc_codes`/`fda_applnos` free-text columns on the
  block 1-4 tables does that later, once real data is loaded and the NDC
  matching's messiness is visible. **`scripts/04b_fda_ingest.py`** (delivered)
  pulls all of openFDA's `drugsfda` endpoint, buffers applications before
  products (same load-order fix as the workbook ETL: products dropped if
  their parent loads second), upserts in chunks of 500.
- **New: `physiochemical` table** (migration `phase4_physiochemical_table`,
  mirrored at `db/phase4_physiochemical_table.sql`). Holds CAS Common
  Chemistry's structure identifiers (`smiles`, `inchi`, `inchi_key`,
  `molecular_formula`, `molecular_weight`) keyed by `pcid`. **Important
  correction to the ROADMAP.md Phase 4 description:** CAS Common Chemistry
  does NOT provide log Kow, pKa, or water solubility — those columns exist
  on this table as placeholders for a future physprop-source pass (EPA EPI
  Suite/OPERA or similar), not this ingestion. Don't treat their NULL-ness
  as an ingestion bug. **`scripts/04c_cas_ingest.py`** (delivered) queries
  CAS Common Chemistry's `/api/detail` endpoint by CAS RN (registered tier,
  key supplied by Joshua — held as `CAS_API_KEY` env var only, never
  committed) for every unique CAS number across the four block 1-4 tables,
  de-duping so a shared CAS number (e.g. a salt form sharing its parent
  moiety's CAS) isn't fetched twice.
- Both new tables: RLS-enabled, `public_read` policy, `get_advisors(type:
  security)` clean after each migration.
- **Neither script has been run against live data yet.** The sandbox this
  work was done in has no network route to `api.fda.gov` or
  `commonchemistry.cas.org` (same allowlist restriction that blocked direct
  Supabase REST calls earlier in Phase 3) — both scripts are logic/type-
  reviewed and syntax-checked (`py_compile`) but need to actually run in
  Codespaces, watched for their first couple hundred requests, before
  trusting the field-mapping assumptions (especially CAS's JSON shape,
  which this session could never fetch a real example of).

**`class_pcid` backfill — roadmap correction, built (2026-09-19).**
`ROADMAP.md`'s Phase 4 description says "DrugBank ID → PCID backfill" — that
was wrong. Checked the actual 618 `drug_classes` rows: they're sourced from
DailyMed (`source_agency = 'DailyMed'`, `source_ref` pointing at DailyMed's
pharmacologic-class search — e.g. "AMPA Receptor Antagonists", "Androgen
Receptor Antagonists"). That's FDA's Established Pharmacologic Class (EPC) /
Mechanism of Action (MOA) / Physiologic Effect (PE) scheme, a different
classification system from DrugBank's own categories with different names
for the same concepts — DrugBank ID matching would not reliably line up.
Confirmed with Joshua to use the actual correct join key instead: **UNII**
(69% of moieties have one — 10,268/14,813) against NLM's RxNav/RxClass REST
API (public, no key required): UNII → RxCUI via `/REST/rxcui.json`, then
RxCUI → FDA SPL classes via `/REST/rxclass/class/byRxcui.json?relaSource=
FDASPL`, matched case-insensitively against the 618 existing class names.
When a UNII matches more than one class, EPC wins over MOA over PE over PK.
**`scripts/04d_class_backfill.py`** (delivered) does this, upserting only
`{pcid, class_pcid, class_name}` per row so PostgREST's `ON CONFLICT DO
UPDATE` touches nothing else on the row. Like the other two Phase 4 scripts,
not run yet — no route to `rxnav.nlm.nih.gov` from this sandbox, logic/type-
reviewed and syntax-checked only.

**FDA appl_no/NDC → pcid matching pass — built (2026-09-19).**
`scripts/04e_fda_pcid_match.py` (delivered) populates `fda_applications.pcid`
and `fda_products.pcid`, deliberately kept separate from `04b_fda_ingest.py`
so a matching-logic fix never requires re-fetching from openFDA. Two passes:
(1) exact match on `fda_applications.appl_no` against each entity's
pipe/comma-delimited `fda_applnos` column (split the same way `splitCodes()`
in `src/api.ts` does); (2) NDC match on `fda_products`, normalized to the
9-digit labeler+product identity (FDA's 4-4-2/5-3-2/5-4-1 segment formats
padded per FDA's documented 10-to-11-digit convention, then the trailing
package-size segment dropped) against the workbook's `ndc_codes` column,
similarly normalized — verified the normalization logic against six sample
formats (`0002-0800`, `00002-0800-01`, `12345-678-90`, etc.) in the sandbox,
all correct. An appl_no or NDC that resolves to more than one distinct pcid
is skipped and logged for manual review rather than guessed at. Unlike the
other three Phase 4 scripts this one makes no external network calls (only
reads/writes Supabase), but it's still un-run against real data since
`fda_applications`/`fda_products` are empty until `04b_fda_ingest.py` loads
them first — run ingestion, then this, in that order.

**EPA ECOTOX/PPCP workstream — reconnaissance stage only (2026-09-19).**
Confirmed the roadmap's claim about `gaftp.epa.gov` is real: EPA's ECOTOX
Knowledgebase publishes its entire database as pipe-delimited ASCII files at
a dated URL (currently `ecotox_ascii_09_15_2026.zip` — EPA re-dates the
filename on each refresh, check https://cfpub.epa.gov/ecotox/ for the
current one). **However, this session could not verify that archive's
internal file/table schema** (file names, column names, join keys) through
any tool available here — every source describes that the bulk export
exists without documenting its structure in a fetchable way. Rather than
write a loader against guessed column names (this data feeds public-facing
environmental risk-quotient numbers — guessing wrong here is worse than
guessing wrong elsewhere), built **`scripts/04f_ecotox_inspect.py`** instead:
downloads the archive, unzips it, and prints every file name + its header
row. Joshua runs this in Codespaces and pastes the output back so the real
loader (`04g_ecotox_load.py`, not written yet) can be built against verified
columns. Same reasoning applied to the "~101 compound" EPA Method 1694/1698
seed list — confirmed Method 1694 covers 73 analytes (per EPA's own FAQ
page) but couldn't extract the actual Table 1 compound/CAS list from the
PDF through available tools, so didn't reconstruct it from memory. Once the
ECOTOX schema is known, matching against the ~8,896 CAS numbers already in
moieties/combinations/precise_forms/formulations (same de-dup pattern as
`04c_cas_ingest.py`) is likely a more robust target than depending on a
scraped 101-compound PDF table — worth revisiting once real schema is in
hand, not decided yet.

**Still to do for Phase 4:** run the four completed scripts in order
(`04b_fda_ingest.py` → `04e_fda_pcid_match.py`, and `04c_cas_ingest.py` /
`04d_class_backfill.py` independently) in Codespaces; run
`04f_ecotox_inspect.py` and bring back its output to unblock the ECOTOX
loader. Note the `class_pcid` backfill only reaches PCIDs with a UNII that
RxNav maps to one of the existing 618 DailyMed class names — PCIDs with no
UNII, or a genuinely new class DailyMed hasn't defined yet, need a separate
follow-up, not a rerun of this script. Likewise the FDA matching pass only
reaches PCIDs whose `fda_applnos`/`ndc_codes` actually overlap what openFDA
returns — genuinely new applications/products need a different kind of
follow-up (adding to the workbook), not a rerun.

## Open items requiring Joshua's clinical judgment
- `_unresolved_merges.csv` — 8 `Synonym_Of_PCID` targets reference PCIDs absent from
  the spine.
- `merge_candidates.csv` — typo-fix pairs `amobrarbital` and `tetrahydrocannabidiol`
  are possible duplicate merges; the THC pair has **disagreeing controlled substance
  schedules**. Do not resolve autonomously.

## Other unresolved items
- GitHub Pages 404 handling for direct navigation to client-side routes.
- Community contribution/moderation workflow and moderator review UI — not yet designed.
- `RxGlyph()` in `src/Nav.tsx` is likely dead code, candidate for removal.
- `public/drug-catalog.json` — dead code as of Phase 3, delete whenever convenient.

## Response style
- Be direct and technical; skip beginner-level explanations of tools Joshua already
  uses daily (Supabase, Tailwind, GitHub Actions, pnpm).
- Confirm before deciding on canonical schema or data-architecture questions (e.g.
  which table is the authoritative spine) rather than resolving them autonomously.
- Surface licensing or legal inconsistencies (e.g. stray MIT references) if you spot
  them, rather than passing over them.
