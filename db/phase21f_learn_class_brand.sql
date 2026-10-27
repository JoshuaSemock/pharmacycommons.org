-- Phase 21f — Learn: class_of and brand_generic generators + collections (docs/learn.md §5.2)
-- Destination: db/phase21f_learn_class_brand.sql
-- Same contract as 21c: SECURITY DEFINER, idempotent on natural_key, items start as 'draft', not executable by public roles.
--
-- class_of: "Which FDA established pharmacologic class (EPC) does <drug> belong to?"
--   answers: Notable Drugs core moieties with exactly one EPC; distractors: other EPC classes that
--   (a) contain none of the drug's EPCs, (b) are not its parent or child class, (c) have a different name,
--   (d) have at least one Notable Drugs member; ranked by shared ATC classes (hardest first), then md5.
-- brand_generic: "Which generic drug is sold under the brand <Brand>?"
--   brand gates: listed by BOTH drugsfda and rxnorm, unique to one moiety in entity_brand_names, matches an
--   FDA product whose ingredient count is 1 for every product of that brand (no combination brands). The
--   `marketed` flag is NOT used (it is wrong for e.g. Haldol). Distractors: same-EPC siblings first, never
--   sharing a UNII with the answer (guards the albuterol/salbutamol duplicate-record pairs).

create or replace function public.learn_gen_class_of()
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare nl public.lists%rowtype; v_cands int; v_rej int; v_new int;
begin
  select * into nl from public.lists where slug = 'notable-drugs' and published;
  if not found then raise exception 'notable-drugs not found'; end if;

  create temp table _np on commit drop as select pcid, name from public.learn_list_pool('notable-drugs');
  create temp table _epc on commit drop as
    select dc.pcid as class_pcid, e.name as cname, dc.parent_pcid
    from public.drug_classes dc join public.entities e on e.pcid = dc.pcid where dc.class_type = 'epc';
  create temp table _drug_epc on commit drop as
    select cm.member_pcid as pcid, cm.class_pcid
    from public.class_members cm join _epc c on c.class_pcid = cm.class_pcid
    where cm.member_pcid in (select pcid from _np);
  create temp table _cand on commit drop as select distinct class_pcid from _drug_epc;
  create temp table _epc_atc on commit drop as
    select distinct ce.class_pcid, da.class_pcid as atc
    from public.class_members ce
    join _epc e on e.class_pcid = ce.class_pcid
    join public.class_members da on da.member_pcid = ce.member_pcid
    join public.drug_classes dd on dd.pcid = da.class_pcid and dd.class_type = 'atc';
  create temp table _drug_atc on commit drop as
    select distinct da.member_pcid as pcid, da.class_pcid as atc
    from public.class_members da join public.drug_classes dd on dd.pcid = da.class_pcid and dd.class_type = 'atc'
    where da.member_pcid in (select pcid from _np);
  create index on _epc_atc (class_pcid); create index on _drug_atc (pcid);

  create temp table _picks on commit drop as
  select a.pcid, n.name as drug, a.class_pcid, ac.cname as aclass,
    (select jsonb_agg(jsonb_build_object('class_pcid', d.class_pcid, 'name', d.cname) order by d.rk)
       from (select c.class_pcid, c.cname,
                    row_number() over (order by
                      (select count(*) from _epc_atc x join _drug_atc y on y.atc = x.atc and y.pcid = a.pcid where x.class_pcid = c.class_pcid) desc,
                      md5(a.pcid::text || '-' || c.class_pcid::text)) as rk
             from _epc c
             where c.class_pcid in (select class_pcid from _cand)
               and c.class_pcid <> a.class_pcid and lower(c.cname) <> lower(ac.cname)
               and c.parent_pcid is distinct from a.class_pcid and ac.parent_pcid is distinct from c.class_pcid
               and not exists (select 1 from _drug_epc de where de.pcid = a.pcid and de.class_pcid = c.class_pcid)) d
       where d.rk <= 3) as dists
  from (select pcid, min(class_pcid) as class_pcid from _drug_epc group by pcid having count(distinct class_pcid) = 1) a
  join _np n on n.pcid = a.pcid
  join _epc ac on ac.class_pcid = a.class_pcid;

  select count(*) into v_cands from _picks;
  select count(*) into v_rej from _picks where jsonb_array_length(coalesce(dists, '[]'::jsonb)) < 3;

  insert into public.learn_items (
    natural_key, item_type, template_key, generation_method, is_official, status,
    subject_area, topic, difficulty_level, tags, primary_pcid,
    prompt, concise_answer, clinical_rationale, clinical_caveats, mcq_options,
    source_kind, source_list_pcid, source_agency, source_citation, license)
  select 'class_of:' || nl.pcid || ':' || k.pcid, 'mcq', 'class_of', 'template', true, 'draft',
    'Pharmacology', 'Drug classes (FDA EPC)', 2, array['class:epc'], k.pcid,
    format('Which FDA established pharmacologic class (EPC) does %s belong to?', k.drug), k.aclass,
    format('%s is classified in the FDA established pharmacologic class "%s".', k.drug, k.aclass),
    'A drug can belong to more than one class system; this item uses the FDA EPC only.',
    (select jsonb_agg(jsonb_build_object('id', chr(96 + q.rn::int), 'text', q.txt, 'is_correct', q.ok,
        'rationale', case when q.ok then format('%s is classified as %s.', k.drug, k.aclass) else format('%s is not an FDA EPC assigned to %s.', q.txt, k.drug) end) order by q.rn)
       from (select o.txt, o.ok, row_number() over (order by md5('class_of' || k.pcid::text || o.txt)) rn
             from (select k.aclass as txt, true as ok
                   union all select d->>'name', false from jsonb_array_elements(k.dists) d) o) q),
    'list', nl.pcid, 'FDA',
    'FDA established pharmacologic class (EPC) assignments via NLM RxClass; drug selection from the Pharmacy Commons Notable Drugs list.',
    nl.license
  from _picks k where jsonb_array_length(coalesce(k.dists, '[]'::jsonb)) = 3
  on conflict (natural_key) do nothing;
  get diagnostics v_new = row_count;

  perform public.learn_link_entities('class_of');
  drop table _picks, _np, _epc, _drug_epc, _cand, _epc_atc, _drug_atc;
  return jsonb_build_object('template', 'class_of', 'candidates_single_epc', v_cands,
    'rejected_fewer_than_3_distractors', v_rej, 'created', v_new, 'already_existed', v_cands - v_rej - v_new);
end $fn$;

create or replace function public.learn_gen_brand_generic()
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare nl public.lists%rowtype; v_np int; v_cands int; v_rej int; v_new int;
begin
  select * into nl from public.lists where slug = 'notable-drugs' and published;
  if not found then raise exception 'notable-drugs not found'; end if;

  create temp table _np on commit drop as
    select p.pcid, p.name, m.unii from public.learn_list_pool('notable-drugs') p join public.moieties m on m.pcid = p.pcid;
  select count(*) into v_np from _np;

  create temp table _brand on commit drop as
  select distinct on (b.pcid) b.pcid, n.name as drug, n.unii,
         case when b.brand_display = upper(b.brand_display) then initcap(b.brand_display) else b.brand_display end as brand
  from public.entity_brand_names b join _np n on n.pcid = b.pcid
  where b.kind = 'moiety' and b.brand_display is not null
    and b.sources @> array['drugsfda', 'rxnorm']
    and lower(b.brand_display) <> lower(n.name)
    and (select count(distinct x.pcid) from public.entity_brand_names x where x.brand_key = b.brand_key) = 1
    and exists (select 1 from public.fda_products p where upper(p.brand_name) = upper(b.brand_display))
    and not exists (select 1 from public.fda_products p join public.fda_product_ingredients fpi on fpi.product_id = p.product_id
                    where upper(p.brand_name) = upper(b.brand_display) group by p.product_id having count(*) > 1)
  order by b.pcid, coalesce(array_length(b.appl_nos, 1), 0) desc, b.brand_display;

  create temp table _picks on commit drop as
  select b.pcid, b.drug, b.brand,
    (select jsonb_agg(jsonb_build_object('pcid', d.pcid, 'name', d.name) order by d.rk)
       from (select p.pcid, p.name,
                    row_number() over (order by
                      (exists (select 1 from public.class_members c1
                               join public.class_members c2 on c2.class_pcid = c1.class_pcid and c2.member_pcid = p.pcid
                               join public.drug_classes dc on dc.pcid = c1.class_pcid
                               where c1.member_pcid = b.pcid and dc.class_type = 'epc')) desc,
                      md5(b.pcid::text || '-' || p.pcid::text)) as rk
             from _np p
             where p.pcid <> b.pcid
               and (b.unii is null or p.unii is null or p.unii <> b.unii)
               and lower(p.name) <> lower(b.drug)) d
       where d.rk <= 3) as dists
  from _brand b;

  select count(*) into v_cands from _picks;
  select count(*) into v_rej from _picks where jsonb_array_length(coalesce(dists, '[]'::jsonb)) < 3;

  insert into public.learn_items (
    natural_key, item_type, template_key, generation_method, is_official, status,
    subject_area, topic, difficulty_level, tags, primary_pcid,
    prompt, concise_answer, clinical_rationale, clinical_caveats, mcq_options,
    source_kind, source_list_pcid, source_agency, source_citation, license)
  select 'brand_generic:' || nl.pcid || ':' || k.pcid, 'mcq', 'brand_generic', 'template', true, 'draft',
    'Pharmacology', 'Brand and generic names', 1, array['brand'], k.pcid,
    format('Which generic drug is sold under the brand name %s?', k.brand), k.drug,
    format('%s is a brand name of %s.', k.brand, k.drug),
    'Brand names change over time and a product may be discontinued; the generic name is the stable identifier.',
    (select jsonb_agg(jsonb_build_object('id', chr(96 + q.rn::int), 'text', q.txt, 'is_correct', q.ok,
        'rationale', case when q.ok then format('%s is a brand of %s.', k.brand, k.drug) else format('%s is not the generic for %s.', q.txt, k.brand) end) order by q.rn)
       from (select o.txt, o.ok, row_number() over (order by md5('brand_generic' || k.pcid::text || o.txt)) rn
             from (select k.drug as txt, true as ok
                   union all select d->>'name', false from jsonb_array_elements(k.dists) d) o) q),
    'list', nl.pcid, 'FDA',
    'Drugs@FDA product names and NLM RxNorm brand names, matched to Pharmacy Commons moieties; drug selection from the Notable Drugs list.',
    nl.license
  from _picks k where jsonb_array_length(coalesce(k.dists, '[]'::jsonb)) = 3
  on conflict (natural_key) do nothing;
  get diagnostics v_new = row_count;

  perform public.learn_link_entities('brand_generic');
  drop table _picks, _brand, _np;
  return jsonb_build_object('template', 'brand_generic', 'notable_core_drugs', v_np, 'with_qualifying_brand', v_cands,
    'rejected_fewer_than_3_distractors', v_rej, 'created', v_new, 'already_existed', v_cands - v_rej - v_new);
end $fn$;

revoke execute on function public.learn_gen_class_of() from public, anon, authenticated;
revoke execute on function public.learn_gen_brand_generic() from public, anon, authenticated;

select public.learn_ensure_collection('drug-classes-epc', 'Drug Classes (FDA EPC)', 'Match common drugs to their FDA established pharmacologic class.', 'notable-drugs', array['class_of'], 'Pharmacology', 60);
select public.learn_ensure_collection('brand-generic', 'Brand and Generic Names', 'Match brand names to generic drugs.', 'notable-drugs', array['brand_generic'], 'Pharmacology', 70);
select public.learn_gen_class_of();
select public.learn_gen_brand_generic();
select public.learn_attach('drug-classes-epc', 'class_of', null);
select public.learn_attach('brand-generic', 'brand_generic', null);
