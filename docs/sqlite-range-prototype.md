# Prototype: one SQLite file over HTTP range requests (2026-11-17)

**Question:** could the static edition ship the database instead of recorded answers? That is, one
SQLite file on GitHub Pages, read in the browser with HTTP range requests (sql.js-httpvfs), in place
of 64,338 route files (`/data/p/`) and 32,103 API documents (`/api-static/`).

**Answer: not for pages.** It shrinks storage about threefold, but every page waits for a chain of
small requests, so page data loads about 19 times slower than today. Small query databases
downloaded whole are the better tool. That is what the static edition now does for search and the
Network pages (`docs/static-export.md`, "Live queries without a database").

## What was built
`scripts/static/range-prototype/build.py` packs into one file (page size 4,096):
- every recorded route bundle, gzipped per row (`routes`, 64,338 rows: 406 MB raw → 95 MB);
- every current API document, gzipped per row (`docs`, 32,103 rows: 165 MB raw → 47 MB);
- the Network tables (`export-sqlite.mjs`) and the search index.

**Result: 247 MB in one file** (26 chunks of 10 MB, sql.js-httpvfs "chunked" mode), against 712 MB
in about 96,000 files today.

## How it was measured
- Data from the 2026-11-14 dump, restored into Postgres 17; release `static-data` as published.
- `server.mjs` serves the chunks with Range support and a fixed delay per request; `measure.mjs`
  runs each query in headless Chrome and counts requests and bytes.
- The delay is **63 ms**: the median of 8 range requests from Joshua's PC to pharmacycommons.org,
  measured the same day. The live site does answer range requests (206 Partial Content through
  Cloudflare). Fetching one route file takes 44 ms.

## Results (63 ms per request)

| Query | Time | Requests | Transferred |
| --- | ---: | ---: | ---: |
| Open (worker, wasm, header page) | 521 ms | 6 | 1,300 KB |
| Route bundle `/drugs/metformin` (21 KB gzipped) | 830 ms | 12 | 64 KB |
| Route bundle `/drugs/warfarin` (25 KB gzipped) | 821 ms | 12 | 96 KB |
| API document PCID-1001923 | 211 ms | 3 | 12 KB |
| Network edges, metformin | 2,911 ms | 42 | 192 KB |
| Network edges, warfarin | 916 ms | 13 | 56 KB |
| ChemOnt class with 6,817 members, first 40 by name | 1,347 ms | 19 | 2,312 KB |
| Search prefix "metf" (index range) | 836 ms | 12 | 56 KB |
| Search substring "%formin%" (scan) | 722 ms | 10 | 4,092 KB |

For comparison:
- **Today, a page's data** is one file fetched in about 44 ms.
- **Network, as shipped:** a one-off 3.4 MB download (about 0.6 s at 50 Mbit/s, 2.7 s at 10). After
  that, open takes 60 ms and a neighborhood 30 ms (157 ms for the 6,817-member hub), with no more
  requests.

## Why it is slow
Each B-tree level is one more round trip, and the requests run one after another. A blob bigger than
a page follows a chain of overflow pages. sql.js-httpvfs grows its read-ahead on sequential reads,
but a lookup jumps around the file. Larger pages or a covering layout would trim this, but not
toward one request per page.

## What would be worth doing instead
- **Keep one file per route** for page data. It is the fastest thing GitHub Pages can serve.
- **Replace the 3.5-hour browser recording with a direct exporter.** Write each route's answers from
  SQL, the way `export-sqlite.mjs` writes the query data. The site's request keys are known
  (`scripts/static/key.mjs`). This is where the real time saving is, and it needs no change to how
  pages load.
- **Whole-file databases for anything a visitor queries**, kept small (a few MB gzipped), as now
  for search and Network.

## Reproducing
```bash
node scripts/static/export-sqlite.mjs --out ../static-out
python3 scripts/static/range-prototype/build.py ../static-out <unpacked static-data.tar.gz>
# split into 10 MB chunks + config.json (sql.js-httpvfs chunked mode), bundle harness.js with esbuild,
# copy sql.js-httpvfs/dist/{sqlite.worker.js,sql-wasm.wasm} into www/, then:
node scripts/static/range-prototype/server.mjs www 4190 63 &
node scripts/static/range-prototype/measure.mjs 4190
```
The prototype is not part of the site, and nothing in `src/` uses it. `harness.js` needs
`sql.js-httpvfs` and `esbuild`, installed in a scratch folder (they are not repo dependencies).
