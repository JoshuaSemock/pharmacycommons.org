-- Phase 32b — Network: compare two to four concepts (2026-11-03)
-- Applied as one migration, phase32b_network_compare.
--
-- network_compare() reads each concept's edges through network_edges() (phase 32a) and turns them
-- inside out: for every OTHER concept, which of the compared concepts connect to it. Concepts that
-- connect to the same other concept are "shared"; the rest are "only X". Links between the compared
-- concepts themselves are returned separately.
--
-- The result is summarised by member set so a comparison of two large classes stays small:
--   sets  — one entry per distinct set of linking concepts, with its size and a count per group.
--   rows  — the other concepts, alphabetical within a set. Without p_members, the first
--           p_limit rows of every set; with p_members (the sorted PCIDs of one set), a page of
--           that set from p_offset.
-- Returns null when fewer than two or more than four distinct PCIDs are given.

create or replace function public.network_compare(
  p_pcids bigint[],
  p_include_community boolean default false,
  p_members bigint[] default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_ids bigint[];
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_members bigint[];
  v_result jsonb;
begin
  select coalesce(array_agg(p order by p), '{}') into v_ids from (select distinct p from unnest(p_pcids) p where p is not null) d;
  if coalesce(array_length(v_ids, 1), 0) < 2 or array_length(v_ids, 1) > 4 then
    return null;
  end if;
  if p_members is not null then
    select array_agg(m order by m) into v_members from (select distinct m from unnest(p_members) m) d;
  end if;

  with src as (select unnest(v_ids) as pcid),
  raw as (
    select s.pcid as src, e.id, e.subject, e.predicate, e.object, e.grp, e.evidence_level, e.source_agency,
           e.source_doc_id, e.direct, e.community, e.basis,
           case when e.subject = s.pcid then e.object else e.subject end as other,
           (e.subject = s.pcid) as outgoing
    from src s
    cross join lateral network_edges(s.pcid, p_include_community) e
  ),
  between_ as (
    select distinct on (id) id, subject, predicate, object, grp, evidence_level, source_agency, source_doc_id, direct, community, basis
    from raw where other = any (v_ids) order by id
  ),
  others as (select * from raw where not (other = any (v_ids))),
  grouped as (
    select o.other,
           array_agg(distinct o.src order by o.src) as members,
           (array_agg(o.grp order by case o.grp when 'classification' then 1 when 'composition' then 2 when 'use' then 3
                                                when 'safety' then 4 when 'interaction' then 5 when 'lists' then 6 else 7 end))[1] as grp
    from others o group by o.other
  ),
  sets as (
    select members, count(*)::int as n from grouped group by members
  ),
  set_groups as (
    select members, jsonb_object_agg(grp, n) as groups
    from (select members, grp, count(*)::int n from grouped group by members, grp) x group by members
  ),
  ranked as (
    select g.*, row_number() over (
             partition by g.members
             order by case g.grp when 'classification' then 1 when 'composition' then 2 when 'use' then 3
                                 when 'safety' then 4 when 'interaction' then 5 when 'lists' then 6 else 7 end,
                      lower(e.name), g.other) as rn
    from grouped g join entities e on e.pcid = g.other
  ),
  page as (
    select * from ranked
    where case when v_members is null then rn <= v_limit
               else members = v_members and rn > v_offset and rn <= v_offset + v_limit end
  ),
  node_ids as (select unnest(v_ids) as pcid union select other from page),
  node_rows as (
    select e.pcid, e.slug, e.name, e.entity_type, dc.class_type, m.term_type
    from node_ids n join entities e on e.pcid = n.pcid
    left join drug_classes dc on dc.pcid = e.pcid
    left join moieties m on m.pcid = e.pcid
  )
  select jsonb_build_object(
    'pcids', to_jsonb(v_ids),
    'entities', coalesce((select jsonb_agg(to_jsonb(n) order by array_position(v_ids, n.pcid)) from node_rows n where n.pcid = any (v_ids)), '[]'::jsonb),
    'between', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'subject', subject, 'predicate', predicate, 'object', object, 'group', grp,
        'evidence_level', evidence_level, 'source_agency', source_agency, 'source_doc_id', source_doc_id,
        'direct', direct, 'community', community, 'basis', basis) order by id) from between_), '[]'::jsonb),
    'sets', coalesce((select jsonb_agg(jsonb_build_object(
        'members', to_jsonb(s.members), 'count', s.n, 'groups', coalesce(sg.groups, '{}'::jsonb))
        order by cardinality(s.members) desc, s.members) from sets s left join set_groups sg on sg.members = s.members), '[]'::jsonb),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'members', to_jsonb(p.members), 'group', p.grp, 'rn', p.rn,
        'node', (select to_jsonb(n) from node_rows n where n.pcid = p.other),
        'links', (select jsonb_agg(jsonb_build_object(
            'src', o.src, 'outgoing', o.outgoing,
            'edge', jsonb_build_object(
              'id', o.id, 'subject', o.subject, 'predicate', o.predicate, 'object', o.object, 'group', o.grp,
              'evidence_level', o.evidence_level, 'source_agency', o.source_agency, 'source_doc_id', o.source_doc_id,
              'direct', o.direct, 'community', o.community, 'basis', o.basis)) order by o.src, o.id)
          from others o where o.other = p.other))
        order by cardinality(p.members) desc, p.members, p.rn) from page p), '[]'::jsonb),
    'offset', v_offset,
    'limit', v_limit
  ) into v_result;

  return v_result;
end
$$;

grant execute on function public.network_compare(bigint[], boolean, bigint[], integer, integer) to anon, authenticated;
