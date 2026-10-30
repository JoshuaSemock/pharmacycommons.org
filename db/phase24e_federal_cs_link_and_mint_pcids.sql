-- Phase 24e: mirror of live migration 'phase19b_federal_cs_link_and_mint_pcids' (schema_migrations version 20261030172659, applied 2026-10-30).
-- Federal controlled substances table, views and lists (see docs/federal-controlled-substances.md).
do $$
declare v_next bigint; v_n int; v_map int;
begin
  select next_pcid into v_next from public.pcid_blocks where entity_kind = 'moiety' for update;

  -- 1. same substance already in the database under another name: link, don't duplicate
  update public.federal_controlled_substances f
     set pcid = m.pcid, updated_at = now()
    from (values
      (55,1000289),(56,1000281),(57,1000284),(315,1000014),(606,1000274),(176,1009319),
      (523,1012164),(2,1000249),(104,1000133),(445,1000035),
      (228,1000032),(232,1000032),(174,1000027),(178,1000027),(555,1000055),(587,1000055),
      (287,1000036),(289,1000036),(262,1000516),
      (495,1000049),(499,1000059),(502,1003075),(552,9000042),(553,9000042),
      (369,4000916),(377,4000916),(372,4000916)
    ) as m(id, pcid)
   where f.id = m.id and f.pcid is null;
  get diagnostics v_map = row_count;
  if v_map <> 27 then raise exception 'expected 27 links, got %', v_map; end if;

  -- 2. mint the remaining High/Medium rows as moieties
  create temp table _mint on commit drop as
  select f.id, f.schedule_num,
         case f.id when 343 then 'JWH-018' else f.drug_name end as ename,
         v_next - 1 + row_number() over (
           order by case f.importance when 'High' then 1 else 2 end, f.schedule_num, lower(f.drug_name), f.id) as pcid
  from public.federal_controlled_substances f
  where f.pcid is null and f.importance in ('High','Medium');

  select count(*) into v_n from _mint;
  if v_n <> 43 then raise exception 'expected 43 mints, got %', v_n; end if;

  insert into public.entities (pcid, entity_type, slug, slug_uri, name, created_at, updated_at)
  select pcid, 'moiety', s.slug, 'pc:moiety:' || s.slug, ename, now(), now()
  from (select pcid, ename,
               trim(both '-' from regexp_replace(lower(replace(replace(ename,'α','alpha'),'Δ','delta')), '[^a-z0-9]+', '-', 'g')) as slug
        from _mint) s;

  insert into public.moieties (pcid, term_type, is_controlled, controlled_schedule, base_name,
                               statute_citation, rx_status, primary_source, source_count)
  select pcid, 'Core moiety', true, 'CS-' || schedule_num, upper(ename),
         case schedule_num when 1 then '21 CFR § 1308.11' when 2 then '21 CFR § 1308.12'
                           when 3 then '21 CFR § 1308.13' when 4 then '21 CFR § 1308.14'
                           else '21 CFR § 1308.15' end,
         'Controlled CS-' || schedule_num,
         'Pharmacy Commons lists import 2026-10-30 (Controlled_Substances.xlsx; DEA Orange Book)', 1
  from _mint;

  update public.federal_controlled_substances f
     set pcid = m.pcid, updated_at = now()
    from _mint m where f.id = m.id;

  update public.pcid_blocks set next_pcid = v_next + v_n where entity_kind = 'moiety';

  -- 3. rebuild the draft lists from the updated links
  delete from public.list_items where list_pcid between 10000040 and 10000046;

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
end $$;
