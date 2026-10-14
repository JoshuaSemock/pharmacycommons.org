# Seed-data exports (`db/seed/`)

Some curated data existed only in Supabase, with no copy in the repo. If the project were lost or
rebuilt from `db/*.sql`, the schema would come back empty. These files close that gap for the
small, hand-curated class tables. Exported 2026-10-13 from project `nenwovhyrdcdkhxzjiiv`.

| File | Table | Rows | What it is |
| --- | --- | --- | --- |
| `db/seed/class_rules.sql` | `class_rules` | 71 | Name-pattern rules (INN/USAN stems, biologic, natural-product, review groups) read by `rebuild_classes()` |
| `db/seed/class_search_aliases.sql` | `class_search_aliases` | 51 | Curated class abbreviations (ACEi, SSRI, CCB…) that class search resolves to a class PCID |
| `db/seed/class_agent_skip.sql` | `class_agent_skip` | 79 | Entries the classification agent declined to place, with the reason |

## Reloading

Run `db/phase8_class_system.sql` first (it creates the tables), then each seed file in the SQL
editor. Every file is `insert … on conflict (<primary key>) do nothing`, so it is safe to run again
and never overwrites a row that already exists. Values are dollar-quoted (`$v$…$v$`) so regex
backslashes in `class_rules.pattern` and `.exclude` are stored exactly as in the table. After
reloading `class_rules`, run `rebuild_classes()` if class membership should be recomputed.

## How they were checked

Each file was parsed back and compared with the live table: row counts match (71 / 51 / 79), and a
hash over the column values (ordered by primary key) matches the same hash computed in Postgres.
`class_rules` was also compared row by row (all 71 match). Re-export with the same dollar-quoting
approach if the tables change; the files are a snapshot, not a sync.

## Deliberately not exported

- `class_agent_review` (4,860 rows, about 460 KB): the agent's basis, confidence and source for each
  class assignment. It is real provenance and **is not in the repo yet**. It is too large to move
  safely by hand-copying; export it from the SQL editor as CSV
  (`select * from class_agent_review order by member_pcid, class_slug;`) and commit it as
  `db/seed/class_agent_review.csv`, or ask for a loader script.
- `class_review_queue` (3,410 rows): a work list of name and identifiers per PCID; rebuildable from
  `moieties`, so not worth keeping.
- Rebuildable from ingest functions or scripts: `class_members`, `chemont_links`, `rxclass_*`,
  `chemont_terms`, `classyfire_lookup`, `stg_*`.
