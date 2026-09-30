-- db/phase12a_references_resources.sql
-- Phase 12: one table for the References and Resources pages.
--
-- Replaces the hard-coded src/sources.ts (References) and src/resources.ts (Resources).
-- /references lists every row, grouped by reference_section.
-- /resources lists rows grouped by headers, except headers = 'Source datasets'.
--
-- public.guidelines is NOT dropped: entity_guidelines (drug-page guideline links)
-- has a foreign key to it. Its 14 rows are also rows here, linked by guideline_id.
-- Retiring guidelines means repointing entity_guidelines first (separate decision).
--
-- Seed data: db/phase12b_references_resources_seed.sql.

create table if not exists public.references_resources (
  id                text primary key,            -- stable slug; also the BibTeX key
  sort_order        integer not null default 0,  -- curated order within a group
  name              text not null,               -- display name
  subtitle          text,                        -- formal title when it differs from name
  href              text not null,
  organization      text,                        -- publisher / maintainer
  pub_year          integer,
  description       text,
  type_badge        text,                        -- e.g. 'External database', 'Clinical calculator'
  license_badge     text,                        -- e.g. 'CC0 1.0', 'CC BY-NC 4.0', 'US public domain'
  badges            text[],                      -- region / access notes: 'International', 'Free registration'
  headers           text not null,               -- /resources group; 'Source datasets' rows are omitted there
  reference_section text not null,               -- /references group
  commons_use       text,                        -- what this source feeds in Pharmacy Commons
  version           text,
  current_as_of     date,
  download_url      text,
  citation_text     text,                        -- free-text citation as supplied (fallback / journal reference)
  cite              jsonb,                       -- structured citation for src/cite.ts (kind 'web' | 'article')
  guideline_id      bigint unique references public.guidelines (guideline_id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint references_resources_href_http check (href ~ '^https?://'),
  constraint references_resources_cite_kind check (cite is null or cite->>'kind' in ('web', 'article'))
);

comment on table public.references_resources is
  'Citations and outside links shown on /references (all rows) and /resources (headers <> ''Source datasets''). Phase 12.';

create index if not exists idx_ref_res_headers on public.references_resources (headers);
create index if not exists idx_ref_res_ref_section on public.references_resources (reference_section);

-- updated_at maintenance
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists references_resources_set_updated_at on public.references_resources;
create trigger references_resources_set_updated_at
  before update on public.references_resources
  for each row execute function public.set_updated_at();

-- RLS: public read, no public writes
alter table public.references_resources enable row level security;

drop policy if exists "public read references_resources" on public.references_resources;
create policy "public read references_resources"
  on public.references_resources
  for select
  to anon, authenticated
  using (true);

revoke all on public.references_resources from anon, authenticated;
grant select on public.references_resources to anon, authenticated;
