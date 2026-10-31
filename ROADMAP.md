# Pharmacy Commons — Roadmap

> Rewritten 2026-10-30 after checking the repo (main @ `5222aed`), live Supabase
> (`nenwovhyrdcdkhxzjiiv`) and `CLAUDE.md`. Supersedes the 2026-09-25 roadmap. Items
> that were done or decided since then are listed at the bottom so they aren't
> re-opened. Conventions and live numbers live in `CLAUDE.md`; history in
> `docs/project-history.md`.
>
> *Not verified this pass:* the Browse-page mobile overflow, and the FDA "Products & approvals" frontend card.

## Where things stand

| Phase | Scope | Status |
| --- | --- | --- |
| 1–3 | Core schema, workbook ETL, frontend cutover | ✅ Done |
| 4 | Enrichment: openFDA, CAS structures, classes, ECOTOX | 🟡 FDA products linked to PCIDs (phase 10) and classes loaded; **CAS structures and ECOTOX not started** |
| 5 | Governance & community: NPI verification, saved pages, moderation | ✅ Built — moderator UI (`/review`, `/admin`), roles incl. `owner`, community editing (phase 15), contributions admin; end-to-end test not written |
| 6–7 | Label text; brand names via RxNorm | ✅ Done |
| 8 | Drug classes, machine-readable API v1, version history, permalinks | ✅ Done; `/api` on the site domain still to switch over |
| 9 | Lists | ✅ Shipped: 42 lists, 7,044 items, compare view |
| 11–12 | API search; references catalog | ✅ Done |
| 13–16 | Drug descriptions, dictionary, community editing, page editor/publish | ✅ Shipped (13c column drop applied 2026-10-30) |
| 17–19 | Blog comments, product packaging, network, signup profiles | ✅ Shipped |
| 21–24 | Learn (flashcards/questions, FSRS), brand-name learner, federal controlled substances | ✅ Shipped — Learn published 2026-10-27; 10 collections (9 published, Georgia MPJE archived) |

Also live: Days Supply, Medication Reconciliation, CrCl and Dictionary tools; Developers
page; legal documents (effective 2026-10-27).

---

## Now — finish what's half-done

**1. Non-core moiety cleanup** *(2026-10-30: Joshua chose delete junk / relabel / merge instead of hide-only; `db/phase25a_noncore_moiety_cleanup.sql` written, **applied 2026-10-30** in the SQL editor as `20261030232600`; `moiety_hierarchy`, `ingredient_moiety_map`, `entity_brand_names` refreshed)*
- Deletes 1 junk row, relabels 13 single compounds to Core moiety, merges 40 salts and 14 product rows into their parent drug moieties (55 PCIDs retired with `replaced_by_pcid`). 69 rows remain non-core by design (13 salts, 28 products, 28 combinations): ion-parent salts/products, true combinations (vaccines etc.), no-parent rows, and statute-text rows.
- The hide-from-search flag below is still needed for what remains.

**1b. Hide the remaining non-core moiety rows from search** *(decision made 2026-10-21; not implemented)*
- Joshua chose *hide from search only*: keep the rows, PCIDs and list entries.
- Today there is no flag column and no `term_type` filter in `src/api.ts` or the search
  RPCs. Add a flag (or filter on `term_type = 'Core moiety'`), apply it in browse, site
  search and `/v1/search`, then refresh `moiety_hierarchy`.
- Salts, formulations and combination-text rows can still get their non-salt / non-formulation
  / note versions afterwards (Joshua's earlier intent, see Data cleanup).
- *Done when:* the 137 no longer appear in search; counts re-queried.

**2. Tests catch up**
- Update `tests/api.test.ts` for moiety-only search and `hierarchy` on `DrugDetail`; add
  coverage for `/id/PCID-n` and class pages. (`integration.test.ts` was removed in the
  hygiene audit — nothing to update there.)
- *Done when:* CI green with the new behavior asserted, still offline.

**3. `/api` on the site domain** *(decided 2026-09-28: Cloudflare proxy; **live 2026-10-30**: Worker deployed from `workers/api-proxy/`, `PC_API_BASE` fixed, `CURRENT_API_BASE` flipped)*
- Done 2026-10-30: deployed, checked (200, CORS, no `Set-Cookie`, clean `links.*`, `openapi.json` on the site domain). Open: edge cache not engaging (see CLAUDE.md); retired PCIDs return 410 without a `replaced_by` pointer or 301.
- Build/verify the `pharmacycommons-api` Worker on `pharmacycommons.org/api/*`, then follow the
  switch-over steps in `docs/machine-readable-api.md`: `api_meta.api_base`, `PC_API_BASE`,
  `VITE_PC_API_BASE`, and `CURRENT_API_BASE` in `src/developers/endpoints.ts` (still the
  Supabase URL).
- Serve the new `federal_controlled_substances` table through `/api`, or document that it isn't.

**4. Mobile overflow** *(from the project's open-issues list; not re-tested this pass)*
- Browse page cards overflow to the right on phones. Fix centrally so other pages benefit.

**5. Bookkeeping**
- Phase 23 and 24 mint batches: rows to paste into the workbook's `Dispatch_Log` are in
  `docs/dispatch-log-phase23-24.md` (database is the authority; `pcid_blocks` already current).
- Phase 13c (drop `moieties.class_pcid` / `class_name`) — **applied 2026-10-30** by Joshua in the SQL editor.
- Confirm the DrugBank IDs came from the CC0 vocabulary file.
- Fix the stale MIT mention in `docs/data-model-decisions.md`.

---

## Data cleanup (Joshua's stated high priorities)

- **`needs_manual_review` (157 rows) and `Unclassified_Holding` (634 rows):** counts from
  `CLAUDE.md`, not re-checked against the workbook. Joshua asked for a spreadsheet to work
  through them.
- **Merge calls (Joshua):** `_unresolved_merges.csv` (8 targets absent from the spine);
  `merge_candidates.csv` (`amobarbital`; the THC pair with disagreeing schedules — check against
  `federal_controlled_substances` first); duplicate combination records under different name
  orders; typo moiety `succinylchloline` (1002643) vs succinylcholine.
- **FDA linking leftovers:** 737 unresolved ingredient rows; 560 FDA brands with no formulation
  record (reviewed minting batch); IV fluids/electrolytes resolving to ion records (salt records
  missing); `fda_products.ndc` empty. Low priority: 65 duplicate pairs
  (`fda_moiety_conflicts_2026-09-25.csv`) and 27 mixed-ingredient brand lines.
- **Frontend follow-up:** "Products & approvals" card and `formulation` members in `HierarchyCard`
  — check whether this shipped before doing it.

---

## Next — enrichment

**6. Structure identifiers (CAS Common Chemistry)** — `physiochemical` has 0 rows. Backfill SMILES,
InChI/InChIKey, formula, mass for every PCID with a CAS RN. CAS rows stay CC BY-NC 4.0 and must not
be presented as CC0; Joshua wants to workshop the non-commercial question first. CAS has no log Kow /
pKa / solubility — those need a separate physprop source.

**7. Eco-risk data (ECOTOX / PPCP)** — inspect the real archive schema first, then write the loader
(match on CAS). Define the RQ/PEC/MEC calculation and where it lives before showing any number.

**8. Planned features (not started)** — PharmacopeAi (RAG over FDA labels on Supabase Postgres);
authority lists (NIOSH, Beers, ISMP); user-created lists; MEPS patients-per-year list (5-year average);
test-prep / CE content with scholarship access (see Learn decisions); bulk exports and the published
schema definition for the API.

**9. Learn follow-ups** — third-party licensing flags (ACB, Joint Commission) acknowledged but open;
`scripts/refresh_cs_from_dea_pdf.py` untested on a real DEA PDF.

## Later — legal and repo hygiene

- USPTO Intent-to-Use filing (Class 42) — low priority, Joshua decides timing.
- ~~`oxfmt` 0.2 is unsafe~~ — removed (dependency and `format` script) 2026-10-30; no formatter now.
- Heading sizes (`docs/design-system.md` §4) — Joshua's call.
- `references_resources` rows labeled "Source dataset" that nothing uses (WebMD, RxList, NHS.uk,
  MACPAC, NIPH, MedChemExpress) — confirm or re-file.
- `db/references-resources.csv.xlsx` was committed as a raw blob despite the LFS rule.

---

## Done or decided since 2026-09-25 (don't re-open)

- **Data license:** CC0 1.0 for Pharmacy Commons–authored content (2026-09-24); third-party fields keep
  their source license.
- **`/api` hosting:** Cloudflare proxy (2026-09-28).
- **Codebase license:** GPL-3.0-or-later.
- **Repo sync:** missing Edge Function sources, reconstructed `db/` files, dead files deleted
  (2026-10-13). All 9 deployed functions are in `supabase/functions/`.
- **`moiety_hierarchy` mislabeling** fixed (v4). **FDA → PCID linking** data side done (phase 10).
- **Primary class pointer:** replaced by hand-written `description_text` on moieties (phase 13); only
  the column drop (13c) remains.
- **Federal controlled substances (phase 24):** 745 rows, 12 views, 7 lists, 278 moieties minted
  (High, Medium and Low importance); Georgia MPJE lists removed; Learn collection published.
- **Brand-name learner (phase 23):** `learn_brand_list`, three importance collections, `brand-names` list.
- **Legal documents** (terms, disclaimer, privacy incl. study data, licensing) effective 2026-10-27.
- **Learn:** published with an in-app admin review page; study sets public, LLM-drafted items allowed,
  ported FSRS scheduler kept.

## Where subagents help vs. don't
Worth it: independent post-load QA (an agent that didn't write the load checks it), and large
read-heavy external lookups — the CAS backfill and ECOTOX matching.

Not worth it: schema authoring, ETL scripts, frontend changes. These need one thread holding the
full picture so tables, types and components stay aligned.
