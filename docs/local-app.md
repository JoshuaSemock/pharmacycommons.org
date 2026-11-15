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
| 5 | Ingest functions as local scripts | Not started |
| 6 | Launch + nightly backup scripts | Not started |
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

## Schema baseline

`db/baseline/2026-11-14_schema.sql` is the live schema of `public` and `archive` as of
the dump. It is authoritative for rebuilds; the `db/phase*.sql` files are history and
are known to lag live (see `docs/schema-drift-2026-11-14.md`).
