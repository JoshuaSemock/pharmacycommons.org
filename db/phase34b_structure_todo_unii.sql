-- phase34b: work queue for the GSRS (UNII) rung + clearer structure_status vocabulary.
-- Applied 2026-11-03 via apply_migration. Live name: phase27b_structure_todo_unii, version 20261103210156
-- (renumbered phase34b in the repo; match by version, not name).
comment on column public.physiochemical.structure_status is 'ok | not_found | key_mismatch | not_applicable_biologic (GSRS protein/nucleicAcid/structurallyDiverse) | not_applicable_other (GSRS polymer/mixture/concept/etc; see raw.substanceClass) | needs_review';

create or replace function public.structure_todo_unii(p_limit integer, p_pcids bigint[] default null)
returns table(pcid bigint, unii text)
language sql
security definer
set search_path to 'public'
as $$
  select m.pcid, upper(btrim(m.unii))
  from moieties m
  where m.term_type = 'Core moiety'
    and nullif(btrim(m.inchi_key),'') is null
    and upper(btrim(m.unii)) ~ '^[A-Z0-9]{10}$'
    and not exists (select 1 from physiochemical p where p.pcid = m.pcid)
    and (p_pcids is null or m.pcid = any(p_pcids))
  order by m.pcid
  limit p_limit
$$;

revoke all on function public.structure_todo_unii(integer, bigint[]) from public, anon, authenticated;
grant execute on function public.structure_todo_unii(integer, bigint[]) to service_role;
