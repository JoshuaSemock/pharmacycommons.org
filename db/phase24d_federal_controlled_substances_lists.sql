-- Phase 24d: mirror of live migration 'phase19_federal_controlled_substances_lists' (schema_migrations version 20261030172210, applied 2026-10-30).
-- Federal controlled substances table, views and lists (see docs/federal-controlled-substances.md).
do $$
declare v_next bigint;
begin
  select next_pcid into v_next from public.pcid_blocks where entity_kind = 'list' for update;
  if v_next <> 10000040 then
    raise exception 'list block next_pcid moved (%), aborting', v_next;
  end if;

  -- 1. entities first (lists.pcid has an FK to entities)
  insert into public.entities (pcid, entity_type, slug, slug_uri, name, created_at, updated_at)
  select pcid, 'list', slug, 'pc:list:' || slug, title, now(), now()
  from (values
    (10000040, 'federal-controlled-substances',        'Federal Controlled Substances'),
    (10000041, 'federal-controlled-substances-c2',     'Federal Controlled Substances: Schedule II'),
    (10000042, 'federal-controlled-substances-c3-5',   'Federal Controlled Substances: Schedules III–V'),
    (10000043, 'federal-controlled-substances-c2-5',   'Federal Controlled Substances: Schedules II–V'),
    (10000044, 'federal-controlled-substances-high',   'Federal Controlled Substances: High importance'),
    (10000045, 'federal-controlled-substances-medium', 'Federal Controlled Substances: Medium importance'),
    (10000046, 'federal-controlled-substances-low',    'Federal Controlled Substances: Low importance')
  ) as s(pcid, slug, title);

  -- 2. lists, UNPUBLISHED until the unlinked rows are resolved
  insert into public.lists (pcid, slug, title, description, kind, parent_pcid, jurisdiction,
                            source_citation, source_url, license, default_sort, published,
                            sort_order, status_label)
  select s.pcid, s.slug, s.title, s.descr, 'curated',
         case when s.pcid = 10000040 then null else 10000040 end,
         'US',
         'U.S. Drug Enforcement Administration, Diversion Control Division. Controlled Substances: Alphabetical Order (Orange Book), 21 CFR §§ 1308.11–1308.15. Importance ratings: Semock, J. (2026), Pharmacy Commons.',
         'https://www.deadiversion.usdoj.gov/schedules/orangebook/c_cs_alpha.pdf',
         'CC0-1.0', 'name', false, s.sort_order, 'Schedule'
  from (values
    (10000040, 'federal-controlled-substances',        'Federal Controlled Substances', 100,
      'Substances controlled under the federal Controlled Substances Act (Schedules I–V), with brand names and an importance rating. Filter by schedule to see one group, or open a part below.'),
    (10000041, 'federal-controlled-substances-c2',     'Federal Controlled Substances: Schedule II', 101,
      'Schedule II substances on the federal list.'),
    (10000042, 'federal-controlled-substances-c3-5',   'Federal Controlled Substances: Schedules III–V', 102,
      'Schedule III, IV and V substances on the federal list.'),
    (10000043, 'federal-controlled-substances-c2-5',   'Federal Controlled Substances: Schedules II–V', 103,
      'Substances with accepted medical use (Schedules II–V) on the federal list.'),
    (10000044, 'federal-controlled-substances-high',   'Federal Controlled Substances: High importance', 104,
      'Federally controlled substances rated high importance.'),
    (10000045, 'federal-controlled-substances-medium', 'Federal Controlled Substances: Medium importance', 105,
      'Federally controlled substances rated medium importance.'),
    (10000046, 'federal-controlled-substances-low',    'Federal Controlled Substances: Low importance', 106,
      'Federally controlled substances rated low importance.')
  ) as s(pcid, slug, title, sort_order, descr);

  -- 3. items: one row per drug (PCID); drugs listed under two schedules keep both
  create temp table _fcs_drug on commit drop as
  select pcid,
         (array_agg(drug_name order by schedule_num, id))[1]                       as source_name,
         string_agg(distinct control_status, '; ' order by control_status)         as sched,
         bool_or(schedule_num = 2)                                                 as has2,
         bool_or(schedule_num between 3 and 5)                                     as has35,
         bool_or(schedule_num between 2 and 5)                                     as has25,
         (array_agg(importance order by case importance when 'High' then 1 when 'Medium' then 2 else 3 end))[1] as imp,
         string_agg(distinct brand_names, '; ')                                    as brands
  from public.federal_controlled_substances
  where pcid is not null
  group by pcid;

  insert into public.list_items (list_pcid, position, member_pcid, source_name, legal_status, note, sources)
  select l.pcid,
         row_number() over (partition by l.pcid order by lower(d.source_name), d.pcid),
         d.pcid, d.source_name, d.sched,
         'Importance: ' || d.imp || coalesce('. Brands: ' || d.brands, ''),
         array['DEA Orange Book']
  from (values (10000040,'all'),(10000041,'c2'),(10000042,'c35'),(10000043,'c25'),
               (10000044,'High'),(10000045,'Medium'),(10000046,'Low')) as l(pcid, k)
  join _fcs_drug d on case l.k when 'all' then true
                              when 'c2'  then d.has2
                              when 'c35' then d.has35
                              when 'c25' then d.has25
                              else d.imp = l.k end;

  update public.lists l
     set item_count = (select count(*) from public.list_items i where i.list_pcid = l.pcid)
   where l.pcid between 10000040 and 10000046;

  update public.pcid_blocks set next_pcid = 10000047 where entity_kind = 'list';
end $$;
