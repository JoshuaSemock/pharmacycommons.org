-- phase34a: provenance columns + work-queue RPC for the structure (SMILES) fetch.
-- Applied 2026-11-03 via apply_migration. Live name: phase27a_physiochemical_structure_provenance,
-- version 20261103194410 (the live name predates this file's renumbering; phase27a is also the live
-- name of two other migrations, so match by version, not name).
alter table public.physiochemical
  add column if not exists structure_status text,
  add column if not exists match_method text,
  add column if not exists pubchem_cid bigint;

comment on column public.physiochemical.structure_status is 'ok | not_found | key_mismatch | not_applicable_biologic | needs_review';
comment on column public.physiochemical.match_method is 'How the structure was matched: pubchem_inchikey | gsrs_unii | pubchem_unii | pubchem_drugbank | pubchem_name | ...';

create or replace function public.structure_todo(p_limit integer, p_pcids bigint[] default null)
returns table(pcid bigint, inchi_key text)
language sql
security definer
set search_path to 'public'
as $$
  select m.pcid, btrim(m.inchi_key)
  from moieties m
  where m.term_type = 'Core moiety'
    and nullif(btrim(m.inchi_key),'') is not null
    and not exists (select 1 from physiochemical p where p.pcid = m.pcid)
    and btrim(m.inchi_key) not in (
      select btrim(inchi_key) from moieties
      where nullif(btrim(inchi_key),'') is not null
      group by 1 having count(*) > 1)
    and (p_pcids is null or m.pcid = any(p_pcids))
  order by m.pcid
  limit p_limit
$$;

revoke all on function public.structure_todo(integer, bigint[]) from public, anon, authenticated;
grant execute on function public.structure_todo(integer, bigint[]) to service_role;
