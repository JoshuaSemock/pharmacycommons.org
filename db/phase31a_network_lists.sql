-- Phase 31a — Network page: list-membership edges (Joshua, 2026-11-03).
--
-- Adds a seventh relationship group, 'lists': a drug (or any record) is linked to every published
-- list it is an entry on (Anticholinergic Burden, QT lists, Federal Controlled Substances, MEPS …),
-- and a list, opened as the centre of the graph, links to its entries. Lists stay separate from
-- classes (decisions.md, Lists): they are their own group, their own node kind ('list', see
-- src/network/predicates.ts) and link to /lists/:slug.
--
--   network_predicate_group(text)   adds on_list -> 'lists'
--   network_neighborhood(...)       adds edges 'li:<list_pcid>:<member_pcid>' from list_items
--                                   (published lists only; entries with no member PCID skipped);
--                                   'lists' sorts after interaction in the round-robin
--   network_edge_evidence(text)     adds the 'li' branch: list, source, rank/value/status/note
--
-- on_list is derived from list_items, like member_of from class_members; it is NOT a row in
-- public.predicates and nothing is written to clinical_statements. No tables or data change.
-- Same signatures and grants as phase 19, SECURITY INVOKER, so RLS (public_read on lists and
-- list_items, published only) still decides what a visitor sees.
-- Apply as three migrations: 31a (index + group fn), 31b (neighborhood), 31c (evidence).
-- Destination: db/phase31a_network_lists.sql
-- SPDX-License-Identifier: GPL-3.0-or-later

-- ── 31a ─────────────────────────────────────────────────────────────────────
-- The drug side of the lookup (list_items by member) had no index of its own.
create index if not exists list_items_member_pcid_idx on public.list_items (member_pcid) where member_pcid is not null;

create or replace function public.network_predicate_group(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p
    -- classification: what kind of thing this is
    when 'member_of'           then 'classification'
    when 'has_member'          then 'classification'
    when 'subclass_of'         then 'classification'
    -- composition: what a product is made of
    when 'has_component'       then 'composition'
    when 'has_formulation'     then 'composition'
    -- use: indications and prevention as recorded (not a treatment recommendation)
    when 'treats'              then 'use'
    when 'prevents'            then 'use'
    when 'has_prevention'      then 'use'
    when 'has_diagnosis'       then 'use'
    when 'has_symptom'         then 'use'
    -- safety: label or curator-reported associations (not causal proof)
    when 'has_side_effect'     then 'safety'
    when 'has_warning'         then 'safety'
    when 'has_contraindication' then 'safety'
    when 'contraindicated_with' then 'safety'
    when 'causes'              then 'safety'
    when 'has_risk_factor'     then 'safety'
    when 'has_lower_risk_than' then 'safety'
    when 'is_hazardous'        then 'safety'
    -- interaction and pharmacogenomics
    when 'interacts_with'      then 'interaction'
    when 'inhibits'            then 'interaction'
    when 'induces'             then 'interaction'
    when 'substrate_of'        then 'interaction'
    when 'is_substrate_of'     then 'interaction'
    when 'has_pgx_association' then 'interaction'
    when 'has_pgx_gene'        then 'interaction'
    when 'has_lab_effect'      then 'interaction'
    when 'monitored_by'        then 'interaction'
    when 'has_monitoring'      then 'interaction'
    -- lists: curated and authority lists the record is an entry on (lists have their own pages)
    when 'on_list'             then 'lists'
    -- chemical lineage (no rows yet; kept so new rows appear without a code change)
    when 'derived_from'        then 'lineage'
    -- dosing text, definitions, acronyms, pregnancy/lactation guidance: properties of
    -- a page, not relationships between two concepts, so they are not drawn
    else null
  end
$$;

grant execute on function public.network_predicate_group(text) to anon, authenticated;

-- ── 31b ─────────────────────────────────────────────────────────────────────
create or replace function public.network_neighborhood(
  p_pcid bigint,
  p_groups text[] default null,
  p_include_community boolean default false,
  p_limit integer default 40,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  with raw as (
    -- class membership, this concept as the member
    select 'cm:' || cm.class_pcid || ':' || cm.member_pcid as id,
           cm.member_pcid as subject, 'member_of'::text as predicate, cm.class_pcid as object,
           'classification'::text as grp,
           null::text as evidence_level, cm.source_system as source_agency, null::text as source_doc_id,
           cm.is_direct as direct, false as community, cm.match_basis as basis
    from class_members cm where cm.member_pcid = p_pcid
    union all
    -- class membership, this concept as the class
    select 'cm:' || cm.class_pcid || ':' || cm.member_pcid,
           cm.member_pcid, 'member_of', cm.class_pcid, 'classification',
           null, cm.source_system, null, cm.is_direct, false, cm.match_basis
    from class_members cm where cm.class_pcid = p_pcid
    union all
    -- parent class
    select 'sc:' || dc.pcid || ':' || dc.parent_pcid,
           dc.pcid, 'subclass_of', dc.parent_pcid, 'classification',
           null, dc.source_system, null, true, false, 'class hierarchy'
    from drug_classes dc where dc.pcid = p_pcid and dc.parent_pcid is not null
    union all
    -- child classes
    select 'sc:' || dc.pcid || ':' || dc.parent_pcid,
           dc.pcid, 'subclass_of', dc.parent_pcid, 'classification',
           null, dc.source_system, null, true, false, 'class hierarchy'
    from drug_classes dc where dc.parent_pcid = p_pcid
    union all
    -- ingested statements, subject side then object side (plain equi-joins; see CLAUDE.md)
    select 'cs:' || s.statement_id, s.subject_pcid, s.predicate, s.object_pcid,
           network_predicate_group(s.predicate),
           s.evidence_level, s.source_agency, s.source_doc_id, true, false, null
    from clinical_statements s
    where s.subject_pcid = p_pcid and s.object_pcid is not null
      and network_predicate_group(s.predicate) is not null
    union all
    select 'cs:' || s.statement_id, s.subject_pcid, s.predicate, s.object_pcid,
           network_predicate_group(s.predicate),
           s.evidence_level, s.source_agency, s.source_doc_id, true, false, null
    from clinical_statements s
    where s.object_pcid = p_pcid and s.subject_pcid <> p_pcid
      and network_predicate_group(s.predicate) is not null
    union all
    -- list membership, this concept as the entry (published lists only; entries with no PCID are skipped)
    select 'li:' || li.list_pcid || ':' || li.member_pcid,
           li.member_pcid, 'on_list'::text, li.list_pcid, 'lists'::text,
           null::text, null::text, null::text, true, false, l.kind || ' list'
    from list_items li join lists l on l.pcid = li.list_pcid
    where li.member_pcid = p_pcid and l.published
    union all
    -- list membership, this concept as the list
    select 'li:' || li.list_pcid || ':' || li.member_pcid,
           li.member_pcid, 'on_list', li.list_pcid, 'lists',
           null, null, null, true, false, l.kind || ' list'
    from list_items li join lists l on l.pcid = li.list_pcid
    where li.list_pcid = p_pcid and l.published and li.member_pcid is not null
    union all
    -- contributor overlay, off unless asked for, always flagged
    select 'co:' || c.id, c.subject_pcid, c.predicate, c.object_pcid,
           coalesce(network_predicate_group(c.predicate), 'interaction'),
           'contributor', null, null, true, true, null
    from community_statements c
    where p_include_community and c.is_current and c.object_pcid is not null
      and c.subject_pcid = p_pcid
    union all
    select 'co:' || c.id, c.subject_pcid, c.predicate, c.object_pcid,
           coalesce(network_predicate_group(c.predicate), 'interaction'),
           'contributor', null, null, true, true, null
    from community_statements c
    where p_include_community and c.is_current and c.object_pcid is not null
      and c.object_pcid = p_pcid and c.subject_pcid <> p_pcid
  ),
  -- one row per edge id, in case any two selects above return the same edge
  dedup as (select distinct on (id) * from raw order by id),
  counts as (
    select grp, count(*)::int n from dedup group by grp
  ),
  -- Round-robin across groups, so the first page shows the top of every group a concept has
  -- (its uses and safety statements are not buried behind 38 class memberships).
  ranked as (
    select d.*,
           row_number() over (partition by d.grp order by (not d.direct), lower(o.name), d.id) as in_group
    from dedup d
    join entities o on o.pcid = case when d.subject = p_pcid then d.object else d.subject end
    where p_groups is null or d.grp = any (p_groups)
  ),
  picked as (
    select r.*,
           row_number() over (
             order by r.in_group,
                      case r.grp when 'classification' then 1 when 'composition' then 2 when 'use' then 3
                                 when 'safety' then 4 when 'interaction' then 5 when 'lists' then 6 else 7 end,
                      r.id
           ) as rn
    from ranked r
  ),
  page as (select * from picked where rn > v_offset and rn <= v_offset + v_limit),
  ids as (
    select p_pcid as pcid
    union select subject from page
    union select object from page
  ),
  node_rows as (
    select e.pcid, e.slug, e.name, e.entity_type, dc.class_type
    from ids join entities e on e.pcid = ids.pcid
    left join drug_classes dc on dc.pcid = e.pcid
  )
  select jsonb_build_object(
    'center', (select to_jsonb(n) from node_rows n where n.pcid = p_pcid),
    'nodes',  coalesce((select jsonb_agg(to_jsonb(n) order by n.name) from node_rows n), '[]'::jsonb),
    'edges',  coalesce((select jsonb_agg(jsonb_build_object(
                 'id', id, 'subject', subject, 'predicate', predicate, 'object', object,
                 'group', grp, 'evidence_level', evidence_level, 'source_agency', source_agency,
                 'source_doc_id', source_doc_id, 'direct', direct, 'community', community, 'basis', basis
               ) order by rn) from page), '[]'::jsonb),
    'group_counts', coalesce((select jsonb_object_agg(grp, n) from counts), '{}'::jsonb),
    'total',  (select count(*) from picked),
    'offset', v_offset,
    'limit',  v_limit
  ) into v_result;

  return v_result;
end
$$;

grant execute on function public.network_neighborhood(bigint, text[], boolean, integer, integer) to anon, authenticated;

-- ── 31c ─────────────────────────────────────────────────────────────────────
create or replace function public.network_edge_evidence(p_edge_id text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_kind text := split_part(coalesce(p_edge_id, ''), ':', 1);
  v_a text := split_part(coalesce(p_edge_id, ''), ':', 2);
  v_b text := split_part(coalesce(p_edge_id, ''), ':', 3);
  v_out jsonb;
begin
  -- ids are digits only; anything else is not ours
  if v_a !~ '^[0-9]{1,18}$' or (v_kind in ('cm', 'sc', 'li') and v_b !~ '^[0-9]{1,18}$') then
    return null;
  end if;

  if v_kind = 'cs' then
    select jsonb_build_object(
      'kind', 'clinical_statement', 'statement_id', s.statement_id, 'predicate', s.predicate,
      'evidence_level', s.evidence_level, 'source_agency', s.source_agency,
      'source_doc_id', s.source_doc_id, 'source_section', s.source_section,
      'source_quote', s.source_quote, 'risk_profile', s.risk_profile,
      'qualifier_key', s.qualifier_key, 'qualifier_value', s.qualifier_value,
      'object_label', s.object_label, 'updated_at', s.updated_at)
    into v_out from clinical_statements s where s.statement_id = v_a::bigint;

  elsif v_kind = 'co' then
    select jsonb_build_object(
      'kind', 'community_statement', 'id', c.id, 'predicate', c.predicate,
      'effect', c.effect, 'citations', to_jsonb(c.citations), 'block', c.block_name,
      'created_at', c.created_at)
    into v_out from community_statements c where c.id = v_a::bigint and c.is_current;

  elsif v_kind = 'cm' then
    select jsonb_build_object(
      'kind', 'class_membership', 'direct', cm.is_direct,
      'membership_source', cm.source_system, 'match_basis', cm.match_basis,
      'class_type', dc.class_type, 'class_system', dc.source_system, 'class_code', dc.source_code)
    into v_out
    from class_members cm join drug_classes dc on dc.pcid = cm.class_pcid
    where cm.class_pcid = v_a::bigint and cm.member_pcid = v_b::bigint;

  elsif v_kind = 'li' then
    -- one entry on one list; the first entry wins if a list repeats a drug
    select jsonb_build_object(
      'kind', 'list_membership', 'list_title', l.title, 'list_kind', l.kind,
      'jurisdiction', l.jurisdiction, 'source_citation', l.source_citation, 'source_url', l.source_url,
      'license', l.license, 'rank', li.rank, 'rank_label', l.rank_label,
      'value', li.value, 'measure_label', l.measure_label, 'measure_unit', l.measure_unit,
      'status', li.legal_status, 'status_label', l.status_label, 'note', li.note, 'sources', to_jsonb(li.sources))
    into v_out
    from list_items li join lists l on l.pcid = li.list_pcid
    where li.list_pcid = v_a::bigint and li.member_pcid = v_b::bigint and l.published
    order by li.position limit 1;

  elsif v_kind = 'sc' then
    select jsonb_build_object(
      'kind', 'class_hierarchy', 'class_type', dc.class_type,
      'class_system', dc.source_system, 'class_code', dc.source_code, 'level', dc.level)
    into v_out from drug_classes dc
    where dc.pcid = v_a::bigint and dc.parent_pcid = v_b::bigint;
  end if;

  return v_out;
end
$$;

grant execute on function public.network_edge_evidence(text) to anon, authenticated;
