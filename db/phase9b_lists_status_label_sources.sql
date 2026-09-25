-- Phase 9b — list categories other than legal status, and corroborating sources (2026-09-25)
-- Mirror of the Supabase migration `phase9b_lists_status_label_sources` (applied via apply_migration).
--
-- Added for the Do Not Crush list (PCID-10000023), whose per-drug category is a
-- reason (Modified-release, Irritant, …) rather than a legal status, and whose
-- entries record which outside references also list the drug.
-- Additive only: two nullable columns; RPCs gain fields but keep their old ones.

alter table public.lists add column status_label text;
comment on column public.lists.status_label is 'What list_items.legal_status means on this list, e.g. ''Schedule'' or ''Reason''. Null = legal status.';
alter table public.list_items add column sources text[];
comment on column public.list_items.sources is 'Other references that also list this drug (short names, e.g. {MPR,"Pharmacist''s Letter"}). Null when not recorded.';
update public.lists set status_label = 'Schedule' where slug = 'georgia-mpje-controlled-substances';

create or replace function public.get_list(p_slug text)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'pcid', l.pcid, 'pcid_code', 'PCID-' || l.pcid, 'slug', l.slug, 'title', l.title, 'description', l.description,
    'kind', l.kind, 'jurisdiction', l.jurisdiction, 'source_citation', l.source_citation, 'source_url', l.source_url,
    'license', l.license, 'measure_label', l.measure_label, 'measure_unit', l.measure_unit, 'rank_label', l.rank_label,
    'status_label', l.status_label,
    'default_sort', l.default_sort, 'item_count', l.item_count, 'updated_at', l.updated_at,
    'parent', (select jsonb_build_object('slug', p.slug, 'title', p.title) from lists p where p.pcid = l.parent_pcid),
    'children', coalesce((select jsonb_agg(jsonb_build_object('slug', c.slug, 'title', c.title, 'item_count', c.item_count) order by c.sort_order, c.title)
                          from lists c where c.parent_pcid = l.pcid), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                'position', i.position, 'rank', i.rank, 'value', i.value, 'legal_status', i.legal_status, 'note', i.note,
                'sources', i.sources,
                'source_name', i.source_name, 'pcid', e.pcid, 'slug', e.slug, 'name', e.name, 'entity_type', e.entity_type)
              order by i.position)
              from list_items i join entities e on e.pcid = i.member_pcid where i.list_pcid = l.pcid), '[]'::jsonb)
  )
  from lists l where l.slug = p_slug
$$;

-- Return type changes (status_label, note), so drop and recreate.
drop function public.get_entity_lists(bigint);
create function public.get_entity_lists(p_pcid bigint)
returns table(slug text, title text, kind text, rank int, value numeric, legal_status text, status_label text, note text, via_pcid bigint, via_name text)
language sql stable security invoker set search_path = public as $$
  with members as (
    select p_pcid as pcid
    union
    select h.member_pcid from moiety_hierarchy h where h.moiety_pcid = p_pcid
  )
  select distinct on (l.pcid) l.slug, l.title, l.kind, i.rank, i.value, i.legal_status, l.status_label, i.note,
         nullif(i.member_pcid, p_pcid), case when i.member_pcid <> p_pcid then e.name end
  from list_items i join members m on m.pcid = i.member_pcid
  join lists l on l.pcid = i.list_pcid join entities e on e.pcid = i.member_pcid
  order by l.pcid, (i.member_pcid = p_pcid) desc, i.rank nulls last
$$;

grant execute on function public.list_lists(), public.get_list(text), public.get_entity_lists(bigint) to anon, authenticated;

-- Data (run `lists-do-not-crush-2026-09-25`, via execute_sql, not part of the migration):
--   PCID-2002470 combination drospirenone/estetrol minted (block 2 next_pcid → 2002471)
--   PCID-10000023 list do-not-crush, 226 items, published (block 10 next_pcid → 10000024)
--
-- Follow-up data run `lists-sublists-2026-09-25` (execute_sql):
--   PCID-10000024 georgia-mpje (parent of 10000020–22; items = union, statuses combined)
--   PCID-10000025–30 do-not-crush-* reason sub-lists (parent 10000023)
--   block 10 next_pcid → 10000031
