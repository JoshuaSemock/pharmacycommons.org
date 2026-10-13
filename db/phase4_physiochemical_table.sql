-- RECONSTRUCTED 2026-10-13 from the live Supabase catalog (project nenwovhyrdcdkhxzjiiv).
-- Stands in for the lost original of migration 20260920000136 phase4_physiochemical_table.
-- The table is empty in production (CAS Common Chemistry backfill not run). Licence note: rows sourced
-- from CAS Common Chemistry are CC BY-NC 4.0 whatever the platform's CC0 choice (CLAUDE.md, Legal context).
-- Run after 01_core_schema_v2.sql and phase8a_history.sql (needs log_entity_change). Idempotent.

create table if not exists public.physiochemical (
  pcid bigint not null,
  cas_rn text,
  smiles text,
  inchi text,
  inchi_key text,
  molecular_formula text,
  molecular_weight numeric,
  log_kow numeric,
  pka numeric,
  water_solubility_mg_l numeric,
  source text default 'CAS Common Chemistry'::text not null,
  raw jsonb not null,
  fetched_at timestamp with time zone default now() not null,
  constraint physiochemical_pkey PRIMARY KEY (pcid)
);
create index if not exists idx_physiochemical_cas_rn on public.physiochemical using btree (cas_rn);
do $$ begin
  alter table public.physiochemical add constraint physiochemical_pcid_fkey
    FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

drop trigger if exists trg_log_change on public.physiochemical;
create trigger trg_log_change after insert or update or delete on public.physiochemical
  for each row execute function public.log_entity_change('pcid');

alter table public.physiochemical enable row level security;
do $$ begin
  create policy public_read on public.physiochemical for select to public using (true);
exception when duplicate_object then null; end $$;
