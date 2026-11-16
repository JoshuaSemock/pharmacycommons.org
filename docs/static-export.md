# Static edition (phase 7 of the Supabase exit)

Status 2026-11-16: **live.** pharmacycommons.org is the static edition (first deploy run
43899007219); the Worker answers `/api/*` from `/api-static/` (version 7c07a3be, `API_MODE = "static"`).
Data: release `static-data`, `static-data.tar.gz` 121,545,635 bytes, SHA-256 `3b878bc9…adc043`,
recorded 2026-11-15/16 from the local stack (64,338 routes, 1 failed: `/drugs/nitrogen`, a 5xx).
Whole site 712 MB of GitHub Pages' 1 GB (data 446 MB, api-static 239 MB, app 20 MB).

### Refreshing the public site
On the PC with the local stack up: `routes.sql` → `permalinks.mjs` → `record.mjs` (resumable;
~3.5 h for everything) → `pack.mjs` → `learn-items.mjs` → `export-api.mjs` → `export-route-meta.mjs`
→ `package-data.ps1`; then replace the release file (GitHub web UI: this session type cannot write
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
- Typo-tolerant search (`search_all`), Network explorer, `/v1/search`: need live queries.
- `/api` static documents not built yet; the Cloudflare Worker change waits for Joshua's approval.
- `/id/PCID-n` bundles duplicate the target page's answers (trim before the full run).
