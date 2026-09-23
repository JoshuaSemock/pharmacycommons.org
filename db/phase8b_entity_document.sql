-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 8b — Machine-readable view: canonical entity document + read API
-- Destination: db/phase8b_entity_document.sql  (migration phase8b_entity_document)
--
-- One function builds each PCID's machine document; everything else (Edge
-- Function API, website "Data" panel, JSON-LD in <head>, snapshots) reads it.
--
--   api_resolve(ref)               'PCID-1001923' | '1001923' | 'metformin' | 'pc:moiety:metformin' → pcid
--   api_ref(pcid)                  compact {@id, pcid, name, slug, entity_type} reference
--   api_entity_content(pcid)       the hashed body (stable; no envelope/timestamps of serving)
--   api_snapshot(pcid)             store a new entity_versions row iff the content hash changed
--   api_entity_document(ref, ver)  full JSON-LD document (envelope + content), public RPC
--   api_entity_versions(ref)       version list, public RPC
--   api_entity_changes(ref, ...)   field-level change log minus actor, public RPC
--   api_class_members(ref, ...)    members of a class PCID, public RPC
--   api_index()                    API root: meta + entity counts, public RPC
--   api_snapshot_sweep(n)          snapshot PCIDs with unsnapshotted changes (scheduled/ops only)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.api_meta_value(p_key text)
returns text
language sql stable
set search_path = public
as $$ select value from api_meta where key = p_key $$;

create or replace function public.api_resolve(p_ref text)
returns bigint
language plpgsql stable
set search_path = public
as $$
declare
  r   text := btrim(coalesce(p_ref, ''));
  m   text[];
  out bigint;
begin
  r := regexp_replace(r, '\.(jsonld|json)$', '', 'i');
  m := regexp_match(r, '^(?:pcid[-:]?)?(\d{7})$', 'i');
  if m is not null then
    select pcid into out from entities where pcid = m[1]::bigint;
    return out;
  end if;
  if r like 'pc:%' then
    select pcid into out from entities where slug_uri = r;
    return out;
  end if;
  select pcid into out from entities where slug = lower(r);
  return out;
end;
$$;

create or replace function public.api_ref(p_pcid bigint)
returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
           '@id', 'pcid:' || e.pcid,
           'pcid', 'PCID-' || e.pcid,
           'name', e.name,
           'slug', e.slug,
           'entity_type', e.entity_type)
  from entities e
  where e.pcid = p_pcid
$$;

create or replace function public.api_split_codes(p text)
returns jsonb
language sql immutable
as $$
  select case when p is null or btrim(p) = '' then null else
    (select jsonb_agg(x order by ord)
       from unnest(regexp_split_to_array(p, '\s*[|,;]\s*')) with ordinality t(x, ord)
      where btrim(x) <> '')
  end
$$;

-- ── The canonical content body ─────────────────────────────────────────────
create or replace function public.api_entity_content(p_pcid bigint)
returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  e        entities%rowtype;
  blk      pcid_blocks%rowtype;
  tbl      text;
  sat      jsonb := '{}'::jsonb;
  ident    jsonb;
  attrs    jsonb;
  classif  jsonb;
  rels     jsonb;
  hier     jsonb;
  brands   jsonb;
  labels   jsonb;
  guides   jsonb;
  fda      jsonb;
  struct   jsonb;
  prov     jsonb;
  rxcui    text;
  id_keys  constant text[] := array['cas','unii','inchi_key','drugbank_id','lactmed_id','ndc_codes','fda_applnos','source_code'];
  pv_keys  constant text[] := array['primary_source','source_count','origin','source_agency','source_ref','source_system'];
  rel_keys constant text[] := array['pcid','class_pcid','class_name','synonym_of_pcid','parent_pcid','created_at','updated_at'];
  k        text;
begin
  select * into e from entities where pcid = p_pcid;
  if not found then
    return null;
  end if;
  select * into blk from pcid_blocks where entity_kind = e.entity_type;

  tbl := case e.entity_type
           when 'moiety'       then 'moieties'
           when 'combination'  then 'combinations'
           when 'precise_form' then 'precise_forms'
           when 'formulation'  then 'formulations'
           when 'class'        then 'drug_classes'
           when 'clinical'     then 'clinical_concepts'
           when 'measurement'  then 'measurements'
           when 'target'       then 'biological_targets'
           when 'functional'   then 'functional_groups'
         end;
  if tbl is not null then
    execute format('select to_jsonb(t) from public.%I t where t.pcid = $1', tbl) into sat using p_pcid;
    sat := coalesce(sat, '{}'::jsonb);
  end if;

  select l.rxcui into rxcui from rxnorm_lookup l where l.pcid = p_pcid and l.status = 'ok';

  -- identifiers: foreign-sourced codes, never keys
  ident := jsonb_strip_nulls(jsonb_build_object(
    'cas',                     sat ->> 'cas',
    'unii',                    sat ->> 'unii',
    'inchi_key',               sat ->> 'inchi_key',
    'drugbank_id',             sat ->> 'drugbank_id',
    'lactmed_id',              sat ->> 'lactmed_id',
    'rxcui',                   rxcui,
    'ndc_codes',               api_split_codes(sat ->> 'ndc_codes'),
    'fda_application_numbers', api_split_codes(sat ->> 'fda_applnos'),
    'class_code',              sat ->> 'source_code'
  ));

  -- attributes: everything else on the satellite row that is populated
  attrs := '{}'::jsonb;
  for k in select jsonb_object_keys(sat) order by 1 loop
    continue when k = any(id_keys) or k = any(pv_keys) or k = any(rel_keys);
    continue when jsonb_typeof(sat -> k) = 'null' or sat ->> k = '';
    attrs := attrs || jsonb_build_object(k, sat -> k);
  end loop;

  -- classification
  if e.entity_type = 'class' then
    classif := jsonb_strip_nulls(jsonb_build_object(
      'parent', api_ref((sat ->> 'parent_pcid')::bigint),
      'members', jsonb_build_object(
        'count',  (select count(*) from class_members cm where cm.class_pcid = p_pcid),
        'direct', (select count(*) from class_members cm where cm.class_pcid = p_pcid and cm.is_direct))
    ));
  else
    select jsonb_strip_nulls(jsonb_build_object(
             'primary', api_ref((sat ->> 'class_pcid')::bigint),
             'memberships', jsonb_agg(
               jsonb_strip_nulls(jsonb_build_object(
                 'class',            api_ref(cm.class_pcid),
                 'class_type',       dc.class_type,
                 'code',             dc.source_code,
                 'system',           cm.source_system,
                 'direct',           cm.is_direct,
                 'basis',            cm.match_basis,
                 'machine_assisted', case when lower(cm.source_system) in ('rule','agent_review') then true end))
               order by cm.is_direct desc, dc.class_type nulls last, ce.name, cm.class_pcid)))
      into classif
      from class_members cm
      join entities ce on ce.pcid = cm.class_pcid
      left join drug_classes dc on dc.pcid = cm.class_pcid
     where cm.member_pcid = p_pcid;
    if classif is null or classif = '{}'::jsonb then
      classif := jsonb_strip_nulls(jsonb_build_object('primary', api_ref((sat ->> 'class_pcid')::bigint)));
    end if;
  end if;

  -- relationships: every triple this PCID participates in, with evidence
  select jsonb_agg(
           jsonb_strip_nulls(jsonb_build_object(
             'statement_id', s.statement_id,
             'predicate',    s.predicate,
             'role',         case when s.subject_pcid = p_pcid then 'subject'
                                  when s.object_pcid  = p_pcid then 'object'
                                  else 'comparator' end,
             'subject',      api_ref(s.subject_pcid),
             'object',       api_ref(s.object_pcid),
             'object_label', s.object_label,
             'comparator',   api_ref(s.comparator_pcid),
             'qualifier',    nullif(jsonb_strip_nulls(jsonb_build_object('key', s.qualifier_key, 'value', s.qualifier_value)), '{}'::jsonb),
             'risk_profile', s.risk_profile,
             'evidence',     nullif(jsonb_strip_nulls(jsonb_build_object(
                                'level',         s.evidence_level,
                                'source_agency', s.source_agency,
                                'source_doc_id', s.source_doc_id,
                                'section',       s.source_section,
                                'quote',         s.source_quote)), '{}'::jsonb),
             'updated_at',   s.updated_at))
           order by s.statement_id)
    into rels
    from clinical_statements s
   where p_pcid in (s.subject_pcid, s.object_pcid, s.comparator_pcid);

  -- hierarchy
  hier := jsonb_strip_nulls(jsonb_build_object(
    'synonym_of', api_ref((sat ->> 'synonym_of_pcid')::bigint),
    'synonyms', (
      select jsonb_agg(api_ref(x.pcid) order by x.pcid) from (
        select pcid from moieties      where synonym_of_pcid = p_pcid union all
        select pcid from combinations  where synonym_of_pcid = p_pcid union all
        select pcid from precise_forms where synonym_of_pcid = p_pcid union all
        select pcid from formulations  where synonym_of_pcid = p_pcid) x),
    'parent_moieties', (
      select jsonb_agg(api_ref(h.moiety_pcid) || jsonb_build_object('relation', h.relation) order by h.moiety_pcid)
        from moiety_hierarchy h where h.member_pcid = p_pcid),
    'precise_forms', (
      select jsonb_agg(api_ref(h.member_pcid) order by h.member_pcid)
        from moiety_hierarchy h where h.moiety_pcid = p_pcid and h.relation = 'precise_form'),
    'combinations', (
      select jsonb_agg(api_ref(h.member_pcid) order by h.member_pcid)
        from moiety_hierarchy h where h.moiety_pcid = p_pcid and h.relation = 'combination'),
    'formulations', (
      select jsonb_agg(api_ref(h.member_pcid) order by h.member_pcid)
        from moiety_hierarchy h where h.moiety_pcid = p_pcid and h.relation = 'formulation')
  ));

  select jsonb_agg(
           jsonb_strip_nulls(jsonb_build_object(
             'name',                    coalesce(b.brand_display, b.brand_key),
             'marketed',                b.marketed,
             'rxcui',                   b.brand_rxcui,
             'fda_application_numbers', nullif(to_jsonb(b.appl_nos), '[]'::jsonb),
             'sources',                 to_jsonb(b.sources)))
           order by (b.marketed is false), coalesce(b.brand_display, b.brand_key), b.brand_key)
    into brands
    from entity_brand_names b
   where b.pcid = p_pcid;

  select case when count(*) = 0 then null else jsonb_build_object(
           'count', max(r.n_labels),
           'top', jsonb_agg(
             jsonb_strip_nulls(jsonb_build_object(
               'setid',          r.setid,
               'title',          r.title,
               'labeler',        r.labeler,
               'document_type',  r.document_type_display,
               'effective_date', case when r.effective_time ~ '^\d{8}$'
                                      then to_char(to_date(r.effective_time, 'YYYYMMDD'), 'YYYY-MM-DD') end,
               'plr_format',     r.is_plr,
               'url',            'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=' || r.setid))
             order by r.rnk, r.setid)) end
    into labels
    from entity_label_rank r
   where r.pcid = p_pcid and r.rnk <= 5;

  select jsonb_agg(
           jsonb_strip_nulls(jsonb_build_object(
             'guideline_id',  g.guideline_id,
             'title',         g.title,
             'short_title',   g.short_title,
             'organization',  g.organization,
             'year',          g.pub_year,
             'citation',      g.citation,
             'url',           g.url,
             'context',       eg.context,
             'superseded_by', g.superseded_by))
           order by eg.sort_order nulls last, g.guideline_id)
    into guides
    from entity_guidelines eg
    join guidelines g using (guideline_id)
   where eg.pcid = p_pcid;

  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'application_number', a.appl_no,
           'application_type',   a.application_type,
           'sponsor',            a.sponsor_name)) order by a.appl_no)
    into fda
    from fda_applications a
   where a.pcid = p_pcid;

  select nullif(jsonb_strip_nulls(to_jsonb(ph) - 'pcid' - 'raw' - 'fetched_at' - 'source'), '{}'::jsonb)
    into struct
    from physiochemical ph
   where ph.pcid = p_pcid;

  -- provenance: which registered source contributed which part of this record
  with src(key, part) as (
    select lower(sat ->> 'primary_source'), 'identity' where sat ? 'primary_source' and sat ->> 'primary_source' is not null
    union select lower(sat ->> 'source_system'), 'identity' where sat ->> 'source_system' is not null
    union select 'rxnorm', 'identifiers' where rxcui is not null
    union select lower(cm.source_system), 'classification' from class_members cm where cm.member_pcid = p_pcid and cm.source_system is not null
    union select lower(x), 'brands' from entity_brand_names b, unnest(b.sources) x where b.pcid = p_pcid
    union select coalesce(lower(s.source_agency), case when s.evidence_level = 'curator_assertion' then 'pharmacycommons' end), 'relationships'
            from clinical_statements s where p_pcid in (s.subject_pcid, s.object_pcid, s.comparator_pcid)
    union select 'dailymed', 'labels' where labels is not null
    union select 'guideline', 'guidelines' where guides is not null
    union select 'cas', 'structure' where struct is not null
  ), agg as (
    select key, jsonb_agg(part order by part) parts from src where key is not null group by key
  )
  select jsonb_build_object(
           'primary_source', sat ->> 'primary_source',
           'source_count',   (sat ->> 'source_count')::int,
           'origin',         sat ->> 'origin',
           'record_created', e.created_at,
           'record_updated', e.updated_at,
           'sources', coalesce(jsonb_agg(
               jsonb_strip_nulls(jsonb_build_object(
                 'key',         a.key,
                 'name',        coalesce(ds.name, a.key),
                 'publisher',   ds.publisher,
                 'url',         ds.url,
                 'license',     ds.license,
                 'terms_url',   ds.terms_url,
                 'kind',        coalesce(ds.kind, 'external'),
                 'contributes', a.parts))
               order by a.key), '[]'::jsonb))
    into prov
    from agg a left join data_sources ds on ds.source_key = a.key;
  prov := jsonb_strip_nulls(prov);

  return jsonb_strip_nulls(jsonb_build_object(
    'pcid',           'PCID-' || e.pcid,
    'pcid_int',       e.pcid,
    'entity_type',    e.entity_type,
    'block',          jsonb_build_object('id', blk.block_id, 'label', blk.label),
    'name',           e.name,
    'slug',           e.slug,
    'slug_uri',       e.slug_uri,
    'identifiers',    nullif(ident, '{}'::jsonb),
    'attributes',     nullif(attrs, '{}'::jsonb),
    'classification', nullif(classif, '{}'::jsonb),
    'hierarchy',      nullif(hier, '{}'::jsonb),
    'relationships',  rels,
    'brands',         brands,
    'labels',         labels,
    'fda_applications', fda,
    'structure',      struct,
    'guidelines',     guides,
    'provenance',     prov
  ));
end;
$$;

-- ── Snapshots ──────────────────────────────────────────────────────────────
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
  result entity_versions%rowtype;
begin
  perform pg_advisory_xact_lock(7700000000 + p_pcid);
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

  select max(change_id) into mc from entity_changes where pcid = p_pcid;

  insert into entity_versions (pcid, version, content, content_hash, reason, change_through)
  values (
    p_pcid,
    case when had then last.version + 1 else 1 end,
    c, h,
    case when not had then 'baseline'
         when coalesce(mc, 0) > coalesce(last.change_through, 0) then 'change'
         else 'derived' end,
    mc)
  returning * into result;
  return result;
end;
$$;
revoke execute on function public.api_snapshot(bigint) from public, anon, authenticated;

create or replace function public.api_snapshot_sweep(p_limit int default 5000)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  p bigint;
  n int := 0;
begin
  -- PCIDs with no snapshot yet, then PCIDs whose change log moved past their latest snapshot
  for p in
    select e.pcid from entities e
     where not exists (select 1 from entity_versions v where v.pcid = e.pcid)
    union
    select c.pcid from (select pcid, max(change_id) mc from entity_changes group by pcid) c
     where c.mc > coalesce((select max(v.change_through) from entity_versions v where v.pcid = c.pcid), 0)
    limit p_limit
  loop
    perform api_snapshot(p);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.api_snapshot_sweep(int) from public, anon, authenticated;

-- ── Public read RPCs ───────────────────────────────────────────────────────
create or replace function public.api_not_found(p_ref text)
returns jsonb
language sql stable
set search_path = public
as $$
  select case
    when r.pcid is not null then jsonb_build_object(
      'error', true, 'status', 410, 'code', 'retired',
      'message', 'PCID-' || r.pcid || ' was retired and is never reissued.',
      'retired_at', r.retired_at, 'reason', r.reason)
    else jsonb_build_object(
      'error', true, 'status', 404, 'code', 'not_found',
      'message', 'No record matches ' || coalesce(p_ref, '(empty)') || '. Use a PCID (PCID-1001923), a slug (metformin) or a slug URI (pc:moiety:metformin).')
  end
  from (select null) x
  left join pcid_retired r on r.pcid = (regexp_match(coalesce(p_ref, ''), '(\d{7})'))[1]::bigint
$$;

create or replace function public.api_entity_document(p_ref text, p_version int default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p        bigint := api_resolve(p_ref);
  v        entity_versions%rowtype;
  latest   int;
  site     text := api_meta_value('site_base');
  api      text := api_meta_value('api_base') || '/' || api_meta_value('api_version');
  cur_slug text;
  types    jsonb;
begin
  if p is null then
    return api_not_found(p_ref);
  end if;

  if p_version is null then
    v := api_snapshot(p);
  else
    select * into v from entity_versions where pcid = p and version = p_version;
    if not found then
      return jsonb_build_object('error', true, 'status', 404, 'code', 'version_not_found',
        'message', format('PCID-%s has no version %s.', p, p_version));
    end if;
  end if;
  select max(version) into latest from entity_versions where pcid = p;
  select slug into cur_slug from entities where pcid = p;

  types := case v.content ->> 'entity_type'
             when 'moiety'       then '["pc:ActiveMoiety","schema:Drug"]'
             when 'combination'  then '["pc:CombinationProduct","schema:Drug"]'
             when 'precise_form' then '["pc:PreciseForm","schema:Drug"]'
             when 'formulation'  then '["pc:MarketedFormulation","schema:Drug"]'
             when 'class'        then '["pc:PharmacologicClass","schema:DrugClass"]'
             when 'clinical'     then '["pc:ClinicalConcept","schema:MedicalEntity"]'
             when 'measurement'  then '["pc:Measurement","schema:MedicalEntity"]'
             when 'target'       then '["pc:BiologicalTarget","schema:BioChemEntity"]'
             when 'functional'   then '["pc:FunctionalGroup"]'
           end::jsonb;

  return jsonb_build_object(
      '@context', api || '/context.jsonld',
      '@id',      site || '/id/PCID-' || p,
      '@type',    types)
    || v.content
    || jsonb_build_object(
      'version', jsonb_build_object(
          'number',     v.version,
          'latest',     latest,
          'is_latest',  v.version = latest,
          'hash',       'sha256:' || v.content_hash,
          'reason',     v.reason,
          'created_at', v.created_at),
      'links', jsonb_build_object(
          'self',      case when p_version is null then api || '/entities/PCID-' || p
                            else api || '/entities/PCID-' || p || '/versions/' || v.version end,
          'canonical', site || '/id/PCID-' || p,
          'html',      site || '/drugs/' || cur_slug,
          'json',      api || '/entities/PCID-' || p || '.json',
          'versions',  api || '/entities/PCID-' || p || '/versions',
          'changes',   api || '/entities/PCID-' || p || '/changes',
          'schema',    api || '/schema/entity.json',
          'context',   api || '/context.jsonld'),
      'license', jsonb_build_object(
          'data', api_meta_value('data_license'),
          'url',  api_meta_value('data_license_url'),
          'note', 'Upstream sources keep their own terms — see provenance.sources[].license / terms_url.'),
      'api_version',    api_meta_value('api_version'),
      'schema_version', api_meta_value('schema_version'),
      'generated_at',   now());
end;
$$;

create or replace function public.api_entity_versions(p_ref text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p   bigint := api_resolve(p_ref);
  api text := api_meta_value('api_base') || '/' || api_meta_value('api_version');
begin
  if p is null then
    return api_not_found(p_ref);
  end if;
  perform api_snapshot(p);  -- make sure the current state is on the list
  return jsonb_build_object(
    'pcid', 'PCID-' || p,
    'entity', api_ref(p),
    'versions', (
      select jsonb_agg(jsonb_build_object(
               'number',     v.version,
               'hash',       'sha256:' || v.content_hash,
               'reason',     v.reason,
               'created_at', v.created_at,
               'changes',    (select count(*) from entity_changes c
                               where c.pcid = p
                                 and c.change_id >  coalesce(pv.change_through, 0)
                                 and c.change_id <= coalesce(v.change_through, 0)
                                 and v.reason = 'change'),
               'url',        api || '/entities/PCID-' || p || '/versions/' || v.version)
             order by v.version desc)
        from entity_versions v
        left join entity_versions pv on pv.pcid = v.pcid and pv.version = v.version - 1
       where v.pcid = p));
end;
$$;

create or replace function public.api_entity_changes(p_ref text, p_limit int default 50, p_before bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p    bigint := api_resolve(p_ref);
  lim  int := least(greatest(coalesce(p_limit, 50), 1), 200);
  rows jsonb;
  api  text := api_meta_value('api_base') || '/' || api_meta_value('api_version');
begin
  if p is null then
    return api_not_found(p_ref);
  end if;
  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'change_id',   c.change_id,
           'changed_at',  c.changed_at,
           'table',       c.table_name,
           'op',          c.op,
           'row_key',     c.row_key,
           'fields',      to_jsonb(c.changed_fields),
           'diff',        c.diff,
           'source',      c.source,
           'revision_id', c.revision_id)) order by c.change_id desc)
    into rows
    from (select * from entity_changes
           where pcid = p and (p_before is null or change_id < p_before)
           order by change_id desc limit lim) c;
  return jsonb_strip_nulls(jsonb_build_object(
    'pcid', 'PCID-' || p,
    'entity', api_ref(p),
    'changes', coalesce(rows, '[]'::jsonb),
    'next', case when jsonb_array_length(coalesce(rows, '[]'::jsonb)) = lim
                 then api || '/entities/PCID-' || p || '/changes?before=' || (rows -> (lim - 1) ->> 'change_id') end,
    'note', case when rows is null then 'No edits recorded since change tracking began (2026-09-23). Earlier history lives in the source workbook''s Dispatch_Log.' end));
end;
$$;

create or replace function public.api_class_members(p_ref text, p_limit int default 100, p_offset int default 0, p_direct_only boolean default false)
returns jsonb
language plpgsql
security definer
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
security definer
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

-- Grants: invoker functions read under RLS; definer RPCs are the intended public surface
grant execute on function public.api_meta_value(text)                 to anon, authenticated;
grant execute on function public.api_resolve(text)                    to anon, authenticated;
grant execute on function public.api_ref(bigint)                      to anon, authenticated;
grant execute on function public.api_split_codes(text)                to anon, authenticated;
grant execute on function public.api_entity_content(bigint)           to anon, authenticated;
grant execute on function public.api_not_found(text)                  to anon, authenticated;
grant execute on function public.api_entity_document(text, int)       to anon, authenticated;
grant execute on function public.api_entity_versions(text)            to anon, authenticated;
grant execute on function public.api_entity_changes(text, int, bigint) to anon, authenticated;
grant execute on function public.api_class_members(text, int, int, boolean) to anon, authenticated;
grant execute on function public.api_index()                          to anon, authenticated;
