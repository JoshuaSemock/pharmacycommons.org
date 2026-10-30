-- Phase 24j: mirror of live migration 'phase24j_learn_federal_schedule' (applied 2026-10-30).
-- Retire the Georgia MPJE Learn module (archive, so learner progress is kept) and add a draft
-- "Federal Controlled Substance Schedules" collection built from the High and Medium parts
-- of the federal-controlled-substances list. Draft until Joshua approves a sample in /admin/learn.
update public.learn_items set status = 'archived', updated_at = now()
where template_key = 'mpje_schedule' and is_official;

update public.learn_collections set status = 'archived', updated_at = now()
where slug = 'georgia-mpje-controlled-substances';

insert into public.learn_collections
  (slug, title, description, subject_area, topic, is_official, status, source_list_pcid, template_keys, sort_order)
values
  ('federal-controlled-substances', 'Federal Controlled Substance Schedules',
   'Federal (DEA) schedules for the controlled substances pharmacists see most. High and Medium importance only; substances placed in more than one schedule are left out.',
   'Pharmacy law', 'Federal Controlled Substance Schedules', true, 'draft', 10000040, array['federal_schedule'], 40)
on conflict (slug) do nothing;

select public.learn_gen_attribute_mcq('federal-controlled-substances-high', 'federal_schedule',
  'Under federal law, which schedule is %s?',
  '[{"value":"Schedule I","label":"Schedule I"},{"value":"Schedule II","label":"Schedule II"},{"value":"Schedule III","label":"Schedule III"},{"value":"Schedule IV","label":"Schedule IV"},{"value":"Schedule V","label":"Schedule V"}]'::jsonb,
  '%1$s: %2$s under the federal Controlled Substances Act.', 'Not the federal schedule for this drug.',
  'Federal schedules change by DEA rule and states can schedule differently. Check the current DEA schedules.', 'DEA', 'Pharmacy law');
select public.learn_gen_attribute_mcq('federal-controlled-substances-medium', 'federal_schedule',
  'Under federal law, which schedule is %s?',
  '[{"value":"Schedule I","label":"Schedule I"},{"value":"Schedule II","label":"Schedule II"},{"value":"Schedule III","label":"Schedule III"},{"value":"Schedule IV","label":"Schedule IV"},{"value":"Schedule V","label":"Schedule V"}]'::jsonb,
  '%1$s: %2$s under the federal Controlled Substances Act.', 'Not the federal schedule for this drug.',
  'Federal schedules change by DEA rule and states can schedule differently. Check the current DEA schedules.', 'DEA', 'Pharmacy law');

insert into public.learn_collection_items (collection_id, item_id, sort_order, section_label)
select c.id, i.id, (row_number() over (order by (l.slug = 'federal-controlled-substances-high') desc, i.natural_key))::int,
       case when l.slug = 'federal-controlled-substances-high' then 'High importance' else 'Medium importance' end
from public.learn_collections c
join public.learn_items i on i.template_key = 'federal_schedule' and i.is_official
join public.lists l on l.pcid = i.source_list_pcid
where c.slug = 'federal-controlled-substances'
on conflict (collection_id, item_id) do nothing;
