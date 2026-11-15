# Schema drift: live (2026-11-14 dump) vs repo db/*.sql

Generated from Backups/2026-11-14_supabase_db/schema_public_archive.sql against db/ at commit 09cd635.

## Real drift

- `public.term_definitions` (table + policy, phase 37): live, but phase37a/37b SQL is only in the local Claude folder, not in the repo.
- `public.legal_status_line` and `public.resolve_property` (phase 26c/26d): db/phase26c_legal_status_line.sql points at the live definitions instead of containing them.
- 15 functions whose newest body in db/ differs from live (later live fixes not written back): `api_entity_content`, `api_entity_document`, `api_snapshot`, `api_snapshot_sweep`, `create_page`, `dictionary_words`, `learn_gen_dnc_reason`, `log_entity_change`, `network_edge_evidence`, `network_edges`, `network_predicate_group`, `norm_ingredient`, `osa_distance`, `resolve_property`, `search_all`.

## Not drift (checker artifacts)

- 16 `archive.*` tables: moved from public by phase26_archive_schema.sql (ALTER ... SET SCHEMA).
- 12 `v_cs_*` views, `moiety_hierarchy`, 26 `public_read` policies and 10 `trg_log_change` triggers: created inside DO blocks / format() loops, which a name scan cannot see.

## Counts

- table: live 101, found by name in db/ 84
- view: live 20, found by name in db/ 8
- matview: live 5, found by name in db/ 4
- function: live 140, found by name in db/ 139
- trigger: live 20, found by name in db/ 10
- policy: live 87, found by name in db/ 61
- function bodies: 139 compared, 124 identical, 15 differ

## Suggested fix

Commit the dump's schema file as `db/baseline/2026-11-14_schema.sql` (the authoritative live schema) plus the phase 37 files, so a rebuild starts from the baseline rather than replaying 90 partial files.
