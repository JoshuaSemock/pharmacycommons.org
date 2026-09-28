# Machine-readable view — design and operations

*Written 2026-09-23. Destination: `docs/machine-readable-api.md`.*

Pharmacy Commons is meant to work **humans → machines → humans**: a record is
knowledge infrastructure first, and the web page is one rendering of it. Every
PCID therefore has, from one source of truth:

| | Where |
|---|---|
| Human-readable page | `https://pharmacycommons.org/drugs/{slug}` |
| Permanent URL (never changes, never reissued) | `https://pharmacycommons.org/id/PCID-n` → redirects to the current page |
| PCID | `PCID-1001923` — the only native key |
| Structured JSON / JSON-LD | `{API}/v1/entities/PCID-n.json` / `.jsonld` (`/v1/drugs/...` is an alias) |
| Machine-readable relationships | `relationships[]` (every triple the record takes part in), `classification.memberships[]`, `hierarchy` — all as `@id` references |
| Provenance | `provenance.sources[]`: which source contributed which part, with license or terms |
| Source references | `labels.top[]` (DailyMed setids), `guidelines[]`, statement `evidence` |
| Version history | `{API}/v1/entities/PCID-n/versions`, each version at `/versions/{n}` forever |
| Change history | `{API}/v1/entities/PCID-n/changes` — field-level diffs, newest first |
| Schema definition | `{API}/v1/schema/entity.json` (JSON Schema 2020-12), `{API}/v1/context.jsonld` |
| Search by name, brand or class | `{API}/v1/search?q=` (added 2026-09-28, `api_search()`, `db/phase11a_api_search.sql`) |
| API description | `https://pharmacycommons.org/openapi.json` (OpenAPI 3.1) and `/llms.txt`, generated at build from `src/developers/endpoints.ts` |
| Documentation and live console | `https://pharmacycommons.org/developers` |

`{API}` is today `https://nenwovhyrdcdkhxzjiiv.supabase.co/functions/v1/api`
and will be `https://pharmacycommons.org/api` once the Cloudflare Worker is live
(see *Serving from pharmacycommons.org* below).

## Architecture

```
entities + block tables + statements + classes + brands + labels + guidelines
        │  (row triggers)                      │
        ▼                                      ▼
  entity_changes ──────────────▶ api_entity_content(pcid)   ← the ONE document builder
  (field diffs, source tag)           │ sha256
                                      ▼
                               entity_versions  (content-hashed snapshots)
                                      │
      api_entity_document / _versions / _changes / _class_members / api_index   (SQL, public RPC)
                                      │
               supabase/functions/api  (routing, HTTP caching, ETag, Link headers)
                          │                               │
              any client, crawler, agent        the website (MachinePanels.tsx,
                                                JSON-LD in <head>, /id/:pcid)
```

Decisions and why:

- **One document builder, in SQL.** `api_entity_content` is the single place the
  record's shape is defined. The website reads the same document the public API
  serves, so the site can never show something the machine view lacks (or the
  reverse). The Edge Function only routes.
- **Versions are content-addressed.** A version is recorded when the SHA-256 of
  the document body changes — whether from a direct edit (`reason: change`) or a
  refresh of derived data like brands or class memberships (`reason: derived`).
  Unchanged records never get a new version (verified: 0 spurious versions over
  500 random re-hashes). Every record was baselined as version 1 on 2026-09-23.
- **Changes are row-level and automatic.** Triggers on `entities`, the nine block
  tables, `physiochemical`, `clinical_statements` and `entity_guidelines` write
  only the fields that actually changed. A statement edit is logged against its
  subject, object and comparator. `actor` is stored but never exposed publicly.
- **PCID is the identity; slugs are addresses.** `@id` everywhere is
  `https://pharmacycommons.org/id/PCID-n`. Slugs, slug URIs and bare numbers all
  resolve to the PCID. Retired PCIDs answer `410 Gone`.
- **Honest provenance.** Sources come from a registry (`data_sources`). License
  is filled in only where it is known; otherwise `terms_url` points at the
  source's own terms. Class assignments made by `rule` or `agent_review` carry
  `machine_assisted: true`, and the page labels them.

## Operating it

**Tag bulk writes** so the change log says where they came from:

```sql
begin;
set local pc.change_source = 'rxclass-ingest';   -- any short label
-- ... updates / inserts ...
commit;
```

Untagged writes are logged as `direct`. `approve_revision()` tags its own
writes `revision` with the revision id.

**After refreshing derived data** (`entity_brand_names`, `moiety_hierarchy`,
`entity_label_rank`, `class_members` rebuilds), record the resulting versions:

```sql
select api_snapshot_all();              -- all 31k records, a few minutes
select api_snapshot_all('moiety');      -- or one entity type
```

Without this, a derived change still becomes a version — but only when the
record is next read, so its version date would be the read date.

**After direct edits**, versions are recorded on the next read, or in bulk with
`select api_snapshot_sweep();`. Both are safe to run any time.

**Settings** live in `api_meta`:

| key | now | note |
|---|---|---|
| `site_base` | `https://pharmacycommons.org` | base of `@id` IRIs — changing it changes every record's identity |
| `api_base` | Supabase function URL | switch when the API moves to the site domain |
| `data_license` / `data_license_url` / `data_license_scope` | `CC0-1.0` (applied 2026-09-28, `db/phase8j_data_license.sql`) | Pharmacy Commons–authored content; third-party fields keep their source terms |
| `schema_version` | `1.0.0` | bump with any document shape change |

## Serving from pharmacycommons.org

**Decided (Joshua, 2026-09-28): proxy through Cloudflare.** Static export was
rejected because versions, changes and class members cannot be static, so the
API would have had two base URLs. The function already accepts both
`/functions/v1/api/v1/…` and `/api/v1/…` paths.

Set-up:

1. DNS moved from Porkbun to Cloudflare (nameservers `athena` / `igor.ns.cloudflare.com`).
   The GitHub Pages A/AAAA records and `www` CNAME are **proxied**; the Porkbun MX
   and SPF records stay **DNS only**. SSL/TLS mode **Full (strict)** — never
   Flexible, which loops against GitHub Pages' forced HTTPS.
2. A Worker, `pharmacycommons-api`, on the route `pharmacycommons.org/api/*`,
   forwards GET/HEAD/OPTIONS to the function (passing `Accept`, `If-None-Match`
   and the CORS preflight headers) and caches at the edge: 2xx 5 min, 404 1 min,
   410 1 hour, 5xx not at all. Every other path still comes from GitHub Pages.
3. **Switch-over, only after the Worker answers correctly** (document, ETag and
   304, 410, CORS from another origin):
   - `update api_meta set value = 'https://pharmacycommons.org/api' where key = 'api_base';`
     (changes the links inside every document)
   - Supabase → Edge Functions → Secrets: `PC_API_BASE = https://pharmacycommons.org/api`
   - `src/developers/endpoints.ts`: `CURRENT_API_BASE = API_BASES.site` (the site,
     the Developers page, `openapi.json` and `llms.txt` all read this one value)

## Known gaps

- `moiety_hierarchy` places some precise-form records under `combinations`
  (e.g. metformin lists PCID-3000168 *canagliflozin, metformin hydrochloride*).
  The document exposes each reference's real `entity_type`, so consumers can
  tell, but the view's relation labels should be fixed at the source.
- `entity_changes` starts on 2026-09-23. Earlier history is in the workbook's
  `Dispatch_Log`.
- Several upstream licenses conflict with a permissive data license if their
  content is redistributed (CAS Common Chemistry is CC BY-NC 4.0; ATC and
  DrugBank have their own terms). Decide the data license with that in mind.
