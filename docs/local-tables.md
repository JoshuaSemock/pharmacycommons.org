# Tables (local app only)

Added 2026-11-16 at Joshua's request: browse every table in the local database from the site's own
interface, and correct values in place.

## Where
`http://127.0.0.1:5173/tables` (or 4173 with `pnpm preview:local`), and **Tables** in the site menu.
It exists only in `--mode localdb` (`LOCAL_TOOLS_ENABLED` in `src/features.ts`); the public static site
and the old Supabase-backed build have no route and no endpoint.

## What it does
- `/tables`: every table, view and materialized view in `public` (110 on 2026-11-16), grouped
  (Records, Relationships, Lists, Labels, Sources, Learn, Community (dormant), History, Bookkeeping,
  Derived views), with Postgres row estimates, column counts and table comments. Find by table or
  column name.
- `/tables/:name`: 100 rows a page with the exact matching count; click a header to sort (asc, desc,
  off); filter per column (text, JSON and array columns match anywhere, others exactly; `NULL` finds
  empty); search every column; download the filtered rows as CSV (up to 100,000). PCID columns
  (`pcid`, `*_pcid`) link to `/id/PCID-n`. Token/secret/password columns stay hidden until asked.
- Click a cell to read it in full; edit it when allowed, review old → new, confirm.

## Editing rules (checked in the browser and again on the server)
- One value at a time. No adding or deleting rows.
- Never: primary-key columns, any `pcid` column, generated/identity columns, views and materialized
  views (fix the source and refresh), tables without a primary key, and the ledgers and history
  `pcid_blocks`, `pcid_retired`, `entity_versions`, `entity_changes`, `api_meta`, `ingest_tokens`.
- NOT NULL columns can't be emptied; JSON must parse; arrays as JSON (`["a","b"]`) or `{a,b}`.
- The save is refused (409) if the value changed since the page loaded.
- Each save runs with `pc.change_source = 'tables-ui'`, so `entity_changes` records it like any bulk
  edit. Undo = edit it back, or restore last night's backup (`Backups\local-nightly`).
- Public site: edits reach pharmacycommons.org only after the next re-record and deploy
  (`docs/static-export.md`).

## How it is built
- `scripts/viteLocalDb.ts`: a Vite plugin (dev and preview servers, localdb mode only) serving
  `GET /__local/db/tables`, `GET /__local/db/rows`, `GET /__local/db/csv`, `POST /__local/db/update`.
  It connects with `pg` to `LOCAL_DB_URL` (default the CLI's local
  `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, refused if not this PC), 15 s statement
  timeout. It answers only loopback connections with a localhost Host header (no DNS rebinding), and
  POSTs need `x-pc-local: 1` (a cross-site form cannot send it).
- `scripts/localDb.ts`: the pure parts (catalogue SQL, parameter parsing, query building with quoted,
  catalogue-checked identifiers and bound values, edit checks, CSV). Tests: `scripts/localDb.test.ts`.
- `src/localTables.ts` (client, grouping, display/edit helpers; `src/localTables.test.ts` also checks
  that its lock rules match the server's), `src/pages/Tables.tsx`, `src/pages/TableView.tsx`.

## Checked 2026-11-16 (on the PC, `preview:local`)
110 tables listed in 10 groups; `entities` filtered by slug (32 metformin rows); `label_sections`
(2,331,835 rows) sorted descending; `moiety_hierarchy` searched (56 rows). Edit path: no header →
403; PCID column → 400; `pcid_blocks` → 400; stale value → 409; a test edit of metformin's
`description_text` saved and was put back to NULL, both changes logged as `tables-ui`.
