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

Lists (v3, 2026-11-03, `db/phase31a_network_lists.sql`): see "Lists" below.

No `/api/v1/network` endpoint exists; the RPCs are internal to the site (decided 2026-10-18).

## Edges

Edge ids come from the database, so one record never appears twice:
`cm:<class>:<member>` (class_members), `sc:<child>:<parent>` (class hierarchy), `cs:<statement_id>` (clinical_statements), `co:<id>` (community_statements, off by default, labelled contributor-added), `li:<list>:<member>` (list_items). Direction is subject to object as recorded; the page derives "incoming".

`li:<list_pcid>:<member_pcid>` (list_items, v3).

Groups (line styles, no colour): classification, composition, use, safety, interaction, lists, lineage. Predicates that map to no group (dosing, definitions, acronyms, pregnancy and lactation guidance) are page properties and are not drawn.

Bounded loading: a neighborhood returns at most 200 edges (default 40, 18 on phones) and pages by offset. Paging is round-robin across groups so a concept's use and safety edges are not buried behind many class memberships.

## Lists (v3, 2026-11-03)

A record is linked to every **published** list it is an entry on; a list opened as the centre links to its entries. Applied as `phase31a_network_lists_group`, `phase31b_network_lists_neighborhood`, `phase31c_network_lists_evidence` (20261103144236 / 254 / 307).

- `on_list` is **derived** from `list_items` (like `member_of` from `class_members`). It is not a row in `public.predicates` and nothing is written to `clinical_statements`. Lists stay separate from classes (decisions.md, Lists): their own group (`lists`, dotted line), node kind (`list`, barrel shape) and page (`/lists/:slug`).
- Entries with no member PCID (dictionary terms, 19 rows) are skipped. A list that repeats a drug yields one edge. Sub-lists (e.g. Anticholinergic Burden: Score 3) are separate lists with separate edges; the parent list also lists the drug.
- Evidence (`network_edge_evidence('li:…')`) returns the list, its source citation, URL and license, and the entry's rank, value (labelled by the list's `measure_label`), status and note.
- The Network search offers lists as start points (`searchConcepts`). Pages link in with `src/components/NetworkLink.tsx` ("View in Network"), in the page header under the title: drug, concept and INN pages, class pages and list pages.
- Not included: `list_items.component_pcid` (a brand-name entry pointing at its generic). A drug does not yet show the Brand Names list through its brands.
- Large lists (722 entries on Federal Controlled Substances) are paged by the usual round-robin cap; members sort alphabetically, not by rank.
- First page of a drug that is on many lists shows only one list edge before use/safety edges in the round-robin; use the Lists filter chip for the rest.

## Hub paging, non-core filter and evidence sources (v4, 2026-11-03)

`db/phase32a_network_hubs.sql`, applied as `phase32a_1/2/3_*`:

- **`network_edges(pcid, include_community)`** is the one place every edge kind is unioned; `network_neighborhood()` now reads it. Edges and group counts for four concepts (acetazolamide, metformin, oxybutynin, lidocaine) hashed identically before and after. Add a new edge source there, once.
- **`network_relations(pcid, groups, include_community, query, limit, offset)`** is the table-style read for hubs: alphabetical by the other concept's name, filtered by group and by name (`ilike`, wildcards escaped), `total` after the filters, `group_counts` before them. The graph keeps its round-robin read; this is for browsing a class with thousands of members. Client: `fetchRelations` and `src/network/RelationsBrowser.tsx`, opened from "Browse all N" in the node details. Rows are added to the graph one at a time or a page at a time (`addRelations` in `model.ts`); they hang under the browsed concept, so Collapse removes them, and its "shown of total" counter is untouched because these rows were chosen by name, not by the round-robin order.
- **Non-core moieties.** Nodes now carry `term_type` (moieties only). The flag is the existing `moieties.term_type`; "non-core" means any value other than `Core moiety` (69 rows after phase 25a). The filter chip "Non-core moiety records (N)" appears only when such a node is on the graph, is **on by default** (nothing is hidden unasked), and never hides the starting concept. Hiding them from search and browse is a separate, still-open task.
- **Evidence sources.** `network_edge_evidence()` adds `source` to clinical statements, resolved from `data_sources` and, for `Drugs@FDA appl …` documents, `fda_applications` (application type and number, sponsor, and a link to that application on Drugs@FDA). Nothing is synthesised: the 6,443 FDA and 334 Pharmacy Commons composition statements have a source record but no quotation, and the panel says "Only the source record is stored … not its wording". 105 curator assertions have no resolvable source and still show only what they carry. Real quotations would need a separate ingest of label text; the 147 `fda_table_pgx` rows already have them.

## Compare (v5, 2026-11-03)

`/network/compare?c=<pcid>,<pcid>[,…]` (two to four concepts; `src/pages/NetworkCompare.tsx`, model in `src/network/compare.ts`) shows what the compared concepts share and what only one of them has. Entry points: "Compare with…" in the node details, "compare" in the Network intro, header search ("Compare in Network").

`db/phase32b_network_compare.sql` (applied as `phase32b_network_compare`): `network_compare(pcids, include_community, members, limit, offset)` reads every concept's edges through `network_edges()` and turns them inside out, so each *other* concept knows which compared concepts link to it. A **set** is one distinct group of linking concepts (in common to all, shared by some, only X). The result is summarised by set (`sets`: size and a count per relationship group) and returns a capped number of rows per set; passing `members` pages one set (alphabetical within group order). Links between the compared concepts themselves come back as `between`. Fewer than two or more than four distinct PCIDs return null.

- **What "shared" means.** Two concepts point at the same other concept (the same class, list, product or condition). It does not mean the statements agree: each row keeps every concept's own predicate, direction, inherited flag and source, and the table says so. Absence is absence from the database, and the page says that too.
- **Brands.** The picker uses the same search as the Network, which resolves a brand to the drug it contains (Jardiance compares as empagliflozin) and says so. A formulation PCID in the URL is compared as itself.
- **Cost.** Checked live: metformin vs empagliflozin vs acetazolamide 44 ms; the two largest classes (6,817 and 5,904 members) 0.47 s and a 62 KB first page. Paging a set repeats the computation.
- **Graph.** "Show as a graph" draws the compared concepts, every concept loaded so far and the lines between them, through the same `GraphCanvas`. Shared concepts are the ones with lines to more than one compared concept. It is built from the loaded rows, so load more of a set to see more of it.
- Contributor-added relationships are off unless ticked.

## Adding a predicate or node kind

1. Predicate: add it to `public.predicates`, add a `when` line in `network_predicate_group()`, add its phrase and definition to `PREDICATES` in `predicates.ts`. `predicates.test.ts` parses the SQL and fails if the two drift.
2. Node kind: add it to `nodeKind()` (shape and border) and its page path to `pagePath()`.

## Display, depth and physics (v2)

Modelled on Obsidian's local graph; no database changes.

- `display.ts`: Display settings (arrows, size by connections, hover focus, text fade, line width, physics, repel, line length), sanitised and kept per reader in localStorage `pc.network.display`.
- `depth.ts`: depth slider 1 to 3. Depth is the `introducedBy` chain from the start. Deeper levels load `DEEP_PAGE` (8) relationships per concept, use and safety lines before class memberships, and stop at `NODE_CAP` (150) concepts with a note. Going shallower prunes and fetches nothing; expanding a concept by hand raises the slider.
- `physics.ts`: dependency-free force simulation, off by default. Drag pins a concept, double-tap pins or releases it (pinned = dashed border), Tree layout turns it off, above 300 concepts it holds still, reduced motion settles it at once.
- Hover focus fades non-neighbors. Closeness on the canvas still means nothing, and the page says so.

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

Compare: a combined group filter across all sets, saving a comparison as a list, comparing a brand formulation's own record against a generic, and mechanism or interaction predicates between the compared concepts once they are loaded. Pharmacopoe AI can read the same neighborhood RPC to explain a graph; it must read the record, never write relationships. Entry rank/score ordering for a list's own graph, brand entries via `component_pcid`, a public `/v1/network` endpoint, new predicates for mechanism and interaction data. Quotations for FDA composition statements would need label text ingested per statement.
