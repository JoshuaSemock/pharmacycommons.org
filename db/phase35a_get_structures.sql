-- Phase 35 — structures for the drawing on drug pages (2026-11-03).
-- Nothing is stored: the browser draws each SMILES on demand (src/components/StructureDrawing.tsx).
-- A moiety page returns its own structure; a precise form, brand or combination page returns one row per
-- component moiety: through moiety_hierarchy (same roll-up as get_rems / get_lasa) and through the record's own
-- has_component triples, because moiety_hierarchy does not cover every combination (the phase 23 combinations
-- 2002591-2002611 are not in it). A component with no structure on file comes back with null smiles so the page
-- can name it. Only structure_status = 'ok' rows count (biologics, not_found and never-tried moieties have no drawing).
-- Live migrations: phase35a_get_structures (first version, hierarchy only) then
-- phase35b_get_structures_component_triples (this file's final function). Re-running this file is safe.
-- Destination: db/phase35a_get_structures.sql

create or replace function public.get_structures(p_pcid bigint)
returns table (moiety_pcid bigint, slug text, name text, smiles text, source text, pubchem_cid bigint)
language sql stable set search_path = public as $$
  with moieties_of as (
    select p_pcid as m where exists (select 1 from moieties where pcid = p_pcid)
    union select h.moiety_pcid from moiety_hierarchy h where h.member_pcid = p_pcid
    union select s.object_pcid from clinical_statements s
      where s.subject_pcid = p_pcid and s.predicate = 'has_component'
        and exists (select 1 from moieties m where m.pcid = s.object_pcid)
  )
  select e.pcid, e.slug, e.name, s.smiles, s.source, s.pubchem_cid
  from moieties_of mo
  join entities e on e.pcid = mo.m
  left join physiochemical s
    on s.pcid = mo.m and s.structure_status = 'ok' and nullif(btrim(s.smiles), '') is not null
  order by lower(e.name), e.pcid
$$;
grant execute on function public.get_structures(bigint) to anon, authenticated;
