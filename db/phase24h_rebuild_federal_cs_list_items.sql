-- Phase 24h: mirror of live migration 'phase19e_rebuild_federal_cs_list_items' (schema_migrations version 20261030174043, applied 2026-10-30).
-- Federal controlled substances table, views and lists (see docs/federal-controlled-substances.md).
-- Phase 19e: rebuild items of lists 10000040-10000046 now that every row has a PCID.
create temp table _fcs_drug on commit drop as
select pcid,
  (array_agg(drug_name order by schedule_num, lower(drug_name)))[1] as source_name,
  string_agg(distinct control_status, '; ' order by control_status) as sched,
  bool_or(schedule_num = 2) as has2,
  bool_or(schedule_num between 3 and 5) as has35,
  bool_or(schedule_num between 2 and 5) as has25,
  (case max(case importance when 'High' then 3 when 'Medium' then 2 else 1 end)
     when 3 then 'High' when 2 then 'Medium' else 'Low' end) as imp,
  string_agg(distinct nullif(trim(brand_names), ''), '; ') as brands
from federal_controlled_substances
where pcid is not null
group by pcid;

delete from list_items where list_pcid between 10000040 and 10000046;

insert into list_items (list_pcid, position, member_pcid, source_name, legal_status, note, sources)
select l.pcid, row_number() over (partition by l.pcid order by lower(d.source_name), d.pcid),
       d.pcid, d.source_name, d.sched,
       'Importance: ' || d.imp || coalesce('. Brands: ' || d.brands, ''),
       array['DEA Orange Book']
from _fcs_drug d
join lists l on l.pcid between 10000040 and 10000046
where case l.pcid
  when 10000040 then true
  when 10000041 then d.has2
  when 10000042 then d.has35
  when 10000043 then d.has25
  when 10000044 then d.imp = 'High'
  when 10000045 then d.imp = 'Medium'
  when 10000046 then d.imp = 'Low'
end;

update lists l set item_count = (select count(*) from list_items i where i.list_pcid = l.pcid)
where l.pcid between 10000040 and 10000046;

update lists set description = 'Substances controlled under the federal Controlled Substances Act (Schedules I–V), with brand names and an importance rating. Filter by schedule to see one group, or open a part below.'
where pcid = 10000040;
update lists set description = 'Federally controlled substances rated low importance.'
where pcid = 10000046;
