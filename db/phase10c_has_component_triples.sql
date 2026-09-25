-- Phase 10c — formulation → moiety has_component triples from FDA product ingredients (2026-09-25)
-- One triple per (formulation, moiety) pair across all Drugs@FDA products linked to that formulation.
-- Additive only: NOT EXISTS guard (unique_statement_triple doesn't fire when object_label is NULL).
set local pc.change_source = 'phase10c_fda_has_component';

insert into public.clinical_statements
  (subject_pcid, predicate, object_pcid, source_agency, source_doc_id, source_section, qualifier_key, qualifier_value, updated_at)
select p.pcid, 'has_component', i.moiety_pcid,
       'FDA',
       'Drugs@FDA appl ' || string_agg(distinct p.appl_no::text, ', ' order by p.appl_no::text),
       'products.active_ingredients (resolved via DailyMed SPL UNII / name)',
       'match_basis',
       min(i.match_basis),
       now()
  from public.fda_products p
  join public.entities f on f.pcid = p.pcid and f.entity_type = 'formulation'
  join public.fda_product_ingredients i on i.product_id = p.product_id
 where i.moiety_pcid is not null
   and i.moiety_pcid <> p.pcid
   and not exists (select 1 from public.clinical_statements cs
                    where cs.subject_pcid = p.pcid and cs.predicate = 'has_component' and cs.object_pcid = i.moiety_pcid)
 group by p.pcid, i.moiety_pcid;
