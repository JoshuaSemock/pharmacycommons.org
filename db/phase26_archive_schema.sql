-- Phase 26: archive schema (applied 2026-11-01)
-- Moves retired staging/import tables and old review queues out of public.
-- Nothing is deleted. archive is not exposed to anon/authenticated or the REST API.
-- class_agent_review stays in public (used by rebuild_classes()).
create schema if not exists archive;
comment on schema archive is 'Retired staging/import and old review-queue tables. Kept for reference; not exposed to the API.';
revoke all on schema archive from anon, authenticated;

alter table public.stg_dictionary_combo     set schema archive;
alter table public.stg_dictionary_combo2    set schema archive;
alter table public.stg_dictionary_frag      set schema archive;
alter table public.stg_dictionary_fraglink  set schema archive;
alter table public.stg_dictionary_gen       set schema archive;
alter table public.stg_dictionary_idx       set schema archive;
alter table public.stg_dictionary_m2        set schema archive;
alter table public.stg_dictionary_match     set schema archive;
alter table public.stg_dictionary_mint      set schema archive;
alter table public.stg_dictionary_raw       set schema archive;
alter table public.stg_name_index           set schema archive;
alter table public.stg_topdrugs_lists       set schema archive;
alter table public.stg_topdrugs_match       set schema archive;
alter table public.stg_topdrugs_rows        set schema archive;
alter table public.class_review_queue       set schema archive;
alter table public.class_agent_skip         set schema archive;

revoke all on all tables in schema archive from anon, authenticated;

-- To bring one back:  alter table archive.<name> set schema public;
