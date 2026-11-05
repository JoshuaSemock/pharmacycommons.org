-- ═══════════════════════════════════════════════════════════════════════════
-- Applied 2026-11-05 as phase28a–d. Phase 28 — server-side site search with typo tolerance
-- Destination: db/phase28_site_search.sql
--
-- What it adds (all additive; nothing existing is changed):
--   search_norm(text)       lowercase, runs of non [a-z0-9] → one space
--   osa_distance(a, b)      edit distance where a transposition counts as ONE
--                           edit ("metfromin" → "metformin" = 1). Trigram
--                           similarity alone ties metformin with Merbromin at
--                           0.43, and a wrong-drug guess is the worst outcome.
--   search_index            materialized view: one row per searchable string
--                           (moiety and combination names, moiety brands,
--                           combination brands, class names, class aliases,
--                           class source codes, concept names, published list
--                           titles), with a trigram GIN index and a btree
--                           prefix index. Refresh after bulk loads, like
--                           moiety_hierarchy:
--                             refresh materialized view concurrently public.search_index;
--   search_all(q, limit, types)
--                           ranked search returning jsonb. Exact tiers use the
--                           same scores as api_search (slug 100, name 95,
--                           alias/code 92, brand 90, prefix 80/75, word 60,
--                           any-order words 50, substring 40/35). Only when
--                           nothing scores 40 or better does the fuzzy tier
--                           run (scores 22–30, edit distance 1–3), and the response says so
--                           (fuzzy: true, did_you_mean).
--
-- Deliberately NOT indexed: dictionary_terms (source misspellings such as
-- "Midozalam" would become "correct" fuzzy targets; see docs/dictionary.md
-- open item 2), precise forms and formulations (nest under moieties), blog
-- posts (files in the repo, not in the database), tools and static pages
-- (client-side, src/siteSearch.ts).
--
-- Read-only and SECURITY INVOKER; anon already reads every source table.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.search_norm(t text)
returns text language sql immutable parallel safe set search_path = ''
as $$ select btrim(regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', ' ', 'g')) $$;

create or replace function public.osa_distance(a text, b text)
returns integer language plpgsql immutable parallel safe set search_path = ''
as $$
declare
  la int := length(a);
  lb int := length(b);
  w  int := length(b) + 1;
  d  int[];
  i  int; j int; cost int; v int;
begin
  if la = 0 then return lb; end if;
  if lb = 0 then return la; end if;
  -- flat (la+1) x (lb+1) matrix, 1-based: cell(i, j) = d[i * w + j + 1]
  for i in 0..la loop d[i * w + 1] := i; end loop;
  for j in 0..lb loop d[j + 1] := j; end loop;
  for i in 1..la loop
    for j in 1..lb loop
      cost := case when substr(a, i, 1) = substr(b, j, 1) then 0 else 1 end;
      v := least(d[(i - 1) * w + j + 1] + 1,          -- deletion
                 d[i * w + (j - 1) + 1] + 1,          -- insertion
                 d[(i - 1) * w + (j - 1) + 1] + cost); -- substitution
      if i > 1 and j > 1
         and substr(a, i, 1) = substr(b, j - 1, 1)
         and substr(a, i - 1, 1) = substr(b, j, 1) then
        v := least(v, d[(i - 2) * w + (j - 2) + 1] + 1); -- transposition
      end if;
      d[i * w + j + 1] := v;
    end loop;
  end loop;
  return d[la * w + lb + 1];
end $$;

-- ── The index ────────────────────────────────────────────────────────────────
create materialized view if not exists public.search_index as
with rows_ as (
  select c.pcid, c.entity_type, c.slug, c.name, 'name'::text as src, c.name as term
    from public.catalog_entries c
   where c.entity_type in ('moiety', 'combination')
  union all
  select c.pcid, c.entity_type, c.slug, c.name, 'brand', b
    from public.catalog_entries c, unnest(c.brand_names) b
   where c.entity_type = 'moiety'
  union all
  select i.pcid, 'combination', i.slug, i.name, 'brand', i.brand
    from public.combination_brand_index i
  union all
  select e.pcid, 'class', e.slug, e.name, 'name', e.name
    from public.drug_classes d join public.entities e using (pcid)
   where d.member_count > 0
  union all
  select e.pcid, 'class', e.slug, e.name, 'alias', a.alias_key
    from public.class_search_aliases a
    join public.drug_classes d on d.pcid = a.class_pcid and d.member_count > 0
    join public.entities e on e.pcid = a.class_pcid
  union all
  select e.pcid, 'class', e.slug, e.name, 'code', d.source_code
    from public.drug_classes d join public.entities e using (pcid)
   where d.member_count > 0 and d.source_code is not null
  union all
  select e.pcid, e.entity_type, e.slug, e.name, 'name', e.name
    from public.entities e
   where e.entity_type in ('clinical', 'measurement', 'target', 'functional')
  union all
  select l.pcid, 'list', l.slug, l.title, 'name', l.title
    from public.lists l
   where l.published
)
select distinct on (pcid, src, public.search_norm(term))
       pcid, entity_type, slug, name, src, term, public.search_norm(term) as key
  from rows_
 where public.search_norm(term) <> ''
 order by pcid, src, public.search_norm(term), term;

create unique index if not exists search_index_pk on public.search_index (pcid, src, key);
create index if not exists search_index_key_trgm on public.search_index using gin (key extensions.gin_trgm_ops);
create index if not exists search_index_key_prefix on public.search_index (key text_pattern_ops);

grant select on public.search_index to anon, authenticated;

-- ── The search ───────────────────────────────────────────────────────────────
-- One SQL statement (no temp tables: PostgREST GETs run read-only). Tier 2 is
-- gated on tier 1's best score, so the fuzzy scan only runs when it is needed.
create or replace function public.search_all(
  p_q text,
  p_limit integer default 20,
  p_types text[] default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with prm as (
    select public.search_norm(p_q) as qn,
           lower(btrim(coalesce(p_q, ''))) as raw,
           least(greatest(coalesce(p_limit, 20), 1), 50) as lim,
           array(select w from unnest(string_to_array(public.search_norm(p_q), ' ')) w where length(w) >= 2) as words,
           (select w from unnest(string_to_array(public.search_norm(p_q), ' ')) w order by length(w) desc limit 1) as longest,
           array['moiety','combination','class','clinical','measurement','target','functional','list'] as ord
  ),
  t1 as (
    select distinct on (h.pcid) h.pcid, h.entity_type, h.slug, h.name, h.src, h.term,
           case when e.slug = prm.raw then 100 else h.score end as score,
           null::int as dist
    from prm,
    lateral (
      select s.pcid, s.entity_type, s.slug, s.name, s.src, s.term,
             case when s.src = 'name'  and s.key = prm.qn then 95
                  when s.src in ('alias', 'code') and s.key in (prm.qn, regexp_replace(prm.qn, 's$', '')) then 92
                  when s.src = 'brand' and s.key = prm.qn then 90
                  when s.src = 'name'  and s.key like prm.qn || '%' then 80
                  when s.src in ('brand', 'alias', 'code') and s.key like prm.qn || '%' then 75
                  when s.src = 'name'  and s.key like '% ' || prm.qn || '%' then 60
                  when s.src = 'name'  and cardinality(prm.words) > 1
                       and not exists (select 1 from unnest(prm.words) w where position(w in s.key) = 0) then 50
                  when s.src = 'name'  and s.key like '%' || prm.qn || '%' then 40
                  when s.src <> 'name' then 35
                  else 0 end as score
        from public.search_index s
       where length(prm.qn) >= 2
         and (s.key like prm.qn || '%' or s.key like '%' || prm.qn || '%'
              or (cardinality(prm.words) > 1 and s.key like '%' || prm.longest || '%'))
         and (p_types is null or s.entity_type = any (p_types))
    ) h
    join public.entities e on e.pcid = h.pcid
    where h.score > 0
    order by h.pcid, 6 desc
  ),
  best as (select coalesce(max(score), 0) as b from t1),
  t2 as (
    select distinct on (c.pcid) c.pcid, c.entity_type, c.slug, c.name, c.src, c.term,
           case when c.dist <= 1 then 30
                when c.dist = 2 and length(prm.qn) >= 6 then 26
                when c.dist = 3 and length(prm.qn) >= 9 then 22 end as score,
           c.dist
    from prm,
    lateral (
      select s.*, g.sim,
             least(public.osa_distance(s.key, prm.qn),
                   coalesce((select min(public.osa_distance(w, prm.qn)) from unnest(string_to_array(s.key, ' ')) w), 99)) as dist
        from public.search_index s
        cross join lateral (select greatest(similarity(s.key, prm.qn), word_similarity(prm.qn, s.key)) as sim) g
       where (s.key % prm.qn or prm.qn <% s.key)
         and (p_types is null or s.entity_type = any (p_types))
       order by g.sim desc
       limit 60
    ) c
    where length(prm.qn) >= 4
      and (select b from best) < 40
      and c.dist <= 3
    order by c.pcid, 6 desc nulls last, c.dist
  ),
  pool as (
    select * from t1 where (select b from best) >= 40 or not exists (select 1 from t2 where score is not null)
    union all
    select * from t2 where score is not null and (select b from best) < 40
  ),
  fz as (select exists (select 1 from t2 where score is not null and (select b from best) < 40) as f),
  ranked as (
    select p.*, m.term_type
      from (select * from pool where score >= 15) p
      left join public.moieties m on m.pcid = p.pcid
     order by p.score desc, p.dist nulls last,
              array_position((select ord from prm), p.entity_type),
              (m.term_type is distinct from 'Core moiety'),
              length(p.name), p.name
     limit (select lim from prm)
  )
  select jsonb_build_object(
           'query', btrim(coalesce(p_q, '')),
           'fuzzy', (select f from fz) and exists (select 1 from ranked),
           'did_you_mean', case when (select f from fz) then
                (select r.name from ranked r
                  order by r.score desc, r.dist nulls last, array_position((select ord from prm), r.entity_type),
                           (r.term_type is distinct from 'Core moiety'), length(r.name), r.name limit 1) end,
           'results', coalesce((
              select jsonb_agg(jsonb_build_object(
                       'pcid', 'PCID-' || r.pcid, 'name', r.name, 'slug', r.slug, 'entity_type', r.entity_type,
                       'match', jsonb_strip_nulls(jsonb_build_object(
                                  'on', case when (select f from fz) then 'fuzzy' else r.src end,
                                  'text', case when r.src in ('brand','alias','code') then r.term end,
                                  'score', r.score)))
                     order by r.score desc, r.dist nulls last, array_position((select ord from prm), r.entity_type),
                              (r.term_type is distinct from 'Core moiety'), length(r.name), r.name)
                from ranked r), '[]'::jsonb))
$$;

comment on function public.search_all(text, integer, text[]) is
  'Site search: ranked exact/prefix/word matches over names, brands, class aliases and concepts, with a flagged typo-tolerant fallback. Public, read-only, security invoker.';

grant execute on function public.search_all(text, integer, text[]) to anon, authenticated;
