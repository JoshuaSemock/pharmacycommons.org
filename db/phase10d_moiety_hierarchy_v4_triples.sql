-- Phase 10d — moiety_hierarchy v4: formulations via has_component triples (2026-09-25)
-- Changes from v3 (moiety_hierarchy_view_v3_fast_equijoins / _materialized):
--   * Formulations that have FDA-derived has_component triples are placed by those
--     triples, not by name-splitting. relation = 'formulation' when the formulation has
--     exactly one component, 'combination' when it has more than one.
--   * Formulations with no triples keep the v3 name-splitting fallback.
--   * Precise forms: comma segments that are only descriptors (MONOBASIC, ANHYDROUS,
--     MACROCRYSTALLINE, ...) no longer count as a second ingredient, which fixed e.g.
--     "SODIUM PHOSPHATE, MONOBASIC ANHYDROUS" being labelled a combination.
--   * Triple objects may be any block-1 record (incl. non-core salt rows such as
--     "potassium chloride"), so brands also appear on those pages.
-- Output columns are unchanged: moiety_pcid, member_pcid, member_slug, member_name,
-- member_term_type, primary_brand, relation.

-- moiety_hierarchy has dependents (ingredient_moiety_map → entity_brand_names →
-- catalog_entries, combination_brand_index). A materialized view can't be replaced in
-- place, so this migration captures their live definitions, drops the chain with
-- CASCADE, and recreates every object with its original definition, indexes and ACLs,
-- all inside one transaction.
-- One deliberate change downstream: entity_brand_names.combo_sets now excludes
-- formulation members (PCID >= 4000000). v3 placed no formulations in the hierarchy,
-- so this keeps brand-name targeting exactly as before while v4 adds formulations.

do $mig$
declare
  d_imm text := pg_get_viewdef('public.ingredient_moiety_map'::regclass);
  d_ebn text := pg_get_viewdef('public.entity_brand_names'::regclass);
  d_cat text := pg_get_viewdef('public.catalog_entries'::regclass);
  d_cbi text := pg_get_viewdef('public.combination_brand_index'::regclass);
  n_before int;
begin
  d_ebn := replace(d_ebn, 'moiety_hierarchy.relation = ''combination''::text',
                          'moiety_hierarchy.relation = ''combination''::text AND moiety_hierarchy.member_pcid < 4000000');
  select count(*) into n_before from regexp_matches(d_ebn, 'member_pcid < 4000000', 'g');
  if n_before <> 1 then
    raise exception 'entity_brand_names combo_sets patch matched % times (expected 1)', n_before;
  end if;

  drop materialized view public.moiety_hierarchy cascade;

  create materialized view public.moiety_hierarchy as
with base as (
  select m.pcid as moiety_pcid, upper(m.base_name) as moiety_base_name
    from public.moieties m
   where m.term_type = 'Core moiety' and m.base_name is not null
), salt_re as (
  select '\s+(HYDROCHLORIDE|HCL|HYDROBROMIDE|SULFATE|SULPHATE|MALEATE|PHOSPHATE|SODIUM|POTASSIUM|CALCIUM|MAGNESIUM|CITRATE|TARTRATE|SUCCINATE|MESYLATE|FUMARATE|ACETATE|BESYLATE|BENZOATE|GLUCONATE|LACTATE|NITRATE|OXALATE|PALMITATE|PAMOATE|DECANOATE|ENANTHATE|VALERATE|PROPIONATE|LAUROXIL|ANHYDROUS|MONOHYDRATE|DIHYDRATE|TRIHYDRATE|HEMIHYDRATE|CHLORIDE|BROMIDE)\s*$' as re
), pf_segs as (
  -- n_ingredients ignores comma segments that are only descriptors
  -- ("SODIUM PHOSPHATE, MONOBASIC ANHYDROUS", "NITROFURANTOIN, MACROCRYSTALLINE")
  select pf.pcid, pf.term_type, pf.primary_brand, trim(seg.seg) as segment,
         regexp_replace(trim(seg.seg), (select re from salt_re), '', 'gi') as stripped,
         (select count(*) from unnest(regexp_split_to_array(upper(pf.base_name), '\s*(,| AND )\s*')) s2(x)
           where trim(regexp_replace(s2.x, '\m(MONOBASIC|DIBASIC|TRIBASIC|ANHYDROUS|MONOHYDRATE|DIHYDRATE|TRIHYDRATE|HEPTAHYDRATE|HEMIHYDRATE|HYDRATE|MACROCRYSTALLINE|MACROCRYSTALS|MICROCRYSTALLINE|MICRONIZED|DRIED|USP)\M', '', 'g')) <> '') as n_ingredients
    from public.precise_forms pf
   cross join lateral unnest(regexp_split_to_array(upper(pf.base_name), '\s*(,| AND )\s*')) seg(seg)
   where pf.base_name is not null
), triple_f as (   -- formulations placed by FDA-derived triples
  select cs.subject_pcid as pcid, cs.object_pcid as moiety_pcid,
         count(*) over (partition by cs.subject_pcid) as n_components
    from public.clinical_statements cs
    join public.entities s on s.pcid = cs.subject_pcid and s.entity_type = 'formulation'
    join public.entities o on o.pcid = cs.object_pcid and o.entity_type = 'moiety'
   where cs.predicate = 'has_component'
), f_segs as (     -- name-split fallback for formulations without triples
  select f.pcid, f.term_type, f.primary_brand, trim(seg.seg) as segment,
         regexp_replace(trim(seg.seg), (select re from salt_re), '', 'gi') as stripped,
         array_length(regexp_split_to_array(upper(f.base_name), '\s*(,| AND )\s*'), 1) = 1 as single_ingredient
    from public.formulations f
   cross join lateral unnest(regexp_split_to_array(upper(f.base_name), '\s*(,| AND )\s*')) seg(seg)
   where f.base_name is not null
     and not exists (select 1 from triple_f t where t.pcid = f.pcid)
), c_segs as (
  select c.pcid, c.term_type, c.primary_brand, trim(seg.seg) as segment,
         regexp_replace(trim(seg.seg), (select re from salt_re), '', 'gi') as stripped
    from public.combinations c
   cross join lateral unnest(regexp_split_to_array(upper(c.base_name), '\s*(,| AND )\s*')) seg(seg)
   where c.base_name is not null
), pf_rel as (   -- plain equi-joins UNION'd (see CLAUDE.md: OR joins defeat hash joins)
  select b.moiety_pcid, pt.pcid, case when pt.n_ingredients <= 1 then 'precise_form' else 'combination' end as relation
    from base b join pf_segs pt on pt.stripped = b.moiety_base_name
  union
  select b.moiety_pcid, pt.pcid, case when pt.n_ingredients <= 1 then 'precise_form' else 'combination' end
    from base b join pf_segs pt on pt.segment = b.moiety_base_name
), matches as (
  select r.moiety_pcid, e.pcid as member_pcid, e.slug as member_slug, e.name as member_name,
         pf.term_type as member_term_type, pf.primary_brand, r.relation
    from pf_rel r
    join public.precise_forms pf on pf.pcid = r.pcid
    join public.entities e on e.pcid = r.pcid
  union
  select t.moiety_pcid, e.pcid, e.slug, e.name, f.term_type, f.primary_brand,
         case when t.n_components = 1 then 'formulation' else 'combination' end
    from triple_f t
    join public.formulations f on f.pcid = t.pcid
    join public.entities e on e.pcid = t.pcid
  union
  select b.moiety_pcid, e.pcid, e.slug, e.name, ft.term_type, ft.primary_brand,
         case when ft.single_ingredient then 'formulation' else 'combination' end
    from base b join f_segs ft on ft.stripped = b.moiety_base_name join public.entities e on e.pcid = ft.pcid
  union
  select b.moiety_pcid, e.pcid, e.slug, e.name, ft.term_type, ft.primary_brand,
         case when ft.single_ingredient then 'formulation' else 'combination' end
    from base b join f_segs ft on ft.segment = b.moiety_base_name join public.entities e on e.pcid = ft.pcid
  union
  select b.moiety_pcid, e.pcid, e.slug, e.name, ct.term_type, ct.primary_brand, 'combination'
    from base b join c_segs ct on ct.stripped = b.moiety_base_name join public.entities e on e.pcid = ct.pcid
  union
  select b.moiety_pcid, e.pcid, e.slug, e.name, ct.term_type, ct.primary_brand, 'combination'
    from base b join c_segs ct on ct.segment = b.moiety_base_name join public.entities e on e.pcid = ct.pcid
)
select moiety_pcid, member_pcid, member_slug, member_name, member_term_type, primary_brand, relation
  from matches;
  create unique index moiety_hierarchy_pk on public.moiety_hierarchy (moiety_pcid, member_pcid, relation);
  create index moiety_hierarchy_moiety_pcid_idx on public.moiety_hierarchy (moiety_pcid);
  create index moiety_hierarchy_member_pcid_idx on public.moiety_hierarchy (member_pcid);

  execute 'create materialized view public.ingredient_moiety_map as ' || d_imm;
  create unique index ingredient_moiety_map_pk on public.ingredient_moiety_map (ingredient);

  execute 'create materialized view public.entity_brand_names as ' || d_ebn;
  create unique index entity_brand_names_pk on public.entity_brand_names (pcid, brand_key);
  create index entity_brand_names_brand_key on public.entity_brand_names (brand_key);

  execute 'create view public.catalog_entries with (security_invoker = true) as ' || d_cat;
  execute 'create view public.combination_brand_index with (security_invoker = true) as ' || d_cbi;

  -- restore ACLs exactly as they were
  grant all on public.moiety_hierarchy, public.entity_brand_names, public.catalog_entries,
               public.combination_brand_index to anon, authenticated, service_role;
  grant all on public.ingredient_moiety_map to anon, authenticated, service_role;
  revoke select on public.ingredient_moiety_map from anon, authenticated;
end
$mig$;
