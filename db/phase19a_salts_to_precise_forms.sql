-- Phase 19a — move salt rows out of block 1 into block 3 (precise forms)
-- Decision: Joshua, 2026-10-13 (Cleanup_Review sheet, NonCore_Moieties, "Move to precise form" and
-- "Mint parent + move" rows). 43 rows: 41 whose non-salt moiety already exists, 2 (gadoterate,
-- halobetasol) whose parent is minted here.
--
-- Not touched: 9 mineral/ionic salts (kept as-is), pyrithione zinc (relabel, separate step), all
-- formulation / combination / scheduling-text rows (separate steps).
--
-- For each salt: mint a block-3 PCID from pcid_blocks, copy the moieties row to precise_forms
-- (synonym_of_pcid -> parent), re-point EVERY foreign key that references entities(pcid) from the old
-- PCID to the new one (found from pg_constraint, so no table is missed), delete the old moiety and
-- entity rows, give the new entity the old slug, and record the old PCID in pcid_retired with
-- replaced_by_pcid (the API 301s retired PCIDs).
-- All-or-nothing: one DO block; any error (e.g. a unique-key clash) rolls everything back.
-- v_dry = true runs everything and then raises an exception carrying the summary, so nothing is kept.
-- After applying: refresh materialized view concurrently public.moiety_hierarchy;
--   then ingredient_moiety_map, then entity_brand_names (see CLAUDE.md "Matview dependency chain").

do $$
declare
  v_dry   boolean := true;           -- set to false for the real run
  r       record;
  e       entities%rowtype;
  fk      record;
  v_new   bigint;
  v_par   bigint;
  v_slug  text;
  n       bigint;
  v_rows  jsonb := '{}'::jsonb;
  v_moved int := 0;
begin
  perform set_config('pc.change_source', 'phase19a-salts-2026-10-13', true);

  create temp table salt_map (old_pcid bigint primary key, parent_pcid bigint, parent_name text) on commit drop;
  insert into salt_map (old_pcid, parent_pcid) values
    (1000602,1005409),(1000616,1003099),(1000646,1003102),(1000741,1003112),(1002992,1003113),
    (1000759,1003114),(1002993,1006152),(1000822,1003271),(1000841,1003272),(1003117,1000856),
    (1001037,1003129),(1001039,1003130),(1003133,1003085),(1003010,1003137),(1001194,1003146),
    (1001258,1003148),(1003014,1003149),(1003153,1008311),(1001403,1003156),(1001459,1003160),
    (1001572,1003167),(1001611,1003171),(1001705,1003179),(1003181,1001708),(1003190,1001812),
    (1001828,1003194),(1002056,1011391),(1002087,1011542),(1002108,1003215),(1002123,1003216),
    (1002230,1003217),(1002409,1002408),(1002529,1003238),(1002541,1013243),(1002554,1003240),
    (1002690,1013724),(1002752,1013945),(1002840,1003273),(1003255,1014295),(1003261,1002916),
    (1002918,1003262);
  insert into salt_map (old_pcid, parent_pcid, parent_name) values
    (1001521, null, 'gadoterate'), (1001592, null, 'halobetasol');

  -- guard: every old row must still be a Salt-form moiety, every named parent must be a moiety
  if exists (select 1 from salt_map s left join moieties m on m.pcid = s.old_pcid
              where m.pcid is null or m.term_type <> 'Salt form') then
    raise exception 'a mapped PCID is not a Salt-form moiety';
  end if;
  if exists (select 1 from salt_map s left join moieties p on p.pcid = s.parent_pcid
              where s.parent_pcid is not null and p.pcid is null) then
    raise exception 'a mapped parent is not a moiety';
  end if;

  -- 1. mint the two missing parent moieties
  for r in select * from salt_map where parent_pcid is null loop
    v_slug := pc_slugify(r.parent_name);
    if exists (select 1 from entities where slug = v_slug) then
      raise exception 'slug % already exists', v_slug;
    end if;
    update pcid_blocks set next_pcid = next_pcid + 1 where block_id = 1 returning next_pcid - 1 into v_par;
    insert into entities (pcid, entity_type, slug, slug_uri, name)
      values (v_par, 'moiety', v_slug, 'pc:moiety:' || v_slug, r.parent_name);
    insert into moieties (pcid, term_type, base_name, origin, primary_source, is_controlled, source_count)
      values (v_par, 'Core moiety', upper(r.parent_name), 'phase19a', 'phase19a salt split', false, 1);
    update salt_map set parent_pcid = v_par where old_pcid = r.old_pcid;
    v_rows := v_rows || jsonb_build_object('minted_parent_' || v_slug, v_par);
  end loop;

  -- 2. move each salt
  for r in select * from salt_map order by old_pcid loop
    select * into e from entities where pcid = r.old_pcid;
    update pcid_blocks set next_pcid = next_pcid + 1 where block_id = 3 returning next_pcid - 1 into v_new;

    insert into entities (pcid, entity_type, slug, slug_uri, name)
      values (v_new, 'precise_form', e.slug || '-p19a', 'pc:precise_form:' || e.slug || '-p19a', e.name);

    insert into precise_forms (pcid, class_pcid, class_name, is_controlled, controlled_schedule, origin, term_type,
        base_name, synonym_of_pcid, block_exception, primary_brand, drugbank_id, cas, unii, inchi_key, ndc_codes,
        fda_applnos, lactmed_id, legal_status, statute_citation, mpje_relevance, fda_marketing_status, rx_status,
        primary_source, source_count)
      select v_new, class_pcid, class_name, is_controlled, controlled_schedule, origin, 'Salt form',
        base_name, r.parent_pcid, null, primary_brand, drugbank_id, cas, unii, inchi_key, ndc_codes,
        fda_applnos, lactmed_id, legal_status, statute_citation, mpje_relevance, fda_marketing_status, rx_status,
        primary_source, source_count
      from moieties where pcid = r.old_pcid;

    -- re-point every FK to entities(pcid), except each entity table's own pcid column
    for fk in
      select c.conrelid::regclass::text as tbl, a.attname::text as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f' and c.confrelid = 'public.entities'::regclass
        and not (c.conrelid in ('public.moieties'::regclass, 'public.precise_forms'::regclass,
                                'public.combinations'::regclass, 'public.formulations'::regclass)
                 and a.attname = 'pcid')
        and c.conrelid <> 'public.pcid_retired'::regclass
    loop
      execute format('update %s set %I = $1 where %I = $2', fk.tbl, fk.col, fk.col) using v_new, r.old_pcid;
      get diagnostics n = row_count;
      if n > 0 then
        v_rows := jsonb_set(v_rows, array[fk.tbl || '.' || fk.col],
                            to_jsonb(coalesce((v_rows ->> (fk.tbl || '.' || fk.col))::bigint, 0) + n));
      end if;
    end loop;

    delete from moieties where pcid = r.old_pcid;
    delete from entities where pcid = r.old_pcid;
    update entities set slug = e.slug, slug_uri = 'pc:precise_form:' || e.slug where pcid = v_new;
    insert into pcid_retired (pcid, reason, replaced_by_pcid)
      values (r.old_pcid, 'phase19a: salt moved from block 1 to block 3 precise form', v_new);
    v_moved := v_moved + 1;
  end loop;

  -- checks
  if (select count(*) from pcid_retired where reason like 'phase19a:%') <> 43 then
    raise exception 'expected 43 retired PCIDs';
  end if;

  if v_dry then
    raise exception 'DRYRUN OK: moved %, repointed %', v_moved, v_rows;
  end if;
end $$;
