# Phase 9 — Lists (2026-09-25)

Lists are collections of drugs made for a purpose (an exam list, a usage ranking). They are **separate from classes**, have their own page (`/lists`, `/lists/:slug`), and every Pharmacy Commons list has a PCID in the new **block 10** (`pc:list:`, 10000001–10999999).

## Schema (migration `phase9a_lists_schema`, mirrored in `db/phase9a_lists_schema.sql`)

| Object | Purpose |
|---|---|
| `pcid_blocks` row 10 | `entity_kind = 'list'` |
| `lists(pcid, slug, title, description, kind, parent_pcid, jurisdiction, source_citation, source_url, license, measure_label, measure_unit, rank_label, default_sort, published, item_count, sort_order)` | One row per list. `kind` = curated / authority / community. `default_sort` = rank / value_desc / name / position. |
| `list_items(list_pcid, position, member_pcid, rank, value, source_name, legal_status, note, sources)` | Members. PK `(list_pcid, position)`. `source_name` is the name exactly as written in the source. `legal_status` is the list's category column; `lists.status_label` names it when it is not a legal status (phase 9b). `sources` = other references that also list the drug. |
| RLS | `lists` and `list_items` readable only when `published`. Writes: service role only. |
| `list_lists()` | Index of lists (security invoker). |
| `get_list(slug)` | jsonb: header, parent, children, items (with entity slug/name/type). |
| `get_entity_lists(pcid)` | Lists a drug is on. For a moiety, also counts its precise forms and combinations via `moiety_hierarchy` (`via_name` says which). |

## Loaded (source: `Top_Drugs.xlsx`; runs `lists-import-2026-09-25`, `lists-import-2026-09-25-mint`, `lists-cleanup-2026-09-25`)

UWorld RxPrep and McGraw Hill lists were **dropped by Joshua** and never loaded.

| PCID | Slug | Items after clean-up |
|---|---|---|
| 10000001 | most-used-drugs-us (AHRQ MEPS, mean 2019–2023; values rounded to whole people) | 247 |
| 10000002 | notable-drugs | 1,093 (ranks re-compacted 1–1,093) |
| 10000003–19 | notable-drugs-* (17 category sub-lists, parent = notable-drugs; `value` = overall Notable rank) | see `lists.item_count` |
| 10000020 | georgia-mpje-legend-drugs | 2,410 |
| 10000021 | georgia-mpje-controlled-substances (O.C.G.A. §§ 16-13-25 to 16-13-29) | 405 |
| 10000022 | georgia-mpje-exceptions | 105 |
| 10000023 | do-not-crush (source: `Do_Not_Drugs.xlsx`, run `lists-do-not-crush-2026-09-25`) | 226 |

### Do Not Crush (added 2026-09-25, migration `phase9b_lists_status_label_sources`)

- 228 source rows → 226 items. Two rows were the same product and were merged: `fexofenadine/pseudoephedrine` + `pseudoephedrine/fexofenadine` (Allegra-D), `risperidone` + `risperidone odt` (Risperdal M-Tab).
- `legal_status` holds the **reason(s)** (`lists.status_label = 'Reason'`): Modified-release (143) · Transmucosal (8) · Irritant (25) · Unpleasant taste (14) · Hazardous/teratogenic (33) · Other (41; the workbook's "Misc" column). Several reasons are joined with "; ".
- `note` = brand(s) · dosage form(s) from the workbook — the entry is about those products, not every product with that ingredient.
- `sources` = which outside references also list it: MPR (180) and/or Pharmacist's Letter (218).
- Salt-named rows link to their precise form (metoprolol succinate → 3000725, morphine sulfate, diclofenac sodium, docusate sodium, erythromycin ethylsuccinate, ferrous gluconate/sulfate, isavuconazonium sulfate, chlorpheniramine maleate). "hydromorphone er" → hydromorphone; "pancreatic enzymes" → pancrelipase; "bisacodyl" → 1006482 (the name index pointed at "bisacodyl tannex"; overridden).
- Combinations linked to existing block-2 records; **one new PCID minted:** 2002470 drospirenone/estetrol (Nextstellis). Duplicate combination records exist for several of these (e.g. three elexacaftor/tezacaftor/ivacaftor, two esomeprazole/naproxen) — merge candidates for Joshua, not merged.
- `georgia-mpje-controlled-substances` now has `status_label = 'Schedule'`.

### Joshua's decisions applied (2026-09-25)

- **New PCIDs minted (27):** moieties 1015612–1015619 (insulin isophane (NPH), radiographic contrast dye, and six "… antigen" entries used for titer testing: Hib, Japanese encephalitis, poliovirus, meningococcal serotype B, influenza live attenuated (LAIV4), zoster); combinations 2002451–2002469 (fluticasone/vilanterol, fluticasone/umeclidinium/vilanterol, mometasone/formoterol, codeine/guaifenesin, insulin isophane/insulin regular, bacitracin/neomycin/polymyxin B/hydrocortisone, camphor/menthol, darunavir/cobicistat/emtricitabine/TAF, letrozole/ribociclib, meropenem/vaborbactam, penicillin G benzathine/procaine, rifampin/isoniazid/pyrazinamide, cellulose/simethicone, multivitamin, multivitamin with iron, multivitamin with minerals, prenatal multivitamin, prenatal 1+1, ocular lubricant). `primary_source` = "Pharmacy Commons lists import 2026-09-25 (Top_Drugs.xlsx)". "multivitamin, prenatal" and "prenatal vitamin" share one PCID. `moiety_hierarchy` refreshed; ingredient-based combinations link to their moieties (penicillin G benzathine/procaine and the vitamin/lubricant products have no ingredient links).
- **Mapped:** bismuth/metronidazole/tetracycline → 2001039 (bismuth subsalicylate); emtricitabine/tenofovir → 2001261 (tenofovir disoproxil fumarate).
- **Excluded (6):** injections, all substances for human use; androgens, except…; lipid emulsions IV; lipids 1.2 micron; sodium phosphates; "ber".
- **Duplicates removed:** one entry per drug per list, keeping the best (lowest) Notable rank / highest patient count. Typos and synonyms collapse to one entry. Benzodiazepines appear only under Psychotherapeutic (removed from CNS). Where two Georgia entries with different schedules merged, `legal_status` keeps both (dronabinol: CS-2 oral solution; CS-3 in sesame oil — sodium oxybate: CS-1; CS-3 labeled).
- **Citation:** controlled-substances list cites the Georgia Controlled Substances Act, §§ 16-13-25 to 16-13-29. The truncated Justia URLs were cleared.

Staging outcome (3,149 rows): exact 2,983 · combination by ingredients 54 · synonym 38 · qualifier stripped 31 · newly minted 29 rows · typo 8 · excluded 6.

## Still open (Joshua)

1. Community lists: edit model (owner + invited editors + copy, or open) and whether they get PCIDs.
2. The 8 new moieties sit in no class until the next `rebuild_classes()`.
3. Dispatch_Log / PCID_Blocks in the master workbook need the 27 new PCIDs and block 10 recorded.
4. Staging tables can be dropped: `stg_topdrugs_rows`, `stg_topdrugs_lists`, `stg_topdrugs_match`, `stg_name_index`, functions `stg_norm_name`, `stg_strip_qual`, `stg_strip_salt`.

## Frontend (branch `lists-pages`)

| Route | File | What it does |
|---|---|---|
| `/lists` | `src/pages/ListIndex.tsx` | Pharmacy Commons lists (Notable Drugs shows its 17 categories inline); authority and community sections as placeholders. |
| `/lists/:slug` | `src/pages/ListDetail.tsx` | Sort by rank / measured value / A–Z / legal status, reverse, Top-N cut-off, status filter (all in the URL), text filter, CSV download with PCIDs; source, license and permanent address in the rail. Rows stack on phones. |
| `/lists/compare?l=a,b,c` | `src/pages/ListCompare.tsx` | Up to three lists side by side; "On every list" / "Not on every list". |
| drug pages | `src/DrugDetail.tsx` → `ListsCard` | The lists a drug is on, with rank or schedule; "as hydrocodone/acetaminophen" when it is there through a combination. |
| `/id/PCID-100000xx` | `src/pages/Permalink.tsx` | Accepts 8-digit PCIDs; routes `list` entities to `/lists/:slug`. |

Sorting and filtering rules live in `src/lists.ts` (tested in `src/lists.test.ts`).

## Not done yet

- The public `api` Edge Function does not know `list` entities yet (`api_entity_document('PCID-10000001')` → 404), so list pages carry no Sources / Machine-readable panels. Needs list routes (`/v1/lists`, `/v1/lists/:slug`) and a list document shape — bump `schema_version`.
- Community lists (edit model and PCIDs still open).
