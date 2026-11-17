# Changelog

Versions of Pharmacy Commons. The number lives in `package.json` and is shown in the site
footer with the edition and, for the public site, the day its data was recorded
(`src/release.ts`). When you bump it, add an entry here and a What's new file in
`src/content/updates/` in the same commit (`src/release.test.ts` fails without the entry).

Numbering: the middle number changes when the way the site is built or hosted changes, the
last number for fixes and smaller features. Version 1.0.0 is reserved for Joshua to call.

## 0.2.1 (2026-11-17) Search guesses and Network return

Two features the static edition had dropped work again, with no database behind the site
(`docs/static-export.md`, "Live queries without a database").

- **Typo-tolerant search:** "metfromin" offers metformin again. The header's `search_all` runs
  in the browser (`src/staticSearch.ts`) over a 0.6 MB search index, fetched only when the
  instant search finds nothing. It matched the database's own `search_all()` on 99% of 400 test
  queries; the rest are ties.
- **Network pages:** the graph, Browse all, Compare and Classification hierarchy run on SQLite in
  the browser (`src/staticNetwork.ts`, sql.js), from a 3.4 MB database fetched only on those
  pages. They matched the database's `network_*` functions on all 1,015 checks.
- **Data:** `scripts/static/export-sqlite.mjs` writes both files from the local database in about a
  minute, as `static-query.tar.gz`, a small second file on the `static-data` release. The deploy
  workflow adds it when it is there.
- **Measured, not adopted:** serving all page data from one SQLite file with range requests
  (`docs/sqlite-range-prototype.md`). It was about 19 times slower per page than today's files.

## 0.2.0 (2026-11-17) Static edition

The Supabase exit (`docs/local-app.md`, `docs/static-export.md`).

- **Local edition:** the database runs on Joshua's PC (Supabase CLI stack in Docker) and is
  edited there through the website at `127.0.0.1:5173`, Supabase Studio and the new Tables
  page (`/tables`, local only; `docs/local-tables.md`). Desktop icons start and stop it; a
  nightly backup copies it to the PC and OneDrive. Ingest jobs run locally
  (`pnpm ingest:local`).
- **Static edition:** pharmacycommons.org is a read-only copy built from recorded answers
  (`vite build --mode static`, data in the `static-data` GitHub release); it reads no database.
  The Cloudflare Worker serves `/api` from the same files (`API_MODE = "static"`). PCID
  permalinks and retired-PCID redirects keep working.
- **Read-only:** accounts, editing, page creation, review and blog comments are switched off
  (`ACCOUNTS_ENABLED`; the code stays). Learn keeps progress in the browser.
- **Deploys are manual:** `deploy-static.yml` publishes the public site; `deploy.yml` (the old
  online build) is kept only to go back.
- **Version shown:** the footer shows the version, edition and data date.
- No data changed during the move; every PCID is the same.

## 0.1.0 (to 2026-11-14) Online edition

The site read the Supabase cloud database (project `nenwovhyrdcdkhxzjiiv`) directly, with
accounts, NPI-verified community editing, review queues and blog comments. Built in phases
1–36; see `docs/project-history.md` and `CLAUDE.md`. The number was never shown on the site.
