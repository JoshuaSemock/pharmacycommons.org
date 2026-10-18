# Network page (`/network`)

An explorable graph of what the database records about a concept: classes it belongs to, products that contain it, and use, safety and interaction statements. **Cytoscape.js only draws.** PostgreSQL stays the source of truth; the page never writes.

Status: **live** (PR #92 merged 2026-10-18). `db/phase19_network.sql` was run by Joshua in the SQL editor and recorded in `schema_migrations` as 20261018170000/01/02 (`phase19a_network_predicate_group`, `phase19b_network_neighborhood`, `phase19c_network_edge_evidence`). Checked live: all three functions are SECURITY INVOKER and executable by anon; the security advisors list no new findings; `network_neighborhood(1000577)` (acetazolamide) returns 46 edges (classification 38, safety 4, use 3, composition 1) and the first page of 12 interleaves groups.

## Architecture

| Piece | Path | Job |
| --- | --- | --- |
| SQL | `db/phase19_network.sql` | `network_predicate_group()`, `network_neighborhood()`, `network_edge_evidence()`; functions only, SECURITY INVOKER, over tables that already have `public_read` RLS |
| Client API | `src/network/api.ts` | RPC calls, concept search, slug lookup; maps "function missing" to a not-deployed state |
| Model | `src/network/model.ts` | Pure state: parse, merge, collapse, filter, relation rows. No React, no Cytoscape |
| Vocabulary | `src/network/predicates.ts` | Group meanings, per-predicate phrases and definitions, node shape and border per entity type, page paths |
| Layout | `src/network/layout.ts` | Ring placement for new nodes; existing nodes never move |
| Canvas | `src/network/GraphCanvas.tsx` | One Cytoscape instance, dynamically imported (own ~138 KB gzip chunk), destroyed on leave |
| Search / details | `NetworkSearch.tsx`, `Details.tsx` | ARIA combobox; node/edge panel; accessible relationship table |
| Page | `src/pages/Network.tsx` | URL state `?c=<PCID>`, filters, toolbar, legend |

No `/api/v1/network` endpoint exists; the RPCs are internal to the site (decided 2026-10-18).

## Edges

Edge ids come from the database, so one record never appears twice:
`cm:<class>:<member>` (class_members), `sc:<child>:<parent>` (class hierarchy), `cs:<statement_id>` (clinical_statements), `co:<id>` (community_statements, off by default, labelled contributor-added). Direction is subject to object as recorded; the page derives "incoming".

Groups (line styles, no colour): classification, composition, use, safety, interaction, lineage. Predicates that map to no group (dosing, definitions, acronyms, pregnancy and lactation guidance) are page properties and are not drawn.

Bounded loading: a neighborhood returns at most 200 edges (default 40, 18 on phones) and pages by offset. Paging is round-robin across groups so a concept's use and safety edges are not buried behind many class memberships.

## Adding a predicate or node kind

1. Predicate: add it to `public.predicates`, add a `when` line in `network_predicate_group()`, add its phrase and definition to `PREDICATES` in `predicates.ts`. `predicates.test.ts` parses the SQL and fails if the two drift.
2. Node kind: add it to `nodeKind()` (shape and border) and its page path to `pagePath()`.

## Honest data limits

- The graph is rich in class memberships (ATC, EPC, MoA, VA, ChemOnt) and FDA `has_component` links, and thin in use, safety, mechanism and interaction statements. Sampled evidence is `curator_assertion` with no stored quotes; the details panel says so rather than filling gaps.
- ChemOnt adds many generic classes; the classification-system chips hide them.
- Totals include contributor-added edges even when they are hidden.
- A line is not a treatment recommendation, and distance on the canvas means nothing. The page says both.

## Deploying (done 2026-10-18; kept for the next migration)

1. Apply `db/phase19_network.sql` as 19a, 19b, 19c (`apply_migration`, or the SQL editor and record by hand). Confirm each in `supabase_migrations.schema_migrations`, then run `get_advisors(security)`; the new functions are intentionally executable by anon.
2. Add the `src/updates.ts` entry when it ships.
3. No new env vars; it uses the existing publishable key.

## Troubleshooting

"Not switched on yet" means the RPC is missing (PGRST202/42883): apply the migration. An empty graph for a PCID means the concept has no drawable relationships in the chosen groups.

## Tests

`src/network/*.test.ts` (model, layout, predicates, api, canvas with a fake Cytoscape) and `src/pages/Network.test.tsx` (jsdom). Real-browser check: Playwright Chromium against `pnpm preview` with the RPC intercepted.

## Future work

Pharmacopoe AI can read the same neighborhood RPC to explain a graph; it must read the record, never write relationships. A public `/v1/network` endpoint, new predicates for mechanism and interaction data, and server-side paging UI for very large classes.
