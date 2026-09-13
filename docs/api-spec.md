# Pharmacy Commons API Specification

**Version:** 2.0
**Updated:** 2026-09-13
**Status:** Schema rebuilt, not yet deployed

Supersedes the v1.0 spec produced during the Agent #3 handoff. That document
described a PCID generation scheme (SHA-256 of the drug name) and a set of
stored functions that no longer reflect the architecture. Treat any surviving
copy as historical.

---

## Architecture

Reads are served from two layers:

1. **Static catalog** — `public/drug-catalog.json`, the full PCID spine (3,433
   entries, ~47 KB gzipped), shipped with the build. Handles search, browse, and
   slug resolution with no network call.
2. **Supabase** — clinical, FDA, and environmental detail, fetched per drug on
   the detail view.

The catalog is authoritative for *what exists*; Supabase is authoritative for
*what is known about it*. A backend outage therefore degrades detail, not
availability: search keeps working, routes keep resolving, and detail pages
render in `partial` state.

**Base URL:** `https://nenwovhyrdcdkhxzjiiv.supabase.co/rest/v1`

**Auth:** public reads use the anon key with a `Authorization: Bearer <key>`
header. The key is embedded in `src/api.ts` and is safe to publish — RLS
enforces read-only access server-side. Writes require authentication *and* pass
through the moderation queue; there is no direct write path to curated tables.

---

## Identifiers

**PCID** is the canonical drug entity identifier, allocated in blocks. It is
**not** derived from the drug name — it is assigned, and the block encodes what
the record is:

| Range | Contents |
| --- | --- |
| `PCID-1XXXXXX` | Solo medications |
| `PCID-2XXXXXX` | Combination products |
| `PCID-3000001`–`PCID-3099999` | Wiki-editable class pages, ATC-derived |
| `PCID-3100001`–`PCID-3199999` | Wiki-editable class pages, ChemOnt-derived |

**DAM** identifies the active moiety — metoprolol, not metoprolol succinate.
For a solo drug the DAM numerically mirrors its PCID: `PCID-1000233` →
`DAM-1000233`. This is enforced by a trigger on `drug_moieties`, not by
convention. Combination products have several component moieties and no single
mirrored DAM; **`DAM-2XXXXXX` is not a valid identifier.**

PCID and DAM are the only native keys. CAS, ChemOnt ID, FDA application number,
DrugBank ID, and ATC codes are foreign-sourced and never used as keys. Surrogate
integer primary keys are ruled out.

**Slugs** are the URL surface: lowercase alphanumeric with single hyphens,
unique across the spine, enforced by the `slug_t` domain. Retired PCIDs are
logged in `pcid_retired` and never reissued; renamed slugs are logged in
`slug_changes` so old links keep resolving.

---

## Stored functions

Only two read functions exist server-side. Search and pagination deliberately
live in the client against the static catalog — a 3,433-row scan is faster
locally than a round trip, and it works offline.

### `resolve_slug(p_slug slug_t)`

Resolves a slug to its PCID, including historical slugs.

Returns `pcid`, `status` (`active` | `retired` | `moved`), and `redirect_to`
(populated only when `status = 'moved'`).

### `get_drug_by_slug(p_slug slug_t)`

Returns one JSONB object: the `drugs` row plus nested `moieties`, `eco`,
`physiochemical`, and `classes`. Returns nothing when the slug is unknown.

```json
{
  "pcid": "PCID-1000233",
  "slug": "ibuprofen",
  "generic_name": "ibuprofen",
  "entry_type": "ingredient",
  "moieties": [{ "dam": "DAM-1000233", "name": "ibuprofen", "role_note": null }],
  "eco": { "rq": 0.42, "pec": 0.01, "mec": 0.05, "rq_risk_class": "low" },
  "physiochemical": { "cas_rn": "15687-27-1", "inchi_key": "HEFNNWSXXWATRW-..." },
  "classes": [{ "pcid": "PCID-3000042", "slug": "nsaids", "name": "NSAIDs", "source": "ATC" }]
}
```

### `approve_revision(p_revision_id bigint, p_note text)`

Security-definer. Applies a pending revision to its target table and marks it
approved. Rejects callers absent from `moderators`. This is the only write path
to curated content.

---

## Client API

`src/api.ts` exposes the same function names regardless of whether Supabase is
reachable:

| Function | Source | Network |
| --- | --- | --- |
| `searchDrugs({ q, limit, offset })` | Catalog | No |
| `listDrugs({ limit, offset, entity_type })` | Catalog | No |
| `getDrugBySlug(slug)` | Catalog + Supabase | Only when hydrating |
| `getDrugByPcid(pcid)` | Catalog + Supabase | Only when hydrating |

Every drug record carries a `status` field: `partial` (catalog only) or `full`
(hydrated). Components branch on this to decide how much detail to render.

`BACKEND_ENABLED` in `src/api.ts` gates Supabase calls entirely. It is `false`
while the schema is undeployed — flip it to `true` after applying
`01_core_schema_v2.sql`.

`getDrugBySlug` returns `null` **only** when a slug is absent from the spine.
A backend failure returns the catalog entry, never null, so a Supabase outage
cannot manufacture a 404.

---

## Routing

Slug-based, with GitHub Pages SPA fallback. Pages has no server-side routing, so
a direct visit to `/drugs/metformin` returns `public/404.html`, which stashes the
URL in `sessionStorage.redirect` and bounces to `/`. A script in `index.html`
reads that key back and replays it through the History API before React mounts.

The key name must match across both files. If direct navigation breaks while
clicked navigation works, that mismatch is the first thing to check.

---

## Design philosophy
Lean into the subject matter — the drug hierarchy, environmental data, Playfair on google fonts for serif and FigTree on google font for sans serif. Avoid AI-design tells:
uniform card grids, decorative tracked all-caps labels, scroll-triggered animation on
every element. Highlightable buttons responsive to hovering. Inspection discriptions on buttons when hovering.
---

## Not yet implemented

- Write endpoints for the contribution workflow (`revisions` table exists; no UI)
- Moderator review interface
- openFDA adverse-event and labeling ingestion
- Full-text search on attributes (current search covers name, brand, slug)
- Interaction data — `interactions` is present in the response shape but empty
  until the junction table is populated
