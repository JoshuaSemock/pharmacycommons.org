-- Phase 23d — Learn: swap the brand-name learner to learn_brand_list (applied 2026-10-29 via execute_sql)
-- Destination: db/phase23d_learn_brand_list_swap.sql   (run after 23c)
-- The 465 Notable-Drugs brand_generic items are ARCHIVED, not deleted (deleting would cascade to learner state and FSRS
-- review events). The 'brand-generic' collection keeps its slug and now holds only the 1,252 sheet-driven items,
-- sectioned High / Medium / Low importance (612 / 299 / 341). New items are published directly: they are template-built
-- from the owner's own sheet. learn_gen_brand_list() is idempotent (natural_key 'brand_list:<sheet_id>').
select public.learn_gen_brand_list();
update public.learn_items set status='archived' where template_key='brand_generic' and natural_key like 'brand_generic:%' and status<>'archived';
delete from public.learn_collection_items ci using public.learn_items i where i.id=ci.item_id and i.natural_key like 'brand_generic:%';
update public.learn_collections set source_list_pcid=null,
  description='Match brand names to generic drugs, ordered by how important each brand is (High, Medium, Low).' where slug='brand-generic';
insert into public.learn_collection_items (collection_id, item_id, sort_order, section_label)
select c.id, i.id, (row_number() over (order by case l.importance when 'High' then 1 when 'Medium' then 2 else 3 end, l.sheet_id))::int, l.importance || ' importance'
from public.learn_collections c join public.learn_items i on i.natural_key like 'brand_list:%' and i.status='published'
join public.learn_brand_list l on 'brand_list:'||l.sheet_id = i.natural_key
where c.slug='brand-generic' on conflict (collection_id, item_id) do nothing;
