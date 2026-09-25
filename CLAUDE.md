# Pharmacy Commons — Project Instructions for Claude

> Last reconciled against live Supabase and this repo: **2026-09-25** (lists added).
> Detailed phase-by-phase history (Phases 1–4 narratives, validation runs, script
> notes) moved to `docs/project-history.md` — read it when you need the "why",
> not on every session.

## What this project is
Pharmacy Commons (pharmacycommons.org) is an open-access, public-trust pharmacology
reference platform. It restructures FDA/WHO/NIH/NLM drug data into queryable,
versioned, wiki-editable pages, and layers on ecopharmacovigilance metrics (RQ, PEC,
MEC, DPD environmental risk quotients) to support greener prescribing. It is
solo-developed by Dr. Joshua Semock, PharmD, working primarily through GitHub's web UI.

**Guiding principle — humans → machines → humans.** Every record has a human page, a
stable URL, a PCID, structured JSON, an API endpoint, machine-readable relationships,
provenance, version/change history, source references, and a schema definition. The
website is an interface to the knowledge infrastructure, not the infrastructure
trapped inside it. Where sources disagree, show the disagreement rather than picking
a side.

Treat Joshua as the domain expert (PharmD) and technical decision-maker. Act as an
implementation partner: default to concrete, ready-to-use output (full files, working
code, exact commands) over abstract discussion. **Always state the destination path
for every file produced.**

## Start-of-session checklist
1. Read this file, then `docs/machine-readable-api.md` and the newest `db/phase*.sql`.
2. **Verify live state before building on any doc's claim.** Use `execute_sql` with
   real `count(*)` queries — `list_tables` row counts are planner estimates and have
   shown `0` for fully loaded tables (`moieties`, `combinations`, …). Compare
   `list_migrations` and `list_edge_functions` against `db/` and `supabase/functions/`.
3. Run `get_advisors(type: security)` and `(type: performance)`.
4. Load the live site (search a moiety such as metformin, open its page, open
   `/id/PCID-<n>`) and note anything broken.
5. Report status and drift in a few lines before starting work.

## Legal & governance context (don't contradict these)
- Single-member LLC (no non-profit board), with future intent to convert to a
  non-profit.
- Codebase license: **GPL-3.0-or-later** — `LICENSE` and `package.json` both agree as
  of 2026-09-24. The only remaining MIT mention is the open-item line in
  `docs/data-model-decisions.md`; flag any new MIT reference you see.
- Aggregated datasets: **CC0 1.0 for Pharmacy Commons–authored content** (decided
  2026-09-24, matches the site footer). Third-party fields keep their source license —
  recorded in `api_meta.data_license_scope`. Set by `db/phase8j_data_license.sql`.
  Still open: confirm the DrugBank IDs came from the CC0 "DrugBank Vocabulary" file;
  CAS Common Chemistry rows (physiochemical) stay CC BY-NC 4.0 whatever we choose.
  ATC and ChemOnt restrict commercial redistribution — never present them as CC0.
- Domain via Porkbun; USPTO Intent-to-Use filing planned (Class 42, "Pharmacy
  Commons"). Joshua decides when the licensing question is settled enough to file.

## Identifier scheme (PCID only)
Allocated in 10 blocks, mirrored in `public.pcid_blocks` (and the workbook's
`PCID_Blocks` sheet):

| Block | Entity kind | Range | Slug prefix | Table | Workbook sheet |
| --- | --- | --- | --- | --- | --- |
| 1 | Active moiety | 1000001–1999999 | `pc:moiety:` | `moieties` | `Drug_Index` |
| 2 | Combination product | 2000001–2999999 | `pc:combination:` | `combinations` | `Combinations` |
| 3 | Precise form (salt/ester/stereoisomer) | 3000001–3999999 | `pc:precise_form:` | `precise_forms` | `Precise_Forms` |
| 4 | Marketed formulation (brand) | 4000001–4999999 | `pc:formulation:` | `formulations` | `Formulations` |
| 5 | Pharmacologic class | 5000001–5999999 | `pc:class:` | `drug_classes` | `Class_Definitions` |
| 6 | Clinical concept | 6000001–6999999 | `pc:clinical:` | `clinical_concepts` | `Clinical_Concepts` |
| 7 | Measurement | 7000001–7999999 | `pc:measurement:` | `measurements` | `Measurements` |
| 8 | Biological target | 8000001–8999999 | `pc:target:` | `biological_targets` | `Biological_Targets` |
| 9 | Functional group | 9000001–9999999 | `pc:functional:` | `functional_groups` | `Functional_Groups` |
| 10 | List (added 2026-09-25) | 10000001–10999999 | `pc:list:` | `lists` (+ `list_items`) | — (loaded from `Top_Drugs.xlsx`) |

**Known swap (intentional, do not "fix"):** the original spec had precise forms in
block 2 and combinations in block 3; live data already used `PCID-2000001…` for
combinations, so the table above is correct as the live scheme.

Rules:
- PCID is the **only native key**. No surrogate integer PKs. CAS, UNII, ChemOnt ID,
  FDA application number, NDC, DrugBank ID, InChIKey, RxCUI and ATC are
  foreign-sourced attributes, never keys.
- **Minting:** new PCIDs come only from `pcid_blocks.next_pcid` (Supabase) /
  `PCID_Blocks.Next_PCID` (workbook) — never by incrementing the last row. Keep the
  two in sync and log every batch in the workbook's `Dispatch_Log`.
- **Retirement:** vacated PCIDs go to `pcid_retired` and are never reissued; the API
  301s retired PCIDs/slugs to their replacement.
- **Before minting,** check for `entities.slug` collisions and in-batch duplicates.
  Use UNII/CAS to tell a true duplicate from a distinct stereoisomer/salt. Distinct
  variants get a suffixed slug (e.g. `idazoxan-plus`) plus `synonym_of_pcid` → parent.
- **Backfills are COALESCE-guarded** — never overwrite a non-blank value.
- `Slug_Suggested` is a proposal column only; never treat it as the published slug.
- **Dead schemes — do not use, extend, or blend:** DAM (`DAM-XXXXXXX`, retired
  2026-09-19), API/PIN/FRM/CS hierarchy, and the SHA-256-of-name PCID described in
  `.md/api-spec.md` (its function `generate_pcid_from_name` was dropped).

## Relationships: one triple store
`clinical_statements` (subject/predicate/object with qualifiers, evidence level and
source) is the relationship engine for the platform — interactions, PGx, combination
components (`has_component` → block-1 PCIDs), class membership (`member_of`), etc.
- Predicates come from `public.predicates` (37 rows, seeded from `Legend_Key`). Add a
  predicate there before using it. Confirm with Joshua if a relationship doesn't fit.
- Interactions in live data use **`has_contraindication`**, not `contraindicated_with`.
  Objects are often classes or clinical concepts ("Strong CYP3A4 Inhibitors").
- Derived, rebuildable structures sit beside it: `moiety_hierarchy` (materialized
  view), `class_members` (class membership built from RxClass/ClassyFire/ChemOnt
  staging), brand-name views. Treat these as derived — fix their sources, not rows.

## Tech stack
- **Frontend:** Vite 8 + React 19 + TypeScript 5.7, React Router v7 (slug routes),
  deployed to GitHub Pages by `.github/workflows/deploy.yml` (the only workflow that
  runs). Custom domain via `CNAME`.
- **Styling:** Tailwind CSS v4, CSS-first — all tokens in `src/index.css` inside
  `@theme {}`, no `tailwind.config.js`. Watch for token-name collisions with Tailwind
  built-ins.
- **Design system:** OKLCH palette — mint (primary), hepatica (secondary), salmon
  (accent), rose (warning), marigold (caution, also eco-risk "moderate"), sky (info),
  neutral (floral white `#faf9f5` → black olive `#3a3a3a`). Steps 50–950, base 400;
  50–600 fills only, 700+ text (≥5:1 on floral white). Legacy sage/aqua/violet/coral/
  amber names are aliases pending migration. Fonts **as shipped**: Newsreader
  (display) + IBM Plex Sans Condensed / IBM Plex Mono. Lichen texture overlay
  (`public/assets/textures/lichen_seamless.jpg`, multiply, 6% desktop / 8% mobile);
  phi (1.618) type scale.
  ⚠ An older note named Playfair + Figtree — that is **not** what the code uses. Ask
  Joshua before changing fonts either way.
- **Backend:** Supabase Postgres, project `nenwovhyrdcdkhxzjiiv` ("Pharmaceutical
  Commons Database"). RLS on every table. `src/supabaseClient.ts` is the single
  `createClient()` (publishable `sb_publishable_…` key).
- **Package manager:** pnpm, pinned via `packageManager` (pnpm@10.34.3), Node ≥22.
  **Never add `version:` to `pnpm/action-setup`** — declaring it twice is a hard error.
- **Tests:** vitest. `tests/api.test.ts` mocks `@/supabaseClient` with an in-memory
  query builder so CI runs offline — keep it that way.
- **Code style:** default-export components; no `any`; double quotes for strings
  containing apostrophes; format with `oxfmt`.

## Routes (src/App.tsx)
`/` · `/browse` · `/drugs/:slug` · `/classes` · `/classes/:slug` · `/lists` ·
`/lists/compare` · `/lists/:slug` · `/id/:pcid` (permanent PCID permalink; accepts
7- and 8-digit PCIDs) · `/tools` (CrCl calculator) · `/resources` · `/citations`
· `/blog`, `/blog/:slug` · `/about` · `/account`. GitHub Pages deep links work via
`public/404.html` → sessionStorage → `index.html` restore.

**Search/browse shows moieties only.** `src/catalog.ts` `loadCatalog()` filters
`catalog_entries` to `entity_type='moiety'`; precise forms, brands and combinations
nest under the moiety page (`HierarchyCard` in `DrugDetail.tsx`, fed by
`moiety_hierarchy`).

## Machine-readable API
Public Edge Function `api` (v1, `verify_jwt = false`), design in
`docs/machine-readable-api.md`. Settings in `api_meta`: `site_base`
(`https://pharmacycommons.org` — changing it changes every record's `@id`),
`api_base` (currently the Supabase function URL), `api_version`, `schema_version`
(`1.0.0` — bump on any document-shape change), `data_license`(_url) (`CC0-1.0`), `data_license_scope`.
History: `entity_versions` (immutable snapshots; baseline captured for all PCIDs) and
`entity_changes` (append-only, trigger-written; read publicly only via
`api_entity_changes()`, which omits actor). **Tag bulk writes with
`SET LOCAL pc.change_source = '<run id>'`.**
Undecided (Joshua): how `/api` is served on the site domain — proxy `/api/*` to the
function, or static JSON export at build time.

## Repository layout — get paths right
GitHub's web UI makes it easy to commit a correct file to the wrong path, where it
silently does nothing.

| What | Path |
| --- | --- |
| Deploy workflow | `.github/workflows/deploy.yml` (the only copy; the stale root `deploy.yml` was deleted 2026-09-24) |
| React source | `src/` (`pages/`, `tools/`, `content/posts/`) |
| Static assets at site root | `public/` |
| SQL migrations mirrored as files | `db/` |
| Edge Function source | `supabase/functions/<slug>/index.ts` |
| Build/ETL scripts | `scripts/` |
| Design rationale & API docs | `docs/` |
| Historical/handoff docs (not authoritative) | `.md/` |
| Tests | `tests/`, `src/*.test.ts` |

## Database working patterns
- DDL goes through `apply_migration`; `execute_sql` is for verification and targeted
  updates. Drop and add constraints in **separate** migrations. Mirror every
  migration into `db/` in the repo.
- **CHECK constraints cannot contain subqueries** — use a `BEFORE INSERT OR UPDATE`
  trigger (see `enforce_pcid_in_block()`).
- Dropping tables with dependents needs `CASCADE` on the views first. Never drop
  `rls_auto_enable()` — the `ensure_rls` event trigger depends on it.
- Every `SECURITY DEFINER` function: `SET search_path = public` and
  `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` unless it is meant to be a
  public RPC. Run `get_advisors(type: security)` after every DDL migration; treat new
  `*_security_definer_function_executable` findings as blocking.
- Views exposed to anon/authenticated: `WITH (security_invoker = true)` plus an
  explicit `GRANT SELECT`.
- The only write path to live entity/statement tables for users is
  `approve_revision()` applying rows from `revisions`. Contribution (`revisions`
  submit) is gated on NPI verification in `provider_verifications`, written only by
  the `verify-npi` function. `saved_entities` (bookmarks) is not gated.
- Join predicates of the form `x = a OR x = b` defeat hash/merge joins here — split
  into UNION'd plain equi-joins (this is why `moiety_hierarchy` is fast).
- After bulk loads: `refresh materialized view concurrently public.moiety_hierarchy;`
  and `analyze` the touched tables.
- Mixed-case column names must be quoted. `ON CONFLICT DO NOTHING` is the re-runnable
  insert convention (the conflict target must match a real unique constraint).
  ~620 rows per chunk for long-string rows. Nullable integers from CSV/pandas
  serialize as floats (`8.0`) — cast before FK lookups. Load `fda_applications`
  before `fda_products`.
- PostgREST embeds through a table with several FKs to one target (e.g.
  `clinical_statements` → `entities`) need `alias:target!constraint_name(cols)`.

## Source workbook (Drug_Matrix_Master.xlsx)
Upstream for batch imports. Header row is row 1 (verify against the file in hand —
it has changed once). Sheets: `Table_Contents`, `Sandbox`, `Dispatch_Log`,
`Legend_Key`, `PCID_Blocks`, the 9 entity sheets, `Clinical_Statements`,
`Drug_ChemOnt`, `Unclassified_Holding`. Entity sheets 1–4 share one column spine
(PCID, Slug_URI, name, Class_PCID, …, CAS, UNII, InChI_Key, NDC_Codes, FDA_ApplNos,
…). Route batches with the `sandbox-dispatch-v2` skill; audit with
`postgres-sheet-audit`. Watch for mojibake (UTF-8 read as cp1252) in new imports.
Slash-named rows can be unit/serotype separators, not moiety boundaries.

## Current status (2026-09-24, verified live)
| Table / object | Rows |
| --- | --- |
| `entities` | 31,248 |
| `moieties` / `combinations` / `precise_forms` / `formulations` | 15,610 / 2,350 / 1,451 / 6,581 |
| `drug_classes` / `class_members` | 4,981 / 241,919 |
| `clinical_statements` / `predicates` | 252 / 37 |
| `chemont_links` | 240,094 |
| `fda_applications` / `fda_products` | 6,372 / 12,261 (**`pcid` linked on 0**) |
| `label_documents` / `label_sections` / `label_document_formulations` | 52,571 / 2.33M / 98,251 |
| `rxnorm_brands` / `guidelines` | 12,417 / 14 |
| `entity_versions` / `entity_changes` | 31,248 (baseline) / 0 |
| `moiety_hierarchy` (matview) | 5,076 |
| `physiochemical` | **0** (CAS backfill not run) |

`pcid_blocks.next_pcid` (2026-09-25): 1→1015620, 2→2002471, 3→3001452, 4→4006582,
5→5004982, 6→6000077, 7→7000014, 8→8000028, 9→9000060, 10→10000031.

Lists (Phase 9, `db/phase9-lists.md`): 30 published lists — `most-used-drugs-us`
(MEPS, 247), `notable-drugs` (1,093) + 17 category sub-lists, `georgia-mpje` (2,919) +
3 parts (legend 2,410 · controlled 405 · exceptions 105), and `do-not-crush` (226; reason per
drug in `legal_status`, named by `lists.status_label`) + 6 reason sub-lists. Read RPCs: `list_lists`,
`get_list`, `get_entity_lists`. The `api` Edge Function does not serve lists yet.

Deployed Edge Functions (8): `api` (public), `label-text`, `drugsfda-ingest`,
`rxnorm-brands`, `rxclass-ingest`, `chemont-terms`, `classyfire-ingest`, `verify-npi`.
59 migrations applied, latest `phase9b_lists_status_label_sources` (`phase10a_fda_product_ingredients`, the in-progress FDA → PCID linking pass, landed just before it) (two earlier `lists_staging_*` migrations hold import staging tables).

Shipped: 9-block schema + RLS; full workbook load; Supabase-backed frontend;
moiety-only search with hierarchy nesting; DailyMed labels + openFDA label-text
cache; RxNorm brand names; class pages from RxClass/ClassyFire/ChemOnt; clinical
guidelines; NPI provider verification + saved entities; machine-readable API with
version history and `/id/PCID-n` permalinks; CrCl tool; blog; lists (sortable list
pages, compare view, Lists card on drug pages).

## Known drift & gaps (fix or confirm — don't build on top of them)
**Repo ↔ Supabase ↔ claude.ai Project out of sync:**
- `db/` lacks `01_core_schema_v2.sql`, `phase4_fda_ingestion_tables.sql`,
  `phase4_physiochemical_table.sql` (exist in the Project docs) and the class /
  RxNorm / label migrations that were applied only via `apply_migration`.
- Scripts named in `docs/project-history.md` (`02_transform.py`, `04_validate.py`,
  `04b`–`04f`) are not in `scripts/`. `package.json`'s `sitemap` script points at a
  missing `scripts/generate-sitemap.mjs`.
- Stray/dead files: `drug.html`, `index-updated.html`, root
  `index.css`; `public/drug-catalog.json` (~31k lines, nothing reads it);
  `public/drug.html`; `docs/schema-updates.sql` and `docs/data-model-decisions.md` §4
  (legacy API/PIN/FRM); `.md/*` (Figma-Make/Agent-3 era, wrong numbers).
  Confirm with Joshua before deleting.

**Data gaps:**
- 137 `moieties` rows have `term_type` ≠ 'Core moiety' (salts/brands/combos) yet
  appear in moiety-only search.
- `moiety_hierarchy` links no formulations (their `base_name` is the brand) and
  labels some precise forms as combinations. Needs the FDA appl_no/NDC → PCID pass.
- `fda_applications.pcid` / `fda_products.pcid` are unlinked (0 rows).
- `moieties.class_pcid` is NULL everywhere — class membership lives in
  `class_members` now; decide whether `class_pcid` is kept as a "primary class"
  pointer or retired (Joshua).
- `physiochemical` empty; ECOTOX/PPCP loader not written (needs real archive schema).
- `Unclassified_Holding`: 634 rows still parked (no identifiers); 157 rows in
  `needs_manual_review.csv`.
- Tests: `api.test.ts` / `integration.test.ts` not yet updated for moiety-only
  filtering and hierarchy.

## Decisions that belong to Joshua — ask, don't decide
- `/api` hosting on the site domain; trademark timing.
- Merge/duplicate calls: `_unresolved_merges.csv` (8 targets), `merge_candidates.csv`
  (`amobrarbital`, THC pair with **disagreeing controlled-substance schedules**),
  manual-review rows.
- Canonical schema / data-architecture choices, font/design direction, and anything
  destructive in production (deletes, dropped columns, bulk overwrites).

## How Joshua works — match this
- No persistent local dev environment. Default to GitHub's web UI; Codespaces only
  when a shell is required (e.g. regenerating `pnpm-lock.yaml`).
- Prefers **full, consolidated files** over diffs, with destination paths.
- Commits clean baselines separately from substantive changes.
- Design rationale goes in `docs/`.
- When editing uploaded zips in a sandbox: `cp -r` the original first, then replace
  specific files — never write first and copy after.

## Design philosophy
Lean into the subject matter — the drug hierarchy, environmental data, typographic
character — rather than generic SaaS conventions. Avoid AI-design tells: uniform
card grids, decorative tracked all-caps labels, scroll-triggered animation on every
element.

## Response style
- Direct and technical; skip beginner explanations of Supabase, Tailwind, GitHub
  Actions, pnpm.
- Verify before claiming — say what query, page, or test you checked.
- Surface licensing/legal inconsistencies and data-quality problems, including in
  Joshua's own proposals.
