-- Phase 24k: mirror of live migration 'phase24k_learn_federal_filter_tags' (applied 2026-10-30).
-- Filter tags on the federal schedule items (schedule:<1-5>, importance:<high|medium>),
-- used by the Learn "Filter questions" panel (src/learn/filters.ts). Idempotent.
update public.learn_items i
set tags = i.tags
    || case when i.tags @> array['schedule:' || x.sch] then '{}'::text[] else array['schedule:' || x.sch] end
    || case when i.tags @> array['importance:' || x.imp] then '{}'::text[] else array['importance:' || x.imp] end
from (
  select i2.id,
    (case i2.concise_answer when 'Schedule I' then '1' when 'Schedule II' then '2' when 'Schedule III' then '3'
       when 'Schedule IV' then '4' when 'Schedule V' then '5' end) as sch,
    (case l.slug when 'federal-controlled-substances-high' then 'high' when 'federal-controlled-substances-medium' then 'medium' end) as imp
  from public.learn_items i2
  join public.lists l on l.pcid = i2.source_list_pcid
  where i2.template_key = 'federal_schedule' and i2.is_official
) x
where i.id = x.id and x.sch is not null and x.imp is not null;
