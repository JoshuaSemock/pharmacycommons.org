-- Phase 7 — brand names (Drugs@FDA + RxNorm) for drug pages and search
-- Applied to Supabase project nenwovhyrdcdkhxzjiiv on 2026-09-22 (final state: v5).
-- v4: salt-form moiety rows map to their own brands; RxNorm pass 2 covers non-core rows
--     and falls back PIN → IN when RxNorm files brands only under the base ingredient.
-- v5: pass-2 rows that share an RxNorm ingredient with another entity (ester/duplicate
--     rows such as hydrocortisone cypionate) no longer inherit the parent's brands.
--
-- Data loads (not in this file):
--   * fda_applications / fda_products  ← openFDA /drug/drugsfda, NDA + BLA only
--     (supabase/functions/drugsfda-ingest; 6,372 applications, 12,261 products)
--   * rxnorm_lookup / rxnorm_brands     ← RxNav REST, UNII → ingredient → brand names (TTY=BN)
--     (supabase/functions/rxnorm-brands)
-- After reloading either, run:
--   refresh materialized view public.ingredient_moiety_map;
--   refresh materialized view concurrently public.entity_brand_names;

-- ── One-time tokens for the loader functions (service role only) ─────────────
create table if not exists public.ingest_tokens (
  name text primary key,
  token text not null,
  created_at timestamptz not null default now()
);
alter table public.ingest_tokens enable row level security;
revoke all on public.ingest_tokens from anon, authenticated;
-- To run a loader: insert a token, call the function with header x-ingest-token, then delete the row.


-- ── Ingredient name → moiety ─────────────────────────────────────────────────
-- "METFORMIN HYDROCHLORIDE" → metformin. Candidates, best first:
--   1 core moiety base_name, 2 salt-form row's own name ("CLOBETASOL PROPIONATE"),
--   3 salt-form row's base name when no core row claims it, 4 FDA label active-moiety
--   UNIIs (label_documents.products_json), 5 precise forms linked in moiety_hierarchy.
-- Names that are ambiguous at their best priority are dropped.
drop materialized view if exists public.ingredient_moiety_map cascade;
create materialized view public.ingredient_moiety_map as
with core as (
  select pcid, upper(trim(base_name)) as base, unii
  from public.moieties
  where term_type = 'Core moiety' and base_name is not null
), salt_rows as (
  select m.pcid, upper(trim(e.name)) as own_name, upper(trim(m.base_name)) as base
  from public.moieties m join public.entities e using (pcid)
  where m.term_type is distinct from 'Core moiety'
), spl as (
  select upper(trim(ai->>'name')) as ingredient, c.pcid
  from public.label_documents ld
  cross join lateral jsonb_array_elements(coalesce(ld.products_json, '[]')) p
  cross join lateral jsonb_array_elements(coalesce(p->'active_ingredients', '[]')) ai
  join core c on c.unii = ai->>'active_moiety_unii'
  where ai->>'kind' = 'active' and ai->>'name' is not null
  group by 1, 2
), cands as (
  select base as ingredient, pcid, 1 as priority from core
  union all select own_name, pcid, 2 from salt_rows
  union all select s.base, s.pcid, 3 from salt_rows s
            where s.base is not null and not exists (select 1 from core c where c.base = s.base)
  union all select ingredient, pcid, 4 from spl
  union all
  select upper(trim(pf.base_name)), mh.moiety_pcid, 5
  from public.moiety_hierarchy mh
  join public.precise_forms pf on pf.pcid = mh.member_pcid
  where mh.relation = 'precise_form' and pf.base_name is not null
), ranked as (
  select ingredient, pcid, min(priority) as priority,
         count(*) over (partition by ingredient, min(priority)) as n_at_priority
  from cands where ingredient is not null group by ingredient, pcid
), best as (
  select distinct on (ingredient) ingredient, pcid, priority, n_at_priority
  from ranked order by ingredient, priority
)
select ingredient, pcid as moiety_pcid,
       case priority when 1 then 'moiety_name' when 2 then 'salt_row_name' when 3 then 'salt_row_base'
                     when 4 then 'spl_active_moiety' else 'precise_form' end as basis
from best where n_at_priority = 1;
create unique index if not exists ingredient_moiety_map_pk on public.ingredient_moiety_map (ingredient);
revoke select on public.ingredient_moiety_map from anon, authenticated;

-- "AMPICILLIN/AMPICILLIN TRIHYDRATE" → "AMPICILLIN", "INSULIN LISPRO RECOMBINANT" → "INSULIN LISPRO",
-- "TOCILIZUMAB-ANOH" → "TOCILIZUMAB", "DABIGATRAN ETEXILATE MESYLATE" → "DABIGATRAN ETEXILATE"
create or replace function public.norm_ingredient(raw text, strip_all boolean default false)
returns text language plpgsql immutable set search_path = '' as $$
declare
  s text := upper(trim(raw));
  salt text := '\s+(HYDROCHLORIDE|HCL|HYDROBROMIDE|DIHYDROCHLORIDE|SULFATE|SULPHATE|BISULFATE|MALEATE|PHOSPHATE|SODIUM|DISODIUM|POTASSIUM|CALCIUM|MAGNESIUM|ZINC|CITRATE|TARTRATE|BITARTRATE|SUCCINATE|MESYLATE|DIMESYLATE|FUMARATE|HEMIFUMARATE|ACETATE|BESYLATE|BENZOATE|GLUCONATE|LACTATE|NITRATE|OXALATE|PALMITATE|PAMOATE|DECANOATE|ENANTHATE|VALERATE|PROPIONATE|DIPROPIONATE|LAUROXIL|TOSYLATE|XINAFOATE|BROMIDE|CHLORIDE|IODIDE|ANHYDROUS|MONOHYDRATE|DIHYDRATE|TRIHYDRATE|HEMIHYDRATE|SESQUIHYDRATE|HEPTAHYDRATE|HYDRATE|MONOSODIUM|TROMETHAMINE|MEGLUMINE|LYSINE|ARGININE|CYPIONATE|HYCLATE|ESTOLATE|STEARATE|ETHYLSUCCINATE|FUROATE|PIVALATE|UNDECANOATE|RECOMBINANT|SYNTHETIC|ETEXILATE|MEDOXOMIL|AXETIL|PIVOXIL|PROXETIL|ALAFENAMIDE|DISOPROXIL|MARBOXIL)$';
  i int;
begin
  if s is null then return null; end if;
  if position('/' in s) > 0 and split_part(s, '/', 2) like split_part(s, '/', 1) || '%' then
    s := split_part(s, '/', 1);
  end if;
  s := regexp_replace(s, '-[A-Z]{4}$', '');            -- biosimilar suffix
  for i in 1..3 loop
    exit when not (s ~ salt);
    if not strip_all and i > 1 and s ~ '\s+(ETEXILATE|MEDOXOMIL|AXETIL|PIVOXIL|PROXETIL|ALAFENAMIDE|DISOPROXIL|MARBOXIL)$' then exit; end if;
    s := regexp_replace(s, salt, '');
  end loop;
  return trim(s);
end $$;

-- ── RxNorm results ────────────────────────────────────────────────────────────
create table if not exists public.rxnorm_lookup (
  pcid        bigint primary key references public.entities(pcid) on delete cascade,
  unii        text,
  rxcui       text,              -- RxNorm ingredient concept, null if not in RxNorm
  status      text not null,     -- ok | not_found | error
  n_brands    int not null default 0,
  detail      text,
  fetched_at  timestamptz not null default now()
);
create table if not exists public.rxnorm_brands (
  pcid              bigint not null references public.entities(pcid) on delete cascade,
  brand             text not null,        -- RxNorm casing, e.g. "Glucophage"
  brand_rxcui       text not null,
  ingredient_rxcuis text[] not null,      -- >1 = combination brand
  fetched_at        timestamptz not null default now(),
  primary key (pcid, brand_rxcui)
);
create index if not exists rxnorm_lookup_rxcui on public.rxnorm_lookup (rxcui);
alter table public.rxnorm_lookup enable row level security;
alter table public.rxnorm_brands enable row level security;
drop policy if exists "public read rxnorm_brands" on public.rxnorm_brands;
create policy "public read rxnorm_brands" on public.rxnorm_brands for select to anon, authenticated using (true);

-- pass 1 = original UNII/name lookup of core moieties; pass 2 = salt-form rows (may fall back PIN → IN)
alter table public.rxnorm_lookup add column if not exists pass smallint not null default 1;

-- Rows still to look up: core moieties first, then salt-form / other moiety rows.
create or replace function public.rxnorm_todo(p_limit int)
returns table (pcid bigint, unii text, base_name text)
language sql stable security definer set search_path = public as $$
  select m.pcid, m.unii, m.base_name
  from moieties m
  where m.unii is not null
    and not exists (select 1 from rxnorm_lookup l where l.pcid = m.pcid)
  order by (m.term_type = 'Core moiety') desc, m.pcid
  limit p_limit
$$;
revoke execute on function public.rxnorm_todo(int) from public, anon, authenticated;
grant execute on function public.rxnorm_todo(int) to service_role;

-- ── Brand names per moiety / combination ─────────────────────────────────────
-- Drugs@FDA NDA/BLA products and RxNorm brand names, matched to our entities by
-- ingredient set; single-ingredient brands go to the moiety, multi-ingredient brands
-- to the combination entity with exactly those moieties. Brands that are just the
-- generic name are dropped. Workbook primary_brand values are kept as 'drug_matrix'.
drop materialized view if exists public.entity_brand_names cascade;
create materialized view public.entity_brand_names as
with fda_ing as (
  select p.product_id, p.appl_no, upper(trim(p.brand_name)) as brand, p.marketing_status,
         upper(trim(ai->>'name')) as ingredient
  from public.fda_products p
  cross join lateral jsonb_array_elements(coalesce(p.raw->'active_ingredients', '[]')) ai
  where p.brand_name is not null and p.appl_no ~ '^(NDA|BLA)'
), fda_mapped as (
  select fi.*, coalesce(m1.moiety_pcid, m2.moiety_pcid, m3.moiety_pcid) as moiety_pcid
  from fda_ing fi
  left join public.ingredient_moiety_map m1 on m1.ingredient = fi.ingredient
  left join public.ingredient_moiety_map m2 on m1.moiety_pcid is null and m2.ingredient = public.norm_ingredient(fi.ingredient)
  left join public.ingredient_moiety_map m3 on m1.moiety_pcid is null and m2.moiety_pcid is null
                                           and m3.ingredient = public.norm_ingredient(fi.ingredient, true)
), fda_products_mapped as (
  select product_id, appl_no, brand, marketing_status,
         array_agg(distinct moiety_pcid order by moiety_pcid) filter (where moiety_pcid is not null) as moieties,
         count(*) filter (where moiety_pcid is null) as unmapped
  from fda_mapped group by product_id, appl_no, brand, marketing_status
), fda_by_set as (
  select moieties, brand,
         bool_or(marketing_status in ('Prescription', 'Over-the-counter')) as marketed,
         array_agg(distinct appl_no order by appl_no) as appl_nos
  from fda_products_mapped
  where unmapped = 0 and moieties is not null
  group by moieties, brand
), rx_in as (          -- one entity per RxNorm ingredient: pass 1 first, then core rows
  select distinct on (l.rxcui) l.rxcui, l.pcid
  from public.rxnorm_lookup l join public.moieties m using (pcid)
  where l.status = 'ok' and l.rxcui is not null
  order by l.rxcui, l.pass, (m.term_type = 'Core moiety') desc, l.pcid
), rx_single as (      -- pass-2 rows that share an ingredient with another entity get none
  select array[rb.pcid] as moieties, min(rb.brand) as brand_display, min(rb.brand_rxcui) as brand_rxcui
  from public.rxnorm_brands rb
  where cardinality(rb.ingredient_rxcuis) = 1
    and not exists (select 1 from public.rxnorm_lookup l1
                    join public.rxnorm_lookup l2 on l2.rxcui = l1.rxcui and l2.pcid <> l1.pcid and l2.status = 'ok'
                    where l1.pcid = rb.pcid and l1.pass = 2)
  group by rb.pcid, upper(rb.brand)
), rx_multi as (
  select distinct on (rb.brand_rxcui) rb.brand_rxcui, rb.brand as brand_display,
         (select array_agg(distinct ri.pcid order by ri.pcid)
            from unnest(rb.ingredient_rxcuis) x(rxcui) join rx_in ri using (rxcui)) as moieties,
         cardinality(rb.ingredient_rxcuis) as n_ingredients
  from public.rxnorm_brands rb
  where cardinality(rb.ingredient_rxcuis) > 1
), rx_ok as (
  select moieties, brand_display, brand_rxcui from rx_single
  union all
  select moieties, brand_display, brand_rxcui from rx_multi where cardinality(moieties) = n_ingredients
), merged as (
  select coalesce(f.moieties, r.moieties) as moieties,
         coalesce(upper(r.brand_display), f.brand) as brand_key,
         r.brand_display, f.marketed, coalesce(f.appl_nos, '{}') as appl_nos, r.brand_rxcui,
         array_remove(array[case when f.brand is not null then 'drugsfda' end,
                            case when r.brand_rxcui is not null then 'rxnorm' end], null) as sources
  from fda_by_set f
  full join rx_ok r on r.moieties = f.moieties and upper(r.brand_display) = f.brand
), combo_sets as (
  select member_pcid as pcid, array_agg(distinct moiety_pcid order by moiety_pcid) as moieties
  from public.moiety_hierarchy where relation = 'combination' group by member_pcid
), targets as (
  select m.*, m.moieties[1] as pcid, 'moiety'::text as kind from merged m where cardinality(m.moieties) = 1
  union all
  select m.*, cs.pcid, 'combination' from merged m join combo_sets cs on cs.moieties = m.moieties
  where cardinality(m.moieties) > 1
), filtered as (       -- drop "brands" that are just the generic name
  select t.* from targets t
  where not exists (select 1 from public.moieties mo
                    where mo.pcid = any (t.moieties) and mo.base_name is not null
                      and length(mo.base_name) > 3 and position(upper(mo.base_name) in t.brand_key) > 0)
), deduped as (
  select distinct on (pcid, brand_key) *
  from filtered
  order by pcid, brand_key, cardinality(sources) desc, marketed desc nulls last
), curated as (
  select pcid, kind, upper(trim(primary_brand)) as brand_key
  from (select pcid, 'moiety'::text as kind, primary_brand from public.moieties where primary_brand is not null
        union all
        select pcid, 'combination', primary_brand from public.combinations where primary_brand is not null) x
)
select pcid, kind, brand_key, brand_display, marketed, appl_nos, brand_rxcui, sources
from deduped
union all
select c.pcid, c.kind, c.brand_key, null, null, '{}'::text[], null, array['drug_matrix']
from curated c
where not exists (select 1 from deduped d where d.pcid = c.pcid and d.brand_key = c.brand_key);

create unique index entity_brand_names_pk on public.entity_brand_names (pcid, brand_key);
create index entity_brand_names_brand_key on public.entity_brand_names (brand_key);
grant select on public.entity_brand_names to anon, authenticated;

-- ── Search ───────────────────────────────────────────────────────────────────
create or replace view public.catalog_entries with (security_invoker = true) as
 select e.pcid,
    e.slug,
    e.name,
    e.entity_type,
    coalesce(m.primary_brand, c.primary_brand, p.primary_brand, f.primary_brand) as primary_brand,
    coalesce(m.controlled_schedule, c.controlled_schedule, p.controlled_schedule, f.controlled_schedule) as controlled_schedule,
    coalesce(m.is_controlled, c.is_controlled, p.is_controlled, f.is_controlled) as is_controlled,
    (select array_agg(coalesce(b.brand_display, b.brand_key) order by (b.marketed is false), coalesce(b.brand_display, b.brand_key))
       from public.entity_brand_names b where b.pcid = e.pcid) as brand_names
   from public.entities e
     left join moieties m on m.pcid = e.pcid
     left join combinations c on c.pcid = e.pcid
     left join precise_forms p on p.pcid = e.pcid
     left join formulations f on f.pcid = e.pcid
  where e.pcid >= 1000001 and e.pcid <= 4999999;
grant select on public.catalog_entries to anon, authenticated;

-- One canonical combination entity per brand (the data has near-duplicate combination rows)
create or replace view public.combination_brand_index with (security_invoker = true) as
select distinct on (b.brand_key)
       b.brand_key, coalesce(b.brand_display, b.brand_key) as brand, e.pcid, e.slug, e.name
from public.entity_brand_names b
join public.entities e on e.pcid = b.pcid
where b.kind = 'combination'
order by b.brand_key, (b.marketed is false), e.pcid;
grant select on public.combination_brand_index to anon, authenticated;
