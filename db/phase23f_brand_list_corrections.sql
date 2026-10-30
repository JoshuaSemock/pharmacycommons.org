-- Phase 23f — learn_brand_list corrections (Joshua, 2026-10-29: "correct them"); applied via execute_sql
-- APPLIED 2026-10-29 via execute_sql. NOTE: this file was written after the fact as a readable mirror; column lists in the
-- combination mint are indicative, not a byte-for-byte copy of what ran.
-- Destination: db/phase23f_brand_list_corrections.sql   (run after 23e)
-- Mirena        generic "intrauterine devices, all" -> levonorgestrel (1003189)
-- Cyanokit      generic "cyanide antidote" -> hydroxocobalamin (1003025)
-- Nithiodote    generic "cyanide antidote" -> new combination sodium nitrite/sodium thiosulfate (block 2, has_component 1011492 + 1002599)
-- Azo Gantrisin generic "azo-sulfisoxazole" -> combination 2000068 (phenazopyridine; sulfisoxazole)
-- Anectine      generic spelling "succinylchloline" -> succinylcholine (1003245); typo moiety 1002643 still exists (merge call open)
-- Visine        sheet generic (tetrahydrozoline) kept; has_component tetrahydrozoline added to formulation 4006199 beside the FDA
--               naphazoline + pheniramine triples (disagreement recorded, not hidden)
-- Other flagged rows were salt/parent or combination-vs-components differences; notes marked reviewed, sheet generic kept.
-- The five corrected Learn items were deleted (no learner state) and regenerated with learn_gen_brand_list(); the
-- brand-generic collection was re-sequenced by importance. Matviews refreshed.
select set_config('pc.change_source','phase23f_brand_list_corrections',true);
do $$
declare v bigint;
begin
  select min(pcid) into v from entities where entity_type='combination' and slug='sodium-nitrite-sodium-thiosulfate';
  if v is null then
    update pcid_blocks set next_pcid=next_pcid+1 where block_id=2 returning next_pcid-1 into v;
    insert into entities(pcid,entity_type,slug,slug_uri,name) values (v,'combination','sodium-nitrite-sodium-thiosulfate','pc:combination:sodium-nitrite-sodium-thiosulfate','sodium nitrite/sodium thiosulfate');
    insert into combinations(pcid,class_name,origin,term_type,base_name,primary_source,source_count)
      values (v,'Unassigned','learn_brand_list','Combination product','sodium nitrite/sodium thiosulfate','Learn brand list (Brands.xlsx)',1);
    insert into clinical_statements(subject_pcid,predicate,object_pcid,source_agency,source_doc_id) values
      (v,'has_component',1011492,'Pharmacy Commons','Brands.xlsx sheet_id 1139'),(v,'has_component',1002599,'Pharmacy Commons','Brands.xlsx sheet_id 1139');
  end if;
  update learn_brand_list set generic_name='sodium nitrite/sodium thiosulfate', generic_pcid=v, generic_match='corrected', review_note='generic corrected 2026-10-29 from "cyanide antidote" (a class label) to the FDA ingredients' where sheet_id=1139;
end $$;
update learn_brand_list set generic_name='hydroxocobalamin', generic_pcid=1003025, generic_match='corrected', review_note='generic corrected 2026-10-29 from "cyanide antidote" (a class label) to the FDA ingredient' where sheet_id=699;
update learn_brand_list set generic_name='levonorgestrel', generic_pcid=1003189, generic_match='corrected', review_note='generic corrected 2026-10-29 from "intrauterine devices, all" (a product type) to the active ingredient' where sheet_id=341;
update learn_brand_list set generic_name='phenazopyridine/sulfisoxazole', generic_pcid=2000068, generic_match='corrected', review_note='generic corrected 2026-10-29 from "azo-sulfisoxazole" to the combination record' where sheet_id=976;
update learn_brand_list set generic_name='succinylcholine', generic_pcid=1003245, generic_match='corrected', review_note='generic spelling corrected 2026-10-29 (succinylchloline); typo moiety record 1002643 still exists, merge call open' where sheet_id=31;
insert into clinical_statements(subject_pcid,predicate,object_pcid,source_agency,source_doc_id)
select 4006199,'has_component',1003060,'Pharmacy Commons','Brands.xlsx sheet_id 599 (Visine Original; FDA lists naphazoline + pheniramine for another Visine product)'
where not exists (select 1 from clinical_statements where subject_pcid=4006199 and predicate='has_component' and object_pcid=1003060);
update learn_brand_list set review_note='reviewed 2026-10-29: sheet generic kept (Visine Original = tetrahydrozoline); tetrahydrozoline component added beside the FDA ones' where sheet_id=599;
update learn_brand_list set review_note='reviewed 2026-10-29: salt/parent form or combination vs components; sheet generic kept' where review_note='sheet generic differs from FDA component triple(s)';
delete from learn_items where natural_key in ('brand_list:31','brand_list:341','brand_list:699','brand_list:976','brand_list:1139');
select public.learn_gen_brand_list();
