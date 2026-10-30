-- Phase 23g — three Learn collections for the brand-name learner (Joshua, 2026-10-29)
-- Destination: db/phase23g_brand_importance_collections.sql   (run after 23f)
--   brand-generic-high         "Brand names: High importance"  (613)
--   brand-generic-high-medium  "Brand names: High + Medium"    (912)
--   brand-generic              "Brand names: All"              (1,254; existing collection, renamed)
-- All three point at the same learn_items (no new items). Scheduling state is per (user, item), so progress is shared across sets.
-- Item membership is derived from the importance tag on the item; sort_order and section_label are copied from the All set.
-- Re-runnable: collections are upserted by slug; membership is inserted with ON CONFLICT DO NOTHING.
do $$
declare v_all uuid; v_high uuid; v_hm uuid;
begin
  update learn_collections set title='Brand names: All', topic='Brand and Generic Names', sort_order=72, updated_at=now(),
         description='Match brand names to generic drugs: all 1,254 brands, ordered High, Medium, then Low importance.'
   where slug='brand-generic' returning id into v_all;
  if v_all is null then raise exception 'brand-generic collection missing'; end if;

  insert into learn_collections (slug,title,topic,status,owner_id,sort_order,description,is_official,subject_area,template_keys,source_list_pcid,excluded_item_ids)
  select 'brand-generic-high','Brand names: High importance',topic,status,null,70,
         'Match brand names to generic drugs: only the brands you are most likely to meet (High importance).',
         true,subject_area,template_keys,null,'{}' from learn_collections where id=v_all
  on conflict (slug) do update set title=excluded.title, description=excluded.description, sort_order=excluded.sort_order
  returning id into v_high;

  insert into learn_collections (slug,title,topic,status,owner_id,sort_order,description,is_official,subject_area,template_keys,source_list_pcid,excluded_item_ids)
  select 'brand-generic-high-medium','Brand names: High + Medium',topic,status,null,71,
         'Match brand names to generic drugs: High and Medium importance brands.',
         true,subject_area,template_keys,null,'{}' from learn_collections where id=v_all
  on conflict (slug) do update set title=excluded.title, description=excluded.description, sort_order=excluded.sort_order
  returning id into v_hm;

  insert into learn_collection_items (collection_id,item_id,sort_order,section_label)
  select v_high, ci.item_id, ci.sort_order, ci.section_label
    from learn_collection_items ci join learn_items i on i.id=ci.item_id
   where ci.collection_id=v_all and 'importance:high' = any(i.tags)
  on conflict do nothing;

  insert into learn_collection_items (collection_id,item_id,sort_order,section_label)
  select v_hm, ci.item_id, ci.sort_order, ci.section_label
    from learn_collection_items ci join learn_items i on i.id=ci.item_id
   where ci.collection_id=v_all and (i.tags && array['importance:high','importance:medium'])
  on conflict do nothing;
end $$;
