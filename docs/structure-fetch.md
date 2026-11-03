# Structure fetch: SMILES for `physiochemical` (phase 34, 2026-11-03)

Fills `public.physiochemical` (SMILES, InChI, InChIKey, formula, molecular weight) from
public sources, one rung at a time, each rung touching only moieties the previous rungs
left without a row. **No CAS Common Chemistry data is used**; that question is still
Joshua's (CC BY-NC 4.0).

## The ladder

| Rung | Source | Keyed by | Function | Status |
| --- | --- | --- | --- | --- |
| 1 | PubChem PUG REST | `moieties.inchi_key` | `pubchem-structures` | 7,787 of 10,231 done; **paused**, see "PubChem block" |
| 2 | FDA GSRS (`/api/v1/substances/{UNII}?view=full`) | `moieties.unii`, only where `inchi_key` is blank | `gsrs-structures` | Done (3,567 of 3,567) |
| 3 | PubChem cross-reference by DrugBank ID (~515 moieties) | `moieties.drugbank_id` | not written | Next |
| 4 | Name lookup, strict match, **reviewed before writing** (~1,500 moieties with no identifier) | name | not written | Next |

Core moieties only (`term_type = 'Core moiety'`). Both queues are RPCs callable only by
`service_role`: `structure_todo(limit, pcids)` and `structure_todo_unii(limit, pcids)`.

## Results (2026-11-03)

| | Moieties |
| --- | --- |
| SMILES stored (PubChem 7,543, GSRS 849) | 8,392 of 15,930 (52.7%) |
| Not applicable: GSRS protein 987, nucleicAcid 81, structurallyDiverse 1,317 (`not_applicable_biologic`) | 2,385 |
| Not applicable: GSRS polymer 123, mixture 159, concept 46, specifiedSubstanceG1 5 (`not_applicable_other`) | 333 |
| Tried, not found at PubChem (`not_found`) | 244 |
| Waiting on PubChem (have an InChIKey) | 2,444 |
| Never tried: no UNII and no InChIKey (about 2,060 core moieties) | rungs 3 and 4 |

Against moieties that can have a structure at all (15,930 minus the 2,718 not
applicable) coverage is 63.5%. **The UNII-only group is mostly biologics**: 2,385 of
3,567 are proteins, nucleic acids or structurally diverse substances (vaccines,
botanicals, venoms), so rung 2 added 849 structures, not thousands.
`not_applicable_*` comes from GSRS's own `substanceClass`, never from a name guess.

## Rules the code follows

- **Insert-only.** Both functions upsert with `ignoreDuplicates`; an existing row is never
  overwritten. They write `physiochemical` only, never `moieties`.
- **`source` is always set** (`PubChem` or `FDA GSRS`). The column's default is
  `'CAS Common Chemistry'`, so a row inserted without `source` would be mislabelled as
  CC BY-NC data. `raw` is NOT NULL and always set (it holds the response summary or the
  404 note). Consider dropping the default (Joshua's call; not done).
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

## PubChem block (open)

At 4 workers (about 4.7 requests a second) PubChem began answering **every** request from
the Edge Function with HTTP 503 `PUGREST.ServerBusy` ("too many requests per second or
blacklisted") while its own throttling header read 0%. It is an address block, not a bad
key: metformin failed as well. The last PubChem write was 2026-11-03 20:17 UTC. The
function now runs 2 workers with a 300 ms pause (about 3 a second) and 4 s, 8 s, 12 s
back-off, and **never chains a batch that wrote nothing**. PubChem's published limits are
5 requests a second, 400 a minute and 300 seconds of running time a minute. Resume with
`{ "limit": 100, "chain": true }` once a `probe` returns 200. The sandbox cannot reach
PubChem directly; probe through the function.

## Operational notes

- `pg_net` only sends a request after the calling transaction commits. Send `net.http_post`
  in its own statement, then read `net._http_response` in a later one.
- The `pg_net` worker stalled twice with a request stuck in `net.http_request_queue`;
  `select net.worker_restart();` cleared it.
- The SQL tool's statement timeout is about 2 minutes; poll instead of sleeping.

## For Joshua to decide

Merge calls on InChIKeys shared by two moieties (no merge was made; both rows keep their own
structure row, except the first pair, which rung 1 skips):

| Key | PCIDs |
| --- | --- |
| `WDEFBBTXULIOBB-WBVHZDCISA-N` | 1007750 DEXTILIDINE, 1014084 TILIDINE |
| `DYLGFOYVTXJFJP-MYYYXRDXSA-N` | 1015523 LUMEFANTRINE, (-)-, 1001855 LUMEFANTRINE |
| `QBKSWRVVCFFDOT-UHFFFAOYSA-N` | 1015139 GOSSYPOL, (R)-, 1008990 GOSSYPOL |
| `XCGYUJZMCCFSRP-UHFFFAOYSA-N` | 1015524 OXAMNIQUINE, (-)-, 1002149 OXAMNIQUINE |
| `XZEUAXYWNKYKPL-WDYNHAJCSA-N` | 1015209 LEVORMELOXIFENE, 1011773 ORMELOXIFENE |
| `WTFXARWRTYJXII-UHFFFAOYSA-N` | 1001440 FERUMOXIDES, 1001442 FERUMOXYTOL |
| `PEYUIKBAABKQKQ-AFHBHXEDSA-N` | 1015527 SESAMIN, 1015528 SESAMIN, (±)- |

- **Licensing.** `physiochemical` now holds PubChem and GSRS rows next to the (still empty)
  CAS scope. GSRS is U.S. government data. PubChem record data is generally open, but
  depositors can attach their own terms. Confirm how `docs/data-provenance-and-licensing.md`
  and `api_meta.data_license_scope` should describe these rows before the table is served
  through `/api` (it is not served today).
- **InChIKey backfill into `moieties`.** The 849 GSRS rows carry InChIKeys, but writing them
  to `moieties.inchi_key` would create more shared keys; decide the pairs above first, then
  backfill with COALESCE guards.
- **Name-lookup rung (4)** writes nothing until Joshua has reviewed the matches.
