-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 11a — API search: GET /v1/search?q=
-- Destination: db/phase11a_api_search.sql
-- Applied 2026-09-28 as migrations phase11a_api_search and
-- phase11b_api_search_aliases_words (the second added class abbreviations and
-- any-order word matching); this file is the final definition.
--
-- Until now a client had to know a PCID or slug before it could ask the API
-- anything. api_search() finds records by generic name, brand name or slug and
-- returns compact references in the same shape the documents already use
-- (@id, pcid, name, slug, entity_type), plus how each one matched and its links.
--
-- Scope and ranking follow the website's search:
--   • Default types: moiety, combination and class. precise_form and
--     formulation are opt-in (?type=precise_form,formulation), because search
--     and browse show moieties and nest the rest under them.
--   • Ranking: exact slug 100 · exact name 95 · class abbreviation 92 (the same
--     class_search_aliases table the site uses: "ssri", "ace inhibitor") ·
--     exact brand 90 · name prefix 80 · brand prefix 75 · word start in name 60 ·
--     every query word in the name, any order 50 ("lisinopril
--     hydrochlorothiazide" → "LISINOPRIL AND HYDROCHLOROTHIAZIDE") ·
--     substring in name 40 · substring in brand 35. Ties: moiety, combination, class, precise form,
--     formulation; then shorter name.
--   • LIKE wildcards in the query are escaped, so "%" and "_" match literally.
--   • Queries under 2 characters return no results (not an error).
--
-- Read-only, SECURITY INVOKER: it reads catalog_entries, drug_classes and
-- entities, which anon can already read. ~200 ms over 26k rows; the API caches
-- responses for 5 minutes.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.api_search(
  p_q text,
  p_limit integer default 20,
  p_types text[] default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select lower(trim(coalesce(p_q, ''))) as raw,
           replace(replace(replace(lower(trim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_') as q,
           least(greatest(coalesce(p_limit, 20), 1), 100) as lim,
           coalesce(p_types, array['moiety', 'combination', 'class']) as types,
           (select value from api_meta where key = 'site_base') as site,
           (select value from api_meta where key = 'api_base') as api,
           regexp_replace(lower(coalesce(p_q, '')), '[^a-z0-9]+', '', 'g') as akey,
           array(select w from regexp_split_to_table(lower(coalesce(p_q, '')), '[^a-z0-9]+') w
                  where length(w) >= 2) as words
  ),
  cand as (
    select c.pcid, c.entity_type, c.name, c.slug, lower(c.name) as ln, c.brand_names, false as alias_hit
      from catalog_entries c, params p
     where c.entity_type = any (p.types)
    union all
    select e.pcid, 'class', e.name, e.slug, lower(e.name), null::text[],
           exists (select 1 from class_search_aliases a
                    where a.class_pcid = e.pcid
                      and a.alias_key in (p.akey, regexp_replace(p.akey, 's$', '')))
      from drug_classes d
      join entities e using (pcid), params p
     where 'class' = any (p.types) and d.member_count > 0
  ),
  scored as (
    select c.*,
           case when c.slug = p.raw then 100
                when c.ln = p.raw then 95
                when c.alias_hit and length(p.akey) >= 2 then 92
                when c.ln like p.q || '%' then 80
                when c.ln like '% ' || p.q || '%' then 60
                when cardinality(p.words) > 1
                     and not exists (select 1 from unnest(p.words) w where position(w in c.ln) = 0) then 50
                when c.ln like '%' || p.q || '%' then 40
                else 0 end as name_score,
           b.brand_score,
           b.brand
      from cand c
     cross join params p
      left join lateral (
             select case when lower(x) = p.raw then 90
                         when lower(x) like p.q || '%' then 75
                         else 35 end as brand_score,
                    x as brand
               from unnest(c.brand_names) x
              where lower(x) like '%' || p.q || '%'
              order by 1 desc, length(x)
              limit 1
           ) b on true
     where length(p.raw) >= 2
  ),
  hits as (
    select s.*,
           greatest(s.name_score, coalesce(s.brand_score, 0)) as score,
           case when s.slug = (select raw from params) then 'slug'
                when s.alias_hit and s.name_score = 92 then 'alias'
                when coalesce(s.brand_score, 0) > s.name_score then 'brand'
                when s.name_score = 50 then 'words'
                else 'name' end as matched_on
      from scored s
     where greatest(s.name_score, coalesce(s.brand_score, 0)) > 0
  ),
  ranked as (
    select h.*, count(*) over () as total
      from hits h
     order by h.score desc,
              array_position(array['moiety', 'combination', 'class', 'precise_form', 'formulation'], h.entity_type),
              length(h.name), h.name
     limit (select lim from params)
  )
  select jsonb_build_object(
           'query', (select trim(coalesce(p_q, '')) from params),
           'types', to_jsonb((select types from params)),
           'total', coalesce((select max(total) from ranked), 0),
           'count', (select count(*) from ranked),
           'results', coalesce((
             select jsonb_agg(jsonb_build_object(
                      '@id', p.site || '/id/PCID-' || r.pcid,
                      'pcid', 'PCID-' || r.pcid,
                      'name', r.name,
                      'slug', r.slug,
                      'entity_type', r.entity_type,
                      'match', jsonb_strip_nulls(jsonb_build_object(
                                 'on', r.matched_on,
                                 'text', case when r.matched_on = 'brand' then r.brand end,
                                 'score', r.score)),
                      'links', jsonb_build_object(
                                 'json', p.api || '/v1/entities/PCID-' || r.pcid,
                                 'html', p.site || '/id/PCID-' || r.pcid))
                    order by r.score desc,
                             array_position(array['moiety', 'combination', 'class', 'precise_form', 'formulation'], r.entity_type),
                             length(r.name), r.name)
               from ranked r, params p), '[]'::jsonb))
$$;

comment on function public.api_search(text, integer, text[]) is
  'GET /v1/search?q= — find records by generic name, brand or slug. Public, read-only, security invoker.';

grant execute on function public.api_search(text, integer, text[]) to anon, authenticated;
