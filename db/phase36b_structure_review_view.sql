-- Phase 36b: review sheet for rung 4 (name lookup). Export as CSV from the Supabase table editor / SQL editor,
-- fill `decision` ('approve' or 'reject') and optionally `reviewer_note`, then load with the UPDATE pattern in
-- docs/structure-fetch.md and run select public.load_approved_name_structures().
-- Rows that look like duplicates (inchi_key_owner_pcid set) sort first: approving them would put one structure on
-- two records, so resolve the merge question before approving.
create or replace view public.structure_review_sheet
with (security_invoker = true) as
select
  c.pcid,
  e.slug,
  c.queried_name,
  c.title as pubchem_title,
  c.match_basis,
  c.confidence,
  c.n_cids,
  c.cid,
  'https://pubchem.ncbi.nlm.nih.gov/compound/' || c.cid as pubchem_url,
  c.molecular_formula,
  c.molecular_weight,
  c.smiles,
  c.inchi_key,
  c.inchi_key_owner_pcid,
  c.note,
  c.decision,
  c.reviewer_note
from public.structure_name_candidates c
join public.entities e on e.pcid = c.pcid
where c.confidence <> 'none' and c.loaded_at is null
order by (c.inchi_key_owner_pcid is not null) desc,
         case c.confidence when 'low' then 0 when 'medium' then 1 else 2 end,
         c.pcid;
revoke all on public.structure_review_sheet from public, anon, authenticated;
grant select on public.structure_review_sheet to service_role;
