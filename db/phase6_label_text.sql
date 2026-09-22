-- Phase 6 — readable FDA label text for the Clinical tab
-- Applied to Supabase project nenwovhyrdcdkhxzjiiv on 2026-09-22 (migrations:
-- label_text_cache_and_canonical_labels, entity_label_rank_v3_null_safe,
-- label_fetch_log_parser_version, enable_pg_net, entity_label_rank_revoke_api).
-- Kept here so the repo matches the database. Safe to re-run.

create index if not exists idx_ldf_pcid on public.label_document_formulations (pcid);

-- One row per label the edge function has fetched from openFDA
create table if not exists public.label_fetch_log (
  setid              text primary key,
  status             text not null check (status in ('ok','not_found','error')),
  source             text not null default 'openfda',
  application_number text,
  brand_name         text,
  generic_name       text,
  source_effective   text,
  error_detail       text,
  parser_version     int  not null default 0,  -- rows below the function's PARSER_VERSION are re-parsed on next view
  fetched_at         timestamptz not null default now()
);

-- Readable section text. blocks = [{heading?, text}]; text uses "\n• " bullets and
-- "[[TABLE:i]]" lines pointing into tables_html = [{inline, html}]
create table if not exists public.label_section_text (
  setid         text not null references public.label_fetch_log(setid) on delete cascade,
  section_key   text not null,
  loinc_code    text,
  title         text not null,
  display_order int  not null,
  blocks        jsonb not null,
  tables_html   jsonb,
  primary key (setid, section_key)
);
create index if not exists idx_lst_setid_order on public.label_section_text (setid, display_order);

alter table public.label_fetch_log    enable row level security;
alter table public.label_section_text enable row level security;
drop policy if exists "public read label_fetch_log" on public.label_fetch_log;
drop policy if exists "public read label_section_text" on public.label_section_text;
create policy "public read label_fetch_log"    on public.label_fetch_log    for select to anon, authenticated using (true);
create policy "public read label_section_text" on public.label_section_text for select to anon, authenticated using (true);
-- no write policies: only the edge function (service role) writes

-- Best labels per entity, top 5:
--   1. single-ingredient label for a single entity (multi-ingredient for combinations)
--   2. current PLR format ("Highlights") over old format
--   3. manufacturer over repackager/relabeler
--   4. newest effective_time
-- Refresh after label loads:  refresh materialized view concurrently public.entity_label_rank;
drop materialized view if exists public.entity_label_rank;
create materialized view public.entity_label_rank as
with doc_act as (
  select ld.setid, count(distinct ai->>'active_moiety_unii') as n_active_moieties
  from public.label_documents ld
  cross join lateral jsonb_array_elements(coalesce(ld.products_json,'[]'::jsonb)) p
  cross join lateral jsonb_array_elements(coalesce(p->'active_ingredients','[]'::jsonb)) ai
  where ai->>'kind' = 'active'
  group by ld.setid
), base as (
  select ldf.pcid, e.entity_type, ld.setid, ld.title, ld.labeler, ld.effective_time, ld.document_type_display,
         coalesce(da.n_active_moieties, 0) as n_active_moieties,
         coalesce(ld.title,'') ilike 'these highlights%'
           or coalesce(ld.document_type_display,'') ~* '(highlight|plr)' as is_plr,
         coalesce(ld.labeler,'') ~* '(repack|a-s medication|nucare|blenheim|proficient rx|bryant ranch|direct[_ -]?rx|preferred pharmaceuticals|quality care|pd-rx|aphena|henry schein|lake erie medical|st\.? mary|rebel distributors|medsource|unit dose|american health packaging|major pharmaceuticals|cardinal health|mckesson|golden state medical|aidarex|denton pharma|northwind|asclemed|enovachem|coupler|advanced rx|lifestar|safecor|chartwell rx|marlex|avkare|avpak|readymeds|clinical solutions wholesale|keltman|altura|state of florida doh|dispensing solutions|physicians total care|stat rx|legacy pharmaceutical packaging|contract pharmacy services|h\.j\. harkins|sky packaging|precision dose|atlantic biologicals|medvantx|medical purchasing solutions|nubratori|quallent)' as is_repackager
  from public.label_document_formulations ldf
  join public.entities e         on e.pcid = ldf.pcid
  join public.label_documents ld on ld.setid = ldf.setid
  left join doc_act da           on da.setid = ld.setid
), ranked as (
  select b.*,
         row_number() over (
           partition by pcid
           order by
             case when entity_type = 'combination' then n_active_moieties > 1
                  else n_active_moieties = 1 end desc,
             is_plr desc,
             is_repackager asc,
             effective_time desc nulls last,
             setid
         ) as rnk,
         count(*) over (partition by pcid) as n_labels
  from base b
)
select * from ranked where rnk <= 5;

create unique index entity_label_rank_pk on public.entity_label_rank (pcid, rnk);
-- Not exposed over the Data API; the edge function reads it with the service role.
revoke select on public.entity_label_rank from anon, authenticated;

-- pg_net: only used to smoke-test the edge function from SQL; not needed at runtime.
create extension if not exists pg_net with schema extensions;
