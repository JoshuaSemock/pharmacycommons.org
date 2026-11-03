-- Phase 33 — Network: classification hierarchy for one to four concepts (2026-11-03)
-- Applied as one migration, phase33_network_hierarchy.
--
-- class_members stores every ancestor of a class as an inherited (is_direct = false) membership, so
-- a flat reading of it makes a drug look like a member of five unrelated classes. The tree is already
-- in drug_classes.parent_pcid. network_hierarchy() rebuilds it for the given concepts:
--   anchors — where each concept sits: its direct classes (class_members.is_direct), or itself when
--             the concept is a class.
--   nodes   — every class on a path from an anchor to its root, with the concepts beneath it
--             ("members") and a `meeting` flag: two or more concepts are beneath it and no child class
--             holds the same set. That is the lowest clade the concepts have in common, in that system.
-- The client lays the nodes out as a tree per classification system (class_type).
-- Returns null for fewer than one or more than four distinct PCIDs.

create or replace function public.network_hierarchy(p_pcids bigint[])
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_ids bigint[];
  v_result jsonb;
begin
  select coalesce(array_agg(p order by p), '{}') into v_ids
  from (select distinct p from unnest(p_pcids) p where p is not null) d;
  if coalesce(array_length(v_ids, 1), 0) < 1 or array_length(v_ids, 1) > 4 then
    return null;
  end if;

  with recursive anchors as (
    select cm.member_pcid as concept, cm.class_pcid as cls
    from class_members cm
    where cm.member_pcid = any (v_ids) and cm.is_direct
    union
    select dc.pcid, dc.pcid from drug_classes dc where dc.pcid = any (v_ids)
  ),
  chain(concept, cls) as (
    select concept, cls from anchors
    union
    select ch.concept, dc.parent_pcid
    from chain ch join drug_classes dc on dc.pcid = ch.cls
    where dc.parent_pcid is not null
  ),
  held as (
    select cls, array_agg(distinct concept order by concept) as members from chain group by cls
  ),
  nodes as (
    select dc.pcid, e.slug, e.name, coalesce(dc.class_type, 'other') as class_type,
           dc.parent_pcid, h.members
    from held h
    join drug_classes dc on dc.pcid = h.cls
    join entities e on e.pcid = dc.pcid
  ),
  flagged as (
    select n.*,
           (cardinality(n.members) >= 2
            and not exists (select 1 from nodes c where c.parent_pcid = n.pcid and c.members = n.members)) as meeting
    from nodes n
  ),
  ent as (
    select e.pcid, e.slug, e.name, e.entity_type, dc.class_type, m.term_type
    from entities e
    left join drug_classes dc on dc.pcid = e.pcid
    left join moieties m on m.pcid = e.pcid
    where e.pcid = any (v_ids)
  )
  select jsonb_build_object(
    'pcids', to_jsonb(v_ids),
    'entities', coalesce((select jsonb_agg(to_jsonb(x) order by array_position(v_ids, x.pcid)) from ent x), '[]'::jsonb),
    'anchors', coalesce((select jsonb_agg(jsonb_build_object('concept', a.concept, 'class', a.cls) order by a.concept, a.cls) from anchors a), '[]'::jsonb),
    'nodes', coalesce((select jsonb_agg(jsonb_build_object(
        'pcid', f.pcid, 'slug', f.slug, 'name', f.name, 'class_type', f.class_type,
        'parent', f.parent_pcid, 'members', to_jsonb(f.members), 'meeting', f.meeting)
        order by f.class_type, f.name) from flagged f), '[]'::jsonb)
  ) into v_result;

  return v_result;
end
$$;

grant execute on function public.network_hierarchy(bigint[]) to anon, authenticated;
