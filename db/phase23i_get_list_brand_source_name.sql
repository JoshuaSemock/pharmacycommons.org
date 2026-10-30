-- Phase 23i — list pages show the sheet's brand spelling (Joshua, 2026-10-29: brand names capitalised as in the source)
-- Destination: db/phase23i_get_list_brand_source_name.sql   (run after 23h)
-- get_list(): for formulation members (only the brand-names list has them) 'name' is list_items.source_name ("Abilify")
-- instead of entities.name ("ABILIFY", FDA style). Every other list is unchanged. Applied 2026-10-29 via apply_migration.
-- Body = phase 9 get_list with one changed line; re-create it from the live function if get_list changes again.
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
                'term_id', i.term_id)
              order by i.position)
              from list_items i left join entities e on e.pcid = i.member_pcid where i.list_pcid = l.pcid), '[]'::jsonb)
  )
  from lists l where l.slug = p_slug
$function$;
