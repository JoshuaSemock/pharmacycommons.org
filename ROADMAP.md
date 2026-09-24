# Pharmacy Commons — Roadmap

> Updated 2026-09-24 against live Supabase (`nenwovhyrdcdkhxzjiiv`) and the GitHub
> repo. Supersedes the 2026-09-19 roadmap, whose Phases 1–3 are now complete.
> Conventions and live numbers live in `CLAUDE.md`; history in
> `docs/project-history.md`.

## Where things stand

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Core schema: 9 PCID-block tables, `entities`, `clinical_statements` triple store, `revisions` + `approve_revision()`, RLS | ✅ Done |
| 2 | Workbook → Supabase ETL, validated load | ✅ Done |
| 3 | Frontend cutover to Supabase, static catalog retired | ✅ Done |
| 4 | Enrichment: openFDA, CAS structures, classes, ECOTOX | 🟡 Partial — FDA data loaded but unlinked; CAS and ECOTOX not started |
| 5 | Governance & community: NPI verification, saved pages, moderation | 🟡 Partial — backend built, moderator UI not built |
| 6 | Label text: DailyMed documents/sections, openFDA label-text cache | ✅ Done |
| 7 | Brand names via RxNorm | ✅ Done |
| 8 | Drug classes (RxClass/ClassyFire/ChemOnt), machine-readable API v1, version history, `/id/PCID-n` permalinks | ✅ Done — follow-ups open |

Also shipped along the way: moiety-only search with precise forms, brands and
combinations nested under the moiety page (`moiety_hierarchy`); clinical guidelines;
CrCl calculator; blog.

---

## Now — stabilize and sync (do before new features)

**0. Bring the repo in line with what's deployed**
- Pull source for the 3 deployed Edge Functions missing from the repo
  (`rxclass-ingest`, `chemont-terms`, `classyfire-ingest`) via `get_edge_function`
  and commit to `supabase/functions/`.
- Commit the missing SQL to `db/`: `01_core_schema_v2.sql`, both Phase 4 files, and
  the class / RxNorm / label migrations applied only through `apply_migration`
  (54 migrations live).
- Commit or formally retire the Phase 2–4 scripts (`02_transform.py`,
  `04_validate.py`, `04b`–`04f`). Fix or remove the `sitemap` script in
  `package.json` (points at a missing file).
- Delete dead files after Joshua confirms: root `deploy.yml`, `drug.html`,
  `index-updated.html`, root `index.css`, `public/drug-catalog.json`,
  `public/drug.html`, legacy `docs/schema-updates.sql`.
- *Done when:* every live migration and function has a matching file in the repo.

**1. Test suite catches up**
- Update `tests/api.test.ts` and `tests/integration.test.ts` for moiety-only search
  and `hierarchy` on `DrugDetail`; add coverage for `/id/PCID-n` and class pages.
- *Done when:* CI green with the new behavior asserted, still offline.

**2. Search quality**
- Handle the 137 `moieties` rows whose `term_type` isn't "Core moiety" (salts,
  brands, combinations) — filter them from search, or reclassify into the right
  block. *Joshua decides which.*
- Fix `moiety_hierarchy` labeling some precise forms as combinations.

---

## Next — finish Phase 4 enrichment

**3. FDA → PCID linking** (unblocks formulations in the hierarchy)
- Run the appl_no/NDC matching pass against `fda_applications` (6,372) and
  `fda_products` (12,261); both have `pcid` linked on 0 rows today. Ambiguous matches
  go to a review list, never guessed.
- Then bridge formulations → moieties so brand products appear on moiety pages.
- *Done when:* linked-row counts reported, and metformin's page lists its brands via
  this path.

**4. Primary class decision**
- `moieties.class_pcid` is NULL everywhere; membership now lives in `class_members`
  (241,919 rows). Decide: keep `class_pcid` as a "primary class" pointer (then
  backfill with EPC > MOA > PE precedence) or drop it. *Joshua decides.*

**5. Structure identifiers (CAS Common Chemistry)**
- Backfill `physiochemical` (currently 0 rows) with SMILES, InChI/InChIKey, formula,
  mass for every PCID with a CAS RN. Good fit for parallel background agents.
- Note: CAS does not provide log Kow, pKa, or solubility — those need a separate
  physprop source (EPA EPI Suite/OPERA or similar).

**6. Eco-risk data (ECOTOX / PPCP)**
- Inspect the EPA ECOTOX bulk archive's real file/column schema, then write the
  loader against it. Match on CAS across blocks 1–4.
- Define the RQ/PEC/MEC calculation and where it lives (table vs. view) before
  displaying any number publicly.

---

## Later — governance, API hosting, publishing

**7. Community contributions (Phase 5 completion)**
- Moderator review UI for the `revisions` queue, per
  `docs/phase5-community-moderation-workflow.md`.
- End-to-end test: verified provider submits → moderator approves →
  `entity_changes` records it → API version history shows it.

**8. Machine-readable API, public launch**
- Choose the data license (Creative Commons variant) with upstream terms in mind
  (CAS is CC BY-NC 4.0; ATC and DrugBank have their own terms). Set
  `api_meta.data_license`. *Joshua decides.*
- Serve `/api` on pharmacycommons.org: proxy `/api/*` to the function, or static
  JSON export at build time. Then update `api_meta.api_base`, `PC_API_BASE`,
  `VITE_PC_API_BASE`. *Joshua decides.*
- Publish the schema definition and bulk data exports.

**9. Legal**
- USPTO Intent-to-Use filing (Class 42). Codebase license is now consistently
  GPL-3.0-or-later; only the stale note in `docs/data-model-decisions.md` still
  mentions MIT.

**10. Workbook backlog**
- `Unclassified_Holding`: 634 rows parked with no identifiers.
- `needs_manual_review.csv`: 157 rows held from auto-dispatch.

---

## Standing decisions for Joshua (not autonomous)
- `_unresolved_merges.csv` — 8 `Synonym_Of_PCID` targets absent from the spine.
- `merge_candidates.csv` — `amobrarbital`, and the tetrahydrocannabidiol pair with
  **disagreeing controlled-substance schedules**.
- Font direction (shipped: Newsreader + IBM Plex; an older note said Playfair +
  Figtree).
- Items marked *Joshua decides* above.

## Where subagents help vs. don't
Worth it: independent post-load QA (an agent that didn't write the load checks it),
and large read-heavy external lookups — the CAS backfill and ECOTOX matching.

Not worth it: schema authoring, ETL scripts, frontend changes, and the sync work in
item 0. These need one thread holding the full picture so tables, types and
components stay aligned.
