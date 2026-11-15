-- Baseline: full live schema of public + archive, pg_dump 17.9 --schema-only of project
-- nenwovhyrdcdkhxzjiiv on 2026-11-14 (188 migrations, latest 20261105212051).
-- Authoritative over the partial db/phase*.sql files for rebuilds; see docs/local-app.md
-- and docs/schema-drift-2026-11-14.md. Restore order: Supabase stack -> extensions -> this.

--
-- PostgreSQL database dump
--

\restrict E8mIstsyA9h4nxUncRiviDtIsD6gr41XFallfhOaufaMhBYi3FDfgJ8ZBQ8Kv2J

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: archive; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA archive;


ALTER SCHEMA archive OWNER TO postgres;

--
-- Name: SCHEMA archive; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON SCHEMA archive IS 'Retired staging/import and old review-queue tables. Kept for reference; not exposed to the API.';


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: accept_rebased_revision(uuid, bigint, bigint, jsonb, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.accept_rebased_revision(p_reviewer uuid, p_revision_id bigint, p_current_revision_id bigint, p_payload jsonb, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r page_revisions%rowtype;
  v_cur bigint;
begin
  if not pc_has_role(p_reviewer, 'patroller') then raise exception 'not_patroller' using errcode = '42501'; end if;
  select * into r from page_revisions where id = p_revision_id and patrol_status = 'pending' and format = 2 for update;
  if not found then raise exception 'not_pending'; end if;
  if r.created_by = p_reviewer then raise exception 'cannot_review_own'; end if;
  select current_revision_id into v_cur from page_content where pcid = r.pcid for update;
  if v_cur is distinct from p_current_revision_id then raise exception 'edit_conflict'; end if;
 
  update page_revisions
  set parent_id = v_cur, model = p_payload -> 'model', source_md = p_payload ->> 'source_md',
      extracted = p_payload -> 'extracted', description = coalesce(p_payload ->> 'description', ''),
      body_md = coalesce(p_payload ->> 'body_md', ''),
      changed_sections = coalesce(array(select jsonb_array_elements_text(p_payload -> 'changed_sections')), '{}'),
      patrol_status = 'patrolled', patrolled_by = p_reviewer, patrolled_at = now(), review_note = p_note
  where id = r.id;
  perform apply_page_revision(r.id, p_reviewer);
end $$;


ALTER FUNCTION public.accept_rebased_revision(p_reviewer uuid, p_revision_id bigint, p_current_revision_id bigint, p_payload jsonb, p_note text) OWNER TO postgres;

--
-- Name: accept_revision(bigint, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.accept_revision(p_revision_id bigint, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r page_revisions%rowtype;
  v_cur bigint;
begin
  if not has_role('patroller') then raise exception 'not_patroller' using errcode = '42501'; end if;
  select * into r from page_revisions where id = p_revision_id and patrol_status = 'pending' for update;
  if not found then raise exception 'not_pending'; end if;
  if r.created_by = auth.uid() then raise exception 'cannot_review_own'; end if;
  select current_revision_id into v_cur from page_content where pcid = r.pcid for update;
  -- A format-2 edit that is no longer based on the live page is rebased by
  -- publish-page (action 'accept'), which merges it section by section first.
  if v_cur is distinct from r.parent_id then raise exception 'stale_revision' using detail = coalesce(v_cur::text, ''); end if;
 
  update page_revisions
  set patrol_status = 'patrolled', patrolled_by = auth.uid(), patrolled_at = now(), review_note = p_note
  where id = r.id;
  if r.format = 2 then
    perform apply_page_revision(r.id, auth.uid());
  else
    update page_content
    set description = r.description, body_md = r.body_md, current_revision_id = r.id, updated_at = now()
    where pcid = r.pcid;
    perform refresh_page_links(r.pcid);
  end if;
end $$;


ALTER FUNCTION public.accept_revision(p_revision_id bigint, p_note text) OWNER TO postgres;

--
-- Name: admin_contributors(text, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.admin_contributors(p_query text DEFAULT NULL::text, p_limit integer DEFAULT 50) RETURNS TABLE(user_id uuid, handle text, credential text, verified boolean, roles text[], blocked boolean, block_reason text, block_expires_at timestamp with time zone, edits bigint, last_edit_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not has_role('admin') then raise exception 'not_admin' using errcode = '42501'; end if;
  return query
  with activity as (
    select created_by as uid, created_at from page_revisions where created_by is not null
    union all select created_by, created_at from infobox_edits where created_by is not null
    union all select created_by, created_at from brand_edits where created_by is not null
    union all select created_by, created_at from community_pages where created_by is not null
  ), agg as (
    select uid, count(*) as n, max(created_at) as last_at from activity group by uid
  )
  select cp.user_id, cp.handle,
         pc_credential_badge(pv.credential, pv.primary_taxonomy),
         coalesce(pv.status = 'active', false),
         coalesce((select array_agg(ur.role order by ur.role) from user_roles ur where ur.user_id = cp.user_id), '{}'),
         (b.user_id is not null and (b.expires_at is null or b.expires_at > now())),
         b.reason, b.expires_at,
         coalesce(a.n, 0), a.last_at
  from contributor_profiles cp
  left join provider_verifications pv on pv.user_id = cp.user_id
  left join contributor_blocks b on b.user_id = cp.user_id
  left join agg a on a.uid = cp.user_id
  where p_query is null or trim(p_query) = '' or cp.handle ilike '%' || trim(p_query) || '%'
  order by a.last_at desc nulls last, cp.handle
  limit least(greatest(p_limit, 1), 200);
end $$;


ALTER FUNCTION public.admin_contributors(p_query text, p_limit integer) OWNER TO postgres;

--
-- Name: api_class_members(text, integer, integer, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.api_class_members(p_ref text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0, p_direct_only boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
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


ALTER FUNCTION public.api_class_members(p_ref text, p_limit integer, p_offset integer, p_direct_only boolean) OWNER TO postgres;

--
-- Name: api_entity_changes(text, integer, bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.api_entity_changes(p_ref text, p_limit integer DEFAULT 50, p_before bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


ALTER FUNCTION public.api_entity_changes(p_ref text, p_limit integer, p_before bigint) OWNER TO postgres;

--
-- Name: FUNCTION api_entity_changes(p_ref text, p_limit integer, p_before bigint); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.api_entity_changes(p_ref text, p_limit integer, p_before bigint) IS 'PUBLIC API (intentional SECURITY DEFINER): reads entity_changes, which has no public policy, and omits the actor column. Advisor lints 0028/0029 accepted 2026-09-24.';


--
-- Name: api_entity_content(bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.api_entity_content(p_pcid bigint) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $_$
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

  attrs := '{}'::jsonb;
  for k in select jsonb_object_keys(sat) order by 1 loop
    continue when k = any(id_keys) or k = any(pv_keys) or k = any(rel_keys);
    continue when jsonb_typeof(sat -> k) = 'null' or sat ->> k = '';
    attrs := attrs || jsonb_build_object(k, sat -> k);
  end loop;

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

  with src(key, part) as (
    select lower(sat ->> 'primary_source'), 'identity' where sat ->> 'primary_source' is not null
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
$_$;


ALTER FUNCTION public.api_entity_content(p_pcid bigint) OWNER TO postgres;

--
-- Name: api_entity_document(text, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.api_entity_document(p_ref text, p_version integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
          'html',      site || case when v.content ->> 'entity_type' = 'class' then '/classes/' else '/drugs/' end || cur_slug,
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


ALTER FUNCTION public.api_entity_document(p_ref text, p_version integer) OWNER TO postgres;

--
-- Name: FUNCTION api_entity_document(p_ref text, p_version integer); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.api_entity_document(p_ref text, p_version integer) IS 'PUBLIC API (intentional SECURITY DEFINER): calls api_snapshot(), which writes entity_versions. Advisor lints 0028/0029 accepted 2026-09-24.';


--
-- Name: api_entity_versions(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.api_entity_versions(p_ref text) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
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


ALTER FUNCTION public.api_entity_versions(p_ref text) OWNER TO postgres;

--
-- Name: api_index(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.api_index() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'name',           'Pharmacy Commons API',
    'api_version',    api_meta_value('api_version'),
    'schema_version', api_meta_value('schema_version'),
    'site',           api_meta_value('site_base'),
    'license',        jsonb_build_object(
                        'data',  api_meta_value('data_license'),
                        'url',   api_meta_value('data_license_url'),
                        'scope', api_meta_value('data_license_scope')),
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


ALTER FUNCTION public.api_index() OWNER TO postgres;

--
-- Name: api_meta_value(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.api_meta_value(p_key text) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$ select value from api_meta where key = p_key $$;


ALTER FUNCTION public.api_meta_value(p_key text) OWNER TO postgres;

--
-- Name: api_not_found(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.api_not_found(p_ref text) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with recursive ref as (
    select (regexp_match(coalesce(p_ref, ''), '(\d{7})'))[1]::bigint as pcid
  ),
  walk(pcid, hop) as (
    select r.replaced_by_pcid, 1
      from ref join pcid_retired r on r.pcid = ref.pcid
    union all
    select r.replaced_by_pcid, w.hop + 1
      from walk w join pcid_retired r on r.pcid = w.pcid
     where w.hop < 10
  ),
  target as (
    select w.pcid
      from walk w
     where exists (select 1 from entities e where e.pcid = w.pcid)
     order by w.hop
     limit 1
  )
  select case
    when r.pcid is not null then
      jsonb_build_object(
        'error', true, 'status', 410, 'code', 'retired',
        'message', 'PCID-' || r.pcid || ' was retired and is never reissued.',
        'retired_at', r.retired_at, 'reason', r.reason)
      || case when t.pcid is not null
              then jsonb_build_object('replaced_by', 'PCID-' || t.pcid, 'replaced_by_pcid', t.pcid)
              else '{}'::jsonb end
    else jsonb_build_object(
      'error', true, 'status', 404, 'code', 'not_found',
      'message', 'No record matches ' || coalesce(p_ref, '(empty)') || '. Use a PCID (PCID-1001923), a slug (metformin) or a slug URI (pc:moiety:metformin).')
  end
  from ref
  left join pcid_retired r on r.pcid = ref.pcid
  left join target t on true
$$;


ALTER FUNCTION public.api_not_found(p_ref text) OWNER TO postgres;

--
-- Name: api_ref(bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.api_ref(p_pcid bigint) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
           '@id', (select value from api_meta where key = 'site_base') || '/id/PCID-' || e.pcid,
           'pcid', 'PCID-' || e.pcid,
           'name', e.name,
           'slug', e.slug,
           'entity_type', e.entity_type)
  from entities e
  where e.pcid = p_pcid
$$;


ALTER FUNCTION public.api_ref(p_pcid bigint) OWNER TO postgres;

--
-- Name: api_resolve(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.api_resolve(p_ref text) RETURNS bigint
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION public.api_resolve(p_ref text) OWNER TO postgres;

--
-- Name: api_search(text, integer, text[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.api_search(p_q text, p_limit integer DEFAULT 20, p_types text[] DEFAULT NULL::text[]) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $_$
  with params as (
    select lower(trim(coalesce(p_q, ''))) as raw,
           replace(replace(replace(lower(trim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_') as q,
           least(greatest(coalesce(p_limit, 20), 1), 100) as lim,
           coalesce(p_types, array['moiety', 'combination', 'class']) as types,
           (select value from api_meta where key = 'site_base') as site,
           (select value from api_meta where key = 'api_base') as api,
           regexp_replace(lower(coalesce(p_q, '')), '[^a-z0-9]+', '', 'g') as akey,
           array(select w from regexp_split_to_table(lower(coalesce(p_q, '')), '[^a-z0-9]+') w
                  where length(w) >= 2) as words
  ),
  cand as (
    select c.pcid, c.entity_type, c.name, c.slug, lower(c.name) as ln, c.brand_names, false as alias_hit
      from catalog_entries c, params p
     where c.entity_type = any (p.types)
    union all
    select e.pcid, 'class', e.name, e.slug, lower(e.name), null::text[],
           exists (select 1 from class_search_aliases a
                    where a.class_pcid = e.pcid
                      and a.alias_key in (p.akey, regexp_replace(p.akey, 's$', '')))
      from drug_classes d
      join entities e using (pcid), params p
     where 'class' = any (p.types) and d.member_count > 0
  ),
  scored as (
    select c.*,
           case when c.slug = p.raw then 100
                when c.ln = p.raw then 95
                when c.alias_hit and length(p.akey) >= 2 then 92
                when c.ln like p.q || '%' then 80
                when c.ln like '% ' || p.q || '%' then 60
                when cardinality(p.words) > 1
                     and not exists (select 1 from unnest(p.words) w where position(w in c.ln) = 0) then 50
                when c.ln like '%' || p.q || '%' then 40
                else 0 end as name_score,
           b.brand_score,
           b.brand
      from cand c
     cross join params p
      left join lateral (
             select case when lower(x) = p.raw then 90
                         when lower(x) like p.q || '%' then 75
                         else 35 end as brand_score,
                    x as brand
               from unnest(c.brand_names) x
              where lower(x) like '%' || p.q || '%'
              order by 1 desc, length(x)
              limit 1
           ) b on true
     where length(p.raw) >= 2
  ),
  hits as (
    select s.*,
           greatest(s.name_score, coalesce(s.brand_score, 0)) as score,
           case when s.slug = (select raw from params) then 'slug'
                when s.alias_hit and s.name_score = 92 then 'alias'
                when coalesce(s.brand_score, 0) > s.name_score then 'brand'
                when s.name_score = 50 then 'words'
                else 'name' end as matched_on
      from scored s
     where greatest(s.name_score, coalesce(s.brand_score, 0)) > 0
  ),
  ranked as (
    select h.*, count(*) over () as total
      from hits h
     order by h.score desc,
              array_position(array['moiety', 'combination', 'class', 'precise_form', 'formulation'], h.entity_type),
              length(h.name), h.name
     limit (select lim from params)
  )
  select jsonb_build_object(
           'query', (select trim(coalesce(p_q, '')) from params),
           'types', to_jsonb((select types from params)),
           'total', coalesce((select max(total) from ranked), 0),
           'count', (select count(*) from ranked),
           'results', coalesce((
             select jsonb_agg(jsonb_build_object(
                      '@id', p.site || '/id/PCID-' || r.pcid,
                      'pcid', 'PCID-' || r.pcid,
                      'name', r.name,
                      'slug', r.slug,
                      'entity_type', r.entity_type,
                      'match', jsonb_strip_nulls(jsonb_build_object(
                                 'on', r.matched_on,
                                 'text', case when r.matched_on = 'brand' then r.brand end,
                                 'score', r.score)),
                      'links', jsonb_build_object(
                                 'json', p.api || '/v1/entities/PCID-' || r.pcid,
                                 'html', p.site || '/id/PCID-' || r.pcid))
                    order by r.score desc,
                             array_position(array['moiety', 'combination', 'class', 'precise_form', 'formulation'], r.entity_type),
                             length(r.name), r.name)
               from ranked r, params p), '[]'::jsonb))
$_$;


ALTER FUNCTION public.api_search(p_q text, p_limit integer, p_types text[]) OWNER TO postgres;

--
-- Name: FUNCTION api_search(p_q text, p_limit integer, p_types text[]); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.api_search(p_q text, p_limit integer, p_types text[]) IS 'GET /v1/search?q= — find records by generic name, brand or slug. Public, read-only, security invoker.';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: entity_versions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.entity_versions (
    pcid bigint NOT NULL,
    version integer NOT NULL,
    content jsonb NOT NULL,
    content_hash text NOT NULL,
    reason text NOT NULL,
    change_through bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    changes_folded integer,
    CONSTRAINT entity_versions_reason_check CHECK ((reason = ANY (ARRAY['baseline'::text, 'change'::text, 'derived'::text])))
);


ALTER TABLE public.entity_versions OWNER TO postgres;

--
-- Name: TABLE entity_versions; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.entity_versions IS 'Immutable snapshots of each PCID''s canonical document content. reason: baseline = first capture; change = a logged edit to this record; derived = upstream derived data changed (brand/class/label rebuilds) with no direct edit.';


--
-- Name: api_snapshot(bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.api_snapshot(p_pcid bigint) RETURNS public.entity_versions
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


ALTER FUNCTION public.api_snapshot(p_pcid bigint) OWNER TO postgres;

--
-- Name: api_snapshot_all(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.api_snapshot_all(p_entity_type text DEFAULT NULL::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


ALTER FUNCTION public.api_snapshot_all(p_entity_type text) OWNER TO postgres;

--
-- Name: api_snapshot_sweep(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.api_snapshot_sweep(p_limit integer DEFAULT 5000) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  p bigint;
  n int := 0;
begin
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


ALTER FUNCTION public.api_snapshot_sweep(p_limit integer) OWNER TO postgres;

--
-- Name: api_split_codes(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.api_split_codes(p text) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select case when p is null or btrim(p) = '' then null else
    (select jsonb_agg(x order by ord)
       from unnest(regexp_split_to_array(p, '\s*[|,;]\s*')) with ordinality t(x, ord)
      where btrim(x) <> '')
  end
$$;


ALTER FUNCTION public.api_split_codes(p text) OWNER TO postgres;

--
-- Name: apply_page_revision(bigint, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.apply_page_revision(p_rev bigint, p_actor uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r          page_revisions%rowtype;
  v_patrol   text;
  v_by       uuid;
  v_at       timestamptz;
  l          jsonb;
  v_key      text;
  v_desired  jsonb;
  v_cur      record;
  v_block    record;
  v_lines    jsonb;
  v_current  jsonb;
begin
  select * into r from page_revisions where id = p_rev;
  if not found or r.format <> 2 then raise exception 'not_a_page_model_revision'; end if;

  -- Rows written here inherit the revision's review state.
  v_patrol := case when r.patrol_status = 'patrolled' then 'patrolled' else 'unpatrolled' end;
  v_by := case when v_patrol = 'patrolled' then coalesce(r.patrolled_by, p_actor) end;
  v_at := case when v_patrol = 'patrolled' then coalesce(r.patrolled_at, now()) end;

  insert into page_content (pcid) values (r.pcid) on conflict (pcid) do nothing;
  update page_content
  set description = r.description, body_md = r.body_md, current_revision_id = r.id, updated_at = now()
  where pcid = r.pcid;

  -- Links and value references, from what the parser extracted.
  delete from page_links where source_pcid = r.pcid;
  insert into page_links (source_pcid, target_text, target_pcid)
  select r.pcid, t, resolve_page_target(t)
  from (select distinct lower(trim(e ->> 'target')) as t from jsonb_array_elements(r.extracted -> 'links') e) x
  where t <> '';

  delete from page_property_refs where source_pcid = r.pcid;
  insert into page_property_refs (source_pcid, property_key, target_text, target_pcid)
  select r.pcid, k, tt, case when tt = '' then r.pcid else resolve_page_target(tt) end
  from (select distinct lower(e ->> 'key') as k, lower(trim(coalesce(e ->> 'target', ''))) as tt
        from jsonb_array_elements(r.extracted -> 'properties') e) x
  where exists (select 1 from infobox_properties p where p.key = x.k);

  -- Quick Facts: desired overrides vs current community rows, key by key.
  for v_key in
    select key from infobox_properties
  loop
    select e into v_desired
    from jsonb_array_elements(coalesce(r.model -> 'infobox' -> 'lines', '[]'::jsonb)) e
    where e ->> 'key' = v_key;
    select * into v_cur from infobox_edits
    where pcid = r.pcid and property_key = v_key and is_current
    order by id desc limit 1;

    if v_desired is null then
      -- No override in the page: clear an existing one.
      if v_cur.id is not null and (v_cur.value is not null or v_cur.is_null_override) then
        update infobox_edits set is_current = false where pcid = r.pcid and property_key = v_key and is_current;
        insert into infobox_edits (pcid, property_key, value, citation, summary, is_current, created_by,
                                   patrol_status, patrolled_by, patrolled_at, revision_id)
        values (r.pcid, v_key, null, 'removed in page revision ' || r.id, r.summary, true, r.created_by,
                v_patrol, v_by, v_at, r.id);
      end if;
    elsif v_cur.id is null
       or v_cur.value is distinct from nullif(v_desired ->> 'value', '')
       or v_cur.is_null_override is distinct from (v_desired ->> 'isNull')::boolean
       or v_cur.citation is distinct from pc_cite_text(v_desired -> 'citations') then
      update infobox_edits set is_current = false where pcid = r.pcid and property_key = v_key and is_current;
      insert into infobox_edits (pcid, property_key, value, is_null_override, citation, summary, is_current,
                                 created_by, patrol_status, patrolled_by, patrolled_at, revision_id)
      values (r.pcid, v_key, nullif(v_desired ->> 'value', ''), (v_desired ->> 'isNull')::boolean,
              pc_cite_text(v_desired -> 'citations'), r.summary, true, r.created_by,
              v_patrol, v_by, v_at, r.id);
    end if;
    v_desired := null;
  end loop;

  -- Brands: add / hide lines vs current brand_edits, brand by brand.
  for v_cur in
    select coalesce(d.k, c.brand_key) as brand_key, d.line, c.id as cur_id, c.action as cur_action,
           c.citation as cur_citation, c.summary as cur_summary
    from (
      select pc_brand_key(e ->> 'brand') as k, e as line
      from jsonb_array_elements(coalesce(r.model -> 'brands' -> 'lines', '[]'::jsonb)) e
      where e ->> 'action' in ('add', 'hide')
    ) d
    full join (
      select * from brand_edits where pcid = r.pcid and is_current and action in ('add', 'hide')
    ) c on c.brand_key = d.k
  loop
    if v_cur.line is null then
      update brand_edits set is_current = false where pcid = r.pcid and brand_key = v_cur.brand_key and is_current;
      insert into brand_edits (pcid, brand_key, brand_display, action, citation, summary, is_current, created_by,
                               patrol_status, patrolled_by, patrolled_at, revision_id)
      select r.pcid, v_cur.brand_key, b.brand_display, 'clear', 'removed in page revision ' || r.id, r.summary, true,
             r.created_by, v_patrol, v_by, v_at, r.id
      from brand_edits b where b.id = v_cur.cur_id;
    elsif v_cur.cur_id is null
       or v_cur.cur_action <> (v_cur.line ->> 'action')
       or v_cur.cur_citation <> pc_cite_text(v_cur.line -> 'citations')
       or (v_cur.line ->> 'action' = 'hide' and v_cur.cur_summary is distinct from (v_cur.line ->> 'reason')) then
      update brand_edits set is_current = false where pcid = r.pcid and brand_key = v_cur.brand_key and is_current;
      insert into brand_edits (pcid, brand_key, brand_display, action, citation, summary, is_current, created_by,
                               patrol_status, patrolled_by, patrolled_at, revision_id)
      values (r.pcid, v_cur.brand_key, trim(regexp_replace(v_cur.line ->> 'brand', '\s+', ' ', 'g')),
              v_cur.line ->> 'action', pc_cite_text(v_cur.line -> 'citations'),
              -- hide: the reason readers see is the summary of the row (as edit_brand stores it)
              case when v_cur.line ->> 'action' = 'hide' then coalesce(nullif(v_cur.line ->> 'reason', ''), r.summary) else r.summary end,
              true, r.created_by, v_patrol, v_by, v_at, r.id);
    end if;
  end loop;

  -- Threshold blocks: each block is replaced as a whole when its lines change.
  for v_block in
    select b.name from block_schemas b where b.grammar = 'threshold'
  loop
    select coalesce(jsonb_agg(line order by sec_ord, part_ord, line_ord), '[]'::jsonb) into v_lines
    from jsonb_array_elements(r.model -> 'main') with ordinality as s(item, sec_ord),
         jsonb_array_elements(coalesce(s.item -> 'parts', '[]'::jsonb)) with ordinality as p(part, part_ord),
         jsonb_array_elements(coalesce(p.part -> 'block' -> 'lines', '[]'::jsonb)) with ordinality as l(line, line_ord)
    where s.item ->> 'kind' = 'section' and p.part ->> 'kind' = 'block' and p.part -> 'block' ->> 'name' = v_block.name;

    select coalesce(jsonb_agg(jsonb_build_object(
             'measure', measure, 'comparator', comparator, 'low', low, 'high', high, 'action', action,
             'citations', to_jsonb(citations)) order by position), '[]'::jsonb)
    into v_current
    from threshold_rules where pcid = r.pcid and block_name = v_block.name and is_current;

    if v_current is distinct from (
         select coalesce(jsonb_agg(jsonb_build_object(
                  'measure', x ->> 'measure', 'comparator', x ->> 'comparator',
                  'low', (x ->> 'low')::numeric, 'high', (x ->> 'high')::numeric, 'action', x ->> 'action',
                  'citations', (select coalesce(jsonb_agg(c ->> 'key'), '[]'::jsonb) from jsonb_array_elements(x -> 'citations') c))
                  order by o), '[]'::jsonb)
         from jsonb_array_elements(v_lines) with ordinality as t(x, o)) then
      update threshold_rules set is_current = false where pcid = r.pcid and block_name = v_block.name and is_current;
      insert into threshold_rules (pcid, block_name, measure, comparator, low, high, action, citations, position, revision_id)
      select r.pcid, v_block.name, x ->> 'measure', x ->> 'comparator', (x ->> 'low')::numeric, (x ->> 'high')::numeric,
             x ->> 'action', array(select c ->> 'key' from jsonb_array_elements(x -> 'citations') c), o::integer, r.id
      from jsonb_array_elements(v_lines) with ordinality as t(x, o);
    end if;
  end loop;

  -- Statement blocks (:::interactions → community_statements, phase 16d): each block
  -- is replaced as a whole when its lines change. The other party resolves like a
  -- [[link]]; an unresolved target keeps its text in object_text.
  for v_block in
    select b.name, coalesce(b.grammar_spec ->> 'predicate', 'interacts_with') as predicate
    from block_schemas b where b.grammar = 'statement'
  loop
    select coalesce(jsonb_agg(line order by sec_ord, part_ord, line_ord), '[]'::jsonb) into v_lines
    from jsonb_array_elements(r.model -> 'main') with ordinality as s(item, sec_ord),
         jsonb_array_elements(coalesce(s.item -> 'parts', '[]'::jsonb)) with ordinality as p(part, part_ord),
         jsonb_array_elements(coalesce(p.part -> 'block' -> 'lines', '[]'::jsonb)) with ordinality as l(line, line_ord)
    where s.item ->> 'kind' = 'section' and p.part ->> 'kind' = 'block' and p.part -> 'block' ->> 'name' = v_block.name;

    select coalesce(jsonb_agg(jsonb_build_object('target', object_text, 'effect', effect, 'citations', to_jsonb(citations))
             order by position), '[]'::jsonb)
    into v_current
    from community_statements where subject_pcid = r.pcid and block_name = v_block.name and is_current;

    if v_current is distinct from (
         select coalesce(jsonb_agg(jsonb_build_object(
                  'target', x ->> 'target', 'effect', x ->> 'effect',
                  'citations', (select coalesce(jsonb_agg(c ->> 'key'), '[]'::jsonb) from jsonb_array_elements(x -> 'citations') c))
                  order by o), '[]'::jsonb)
         from jsonb_array_elements(v_lines) with ordinality as t(x, o)) then
      update community_statements set is_current = false
      where subject_pcid = r.pcid and block_name = v_block.name and is_current;
      insert into community_statements (subject_pcid, block_name, predicate, object_text, object_pcid, effect, citations,
                                        position, revision_id)
      select r.pcid, v_block.name, v_block.predicate, trim(x ->> 'target'), resolve_page_target(lower(trim(x ->> 'target'))),
             x ->> 'effect', array(select c ->> 'key' from jsonb_array_elements(x -> 'citations') c), o::integer, r.id
      from jsonb_array_elements(v_lines) with ordinality as t(x, o);
    end if;
  end loop;
end $$;


ALTER FUNCTION public.apply_page_revision(p_rev bigint, p_actor uuid) OWNER TO postgres;

--
-- Name: approve_revision(bigint, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.approve_revision(p_revision_id bigint, p_reviewer uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    r revisions%rowtype;
begin
    select * into r from revisions where id = p_revision_id and status = 'pending';
    if not found then
        raise exception 'No pending revision with id %', p_revision_id;
    end if;

    perform set_config('pc.change_source', 'revision', true);
    perform set_config('pc.revision_id', p_revision_id::text, true);
    perform set_config('pc.actor', coalesce(r.submitted_by::text, ''), true);

    if r.target_table = 'entities' then
        update entities
        set name = coalesce(r.payload->>'name', name),
            updated_at = now()
        where pcid = r.target_pcid;
    else
        raise exception 'approve_revision: target_table % not yet handled', r.target_table;
    end if;

    update revisions
    set status = 'approved', reviewed_by = p_reviewer, reviewed_at = now()
    where id = p_revision_id;
end;
$$;


ALTER FUNCTION public.approve_revision(p_revision_id bigint, p_reviewer uuid) OWNER TO postgres;

--
-- Name: block_contributor(uuid, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.block_contributor(p_user_id uuid, p_reason text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not has_role('admin') then raise exception 'not_admin' using errcode = '42501'; end if;
  if exists (select 1 from user_roles where user_id = p_user_id and role = 'owner') then
    raise exception 'cannot_block_owner' using errcode = '42501';
  end if;
  insert into contributor_blocks (user_id, reason, blocked_by, expires_at)
  values (p_user_id, p_reason, auth.uid(), p_expires_at)
  on conflict (user_id) do update
    set reason = excluded.reason, blocked_by = excluded.blocked_by,
        blocked_at = now(), expires_at = excluded.expires_at;
end $$;


ALTER FUNCTION public.block_contributor(p_user_id uuid, p_reason text, p_expires_at timestamp with time zone) OWNER TO postgres;

--
-- Name: blog_comment_queue(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.blog_comment_queue(p_limit integer DEFAULT 100) RETURNS TABLE(id bigint, post_slug text, parent_id bigint, handle text, credential text, body text, created_at timestamp with time zone, edited_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select c.id, c.post_slug, c.parent_id, coalesce(cp.handle, 'former member'),
         case when coalesce(cp.display_credential, true) and pv.status = 'active'
              then pc_credential_badge(pv.credential, pv.primary_taxonomy) end,
         c.body, c.created_at, c.edited_at
  from blog_comments c
  left join contributor_profiles cp on cp.user_id = c.author_id
  left join provider_verifications pv on pv.user_id = c.author_id
  where c.state = 'visible' and c.patrolled_at is null
  order by c.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;


ALTER FUNCTION public.blog_comment_queue(p_limit integer) OWNER TO postgres;

--
-- Name: blog_comments(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.blog_comments(p_slug text) RETURNS TABLE(id bigint, parent_id bigint, handle text, credential text, body text, state text, created_at timestamp with time zone, edited_at timestamp with time zone, is_mine boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select c.id, c.parent_id,
         case when c.state = 'visible' then coalesce(cp.handle, 'former member') end,
         case when c.state = 'visible' and coalesce(cp.display_credential, true) and pv.status = 'active'
              then pc_credential_badge(pv.credential, pv.primary_taxonomy) end,
         case when c.state = 'visible' then c.body end,
         c.state, c.created_at,
         case when c.state = 'visible' then c.edited_at end,
         c.author_id is not null and c.author_id = auth.uid()
  from blog_comments c
  left join contributor_profiles cp on cp.user_id = c.author_id
  left join provider_verifications pv on pv.user_id = c.author_id
  where c.post_slug = p_slug
    and (c.state = 'visible'
         or exists (select 1 from blog_comments r where r.parent_id = c.id and r.state = 'visible'))
  order by c.created_at, c.id
  limit 2000
$$;


ALTER FUNCTION public.blog_comments(p_slug text) OWNER TO postgres;

--
-- Name: brand_history(bigint, boolean, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.brand_history(p_pcid bigint DEFAULT NULL::bigint, p_queue_only boolean DEFAULT false, p_limit integer DEFAULT 200) RETURNS TABLE(id bigint, pcid bigint, slug text, name text, entity_type text, brand_key text, brand_display text, action text, citation text, summary text, is_current boolean, created_at timestamp with time zone, patrol_status text, review_note text, handle text, credential text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select b.id, b.pcid, e.slug, e.name, e.entity_type, b.brand_key, b.brand_display, b.action, b.citation, b.summary,
         b.is_current, b.created_at, b.patrol_status, b.review_note,
         coalesce(cp.handle, 'maintainer'),
         case when coalesce(cp.display_credential, true)
              then pc_credential_badge(pv.credential, pv.primary_taxonomy) end
  from brand_edits b
  join entities e on e.pcid = b.pcid
  left join contributor_profiles cp on cp.user_id = b.created_by
  left join provider_verifications pv on pv.user_id = b.created_by
  where (p_pcid is null or b.pcid = p_pcid)
    and (not p_queue_only or b.patrol_status in ('pending', 'unpatrolled'))
  order by case when b.patrol_status = 'pending' then 0 else 1 end, b.id desc
  limit least(greatest(p_limit, 1), 500)
$$;


ALTER FUNCTION public.brand_history(p_pcid bigint, p_queue_only boolean, p_limit integer) OWNER TO postgres;

--
-- Name: class_display_name(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.class_display_name(p text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
declare s text; w text;
begin
  if p is null or p <> upper(p) then return p; end if;
  s := regexp_replace(lower(p), ',(\S)', ', \1', 'g');
  s := upper(left(s,1)) || substr(s,2);
  foreach w in array array['hiv','ace','hmg','cns','nsaid','nsaids','gi','dna','rna','mao','cox','acth','hcv','hbv','ii','iii','iv','b12','b1','b6','d','k','h2','5-ht3','cd20','egfr','vegf','tnf','ppi','gnrh','lhrh','sglt2','dpp-4','glp-1','cftr','pde5','cgrp','jak','bcr-abl','alk','parp','mtor','il'] loop
    s := regexp_replace(s, '(^|[^a-z0-9])' || replace(w,'-','\-') || '($|[^a-z0-9])', '\1' || upper(w) || '\2', 'g');
  end loop;
  return s;
end $_$;


ALTER FUNCTION public.class_display_name(p text) OWNER TO postgres;

--
-- Name: class_type_label(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.class_type_label(t text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select case t
    when 'epc' then 'Pharmacologic class (FDA EPC)'
    when 'moa' then 'Mechanism of action'
    when 'pe'  then 'Physiologic effect'
    when 'chem' then 'Chemical structure (FDA)'
    when 'atc' then 'Therapeutic area (WHO ATC)'
    when 'va'  then 'Therapeutic class (VA)'
    when 'chemont' then 'Chemical taxonomy (ChemOnt)'
    when 'curated' then 'Pharmacy Commons group'
    when 'community' then 'Contributor classification'
    else 'Other' end $$;


ALTER FUNCTION public.class_type_label(t text) OWNER TO postgres;

--
-- Name: classyfire_todo(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.classyfire_todo(p_limit integer) RETURNS TABLE(pcid bigint, inchi_key text, name text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select e.pcid, nullif(m.inchi_key,''), e.name
  from entities e join moieties m using(pcid)
  where e.entity_type='moiety'
    and not exists(select 1 from chemont_links c where c.pcid=e.pcid)
    and not exists(select 1 from classyfire_lookup l where l.pcid=e.pcid)
  order by exists(select 1 from class_members cm where cm.member_pcid=e.pcid),
           (m.inchi_key is null or m.inchi_key=''), e.pcid
  limit p_limit $$;


ALTER FUNCTION public.classyfire_todo(p_limit integer) OWNER TO postgres;

--
-- Name: create_account_profile(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_account_profile() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  npi  text  := nullif(btrim(meta ->> 'npi'), '');
begin
  insert into public.account_profiles (
    user_id, account_type, first_name, last_name, date_of_birth,
    country, postal_code, phone, npi_claimed, profession, organization, research_area
  ) values (
    new.id,
    meta ->> 'account_type',
    left(btrim(meta ->> 'first_name'), 80),
    left(btrim(meta ->> 'last_name'), 80),
    public.signup_dob(meta),
    nullif(upper(btrim(meta ->> 'country')), ''),
    left(nullif(btrim(meta ->> 'postal_code'), ''), 16),
    left(nullif(btrim(meta ->> 'phone'), ''), 32),
    case when meta ->> 'account_type' = 'practitioner' and npi ~ '^\d{10}$' then npi end,
    left(nullif(btrim(meta ->> 'profession'), ''), 80),
    left(nullif(btrim(meta ->> 'organization'), ''), 160),
    left(nullif(btrim(meta ->> 'research_area'), ''), 160)
  )
  on conflict (user_id) do nothing;
  return new;
end;
$_$;


ALTER FUNCTION public.create_account_profile() OWNER TO postgres;

--
-- Name: create_page(text, text, text, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_page(p_entity_kind text, p_name text, p_summary text, p_description text DEFAULT ''::text, p_body_md text DEFAULT ''::text, p_subtype text DEFAULT NULL::text, p_identifiers jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  b pcid_blocks%rowtype;
  v_pcid bigint;
  v_slug text := pc_slugify(p_name);
  v_dup bigint;
  v_unii text := nullif(upper(trim(p_identifiers ->> 'unii')), '');
  v_cas  text := nullif(trim(p_identifiers ->> 'cas'), '');
begin
  if not is_verified_contributor() then raise exception 'not_verified' using errcode = '42501'; end if;
  if not exists (select 1 from contributor_profiles where user_id = auth.uid()) then raise exception 'handle_required'; end if;
  if p_entity_kind not in ('moiety', 'combination', 'precise_form', 'formulation', 'class',
                           'clinical', 'measurement', 'target', 'functional') then
    raise exception 'kind_not_creatable';   -- list pages stay curated
  end if;
  if v_slug = '' or length(p_name) > 200 then raise exception 'bad_name'; end if;
  if coalesce(trim(p_summary), '') = '' then raise exception 'summary_required'; end if;
  if p_subtype is not null and length(p_subtype) > 80 then raise exception 'bad_subtype'; end if;
  if not has_role('patroller') and (select count(*) from community_pages
       where created_by = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'rate_limited';
  end if;

  select pcid into v_dup from entities
  where slug = v_slug or lower(name) = lower(trim(p_name)) limit 1;
  if found then raise exception 'page_exists' using detail = v_dup::text; end if;
  if v_unii is not null or v_cas is not null then
    select pcid into v_dup from (
      select pcid, unii, cas from moieties
      union all select pcid, unii, cas from precise_forms
      union all select pcid, unii, cas from combinations
    ) d
    where (v_unii is not null and upper(d.unii) = v_unii) or (v_cas is not null and d.cas = v_cas)
    limit 1;
    if found then raise exception 'identifier_exists' using detail = v_dup::text; end if;
  end if;

  select * into b from pcid_blocks where entity_kind = p_entity_kind for update;
  v_pcid := b.next_pcid;
  if v_pcid > b.max_id then raise exception 'block_full'; end if;
  update pcid_blocks set next_pcid = next_pcid + 1 where block_id = b.block_id;

  perform set_config('pc.change_source', 'community-create', true);
  perform set_config('pc.actor', auth.uid()::text, true);

  insert into entities (pcid, entity_type, slug, slug_uri, name)
  values (v_pcid, p_entity_kind, v_slug, b.slug_prefix || v_slug, trim(p_name));

  case p_entity_kind
    when 'moiety' then
      insert into moieties (pcid, term_type, origin, unii, cas, primary_source)
      values (v_pcid, 'Core moiety', 'community', v_unii, v_cas, 'Pharmacy Commons contributors');
    when 'precise_form' then
      insert into precise_forms (pcid, origin, unii, cas, primary_source)
      values (v_pcid, 'community', v_unii, v_cas, 'Pharmacy Commons contributors');
    when 'combination' then
      insert into combinations (pcid, origin, unii, cas, primary_source)
      values (v_pcid, 'community', v_unii, v_cas, 'Pharmacy Commons contributors');
    when 'formulation' then
      insert into formulations (pcid, origin, primary_source)
      values (v_pcid, 'community', 'Pharmacy Commons contributors');
    when 'class' then
      insert into drug_classes (pcid, class_type, source_system, source_agency, member_count)
      values (v_pcid, 'community', 'PharmacyCommons', 'community', 0);
    when 'clinical' then
      insert into clinical_concepts (pcid, concept_type, source_ref) values (v_pcid, p_subtype, 'community');
    when 'measurement' then
      insert into measurements (pcid, measurement_type) values (v_pcid, p_subtype);
    when 'functional' then
      insert into functional_groups (pcid, group_type, common_name) values (v_pcid, p_subtype, trim(p_name));
    when 'target' then
      insert into biological_targets (pcid) values (v_pcid);
  end case;

  insert into community_pages (pcid, created_by) values (v_pcid, auth.uid());

  if coalesce(trim(p_description), '') <> '' or coalesce(trim(p_body_md), '') <> '' then
    perform save_page(v_pcid, null, p_description, p_body_md, p_summary, 'create');
  end if;

  return jsonb_build_object('pcid', v_pcid, 'pcid_code', 'PCID-' || v_pcid,
                            'slug', v_slug, 'entity_type', p_entity_kind);
end $$;


ALTER FUNCTION public.create_page(p_entity_kind text, p_name text, p_summary text, p_description text, p_body_md text, p_subtype text, p_identifiers jsonb) OWNER TO postgres;

--
-- Name: delete_blog_comment(bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.delete_blog_comment(p_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  update blog_comments set state = 'deleted', body = '', edited_at = now()
   where id = p_id and author_id = auth.uid() and state <> 'deleted';
  if not found then raise exception 'no_such_comment'; end if;
end $$;


ALTER FUNCTION public.delete_blog_comment(p_id bigint) OWNER TO postgres;

--
-- Name: dictionary_buckets(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.dictionary_buckets() RETURNS TABLE(bucket text, n integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select bucket, count(*)::int from dictionary_terms group by bucket
$$;


ALTER FUNCTION public.dictionary_buckets() OWNER TO postgres;

--
-- Name: dictionary_dic(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.dictionary_dic() RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select string_agg(word, E'\r\n') || E'\r\n' from public.dictionary_words()
$$;


ALTER FUNCTION public.dictionary_dic() OWNER TO postgres;

--
-- Name: FUNCTION dictionary_dic(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.dictionary_dic() IS 'The Pharmacy Commons medical dictionary as a Word custom dictionary body: one word per CRLF line. The site adds the UTF-8 byte-order mark and saves it as .dic.';


--
-- Name: dictionary_words(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.dictionary_words() RETURNS TABLE(word text)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $_$
  with raw as (
    select regexp_split_to_table(term, '[\s/(){}\[\],;:<>]+') as tok from dictionary_terms where in_dic
  ),
  parts as (
    select tok from raw
    union all
    select regexp_split_to_table(tok, '-') from raw where tok like '%-%'
  ),
  trimmed as (
    select regexp_replace(regexp_replace(tok, '^["''“‘.\-]+', ''), '["''”’!?\-]+$', '') as tok from parts
  ),
  cleaned as (
    -- a lone trailing period is sentence punctuation; keep it when the word has others (q.d., e.g.)
    select case when tok ~ '\.$' and tok !~ '\..*\.$' then left(tok, -1) else tok end as tok from trimmed
  ),
  words as (
    select distinct tok from cleaned
    where char_length(tok) between 2 and 64
      and tok ~ '[A-Za-zÀ-ɏͰ-Ͽ]'
  ),
  grouped as (
    -- An all-lower-case entry already covers Capitalised and UPPER-CASE spellings in Word.
    select tok, bool_or(tok = lower(tok)) over (partition by lower(tok)) as has_lower from words
  )
  select tok from grouped where tok = lower(tok) or not has_lower
  order by lower(tok), tok
$_$;


ALTER FUNCTION public.dictionary_words() OWNER TO postgres;

--
-- Name: edit_blog_comment(bigint, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.edit_blog_comment(p_id bigint, p_body text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_body text := trim(coalesce(p_body, ''));
  v_patroller boolean := has_role('patroller');
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if pc_is_blocked() then raise exception 'blocked' using errcode = '42501'; end if;
  if v_body = '' then raise exception 'empty'; end if;
  if length(v_body) > 4000 then raise exception 'too_long'; end if;
  update blog_comments
     set body = v_body, edited_at = now(),
         patrolled_by = case when v_patroller then auth.uid() end,
         patrolled_at = case when v_patroller then now() end
   where id = p_id and author_id = auth.uid() and state = 'visible' and body <> v_body;
  if not found and not exists (select 1 from blog_comments
                               where id = p_id and author_id = auth.uid() and state = 'visible') then
    raise exception 'no_such_comment';
  end if;
end $$;


ALTER FUNCTION public.edit_blog_comment(p_id bigint, p_body text) OWNER TO postgres;

--
-- Name: edit_brand(bigint, text, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.edit_brand(p_pcid bigint, p_brand text, p_action text, p_citation text, p_summary text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_id bigint;
  v_key text := pc_brand_key(p_brand);
  v_patroller boolean := has_role('patroller');
  v_protection text;
  v_held boolean;
begin
  if not is_verified_contributor() then raise exception 'not_verified' using errcode = '42501'; end if;
  if not exists (select 1 from contributor_profiles where user_id = auth.uid()) then raise exception 'handle_required'; end if;
  if not exists (select 1 from entities where pcid = p_pcid) then raise exception 'no_such_page'; end if;
  if p_action not in ('add', 'hide', 'clear') then raise exception 'bad_action'; end if;
  if v_key = '' or length(v_key) > 120 then raise exception 'bad_name'; end if;
  if coalesce(trim(p_citation), '') = '' then raise exception 'citation_required'; end if;
  if coalesce(trim(p_summary), '') = '' then raise exception 'summary_required'; end if;
  if p_action = 'hide' and not exists (select 1 from entity_brand_names where pcid = p_pcid and brand_key = v_key) then
    raise exception 'not_a_source_brand';
  end if;
  if p_action = 'add' and exists (select 1 from entity_brand_names where pcid = p_pcid and brand_key = v_key) then
    raise exception 'already_listed';
  end if;

  select protection into v_protection from page_content where pcid = p_pcid;
  v_protection := coalesce(v_protection, 'open');
  if v_protection = 'patrollers' and not v_patroller then raise exception 'protected'; end if;
  v_held := v_protection = 'reviewed' and not v_patroller;

  if not v_held then
    update brand_edits set is_current = false where pcid = p_pcid and brand_key = v_key and is_current;
  end if;

  insert into brand_edits (pcid, brand_key, brand_display, action, citation, summary, is_current, created_by,
                           patrol_status, patrolled_by, patrolled_at)
  values (p_pcid, v_key, trim(regexp_replace(p_brand, '\s+', ' ', 'g')), p_action, trim(p_citation), trim(p_summary),
          not v_held, auth.uid(),
          case when v_held then 'pending' when v_patroller then 'patrolled' else 'unpatrolled' end,
          case when v_patroller then auth.uid() end,
          case when v_patroller then now() end)
  returning id into v_id;
  return v_id;
end $$;


ALTER FUNCTION public.edit_brand(p_pcid bigint, p_brand text, p_action text, p_citation text, p_summary text) OWNER TO postgres;

--
-- Name: edit_infobox(bigint, text, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.edit_infobox(p_pcid bigint, p_key text, p_value text, p_citation text, p_summary text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_id bigint;
  v_patroller boolean := has_role('patroller');
  v_protection text;
  v_held boolean;
begin
  if not is_verified_contributor() then raise exception 'not_verified' using errcode = '42501'; end if;
  if not exists (select 1 from contributor_profiles where user_id = auth.uid()) then raise exception 'handle_required'; end if;
  if not exists (select 1 from infobox_properties where key = lower(p_key)) then raise exception 'unknown_property'; end if;
  if not exists (select 1 from entities where pcid = p_pcid) then raise exception 'no_such_page'; end if;
  if length(coalesce(p_value, '')) > 2000 then raise exception 'too_long'; end if;

  -- No page_content row means an unprotected page.
  select protection into v_protection from page_content where pcid = p_pcid;
  v_protection := coalesce(v_protection, 'open');
  if v_protection = 'patrollers' and not v_patroller then raise exception 'protected'; end if;
  v_held := v_protection = 'reviewed' and not v_patroller;

  if not v_held then
    update infobox_edits set is_current = false
    where pcid = p_pcid and property_key = lower(p_key) and is_current;
  end if;

  insert into infobox_edits (pcid, property_key, value, citation, summary, is_current, created_by,
                             patrol_status, patrolled_by, patrolled_at)
  values (p_pcid, lower(p_key), nullif(trim(p_value), ''), trim(p_citation), trim(p_summary), not v_held, auth.uid(),
          case when v_held then 'pending' when v_patroller then 'patrolled' else 'unpatrolled' end,
          case when v_patroller then auth.uid() end,
          case when v_patroller then now() end)
  returning id into v_id;
  return v_id;
end $$;


ALTER FUNCTION public.edit_infobox(p_pcid bigint, p_key text, p_value text, p_citation text, p_summary text) OWNER TO postgres;

--
-- Name: enforce_pcid_in_block(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.enforce_pcid_in_block() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pcid_blocks b
        WHERE b.entity_kind = NEW.entity_type
          AND NEW.pcid BETWEEN b.min_id AND b.max_id
    ) THEN
        RAISE EXCEPTION 'PCID % is outside the range for block %', NEW.pcid, NEW.entity_type;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.enforce_pcid_in_block() OWNER TO postgres;

--
-- Name: enforce_signup_requirements(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.enforce_signup_requirements() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  dob  date  := public.signup_dob(meta);
begin
  if dob is null or dob < date '1900-01-01' or dob > current_date then
    raise exception 'signup_requires_valid_date_of_birth';
  end if;
  if age(current_date, dob) < interval '18 years' then
    raise exception 'signup_requires_age_18';
  end if;
  if (meta ->> 'age_confirmed') is distinct from 'true' then
    raise exception 'signup_requires_age_confirmation';
  end if;
  if (meta ->> 'account_type') not in ('patient', 'practitioner', 'researcher')
     or (meta ->> 'account_type') is null then
    raise exception 'signup_requires_account_type';
  end if;
  if nullif(btrim(meta ->> 'first_name'), '') is null
     or nullif(btrim(meta ->> 'last_name'), '') is null then
    raise exception 'signup_requires_name';
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.enforce_signup_requirements() OWNER TO postgres;

--
-- Name: get_class(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_class(p_slug text) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with c as (
    select e.pcid, e.slug, e.name, d.class_type, d.source_system, d.source_code, d.level,
           d.description, d.parent_pcid, d.member_count
    from entities e join drug_classes d using(pcid) where e.slug = p_slug and e.entity_type='class'),
  anc as (
    with recursive a(pcid, depth) as (
      select parent_pcid, 1 from c where parent_pcid is not null
      union all select d.parent_pcid, a.depth+1 from a join drug_classes d on d.pcid=a.pcid
      where d.parent_pcid is not null and a.depth < 12)
    select a.depth, e.slug, e.name, d.source_code from a join entities e using(pcid) join drug_classes d using(pcid))
  select case when not exists(select 1 from c) then null else jsonb_build_object(
    'pcid', c.pcid, 'slug', c.slug, 'name', c.name,
    'class_type', c.class_type, 'class_type_label', class_type_label(c.class_type),
    'source_system', c.source_system, 'source_code', c.source_code, 'level', c.level,
    'description', c.description,
    'ancestors', coalesce((select jsonb_agg(jsonb_build_object('slug',slug,'name',name,'source_code',source_code) order by depth desc) from anc), '[]'),
    'children', coalesce((select jsonb_agg(jsonb_build_object('slug',e.slug,'name',e.name,'source_code',d.source_code,
                    'member_count',d.member_count) order by d.source_code, e.name)
                  from drug_classes d join entities e using(pcid) where d.parent_pcid=c.pcid and d.member_count > 0), '[]'),
    'members', coalesce((select jsonb_agg(jsonb_build_object('pcid',e.pcid,'slug',e.slug,'name',e.name,
                    'entity_type',e.entity_type,'is_direct',m.is_direct) order by lower(e.name))
                  from class_members m join entities e on e.pcid=m.member_pcid where m.class_pcid=c.pcid), '[]'),
    'member_count', c.member_count
  ) end from c $$;


ALTER FUNCTION public.get_class(p_slug text) OWNER TO postgres;

--
-- Name: get_entity_classes(bigint, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_entity_classes(p_pcid bigint, p_include_inherited boolean DEFAULT false) RETURNS TABLE(slug text, name text, class_type text, class_type_label text, source_code text, is_direct boolean, level smallint)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with target as (
    select p_pcid as pcid
    union
    select h.moiety_pcid from moiety_hierarchy h
    where h.member_pcid = p_pcid and h.relation = 'precise_form'
      and not exists (select 1 from class_members x where x.member_pcid = p_pcid)),
  rows as (
    select distinct on (m.class_pcid) e.slug, e.name, d.class_type, d.source_code, m.is_direct, d.level
    from target t join class_members m on m.member_pcid=t.pcid
    join entities e on e.pcid=m.class_pcid join drug_classes d on d.pcid=m.class_pcid
    where (m.is_direct or p_include_inherited)
    order by m.class_pcid, m.is_direct desc)
  select slug, name, class_type, class_type_label(class_type), source_code, is_direct, level from rows
  order by array_position(array['atc','va','epc','moa','pe','chem','chemont','curated'], class_type), level nulls first, name $$;


ALTER FUNCTION public.get_entity_classes(p_pcid bigint, p_include_inherited boolean) OWNER TO postgres;

--
-- Name: get_entity_lists(bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_entity_lists(p_pcid bigint) RETURNS TABLE(slug text, title text, kind text, rank integer, value numeric, legal_status text, status_label text, note text, via_pcid bigint, via_name text)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with members as (
    select p_pcid as pcid
    union
    select h.member_pcid from moiety_hierarchy h where h.moiety_pcid = p_pcid
  )
  select distinct on (l.pcid) l.slug, l.title, l.kind, i.rank, i.value, i.legal_status, l.status_label, i.note,
         nullif(i.member_pcid, p_pcid), case when i.member_pcid <> p_pcid then e.name end
  from list_items i join members m on m.pcid = i.member_pcid
  join lists l on l.pcid = i.list_pcid join entities e on e.pcid = i.member_pcid
  order by l.pcid, (i.member_pcid = p_pcid) desc, i.rank nulls last
$$;


ALTER FUNCTION public.get_entity_lists(p_pcid bigint) OWNER TO postgres;

--
-- Name: get_lasa(bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_lasa(p_pcid bigint) RETURNS TABLE(name text, name_pcid bigint, has_tall_man boolean, confused_with text, confused_with_pcid bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with members as (
    select p_pcid as pcid
    union select h.member_pcid from moiety_hierarchy h where h.moiety_pcid = p_pcid
  ),
  hits as (
    select v.* from lasa_pairs_v v
    where v.pcid in (select pcid from members) or v.moiety_pcid = p_pcid
  )
  select distinct on (lower(h.other_name), lower(h.name))
         h.name, h.pcid, bool_or(h.has_tall_man) over (partition by lower(h.name)), h.other_name, h.other_pcid
  from hits h
  order by lower(h.other_name), lower(h.name), (h.direction = 'listed') desc
$$;


ALTER FUNCTION public.get_lasa(p_pcid bigint) OWNER TO postgres;

--
-- Name: get_list(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_list(p_slug text) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'pcid', l.pcid, 'pcid_code', 'PCID-' || l.pcid, 'slug', l.slug, 'title', l.title, 'description', l.description,
    'kind', l.kind, 'jurisdiction', l.jurisdiction, 'source_citation', l.source_citation, 'source_url', l.source_url,
    'license', l.license, 'measure_label', l.measure_label, 'measure_unit', l.measure_unit, 'rank_label', l.rank_label,
    'status_label', l.status_label,
    'default_sort', l.default_sort, 'item_count', l.item_count, 'updated_at', l.updated_at,
    'parent', (select jsonb_build_object('slug', p.slug, 'title', p.title) from lists p where p.pcid = l.parent_pcid),
    'children', coalesce((select jsonb_agg(jsonb_build_object('slug', c.slug, 'title', c.title, 'item_count', c.item_count) order by c.sort_order, c.title)
                          from lists c where c.parent_pcid = l.pcid), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                'position', i.position, 'rank', i.rank, 'value', i.value, 'legal_status', i.legal_status, 'note', i.note,
                'sources', i.sources,
                'source_name', i.source_name, 'pcid', e.pcid, 'slug', e.slug,
                'name', case when e.entity_type = 'formulation' then coalesce(nullif(i.source_name, ''), e.name)
                             else coalesce(e.name, i.source_name) end,
                'entity_type', coalesce(e.entity_type, 'term'),
                'term_id', i.term_id,
                'component_pcid', g.pcid, 'component_slug', g.slug, 'component_name', g.name)
              order by i.position)
              from list_items i
              left join entities e on e.pcid = i.member_pcid
              left join entities g on g.pcid = i.component_pcid
              where i.list_pcid = l.pcid), '[]'::jsonb)
  )
  from lists l where l.slug = p_slug
$$;


ALTER FUNCTION public.get_list(p_slug text) OWNER TO postgres;

--
-- Name: get_rems(bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_rems(p_pcid bigint) RETURNS TABLE(rems_id integer, program text, status text, etasu boolean, medication_guide boolean, communication_plan boolean, implementation_system boolean, shared_system boolean, website text, brands text, inactive_brands text)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with moieties_of as (
    select p_pcid as m where exists (select 1 from moieties where pcid = p_pcid)
    union select h.moiety_pcid from moiety_hierarchy h where h.member_pcid = p_pcid
  ),
  prod as (
    select p.* from rems_products p
    where p.moiety_pcids && (select coalesce(array_agg(m), '{}') from moieties_of)
  ),
  per_brand as (
    select rems_id, brand, bool_or(status = 'Active') as active from prod where brand is not null group by rems_id, brand
  )
  select rp.rems_id,
         rems_program_label(rp.name),
         case when bool_or(pr.status = 'Active') then 'Active' else 'Inactive' end,
         rp.etasu, rp.medication_guide, rp.communication_plan, rp.implementation_system, rp.shared_system,
         rp.website,
         (select string_agg(b.brand, ', ' order by lower(b.brand)) from per_brand b where b.rems_id = rp.rems_id and b.active),
         (select string_agg(b.brand, ', ' order by lower(b.brand)) from per_brand b where b.rems_id = rp.rems_id and not b.active)
  from prod pr join rems_programs rp using (rems_id)
  group by rp.rems_id, rp.name, rp.etasu, rp.medication_guide, rp.communication_plan, rp.implementation_system, rp.shared_system, rp.website
  order by bool_or(pr.status = 'Active') desc, lower(rems_program_label(rp.name))
$$;


ALTER FUNCTION public.get_rems(p_pcid bigint) OWNER TO postgres;

--
-- Name: get_structures(bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_structures(p_pcid bigint) RETURNS TABLE(moiety_pcid bigint, slug text, name text, smiles text, source text, pubchem_cid bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
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


ALTER FUNCTION public.get_structures(p_pcid bigint) OWNER TO postgres;

--
-- Name: grant_role(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.grant_role(p_user_id uuid, p_role text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if p_role = 'owner' then raise exception 'owner_not_grantable' using errcode = '42501'; end if;
  if p_role = 'admin' then
    if not has_role('owner') then raise exception 'not_owner' using errcode = '42501'; end if;
  elsif not has_role('admin') then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if not exists (select 1 from provider_verifications where user_id = p_user_id and status = 'active') then
    raise exception 'not_verified';
  end if;
  insert into user_roles (user_id, role, granted_by) values (p_user_id, p_role, auth.uid())
  on conflict do nothing;
end $$;


ALTER FUNCTION public.grant_role(p_user_id uuid, p_role text) OWNER TO postgres;

--
-- Name: has_role(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.has_role(p_role text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from user_roles
    where user_id = auth.uid()
      and (role = p_role or (p_role <> 'owner' and role in ('admin', 'owner')))
  )
$$;


ALTER FUNCTION public.has_role(p_role text) OWNER TO postgres;

--
-- Name: infobox_history(bigint, text, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.infobox_history(p_pcid bigint, p_key text DEFAULT NULL::text, p_limit integer DEFAULT 100) RETURNS TABLE(id bigint, property_key text, value text, citation text, summary text, is_current boolean, created_at timestamp with time zone, patrol_status text, review_note text, handle text, credential text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select e.id, e.property_key, e.value, e.citation, e.summary, e.is_current, e.created_at, e.patrol_status,
         e.review_note,
         coalesce(cp.handle, 'maintainer'),
         case when coalesce(cp.display_credential, true)
              then pc_credential_badge(pv.credential, pv.primary_taxonomy) end
  from infobox_edits e
  left join contributor_profiles cp on cp.user_id = e.created_by
  left join provider_verifications pv on pv.user_id = e.created_by
  where e.pcid = p_pcid and (p_key is null or e.property_key = lower(p_key))
  order by e.id desc
  limit least(greatest(p_limit, 1), 500)
$$;


ALTER FUNCTION public.infobox_history(p_pcid bigint, p_key text, p_limit integer) OWNER TO postgres;

--
-- Name: is_verified_contributor(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_verified_contributor() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
           select 1 from provider_verifications
           where user_id = auth.uid() and status = 'active')
     and not exists (
           select 1 from contributor_blocks
           where user_id = auth.uid() and (expires_at is null or expires_at > now()))
$$;


ALTER FUNCTION public.is_verified_contributor() OWNER TO postgres;

--
-- Name: lasa_moiety_of(bigint, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.lasa_moiety_of(p_pcid bigint, p_name text) RETURNS bigint
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (select e.pcid from entities e where e.pcid = p_pcid and e.entity_type = 'moiety'),
    (select h.moiety_pcid from moiety_hierarchy h where h.member_pcid = p_pcid order by h.moiety_pcid limit 1),
    (select b.pcid from rxnorm_brands b join entities e on e.pcid = b.pcid and e.entity_type = 'moiety'
       join entities f on f.pcid = p_pcid and f.entity_type = 'formulation'
      where lower(b.brand) = lower(f.name)
      group by b.pcid having count(*) >= 1 order by b.pcid limit 1)
  )
$$;


ALTER FUNCTION public.lasa_moiety_of(p_pcid bigint, p_name text) OWNER TO postgres;

--
-- Name: learn_attach(text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learn_attach(p_collection_slug text, p_template_key text, p_section text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare n int;
begin
  insert into public.learn_collection_items (collection_id, item_id, sort_order, section_label)
  select c.id, i.id, (row_number() over (order by i.natural_key))::int, p_section
  from public.learn_collections c
  join public.learn_items i on i.template_key = p_template_key and i.source_list_pcid = c.source_list_pcid and i.is_official
  where c.slug = p_collection_slug
  on conflict (collection_id, item_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;


ALTER FUNCTION public.learn_attach(p_collection_slug text, p_template_key text, p_section text) OWNER TO postgres;

--
-- Name: learn_collections_for_list(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learn_collections_for_list(p_slug text) RETURNS TABLE(collection_id uuid, slug text, title text, item_count integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select c.id, c.slug, c.title, count(ci.item_id)::int
  from public.learn_collections c
  join public.lists l on l.pcid = c.source_list_pcid and l.slug = p_slug
  left join public.learn_collection_items ci on ci.collection_id = c.id
  left join public.learn_items i on i.id = ci.item_id and i.is_official and i.status = 'published'
  where c.is_official and c.status = 'published'
  group by c.id, c.slug, c.title, c.sort_order
  order by c.sort_order, c.title
$$;


ALTER FUNCTION public.learn_collections_for_list(p_slug text) OWNER TO postgres;

--
-- Name: learn_collections_for_pcid(bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learn_collections_for_pcid(p_pcid bigint) RETURNS TABLE(collection_id uuid, slug text, title text, item_count integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select c.id, c.slug, c.title, count(distinct i.id)::int
  from public.learn_items i
  join public.learn_collection_items ci on ci.item_id = i.id
  join public.learn_collections c on c.id = ci.collection_id
  where c.is_official and c.status = 'published' and i.is_official and i.status = 'published'
    and (i.primary_pcid = p_pcid
         or exists (select 1 from public.learn_item_entities e where e.item_id = i.id and e.pcid = p_pcid))
  group by c.id, c.slug, c.title, c.sort_order
  order by c.sort_order, c.title
$$;


ALTER FUNCTION public.learn_collections_for_pcid(p_pcid bigint) OWNER TO postgres;

--
-- Name: learn_ensure_collection(text, text, text, text, text[], text, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learn_ensure_collection(p_slug text, p_title text, p_description text, p_list_slug text, p_templates text[], p_subject text, p_sort integer DEFAULT 0) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_id uuid; v_list bigint;
begin
  select pcid into v_list from public.lists where slug = p_list_slug;
  insert into public.learn_collections (slug, title, description, subject_area, topic, is_official, status, source_list_pcid, template_keys, sort_order)
  values (p_slug, p_title, p_description, p_subject, p_title, true, 'draft', v_list, p_templates, p_sort)
  on conflict (slug) do update set template_keys = excluded.template_keys, description = excluded.description
  returning id into v_id;
  return v_id;
end $$;


ALTER FUNCTION public.learn_ensure_collection(p_slug text, p_title text, p_description text, p_list_slug text, p_templates text[], p_subject text, p_sort integer) OWNER TO postgres;

--
-- Name: learn_gen_acb_highest(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learn_gen_acb_highest() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare l public.lists%rowtype; v_cands int; v_new int; v_rej int;
begin
  select * into l from public.lists where slug = 'anticholinergic-burden' and published;
  if not found then raise exception 'anticholinergic-burden not found'; end if;

  create temp table _acb on commit drop as
  with pool as (select pcid, name, (value::int) as score, note from public.learn_list_pool('anticholinergic-burden')),
  answers as (select * from pool where score = 3)
  select a.pcid, a.name, a.note,
    (select jsonb_agg(jsonb_build_object('pcid', d.pcid, 'name', d.name, 'score', d.score) order by d.rk)
       from (select p.pcid, p.name, p.score,
                    row_number() over (order by
                      (exists (select 1 from public.class_members c1
                               join public.class_members c2 on c2.class_pcid = c1.class_pcid and c2.member_pcid = p.pcid
                               join public.drug_classes dc on dc.pcid = c1.class_pcid
                               where c1.member_pcid = a.pcid and dc.class_type = 'epc')) desc,
                      md5(a.pcid::text || '-' || p.pcid::text)) rk
             from pool p where p.score in (1, 2) and p.pcid <> a.pcid) d where d.rk <= 3) dists
  from answers a;

  select count(*) into v_cands from _acb;
  select count(*) into v_rej from _acb where jsonb_array_length(coalesce(dists, '[]'::jsonb)) < 3;

  insert into public.learn_items (
    natural_key, item_type, template_key, generation_method, is_official, status,
    subject_area, topic, difficulty_level, tags, primary_pcid,
    prompt, concise_answer, clinical_rationale, clinical_caveats, mcq_options,
    source_kind, source_list_pcid, source_agency, source_citation, source_url, license, third_party_sources)
  select
    'acb_highest:' || l.pcid || ':' || k.pcid, 'mcq', 'acb_highest', 'template', true, 'draft',
    'Medication safety', l.title, 2, array['list:' || l.slug], k.pcid,
    'Which of these drugs has the highest anticholinergic burden score (3) on the scale?', k.name,
    format('%s scores 3 on the anticholinergic burden scale. The other options score 1 or 2.', k.name),
    'Scores come from a compiled third-party scale; scales differ between sources. Use clinical judgment.',
    (select jsonb_agg(jsonb_build_object('id', chr(96 + q.rn::int), 'text', q.txt, 'is_correct', q.ok,
        'rationale', case when q.ok then format('%s scores 3.', k.name) else format('%s scores %s.', q.txt, q.sc) end) order by q.rn)
       from (select o.txt, o.ok, o.sc, row_number() over (order by md5('acb_highest' || k.pcid::text || o.txt)) rn
             from (select k.name as txt, true as ok, '3' as sc
                   union all select d->>'name', false, d->>'score' from jsonb_array_elements(k.dists) d) o) q),
    'list', l.pcid, 'Pharmacy Commons', l.source_citation, l.source_url, l.license, array[l.source_citation]
  from _acb k where jsonb_array_length(coalesce(k.dists, '[]'::jsonb)) = 3
  on conflict (natural_key) do nothing;
  get diagnostics v_new = row_count;

  perform public.learn_link_entities('acb_highest');
  drop table _acb;
  return jsonb_build_object('template', 'acb_highest', 'candidates', v_cands, 'rejected_fewer_than_3_distractors', v_rej,
    'created', v_new, 'already_existed', v_cands - v_rej - v_new);
end $$;


ALTER FUNCTION public.learn_gen_acb_highest() OWNER TO postgres;

--
-- Name: learn_gen_attribute_mcq(text, text, text, jsonb, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learn_gen_attribute_mcq(p_list_slug text, p_template_key text, p_stem_fmt text, p_options jsonb, p_ok_fmt text, p_wrong text, p_caveat text, p_agency text, p_subject text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare l public.lists%rowtype; v_cands int; v_new int; v_rej int;
begin
  select * into l from public.lists where slug = p_list_slug and published;
  if not found then raise exception 'list % not found or unpublished', p_list_slug; end if;

  create temp table _attr on commit drop as
  select a.pcid, a.name, a.note, coalesce(a.legal_status, (a.value::int)::text) as attr
  from public.learn_list_pool(p_list_slug) a;

  select count(*) into v_cands from _attr;
  select count(*) into v_rej from _attr a
    where not exists (select 1 from jsonb_array_elements(p_options) o where o->>'value' = a.attr);

  insert into public.learn_items (
    natural_key, item_type, template_key, generation_method, is_official, status,
    subject_area, topic, jurisdiction, difficulty_level, tags, primary_pcid,
    prompt, concise_answer, clinical_rationale, clinical_caveats, mcq_options,
    source_kind, source_list_pcid, source_agency, source_citation, source_url, license, third_party_sources)
  select
    p_template_key || ':' || l.pcid || ':' || a.pcid, 'mcq', p_template_key, 'template', true, 'draft',
    p_subject, l.title, l.jurisdiction, 2, array['list:' || l.slug, 'fixed-option-order'], a.pcid,
    format(p_stem_fmt, a.name),
    (select o->>'label' from jsonb_array_elements(p_options) o where o->>'value' = a.attr),
    format(p_ok_fmt, a.name, (select o->>'label' from jsonb_array_elements(p_options) o where o->>'value' = a.attr), coalesce(a.note, '')),
    p_caveat,
    (select jsonb_agg(jsonb_build_object('id', chr(96 + q.rn::int), 'text', q.o->>'label', 'is_correct', (q.o->>'value') = a.attr,
        'rationale', case when (q.o->>'value') = a.attr then format(p_ok_fmt, a.name, q.o->>'label', coalesce(a.note, '')) else p_wrong end) order by q.rn)
       from (select o, ordinality as rn from jsonb_array_elements(p_options) with ordinality as t(o, ordinality)) q),
    'list', l.pcid, p_agency, l.source_citation, l.source_url, l.license,
    case when p_list_slug = 'anticholinergic-burden' then array[l.source_citation] else '{}'::text[] end
  from _attr a
  where exists (select 1 from jsonb_array_elements(p_options) o where o->>'value' = a.attr)
  on conflict (natural_key) do nothing;
  get diagnostics v_new = row_count;

  perform public.learn_link_entities(p_template_key);
  drop table _attr;
  return jsonb_build_object('template', p_template_key, 'candidates', v_cands,
    'rejected_value_not_in_option_set', v_rej, 'created', v_new,
    'already_existed', v_cands - v_rej - v_new);
end $$;


ALTER FUNCTION public.learn_gen_attribute_mcq(p_list_slug text, p_template_key text, p_stem_fmt text, p_options jsonb, p_ok_fmt text, p_wrong text, p_caveat text, p_agency text, p_subject text) OWNER TO postgres;

--
-- Name: learn_gen_brand_generic(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learn_gen_brand_generic() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare nl public.lists%rowtype; v_np int; v_cands int; v_rej int; v_new int;
begin
  select * into nl from public.lists where slug = 'notable-drugs' and published;
  if not found then raise exception 'notable-drugs not found'; end if;

  create temp table _np on commit drop as
    select p.pcid, p.name, m.unii from public.learn_list_pool('notable-drugs') p join public.moieties m on m.pcid = p.pcid;
  select count(*) into v_np from _np;

  create temp table _brand on commit drop as
  select distinct on (b.pcid) b.pcid, n.name as drug, n.unii,
         case when b.brand_display = upper(b.brand_display) then initcap(b.brand_display) else b.brand_display end as brand
  from public.entity_brand_names b join _np n on n.pcid = b.pcid
  where b.kind = 'moiety' and b.brand_display is not null
    and b.sources @> array['drugsfda', 'rxnorm']
    and lower(b.brand_display) <> lower(n.name)
    and (select count(distinct x.pcid) from public.entity_brand_names x where x.brand_key = b.brand_key) = 1
    and exists (select 1 from public.fda_products p where upper(p.brand_name) = upper(b.brand_display))
    and not exists (select 1 from public.fda_products p join public.fda_product_ingredients fpi on fpi.product_id = p.product_id
                    where upper(p.brand_name) = upper(b.brand_display) group by p.product_id having count(*) > 1)
  order by b.pcid, coalesce(array_length(b.appl_nos, 1), 0) desc, b.brand_display;

  create temp table _picks on commit drop as
  select b.pcid, b.drug, b.brand,
    (select jsonb_agg(jsonb_build_object('pcid', d.pcid, 'name', d.name) order by d.rk)
       from (select p.pcid, p.name,
                    row_number() over (order by
                      (exists (select 1 from public.class_members c1
                               join public.class_members c2 on c2.class_pcid = c1.class_pcid and c2.member_pcid = p.pcid
                               join public.drug_classes dc on dc.pcid = c1.class_pcid
                               where c1.member_pcid = b.pcid and dc.class_type = 'epc')) desc,
                      md5(b.pcid::text || '-' || p.pcid::text)) as rk
             from _np p
             where p.pcid <> b.pcid
               and (b.unii is null or p.unii is null or p.unii <> b.unii)
               and lower(p.name) <> lower(b.drug)
               and exists (select 1 from public.class_members ce join public.drug_classes dce on dce.pcid = ce.class_pcid and dce.class_type = 'epc'
                           where ce.member_pcid = p.pcid)) d
       where d.rk <= 3) as dists
  from _brand b;

  select count(*) into v_cands from _picks;
  select count(*) into v_rej from _picks where jsonb_array_length(coalesce(dists, '[]'::jsonb)) < 3;

  insert into public.learn_items (
    natural_key, item_type, template_key, generation_method, is_official, status,
    subject_area, topic, difficulty_level, tags, primary_pcid,
    prompt, concise_answer, clinical_rationale, clinical_caveats, mcq_options,
    source_kind, source_list_pcid, source_agency, source_citation, license)
  select 'brand_generic:' || nl.pcid || ':' || k.pcid, 'mcq', 'brand_generic', 'template', true, 'draft',
    'Pharmacology', 'Brand and generic names', 1, array['brand'], k.pcid,
    format('Which generic drug is sold under the brand name %s?', k.brand), k.drug,
    format('%s is a brand name of %s.', k.brand, k.drug),
    'Brand names change over time and a product may be discontinued; the generic name is the stable identifier.',
    (select jsonb_agg(jsonb_build_object('id', chr(96 + q.rn::int), 'text', q.txt, 'is_correct', q.ok,
        'rationale', case when q.ok then format('%s is a brand of %s.', k.brand, k.drug) else format('%s is not the generic for %s.', q.txt, k.brand) end) order by q.rn)
       from (select o.txt, o.ok, row_number() over (order by md5('brand_generic' || k.pcid::text || o.txt)) rn
             from (select k.drug as txt, true as ok
                   union all select d->>'name', false from jsonb_array_elements(k.dists) d) o) q),
    'list', nl.pcid, 'FDA',
    'Drugs@FDA product names and NLM RxNorm brand names, matched to Pharmacy Commons moieties; drug selection from the Notable Drugs list.',
    nl.license
  from _picks k where jsonb_array_length(coalesce(k.dists, '[]'::jsonb)) = 3
  on conflict (natural_key) do nothing;
  get diagnostics v_new = row_count;

  perform public.learn_link_entities('brand_generic');
  drop table _picks, _brand, _np;
  return jsonb_build_object('template', 'brand_generic', 'notable_core_drugs', v_np, 'with_qualifying_brand', v_cands,
    'rejected_fewer_than_3_distractors', v_rej, 'created', v_new, 'already_existed', v_cands - v_rej - v_new);
end $$;


ALTER FUNCTION public.learn_gen_brand_generic() OWNER TO postgres;

--
-- Name: learn_gen_brand_list(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learn_gen_brand_list() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_rows int; v_rej int; v_new int;
begin
  create temp table _rows on commit drop as
  select l.sheet_id, l.importance, l.brand_name as brand, l.generic_pcid, l.brand_pcid, l.therapeutic_domain as dom, l.clinical_context as ctx,
    case when g ~ '^[A-Z][a-z]' then lower(left(g,1)) || substr(g,2) else g end as gtext,
    array(select distinct split_part(trim(t),' ',1)
          from regexp_split_to_table(lower(regexp_replace(g,'\(.*?\)','','g')), '\s*(/|;|,| and |-)\s*') t where trim(t) <> '') as ftok
  from public.learn_brand_list l,
       lateral (select regexp_replace(regexp_replace(trim(l.generic_name),'\s*/\s*','/','g'),'\s+',' ','g') as g) x
  where l.status = 'ready' and l.brand_pcid is not null;
  select count(*) into v_rows from _rows;

  create temp table _pool on commit drop as
  select distinct on (gtext) gtext, dom, ftok from _rows order by gtext, sheet_id;

  create temp table _picks on commit drop as
  select r.*, (select jsonb_agg(d.gtext order by d.rk) from (
      select c.gtext, row_number() over (order by (c.dom = r.dom) desc, md5(r.sheet_id::text || c.gtext)) rk
      from _pool c
      where c.gtext <> r.gtext and not (c.ftok && r.ftok)
        and position(lower(r.gtext) in lower(c.gtext)) = 0 and position(lower(c.gtext) in lower(r.gtext)) = 0) d
    where d.rk <= 3) as dists
  from _rows r;
  select count(*) into v_rej from _picks where jsonb_array_length(coalesce(dists,'[]'::jsonb)) < 3;

  insert into public.learn_items (
    natural_key, item_type, template_key, generation_method, is_official, status,
    subject_area, topic, difficulty_level, tags, primary_pcid,
    prompt, concise_answer, clinical_rationale, clinical_caveats, mcq_options,
    source_kind, source_agency, source_citation, license)
  select 'brand_list:' || k.sheet_id, 'mcq', 'brand_generic', 'template', true, 'published',
    'Pharmacology', 'Brand and generic names', case k.importance when 'High' then 1 when 'Medium' then 2 else 3 end,
    array['brand', 'importance:' || lower(k.importance)], k.brand_pcid,
    format('Which generic drug is sold under the brand name %s?', k.brand), k.gtext,
    format('%s is a brand name of %s.', k.brand, k.gtext) || coalesce(' ' || nullif(trim(k.ctx), '') || '.', ''),
    'Brand names change over time and a product may be discontinued; the generic name is the stable identifier.',
    (select jsonb_agg(jsonb_build_object('id', chr(96 + q.rn::int), 'text', q.txt, 'is_correct', q.ok,
        'rationale', case when q.ok then format('%s is a brand of %s.', k.brand, k.gtext) else format('%s is not the generic for %s.', q.txt, k.brand) end) order by q.rn)
       from (select o.txt, o.ok, row_number() over (order by md5('brand_list' || k.sheet_id::text || o.txt)) rn
             from (select k.gtext as txt, true as ok
                   union all select d, false from jsonb_array_elements_text(k.dists) d) o) q),
    'authored', 'Pharmacy Commons',
    'Pharmacy Commons brand-name priority list (Brands.xlsx; importance ' || k.importance || '), curated by the site owner; brand and generic matched to PCIDs.',
    'CC0-1.0'
  from _picks k where jsonb_array_length(coalesce(k.dists,'[]'::jsonb)) = 3
  on conflict (natural_key) do nothing;
  get diagnostics v_new = row_count;

  perform public.learn_link_entities('brand_generic');
  drop table _rows, _pool, _picks;
  return jsonb_build_object('ready_rows', v_rows, 'rejected_fewer_than_3_distractors', v_rej, 'created', v_new);
end $$;


ALTER FUNCTION public.learn_gen_brand_list() OWNER TO postgres;

--
-- Name: learn_gen_class_of(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learn_gen_class_of() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare nl public.lists%rowtype; v_cands int; v_rej int; v_new int;
begin
  select * into nl from public.lists where slug = 'notable-drugs' and published;
  if not found then raise exception 'notable-drugs not found'; end if;

  create temp table _np on commit drop as select pcid, name from public.learn_list_pool('notable-drugs');
  create temp table _epc on commit drop as
    select dc.pcid as class_pcid, e.name as cname, dc.parent_pcid
    from public.drug_classes dc join public.entities e on e.pcid = dc.pcid where dc.class_type = 'epc';
  create temp table _drug_epc on commit drop as
    select cm.member_pcid as pcid, cm.class_pcid
    from public.class_members cm join _epc c on c.class_pcid = cm.class_pcid
    where cm.member_pcid in (select pcid from _np);
  create temp table _cand on commit drop as select distinct class_pcid from _drug_epc;
  create temp table _epc_atc on commit drop as
    select distinct ce.class_pcid, da.class_pcid as atc
    from public.class_members ce
    join _epc e on e.class_pcid = ce.class_pcid
    join public.class_members da on da.member_pcid = ce.member_pcid
    join public.drug_classes dd on dd.pcid = da.class_pcid and dd.class_type = 'atc';
  create temp table _drug_atc on commit drop as
    select distinct da.member_pcid as pcid, da.class_pcid as atc
    from public.class_members da join public.drug_classes dd on dd.pcid = da.class_pcid and dd.class_type = 'atc'
    where da.member_pcid in (select pcid from _np);
  create index on _epc_atc (class_pcid); create index on _drug_atc (pcid);
  create temp table _ov on commit drop as
    select distinct m1.class_pcid as a, m2.class_pcid as b
    from public.class_members m1 join _epc e1 on e1.class_pcid = m1.class_pcid
    join public.class_members m2 on m2.member_pcid = m1.member_pcid
    join _epc e2 on e2.class_pcid = m2.class_pcid
    where m1.class_pcid <> m2.class_pcid;
  create index on _ov (a, b);

  create temp table _picks on commit drop as
  select a.pcid, n.name as drug, a.class_pcid, ac.cname as aclass,
    (select jsonb_agg(jsonb_build_object('class_pcid', d.class_pcid, 'name', d.cname) order by d.rk)
       from (select c.class_pcid, c.cname,
                    row_number() over (order by
                      (select count(*) from _epc_atc x join _drug_atc y on y.atc = x.atc and y.pcid = a.pcid where x.class_pcid = c.class_pcid) desc,
                      md5(a.pcid::text || '-' || c.class_pcid::text)) as rk
             from _epc c
             where c.class_pcid in (select class_pcid from _cand)
               and c.class_pcid <> a.class_pcid and lower(c.cname) <> lower(ac.cname)
               and c.parent_pcid is distinct from a.class_pcid and ac.parent_pcid is distinct from c.class_pcid
               and not exists (select 1 from _drug_epc de where de.pcid = a.pcid and de.class_pcid = c.class_pcid)
               and not exists (select 1 from _ov where _ov.a = a.class_pcid and _ov.b = c.class_pcid)
               and position(lower(ac.cname) in lower(c.cname)) = 0 and position(lower(c.cname) in lower(ac.cname)) = 0) d
       where d.rk <= 3) as dists
  from (select pcid, min(class_pcid) as class_pcid from _drug_epc group by pcid having count(distinct class_pcid) = 1) a
  join _np n on n.pcid = a.pcid
  join _epc ac on ac.class_pcid = a.class_pcid;

  select count(*) into v_cands from _picks;
  select count(*) into v_rej from _picks where jsonb_array_length(coalesce(dists, '[]'::jsonb)) < 3;

  insert into public.learn_items (
    natural_key, item_type, template_key, generation_method, is_official, status,
    subject_area, topic, difficulty_level, tags, primary_pcid,
    prompt, concise_answer, clinical_rationale, clinical_caveats, mcq_options,
    source_kind, source_list_pcid, source_agency, source_citation, license)
  select 'class_of:' || nl.pcid || ':' || k.pcid, 'mcq', 'class_of', 'template', true, 'draft',
    'Pharmacology', 'Drug classes (FDA EPC)', 2, array['class:epc'], k.pcid,
    format('Which FDA established pharmacologic class (EPC) does %s belong to?', k.drug), k.aclass,
    format('%s is classified in the FDA established pharmacologic class "%s".', k.drug, k.aclass),
    'A drug can belong to more than one class system; this item uses the FDA EPC only.',
    (select jsonb_agg(jsonb_build_object('id', chr(96 + q.rn::int), 'text', q.txt, 'is_correct', q.ok,
        'rationale', case when q.ok then format('%s is classified as %s.', k.drug, k.aclass) else format('%s is not an FDA EPC assigned to %s.', q.txt, k.drug) end) order by q.rn)
       from (select o.txt, o.ok, row_number() over (order by md5('class_of' || k.pcid::text || o.txt)) rn
             from (select k.aclass as txt, true as ok
                   union all select d->>'name', false from jsonb_array_elements(k.dists) d) o) q),
    'list', nl.pcid, 'FDA',
    'FDA established pharmacologic class (EPC) assignments via NLM RxClass; drug selection from the Pharmacy Commons Notable Drugs list.',
    nl.license
  from _picks k where jsonb_array_length(coalesce(k.dists, '[]'::jsonb)) = 3
  on conflict (natural_key) do nothing;
  get diagnostics v_new = row_count;

  perform public.learn_link_entities('class_of');
  drop table _picks, _np, _epc, _drug_epc, _cand, _epc_atc, _drug_atc, _ov;
  return jsonb_build_object('template', 'class_of', 'candidates_single_epc', v_cands,
    'rejected_fewer_than_3_distractors', v_rej, 'created', v_new, 'already_existed', v_cands - v_rej - v_new);
end $$;


ALTER FUNCTION public.learn_gen_class_of() OWNER TO postgres;

--
-- Name: learn_gen_dnc_reason(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learn_gen_dnc_reason() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare l public.lists%rowtype; v_cands int; v_cards int; v_mcq int; v_multi int; v_other int;
  v_opts jsonb := '[{"value":"Modified-release","label":"Modified-release (crushing defeats the release mechanism)"},
                    {"value":"Irritant","label":"Irritant (mucosal or GI irritation)"},
                    {"value":"Hazardous/teratogenic","label":"Hazardous or teratogenic (exposure risk to handler)"},
                    {"value":"Unpleasant taste","label":"Unpleasant taste"},
                    {"value":"Transmucosal","label":"Transmucosal (absorbed through the mouth lining)"}]'::jsonb;
begin
  select * into l from public.lists where slug = 'do-not-crush' and published;
  if not found then raise exception 'do-not-crush not found'; end if;

  select count(*) into v_cands from public.learn_list_pool('do-not-crush') where legal_status is not null;

  insert into public.learn_items (
    natural_key, item_type, template_key, generation_method, is_official, status,
    subject_area, topic, difficulty_level, tags, primary_pcid,
    prompt, concise_answer, clinical_rationale, clinical_caveats,
    source_kind, source_list_pcid, source_agency, source_citation, source_url, license)
  select 'dnc_reason:' || l.pcid || ':' || a.pcid, 'flashcard', 'dnc_reason', 'template', true, 'draft',
    'Medication safety', l.title, 2, array['list:' || l.slug],  a.pcid,
    format('Why is %s%s on the Do Not Crush list?', a.name, case when a.note is not null then ' (' || a.note || ')' else '' end),
    a.legal_status,
    'Reason recorded on the Pharmacy Commons Do Not Crush list. Product and form: ' || coalesce(a.note, 'not recorded') || '.',
    'The list is a curated reference, not exhaustive. Confirm against the specific product and form before altering it.',
    'list', l.pcid, 'Pharmacy Commons', l.source_citation, l.source_url, l.license
  from public.learn_list_pool('do-not-crush') a where a.legal_status is not null and a.legal_status <> 'Other'
  on conflict (natural_key) do nothing;
  get diagnostics v_cards = row_count;

  select count(*) into v_multi from public.learn_list_pool('do-not-crush') where legal_status like '%;%';
  select count(*) into v_other from public.learn_list_pool('do-not-crush') where legal_status = 'Other';

  insert into public.learn_items (
    natural_key, item_type, template_key, generation_method, is_official, status,
    subject_area, topic, difficulty_level, tags, primary_pcid,
    prompt, concise_answer, clinical_rationale, clinical_caveats, mcq_options,
    source_kind, source_list_pcid, source_agency, source_citation, source_url, license)
  select 'dnc_reason_mcq:' || l.pcid || ':' || a.pcid, 'mcq', 'dnc_reason_mcq', 'template', true, 'draft',
    'Medication safety', l.title, 2, array['list:' || l.slug, 'fixed-option-order'], a.pcid,
    format('What is the main reason %s%s should not be crushed?', a.name, case when a.note is not null then ' (' || a.note || ')' else '' end),
    (select o->>'label' from jsonb_array_elements(v_opts) o where o->>'value' = a.legal_status),
    format('The Do Not Crush list records %s for %s.', lower(a.legal_status), a.name),
    'The list is a curated reference, not exhaustive. Confirm against the specific product and form.',
    (select jsonb_agg(jsonb_build_object('id', chr(96 + q.rn::int), 'text', q.o->>'label', 'is_correct', (q.o->>'value') = a.legal_status,
        'rationale', case when (q.o->>'value') = a.legal_status then 'Reason recorded on the list.' else 'Not the reason recorded on the list for this drug.' end) order by q.rn)
       from (select o, ordinality as rn from jsonb_array_elements(v_opts) with ordinality as t(o, ordinality)) q),
    'list', l.pcid, 'Pharmacy Commons', l.source_citation, l.source_url, l.license
  from public.learn_list_pool('do-not-crush') a
  where exists (select 1 from jsonb_array_elements(v_opts) o where o->>'value' = a.legal_status)
  on conflict (natural_key) do nothing;
  get diagnostics v_mcq = row_count;

  perform public.learn_link_entities('dnc_reason');
  perform public.learn_link_entities('dnc_reason_mcq');
  return jsonb_build_object('template', 'dnc_reason(+_mcq)', 'candidates_with_reason', v_cands,
    'flashcards_created', v_cards, 'mcq_created', v_mcq,
    'mcq_rejected_multi_reason', v_multi, 'mcq_rejected_reason_other', v_other);
end $$;


ALTER FUNCTION public.learn_gen_dnc_reason() OWNER TO postgres;

--
-- Name: learn_gen_jc_dnu(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learn_gen_jc_dnu() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare l public.lists%rowtype; v_rows int; v_groups int; v_new int;
begin
  select * into l from public.lists where slug = 'joint-commission-do-not-use' and published;
  if not found then raise exception 'joint-commission-do-not-use not found'; end if;
  select count(*) into v_rows from public.list_items where list_pcid = l.pcid;

  create temp table _jc on commit drop as
  select lower(regexp_replace(t.term, '[.\s]', '', 'g')) as k,
         min(li.position) as pos,
         string_agg(distinct t.term, ' / ' order by t.term) as variants,
         (array_agg(li.note order by li.position))[1] as note,
         (array_agg(t.definition order by li.position))[1] as def,
         (array_agg(li.legal_status order by li.position))[1] as agency
  from public.list_items li join public.dictionary_terms t on t.id = li.term_id
  where li.list_pcid = l.pcid
  group by 1;
  select count(*) into v_groups from _jc;

  insert into public.learn_items (
    natural_key, item_type, template_key, generation_method, is_official, status,
    subject_area, topic, difficulty_level, tags,
    prompt, concise_answer, clinical_rationale, clinical_caveats,
    source_kind, source_list_pcid, source_agency, source_citation, source_url, license, third_party_sources)
  select 'jc_dnu:' || l.pcid || ':' || left(regexp_replace(j.k, '[^a-z0-9]+', '-', 'g'), 40), 'flashcard', 'jc_dnu', 'template', true, 'draft',
    'Medication safety', l.title, 1, array['list:' || l.slug, 'abbreviations'],
    format('Do Not Use: %s. What is the risk, and what should you write instead?', j.variants),
    j.note, j.def,
    case when j.agency = 'ISMP addition' then 'Added by ISMP; not part of the original Joint Commission list.' end,
    'list', l.pcid, j.agency, l.source_citation, l.source_url, l.license, array[l.source_citation]
  from _jc j
  on conflict (natural_key) do nothing;
  get diagnostics v_new = row_count;
  drop table _jc;
  return jsonb_build_object('template', 'jc_dnu', 'list_rows', v_rows, 'concept_groups', v_groups, 'created', v_new);
end $$;


ALTER FUNCTION public.learn_gen_jc_dnu() OWNER TO postgres;

--
-- Name: learn_gen_member_mcq(text, text, text, text, text, text, text, text, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learn_gen_member_mcq(p_list_slug text, p_template_key text, p_stem text, p_ok_fmt text, p_wrong text, p_caveat text, p_agency text, p_subject text, p_release_filter boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare l public.lists%rowtype; v_cands int; v_new int; v_noclass int;
begin
  select * into l from public.lists where slug = p_list_slug and published;
  if not found then raise exception 'list % not found or unpublished', p_list_slug; end if;

  create temp table _picks on commit drop as
  with target_lists as (select pcid from public.lists where pcid = l.pcid or parent_pcid = l.pcid),
  members as (select distinct li.member_pcid as pcid from public.list_items li join target_lists t on t.pcid = li.list_pcid where li.member_pcid is not null),
  excl as (
    select pcid from members
    union select m.pcid from public.moieties m join members x on m.synonym_of_pcid = x.pcid
    union select m.synonym_of_pcid from public.moieties m join members x on m.pcid = x.pcid where m.synonym_of_pcid is not null),
  rel as (
    select distinct fpi.moiety_pcid as pcid
    from public.fda_product_ingredients fpi join public.fda_products p on p.product_id = fpi.product_id
    where p_release_filter and fpi.moiety_pcid is not null
      and p.dosage_form ~* '(extended|delayed|sustained|controlled|release|disintegrating|sublingual|buccal)'),
  oral as (
    select distinct fpi.moiety_pcid as pcid
    from public.fda_product_ingredients fpi join public.fda_products p on p.product_id = fpi.product_id
    where p_release_filter and fpi.moiety_pcid is not null and p.dosage_form ~* '(tablet|capsule)'),
  pool as (
    select np.* from public.learn_list_pool('notable-drugs') np
    where np.pcid not in (select pcid from excl) and np.pcid not in (select pcid from rel)
      and (not p_release_filter or np.pcid in (select pcid from oral))),
  answers as (select * from public.learn_list_pool(p_list_slug))
  select a.pcid, a.name, a.legal_status, a.note, a.pos,
    (select jsonb_agg(jsonb_build_object('pcid', d.pcid, 'name', d.name) order by d.rk)
       from (select p.pcid, p.name,
                    row_number() over (order by
                      (exists (select 1 from public.class_members c1
                               join public.class_members c2 on c2.class_pcid = c1.class_pcid and c2.member_pcid = p.pcid
                               join public.drug_classes dc on dc.pcid = c1.class_pcid
                               where c1.member_pcid = a.pcid and dc.class_type = 'epc') ) desc,
                      md5(a.pcid::text || '-' || p.pcid::text)) as rk
             from pool p where p.pcid <> a.pcid) d
       where d.rk <= 3) as dists
  from answers a;

  select count(*) into v_cands from _picks;
  select count(*) into v_noclass from _picks where dists is null or jsonb_array_length(dists) < 3;

  insert into public.learn_items (
    natural_key, item_type, template_key, generation_method, is_official, status,
    subject_area, topic, jurisdiction, difficulty_level, tags, primary_pcid,
    prompt, concise_answer, clinical_rationale, clinical_caveats, mcq_options,
    source_kind, source_list_pcid, source_agency, source_citation, source_url, license)
  select
    p_template_key || ':' || l.pcid || ':' || k.pcid, 'mcq', p_template_key, 'template', true, 'draft',
    p_subject, l.title, l.jurisdiction, 2, array['list:' || l.slug], k.pcid,
    p_stem, k.name,
    format(p_ok_fmt, k.name, coalesce(k.legal_status, '—'), coalesce(k.note, '')),
    p_caveat,
    (select jsonb_agg(jsonb_build_object('id', chr(96 + q.rn::int), 'text', q.txt, 'is_correct', q.ok,
                       'rationale', case when q.ok then format(p_ok_fmt, k.name, coalesce(k.legal_status, '—'), coalesce(k.note, '')) else p_wrong end) order by q.rn)
       from (select o.txt, o.ok, row_number() over (order by md5(p_template_key || k.pcid::text || o.txt)) rn
             from (select k.name as txt, true as ok
                   union all select d->>'name', false from jsonb_array_elements(k.dists) d) o) q),
    'list', l.pcid, p_agency, l.source_citation, l.source_url, l.license
  from _picks k
  where jsonb_array_length(coalesce(k.dists, '[]'::jsonb)) = 3
  on conflict (natural_key) do nothing;
  get diagnostics v_new = row_count;

  perform public.learn_link_entities(p_template_key);
  drop table _picks;
  return jsonb_build_object('template', p_template_key, 'candidates', v_cands,
    'rejected_fewer_than_3_distractors', v_noclass, 'created', v_new,
    'already_existed', v_cands - v_noclass - v_new);
end $$;


ALTER FUNCTION public.learn_gen_member_mcq(p_list_slug text, p_template_key text, p_stem text, p_ok_fmt text, p_wrong text, p_caveat text, p_agency text, p_subject text, p_release_filter boolean) OWNER TO postgres;

--
-- Name: learn_link_entities(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learn_link_entities(p_template_key text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare n int;
begin
  insert into public.learn_item_entities (item_id, pcid, role)
  select id, primary_pcid, 'primary' from public.learn_items
  where template_key = p_template_key and primary_pcid is not null
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;


ALTER FUNCTION public.learn_link_entities(p_template_key text) OWNER TO postgres;

--
-- Name: learn_list_pool(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learn_list_pool(p_slug text) RETURNS TABLE(pcid bigint, name text, slug text, legal_status text, value numeric, note text, pos integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select distinct on (m.pcid) m.pcid, e.name, e.slug, li.legal_status, li.value, li.note, li.position
  from public.lists l
  join public.list_items li on li.list_pcid = l.pcid
  join public.moieties m on m.pcid = li.member_pcid and m.term_type = 'Core moiety' and m.synonym_of_pcid is null
  join public.entities e on e.pcid = m.pcid
  where l.slug = p_slug and l.published
  order by m.pcid, li.position
$$;


ALTER FUNCTION public.learn_list_pool(p_slug text) OWNER TO postgres;

--
-- Name: learn_personal_collection_guard(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learn_personal_collection_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if not new.is_official and tg_op = 'INSERT'
     and (select count(*) from public.learn_collections where owner_id = new.owner_id) >= 100 then
    raise exception 'personal_collection_limit' using errcode = '54000';
  end if;
  return new;
end $$;


ALTER FUNCTION public.learn_personal_collection_guard() OWNER TO postgres;

--
-- Name: learn_personal_guard(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learn_personal_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare v_cap int := 2000; v_text text;
begin
  if new.is_official then return new; end if;
  if tg_op = 'INSERT' then
    if (select count(*) from public.learn_items where owner_id = new.owner_id) >= v_cap then
      raise exception 'personal_item_limit' using errcode = '54000';
    end if;
  end if;
  v_text := concat_ws(' ', new.prompt, new.concise_answer, new.clinical_rationale, new.clinical_caveats,
                      new.personal_note, new.mcq_options::text);
  if v_text ~* '<\s*/?\s*[a-z!]' then
    raise exception 'html_not_allowed' using errcode = '22023';
  end if;
  return new;
end $$;


ALTER FUNCTION public.learn_personal_guard() OWNER TO postgres;

--
-- Name: learn_record_review(uuid, uuid, text, smallint, boolean, text, boolean, integer, uuid, timestamp with time zone, text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learn_record_review(p_item uuid, p_collection uuid, p_mode text, p_rating smallint, p_is_correct boolean, p_selected_option text, p_was_unsure boolean, p_duration_ms integer, p_client_event_id uuid, p_reviewed_at timestamp with time zone, p_scheduler_version text, p_state_before jsonb, p_state_after jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_ver int;
  v_inserted int;
  v_at timestamptz := coalesce(p_reviewed_at, now());
  v_row public.learn_user_item_state;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if p_rating is null or p_rating not between 1 and 4 then raise exception 'bad_rating' using errcode = '22023'; end if;
  if v_at > now() + interval '5 minutes' then raise exception 'bad_timestamp' using errcode = '22023'; end if;
  if p_state_after is null then raise exception 'state_required' using errcode = '22023'; end if;

  select content_version into v_ver from public.learn_items where id = p_item;
  if not found then raise exception 'item_not_found' using errcode = 'P0002'; end if;

  insert into public.learn_review_events
    (user_id, item_id, collection_id, client_event_id, study_mode, rating, is_correct, selected_option_id,
     was_unsure, duration_ms, scheduler_version, state_before, state_after, item_version_seen, reviewed_at)
  values
    (v_uid, p_item, p_collection, p_client_event_id, p_mode, p_rating, p_is_correct, p_selected_option,
     coalesce(p_was_unsure, false), p_duration_ms, coalesce(p_scheduler_version, 'fsrs-5.0'),
     p_state_before, p_state_after, v_ver, v_at)
  on conflict (user_id, client_event_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    insert into public.learn_user_item_state as s
      (user_id, item_id, state, step, stability, difficulty, reps, lapses, last_rating, last_reviewed_at, due_at, last_seen_item_version)
    values
      (v_uid, p_item,
       p_state_after->>'state',
       coalesce((p_state_after->>'step')::smallint, 0),
       (p_state_after->>'stability')::double precision,
       (p_state_after->>'difficulty')::double precision,
       (p_state_after->>'reps')::int,
       (p_state_after->>'lapses')::int,
       p_rating, v_at, (p_state_after->>'due_at')::timestamptz, v_ver)
    on conflict (user_id, item_id) do update set
      state = excluded.state, step = excluded.step, stability = excluded.stability, difficulty = excluded.difficulty,
      reps = excluded.reps, lapses = excluded.lapses, last_rating = excluded.last_rating,
      last_reviewed_at = excluded.last_reviewed_at, due_at = excluded.due_at,
      last_seen_item_version = excluded.last_seen_item_version
    where s.last_reviewed_at is null or s.last_reviewed_at <= excluded.last_reviewed_at;

    if p_is_correct is not null then
      update public.learn_user_item_state
         set mcq_attempts = mcq_attempts + 1, mcq_correct = mcq_correct + (case when p_is_correct then 1 else 0 end)
       where user_id = v_uid and item_id = p_item;
    end if;
  end if;

  select * into v_row from public.learn_user_item_state where user_id = v_uid and item_id = p_item;
  return jsonb_build_object('recorded', v_inserted = 1, 'state', to_jsonb(v_row));
end $$;


ALTER FUNCTION public.learn_record_review(p_item uuid, p_collection uuid, p_mode text, p_rating smallint, p_is_correct boolean, p_selected_option text, p_was_unsure boolean, p_duration_ms integer, p_client_event_id uuid, p_reviewed_at timestamp with time zone, p_scheduler_version text, p_state_before jsonb, p_state_after jsonb) OWNER TO postgres;

--
-- Name: learn_review_items(text, text, integer, integer, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learn_review_items(p_template text, p_status text DEFAULT 'draft'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_seed text DEFAULT 'audit'::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.has_role('admin') then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_limit not between 1 and 200 then raise exception 'bad_limit' using errcode = '22023'; end if;
  return jsonb_build_object(
    'total', (select count(*) from public.learn_items where is_official and template_key = p_template and status = p_status),
    'items', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.rk)
      from (select i.id, i.template_key, i.status, i.item_type, i.topic, i.prompt, i.concise_answer,
                   i.clinical_rationale, i.clinical_caveats, i.mcq_options, i.source_agency, i.source_citation,
                   i.third_party_sources, i.primary_pcid, e.name as primary_name,
                   row_number() over (order by md5(i.id::text || p_seed)) as rk
            from public.learn_items i left join public.entities e on e.pcid = i.primary_pcid
            where i.is_official and i.template_key = p_template and i.status = p_status
            order by md5(i.id::text || p_seed) offset p_offset limit p_limit) r), '[]'::jsonb));
end $$;


ALTER FUNCTION public.learn_review_items(p_template text, p_status text, p_limit integer, p_offset integer, p_seed text) OWNER TO postgres;

--
-- Name: learn_review_summary(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learn_review_summary() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.has_role('admin') then raise exception 'not_admin' using errcode = '42501'; end if;
  return jsonb_build_object(
    'collections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'slug', c.slug, 'title', c.title, 'status', c.status,
        'draft', x.draft, 'review_needed', x.review_needed, 'published', x.published, 'archived', x.archived) order by c.sort_order, c.title)
      from public.learn_collections c
      cross join lateral (
        select count(*) filter (where i.status = 'draft')::int as draft,
               count(*) filter (where i.status = 'review_needed')::int as review_needed,
               count(*) filter (where i.status = 'published')::int as published,
               count(*) filter (where i.status = 'archived')::int as archived
        from public.learn_collection_items ci join public.learn_items i on i.id = ci.item_id
        where ci.collection_id = c.id) x
      where c.is_official), '[]'::jsonb),
    'templates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'template_key', t.template_key, 'draft', t.draft, 'review_needed', t.review_needed,
        'published', t.published, 'archived', t.archived) order by t.template_key)
      from (select template_key,
                   count(*) filter (where status = 'draft')::int as draft,
                   count(*) filter (where status = 'review_needed')::int as review_needed,
                   count(*) filter (where status = 'published')::int as published,
                   count(*) filter (where status = 'archived')::int as archived
            from public.learn_items where is_official and template_key is not null group by template_key) t), '[]'::jsonb));
end $$;


ALTER FUNCTION public.learn_review_summary() OWNER TO postgres;

--
-- Name: learn_set_collection_status(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learn_set_collection_status(p_collection uuid, p_status text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_pub int;
begin
  if not public.has_role('admin') then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_status not in ('draft','published','archived') then raise exception 'bad_status' using errcode = '22023'; end if;
  if p_status = 'published' then
    select count(*) into v_pub from public.learn_collection_items ci
      join public.learn_items i on i.id = ci.item_id and i.status = 'published' and i.is_official
      where ci.collection_id = p_collection;
    if v_pub = 0 then raise exception 'no_published_items' using errcode = '22023'; end if;
  end if;
  update public.learn_collections set status = p_status, updated_at = now() where id = p_collection and is_official;
  if not found then raise exception 'collection_not_found' using errcode = 'P0002'; end if;
  return p_status;
end $$;


ALTER FUNCTION public.learn_set_collection_status(p_collection uuid, p_status text) OWNER TO postgres;

--
-- Name: learn_set_status(uuid[], text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learn_set_status(p_ids uuid[], p_status text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_n int;
begin
  if not public.has_role('admin') then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_status not in ('draft','review_needed','published','archived') then
    raise exception 'bad_status' using errcode = '22023';
  end if;
  update public.learn_items
     set status = p_status,
         reviewed_by = case when p_status = 'published' then auth.uid() else reviewed_by end,
         reviewed_at = case when p_status = 'published' then now() else reviewed_at end
   where id = any (p_ids) and is_official;
  get diagnostics v_n = row_count;
  return v_n;
end $$;


ALTER FUNCTION public.learn_set_status(p_ids uuid[], p_status text) OWNER TO postgres;

--
-- Name: learn_touch(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learn_touch() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin new.updated_at := now(); return new; end $$;


ALTER FUNCTION public.learn_touch() OWNER TO postgres;

--
-- Name: legal_status_line(bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.legal_status_line(p_pcid bigint) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_rx text; v_legal text; v_sched text; v_type text;
  has_rx boolean := false; has_otc boolean := false;
  rx_flag boolean; otc_flag boolean; v_cs text;
begin
  select rx_status, legal_status, controlled_schedule, 'moiety' into v_rx, v_legal, v_sched, v_type from moieties where pcid = p_pcid;
  if not found then select rx_status, legal_status, controlled_schedule, 'precise_form' into v_rx, v_legal, v_sched, v_type from precise_forms where pcid = p_pcid; end if;
  if not found then select rx_status, legal_status, controlled_schedule, 'combination' into v_rx, v_legal, v_sched, v_type from combinations where pcid = p_pcid; end if;
  if not found then select rx_status, legal_status, controlled_schedule, 'formulation' into v_rx, v_legal, v_sched, v_type from formulations where pcid = p_pcid; end if;
  if v_type is null then return null; end if;

  -- Evidence from currently marketed, single-ingredient Drugs@FDA products (discontinued products ignored).
  if v_type in ('moiety','precise_form') then
    select coalesce(bool_or(p.marketing_status = 'Prescription'), false),
           coalesce(bool_or(p.marketing_status = 'Over-the-counter'), false)
      into has_rx, has_otc
    from fda_product_ingredients i
    join fda_products p on p.product_id = i.product_id
    where (i.active_moiety_pcid = p_pcid or i.form_pcid = p_pcid)
      and (select count(*) from fda_product_ingredients i2 where i2.product_id = i.product_id) = 1;
  end if;

  v_cs := substring(coalesce(v_sched, '') || ' ' || coalesce(v_rx, '') from 'CS-[1-5]');
  rx_flag := v_rx in ('Rx only', 'Rx only (Legend)') or v_legal = 'Legend' or has_rx;
  otc_flag := v_rx = 'OTC' or has_otc or coalesce(v_sched, '') ilike '%non-Rx%' or coalesce(v_rx, '') ilike '%CS-_ non-Rx%';

  if v_cs is not null then
    return v_cs || case when otc_flag then ' and OTC' else '' end;
  elsif rx_flag and otc_flag then return 'Legend and OTC';
  elsif rx_flag then return 'Legend';
  elsif otc_flag then return 'OTC';
  elsif v_rx in ('non-Rx', 'Exemption from Rx', 'Non-CS', 'Restricted dangerous drug') then return v_rx;
  else return null;
  end if;
end $$;


ALTER FUNCTION public.legal_status_line(p_pcid bigint) OWNER TO postgres;

--
-- Name: FUNCTION legal_status_line(p_pcid bigint); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.legal_status_line(p_pcid bigint) IS 'One-line legal status for the Quick facts box: CS-n, Legend, OTC, Legend and OTC (CS-n and OTC for OTC-scheduled). Uses rx_status/legal_status/controlled_schedule plus currently marketed single-ingredient Drugs@FDA products. Phase 26c.';


--
-- Name: list_classes(text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.list_classes(p_type text DEFAULT NULL::text, p_search text DEFAULT NULL::text) RETURNS TABLE(slug text, name text, class_type text, class_type_label text, source_code text, level smallint, member_count bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select e.slug, e.name, d.class_type, class_type_label(d.class_type), d.source_code, d.level,
         coalesce(d.member_count, 0)::bigint
  from drug_classes d join entities e using(pcid)
  where (d.member_count > 0 or d.class_type = 'community')
    and (p_type is null or d.class_type=p_type)
    and (p_search is null or e.name ilike '%'||p_search||'%' or d.source_code ilike p_search||'%')
  order by 3, 5 nulls last, 2 $$;


ALTER FUNCTION public.list_classes(p_type text, p_search text) OWNER TO postgres;

--
-- Name: list_lists(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.list_lists() RETURNS TABLE(pcid bigint, slug text, title text, description text, kind text, parent_slug text, jurisdiction text, item_count integer, measure_label text, default_sort text, sort_order integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select l.pcid, l.slug, l.title, l.description, l.kind, p.slug, l.jurisdiction, l.item_count, l.measure_label, l.default_sort, l.sort_order
  from lists l left join lists p on p.pcid = l.parent_pcid
  order by l.sort_order, l.title
$$;


ALTER FUNCTION public.list_lists() OWNER TO postgres;

--
-- Name: list_term_counts(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.list_term_counts() RETURNS TABLE(slug text, term_count integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select l.slug, count(*)::int
  from lists l join list_items i on i.list_pcid = l.pcid
  where i.term_id is not null
  group by l.slug
$$;


ALTER FUNCTION public.list_term_counts() OWNER TO postgres;

--
-- Name: load_approved_name_structures(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.load_approved_name_structures() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


ALTER FUNCTION public.load_approved_name_structures() OWNER TO postgres;

--
-- Name: log_entity_change(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.log_entity_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  o     jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n     jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  d     jsonb := '{}'::jsonb;
  f     text[] := '{}';
  k     text;
  col   text;
  p     bigint;
  seen  bigint[] := '{}';
  rkey  text := case when tg_nargs > 1 then coalesce(n, o) ->> tg_argv[1] end;
  src   text := coalesce(nullif(current_setting('pc.change_source', true), ''), 'direct');
  rev   bigint := nullif(current_setting('pc.revision_id', true), '')::bigint;
  who   uuid := coalesce(nullif(current_setting('pc.actor', true), '')::uuid, auth.uid());
begin
  for k in select jsonb_object_keys(coalesce(n, o)) loop
    continue when k in ('created_at', 'updated_at');
    if tg_op = 'UPDATE' then
      continue when (o -> k) is not distinct from (n -> k);
    elsif jsonb_typeof(coalesce(n, o) -> k) = 'null' then
      continue;
    end if;
    d := d || jsonb_build_object(k, jsonb_build_object('old', o -> k, 'new', n -> k));
    f := f || k;
  end loop;

  if cardinality(f) = 0 then
    return null;
  end if;

  foreach col in array string_to_array(tg_argv[0], ',') loop
    for p in select distinct x::bigint
             from unnest(array[o ->> col, n ->> col]) x
             where x is not null loop
      continue when p = any(seen);
      seen := seen || p;
      insert into entity_changes (pcid, table_name, op, row_key, changed_fields, diff, source, revision_id, actor)
      values (p, tg_table_name, tg_op, rkey, f, d, src, rev, who);
    end loop;
  end loop;
  return null;
end;
$$;


ALTER FUNCTION public.log_entity_change() OWNER TO postgres;

--
-- Name: mint_class(text, text, text, text, smallint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.mint_class(p_name text, p_type text, p_system text, p_code text, p_level smallint DEFAULT NULL::smallint) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_pcid bigint; v_slug text; v_base text; n int := 1;
begin
  select pcid into v_pcid from drug_classes where source_system=p_system and source_code=p_code;
  if v_pcid is not null then return v_pcid; end if;
  v_base := trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'));
  v_slug := v_base;
  if exists(select 1 from entities where slug=v_slug) then
    v_base := v_base || '-' || lower(p_type); v_slug := v_base;
  end if;
  while exists(select 1 from entities where slug=v_slug) loop
    n := n + 1; v_slug := v_base || '-' || n;
  end loop;
  update pcid_blocks set next_pcid = next_pcid + 1 where block_id = 5 returning next_pcid - 1 into v_pcid;
  insert into entities(pcid, entity_type, slug, slug_uri, name) values (v_pcid,'class',v_slug,'pc:class:'||v_slug,p_name);
  insert into drug_classes(pcid, class_type, source_system, source_code, level, source_agency)
    values (v_pcid, p_type, p_system, p_code, p_level, p_system);
  return v_pcid;
end $$;


ALTER FUNCTION public.mint_class(p_name text, p_type text, p_system text, p_code text, p_level smallint) OWNER TO postgres;

--
-- Name: moderate_blog_comment(bigint, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.moderate_blog_comment(p_id bigint, p_action text, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not has_role('patroller') then raise exception 'not_patroller' using errcode = '42501'; end if;
  if p_action = 'patrol' then
    update blog_comments set patrolled_by = auth.uid(), patrolled_at = now()
     where id = p_id and state = 'visible';
  elsif p_action = 'hide' then
    if coalesce(trim(p_note), '') = '' then raise exception 'note_required'; end if;
    update blog_comments
       set state = 'hidden', moderated_by = auth.uid(), moderated_at = now(), moderation_note = trim(p_note),
           patrolled_by = auth.uid(), patrolled_at = now()
     where id = p_id and state = 'visible';
  elsif p_action = 'restore' then
    update blog_comments
       set state = 'visible', moderated_by = auth.uid(), moderated_at = now(), moderation_note = trim(p_note),
           patrolled_by = auth.uid(), patrolled_at = now()
     where id = p_id and state = 'hidden';
  else
    raise exception 'bad_action';
  end if;
  if not found then raise exception 'no_such_comment'; end if;
end $$;


ALTER FUNCTION public.moderate_blog_comment(p_id bigint, p_action text, p_note text) OWNER TO postgres;

--
-- Name: my_contributions(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.my_contributions(p_limit integer DEFAULT 200) RETURNS TABLE(kind text, item_id bigint, pcid bigint, slug text, name text, entity_type text, property_key text, summary text, created_at timestamp with time zone, patrol_status text, review_note text, is_live boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select * from (
    select 'page'::text, r.id, r.pcid, e.slug, e.name, e.entity_type, null::text, r.summary, r.created_at,
           r.patrol_status, r.review_note, coalesce(pc.current_revision_id = r.id, false)
    from page_revisions r
    join entities e on e.pcid = r.pcid
    left join page_content pc on pc.pcid = r.pcid
    where r.created_by = auth.uid()
      -- A page's first Overview text is kind 'create'. Skip it only when the
      -- same person created the page, which the 'new_page' row already lists
      -- (15g skipped every 'create' revision, hiding first edits to existing pages).
      and not (r.kind = 'create' and exists (select 1 from community_pages c
                                             where c.pcid = r.pcid and c.created_by = r.created_by))
    union all
    select 'fact', i.id, i.pcid, e.slug, e.name, e.entity_type, i.property_key, i.summary, i.created_at,
           i.patrol_status, i.review_note, i.is_current
    from infobox_edits i
    join entities e on e.pcid = i.pcid
    where i.created_by = auth.uid()
    union all
    select 'brand', b.id, b.pcid, e.slug, e.name, e.entity_type, b.action || ':' || b.brand_display, b.summary,
           b.created_at, b.patrol_status, b.review_note, b.is_current
    from brand_edits b
    join entities e on e.pcid = b.pcid
    where b.created_by = auth.uid()
    union all
    select 'new_page', c.pcid, c.pcid, e.slug, e.name, e.entity_type, null, null, c.created_at,
           c.patrol_status, null, true
    from community_pages c
    join entities e on e.pcid = c.pcid
    where c.created_by = auth.uid()
  ) t
  where auth.uid() is not null
  order by 9 desc
  limit least(greatest(p_limit, 1), 500)
$$;


ALTER FUNCTION public.my_contributions(p_limit integer) OWNER TO postgres;

--
-- Name: my_public_handle(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.my_public_handle() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select handle from contributor_profiles where user_id = auth.uid()
$$;


ALTER FUNCTION public.my_public_handle() OWNER TO postgres;

--
-- Name: network_compare(bigint[], boolean, bigint[], integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.network_compare(p_pcids bigint[], p_include_community boolean DEFAULT false, p_members bigint[] DEFAULT NULL::bigint[], p_limit integer DEFAULT 30, p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
declare
  v_ids bigint[];
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_members bigint[];
  v_result jsonb;
begin
  select coalesce(array_agg(p order by p), '{}') into v_ids from (select distinct p from unnest(p_pcids) p where p is not null) d;
  if coalesce(array_length(v_ids, 1), 0) < 2 or array_length(v_ids, 1) > 4 then
    return null;
  end if;
  if p_members is not null then
    select array_agg(m order by m) into v_members from (select distinct m from unnest(p_members) m) d;
  end if;

  with src as (select unnest(v_ids) as pcid),
  raw as (
    select s.pcid as src, e.id, e.subject, e.predicate, e.object, e.grp, e.evidence_level, e.source_agency,
           e.source_doc_id, e.direct, e.community, e.basis,
           case when e.subject = s.pcid then e.object else e.subject end as other,
           (e.subject = s.pcid) as outgoing
    from src s
    cross join lateral network_edges(s.pcid, p_include_community) e
  ),
  between_ as (
    select distinct on (id) id, subject, predicate, object, grp, evidence_level, source_agency, source_doc_id, direct, community, basis
    from raw where other = any (v_ids) order by id
  ),
  others as (select * from raw where not (other = any (v_ids))),
  grouped as (
    select o.other,
           array_agg(distinct o.src order by o.src) as members,
           (array_agg(o.grp order by case o.grp when 'classification' then 1 when 'composition' then 2 when 'use' then 3
                                                when 'safety' then 4 when 'interaction' then 5 when 'lists' then 6 else 7 end))[1] as grp
    from others o group by o.other
  ),
  sets as (
    select members, count(*)::int as n from grouped group by members
  ),
  set_groups as (
    select members, jsonb_object_agg(grp, n) as groups
    from (select members, grp, count(*)::int n from grouped group by members, grp) x group by members
  ),
  ranked as (
    select g.*, row_number() over (
             partition by g.members
             order by case g.grp when 'classification' then 1 when 'composition' then 2 when 'use' then 3
                                 when 'safety' then 4 when 'interaction' then 5 when 'lists' then 6 else 7 end,
                      lower(e.name), g.other) as rn
    from grouped g join entities e on e.pcid = g.other
  ),
  page as (
    select * from ranked
    where case when v_members is null then rn <= v_limit
               else members = v_members and rn > v_offset and rn <= v_offset + v_limit end
  ),
  node_ids as (select unnest(v_ids) as pcid union select other from page),
  node_rows as (
    select e.pcid, e.slug, e.name, e.entity_type, dc.class_type, m.term_type
    from node_ids n join entities e on e.pcid = n.pcid
    left join drug_classes dc on dc.pcid = e.pcid
    left join moieties m on m.pcid = e.pcid
  )
  select jsonb_build_object(
    'pcids', to_jsonb(v_ids),
    'entities', coalesce((select jsonb_agg(to_jsonb(n) order by array_position(v_ids, n.pcid)) from node_rows n where n.pcid = any (v_ids)), '[]'::jsonb),
    'between', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'subject', subject, 'predicate', predicate, 'object', object, 'group', grp,
        'evidence_level', evidence_level, 'source_agency', source_agency, 'source_doc_id', source_doc_id,
        'direct', direct, 'community', community, 'basis', basis) order by id) from between_), '[]'::jsonb),
    'sets', coalesce((select jsonb_agg(jsonb_build_object(
        'members', to_jsonb(s.members), 'count', s.n, 'groups', coalesce(sg.groups, '{}'::jsonb))
        order by cardinality(s.members) desc, s.members) from sets s left join set_groups sg on sg.members = s.members), '[]'::jsonb),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'members', to_jsonb(p.members), 'group', p.grp, 'rn', p.rn,
        'node', (select to_jsonb(n) from node_rows n where n.pcid = p.other),
        'links', (select jsonb_agg(jsonb_build_object(
            'src', o.src, 'outgoing', o.outgoing,
            'edge', jsonb_build_object(
              'id', o.id, 'subject', o.subject, 'predicate', o.predicate, 'object', o.object, 'group', o.grp,
              'evidence_level', o.evidence_level, 'source_agency', o.source_agency, 'source_doc_id', o.source_doc_id,
              'direct', o.direct, 'community', o.community, 'basis', o.basis)) order by o.src, o.id)
          from others o where o.other = p.other))
        order by cardinality(p.members) desc, p.members, p.rn) from page p), '[]'::jsonb),
    'offset', v_offset,
    'limit', v_limit
  ) into v_result;

  return v_result;
end
$$;


ALTER FUNCTION public.network_compare(p_pcids bigint[], p_include_community boolean, p_members bigint[], p_limit integer, p_offset integer) OWNER TO postgres;

--
-- Name: network_edge_evidence(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.network_edge_evidence(p_edge_id text) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $_$
declare
  v_kind text := split_part(coalesce(p_edge_id, ''), ':', 1);
  v_a text := split_part(coalesce(p_edge_id, ''), ':', 2);
  v_b text := split_part(coalesce(p_edge_id, ''), ':', 3);
  v_out jsonb;
begin
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
      'object_label', s.object_label, 'updated_at', s.updated_at,
      'source', (
        select jsonb_strip_nulls(jsonb_build_object(
          'name', ds.name, 'url', ds.url, 'license', ds.license,
          'record_label', case when fa.appl_no is not null then fa.application_type || ' ' || regexp_replace(fa.appl_no, '^[A-Za-z]+', '') end,
          'record_sponsor', fa.sponsor_name,
          'record_url', case when fa.appl_no is not null
            then 'https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=' || regexp_replace(fa.appl_no, '^[A-Za-z]+', '') end))
        from (select 1) one
        left join fda_applications fa on s.source_doc_id like 'Drugs@FDA appl %'
                                     and fa.appl_no = substr(s.source_doc_id, length('Drugs@FDA appl ') + 1)
        left join data_sources ds on ds.source_key = case
          when s.source_doc_id like 'Drugs@FDA appl %' then 'drugsfda'
          when s.source_agency = 'FDA' then 'fda'
          when s.source_agency = 'Pharmacy Commons' then 'pharmacycommons' end))
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
$_$;


ALTER FUNCTION public.network_edge_evidence(p_edge_id text) OWNER TO postgres;

--
-- Name: network_edges(bigint, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.network_edges(p_pcid bigint, p_include_community boolean DEFAULT false) RETURNS TABLE(id text, subject bigint, predicate text, object bigint, grp text, evidence_level text, source_agency text, source_doc_id text, direct boolean, community boolean, basis text)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select distinct on (raw.id) raw.id, raw.subject, raw.predicate, raw.object, raw.grp,
         raw.evidence_level, raw.source_agency, raw.source_doc_id, raw.direct, raw.community, raw.basis
  from (
    select 'cm:' || cm.class_pcid || ':' || cm.member_pcid as id,
           cm.member_pcid as subject, 'member_of'::text as predicate, cm.class_pcid as object,
           'classification'::text as grp,
           null::text as evidence_level, cm.source_system as source_agency, null::text as source_doc_id,
           cm.is_direct as direct, false as community, cm.match_basis as basis
    from class_members cm where cm.member_pcid = p_pcid
    union all
    select 'cm:' || cm.class_pcid || ':' || cm.member_pcid,
           cm.member_pcid, 'member_of', cm.class_pcid, 'classification',
           null, cm.source_system, null, cm.is_direct, false, cm.match_basis
    from class_members cm where cm.class_pcid = p_pcid
    union all
    select 'sc:' || dc.pcid || ':' || dc.parent_pcid,
           dc.pcid, 'subclass_of', dc.parent_pcid, 'classification',
           null, dc.source_system, null, true, false, 'class hierarchy'
    from drug_classes dc where dc.pcid = p_pcid and dc.parent_pcid is not null
    union all
    select 'sc:' || dc.pcid || ':' || dc.parent_pcid,
           dc.pcid, 'subclass_of', dc.parent_pcid, 'classification',
           null, dc.source_system, null, true, false, 'class hierarchy'
    from drug_classes dc where dc.parent_pcid = p_pcid
    union all
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
    select 'li:' || li.list_pcid || ':' || li.member_pcid,
           li.member_pcid, 'on_list'::text, li.list_pcid, 'lists'::text,
           null::text, null::text, null::text, true, false, l.kind || ' list'
    from list_items li join lists l on l.pcid = li.list_pcid
    where li.member_pcid = p_pcid and l.published
    union all
    select 'li:' || li.list_pcid || ':' || li.member_pcid,
           li.member_pcid, 'on_list', li.list_pcid, 'lists',
           null, null, null, true, false, l.kind || ' list'
    from list_items li join lists l on l.pcid = li.list_pcid
    where li.list_pcid = p_pcid and l.published and li.member_pcid is not null
    union all
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
  ) raw
  order by raw.id
$$;


ALTER FUNCTION public.network_edges(p_pcid bigint, p_include_community boolean) OWNER TO postgres;

--
-- Name: network_hierarchy(bigint[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.network_hierarchy(p_pcids bigint[]) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
declare
  v_ids bigint[];
  v_result jsonb;
begin
  select coalesce(array_agg(p order by p), '{}') into v_ids
  from (select distinct p from unnest(p_pcids) p where p is not null) d;
  if coalesce(array_length(v_ids, 1), 0) < 1 or array_length(v_ids, 1) > 4 then
    return null;
  end if;

  with recursive anchors as (
    select cm.member_pcid as concept, cm.class_pcid as cls
    from class_members cm
    where cm.member_pcid = any (v_ids) and cm.is_direct
    union
    select dc.pcid, dc.pcid from drug_classes dc where dc.pcid = any (v_ids)
  ),
  chain(concept, cls) as (
    select concept, cls from anchors
    union
    select ch.concept, dc.parent_pcid
    from chain ch join drug_classes dc on dc.pcid = ch.cls
    where dc.parent_pcid is not null
  ),
  held as (
    select cls, array_agg(distinct concept order by concept) as members from chain group by cls
  ),
  nodes as (
    select dc.pcid, e.slug, e.name, coalesce(dc.class_type, 'other') as class_type,
           dc.parent_pcid, h.members
    from held h
    join drug_classes dc on dc.pcid = h.cls
    join entities e on e.pcid = dc.pcid
  ),
  flagged as (
    select n.*,
           (cardinality(n.members) >= 2
            and not exists (select 1 from nodes c where c.parent_pcid = n.pcid and c.members = n.members)) as meeting
    from nodes n
  ),
  ent as (
    select e.pcid, e.slug, e.name, e.entity_type, dc.class_type, m.term_type
    from entities e
    left join drug_classes dc on dc.pcid = e.pcid
    left join moieties m on m.pcid = e.pcid
    where e.pcid = any (v_ids)
  )
  select jsonb_build_object(
    'pcids', to_jsonb(v_ids),
    'entities', coalesce((select jsonb_agg(to_jsonb(x) order by array_position(v_ids, x.pcid)) from ent x), '[]'::jsonb),
    'anchors', coalesce((select jsonb_agg(jsonb_build_object('concept', a.concept, 'class', a.cls) order by a.concept, a.cls) from anchors a), '[]'::jsonb),
    'nodes', coalesce((select jsonb_agg(jsonb_build_object(
        'pcid', f.pcid, 'slug', f.slug, 'name', f.name, 'class_type', f.class_type,
        'parent', f.parent_pcid, 'members', to_jsonb(f.members), 'meeting', f.meeting)
        order by f.class_type, f.name) from flagged f), '[]'::jsonb)
  ) into v_result;

  return v_result;
end
$$;


ALTER FUNCTION public.network_hierarchy(p_pcids bigint[]) OWNER TO postgres;

--
-- Name: network_neighborhood(bigint, text[], boolean, integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.network_neighborhood(p_pcid bigint, p_groups text[] DEFAULT NULL::text[], p_include_community boolean DEFAULT false, p_limit integer DEFAULT 40, p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  with dedup as (select * from network_edges(p_pcid, p_include_community)),
  counts as (
    select grp, count(*)::int n from dedup group by grp
  ),
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
    select e.pcid, e.slug, e.name, e.entity_type, dc.class_type, m.term_type
    from ids join entities e on e.pcid = ids.pcid
    left join drug_classes dc on dc.pcid = e.pcid
    left join moieties m on m.pcid = e.pcid
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


ALTER FUNCTION public.network_neighborhood(p_pcid bigint, p_groups text[], p_include_community boolean, p_limit integer, p_offset integer) OWNER TO postgres;

--
-- Name: network_predicate_group(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.network_predicate_group(p text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select case p
    when 'member_of'           then 'classification'
    when 'has_member'          then 'classification'
    when 'subclass_of'         then 'classification'
    when 'has_component'       then 'composition'
    when 'has_formulation'     then 'composition'
    when 'treats'              then 'use'
    when 'prevents'            then 'use'
    when 'has_prevention'      then 'use'
    when 'has_diagnosis'       then 'use'
    when 'has_symptom'         then 'use'
    when 'has_side_effect'     then 'safety'
    when 'has_warning'         then 'safety'
    when 'has_contraindication' then 'safety'
    when 'contraindicated_with' then 'safety'
    when 'causes'              then 'safety'
    when 'has_risk_factor'     then 'safety'
    when 'has_lower_risk_than' then 'safety'
    when 'is_hazardous'        then 'safety'
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
    when 'on_list'             then 'lists'
    when 'derived_from'        then 'lineage'
    else null
  end
$$;


ALTER FUNCTION public.network_predicate_group(p text) OWNER TO postgres;

--
-- Name: network_relations(bigint, text[], boolean, text, integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.network_relations(p_pcid bigint, p_groups text[] DEFAULT NULL::text[], p_include_community boolean DEFAULT false, p_query text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
  v_result jsonb;
begin
  with dedup as (select * from network_edges(p_pcid, p_include_community)),
  counts as (select grp, count(*)::int n from dedup group by grp),
  rows_ as (
    select d.*, o.pcid as other_pcid, o.slug as other_slug, o.name as other_name,
           o.entity_type as other_type, dc.class_type as other_class_type, m.term_type as other_term_type,
           (d.subject = p_pcid) as outgoing
    from dedup d
    join entities o on o.pcid = case when d.subject = p_pcid then d.object else d.subject end
    left join drug_classes dc on dc.pcid = o.pcid
    left join moieties m on m.pcid = o.pcid
    where (p_groups is null or d.grp = any (p_groups))
      and (v_q is null or o.name ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
  ),
  picked as (
    select r.*, row_number() over (order by lower(r.other_name), r.id) as rn from rows_ r
  ),
  page as (select * from picked where rn > v_offset and rn <= v_offset + v_limit)
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'edge', jsonb_build_object(
          'id', id, 'subject', subject, 'predicate', predicate, 'object', object,
          'group', grp, 'evidence_level', evidence_level, 'source_agency', source_agency,
          'source_doc_id', source_doc_id, 'direct', direct, 'community', community, 'basis', basis),
        'node', jsonb_build_object(
          'pcid', other_pcid, 'slug', other_slug, 'name', other_name, 'entity_type', other_type,
          'class_type', other_class_type, 'term_type', other_term_type),
        'outgoing', outgoing) order by rn) from page), '[]'::jsonb),
    'group_counts', coalesce((select jsonb_object_agg(grp, n) from counts), '{}'::jsonb),
    'total', (select count(*) from picked),
    'offset', v_offset,
    'limit', v_limit
  ) into v_result;
  return v_result;
end
$$;


ALTER FUNCTION public.network_relations(p_pcid bigint, p_groups text[], p_include_community boolean, p_query text, p_limit integer, p_offset integer) OWNER TO postgres;

--
-- Name: new_pages_queue(integer, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.new_pages_queue(p_limit integer DEFAULT 100, p_unpatrolled_only boolean DEFAULT true) RETURNS TABLE(pcid bigint, slug text, name text, entity_type text, created_at timestamp with time zone, patrol_status text, handle text, credential text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select c.pcid, e.slug, e.name, e.entity_type, c.created_at, c.patrol_status,
         coalesce(cp.handle, 'maintainer'),
         case when coalesce(cp.display_credential, true)
              then pc_credential_badge(pv.credential, pv.primary_taxonomy) end
  from community_pages c
  join entities e on e.pcid = c.pcid
  left join contributor_profiles cp on cp.user_id = c.created_by
  left join provider_verifications pv on pv.user_id = c.created_by
  where not p_unpatrolled_only or c.patrol_status = 'unpatrolled'
  order by c.created_at desc
  limit least(greatest(p_limit, 1), 500)
$$;


ALTER FUNCTION public.new_pages_queue(p_limit integer, p_unpatrolled_only boolean) OWNER TO postgres;

--
-- Name: norm_ingredient(text, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.norm_ingredient(raw text, strip_all boolean DEFAULT false) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $_$
declare
  s text := upper(trim(raw));
  salt text := '\s+(HYDROCHLORIDE|HCL|HYDROBROMIDE|DIHYDROCHLORIDE|SULFATE|SULPHATE|BISULFATE|MALEATE|PHOSPHATE|SODIUM|DISODIUM|POTASSIUM|CALCIUM|MAGNESIUM|ZINC|CITRATE|TARTRATE|BITARTRATE|SUCCINATE|MESYLATE|DIMESYLATE|FUMARATE|HEMIFUMARATE|ACETATE|BESYLATE|BENZOATE|GLUCONATE|LACTATE|NITRATE|OXALATE|PALMITATE|PAMOATE|DECANOATE|ENANTHATE|VALERATE|PROPIONATE|DIPROPIONATE|LAUROXIL|TOSYLATE|XINAFOATE|BROMIDE|CHLORIDE|IODIDE|ANHYDROUS|MONOHYDRATE|DIHYDRATE|TRIHYDRATE|HEMIHYDRATE|SESQUIHYDRATE|HEPTAHYDRATE|HYDRATE|MONOSODIUM|TROMETHAMINE|MEGLUMINE|LYSINE|ARGININE|CYPIONATE|HYCLATE|ESTOLATE|STEARATE|ETHYLSUCCINATE|FUROATE|PIVALATE|UNDECANOATE|RECOMBINANT|SYNTHETIC|ETEXILATE|MEDOXOMIL|AXETIL|PIVOXIL|PROXETIL|ALAFENAMIDE|DISOPROXIL|MARBOXIL)$';
  i int;
begin
  if s is null then return null; end if;
  -- "X/X TRIHYDRATE" -> "X"
  if position('/' in s) > 0 and split_part(s, '/', 2) like split_part(s, '/', 1) || '%' then
    s := split_part(s, '/', 1);
  end if;
  s := regexp_replace(s, '-[A-Z]{4}$', '');            -- biosimilar suffix
  for i in 1..3 loop
    exit when not (s ~ salt);
    -- stop at the first salt unless asked to strip everything (esters like ETEXILATE are only
    -- removed when strip_all = true, so "DABIGATRAN ETEXILATE" can still match first)
    if not strip_all and i > 1 and s ~ '\s+(ETEXILATE|MEDOXOMIL|AXETIL|PIVOXIL|PROXETIL|ALAFENAMIDE|DISOPROXIL|MARBOXIL)$' then exit; end if;
    s := regexp_replace(s, salt, '');
  end loop;
  return trim(s);
end $_$;


ALTER FUNCTION public.norm_ingredient(raw text, strip_all boolean) OWNER TO postgres;

--
-- Name: osa_distance(text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.osa_distance(a text, b text) RETURNS integer
    LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
declare
  la int := length(a);
  lb int := length(b);
  w  int := length(b) + 1;
  d  int[];
  i  int; j int; cost int; v int;
begin
  if la = 0 then return lb; end if;
  if lb = 0 then return la; end if;
  for i in 0..la loop d[i * w + 1] := i; end loop;
  for j in 0..lb loop d[j + 1] := j; end loop;
  for i in 1..la loop
    for j in 1..lb loop
      cost := case when substr(a, i, 1) = substr(b, j, 1) then 0 else 1 end;
      v := least(d[(i - 1) * w + j + 1] + 1,
                 d[i * w + (j - 1) + 1] + 1,
                 d[(i - 1) * w + (j - 1) + 1] + cost);
      if i > 1 and j > 1
         and substr(a, i, 1) = substr(b, j - 1, 1)
         and substr(a, i - 1, 1) = substr(b, j, 1) then
        v := least(v, d[(i - 2) * w + (j - 2) + 1] + 1);
      end if;
      d[i * w + j + 1] := v;
    end loop;
  end loop;
  return d[la * w + lb + 1];
end $$;


ALTER FUNCTION public.osa_distance(a text, b text) OWNER TO postgres;

--
-- Name: page_abbreviations(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.page_abbreviations(p_name text) RETURNS TABLE(term text)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $_$
  with n as (select trim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', ' ', 'g')) as k),
  banned as (
    select lower(t.term) as k from dictionary_terms t where t.source_tjc_flag
    union
    select lower(t.term) from list_items li join lists l on l.pcid = li.list_pcid
      join dictionary_terms t on t.id = li.term_id
    where l.slug = 'joint-commission-do-not-use'),
  hits as (
    select t.term, count(*) as n
    from dictionary_terms t, n
    where n.k <> ''
      and t.kind = 'Abbreviation'
      and t.term ~ '^[A-Za-z0-9][A-Za-z0-9/&+-]{0,11}$'
      and lower(t.term) <> n.k
      and trim(regexp_replace(lower(t.definition), '[^a-z0-9]+', ' ', 'g')) = n.k
      and lower(t.term) not in (select k from banned)
    group by t.term),
  one as (
    select distinct on (lower(term)) term, n from hits
    order by lower(term), n desc, (term ~ '^[A-Z]') desc, term)
  select term from one order by n desc, term limit 3 $_$;


ALTER FUNCTION public.page_abbreviations(p_name text) OWNER TO postgres;

--
-- Name: page_history(bigint, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.page_history(p_pcid bigint, p_limit integer DEFAULT 50) RETURNS TABLE(id bigint, created_at timestamp with time zone, handle text, credential text, summary text, size_delta integer, kind text, patrol_status text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select r.id, r.created_at,
         coalesce(cp.handle, 'maintainer'),
         case when coalesce(cp.display_credential, true)
              then pc_credential_badge(pv.credential, pv.primary_taxonomy) end,
         r.summary, r.size_delta, r.kind, r.patrol_status
  from page_revisions r
  left join contributor_profiles cp on cp.user_id = r.created_by
  left join provider_verifications pv on pv.user_id = r.created_by
  where r.pcid = p_pcid
  order by r.id desc
  limit least(greatest(p_limit, 1), 500)
$$;


ALTER FUNCTION public.page_history(p_pcid bigint, p_limit integer) OWNER TO postgres;

--
-- Name: page_source_registry(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.page_source_registry() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'version', 1,
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', name, 'label', label, 'grammar', grammar, 'region', region, 'owner_section', owner_section,
        'page_types', to_jsonb(page_types), 'citation', citation, 'help', help, 'example', example,
        'hints', to_jsonb(hints), 'grammar_spec', grammar_spec, 'enabled', enabled, 'sort_order', sort_order)
        order by sort_order, name)
      from block_schemas), '[]'::jsonb),
    'embeds', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'label', label, 'region', region,
        'page_types', to_jsonb(page_types), 'help', help) order by sort_order, name)
      from section_embeds), '[]'::jsonb),
    'templates', coalesce((
      select jsonb_agg(jsonb_build_object('page_type', page_type, 'rail', to_jsonb(rail), 'main', main) order by sort_order, page_type)
      from page_templates), '[]'::jsonb)
  )
$$;


ALTER FUNCTION public.page_source_registry() OWNER TO postgres;

--
-- Name: FUNCTION page_source_registry(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.page_source_registry() IS 'Page-source registry for the editor and publish-page (phase 16a). Same shape as src/pageSource/registry.json.';


--
-- Name: patrol_brand_edit(bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.patrol_brand_edit(p_edit_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not has_role('patroller') then raise exception 'not_patroller' using errcode = '42501'; end if;
  update brand_edits
  set patrol_status = 'patrolled', patrolled_by = auth.uid(), patrolled_at = now()
  where id = p_edit_id and patrol_status = 'unpatrolled'
    and (created_by is distinct from auth.uid() or has_role('owner'));
  if not found then raise exception 'cannot_patrol'; end if;
end $$;


ALTER FUNCTION public.patrol_brand_edit(p_edit_id bigint) OWNER TO postgres;

--
-- Name: patrol_infobox_edit(bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.patrol_infobox_edit(p_edit_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not has_role('patroller') then raise exception 'not_patroller' using errcode = '42501'; end if;
  update infobox_edits
  set patrol_status = 'patrolled', patrolled_by = auth.uid(), patrolled_at = now()
  where id = p_edit_id and patrol_status = 'unpatrolled'
    and (created_by is distinct from auth.uid() or has_role('owner'));
  if not found then raise exception 'cannot_patrol'; end if;
end $$;


ALTER FUNCTION public.patrol_infobox_edit(p_edit_id bigint) OWNER TO postgres;

--
-- Name: patrol_new_page(bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.patrol_new_page(p_pcid bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not has_role('patroller') then raise exception 'not_patroller' using errcode = '42501'; end if;
  update community_pages
  set patrol_status = 'patrolled', patrolled_by = auth.uid(), patrolled_at = now()
  where pcid = p_pcid and patrol_status = 'unpatrolled'
    and (created_by is distinct from auth.uid() or has_role('owner'));
  if not found then raise exception 'cannot_patrol'; end if;
end $$;


ALTER FUNCTION public.patrol_new_page(p_pcid bigint) OWNER TO postgres;

--
-- Name: patrol_revision(bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.patrol_revision(p_revision_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not has_role('patroller') then raise exception 'not_patroller' using errcode = '42501'; end if;
  update page_revisions
  set patrol_status = 'patrolled', patrolled_by = auth.uid(), patrolled_at = now()
  where id = p_revision_id and patrol_status = 'unpatrolled'
    and (created_by is distinct from auth.uid() or has_role('owner'));
  if not found then raise exception 'cannot_patrol'; end if;
end $$;


ALTER FUNCTION public.patrol_revision(p_revision_id bigint) OWNER TO postgres;

--
-- Name: pc_brand_key(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.pc_brand_key(p text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select upper(trim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')))
$$;


ALTER FUNCTION public.pc_brand_key(p text) OWNER TO postgres;

--
-- Name: pc_cite_text(jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.pc_cite_text(p_citations jsonb) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select coalesce(string_agg('[@' || (c ->> 'key') || ']', '' order by o), '')
  from jsonb_array_elements(coalesce(p_citations, '[]'::jsonb)) with ordinality as x(c, o)
$$;


ALTER FUNCTION public.pc_cite_text(p_citations jsonb) OWNER TO postgres;

--
-- Name: pc_credential_badge(text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.pc_credential_badge(p_credential text, p_taxonomy text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select coalesce(
    case upper(regexp_replace(split_part(regexp_replace(coalesce(p_credential, ''), '[;/]', ',', 'g'), ',', 1), '[^A-Za-z]', '', 'g'))
      when 'PHARMD' then 'PharmD'  when 'RPH' then 'RPh'      when 'BSPHARM' then 'RPh'
      when 'MD' then 'MD'          when 'DO' then 'DO'        when 'MBBS' then 'MBBS'
      when 'NP' then 'NP'          when 'FNP' then 'NP'       when 'APRN' then 'APRN'
      when 'CRNP' then 'NP'        when 'FNPC' then 'NP'      when 'DNP' then 'DNP'
      when 'PA' then 'PA'          when 'PAC' then 'PA'       when 'RN' then 'RN'
      when 'DDS' then 'DDS'        when 'DMD' then 'DMD'      when 'DPM' then 'DPM'
      when 'OD' then 'OD'          when 'CPHT' then 'CPhT'    when 'PHD' then 'PhD'
      else null
    end,
    nullif(trim(p_taxonomy), ''))
$$;


ALTER FUNCTION public.pc_credential_badge(p_credential text, p_taxonomy text) OWNER TO postgres;

--
-- Name: pc_has_role(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.pc_has_role(p_user uuid, p_role text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from user_roles where user_id = p_user and (role = p_role or role = 'admin'))
$$;


ALTER FUNCTION public.pc_has_role(p_user uuid, p_role text) OWNER TO postgres;

--
-- Name: pc_is_blocked(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.pc_is_blocked() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from contributor_blocks
                 where user_id = auth.uid() and (expires_at is null or expires_at > now()))
$$;


ALTER FUNCTION public.pc_is_blocked() OWNER TO postgres;

--
-- Name: pc_is_verified(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.pc_is_verified(p_user uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from provider_verifications where user_id = p_user and status = 'active')
     and not exists (select 1 from contributor_blocks
                     where user_id = p_user and (expires_at is null or expires_at > now()))
$$;


ALTER FUNCTION public.pc_is_verified(p_user uuid) OWNER TO postgres;

--
-- Name: pc_slugify(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.pc_slugify(p text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select trim(both '-' from regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g'))
$$;


ALTER FUNCTION public.pc_slugify(p text) OWNER TO postgres;

--
-- Name: post_blog_comment(text, text, bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.post_blog_comment(p_slug text, p_body text, p_parent_id bigint DEFAULT NULL::bigint) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_body text := trim(coalesce(p_body, ''));
  v_patroller boolean := has_role('patroller');
  v_parent blog_comments%rowtype;
  v_id bigint;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if pc_is_blocked() then raise exception 'blocked' using errcode = '42501'; end if;
  if not exists (select 1 from contributor_profiles where user_id = auth.uid()) then
    raise exception 'handle_required';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{0,119}$' then raise exception 'no_such_post'; end if;
  if v_body = '' then raise exception 'empty'; end if;
  if length(v_body) > 4000 then raise exception 'too_long'; end if;
  if not v_patroller and (
       (select count(*) from blog_comments
         where author_id = auth.uid() and created_at > now() - interval '10 minutes') >= 5
    or (select count(*) from blog_comments
         where author_id = auth.uid() and created_at > now() - interval '1 day') >= 30) then
    raise exception 'rate_limited';
  end if;
  if p_parent_id is not null then
    select * into v_parent from blog_comments where id = p_parent_id;
    if not found or v_parent.post_slug <> p_slug or v_parent.state <> 'visible' then
      raise exception 'no_such_comment';
    end if;
    if v_parent.parent_id is not null then raise exception 'reply_depth'; end if;
  end if;

  insert into blog_comments (post_slug, parent_id, author_id, body, patrolled_by, patrolled_at)
  values (p_slug, p_parent_id, auth.uid(), v_body,
          case when v_patroller then auth.uid() end,
          case when v_patroller then now() end)
  returning id into v_id;
  return v_id;
end $_$;


ALTER FUNCTION public.post_blog_comment(p_slug text, p_body text, p_parent_id bigint) OWNER TO postgres;

--
-- Name: publish_page(uuid, bigint, bigint, bigint, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.publish_page(p_user uuid, p_pcid bigint, p_current_revision_id bigint, p_parent_revision_id bigint, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_cur       page_content%rowtype;
  v_patroller boolean := pc_has_role(p_user, 'patroller');
  v_held      boolean := false;
  v_rev       bigint;
  v_old_len   integer := 0;
  v_len       integer;
  v_summary   text := trim(coalesce(p_payload ->> 'summary', ''));
  v_kind      text := coalesce(p_payload ->> 'kind', 'edit');
  c           jsonb;
  n           integer := 0;
begin
  if p_user is null or not pc_is_verified(p_user) then raise exception 'not_verified' using errcode = '42501'; end if;
  if not exists (select 1 from contributor_profiles where user_id = p_user) then raise exception 'handle_required'; end if;
  if not exists (select 1 from entities where pcid = p_pcid) then raise exception 'no_such_page'; end if;
  if v_summary = '' then raise exception 'summary_required'; end if;
  if length(v_summary) > 500 then raise exception 'summary_too_long'; end if;
  if v_kind not in ('edit', 'create', 'revert') then raise exception 'bad_kind'; end if;
  if p_payload -> 'model' is null or p_payload ->> 'source_md' is null then raise exception 'bad_payload'; end if;
  v_len := length(p_payload ->> 'source_md');
  if v_len > 200000 then raise exception 'too_long'; end if;
  if not v_patroller and (select count(*) from page_revisions
       where created_by = p_user and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'rate_limited';
  end if;
 
  select * into v_cur from page_content where pcid = p_pcid for update;
  if found then
    if v_cur.protection = 'patrollers' and not v_patroller then raise exception 'protected'; end if;
    v_held := v_cur.protection = 'reviewed' and not v_patroller;
    if v_cur.current_revision_id is distinct from p_current_revision_id then
      -- Someone published between publish-page's merge and now; it merges again.
      raise exception 'edit_conflict' using detail = coalesce(v_cur.current_revision_id::text, '');
    end if;
    v_old_len := coalesce((select length(coalesce(source_md, description || body_md)) from page_revisions
                           where id = v_cur.current_revision_id), 0);
  else
    if p_current_revision_id is not null then raise exception 'edit_conflict'; end if;
    insert into page_content (pcid) values (p_pcid);
  end if;
 
  -- Sources: insert new ones; fill in metadata for ones that weren't resolved before.
  for c in select * from jsonb_array_elements(coalesce(p_payload -> 'citations', '[]'::jsonb))
  loop
    insert into citation_sources (key, kind, title, authors, container, year, volume, issue, pages, doi, pmid, setid, url,
                                  resolved, retrieved_at)
    values (c ->> 'key', c ->> 'kind', c ->> 'title', c ->> 'authors', c ->> 'container', (c ->> 'year')::integer,
            c ->> 'volume', c ->> 'issue', c ->> 'pages', c ->> 'doi', c ->> 'pmid', c ->> 'setid', c ->> 'url',
            coalesce((c ->> 'resolved')::boolean, false), case when (c ->> 'resolved')::boolean then now() end)
    on conflict (key) do update
      set title = excluded.title, authors = excluded.authors, container = excluded.container, year = excluded.year,
          volume = excluded.volume, issue = excluded.issue, pages = excluded.pages, doi = excluded.doi,
          pmid = excluded.pmid, setid = excluded.setid, url = excluded.url, resolved = true, retrieved_at = now()
      where not citation_sources.resolved and excluded.resolved;
  end loop;
 
  insert into page_revisions (pcid, parent_id, description, body_md, summary, size_delta, kind, created_by,
                              patrol_status, patrolled_by, patrolled_at,
                              format, model, source_md, extracted, changed_sections)
  values (p_pcid, coalesce(p_current_revision_id, p_parent_revision_id),
          coalesce(p_payload ->> 'description', ''), coalesce(p_payload ->> 'body_md', ''),
          v_summary, v_len - v_old_len,
          case when p_current_revision_id is null and v_kind = 'edit' then 'create' else v_kind end,
          p_user,
          case when v_held then 'pending' when v_patroller then 'patrolled' else 'unpatrolled' end,
          case when v_patroller then p_user end,
          case when v_patroller then now() end,
          2, p_payload -> 'model', p_payload ->> 'source_md', coalesce(p_payload -> 'extracted', '{}'::jsonb),
          coalesce(array(select jsonb_array_elements_text(p_payload -> 'changed_sections')), '{}'))
  returning id into v_rev;
 
  for c in select * from jsonb_array_elements(coalesce(p_payload -> 'citations', '[]'::jsonb))
  loop
    n := n + 1;
    insert into page_citations (revision_id, ordinal, ref_key) values (v_rev, n, c ->> 'key');
  end loop;
 
  if not v_held then
    perform apply_page_revision(v_rev, p_user);
  end if;
  return jsonb_build_object('revision_id', v_rev, 'status', case when v_held then 'pending' else 'live' end);
end $$;


ALTER FUNCTION public.publish_page(p_user uuid, p_pcid bigint, p_current_revision_id bigint, p_parent_revision_id bigint, p_payload jsonb) OWNER TO postgres;

--
-- Name: rebuild_classes(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rebuild_classes() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare r record; v_pcid bigint; n_claimed int := 0; n_minted int := 0;
begin
  -- ChemOnt ancestor closure (root CHEMONTID:9999999 and kingdoms excluded from classes)
  create temp table co_anc on commit drop as
  with recursive a(term, anc, dist) as (
    select chemont_id, parent_id, 1 from chemont_terms where parent_id is not null
    union all select a.term, t.parent_id, a.dist+1 from a join chemont_terms t on t.chemont_id=a.anc
    where t.parent_id is not null and a.dist < 20)
  select * from a;
  create temp table co_depth on commit drop as
    select t.chemont_id, count(a.anc)::smallint as depth  -- kingdom = 1 (its only ancestor is root)
    from chemont_terms t left join co_anc a on a.term=t.chemont_id group by 1;

  -- 1. Candidate classes --------------------------------------------------
  create temp table cand(system text, code text, ctype text, name text, parent_code text,
                         level smallint, descr text, prio int) on commit drop;
  insert into cand
    select distinct on (class_id) 'DAILYMED', class_id, lower(class_type), class_name, null, null, null,
           case class_type when 'EPC' then 1 when 'MOA' then 2 when 'PE' then 3 else 4 end
    from rxclass_drug where rela_source='DAILYMED' order by class_id, class_type;
  insert into cand
    with recursive u(code) as (
      select distinct class_id from rxclass_drug where rela_source='ATC'
      union select c.parent_class_id from u join rxclass_classes c on c.class_id=u.code and c.rela_source='ATC'
      where c.parent_class_id is not null)
    select 'ATC', c.class_id, 'atc', class_display_name(c.class_name), c.parent_class_id,
           case length(c.class_id) when 1 then 1 when 3 then 2 when 4 then 3 else 4 end, null, 5
    from u join rxclass_classes c on c.class_id=u.code and c.rela_source='ATC';
  insert into cand
    with recursive u(code) as (
      select distinct class_id from rxclass_drug where rela_source='VA'
      union select c.parent_class_id from u join rxclass_classes c on c.class_id=u.code and c.rela_source='VA'
      where c.parent_class_id is not null)
    select 'VA', c.class_id, 'va', class_display_name(c.class_name), c.parent_class_id,
           case when c.parent_class_id is null then 1 else 2 end, null, 6
    from u join rxclass_classes c on c.class_id=u.code and c.rela_source='VA';
  insert into cand
    select 'ChemOnt', t.chemont_id, 'chemont', t.name,
           case when d.depth > 2 then t.parent_id end, (d.depth-1)::smallint, t.definition, 7
    from chemont_terms t join co_depth d using(chemont_id)
    where d.depth >= 2
      and exists(select 1 from chemont_links l where l.chemont_id=t.chemont_id
                 union all select 1 from co_anc a join chemont_links l on l.chemont_id=a.term where a.anc=t.chemont_id limit 1);

  insert into cand
    select 'PharmacyCommons', code, 'curated', name, parent_code,
           (case when parent_code is null then 1 when (select parent_code from class_rules p where p.code=r0.parent_code) is null then 2 else 3 end)::smallint,
           description, 8
    from class_rules r0;

  -- 2. Claim pre-existing untyped classes with the same name (keeps their PCIDs/slugs stable)
  for r in
    select distinct on (d.pcid) d.pcid, c.* from cand c
    join entities e on e.entity_type='class' and lower(e.name)=lower(c.name)
    join drug_classes d on d.pcid=e.pcid and d.source_code is null
    where not exists(select 1 from drug_classes x where x.source_system=c.system and x.source_code=c.code)
    order by d.pcid, c.prio
  loop
    if not exists(select 1 from drug_classes x where x.source_system=r.system and x.source_code=r.code) then
      update drug_classes set class_type=r.ctype, source_system=r.system, source_code=r.code, level=r.level,
             description=coalesce(description, r.descr) where pcid=r.pcid;
      n_claimed := n_claimed + 1;
    end if;
  end loop;

  -- 3. Mint the rest
  for r in select c.* from cand c
           where not exists(select 1 from drug_classes x where x.source_system=c.system and x.source_code=c.code)
           order by c.prio, c.level nulls first, c.code
  loop
    v_pcid := mint_class(r.name, r.ctype, r.system, r.code, r.level);
    update drug_classes set description=r.descr where pcid=v_pcid and r.descr is not null;
    n_minted := n_minted + 1;
  end loop;

  -- 4. Parents
  update drug_classes d set parent_pcid = p.pcid, level = c.level
  from cand c join drug_classes p on p.source_system=c.system and p.source_code=c.parent_code
  where d.source_system=c.system and d.source_code=c.code and d.parent_pcid is distinct from p.pcid;

  -- 5. Memberships (everything except curated is rebuilt from source)
  delete from class_members where source_system <> 'curated';

  insert into class_members(class_pcid, member_pcid, is_direct, source_system, match_basis)
  select distinct d.pcid, rd.pcid, true, rd.rela_source, 'rxcui'
  from rxclass_drug rd join drug_classes d on d.source_system=rd.rela_source and d.source_code=rd.class_id
  join entities me on me.pcid=rd.pcid
  where
    -- VA classes are assigned to products: keep only when a single-ingredient product of this drug is in the class
    (rd.rela_source <> 'VA'
     or exists(select 1 from rxclass_classes vc where vc.class_id=rd.class_id and vc.rela_source='VA'
               and (not vc.members_fetched or vc.fetch_error is not null))
     or exists(select 1 from rxclass_va_products vp where vp.class_id=rd.class_id
               and vp.product ~ ('\m' || regexp_replace(lower(me.name), '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '\M')))
    -- ATC "combinations of ..." codes only when the drug has no single-agent ATC code
    and (rd.rela_source <> 'ATC' or rd.class_name !~* 'combination'
         or not exists(select 1 from rxclass_drug r2 where r2.pcid=rd.pcid and r2.rela_source='ATC' and r2.class_name !~* 'combination'))
  on conflict do nothing;

  insert into class_members(class_pcid, member_pcid, is_direct, source_system, match_basis)
  select d.pcid, e.pcid, true, 'rule', 'name_pattern'
  from class_rules cr
  join drug_classes d on d.source_system='PharmacyCommons' and d.source_code=cr.code
  join entities e on e.entity_type='moiety' and lower(e.name) ~ cr.pattern
                  and (cr.exclude is null or lower(e.name) !~ cr.exclude)
  where cr.pattern is not null and not cr.fallback_only
  on conflict do nothing;

  -- Reviewed assignments (pharmacist-agent review, class_agent_review)
  insert into class_members(class_pcid, member_pcid, is_direct, source_system, match_basis)
  select e.pcid, ar.member_pcid, true, 'agent_review', 'agent_review:' || ar.confidence
  from class_agent_review ar join entities e on e.slug=ar.class_slug and e.entity_type='class'
  on conflict do nothing;

  -- ATC / VA / rule ancestors (inherited)
  insert into class_members(class_pcid, member_pcid, is_direct, source_system, match_basis)
  with recursive up(member, cls) as (
    select m.member_pcid, d.parent_pcid from class_members m join drug_classes d on d.pcid=m.class_pcid
    where m.source_system in ('ATC','VA','rule','agent_review') and d.parent_pcid is not null
    union select up.member, d.parent_pcid from up join drug_classes d on d.pcid=up.cls where d.parent_pcid is not null)
  select distinct cls, member, false, d.source_system, 'hierarchy' from up join drug_classes d on d.pcid=up.cls
  on conflict do nothing;

  -- ChemOnt: most specific linked terms are direct; terms that are ancestors of another linked term are inherited
  create temp table co_inh on commit drop as
    select distinct l2.pcid, a.anc as chemont_id from chemont_links l2 join co_anc a on a.term=l2.chemont_id;
  create index on co_inh(pcid, chemont_id);
  analyze co_inh;
  insert into class_members(class_pcid, member_pcid, is_direct, source_system, match_basis)
  select d.pcid, l.pcid, (i.pcid is null), 'ChemOnt', 'chemont_link'
  from chemont_links l join entities e on e.pcid=l.pcid and e.entity_type='moiety'
  join drug_classes d on d.source_system='ChemOnt' and d.source_code=l.chemont_id
  left join co_inh i on i.pcid=l.pcid and i.chemont_id=l.chemont_id
  on conflict do nothing;

  -- Curated statements already in the knowledge graph
  insert into class_members(class_pcid, member_pcid, is_direct, source_system, match_basis)
  select s.object_pcid, s.subject_pcid, true, 'curated', 'clinical_statement'
  from clinical_statements s join entities o on o.pcid=s.object_pcid and o.entity_type='class'
  join entities su on su.pcid=s.subject_pcid and su.entity_type='moiety'
  where s.predicate='member_of'
  on conflict do nothing;

  -- Name-root inheritance: "X (exception)", "X, (R)-", "X free base", "X hydrochloride" or synonym_of
  create temp table root_map on commit drop as
  select e.pcid child, p.pcid parent
  from entities e join moieties m on m.pcid=e.pcid
  join lateral (select trim(regexp_replace(lower(e.name),
        '(\s*\(exception\)|\s*\(analogs?\)|,?\s*\((r|s|e|z|\+|-|\+/-|rs|r,r|s,s|1r|1s|2r|2s|3r|3s)\)-?|,\s*(cis|trans|d|l|dl)-|\s+(free base|base|mixture|active metabolite|anhydrous|hydrochloride|hcl|dihydrochloride|hydrobromide|sodium|disodium|potassium|calcium|magnesium|sulfate|mesylate|maleate|fumarate|tartrate|citrate|acetate|phosphate|bromide|chloride|succinate|besylate|tosylate|hyclate|monohydrate|dihydrate|hemihydrate))+$', '', 'g')) as root) rt on true
  join entities p on p.entity_type='moiety' and p.pcid<>e.pcid and lower(p.name)=rt.root
  where e.entity_type='moiety' and rt.root<>lower(e.name)
  union
  select m.pcid, m.synonym_of_pcid from moieties m where m.synonym_of_pcid is not null;
  insert into class_members(class_pcid, member_pcid, is_direct, source_system, match_basis)
  select distinct on (cm.class_pcid, rm.child) cm.class_pcid, rm.child, cm.is_direct, cm.source_system,
         'parent:' || rm.parent
  from root_map rm join class_members cm on cm.member_pcid=rm.parent
  where not exists(select 1 from class_members x where x.member_pcid=rm.child and x.source_system not in ('rule','PharmacyCommons'))
    and cm.match_basis <> 'name_pattern_fallback'
  on conflict do nothing;

  -- Fallback rules: only for moieties still in no class at all
  insert into class_members(class_pcid, member_pcid, is_direct, source_system, match_basis)
  select d.pcid, e.pcid, true, 'rule', 'name_pattern_fallback'
  from class_rules cr
  join drug_classes d on d.source_system='PharmacyCommons' and d.source_code=cr.code
  join entities e on e.entity_type='moiety' and lower(e.name) ~ cr.pattern
                  and (cr.exclude is null or lower(e.name) !~ cr.exclude)
  where cr.fallback_only and cr.code <> 'REVIEW' and not exists(select 1 from class_members x where x.member_pcid=e.pcid)
  on conflict do nothing;
  insert into class_members(class_pcid, member_pcid, is_direct, source_system, match_basis)
  select d.pcid, e.pcid, true, 'rule', 'awaiting_review'
  from drug_classes d join entities e on e.entity_type='moiety'
  where d.source_system='PharmacyCommons' and d.source_code='REVIEW'
    and not exists(select 1 from class_members x where x.member_pcid=e.pcid)
  on conflict do nothing;

  update drug_classes d set member_count = coalesce(c.n,0)
  from (select d2.pcid, (select count(*) from class_members m where m.class_pcid=d2.pcid) n from drug_classes d2) c
  where c.pcid=d.pcid and d.member_count is distinct from coalesce(c.n,0);

  return jsonb_build_object('claimed', n_claimed, 'minted', n_minted,
    'classes_with_members', (select count(distinct class_pcid) from class_members),
    'memberships', (select count(*) from class_members),
    'moieties', (select count(*) from entities where entity_type='moiety'),
    'moieties_classified', (select count(distinct member_pcid) from class_members m join entities e on e.pcid=m.member_pcid and e.entity_type='moiety'));
end $_$;


ALTER FUNCTION public.rebuild_classes() OWNER TO postgres;

--
-- Name: refresh_lasa_lists(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.refresh_lasa_lists() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_count integer;
begin
  delete from list_items where list_pcid in (10000047, 10000048);

  with p as (
    select distinct coalesce(v.moiety_pcid, v.pcid) as member, v.name as nm, v.other_name as other
    from lasa_pairs_v v where coalesce(v.moiety_pcid, v.pcid) is not null
  ),
  tm as (
    select distinct coalesce(v.moiety_pcid, v.pcid) as member, v.name as nm
    from lasa_pairs_v v where coalesce(v.moiety_pcid, v.pcid) is not null and v.has_tall_man
  ),
  per_name as (
    select member, nm, string_agg(other, ', ' order by lower(other)) as others from p group by member, nm
  ),
  agg as (
    select n.member,
           (select string_agg(t.nm, '; ' order by lower(t.nm)) from tm t where t.member = n.member) as tall_man,
           string_agg(n.nm || ': ' || n.others, ' · ' order by lower(n.nm)) as note,
           string_agg(n.nm, '; ' order by lower(n.nm)) as names
    from per_name n group by n.member
  ),
  ranked as (
    select a.*, row_number() over (order by lower(e.name), a.member) as pos
    from agg a join entities e on e.pcid = a.member
  )
  insert into list_items (list_pcid, position, member_pcid, source_name, legal_status, note)
  select 10000047, pos, member, names, tall_man, note from ranked;

  insert into list_items (list_pcid, position, member_pcid, source_name, legal_status, note)
  select 10000048, row_number() over (order by i.position), i.member_pcid, i.source_name, i.legal_status, i.note
  from list_items i where i.list_pcid = 10000047 and i.legal_status is not null;

  update lists l set item_count = (select count(*) from list_items i where i.list_pcid = l.pcid), updated_at = now()
  where l.pcid in (10000047, 10000048);

  select item_count into v_count from lists where pcid = 10000047;
  return v_count;
end $$;


ALTER FUNCTION public.refresh_lasa_lists() OWNER TO postgres;

--
-- Name: refresh_page_links(bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.refresh_page_links(p_pcid bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_text text;
begin
  select description || E'\n' || body_md into v_text from page_content where pcid = p_pcid;

  delete from page_links where source_pcid = p_pcid;
  insert into page_links (source_pcid, target_text, target_pcid)
  select p_pcid, t, resolve_page_target(t)
  from (
    select distinct lower(trim(split_part(m[1], '|', 1))) as t
    from regexp_matches(coalesce(v_text, ''), '\[\[([^\[\]\n]{1,200})\]\]', 'g') as m
  ) x
  where t <> '';

  delete from page_property_refs where source_pcid = p_pcid;
  insert into page_property_refs (source_pcid, property_key, target_text, target_pcid)
  select p_pcid, k, tt, case when tt = '' then p_pcid else resolve_page_target(tt) end
  from (
    select distinct lower(m[1]) as k, lower(trim(coalesce(m[2], ''))) as tt
    from regexp_matches(coalesce(v_text, ''), '\{\{([A-Za-z][A-Za-z0-9_]*)(?::([^{}\n]{1,200}))?\}\}', 'g') as m
  ) x
  where exists (select 1 from infobox_properties p where p.key = x.k);
end $$;


ALTER FUNCTION public.refresh_page_links(p_pcid bigint) OWNER TO postgres;

--
-- Name: refresh_rems_lists(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.refresh_rems_lists() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_count integer;
begin
  delete from list_items where list_pcid in (10000049, 10000050, 10000051);

  with prod as (
    select unnest(p.moiety_pcids) as m, p.* from rems_products p where p.moiety_pcids is not null
  ),
  brand_state as (
    select m, brand, bool_or(status = 'Active') as active from prod where brand is not null group by m, brand
  ),
  agg as (
    select m,
           case when bool_or(status = 'Active') then 'Active' else 'Inactive' end as st,
           (select string_agg(distinct rems_program_label(rp.name), '; ')
              from prod x join rems_programs rp using (rems_id) where x.m = prod.m) as programs
    from prod group by m
  ),
  brands as (
    select m,
           string_agg(brand, ', ' order by lower(brand)) filter (where active) as act,
           string_agg(brand, ', ' order by lower(brand)) filter (where not active) as inact
    from brand_state group by m
  ),
  ranked as (
    select a.m, a.st, a.programs,
           nullif(concat_ws(' · ', b.act, case when b.inact is not null then 'Inactive: ' || b.inact end), '') as note,
           row_number() over (order by lower(e.name), a.m) as pos
    from agg a join entities e on e.pcid = a.m left join brands b on b.m = a.m
  )
  insert into list_items (list_pcid, position, member_pcid, source_name, legal_status, note, sources)
  select 10000049, pos, m, programs, st, note, array['FDA REMS@FDA'] from ranked;

  insert into list_items (list_pcid, position, member_pcid, source_name, legal_status, note, sources)
  select case i.legal_status when 'Active' then 10000050 else 10000051 end,
         row_number() over (partition by i.legal_status order by i.position),
         i.member_pcid, i.source_name, i.legal_status, i.note, i.sources
  from list_items i where i.list_pcid = 10000049;

  update lists l set item_count = (select count(*) from list_items i where i.list_pcid = l.pcid), updated_at = now()
  where l.pcid in (10000049, 10000050, 10000051);

  select item_count into v_count from lists where pcid = 10000049;
  return v_count;
end $$;


ALTER FUNCTION public.refresh_rems_lists() OWNER TO postgres;

--
-- Name: reject_revision(bigint, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.reject_revision(p_revision_id bigint, p_note text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not has_role('patroller') then raise exception 'not_patroller' using errcode = '42501'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'note_required'; end if;
  update page_revisions
  set patrol_status = 'rejected', patrolled_by = auth.uid(), patrolled_at = now(), review_note = trim(p_note)
  where id = p_revision_id and patrol_status = 'pending';
  if not found then raise exception 'not_pending'; end if;
end $$;


ALTER FUNCTION public.reject_revision(p_revision_id bigint, p_note text) OWNER TO postgres;

--
-- Name: rems_program_label(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rems_program_label(p_name text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $_$
  select case when t ~* 'rems$|ipledge$' then t else t || ' REMS' end
  from (select btrim(regexp_replace(regexp_replace(regexp_replace(
          p_name, '\s*\((anda|nda)[^)]*\)', '', 'i'), '^PS-', ''), '\s+shared system( rems)?$', '', 'i')) as t) s
$_$;


ALTER FUNCTION public.rems_program_label(p_name text) OWNER TO postgres;

--
-- Name: resolve_page_target(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.resolve_page_target(p_text text) RETURNS bigint
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  t text := lower(trim(p_text));
  v bigint;
begin
  if t ~ '^pcid-[0-9]+$' then
    select pcid into v from entities where pcid = substring(t from 6)::bigint;
    return v;
  end if;
  select pcid into v from entities where slug = t;
  if found then return v; end if;
  select pcid into v from entities where slug = pc_slugify(t);
  if found then return v; end if;
  select min(pcid) into v from entities where lower(name) = t having count(*) = 1;
  return v;
end $_$;


ALTER FUNCTION public.resolve_page_target(p_text text) OWNER TO postgres;

--
-- Name: resolve_property(text, bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.resolve_property(p_key text, p_pcid bigint) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  p infobox_properties%rowtype;
  e infobox_edits%rowtype;
  v_slug text; v_field text; v_val text; v_row jsonb; c text; v_parts text[] := '{}';
begin
  select * into p from infobox_properties where key = lower(p_key);
  if not found then return jsonb_build_object('error', 'unknown_property'); end if;

  select * into e from infobox_edits
  where pcid = p_pcid and property_key = p.key and is_current and value is not null;
  if found then
    return jsonb_build_object('key', p.key, 'label', p.label, 'value', e.value,
      'origin', 'community', 'citation', e.citation, 'patrol_status', e.patrol_status);
  end if;

  if p.source_kind = 'list' then
    v_slug := split_part(p.source_ref, '#', 1);
    v_field := split_part(p.source_ref, '#', 2);
    select case v_field
             when 'value' then li.value::text
             when 'rank' then li.rank::text
             when 'legal_status' then li.legal_status
             when 'note' then li.note
           end
      into v_val
    from list_items li join lists l on l.pcid = li.list_pcid
    where l.slug = v_slug and li.member_pcid = p_pcid
    limit 1;
    return jsonb_build_object('key', p.key, 'label', p.label, 'value', v_val,
      'origin', 'list', 'list_slug', v_slug);
  elsif p.source_kind = 'attribute' and p.source_ref = '=legal_status_line' then
    -- Phase 26d: computed attribute (one-line legal status).
    return jsonb_build_object('key', p.key, 'label', p.label,
      'value', public.legal_status_line(p_pcid), 'origin', 'attribute');
  elsif p.source_kind = 'attribute' then
    select to_jsonb(x) into v_row from (
      select * from moieties where pcid = p_pcid
    ) x;
    if v_row is null then select to_jsonb(x) into v_row from (select * from precise_forms where pcid = p_pcid) x; end if;
    if v_row is null then select to_jsonb(x) into v_row from (select * from combinations  where pcid = p_pcid) x; end if;
    if v_row is null then select to_jsonb(x) into v_row from (select * from formulations  where pcid = p_pcid) x; end if;
    foreach c in array string_to_array(p.source_ref, ',') loop
      if v_row ->> trim(c) is not null and not (v_row ->> trim(c) = any (v_parts)) then
        v_parts := v_parts || (v_row ->> trim(c));
      end if;
    end loop;
    return jsonb_build_object('key', p.key, 'label', p.label,
      'value', nullif(array_to_string(v_parts, '; '), ''), 'origin', 'attribute');
  else
    return jsonb_build_object('key', p.key, 'label', p.label, 'value', null,
      'origin', p.source_kind, 'resolve', 'client', 'source_ref', p.source_ref);
  end if;
end $$;


ALTER FUNCTION public.resolve_property(p_key text, p_pcid bigint) OWNER TO postgres;

--
-- Name: revert_page(bigint, bigint, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.revert_page(p_pcid bigint, p_to_revision_id bigint, p_summary text DEFAULT NULL::text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r page_revisions%rowtype;
  v_cur bigint;
  v_new bigint;
begin
  select * into r from page_revisions
  where id = p_to_revision_id and pcid = p_pcid and patrol_status not in ('pending', 'rejected');
  if not found then raise exception 'no_such_revision'; end if;
  select current_revision_id into v_cur from page_content where pcid = p_pcid;
 
  if r.format = 2 then
    if not is_verified_contributor() then raise exception 'not_verified' using errcode = '42501'; end if;
    v_new := (publish_page(auth.uid(), p_pcid, v_cur, v_cur, jsonb_build_object(
      'summary', coalesce(nullif(trim(p_summary), ''), 'Revert to revision ' || r.id),
      'kind', 'revert', 'model', r.model, 'source_md', r.source_md, 'extracted', r.extracted,
      'description', r.description, 'body_md', r.body_md,
      'changed_sections', to_jsonb(array['revert']),
      'citations', (select coalesce(jsonb_agg(jsonb_build_object('key', pc.ref_key, 'kind', s.kind) order by pc.ordinal), '[]'::jsonb)
                    from page_citations pc join citation_sources s on s.key = pc.ref_key where pc.revision_id = r.id)
    )) ->> 'revision_id')::bigint;
  else
    v_new := save_page(p_pcid, v_cur, r.description, r.body_md,
                       coalesce(nullif(trim(p_summary), ''), 'Revert to revision ' || r.id), 'revert');
  end if;
 
  if (select current_revision_id from page_content where pcid = p_pcid) = v_new then
    update page_revisions set patrol_status = 'reverted'
    where pcid = p_pcid and id > p_to_revision_id and id < v_new
      and patrol_status in ('unpatrolled', 'patrolled');
  end if;
  return v_new;
end $$;


ALTER FUNCTION public.revert_page(p_pcid bigint, p_to_revision_id bigint, p_summary text) OWNER TO postgres;

--
-- Name: review_brand_edit(bigint, boolean, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.review_brand_edit(p_edit_id bigint, p_accept boolean, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  e brand_edits%rowtype;
begin
  if not has_role('patroller') then raise exception 'not_patroller' using errcode = '42501'; end if;
  select * into e from brand_edits where id = p_edit_id and patrol_status = 'pending' for update;
  if not found then raise exception 'not_pending'; end if;
  if e.created_by = auth.uid() then raise exception 'cannot_review_own'; end if;
  if p_accept then
    update brand_edits set is_current = false where pcid = e.pcid and brand_key = e.brand_key and is_current;
    update brand_edits
    set is_current = true, patrol_status = 'patrolled', patrolled_by = auth.uid(), patrolled_at = now(), review_note = p_note
    where id = e.id;
  else
    if coalesce(trim(p_note), '') = '' then raise exception 'note_required'; end if;
    update brand_edits
    set patrol_status = 'rejected', patrolled_by = auth.uid(), patrolled_at = now(), review_note = trim(p_note)
    where id = e.id;
  end if;
end $$;


ALTER FUNCTION public.review_brand_edit(p_edit_id bigint, p_accept boolean, p_note text) OWNER TO postgres;

--
-- Name: review_infobox_edit(bigint, boolean, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.review_infobox_edit(p_edit_id bigint, p_accept boolean, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  e infobox_edits%rowtype;
begin
  if not has_role('patroller') then raise exception 'not_patroller' using errcode = '42501'; end if;
  select * into e from infobox_edits where id = p_edit_id and patrol_status = 'pending' for update;
  if not found then raise exception 'not_pending'; end if;
  if e.created_by = auth.uid() then raise exception 'cannot_review_own'; end if;
  if p_accept then
    update infobox_edits set is_current = false
    where pcid = e.pcid and property_key = e.property_key and is_current;
    update infobox_edits
    set is_current = true, patrol_status = 'patrolled', patrolled_by = auth.uid(), patrolled_at = now(), review_note = p_note
    where id = e.id;
  else
    if coalesce(trim(p_note), '') = '' then raise exception 'note_required'; end if;
    update infobox_edits
    set patrol_status = 'rejected', patrolled_by = auth.uid(), patrolled_at = now(), review_note = trim(p_note)
    where id = e.id;
  end if;
end $$;


ALTER FUNCTION public.review_infobox_edit(p_edit_id bigint, p_accept boolean, p_note text) OWNER TO postgres;

--
-- Name: revoke_role(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.revoke_role(p_user_id uuid, p_role text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if p_role = 'owner' then raise exception 'owner_not_revocable' using errcode = '42501'; end if;
  if p_role = 'admin' then
    if not has_role('owner') then raise exception 'not_owner' using errcode = '42501'; end if;
  elsif not has_role('admin') then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() and p_role = 'admin' then raise exception 'cannot_revoke_own_admin'; end if;
  delete from user_roles where user_id = p_user_id and role = p_role;
end $$;


ALTER FUNCTION public.revoke_role(p_user_id uuid, p_role text) OWNER TO postgres;

--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION public.rls_auto_enable() OWNER TO postgres;

--
-- Name: rxclass_todo(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rxclass_todo(p_limit integer) RETURNS TABLE(pcid bigint, unii text, base_name text, name text, rxcui text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select e.pcid, nullif(m.unii,''), m.base_name, e.name, r.rxcui
  from entities e join moieties m using(pcid)
  left join rxnorm_lookup r on r.pcid=e.pcid and r.status='ok'
  where e.entity_type='moiety'
    and not exists (select 1 from rxclass_lookup l where l.pcid=e.pcid)
  order by (r.rxcui is null), (m.unii is null or m.unii=''), e.pcid
  limit p_limit $$;


ALTER FUNCTION public.rxclass_todo(p_limit integer) OWNER TO postgres;

--
-- Name: rxnorm_todo(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rxnorm_todo(p_limit integer) RETURNS TABLE(pcid bigint, unii text, base_name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select m.pcid, m.unii, m.base_name
  from moieties m
  where m.unii is not null
    and not exists (select 1 from rxnorm_lookup l where l.pcid = m.pcid)
  order by (m.term_type = 'Core moiety') desc, m.pcid
  limit p_limit
$$;


ALTER FUNCTION public.rxnorm_todo(p_limit integer) OWNER TO postgres;

--
-- Name: save_page(bigint, bigint, text, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.save_page(p_pcid bigint, p_base_revision_id bigint, p_description text, p_body_md text, p_summary text, p_kind text DEFAULT 'edit'::text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_cur page_content%rowtype;
  v_rev bigint;
  v_old_len integer := 0;
  v_patroller boolean := has_role('patroller');
  v_held boolean := false;
begin
  if not is_verified_contributor() then raise exception 'not_verified' using errcode = '42501'; end if;
  if not exists (select 1 from contributor_profiles where user_id = auth.uid()) then
    raise exception 'handle_required';
  end if;
  if not exists (select 1 from entities where pcid = p_pcid) then raise exception 'no_such_page'; end if;
  if coalesce(trim(p_summary), '') = '' then raise exception 'summary_required'; end if;
  if length(coalesce(p_description, '')) > 2000 or length(coalesce(p_body_md, '')) > 200000 then
    raise exception 'too_long';
  end if;
  if not v_patroller and (select count(*) from page_revisions
       where created_by = auth.uid() and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'rate_limited';
  end if;

  select * into v_cur from page_content where pcid = p_pcid for update;
  if found then
    if v_cur.protection = 'patrollers' and not v_patroller then raise exception 'protected'; end if;
    v_held := v_cur.protection = 'reviewed' and not v_patroller;
    if v_cur.current_revision_id is distinct from p_base_revision_id then
      raise exception 'edit_conflict' using detail = coalesce(v_cur.current_revision_id::text, '');
    end if;
    v_old_len := length(v_cur.description) + length(v_cur.body_md);
  else
    if p_base_revision_id is not null then raise exception 'edit_conflict'; end if;
    insert into page_content (pcid) values (p_pcid);
  end if;

  insert into page_revisions (pcid, parent_id, description, body_md, summary, size_delta, kind,
                              created_by, patrol_status, patrolled_by, patrolled_at)
  values (p_pcid, p_base_revision_id, coalesce(p_description, ''), coalesce(p_body_md, ''), trim(p_summary),
          length(coalesce(p_description, '')) + length(coalesce(p_body_md, '')) - v_old_len,
          case when p_base_revision_id is null and p_kind = 'edit' then 'create' else p_kind end,
          auth.uid(),
          case when v_held then 'pending' when v_patroller then 'patrolled' else 'unpatrolled' end,
          case when v_patroller then auth.uid() end,
          case when v_patroller then now() end)
  returning id into v_rev;

  if not v_held then
    update page_content
    set description = coalesce(p_description, ''), body_md = coalesce(p_body_md, ''),
        current_revision_id = v_rev, updated_at = now()
    where pcid = p_pcid;
    perform refresh_page_links(p_pcid);
  end if;
  return v_rev;
end $$;


ALTER FUNCTION public.save_page(p_pcid bigint, p_base_revision_id bigint, p_description text, p_body_md text, p_summary text, p_kind text) OWNER TO postgres;

--
-- Name: search_all(text, integer, text[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.search_all(p_q text, p_limit integer DEFAULT 20, p_types text[] DEFAULT NULL::text[]) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'extensions'
    AS $_$
  with prm as (
    select public.search_norm(p_q) as qn,
           lower(btrim(coalesce(p_q, ''))) as raw,
           least(greatest(coalesce(p_limit, 20), 1), 50) as lim,
           array(select w from unnest(string_to_array(public.search_norm(p_q), ' ')) w where length(w) >= 2) as words,
           (select w from unnest(string_to_array(public.search_norm(p_q), ' ')) w order by length(w) desc limit 1) as longest,
           array['moiety','combination','class','clinical','measurement','target','functional','list'] as ord
  ),
  t1 as (
    select distinct on (h.pcid) h.pcid, h.entity_type, h.slug, h.name, h.src, h.term,
           case when e.slug = prm.raw then 100 else h.score end as score,
           null::int as dist
    from prm,
    lateral (
      select s.pcid, s.entity_type, s.slug, s.name, s.src, s.term,
             case when s.src = 'name'  and s.key = prm.qn then 95
                  when s.src in ('alias', 'code') and s.key in (prm.qn, regexp_replace(prm.qn, 's$', '')) then 92
                  when s.src = 'brand' and s.key = prm.qn then 90
                  when s.src = 'name'  and s.key like prm.qn || '%' then 80
                  when s.src in ('brand', 'alias', 'code') and s.key like prm.qn || '%' then 75
                  when s.src = 'name'  and s.key like '% ' || prm.qn || '%' then 60
                  when s.src = 'name'  and cardinality(prm.words) > 1
                       and not exists (select 1 from unnest(prm.words) w where position(w in s.key) = 0) then 50
                  when s.src = 'name'  and s.key like '%' || prm.qn || '%' then 40
                  when s.src <> 'name' then 35
                  else 0 end as score
        from public.search_index s
       where length(prm.qn) >= 2
         and (s.key like prm.qn || '%' or s.key like '%' || prm.qn || '%'
              or (cardinality(prm.words) > 1 and s.key like '%' || prm.longest || '%'))
         and (p_types is null or s.entity_type = any (p_types))
    ) h
    join public.entities e on e.pcid = h.pcid
    where h.score > 0
    order by h.pcid, 7 desc
  ),
  best as (select coalesce(max(score), 0) as b from t1),
  t2 as (
    select distinct on (c.pcid) c.pcid, c.entity_type, c.slug, c.name, c.src, c.term,
           case when c.dist <= 1 then 30
                when c.dist = 2 and length(prm.qn) >= 6 then 26
                when c.dist = 3 and length(prm.qn) >= 9 then 22 end as score,
           c.dist
    from prm,
    lateral (
      select s.*, g.sim,
             least(public.osa_distance(s.key, prm.qn),
                   coalesce((select min(public.osa_distance(w, prm.qn)) from unnest(string_to_array(s.key, ' ')) w), 99)) as dist
        from public.search_index s
        cross join lateral (select greatest(similarity(s.key, prm.qn), word_similarity(prm.qn, s.key)) as sim) g
       where (s.key % prm.qn or prm.qn <% s.key)
         and (p_types is null or s.entity_type = any (p_types))
       order by g.sim desc
       limit 60
    ) c
    where length(prm.qn) >= 4
      and (select b from best) < 40
      and c.dist <= 3
    order by c.pcid, 7 desc nulls last, c.dist
  ),
  pool as (
    select * from t1 where (select b from best) >= 40 or not exists (select 1 from t2 where score is not null)
    union all
    select * from t2 where score is not null and (select b from best) < 40
  ),
  fz as (select exists (select 1 from t2 where score is not null and (select b from best) < 40) as f),
  ranked as (
    select p.*, m.term_type
      from (select * from pool where score >= 15) p
      left join public.moieties m on m.pcid = p.pcid
     order by p.score desc, p.dist nulls last,
              array_position((select ord from prm), p.entity_type),
              (m.term_type is distinct from 'Core moiety'),
              length(p.name), p.name
     limit (select lim from prm)
  )
  select jsonb_build_object(
           'query', btrim(coalesce(p_q, '')),
           'fuzzy', (select f from fz) and exists (select 1 from ranked),
           'did_you_mean', case when (select f from fz) then
                (select r.name from ranked r
                  order by r.score desc, r.dist nulls last, array_position((select ord from prm), r.entity_type),
                           (r.term_type is distinct from 'Core moiety'), length(r.name), r.name limit 1) end,
           'results', coalesce((
              select jsonb_agg(jsonb_build_object(
                       'pcid', 'PCID-' || r.pcid, 'name', r.name, 'slug', r.slug, 'entity_type', r.entity_type,
                       'match', jsonb_strip_nulls(jsonb_build_object(
                                  'on', case when (select f from fz) then 'fuzzy' else r.src end,
                                  'text', case when r.src in ('brand','alias','code') then r.term end,
                                  'score', r.score)))
                     order by r.score desc, r.dist nulls last, array_position((select ord from prm), r.entity_type),
                              (r.term_type is distinct from 'Core moiety'), length(r.name), r.name)
                from ranked r), '[]'::jsonb))
$_$;


ALTER FUNCTION public.search_all(p_q text, p_limit integer, p_types text[]) OWNER TO postgres;

--
-- Name: FUNCTION search_all(p_q text, p_limit integer, p_types text[]); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.search_all(p_q text, p_limit integer, p_types text[]) IS 'Site search: ranked exact/prefix/word matches over names, brands, class aliases and concepts, with a flagged typo-tolerant fallback. Public, read-only, security invoker.';


--
-- Name: search_classes(text, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.search_classes(p_q text, p_limit integer DEFAULT 3) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $_$
  with q as (
    select trim(regexp_replace(lower(coalesce(p_q, '')), '[^a-z0-9]+', ' ', 'g')) as w
  ), qk as (
    select w,
           replace(w, ' ', '')                                   as k,
           regexp_replace(replace(w, ' ', ''), 's$', '')         as ks,
           array(select regexp_replace(x, '(.{3,})s$', '\1')
                   from unnest(string_to_array(w, ' ')) x where x <> '') as words
      from q
  ), cls as (
    select d.pcid, e.slug, e.name, d.class_type, d.source_code, d.member_count,
           ' ' || trim(regexp_replace(lower(e.name), '[^a-z0-9]+', ' ', 'g')) || ' ' as nn
      from drug_classes d join entities e using (pcid)
     where d.member_count > 0
       and d.class_type in ('epc', 'curated', 'atc', 'va', 'moa')
  ), hits as (
    select c.pcid, 1 as rnk, 'alias' as how
      from qk join class_search_aliases a on a.alias_key in (qk.k, qk.ks)
      join cls c on c.pcid = a.class_pcid
     where length(qk.k) >= 2
    union all
    select c.pcid, 2, 'paren'
      from qk, cls c
     cross join lateral regexp_matches(c.name, '\(([^)]+)\)', 'g') m(g)
     where length(qk.k) >= 2
       and regexp_replace(regexp_replace(lower(m.g[1]), '[^a-z0-9]+', '', 'g'), 's$', '') in (qk.k, qk.ks)
    union all
    select c.pcid, 2, 'initialism'
      from qk, cls c
     where length(qk.k) between 3 and 6 and position(' ' in qk.w) = 0
       and (select string_agg(left(x, 1), '' order by o)
              from unnest(string_to_array(trim(c.nn), ' ')) with ordinality u(x, o)
             where x not in ('and', 'of', 'the', 'for', 'with', 'in', 'or', 'to', 'excl', 'plain'))
           in (qk.k, qk.ks)
    union all
    select c.pcid, 3, 'name'
      from qk, cls c
     where length(qk.k) >= 4
       and cardinality(qk.words) > 0
       and not exists (select 1 from unnest(qk.words) x where position(' ' || x in c.nn) = 0)
  ), best as (
    select distinct on (pcid) pcid, rnk, how from hits
     where rnk <= 2 and how <> 'initialism'
        or not exists (select 1 from hits h where h.how = 'alias')
     order by pcid, rnk
  ), ranked as (
    select c.*, b.rnk, b.how
      from best b join cls c using (pcid)
     order by b.rnk,
              array_position(array['epc', 'curated', 'atc', 'va', 'moa'], c.class_type),
              c.member_count desc, c.name
     limit greatest(coalesce(p_limit, 3), 1)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'slug', r.slug, 'name', r.name, 'class_type', r.class_type,
           'class_type_label', class_type_label(r.class_type),
           'source_code', r.source_code, 'match', r.how,
           'members', coalesce((
             select jsonb_agg(jsonb_build_object('pcid', e.pcid, 'slug', e.slug, 'name', e.name)
                              order by lower(e.name))
               from (select distinct member_pcid from class_members where class_pcid = r.pcid) m
               join entities e on e.pcid = m.member_pcid and e.entity_type = 'moiety'), '[]'::jsonb))
         order by r.rnk,
                  array_position(array['epc', 'curated', 'atc', 'va', 'moa'], r.class_type),
                  r.member_count desc, r.name), '[]'::jsonb)
    from ranked r
$_$;


ALTER FUNCTION public.search_classes(p_q text, p_limit integer) OWNER TO postgres;

--
-- Name: FUNCTION search_classes(p_q text, p_limit integer); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.search_classes(p_q text, p_limit integer) IS 'Browse-page class search: alias > parenthetical abbreviation > initialism > name words. Returns [{slug,name,class_type,class_type_label,source_code,match,members:[{pcid,slug,name}]}]. Public RPC; SECURITY INVOKER — every table it reads is public_read.';


--
-- Name: search_norm(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.search_norm(t text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$ select btrim(regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', ' ', 'g')) $$;


ALTER FUNCTION public.search_norm(t text) OWNER TO postgres;

--
-- Name: set_contributor_handle(text, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_contributor_handle(p_handle text, p_display_credential boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not is_verified_contributor() then raise exception 'not_verified' using errcode = '42501'; end if;
  insert into contributor_profiles (user_id, handle, display_credential)
  values (auth.uid(), p_handle, coalesce(p_display_credential, true))
  on conflict (user_id) do update
    set handle = excluded.handle, display_credential = excluded.display_credential;
end $$;


ALTER FUNCTION public.set_contributor_handle(p_handle text, p_display_credential boolean) OWNER TO postgres;

--
-- Name: set_page_protection(bigint, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_page_protection(p_pcid bigint, p_protection text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not has_role('admin') then raise exception 'not_admin' using errcode = '42501'; end if;
  insert into page_content (pcid, protection) values (p_pcid, p_protection)
  on conflict (pcid) do update set protection = excluded.protection;
end $$;


ALTER FUNCTION public.set_page_protection(p_pcid bigint, p_protection text) OWNER TO postgres;

--
-- Name: set_public_handle(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_public_handle(p_handle text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if pc_is_blocked() then raise exception 'blocked' using errcode = '42501'; end if;
  insert into contributor_profiles (user_id, handle)
  values (auth.uid(), trim(p_handle))
  on conflict (user_id) do update set handle = excluded.handle;
end $$;


ALTER FUNCTION public.set_public_handle(p_handle text) OWNER TO postgres;

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION public.set_updated_at() OWNER TO postgres;

--
-- Name: signup_dob(jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.signup_dob(meta jsonb) RETURNS date
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
begin
  return (meta ->> 'date_of_birth')::date;
exception when others then
  return null;
end;
$$;


ALTER FUNCTION public.signup_dob(meta jsonb) OWNER TO postgres;

--
-- Name: stg_norm_name(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.stg_norm_name(t text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $_$
  select nullif(trim(regexp_replace(regexp_replace(regexp_replace(lower(t), '\s*[/;]\s*', '/', 'g'), '\s+', ' ', 'g'), '\s*-\s*$', '')), '')
$_$;


ALTER FUNCTION public.stg_norm_name(t text) OWNER TO postgres;

--
-- Name: stg_strip_qual(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.stg_strip_qual(t text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $_$
  select nullif(trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(t,
    '\s*\([^)]*\)', '', 'g'),                                   -- parentheticals
    ',?\s+(including|and) its .*$|,\s*including .*$', ''),      -- ", including its salts..." / "and its salts..."
    '\s+(topical|nasal|ophthalmic|otic|oral|iv|resin|solution topical|in oral solution|in sesame oil)$', ''),
    ',\s*micronized$', '')), '')
$_$;


ALTER FUNCTION public.stg_strip_qual(t text) OWNER TO postgres;

--
-- Name: stg_strip_salt(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.stg_strip_salt(t text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $_$
  select nullif(trim(regexp_replace(t, '\s+(hydrochloride|dihydrochloride|sodium|potassium|calcium|bitartrate|tartrate|fumarate|disoproxil fumarate|mesylate|sulfate|acetate|maleate|citrate|besylate|succinate|phosphate)$', '')), '')
$_$;


ALTER FUNCTION public.stg_strip_salt(t text) OWNER TO postgres;

--
-- Name: structure_todo(integer, bigint[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.structure_todo(p_limit integer, p_pcids bigint[] DEFAULT NULL::bigint[]) RETURNS TABLE(pcid bigint, inchi_key text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


ALTER FUNCTION public.structure_todo(p_limit integer, p_pcids bigint[]) OWNER TO postgres;

--
-- Name: structure_todo_drugbank(integer, bigint[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.structure_todo_drugbank(p_limit integer, p_pcids bigint[] DEFAULT NULL::bigint[]) RETURNS TABLE(pcid bigint, drugbank_id text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION public.structure_todo_drugbank(p_limit integer, p_pcids bigint[]) OWNER TO postgres;

--
-- Name: structure_todo_name(integer, bigint[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.structure_todo_name(p_limit integer, p_pcids bigint[] DEFAULT NULL::bigint[]) RETURNS TABLE(pcid bigint, name text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


ALTER FUNCTION public.structure_todo_name(p_limit integer, p_pcids bigint[]) OWNER TO postgres;

--
-- Name: structure_todo_unii(integer, bigint[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.structure_todo_unii(p_limit integer, p_pcids bigint[] DEFAULT NULL::bigint[]) RETURNS TABLE(pcid bigint, unii text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
  select m.pcid, upper(btrim(m.unii))
  from moieties m
  where m.term_type = 'Core moiety'
    and nullif(btrim(m.inchi_key),'') is null
    and upper(btrim(m.unii)) ~ '^[A-Z0-9]{10}$'
    and not exists (select 1 from physiochemical p where p.pcid = m.pcid)
    and (p_pcids is null or m.pcid = any(p_pcids))
  order by m.pcid
  limit p_limit
$_$;


ALTER FUNCTION public.structure_todo_unii(p_limit integer, p_pcids bigint[]) OWNER TO postgres;

--
-- Name: unblock_contributor(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.unblock_contributor(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not has_role('admin') then raise exception 'not_admin' using errcode = '42501'; end if;
  delete from contributor_blocks where user_id = p_user_id;
end $$;


ALTER FUNCTION public.unblock_contributor(p_user_id uuid) OWNER TO postgres;

--
-- Name: class_agent_skip; Type: TABLE; Schema: archive; Owner: postgres
--

CREATE TABLE archive.class_agent_skip (
    member_pcid bigint NOT NULL,
    reason text,
    batch integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE archive.class_agent_skip OWNER TO postgres;

--
-- Name: class_review_queue; Type: TABLE; Schema: archive; Owner: postgres
--

CREATE TABLE archive.class_review_queue (
    pcid bigint NOT NULL,
    name text,
    unii text,
    drugbank_id text,
    cas text,
    primary_brand text,
    batch integer
);


ALTER TABLE archive.class_review_queue OWNER TO postgres;

--
-- Name: stg_dictionary_combo; Type: TABLE; Schema: archive; Owner: postgres
--

CREATE TABLE archive.stg_dictionary_combo (
    id integer,
    combo_pcid bigint,
    n_combos bigint
);


ALTER TABLE archive.stg_dictionary_combo OWNER TO postgres;

--
-- Name: stg_dictionary_combo2; Type: TABLE; Schema: archive; Owner: postgres
--

CREATE TABLE archive.stg_dictionary_combo2 (
    id integer,
    combo_pcid bigint,
    n_combos bigint
);


ALTER TABLE archive.stg_dictionary_combo2 OWNER TO postgres;

--
-- Name: stg_dictionary_frag; Type: TABLE; Schema: archive; Owner: postgres
--

CREATE TABLE archive.stg_dictionary_frag (
    id integer,
    term text,
    n_contain bigint,
    examples text
);


ALTER TABLE archive.stg_dictionary_frag OWNER TO postgres;

--
-- Name: stg_dictionary_fraglink; Type: TABLE; Schema: archive; Owner: postgres
--

CREATE TABLE archive.stg_dictionary_fraglink (
    id integer,
    term text,
    pcid bigint,
    name text,
    n bigint,
    all_contain_best boolean,
    best_words integer
);


ALTER TABLE archive.stg_dictionary_fraglink OWNER TO postgres;

--
-- Name: stg_dictionary_gen; Type: TABLE; Schema: archive; Owner: postgres
--

CREATE TABLE archive.stg_dictionary_gen (
    ldef text,
    n_brands bigint,
    ids integer[]
);


ALTER TABLE archive.stg_dictionary_gen OWNER TO postgres;

--
-- Name: stg_dictionary_idx; Type: TABLE; Schema: archive; Owner: postgres
--

CREATE TABLE archive.stg_dictionary_idx (
    id integer,
    pcid bigint
);


ALTER TABLE archive.stg_dictionary_idx OWNER TO postgres;

--
-- Name: stg_dictionary_m2; Type: TABLE; Schema: archive; Owner: postgres
--

CREATE TABLE archive.stg_dictionary_m2 (
    id integer,
    k text,
    pcid bigint,
    n bigint
);


ALTER TABLE archive.stg_dictionary_m2 OWNER TO postgres;

--
-- Name: stg_dictionary_match; Type: TABLE; Schema: archive; Owner: postgres
--

CREATE TABLE archive.stg_dictionary_match (
    id integer,
    term_type text,
    term text,
    ldef text,
    by_name bigint,
    by_def bigint
);


ALTER TABLE archive.stg_dictionary_match OWNER TO postgres;

--
-- Name: stg_dictionary_mint; Type: TABLE; Schema: archive; Owner: postgres
--

CREATE TABLE archive.stg_dictionary_mint (
    key text,
    kind text,
    name text,
    pcid bigint,
    slug text,
    synonym_of_pcid bigint,
    merge_into text,
    link_pcid bigint
);


ALTER TABLE archive.stg_dictionary_mint OWNER TO postgres;

--
-- Name: stg_dictionary_raw; Type: TABLE; Schema: archive; Owner: postgres
--

CREATE TABLE archive.stg_dictionary_raw (
    doc jsonb
);


ALTER TABLE archive.stg_dictionary_raw OWNER TO postgres;

--
-- Name: stg_name_index; Type: TABLE; Schema: archive; Owner: postgres
--

CREATE TABLE archive.stg_name_index (
    nn text,
    pcid bigint,
    pref integer,
    entity_type text
);


ALTER TABLE archive.stg_name_index OWNER TO postgres;

--
-- Name: stg_topdrugs_lists; Type: TABLE; Schema: archive; Owner: postgres
--

CREATE TABLE archive.stg_topdrugs_lists (
    col integer NOT NULL,
    header text NOT NULL,
    source text
);


ALTER TABLE archive.stg_topdrugs_lists OWNER TO postgres;

--
-- Name: TABLE stg_topdrugs_lists; Type: COMMENT; Schema: archive; Owner: postgres
--

COMMENT ON TABLE archive.stg_topdrugs_lists IS 'Staging: Top_Drugs.xlsx list columns and sources (2026-09-24 lists import). Drop after load.';


--
-- Name: stg_topdrugs_match; Type: TABLE; Schema: archive; Owner: postgres
--

CREATE TABLE archive.stg_topdrugs_match (
    row_no integer NOT NULL,
    norm text NOT NULL,
    pcid bigint,
    basis text,
    n_candidates integer,
    note text
);


ALTER TABLE archive.stg_topdrugs_match OWNER TO postgres;

--
-- Name: TABLE stg_topdrugs_match; Type: COMMENT; Schema: archive; Owner: postgres
--

COMMENT ON TABLE archive.stg_topdrugs_match IS 'Staging: Top_Drugs.xlsx row -> PCID matching (2026-09-25 lists import). Drop after load.';


--
-- Name: stg_topdrugs_rows; Type: TABLE; Schema: archive; Owner: postgres
--

CREATE TABLE archive.stg_topdrugs_rows (
    row_no integer NOT NULL,
    drug_name text NOT NULL,
    brand_names text,
    avg_patients numeric,
    legal_status text,
    category text,
    notable_rank integer,
    condensed_from text,
    memberships jsonb DEFAULT '[]'::jsonb NOT NULL
);


ALTER TABLE archive.stg_topdrugs_rows OWNER TO postgres;

--
-- Name: TABLE stg_topdrugs_rows; Type: COMMENT; Schema: archive; Owner: postgres
--

COMMENT ON TABLE archive.stg_topdrugs_rows IS 'Staging: Top_Drugs.xlsx Drug Matrix rows (2026-09-24 lists import). Drop after load.';


--
-- Name: account_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.account_profiles (
    user_id uuid NOT NULL,
    account_type text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    date_of_birth date NOT NULL,
    age_confirmed_at timestamp with time zone DEFAULT now() NOT NULL,
    country text,
    postal_code text,
    phone text,
    npi_claimed text,
    profession text,
    organization text,
    research_area text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_profiles_account_type_check CHECK ((account_type = ANY (ARRAY['patient'::text, 'practitioner'::text, 'researcher'::text]))),
    CONSTRAINT account_profiles_country_check CHECK (((country IS NULL) OR (country ~ '^[A-Z]{2}$'::text))),
    CONSTRAINT account_profiles_date_of_birth_check CHECK ((date_of_birth >= '1900-01-01'::date)),
    CONSTRAINT account_profiles_first_name_check CHECK (((char_length(first_name) >= 1) AND (char_length(first_name) <= 80))),
    CONSTRAINT account_profiles_last_name_check CHECK (((char_length(last_name) >= 1) AND (char_length(last_name) <= 80))),
    CONSTRAINT account_profiles_npi_claimed_check CHECK (((npi_claimed IS NULL) OR (npi_claimed ~ '^\d{10}$'::text))),
    CONSTRAINT account_profiles_organization_check CHECK (((organization IS NULL) OR (char_length(organization) <= 160))),
    CONSTRAINT account_profiles_phone_check CHECK (((phone IS NULL) OR (char_length(phone) <= 32))),
    CONSTRAINT account_profiles_postal_code_check CHECK (((postal_code IS NULL) OR (char_length(postal_code) <= 16))),
    CONSTRAINT account_profiles_profession_check CHECK (((profession IS NULL) OR (char_length(profession) <= 80))),
    CONSTRAINT account_profiles_research_area_check CHECK (((research_area IS NULL) OR (char_length(research_area) <= 160)))
);


ALTER TABLE public.account_profiles OWNER TO postgres;

--
-- Name: TABLE account_profiles; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.account_profiles IS 'Private sign-up details (phase 19). Owner-read only; written by the on_auth_user_created_profile trigger from auth.users.raw_user_meta_data. npi_claimed is a claim — provider_verifications is the verified record.';


--
-- Name: api_meta; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.api_meta (
    key text NOT NULL,
    value text,
    note text
);


ALTER TABLE public.api_meta OWNER TO postgres;

--
-- Name: biological_targets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.biological_targets (
    pcid bigint NOT NULL,
    target_type text,
    source_ref text
);


ALTER TABLE public.biological_targets OWNER TO postgres;

--
-- Name: block_schemas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.block_schemas (
    name text NOT NULL,
    label text NOT NULL,
    grammar text NOT NULL,
    region text NOT NULL,
    owner_section text,
    page_types text[] NOT NULL,
    citation text NOT NULL,
    help text NOT NULL,
    example text NOT NULL,
    hints text[] DEFAULT '{}'::text[] NOT NULL,
    grammar_spec jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT block_schemas_check CHECK (((region = 'rail'::text) OR (owner_section IS NOT NULL))),
    CONSTRAINT block_schemas_citation_check CHECK ((citation = ANY (ARRAY['on_change'::text, 'always'::text]))),
    CONSTRAINT block_schemas_grammar_check CHECK ((grammar = ANY (ARRAY['keyed'::text, 'brands'::text, 'threshold'::text, 'statement'::text]))),
    CONSTRAINT block_schemas_name_check CHECK ((name ~ '^[a-z][a-z0-9-]*$'::text)),
    CONSTRAINT block_schemas_region_check CHECK ((region = ANY (ARRAY['rail'::text, 'section'::text])))
);


ALTER TABLE public.block_schemas OWNER TO postgres;

--
-- Name: TABLE block_schemas; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.block_schemas IS 'Structured blocks (:::name) allowed in page source. Mirrors src/pageSource/registry.json (phase 16a).';


--
-- Name: blog_comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.blog_comments (
    id bigint NOT NULL,
    post_slug text NOT NULL,
    parent_id bigint,
    author_id uuid,
    body text NOT NULL,
    state text DEFAULT 'visible'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    edited_at timestamp with time zone,
    patrolled_by uuid,
    patrolled_at timestamp with time zone,
    moderated_by uuid,
    moderated_at timestamp with time zone,
    moderation_note text,
    CONSTRAINT blog_comments_body_len CHECK ((((state = 'deleted'::text) AND (body = ''::text)) OR ((state <> 'deleted'::text) AND ((length(body) >= 1) AND (length(body) <= 4000))))),
    CONSTRAINT blog_comments_post_slug_check CHECK ((post_slug ~ '^[a-z0-9][a-z0-9-]{0,119}$'::text)),
    CONSTRAINT blog_comments_state_check CHECK ((state = ANY (ARRAY['visible'::text, 'hidden'::text, 'deleted'::text])))
);


ALTER TABLE public.blog_comments OWNER TO postgres;

--
-- Name: blog_comments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.blog_comments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.blog_comments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: brand_edits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.brand_edits (
    id bigint NOT NULL,
    pcid bigint NOT NULL,
    brand_key text NOT NULL,
    brand_display text NOT NULL,
    action text NOT NULL,
    citation text NOT NULL,
    summary text NOT NULL,
    is_current boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    patrol_status text DEFAULT 'unpatrolled'::text NOT NULL,
    patrolled_by uuid,
    patrolled_at timestamp with time zone,
    review_note text,
    revision_id bigint,
    CONSTRAINT brand_edits_action_check CHECK ((action = ANY (ARRAY['add'::text, 'hide'::text, 'clear'::text]))),
    CONSTRAINT brand_edits_brand_display_check CHECK (((length(TRIM(BOTH FROM brand_display)) >= 1) AND (length(TRIM(BOTH FROM brand_display)) <= 120))),
    CONSTRAINT brand_edits_brand_key_check CHECK (((brand_key = upper(brand_key)) AND ((length(brand_key) >= 1) AND (length(brand_key) <= 120)))),
    CONSTRAINT brand_edits_citation_check CHECK ((length(TRIM(BOTH FROM citation)) > 0)),
    CONSTRAINT brand_edits_patrol_status_check CHECK ((patrol_status = ANY (ARRAY['unpatrolled'::text, 'patrolled'::text, 'reverted'::text, 'pending'::text, 'rejected'::text]))),
    CONSTRAINT brand_edits_summary_check CHECK (((length(TRIM(BOTH FROM summary)) >= 1) AND (length(TRIM(BOTH FROM summary)) <= 500)))
);


ALTER TABLE public.brand_edits OWNER TO postgres;

--
-- Name: brand_edits_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.brand_edits ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.brand_edits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: clinical_statements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.clinical_statements (
    statement_id bigint NOT NULL,
    subject_pcid bigint NOT NULL,
    predicate text NOT NULL,
    object_pcid bigint,
    object_label text,
    comparator_pcid bigint,
    evidence_level text,
    source_agency text,
    source_doc_id text,
    source_section text,
    source_quote text,
    risk_profile text,
    updated_at timestamp with time zone,
    qualifier_key text,
    qualifier_value text,
    CONSTRAINT clinical_statements_check CHECK ((subject_pcid <> object_pcid)),
    CONSTRAINT clinical_statements_check1 CHECK (((object_pcid IS NOT NULL) OR (object_label IS NOT NULL)))
);


ALTER TABLE public.clinical_statements OWNER TO postgres;

--
-- Name: TABLE clinical_statements; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.clinical_statements IS 'Subject/predicate/object triple store — the one relationship engine for the whole platform (drug-drug interactions, PGx associations, combination components via has_component, class membership via member_of, etc.) rather than a separate junction table per relationship type. subject_name is intentionally not stored here — join to entities.name.';


--
-- Name: combinations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.combinations (
    pcid bigint NOT NULL,
    class_pcid bigint,
    class_name text,
    is_controlled boolean,
    controlled_schedule text,
    origin text,
    term_type text,
    base_name text,
    synonym_of_pcid bigint,
    block_exception text,
    primary_brand text,
    drugbank_id text,
    cas text,
    unii text,
    inchi_key text,
    ndc_codes text,
    fda_applnos text,
    lactmed_id text,
    legal_status text,
    statute_citation text,
    mpje_relevance text,
    fda_marketing_status text,
    rx_status text,
    primary_source text,
    source_count integer
);


ALTER TABLE public.combinations OWNER TO postgres;

--
-- Name: entities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.entities (
    pcid bigint NOT NULL,
    entity_type text NOT NULL,
    slug text NOT NULL,
    slug_uri text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


ALTER TABLE public.entities OWNER TO postgres;

--
-- Name: TABLE entities; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.entities IS 'Every PCID across all 9 blocks. Class_PCID, Synonym_Of_PCID and clinical_statements'' Subject_PCID/Object_PCID/Comparator_PCID all FK here rather than to a specific block table, since a reference can legally point into any block.';


--
-- Name: fda_products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fda_products (
    product_id text NOT NULL,
    appl_no text NOT NULL,
    product_no text,
    ndc text,
    brand_name text,
    generic_name text,
    dosage_form text,
    route text,
    marketing_status text,
    pcid bigint,
    raw jsonb NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.fda_products OWNER TO postgres;

--
-- Name: TABLE fda_products; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.fda_products IS 'One row per product within an FDA application. pcid is NULL until the NDC-matching pass links it, same convention as fda_applications.pcid.';


--
-- Name: formulations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.formulations (
    pcid bigint NOT NULL,
    class_pcid bigint,
    class_name text,
    is_controlled boolean,
    controlled_schedule text,
    origin text,
    term_type text,
    base_name text,
    synonym_of_pcid bigint,
    block_exception text,
    primary_brand text,
    drugbank_id text,
    cas text,
    unii text,
    inchi_key text,
    ndc_codes text,
    fda_applnos text,
    lactmed_id text,
    legal_status text,
    statute_citation text,
    mpje_relevance text,
    fda_marketing_status text,
    rx_status text,
    primary_source text,
    source_count integer
);


ALTER TABLE public.formulations OWNER TO postgres;

--
-- Name: label_documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.label_documents (
    setid text NOT NULL,
    document_id text,
    document_type_loinc text,
    document_type_display text,
    version_number text,
    effective_time text,
    title text,
    labeler text,
    unii_rollup text[],
    n_products integer,
    products_json jsonb
);


ALTER TABLE public.label_documents OWNER TO postgres;

--
-- Name: TABLE label_documents; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.label_documents IS 'One row per DailyMed SPL document (setid), sourced from dailymed_labels.parquet. products_json holds the raw per-product ingredient/NDC breakdown from DailyMed.';


--
-- Name: moieties; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.moieties (
    pcid bigint NOT NULL,
    is_controlled boolean,
    controlled_schedule text,
    origin text,
    term_type text,
    base_name text,
    synonym_of_pcid bigint,
    block_exception text,
    primary_brand text,
    drugbank_id text,
    cas text,
    unii text,
    inchi_key text,
    ndc_codes text,
    fda_applnos text,
    lactmed_id text,
    legal_status text,
    statute_citation text,
    mpje_relevance text,
    fda_marketing_status text,
    rx_status text,
    primary_source text,
    source_count integer,
    description_text text
);


ALTER TABLE public.moieties OWNER TO postgres;

--
-- Name: COLUMN moieties.description_text; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.moieties.description_text IS 'One-line description shown under the drug name on the moiety page. Written by Joshua Semock, PharmD (Pharmacy Commons-authored). NULL = not written yet; the page shows "Unassigned".';


--
-- Name: precise_forms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.precise_forms (
    pcid bigint NOT NULL,
    class_pcid bigint,
    class_name text,
    is_controlled boolean,
    controlled_schedule text,
    origin text,
    term_type text,
    base_name text,
    synonym_of_pcid bigint,
    block_exception text,
    primary_brand text,
    drugbank_id text,
    cas text,
    unii text,
    inchi_key text,
    ndc_codes text,
    fda_applnos text,
    lactmed_id text,
    legal_status text,
    statute_citation text,
    mpje_relevance text,
    fda_marketing_status text,
    rx_status text,
    primary_source text,
    source_count integer,
    parent_moiety_pcid bigint
);


ALTER TABLE public.precise_forms OWNER TO postgres;

--
-- Name: COLUMN precise_forms.parent_moiety_pcid; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.precise_forms.parent_moiety_pcid IS 'Active moiety this active ingredient (salt/hydrate/ester) belongs to. Backfilled from FDA ingredient links (fda_product_ingredients.form_pcid -> moiety_pcid); phase 27a.';


--
-- Name: moiety_hierarchy; Type: MATERIALIZED VIEW; Schema: public; Owner: postgres
--

CREATE MATERIALIZED VIEW public.moiety_hierarchy AS
 WITH base AS (
         SELECT m.pcid AS moiety_pcid,
            upper(m.base_name) AS moiety_base_name
           FROM public.moieties m
          WHERE ((m.term_type = 'Core moiety'::text) AND (m.base_name IS NOT NULL))
        ), salt_re AS (
         SELECT '\s+(HYDROCHLORIDE|HCL|HYDROBROMIDE|SULFATE|SULPHATE|MALEATE|PHOSPHATE|SODIUM|POTASSIUM|CALCIUM|MAGNESIUM|CITRATE|TARTRATE|SUCCINATE|MESYLATE|FUMARATE|ACETATE|BESYLATE|BENZOATE|GLUCONATE|LACTATE|NITRATE|OXALATE|PALMITATE|PAMOATE|DECANOATE|ENANTHATE|VALERATE|PROPIONATE|LAUROXIL|ANHYDROUS|MONOHYDRATE|DIHYDRATE|TRIHYDRATE|HEMIHYDRATE|CHLORIDE|BROMIDE)\s*$'::text AS re
        ), pf_segs AS (
         SELECT pf.pcid,
            pf.term_type,
            pf.primary_brand,
            TRIM(BOTH FROM seg.seg) AS segment,
            regexp_replace(TRIM(BOTH FROM seg.seg), ( SELECT salt_re.re
                   FROM salt_re), ''::text, 'gi'::text) AS stripped,
            ( SELECT count(*) AS count
                   FROM unnest(regexp_split_to_array(upper(pf.base_name), '\s*(,| AND )\s*'::text)) s2(x)
                  WHERE (TRIM(BOTH FROM regexp_replace(s2.x, '\m(MONOBASIC|DIBASIC|TRIBASIC|ANHYDROUS|MONOHYDRATE|DIHYDRATE|TRIHYDRATE|HEPTAHYDRATE|HEMIHYDRATE|HYDRATE|MACROCRYSTALLINE|MACROCRYSTALS|MICROCRYSTALLINE|MICRONIZED|DRIED|USP)\M'::text, ''::text, 'g'::text)) <> ''::text)) AS n_ingredients
           FROM (public.precise_forms pf
             CROSS JOIN LATERAL unnest(regexp_split_to_array(upper(pf.base_name), '\s*(,| AND )\s*'::text)) seg(seg))
          WHERE (pf.base_name IS NOT NULL)
        ), triple_f AS (
         SELECT cs.subject_pcid AS pcid,
            cs.object_pcid AS moiety_pcid,
            count(*) OVER (PARTITION BY cs.subject_pcid) AS n_components
           FROM ((public.clinical_statements cs
             JOIN public.entities s ON (((s.pcid = cs.subject_pcid) AND (s.entity_type = 'formulation'::text))))
             JOIN public.entities o ON (((o.pcid = cs.object_pcid) AND (o.entity_type = 'moiety'::text))))
          WHERE (cs.predicate = 'has_component'::text)
        ), f_segs AS (
         SELECT f.pcid,
            f.term_type,
            f.primary_brand,
            TRIM(BOTH FROM seg.seg) AS segment,
            regexp_replace(TRIM(BOTH FROM seg.seg), ( SELECT salt_re.re
                   FROM salt_re), ''::text, 'gi'::text) AS stripped,
            (array_length(regexp_split_to_array(upper(f.base_name), '\s*(,| AND )\s*'::text), 1) = 1) AS single_ingredient
           FROM (public.formulations f
             CROSS JOIN LATERAL unnest(regexp_split_to_array(upper(f.base_name), '\s*(,| AND )\s*'::text)) seg(seg))
          WHERE ((f.base_name IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
                   FROM triple_f t
                  WHERE (t.pcid = f.pcid)))))
        ), c_segs AS (
         SELECT c.pcid,
            c.term_type,
            c.primary_brand,
            TRIM(BOTH FROM seg.seg) AS segment,
            regexp_replace(TRIM(BOTH FROM seg.seg), ( SELECT salt_re.re
                   FROM salt_re), ''::text, 'gi'::text) AS stripped
           FROM (public.combinations c
             CROSS JOIN LATERAL unnest(regexp_split_to_array(upper(c.base_name), '\s*(,| AND )\s*'::text)) seg(seg))
          WHERE (c.base_name IS NOT NULL)
        ), pf_rel AS (
         SELECT b.moiety_pcid,
            pt.pcid,
                CASE
                    WHEN (pt.n_ingredients <= 1) THEN 'precise_form'::text
                    ELSE 'combination'::text
                END AS relation
           FROM (base b
             JOIN pf_segs pt ON ((pt.stripped = b.moiety_base_name)))
        UNION
         SELECT b.moiety_pcid,
            pt.pcid,
                CASE
                    WHEN (pt.n_ingredients <= 1) THEN 'precise_form'::text
                    ELSE 'combination'::text
                END AS "case"
           FROM (base b
             JOIN pf_segs pt ON ((pt.segment = b.moiety_base_name)))
        ), matches AS (
         SELECT r.moiety_pcid,
            e.pcid AS member_pcid,
            e.slug AS member_slug,
            e.name AS member_name,
            pf.term_type AS member_term_type,
            pf.primary_brand,
            r.relation
           FROM ((pf_rel r
             JOIN public.precise_forms pf ON ((pf.pcid = r.pcid)))
             JOIN public.entities e ON ((e.pcid = r.pcid)))
        UNION
         SELECT t.moiety_pcid,
            e.pcid,
            e.slug,
            e.name,
            f.term_type,
            f.primary_brand,
                CASE
                    WHEN (t.n_components = 1) THEN 'formulation'::text
                    ELSE 'combination'::text
                END AS "case"
           FROM ((triple_f t
             JOIN public.formulations f ON ((f.pcid = t.pcid)))
             JOIN public.entities e ON ((e.pcid = t.pcid)))
        UNION
         SELECT b.moiety_pcid,
            e.pcid,
            e.slug,
            e.name,
            ft.term_type,
            ft.primary_brand,
                CASE
                    WHEN ft.single_ingredient THEN 'formulation'::text
                    ELSE 'combination'::text
                END AS "case"
           FROM ((base b
             JOIN f_segs ft ON ((ft.stripped = b.moiety_base_name)))
             JOIN public.entities e ON ((e.pcid = ft.pcid)))
        UNION
         SELECT b.moiety_pcid,
            e.pcid,
            e.slug,
            e.name,
            ft.term_type,
            ft.primary_brand,
                CASE
                    WHEN ft.single_ingredient THEN 'formulation'::text
                    ELSE 'combination'::text
                END AS "case"
           FROM ((base b
             JOIN f_segs ft ON ((ft.segment = b.moiety_base_name)))
             JOIN public.entities e ON ((e.pcid = ft.pcid)))
        UNION
         SELECT b.moiety_pcid,
            e.pcid,
            e.slug,
            e.name,
            ct.term_type,
            ct.primary_brand,
            'combination'::text
           FROM ((base b
             JOIN c_segs ct ON ((ct.stripped = b.moiety_base_name)))
             JOIN public.entities e ON ((e.pcid = ct.pcid)))
        UNION
         SELECT b.moiety_pcid,
            e.pcid,
            e.slug,
            e.name,
            ct.term_type,
            ct.primary_brand,
            'combination'::text
           FROM ((base b
             JOIN c_segs ct ON ((ct.segment = b.moiety_base_name)))
             JOIN public.entities e ON ((e.pcid = ct.pcid)))
        )
 SELECT moiety_pcid,
    member_pcid,
    member_slug,
    member_name,
    member_term_type,
    primary_brand,
    relation
   FROM matches
  WITH NO DATA;


ALTER MATERIALIZED VIEW public.moiety_hierarchy OWNER TO postgres;

--
-- Name: ingredient_moiety_map; Type: MATERIALIZED VIEW; Schema: public; Owner: postgres
--

CREATE MATERIALIZED VIEW public.ingredient_moiety_map AS
 WITH core AS (
         SELECT moieties.pcid,
            upper(TRIM(BOTH FROM moieties.base_name)) AS base,
            moieties.unii
           FROM public.moieties
          WHERE ((moieties.term_type = 'Core moiety'::text) AND (moieties.base_name IS NOT NULL))
        ), salt_rows AS (
         SELECT m.pcid,
            upper(TRIM(BOTH FROM e.name)) AS own_name,
            upper(TRIM(BOTH FROM m.base_name)) AS base
           FROM (public.moieties m
             JOIN public.entities e USING (pcid))
          WHERE (m.term_type IS DISTINCT FROM 'Core moiety'::text)
        ), spl AS (
         SELECT upper(TRIM(BOTH FROM (ai.value ->> 'name'::text))) AS ingredient,
            c.pcid
           FROM (((public.label_documents ld
             CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ld.products_json, '[]'::jsonb)) p(value))
             CROSS JOIN LATERAL jsonb_array_elements(COALESCE((p.value -> 'active_ingredients'::text), '[]'::jsonb)) ai(value))
             JOIN core c ON ((c.unii = (ai.value ->> 'active_moiety_unii'::text))))
          WHERE (((ai.value ->> 'kind'::text) = 'active'::text) AND ((ai.value ->> 'name'::text) IS NOT NULL))
          GROUP BY (upper(TRIM(BOTH FROM (ai.value ->> 'name'::text)))), c.pcid
        ), cands AS (
         SELECT core.base AS ingredient,
            core.pcid,
            1 AS priority
           FROM core
        UNION ALL
         SELECT salt_rows.own_name,
            salt_rows.pcid,
            2
           FROM salt_rows
        UNION ALL
         SELECT s.base,
            s.pcid,
            3
           FROM salt_rows s
          WHERE ((s.base IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
                   FROM core c
                  WHERE (c.base = s.base)))))
        UNION ALL
         SELECT spl.ingredient,
            spl.pcid,
            4
           FROM spl
        UNION ALL
         SELECT upper(TRIM(BOTH FROM pf.base_name)) AS upper,
            mh.moiety_pcid,
            5
           FROM (public.moiety_hierarchy mh
             JOIN public.precise_forms pf ON ((pf.pcid = mh.member_pcid)))
          WHERE ((mh.relation = 'precise_form'::text) AND (pf.base_name IS NOT NULL))
        ), ranked AS (
         SELECT cands.ingredient,
            cands.pcid,
            min(cands.priority) AS priority,
            count(*) OVER (PARTITION BY cands.ingredient, (min(cands.priority))) AS n_at_priority
           FROM cands
          WHERE (cands.ingredient IS NOT NULL)
          GROUP BY cands.ingredient, cands.pcid
        ), best AS (
         SELECT DISTINCT ON (ranked.ingredient) ranked.ingredient,
            ranked.pcid,
            ranked.priority,
            ranked.n_at_priority
           FROM ranked
          ORDER BY ranked.ingredient, ranked.priority
        )
 SELECT ingredient,
    pcid AS moiety_pcid,
        CASE priority
            WHEN 1 THEN 'moiety_name'::text
            WHEN 2 THEN 'salt_row_name'::text
            WHEN 3 THEN 'salt_row_base'::text
            WHEN 4 THEN 'spl_active_moiety'::text
            ELSE 'precise_form'::text
        END AS basis
   FROM best
  WHERE (n_at_priority = 1)
  WITH NO DATA;


ALTER MATERIALIZED VIEW public.ingredient_moiety_map OWNER TO postgres;

--
-- Name: rxnorm_brands; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rxnorm_brands (
    pcid bigint NOT NULL,
    brand text NOT NULL,
    brand_rxcui text NOT NULL,
    ingredient_rxcuis text[] NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.rxnorm_brands OWNER TO postgres;

--
-- Name: rxnorm_lookup; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rxnorm_lookup (
    pcid bigint NOT NULL,
    unii text,
    rxcui text,
    status text NOT NULL,
    n_brands integer DEFAULT 0 NOT NULL,
    detail text,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    pass smallint DEFAULT 1 NOT NULL
);


ALTER TABLE public.rxnorm_lookup OWNER TO postgres;

--
-- Name: COLUMN rxnorm_lookup.pass; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.rxnorm_lookup.pass IS '1 = original UNII/name lookup; 2 = salt-row pass (may have fallen back to the base IN). Pass-2 rows sharing an rxcui with another pcid do not get single-ingredient brands.';


--
-- Name: entity_brand_names; Type: MATERIALIZED VIEW; Schema: public; Owner: postgres
--

CREATE MATERIALIZED VIEW public.entity_brand_names AS
 WITH fda_ing AS (
         SELECT p.product_id,
            p.appl_no,
            upper(TRIM(BOTH FROM p.brand_name)) AS brand,
            p.marketing_status,
            upper(TRIM(BOTH FROM (ai.value ->> 'name'::text))) AS ingredient
           FROM (public.fda_products p
             CROSS JOIN LATERAL jsonb_array_elements(COALESCE((p.raw -> 'active_ingredients'::text), '[]'::jsonb)) ai(value))
          WHERE ((p.brand_name IS NOT NULL) AND (p.appl_no ~ '^(NDA|BLA)'::text))
        ), fda_mapped AS (
         SELECT fi.product_id,
            fi.appl_no,
            fi.brand,
            fi.marketing_status,
            fi.ingredient,
            COALESCE(m1.moiety_pcid, m2.moiety_pcid, m3.moiety_pcid) AS moiety_pcid
           FROM (((fda_ing fi
             LEFT JOIN public.ingredient_moiety_map m1 ON ((m1.ingredient = fi.ingredient)))
             LEFT JOIN public.ingredient_moiety_map m2 ON (((m1.moiety_pcid IS NULL) AND (m2.ingredient = public.norm_ingredient(fi.ingredient)))))
             LEFT JOIN public.ingredient_moiety_map m3 ON (((m1.moiety_pcid IS NULL) AND (m2.moiety_pcid IS NULL) AND (m3.ingredient = public.norm_ingredient(fi.ingredient, true)))))
        ), fda_products_mapped AS (
         SELECT fda_mapped.product_id,
            fda_mapped.appl_no,
            fda_mapped.brand,
            fda_mapped.marketing_status,
            array_agg(DISTINCT fda_mapped.moiety_pcid ORDER BY fda_mapped.moiety_pcid) FILTER (WHERE (fda_mapped.moiety_pcid IS NOT NULL)) AS moieties,
            count(*) FILTER (WHERE (fda_mapped.moiety_pcid IS NULL)) AS unmapped
           FROM fda_mapped
          GROUP BY fda_mapped.product_id, fda_mapped.appl_no, fda_mapped.brand, fda_mapped.marketing_status
        ), fda_by_set AS (
         SELECT fda_products_mapped.moieties,
            fda_products_mapped.brand,
            bool_or((fda_products_mapped.marketing_status = ANY (ARRAY['Prescription'::text, 'Over-the-counter'::text]))) AS marketed,
            array_agg(DISTINCT fda_products_mapped.appl_no ORDER BY fda_products_mapped.appl_no) AS appl_nos
           FROM fda_products_mapped
          WHERE ((fda_products_mapped.unmapped = 0) AND (fda_products_mapped.moieties IS NOT NULL))
          GROUP BY fda_products_mapped.moieties, fda_products_mapped.brand
        ), rx_in AS (
         SELECT DISTINCT ON (l.rxcui) l.rxcui,
            l.pcid
           FROM (public.rxnorm_lookup l
             JOIN public.moieties m USING (pcid))
          WHERE ((l.status = 'ok'::text) AND (l.rxcui IS NOT NULL))
          ORDER BY l.rxcui, l.pass, (m.term_type = 'Core moiety'::text) DESC, l.pcid
        ), rx_single AS (
         SELECT ARRAY[rb.pcid] AS moieties,
            min(rb.brand) AS brand_display,
            min(rb.brand_rxcui) AS brand_rxcui
           FROM public.rxnorm_brands rb
          WHERE ((cardinality(rb.ingredient_rxcuis) = 1) AND (NOT (EXISTS ( SELECT 1
                   FROM (public.rxnorm_lookup l1
                     JOIN public.rxnorm_lookup l2 ON (((l2.rxcui = l1.rxcui) AND (l2.pcid <> l1.pcid) AND (l2.status = 'ok'::text))))
                  WHERE ((l1.pcid = rb.pcid) AND (l1.pass = 2))))))
          GROUP BY rb.pcid, (upper(rb.brand))
        ), rx_multi AS (
         SELECT DISTINCT ON (rb.brand_rxcui) rb.brand_rxcui,
            rb.brand AS brand_display,
            ( SELECT array_agg(DISTINCT ri.pcid ORDER BY ri.pcid) AS array_agg
                   FROM (unnest(rb.ingredient_rxcuis) x(rxcui)
                     JOIN rx_in ri USING (rxcui))) AS moieties,
            cardinality(rb.ingredient_rxcuis) AS n_ingredients
           FROM public.rxnorm_brands rb
          WHERE (cardinality(rb.ingredient_rxcuis) > 1)
        ), rx_ok AS (
         SELECT rx_single.moieties,
            rx_single.brand_display,
            rx_single.brand_rxcui
           FROM rx_single
        UNION ALL
         SELECT rx_multi.moieties,
            rx_multi.brand_display,
            rx_multi.brand_rxcui
           FROM rx_multi
          WHERE (cardinality(rx_multi.moieties) = rx_multi.n_ingredients)
        ), merged AS (
         SELECT COALESCE(f.moieties, r.moieties) AS moieties,
            COALESCE(upper(r.brand_display), f.brand) AS brand_key,
            r.brand_display,
            f.marketed,
            COALESCE(f.appl_nos, '{}'::text[]) AS appl_nos,
            r.brand_rxcui,
            array_remove(ARRAY[
                CASE
                    WHEN (f.brand IS NOT NULL) THEN 'drugsfda'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN (r.brand_rxcui IS NOT NULL) THEN 'rxnorm'::text
                    ELSE NULL::text
                END], NULL::text) AS sources
           FROM (fda_by_set f
             FULL JOIN rx_ok r ON (((r.moieties = f.moieties) AND (upper(r.brand_display) = f.brand))))
        ), combo_sets AS (
         SELECT moiety_hierarchy.member_pcid AS pcid,
            array_agg(DISTINCT moiety_hierarchy.moiety_pcid ORDER BY moiety_hierarchy.moiety_pcid) AS moieties
           FROM public.moiety_hierarchy
          WHERE ((moiety_hierarchy.relation = 'combination'::text) AND (moiety_hierarchy.member_pcid < 4000000))
          GROUP BY moiety_hierarchy.member_pcid
        ), targets AS (
         SELECT m.moieties,
            m.brand_key,
            m.brand_display,
            m.marketed,
            m.appl_nos,
            m.brand_rxcui,
            m.sources,
            m.moieties[1] AS pcid,
            'moiety'::text AS kind
           FROM merged m
          WHERE (cardinality(m.moieties) = 1)
        UNION ALL
         SELECT m.moieties,
            m.brand_key,
            m.brand_display,
            m.marketed,
            m.appl_nos,
            m.brand_rxcui,
            m.sources,
            cs.pcid,
            'combination'::text AS text
           FROM (merged m
             JOIN combo_sets cs ON ((cs.moieties = m.moieties)))
          WHERE (cardinality(m.moieties) > 1)
        ), filtered AS (
         SELECT t.moieties,
            t.brand_key,
            t.brand_display,
            t.marketed,
            t.appl_nos,
            t.brand_rxcui,
            t.sources,
            t.pcid,
            t.kind
           FROM targets t
          WHERE (NOT (EXISTS ( SELECT 1
                   FROM public.moieties mo
                  WHERE ((mo.pcid = ANY (t.moieties)) AND (mo.base_name IS NOT NULL) AND (length(mo.base_name) > 3) AND (POSITION((upper(mo.base_name)) IN (t.brand_key)) > 0)))))
        ), deduped AS (
         SELECT DISTINCT ON (filtered.pcid, filtered.brand_key) filtered.moieties,
            filtered.brand_key,
            filtered.brand_display,
            filtered.marketed,
            filtered.appl_nos,
            filtered.brand_rxcui,
            filtered.sources,
            filtered.pcid,
            filtered.kind
           FROM filtered
          ORDER BY filtered.pcid, filtered.brand_key, (cardinality(filtered.sources)) DESC, filtered.marketed DESC NULLS LAST
        ), curated AS (
         SELECT x.pcid,
            x.kind,
            upper(TRIM(BOTH FROM x.primary_brand)) AS brand_key
           FROM ( SELECT moieties.pcid,
                    'moiety'::text AS kind,
                    moieties.primary_brand
                   FROM public.moieties
                  WHERE (moieties.primary_brand IS NOT NULL)
                UNION ALL
                 SELECT combinations.pcid,
                    'combination'::text AS text,
                    combinations.primary_brand
                   FROM public.combinations
                  WHERE (combinations.primary_brand IS NOT NULL)) x
        )
 SELECT deduped.pcid,
    deduped.kind,
    deduped.brand_key,
    deduped.brand_display,
    deduped.marketed,
    deduped.appl_nos,
    deduped.brand_rxcui,
    deduped.sources
   FROM deduped
UNION ALL
 SELECT c.pcid,
    c.kind,
    c.brand_key,
    NULL::text AS brand_display,
    NULL::boolean AS marketed,
    '{}'::text[] AS appl_nos,
    NULL::text AS brand_rxcui,
    ARRAY['drug_matrix'::text] AS sources
   FROM curated c
  WHERE (NOT (EXISTS ( SELECT 1
           FROM deduped d
          WHERE ((d.pcid = c.pcid) AND (d.brand_key = c.brand_key)))))
  WITH NO DATA;


ALTER MATERIALIZED VIEW public.entity_brand_names OWNER TO postgres;

--
-- Name: catalog_entries; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.catalog_entries WITH (security_invoker='true') AS
 SELECT e.pcid,
    e.slug,
    e.name,
    e.entity_type,
    COALESCE(m.primary_brand, c.primary_brand, p.primary_brand, f.primary_brand) AS primary_brand,
    COALESCE(m.controlled_schedule, c.controlled_schedule, p.controlled_schedule, f.controlled_schedule) AS controlled_schedule,
    COALESCE(m.is_controlled, c.is_controlled, p.is_controlled, f.is_controlled) AS is_controlled,
    ( SELECT array_agg(x.n ORDER BY x.unmarketed, x.n) AS array_agg
           FROM ( SELECT u.n,
                    bool_or(u.unmarketed) AS unmarketed
                   FROM ( SELECT COALESCE(b.brand_display, b.brand_key) AS n,
                            (b.marketed IS FALSE) AS unmarketed
                           FROM public.entity_brand_names b
                          WHERE (b.pcid = e.pcid)
                        UNION ALL
                         SELECT COALESCE(b.brand_display, b.brand_key) AS "coalesce",
                            (b.marketed IS FALSE)
                           FROM (public.moieties s
                             JOIN public.entity_brand_names b ON ((b.pcid = s.pcid)))
                          WHERE ((s.synonym_of_pcid = e.pcid) AND (s.term_type <> 'Core moiety'::text))
                        UNION ALL
                         SELECT se.name,
                            false
                           FROM (public.moieties s
                             JOIN public.entities se ON ((se.pcid = s.pcid)))
                          WHERE ((s.synonym_of_pcid = e.pcid) AND (s.term_type <> 'Core moiety'::text))) u
                  GROUP BY u.n) x) AS brand_names
   FROM ((((public.entities e
     LEFT JOIN public.moieties m ON ((m.pcid = e.pcid)))
     LEFT JOIN public.combinations c ON ((c.pcid = e.pcid)))
     LEFT JOIN public.precise_forms p ON ((p.pcid = e.pcid)))
     LEFT JOIN public.formulations f ON ((f.pcid = e.pcid)))
  WHERE ((e.pcid >= 1000001) AND (e.pcid <= 4999999) AND (NOT ((m.pcid IS NOT NULL) AND (m.term_type <> 'Core moiety'::text) AND (NOT ((m.term_type = 'Salt form'::text) AND (m.synonym_of_pcid IS NULL))))));


ALTER VIEW public.catalog_entries OWNER TO postgres;

--
-- Name: chemont_links; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chemont_links (
    pcid bigint NOT NULL,
    chemont_id text NOT NULL,
    ord smallint NOT NULL
);


ALTER TABLE public.chemont_links OWNER TO postgres;

--
-- Name: chemont_terms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chemont_terms (
    chemont_id text NOT NULL,
    name text NOT NULL,
    parent_id text,
    definition text
);


ALTER TABLE public.chemont_terms OWNER TO postgres;

--
-- Name: citation_sources; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.citation_sources (
    key text NOT NULL,
    kind text NOT NULL,
    title text,
    authors text,
    container text,
    year integer,
    volume text,
    issue text,
    pages text,
    doi text,
    pmid text,
    setid text,
    url text,
    resolved boolean DEFAULT false NOT NULL,
    retrieved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT citation_sources_key_check CHECK ((key ~ '^(pmid:\d{1,9}|doi:10\.\d{4,9}/\S+|dailymed:[0-9a-f-]{36}|url:https?://\S+|[a-z0-9][a-z0-9-]{1,80})$'::text)),
    CONSTRAINT citation_sources_kind_check CHECK ((kind = ANY (ARRAY['pmid'::text, 'doi'::text, 'dailymed'::text, 'url'::text, 'ref'::text])))
);


ALTER TABLE public.citation_sources OWNER TO postgres;

--
-- Name: TABLE citation_sources; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.citation_sources IS 'Sources cited with [@key] in page text and structured blocks (phase 16b). Metadata from PubMed, Crossref or DailyMed at first citation.';


--
-- Name: class_agent_review; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.class_agent_review (
    member_pcid bigint NOT NULL,
    class_slug text NOT NULL,
    confidence text NOT NULL,
    basis text,
    source_url text,
    batch integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT class_agent_review_confidence_check CHECK ((confidence = ANY (ARRAY['high'::text, 'medium'::text])))
);


ALTER TABLE public.class_agent_review OWNER TO postgres;

--
-- Name: class_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.class_members (
    class_pcid bigint NOT NULL,
    member_pcid bigint NOT NULL,
    is_direct boolean DEFAULT true NOT NULL,
    source_system text NOT NULL,
    match_basis text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.class_members OWNER TO postgres;

--
-- Name: drug_classes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.drug_classes (
    pcid bigint NOT NULL,
    moa text,
    pe text,
    cs text,
    source_agency text,
    source_ref text,
    class_type text,
    source_system text,
    source_code text,
    parent_pcid bigint,
    level smallint,
    description text,
    member_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT drug_classes_class_type_chk CHECK (((class_type IS NULL) OR (class_type = ANY (ARRAY['epc'::text, 'moa'::text, 'pe'::text, 'chem'::text, 'atc'::text, 'va'::text, 'chemont'::text, 'curated'::text, 'community'::text]))))
);


ALTER TABLE public.drug_classes OWNER TO postgres;

--
-- Name: class_catalog; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.class_catalog AS
 SELECT e.slug,
    e.name,
    d.class_type,
    d.source_code,
    d.level,
    ( SELECT count(*) AS count
           FROM public.class_members m
          WHERE (m.class_pcid = d.pcid)) AS members
   FROM (public.drug_classes d
     JOIN public.entities e USING (pcid))
  WHERE (d.class_type = ANY (ARRAY['atc'::text, 'epc'::text, 'moa'::text, 'pe'::text, 'chem'::text, 'va'::text, 'curated'::text, 'chemont'::text]));


ALTER VIEW public.class_catalog OWNER TO postgres;

--
-- Name: class_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.class_rules (
    code text NOT NULL,
    name text NOT NULL,
    parent_code text,
    pattern text,
    exclude text,
    description text,
    sort integer,
    fallback_only boolean DEFAULT false NOT NULL
);


ALTER TABLE public.class_rules OWNER TO postgres;

--
-- Name: class_search_aliases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.class_search_aliases (
    alias_key text NOT NULL,
    class_pcid bigint NOT NULL,
    alias text NOT NULL,
    source text DEFAULT 'curated'::text NOT NULL
);


ALTER TABLE public.class_search_aliases OWNER TO postgres;

--
-- Name: TABLE class_search_aliases; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.class_search_aliases IS 'Search abbreviations for drug classes (SSRI, NSAID, ARB, …). Curated starter set 2026-09-25 — reviewable by Joshua; add rows rather than hard-coding aliases in the frontend.';


--
-- Name: classyfire_lookup; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.classyfire_lookup (
    pcid bigint NOT NULL,
    inchi_key text,
    key_basis text,
    status text NOT NULL,
    n_terms integer,
    detail text,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.classyfire_lookup OWNER TO postgres;

--
-- Name: clinical_concepts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.clinical_concepts (
    pcid bigint NOT NULL,
    concept_type text,
    source_ref text
);


ALTER TABLE public.clinical_concepts OWNER TO postgres;

--
-- Name: clinical_statements_statement_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.clinical_statements_statement_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.clinical_statements_statement_id_seq OWNER TO postgres;

--
-- Name: clinical_statements_statement_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.clinical_statements_statement_id_seq OWNED BY public.clinical_statements.statement_id;


--
-- Name: combination_brand_index; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.combination_brand_index WITH (security_invoker='true') AS
 SELECT DISTINCT ON (b.brand_key) b.brand_key,
    COALESCE(b.brand_display, b.brand_key) AS brand,
    e.pcid,
    e.slug,
    e.name
   FROM (public.entity_brand_names b
     JOIN public.entities e ON ((e.pcid = b.pcid)))
  WHERE (b.kind = 'combination'::text)
  ORDER BY b.brand_key, (b.marketed IS FALSE), e.pcid;


ALTER VIEW public.combination_brand_index OWNER TO postgres;

--
-- Name: community_pages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.community_pages (
    pcid bigint NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    patrol_status text DEFAULT 'unpatrolled'::text NOT NULL,
    patrolled_by uuid,
    patrolled_at timestamp with time zone,
    CONSTRAINT community_pages_patrol_status_check CHECK ((patrol_status = ANY (ARRAY['unpatrolled'::text, 'patrolled'::text, 'merged'::text])))
);


ALTER TABLE public.community_pages OWNER TO postgres;

--
-- Name: community_statements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.community_statements (
    id bigint NOT NULL,
    subject_pcid bigint NOT NULL,
    block_name text NOT NULL,
    predicate text NOT NULL,
    object_text text NOT NULL,
    object_pcid bigint,
    effect text NOT NULL,
    citations text[] NOT NULL,
    "position" integer NOT NULL,
    revision_id bigint NOT NULL,
    is_current boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT community_statements_citations_check CHECK ((cardinality(citations) > 0)),
    CONSTRAINT community_statements_effect_check CHECK (((length(TRIM(BOTH FROM effect)) >= 1) AND (length(TRIM(BOTH FROM effect)) <= 1000))),
    CONSTRAINT community_statements_object_text_check CHECK (((length(TRIM(BOTH FROM object_text)) >= 1) AND (length(TRIM(BOTH FROM object_text)) <= 200)))
);


ALTER TABLE public.community_statements OWNER TO postgres;

--
-- Name: TABLE community_statements; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.community_statements IS 'Community-written relationships from :::interactions (phase 16d). Shown beside clinical_statements, never merged into it. Current rows = the live page.';


--
-- Name: community_statements_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.community_statements ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.community_statements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: contributor_blocks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.contributor_blocks (
    user_id uuid NOT NULL,
    reason text NOT NULL,
    blocked_by uuid,
    blocked_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone
);


ALTER TABLE public.contributor_blocks OWNER TO postgres;

--
-- Name: contributor_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.contributor_profiles (
    user_id uuid NOT NULL,
    handle text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    display_credential boolean DEFAULT true NOT NULL,
    CONSTRAINT contributor_profiles_handle_check CHECK ((handle ~ '^[A-Za-z0-9_.-]{3,30}$'::text))
);


ALTER TABLE public.contributor_profiles OWNER TO postgres;

--
-- Name: data_sources; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.data_sources (
    source_key text NOT NULL,
    name text NOT NULL,
    publisher text,
    url text,
    license text,
    terms_url text,
    kind text NOT NULL,
    note text,
    CONSTRAINT data_sources_kind_check CHECK ((kind = ANY (ARRAY['external'::text, 'curated'::text, 'derived'::text, 'machine_assisted'::text])))
);


ALTER TABLE public.data_sources OWNER TO postgres;

--
-- Name: dictionary_terms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dictionary_terms (
    id integer NOT NULL,
    term text NOT NULL,
    definition text,
    kind text NOT NULL,
    term_type text,
    bucket text NOT NULL,
    sort_key text NOT NULL,
    member_pcid bigint,
    pcid_match text,
    source_pcid bigint,
    source_letter text,
    source_tjc_flag boolean DEFAULT false NOT NULL,
    in_dic boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dictionary_terms_kind_check CHECK ((kind = ANY (ARRAY['Term'::text, 'Abbreviation'::text, 'Grammar'::text]))),
    CONSTRAINT dictionary_terms_pcid_match_check CHECK ((pcid_match = ANY (ARRAY['source'::text, 'name'::text, 'brand'::text, 'definition'::text])))
);


ALTER TABLE public.dictionary_terms OWNER TO postgres;

--
-- Name: TABLE dictionary_terms; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.dictionary_terms IS 'Medical terminology, abbreviations and drug/brand names for the /tools/dictionary page and its Word .dic download. member_pcid links drug terms to their entity.';


--
-- Name: COLUMN dictionary_terms.in_dic; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.dictionary_terms.in_dic IS 'False keeps a row out of the .dic download. Every row is true at load (Joshua, 2026-10-03: include everything, Do Not Use abbreviations too).';


--
-- Name: entity_changes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.entity_changes (
    change_id bigint NOT NULL,
    pcid bigint NOT NULL,
    table_name text NOT NULL,
    op text NOT NULL,
    row_key text,
    changed_fields text[] NOT NULL,
    diff jsonb NOT NULL,
    source text DEFAULT 'direct'::text NOT NULL,
    revision_id bigint,
    actor uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entity_changes_op_check CHECK ((op = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);


ALTER TABLE public.entity_changes OWNER TO postgres;

--
-- Name: TABLE entity_changes; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.entity_changes IS 'Append-only, trigger-written field-level history of every PCID. Read publicly only through api_entity_changes(), which omits actor. Tag bulk writes with SET LOCAL pc.change_source.';


--
-- Name: entity_changes_change_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.entity_changes ALTER COLUMN change_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.entity_changes_change_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: entity_guidelines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.entity_guidelines (
    pcid bigint NOT NULL,
    guideline_id bigint NOT NULL,
    context text,
    sort_order integer DEFAULT 100 NOT NULL
);


ALTER TABLE public.entity_guidelines OWNER TO postgres;

--
-- Name: TABLE entity_guidelines; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.entity_guidelines IS 'Which guidelines apply to which entity, with a one-line context shown on the drug page.';


--
-- Name: label_document_formulations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.label_document_formulations (
    setid text NOT NULL,
    pcid bigint NOT NULL,
    match_basis text NOT NULL
);


ALTER TABLE public.label_document_formulations OWNER TO postgres;

--
-- Name: TABLE label_document_formulations; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.label_document_formulations IS 'Resolves which formulations.pcid a given DailyMed label document (setid) applies to, matched via NDC (preferred) or UNII rollup. match_basis records how the link was made (e.g. ndc, unii_rollup).';


--
-- Name: entity_label_rank; Type: MATERIALIZED VIEW; Schema: public; Owner: postgres
--

CREATE MATERIALIZED VIEW public.entity_label_rank AS
 WITH doc_act AS (
         SELECT ld.setid,
            count(DISTINCT (ai.value ->> 'active_moiety_unii'::text)) AS n_active_moieties
           FROM ((public.label_documents ld
             CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ld.products_json, '[]'::jsonb)) p(value))
             CROSS JOIN LATERAL jsonb_array_elements(COALESCE((p.value -> 'active_ingredients'::text), '[]'::jsonb)) ai(value))
          WHERE ((ai.value ->> 'kind'::text) = 'active'::text)
          GROUP BY ld.setid
        ), base AS (
         SELECT ldf.pcid,
            e.entity_type,
            ld.setid,
            ld.title,
            ld.labeler,
            ld.effective_time,
            ld.document_type_display,
            COALESCE(da.n_active_moieties, (0)::bigint) AS n_active_moieties,
            ((COALESCE(ld.title, ''::text) ~~* 'these highlights%'::text) OR (COALESCE(ld.document_type_display, ''::text) ~* '(highlight|plr)'::text)) AS is_plr,
            (COALESCE(ld.labeler, ''::text) ~* '(repack|a-s medication|nucare|blenheim|proficient rx|bryant ranch|direct[_ -]?rx|preferred pharmaceuticals|quality care|pd-rx|aphena|henry schein|lake erie medical|st\.? mary|rebel distributors|medsource|unit dose|american health packaging|major pharmaceuticals|cardinal health|mckesson|golden state medical|aidarex|denton pharma|northwind|asclemed|enovachem|coupler|advanced rx|lifestar|safecor|chartwell rx|marlex|avkare|avpak|readymeds|clinical solutions wholesale|keltman|altura|state of florida doh|dispensing solutions|physicians total care|stat rx|legacy pharmaceutical packaging|contract pharmacy services|h\.j\. harkins|sky packaging|precision dose|atlantic biologicals|medvantx|medical purchasing solutions|nubratori|quallent)'::text) AS is_repackager
           FROM (((public.label_document_formulations ldf
             JOIN public.entities e ON ((e.pcid = ldf.pcid)))
             JOIN public.label_documents ld ON ((ld.setid = ldf.setid)))
             LEFT JOIN doc_act da ON ((da.setid = ld.setid)))
        ), ranked AS (
         SELECT b.pcid,
            b.entity_type,
            b.setid,
            b.title,
            b.labeler,
            b.effective_time,
            b.document_type_display,
            b.n_active_moieties,
            b.is_plr,
            b.is_repackager,
            row_number() OVER (PARTITION BY b.pcid ORDER BY
                CASE
                    WHEN (b.entity_type = 'combination'::text) THEN (b.n_active_moieties > 1)
                    ELSE (b.n_active_moieties = 1)
                END DESC, b.is_plr DESC, b.is_repackager, b.effective_time DESC NULLS LAST, b.setid) AS rnk,
            count(*) OVER (PARTITION BY b.pcid) AS n_labels
           FROM base b
        )
 SELECT pcid,
    entity_type,
    setid,
    title,
    labeler,
    effective_time,
    document_type_display,
    n_active_moieties,
    is_plr,
    is_repackager,
    rnk,
    n_labels
   FROM ranked
  WHERE (rnk <= 5)
  WITH NO DATA;


ALTER MATERIALIZED VIEW public.entity_label_rank OWNER TO postgres;

--
-- Name: MATERIALIZED VIEW entity_label_rank; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON MATERIALIZED VIEW public.entity_label_rank IS 'Top-5 ranked SPL labels per entity (single-ingredient > PLR format > manufacturer over repackager > newest). Read by the label-text edge function (service role). Refresh after label loads: refresh materialized view concurrently public.entity_label_rank;';


--
-- Name: entity_labels; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.entity_labels WITH (security_invoker='true') AS
 SELECT e.pcid,
    e.slug,
    e.entity_type,
    e.name AS entity_name,
    ldf.match_basis,
    ld.setid,
    ld.title AS label_title,
    ld.labeler,
    ld.document_type_display,
    ld.effective_time,
    ld.n_products
   FROM ((public.label_document_formulations ldf
     JOIN public.entities e ON ((e.pcid = ldf.pcid)))
     JOIN public.label_documents ld ON ((ld.setid = ldf.setid)));


ALTER VIEW public.entity_labels OWNER TO postgres;

--
-- Name: VIEW entity_labels; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW public.entity_labels IS 'Per-slug view of which DailyMed label documents apply to an entity (moiety/precise_form/combination), matched via UNII rollup (match_basis=''unii'') or product NDC (match_basis=''ndc''). Join to label_sections on setid for section content, and fetch full section text from the label-sections Storage bucket at {setid}.json.';


--
-- Name: fda_applications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fda_applications (
    appl_no text NOT NULL,
    application_type text,
    sponsor_name text,
    pcid bigint,
    raw jsonb NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.fda_applications OWNER TO postgres;

--
-- Name: TABLE fda_applications; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.fda_applications IS 'One row per FDA application number from openFDA drugsfda. pcid is NULL until the matching pass links it via fda_applnos/ndc_codes on the block 1-4 satellite tables — never populated by the ingestion script itself.';


--
-- Name: fda_product_ingredients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fda_product_ingredients (
    product_id text NOT NULL,
    ingredient_no smallint NOT NULL,
    ingredient_name text NOT NULL,
    strength text,
    unii text,
    moiety_unii text,
    moiety_pcid bigint,
    form_pcid bigint,
    match_basis text,
    active_moiety_pcid bigint,
    CONSTRAINT fda_product_ingredients_match_basis_check CHECK ((match_basis = ANY (ARRAY['dailymed_moiety_unii'::text, 'dailymed_unii'::text, 'openfda_unii'::text, 'name'::text, 'name_exact'::text, 'name_salt_stripped'::text])))
);


ALTER TABLE public.fda_product_ingredients OWNER TO postgres;

--
-- Name: TABLE fda_product_ingredients; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.fda_product_ingredients IS 'Active ingredients of each Drugs@FDA product resolved to PCIDs. match_basis records how: DailyMed SPL active-moiety UNII (preferred), DailyMed ingredient UNII, openFDA application UNII, or name.';


--
-- Name: COLUMN fda_product_ingredients.moiety_pcid; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.fda_product_ingredients.moiety_pcid IS 'Pharmacist-facing moiety: exact core-moiety name > salt-stripped core-moiety name (never a bare element/ion) > exact non-core name > salt-stripped name > UNII.';


--
-- Name: COLUMN fda_product_ingredients.active_moiety_pcid; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.fda_product_ingredients.active_moiety_pcid IS 'FDA active moiety (DailyMed SPL active-moiety UNII). May differ from moiety_pcid: esters/prodrugs resolve to the parent, inorganic salts to the ion.';


--
-- Name: federal_controlled_substances; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.federal_controlled_substances (
    id bigint NOT NULL,
    drug_name text NOT NULL,
    brand_names text,
    control_status text NOT NULL,
    schedule_num smallint GENERATED ALWAYS AS (
CASE control_status
    WHEN 'Schedule I'::text THEN 1
    WHEN 'Schedule II'::text THEN 2
    WHEN 'Schedule III'::text THEN 3
    WHEN 'Schedule IV'::text THEN 4
    WHEN 'Schedule V'::text THEN 5
    ELSE NULL::integer
END) STORED,
    importance text DEFAULT 'Low'::text NOT NULL,
    dea_cscn integer,
    narcotic boolean,
    other_names text,
    source_page integer,
    pcid bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT federal_controlled_substances_control_status_check CHECK ((control_status = ANY (ARRAY['Schedule I'::text, 'Schedule II'::text, 'Schedule III'::text, 'Schedule IV'::text, 'Schedule V'::text]))),
    CONSTRAINT federal_controlled_substances_importance_check CHECK ((importance = ANY (ARRAY['High'::text, 'Medium'::text, 'Low'::text])))
);


ALTER TABLE public.federal_controlled_substances OWNER TO postgres;

--
-- Name: federal_controlled_substances_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.federal_controlled_substances ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.federal_controlled_substances_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: functional_groups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.functional_groups (
    pcid bigint NOT NULL,
    group_type text,
    common_name text,
    family text,
    genus text,
    species text,
    part_used text,
    traditional_use text,
    derived_drug text
);


ALTER TABLE public.functional_groups OWNER TO postgres;

--
-- Name: guidelines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.guidelines (
    guideline_id bigint NOT NULL,
    title text NOT NULL,
    short_title text NOT NULL,
    organization text NOT NULL,
    pub_year integer NOT NULL,
    url text NOT NULL,
    citation text,
    superseded_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT guidelines_pub_year_check CHECK (((pub_year >= 1950) AND (pub_year <= 2100))),
    CONSTRAINT guidelines_url_check CHECK ((url ~ '^https://'::text))
);


ALTER TABLE public.guidelines OWNER TO postgres;

--
-- Name: TABLE guidelines; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.guidelines IS 'Clinical practice guidelines (title, issuer, year, canonical URL). Linked to drugs via entity_guidelines.';


--
-- Name: guidelines_guideline_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.guidelines_guideline_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.guidelines_guideline_id_seq OWNER TO postgres;

--
-- Name: guidelines_guideline_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.guidelines_guideline_id_seq OWNED BY public.guidelines.guideline_id;


--
-- Name: infobox_edits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.infobox_edits (
    id bigint NOT NULL,
    pcid bigint NOT NULL,
    property_key text NOT NULL,
    value text,
    citation text NOT NULL,
    summary text NOT NULL,
    is_current boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    patrol_status text DEFAULT 'unpatrolled'::text NOT NULL,
    patrolled_by uuid,
    patrolled_at timestamp with time zone,
    review_note text,
    is_null_override boolean DEFAULT false NOT NULL,
    revision_id bigint,
    CONSTRAINT infobox_edits_citation_check CHECK ((length(TRIM(BOTH FROM citation)) > 0)),
    CONSTRAINT infobox_edits_null_override CHECK (((NOT is_null_override) OR (value IS NULL))),
    CONSTRAINT infobox_edits_patrol_status_check CHECK ((patrol_status = ANY (ARRAY['unpatrolled'::text, 'patrolled'::text, 'reverted'::text, 'pending'::text, 'rejected'::text]))),
    CONSTRAINT infobox_edits_summary_check CHECK (((length(TRIM(BOTH FROM summary)) >= 1) AND (length(TRIM(BOTH FROM summary)) <= 500)))
);


ALTER TABLE public.infobox_edits OWNER TO postgres;

--
-- Name: COLUMN infobox_edits.is_null_override; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.infobox_edits.is_null_override IS 'true = [NONE]: the source is wrong and there is no value. value is null.';


--
-- Name: infobox_edits_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.infobox_edits ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.infobox_edits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: infobox_properties; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.infobox_properties (
    key text NOT NULL,
    label text NOT NULL,
    entity_types text[] NOT NULL,
    source_kind text NOT NULL,
    source_ref text,
    sort_order integer NOT NULL,
    transcludable boolean DEFAULT true NOT NULL,
    CONSTRAINT infobox_properties_key_check CHECK ((key ~ '^[a-z][a-z0-9_]*$'::text)),
    CONSTRAINT infobox_properties_source_kind_check CHECK ((source_kind = ANY (ARRAY['label'::text, 'list'::text, 'attribute'::text, 'class'::text, 'community'::text])))
);


ALTER TABLE public.infobox_properties OWNER TO postgres;

--
-- Name: ingest_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ingest_tokens (
    name text NOT NULL,
    token text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ingest_tokens OWNER TO postgres;

--
-- Name: label_fetch_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.label_fetch_log (
    setid text NOT NULL,
    status text NOT NULL,
    source text DEFAULT 'openfda'::text NOT NULL,
    application_number text,
    brand_name text,
    generic_name text,
    source_effective text,
    error_detail text,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    parser_version integer DEFAULT 0 NOT NULL,
    CONSTRAINT label_fetch_log_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'not_found'::text, 'error'::text])))
);


ALTER TABLE public.label_fetch_log OWNER TO postgres;

--
-- Name: label_section_text; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.label_section_text (
    setid text NOT NULL,
    section_key text NOT NULL,
    loinc_code text,
    title text NOT NULL,
    display_order integer NOT NULL,
    blocks jsonb NOT NULL,
    tables_html jsonb
);


ALTER TABLE public.label_section_text OWNER TO postgres;

--
-- Name: TABLE label_section_text; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.label_section_text IS 'Readable label sections cached by the label-text edge function from openFDA. blocks = [{heading?, text}], text uses "\n• " bullets and "[[TABLE:i]]" markers into tables_html.';


--
-- Name: label_sections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.label_sections (
    id bigint NOT NULL,
    setid text NOT NULL,
    section_order integer NOT NULL,
    loinc_code text,
    loinc_display text,
    title text,
    parent_loinc_code text,
    parent_title text,
    effective_time text
);


ALTER TABLE public.label_sections OWNER TO postgres;

--
-- Name: TABLE label_sections; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.label_sections IS 'One row per labeled section (Description, Warnings, Dosage, etc.) within a DailyMed SPL document. section_order preserves original document order.';


--
-- Name: label_sections_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.label_sections_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.label_sections_id_seq OWNER TO postgres;

--
-- Name: label_sections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.label_sections_id_seq OWNED BY public.label_sections.id;


--
-- Name: lasa_names; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lasa_names (
    id integer NOT NULL,
    sheet_moiety text,
    name text NOT NULL,
    confused_with text NOT NULL,
    has_tall_man boolean NOT NULL,
    name_pcid bigint,
    confused_with_pcid bigint,
    name_match text,
    confused_match text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    name_moiety_pcid bigint,
    confused_with_moiety_pcid bigint
);


ALTER TABLE public.lasa_names OWNER TO postgres;

--
-- Name: TABLE lasa_names; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.lasa_names IS 'Look-alike/sound-alike drug name pairs with Tall Man lettering flag (phase 27a). name/confused_with keep the source casing; *_pcid link to entities.';


--
-- Name: lasa_pairs_v; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.lasa_pairs_v WITH (security_invoker='true') AS
 SELECT l.id,
    l.name_pcid AS pcid,
    l.name_moiety_pcid AS moiety_pcid,
    l.name,
    l.has_tall_man,
    l.confused_with AS other_name,
    l.confused_with_pcid AS other_pcid,
    'listed'::text AS direction
   FROM public.lasa_names l
  WHERE (l.confused_with <> 'Not specified'::text)
UNION ALL
 SELECT l.id,
    l.confused_with_pcid AS pcid,
    l.confused_with_moiety_pcid AS moiety_pcid,
    l.confused_with AS name,
    false AS has_tall_man,
    l.name AS other_name,
    l.name_pcid AS other_pcid,
    'reverse'::text AS direction
   FROM public.lasa_names l
  WHERE (l.confused_with <> 'Not specified'::text);


ALTER VIEW public.lasa_pairs_v OWNER TO postgres;

--
-- Name: learn_brand_list; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.learn_brand_list (
    sheet_id integer NOT NULL,
    importance text NOT NULL,
    brand_name text NOT NULL,
    generic_name text NOT NULL,
    therapeutic_domain text NOT NULL,
    clinical_context text NOT NULL,
    brand_pcid bigint,
    generic_pcid bigint,
    brand_match text,
    generic_match text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    review_note text,
    CONSTRAINT learn_brand_list_importance_check CHECK ((importance = ANY (ARRAY['High'::text, 'Medium'::text, 'Low'::text]))),
    CONSTRAINT learn_brand_list_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'ready'::text, 'needs_mint'::text, 'held'::text, 'excluded'::text])))
);


ALTER TABLE public.learn_brand_list OWNER TO postgres;

--
-- Name: learn_collection_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.learn_collection_items (
    collection_id uuid NOT NULL,
    item_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    section_label text,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.learn_collection_items OWNER TO postgres;

--
-- Name: learn_collections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.learn_collections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text,
    title text NOT NULL,
    description text,
    subject_area text NOT NULL,
    topic text,
    owner_id uuid,
    is_official boolean DEFAULT false NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    source_list_pcid bigint,
    template_keys text[] DEFAULT '{}'::text[] NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    forked_from_collection_id uuid,
    forked_from_version integer,
    collection_version integer DEFAULT 1 NOT NULL,
    excluded_item_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learn_collections_owner_chk CHECK (((is_official AND (owner_id IS NULL)) OR ((NOT is_official) AND (owner_id IS NOT NULL)))),
    CONSTRAINT learn_collections_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);


ALTER TABLE public.learn_collections OWNER TO postgres;

--
-- Name: learn_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.learn_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    natural_key text,
    item_type text NOT NULL,
    template_key text,
    generation_method text NOT NULL,
    owner_id uuid,
    is_official boolean DEFAULT false NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    forked_from_item_id uuid,
    forked_from_version integer,
    content_version integer DEFAULT 1 NOT NULL,
    version_change_note text,
    subject_area text NOT NULL,
    topic text NOT NULL,
    subtopic text,
    jurisdiction text,
    difficulty_level smallint DEFAULT 2,
    learning_objective text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    primary_pcid bigint,
    prompt text NOT NULL,
    concise_answer text NOT NULL,
    clinical_rationale text,
    clinical_caveats text,
    personal_note text,
    mcq_options jsonb,
    source_kind text NOT NULL,
    source_list_pcid bigint,
    statement_id bigint,
    reference_id text,
    label_setid text,
    label_loinc text,
    label_effective_time text,
    source_quote text,
    source_agency text,
    source_citation text NOT NULL,
    source_section text,
    source_url text,
    last_verified_at date DEFAULT CURRENT_DATE,
    license text DEFAULT 'CC0-1.0'::text NOT NULL,
    third_party_sources text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learn_items_difficulty_level_check CHECK (((difficulty_level >= 1) AND (difficulty_level <= 3))),
    CONSTRAINT learn_items_generation_method_check CHECK ((generation_method = ANY (ARRAY['template'::text, 'llm_draft'::text, 'authored'::text, 'user'::text]))),
    CONSTRAINT learn_items_item_type_check CHECK ((item_type = ANY (ARRAY['flashcard'::text, 'mcq'::text]))),
    CONSTRAINT learn_items_mcq_chk CHECK (((item_type = 'flashcard'::text) OR COALESCE(((jsonb_typeof(mcq_options) = 'array'::text) AND ((jsonb_array_length(mcq_options) >= 2) AND (jsonb_array_length(mcq_options) <= 6)) AND (jsonb_array_length(jsonb_path_query_array(mcq_options, '$[*]?(@."is_correct" == true)'::jsonpath)) = 1)), false))),
    CONSTRAINT learn_items_method_chk CHECK (((is_official AND (generation_method <> 'user'::text)) OR ((NOT is_official) AND (generation_method = 'user'::text)))),
    CONSTRAINT learn_items_owner_chk CHECK (((is_official AND (owner_id IS NULL)) OR ((NOT is_official) AND (owner_id IS NOT NULL)))),
    CONSTRAINT learn_items_quote_chk CHECK (((generation_method <> 'llm_draft'::text) OR (source_quote IS NOT NULL))),
    CONSTRAINT learn_items_review_chk CHECK ((NOT (is_official AND (status = 'published'::text) AND (generation_method = ANY (ARRAY['llm_draft'::text, 'authored'::text])) AND (reviewed_by IS NULL)))),
    CONSTRAINT learn_items_source_citation_check CHECK ((length(btrim(source_citation)) > 0)),
    CONSTRAINT learn_items_source_kind_check CHECK ((source_kind = ANY (ARRAY['list'::text, 'label'::text, 'statement'::text, 'reference'::text, 'authored'::text]))),
    CONSTRAINT learn_items_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'review_needed'::text, 'published'::text, 'archived'::text])))
);


ALTER TABLE public.learn_items OWNER TO postgres;

--
-- Name: TABLE learn_items; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.learn_items IS 'Learn flashcards and MCQs. Official rows (is_official) are written only by SECURITY DEFINER generators / admin RPCs; template rows are rebuildable from lists/classes/brands via natural_key. Personal rows are owner-only. docs/learn.md.';


--
-- Name: learn_collection_counts; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.learn_collection_counts WITH (security_invoker='true') AS
 SELECT c.id AS collection_id,
    (count(i.id) FILTER (WHERE (i.item_type = 'flashcard'::text)))::integer AS flashcard_count,
    (count(i.id) FILTER (WHERE (i.item_type = 'mcq'::text)))::integer AS mcq_count
   FROM ((public.learn_collections c
     LEFT JOIN public.learn_collection_items ci ON ((ci.collection_id = c.id)))
     LEFT JOIN public.learn_items i ON ((i.id = ci.item_id)))
  GROUP BY c.id;


ALTER VIEW public.learn_collection_counts OWNER TO postgres;

--
-- Name: learn_item_entities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.learn_item_entities (
    item_id uuid NOT NULL,
    pcid bigint NOT NULL,
    role text DEFAULT 'related'::text NOT NULL,
    CONSTRAINT learn_item_entities_role_check CHECK ((role = ANY (ARRAY['primary'::text, 'related'::text])))
);


ALTER TABLE public.learn_item_entities OWNER TO postgres;

--
-- Name: learn_review_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.learn_review_events (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    item_id uuid NOT NULL,
    collection_id uuid,
    client_event_id uuid NOT NULL,
    study_mode text NOT NULL,
    rating smallint NOT NULL,
    is_correct boolean,
    selected_option_id text,
    was_unsure boolean DEFAULT false NOT NULL,
    duration_ms integer,
    scheduler_version text DEFAULT 'fsrs-5.0'::text NOT NULL,
    state_before jsonb,
    state_after jsonb,
    item_version_seen integer DEFAULT 1 NOT NULL,
    reviewed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learn_review_events_rating_check CHECK (((rating >= 1) AND (rating <= 4))),
    CONSTRAINT learn_review_events_study_mode_check CHECK ((study_mode = ANY (ARRAY['due_queue'::text, 'flashcard'::text, 'mcq_practice'::text, 'mcq_test'::text])))
);


ALTER TABLE public.learn_review_events OWNER TO postgres;

--
-- Name: TABLE learn_review_events; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.learn_review_events IS 'Append-only review log; replayable. client_event_id makes guest-progress sync idempotent.';


--
-- Name: learn_review_events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.learn_review_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.learn_review_events_id_seq OWNER TO postgres;

--
-- Name: learn_review_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.learn_review_events_id_seq OWNED BY public.learn_review_events.id;


--
-- Name: learn_user_item_state; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.learn_user_item_state (
    user_id uuid NOT NULL,
    item_id uuid NOT NULL,
    state text DEFAULT 'new'::text NOT NULL,
    stability double precision DEFAULT 0 NOT NULL,
    difficulty double precision DEFAULT 5 NOT NULL,
    reps integer DEFAULT 0 NOT NULL,
    lapses integer DEFAULT 0 NOT NULL,
    mcq_attempts integer DEFAULT 0 NOT NULL,
    mcq_correct integer DEFAULT 0 NOT NULL,
    last_rating smallint,
    last_reviewed_at timestamp with time zone,
    due_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_item_version integer DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    step smallint DEFAULT 0 NOT NULL,
    CONSTRAINT learn_user_item_state_last_rating_check CHECK (((last_rating >= 1) AND (last_rating <= 4))),
    CONSTRAINT learn_user_item_state_state_check CHECK ((state = ANY (ARRAY['new'::text, 'learning'::text, 'review'::text, 'relearning'::text])))
);


ALTER TABLE public.learn_user_item_state OWNER TO postgres;

--
-- Name: TABLE learn_user_item_state; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.learn_user_item_state IS 'Per-learner FSRS scheduling state, keyed (user_id, item_id) — never by collection.';


--
-- Name: learn_user_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.learn_user_settings (
    user_id uuid NOT NULL,
    max_new_per_day integer DEFAULT 20 NOT NULL,
    max_reviews_per_day integer DEFAULT 100 NOT NULL,
    cover_options boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learn_user_settings_max_new_per_day_check CHECK (((max_new_per_day >= 0) AND (max_new_per_day <= 500))),
    CONSTRAINT learn_user_settings_max_reviews_per_day_check CHECK (((max_reviews_per_day >= 0) AND (max_reviews_per_day <= 2000)))
);


ALTER TABLE public.learn_user_settings OWNER TO postgres;

--
-- Name: list_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.list_items (
    list_pcid bigint NOT NULL,
    "position" integer NOT NULL,
    member_pcid bigint,
    rank integer,
    value numeric,
    source_name text NOT NULL,
    legal_status text,
    note text,
    sources text[],
    term_id integer,
    component_pcid bigint,
    CONSTRAINT list_items_member_or_term CHECK (((member_pcid IS NOT NULL) OR (term_id IS NOT NULL)))
);


ALTER TABLE public.list_items OWNER TO postgres;

--
-- Name: TABLE list_items; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.list_items IS 'Members of a list. A drug may appear more than once when the source lists it twice (kept for fidelity).';


--
-- Name: COLUMN list_items.sources; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.list_items.sources IS 'Other references that also list this drug (short names, e.g. {MPR,"Pharmacist''s Letter"}). Null when not recorded.';


--
-- Name: COLUMN list_items.term_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.list_items.term_id IS 'For entries that are not drug records: the dictionary term this entry is. member_pcid is then null and source_name is what the page shows.';


--
-- Name: COLUMN list_items.component_pcid; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.list_items.component_pcid IS 'Optional: the generic (moiety/combination) this entry stands for, e.g. a brand-name entry points at its generic. List compare matches rows on component_pcid when set, so brand and generic lists line up.';


--
-- Name: lists; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lists (
    pcid bigint NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    description text,
    kind text DEFAULT 'curated'::text NOT NULL,
    parent_pcid bigint,
    jurisdiction text,
    source_citation text NOT NULL,
    source_url text,
    license text DEFAULT 'CC0-1.0'::text NOT NULL,
    measure_label text,
    measure_unit text,
    rank_label text,
    default_sort text DEFAULT 'rank'::text NOT NULL,
    published boolean DEFAULT false NOT NULL,
    item_count integer DEFAULT 0 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status_label text,
    CONSTRAINT lists_default_sort_check CHECK ((default_sort = ANY (ARRAY['rank'::text, 'value_desc'::text, 'name'::text, 'position'::text]))),
    CONSTRAINT lists_kind_check CHECK ((kind = ANY (ARRAY['curated'::text, 'authority'::text, 'community'::text])))
);


ALTER TABLE public.lists OWNER TO postgres;

--
-- Name: TABLE lists; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.lists IS 'Purposeful drug lists (exam lists, usage rankings). Separate from drug_classes. One row per list; PCIDs from block 10.';


--
-- Name: COLUMN lists.status_label; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.lists.status_label IS 'What list_items.legal_status means on this list, e.g. ''Schedule'' or ''Reason''. Null = legal status.';


--
-- Name: measurements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.measurements (
    pcid bigint NOT NULL,
    measurement_type text,
    units text
);


ALTER TABLE public.measurements OWNER TO postgres;

--
-- Name: page_citations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.page_citations (
    revision_id bigint NOT NULL,
    ordinal integer NOT NULL,
    ref_key text NOT NULL
);


ALTER TABLE public.page_citations OWNER TO postgres;

--
-- Name: TABLE page_citations; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.page_citations IS 'The numbered reference list of each format-2 revision (phase 16b).';


--
-- Name: page_content; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.page_content (
    pcid bigint NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    body_md text DEFAULT ''::text NOT NULL,
    current_revision_id bigint,
    protection text DEFAULT 'open'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT page_content_protection_check CHECK ((protection = ANY (ARRAY['open'::text, 'reviewed'::text, 'patrollers'::text])))
);


ALTER TABLE public.page_content OWNER TO postgres;

--
-- Name: TABLE page_content; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.page_content IS 'Community-editable text for any PCID page: description (lead) and markdown body. Written only by save_page()/revert_page(). Licensed CC BY-SA 4.0 (spec §8).';


--
-- Name: page_links; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.page_links (
    source_pcid bigint NOT NULL,
    target_text text NOT NULL,
    target_pcid bigint
);


ALTER TABLE public.page_links OWNER TO postgres;

--
-- Name: page_property_refs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.page_property_refs (
    source_pcid bigint NOT NULL,
    property_key text NOT NULL,
    target_text text DEFAULT ''::text NOT NULL,
    target_pcid bigint
);


ALTER TABLE public.page_property_refs OWNER TO postgres;

--
-- Name: page_revisions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.page_revisions (
    id bigint NOT NULL,
    pcid bigint NOT NULL,
    parent_id bigint,
    description text DEFAULT ''::text NOT NULL,
    body_md text DEFAULT ''::text NOT NULL,
    summary text NOT NULL,
    size_delta integer NOT NULL,
    kind text DEFAULT 'edit'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    patrol_status text DEFAULT 'unpatrolled'::text NOT NULL,
    patrolled_by uuid,
    patrolled_at timestamp with time zone,
    review_note text,
    format smallint DEFAULT 1 NOT NULL,
    model jsonb,
    source_md text,
    extracted jsonb,
    changed_sections text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT page_revisions_format2_model CHECK (((format = 1) OR ((model IS NOT NULL) AND (source_md IS NOT NULL) AND (extracted IS NOT NULL)))),
    CONSTRAINT page_revisions_format_check CHECK ((format = ANY (ARRAY[1, 2]))),
    CONSTRAINT page_revisions_kind_check CHECK ((kind = ANY (ARRAY['create'::text, 'edit'::text, 'revert'::text, 'seed'::text]))),
    CONSTRAINT page_revisions_patrol_status_check CHECK ((patrol_status = ANY (ARRAY['unpatrolled'::text, 'patrolled'::text, 'reverted'::text, 'pending'::text, 'rejected'::text]))),
    CONSTRAINT page_revisions_summary_check CHECK (((length(TRIM(BOTH FROM summary)) >= 1) AND (length(TRIM(BOTH FROM summary)) <= 500)))
);


ALTER TABLE public.page_revisions OWNER TO postgres;

--
-- Name: COLUMN page_revisions.format; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.page_revisions.format IS '1 = phase-15 Overview (description + body_md); 2 = full-page editor (model).';


--
-- Name: COLUMN page_revisions.model; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.page_revisions.model IS 'Parsed page model (src/pageSource/types.ts PageModel) for format 2.';


--
-- Name: COLUMN page_revisions.source_md; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.page_revisions.source_md IS 'Community layer as page source, for history diffs (no ingested values).';


--
-- Name: COLUMN page_revisions.extracted; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.page_revisions.extracted IS '{links:[{target}], properties:[{key,target}], citations:[{key,location}]} for format 2.';


--
-- Name: COLUMN page_revisions.changed_sections; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.page_revisions.changed_sections IS 'Units this revision changed: lead, section ids, infobox:<key>, brands:<KEY>, order.';


--
-- Name: page_revisions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.page_revisions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.page_revisions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: page_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.page_templates (
    page_type text NOT NULL,
    rail text[] NOT NULL,
    main jsonb NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT page_templates_main_check CHECK ((jsonb_typeof(main) = 'array'::text))
);


ALTER TABLE public.page_templates OWNER TO postgres;

--
-- Name: TABLE page_templates; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.page_templates IS 'Default page layout per page type: rail items and ordered main-column items (phase 16a).';


--
-- Name: pcid_blocks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pcid_blocks (
    block_id smallint NOT NULL,
    entity_kind text NOT NULL,
    label text NOT NULL,
    min_id bigint NOT NULL,
    max_id bigint NOT NULL,
    slug_prefix text NOT NULL,
    next_pcid bigint NOT NULL,
    CONSTRAINT pcid_blocks_check CHECK (((min_id < max_id) AND (next_pcid >= min_id)))
);


ALTER TABLE public.pcid_blocks OWNER TO postgres;

--
-- Name: TABLE pcid_blocks; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.pcid_blocks IS 'Mirrors the workbook''s PCID_Blocks sheet. next_pcid is the only source of truth for minting a new PCID in a block — never increment the last row of an entity table.';


--
-- Name: pcid_retired; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pcid_retired (
    pcid bigint NOT NULL,
    retired_at timestamp with time zone DEFAULT now() NOT NULL,
    reason text,
    replaced_by_pcid bigint
);


ALTER TABLE public.pcid_retired OWNER TO postgres;

--
-- Name: TABLE pcid_retired; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.pcid_retired IS 'PCIDs vacated during block migration. Never reissue a value stored here; the API layer 301s a retired PCID/slug to its replacement.';


--
-- Name: physiochemical; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.physiochemical (
    pcid bigint NOT NULL,
    cas_rn text,
    smiles text,
    inchi text,
    inchi_key text,
    molecular_formula text,
    molecular_weight numeric,
    log_kow numeric,
    pka numeric,
    water_solubility_mg_l numeric,
    source text NOT NULL,
    raw jsonb NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    structure_status text,
    match_method text,
    pubchem_cid bigint
);


ALTER TABLE public.physiochemical OWNER TO postgres;

--
-- Name: TABLE physiochemical; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.physiochemical IS 'One row per PCID with a known CAS number. Identifier fields (smiles, inchi, inchi_key, molecular_formula, molecular_weight) come from CAS Common Chemistry. log_kow/pka/water_solubility_mg_l are placeholder columns for a future physprop-source pass (not CAS Common Chemistry) feeding the RQ/PEC/MEC eco-risk metrics — do not treat their NULL-ness as a bug in this ingestion.';


--
-- Name: COLUMN physiochemical.source; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.physiochemical.source IS 'Provenance of the row (PubChem | FDA GSRS | CAS Common Chemistry | ...). Required, no default: the licence follows the source.';


--
-- Name: COLUMN physiochemical.structure_status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.physiochemical.structure_status IS 'ok | not_found | key_mismatch | not_applicable_biologic (GSRS protein/nucleicAcid/structurallyDiverse) | not_applicable_other (GSRS polymer/mixture/concept/etc; see raw.substanceClass) | needs_review';


--
-- Name: COLUMN physiochemical.match_method; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.physiochemical.match_method IS 'How the structure was matched: pubchem_inchikey | gsrs_unii | pubchem_unii | pubchem_drugbank | pubchem_name | ...';


--
-- Name: predicates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.predicates (
    predicate text NOT NULL,
    note text
);


ALTER TABLE public.predicates OWNER TO postgres;

--
-- Name: TABLE predicates; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.predicates IS 'Controlled predicate vocabulary for clinical_statements, seeded from the workbook''s Legend_Key sheet. Add new predicates here before using them in a statement.';


--
-- Name: product_packaging; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_packaging (
    id bigint NOT NULL,
    entity_pcid bigint NOT NULL,
    product_name text,
    ndc text,
    basis text NOT NULL,
    container text,
    package_size numeric,
    volume_ml numeric,
    drops_per_ml numeric,
    actuations numeric,
    prime_actuations numeric,
    units_per_container numeric,
    prime_units numeric,
    doses_per_container numeric,
    containers_per_box numeric,
    in_use_days integer,
    value_source text NOT NULL,
    payer_name text,
    source_name text NOT NULL,
    source_url text,
    source_checked date,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_packaging_actuations_check CHECK ((actuations > (0)::numeric)),
    CONSTRAINT product_packaging_basis_check CHECK ((basis = ANY (ARRAY['count'::text, 'liquid'::text, 'drops'::text, 'spray'::text, 'inhaler'::text, 'insulin'::text, 'injection'::text]))),
    CONSTRAINT product_packaging_container_check CHECK (((container IS NULL) OR (container = ANY (ARRAY['pen'::text, 'vial'::text])))),
    CONSTRAINT product_packaging_containers_per_box_check CHECK ((containers_per_box > (0)::numeric)),
    CONSTRAINT product_packaging_doses_per_container_check CHECK ((doses_per_container > (0)::numeric)),
    CONSTRAINT product_packaging_drops_per_ml_check CHECK ((drops_per_ml > (0)::numeric)),
    CONSTRAINT product_packaging_has_fact CHECK ((num_nonnulls(package_size, volume_ml, drops_per_ml, actuations, prime_actuations, units_per_container, prime_units, doses_per_container, containers_per_box, in_use_days) > 0)),
    CONSTRAINT product_packaging_in_use_days_check CHECK ((in_use_days > 0)),
    CONSTRAINT product_packaging_ndc_check CHECK (((ndc IS NULL) OR (ndc ~ '^[0-9]{4,5}-[0-9]{3,4}-[0-9]{1,2}$'::text))),
    CONSTRAINT product_packaging_package_size_check CHECK ((package_size > (0)::numeric)),
    CONSTRAINT product_packaging_payer_named CHECK (((value_source <> 'payer'::text) OR (payer_name IS NOT NULL))),
    CONSTRAINT product_packaging_prime_actuations_check CHECK ((prime_actuations >= (0)::numeric)),
    CONSTRAINT product_packaging_prime_units_check CHECK ((prime_units >= (0)::numeric)),
    CONSTRAINT product_packaging_source_url_check CHECK (((source_url IS NULL) OR (source_url ~ '^https?://'::text))),
    CONSTRAINT product_packaging_units_per_container_check CHECK ((units_per_container > (0)::numeric)),
    CONSTRAINT product_packaging_value_source_check CHECK ((value_source = ANY (ARRAY['manufacturer'::text, 'payer'::text, 'general_default'::text]))),
    CONSTRAINT product_packaging_volume_ml_check CHECK ((volume_ml > (0)::numeric))
);


ALTER TABLE public.product_packaging OWNER TO postgres;

--
-- Name: TABLE product_packaging; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.product_packaging IS 'Curated packaging facts for the days supply calculator (drops per mL, priming, in-use days, doses per pen). One row per product per source so manufacturer and payer values sit side by side. Phase 18.';


--
-- Name: product_packaging_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.product_packaging ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.product_packaging_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: provider_verifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.provider_verifications (
    user_id uuid NOT NULL,
    npi text NOT NULL,
    verified_name text,
    enumeration_type text,
    primary_taxonomy text,
    status text NOT NULL,
    verified_at timestamp with time zone DEFAULT now() NOT NULL,
    last_checked_at timestamp with time zone DEFAULT now() NOT NULL,
    credential text,
    CONSTRAINT provider_verifications_status_check CHECK ((status = ANY (ARRAY['active'::text, 'deactivated'::text])))
);


ALTER TABLE public.provider_verifications OWNER TO postgres;

--
-- Name: TABLE provider_verifications; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.provider_verifications IS 'One row per user who has verified an NPI against the CMS NPI Registry. Written only by the verify-npi edge function (service role), never by direct client INSERT/UPDATE. Gates revisions.submit_own below.';


--
-- Name: references_resources; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.references_resources (
    id text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    name text NOT NULL,
    subtitle text,
    href text NOT NULL,
    organization text,
    pub_year integer,
    description text,
    type_badge text,
    license_badge text,
    badges text[],
    headers text NOT NULL,
    reference_section text NOT NULL,
    commons_use text,
    version text,
    current_as_of date,
    download_url text,
    citation_text text,
    cite jsonb,
    guideline_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT references_resources_cite_kind CHECK (((cite IS NULL) OR ((cite ->> 'kind'::text) = ANY (ARRAY['web'::text, 'article'::text])))),
    CONSTRAINT references_resources_href_http CHECK ((href ~ '^https?://'::text))
);


ALTER TABLE public.references_resources OWNER TO postgres;

--
-- Name: TABLE references_resources; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.references_resources IS 'Citations and outside links shown on /references (all rows) and /resources (headers <> ''Source datasets''). Phase 12.';


--
-- Name: rems_products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rems_products (
    product_id integer NOT NULL,
    rems_id integer NOT NULL,
    established_name text NOT NULL,
    brand text,
    dosage_form text,
    application_type text,
    application_number text,
    added_date date,
    approval_date date,
    last_updated date,
    withdrawal_date date,
    dailymed_setid text,
    status text NOT NULL,
    moiety_pcids bigint[],
    match_note text,
    CONSTRAINT rems_products_status_check CHECK ((status = ANY (ARRAY['Active'::text, 'Inactive'::text])))
);


ALTER TABLE public.rems_products OWNER TO postgres;

--
-- Name: TABLE rems_products; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.rems_products IS 'Products covered by a REMS (phase 30). moiety_pcids = REMS-driving active moiety(ies); null rows are held for review (see match_note). Edit, then run refresh_rems_lists().';


--
-- Name: rems_programs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rems_programs (
    rems_id integer NOT NULL,
    name text NOT NULL,
    website text,
    etasu boolean DEFAULT false NOT NULL,
    medication_guide boolean DEFAULT false NOT NULL,
    communication_plan boolean DEFAULT false NOT NULL,
    implementation_system boolean DEFAULT false NOT NULL,
    shared_system boolean DEFAULT false NOT NULL
);


ALTER TABLE public.rems_programs OWNER TO postgres;

--
-- Name: TABLE rems_programs; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.rems_programs IS 'FDA REMS programs (REMS@FDA export, phase 30). One row per REMS_ID; name as exported.';


--
-- Name: revisions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.revisions (
    id bigint NOT NULL,
    target_pcid bigint,
    target_table text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    submitted_by uuid,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    review_note text,
    CONSTRAINT revisions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


ALTER TABLE public.revisions OWNER TO postgres;

--
-- Name: TABLE revisions; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.revisions IS 'Staging queue for community/wiki edits. approve_revision() is the only path that mutates a live table; no policy below grants direct INSERT/UPDATE/DELETE on entity or statement tables to anon/authenticated.';


--
-- Name: revisions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.revisions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.revisions_id_seq OWNER TO postgres;

--
-- Name: revisions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.revisions_id_seq OWNED BY public.revisions.id;


--
-- Name: rxclass_classes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rxclass_classes (
    class_id text NOT NULL,
    rela_source text NOT NULL,
    class_type text NOT NULL,
    class_name text NOT NULL,
    parent_class_id text,
    members_fetched boolean DEFAULT false NOT NULL,
    fetch_error text
);


ALTER TABLE public.rxclass_classes OWNER TO postgres;

--
-- Name: rxclass_drug; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rxclass_drug (
    pcid bigint NOT NULL,
    class_id text NOT NULL,
    rela_source text NOT NULL,
    rela text NOT NULL,
    class_type text NOT NULL,
    class_name text NOT NULL
);


ALTER TABLE public.rxclass_drug OWNER TO postgres;

--
-- Name: rxclass_lookup; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rxclass_lookup (
    pcid bigint NOT NULL,
    rxcui text,
    rxcui_basis text,
    status text NOT NULL,
    n_classes integer,
    detail text,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.rxclass_lookup OWNER TO postgres;

--
-- Name: rxclass_va_products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rxclass_va_products (
    class_id text NOT NULL,
    product text NOT NULL
);


ALTER TABLE public.rxclass_va_products OWNER TO postgres;

--
-- Name: saved_entities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.saved_entities (
    user_id uuid NOT NULL,
    pcid_code text NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    entity_type text,
    saved_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.saved_entities OWNER TO postgres;

--
-- Name: TABLE saved_entities; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.saved_entities IS 'Per-user bookmarks of PCID pages. Not gated on NPI verification — saving a page is not contribution. Fully owned by the client: RLS lets a user read/insert/delete only their own rows.';


--
-- Name: search_index; Type: MATERIALIZED VIEW; Schema: public; Owner: postgres
--

CREATE MATERIALIZED VIEW public.search_index AS
 WITH rows_ AS (
         SELECT c.pcid,
            c.entity_type,
            c.slug,
            c.name,
            'name'::text AS src,
            c.name AS term
           FROM public.catalog_entries c
          WHERE (c.entity_type = ANY (ARRAY['moiety'::text, 'combination'::text]))
        UNION ALL
         SELECT c.pcid,
            c.entity_type,
            c.slug,
            c.name,
            'brand'::text,
            b.b
           FROM public.catalog_entries c,
            LATERAL unnest(c.brand_names) b(b)
          WHERE (c.entity_type = 'moiety'::text)
        UNION ALL
         SELECT i.pcid,
            'combination'::text,
            i.slug,
            i.name,
            'brand'::text,
            i.brand
           FROM public.combination_brand_index i
        UNION ALL
         SELECT e.pcid,
            'class'::text,
            e.slug,
            e.name,
            'name'::text,
            e.name
           FROM (public.drug_classes d
             JOIN public.entities e USING (pcid))
          WHERE (d.member_count > 0)
        UNION ALL
         SELECT e.pcid,
            'class'::text,
            e.slug,
            e.name,
            'alias'::text,
            a.alias_key
           FROM ((public.class_search_aliases a
             JOIN public.drug_classes d ON (((d.pcid = a.class_pcid) AND (d.member_count > 0))))
             JOIN public.entities e ON ((e.pcid = a.class_pcid)))
        UNION ALL
         SELECT e.pcid,
            'class'::text,
            e.slug,
            e.name,
            'code'::text,
            d.source_code
           FROM (public.drug_classes d
             JOIN public.entities e USING (pcid))
          WHERE ((d.member_count > 0) AND (d.source_code IS NOT NULL))
        UNION ALL
         SELECT e.pcid,
            e.entity_type,
            e.slug,
            e.name,
            'name'::text,
            e.name
           FROM public.entities e
          WHERE (e.entity_type = ANY (ARRAY['clinical'::text, 'measurement'::text, 'target'::text, 'functional'::text]))
        UNION ALL
         SELECT l.pcid,
            'list'::text,
            l.slug,
            l.title,
            'name'::text,
            l.title
           FROM public.lists l
          WHERE l.published
        )
 SELECT DISTINCT ON (pcid, src, (public.search_norm(term))) pcid,
    entity_type,
    slug,
    name,
    src,
    term,
    public.search_norm(term) AS key
   FROM rows_
  WHERE (public.search_norm(term) <> ''::text)
  ORDER BY pcid, src, (public.search_norm(term)), term
  WITH NO DATA;


ALTER MATERIALIZED VIEW public.search_index OWNER TO postgres;

--
-- Name: section_embeds; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.section_embeds (
    name text NOT NULL,
    label text NOT NULL,
    region text NOT NULL,
    page_types text[] NOT NULL,
    help text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT section_embeds_name_check CHECK ((name ~ '^[a-z][a-z0-9-]*$'::text)),
    CONSTRAINT section_embeds_region_check CHECK ((region = ANY (ARRAY['rail'::text, 'main'::text])))
);


ALTER TABLE public.section_embeds OWNER TO postgres;

--
-- Name: TABLE section_embeds; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.section_embeds IS 'Locked, ingest-owned sections (::name) that can be moved but not edited or removed (phase 16a).';


--
-- Name: structure_name_candidates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.structure_name_candidates (
    pcid bigint NOT NULL,
    queried_name text NOT NULL,
    n_cids integer NOT NULL,
    cid bigint,
    cid_list bigint[],
    title text,
    match_basis text NOT NULL,
    confidence text NOT NULL,
    smiles text,
    inchi text,
    inchi_key text,
    molecular_formula text,
    molecular_weight numeric,
    inchi_key_owner_pcid bigint,
    note text,
    decision text,
    reviewer_note text,
    loaded_at timestamp with time zone,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT structure_name_candidates_confidence_check CHECK ((confidence = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text, 'none'::text]))),
    CONSTRAINT structure_name_candidates_decision_check CHECK ((decision = ANY (ARRAY['approve'::text, 'reject'::text]))),
    CONSTRAINT structure_name_candidates_match_basis_check CHECK ((match_basis = ANY (ARRAY['title_exact'::text, 'synonym_exact'::text, 'name_only'::text, 'none'::text])))
);


ALTER TABLE public.structure_name_candidates OWNER TO postgres;

--
-- Name: TABLE structure_name_candidates; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.structure_name_candidates IS 'Rung 4 of the structure ladder (phase 36a): PubChem matches by moiety name, for Joshua to review. Set decision to approve or reject, then run select load_approved_name_structures(); Never read by the website.';


--
-- Name: structure_review_sheet; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.structure_review_sheet WITH (security_invoker='true') AS
 SELECT c.pcid,
    e.slug,
    c.queried_name,
    c.title AS pubchem_title,
    c.match_basis,
    c.confidence,
    c.n_cids,
    c.cid,
    ('https://pubchem.ncbi.nlm.nih.gov/compound/'::text || c.cid) AS pubchem_url,
    c.molecular_formula,
    c.molecular_weight,
    c.smiles,
    c.inchi_key,
    c.inchi_key_owner_pcid,
    c.note,
    c.decision,
    c.reviewer_note
   FROM (public.structure_name_candidates c
     JOIN public.entities e ON ((e.pcid = c.pcid)))
  WHERE ((c.confidence <> 'none'::text) AND (c.loaded_at IS NULL))
  ORDER BY (c.inchi_key_owner_pcid IS NOT NULL) DESC,
        CASE c.confidence
            WHEN 'low'::text THEN 0
            WHEN 'medium'::text THEN 1
            ELSE 2
        END, c.pcid;


ALTER VIEW public.structure_review_sheet OWNER TO postgres;

--
-- Name: term_definitions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.term_definitions (
    id bigint NOT NULL,
    pcid bigint NOT NULL,
    definition text NOT NULL,
    reference text NOT NULL,
    reference_url text,
    source_key text NOT NULL,
    source_title text NOT NULL,
    source_page_url text NOT NULL,
    source_last_updated date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT term_definitions_definition_check CHECK ((length(btrim(definition)) > 0))
);


ALTER TABLE public.term_definitions OWNER TO postgres;

--
-- Name: TABLE term_definitions; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.term_definitions IS 'Third-party definitions of health terms, kept apart from page_content (CC BY-SA community text). reference/reference_url name the originating NIH institute; source_* identify the MedlinePlus file. Licence comes from data_sources.source_key. Phase 37.';


--
-- Name: term_definitions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.term_definitions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.term_definitions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: threshold_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.threshold_rules (
    id bigint NOT NULL,
    pcid bigint NOT NULL,
    block_name text NOT NULL,
    measure text NOT NULL,
    comparator text NOT NULL,
    low numeric,
    high numeric,
    action text NOT NULL,
    citations text[] NOT NULL,
    "position" integer NOT NULL,
    revision_id bigint NOT NULL,
    is_current boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT threshold_rules_action_check CHECK (((length(TRIM(BOTH FROM action)) >= 1) AND (length(TRIM(BOTH FROM action)) <= 1000))),
    CONSTRAINT threshold_rules_check CHECK (((comparator = 'any'::text) = (low IS NULL))),
    CONSTRAINT threshold_rules_check1 CHECK (((comparator = 'range'::text) = (high IS NOT NULL))),
    CONSTRAINT threshold_rules_check2 CHECK (((comparator <> 'range'::text) OR (low < high))),
    CONSTRAINT threshold_rules_citations_check CHECK ((cardinality(citations) > 0)),
    CONSTRAINT threshold_rules_comparator_check CHECK ((comparator = ANY (ARRAY['<'::text, '<='::text, '>'::text, '>='::text, 'range'::text, 'any'::text])))
);


ALTER TABLE public.threshold_rules OWNER TO postgres;

--
-- Name: TABLE threshold_rules; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.threshold_rules IS 'Lines of :::renal-dosing (and future threshold blocks), one row per range (phase 16b). Current rows = the live page.';


--
-- Name: threshold_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.threshold_rules ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.threshold_rules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_roles (
    user_id uuid NOT NULL,
    role text NOT NULL,
    granted_by uuid,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_roles_role_check CHECK ((role = ANY (ARRAY['patroller'::text, 'admin'::text, 'owner'::text])))
);


ALTER TABLE public.user_roles OWNER TO postgres;

--
-- Name: v_cs_all_high; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_cs_all_high WITH (security_invoker='true') AS
 SELECT drug_name AS "Drug Name",
    brand_names AS "Brand Names",
    control_status AS "Control Status",
    importance AS "Importance"
   FROM public.federal_controlled_substances
  WHERE (true AND (importance = 'High'::text))
  ORDER BY drug_name;


ALTER VIEW public.v_cs_all_high OWNER TO postgres;

--
-- Name: v_cs_all_low; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_cs_all_low WITH (security_invoker='true') AS
 SELECT drug_name AS "Drug Name",
    brand_names AS "Brand Names",
    control_status AS "Control Status",
    importance AS "Importance"
   FROM public.federal_controlled_substances
  WHERE (true AND (importance = 'Low'::text))
  ORDER BY drug_name;


ALTER VIEW public.v_cs_all_low OWNER TO postgres;

--
-- Name: v_cs_all_medium; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_cs_all_medium WITH (security_invoker='true') AS
 SELECT drug_name AS "Drug Name",
    brand_names AS "Brand Names",
    control_status AS "Control Status",
    importance AS "Importance"
   FROM public.federal_controlled_substances
  WHERE (true AND (importance = 'Medium'::text))
  ORDER BY drug_name;


ALTER VIEW public.v_cs_all_medium OWNER TO postgres;

--
-- Name: v_cs_c2_5_high; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_cs_c2_5_high WITH (security_invoker='true') AS
 SELECT drug_name AS "Drug Name",
    brand_names AS "Brand Names",
    control_status AS "Control Status",
    importance AS "Importance"
   FROM public.federal_controlled_substances
  WHERE (((schedule_num >= 2) AND (schedule_num <= 5)) AND (importance = 'High'::text))
  ORDER BY drug_name;


ALTER VIEW public.v_cs_c2_5_high OWNER TO postgres;

--
-- Name: v_cs_c2_5_low; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_cs_c2_5_low WITH (security_invoker='true') AS
 SELECT drug_name AS "Drug Name",
    brand_names AS "Brand Names",
    control_status AS "Control Status",
    importance AS "Importance"
   FROM public.federal_controlled_substances
  WHERE (((schedule_num >= 2) AND (schedule_num <= 5)) AND (importance = 'Low'::text))
  ORDER BY drug_name;


ALTER VIEW public.v_cs_c2_5_low OWNER TO postgres;

--
-- Name: v_cs_c2_5_medium; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_cs_c2_5_medium WITH (security_invoker='true') AS
 SELECT drug_name AS "Drug Name",
    brand_names AS "Brand Names",
    control_status AS "Control Status",
    importance AS "Importance"
   FROM public.federal_controlled_substances
  WHERE (((schedule_num >= 2) AND (schedule_num <= 5)) AND (importance = 'Medium'::text))
  ORDER BY drug_name;


ALTER VIEW public.v_cs_c2_5_medium OWNER TO postgres;

--
-- Name: v_cs_c2_high; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_cs_c2_high WITH (security_invoker='true') AS
 SELECT drug_name AS "Drug Name",
    brand_names AS "Brand Names",
    control_status AS "Control Status",
    importance AS "Importance"
   FROM public.federal_controlled_substances
  WHERE ((schedule_num = 2) AND (importance = 'High'::text))
  ORDER BY drug_name;


ALTER VIEW public.v_cs_c2_high OWNER TO postgres;

--
-- Name: v_cs_c2_low; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_cs_c2_low WITH (security_invoker='true') AS
 SELECT drug_name AS "Drug Name",
    brand_names AS "Brand Names",
    control_status AS "Control Status",
    importance AS "Importance"
   FROM public.federal_controlled_substances
  WHERE ((schedule_num = 2) AND (importance = 'Low'::text))
  ORDER BY drug_name;


ALTER VIEW public.v_cs_c2_low OWNER TO postgres;

--
-- Name: v_cs_c2_medium; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_cs_c2_medium WITH (security_invoker='true') AS
 SELECT drug_name AS "Drug Name",
    brand_names AS "Brand Names",
    control_status AS "Control Status",
    importance AS "Importance"
   FROM public.federal_controlled_substances
  WHERE ((schedule_num = 2) AND (importance = 'Medium'::text))
  ORDER BY drug_name;


ALTER VIEW public.v_cs_c2_medium OWNER TO postgres;

--
-- Name: v_cs_c3_5_high; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_cs_c3_5_high WITH (security_invoker='true') AS
 SELECT drug_name AS "Drug Name",
    brand_names AS "Brand Names",
    control_status AS "Control Status",
    importance AS "Importance"
   FROM public.federal_controlled_substances
  WHERE (((schedule_num >= 3) AND (schedule_num <= 5)) AND (importance = 'High'::text))
  ORDER BY drug_name;


ALTER VIEW public.v_cs_c3_5_high OWNER TO postgres;

--
-- Name: v_cs_c3_5_low; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_cs_c3_5_low WITH (security_invoker='true') AS
 SELECT drug_name AS "Drug Name",
    brand_names AS "Brand Names",
    control_status AS "Control Status",
    importance AS "Importance"
   FROM public.federal_controlled_substances
  WHERE (((schedule_num >= 3) AND (schedule_num <= 5)) AND (importance = 'Low'::text))
  ORDER BY drug_name;


ALTER VIEW public.v_cs_c3_5_low OWNER TO postgres;

--
-- Name: v_cs_c3_5_medium; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_cs_c3_5_medium WITH (security_invoker='true') AS
 SELECT drug_name AS "Drug Name",
    brand_names AS "Brand Names",
    control_status AS "Control Status",
    importance AS "Importance"
   FROM public.federal_controlled_substances
  WHERE (((schedule_num >= 3) AND (schedule_num <= 5)) AND (importance = 'Medium'::text))
  ORDER BY drug_name;


ALTER VIEW public.v_cs_c3_5_medium OWNER TO postgres;

--
-- Name: v_export_main_spine; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_export_main_spine WITH (security_invoker='true') AS
 SELECT e.pcid,
    e.name AS drug,
    e.entity_type,
    e.slug,
    e.slug_uri,
    e.created_at,
    e.updated_at,
    COALESCE(m.is_controlled, c.is_controlled, p.is_controlled, f.is_controlled) AS is_controlled,
    COALESCE(m.controlled_schedule, c.controlled_schedule, p.controlled_schedule, f.controlled_schedule) AS controlled_schedule,
    COALESCE(m.term_type, c.term_type, p.term_type, f.term_type) AS term_type,
    COALESCE(m.base_name, c.base_name, p.base_name, f.base_name) AS base_name,
    COALESCE(m.drugbank_id, c.drugbank_id, p.drugbank_id, f.drugbank_id) AS drugbank_id,
    COALESCE(m.cas, c.cas, p.cas, f.cas) AS cas,
    COALESCE(m.unii, c.unii, p.unii, f.unii) AS unii,
    COALESCE(m.inchi_key, c.inchi_key, p.inchi_key, f.inchi_key) AS inchi_key,
    COALESCE(m.legal_status, c.legal_status, p.legal_status, f.legal_status) AS legal_status,
    COALESCE(m.fda_marketing_status, c.fda_marketing_status, p.fda_marketing_status, f.fda_marketing_status) AS fda_marketing_status,
    m.description_text
   FROM ((((public.entities e
     LEFT JOIN public.moieties m ON ((e.pcid = m.pcid)))
     LEFT JOIN public.combinations c ON ((e.pcid = c.pcid)))
     LEFT JOIN public.precise_forms p ON ((e.pcid = p.pcid)))
     LEFT JOIN public.formulations f ON ((e.pcid = f.pcid)))
  WHERE (e.entity_type = ANY (ARRAY['moiety'::text, 'combination'::text, 'precise_form'::text, 'formulation'::text]));


ALTER VIEW public.v_export_main_spine OWNER TO postgres;

--
-- Name: clinical_statements statement_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clinical_statements ALTER COLUMN statement_id SET DEFAULT nextval('public.clinical_statements_statement_id_seq'::regclass);


--
-- Name: guidelines guideline_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guidelines ALTER COLUMN guideline_id SET DEFAULT nextval('public.guidelines_guideline_id_seq'::regclass);


--
-- Name: label_sections id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.label_sections ALTER COLUMN id SET DEFAULT nextval('public.label_sections_id_seq'::regclass);


--
-- Name: learn_review_events id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_review_events ALTER COLUMN id SET DEFAULT nextval('public.learn_review_events_id_seq'::regclass);


--
-- Name: revisions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.revisions ALTER COLUMN id SET DEFAULT nextval('public.revisions_id_seq'::regclass);


--
-- Name: class_agent_skip class_agent_skip_pkey; Type: CONSTRAINT; Schema: archive; Owner: postgres
--

ALTER TABLE ONLY archive.class_agent_skip
    ADD CONSTRAINT class_agent_skip_pkey PRIMARY KEY (member_pcid);


--
-- Name: class_review_queue class_review_queue_pkey; Type: CONSTRAINT; Schema: archive; Owner: postgres
--

ALTER TABLE ONLY archive.class_review_queue
    ADD CONSTRAINT class_review_queue_pkey PRIMARY KEY (pcid);


--
-- Name: stg_topdrugs_lists stg_topdrugs_lists_pkey; Type: CONSTRAINT; Schema: archive; Owner: postgres
--

ALTER TABLE ONLY archive.stg_topdrugs_lists
    ADD CONSTRAINT stg_topdrugs_lists_pkey PRIMARY KEY (col);


--
-- Name: stg_topdrugs_match stg_topdrugs_match_pkey; Type: CONSTRAINT; Schema: archive; Owner: postgres
--

ALTER TABLE ONLY archive.stg_topdrugs_match
    ADD CONSTRAINT stg_topdrugs_match_pkey PRIMARY KEY (row_no);


--
-- Name: stg_topdrugs_rows stg_topdrugs_rows_pkey; Type: CONSTRAINT; Schema: archive; Owner: postgres
--

ALTER TABLE ONLY archive.stg_topdrugs_rows
    ADD CONSTRAINT stg_topdrugs_rows_pkey PRIMARY KEY (row_no);


--
-- Name: account_profiles account_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_profiles
    ADD CONSTRAINT account_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: api_meta api_meta_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_meta
    ADD CONSTRAINT api_meta_pkey PRIMARY KEY (key);


--
-- Name: biological_targets biological_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.biological_targets
    ADD CONSTRAINT biological_targets_pkey PRIMARY KEY (pcid);


--
-- Name: block_schemas block_schemas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.block_schemas
    ADD CONSTRAINT block_schemas_pkey PRIMARY KEY (name);


--
-- Name: blog_comments blog_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.blog_comments
    ADD CONSTRAINT blog_comments_pkey PRIMARY KEY (id);


--
-- Name: brand_edits brand_edits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.brand_edits
    ADD CONSTRAINT brand_edits_pkey PRIMARY KEY (id);


--
-- Name: chemont_links chemont_links_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chemont_links
    ADD CONSTRAINT chemont_links_pkey PRIMARY KEY (pcid, chemont_id);


--
-- Name: chemont_terms chemont_terms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chemont_terms
    ADD CONSTRAINT chemont_terms_pkey PRIMARY KEY (chemont_id);


--
-- Name: citation_sources citation_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.citation_sources
    ADD CONSTRAINT citation_sources_pkey PRIMARY KEY (key);


--
-- Name: class_agent_review class_agent_review_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_agent_review
    ADD CONSTRAINT class_agent_review_pkey PRIMARY KEY (member_pcid, class_slug);


--
-- Name: class_members class_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_members
    ADD CONSTRAINT class_members_pkey PRIMARY KEY (class_pcid, member_pcid);


--
-- Name: class_rules class_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_rules
    ADD CONSTRAINT class_rules_pkey PRIMARY KEY (code);


--
-- Name: class_search_aliases class_search_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_search_aliases
    ADD CONSTRAINT class_search_aliases_pkey PRIMARY KEY (alias_key, class_pcid);


--
-- Name: classyfire_lookup classyfire_lookup_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classyfire_lookup
    ADD CONSTRAINT classyfire_lookup_pkey PRIMARY KEY (pcid);


--
-- Name: clinical_concepts clinical_concepts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clinical_concepts
    ADD CONSTRAINT clinical_concepts_pkey PRIMARY KEY (pcid);


--
-- Name: clinical_statements clinical_statements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clinical_statements
    ADD CONSTRAINT clinical_statements_pkey PRIMARY KEY (statement_id);


--
-- Name: combinations combinations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.combinations
    ADD CONSTRAINT combinations_pkey PRIMARY KEY (pcid);


--
-- Name: community_pages community_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.community_pages
    ADD CONSTRAINT community_pages_pkey PRIMARY KEY (pcid);


--
-- Name: community_statements community_statements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.community_statements
    ADD CONSTRAINT community_statements_pkey PRIMARY KEY (id);


--
-- Name: contributor_blocks contributor_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contributor_blocks
    ADD CONSTRAINT contributor_blocks_pkey PRIMARY KEY (user_id);


--
-- Name: contributor_profiles contributor_profiles_handle_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contributor_profiles
    ADD CONSTRAINT contributor_profiles_handle_key UNIQUE (handle);


--
-- Name: contributor_profiles contributor_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contributor_profiles
    ADD CONSTRAINT contributor_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: data_sources data_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_sources
    ADD CONSTRAINT data_sources_pkey PRIMARY KEY (source_key);


--
-- Name: dictionary_terms dictionary_terms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dictionary_terms
    ADD CONSTRAINT dictionary_terms_pkey PRIMARY KEY (id);


--
-- Name: drug_classes drug_classes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.drug_classes
    ADD CONSTRAINT drug_classes_pkey PRIMARY KEY (pcid);


--
-- Name: entities entities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entities
    ADD CONSTRAINT entities_pkey PRIMARY KEY (pcid);


--
-- Name: entities entities_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entities
    ADD CONSTRAINT entities_slug_key UNIQUE (slug);


--
-- Name: entities entities_slug_uri_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entities
    ADD CONSTRAINT entities_slug_uri_key UNIQUE (slug_uri);


--
-- Name: entity_changes entity_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entity_changes
    ADD CONSTRAINT entity_changes_pkey PRIMARY KEY (change_id);


--
-- Name: entity_guidelines entity_guidelines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entity_guidelines
    ADD CONSTRAINT entity_guidelines_pkey PRIMARY KEY (pcid, guideline_id);


--
-- Name: entity_versions entity_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entity_versions
    ADD CONSTRAINT entity_versions_pkey PRIMARY KEY (pcid, version);


--
-- Name: federal_controlled_substances fcs_drug_schedule_uniq; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.federal_controlled_substances
    ADD CONSTRAINT fcs_drug_schedule_uniq UNIQUE (drug_name, control_status);


--
-- Name: fda_applications fda_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fda_applications
    ADD CONSTRAINT fda_applications_pkey PRIMARY KEY (appl_no);


--
-- Name: fda_product_ingredients fda_product_ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fda_product_ingredients
    ADD CONSTRAINT fda_product_ingredients_pkey PRIMARY KEY (product_id, ingredient_no);


--
-- Name: fda_products fda_products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fda_products
    ADD CONSTRAINT fda_products_pkey PRIMARY KEY (product_id);


--
-- Name: federal_controlled_substances federal_controlled_substances_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.federal_controlled_substances
    ADD CONSTRAINT federal_controlled_substances_pkey PRIMARY KEY (id);


--
-- Name: formulations formulations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.formulations
    ADD CONSTRAINT formulations_pkey PRIMARY KEY (pcid);


--
-- Name: functional_groups functional_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.functional_groups
    ADD CONSTRAINT functional_groups_pkey PRIMARY KEY (pcid);


--
-- Name: guidelines guidelines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guidelines
    ADD CONSTRAINT guidelines_pkey PRIMARY KEY (guideline_id);


--
-- Name: guidelines guidelines_url_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guidelines
    ADD CONSTRAINT guidelines_url_key UNIQUE (url);


--
-- Name: infobox_edits infobox_edits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.infobox_edits
    ADD CONSTRAINT infobox_edits_pkey PRIMARY KEY (id);


--
-- Name: infobox_properties infobox_properties_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.infobox_properties
    ADD CONSTRAINT infobox_properties_pkey PRIMARY KEY (key);


--
-- Name: ingest_tokens ingest_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ingest_tokens
    ADD CONSTRAINT ingest_tokens_pkey PRIMARY KEY (name);


--
-- Name: label_document_formulations label_document_formulations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.label_document_formulations
    ADD CONSTRAINT label_document_formulations_pkey PRIMARY KEY (setid, pcid);


--
-- Name: label_documents label_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.label_documents
    ADD CONSTRAINT label_documents_pkey PRIMARY KEY (setid);


--
-- Name: label_fetch_log label_fetch_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.label_fetch_log
    ADD CONSTRAINT label_fetch_log_pkey PRIMARY KEY (setid);


--
-- Name: label_section_text label_section_text_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.label_section_text
    ADD CONSTRAINT label_section_text_pkey PRIMARY KEY (setid, section_key);


--
-- Name: label_sections label_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.label_sections
    ADD CONSTRAINT label_sections_pkey PRIMARY KEY (id);


--
-- Name: lasa_names lasa_names_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lasa_names
    ADD CONSTRAINT lasa_names_pkey PRIMARY KEY (id);


--
-- Name: learn_brand_list learn_brand_list_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_brand_list
    ADD CONSTRAINT learn_brand_list_pkey PRIMARY KEY (sheet_id);


--
-- Name: learn_collection_items learn_collection_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_collection_items
    ADD CONSTRAINT learn_collection_items_pkey PRIMARY KEY (collection_id, item_id);


--
-- Name: learn_collections learn_collections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_collections
    ADD CONSTRAINT learn_collections_pkey PRIMARY KEY (id);


--
-- Name: learn_collections learn_collections_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_collections
    ADD CONSTRAINT learn_collections_slug_key UNIQUE (slug);


--
-- Name: learn_item_entities learn_item_entities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_item_entities
    ADD CONSTRAINT learn_item_entities_pkey PRIMARY KEY (item_id, pcid);


--
-- Name: learn_items learn_items_natural_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_items
    ADD CONSTRAINT learn_items_natural_key_key UNIQUE (natural_key);


--
-- Name: learn_items learn_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_items
    ADD CONSTRAINT learn_items_pkey PRIMARY KEY (id);


--
-- Name: learn_review_events learn_review_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_review_events
    ADD CONSTRAINT learn_review_events_pkey PRIMARY KEY (id);


--
-- Name: learn_review_events learn_review_events_user_id_client_event_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_review_events
    ADD CONSTRAINT learn_review_events_user_id_client_event_id_key UNIQUE (user_id, client_event_id);


--
-- Name: learn_user_item_state learn_user_item_state_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_user_item_state
    ADD CONSTRAINT learn_user_item_state_pkey PRIMARY KEY (user_id, item_id);


--
-- Name: learn_user_settings learn_user_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_user_settings
    ADD CONSTRAINT learn_user_settings_pkey PRIMARY KEY (user_id);


--
-- Name: list_items list_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.list_items
    ADD CONSTRAINT list_items_pkey PRIMARY KEY (list_pcid, "position");


--
-- Name: lists lists_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lists
    ADD CONSTRAINT lists_pkey PRIMARY KEY (pcid);


--
-- Name: lists lists_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lists
    ADD CONSTRAINT lists_slug_key UNIQUE (slug);


--
-- Name: measurements measurements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.measurements
    ADD CONSTRAINT measurements_pkey PRIMARY KEY (pcid);


--
-- Name: moieties moieties_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.moieties
    ADD CONSTRAINT moieties_pkey PRIMARY KEY (pcid);


--
-- Name: page_citations page_citations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.page_citations
    ADD CONSTRAINT page_citations_pkey PRIMARY KEY (revision_id, ordinal);


--
-- Name: page_citations page_citations_revision_id_ref_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.page_citations
    ADD CONSTRAINT page_citations_revision_id_ref_key_key UNIQUE (revision_id, ref_key);


--
-- Name: page_content page_content_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.page_content
    ADD CONSTRAINT page_content_pkey PRIMARY KEY (pcid);


--
-- Name: page_links page_links_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.page_links
    ADD CONSTRAINT page_links_pkey PRIMARY KEY (source_pcid, target_text);


--
-- Name: page_property_refs page_property_refs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.page_property_refs
    ADD CONSTRAINT page_property_refs_pkey PRIMARY KEY (source_pcid, property_key, target_text);


--
-- Name: page_revisions page_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.page_revisions
    ADD CONSTRAINT page_revisions_pkey PRIMARY KEY (id);


--
-- Name: page_templates page_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.page_templates
    ADD CONSTRAINT page_templates_pkey PRIMARY KEY (page_type);


--
-- Name: pcid_blocks pcid_blocks_entity_kind_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pcid_blocks
    ADD CONSTRAINT pcid_blocks_entity_kind_key UNIQUE (entity_kind);


--
-- Name: pcid_blocks pcid_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pcid_blocks
    ADD CONSTRAINT pcid_blocks_pkey PRIMARY KEY (block_id);


--
-- Name: pcid_retired pcid_retired_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pcid_retired
    ADD CONSTRAINT pcid_retired_pkey PRIMARY KEY (pcid);


--
-- Name: physiochemical physiochemical_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.physiochemical
    ADD CONSTRAINT physiochemical_pkey PRIMARY KEY (pcid);


--
-- Name: precise_forms precise_forms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.precise_forms
    ADD CONSTRAINT precise_forms_pkey PRIMARY KEY (pcid);


--
-- Name: predicates predicates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.predicates
    ADD CONSTRAINT predicates_pkey PRIMARY KEY (predicate);


--
-- Name: product_packaging product_packaging_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_packaging
    ADD CONSTRAINT product_packaging_pkey PRIMARY KEY (id);


--
-- Name: provider_verifications provider_verifications_npi_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.provider_verifications
    ADD CONSTRAINT provider_verifications_npi_key UNIQUE (npi);


--
-- Name: provider_verifications provider_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.provider_verifications
    ADD CONSTRAINT provider_verifications_pkey PRIMARY KEY (user_id);


--
-- Name: references_resources references_resources_guideline_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.references_resources
    ADD CONSTRAINT references_resources_guideline_id_key UNIQUE (guideline_id);


--
-- Name: references_resources references_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.references_resources
    ADD CONSTRAINT references_resources_pkey PRIMARY KEY (id);


--
-- Name: rems_products rems_products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rems_products
    ADD CONSTRAINT rems_products_pkey PRIMARY KEY (product_id);


--
-- Name: rems_programs rems_programs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rems_programs
    ADD CONSTRAINT rems_programs_pkey PRIMARY KEY (rems_id);


--
-- Name: revisions revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.revisions
    ADD CONSTRAINT revisions_pkey PRIMARY KEY (id);


--
-- Name: rxclass_classes rxclass_classes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rxclass_classes
    ADD CONSTRAINT rxclass_classes_pkey PRIMARY KEY (class_id, rela_source);


--
-- Name: rxclass_drug rxclass_drug_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rxclass_drug
    ADD CONSTRAINT rxclass_drug_pkey PRIMARY KEY (pcid, class_id, rela_source, rela);


--
-- Name: rxclass_lookup rxclass_lookup_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rxclass_lookup
    ADD CONSTRAINT rxclass_lookup_pkey PRIMARY KEY (pcid);


--
-- Name: rxclass_va_products rxclass_va_products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rxclass_va_products
    ADD CONSTRAINT rxclass_va_products_pkey PRIMARY KEY (class_id, product);


--
-- Name: rxnorm_brands rxnorm_brands_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rxnorm_brands
    ADD CONSTRAINT rxnorm_brands_pkey PRIMARY KEY (pcid, brand_rxcui);


--
-- Name: rxnorm_lookup rxnorm_lookup_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rxnorm_lookup
    ADD CONSTRAINT rxnorm_lookup_pkey PRIMARY KEY (pcid);


--
-- Name: saved_entities saved_entities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.saved_entities
    ADD CONSTRAINT saved_entities_pkey PRIMARY KEY (user_id, pcid_code);


--
-- Name: section_embeds section_embeds_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_embeds
    ADD CONSTRAINT section_embeds_pkey PRIMARY KEY (name);


--
-- Name: structure_name_candidates structure_name_candidates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.structure_name_candidates
    ADD CONSTRAINT structure_name_candidates_pkey PRIMARY KEY (pcid);


--
-- Name: term_definitions term_definitions_pcid_source_page_url_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.term_definitions
    ADD CONSTRAINT term_definitions_pcid_source_page_url_key UNIQUE (pcid, source_page_url);


--
-- Name: term_definitions term_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.term_definitions
    ADD CONSTRAINT term_definitions_pkey PRIMARY KEY (id);


--
-- Name: threshold_rules threshold_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.threshold_rules
    ADD CONSTRAINT threshold_rules_pkey PRIMARY KEY (id);


--
-- Name: clinical_statements unique_statement_triple; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clinical_statements
    ADD CONSTRAINT unique_statement_triple UNIQUE (subject_pcid, predicate, object_pcid, object_label);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role);


--
-- Name: stg_name_index_nn; Type: INDEX; Schema: archive; Owner: postgres
--

CREATE INDEX stg_name_index_nn ON archive.stg_name_index USING btree (nn);


--
-- Name: blog_comments_author_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX blog_comments_author_idx ON public.blog_comments USING btree (author_id, created_at);


--
-- Name: blog_comments_parent_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX blog_comments_parent_idx ON public.blog_comments USING btree (parent_id) WHERE (parent_id IS NOT NULL);


--
-- Name: blog_comments_post_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX blog_comments_post_idx ON public.blog_comments USING btree (post_slug, created_at);


--
-- Name: blog_comments_unpatrolled_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX blog_comments_unpatrolled_idx ON public.blog_comments USING btree (created_at) WHERE ((state = 'visible'::text) AND (patrolled_at IS NULL));


--
-- Name: brand_edits_current_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX brand_edits_current_idx ON public.brand_edits USING btree (pcid, brand_key) WHERE is_current;


--
-- Name: brand_edits_queue_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX brand_edits_queue_idx ON public.brand_edits USING btree (patrol_status) WHERE (patrol_status = ANY (ARRAY['pending'::text, 'unpatrolled'::text]));


--
-- Name: class_members_member_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX class_members_member_idx ON public.class_members USING btree (member_pcid);


--
-- Name: class_search_aliases_class_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX class_search_aliases_class_idx ON public.class_search_aliases USING btree (class_pcid);


--
-- Name: clinical_statements_comparator_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX clinical_statements_comparator_idx ON public.clinical_statements USING btree (comparator_pcid) WHERE (comparator_pcid IS NOT NULL);


--
-- Name: combinations_synonym_of_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX combinations_synonym_of_idx ON public.combinations USING btree (synonym_of_pcid) WHERE (synonym_of_pcid IS NOT NULL);


--
-- Name: community_statements_current; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX community_statements_current ON public.community_statements USING btree (subject_pcid, block_name) WHERE is_current;


--
-- Name: community_statements_object; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX community_statements_object ON public.community_statements USING btree (object_pcid) WHERE is_current;


--
-- Name: community_statements_revision; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX community_statements_revision ON public.community_statements USING btree (revision_id);


--
-- Name: dictionary_terms_abbr_expansion_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX dictionary_terms_abbr_expansion_idx ON public.dictionary_terms USING btree (TRIM(BOTH FROM regexp_replace(lower(definition), '[^a-z0-9]+'::text, ' '::text, 'g'::text))) WHERE (kind = 'Abbreviation'::text);


--
-- Name: dictionary_terms_bucket_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX dictionary_terms_bucket_idx ON public.dictionary_terms USING btree (bucket, sort_key, id);


--
-- Name: dictionary_terms_lower_term_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX dictionary_terms_lower_term_idx ON public.dictionary_terms USING btree (lower(term));


--
-- Name: dictionary_terms_member_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX dictionary_terms_member_idx ON public.dictionary_terms USING btree (member_pcid) WHERE (member_pcid IS NOT NULL);


--
-- Name: drug_classes_parent_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX drug_classes_parent_idx ON public.drug_classes USING btree (parent_pcid);


--
-- Name: drug_classes_source_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX drug_classes_source_uq ON public.drug_classes USING btree (source_system, source_code) WHERE (source_code IS NOT NULL);


--
-- Name: drug_classes_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX drug_classes_type_idx ON public.drug_classes USING btree (class_type);


--
-- Name: entity_brand_names_brand_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX entity_brand_names_brand_key ON public.entity_brand_names USING btree (brand_key);


--
-- Name: entity_brand_names_pk; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX entity_brand_names_pk ON public.entity_brand_names USING btree (pcid, brand_key);


--
-- Name: entity_changes_pcid_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX entity_changes_pcid_idx ON public.entity_changes USING btree (pcid, change_id DESC);


--
-- Name: entity_label_rank_pk; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX entity_label_rank_pk ON public.entity_label_rank USING btree (pcid, rnk);


--
-- Name: fcs_schedule_importance_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX fcs_schedule_importance_idx ON public.federal_controlled_substances USING btree (schedule_num, importance);


--
-- Name: fda_product_ingredients_active_moiety_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX fda_product_ingredients_active_moiety_idx ON public.fda_product_ingredients USING btree (active_moiety_pcid);


--
-- Name: fda_product_ingredients_form_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX fda_product_ingredients_form_idx ON public.fda_product_ingredients USING btree (form_pcid);


--
-- Name: fda_product_ingredients_moiety_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX fda_product_ingredients_moiety_idx ON public.fda_product_ingredients USING btree (moiety_pcid);


--
-- Name: formulations_synonym_of_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX formulations_synonym_of_idx ON public.formulations USING btree (synonym_of_pcid) WHERE (synonym_of_pcid IS NOT NULL);


--
-- Name: idx_chemont_links_chemont_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chemont_links_chemont_id ON public.chemont_links USING btree (chemont_id);


--
-- Name: idx_clinical_statements_object; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_clinical_statements_object ON public.clinical_statements USING btree (object_pcid);


--
-- Name: idx_clinical_statements_predicate; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_clinical_statements_predicate ON public.clinical_statements USING btree (predicate);


--
-- Name: idx_clinical_statements_subject; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_clinical_statements_subject ON public.clinical_statements USING btree (subject_pcid);


--
-- Name: idx_entities_entity_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_entities_entity_type ON public.entities USING btree (entity_type);


--
-- Name: idx_entity_guidelines_pcid; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_entity_guidelines_pcid ON public.entity_guidelines USING btree (pcid, sort_order);


--
-- Name: idx_fda_applications_pcid; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fda_applications_pcid ON public.fda_applications USING btree (pcid);


--
-- Name: idx_fda_products_appl_no; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fda_products_appl_no ON public.fda_products USING btree (appl_no);


--
-- Name: idx_fda_products_ndc; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fda_products_ndc ON public.fda_products USING btree (ndc);


--
-- Name: idx_fda_products_pcid; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fda_products_pcid ON public.fda_products USING btree (pcid);


--
-- Name: idx_label_sections_loinc; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_label_sections_loinc ON public.label_sections USING btree (loinc_code);


--
-- Name: idx_label_sections_setid; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_label_sections_setid ON public.label_sections USING btree (setid);


--
-- Name: idx_ldf_pcid; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ldf_pcid ON public.label_document_formulations USING btree (pcid);


--
-- Name: idx_lst_setid_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lst_setid_order ON public.label_section_text USING btree (setid, display_order);


--
-- Name: idx_physiochemical_cas_rn; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_physiochemical_cas_rn ON public.physiochemical USING btree (cas_rn);


--
-- Name: idx_ref_res_headers; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ref_res_headers ON public.references_resources USING btree (headers);


--
-- Name: idx_ref_res_ref_section; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ref_res_ref_section ON public.references_resources USING btree (reference_section);


--
-- Name: idx_revisions_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_revisions_status ON public.revisions USING btree (status);


--
-- Name: idx_revisions_target_pcid; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_revisions_target_pcid ON public.revisions USING btree (target_pcid);


--
-- Name: infobox_edits_current_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX infobox_edits_current_idx ON public.infobox_edits USING btree (pcid, property_key) WHERE is_current;


--
-- Name: ingredient_moiety_map_pk; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ingredient_moiety_map_pk ON public.ingredient_moiety_map USING btree (ingredient);


--
-- Name: lasa_names_confused_pcid_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX lasa_names_confused_pcid_idx ON public.lasa_names USING btree (confused_with_pcid);


--
-- Name: lasa_names_cw_moiety_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX lasa_names_cw_moiety_idx ON public.lasa_names USING btree (confused_with_moiety_pcid);


--
-- Name: lasa_names_name_moiety_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX lasa_names_name_moiety_idx ON public.lasa_names USING btree (name_moiety_pcid);


--
-- Name: lasa_names_name_pcid_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX lasa_names_name_pcid_idx ON public.lasa_names USING btree (name_pcid);


--
-- Name: learn_brand_list_brand_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX learn_brand_list_brand_idx ON public.learn_brand_list USING btree (brand_pcid);


--
-- Name: learn_brand_list_generic_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX learn_brand_list_generic_idx ON public.learn_brand_list USING btree (generic_pcid);


--
-- Name: learn_brand_list_name_uidx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX learn_brand_list_name_uidx ON public.learn_brand_list USING btree (lower(brand_name));


--
-- Name: learn_collection_items_item_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX learn_collection_items_item_idx ON public.learn_collection_items USING btree (item_id);


--
-- Name: learn_collections_list_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX learn_collections_list_idx ON public.learn_collections USING btree (source_list_pcid) WHERE (source_list_pcid IS NOT NULL);


--
-- Name: learn_collections_owner_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX learn_collections_owner_idx ON public.learn_collections USING btree (owner_id) WHERE (owner_id IS NOT NULL);


--
-- Name: learn_collections_pub_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX learn_collections_pub_idx ON public.learn_collections USING btree (is_official, status);


--
-- Name: learn_events_item_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX learn_events_item_idx ON public.learn_review_events USING btree (item_id);


--
-- Name: learn_events_user_time_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX learn_events_user_time_idx ON public.learn_review_events USING btree (user_id, reviewed_at DESC);


--
-- Name: learn_item_entities_pcid_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX learn_item_entities_pcid_idx ON public.learn_item_entities USING btree (pcid);


--
-- Name: learn_items_list_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX learn_items_list_idx ON public.learn_items USING btree (source_list_pcid) WHERE (source_list_pcid IS NOT NULL);


--
-- Name: learn_items_owner_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX learn_items_owner_idx ON public.learn_items USING btree (owner_id) WHERE (owner_id IS NOT NULL);


--
-- Name: learn_items_pcid_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX learn_items_pcid_idx ON public.learn_items USING btree (primary_pcid) WHERE (primary_pcid IS NOT NULL);


--
-- Name: learn_items_pub_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX learn_items_pub_idx ON public.learn_items USING btree (is_official, status);


--
-- Name: learn_items_template_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX learn_items_template_idx ON public.learn_items USING btree (template_key) WHERE (template_key IS NOT NULL);


--
-- Name: learn_items_topic_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX learn_items_topic_idx ON public.learn_items USING btree (subject_area, topic);


--
-- Name: learn_state_due_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX learn_state_due_idx ON public.learn_user_item_state USING btree (user_id, due_at);


--
-- Name: list_items_component_pcid_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX list_items_component_pcid_idx ON public.list_items USING btree (component_pcid) WHERE (component_pcid IS NOT NULL);


--
-- Name: list_items_member_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX list_items_member_idx ON public.list_items USING btree (member_pcid);


--
-- Name: list_items_member_pcid_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX list_items_member_pcid_idx ON public.list_items USING btree (member_pcid) WHERE (member_pcid IS NOT NULL);


--
-- Name: list_items_term_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX list_items_term_idx ON public.list_items USING btree (term_id) WHERE (term_id IS NOT NULL);


--
-- Name: moieties_synonym_of_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX moieties_synonym_of_idx ON public.moieties USING btree (synonym_of_pcid) WHERE (synonym_of_pcid IS NOT NULL);


--
-- Name: moiety_hierarchy_member_pcid_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX moiety_hierarchy_member_pcid_idx ON public.moiety_hierarchy USING btree (member_pcid);


--
-- Name: moiety_hierarchy_moiety_pcid_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX moiety_hierarchy_moiety_pcid_idx ON public.moiety_hierarchy USING btree (moiety_pcid);


--
-- Name: moiety_hierarchy_pk; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX moiety_hierarchy_pk ON public.moiety_hierarchy USING btree (moiety_pcid, member_pcid, relation);


--
-- Name: page_links_target_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX page_links_target_idx ON public.page_links USING btree (target_pcid);


--
-- Name: page_revisions_author_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX page_revisions_author_idx ON public.page_revisions USING btree (created_by, created_at DESC);


--
-- Name: page_revisions_pcid_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX page_revisions_pcid_idx ON public.page_revisions USING btree (pcid, id DESC);


--
-- Name: page_revisions_queue_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX page_revisions_queue_idx ON public.page_revisions USING btree (created_at DESC) WHERE (patrol_status = ANY (ARRAY['unpatrolled'::text, 'pending'::text]));


--
-- Name: precise_forms_parent_moiety_pcid_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX precise_forms_parent_moiety_pcid_idx ON public.precise_forms USING btree (parent_moiety_pcid);


--
-- Name: precise_forms_synonym_of_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX precise_forms_synonym_of_idx ON public.precise_forms USING btree (synonym_of_pcid) WHERE (synonym_of_pcid IS NOT NULL);


--
-- Name: product_packaging_one_per_source; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX product_packaging_one_per_source ON public.product_packaging USING btree (entity_pcid, COALESCE(product_name, ''::text), COALESCE(ndc, ''::text), basis, value_source, COALESCE(payer_name, ''::text));


--
-- Name: product_packaging_pcid_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX product_packaging_pcid_idx ON public.product_packaging USING btree (entity_pcid);


--
-- Name: rems_products_moiety_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rems_products_moiety_idx ON public.rems_products USING gin (moiety_pcids);


--
-- Name: rems_products_rems_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rems_products_rems_idx ON public.rems_products USING btree (rems_id);


--
-- Name: rxnorm_lookup_rxcui; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rxnorm_lookup_rxcui ON public.rxnorm_lookup USING btree (rxcui);


--
-- Name: saved_entities_user_saved_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX saved_entities_user_saved_at_idx ON public.saved_entities USING btree (user_id, saved_at DESC);


--
-- Name: search_index_key_prefix; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX search_index_key_prefix ON public.search_index USING btree (key text_pattern_ops);


--
-- Name: search_index_key_trgm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX search_index_key_trgm ON public.search_index USING gin (key extensions.gin_trgm_ops);


--
-- Name: search_index_pk; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX search_index_pk ON public.search_index USING btree (pcid, src, key);


--
-- Name: term_definitions_pcid_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX term_definitions_pcid_idx ON public.term_definitions USING btree (pcid);


--
-- Name: threshold_rules_current; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX threshold_rules_current ON public.threshold_rules USING btree (block_name, measure, pcid) WHERE is_current;


--
-- Name: learn_collections learn_collections_guard; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER learn_collections_guard BEFORE INSERT ON public.learn_collections FOR EACH ROW EXECUTE FUNCTION public.learn_personal_collection_guard();


--
-- Name: learn_collections learn_collections_touch; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER learn_collections_touch BEFORE UPDATE ON public.learn_collections FOR EACH ROW EXECUTE FUNCTION public.learn_touch();


--
-- Name: learn_items learn_items_guard; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER learn_items_guard BEFORE INSERT OR UPDATE ON public.learn_items FOR EACH ROW EXECUTE FUNCTION public.learn_personal_guard();


--
-- Name: learn_items learn_items_touch; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER learn_items_touch BEFORE UPDATE ON public.learn_items FOR EACH ROW EXECUTE FUNCTION public.learn_touch();


--
-- Name: learn_user_item_state learn_state_touch; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER learn_state_touch BEFORE UPDATE ON public.learn_user_item_state FOR EACH ROW EXECUTE FUNCTION public.learn_touch();


--
-- Name: references_resources references_resources_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER references_resources_set_updated_at BEFORE UPDATE ON public.references_resources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: entities trg_entities_pcid_in_block; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_entities_pcid_in_block BEFORE INSERT OR UPDATE ON public.entities FOR EACH ROW EXECUTE FUNCTION public.enforce_pcid_in_block();


--
-- Name: biological_targets trg_log_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_log_change AFTER INSERT OR DELETE OR UPDATE ON public.biological_targets FOR EACH ROW EXECUTE FUNCTION public.log_entity_change('pcid');


--
-- Name: clinical_concepts trg_log_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_log_change AFTER INSERT OR DELETE OR UPDATE ON public.clinical_concepts FOR EACH ROW EXECUTE FUNCTION public.log_entity_change('pcid');


--
-- Name: clinical_statements trg_log_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_log_change AFTER INSERT OR DELETE OR UPDATE ON public.clinical_statements FOR EACH ROW EXECUTE FUNCTION public.log_entity_change('subject_pcid,object_pcid,comparator_pcid', 'statement_id');


--
-- Name: combinations trg_log_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_log_change AFTER INSERT OR DELETE OR UPDATE ON public.combinations FOR EACH ROW EXECUTE FUNCTION public.log_entity_change('pcid');


--
-- Name: drug_classes trg_log_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_log_change AFTER INSERT OR DELETE OR UPDATE ON public.drug_classes FOR EACH ROW EXECUTE FUNCTION public.log_entity_change('pcid');


--
-- Name: entities trg_log_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_log_change AFTER INSERT OR DELETE OR UPDATE ON public.entities FOR EACH ROW EXECUTE FUNCTION public.log_entity_change('pcid');


--
-- Name: entity_guidelines trg_log_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_log_change AFTER INSERT OR DELETE OR UPDATE ON public.entity_guidelines FOR EACH ROW EXECUTE FUNCTION public.log_entity_change('pcid', 'guideline_id');


--
-- Name: formulations trg_log_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_log_change AFTER INSERT OR DELETE OR UPDATE ON public.formulations FOR EACH ROW EXECUTE FUNCTION public.log_entity_change('pcid');


--
-- Name: functional_groups trg_log_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_log_change AFTER INSERT OR DELETE OR UPDATE ON public.functional_groups FOR EACH ROW EXECUTE FUNCTION public.log_entity_change('pcid');


--
-- Name: measurements trg_log_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_log_change AFTER INSERT OR DELETE OR UPDATE ON public.measurements FOR EACH ROW EXECUTE FUNCTION public.log_entity_change('pcid');


--
-- Name: moieties trg_log_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_log_change AFTER INSERT OR DELETE OR UPDATE ON public.moieties FOR EACH ROW EXECUTE FUNCTION public.log_entity_change('pcid');


--
-- Name: physiochemical trg_log_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_log_change AFTER INSERT OR DELETE OR UPDATE ON public.physiochemical FOR EACH ROW EXECUTE FUNCTION public.log_entity_change('pcid');


--
-- Name: precise_forms trg_log_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_log_change AFTER INSERT OR DELETE OR UPDATE ON public.precise_forms FOR EACH ROW EXECUTE FUNCTION public.log_entity_change('pcid');


--
-- Name: class_agent_skip class_agent_skip_member_pcid_fkey; Type: FK CONSTRAINT; Schema: archive; Owner: postgres
--

ALTER TABLE ONLY archive.class_agent_skip
    ADD CONSTRAINT class_agent_skip_member_pcid_fkey FOREIGN KEY (member_pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;


--
-- Name: stg_topdrugs_match stg_topdrugs_match_pcid_fkey; Type: FK CONSTRAINT; Schema: archive; Owner: postgres
--

ALTER TABLE ONLY archive.stg_topdrugs_match
    ADD CONSTRAINT stg_topdrugs_match_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid);


--
-- Name: stg_topdrugs_match stg_topdrugs_match_row_no_fkey; Type: FK CONSTRAINT; Schema: archive; Owner: postgres
--

ALTER TABLE ONLY archive.stg_topdrugs_match
    ADD CONSTRAINT stg_topdrugs_match_row_no_fkey FOREIGN KEY (row_no) REFERENCES archive.stg_topdrugs_rows(row_no);


--
-- Name: account_profiles account_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_profiles
    ADD CONSTRAINT account_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: biological_targets biological_targets_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.biological_targets
    ADD CONSTRAINT biological_targets_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;


--
-- Name: blog_comments blog_comments_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.blog_comments
    ADD CONSTRAINT blog_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: blog_comments blog_comments_moderated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.blog_comments
    ADD CONSTRAINT blog_comments_moderated_by_fkey FOREIGN KEY (moderated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: blog_comments blog_comments_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.blog_comments
    ADD CONSTRAINT blog_comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.blog_comments(id);


--
-- Name: blog_comments blog_comments_patrolled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.blog_comments
    ADD CONSTRAINT blog_comments_patrolled_by_fkey FOREIGN KEY (patrolled_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: brand_edits brand_edits_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.brand_edits
    ADD CONSTRAINT brand_edits_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: brand_edits brand_edits_patrolled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.brand_edits
    ADD CONSTRAINT brand_edits_patrolled_by_fkey FOREIGN KEY (patrolled_by) REFERENCES auth.users(id);


--
-- Name: brand_edits brand_edits_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.brand_edits
    ADD CONSTRAINT brand_edits_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid);


--
-- Name: brand_edits brand_edits_revision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.brand_edits
    ADD CONSTRAINT brand_edits_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES public.page_revisions(id);


--
-- Name: chemont_links chemont_links_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chemont_links
    ADD CONSTRAINT chemont_links_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;


--
-- Name: class_agent_review class_agent_review_member_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_agent_review
    ADD CONSTRAINT class_agent_review_member_pcid_fkey FOREIGN KEY (member_pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;


--
-- Name: class_members class_members_class_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_members
    ADD CONSTRAINT class_members_class_pcid_fkey FOREIGN KEY (class_pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;


--
-- Name: class_members class_members_member_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_members
    ADD CONSTRAINT class_members_member_pcid_fkey FOREIGN KEY (member_pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;


--
-- Name: class_rules class_rules_parent_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_rules
    ADD CONSTRAINT class_rules_parent_code_fkey FOREIGN KEY (parent_code) REFERENCES public.class_rules(code);


--
-- Name: class_search_aliases class_search_aliases_class_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_search_aliases
    ADD CONSTRAINT class_search_aliases_class_pcid_fkey FOREIGN KEY (class_pcid) REFERENCES public.drug_classes(pcid) ON DELETE CASCADE;


--
-- Name: classyfire_lookup classyfire_lookup_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classyfire_lookup
    ADD CONSTRAINT classyfire_lookup_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;


--
-- Name: clinical_concepts clinical_concepts_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clinical_concepts
    ADD CONSTRAINT clinical_concepts_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;


--
-- Name: clinical_statements clinical_statements_comparator_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clinical_statements
    ADD CONSTRAINT clinical_statements_comparator_pcid_fkey FOREIGN KEY (comparator_pcid) REFERENCES public.entities(pcid);


--
-- Name: clinical_statements clinical_statements_object_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clinical_statements
    ADD CONSTRAINT clinical_statements_object_pcid_fkey FOREIGN KEY (object_pcid) REFERENCES public.entities(pcid);


--
-- Name: clinical_statements clinical_statements_predicate_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clinical_statements
    ADD CONSTRAINT clinical_statements_predicate_fkey FOREIGN KEY (predicate) REFERENCES public.predicates(predicate);


--
-- Name: clinical_statements clinical_statements_subject_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clinical_statements
    ADD CONSTRAINT clinical_statements_subject_pcid_fkey FOREIGN KEY (subject_pcid) REFERENCES public.entities(pcid);


--
-- Name: combinations combinations_class_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.combinations
    ADD CONSTRAINT combinations_class_pcid_fkey FOREIGN KEY (class_pcid) REFERENCES public.entities(pcid);


--
-- Name: combinations combinations_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.combinations
    ADD CONSTRAINT combinations_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;


--
-- Name: combinations combinations_synonym_of_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.combinations
    ADD CONSTRAINT combinations_synonym_of_pcid_fkey FOREIGN KEY (synonym_of_pcid) REFERENCES public.entities(pcid);


--
-- Name: community_pages community_pages_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.community_pages
    ADD CONSTRAINT community_pages_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: community_pages community_pages_patrolled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.community_pages
    ADD CONSTRAINT community_pages_patrolled_by_fkey FOREIGN KEY (patrolled_by) REFERENCES auth.users(id);


--
-- Name: community_pages community_pages_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.community_pages
    ADD CONSTRAINT community_pages_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid);


--
-- Name: community_statements community_statements_block_name_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.community_statements
    ADD CONSTRAINT community_statements_block_name_fkey FOREIGN KEY (block_name) REFERENCES public.block_schemas(name);


--
-- Name: community_statements community_statements_object_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.community_statements
    ADD CONSTRAINT community_statements_object_pcid_fkey FOREIGN KEY (object_pcid) REFERENCES public.entities(pcid);


--
-- Name: community_statements community_statements_predicate_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.community_statements
    ADD CONSTRAINT community_statements_predicate_fkey FOREIGN KEY (predicate) REFERENCES public.predicates(predicate);


--
-- Name: community_statements community_statements_revision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.community_statements
    ADD CONSTRAINT community_statements_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES public.page_revisions(id);


--
-- Name: community_statements community_statements_subject_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.community_statements
    ADD CONSTRAINT community_statements_subject_pcid_fkey FOREIGN KEY (subject_pcid) REFERENCES public.entities(pcid);


--
-- Name: contributor_blocks contributor_blocks_blocked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contributor_blocks
    ADD CONSTRAINT contributor_blocks_blocked_by_fkey FOREIGN KEY (blocked_by) REFERENCES auth.users(id);


--
-- Name: contributor_blocks contributor_blocks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contributor_blocks
    ADD CONSTRAINT contributor_blocks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: contributor_profiles contributor_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contributor_profiles
    ADD CONSTRAINT contributor_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: dictionary_terms dictionary_terms_member_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dictionary_terms
    ADD CONSTRAINT dictionary_terms_member_pcid_fkey FOREIGN KEY (member_pcid) REFERENCES public.entities(pcid);


--
-- Name: drug_classes drug_classes_parent_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.drug_classes
    ADD CONSTRAINT drug_classes_parent_pcid_fkey FOREIGN KEY (parent_pcid) REFERENCES public.entities(pcid) ON DELETE SET NULL;


--
-- Name: drug_classes drug_classes_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.drug_classes
    ADD CONSTRAINT drug_classes_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;


--
-- Name: entities entities_entity_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entities
    ADD CONSTRAINT entities_entity_type_fkey FOREIGN KEY (entity_type) REFERENCES public.pcid_blocks(entity_kind);


--
-- Name: entity_guidelines entity_guidelines_guideline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entity_guidelines
    ADD CONSTRAINT entity_guidelines_guideline_id_fkey FOREIGN KEY (guideline_id) REFERENCES public.guidelines(guideline_id) ON DELETE CASCADE;


--
-- Name: entity_guidelines entity_guidelines_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entity_guidelines
    ADD CONSTRAINT entity_guidelines_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;


--
-- Name: fda_applications fda_applications_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fda_applications
    ADD CONSTRAINT fda_applications_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid);


--
-- Name: fda_product_ingredients fda_product_ingredients_active_moiety_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fda_product_ingredients
    ADD CONSTRAINT fda_product_ingredients_active_moiety_pcid_fkey FOREIGN KEY (active_moiety_pcid) REFERENCES public.entities(pcid);


--
-- Name: fda_product_ingredients fda_product_ingredients_form_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fda_product_ingredients
    ADD CONSTRAINT fda_product_ingredients_form_pcid_fkey FOREIGN KEY (form_pcid) REFERENCES public.entities(pcid);


--
-- Name: fda_product_ingredients fda_product_ingredients_moiety_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fda_product_ingredients
    ADD CONSTRAINT fda_product_ingredients_moiety_pcid_fkey FOREIGN KEY (moiety_pcid) REFERENCES public.entities(pcid);


--
-- Name: fda_product_ingredients fda_product_ingredients_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fda_product_ingredients
    ADD CONSTRAINT fda_product_ingredients_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.fda_products(product_id) ON DELETE CASCADE;


--
-- Name: fda_products fda_products_appl_no_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fda_products
    ADD CONSTRAINT fda_products_appl_no_fkey FOREIGN KEY (appl_no) REFERENCES public.fda_applications(appl_no) ON DELETE CASCADE;


--
-- Name: fda_products fda_products_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fda_products
    ADD CONSTRAINT fda_products_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid);


--
-- Name: formulations formulations_class_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.formulations
    ADD CONSTRAINT formulations_class_pcid_fkey FOREIGN KEY (class_pcid) REFERENCES public.entities(pcid);


--
-- Name: formulations formulations_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.formulations
    ADD CONSTRAINT formulations_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;


--
-- Name: formulations formulations_synonym_of_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.formulations
    ADD CONSTRAINT formulations_synonym_of_pcid_fkey FOREIGN KEY (synonym_of_pcid) REFERENCES public.entities(pcid);


--
-- Name: functional_groups functional_groups_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.functional_groups
    ADD CONSTRAINT functional_groups_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;


--
-- Name: guidelines guidelines_superseded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guidelines
    ADD CONSTRAINT guidelines_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES public.guidelines(guideline_id);


--
-- Name: infobox_edits infobox_edits_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.infobox_edits
    ADD CONSTRAINT infobox_edits_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: infobox_edits infobox_edits_patrolled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.infobox_edits
    ADD CONSTRAINT infobox_edits_patrolled_by_fkey FOREIGN KEY (patrolled_by) REFERENCES auth.users(id);


--
-- Name: infobox_edits infobox_edits_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.infobox_edits
    ADD CONSTRAINT infobox_edits_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid);


--
-- Name: infobox_edits infobox_edits_property_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.infobox_edits
    ADD CONSTRAINT infobox_edits_property_key_fkey FOREIGN KEY (property_key) REFERENCES public.infobox_properties(key);


--
-- Name: infobox_edits infobox_edits_revision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.infobox_edits
    ADD CONSTRAINT infobox_edits_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES public.page_revisions(id);


--
-- Name: label_document_formulations label_document_formulations_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.label_document_formulations
    ADD CONSTRAINT label_document_formulations_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid);


--
-- Name: label_document_formulations label_document_formulations_setid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.label_document_formulations
    ADD CONSTRAINT label_document_formulations_setid_fkey FOREIGN KEY (setid) REFERENCES public.label_documents(setid) ON DELETE CASCADE;


--
-- Name: label_section_text label_section_text_setid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.label_section_text
    ADD CONSTRAINT label_section_text_setid_fkey FOREIGN KEY (setid) REFERENCES public.label_fetch_log(setid) ON DELETE CASCADE;


--
-- Name: label_sections label_sections_setid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.label_sections
    ADD CONSTRAINT label_sections_setid_fkey FOREIGN KEY (setid) REFERENCES public.label_documents(setid) ON DELETE CASCADE;


--
-- Name: lasa_names lasa_names_confused_with_moiety_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lasa_names
    ADD CONSTRAINT lasa_names_confused_with_moiety_pcid_fkey FOREIGN KEY (confused_with_moiety_pcid) REFERENCES public.entities(pcid);


--
-- Name: lasa_names lasa_names_confused_with_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lasa_names
    ADD CONSTRAINT lasa_names_confused_with_pcid_fkey FOREIGN KEY (confused_with_pcid) REFERENCES public.entities(pcid);


--
-- Name: lasa_names lasa_names_name_moiety_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lasa_names
    ADD CONSTRAINT lasa_names_name_moiety_pcid_fkey FOREIGN KEY (name_moiety_pcid) REFERENCES public.entities(pcid);


--
-- Name: lasa_names lasa_names_name_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lasa_names
    ADD CONSTRAINT lasa_names_name_pcid_fkey FOREIGN KEY (name_pcid) REFERENCES public.entities(pcid);


--
-- Name: learn_brand_list learn_brand_list_brand_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_brand_list
    ADD CONSTRAINT learn_brand_list_brand_pcid_fkey FOREIGN KEY (brand_pcid) REFERENCES public.entities(pcid) ON UPDATE CASCADE;


--
-- Name: learn_brand_list learn_brand_list_generic_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_brand_list
    ADD CONSTRAINT learn_brand_list_generic_pcid_fkey FOREIGN KEY (generic_pcid) REFERENCES public.entities(pcid) ON UPDATE CASCADE;


--
-- Name: learn_collection_items learn_collection_items_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_collection_items
    ADD CONSTRAINT learn_collection_items_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.learn_collections(id) ON DELETE CASCADE;


--
-- Name: learn_collection_items learn_collection_items_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_collection_items
    ADD CONSTRAINT learn_collection_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.learn_items(id) ON DELETE CASCADE;


--
-- Name: learn_collections learn_collections_forked_from_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_collections
    ADD CONSTRAINT learn_collections_forked_from_collection_id_fkey FOREIGN KEY (forked_from_collection_id) REFERENCES public.learn_collections(id) ON DELETE SET NULL;


--
-- Name: learn_collections learn_collections_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_collections
    ADD CONSTRAINT learn_collections_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: learn_collections learn_collections_source_list_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_collections
    ADD CONSTRAINT learn_collections_source_list_pcid_fkey FOREIGN KEY (source_list_pcid) REFERENCES public.lists(pcid) ON DELETE SET NULL;


--
-- Name: learn_item_entities learn_item_entities_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_item_entities
    ADD CONSTRAINT learn_item_entities_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.learn_items(id) ON DELETE CASCADE;


--
-- Name: learn_item_entities learn_item_entities_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_item_entities
    ADD CONSTRAINT learn_item_entities_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: learn_items learn_items_forked_from_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_items
    ADD CONSTRAINT learn_items_forked_from_item_id_fkey FOREIGN KEY (forked_from_item_id) REFERENCES public.learn_items(id) ON DELETE SET NULL;


--
-- Name: learn_items learn_items_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_items
    ADD CONSTRAINT learn_items_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: learn_items learn_items_primary_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_items
    ADD CONSTRAINT learn_items_primary_pcid_fkey FOREIGN KEY (primary_pcid) REFERENCES public.entities(pcid) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: learn_items learn_items_reference_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_items
    ADD CONSTRAINT learn_items_reference_id_fkey FOREIGN KEY (reference_id) REFERENCES public.references_resources(id) ON DELETE SET NULL;


--
-- Name: learn_items learn_items_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_items
    ADD CONSTRAINT learn_items_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: learn_items learn_items_source_list_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_items
    ADD CONSTRAINT learn_items_source_list_pcid_fkey FOREIGN KEY (source_list_pcid) REFERENCES public.lists(pcid) ON DELETE SET NULL;


--
-- Name: learn_items learn_items_statement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_items
    ADD CONSTRAINT learn_items_statement_id_fkey FOREIGN KEY (statement_id) REFERENCES public.clinical_statements(statement_id) ON DELETE SET NULL;


--
-- Name: learn_review_events learn_review_events_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_review_events
    ADD CONSTRAINT learn_review_events_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.learn_collections(id) ON DELETE SET NULL;


--
-- Name: learn_review_events learn_review_events_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_review_events
    ADD CONSTRAINT learn_review_events_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.learn_items(id) ON DELETE CASCADE;


--
-- Name: learn_review_events learn_review_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_review_events
    ADD CONSTRAINT learn_review_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: learn_user_item_state learn_user_item_state_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_user_item_state
    ADD CONSTRAINT learn_user_item_state_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.learn_items(id) ON DELETE CASCADE;


--
-- Name: learn_user_item_state learn_user_item_state_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_user_item_state
    ADD CONSTRAINT learn_user_item_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: learn_user_settings learn_user_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learn_user_settings
    ADD CONSTRAINT learn_user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: list_items list_items_component_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.list_items
    ADD CONSTRAINT list_items_component_pcid_fkey FOREIGN KEY (component_pcid) REFERENCES public.entities(pcid);


--
-- Name: list_items list_items_list_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.list_items
    ADD CONSTRAINT list_items_list_pcid_fkey FOREIGN KEY (list_pcid) REFERENCES public.lists(pcid) ON DELETE CASCADE;


--
-- Name: list_items list_items_member_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.list_items
    ADD CONSTRAINT list_items_member_pcid_fkey FOREIGN KEY (member_pcid) REFERENCES public.entities(pcid);


--
-- Name: list_items list_items_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.list_items
    ADD CONSTRAINT list_items_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.dictionary_terms(id);


--
-- Name: lists lists_parent_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lists
    ADD CONSTRAINT lists_parent_pcid_fkey FOREIGN KEY (parent_pcid) REFERENCES public.lists(pcid);


--
-- Name: lists lists_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lists
    ADD CONSTRAINT lists_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid);


--
-- Name: measurements measurements_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.measurements
    ADD CONSTRAINT measurements_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;


--
-- Name: moieties moieties_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.moieties
    ADD CONSTRAINT moieties_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;


--
-- Name: moieties moieties_synonym_of_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.moieties
    ADD CONSTRAINT moieties_synonym_of_pcid_fkey FOREIGN KEY (synonym_of_pcid) REFERENCES public.entities(pcid);


--
-- Name: page_citations page_citations_ref_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.page_citations
    ADD CONSTRAINT page_citations_ref_key_fkey FOREIGN KEY (ref_key) REFERENCES public.citation_sources(key);


--
-- Name: page_citations page_citations_revision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.page_citations
    ADD CONSTRAINT page_citations_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES public.page_revisions(id) ON DELETE CASCADE;


--
-- Name: page_content page_content_current_revision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.page_content
    ADD CONSTRAINT page_content_current_revision_id_fkey FOREIGN KEY (current_revision_id) REFERENCES public.page_revisions(id);


--
-- Name: page_content page_content_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.page_content
    ADD CONSTRAINT page_content_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid);


--
-- Name: page_links page_links_source_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.page_links
    ADD CONSTRAINT page_links_source_pcid_fkey FOREIGN KEY (source_pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;


--
-- Name: page_links page_links_target_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.page_links
    ADD CONSTRAINT page_links_target_pcid_fkey FOREIGN KEY (target_pcid) REFERENCES public.entities(pcid);


--
-- Name: page_property_refs page_property_refs_source_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.page_property_refs
    ADD CONSTRAINT page_property_refs_source_pcid_fkey FOREIGN KEY (source_pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;


--
-- Name: page_property_refs page_property_refs_target_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.page_property_refs
    ADD CONSTRAINT page_property_refs_target_pcid_fkey FOREIGN KEY (target_pcid) REFERENCES public.entities(pcid);


--
-- Name: page_revisions page_revisions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.page_revisions
    ADD CONSTRAINT page_revisions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: page_revisions page_revisions_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.page_revisions
    ADD CONSTRAINT page_revisions_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.page_revisions(id);


--
-- Name: page_revisions page_revisions_patrolled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.page_revisions
    ADD CONSTRAINT page_revisions_patrolled_by_fkey FOREIGN KEY (patrolled_by) REFERENCES auth.users(id);


--
-- Name: page_revisions page_revisions_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.page_revisions
    ADD CONSTRAINT page_revisions_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid);


--
-- Name: pcid_retired pcid_retired_replaced_by_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pcid_retired
    ADD CONSTRAINT pcid_retired_replaced_by_pcid_fkey FOREIGN KEY (replaced_by_pcid) REFERENCES public.entities(pcid);


--
-- Name: physiochemical physiochemical_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.physiochemical
    ADD CONSTRAINT physiochemical_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;


--
-- Name: precise_forms precise_forms_class_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.precise_forms
    ADD CONSTRAINT precise_forms_class_pcid_fkey FOREIGN KEY (class_pcid) REFERENCES public.entities(pcid);


--
-- Name: precise_forms precise_forms_parent_moiety_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.precise_forms
    ADD CONSTRAINT precise_forms_parent_moiety_pcid_fkey FOREIGN KEY (parent_moiety_pcid) REFERENCES public.moieties(pcid);


--
-- Name: precise_forms precise_forms_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.precise_forms
    ADD CONSTRAINT precise_forms_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;


--
-- Name: precise_forms precise_forms_synonym_of_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.precise_forms
    ADD CONSTRAINT precise_forms_synonym_of_pcid_fkey FOREIGN KEY (synonym_of_pcid) REFERENCES public.entities(pcid);


--
-- Name: product_packaging product_packaging_entity_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_packaging
    ADD CONSTRAINT product_packaging_entity_pcid_fkey FOREIGN KEY (entity_pcid) REFERENCES public.entities(pcid);


--
-- Name: provider_verifications provider_verifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.provider_verifications
    ADD CONSTRAINT provider_verifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: references_resources references_resources_guideline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.references_resources
    ADD CONSTRAINT references_resources_guideline_id_fkey FOREIGN KEY (guideline_id) REFERENCES public.guidelines(guideline_id);


--
-- Name: rems_products rems_products_rems_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rems_products
    ADD CONSTRAINT rems_products_rems_id_fkey FOREIGN KEY (rems_id) REFERENCES public.rems_programs(rems_id);


--
-- Name: revisions revisions_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.revisions
    ADD CONSTRAINT revisions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);


--
-- Name: revisions revisions_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.revisions
    ADD CONSTRAINT revisions_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id);


--
-- Name: revisions revisions_target_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.revisions
    ADD CONSTRAINT revisions_target_pcid_fkey FOREIGN KEY (target_pcid) REFERENCES public.entities(pcid);


--
-- Name: rxclass_drug rxclass_drug_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rxclass_drug
    ADD CONSTRAINT rxclass_drug_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;


--
-- Name: rxclass_lookup rxclass_lookup_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rxclass_lookup
    ADD CONSTRAINT rxclass_lookup_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;


--
-- Name: rxnorm_brands rxnorm_brands_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rxnorm_brands
    ADD CONSTRAINT rxnorm_brands_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;


--
-- Name: rxnorm_lookup rxnorm_lookup_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rxnorm_lookup
    ADD CONSTRAINT rxnorm_lookup_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;


--
-- Name: saved_entities saved_entities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.saved_entities
    ADD CONSTRAINT saved_entities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: structure_name_candidates structure_name_candidates_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.structure_name_candidates
    ADD CONSTRAINT structure_name_candidates_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;


--
-- Name: term_definitions term_definitions_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.term_definitions
    ADD CONSTRAINT term_definitions_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;


--
-- Name: term_definitions term_definitions_source_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.term_definitions
    ADD CONSTRAINT term_definitions_source_key_fkey FOREIGN KEY (source_key) REFERENCES public.data_sources(source_key);


--
-- Name: threshold_rules threshold_rules_block_name_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.threshold_rules
    ADD CONSTRAINT threshold_rules_block_name_fkey FOREIGN KEY (block_name) REFERENCES public.block_schemas(name);


--
-- Name: threshold_rules threshold_rules_pcid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.threshold_rules
    ADD CONSTRAINT threshold_rules_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid);


--
-- Name: threshold_rules threshold_rules_revision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.threshold_rules
    ADD CONSTRAINT threshold_rules_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES public.page_revisions(id);


--
-- Name: user_roles user_roles_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id);


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: class_agent_skip; Type: ROW SECURITY; Schema: archive; Owner: postgres
--

ALTER TABLE archive.class_agent_skip ENABLE ROW LEVEL SECURITY;

--
-- Name: class_review_queue; Type: ROW SECURITY; Schema: archive; Owner: postgres
--

ALTER TABLE archive.class_review_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: stg_dictionary_combo; Type: ROW SECURITY; Schema: archive; Owner: postgres
--

ALTER TABLE archive.stg_dictionary_combo ENABLE ROW LEVEL SECURITY;

--
-- Name: stg_dictionary_combo2; Type: ROW SECURITY; Schema: archive; Owner: postgres
--

ALTER TABLE archive.stg_dictionary_combo2 ENABLE ROW LEVEL SECURITY;

--
-- Name: stg_dictionary_frag; Type: ROW SECURITY; Schema: archive; Owner: postgres
--

ALTER TABLE archive.stg_dictionary_frag ENABLE ROW LEVEL SECURITY;

--
-- Name: stg_dictionary_fraglink; Type: ROW SECURITY; Schema: archive; Owner: postgres
--

ALTER TABLE archive.stg_dictionary_fraglink ENABLE ROW LEVEL SECURITY;

--
-- Name: stg_dictionary_gen; Type: ROW SECURITY; Schema: archive; Owner: postgres
--

ALTER TABLE archive.stg_dictionary_gen ENABLE ROW LEVEL SECURITY;

--
-- Name: stg_dictionary_idx; Type: ROW SECURITY; Schema: archive; Owner: postgres
--

ALTER TABLE archive.stg_dictionary_idx ENABLE ROW LEVEL SECURITY;

--
-- Name: stg_dictionary_m2; Type: ROW SECURITY; Schema: archive; Owner: postgres
--

ALTER TABLE archive.stg_dictionary_m2 ENABLE ROW LEVEL SECURITY;

--
-- Name: stg_dictionary_match; Type: ROW SECURITY; Schema: archive; Owner: postgres
--

ALTER TABLE archive.stg_dictionary_match ENABLE ROW LEVEL SECURITY;

--
-- Name: stg_dictionary_mint; Type: ROW SECURITY; Schema: archive; Owner: postgres
--

ALTER TABLE archive.stg_dictionary_mint ENABLE ROW LEVEL SECURITY;

--
-- Name: stg_dictionary_raw; Type: ROW SECURITY; Schema: archive; Owner: postgres
--

ALTER TABLE archive.stg_dictionary_raw ENABLE ROW LEVEL SECURITY;

--
-- Name: stg_name_index; Type: ROW SECURITY; Schema: archive; Owner: postgres
--

ALTER TABLE archive.stg_name_index ENABLE ROW LEVEL SECURITY;

--
-- Name: stg_topdrugs_lists; Type: ROW SECURITY; Schema: archive; Owner: postgres
--

ALTER TABLE archive.stg_topdrugs_lists ENABLE ROW LEVEL SECURITY;

--
-- Name: stg_topdrugs_match; Type: ROW SECURITY; Schema: archive; Owner: postgres
--

ALTER TABLE archive.stg_topdrugs_match ENABLE ROW LEVEL SECURITY;

--
-- Name: stg_topdrugs_rows; Type: ROW SECURITY; Schema: archive; Owner: postgres
--

ALTER TABLE archive.stg_topdrugs_rows ENABLE ROW LEVEL SECURITY;

--
-- Name: account_profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.account_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: account_profiles account_profiles_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY account_profiles_select_own ON public.account_profiles FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: api_meta; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.api_meta ENABLE ROW LEVEL SECURITY;

--
-- Name: biological_targets; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.biological_targets ENABLE ROW LEVEL SECURITY;

--
-- Name: block_schemas; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.block_schemas ENABLE ROW LEVEL SECURITY;

--
-- Name: block_schemas block_schemas_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY block_schemas_read ON public.block_schemas FOR SELECT TO authenticated, anon USING (true);


--
-- Name: blog_comments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.blog_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: brand_edits; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.brand_edits ENABLE ROW LEVEL SECURITY;

--
-- Name: chemont_links; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.chemont_links ENABLE ROW LEVEL SECURITY;

--
-- Name: chemont_terms; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.chemont_terms ENABLE ROW LEVEL SECURITY;

--
-- Name: citation_sources; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.citation_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: class_agent_review; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.class_agent_review ENABLE ROW LEVEL SECURITY;

--
-- Name: class_members; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.class_members ENABLE ROW LEVEL SECURITY;

--
-- Name: class_rules; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.class_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: class_search_aliases; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.class_search_aliases ENABLE ROW LEVEL SECURITY;

--
-- Name: classyfire_lookup; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.classyfire_lookup ENABLE ROW LEVEL SECURITY;

--
-- Name: clinical_concepts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.clinical_concepts ENABLE ROW LEVEL SECURITY;

--
-- Name: clinical_statements; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.clinical_statements ENABLE ROW LEVEL SECURITY;

--
-- Name: combinations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.combinations ENABLE ROW LEVEL SECURITY;

--
-- Name: community_pages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.community_pages ENABLE ROW LEVEL SECURITY;

--
-- Name: community_statements; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.community_statements ENABLE ROW LEVEL SECURITY;

--
-- Name: contributor_blocks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.contributor_blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: contributor_profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.contributor_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: data_sources; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: saved_entities delete_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY delete_own ON public.saved_entities FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: dictionary_terms; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.dictionary_terms ENABLE ROW LEVEL SECURITY;

--
-- Name: dictionary_terms dictionary_terms_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY dictionary_terms_public_read ON public.dictionary_terms FOR SELECT TO authenticated, anon USING (true);


--
-- Name: drug_classes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.drug_classes ENABLE ROW LEVEL SECURITY;

--
-- Name: entities; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_changes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.entity_changes ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_guidelines; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.entity_guidelines ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_versions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.entity_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: fda_applications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.fda_applications ENABLE ROW LEVEL SECURITY;

--
-- Name: fda_product_ingredients; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.fda_product_ingredients ENABLE ROW LEVEL SECURITY;

--
-- Name: fda_products; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.fda_products ENABLE ROW LEVEL SECURITY;

--
-- Name: federal_controlled_substances; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.federal_controlled_substances ENABLE ROW LEVEL SECURITY;

--
-- Name: formulations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.formulations ENABLE ROW LEVEL SECURITY;

--
-- Name: functional_groups; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.functional_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: guidelines; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.guidelines ENABLE ROW LEVEL SECURITY;

--
-- Name: infobox_edits; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.infobox_edits ENABLE ROW LEVEL SECURITY;

--
-- Name: infobox_properties; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.infobox_properties ENABLE ROW LEVEL SECURITY;

--
-- Name: ingest_tokens; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.ingest_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: saved_entities insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY insert_own ON public.saved_entities FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: label_document_formulations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.label_document_formulations ENABLE ROW LEVEL SECURITY;

--
-- Name: label_documents; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.label_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: label_fetch_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.label_fetch_log ENABLE ROW LEVEL SECURITY;

--
-- Name: label_section_text; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.label_section_text ENABLE ROW LEVEL SECURITY;

--
-- Name: label_sections; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.label_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: lasa_names; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.lasa_names ENABLE ROW LEVEL SECURITY;

--
-- Name: learn_brand_list; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.learn_brand_list ENABLE ROW LEVEL SECURITY;

--
-- Name: learn_brand_list learn_brand_list_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY learn_brand_list_read ON public.learn_brand_list FOR SELECT TO authenticated, anon USING (true);


--
-- Name: learn_collection_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.learn_collection_items ENABLE ROW LEVEL SECURITY;

--
-- Name: learn_collection_items learn_collection_items_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY learn_collection_items_delete ON public.learn_collection_items FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.learn_collections c
  WHERE ((c.id = learn_collection_items.collection_id) AND (NOT c.is_official) AND (c.owner_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: learn_collection_items learn_collection_items_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY learn_collection_items_insert ON public.learn_collection_items FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.learn_collections c
  WHERE ((c.id = learn_collection_items.collection_id) AND (NOT c.is_official) AND (c.owner_id = ( SELECT auth.uid() AS uid))))) AND (EXISTS ( SELECT 1
   FROM public.learn_items i
  WHERE ((i.id = learn_collection_items.item_id) AND ((i.is_official AND (i.status = 'published'::text)) OR (i.owner_id = ( SELECT auth.uid() AS uid))))))));


--
-- Name: learn_collection_items learn_collection_items_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY learn_collection_items_read ON public.learn_collection_items FOR SELECT TO authenticated, anon USING ((EXISTS ( SELECT 1
   FROM public.learn_collections c
  WHERE ((c.id = learn_collection_items.collection_id) AND ((c.is_official AND (c.status = 'published'::text)) OR (c.owner_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: learn_collection_items learn_collection_items_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY learn_collection_items_update ON public.learn_collection_items FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.learn_collections c
  WHERE ((c.id = learn_collection_items.collection_id) AND (NOT c.is_official) AND (c.owner_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.learn_collections c
  WHERE ((c.id = learn_collection_items.collection_id) AND (NOT c.is_official) AND (c.owner_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: learn_collections; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.learn_collections ENABLE ROW LEVEL SECURITY;

--
-- Name: learn_collections learn_collections_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY learn_collections_delete ON public.learn_collections FOR DELETE TO authenticated USING (((NOT is_official) AND (owner_id = ( SELECT auth.uid() AS uid))));


--
-- Name: learn_collections learn_collections_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY learn_collections_insert ON public.learn_collections FOR INSERT TO authenticated WITH CHECK (((NOT is_official) AND (owner_id = ( SELECT auth.uid() AS uid))));


--
-- Name: learn_collections learn_collections_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY learn_collections_read ON public.learn_collections FOR SELECT TO authenticated, anon USING (((is_official AND (status = 'published'::text)) OR (owner_id = ( SELECT auth.uid() AS uid))));


--
-- Name: learn_collections learn_collections_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY learn_collections_update ON public.learn_collections FOR UPDATE TO authenticated USING (((NOT is_official) AND (owner_id = ( SELECT auth.uid() AS uid)))) WITH CHECK (((NOT is_official) AND (owner_id = ( SELECT auth.uid() AS uid))));


--
-- Name: learn_review_events learn_events_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY learn_events_insert ON public.learn_review_events FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: learn_review_events learn_events_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY learn_events_read ON public.learn_review_events FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: learn_item_entities; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.learn_item_entities ENABLE ROW LEVEL SECURITY;

--
-- Name: learn_item_entities learn_item_entities_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY learn_item_entities_read ON public.learn_item_entities FOR SELECT TO authenticated, anon USING ((EXISTS ( SELECT 1
   FROM public.learn_items i
  WHERE ((i.id = learn_item_entities.item_id) AND ((i.is_official AND (i.status = 'published'::text)) OR (i.owner_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: learn_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.learn_items ENABLE ROW LEVEL SECURITY;

--
-- Name: learn_items learn_items_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY learn_items_delete ON public.learn_items FOR DELETE TO authenticated USING (((NOT is_official) AND (owner_id = ( SELECT auth.uid() AS uid))));


--
-- Name: learn_items learn_items_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY learn_items_insert ON public.learn_items FOR INSERT TO authenticated WITH CHECK (((NOT is_official) AND (owner_id = ( SELECT auth.uid() AS uid)) AND (generation_method = 'user'::text)));


--
-- Name: learn_items learn_items_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY learn_items_read ON public.learn_items FOR SELECT TO authenticated, anon USING (((is_official AND (status = 'published'::text)) OR (owner_id = ( SELECT auth.uid() AS uid))));


--
-- Name: learn_items learn_items_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY learn_items_update ON public.learn_items FOR UPDATE TO authenticated USING (((NOT is_official) AND (owner_id = ( SELECT auth.uid() AS uid)))) WITH CHECK (((NOT is_official) AND (owner_id = ( SELECT auth.uid() AS uid)) AND (generation_method = 'user'::text)));


--
-- Name: learn_review_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.learn_review_events ENABLE ROW LEVEL SECURITY;

--
-- Name: learn_user_settings learn_settings_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY learn_settings_own ON public.learn_user_settings TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: learn_user_item_state learn_state_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY learn_state_own ON public.learn_user_item_state TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: learn_user_item_state; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.learn_user_item_state ENABLE ROW LEVEL SECURITY;

--
-- Name: learn_user_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.learn_user_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: list_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.list_items ENABLE ROW LEVEL SECURITY;

--
-- Name: lists; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;

--
-- Name: measurements; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.measurements ENABLE ROW LEVEL SECURITY;

--
-- Name: moieties; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.moieties ENABLE ROW LEVEL SECURITY;

--
-- Name: page_citations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.page_citations ENABLE ROW LEVEL SECURITY;

--
-- Name: page_content; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.page_content ENABLE ROW LEVEL SECURITY;

--
-- Name: page_links; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.page_links ENABLE ROW LEVEL SECURITY;

--
-- Name: page_property_refs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.page_property_refs ENABLE ROW LEVEL SECURITY;

--
-- Name: page_revisions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.page_revisions ENABLE ROW LEVEL SECURITY;

--
-- Name: page_templates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.page_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: page_templates page_templates_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY page_templates_read ON public.page_templates FOR SELECT TO authenticated, anon USING (true);


--
-- Name: pcid_blocks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.pcid_blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: pcid_retired; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.pcid_retired ENABLE ROW LEVEL SECURITY;

--
-- Name: physiochemical; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.physiochemical ENABLE ROW LEVEL SECURITY;

--
-- Name: precise_forms; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.precise_forms ENABLE ROW LEVEL SECURITY;

--
-- Name: predicates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.predicates ENABLE ROW LEVEL SECURITY;

--
-- Name: product_packaging; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.product_packaging ENABLE ROW LEVEL SECURITY;

--
-- Name: product_packaging product_packaging_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY product_packaging_public_read ON public.product_packaging FOR SELECT TO authenticated, anon USING (true);


--
-- Name: provider_verifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.provider_verifications ENABLE ROW LEVEL SECURITY;

--
-- Name: federal_controlled_substances public read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "public read" ON public.federal_controlled_substances FOR SELECT USING (true);


--
-- Name: entity_guidelines public read entity_guidelines; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "public read entity_guidelines" ON public.entity_guidelines FOR SELECT TO authenticated, anon USING (true);


--
-- Name: guidelines public read guidelines; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "public read guidelines" ON public.guidelines FOR SELECT TO authenticated, anon USING (true);


--
-- Name: label_fetch_log public read label_fetch_log; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "public read label_fetch_log" ON public.label_fetch_log FOR SELECT TO authenticated, anon USING (true);


--
-- Name: label_section_text public read label_section_text; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "public read label_section_text" ON public.label_section_text FOR SELECT TO authenticated, anon USING (true);


--
-- Name: references_resources public read references_resources; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "public read references_resources" ON public.references_resources FOR SELECT TO authenticated, anon USING (true);


--
-- Name: rxnorm_brands public read rxnorm_brands; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "public read rxnorm_brands" ON public.rxnorm_brands FOR SELECT TO authenticated, anon USING (true);


--
-- Name: api_meta public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.api_meta FOR SELECT USING (true);


--
-- Name: biological_targets public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.biological_targets FOR SELECT USING (true);


--
-- Name: brand_edits public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.brand_edits FOR SELECT USING (true);


--
-- Name: chemont_links public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.chemont_links FOR SELECT USING (true);


--
-- Name: chemont_terms public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.chemont_terms FOR SELECT USING (true);


--
-- Name: citation_sources public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.citation_sources FOR SELECT USING (true);


--
-- Name: class_members public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.class_members FOR SELECT USING (true);


--
-- Name: class_rules public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.class_rules FOR SELECT USING (true);


--
-- Name: class_search_aliases public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.class_search_aliases FOR SELECT USING (true);


--
-- Name: clinical_concepts public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.clinical_concepts FOR SELECT USING (true);


--
-- Name: clinical_statements public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.clinical_statements FOR SELECT USING (true);


--
-- Name: combinations public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.combinations FOR SELECT USING (true);


--
-- Name: community_pages public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.community_pages FOR SELECT USING (true);


--
-- Name: community_statements public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.community_statements FOR SELECT USING (true);


--
-- Name: data_sources public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.data_sources FOR SELECT USING (true);


--
-- Name: drug_classes public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.drug_classes FOR SELECT USING (true);


--
-- Name: entities public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.entities FOR SELECT USING (true);


--
-- Name: entity_versions public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.entity_versions FOR SELECT USING (true);


--
-- Name: fda_applications public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.fda_applications FOR SELECT USING (true);


--
-- Name: fda_product_ingredients public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.fda_product_ingredients FOR SELECT USING (true);


--
-- Name: fda_products public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.fda_products FOR SELECT USING (true);


--
-- Name: formulations public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.formulations FOR SELECT USING (true);


--
-- Name: functional_groups public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.functional_groups FOR SELECT USING (true);


--
-- Name: infobox_edits public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.infobox_edits FOR SELECT USING (true);


--
-- Name: infobox_properties public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.infobox_properties FOR SELECT USING (true);


--
-- Name: label_document_formulations public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.label_document_formulations FOR SELECT USING (true);


--
-- Name: label_documents public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.label_documents FOR SELECT USING (true);


--
-- Name: label_sections public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.label_sections FOR SELECT USING (true);


--
-- Name: lasa_names public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.lasa_names FOR SELECT USING (true);


--
-- Name: list_items public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.list_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.lists l
  WHERE ((l.pcid = list_items.list_pcid) AND l.published))));


--
-- Name: lists public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.lists FOR SELECT USING (published);


--
-- Name: measurements public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.measurements FOR SELECT USING (true);


--
-- Name: moieties public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.moieties FOR SELECT USING (true);


--
-- Name: page_citations public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.page_citations FOR SELECT USING (true);


--
-- Name: page_content public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.page_content FOR SELECT USING (true);


--
-- Name: page_links public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.page_links FOR SELECT USING (true);


--
-- Name: page_property_refs public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.page_property_refs FOR SELECT USING (true);


--
-- Name: page_revisions public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.page_revisions FOR SELECT USING (true);


--
-- Name: pcid_blocks public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.pcid_blocks FOR SELECT USING (true);


--
-- Name: pcid_retired public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.pcid_retired FOR SELECT USING (true);


--
-- Name: physiochemical public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.physiochemical FOR SELECT USING (true);


--
-- Name: precise_forms public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.precise_forms FOR SELECT USING (true);


--
-- Name: predicates public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.predicates FOR SELECT USING (true);


--
-- Name: rems_products public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.rems_products FOR SELECT USING (true);


--
-- Name: rems_programs public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.rems_programs FOR SELECT USING (true);


--
-- Name: term_definitions public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.term_definitions FOR SELECT USING (true);


--
-- Name: threshold_rules public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.threshold_rules FOR SELECT USING (true);


--
-- Name: contributor_blocks read_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY read_own ON public.contributor_blocks FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: contributor_profiles read_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY read_own ON public.contributor_profiles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: provider_verifications read_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY read_own ON public.provider_verifications FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: revisions read_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY read_own ON public.revisions FOR SELECT USING (((auth.uid() = submitted_by) OR (auth.uid() = reviewed_by)));


--
-- Name: saved_entities read_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY read_own ON public.saved_entities FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_roles read_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY read_own ON public.user_roles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: references_resources; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.references_resources ENABLE ROW LEVEL SECURITY;

--
-- Name: rems_products; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.rems_products ENABLE ROW LEVEL SECURITY;

--
-- Name: rems_programs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.rems_programs ENABLE ROW LEVEL SECURITY;

--
-- Name: revisions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.revisions ENABLE ROW LEVEL SECURITY;

--
-- Name: rxclass_classes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.rxclass_classes ENABLE ROW LEVEL SECURITY;

--
-- Name: rxclass_drug; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.rxclass_drug ENABLE ROW LEVEL SECURITY;

--
-- Name: rxclass_lookup; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.rxclass_lookup ENABLE ROW LEVEL SECURITY;

--
-- Name: rxclass_va_products; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.rxclass_va_products ENABLE ROW LEVEL SECURITY;

--
-- Name: rxnorm_brands; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.rxnorm_brands ENABLE ROW LEVEL SECURITY;

--
-- Name: rxnorm_lookup; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.rxnorm_lookup ENABLE ROW LEVEL SECURITY;

--
-- Name: saved_entities; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.saved_entities ENABLE ROW LEVEL SECURITY;

--
-- Name: section_embeds; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.section_embeds ENABLE ROW LEVEL SECURITY;

--
-- Name: section_embeds section_embeds_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY section_embeds_read ON public.section_embeds FOR SELECT TO authenticated, anon USING (true);


--
-- Name: structure_name_candidates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.structure_name_candidates ENABLE ROW LEVEL SECURITY;

--
-- Name: revisions submit_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY submit_own ON public.revisions FOR INSERT WITH CHECK (((auth.uid() = submitted_by) AND (EXISTS ( SELECT 1
   FROM public.provider_verifications pv
  WHERE ((pv.user_id = auth.uid()) AND (pv.status = 'active'::text))))));


--
-- Name: term_definitions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.term_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: threshold_rules; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.threshold_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION accept_rebased_revision(p_reviewer uuid, p_revision_id bigint, p_current_revision_id bigint, p_payload jsonb, p_note text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.accept_rebased_revision(p_reviewer uuid, p_revision_id bigint, p_current_revision_id bigint, p_payload jsonb, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.accept_rebased_revision(p_reviewer uuid, p_revision_id bigint, p_current_revision_id bigint, p_payload jsonb, p_note text) TO service_role;


--
-- Name: FUNCTION accept_revision(p_revision_id bigint, p_note text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.accept_revision(p_revision_id bigint, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.accept_revision(p_revision_id bigint, p_note text) TO authenticated;
GRANT ALL ON FUNCTION public.accept_revision(p_revision_id bigint, p_note text) TO service_role;


--
-- Name: FUNCTION admin_contributors(p_query text, p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.admin_contributors(p_query text, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_contributors(p_query text, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.admin_contributors(p_query text, p_limit integer) TO service_role;


--
-- Name: FUNCTION api_class_members(p_ref text, p_limit integer, p_offset integer, p_direct_only boolean); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.api_class_members(p_ref text, p_limit integer, p_offset integer, p_direct_only boolean) TO anon;
GRANT ALL ON FUNCTION public.api_class_members(p_ref text, p_limit integer, p_offset integer, p_direct_only boolean) TO authenticated;
GRANT ALL ON FUNCTION public.api_class_members(p_ref text, p_limit integer, p_offset integer, p_direct_only boolean) TO service_role;


--
-- Name: FUNCTION api_entity_changes(p_ref text, p_limit integer, p_before bigint); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.api_entity_changes(p_ref text, p_limit integer, p_before bigint) TO anon;
GRANT ALL ON FUNCTION public.api_entity_changes(p_ref text, p_limit integer, p_before bigint) TO authenticated;
GRANT ALL ON FUNCTION public.api_entity_changes(p_ref text, p_limit integer, p_before bigint) TO service_role;


--
-- Name: FUNCTION api_entity_content(p_pcid bigint); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.api_entity_content(p_pcid bigint) TO anon;
GRANT ALL ON FUNCTION public.api_entity_content(p_pcid bigint) TO authenticated;
GRANT ALL ON FUNCTION public.api_entity_content(p_pcid bigint) TO service_role;


--
-- Name: FUNCTION api_entity_document(p_ref text, p_version integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.api_entity_document(p_ref text, p_version integer) TO anon;
GRANT ALL ON FUNCTION public.api_entity_document(p_ref text, p_version integer) TO authenticated;
GRANT ALL ON FUNCTION public.api_entity_document(p_ref text, p_version integer) TO service_role;


--
-- Name: FUNCTION api_entity_versions(p_ref text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.api_entity_versions(p_ref text) TO anon;
GRANT ALL ON FUNCTION public.api_entity_versions(p_ref text) TO authenticated;
GRANT ALL ON FUNCTION public.api_entity_versions(p_ref text) TO service_role;


--
-- Name: FUNCTION api_index(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.api_index() TO anon;
GRANT ALL ON FUNCTION public.api_index() TO authenticated;
GRANT ALL ON FUNCTION public.api_index() TO service_role;


--
-- Name: FUNCTION api_meta_value(p_key text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.api_meta_value(p_key text) TO anon;
GRANT ALL ON FUNCTION public.api_meta_value(p_key text) TO authenticated;
GRANT ALL ON FUNCTION public.api_meta_value(p_key text) TO service_role;


--
-- Name: FUNCTION api_not_found(p_ref text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.api_not_found(p_ref text) TO anon;
GRANT ALL ON FUNCTION public.api_not_found(p_ref text) TO authenticated;
GRANT ALL ON FUNCTION public.api_not_found(p_ref text) TO service_role;


--
-- Name: FUNCTION api_ref(p_pcid bigint); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.api_ref(p_pcid bigint) TO anon;
GRANT ALL ON FUNCTION public.api_ref(p_pcid bigint) TO authenticated;
GRANT ALL ON FUNCTION public.api_ref(p_pcid bigint) TO service_role;


--
-- Name: FUNCTION api_resolve(p_ref text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.api_resolve(p_ref text) TO anon;
GRANT ALL ON FUNCTION public.api_resolve(p_ref text) TO authenticated;
GRANT ALL ON FUNCTION public.api_resolve(p_ref text) TO service_role;


--
-- Name: FUNCTION api_search(p_q text, p_limit integer, p_types text[]); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.api_search(p_q text, p_limit integer, p_types text[]) TO anon;
GRANT ALL ON FUNCTION public.api_search(p_q text, p_limit integer, p_types text[]) TO authenticated;
GRANT ALL ON FUNCTION public.api_search(p_q text, p_limit integer, p_types text[]) TO service_role;


--
-- Name: TABLE entity_versions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.entity_versions TO anon;
GRANT ALL ON TABLE public.entity_versions TO authenticated;
GRANT ALL ON TABLE public.entity_versions TO service_role;


--
-- Name: FUNCTION api_snapshot(p_pcid bigint); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.api_snapshot(p_pcid bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.api_snapshot(p_pcid bigint) TO service_role;


--
-- Name: FUNCTION api_snapshot_all(p_entity_type text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.api_snapshot_all(p_entity_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.api_snapshot_all(p_entity_type text) TO service_role;


--
-- Name: FUNCTION api_snapshot_sweep(p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.api_snapshot_sweep(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.api_snapshot_sweep(p_limit integer) TO service_role;


--
-- Name: FUNCTION api_split_codes(p text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.api_split_codes(p text) TO anon;
GRANT ALL ON FUNCTION public.api_split_codes(p text) TO authenticated;
GRANT ALL ON FUNCTION public.api_split_codes(p text) TO service_role;


--
-- Name: FUNCTION apply_page_revision(p_rev bigint, p_actor uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.apply_page_revision(p_rev bigint, p_actor uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_page_revision(p_rev bigint, p_actor uuid) TO service_role;


--
-- Name: FUNCTION approve_revision(p_revision_id bigint, p_reviewer uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.approve_revision(p_revision_id bigint, p_reviewer uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.approve_revision(p_revision_id bigint, p_reviewer uuid) TO service_role;


--
-- Name: FUNCTION block_contributor(p_user_id uuid, p_reason text, p_expires_at timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.block_contributor(p_user_id uuid, p_reason text, p_expires_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.block_contributor(p_user_id uuid, p_reason text, p_expires_at timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.block_contributor(p_user_id uuid, p_reason text, p_expires_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION blog_comment_queue(p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.blog_comment_queue(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.blog_comment_queue(p_limit integer) TO service_role;
GRANT ALL ON FUNCTION public.blog_comment_queue(p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.blog_comment_queue(p_limit integer) TO authenticated;


--
-- Name: FUNCTION blog_comments(p_slug text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.blog_comments(p_slug text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.blog_comments(p_slug text) TO service_role;
GRANT ALL ON FUNCTION public.blog_comments(p_slug text) TO anon;
GRANT ALL ON FUNCTION public.blog_comments(p_slug text) TO authenticated;


--
-- Name: FUNCTION brand_history(p_pcid bigint, p_queue_only boolean, p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.brand_history(p_pcid bigint, p_queue_only boolean, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.brand_history(p_pcid bigint, p_queue_only boolean, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.brand_history(p_pcid bigint, p_queue_only boolean, p_limit integer) TO service_role;


--
-- Name: FUNCTION class_display_name(p text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.class_display_name(p text) TO anon;
GRANT ALL ON FUNCTION public.class_display_name(p text) TO authenticated;
GRANT ALL ON FUNCTION public.class_display_name(p text) TO service_role;


--
-- Name: FUNCTION class_type_label(t text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.class_type_label(t text) TO anon;
GRANT ALL ON FUNCTION public.class_type_label(t text) TO authenticated;
GRANT ALL ON FUNCTION public.class_type_label(t text) TO service_role;


--
-- Name: FUNCTION classyfire_todo(p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.classyfire_todo(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.classyfire_todo(p_limit integer) TO service_role;


--
-- Name: FUNCTION create_account_profile(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.create_account_profile() FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_account_profile() TO service_role;


--
-- Name: FUNCTION create_page(p_entity_kind text, p_name text, p_summary text, p_description text, p_body_md text, p_subtype text, p_identifiers jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.create_page(p_entity_kind text, p_name text, p_summary text, p_description text, p_body_md text, p_subtype text, p_identifiers jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_page(p_entity_kind text, p_name text, p_summary text, p_description text, p_body_md text, p_subtype text, p_identifiers jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_page(p_entity_kind text, p_name text, p_summary text, p_description text, p_body_md text, p_subtype text, p_identifiers jsonb) TO service_role;


--
-- Name: FUNCTION delete_blog_comment(p_id bigint); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.delete_blog_comment(p_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_blog_comment(p_id bigint) TO service_role;
GRANT ALL ON FUNCTION public.delete_blog_comment(p_id bigint) TO authenticated;


--
-- Name: FUNCTION dictionary_buckets(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.dictionary_buckets() TO anon;
GRANT ALL ON FUNCTION public.dictionary_buckets() TO authenticated;
GRANT ALL ON FUNCTION public.dictionary_buckets() TO service_role;


--
-- Name: FUNCTION dictionary_dic(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.dictionary_dic() TO anon;
GRANT ALL ON FUNCTION public.dictionary_dic() TO authenticated;
GRANT ALL ON FUNCTION public.dictionary_dic() TO service_role;


--
-- Name: FUNCTION dictionary_words(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.dictionary_words() TO anon;
GRANT ALL ON FUNCTION public.dictionary_words() TO authenticated;
GRANT ALL ON FUNCTION public.dictionary_words() TO service_role;


--
-- Name: FUNCTION edit_blog_comment(p_id bigint, p_body text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.edit_blog_comment(p_id bigint, p_body text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.edit_blog_comment(p_id bigint, p_body text) TO service_role;
GRANT ALL ON FUNCTION public.edit_blog_comment(p_id bigint, p_body text) TO authenticated;


--
-- Name: FUNCTION edit_brand(p_pcid bigint, p_brand text, p_action text, p_citation text, p_summary text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.edit_brand(p_pcid bigint, p_brand text, p_action text, p_citation text, p_summary text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.edit_brand(p_pcid bigint, p_brand text, p_action text, p_citation text, p_summary text) TO authenticated;
GRANT ALL ON FUNCTION public.edit_brand(p_pcid bigint, p_brand text, p_action text, p_citation text, p_summary text) TO service_role;


--
-- Name: FUNCTION edit_infobox(p_pcid bigint, p_key text, p_value text, p_citation text, p_summary text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.edit_infobox(p_pcid bigint, p_key text, p_value text, p_citation text, p_summary text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.edit_infobox(p_pcid bigint, p_key text, p_value text, p_citation text, p_summary text) TO authenticated;
GRANT ALL ON FUNCTION public.edit_infobox(p_pcid bigint, p_key text, p_value text, p_citation text, p_summary text) TO service_role;


--
-- Name: FUNCTION enforce_pcid_in_block(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.enforce_pcid_in_block() TO anon;
GRANT ALL ON FUNCTION public.enforce_pcid_in_block() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_pcid_in_block() TO service_role;


--
-- Name: FUNCTION enforce_signup_requirements(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.enforce_signup_requirements() FROM PUBLIC;
GRANT ALL ON FUNCTION public.enforce_signup_requirements() TO service_role;


--
-- Name: FUNCTION get_class(p_slug text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_class(p_slug text) TO anon;
GRANT ALL ON FUNCTION public.get_class(p_slug text) TO authenticated;
GRANT ALL ON FUNCTION public.get_class(p_slug text) TO service_role;


--
-- Name: FUNCTION get_entity_classes(p_pcid bigint, p_include_inherited boolean); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_entity_classes(p_pcid bigint, p_include_inherited boolean) TO anon;
GRANT ALL ON FUNCTION public.get_entity_classes(p_pcid bigint, p_include_inherited boolean) TO authenticated;
GRANT ALL ON FUNCTION public.get_entity_classes(p_pcid bigint, p_include_inherited boolean) TO service_role;


--
-- Name: FUNCTION get_entity_lists(p_pcid bigint); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_entity_lists(p_pcid bigint) TO anon;
GRANT ALL ON FUNCTION public.get_entity_lists(p_pcid bigint) TO authenticated;
GRANT ALL ON FUNCTION public.get_entity_lists(p_pcid bigint) TO service_role;


--
-- Name: FUNCTION get_lasa(p_pcid bigint); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_lasa(p_pcid bigint) TO anon;
GRANT ALL ON FUNCTION public.get_lasa(p_pcid bigint) TO authenticated;
GRANT ALL ON FUNCTION public.get_lasa(p_pcid bigint) TO service_role;


--
-- Name: FUNCTION get_list(p_slug text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_list(p_slug text) TO anon;
GRANT ALL ON FUNCTION public.get_list(p_slug text) TO authenticated;
GRANT ALL ON FUNCTION public.get_list(p_slug text) TO service_role;


--
-- Name: FUNCTION get_rems(p_pcid bigint); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_rems(p_pcid bigint) TO anon;
GRANT ALL ON FUNCTION public.get_rems(p_pcid bigint) TO authenticated;
GRANT ALL ON FUNCTION public.get_rems(p_pcid bigint) TO service_role;


--
-- Name: FUNCTION get_structures(p_pcid bigint); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_structures(p_pcid bigint) TO anon;
GRANT ALL ON FUNCTION public.get_structures(p_pcid bigint) TO authenticated;
GRANT ALL ON FUNCTION public.get_structures(p_pcid bigint) TO service_role;


--
-- Name: FUNCTION grant_role(p_user_id uuid, p_role text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.grant_role(p_user_id uuid, p_role text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.grant_role(p_user_id uuid, p_role text) TO authenticated;
GRANT ALL ON FUNCTION public.grant_role(p_user_id uuid, p_role text) TO service_role;


--
-- Name: FUNCTION has_role(p_role text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.has_role(p_role text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_role(p_role text) TO authenticated;
GRANT ALL ON FUNCTION public.has_role(p_role text) TO service_role;


--
-- Name: FUNCTION infobox_history(p_pcid bigint, p_key text, p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.infobox_history(p_pcid bigint, p_key text, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.infobox_history(p_pcid bigint, p_key text, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.infobox_history(p_pcid bigint, p_key text, p_limit integer) TO service_role;


--
-- Name: FUNCTION is_verified_contributor(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.is_verified_contributor() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_verified_contributor() TO authenticated;
GRANT ALL ON FUNCTION public.is_verified_contributor() TO service_role;


--
-- Name: FUNCTION lasa_moiety_of(p_pcid bigint, p_name text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.lasa_moiety_of(p_pcid bigint, p_name text) TO anon;
GRANT ALL ON FUNCTION public.lasa_moiety_of(p_pcid bigint, p_name text) TO authenticated;
GRANT ALL ON FUNCTION public.lasa_moiety_of(p_pcid bigint, p_name text) TO service_role;


--
-- Name: FUNCTION learn_attach(p_collection_slug text, p_template_key text, p_section text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learn_attach(p_collection_slug text, p_template_key text, p_section text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.learn_attach(p_collection_slug text, p_template_key text, p_section text) TO service_role;


--
-- Name: FUNCTION learn_collections_for_list(p_slug text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learn_collections_for_list(p_slug text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.learn_collections_for_list(p_slug text) TO anon;
GRANT ALL ON FUNCTION public.learn_collections_for_list(p_slug text) TO authenticated;
GRANT ALL ON FUNCTION public.learn_collections_for_list(p_slug text) TO service_role;


--
-- Name: FUNCTION learn_collections_for_pcid(p_pcid bigint); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learn_collections_for_pcid(p_pcid bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.learn_collections_for_pcid(p_pcid bigint) TO anon;
GRANT ALL ON FUNCTION public.learn_collections_for_pcid(p_pcid bigint) TO authenticated;
GRANT ALL ON FUNCTION public.learn_collections_for_pcid(p_pcid bigint) TO service_role;


--
-- Name: FUNCTION learn_ensure_collection(p_slug text, p_title text, p_description text, p_list_slug text, p_templates text[], p_subject text, p_sort integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learn_ensure_collection(p_slug text, p_title text, p_description text, p_list_slug text, p_templates text[], p_subject text, p_sort integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.learn_ensure_collection(p_slug text, p_title text, p_description text, p_list_slug text, p_templates text[], p_subject text, p_sort integer) TO service_role;


--
-- Name: FUNCTION learn_gen_acb_highest(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learn_gen_acb_highest() FROM PUBLIC;
GRANT ALL ON FUNCTION public.learn_gen_acb_highest() TO service_role;


--
-- Name: FUNCTION learn_gen_attribute_mcq(p_list_slug text, p_template_key text, p_stem_fmt text, p_options jsonb, p_ok_fmt text, p_wrong text, p_caveat text, p_agency text, p_subject text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learn_gen_attribute_mcq(p_list_slug text, p_template_key text, p_stem_fmt text, p_options jsonb, p_ok_fmt text, p_wrong text, p_caveat text, p_agency text, p_subject text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.learn_gen_attribute_mcq(p_list_slug text, p_template_key text, p_stem_fmt text, p_options jsonb, p_ok_fmt text, p_wrong text, p_caveat text, p_agency text, p_subject text) TO service_role;


--
-- Name: FUNCTION learn_gen_brand_generic(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learn_gen_brand_generic() FROM PUBLIC;
GRANT ALL ON FUNCTION public.learn_gen_brand_generic() TO service_role;


--
-- Name: FUNCTION learn_gen_brand_list(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learn_gen_brand_list() FROM PUBLIC;
GRANT ALL ON FUNCTION public.learn_gen_brand_list() TO service_role;


--
-- Name: FUNCTION learn_gen_class_of(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learn_gen_class_of() FROM PUBLIC;
GRANT ALL ON FUNCTION public.learn_gen_class_of() TO service_role;


--
-- Name: FUNCTION learn_gen_dnc_reason(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learn_gen_dnc_reason() FROM PUBLIC;
GRANT ALL ON FUNCTION public.learn_gen_dnc_reason() TO service_role;


--
-- Name: FUNCTION learn_gen_jc_dnu(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learn_gen_jc_dnu() FROM PUBLIC;
GRANT ALL ON FUNCTION public.learn_gen_jc_dnu() TO service_role;


--
-- Name: FUNCTION learn_gen_member_mcq(p_list_slug text, p_template_key text, p_stem text, p_ok_fmt text, p_wrong text, p_caveat text, p_agency text, p_subject text, p_release_filter boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learn_gen_member_mcq(p_list_slug text, p_template_key text, p_stem text, p_ok_fmt text, p_wrong text, p_caveat text, p_agency text, p_subject text, p_release_filter boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.learn_gen_member_mcq(p_list_slug text, p_template_key text, p_stem text, p_ok_fmt text, p_wrong text, p_caveat text, p_agency text, p_subject text, p_release_filter boolean) TO service_role;


--
-- Name: FUNCTION learn_link_entities(p_template_key text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learn_link_entities(p_template_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.learn_link_entities(p_template_key text) TO service_role;


--
-- Name: FUNCTION learn_list_pool(p_slug text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learn_list_pool(p_slug text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.learn_list_pool(p_slug text) TO service_role;


--
-- Name: FUNCTION learn_personal_collection_guard(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learn_personal_collection_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.learn_personal_collection_guard() TO service_role;


--
-- Name: FUNCTION learn_personal_guard(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learn_personal_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.learn_personal_guard() TO service_role;


--
-- Name: FUNCTION learn_record_review(p_item uuid, p_collection uuid, p_mode text, p_rating smallint, p_is_correct boolean, p_selected_option text, p_was_unsure boolean, p_duration_ms integer, p_client_event_id uuid, p_reviewed_at timestamp with time zone, p_scheduler_version text, p_state_before jsonb, p_state_after jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learn_record_review(p_item uuid, p_collection uuid, p_mode text, p_rating smallint, p_is_correct boolean, p_selected_option text, p_was_unsure boolean, p_duration_ms integer, p_client_event_id uuid, p_reviewed_at timestamp with time zone, p_scheduler_version text, p_state_before jsonb, p_state_after jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.learn_record_review(p_item uuid, p_collection uuid, p_mode text, p_rating smallint, p_is_correct boolean, p_selected_option text, p_was_unsure boolean, p_duration_ms integer, p_client_event_id uuid, p_reviewed_at timestamp with time zone, p_scheduler_version text, p_state_before jsonb, p_state_after jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.learn_record_review(p_item uuid, p_collection uuid, p_mode text, p_rating smallint, p_is_correct boolean, p_selected_option text, p_was_unsure boolean, p_duration_ms integer, p_client_event_id uuid, p_reviewed_at timestamp with time zone, p_scheduler_version text, p_state_before jsonb, p_state_after jsonb) TO service_role;


--
-- Name: FUNCTION learn_review_items(p_template text, p_status text, p_limit integer, p_offset integer, p_seed text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learn_review_items(p_template text, p_status text, p_limit integer, p_offset integer, p_seed text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.learn_review_items(p_template text, p_status text, p_limit integer, p_offset integer, p_seed text) TO authenticated;
GRANT ALL ON FUNCTION public.learn_review_items(p_template text, p_status text, p_limit integer, p_offset integer, p_seed text) TO service_role;


--
-- Name: FUNCTION learn_review_summary(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learn_review_summary() FROM PUBLIC;
GRANT ALL ON FUNCTION public.learn_review_summary() TO authenticated;
GRANT ALL ON FUNCTION public.learn_review_summary() TO service_role;


--
-- Name: FUNCTION learn_set_collection_status(p_collection uuid, p_status text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learn_set_collection_status(p_collection uuid, p_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.learn_set_collection_status(p_collection uuid, p_status text) TO authenticated;
GRANT ALL ON FUNCTION public.learn_set_collection_status(p_collection uuid, p_status text) TO service_role;


--
-- Name: FUNCTION learn_set_status(p_ids uuid[], p_status text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learn_set_status(p_ids uuid[], p_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.learn_set_status(p_ids uuid[], p_status text) TO authenticated;
GRANT ALL ON FUNCTION public.learn_set_status(p_ids uuid[], p_status text) TO service_role;


--
-- Name: FUNCTION learn_touch(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learn_touch() FROM PUBLIC;
GRANT ALL ON FUNCTION public.learn_touch() TO service_role;


--
-- Name: FUNCTION legal_status_line(p_pcid bigint); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.legal_status_line(p_pcid bigint) TO anon;
GRANT ALL ON FUNCTION public.legal_status_line(p_pcid bigint) TO authenticated;
GRANT ALL ON FUNCTION public.legal_status_line(p_pcid bigint) TO service_role;


--
-- Name: FUNCTION list_classes(p_type text, p_search text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.list_classes(p_type text, p_search text) TO anon;
GRANT ALL ON FUNCTION public.list_classes(p_type text, p_search text) TO authenticated;
GRANT ALL ON FUNCTION public.list_classes(p_type text, p_search text) TO service_role;


--
-- Name: FUNCTION list_lists(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.list_lists() TO anon;
GRANT ALL ON FUNCTION public.list_lists() TO authenticated;
GRANT ALL ON FUNCTION public.list_lists() TO service_role;


--
-- Name: FUNCTION list_term_counts(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.list_term_counts() TO anon;
GRANT ALL ON FUNCTION public.list_term_counts() TO authenticated;
GRANT ALL ON FUNCTION public.list_term_counts() TO service_role;


--
-- Name: FUNCTION load_approved_name_structures(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.load_approved_name_structures() FROM PUBLIC;
GRANT ALL ON FUNCTION public.load_approved_name_structures() TO service_role;


--
-- Name: FUNCTION log_entity_change(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.log_entity_change() FROM PUBLIC;
GRANT ALL ON FUNCTION public.log_entity_change() TO service_role;


--
-- Name: FUNCTION mint_class(p_name text, p_type text, p_system text, p_code text, p_level smallint); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.mint_class(p_name text, p_type text, p_system text, p_code text, p_level smallint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mint_class(p_name text, p_type text, p_system text, p_code text, p_level smallint) TO service_role;


--
-- Name: FUNCTION moderate_blog_comment(p_id bigint, p_action text, p_note text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.moderate_blog_comment(p_id bigint, p_action text, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.moderate_blog_comment(p_id bigint, p_action text, p_note text) TO service_role;
GRANT ALL ON FUNCTION public.moderate_blog_comment(p_id bigint, p_action text, p_note text) TO authenticated;


--
-- Name: FUNCTION my_contributions(p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.my_contributions(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_contributions(p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.my_contributions(p_limit integer) TO service_role;


--
-- Name: FUNCTION my_public_handle(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.my_public_handle() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_public_handle() TO service_role;
GRANT ALL ON FUNCTION public.my_public_handle() TO authenticated;


--
-- Name: FUNCTION network_compare(p_pcids bigint[], p_include_community boolean, p_members bigint[], p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.network_compare(p_pcids bigint[], p_include_community boolean, p_members bigint[], p_limit integer, p_offset integer) TO anon;
GRANT ALL ON FUNCTION public.network_compare(p_pcids bigint[], p_include_community boolean, p_members bigint[], p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.network_compare(p_pcids bigint[], p_include_community boolean, p_members bigint[], p_limit integer, p_offset integer) TO service_role;


--
-- Name: FUNCTION network_edge_evidence(p_edge_id text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.network_edge_evidence(p_edge_id text) TO anon;
GRANT ALL ON FUNCTION public.network_edge_evidence(p_edge_id text) TO authenticated;
GRANT ALL ON FUNCTION public.network_edge_evidence(p_edge_id text) TO service_role;


--
-- Name: FUNCTION network_edges(p_pcid bigint, p_include_community boolean); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.network_edges(p_pcid bigint, p_include_community boolean) TO anon;
GRANT ALL ON FUNCTION public.network_edges(p_pcid bigint, p_include_community boolean) TO authenticated;
GRANT ALL ON FUNCTION public.network_edges(p_pcid bigint, p_include_community boolean) TO service_role;


--
-- Name: FUNCTION network_hierarchy(p_pcids bigint[]); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.network_hierarchy(p_pcids bigint[]) TO anon;
GRANT ALL ON FUNCTION public.network_hierarchy(p_pcids bigint[]) TO authenticated;
GRANT ALL ON FUNCTION public.network_hierarchy(p_pcids bigint[]) TO service_role;


--
-- Name: FUNCTION network_neighborhood(p_pcid bigint, p_groups text[], p_include_community boolean, p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.network_neighborhood(p_pcid bigint, p_groups text[], p_include_community boolean, p_limit integer, p_offset integer) TO anon;
GRANT ALL ON FUNCTION public.network_neighborhood(p_pcid bigint, p_groups text[], p_include_community boolean, p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.network_neighborhood(p_pcid bigint, p_groups text[], p_include_community boolean, p_limit integer, p_offset integer) TO service_role;


--
-- Name: FUNCTION network_predicate_group(p text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.network_predicate_group(p text) TO anon;
GRANT ALL ON FUNCTION public.network_predicate_group(p text) TO authenticated;
GRANT ALL ON FUNCTION public.network_predicate_group(p text) TO service_role;


--
-- Name: FUNCTION network_relations(p_pcid bigint, p_groups text[], p_include_community boolean, p_query text, p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.network_relations(p_pcid bigint, p_groups text[], p_include_community boolean, p_query text, p_limit integer, p_offset integer) TO anon;
GRANT ALL ON FUNCTION public.network_relations(p_pcid bigint, p_groups text[], p_include_community boolean, p_query text, p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.network_relations(p_pcid bigint, p_groups text[], p_include_community boolean, p_query text, p_limit integer, p_offset integer) TO service_role;


--
-- Name: FUNCTION new_pages_queue(p_limit integer, p_unpatrolled_only boolean); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.new_pages_queue(p_limit integer, p_unpatrolled_only boolean) TO anon;
GRANT ALL ON FUNCTION public.new_pages_queue(p_limit integer, p_unpatrolled_only boolean) TO authenticated;
GRANT ALL ON FUNCTION public.new_pages_queue(p_limit integer, p_unpatrolled_only boolean) TO service_role;


--
-- Name: FUNCTION norm_ingredient(raw text, strip_all boolean); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.norm_ingredient(raw text, strip_all boolean) TO anon;
GRANT ALL ON FUNCTION public.norm_ingredient(raw text, strip_all boolean) TO authenticated;
GRANT ALL ON FUNCTION public.norm_ingredient(raw text, strip_all boolean) TO service_role;


--
-- Name: FUNCTION osa_distance(a text, b text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.osa_distance(a text, b text) TO anon;
GRANT ALL ON FUNCTION public.osa_distance(a text, b text) TO authenticated;
GRANT ALL ON FUNCTION public.osa_distance(a text, b text) TO service_role;


--
-- Name: FUNCTION page_abbreviations(p_name text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.page_abbreviations(p_name text) TO anon;
GRANT ALL ON FUNCTION public.page_abbreviations(p_name text) TO authenticated;
GRANT ALL ON FUNCTION public.page_abbreviations(p_name text) TO service_role;


--
-- Name: FUNCTION page_history(p_pcid bigint, p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.page_history(p_pcid bigint, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.page_history(p_pcid bigint, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.page_history(p_pcid bigint, p_limit integer) TO service_role;


--
-- Name: FUNCTION page_source_registry(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.page_source_registry() TO anon;
GRANT ALL ON FUNCTION public.page_source_registry() TO authenticated;
GRANT ALL ON FUNCTION public.page_source_registry() TO service_role;


--
-- Name: FUNCTION patrol_brand_edit(p_edit_id bigint); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.patrol_brand_edit(p_edit_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.patrol_brand_edit(p_edit_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.patrol_brand_edit(p_edit_id bigint) TO service_role;


--
-- Name: FUNCTION patrol_infobox_edit(p_edit_id bigint); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.patrol_infobox_edit(p_edit_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.patrol_infobox_edit(p_edit_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.patrol_infobox_edit(p_edit_id bigint) TO service_role;


--
-- Name: FUNCTION patrol_new_page(p_pcid bigint); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.patrol_new_page(p_pcid bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.patrol_new_page(p_pcid bigint) TO authenticated;
GRANT ALL ON FUNCTION public.patrol_new_page(p_pcid bigint) TO service_role;


--
-- Name: FUNCTION patrol_revision(p_revision_id bigint); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.patrol_revision(p_revision_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.patrol_revision(p_revision_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.patrol_revision(p_revision_id bigint) TO service_role;


--
-- Name: FUNCTION pc_brand_key(p text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.pc_brand_key(p text) TO anon;
GRANT ALL ON FUNCTION public.pc_brand_key(p text) TO authenticated;
GRANT ALL ON FUNCTION public.pc_brand_key(p text) TO service_role;


--
-- Name: FUNCTION pc_cite_text(p_citations jsonb); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.pc_cite_text(p_citations jsonb) TO anon;
GRANT ALL ON FUNCTION public.pc_cite_text(p_citations jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.pc_cite_text(p_citations jsonb) TO service_role;


--
-- Name: FUNCTION pc_credential_badge(p_credential text, p_taxonomy text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.pc_credential_badge(p_credential text, p_taxonomy text) TO anon;
GRANT ALL ON FUNCTION public.pc_credential_badge(p_credential text, p_taxonomy text) TO authenticated;
GRANT ALL ON FUNCTION public.pc_credential_badge(p_credential text, p_taxonomy text) TO service_role;


--
-- Name: FUNCTION pc_has_role(p_user uuid, p_role text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.pc_has_role(p_user uuid, p_role text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pc_has_role(p_user uuid, p_role text) TO service_role;


--
-- Name: FUNCTION pc_is_blocked(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.pc_is_blocked() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pc_is_blocked() TO service_role;


--
-- Name: FUNCTION pc_is_verified(p_user uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.pc_is_verified(p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pc_is_verified(p_user uuid) TO service_role;


--
-- Name: FUNCTION pc_slugify(p text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.pc_slugify(p text) TO anon;
GRANT ALL ON FUNCTION public.pc_slugify(p text) TO authenticated;
GRANT ALL ON FUNCTION public.pc_slugify(p text) TO service_role;


--
-- Name: FUNCTION post_blog_comment(p_slug text, p_body text, p_parent_id bigint); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.post_blog_comment(p_slug text, p_body text, p_parent_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.post_blog_comment(p_slug text, p_body text, p_parent_id bigint) TO service_role;
GRANT ALL ON FUNCTION public.post_blog_comment(p_slug text, p_body text, p_parent_id bigint) TO authenticated;


--
-- Name: FUNCTION publish_page(p_user uuid, p_pcid bigint, p_current_revision_id bigint, p_parent_revision_id bigint, p_payload jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.publish_page(p_user uuid, p_pcid bigint, p_current_revision_id bigint, p_parent_revision_id bigint, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.publish_page(p_user uuid, p_pcid bigint, p_current_revision_id bigint, p_parent_revision_id bigint, p_payload jsonb) TO service_role;


--
-- Name: FUNCTION rebuild_classes(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.rebuild_classes() FROM PUBLIC;
GRANT ALL ON FUNCTION public.rebuild_classes() TO service_role;


--
-- Name: FUNCTION refresh_lasa_lists(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.refresh_lasa_lists() FROM PUBLIC;
GRANT ALL ON FUNCTION public.refresh_lasa_lists() TO service_role;


--
-- Name: FUNCTION refresh_page_links(p_pcid bigint); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.refresh_page_links(p_pcid bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.refresh_page_links(p_pcid bigint) TO service_role;


--
-- Name: FUNCTION refresh_rems_lists(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.refresh_rems_lists() FROM PUBLIC;
GRANT ALL ON FUNCTION public.refresh_rems_lists() TO service_role;


--
-- Name: FUNCTION reject_revision(p_revision_id bigint, p_note text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.reject_revision(p_revision_id bigint, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reject_revision(p_revision_id bigint, p_note text) TO authenticated;
GRANT ALL ON FUNCTION public.reject_revision(p_revision_id bigint, p_note text) TO service_role;


--
-- Name: FUNCTION rems_program_label(p_name text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.rems_program_label(p_name text) TO anon;
GRANT ALL ON FUNCTION public.rems_program_label(p_name text) TO authenticated;
GRANT ALL ON FUNCTION public.rems_program_label(p_name text) TO service_role;


--
-- Name: FUNCTION resolve_page_target(p_text text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.resolve_page_target(p_text text) TO anon;
GRANT ALL ON FUNCTION public.resolve_page_target(p_text text) TO authenticated;
GRANT ALL ON FUNCTION public.resolve_page_target(p_text text) TO service_role;


--
-- Name: FUNCTION resolve_property(p_key text, p_pcid bigint); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.resolve_property(p_key text, p_pcid bigint) TO anon;
GRANT ALL ON FUNCTION public.resolve_property(p_key text, p_pcid bigint) TO authenticated;
GRANT ALL ON FUNCTION public.resolve_property(p_key text, p_pcid bigint) TO service_role;


--
-- Name: FUNCTION revert_page(p_pcid bigint, p_to_revision_id bigint, p_summary text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.revert_page(p_pcid bigint, p_to_revision_id bigint, p_summary text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.revert_page(p_pcid bigint, p_to_revision_id bigint, p_summary text) TO authenticated;
GRANT ALL ON FUNCTION public.revert_page(p_pcid bigint, p_to_revision_id bigint, p_summary text) TO service_role;


--
-- Name: FUNCTION review_brand_edit(p_edit_id bigint, p_accept boolean, p_note text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.review_brand_edit(p_edit_id bigint, p_accept boolean, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.review_brand_edit(p_edit_id bigint, p_accept boolean, p_note text) TO authenticated;
GRANT ALL ON FUNCTION public.review_brand_edit(p_edit_id bigint, p_accept boolean, p_note text) TO service_role;


--
-- Name: FUNCTION review_infobox_edit(p_edit_id bigint, p_accept boolean, p_note text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.review_infobox_edit(p_edit_id bigint, p_accept boolean, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.review_infobox_edit(p_edit_id bigint, p_accept boolean, p_note text) TO authenticated;
GRANT ALL ON FUNCTION public.review_infobox_edit(p_edit_id bigint, p_accept boolean, p_note text) TO service_role;


--
-- Name: FUNCTION revoke_role(p_user_id uuid, p_role text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.revoke_role(p_user_id uuid, p_role text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.revoke_role(p_user_id uuid, p_role text) TO authenticated;
GRANT ALL ON FUNCTION public.revoke_role(p_user_id uuid, p_role text) TO service_role;


--
-- Name: FUNCTION rls_auto_enable(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;


--
-- Name: FUNCTION rxclass_todo(p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.rxclass_todo(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rxclass_todo(p_limit integer) TO service_role;


--
-- Name: FUNCTION rxnorm_todo(p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.rxnorm_todo(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rxnorm_todo(p_limit integer) TO service_role;


--
-- Name: FUNCTION save_page(p_pcid bigint, p_base_revision_id bigint, p_description text, p_body_md text, p_summary text, p_kind text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.save_page(p_pcid bigint, p_base_revision_id bigint, p_description text, p_body_md text, p_summary text, p_kind text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_page(p_pcid bigint, p_base_revision_id bigint, p_description text, p_body_md text, p_summary text, p_kind text) TO authenticated;
GRANT ALL ON FUNCTION public.save_page(p_pcid bigint, p_base_revision_id bigint, p_description text, p_body_md text, p_summary text, p_kind text) TO service_role;


--
-- Name: FUNCTION search_all(p_q text, p_limit integer, p_types text[]); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.search_all(p_q text, p_limit integer, p_types text[]) TO anon;
GRANT ALL ON FUNCTION public.search_all(p_q text, p_limit integer, p_types text[]) TO authenticated;
GRANT ALL ON FUNCTION public.search_all(p_q text, p_limit integer, p_types text[]) TO service_role;


--
-- Name: FUNCTION search_classes(p_q text, p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.search_classes(p_q text, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.search_classes(p_q text, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.search_classes(p_q text, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.search_classes(p_q text, p_limit integer) TO service_role;


--
-- Name: FUNCTION search_norm(t text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.search_norm(t text) TO anon;
GRANT ALL ON FUNCTION public.search_norm(t text) TO authenticated;
GRANT ALL ON FUNCTION public.search_norm(t text) TO service_role;


--
-- Name: FUNCTION set_contributor_handle(p_handle text, p_display_credential boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.set_contributor_handle(p_handle text, p_display_credential boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_contributor_handle(p_handle text, p_display_credential boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_contributor_handle(p_handle text, p_display_credential boolean) TO service_role;


--
-- Name: FUNCTION set_page_protection(p_pcid bigint, p_protection text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.set_page_protection(p_pcid bigint, p_protection text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_page_protection(p_pcid bigint, p_protection text) TO authenticated;
GRANT ALL ON FUNCTION public.set_page_protection(p_pcid bigint, p_protection text) TO service_role;


--
-- Name: FUNCTION set_public_handle(p_handle text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.set_public_handle(p_handle text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_public_handle(p_handle text) TO service_role;
GRANT ALL ON FUNCTION public.set_public_handle(p_handle text) TO authenticated;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: FUNCTION signup_dob(meta jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.signup_dob(meta jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.signup_dob(meta jsonb) TO service_role;


--
-- Name: FUNCTION stg_norm_name(t text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.stg_norm_name(t text) TO anon;
GRANT ALL ON FUNCTION public.stg_norm_name(t text) TO authenticated;
GRANT ALL ON FUNCTION public.stg_norm_name(t text) TO service_role;


--
-- Name: FUNCTION stg_strip_qual(t text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.stg_strip_qual(t text) TO anon;
GRANT ALL ON FUNCTION public.stg_strip_qual(t text) TO authenticated;
GRANT ALL ON FUNCTION public.stg_strip_qual(t text) TO service_role;


--
-- Name: FUNCTION stg_strip_salt(t text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.stg_strip_salt(t text) TO anon;
GRANT ALL ON FUNCTION public.stg_strip_salt(t text) TO authenticated;
GRANT ALL ON FUNCTION public.stg_strip_salt(t text) TO service_role;


--
-- Name: FUNCTION structure_todo(p_limit integer, p_pcids bigint[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.structure_todo(p_limit integer, p_pcids bigint[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.structure_todo(p_limit integer, p_pcids bigint[]) TO service_role;


--
-- Name: FUNCTION structure_todo_drugbank(p_limit integer, p_pcids bigint[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.structure_todo_drugbank(p_limit integer, p_pcids bigint[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.structure_todo_drugbank(p_limit integer, p_pcids bigint[]) TO service_role;


--
-- Name: FUNCTION structure_todo_name(p_limit integer, p_pcids bigint[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.structure_todo_name(p_limit integer, p_pcids bigint[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.structure_todo_name(p_limit integer, p_pcids bigint[]) TO service_role;


--
-- Name: FUNCTION structure_todo_unii(p_limit integer, p_pcids bigint[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.structure_todo_unii(p_limit integer, p_pcids bigint[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.structure_todo_unii(p_limit integer, p_pcids bigint[]) TO service_role;


--
-- Name: FUNCTION unblock_contributor(p_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.unblock_contributor(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.unblock_contributor(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.unblock_contributor(p_user_id uuid) TO service_role;


--
-- Name: TABLE class_agent_skip; Type: ACL; Schema: archive; Owner: postgres
--

GRANT ALL ON TABLE archive.class_agent_skip TO service_role;


--
-- Name: TABLE class_review_queue; Type: ACL; Schema: archive; Owner: postgres
--

GRANT ALL ON TABLE archive.class_review_queue TO service_role;


--
-- Name: TABLE stg_dictionary_combo; Type: ACL; Schema: archive; Owner: postgres
--

GRANT ALL ON TABLE archive.stg_dictionary_combo TO service_role;


--
-- Name: TABLE stg_dictionary_combo2; Type: ACL; Schema: archive; Owner: postgres
--

GRANT ALL ON TABLE archive.stg_dictionary_combo2 TO service_role;


--
-- Name: TABLE stg_dictionary_frag; Type: ACL; Schema: archive; Owner: postgres
--

GRANT ALL ON TABLE archive.stg_dictionary_frag TO service_role;


--
-- Name: TABLE stg_dictionary_fraglink; Type: ACL; Schema: archive; Owner: postgres
--

GRANT ALL ON TABLE archive.stg_dictionary_fraglink TO service_role;


--
-- Name: TABLE stg_dictionary_gen; Type: ACL; Schema: archive; Owner: postgres
--

GRANT ALL ON TABLE archive.stg_dictionary_gen TO service_role;


--
-- Name: TABLE stg_dictionary_idx; Type: ACL; Schema: archive; Owner: postgres
--

GRANT ALL ON TABLE archive.stg_dictionary_idx TO service_role;


--
-- Name: TABLE stg_dictionary_m2; Type: ACL; Schema: archive; Owner: postgres
--

GRANT ALL ON TABLE archive.stg_dictionary_m2 TO service_role;


--
-- Name: TABLE stg_dictionary_match; Type: ACL; Schema: archive; Owner: postgres
--

GRANT ALL ON TABLE archive.stg_dictionary_match TO service_role;


--
-- Name: TABLE stg_dictionary_mint; Type: ACL; Schema: archive; Owner: postgres
--

GRANT ALL ON TABLE archive.stg_dictionary_mint TO service_role;


--
-- Name: TABLE stg_dictionary_raw; Type: ACL; Schema: archive; Owner: postgres
--

GRANT ALL ON TABLE archive.stg_dictionary_raw TO service_role;


--
-- Name: TABLE stg_name_index; Type: ACL; Schema: archive; Owner: postgres
--

GRANT ALL ON TABLE archive.stg_name_index TO service_role;


--
-- Name: TABLE stg_topdrugs_lists; Type: ACL; Schema: archive; Owner: postgres
--

GRANT ALL ON TABLE archive.stg_topdrugs_lists TO service_role;


--
-- Name: TABLE stg_topdrugs_match; Type: ACL; Schema: archive; Owner: postgres
--

GRANT ALL ON TABLE archive.stg_topdrugs_match TO service_role;


--
-- Name: TABLE stg_topdrugs_rows; Type: ACL; Schema: archive; Owner: postgres
--

GRANT ALL ON TABLE archive.stg_topdrugs_rows TO service_role;


--
-- Name: TABLE account_profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.account_profiles TO service_role;
GRANT SELECT ON TABLE public.account_profiles TO authenticated;


--
-- Name: TABLE api_meta; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.api_meta TO anon;
GRANT ALL ON TABLE public.api_meta TO authenticated;
GRANT ALL ON TABLE public.api_meta TO service_role;


--
-- Name: TABLE biological_targets; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.biological_targets TO anon;
GRANT ALL ON TABLE public.biological_targets TO authenticated;
GRANT ALL ON TABLE public.biological_targets TO service_role;


--
-- Name: TABLE block_schemas; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.block_schemas TO anon;
GRANT ALL ON TABLE public.block_schemas TO authenticated;
GRANT ALL ON TABLE public.block_schemas TO service_role;


--
-- Name: TABLE blog_comments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.blog_comments TO service_role;


--
-- Name: SEQUENCE blog_comments_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.blog_comments_id_seq TO anon;
GRANT ALL ON SEQUENCE public.blog_comments_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.blog_comments_id_seq TO service_role;


--
-- Name: TABLE brand_edits; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.brand_edits TO service_role;


--
-- Name: COLUMN brand_edits.id; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(id) ON TABLE public.brand_edits TO anon;
GRANT SELECT(id) ON TABLE public.brand_edits TO authenticated;


--
-- Name: COLUMN brand_edits.pcid; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(pcid) ON TABLE public.brand_edits TO anon;
GRANT SELECT(pcid) ON TABLE public.brand_edits TO authenticated;


--
-- Name: COLUMN brand_edits.brand_key; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(brand_key) ON TABLE public.brand_edits TO anon;
GRANT SELECT(brand_key) ON TABLE public.brand_edits TO authenticated;


--
-- Name: COLUMN brand_edits.brand_display; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(brand_display) ON TABLE public.brand_edits TO anon;
GRANT SELECT(brand_display) ON TABLE public.brand_edits TO authenticated;


--
-- Name: COLUMN brand_edits.action; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(action) ON TABLE public.brand_edits TO anon;
GRANT SELECT(action) ON TABLE public.brand_edits TO authenticated;


--
-- Name: COLUMN brand_edits.citation; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(citation) ON TABLE public.brand_edits TO anon;
GRANT SELECT(citation) ON TABLE public.brand_edits TO authenticated;


--
-- Name: COLUMN brand_edits.summary; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(summary) ON TABLE public.brand_edits TO anon;
GRANT SELECT(summary) ON TABLE public.brand_edits TO authenticated;


--
-- Name: COLUMN brand_edits.is_current; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(is_current) ON TABLE public.brand_edits TO anon;
GRANT SELECT(is_current) ON TABLE public.brand_edits TO authenticated;


--
-- Name: COLUMN brand_edits.created_at; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(created_at) ON TABLE public.brand_edits TO anon;
GRANT SELECT(created_at) ON TABLE public.brand_edits TO authenticated;


--
-- Name: COLUMN brand_edits.patrol_status; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(patrol_status) ON TABLE public.brand_edits TO anon;
GRANT SELECT(patrol_status) ON TABLE public.brand_edits TO authenticated;


--
-- Name: COLUMN brand_edits.patrolled_at; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(patrolled_at) ON TABLE public.brand_edits TO anon;
GRANT SELECT(patrolled_at) ON TABLE public.brand_edits TO authenticated;


--
-- Name: COLUMN brand_edits.review_note; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(review_note) ON TABLE public.brand_edits TO anon;
GRANT SELECT(review_note) ON TABLE public.brand_edits TO authenticated;


--
-- Name: COLUMN brand_edits.revision_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(revision_id) ON TABLE public.brand_edits TO anon;
GRANT SELECT(revision_id) ON TABLE public.brand_edits TO authenticated;


--
-- Name: SEQUENCE brand_edits_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.brand_edits_id_seq TO anon;
GRANT ALL ON SEQUENCE public.brand_edits_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.brand_edits_id_seq TO service_role;


--
-- Name: TABLE clinical_statements; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.clinical_statements TO anon;
GRANT ALL ON TABLE public.clinical_statements TO authenticated;
GRANT ALL ON TABLE public.clinical_statements TO service_role;


--
-- Name: TABLE combinations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.combinations TO anon;
GRANT ALL ON TABLE public.combinations TO authenticated;
GRANT ALL ON TABLE public.combinations TO service_role;


--
-- Name: TABLE entities; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.entities TO anon;
GRANT ALL ON TABLE public.entities TO authenticated;
GRANT ALL ON TABLE public.entities TO service_role;


--
-- Name: TABLE fda_products; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.fda_products TO anon;
GRANT ALL ON TABLE public.fda_products TO authenticated;
GRANT ALL ON TABLE public.fda_products TO service_role;


--
-- Name: TABLE formulations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.formulations TO anon;
GRANT ALL ON TABLE public.formulations TO authenticated;
GRANT ALL ON TABLE public.formulations TO service_role;


--
-- Name: TABLE label_documents; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.label_documents TO anon;
GRANT ALL ON TABLE public.label_documents TO authenticated;
GRANT ALL ON TABLE public.label_documents TO service_role;


--
-- Name: TABLE moieties; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.moieties TO anon;
GRANT ALL ON TABLE public.moieties TO authenticated;
GRANT ALL ON TABLE public.moieties TO service_role;


--
-- Name: TABLE precise_forms; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.precise_forms TO anon;
GRANT ALL ON TABLE public.precise_forms TO authenticated;
GRANT ALL ON TABLE public.precise_forms TO service_role;


--
-- Name: TABLE moiety_hierarchy; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.moiety_hierarchy TO anon;
GRANT ALL ON TABLE public.moiety_hierarchy TO authenticated;
GRANT ALL ON TABLE public.moiety_hierarchy TO service_role;


--
-- Name: TABLE ingredient_moiety_map; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.ingredient_moiety_map TO anon;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.ingredient_moiety_map TO authenticated;
GRANT ALL ON TABLE public.ingredient_moiety_map TO service_role;


--
-- Name: TABLE rxnorm_brands; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.rxnorm_brands TO anon;
GRANT ALL ON TABLE public.rxnorm_brands TO authenticated;
GRANT ALL ON TABLE public.rxnorm_brands TO service_role;


--
-- Name: TABLE rxnorm_lookup; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.rxnorm_lookup TO anon;
GRANT ALL ON TABLE public.rxnorm_lookup TO authenticated;
GRANT ALL ON TABLE public.rxnorm_lookup TO service_role;


--
-- Name: TABLE entity_brand_names; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.entity_brand_names TO anon;
GRANT ALL ON TABLE public.entity_brand_names TO authenticated;
GRANT ALL ON TABLE public.entity_brand_names TO service_role;


--
-- Name: TABLE catalog_entries; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.catalog_entries TO anon;
GRANT ALL ON TABLE public.catalog_entries TO authenticated;
GRANT ALL ON TABLE public.catalog_entries TO service_role;


--
-- Name: TABLE chemont_links; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.chemont_links TO anon;
GRANT ALL ON TABLE public.chemont_links TO authenticated;
GRANT ALL ON TABLE public.chemont_links TO service_role;


--
-- Name: TABLE chemont_terms; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.chemont_terms TO anon;
GRANT ALL ON TABLE public.chemont_terms TO authenticated;
GRANT ALL ON TABLE public.chemont_terms TO service_role;


--
-- Name: TABLE citation_sources; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.citation_sources TO anon;
GRANT ALL ON TABLE public.citation_sources TO authenticated;
GRANT ALL ON TABLE public.citation_sources TO service_role;


--
-- Name: TABLE class_agent_review; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.class_agent_review TO anon;
GRANT ALL ON TABLE public.class_agent_review TO authenticated;
GRANT ALL ON TABLE public.class_agent_review TO service_role;


--
-- Name: TABLE class_members; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.class_members TO anon;
GRANT ALL ON TABLE public.class_members TO authenticated;
GRANT ALL ON TABLE public.class_members TO service_role;


--
-- Name: TABLE drug_classes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.drug_classes TO anon;
GRANT ALL ON TABLE public.drug_classes TO authenticated;
GRANT ALL ON TABLE public.drug_classes TO service_role;


--
-- Name: TABLE class_catalog; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.class_catalog TO service_role;


--
-- Name: TABLE class_rules; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.class_rules TO anon;
GRANT ALL ON TABLE public.class_rules TO authenticated;
GRANT ALL ON TABLE public.class_rules TO service_role;


--
-- Name: TABLE class_search_aliases; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.class_search_aliases TO anon;
GRANT ALL ON TABLE public.class_search_aliases TO authenticated;
GRANT ALL ON TABLE public.class_search_aliases TO service_role;


--
-- Name: TABLE classyfire_lookup; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.classyfire_lookup TO anon;
GRANT ALL ON TABLE public.classyfire_lookup TO authenticated;
GRANT ALL ON TABLE public.classyfire_lookup TO service_role;


--
-- Name: TABLE clinical_concepts; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.clinical_concepts TO anon;
GRANT ALL ON TABLE public.clinical_concepts TO authenticated;
GRANT ALL ON TABLE public.clinical_concepts TO service_role;


--
-- Name: SEQUENCE clinical_statements_statement_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.clinical_statements_statement_id_seq TO anon;
GRANT ALL ON SEQUENCE public.clinical_statements_statement_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.clinical_statements_statement_id_seq TO service_role;


--
-- Name: TABLE combination_brand_index; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.combination_brand_index TO anon;
GRANT ALL ON TABLE public.combination_brand_index TO authenticated;
GRANT ALL ON TABLE public.combination_brand_index TO service_role;


--
-- Name: TABLE community_pages; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.community_pages TO anon;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.community_pages TO authenticated;
GRANT ALL ON TABLE public.community_pages TO service_role;


--
-- Name: COLUMN community_pages.pcid; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(pcid) ON TABLE public.community_pages TO anon;
GRANT SELECT(pcid) ON TABLE public.community_pages TO authenticated;


--
-- Name: COLUMN community_pages.created_at; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(created_at) ON TABLE public.community_pages TO anon;
GRANT SELECT(created_at) ON TABLE public.community_pages TO authenticated;


--
-- Name: COLUMN community_pages.patrol_status; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(patrol_status) ON TABLE public.community_pages TO anon;
GRANT SELECT(patrol_status) ON TABLE public.community_pages TO authenticated;


--
-- Name: COLUMN community_pages.patrolled_at; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(patrolled_at) ON TABLE public.community_pages TO anon;
GRANT SELECT(patrolled_at) ON TABLE public.community_pages TO authenticated;


--
-- Name: TABLE community_statements; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.community_statements TO anon;
GRANT ALL ON TABLE public.community_statements TO authenticated;
GRANT ALL ON TABLE public.community_statements TO service_role;


--
-- Name: SEQUENCE community_statements_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.community_statements_id_seq TO anon;
GRANT ALL ON SEQUENCE public.community_statements_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.community_statements_id_seq TO service_role;


--
-- Name: TABLE contributor_blocks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.contributor_blocks TO anon;
GRANT ALL ON TABLE public.contributor_blocks TO authenticated;
GRANT ALL ON TABLE public.contributor_blocks TO service_role;


--
-- Name: TABLE contributor_profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.contributor_profiles TO anon;
GRANT ALL ON TABLE public.contributor_profiles TO authenticated;
GRANT ALL ON TABLE public.contributor_profiles TO service_role;


--
-- Name: TABLE data_sources; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.data_sources TO anon;
GRANT ALL ON TABLE public.data_sources TO authenticated;
GRANT ALL ON TABLE public.data_sources TO service_role;


--
-- Name: TABLE dictionary_terms; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.dictionary_terms TO anon;
GRANT ALL ON TABLE public.dictionary_terms TO authenticated;
GRANT ALL ON TABLE public.dictionary_terms TO service_role;


--
-- Name: TABLE entity_changes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.entity_changes TO anon;
GRANT ALL ON TABLE public.entity_changes TO authenticated;
GRANT ALL ON TABLE public.entity_changes TO service_role;


--
-- Name: SEQUENCE entity_changes_change_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.entity_changes_change_id_seq TO anon;
GRANT ALL ON SEQUENCE public.entity_changes_change_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.entity_changes_change_id_seq TO service_role;


--
-- Name: TABLE entity_guidelines; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.entity_guidelines TO anon;
GRANT ALL ON TABLE public.entity_guidelines TO authenticated;
GRANT ALL ON TABLE public.entity_guidelines TO service_role;


--
-- Name: TABLE label_document_formulations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.label_document_formulations TO anon;
GRANT ALL ON TABLE public.label_document_formulations TO authenticated;
GRANT ALL ON TABLE public.label_document_formulations TO service_role;


--
-- Name: TABLE entity_label_rank; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.entity_label_rank TO anon;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.entity_label_rank TO authenticated;
GRANT ALL ON TABLE public.entity_label_rank TO service_role;


--
-- Name: TABLE entity_labels; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.entity_labels TO service_role;
GRANT SELECT ON TABLE public.entity_labels TO anon;
GRANT SELECT ON TABLE public.entity_labels TO authenticated;


--
-- Name: TABLE fda_applications; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.fda_applications TO anon;
GRANT ALL ON TABLE public.fda_applications TO authenticated;
GRANT ALL ON TABLE public.fda_applications TO service_role;


--
-- Name: TABLE fda_product_ingredients; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.fda_product_ingredients TO anon;
GRANT ALL ON TABLE public.fda_product_ingredients TO authenticated;
GRANT ALL ON TABLE public.fda_product_ingredients TO service_role;


--
-- Name: TABLE federal_controlled_substances; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.federal_controlled_substances TO anon;
GRANT ALL ON TABLE public.federal_controlled_substances TO authenticated;
GRANT ALL ON TABLE public.federal_controlled_substances TO service_role;


--
-- Name: SEQUENCE federal_controlled_substances_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.federal_controlled_substances_id_seq TO anon;
GRANT ALL ON SEQUENCE public.federal_controlled_substances_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.federal_controlled_substances_id_seq TO service_role;


--
-- Name: TABLE functional_groups; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.functional_groups TO anon;
GRANT ALL ON TABLE public.functional_groups TO authenticated;
GRANT ALL ON TABLE public.functional_groups TO service_role;


--
-- Name: TABLE guidelines; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.guidelines TO anon;
GRANT ALL ON TABLE public.guidelines TO authenticated;
GRANT ALL ON TABLE public.guidelines TO service_role;


--
-- Name: SEQUENCE guidelines_guideline_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.guidelines_guideline_id_seq TO anon;
GRANT ALL ON SEQUENCE public.guidelines_guideline_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.guidelines_guideline_id_seq TO service_role;


--
-- Name: TABLE infobox_edits; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.infobox_edits TO anon;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.infobox_edits TO authenticated;
GRANT ALL ON TABLE public.infobox_edits TO service_role;


--
-- Name: COLUMN infobox_edits.id; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(id) ON TABLE public.infobox_edits TO anon;
GRANT SELECT(id) ON TABLE public.infobox_edits TO authenticated;


--
-- Name: COLUMN infobox_edits.pcid; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(pcid) ON TABLE public.infobox_edits TO anon;
GRANT SELECT(pcid) ON TABLE public.infobox_edits TO authenticated;


--
-- Name: COLUMN infobox_edits.property_key; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(property_key) ON TABLE public.infobox_edits TO anon;
GRANT SELECT(property_key) ON TABLE public.infobox_edits TO authenticated;


--
-- Name: COLUMN infobox_edits.value; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(value) ON TABLE public.infobox_edits TO anon;
GRANT SELECT(value) ON TABLE public.infobox_edits TO authenticated;


--
-- Name: COLUMN infobox_edits.citation; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(citation) ON TABLE public.infobox_edits TO anon;
GRANT SELECT(citation) ON TABLE public.infobox_edits TO authenticated;


--
-- Name: COLUMN infobox_edits.summary; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(summary) ON TABLE public.infobox_edits TO anon;
GRANT SELECT(summary) ON TABLE public.infobox_edits TO authenticated;


--
-- Name: COLUMN infobox_edits.is_current; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(is_current) ON TABLE public.infobox_edits TO anon;
GRANT SELECT(is_current) ON TABLE public.infobox_edits TO authenticated;


--
-- Name: COLUMN infobox_edits.created_at; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(created_at) ON TABLE public.infobox_edits TO anon;
GRANT SELECT(created_at) ON TABLE public.infobox_edits TO authenticated;


--
-- Name: COLUMN infobox_edits.patrol_status; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(patrol_status) ON TABLE public.infobox_edits TO anon;
GRANT SELECT(patrol_status) ON TABLE public.infobox_edits TO authenticated;


--
-- Name: COLUMN infobox_edits.patrolled_at; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(patrolled_at) ON TABLE public.infobox_edits TO anon;
GRANT SELECT(patrolled_at) ON TABLE public.infobox_edits TO authenticated;


--
-- Name: COLUMN infobox_edits.review_note; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(review_note) ON TABLE public.infobox_edits TO anon;
GRANT SELECT(review_note) ON TABLE public.infobox_edits TO authenticated;


--
-- Name: COLUMN infobox_edits.is_null_override; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(is_null_override) ON TABLE public.infobox_edits TO anon;
GRANT SELECT(is_null_override) ON TABLE public.infobox_edits TO authenticated;


--
-- Name: COLUMN infobox_edits.revision_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(revision_id) ON TABLE public.infobox_edits TO anon;
GRANT SELECT(revision_id) ON TABLE public.infobox_edits TO authenticated;


--
-- Name: SEQUENCE infobox_edits_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.infobox_edits_id_seq TO anon;
GRANT ALL ON SEQUENCE public.infobox_edits_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.infobox_edits_id_seq TO service_role;


--
-- Name: TABLE infobox_properties; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.infobox_properties TO anon;
GRANT ALL ON TABLE public.infobox_properties TO authenticated;
GRANT ALL ON TABLE public.infobox_properties TO service_role;


--
-- Name: TABLE ingest_tokens; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ingest_tokens TO service_role;


--
-- Name: TABLE label_fetch_log; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.label_fetch_log TO anon;
GRANT ALL ON TABLE public.label_fetch_log TO authenticated;
GRANT ALL ON TABLE public.label_fetch_log TO service_role;


--
-- Name: TABLE label_section_text; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.label_section_text TO anon;
GRANT ALL ON TABLE public.label_section_text TO authenticated;
GRANT ALL ON TABLE public.label_section_text TO service_role;


--
-- Name: TABLE label_sections; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.label_sections TO anon;
GRANT ALL ON TABLE public.label_sections TO authenticated;
GRANT ALL ON TABLE public.label_sections TO service_role;


--
-- Name: SEQUENCE label_sections_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.label_sections_id_seq TO anon;
GRANT ALL ON SEQUENCE public.label_sections_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.label_sections_id_seq TO service_role;


--
-- Name: TABLE lasa_names; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.lasa_names TO anon;
GRANT ALL ON TABLE public.lasa_names TO authenticated;
GRANT ALL ON TABLE public.lasa_names TO service_role;


--
-- Name: TABLE lasa_pairs_v; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.lasa_pairs_v TO anon;
GRANT ALL ON TABLE public.lasa_pairs_v TO authenticated;
GRANT ALL ON TABLE public.lasa_pairs_v TO service_role;


--
-- Name: TABLE learn_brand_list; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.learn_brand_list TO anon;
GRANT SELECT,MAINTAIN ON TABLE public.learn_brand_list TO authenticated;
GRANT ALL ON TABLE public.learn_brand_list TO service_role;


--
-- Name: TABLE learn_collection_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.learn_collection_items TO service_role;
GRANT SELECT ON TABLE public.learn_collection_items TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.learn_collection_items TO authenticated;


--
-- Name: TABLE learn_collections; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.learn_collections TO service_role;
GRANT SELECT ON TABLE public.learn_collections TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.learn_collections TO authenticated;


--
-- Name: TABLE learn_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.learn_items TO service_role;
GRANT SELECT ON TABLE public.learn_items TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.learn_items TO authenticated;


--
-- Name: TABLE learn_collection_counts; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.learn_collection_counts TO anon;
GRANT ALL ON TABLE public.learn_collection_counts TO authenticated;
GRANT ALL ON TABLE public.learn_collection_counts TO service_role;


--
-- Name: TABLE learn_item_entities; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.learn_item_entities TO service_role;
GRANT SELECT ON TABLE public.learn_item_entities TO anon;
GRANT SELECT ON TABLE public.learn_item_entities TO authenticated;


--
-- Name: TABLE learn_review_events; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.learn_review_events TO service_role;
GRANT SELECT,INSERT ON TABLE public.learn_review_events TO authenticated;


--
-- Name: SEQUENCE learn_review_events_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.learn_review_events_id_seq TO anon;
GRANT ALL ON SEQUENCE public.learn_review_events_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.learn_review_events_id_seq TO service_role;


--
-- Name: TABLE learn_user_item_state; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.learn_user_item_state TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.learn_user_item_state TO authenticated;


--
-- Name: TABLE learn_user_settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.learn_user_settings TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.learn_user_settings TO authenticated;


--
-- Name: TABLE list_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.list_items TO anon;
GRANT ALL ON TABLE public.list_items TO authenticated;
GRANT ALL ON TABLE public.list_items TO service_role;


--
-- Name: TABLE lists; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.lists TO anon;
GRANT ALL ON TABLE public.lists TO authenticated;
GRANT ALL ON TABLE public.lists TO service_role;


--
-- Name: TABLE measurements; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.measurements TO anon;
GRANT ALL ON TABLE public.measurements TO authenticated;
GRANT ALL ON TABLE public.measurements TO service_role;


--
-- Name: TABLE page_citations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.page_citations TO anon;
GRANT ALL ON TABLE public.page_citations TO authenticated;
GRANT ALL ON TABLE public.page_citations TO service_role;


--
-- Name: TABLE page_content; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.page_content TO anon;
GRANT ALL ON TABLE public.page_content TO authenticated;
GRANT ALL ON TABLE public.page_content TO service_role;


--
-- Name: TABLE page_links; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.page_links TO anon;
GRANT ALL ON TABLE public.page_links TO authenticated;
GRANT ALL ON TABLE public.page_links TO service_role;


--
-- Name: TABLE page_property_refs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.page_property_refs TO anon;
GRANT ALL ON TABLE public.page_property_refs TO authenticated;
GRANT ALL ON TABLE public.page_property_refs TO service_role;


--
-- Name: TABLE page_revisions; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.page_revisions TO anon;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.page_revisions TO authenticated;
GRANT ALL ON TABLE public.page_revisions TO service_role;


--
-- Name: COLUMN page_revisions.id; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(id) ON TABLE public.page_revisions TO anon;
GRANT SELECT(id) ON TABLE public.page_revisions TO authenticated;


--
-- Name: COLUMN page_revisions.pcid; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(pcid) ON TABLE public.page_revisions TO anon;
GRANT SELECT(pcid) ON TABLE public.page_revisions TO authenticated;


--
-- Name: COLUMN page_revisions.parent_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(parent_id) ON TABLE public.page_revisions TO anon;
GRANT SELECT(parent_id) ON TABLE public.page_revisions TO authenticated;


--
-- Name: COLUMN page_revisions.description; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(description) ON TABLE public.page_revisions TO anon;
GRANT SELECT(description) ON TABLE public.page_revisions TO authenticated;


--
-- Name: COLUMN page_revisions.body_md; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(body_md) ON TABLE public.page_revisions TO anon;
GRANT SELECT(body_md) ON TABLE public.page_revisions TO authenticated;


--
-- Name: COLUMN page_revisions.summary; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(summary) ON TABLE public.page_revisions TO anon;
GRANT SELECT(summary) ON TABLE public.page_revisions TO authenticated;


--
-- Name: COLUMN page_revisions.size_delta; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(size_delta) ON TABLE public.page_revisions TO anon;
GRANT SELECT(size_delta) ON TABLE public.page_revisions TO authenticated;


--
-- Name: COLUMN page_revisions.kind; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(kind) ON TABLE public.page_revisions TO anon;
GRANT SELECT(kind) ON TABLE public.page_revisions TO authenticated;


--
-- Name: COLUMN page_revisions.created_at; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(created_at) ON TABLE public.page_revisions TO anon;
GRANT SELECT(created_at) ON TABLE public.page_revisions TO authenticated;


--
-- Name: COLUMN page_revisions.patrol_status; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(patrol_status) ON TABLE public.page_revisions TO anon;
GRANT SELECT(patrol_status) ON TABLE public.page_revisions TO authenticated;


--
-- Name: COLUMN page_revisions.patrolled_at; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(patrolled_at) ON TABLE public.page_revisions TO anon;
GRANT SELECT(patrolled_at) ON TABLE public.page_revisions TO authenticated;


--
-- Name: COLUMN page_revisions.review_note; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(review_note) ON TABLE public.page_revisions TO anon;
GRANT SELECT(review_note) ON TABLE public.page_revisions TO authenticated;


--
-- Name: COLUMN page_revisions.format; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(format) ON TABLE public.page_revisions TO anon;
GRANT SELECT(format) ON TABLE public.page_revisions TO authenticated;


--
-- Name: COLUMN page_revisions.model; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(model) ON TABLE public.page_revisions TO anon;
GRANT SELECT(model) ON TABLE public.page_revisions TO authenticated;


--
-- Name: COLUMN page_revisions.source_md; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(source_md) ON TABLE public.page_revisions TO anon;
GRANT SELECT(source_md) ON TABLE public.page_revisions TO authenticated;


--
-- Name: COLUMN page_revisions.extracted; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(extracted) ON TABLE public.page_revisions TO anon;
GRANT SELECT(extracted) ON TABLE public.page_revisions TO authenticated;


--
-- Name: COLUMN page_revisions.changed_sections; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(changed_sections) ON TABLE public.page_revisions TO anon;
GRANT SELECT(changed_sections) ON TABLE public.page_revisions TO authenticated;


--
-- Name: SEQUENCE page_revisions_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.page_revisions_id_seq TO anon;
GRANT ALL ON SEQUENCE public.page_revisions_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.page_revisions_id_seq TO service_role;


--
-- Name: TABLE page_templates; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.page_templates TO anon;
GRANT ALL ON TABLE public.page_templates TO authenticated;
GRANT ALL ON TABLE public.page_templates TO service_role;


--
-- Name: TABLE pcid_blocks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.pcid_blocks TO anon;
GRANT ALL ON TABLE public.pcid_blocks TO authenticated;
GRANT ALL ON TABLE public.pcid_blocks TO service_role;


--
-- Name: TABLE pcid_retired; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.pcid_retired TO anon;
GRANT ALL ON TABLE public.pcid_retired TO authenticated;
GRANT ALL ON TABLE public.pcid_retired TO service_role;


--
-- Name: TABLE physiochemical; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.physiochemical TO anon;
GRANT ALL ON TABLE public.physiochemical TO authenticated;
GRANT ALL ON TABLE public.physiochemical TO service_role;


--
-- Name: TABLE predicates; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.predicates TO anon;
GRANT ALL ON TABLE public.predicates TO authenticated;
GRANT ALL ON TABLE public.predicates TO service_role;


--
-- Name: TABLE product_packaging; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.product_packaging TO service_role;
GRANT SELECT ON TABLE public.product_packaging TO anon;
GRANT SELECT ON TABLE public.product_packaging TO authenticated;


--
-- Name: SEQUENCE product_packaging_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.product_packaging_id_seq TO anon;
GRANT ALL ON SEQUENCE public.product_packaging_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.product_packaging_id_seq TO service_role;


--
-- Name: TABLE provider_verifications; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.provider_verifications TO anon;
GRANT ALL ON TABLE public.provider_verifications TO authenticated;
GRANT ALL ON TABLE public.provider_verifications TO service_role;


--
-- Name: TABLE references_resources; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.references_resources TO service_role;
GRANT SELECT ON TABLE public.references_resources TO anon;
GRANT SELECT ON TABLE public.references_resources TO authenticated;


--
-- Name: TABLE rems_products; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.rems_products TO anon;
GRANT ALL ON TABLE public.rems_products TO authenticated;
GRANT ALL ON TABLE public.rems_products TO service_role;


--
-- Name: TABLE rems_programs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.rems_programs TO anon;
GRANT ALL ON TABLE public.rems_programs TO authenticated;
GRANT ALL ON TABLE public.rems_programs TO service_role;


--
-- Name: TABLE revisions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.revisions TO anon;
GRANT ALL ON TABLE public.revisions TO authenticated;
GRANT ALL ON TABLE public.revisions TO service_role;


--
-- Name: SEQUENCE revisions_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.revisions_id_seq TO anon;
GRANT ALL ON SEQUENCE public.revisions_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.revisions_id_seq TO service_role;


--
-- Name: TABLE rxclass_classes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.rxclass_classes TO anon;
GRANT ALL ON TABLE public.rxclass_classes TO authenticated;
GRANT ALL ON TABLE public.rxclass_classes TO service_role;


--
-- Name: TABLE rxclass_drug; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.rxclass_drug TO anon;
GRANT ALL ON TABLE public.rxclass_drug TO authenticated;
GRANT ALL ON TABLE public.rxclass_drug TO service_role;


--
-- Name: TABLE rxclass_lookup; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.rxclass_lookup TO anon;
GRANT ALL ON TABLE public.rxclass_lookup TO authenticated;
GRANT ALL ON TABLE public.rxclass_lookup TO service_role;


--
-- Name: TABLE rxclass_va_products; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.rxclass_va_products TO anon;
GRANT ALL ON TABLE public.rxclass_va_products TO authenticated;
GRANT ALL ON TABLE public.rxclass_va_products TO service_role;


--
-- Name: TABLE saved_entities; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.saved_entities TO anon;
GRANT ALL ON TABLE public.saved_entities TO authenticated;
GRANT ALL ON TABLE public.saved_entities TO service_role;


--
-- Name: TABLE search_index; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.search_index TO anon;
GRANT ALL ON TABLE public.search_index TO authenticated;
GRANT ALL ON TABLE public.search_index TO service_role;


--
-- Name: TABLE section_embeds; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.section_embeds TO anon;
GRANT ALL ON TABLE public.section_embeds TO authenticated;
GRANT ALL ON TABLE public.section_embeds TO service_role;


--
-- Name: TABLE structure_name_candidates; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.structure_name_candidates TO anon;
GRANT ALL ON TABLE public.structure_name_candidates TO authenticated;
GRANT ALL ON TABLE public.structure_name_candidates TO service_role;


--
-- Name: TABLE structure_review_sheet; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.structure_review_sheet TO service_role;


--
-- Name: TABLE term_definitions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.term_definitions TO anon;
GRANT ALL ON TABLE public.term_definitions TO authenticated;
GRANT ALL ON TABLE public.term_definitions TO service_role;


--
-- Name: SEQUENCE term_definitions_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.term_definitions_id_seq TO anon;
GRANT ALL ON SEQUENCE public.term_definitions_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.term_definitions_id_seq TO service_role;


--
-- Name: TABLE threshold_rules; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.threshold_rules TO anon;
GRANT ALL ON TABLE public.threshold_rules TO authenticated;
GRANT ALL ON TABLE public.threshold_rules TO service_role;


--
-- Name: SEQUENCE threshold_rules_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.threshold_rules_id_seq TO anon;
GRANT ALL ON SEQUENCE public.threshold_rules_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.threshold_rules_id_seq TO service_role;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_roles TO anon;
GRANT ALL ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;


--
-- Name: TABLE v_cs_all_high; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.v_cs_all_high TO anon;
GRANT ALL ON TABLE public.v_cs_all_high TO authenticated;
GRANT ALL ON TABLE public.v_cs_all_high TO service_role;


--
-- Name: TABLE v_cs_all_low; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.v_cs_all_low TO anon;
GRANT ALL ON TABLE public.v_cs_all_low TO authenticated;
GRANT ALL ON TABLE public.v_cs_all_low TO service_role;


--
-- Name: TABLE v_cs_all_medium; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.v_cs_all_medium TO anon;
GRANT ALL ON TABLE public.v_cs_all_medium TO authenticated;
GRANT ALL ON TABLE public.v_cs_all_medium TO service_role;


--
-- Name: TABLE v_cs_c2_5_high; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.v_cs_c2_5_high TO anon;
GRANT ALL ON TABLE public.v_cs_c2_5_high TO authenticated;
GRANT ALL ON TABLE public.v_cs_c2_5_high TO service_role;


--
-- Name: TABLE v_cs_c2_5_low; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.v_cs_c2_5_low TO anon;
GRANT ALL ON TABLE public.v_cs_c2_5_low TO authenticated;
GRANT ALL ON TABLE public.v_cs_c2_5_low TO service_role;


--
-- Name: TABLE v_cs_c2_5_medium; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.v_cs_c2_5_medium TO anon;
GRANT ALL ON TABLE public.v_cs_c2_5_medium TO authenticated;
GRANT ALL ON TABLE public.v_cs_c2_5_medium TO service_role;


--
-- Name: TABLE v_cs_c2_high; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.v_cs_c2_high TO anon;
GRANT ALL ON TABLE public.v_cs_c2_high TO authenticated;
GRANT ALL ON TABLE public.v_cs_c2_high TO service_role;


--
-- Name: TABLE v_cs_c2_low; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.v_cs_c2_low TO anon;
GRANT ALL ON TABLE public.v_cs_c2_low TO authenticated;
GRANT ALL ON TABLE public.v_cs_c2_low TO service_role;


--
-- Name: TABLE v_cs_c2_medium; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.v_cs_c2_medium TO anon;
GRANT ALL ON TABLE public.v_cs_c2_medium TO authenticated;
GRANT ALL ON TABLE public.v_cs_c2_medium TO service_role;


--
-- Name: TABLE v_cs_c3_5_high; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.v_cs_c3_5_high TO anon;
GRANT ALL ON TABLE public.v_cs_c3_5_high TO authenticated;
GRANT ALL ON TABLE public.v_cs_c3_5_high TO service_role;


--
-- Name: TABLE v_cs_c3_5_low; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.v_cs_c3_5_low TO anon;
GRANT ALL ON TABLE public.v_cs_c3_5_low TO authenticated;
GRANT ALL ON TABLE public.v_cs_c3_5_low TO service_role;


--
-- Name: TABLE v_cs_c3_5_medium; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.v_cs_c3_5_medium TO anon;
GRANT ALL ON TABLE public.v_cs_c3_5_medium TO authenticated;
GRANT ALL ON TABLE public.v_cs_c3_5_medium TO service_role;


--
-- Name: TABLE v_export_main_spine; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.v_export_main_spine TO anon;
GRANT ALL ON TABLE public.v_export_main_spine TO authenticated;
GRANT ALL ON TABLE public.v_export_main_spine TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict E8mIstsyA9h4nxUncRiviDtIsD6gr41XFallfhOaufaMhBYi3FDfgJ8ZBQ8Kv2J

