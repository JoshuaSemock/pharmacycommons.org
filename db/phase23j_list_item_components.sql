-- Phase 23j — list_items.component_pcid: let list compare match a brand with its generic (Joshua, 2026-10-29)
-- Destination: db/phase23j_list_item_components.sql   (run after 23h/23i)
-- Compare matched rows on the member PCID, and the Brand Names list holds brand FORMULATION PCIDs, so no brand ever met
-- the generic on another list. component_pcid is an optional pointer from an entry to the generic (moiety / combination)
-- it stands for; get_list() returns it as component_pcid / component_slug / component_name, and /lists/compare
-- (src/lists.ts compareRows) matches on it when set. Other lists leave it NULL and behave as before.
-- Applied 2026-10-29: part 1 and part 3 via apply_migration (phase23j_list_items_component_pcid, phase23j_get_list_component),
-- part 2 via execute_sql. Re-run part 2 after any rebuild of the brand-names list (phase23h deletes and reinserts its items).

-- 1. column
alter table public.list_items add column if not exists component_pcid bigint references public.entities(pcid);
create index if not exists list_items_component_pcid_idx on public.list_items (component_pcid) where component_pcid is not null;
comment on column public.list_items.component_pcid is 'Optional: the generic (moiety/combination) this entry stands for, e.g. a brand-name entry points at its generic. List compare matches rows on component_pcid when set, so brand and generic lists line up.';

-- 2. backfill the brand-names list from learn_brand_list (1,254 items, 1,073 distinct generics)
select set_config('pc.change_source','phase23j_brand_list_components',true);
update public.list_items i set component_pcid = b.generic_pcid
  from public.learn_brand_list b
 where i.list_pcid = (select pcid from public.lists where slug = 'brand-names')
   and i.member_pcid = b.brand_pcid and b.status = 'ready' and b.generic_pcid is not null;

-- 3. get_list(): phase 23i body plus the component fields
CREATE OR REPLACE FUNCTION public.get_list(p_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
                'source_name', i.source_name, 'pcid', e.pcid, 'slug', e.slug,
                'name', case when e.entity_type = 'formulation' then coalesce(nullif(i.source_name, ''), e.name)
                             else coalesce(e.name, i.source_name) end,
                'entity_type', coalesce(e.entity_type, 'term'),
                'term_id', i.term_id,
                'component_pcid', g.pcid, 'component_slug', g.slug, 'component_name', g.name)
              order by i.position)
              from list_items i
              left join entities e on e.pcid = i.member_pcid
              left join entities g on g.pcid = i.component_pcid
              where i.list_pcid = l.pcid), '[]'::jsonb)
  )
  from lists l where l.slug = p_slug
$function$;
