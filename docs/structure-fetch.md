# Structure fetch: SMILES for `physiochemical` (phase 34, 2026-11-03)

Fills `public.physiochemical` (SMILES, InChI, InChIKey, formula, molecular weight) from
public sources, one rung at a time, each rung touching only moieties the previous rungs
left without a row. **No CAS Common Chemistry data is used**; that question is still
Joshua's (CC BY-NC 4.0).

## The ladder

| Rung | Source | Keyed by | Function | Status |
| --- | --- | --- | --- | --- |
| 1 | PubChem PUG REST | `moieties.inchi_key` | `pubchem-structures` | Done (10,231 of 10,231), after a temporary block; see "PubChem block" |
| 2 | FDA GSRS (`/api/v1/substances/{UNII}?view=full`) | `moieties.unii`, only where `inchi_key` is blank | `gsrs-structures` | Done (3,567 of 3,567) |
| 3 | PubChem cross-reference by DrugBank ID (~515 moieties) | `moieties.drugbank_id` | not written | Next |
| 4 | Name lookup, strict match, **reviewed before writing** (~1,500 moieties with no identifier) | name | not written | Next |

Core moieties only (`term_type = 'Core moiety'`). Both queues are RPCs callable only by
`service_role`: `structure_todo(limit, pcids)` and `structure_todo_unii(limit, pcids)`.

## Results (2026-11-03)

| | Moieties |
| --- | --- |
| SMILES stored (PubChem 9,882, GSRS 849) | 10,731 of 15,930 (67.4%) |
| Not applicable: GSRS protein 987, nucleicAcid 81, structurallyDiverse 1,317 (`not_applicable_biologic`) | 2,385 |
| Not applicable: GSRS polymer 123, mixture 159, concept 46, specifiedSubstanceG1 5 (`not_applicable_other`) | 333 |
| Tried, not found at PubChem (`not_found`) | 349 |
| Never tried: 2,063 core moieties with no UNII and no InChIKey (rungs 3 and 4), plus 69 non-core rows | 2,132 |

Against moieties that can have a structure at all (15,930 minus the 2,718 not
applicable) coverage is 81.2%. The two InChIKey-sharing moieties held back from rung 1
(dextilidine, tilidine) are among the 2,063. **The UNII-only group is mostly biologics**: 2,385 of
3,567 are proteins, nucleic acids or structurally diverse substances (vaccines,
botanicals, venoms), so rung 2 added 849 structures, not thousands.
`not_applicable_*` comes from GSRS's own `substanceClass`, never from a name guess.

## Rules the code follows

- **Insert-only.** Both functions upsert with `ignoreDuplicates`; an existing row is never
  overwritten. They write `physiochemical` only, never `moieties`.
- **`source` is always set** (`PubChem` or `FDA GSRS`). The column used to default to
  `'CAS Common Chemistry'`, which would have mislabelled an unlabelled row as CC BY-NC data;
  the default was dropped 2026-11-03 (`db/phase34c_physiochemical_source_no_default.sql`), so
  an insert without `source` now fails. `raw` is NOT NULL and always set (it holds the
  response summary or the 404 note).
- **Key check.** PubChem rows must return the InChIKey that was asked for; otherwise
  `structure_status = 'key_mismatch'` and no structure is stored (0 so far).
- **Shared InChIKeys are held back** from rung 1 (see below).
- `structure_status`: `ok`, `not_found`, `key_mismatch`, `not_applicable_biologic`,
  `not_applicable_other`, `needs_review`. `match_method`: `pubchem_inchikey`, `gsrs_unii`.
- GSRS SMILES are in GSRS's own style (lowercase aromatic atoms, stereo as GSRS records
  it); PubChem SMILES are isomeric. The `source` column says which.
- Auth: `x-ingest-token` = `ingest_tokens(name='rxclass')`, `verify_jwt = false` (same
  guard pattern as the other ingest functions). Both accept `{limit, pcids, chain, probe}`;
  `probe` is a diagnostic that writes nothing.

## PubChem block (resolved 2026-11-03)

At 4 workers (about 4.7 requests a second) PubChem began answering **every** request from
the Edge Function with HTTP 503 `PUGREST.ServerBusy` ("too many requests per second or
blacklisted") while its own throttling header read 0%. It was an address block, not a bad
key: metformin failed as well. The last write before the block was 20:17 UTC; it was still
blocked at a 20:38 probe and clear at the 21:30 recheck. At 2 workers with a 300 ms pause
(about 3 a second) the remaining 2,444 moieties ran in about 12 minutes with no throttling.
The function keeps those settings, backs off 4 s, 8 s, 12 s, and **never chains a batch
that wrote nothing**. PubChem's published limits are 5 requests a second, 400 a minute and
300 seconds of running time a minute; stay at or below the current pace. Before any
further run, send a `probe` and start only on a 200. The sandbox cannot reach PubChem
directly; probe through the function.

## Operational notes

- `pg_net` only sends a request after the calling transaction commits. Send `net.http_post`
  in its own statement, then read `net._http_response` in a later one.
- The `pg_net` worker stalled twice with a request stuck in `net.http_request_queue`;
  `select net.worker_restart();` cleared it.
- The SQL tool's statement timeout is about 2 minutes; poll instead of sleeping.

## InChIKey-sharing pairs: Joshua's rulings (2026-11-03)

No merge was made. Seven pairs share an InChIKey; each was ruled on (all have distinct UNIIs):

| Key | PCIDs | Ruling |
| --- | --- | --- |
| `WDEFBBTXULIOBB-WBVHZDCISA-N` | 1007750 DEXTILIDINE, 1014084 TILIDINE | Keep separate; no link. |
| `DYLGFOYVTXJFJP-MYYYXRDXSA-N` | 1015523 LUMEFANTRINE, (-)-, 1001855 LUMEFANTRINE | Keep; the (-) row already has `synonym_of_pcid` = 1001855. |
| `QBKSWRVVCFFDOT-UHFFFAOYSA-N` | 1015139 GOSSYPOL, (R)-, 1008990 GOSSYPOL | Keep; `synonym_of_pcid` of 1015139 set to 1008990 (live 2026-11-03, tag `phase34d_inchikey_pair_rulings`). |
| `XCGYUJZMCCFSRP-UHFFFAOYSA-N` | 1015524 OXAMNIQUINE, (-)-, 1002149 OXAMNIQUINE | Keep; the (-) row already has `synonym_of_pcid` = 1002149. |
| `XZEUAXYWNKYKPL-WDYNHAJCSA-N` | 1015209 LEVORMELOXIFENE, 1011773 ORMELOXIFENE | Keep separate; no link. |
| `WTFXARWRTYJXII-UHFFFAOYSA-N` | 1001440 FERUMOXIDES, 1001442 FERUMOXYTOL | Ferumoxytol is the moiety; ferumoxides is a class (Joshua). Moiety 1001440 retired, replaced by class 5004982 `ferumoxides` (phase 34d, below). |
| `PEYUIKBAABKQKQ-AFHBHXEDSA-N` | 1015527 SESAMIN, 1015528 SESAMIN, (±)- | Keep; the (±) row already has `synonym_of_pcid` = 1015527. |

The 849 GSRS InChIKeys can now be backfilled into `moieties` with COALESCE guards; the shared keys above are known and intended.

## Ferumoxides re-filed as a class (phase 34d, 2026-11-03)

`db/phase34d_ferumoxides_to_class.sql`: new block-5 class 5004982 (`class_type` curated, `source_system` PharmacyCommons, slug
`ferumoxides`); moiety 1001440 deleted and retired with `replaced_by_pcid` 5004982. Moved to the class: its 2 class memberships
(Magnetic Resonance Contrast Activity 5000314, Paramagnetic Contrast Agent 5000376), 3 dictionary terms, the label link, the
GSRS structure row (still counted in the 10,731, now attached to the class pcid), and the rxclass/rxnorm/classyfire staging rows.
**Judgment call, easy to change:** a class cannot be a `has_component` object or an FDA ingredient moiety, so the Feridex
(NDA020416-001, formulation 4002142) ingredient link and its `has_component` triple now point to Iron 1009810, which is
FDA's own active moiety and what `active_moiety_pcid` already said. The class has no direct members yet, so `list_classes()`
hides it from the class index (the page works by slug). Ferumoxytol 1001442 is untouched.

## Open items

- **Licensing (shelved by Joshua, 2026-11-03: wording not settled; do not draft it until he reopens it).** `physiochemical` now holds PubChem and GSRS rows next to the (still empty)
  CAS scope. GSRS is U.S. government data. PubChem record data is generally open, but
  depositors can attach their own terms. Confirm how `docs/data-provenance-and-licensing.md`
  and `api_meta.data_license_scope` should describe these rows before the table is served
  through `/api` (it is not served today).
- **InChIKey backfill into `moieties`.** The pairs above are ruled on; the backfill (COALESCE-guarded) is not yet run.
- **Name-lookup rung (4)** writes nothing until Joshua has reviewed the matches.
