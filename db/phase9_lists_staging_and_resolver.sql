-- RECONSTRUCTED 2026-10-13 from the live Supabase catalog (project nenwovhyrdcdkhxzjiiv).
-- Stands in for the lost originals of 20260924233755 lists_staging_top_drugs and
-- 20260925134252 lists_staging_match_table, plus the name-normalising helpers and the stg_name_index
-- table that the phase-10 FDA ingredient resolver depends on (CLAUDE.md: "don't drop stg_name_index
-- without porting that"). All objects here are staging: tables have RLS on and no policy (service role only).
-- Idempotent. Rows are not reproduced.

create table if not exists public.stg_name_index (
  nn text,
  pcid bigint,
  pref integer,
  entity_type text
);
create index if not exists stg_name_index_nn on public.stg_name_index using btree (nn);

create table if not exists public.stg_topdrugs_rows (
  row_no integer not null,
  drug_name text not null,
  brand_names text,
  avg_patients numeric,
  legal_status text,
  category text,
  notable_rank integer,
  condensed_from text,
  memberships jsonb default '[]'::jsonb not null,
  constraint stg_topdrugs_rows_pkey PRIMARY KEY (row_no)
);
create table if not exists public.stg_topdrugs_lists (
  col integer not null,
  header text not null,
  source text,
  constraint stg_topdrugs_lists_pkey PRIMARY KEY (col)
);
create table if not exists public.stg_topdrugs_match (
  row_no integer not null,
  norm text not null,
  pcid bigint,
  basis text,
  n_candidates integer,
  note text,
  constraint stg_topdrugs_match_pkey PRIMARY KEY (row_no)
);
do $$ begin
  alter table public.stg_topdrugs_match add constraint stg_topdrugs_match_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.stg_topdrugs_match add constraint stg_topdrugs_match_row_no_fkey FOREIGN KEY (row_no) REFERENCES public.stg_topdrugs_rows(row_no);
exception when duplicate_object then null; end $$;

alter table public.stg_name_index enable row level security;
alter table public.stg_topdrugs_rows enable row level security;
alter table public.stg_topdrugs_lists enable row level security;
alter table public.stg_topdrugs_match enable row level security;

create or replace function public.stg_norm_name(t text)
 returns text
 language sql
 immutable
as $function$
  select nullif(trim(regexp_replace(regexp_replace(regexp_replace(lower(t), '\s*[/;]\s*', '/', 'g'), '\s+', ' ', 'g'), '\s*-\s*$', '')), '')
$function$;

create or replace function public.stg_strip_qual(t text)
 returns text
 language sql
 immutable
as $function$
  select nullif(trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(t,
    '\s*\([^)]*\)', '', 'g'),                                   -- parentheticals
    ',?\s+(including|and) its .*$|,\s*including .*$', ''),      -- ", including its salts..." / "and its salts..."
    '\s+(topical|nasal|ophthalmic|otic|oral|iv|resin|solution topical|in oral solution|in sesame oil)$', ''),
    ',\s*micronized$', '')), '')
$function$;

create or replace function public.stg_strip_salt(t text)
 returns text
 language sql
 immutable
as $function$
  select nullif(trim(regexp_replace(t, '\s+(hydrochloride|dihydrochloride|sodium|potassium|calcium|bitartrate|tartrate|fumarate|disoproxil fumarate|mesylate|sulfate|acetate|maleate|citrate|besylate|succinate|phosphate)$', '')), '')
$function$;
