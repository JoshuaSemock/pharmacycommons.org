-- RECONSTRUCTED 2026-10-13 from the live Supabase catalog (project nenwovhyrdcdkhxzjiiv).
-- Stands in for the lost originals of migration 20260919235757 phase4_fda_ingestion_tables, and also
-- carries the label tables (label_documents / label_sections / label_document_formulations) whose creating
-- migration is not in db/ (their data came from the DailyMed load; text cache is db/phase6_label_text.sql).
-- Current shape: fda_applications.pcid / fda_products.pcid were filled by phase 10 (10a–10e).
-- Run after 01_core_schema_v2.sql. Idempotent.
-- Load order for data: fda_applications before fda_products.

create table if not exists public.fda_applications (
  appl_no text not null,
  application_type text,
  sponsor_name text,
  pcid bigint,
  raw jsonb not null,
  fetched_at timestamp with time zone default now() not null,
  constraint fda_applications_pkey PRIMARY KEY (appl_no)
);
create index if not exists idx_fda_applications_pcid on public.fda_applications using btree (pcid);
do $$ begin
  alter table public.fda_applications add constraint fda_applications_pcid_fkey
    FOREIGN KEY (pcid) REFERENCES public.entities(pcid);
exception when duplicate_object then null; end $$;

create table if not exists public.fda_products (
  product_id text not null,
  appl_no text not null,
  product_no text,
  ndc text,
  brand_name text,
  generic_name text,
  dosage_form text,
  route text,
  marketing_status text,
  pcid bigint,
  raw jsonb not null,
  fetched_at timestamp with time zone default now() not null,
  constraint fda_products_pkey PRIMARY KEY (product_id)
);
create index if not exists idx_fda_products_appl_no on public.fda_products using btree (appl_no);
create index if not exists idx_fda_products_ndc on public.fda_products using btree (ndc);
create index if not exists idx_fda_products_pcid on public.fda_products using btree (pcid);
do $$ begin
  alter table public.fda_products add constraint fda_products_appl_no_fkey
    FOREIGN KEY (appl_no) REFERENCES public.fda_applications(appl_no) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.fda_products add constraint fda_products_pcid_fkey
    FOREIGN KEY (pcid) REFERENCES public.entities(pcid);
exception when duplicate_object then null; end $$;

-- ─── DailyMed label structure ────────────────────────────────────────────────
create table if not exists public.label_documents (
  setid text not null,
  document_id text,
  document_type_loinc text,
  document_type_display text,
  version_number text,
  effective_time text,
  title text,
  labeler text,
  unii_rollup text[],
  n_products integer,
  products_json jsonb,
  constraint label_documents_pkey PRIMARY KEY (setid)
);

create sequence if not exists public.label_sections_id_seq;
create table if not exists public.label_sections (
  id bigint default nextval('public.label_sections_id_seq'::regclass) not null,
  setid text not null,
  section_order integer not null,
  loinc_code text,
  loinc_display text,
  title text,
  parent_loinc_code text,
  parent_title text,
  effective_time text,
  constraint label_sections_pkey PRIMARY KEY (id)
);
alter sequence public.label_sections_id_seq owned by public.label_sections.id;
create index if not exists idx_label_sections_setid on public.label_sections using btree (setid);
create index if not exists idx_label_sections_loinc on public.label_sections using btree (loinc_code);
do $$ begin
  alter table public.label_sections add constraint label_sections_setid_fkey
    FOREIGN KEY (setid) REFERENCES public.label_documents(setid) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

create table if not exists public.label_document_formulations (
  setid text not null,
  pcid bigint not null,
  match_basis text not null,
  constraint label_document_formulations_pkey PRIMARY KEY (setid, pcid)
);
create index if not exists idx_ldf_pcid on public.label_document_formulations using btree (pcid);
do $$ begin
  alter table public.label_document_formulations add constraint label_document_formulations_pcid_fkey
    FOREIGN KEY (pcid) REFERENCES public.entities(pcid);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.label_document_formulations add constraint label_document_formulations_setid_fkey
    FOREIGN KEY (setid) REFERENCES public.label_documents(setid) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

-- RLS: public read; writes only via service role (Edge Functions)
do $$
declare t text;
begin
  foreach t in array array['fda_applications','fda_products','label_documents','label_sections','label_document_formulations'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='public_read') then
      execute format('create policy public_read on public.%I for select to public using (true)', t);
    end if;
  end loop;
end $$;
