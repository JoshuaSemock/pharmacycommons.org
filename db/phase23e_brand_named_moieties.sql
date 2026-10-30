-- Phase 23e — merge two brand-named moiety records into their real moieties (Joshua, 2026-10-29: "correct them")
-- Destination: db/phase23e_brand_named_moieties.sql   (run after 23d)
--   1002968 "xylocaine"  -> 1003192 lidocaine
--   1009465 "Indopan"    -> 1000313 alpha-methyltryptamine (amt)   (1009465 is the DrugBank AMT record: UNII BIK35ACJ0Q, CAS 299-26-3;
--                           its identifiers are backfilled into 1000313, COALESCE-guarded)
-- Same pattern as phase 19a: every FK to entities(pcid) is re-pointed (row by row; a row that would duplicate one the survivor
-- already has is dropped), the old moiety/entity rows are deleted and the old PCID goes to pcid_retired with replaced_by_pcid
-- (the API 301s it). That frees the slugs 'xylocaine' and 'indopan' for the brand formulations, which are then minted here.
-- APPLIED 2026-10-29 via execute_sql with v_dry := false (file keeps true so a re-read is a dry run; recorded by hand, not in schema_migrations).
-- All-or-nothing; v_dry = true runs everything and raises an exception with the summary, keeping nothing.
do $$
declare
  v_dry boolean := true;
  r record; fk record; ct tid; v_n int; v_sum jsonb := '{}'::jsonb; v_form bigint; v_slug text;
begin
  perform set_config('pc.change_source','phase23e_brand_named_moieties',true);
  create temp table mm(old_pcid bigint primary key, new_pcid bigint, brand text, sheet_id int) on commit drop;
  insert into mm values (1002968,1003192,'Xylocaine',614),(1009465,1000313,'Indopan',1072);

  -- identifiers from the retired AMT record into the survivor (never overwrite a non-blank value)
  update public.moieties s set unii=coalesce(nullif(s.unii,''),o.unii), cas=coalesce(nullif(s.cas,''),o.cas),
         drugbank_id=coalesce(nullif(s.drugbank_id,''),o.drugbank_id), inchi_key=coalesce(nullif(s.inchi_key,''),o.inchi_key)
  from public.moieties o where o.pcid=1009465 and s.pcid=1000313;

  for r in select * from mm loop
    delete from public.moieties where pcid=r.old_pcid;                    -- satellite row of the retired record
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
    delete from public.entities where pcid=r.old_pcid;
    insert into public.pcid_retired(pcid, reason, replaced_by_pcid)
      values (r.old_pcid, 'Brand name filed as a moiety; merged into its real moiety (phase 23e)', r.new_pcid);

    -- mint the brand formulation on the freed slug and link it to the moiety
    v_slug := lower(r.brand);
    update public.pcid_blocks set next_pcid=next_pcid+1 where block_id=4 returning next_pcid-1 into v_form;
    insert into public.entities(pcid,entity_type,slug,slug_uri,name) values (v_form,'formulation',v_slug,'pc:formulation:'||v_slug,r.brand);
    insert into public.formulations(pcid,class_name,origin,term_type,base_name,primary_source,source_count)
      values (v_form,'Unassigned','learn_brand_list','Brand / proprietary formulation',upper(r.brand),'Learn brand list (Brands.xlsx)',1);
    insert into public.clinical_statements(subject_pcid,predicate,object_pcid,source_agency,source_doc_id)
      values (v_form,'has_component',r.new_pcid,'Pharmacy Commons','Brands.xlsx sheet_id '||r.sheet_id);
    update public.learn_brand_list set brand_pcid=v_form, generic_pcid=r.new_pcid, brand_match='minted', status='ready',
      generic_match='name', review_note=coalesce(review_note||'; ','')||'brand-named moiety '||r.old_pcid||' merged into '||r.new_pcid
    where sheet_id=r.sheet_id;
  end loop;

  if v_dry then raise exception 'DRY RUN OK: %', v_sum; end if;
end $$;
