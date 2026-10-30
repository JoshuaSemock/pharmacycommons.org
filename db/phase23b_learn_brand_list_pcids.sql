-- Phase 23b — learn_brand_list: link to PCIDs, apply Joshua's 2026-10-29 decisions, mint missing records
-- Destination: db/phase23b_learn_brand_list_pcids.sql   (run after 23a)
-- Applied 2026-10-29: 23b_1 and 23b_2 via apply_migration; the rest (decisions + 23b_3 minting) via execute_sql.
-- Minted (tagged pc.change_source = 'phase23b_brand_list'):
--   block 1 moieties     1015681-1015694  (14: vaccines, mecloqualone, mephobarbital, normethandrone, levomefolate)
--   block 2 combinations 2002591-2002611  (21, each with has_component triples to block-1 moieties)
--   block 4 formulations 4006582-4006891  (310 brands; has_component triple to the generic's moiety/components)
-- Decisions (Joshua, 2026-10-29): multi-brand cells keep the first brand only; devices removed (Caya, Paragard, Surgicel,
--   Synvisc); "Indocyin" -> Indocybin; "Depakote Sprikle" -> Depakote Sprinkle; generics with no record are minted.
-- Held: Xylocaine (1002968) and Indopan (1009465) — a moiety record named like the brand already owns the slug.
-- Rows whose brand cell holds a generic/drug name are 'excluded' (25 ids listed below).

-- 23b_1 ------------------------------------------------------------------------------------------------
alter table public.learn_brand_list
  add column if not exists status text not null default 'pending'
    check (status in ('pending','ready','needs_mint','held','excluded')),
  add column if not exists review_note text;

with fm as (select lower(name) n, min(pcid) pcid from entities where entity_type='formulation' group by 1)
update public.learn_brand_list l set brand_pcid = coalesce(l.brand_pcid, fm.pcid), brand_match = coalesce(l.brand_match,'name')
from fm where fm.n = lower(l.brand_name);

with g as (select lower(name) n, min(pcid) pcid from entities where entity_type in ('moiety','combination') group by 1)
update public.learn_brand_list l set generic_pcid = coalesce(l.generic_pcid, g.pcid), generic_match = coalesce(l.generic_match,'name')
from g where g.n = lower(trim(regexp_replace(l.generic_name,'\s*\(.*\)\s*',' ','g')));

with comp as (select subject_pcid, (array_agg(distinct object_pcid))[1] o, count(distinct object_pcid) c from clinical_statements where predicate='has_component' and object_pcid is not null group by 1)
update public.learn_brand_list l set generic_pcid = comp.o, generic_match = 'formulation_component'
from comp where comp.subject_pcid = l.brand_pcid and comp.c = 1 and l.generic_pcid is null;

with comp as (select subject_pcid, array_agg(distinct object_pcid) objs from clinical_statements where predicate='has_component' and object_pcid is not null group by 1)
update public.learn_brand_list l set review_note = 'sheet generic differs from FDA component triple(s)'
from comp where comp.subject_pcid = l.brand_pcid and l.generic_match='name' and not (l.generic_pcid = any(comp.objs));

-- 23b_2 ------------------------------------------------------------------------------------------------
create or replace function pg_temp.k(t text) returns text language sql immutable as $$
 select string_agg(x, '|' order by x) from (
  select trim(regexp_replace(regexp_replace(c, '\s+(hcl|hydrochloride|sodium|sulfate|tartrate|bitartrate|mdi|dpi|ophthalmic|topical|oral|ring|er|acetate)\s*$', '', 'g'),'\s+',' ','g')) x
  from regexp_split_to_table(lower(regexp_replace(regexp_replace(t,'\s*\(.*?\)\s*',' ','g'),'\s+with\s+electrolytes|\s+with iron','','g')), '\s*(/|;|,| and |-)\s*') c
 ) s where x<>'' $$;
with ck as (select pg_temp.k(name) k, min(pcid) pcid, count(*) c from entities where entity_type='combination' group by 1)
update public.learn_brand_list l
set generic_pcid = ck.pcid, generic_match = 'combo_key',
    review_note = case when ck.c>1 then coalesce(l.review_note||'; ','')||'duplicate combination records; lowest PCID used' else l.review_note end
from ck where l.generic_pcid is null and ck.k = pg_temp.k(l.generic_name);
with mk as (select pg_temp.k(name) k, min(pcid) pcid, count(*) c from entities where entity_type='moiety' group by 1)
update public.learn_brand_list l set generic_pcid = mk.pcid, generic_match = 'moiety_key'
from mk where l.generic_pcid is null and mk.c = 1 and mk.k = pg_temp.k(l.generic_name);

-- 23b_decisions (execute_sql) -------------------------------------------------------------------------
update learn_brand_list set status='excluded', review_note='brand column holds a generic/drug name or non-product, not a brand'
 where sheet_id in (306,405,420,423,436,437,449,453,456,492,520,542,553,558,559,562,588,632,414,1045,1060,582,54,204,342);
update learn_brand_list set review_note = coalesce(review_note||'; ','')||'original cell: '||brand_name,
  brand_name = trim(split_part(replace(brand_name,',',';'),';',1)) where brand_name ~ '[;,]';
update learn_brand_list set status='excluded', review_note='device (removed per Joshua 2026-10-29)' where sheet_id in (93,410,877,881);
update learn_brand_list set review_note='brand corrected from "Indocyin"', brand_name='Indocybin', generic_name='psilocybin', generic_pcid=1000024, generic_match='name' where sheet_id=1071;
update learn_brand_list set review_note='generic corrected from "AMT"', generic_name='alpha-methyltryptamine' where sheet_id=1072;
update learn_brand_list set review_note='brand corrected from "Depakote Sprikle"', brand_name='Depakote Sprinkle' where sheet_id=148;
-- re-run the name / key matching above for the corrected rows, then map salt/dose-form generics to their parent moiety:
with m(g,p) as (values ('carbamide peroxide otic',1006850),('chlorpheniramine maleate',1000231),('dihydrocodeine combination',1000033),('dihydrocodeine preparations',1000033),('doxorubicin hcl liposomal',1001262),('epoetin',1001343),('erythromycin ethylsuccinate',1001368),('ferrous gluconate',1003159),('fluoride topical',1003020),('lsd',1000017),('menthol topical',1010544),('metoprolol succinate',1001961),('mometasone oral inhalation',1010839),('naphazoline ophthalmic',1003035),('olopatadine ophthalmic',1011704),('opium combination (paregoric)',1003075),('opium preparations',1003075),('oxycodone hcl er',1000050),('pancreatic enzymes',1002180),('pcp',1000022),('pentobarbital suppository',1000052),('thyroid desiccated',1002772),('chlorodehydromethyltestosterone',1000461),('regular insulin human, concentrated',1000101))
update learn_brand_list l set generic_pcid=m.p, generic_match='salt_form_to_moiety' from m where l.status='pending' and l.generic_pcid is null and lower(l.generic_name)=m.g;
update learn_brand_list set generic_pcid=2002468, generic_match='name' where status='pending' and lower(generic_name)='multivitamin, prenatal';

-- 23b_3 minting (execute_sql; moieties, combinations, then brands) -------------------------------------
select set_config('pc.change_source','phase23b_brand_list',true);

create or replace function pg_temp.slugify(t text) returns text language sql immutable as
$f$ select trim(both '-' from regexp_replace(lower(t),'[^a-z0-9]+','-','g')) $f$;

create or replace function pg_temp.mint(p_block int, p_type text, p_name text) returns bigint language plpgsql as $f$
declare v_pcid bigint; v_slug text := pg_temp.slugify(p_name); v_clash text;
begin
  select entity_type||' '||pcid into v_clash from public.entities where slug=v_slug;
  if v_clash is not null then return null; end if;
  update public.pcid_blocks set next_pcid=next_pcid+1 where block_id=p_block returning next_pcid-1 into v_pcid;
  insert into public.entities(pcid,entity_type,slug,slug_uri,name) values (v_pcid,p_type,v_slug,'pc:'||p_type||':'||v_slug,p_name);
  return v_pcid;
end $f$;

create or replace function pg_temp.moiety_by_name(t text) returns bigint language sql as $f$
 select coalesce(
  (select min(pcid) from public.entities where entity_type='moiety' and lower(name)=lower(trim(t))),
  (select min(pcid) from public.entities where entity_type='moiety' and lower(name)=case lower(trim(t))
     when 'ferrous fumarate' then 'ferrous' when 'bismuth' then 'bismuth subcitrate potassium'
     when 'norethindrone acetate' then 'norethindrone' when 'levomefolate calcium' then 'levomefolate'
     when 'clavulanate potassium' then 'clavulanate' else regexp_replace(lower(trim(t)),'\s+(hcl|hydrochloride|acetate|sulfate|maleate|sodium)$','') end)) $f$;

do $$
declare r record; v_pcid bigint; v_ids bigint[]; v_c text; v_cp bigint; v_name text; v_prev bigint; v_slug text; v_clash text;
begin
  -- A. moieties (block 1)
  for r in select * from (values
    ('haemophilus influenzae type b vaccine', array['haemophilus influenzae serotype b vaccine','haemophilus influenzae type b vaccine']),
    ('human papillomavirus vaccine', array['human papillomavirus vaccine']),
    ('influenza virus vaccine', array['influenza virus vaccine']),
    ('influenza live attenuated vaccine', array['influenza live attenuated (laiv4) vaccine']),
    ('meningococcal serogroup b vaccine', array['meningococcal serotype b vaccine']),
    ('measles, mumps and rubella vaccine', array['measles, mumps and rubella vaccine']),
    ('rotavirus vaccine', array['rotavirus 1 vaccine','rotavirus vaccine']),
    ('tdap vaccine', array['tdap vaccine (tetanus, diptheria, pertussis)']),
    ('varicella vaccine', array['varicella vaccine']),
    ('zoster vaccine', array['zoster vaccine']),
    ('hepatitis a and b vaccine', array['hepatitis a/b vaccine']),
    ('mecloqualone', array['mecloqualone']),
    ('mephobarbital', array['mephobarbital']),
    ('normethandrone', array['normethandrone']),
    
    ('levomefolate', array[]::text[])
  ) as t(nm, aliases) loop
    select min(pcid) into v_pcid from public.entities where entity_type='moiety' and lower(name)=lower(r.nm);
    if v_pcid is null then
      v_pcid := pg_temp.mint(1,'moiety',r.nm);
      if v_pcid is null then raise exception 'slug clash for moiety %', r.nm; end if;
      insert into public.moieties(pcid,class_name,origin,term_type,base_name,primary_source,source_count)
        values (v_pcid,'Unassigned','learn_brand_list','Core moiety',r.nm,'Learn brand list (Brands.xlsx)',1);
    end if;
    update public.learn_brand_list set generic_pcid=v_pcid, generic_match='minted_moiety'
      where status='pending' and generic_pcid is null and lower(generic_name)=any(r.aliases);
  end loop;

  -- B. combinations (block 2)
  for r in select * from (values
    ('acetaminophen/dextromethorphan/doxylamine', array['acetaminophen-dextromethorphan-doxylamine']),
    ('acetaminophen/codeine', array['acetaminophen/ codeine']),
    ('albuterol/ipratropium', array['albuterol/ ipratropium']),
    ('amlodipine/benazepril', array['amlodipine/benazepril']),
    ('amoxicillin/clavulanate', array['amoxicillin/clavulanate']),
    ('bacitracin/neomycin/polymyxin B', array['bacitracin/neomycin/polymyxin b topical']),
    ('bismuth/metronidazole/tetracycline', array['bismuth/metronidazole/tetracycline']),
    ('bisoprolol/hydrochlorothiazide', array['bisoprolol/hydrochlorothiazide']),
    ('dextroamphetamine/amphetamine', array['dextroamphetamine-amphetamine mixed salts']),
    ('drospirenone/ethinyl estradiol/levomefolate', array['drospirenone, ethinyl estradiol, and levomefolate']),
    ('emtricitabine/tenofovir', array['emtricitabine/tenofovir']),
    ('esomeprazole/naproxen', array['esomeprazole/naproxen']),
    ('ethinyl estradiol/etonogestrel', array['ethinyl estradiol/etonogestrel ring']),
    ('fluticasone/salmeterol', array['fluticasone/ salmeterol']),
    ('guaifenesin/dextromethorphan', array['guaifenesin/dextromethorphan']),
    ('losartan/hydrochlorothiazide', array['losartan/ hydrochlorothiazide']),
    ('norethindrone acetate/ethinyl estradiol/ferrous fumarate', array['norethindrone acetate, ethinyl estradiol, and ferrous fumarate']),
    ('olmesartan/hydrochlorothiazide', array['olmesartan/hydrochlorothiazide']),
    ('rilpivirine/emtricitabine/tenofovir alafenamide', array['rilpivirine/emtricitabine/tenofovir alafenamide']),
    ('timolol/dorzolamide', array['timolol/ dorzolamide']),
    ('naphazoline/pheniramine', array['naphazoline-pheniramine ophthalmic'])
  ) as t(nm, aliases) loop
    select min(pcid) into v_pcid from public.entities where entity_type='combination' and lower(name)=lower(r.nm);
    if v_pcid is null then
      v_ids := array(select pg_temp.moiety_by_name(x) from unnest(string_to_array(r.nm,'/')) x);
      if array_position(v_ids,null) is not null then raise exception 'unresolved component in %', r.nm; end if;
      v_pcid := pg_temp.mint(2,'combination',r.nm);
      if v_pcid is null then raise exception 'slug clash for combination %', r.nm; end if;
      insert into public.combinations(pcid,class_name,origin,term_type,base_name,primary_source,source_count)
        values (v_pcid,'Unassigned','learn_brand_list','Combination product',r.nm,'Learn brand list (Brands.xlsx)',1);
      foreach v_cp in array v_ids loop
        insert into public.clinical_statements(subject_pcid,predicate,object_pcid,source_agency,source_doc_id)
        select v_pcid,'has_component',v_cp,'Pharmacy Commons','Brands.xlsx learn_brand_list'
        where not exists (select 1 from public.clinical_statements where subject_pcid=v_pcid and predicate='has_component' and object_pcid=v_cp);
      end loop;
    end if;
    update public.learn_brand_list set generic_pcid=v_pcid, generic_match='minted_combination'
      where status='pending' and generic_pcid is null and lower(generic_name)=any(r.aliases);
  end loop;

  -- C. brands (block 4)
  for r in select sheet_id, brand_name, generic_pcid from public.learn_brand_list
           where status='pending' and brand_pcid is null and generic_pcid is not null order by sheet_id loop
    v_slug := pg_temp.slugify(r.brand_name);
    select pcid into v_prev from public.entities where slug=v_slug and entity_type='formulation';
    if v_prev is not null then
      update public.learn_brand_list set brand_pcid=v_prev, brand_match='name' where sheet_id=r.sheet_id; continue;
    end if;
    select entity_type||' '||pcid into v_clash from public.entities where slug=v_slug;
    if v_clash is not null then
      update public.learn_brand_list set status='held', review_note=coalesce(review_note||'; ','')||'slug "'||v_slug||'" already used by '||v_clash where sheet_id=r.sheet_id; continue;
    end if;
    v_pcid := pg_temp.mint(4,'formulation',r.brand_name);
    insert into public.formulations(pcid,class_name,origin,term_type,base_name,primary_source,source_count)
      values (v_pcid,'Unassigned','learn_brand_list','Brand / proprietary formulation',upper(r.brand_name),'Learn brand list (Brands.xlsx)',1);
    -- component links: moiety generic -> itself; combination generic -> its components
    insert into public.clinical_statements(subject_pcid,predicate,object_pcid,source_agency,source_doc_id)
    select distinct v_pcid,'has_component',o,'Pharmacy Commons','Brands.xlsx sheet_id '||r.sheet_id from (
      select r.generic_pcid o where exists (select 1 from public.entities where pcid=r.generic_pcid and entity_type='moiety')
      union
      select object_pcid from public.clinical_statements where subject_pcid=r.generic_pcid and predicate='has_component' and object_pcid is not null
    ) q;
    update public.learn_brand_list set brand_pcid=v_pcid, brand_match='minted' where sheet_id=r.sheet_id;
  end loop;

  update public.learn_brand_list set status='ready' where status='pending' and brand_pcid is not null;
  update public.learn_brand_list set status='held', review_note=coalesce(review_note||'; ','')||'no generic record' where status='pending';
end $$;
select status, count(*) from public.learn_brand_list group by 1 order by 1;
