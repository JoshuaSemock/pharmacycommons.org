-- Phase 23h — "Brand Names by Importance" list (Joshua, 2026-10-29: "make a List for those brand names")
-- Destination: db/phase23h_brand_names_list.sql   (run after 23g)
-- One published curated list (block 10) of the 1,254 ready rows of learn_brand_list. Members are the brand FORMULATION PCIDs
-- (block 4), so list pages show the brand name; get_entity_lists() reaches them from the generic's drug page through
-- moiety_hierarchy ("via <brand>"). legal_status carries the importance level (status_label "Importance", so the list page can
-- filter High / Medium / Low); note = generic name plus the sheet's clinical context. position = High, Medium, Low, then sheet_id
-- (same order as the Learn collections). Re-runnable: items are rebuilt if the list exists. PCID minted from pcid_blocks block 10.
select set_config('pc.change_source','phase23h_brand_names_list',true);
do $$
declare v_pcid bigint; v_n int;
begin
  select pcid into v_pcid from lists where slug='brand-names';
  if v_pcid is null then
    if exists (select 1 from entities where slug='brand-names') then raise exception 'slug brand-names already used'; end if;
    update pcid_blocks set next_pcid = next_pcid + 1 where block_id = 10 returning next_pcid - 1 into v_pcid;
    insert into entities (pcid, entity_type, slug, slug_uri, name)
      values (v_pcid, 'list', 'brand-names', 'pc:list:brand-names', 'Brand Names by Importance');
    insert into lists (pcid, slug, title, description, kind, source_citation, license, default_sort, published, item_count, sort_order, status_label)
    values (v_pcid, 'brand-names', 'Brand Names by Importance',
      'Brand-name drugs a pharmacist is expected to know, each tied to its generic and ranked High, Medium or Low importance. Filter by importance to build a shorter set. The Learn feature teaches these same brands.',
      'curated', 'Semock, J. (2026). Brand Names by Importance. Pharmacy Commons.', 'CC0-1.0', 'position', true, 0, 90, 'Importance');
  else
    delete from list_items where list_pcid = v_pcid;
  end if;

  insert into list_items (list_pcid, position, member_pcid, source_name, legal_status, note)
  select v_pcid,
         row_number() over (order by case b.importance when 'High' then 1 when 'Medium' then 2 else 3 end, b.sheet_id),
         b.brand_pcid, b.brand_name, b.importance,
         'Generic: ' || b.generic_name || coalesce('. ' || nullif(b.clinical_context, ''), '')
    from learn_brand_list b where b.status = 'ready';
  get diagnostics v_n = row_count;
  update lists set item_count = v_n, updated_at = now() where pcid = v_pcid;
end $$;
