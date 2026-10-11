-- Phase 16b behaviour tests (full-page editor publishing).
-- Run after: stubs, phase15, 15f, tests, 15g, tests_15g, 15h, tests_15h, phase16a, phase16b.
-- State from earlier runs: Joshua (J) is admin; Alice (A) is a verified ordinary contributor;
-- Bob (B) is not verified. amitriptyline 1000500 is open; warfarin 1002962 is 'reviewed'.
-- publish_page() is called the way the publish-page Edge Function calls it (service_role,
-- person passed explicitly). Payload models follow src/pageSource/types.ts.
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false)
$$;
create table pg_temp.results (n serial, name text, ok boolean, detail text);
grant all on pg_temp.results to anon, authenticated, service_role;
grant all on sequence pg_temp.results_n_seq to anon, authenticated, service_role;
create or replace function pg_temp.check(p_name text, p_ok boolean, p_detail text default null) returns void
language sql as $$ insert into pg_temp.results (name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;
create or replace function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'NO ERROR'; exception when others then return sqlerrm; end $$;

-- A page model: lead, one contributor section, the renal block, optional Quick Facts/brands.
create or replace function pg_temp.model(p_lead text, p_infobox jsonb default '[]', p_brands jsonb default '[]',
                                         p_renal jsonb default '[]') returns jsonb language sql as $$
  select jsonb_build_object(
    'title', 't',
    'brands', jsonb_build_object('name', 'brands', 'lines', p_brands),
    'infobox', jsonb_build_object('name', 'infobox', 'lines', p_infobox),
    'main', jsonb_build_array(
      jsonb_build_object('kind', 'lead', 'id', 'lead', 'markdown', p_lead),
      jsonb_build_object('kind', 'embed', 'id', 'hierarchy', 'name', 'hierarchy'),
      jsonb_build_object('kind', 'section', 'id', 'renal-dosing', 'heading', 'Renal dosing', 'template', true,
        'parts', jsonb_build_array(jsonb_build_object('kind', 'block',
          'block', jsonb_build_object('name', 'renal-dosing', 'grammar', 'threshold', 'lines', p_renal)))),
      jsonb_build_object('kind', 'section', 'id', 's-1', 'heading', 'Dosing', 'template', false,
        'parts', jsonb_build_array(jsonb_build_object('kind', 'prose', 'markdown', 'See [[metformin]].')))))
$$;

create or replace function pg_temp.payload(p_model jsonb, p_summary text default 'test edit',
                                           p_citations jsonb default '[]') returns jsonb language sql as $$
  select jsonb_build_object(
    'summary', p_summary, 'kind', 'edit', 'model', p_model,
    'source_md', p_model::text, 'description', p_model -> 'main' -> 0 ->> 'markdown', 'body_md', '',
    'extracted', jsonb_build_object('links', jsonb_build_array(jsonb_build_object('target', 'metformin')),
                                    'properties', jsonb_build_array(jsonb_build_object('key', 'acb_score', 'target', '')),
                                    'citations', '[]'::jsonb),
    'changed_sections', jsonb_build_array('lead'),
    'citations', p_citations)
$$;

create or replace function pg_temp.cite(k text) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('kind', split_part(k, ':', 1), 'id', split_part(k, ':', 2), 'key', k))
$$;

do $t$
declare
  J uuid := '8464cf01-f9ea-4053-880c-9424f971a192';
  A uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  B uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  AMI bigint := 1000500;
  WAR bigint := 1002962;
  res jsonb; r1 bigint; r2 bigint; r3 bigint; rw bigint; v text; n int;
  renal jsonb := jsonb_build_array(
    jsonb_build_object('measure', 'egfr', 'comparator', '<', 'low', 30, 'high', null, 'action', 'avoid', 'citations', pg_temp.cite('pmid:111')),
    jsonb_build_object('measure', 'egfr', 'comparator', 'range', 'low', 30, 'high', 45, 'action', 'reduce dose', 'citations', pg_temp.cite('pmid:111')));
  ib jsonb := jsonb_build_array(
    jsonb_build_object('key', 'acb_score', 'value', '3', 'isNull', false, 'citations', pg_temp.cite('pmid:222')),
    jsonb_build_object('key', 'qtc_risk', 'value', null, 'isNull', true, 'citations', pg_temp.cite('pmid:333')));
  cites jsonb := jsonb_build_array(
    jsonb_build_object('key', 'pmid:111', 'kind', 'pmid', 'title', 'Renal study', 'year', 2020, 'pmid', '111', 'resolved', true),
    jsonb_build_object('key', 'pmid:222', 'kind', 'pmid', 'resolved', false));
begin
  -- ── Gates ────────────────────────────────────────────────────────────────
  perform pg_temp.check('unverified person cannot publish',
    pg_temp.err(format('select publish_page(%L, %s, null, null, %L)', B, AMI, pg_temp.payload(pg_temp.model('x')))) = 'not_verified');
  perform pg_temp.check('summary required',
    pg_temp.err(format('select publish_page(%L, %s, null, null, %L)', A, AMI, pg_temp.payload(pg_temp.model('x'), ' '))) = 'summary_required');

  -- ── First publish on an open page ───────────────────────────────────────
  delete from page_content where pcid = AMI;
  res := publish_page(A, AMI, null, null, pg_temp.payload(pg_temp.model('Amitriptyline is a TCA.', ib, '[]', renal), 'first', cites));
  r1 := (res ->> 'revision_id')::bigint;
  perform pg_temp.check('open page: published live', res ->> 'status' = 'live', res::text);
  perform pg_temp.check('revision is format 2, kind create, unpatrolled',
    (select format = 2 and kind = 'create' and patrol_status = 'unpatrolled' from page_revisions where id = r1));
  perform pg_temp.check('page_content points at it, lead copied to description',
    (select current_revision_id = r1 and description = 'Amitriptyline is a TCA.' from page_content where pcid = AMI));
  perform pg_temp.check('links and value refs come from extracted',
    exists (select 1 from page_links where source_pcid = AMI and target_text = 'metformin' and target_pcid = 1001900)
    and exists (select 1 from page_property_refs where source_pcid = AMI and property_key = 'acb_score'));
  perform pg_temp.check('citations stored once, numbered per revision',
    (select count(*) from citation_sources where key in ('pmid:111', 'pmid:222')) = 2
    and (select string_agg(ref_key, ',' order by ordinal) from page_citations where revision_id = r1) = 'pmid:111,pmid:222');
  perform pg_temp.check('resolved metadata kept',
    (select title = 'Renal study' and resolved from citation_sources where key = 'pmid:111'));

  perform pg_temp.check('Quick Facts value written with its citation and revision',
    (select value = '3' and citation = '[@pmid:222]' and revision_id = r1 and not is_null_override
     from infobox_edits where pcid = AMI and property_key = 'acb_score' and is_current));
  perform pg_temp.check('[NONE] stored as a null override',
    (select value is null and is_null_override and citation = '[@pmid:333]'
     from infobox_edits where pcid = AMI and property_key = 'qtc_risk' and is_current));
  perform pg_temp.check('renal rules: two current rows in order',
    (select string_agg(measure || comparator || low || coalesce('-' || high, '') || ':' || action, '|' order by position)
     from threshold_rules where pcid = AMI and is_current) = 'egfr<30:avoid|egfrrange30-45:reduce dose');
  perform pg_temp.check('renal citations kept as keys',
    (select citations = array['pmid:111'] from threshold_rules where pcid = AMI and is_current and position = 1));

  -- ── Second publish: only changed things get new rows ────────────────────
  res := publish_page(A, AMI, r1, r1, pg_temp.payload(pg_temp.model('Amitriptyline is a tricyclic.', ib, '[]', renal), 'lead only'));
  r2 := (res ->> 'revision_id')::bigint;
  perform pg_temp.check('unchanged Quick Facts not rewritten',
    (select count(*) from infobox_edits where pcid = AMI and property_key = 'acb_score' and revision_id is not null) = 1);
  perform pg_temp.check('unchanged renal block not rewritten',
    (select count(*) from threshold_rules where pcid = AMI) = 2);
  perform pg_temp.check('parent recorded', (select parent_id = r1 from page_revisions where id = r2));

  -- ── Stale publish is refused (publish-page merges again) ────────────────
  perform pg_temp.check('publishing against an old current revision is an edit_conflict',
    pg_temp.err(format('select publish_page(%L, %s, %s, %s, %L)', A, AMI, r1, r1, pg_temp.payload(pg_temp.model('x')))) = 'edit_conflict');

  -- ── Removing overrides and changing the block ───────────────────────────
  res := publish_page(A, AMI, r2, r2, pg_temp.payload(pg_temp.model('Amitriptyline is a tricyclic.',
           jsonb_build_array(ib -> 0), '[]', jsonb_build_array(renal -> 0)), 'drop qtc, trim renal'));
  r3 := (res ->> 'revision_id')::bigint;
  perform pg_temp.check('removed override is cleared (back to source)',
    (select value is null and not is_null_override and citation like 'removed in page revision%'
     from infobox_edits where pcid = AMI and property_key = 'qtc_risk' and is_current));
  perform pg_temp.check('renal block replaced as a whole',
    (select count(*) from threshold_rules where pcid = AMI and is_current) = 1
    and (select count(*) from threshold_rules where pcid = AMI and not is_current) = 2);

  -- ── Revert restores the whole bundle ─────────────────────────────────────
  perform pg_temp.as_user(A);
  v := revert_page(AMI, r1)::text;
  perform pg_temp.check('revert to r1 restores [NONE] and both renal lines',
    (select is_null_override from infobox_edits where pcid = AMI and property_key = 'qtc_risk' and is_current)
    and (select count(*) from threshold_rules where pcid = AMI and is_current) = 2
    and (select description from page_content where pcid = AMI) = 'Amitriptyline is a TCA.');
  perform pg_temp.check('reverted revisions marked',
    (select count(*) from page_revisions where pcid = AMI and id in (r2, r3) and patrol_status = 'reverted') = 2);
  perform pg_temp.check('revert keeps the reference list',
    (select count(*) from page_citations where revision_id = v::bigint) = 2);

  -- ── Reviewed page: whole bundle held until accepted ─────────────────────
  delete from page_content where pcid = WAR and current_revision_id is null;
  insert into page_content (pcid, protection) values (WAR, 'reviewed') on conflict (pcid) do update set protection = 'reviewed';
  res := publish_page(A, WAR, (select current_revision_id from page_content where pcid = WAR),
                      (select current_revision_id from page_content where pcid = WAR),
                      pg_temp.payload(pg_temp.model('Warfarin is a vitamin K antagonist.', ib,
                        jsonb_build_array(jsonb_build_object('action', 'hide', 'brand', 'COUMADIN', 'reason', 'discontinued',
                                                             'citations', pg_temp.cite('pmid:444')),
                                          jsonb_build_object('action', 'add', 'brand', 'Jantoven', 'citations', pg_temp.cite('pmid:555'))),
                        renal), 'held edit'));
  rw := (res ->> 'revision_id')::bigint;
  perform pg_temp.check('reviewed page: held as pending', res ->> 'status' = 'pending');
  perform pg_temp.check('held: nothing structured written yet',
    not exists (select 1 from threshold_rules where pcid = WAR)
    and not exists (select 1 from brand_edits where revision_id = rw)
    and not exists (select 1 from infobox_edits where revision_id = rw));

  perform pg_temp.as_user(A);
  perform pg_temp.check('author cannot accept own edit',
    pg_temp.err(format('select accept_revision(%s)', rw)) in ('not_patroller', 'cannot_review_own'));
  perform pg_temp.as_user(J);
  perform accept_revision(rw, 'looks right');
  perform pg_temp.check('accepted: live, structured rows written as patrolled',
    (select current_revision_id = rw from page_content where pcid = WAR)
    and (select count(*) from threshold_rules where pcid = WAR and is_current and revision_id = rw) = 2
    and (select patrol_status = 'patrolled' from infobox_edits where pcid = WAR and property_key = 'acb_score' and is_current));
  perform pg_temp.check('brand hide keeps the reason; add stored',
    (select action = 'hide' and summary = 'discontinued' and citation = '[@pmid:444]'
     from brand_edits where pcid = WAR and brand_key = 'COUMADIN' and is_current)
    and exists (select 1 from brand_edits where pcid = WAR and brand_key = 'JANTOVEN' and action = 'add' and is_current));

  -- ── Rebase-and-accept for a stale held edit ─────────────────────────────
  perform pg_temp.as_user(null);
  res := publish_page(A, WAR, rw, rw, pg_temp.payload(pg_temp.model('Edit one', ib), 'held one'));
  r1 := (res ->> 'revision_id')::bigint;
  res := publish_page(J, WAR, rw, rw, pg_temp.payload(pg_temp.model('Joshua edit', ib), 'live by patroller'));
  r2 := (res ->> 'revision_id')::bigint;
  perform pg_temp.check('patroller edit on reviewed page is live and patrolled',
    res ->> 'status' = 'live' and (select patrol_status from page_revisions where id = r2) = 'patrolled');
  perform pg_temp.as_user(J);
  perform pg_temp.check('stale held edit cannot be accepted directly',
    pg_temp.err(format('select accept_revision(%s)', r1)) = 'stale_revision');
  perform accept_rebased_revision(J, r1, r2, pg_temp.payload(pg_temp.model('Joshua edit + Alice merged', ib), 'held one'));
  perform pg_temp.check('rebased accept applies the merged model',
    (select current_revision_id = r1 and description = 'Joshua edit + Alice merged' from page_content where pcid = WAR)
    and (select parent_id = r2 from page_revisions where id = r1));

  -- ── Permissions ──────────────────────────────────────────────────────────
  perform pg_temp.check('publish_page not executable by authenticated or anon',
    not has_function_privilege('authenticated', 'public.publish_page(uuid,bigint,bigint,bigint,jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.publish_page(uuid,bigint,bigint,bigint,jsonb)', 'execute')
    and has_function_privilege('service_role', 'public.publish_page(uuid,bigint,bigint,bigint,jsonb)', 'execute'));
  perform pg_temp.check('apply_page_revision not executable by authenticated',
    not has_function_privilege('authenticated', 'public.apply_page_revision(bigint,uuid)', 'execute'));
  -- Writes are blocked by RLS (Supabase grants table privileges broadly): read policies only.
  perform pg_temp.check('new tables: RLS on, read-only policies',
    (select bool_and(relrowsecurity) from pg_class where relname in ('citation_sources', 'page_citations', 'threshold_rules'))
    and not exists (select 1 from pg_policies where tablename in ('citation_sources', 'page_citations', 'threshold_rules', 'block_schemas', 'section_embeds', 'page_templates')
                    and cmd <> 'SELECT'));
  perform pg_temp.check('anon can read citations and rules',
    has_table_privilege('anon', 'public.citation_sources', 'select') and has_table_privilege('anon', 'public.threshold_rules', 'select'));
  perform pg_temp.check('author ids still withheld on revisions',
    not has_column_privilege('anon', 'public.page_revisions', 'created_by', 'select')
    and has_column_privilege('anon', 'public.page_revisions', 'model', 'select'));
  perform pg_temp.check('format-2 revision needs a model',
    pg_temp.err(format('insert into page_revisions (pcid, summary, size_delta, format) values (%s, %L, 0, 2)', AMI, 's'))
      like '%page_revisions_format2_model%');
  perform pg_temp.check('bad citation key refused by the table',
    pg_temp.err('insert into citation_sources (key, kind) values (''pmid:abc'', ''pmid'')') like '%citation_sources_key_check%');
end $t$;

select (case when ok then 'PASS ' else 'FAIL ' end) || name || coalesce(' — ' || detail, '') as result
from pg_temp.results order by n;
