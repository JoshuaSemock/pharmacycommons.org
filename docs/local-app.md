# Local app (Supabase exit)

Pharmacy Commons can run entirely on one Windows PC: the Supabase CLI's local stack
(Docker Desktop) holds the database and serves the Edge Functions, and the React app
runs on `localhost`. Decided by Joshua 2026-11-14: personal use only, read-only, no
accounts; the public site becomes a static read-only export (phase 7 of the plan); the
hosted project is paused, never deleted, by Joshua himself after cutover.

## Plan and status

| # | Phase | Status |
| --- | --- | --- |
| 0 | Inventory | Done 2026-11-14 |
| 1 | Backup (pg_dump + Storage bucket) | Done 2026-11-14 |
| 2 | Local database (supabase start + restore) | Done 2026-11-14 |
| 3 | Front end points at the local stack via env | Done 2026-11-14 (PR #150) |
| 4 | Remove account features | Done 2026-11-15: build-time switch, see below |
| 5 | Ingest functions as local scripts | Done 2026-11-15: `pnpm ingest:local`, see below |
| 6 | Launch + nightly backup scripts | Done 2026-11-15: `scripts/local/`, see below |
| 7 | Static public export to GitHub Pages | Not started (Joshua approves first publish) |
| 8 | Verify, then Joshua pauses Supabase | Not started |

## Running it

Prerequisites (Joshua's PC, 2026-11-14): Windows 11, WSL2, Docker Desktop, Node ≥22,
the Supabase CLI v3.1.0 and Postgres 17.9 client tools in
`C:\Harddrive\4. Drug Matrix\Claude\Tools\`.

```powershell
# from a clone of this repo
supabase start            # database on 127.0.0.1:54322, API on :54321, dashboard on :54323
pnpm install
pnpm dev:local            # app on http://127.0.0.1:5173, talking to the local stack
```

`pnpm dev:local` runs Vite in mode `localdb`, which loads `.env.localdb`:
`VITE_SUPABASE_URL=/supabase`, `VITE_SUPABASE_PUBLISHABLE_KEY` (the CLI's public local
default) and `VITE_PC_API_BASE=/supabase/functions/v1/api`. In that mode the Vite dev and
preview servers proxy `/supabase/*` to the stack on `127.0.0.1:54321`, so the browser
only ever talks to one origin (no CORS; the Claude desktop app's built-in browser refuses
cross-port localhost requests outright, which is how this was found). `src/supabaseClient.ts` uses them when set and falls back to the live
project otherwise, so `pnpm build` (GitHub Pages) is unchanged. `build:local` /
`preview:local` do the same for a production build.

The GitHub Pages deep-link trick (`public/404.html` → `index.html`) needs no change for
local use: Vite's dev and preview servers return `index.html` for every route, so the
404 page never runs and the restore script finds nothing to restore.

`supabase/config.toml` makes this repo the local Supabase project (`project_id =
"pharmacy-commons"`; realtime and analytics off; `verify_jwt` per function as on live).
The database lives in the Docker volume `supabase_db_pharmacy-commons`, so it survives
`supabase stop` and is shared by any folder whose config uses that `project_id`. **Don't
run `supabase db reset` on it**: there are no migrations in `supabase/migrations/`, so a
reset leaves an empty database (restore from a backup instead, below).

## Backups and restore (scripts in `Claude\Tools\`, not in this repo)

- `dump-live.ps1`: read-only dump of the hosted project (full custom-format archive,
  schema-only SQL, migration history, exact row counts, SHA-256 sums). The 2026-11-14 run
  used a temporary read-only role (`pg_read_all_data`, `bypassrls`, 6-hour expiry) whose
  password stayed on the PC; Joshua created and dropped it in the SQL editor.
- `backup-label-sections.mjs`: copy of the public Storage bucket `label-sections`
  (52,571 JSON files, about 3 GB; one per `label_documents.setid`; nothing in the app
  reads it). Done 2026-11-14, 0 failures.
- `restore-test.ps1`: restore into a throwaway native Postgres 17 (no Docker) with a
  small Supabase shim (roles, `auth.uid()/role()/jwt()`, `auth.users`); proves the
  native Postgres + PostgREST fallback.
- `restore-local.ps1`: restore into the local stack and compare row counts with live.

2026-11-14 results: both restores 0 errors; all 106 public + archive tables match live
exact row counts except `entity_label_rank` (live 12,417 vs 12,347 restored, because the
live matview is stale: its own query returns 12,347 on live too).

## Read-only edition (phase 4, decided 2026-11-15)

Joshua's calls: a switch rather than deleting code; no accounts on the live site from now
on; Learn starts fresh in each browser (server-side progress is not copied, and nothing
is deleted from the database); read-only page history stays.

`src/features.ts` exports `ACCOUNTS_ENABLED`, off unless the build sets `VITE_ACCOUNTS=on`.
With it off:

- `useSession()` (`src/auth.ts`) reports nobody signed in and never calls Supabase Auth,
  so every control that checks for a user stays hidden (Save, Edit, Quick Facts and brand
  editors, revision actions) and Learn uses its `localStorage` guest mode.
- `/account`, `/new`, `/review`, `/admin`, `/admin/learn` and `/drugs/:slug/edit` render
  `src/pages/ReadOnlyEdition.tsx`.
- Hidden explicitly: the header and phone-bar account buttons (the phone bar drops to four
  slots), "Sign in to edit" / "Verify your NPI to edit", every "Create a page" link and the
  Topics create panel, blog comments, the "Sign in to keep your progress" Learn lines, and
  the Account / Create-a-page entries in site search.

Untouched: the database (account tables, functions, the 3 accounts and their data, all in
the 2026-11-14 backup) and the `verify-npi` / `publish-page` functions, which nothing in the
read-only build calls.

**Open for Joshua:** the Terms of Use and Privacy Policy still describe accounts,
registration and NPI verification. Changing them is a legal-document change (new
`effective_date`, `LEGAL_VERSION`, `body_sha256`), so it was not done here.

## Ingest jobs locally (phase 5, 2026-11-15)

The local stack serves all twelve Edge Functions, so the ingest jobs run there unchanged and
write to the local database. `scripts/ingest-local.mjs` (`pnpm ingest:local <job>`) calls one
batch at a time instead of the functions' self-chaining, prints each batch's result and stops
when the function reports nothing left. It refuses any API URL other than 127.0.0.1/localhost.

| Job | Function | Token row | Notes |
| --- | --- | --- | --- |
| `drugsfda` | `drugsfda-ingest` | `drugsfda` | `--skip`, `--search`; pages of up to 1,000 |
| `rxnorm` | `rxnorm-brands` | `rxnorm` | moieties with no `rxnorm_lookup` row |
| `rxclass` | `rxclass-ingest` | `rxclass` | `--mode drugs` (default), `taxonomy`, `va_verify` |
| `chemont` | `chemont-terms` | `rxclass` | one call |
| `classyfire` | `classyfire-ingest` | `rxclass` | moieties with no `chemont_links` |
| `pubchem` | `pubchem-structures` | `rxclass` | probes PubChem first, 5 s between batches |
| `gsrs` | `gsrs-structures` | `rxclass` | |
| `xref` | `pubchem-xref` | `rxclass` | `--mode drugbank` (writes) or `name` (review table only) |

Options: `--limit`, `--once`, `--max-batches`, `--pause`. Keys come from `supabase status -o env`
(set `SUPABASE_CLI` to the executable if it isn't on PATH; on Joshua's PC
`C:\Harddrive\4. Drug Matrix\Claude\Tools\supabase\supabase.exe`).

Only the `rxclass` token exists: `drugsfda` and `rxnorm` were switched off on the hosted
project by deleting their rows, and the restore kept it that way. `--create-token` adds the
missing row to the **local** database only.

Checked 2026-11-15 on Joshua's PC: `drugsfda` without a token refuses; `rxclass --once --limit 5`
processed 5 moieties (1 with classes, 4 with no RxCUI); `pubchem` probe 200, batch empty
(ladder rung 1 complete). These runs write to the local database, which from now on drifts
from the hosted copy; that is expected, since the local copy is the working one.

**Bulk-load follow-up (unchanged):** after a large run, refresh the derived views in the local
database: `moiety_hierarchy`, then `ingredient_moiety_map`, `entity_brand_names`, and
`search_index` (`refresh materialized view concurrently …`). `rxclass` and `classyfire` feed
`class_members` through `rebuild_classes()`.

## Launch and nightly backup (phase 6, 2026-11-15)

Scripts in `scripts/local/` (Windows PowerShell 5.1, ASCII only, no admin rights needed):

| Script | What it does |
| --- | --- |
| `start-local.ps1` | starts Docker Desktop if needed (waits up to 3 min for the engine), `supabase start`, then `pnpm dev:local` in a minimized "Pharmacy Commons app" window, and opens http://127.0.0.1:5173. Leaves anything already running alone. |
| `stop-local.ps1` | stops that dev server and `supabase stop` (the database stays in its Docker volume). Docker Desktop keeps running. |
| `backup-local.ps1` | `pg_dump -Fc` of `public`, `archive`, `auth`, `storage`, `supabase_migrations` from the local database; checks it with `pg_restore --list`; keeps 14 in `Claude\Backups\local-nightly\` and copies each to the second location, keeping 7 there; one line per run in `backup-log.txt`. A stopped stack is logged as "skipped", not an error. |
| `install-local.ps1` | desktop shortcuts "Pharmacy Commons" and "Stop Pharmacy Commons", and the scheduled task "Pharmacy Commons nightly backup" (daily 2:17 AM, current user, runs late if the PC was asleep or off). Re-running replaces them. |

Second location: `%USERPROFILE%\OneDrive\Pharmacy Commons Backups` (Joshua's Desktop already lives in
OneDrive, so this syncs off the PC). About 100 MB per dump, about 700 MB for the 7 kept there.
Change it by re-running `install-local.ps1 -SecondDir "<folder>"`.

Checked 2026-11-15 on Joshua's PC: a manual backup (98.7 MB, about 1 min, 32,154 entities, copied to
OneDrive); the scheduled task run on demand (result 0, second log line; next run 2026-11-16 02:17);
both shortcuts created; stop (0 containers left) then start (62 s, then a query through the app's
`/supabase` proxy returned metformin).

Restoring one of these dumps into a fresh stack: `supabase start`, create the extensions and the
`archive` schema, then `pg_restore --no-owner -n public -n archive -n supabase_migrations` as in
`Claude\Tools\restore-local.ps1` (that script refuses to run over a database that already has data).

## Schema baseline

`db/baseline/2026-11-14_schema.sql` is the live schema of `public` and `archive` as of
the dump. It is authoritative for rebuilds; the `db/phase*.sql` files are history and
are known to lag live (see `docs/schema-drift-2026-11-14.md`).
