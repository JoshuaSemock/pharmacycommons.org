-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 8c — follow-ups applied after phase8b (in this order):
--   phase8c_document_indexes        lookup indexes the document function needs
--   phase8d_snapshot_conflict_guard advisory lock → ON CONFLICT (long sweeps ran out of locks)
--   phase8e_narrow_definer_surface  api_entity_versions / api_class_members / api_index → INVOKER;
--                                   changes_folded column; api_split_codes search_path
--   phase8f_absolute_ref_iris       api_ref @id = absolute https://pharmacycommons.org/id/PCID-n;
--                                   entity_versions re-baselined (all rows were same-day baselines)
-- Destination: db/phase8c_followups.sql
-- The function bodies below supersede the same-named ones in phase8b.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── phase8c_document_indexes ───────────────────────────────────────────────
create index if not exists moiety_hierarchy_member_pcid_idx on public.moiety_hierarchy (member_pcid);
create index if not exists moieties_synonym_of_idx      on public.moieties      (synonym_of_pcid) where synonym_of_pcid is not null;
create index if not exists combinations_synonym_of_idx  on public.combinations  (synonym_of_pcid) where synonym_of_pcid is not null;
create index if not exists precise_forms_synonym_of_idx on public.precise_forms (synonym_of_pcid) where synonym_of_pcid is not null;
create index if not exists formulations_synonym_of_idx  on public.formulations  (synonym_of_pcid) where synonym_of_pcid is not null;
create index if not exists clinical_statements_comparator_idx on public.clinical_statements (comparator_pcid) where comparator_pcid is not null;
-- NOTE: moiety_hierarchy is a materialized view; this index survives
-- REFRESH MATERIALIZED VIEW CONCURRENTLY but must be recreated if the view is dropped.

-- ── phase8e_narrow_definer_surface (includes the phase8d conflict guard) ───
alter function public.api_split_codes(text) set search_path = public;

alter table public.entity_versions add column if not exists changes_folded int;

create or replace function public.api_snapshot(p_pcid bigint)
returns public.entity_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  c      jsonb;
  h      text;
  last   entity_versions%rowtype;
  had    boolean;
  mc     bigint;
  nch    int;
  result entity_versions%rowtype;
begin
  c := api_entity_content(p_pcid);
  if c is null then
    return null;
  end if;
  h := encode(sha256(convert_to(c::text, 'UTF8')), 'hex');

  select * into last from entity_versions where pcid = p_pcid order by version desc limit 1;
  had := found;
  if had and last.content_hash = h then
    return last;
  end if;

  select max(change_id), count(*) filter (where change_id > coalesce(last.change_through, 0))
    into mc, nch
    from entity_changes where pcid = p_pcid;

  -- A concurrent request may have written the same next version first; the
  -- conflict guard makes that a no-op and we return whatever is now latest.
  insert into entity_versions (pcid, version, content, content_hash, reason, change_through, changes_folded)
  values (
    p_pcid,
    case when had then last.version + 1 else 1 end,
    c, h,
    case when not had then 'baseline'
         when coalesce(mc, 0) > coalesce(last.change_through, 0) then 'change'
         else 'derived' end,
    mc,
    case when had then nch end)
  on conflict (pcid, version) do nothing
  returning * into result;

  if result.pcid is null then
    select * into result from entity_versions where pcid = p_pcid order by version desc limit 1;
  end if;
  return result;
end;
$$;
revoke execute on function public.api_snapshot(bigint) from public, anon, authenticated;

create or replace function public.api_entity_versions(p_ref text)
returns jsonb
language plpgsql stable
security invoker
set search_path = public
as $$
declare
  p   bigint := api_resolve(p_ref);
  api text := api_meta_value('api_base') || '/' || api_meta_value('api_version');
begin
  if p is null then
    return api_not_found(p_ref);
  end if;
  return jsonb_build_object(
    'pcid', 'PCID-' || p,
    'entity', api_ref(p),
    'versions', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'number',     v.version,
               'hash',       'sha256:' || v.content_hash,
               'reason',     v.reason,
               'created_at', v.created_at,
               'changes',    v.changes_folded,
               'url',        api || '/entities/PCID-' || p || '/versions/' || v.version))
             order by v.version desc)
        from entity_versions v
       where v.pcid = p), '[]'::jsonb));
end;
$$;

create or replace function public.api_class_members(p_ref text, p_limit int default 100, p_offset int default 0, p_direct_only boolean default false)
returns jsonb
language plpgsql stable
security invoker
set search_path = public
as $$
declare
  p   bigint := api_resolve(p_ref);
  lim int := least(greatest(coalesce(p_limit, 100), 1), 500);
  off int := greatest(coalesce(p_offset, 0), 0);
  api text := api_meta_value('api_base') || '/' || api_meta_value('api_version');
  total bigint;
begin
  if p is null then
    return api_not_found(p_ref);
  end if;
  select count(*) into total from class_members where class_pcid = p and (not p_direct_only or is_direct);
  return jsonb_strip_nulls(jsonb_build_object(
    'class', api_ref(p),
    'total', total,
    'offset', off,
    'limit', lim,
    'members', coalesce((
      select jsonb_agg(api_ref(m.member_pcid) || jsonb_strip_nulls(jsonb_build_object(
               'direct', m.is_direct, 'basis', m.match_basis, 'system', m.source_system))
             order by e.name, m.member_pcid)
        from (select cm.* from class_members cm join entities e2 on e2.pcid = cm.member_pcid
               where cm.class_pcid = p and (not p_direct_only or cm.is_direct)
               order by e2.name, cm.member_pcid limit lim offset off) m
        join entities e on e.pcid = m.member_pcid), '[]'::jsonb),
    'next', case when off + lim < total
                 then api || '/entities/PCID-' || p || '/members?offset=' || (off + lim) || '&limit=' || lim end));
end;
$$;

create or replace function public.api_index()
returns jsonb
language sql stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'name',           'Pharmacy Commons API',
    'api_version',    api_meta_value('api_version'),
    'schema_version', api_meta_value('schema_version'),
    'site',           api_meta_value('site_base'),
    'license',        jsonb_build_object('data', api_meta_value('data_license'), 'url', api_meta_value('data_license_url')),
    'entity_types', (
      select jsonb_agg(jsonb_build_object(
               'type', b.entity_kind, 'label', b.label, 'block', b.block_id,
               'pcid_range', jsonb_build_array('PCID-' || b.min_id, 'PCID-' || b.max_id),
               'count', (select count(*) from entities e where e.entity_type = b.entity_kind))
             order by b.block_id)
        from pcid_blocks b),
    'sources', (select jsonb_agg(jsonb_strip_nulls(to_jsonb(d)) order by d.source_key) from data_sources d),
    'tracking_since', (select min(created_at) from entity_versions))
$$;

comment on function public.api_entity_document(text, int) is
  'Public read RPC (intentionally SECURITY DEFINER + anon EXECUTE): it snapshots the record into entity_versions when its content hash changed. The write is deterministic — a caller can only ever cause the true current content to be recorded.';
comment on function public.api_entity_changes(text, int, bigint) is
  'Public read RPC (intentionally SECURITY DEFINER + anon EXECUTE): entity_changes has no public policy so the actor column never leaves the database; this function returns every other column.';

-- ── phase8f_absolute_ref_iris ──────────────────────────────────────────────
create or replace function public.api_ref(p_pcid bigint)
returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
           '@id', (select value from api_meta where key = 'site_base') || '/id/PCID-' || e.pcid,
           'pcid', 'PCID-' || e.pcid,
           'name', e.name,
           'slug', e.slug,
           'entity_type', e.entity_type)
  from entities e
  where e.pcid = p_pcid
$$;

-- Applied once on 2026-09-23 (all rows were same-day baselines taken before
-- this format fix), followed by: select api_snapshot_sweep(32000);
-- Do NOT re-run on a live database — it would erase real version history.
-- truncate table public.entity_versions;

-- ── phase8g_snapshot_all ───────────────────────────────────────────────────
-- Re-hash every record (optionally one entity type) and record a new version
-- wherever content changed. Run after refreshing derived data that no trigger
-- sees: entity_brand_names, moiety_hierarchy, entity_label_rank, class_members.
-- Returns the number of NEW versions written (unchanged records cost only a hash).
create or replace function public.api_snapshot_all(p_entity_type text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  p      bigint;
  before int;
  n      int := 0;
begin
  for p in select pcid from entities where p_entity_type is null or entity_type = p_entity_type order by pcid loop
    select coalesce(max(version), 0) into before from entity_versions where pcid = p;
    if (api_snapshot(p)).version > before then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
revoke execute on function public.api_snapshot_all(text) from public, anon, authenticated;

-- ── phase8h_class_html_links ───────────────────────────────────────────────
-- links.html for a class record points at /classes/{slug}; everything else stays /drugs/{slug}.
-- Envelope-only: content hashes (and so version numbers) are unaffected.
do $$
declare
  def text := pg_get_functiondef('public.api_entity_document(text, int)'::regprocedure);
  old_line text := $q$'html',      site || '/drugs/' || cur_slug,$q$;
  new_line text := $q$'html',      site || case when v.content ->> 'entity_type' = 'class' then '/classes/' else '/drugs/' end || cur_slug,$q$;
begin
  if position(old_line in def) = 0 then
    raise exception 'phase8h: expected html line not found in api_entity_document';
  end if;
  execute replace(def, old_line, new_line);
end $$;
