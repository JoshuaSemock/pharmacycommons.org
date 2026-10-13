-- RECONSTRUCTED 2026-10-13 from the live Supabase catalog (project nenwovhyrdcdkhxzjiiv).
-- Stands in for the lost original of migration 20260922235153 clinical_guidelines.
-- guidelines was NOT dropped by phase 12: entity_guidelines (drug-page guideline links) has an FK to it and
-- references_resources.guideline_id mirrors its 14 rows (CLAUDE.md, References catalog).
-- Run after 01_core_schema_v2.sql and phase8a_history.sql. Idempotent. Rows are not reproduced.

create sequence if not exists public.guidelines_guideline_id_seq;
create table if not exists public.guidelines (
  guideline_id bigint default nextval('public.guidelines_guideline_id_seq'::regclass) not null,
  title text not null,
  short_title text not null,
  organization text not null,
  pub_year integer not null,
  url text not null,
  citation text,
  superseded_by bigint,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint guidelines_pkey PRIMARY KEY (guideline_id),
  constraint guidelines_url_key UNIQUE (url),
  constraint guidelines_pub_year_check CHECK (((pub_year >= 1950) AND (pub_year <= 2100))),
  constraint guidelines_url_check CHECK ((url ~ '^https://'::text))
);
alter sequence public.guidelines_guideline_id_seq owned by public.guidelines.guideline_id;
do $$ begin
  alter table public.guidelines add constraint guidelines_superseded_by_fkey
    FOREIGN KEY (superseded_by) REFERENCES public.guidelines(guideline_id);
exception when duplicate_object then null; end $$;

create table if not exists public.entity_guidelines (
  pcid bigint not null,
  guideline_id bigint not null,
  context text,
  sort_order integer default 100 not null,
  constraint entity_guidelines_pkey PRIMARY KEY (pcid, guideline_id)
);
create index if not exists idx_entity_guidelines_pcid on public.entity_guidelines using btree (pcid, sort_order);
do $$ begin
  alter table public.entity_guidelines add constraint entity_guidelines_guideline_id_fkey
    FOREIGN KEY (guideline_id) REFERENCES public.guidelines(guideline_id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.entity_guidelines add constraint entity_guidelines_pcid_fkey
    FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;
drop trigger if exists trg_log_change on public.entity_guidelines;
create trigger trg_log_change after insert or update or delete on public.entity_guidelines
  for each row execute function public.log_entity_change('pcid', 'guideline_id');

alter table public.guidelines enable row level security;
alter table public.entity_guidelines enable row level security;
do $$ begin
  create policy "public read guidelines" on public.guidelines for select to public using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public read entity_guidelines" on public.entity_guidelines for select to public using (true);
exception when duplicate_object then null; end $$;
