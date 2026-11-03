-- Phase 34d — ferumoxides is a pharmacologic class, not a moiety (Joshua, 2026-11-03)
-- Destination: db/phase34d_ferumoxides_to_class.sql   (run after 34c)
-- Ruling: ferumoxytol is the moiety; ferumoxides is a class. Moiety 1001440 is retired and replaced by a new
-- block-5 class record (curated, source_system PharmacyCommons, slug "ferumoxides"; no direct members yet, so
-- list_classes() hides it until it has some; the page works by slug).
-- Pattern = phase 25a / 23e: every FK to entities(pcid) is re-pointed row by row, the old PCID goes to pcid_retired
-- with replaced_by_pcid, tagged pc.change_source. Two exceptions, because a class cannot be a has_component object
-- or an FDA ingredient moiety: fda_product_ingredients.moiety_pcid and the Feridex has_component triple's object
-- go to FDA's own active moiety, Iron 1009810 (what active_moiety_pcid already said). Joshua can re-point them.
-- Everything else (class memberships of the drug, dictionary terms, label link, GSRS structure row, rxclass/rxnorm/
-- classyfire staging) moves to the class. Old slug is renamed first so the class can take "ferumoxides".
-- Applied 2026-11-03 via execute_sql after a dry run (v_dry = true): new class PCID 5004982, recorded by hand in schema_migrations as
-- 20261103224500 phase34d_ferumoxides_to_class; the three matviews were refreshed afterwards; security advisors unchanged.
-- All-or-nothing; v_dry = true runs everything and raises an exception with the summary, keeping nothing.
-- Afterwards (separate statements, not inside a transaction):
--   refresh materialized view concurrently public.moiety_hierarchy;
--   refresh materialized view concurrently public.ingredient_moiety_map;
--   refresh materialized view concurrently public.entity_brand_names;
do $$
declare
  v_dry boolean := false;
  v_old constant bigint := 1001440;
  v_iron constant bigint := 1009810;
  v_new bigint; v_target bigint;
  fk record; ct tid; v_sum jsonb := '{}'::jsonb; v_key text;
  nofk text[][] := array[['federal_controlled_substances','pcid'],['dictionary_terms','source_pcid'],
                         ['class_review_queue','pcid'],['stg_name_index','pcid']];
begin
  perform set_config('pc.change_source','phase34d_ferumoxides_to_class',true);

  if not exists (select 1 from public.moieties where pcid=v_old and lower(base_name)='ferumoxides') then raise exception 'source moiety missing'; end if;
  if not exists (select 1 from public.moieties where pcid=v_iron and term_type='Core moiety') then raise exception 'iron moiety missing'; end if;

  update public.pcid_blocks set next_pcid = next_pcid + 1 where block_id = 5 returning next_pcid - 1 into v_new;
  if v_new is null or v_new not between 5000001 and 5999999 then raise exception 'bad minted pcid %', v_new; end if;

  update public.entities set slug='ferumoxides-retiring-'||v_old, slug_uri='pc:moiety:ferumoxides-retiring-'||v_old where pcid=v_old;
  insert into public.entities(pcid, entity_type, slug, slug_uri, name) values (v_new,'class','ferumoxides','pc:class:ferumoxides','Ferumoxides');
  insert into public.drug_classes(pcid, class_type, source_system, member_count) values (v_new,'curated','PharmacyCommons',0);

  delete from public.moieties where pcid=v_old;

  for fk in select c.conrelid::regclass::text t, a.attname col
            from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
            where c.contype='f' and c.confrelid='public.entities'::regclass
              and c.conrelid<>'public.pcid_retired'::regclass loop
    v_target := case when (fk.t='fda_product_ingredients' and fk.col='moiety_pcid')
                       or (fk.t='clinical_statements' and fk.col='object_pcid') then v_iron else v_new end;
    for ct in execute format('select ctid from %s where %I=%L', fk.t, fk.col, v_old) loop
      v_key := fk.t||'.'||fk.col;
      begin
        execute format('update %s set %I=%L where ctid=%L', fk.t, fk.col, v_target, ct);
        v_sum := jsonb_set(v_sum, array[v_key||' -> '||v_target], to_jsonb(coalesce((v_sum->>(v_key||' -> '||v_target))::int,0)+1));
      exception when unique_violation or check_violation then
        execute format('delete from %s where ctid=%L', fk.t, ct);
        v_sum := jsonb_set(v_sum, array[v_key||' DROPPED'], to_jsonb(coalesce((v_sum->>(v_key||' DROPPED'))::int,0)+1));
      end;
    end loop;
  end loop;
  for i in 1..array_length(nofk,1) loop
    continue when to_regclass('public.'||nofk[i][1]) is null;
    for ct in execute format('select ctid from public.%I where %I=%L', nofk[i][1], nofk[i][2], v_old) loop
      execute format('update public.%I set %I=%L where ctid=%L', nofk[i][1], nofk[i][2], v_new, ct);
      v_sum := jsonb_set(v_sum, array[nofk[i][1]||'.'||nofk[i][2]||' -> class'], to_jsonb(coalesce((v_sum->>(nofk[i][1]||'.'||nofk[i][2]||' -> class'))::int,0)+1));
    end loop;
  end loop;

  delete from public.entities where pcid=v_old;
  insert into public.pcid_retired(pcid, reason, replaced_by_pcid) values
    (v_old, 'Moiety "ferumoxides" UNII G6N3J05W84 re-filed as pharmacologic class (ferumoxytol is the moiety), replaced by class '||v_new||' (phase 34d)', v_new);

  v_sum := jsonb_set(v_sum, '{new class pcid}', to_jsonb(v_new));
  if v_dry then raise exception 'DRY RUN OK: %', v_sum; end if;
end $$;
