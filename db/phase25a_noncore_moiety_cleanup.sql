-- Phase 25a — clean up the 137 non-core moiety rows (Joshua, 2026-10-30)
-- Destination: db/phase25a_noncore_moiety_cleanup.sql   (run after 24k)
--   1. delete the junk row 1000073 (Georgia statute text filed as "sodium oxybate, when the fda approved form…"):
--      retired with replaced_by = 1000025 sodium oxybate, so the API 301s it
--   2. relabel 13 single compounds filed as "Combination product" to "Core moiety"
--   3. merge 40 salt-form moieties into their parent drug moiety (atropine sulfate -> atropine, …)
--   4. merge 14 brand/proprietary product rows into their generic drug moiety (silver sulfadiazine cream -> silver sulfadiazine, …)
-- NOT merged (kept, with reason): salts/products whose only parent is a bare element or ion (potassium, sodium, magnesium, zinc,
--   lithium, aluminum, cupric) — the phase 10 rule says a bare ion is never the pharmacist-facing record; salts with no parent
--   record (halobetasol, gadoterate, ammonium lactate, magnesium salicylate, pyrithione zinc); true combinations (vaccines etc.);
--   products with no single parent (lactated ringers, vitamin b12 injection, …).
-- Pattern = phase 23e: every FK to entities(pcid) is re-pointed row by row (a row that would duplicate one the survivor already has
-- is dropped), plus the four pcid columns that carry no FK; old PCIDs go to pcid_retired with replaced_by_pcid.
-- Salt UNII/CAS are NOT copied to the parent (they identify the salt, not the parent); they are kept in pcid_retired.reason.
-- All-or-nothing; v_dry = true runs everything and raises an exception with the summary, keeping nothing.
-- Afterwards (separate statements, not inside a transaction):
--   refresh materialized view concurrently public.moiety_hierarchy;
--   refresh materialized view concurrently public.ingredient_moiety_map;
--   refresh materialized view concurrently public.entity_brand_names;
do $$
declare
  v_dry boolean := true;
  r record; fk record; ct tid; v_sum jsonb := '{}'::jsonb; v_reason text; v_n int;
  nofk text[][] := array[['federal_controlled_substances','pcid'],['dictionary_terms','source_pcid'],
                         ['class_review_queue','pcid'],['stg_name_index','pcid']];
begin
  perform set_config('pc.change_source','phase25a_noncore_moiety_cleanup',true);

  create temp table mm(old_pcid bigint primary key, new_pcid bigint not null, kind text) on commit drop;
  insert into mm values
   -- salts -> parent drug moiety (40)
   (1000602,1005409,'salt'),(1000616,1003099,'salt'),(1000646,1003102,'salt'),(1000741,1003112,'salt'),(1002992,1003113,'salt'),
   (1000759,1003114,'salt'),(1002993,1006152,'salt'),(1000822,1003271,'salt'),(1000841,1003272,'salt'),(1003117,1000856,'salt'),
   (1001037,1003129,'salt'),(1001039,1003130,'salt'),(1003133,1003085,'salt'),(1003010,1003137,'salt'),(1001194,1003146,'salt'),
   (1001258,1003148,'salt'),(1003014,1003149,'salt'),(1003153,1008311,'salt'),(1001403,1003156,'salt'),(1001459,1003160,'salt'),
   (1001572,1003167,'salt'),(1001611,1003171,'salt'),(1001705,1003179,'salt'),(1003181,1001708,'salt'),(1003190,1001812,'salt'),
   (1002056,1011391,'salt'),(1002087,1011542,'salt'),(1002108,1003215,'salt'),(1002123,1003216,'salt'),(1002230,1003217,'salt'),
   (1002409,1002408,'salt'),(1002529,1003238,'salt'),(1002541,1013243,'salt'),(1002554,1003240,'salt'),(1002690,1013724,'salt'),
   (1002752,1013945,'salt'),(1002840,1003273,'salt'),(1003255,1014295,'salt'),(1003261,1002916,'salt'),(1002918,1003262,'salt'),
   -- brand / proprietary product rows -> generic drug moiety (14)
   (1000159,1002994,'product'),(1000860,1006635,'product'),(1000189,1000119,'product'),(1001728,1003183,'product'),
   (1000104,1003192,'product'),(1001959,1003206,'product'),(1002381,1003229,'product'),(1002382,1003230,'product'),
   (1002567,1003241,'product'),(1002583,1013415,'product'),(1000723,1013415,'product'),(1002650,1013642,'product'),
   (1000551,1003060,'product'),(1000554,1003062,'product'),
   -- junk: statute text filed as a moiety (1)
   (1000073,1000025,'junk');

  -- guards: sources are non-core moieties, targets are Core moiety rows, no chains
  if (select count(*) from mm) <> 55 then raise exception 'expected 55 mappings, got %', (select count(*) from mm); end if;
  if exists (select 1 from mm x left join public.moieties m on m.pcid=x.old_pcid where m.pcid is null or m.term_type='Core moiety') then
    raise exception 'a source is missing or already Core moiety'; end if;
  if exists (select 1 from mm x left join public.moieties m on m.pcid=x.new_pcid where m.pcid is null or m.term_type is distinct from 'Core moiety') then
    raise exception 'a target is missing or not Core moiety'; end if;
  if exists (select 1 from mm a join mm b on a.new_pcid=b.old_pcid) then raise exception 'chained merge'; end if;

  -- 2. relabel single compounds filed as combinations (13)
  update public.moieties set term_type='Core moiety'
   where pcid in (1000248,1000249,1000438,1000441,1000271,1000272,1000446,1000448,1000453,1000419,1000422,1000371,1000429)
     and term_type='Combination product';
  get diagnostics v_n = row_count;
  if v_n <> 13 then raise exception 'relabelled % rows, expected 13', v_n; end if;
  v_sum := jsonb_set(v_sum, '{relabelled to Core moiety}', to_jsonb(v_n));

  for r in select * from mm order by kind, old_pcid loop
    select format('%s "%s"%s%s merged into parent moiety %s (phase 25a)',
                  case r.kind when 'salt' then 'Salt form' when 'product' then 'Product row' else 'Junk row' end,
                  left(e.name,80),
                  coalesce(' UNII '||nullif(m.unii,''),''), coalesce(' CAS '||nullif(m.cas,''),''), r.new_pcid)
      into v_reason from public.entities e join public.moieties m on m.pcid=e.pcid where e.pcid=r.old_pcid;
    if r.kind='junk' then v_reason := 'Statute text filed as a moiety; deleted, replaced by sodium oxybate (phase 25a)'; end if;

    delete from public.moieties where pcid=r.old_pcid;
    -- FK columns
    for fk in select c.conrelid::regclass::text t, a.attname col
              from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
              where c.contype='f' and c.confrelid='public.entities'::regclass
                and c.conrelid<>'public.pcid_retired'::regclass loop
      for ct in execute format('select ctid from %s where %I=%L', fk.t, fk.col, r.old_pcid) loop
        begin
          execute format('update %s set %I=%L where ctid=%L', fk.t, fk.col, r.new_pcid, ct);
          v_sum := jsonb_set(v_sum, array[fk.t||'.'||fk.col||' moved'], to_jsonb(coalesce((v_sum->>(fk.t||'.'||fk.col||' moved'))::int,0)+1));
        exception when unique_violation or check_violation then
          execute format('delete from %s where ctid=%L', fk.t, ct);
          v_sum := jsonb_set(v_sum, array[fk.t||'.'||fk.col||' dropped'], to_jsonb(coalesce((v_sum->>(fk.t||'.'||fk.col||' dropped'))::int,0)+1));
        end;
      end loop;
    end loop;
    -- pcid columns that carry no FK
    for i in 1..array_length(nofk,1) loop
      for ct in execute format('select ctid from public.%I where %I=%L', nofk[i][1], nofk[i][2], r.old_pcid) loop
        begin
          execute format('update public.%I set %I=%L where ctid=%L', nofk[i][1], nofk[i][2], r.new_pcid, ct);
          v_sum := jsonb_set(v_sum, array[nofk[i][1]||'.'||nofk[i][2]||' moved'], to_jsonb(coalesce((v_sum->>(nofk[i][1]||'.'||nofk[i][2]||' moved'))::int,0)+1));
        exception when unique_violation or check_violation then
          execute format('delete from public.%I where ctid=%L', nofk[i][1], ct);
          v_sum := jsonb_set(v_sum, array[nofk[i][1]||'.'||nofk[i][2]||' dropped'], to_jsonb(coalesce((v_sum->>(nofk[i][1]||'.'||nofk[i][2]||' dropped'))::int,0)+1));
        end;
      end loop;
    end loop;
    delete from public.entities where pcid=r.old_pcid;
    insert into public.pcid_retired(pcid, reason, replaced_by_pcid) values (r.old_pcid, v_reason, r.new_pcid);
    v_sum := jsonb_set(v_sum, array['merged '||r.kind], to_jsonb(coalesce((v_sum->>('merged '||r.kind))::int,0)+1));
  end loop;

  if v_dry then raise exception 'DRY RUN OK: %', v_sum; end if;
end $$;
