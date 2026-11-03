-- phase36a: rungs 3 and 4 of the structure (SMILES) ladder (2026-11-03). Live migration name: phase36a_structure_rungs_3_4.
-- Rung 3 (DrugBank ID -> PubChem) writes physiochemical directly, insert-only, like rungs 1 and 2.
-- Rung 4 (name lookup) NEVER writes physiochemical: it fills structure_name_candidates for Joshua to review;
-- load_approved_name_structures() copies only rows he marked decision = 'approve'.
-- Destination: db/phase36a_structure_rungs_3_4.sql

-- Rung 3 queue: core moieties with a DrugBank ID, no identifiers that rungs 1/2 use, and no physiochemical row yet.
create or replace function public.structure_todo_drugbank(p_limit integer, p_pcids bigint[] default null)
returns table(pcid bigint, drugbank_id text)
language sql security definer set search_path to 'public' as $$
  select m.pcid, btrim(m.drugbank_id)
  from moieties m
  where m.term_type = 'Core moiety'
    and btrim(m.drugbank_id) ~ '^DB[0-9]{5}$'
    and nullif(btrim(m.inchi_key), '') is null
    and nullif(btrim(m.unii), '') is null
    and not exists (select 1 from physiochemical p where p.pcid = m.pcid)
    and (p_pcids is null or m.pcid = any(p_pcids))
  order by m.pcid
  limit p_limit
$$;

-- Rung 4 review table. One row per moiety looked up by name; nothing here is a stored structure until approved and loaded.
create table if not exists public.structure_name_candidates (
  pcid bigint primary key references public.entities(pcid) on delete cascade,
  queried_name text not null,
  n_cids integer not null,
  cid bigint,
  cid_list bigint[],
  title text,
  match_basis text not null check (match_basis in ('title_exact', 'synonym_exact', 'name_only', 'none')),
  confidence text not null check (confidence in ('high', 'medium', 'low', 'none')),
  smiles text,
  inchi text,
  inchi_key text,
  molecular_formula text,
  molecular_weight numeric,
  inchi_key_owner_pcid bigint,   -- another moiety that already holds this InChIKey: a possible duplicate record
  note text,
  decision text check (decision in ('approve', 'reject')),
  reviewer_note text,
  loaded_at timestamptz,
  fetched_at timestamptz not null default now()
);
comment on table public.structure_name_candidates is 'Rung 4 of the structure ladder (phase 36a): PubChem matches by moiety name, for Joshua to review. Set decision to approve or reject, then run select load_approved_name_structures(); Never read by the website.';
alter table public.structure_name_candidates enable row level security;

-- Rung 4 queue: core moieties with no row in physiochemical and no candidate yet.
create or replace function public.structure_todo_name(p_limit integer, p_pcids bigint[] default null)
returns table(pcid bigint, name text)
language sql security definer set search_path to 'public' as $$
  select m.pcid, e.name
  from moieties m join entities e on e.pcid = m.pcid
  where m.term_type = 'Core moiety'
    and nullif(btrim(m.inchi_key), '') is null
    and nullif(btrim(m.unii), '') is null
    and not exists (select 1 from physiochemical p where p.pcid = m.pcid)
    and not exists (select 1 from structure_name_candidates c where c.pcid = m.pcid)
    and (p_pcids is null or m.pcid = any(p_pcids))
  order by m.pcid
  limit p_limit
$$;

-- Copies approved candidates into physiochemical (insert-only; a moiety that gained a row meanwhile is skipped).
create or replace function public.load_approved_name_structures()
returns integer
language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  perform set_config('pc.change_source', 'phase36a_name_structures', true);
  with ins as (
    insert into physiochemical (pcid, smiles, inchi, inchi_key, molecular_formula, molecular_weight, source, pubchem_cid,
                                match_method, structure_status, raw, fetched_at)
    select c.pcid, c.smiles, c.inchi, c.inchi_key, c.molecular_formula, c.molecular_weight, 'PubChem', c.cid,
           'pubchem_name', 'ok',
           jsonb_build_object('reviewed_name_match', true, 'queried_name', c.queried_name, 'title', c.title,
                              'match_basis', c.match_basis, 'confidence', c.confidence),
           now()
    from structure_name_candidates c
    where c.decision = 'approve' and c.loaded_at is null and nullif(btrim(c.smiles), '') is not null
      and not exists (select 1 from physiochemical p where p.pcid = c.pcid)
    on conflict (pcid) do nothing
    returning pcid
  )
  update structure_name_candidates c set loaded_at = now() from ins where ins.pcid = c.pcid;
  get diagnostics n = row_count;
  return n;
end $$;

-- Service role only, like structure_todo().
revoke all on function public.structure_todo_drugbank(integer, bigint[]) from public, anon, authenticated;
revoke all on function public.structure_todo_name(integer, bigint[]) from public, anon, authenticated;
revoke all on function public.load_approved_name_structures() from public, anon, authenticated;
grant execute on function public.structure_todo_drugbank(integer, bigint[]) to service_role;
grant execute on function public.structure_todo_name(integer, bigint[]) to service_role;
grant execute on function public.load_approved_name_structures() to service_role;
