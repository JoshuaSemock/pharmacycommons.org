-- Phase 24a: mirror of live migration 'retire_mpje_controlled_substances_list' (schema_migrations version 20261030171314, applied 2026-10-30).
-- Federal controlled substances table, views and lists (see docs/federal-controlled-substances.md).
drop table if exists public."MPJE relevant drugs" cascade;

delete from public.lists
where pcid = 10000021
  and slug = 'georgia-mpje-controlled-substances';
