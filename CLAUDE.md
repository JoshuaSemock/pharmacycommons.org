# Pharmacy Commons — Project Instructions for Claude

> Last reconciled against live Supabase and this repo: **2026-09-25** (lists added; FDA → PCID linking, phase 10).
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
- **Legal documents** (effective 2026-09-29; operator Pharmacy of the Commons, LLC):
  canonical text is `docs/terms-of-use.md`, `docs/medical-disclaimer.md`,
  `docs/privacy-policy.md`, `docs/data-provenance-and-licensing.md`. The `/terms`,
  `/disclaimer`, `/privacy`, `/licensing` pages import those files `?raw` and render them
  (`src/pages/LegalPage.tsx`, `src/legal.ts`) — edit the markdown, never the pages.
  Registration is clickwrap-gated; signups store `legal_agreements_accepted`,
  `legal_agreements_version`, `legal_agreements_accepted_at` in
  `auth.users.raw_user_meta_data`. **When a document's Effective Date changes, bump
  `LEGAL_VERSION` in `src/legal.ts`** (`src/legal.test.ts` fails until you do).
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
- **Formulation → moiety** links are `has_component` triples with
  `source_agency = 'FDA'` (6,443 written by phase 10c from `fda_product_ingredients`).
  `unique_statement_triple` does **not** fire when `object_label` is NULL — guard
  re-runnable inserts with `NOT EXISTS`, not `ON CONFLICT`.
- Derived, rebuildable structures sit beside it: `moiety_hierarchy` (materialized
  view), `class_members` (class membership built from RxClass/ClassyFire/ChemOnt
  staging), brand-name views. Treat these as derived — fix their sources, not rows.
- **Matview dependency chain:** `moiety_hierarchy` → `ingredient_moiety_map` →
  `entity_brand_names` → `catalog_entries`, `combination_brand_index`. Redefining
  `moiety_hierarchy` means dropping and recreating the whole chain in one migration
  (see `db/phase10d_moiety_hierarchy_v4_triples.sql` for the capture-and-recreate
  pattern that preserves definitions, indexes and ACLs).

## FDA products → PCIDs (phase 10, 2026-09-25)
- `fda_product_ingredients`: one row per active ingredient of each Drugs@FDA product.
  `moiety_pcid` = the **pharmacist-facing record** (Joshua's rule, 2026-09-25): exact
  core-moiety name > salt-stripped core-moiety name (never a bare element/ion) >
  exact non-core name > salt-stripped name > UNII. `active_moiety_pcid` keeps the
  FDA/DailyMed active moiety, so disagreements are recorded, not hidden (e.g.
  candesartan cilexetil vs candesartan; potassium chloride vs Potassium cation).
- `fda_products.pcid` → the product's own record (brand → formulation);
  `fda_applications.pcid` set only when every product on the application agrees.
- `moiety_hierarchy` v4 places formulations by those triples: `relation =
  'formulation'` for single-component, `'combination'` for multi-component.
- The resolver depends on `stg_name_index` — don't drop it without porting that.

## Tech stack
- **Frontend:** Vite 8 + React 19 + TypeScript 5.7, React Router v7 (slug routes),
  deployed to GitHub Pages by `.github/workflows/deploy.yml` (the only workflow that
  runs). Custom domain via `CNAME`.
- **Styling:** Tailwind CSS v4, CSS-first — all tokens in `src/index.css` inside
  `@theme {}`, no `tailwind.config.js`. Watch for token-name collisions with Tailwind
  built-ins.
- **Design system: read `docs/design-system.md` before styling anything.** It is the
  single reference for the look: paper sheet on lichen, colorless letterpress
  (emboss/deboss) controls, all text in one ink color, light/dark mode, the palette and
  where color may appear, one sans-serif typeface (IBM Plex Sans Condensed; Mono only
  for codes and IDs), the golden-ratio type scale, spacing, components (`Button`,
  `Card`, `Stamp`, `PaperSelect`, `PaperDatePicker`) and open design questions. Never
  use a native `<select>` or `<input type="date">`. Keep that doc in step with
  `src/index.css` in the same commit as any styling change.
- **Backend:** Supabase Postgres, project `nenwovhyrdcdkhxzjiiv` ("Pharmaceutical
  Commons Database"). RLS on every table. `src/supabaseClient.ts` is the single
  `createClient()` (publishable `sb_publishable_…` key). Code that runs on every page (header,
  account button, home) gets it via `getSupabase()` in `src/db.ts` so the SDK isn't in the
  first-load bundle; don't add static `supabaseClient` imports to Nav/SiteMenu/Home/catalog/auth.
- **Package manager:** pnpm, pinned via `packageManager` (pnpm@10.34.3), Node ≥22.
  **Never add `version:` to `pnpm/action-setup`** — declaring it twice is a hard error.
- **Tests:** vitest. `tests/api.test.ts` mocks `@/supabaseClient` with an in-memory
  query builder so CI runs offline — keep it that way.
- **Code style:** default-export components; no `any`; double quotes for strings
  containing apostrophes; format with `oxfmt` — but not 0.2, which corrupts code
  (see Known drift). Match the existing style by hand: single quotes, no
  semicolons, `x => …` arrows.

## Routes (src/App.tsx)
`/` · `/browse` · `/drugs/:slug` · `/classifications` (search across every class
system, `?q=`, `?group=`, `?c=` compare tray) · `/classifications/compare?c=a,b,c` (up to three
classes, `src/pages/ClassCompare.tsx`) · `/classifications/:slug` — `/classes`, `/classes/:slug`
and the old `?type=` tabs redirect there since 2026-10-02 (shared logic in `src/classifications.ts`) · `/lists` ·
`/lists/compare` · `/lists/:slug` · `/id/:pcid` (permanent PCID permalink; accepts
7- and 8-digit PCIDs) · `/tools`, `/tools/creatinine-clearance`,
`/tools/medication-reconciliation` (browser-only; see `docs/medication-reconciliation.md`),
`/tools/days-supply` (browser-only; see `docs/days-supply.md`), `/tools/dictionary` (Word `.dic`
download + A–Z dictionary; see `docs/dictionary.md`) · `/new` (create a page) · `/review` · `/admin` (admins only) · `/drugs/:slug/history` · `/developers` (API console
and reference; `src/developers/`) · `/resources` (outside links, grouped by
`headers`, minus `'Source datasets'`) · `/references` (every row, grouped by `reference_section`,
source datasets marked; `/citations` redirects here since 2026-09-25) — both read
`public.references_resources` through `src/references.ts` (phase 12, 2026-09-30; replaced
`src/sources.ts` and `src/resources.ts`). Edit those rows in Supabase, not in code
· `/blog`, `/blog/:slug` · `/about` · `/account` · `/terms`, `/disclaimer`,
`/licensing`, `/privacy` (legal pages; see Legal & governance context). GitHub Pages deep links work via
`public/404.html` → sessionStorage → `index.html` restore, but known routes no
longer need it: `scripts/postbuild.mjs` (runs after `vite build`) writes
`dist/<route>.html` copies of `index.html` with per-route title, description,
canonical and a static heading, so they return HTTP 200, and writes
`dist/sitemap.xml`. Static routes, blog posts and lists always; every class and
moiety page only with `PRERENDER_ALL=1`. Keep the `<!-- pc:meta -->` and
`<!-- pc:shell -->` markers in `index.html`.

**What's new (home page):** `src/updates.ts` holds one entry per shipped feature
or tool (date, kind, title, summary, link); blog posts join the feed
automatically. **When you ship something user-facing, add an entry there** — the
home page shows the newest five.

**index.html** is the single entry point (`index-updated.html` removed
2026-09-25). `#root` holds a static shell (hero + About summary) that paints
before JS and that React replaces on mount; its hero mirrors `Home.tsx`, keep
them in step. Fonts load from `index.html` (one Google Fonts request, non-blocking),
not `@import` in `src/index.css`. All routes except Home are `lazy()` in `App.tsx`.
Lighthouse baseline and fixes: `docs/performance-2026-09-25.md`.

**Search/browse shows moieties only.** `src/catalog.ts` `loadCatalog()` filters
`catalog_entries` to `entity_type='moiety'`; precise forms, brands and combinations
nest under the moiety page (`HierarchySection` in `DrugDetail.tsx`, fed by
`moiety_hierarchy`): base moiety → precise forms → brand formulations → combinations
(formulations shown since 2026-10-02). **Concept pages are searchable (2026-10-07):** `loadCatalog()` also
loads blocks 6–9 (clinical, measurement, target, functional) from `entities` with their
subtype embeds; they are search-only (type 4, `kind` label via `conceptKind()`), never in
browse, and rank just below a drug with the same text. Medication reconciliation passes
`{ concepts: false }`. Empty searches offer "Create a page for …".

**Drug page layout (2026-10-02, Overview added 2026-10-04, `src/DrugDetail.tsx`):** reading
order is Jump to label → Quick Facts → **Overview** (community-written, `src/OpenSection.tsx`)
→ hierarchy → FDA label (all sections collapsed, Expand all) → Identifiers →
Guidelines (collapsed) → Classifications (FDA MOA/PE/CS first) → Lists → Additional
metadata. On desktop Jump, Quick Facts and Identifiers sit in a sticky left rail; below
`lg` both columns are `display: contents` and `order-*` interleaves them. The label,
classes and lists are fetched once in `src/drugPageData.ts` (AbortController per
request) and shared by Quick Facts and the full sections. Quick Facts' key lists are
matched by slug: `most-used-drugs-us`, `do-not-crush`, `anticholinergic-burden`,
`arrhythmia-risk` — renaming one of those lists breaks its row.

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
**Serving `/api` on the site domain — decided 2026-09-28: Cloudflare proxy.** DNS is on
Cloudflare; a Worker on `pharmacycommons.org/api/*` forwards to the function. Switch-over
steps (after the Worker is verified) are in `docs/machine-readable-api.md`; in code the
only switch is `CURRENT_API_BASE` in `src/developers/endpoints.ts`.

**Endpoints are listed once**, in `src/developers/endpoints.ts`. The Developers page
console and reference, the code snippets, `dist/openapi.json` and `dist/llms.txt` are all
generated from it, so **when you add or change an endpoint in
`supabase/functions/api/index.ts`, change `endpoints.ts` too.** `/v1/search` (2026-09-28)
is backed by `api_search()` (`db/phase11a_api_search.sql`, security invoker).

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
- **Community editing (phase 15, 2026-10-04, `docs/user-edits.md`):** users write only
  through the phase-15 RPCs (`save_page`, `revert_page`, `edit_infobox`, `create_page`,
  patrol/accept/reject, admin) — no table has a write policy. Publish-then-patrol, except
  pages with `page_content.protection = 'reviewed'` (44 high-alert/NTI moieties + their
  hierarchy = 217 pages), where non-patroller edits wait as `pending`. Every write RPC
  checks `is_verified_contributor()` (active NPI, not blocked) or `has_role()`. These
  SECURITY DEFINER functions are intentionally executable by `authenticated` (and
  `page_history`/`resolve_property`/`resolve_page_target` by `anon`); the advisor
  findings for them are expected. Community values never overwrite ingest columns:
  infobox corrections live in `infobox_edits`, text in `page_content`/`page_revisions`.
  `create_page` mints PCIDs from `pcid_blocks` in the database, so **the database, not the
  workbook, is now the PCID authority** — refresh `PCID_Blocks`/`Dispatch_Log` from it.
  `revisions` + `approve_revision()` remain for maintainer batch changes.
  NPI verification lives in `provider_verifications` (now with `credential`), written
  only by `verify-npi`. `saved_entities` (bookmarks) is not gated.
- Join predicates of the form `x = a OR x = b` defeat hash/merge joins here — split
  into UNION'd plain equi-joins (this is why `moiety_hierarchy` is fast).
- After bulk loads: `refresh materialized view concurrently public.moiety_hierarchy;`
  (then `ingredient_moiety_map`, then `entity_brand_names`) and `analyze` the touched
  tables.
- Mixed-case column names must be quoted. `ON CONFLICT DO NOTHING` is the re-runnable
  insert convention (the conflict target must match a real unique constraint, and
  NULLs never conflict).
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

## Current status (2026-09-25, verified live)
| Table / object | Rows |
| --- | --- |
| `entities` | 31,297 |
| `moieties` / `combinations` / `precise_forms` / `formulations` | 15,610 / 2,350 / 1,451 / 6,581 |
| `drug_classes` / `class_members` | 4,981 / 241,919 |
| `clinical_statements` / `predicates` | 6,695 (6,443 FDA `has_component`) / 37 |
| `chemont_links` | 240,094 |
| `fda_applications` / `fda_products` | 6,372 / 12,261 — `pcid` linked on 5,161 / 10,631 |
| `fda_product_ingredients` | 15,630 (14,893 linked to a moiety) |
| `label_documents` / `label_sections` / `label_document_formulations` | 52,571 / 2.33M / 98,251 |
| `rxnorm_brands` / `guidelines` | 12,417 / 14 |
| `references_resources` (phase 12, 2026-09-30) | 80 (25 `Source datasets`; 14 linked to `guidelines` by `guideline_id`) |
| `entity_versions` / `entity_changes` | 31,248 (baseline) / 12,962 |
| `moiety_hierarchy` (matview) | 11,544 (1,360 precise_form · 6,437 combination · 3,747 formulation) |
| `entity_brand_names` / `ingredient_moiety_map` | 6,896 / 16,559 |
| `physiochemical` | **0** (CAS backfill not run) |

`pcid_blocks.next_pcid` (2026-10-03): 1→1015681, 2→2002591, 3→3001452, 4→4006582,
5→5004982, 6→6000077, 7→7000014, 8→8000028, 9→9000060, 10→10000039.

**Phase 15 — community editing (2026-10-04, `db/phase15_community_editing.sql`,
`docs/user-edits.md`):** tables `page_content`, `page_revisions`, `page_links`,
`page_property_refs`, `community_pages`, `infobox_properties` (10 rows), `infobox_edits`,
`user_roles` (Joshua = admin), `contributor_profiles`, `contributor_blocks`;
`pcid_retired.replaced_by_pcid`; `provider_verifications.credential`. Applied as 15a–c via
`apply_migration`, 15d–e via the SQL editor (recorded in `schema_migrations` by hand).
Behaviour tests: `db/phase15_test/` (stub schema + 46 checks; run on a local Postgres 16).
Frontend: Overview on drug pages (`src/OpenSection.tsx`, `src/pageContent.ts`,
`src/components/WikiMarkdown.tsx`, `src/wiki.ts` — `[[links]]` and `{{key:target}}`
values; keys must match `refresh_page_links()`), with an editor for verified users
(`src/OverviewEditor.tsx`, `src/contribute.ts`: handle setup, Write/Preview, `[[`
autocomplete, required summary, licence notice, edit-conflict screen, pending on
reviewed pages). History at `/drugs/:slug/history` (`src/pages/PageHistory.tsx`: line
diffs via `src/diff.ts`, Restore, Mark reviewed, Accept/Reject in
`src/components/RevisionActions.tsx`) and the reviewers' queue at `/review`
(`src/pages/ReviewQueue.tsx`; pending first, then unreviewed live edits; authors come
from `page_history()`, never author ids). Quick Facts rows are editable
(`src/InfoboxFact.tsx`, `src/infobox.ts`): community value + citation shown first with the
source value one tap away, per-row history with Restore / Mark reviewed / Accept / Reject,
and a Quick Facts section in `/review`. Phase 15f (`db/phase15f_infobox_review.sql`,
applied 2026-10-05) added `patrol_infobox_edit()` and `infobox_history()` and fixed
`edit_infobox()` failing on pages without a `page_content` row. Behaviour tests:
`db/phase15_test/` (49 checks; run stubs → phase15 → 15f → tests). Page creation (2026-10-05): `/new` (`src/pages/CreatePage.tsx`) calls `create_page()`;
`PAGE_KINDS` in `src/contribute.ts` maps the type picker to blocks; red links go to
`/new?name=…`. Non-drug blocks (clinical, measurement, target, functional) render the
concept layout on `/drugs/:slug` (`ConceptPage` in `DrugDetail.tsx`, keyed on
`block_kind`; helpers in `src/concepts.ts`); `getDrugBySlug` reads their satellite
tables via `CONCEPT_TABLE` in `src/api.ts`.
**Phase 15g (`db/phase15g_contributions_admin.sql`, 2026-10-05; tests
`db/phase15_test/tests_15g.sql`, 17 checks, run after `tests.sql`):** `my_contributions()`
(Account → My contributions, `src/components/MyContributions.tsx`), `new_pages_queue()` +
`patrol_new_page()` (New pages in `/review`), `admin_contributors()` +
`unblock_contributor()` (`/admin`, `src/pages/Admin.tsx`; client calls in
`src/contributions.ts`). Applied by Joshua in the SQL editor 2026-10-07 (checked: all five
functions, SECURITY DEFINER, only `new_pages_queue` executable by anon). Its
`my_contributions()` misses a person's first Overview text on an existing page; 15h fixes it.
**Phase 15h (`db/phase15h_brand_edits.sql`, 2026-10-07, run after 15g; tests
`db/phase15_test/tests_15h.sql`, 17 checks):** `brand_edits` (community brand overlay;
`entity_brand_names` untouched), `edit_brand()`, `patrol_brand_edit()`, `review_brand_edit()`,
`brand_history()`; redefines 15g's `my_contributions()`/`admin_contributors()` to count brand
changes, and fixes the 15g `my_contributions()` gap. Header brand line is
`src/components/BrandNames.tsx`. Applied by Joshua 2026-10-07; 15g and 15h recorded in
`schema_migrations` (20261007230001/2). Checked live: RLS on, read policy only, no table
grants, `created_by`/`patrolled_by` withheld; `edit_brand` refusals (already_listed,
not_a_source_brand, citation_required) write nothing; advisor shows only the expected
public-RPC findings for the new functions.

**Phase 14 — dictionary (2026-10-03, `db/phase14_dictionary.sql`, `docs/dictionary.md`):**
`dictionary_terms` (53,928 rows; 34,017 linked by `member_pcid`), RPCs `dictionary_dic()` /
`dictionary_words()` / `dictionary_buckets()`. `list_items.member_pcid` is now nullable with
`term_id` → `dictionary_terms` for term entries (check `list_items_member_or_term`); `get_list`
left-joins and returns term items with `pcid`/`slug` null, `entity_type 'term'`. List 10000038
`joint-commission-do-not-use` (19 terms, published 2026-10-03). `list_term_counts()` (14g) tells the
Lists index which lists hold terms; list pages read `status_label` for the status filter/column. Minted 60 moieties (1015621–1015680) and 120 combinations
(2002471–2002590) from the dictionary. `stg_dictionary_*` staging tables can be dropped.

Lists (Phase 9, `db/phase9-lists.md`): 22 published lists — `most-used-drugs-us`
(MEPS, 247), `notable-drugs` (1,093) + 17 category sub-lists, and three Georgia MPJE
lists (legend 2,410 · controlled 405 · exceptions 105). Read RPCs: `list_lists`,
`get_list`, `get_entity_lists`. The `api` Edge Function does not serve lists yet.

Deployed Edge Functions (8): `api` (public), `label-text`, `drugsfda-ingest`,
`rxnorm-brands`, `rxclass-ingest`, `chemont-terms`, `classyfire-ingest`, `verify-npi`.
64 migrations applied, latest `phase10e_fda_ingredients_form_idx` (phase 10a–10e: FDA product → PCID linking).

Shipped: 9-block schema + RLS; full workbook load; Supabase-backed frontend;
moiety-only search with hierarchy nesting; DailyMed labels + openFDA label-text
cache; RxNorm brand names; class pages from RxClass/ClassyFire/ChemOnt; clinical
guidelines; NPI provider verification + saved entities; machine-readable API with
version history and `/id/PCID-n` permalinks; CrCl tool; blog; lists (sortable list
pages, compare view, Lists card on drug pages); FDA product → PCID linking and
formulations in the moiety hierarchy (phase 10).

## Known drift & gaps (fix or confirm — don't build on top of them)
**Repo ↔ Supabase ↔ claude.ai Project out of sync:**
- `db/` lacks `01_core_schema_v2.sql`, `phase4_fda_ingestion_tables.sql`,
  `phase4_physiochemical_table.sql` (exist in the Project docs) and the class /
  RxNorm / label migrations that were applied only via `apply_migration`.
- Scripts named in `docs/project-history.md` (`02_transform.py`, `04_validate.py`,
  `04b`–`04f`) are not in `scripts/`.
- Stray/dead files: `drug.html`, root `index.css`; `src/ClassIndex.tsx` and
  `src/ClassPage.tsx` (old class pages, imported nowhere; the live ones are in `src/pages/`); `public/favicon.svg` and
  `public/Pharmacy_Commons_Logo_Canva_144.svg` (207 KB each, no longer linked);
  `assets/textures/*.jpg` (source files; the site serves `public/textures/*.webp`); `public/drug-catalog.json` (~31k lines, nothing reads it);
  `public/drug.html`; `docs/schema-updates.sql` and `docs/data-model-decisions.md` §4
  (legacy API/PIN/FRM); `.md/*` (Figma-Make/Agent-3 era, wrong numbers).
  Confirm with Joshua before deleting.

**Data gaps:**
- 137 `moieties` rows have `term_type` ≠ 'Core moiety' (salts/brands/combos) yet
  appear in moiety-only search.
- FDA linking leftovers: 737 ingredient rows unresolved; `fda_products.ndc` empty
  (openFDA doesn't map NDC → product_no); 560 FDA brand names have no formulation
  record (separate reviewed minting batch); 27 brand lines mix ingredient sets across
  products (`fda_formulations_mixed_ingredient_sets_2026-09-25.csv`); IV fluids and
  electrolytes resolve to ion records ("Sodium cation") because no salt record exists.
- **Phase 13 (2026-10-02):** `moieties.description_text` (hand-written one-liner shown
  under the drug name; Joshua writes them in a spreadsheet keyed by PCID and Claude
  loads them, blanks skipped) replaces `class_name`/`class_pcid` on moieties. Applied:
  13a (FK drop) and 13b (new column). **13c (drop `moieties.class_pcid` and
  `moieties.class_name`) is not applied yet** — see `db/phase13_moieties_description_text.sql`.
  The other three blocks still carry unused `class_pcid`/`class_name`.
- `physiochemical` empty; ECOTOX/PPCP loader not written (needs real archive schema).
- `Unclassified_Holding`: 634 rows still parked (no identifiers); 157 rows in
  `needs_manual_review.csv`.
- Tests: `api.test.ts` / `integration.test.ts` not yet updated for moiety-only
  filtering and hierarchy.
- **Heading sizes:** the unlayered `h1`–`h6` rules beat Tailwind `text-*` utilities;
  see `docs/design-system.md` §4 (Joshua's call to change).
- **Migrations `phase8i_public_read_surfaces` and `phase8j_data_license` were never
  applied** (checked 2026-09-28 against `supabase_migrations.schema_migrations`), although
  both files say they were. Live effect: `api_meta.data_license` is NULL, so every API
  document reports `"license": null`; the class RPCs are still SECURITY DEFINER; and
  `entity_labels` is a SECURITY DEFINER view with INSERT/UPDATE/DELETE/TRUNCATE granted to
  anon (not exploitable today — the view is not updatable — but untidy). Apply both once
  Joshua confirms.
- `db/CLAUDE.md` is a stale copy of this file from 2026-09-24; the root `CLAUDE.md` is
  authoritative.
- Duplicate combination records exist under different name orders, e.g. "hydrochlorothiazide;
  lisinopril" and "LISINOPRIL AND HYDROCHLOROTHIAZIDE" (both surfaced by `/v1/search`).
  Merge calls are Joshua's.
- **`oxfmt` 0.2 is unsafe:** it deletes the separators in one-line object types
  (`{ a: string; b: number }` → `{ a: string b: number }`), and it would reformat
  nearly every file in `src/` (the code is not actually kept in its style). Don't
  run `pnpm format` until it's upgraded or replaced.

- **References catalog (phase 12):** `guidelines` was *not* dropped — `entity_guidelines`
  (drug-page guideline links) has an FK to it; its 14 rows are mirrored in
  `references_resources.guideline_id`. Retiring it means repointing `entity_guidelines`
  first. Some rows marked `headers = 'Source datasets'` — WebMD, RxList, NHS.uk, MACPAC,
  NIPH, MedChemExpress — aren't referenced anywhere in code or data today (checked
  2026-09-30), yet /references labels them "Source dataset". ClinCalc (CrCl tool
  cross-check) and ISMP error-prone abbreviations (medrec tool) are. Confirm or re-file. `db/references-resources.csv.xlsx` was committed as a raw blob although
  `.gitattributes` routes `*.xlsx` through LFS, so git shows it modified on every checkout.

## Decisions that belong to Joshua — ask, don't decide
- `/api` hosting on the site domain; trademark timing.
- Merge/duplicate calls: `_unresolved_merges.csv` (8 targets), `merge_candidates.csv`
  (`amobrarbital`, THC pair with **disagreeing controlled-substance schedules**),
  `fda_moiety_conflicts_2026-09-25.csv` (65 Type A duplicate-record pairs such as
  albuterol/Salbutamol, aspirin/Acetylsalicylic acid), manual-review rows.
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
