-- Phase 24g: mirror of live migration 'phase19d_federal_cs_mint_low_importance_pcids' (schema_migrations version 20261030174006, applied 2026-10-30).
-- Federal controlled substances table, views and lists (see docs/federal-controlled-substances.md).
-- Phase 19d: link 12 exact-name matches, then mint moiety PCIDs for the remaining
-- unlinked Low-importance rows of federal_controlled_substances.
do $$
declare
  r record;
  v_next bigint;
  v_max bigint;
  v_slug text;
  v_base text;
  n int := 0;
begin
  perform set_config('pc.change_source', 'phase19d_federal_cs_low_mint', true);

  update federal_controlled_substances f set pcid = x.pcid, updated_at = now()
  from (values (688,1000274),(689,1000275),(702,1000308),(703,1000316),(208,1009320),(212,1009321),
               (740,3000153),(712,1000349),(727,3000633),(716,1000379),(717,1000381),(725,1000409)) as x(id,pcid)
  where f.id = x.id and f.pcid is null
    and exists (select 1 from entities e where e.pcid = x.pcid);

  select next_pcid, max_id into v_next, v_max from pcid_blocks where block_id = 1 for update;

  for r in
    select lower(drug_name) as k, min(drug_name) as drug_name, min(schedule_num) as sch
    from federal_controlled_substances
    where pcid is null and importance = 'Low'
    group by lower(drug_name)
    order by min(schedule_num), lower(drug_name)
  loop
    if v_next > v_max then raise exception 'moiety block exhausted'; end if;
    v_base := trim(both '-' from regexp_replace(
                replace(replace(lower(r.drug_name), 'α', 'alpha'), 'β', 'beta'),
                '[^a-z0-9]+', '-', 'g'));
    v_slug := v_base;
    if exists (select 1 from entities where slug = v_slug) then
      v_slug := v_base || '-controlled';
    end if;
    if exists (select 1 from entities where slug = v_slug) then
      raise exception 'slug collision unresolved for %', r.drug_name;
    end if;

    insert into entities (pcid, entity_type, slug, slug_uri, name)
    values (v_next, 'moiety', v_slug, 'pc:moiety:' || v_slug, r.drug_name);

    insert into moieties (pcid, is_controlled, controlled_schedule, term_type, base_name,
                          statute_citation, rx_status, primary_source, source_count)
    values (v_next, true, 'CS-' || r.sch, 'Core moiety', upper(r.drug_name),
            '21 CFR § 1308.' || (10 + r.sch), 'Controlled CS-' || r.sch,
            'Pharmacy Commons lists import 2026-10-30 (Controlled_Substances.xlsx; DEA Orange Book)', 1);

    update federal_controlled_substances set pcid = v_next, updated_at = now()
    where lower(drug_name) = r.k and pcid is null;

    v_next := v_next + 1;
    n := n + 1;
  end loop;

  update pcid_blocks set next_pcid = v_next where block_id = 1;
  raise notice 'minted % moieties; next_pcid now %', n, v_next;
end $$;
