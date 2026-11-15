-- phase37a: third-party term definitions (MedlinePlus "Definitions of Health Terms").
-- One row per (PCID, source page) so every definition keeps its own provenance.
create table public.term_definitions (
  id bigint generated always as identity primary key,
  pcid bigint not null references public.entities(pcid) on delete cascade,
  definition text not null check (length(btrim(definition)) > 0),
  reference text not null,
  reference_url text,
  source_key text not null references public.data_sources(source_key),
  source_title text not null,
  source_page_url text not null,
  source_last_updated date,
  created_at timestamptz not null default now(),
  unique (pcid, source_page_url)
);
create index term_definitions_pcid_idx on public.term_definitions(pcid);
alter table public.term_definitions enable row level security;
create policy public_read on public.term_definitions for select to public using (true);
comment on table public.term_definitions is 'Third-party definitions of health terms, kept apart from page_content (CC BY-SA community text). reference/reference_url name the originating NIH institute; source_* identify the MedlinePlus file. Licence comes from data_sources.source_key. Phase 37.';
insert into public.data_sources(source_key, name, publisher, url, license, terms_url, kind, note) values
('medlineplus','MedlinePlus Definitions of Health Terms','National Library of Medicine (NIH)','https://medlineplus.gov/xml.html','Public domain (U.S. Government work); acknowledge "Source: MedlinePlus, National Library of Medicine"','https://medlineplus.gov/about/using/usingcontent/','external','Text only; MedlinePlus images and some licensed content are copyrighted and are not used here.');
