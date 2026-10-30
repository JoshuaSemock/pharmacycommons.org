-- Phase 24b: mirror of live migration 'create_federal_controlled_substances' (schema_migrations version 20261030171328, applied 2026-10-30).
-- Federal controlled substances table, views and lists (see docs/federal-controlled-substances.md).
create table if not exists public.federal_controlled_substances (
  id             bigint generated always as identity primary key,
  drug_name      text not null,
  brand_names    text,
  control_status text not null
    check (control_status in ('Schedule I','Schedule II','Schedule III','Schedule IV','Schedule V')),
  schedule_num   smallint generated always as (
    case control_status
      when 'Schedule I'   then 1 when 'Schedule II' then 2
      when 'Schedule III' then 3 when 'Schedule IV' then 4
      when 'Schedule V'   then 5 end) stored,
  importance     text not null default 'Low'
    check (importance in ('High','Medium','Low')),
  dea_cscn       integer,
  narcotic       boolean,
  other_names    text,
  source_page    integer,
  pcid           bigint,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint fcs_drug_schedule_uniq unique (drug_name, control_status)
);

create index if not exists fcs_schedule_importance_idx
  on public.federal_controlled_substances (schedule_num, importance);

alter table public.federal_controlled_substances enable row level security;
drop policy if exists "public read" on public.federal_controlled_substances;
create policy "public read" on public.federal_controlled_substances
  for select using (true);
