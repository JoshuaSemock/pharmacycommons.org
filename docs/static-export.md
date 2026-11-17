# Static edition (phase 7 of the Supabase exit)

Status 2026-11-16: **live.** pharmacycommons.org is the static edition (first deploy run
43899007219); the Worker answers `/api/*` from `/api-static/` (version 7c07a3be, `API_MODE = "static"`).
Data: release `static-data`, `static-data.tar.gz` 121,545,635 bytes, SHA-256 `3b878bc9…adc043`,
recorded 2026-11-15/16 from the local stack (64,338 routes, 1 failed: `/drugs/nitrogen`, a 5xx).
Whole site 712 MB of GitHub Pages' 1 GB (data 446 MB, api-static 239 MB, app 20 MB).

### Refreshing the public site
On the PC with the local stack up: `routes.sql` → `permalinks.mjs` → `record.mjs` (resumable;
~3.5 h for everything) → `pack.mjs` → `learn-items.mjs` → `export-api.mjs` → `export-route-meta.mjs`
→ `export-sqlite.mjs` (search index and Network database, about 1 minute; see below) → `package-data.ps1`; set `VITE_DATA_SNAPSHOT` in `.env.static` to the recording day (the footer and
Developers page show it, `src/release.ts`) and commit; then replace the release file (GitHub web UI: this session type cannot write
releases) and run **Deploy the static edition**. Keep processes hidden (`Start-Process -WindowStyle
Hidden`): closing a console window killed the first full run. Plan and decisions: `docs/local-app.md`.

## How it works
The public site keeps the same React app, built with `vite build --mode static` (`.env.static`).
`src/staticBoot.ts` (first import in `main.tsx`) installs `src/staticData.ts`, which answers every
request to `<origin>/supabase/...` (PostgREST, RPCs, Edge Functions, the `api` function) from files:

| File | Holds |
| --- | --- |
| `/data/p/<xx>/<hash>.json` | the answers one route needs (`hash` = SHA-256 of its pathname) |
| `/data/s/<requestKey>.json` | one answer needed by 3+ routes or by the header search on any page |

`requestKey` = first 20 hex of SHA-256 of `METHOD \n path-after-/supabase \n body`
(`src/staticData.ts` and `scripts/static/key.mjs` must agree). Unrecorded requests get a 404 with
`code: static_miss` and a `[static] miss` console warning.

## Producing the data (on the PC, local stack running)
1. `pnpm build:local` then `pnpm preview:local` (port 4173, proxies /supabase to the stack).
2. `psql ... -At -v sample=0 -f scripts/static/routes.sql -o routes.txt` (`sample=100` = 100 per type).
3. `node scripts/static/permalinks.mjs --out <dir>` writes the `/id/PCID-n` recordings straight from
   the database (one lookup each).
4. `node scripts/static/record.mjs --routes routes.txt --out <dir> --workers 4` — headless Edge opens
   each route and saves every /supabase response (`<dir>/raw/`; resumable; failures in `errors.txt`).
5. `node scripts/static/pack.mjs --out <dir>` — writes `<dir>/site/data/` (replacing it) and prints sizes;
   then `node scripts/static/learn-items.mjs --out <dir>` adds `data/learn-items.json` for the Learn
   review queue, which depends on each visitor's progress and so can't be recorded.
6. `vite build --mode static --outDir dist-static`, copy `<dir>/site/data` into it.

## Prototype measurements (847 routes: 100 per entity type + fixed pages)
- 0.73 routes/s with 4 workers → the full ~32,100 routes ≈ 12 hours.
- Projected route data 544 MB raw / 109 MB gzip (moiety 22 KB avg, precise form 50 KB, class 11 KB,
  formulation 8 KB); shared answers 5 MB (catalog, class and list indexes). GitHub Pages limit is 1 GB.
- Checked in the browser against the static build (port 4180, no database): metformin page with full
  FDA label text, `/id/PCID-1001923` → `/drugs/metformin`, `/lists/do-not-crush` (226 rows),
  `/browse?q=lisin`; no misses, no requests leave the origin.

## Live queries without a database (2026-11-17)
Two features answer what the visitor types or picks, so they can't be recorded: the header's
typo-tolerant search (`search_all`) and the Network pages (`network_neighborhood`, `_relations`,
`_compare`, `_hierarchy`, `_edge_evidence`, and the concept chips' `entities?pcid=in.(…)`).
`src/staticComputed.ts` answers those requests in the browser before `staticData.ts` looks for a
recording:

| Request | Answered by | Data file (gzipped size, 2026-11-14 data) |
| --- | --- | --- |
| `search_all` | `src/staticSearch.ts`, a TypeScript copy of the SQL (pg_trgm similarity, word_similarity, `osa_distance`, the same score tiers and ranking) | `/data/search-index.json` (0.58 MB; 35,207 rows, 23,641 PCIDs) |
| `network_*`, concept chips | `src/staticNetwork.ts` over SQLite in the browser (sql.js, loaded only on Network pages; `src/staticDb.ts`) | `/data/db/network.sqlite.gz` (3.4 MB; entities, moieties, drug_classes, class_members, clinical_statements, lists, list_items, data_sources, fda_applications) |

Both files are written by `node scripts/static/export-sqlite.mjs --out <dir> [--db <url>]` straight from
the local database (no recording), into `<dir>/site/data/`, and packed as `<dir>/static-query.tar.gz`
(3.8 MB). Attach that file to the `static-data` release beside `static-data.tar.gz` (GitHub web UI);
the deploy workflow adds it when present. Refreshing these two files therefore needs no re-upload of
the big file. Without it, the typo guesses and Network pages show their "could not load" states.

**Checked against the database:**
- `node --experimental-strip-types scripts/static/check-search.mjs --index <dir>/site/data/search-index.json`:
  400 generated queries (real names and brands with one typo, plus prefixes): 99.0% identical to
  `search_all()`, 99.8% same top hit. The rest are ties the SQL leaves in any order (same-name
  classes, the 60-candidate cut on equal similarity).
- `node --experimental-strip-types scripts/static/check-network.mjs --sqlite <dir>/sqlite/network.sqlite`:
  159 concepts (busiest classes, drugs, lists, plus random) × neighborhood (two ways), relations
  (two ways), hierarchy; 30 compare pairs, 30 hierarchy pairs, 160 edge-evidence ids: all 1,015
  identical. Postgres leaves same-name nodes in any order, so `nodes` is compared by PCID.
- In the browser (static build, no database): "metfromin" → "Did you mean metformin?"; metformin's
  graph, Browse all 56, compare metformin + warfarin, hierarchy metformin + lisinopril. Opening the
  database takes about 60 ms after download; a neighborhood about 30 ms (157 ms for the
  6,817-member ChemOnt hub).

**When the SQL changes, change the copy:** `search_all` → `src/staticSearch.ts`; any `network_*`
function or `network_predicate_group` → `src/staticNetwork.ts`; new columns → `export-sqlite.mjs`.
Re-run the two check scripts. Community statements are not exported (accounts are off).

Why not one database file for everything: measured in `docs/sqlite-range-prototype.md`.

## Public API (static)
`scripts/static/export-api.mjs` saves, for every PCID, the local `api` function's current document,
versions list, first page of changes and (classes) first page of members under `/api-static/v1/`, plus
`slugs.json` and `retired.json`. `workers/api-proxy/src/static.ts` maps `/api/*` onto those files when
`API_MODE = "static"` is set in `wrangler.toml` (commented out until Joshua approves the switch).
Not served: `/v1/search` (501), older numbered versions, later pages of changes/members (404,
`code: static_unavailable`).

## Publishing (each step needs Joshua's go-ahead)
1. `node scripts/static/export-route-meta.mjs <dir>/route-meta.json`, then
   `powershell -File scripts\static\package-data.ps1 -Out <dir>` makes `static-data.tar.gz`
   (`data/` + `api-static/`); `-Upload` attaches it to the GitHub release `static-data`.
2. Run the **Deploy the static edition** workflow (`.github/workflows/deploy-static.yml`, manual only):
   builds `--mode static`, runs postbuild, unpacks the release file into `dist/`, deploys.
3. Deploy the Worker with `API_MODE = "static"`.
4. Done in PR #154: `deploy.yml` is manual-only, so a merge to main no longer republishes the
   Supabase-backed build. Refreshing the public site = steps 1 and 2 again.

## Known gaps (open)
- Fixed: `scripts/postbuild.mjs` reads list routes from `route-meta.json`
  (`scripts/static/export-route-meta.mjs`, packed into the release file) when `PC_ROUTE_META` is set,
  so the static deploy never calls the live project. Checked: 47 list pages + sitemap written.
- Fixed 2026-11-17: typo-tolerant search and the Network explorer work again (above), once
  `static-query.tar.gz` is attached to the release. `/v1/search` on the Worker still answers 501.
- `/api` static documents not built yet; the Cloudflare Worker change waits for Joshua's approval.
- `/id/PCID-n` bundles duplicate the target page's answers (trim before the full run).
