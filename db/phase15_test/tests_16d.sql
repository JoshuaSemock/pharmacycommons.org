-- Phase 16d behaviour tests (:::interactions → community_statements).
-- Run after: stubs, phase15, 15f, tests, 15g, tests_15g, 15h, tests_15h, phase16a, phase16b,
-- tests_16b, phase16c, phase16d. Uses amitriptyline (1000500, open) from tests_16b.
\set ON_ERROR_STOP on
create table pg_temp.results (n serial, name text, ok boolean, detail text);
grant all on pg_temp.results to anon, authenticated, service_role;
grant all on sequence pg_temp.results_n_seq to anon, authenticated, service_role;
create or replace function pg_temp.check(p_name text, p_ok boolean, p_detail text default null) returns void
language sql as $$ insert into pg_temp.results (name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;
create or replace function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'NO ERROR'; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.cite(k text) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('kind', split_part(k, ':', 1), 'id', split_part(k, ':', 2), 'key', k))
$$;
create or replace function pg_temp.line(t text, e text, k text) returns jsonb language sql as $$
  select jsonb_build_object('target', t, 'effect', e, 'citations', pg_temp.cite(k))
$$;
-- Lead, the renal block (one rule) and the interactions block with p_lines.
create or replace function pg_temp.model(p_lead text, p_lines jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'title', 't', 'brands', null, 'infobox', null,
    'main', jsonb_build_array(
      jsonb_build_object('kind', 'lead', 'id', 'lead', 'markdown', p_lead),
      jsonb_build_object('kind', 'section', 'id', 'renal-dosing', 'heading', 'Renal dosing', 'template', true,
        'parts', jsonb_build_array(jsonb_build_object('kind', 'block', 'block', jsonb_build_object('name', 'renal-dosing',
          'grammar', 'threshold', 'lines', jsonb_build_array(jsonb_build_object('measure', 'egfr', 'comparator', '<',
            'low', 30, 'high', null, 'action', 'avoid', 'citations', pg_temp.cite('pmid:111'))))))),
      jsonb_build_object('kind', 'section', 'id', 'interactions', 'heading', 'Interactions', 'template', true,
        'parts', jsonb_build_array(jsonb_build_object('kind', 'block', 'block', jsonb_build_object('name', 'interactions',
          'grammar', 'statement', 'lines', p_lines))))))
$$;
create or replace function pg_temp.payload(p_model jsonb, p_summary text) returns jsonb language sql as $$
  select jsonb_build_object('summary', p_summary, 'kind', 'edit', 'model', p_model, 'source_md', p_model::text,
    'description', p_model -> 'main' -> 0 ->> 'markdown', 'body_md', '',
    'extracted', jsonb_build_object('links', '[]'::jsonb, 'properties', '[]'::jsonb, 'citations', '[]'::jsonb),
    'changed_sections', jsonb_build_array('interactions'), 'citations', '[]'::jsonb)
$$;

do $t$
declare
  A uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  AMI bigint := 1000500;
  cur bigint; res jsonb; r1 bigint; r2 bigint; r3 bigint; r4 bigint;
  two jsonb := jsonb_build_array(pg_temp.line('Warfarin', 'increased INR; monitor', 'pmid:444'),
                                 pg_temp.line('St John''s wort tea', 'reduced effect', 'pmid:555'));
begin
  perform pg_temp.check('interacts_with predicate exists', exists (select 1 from predicates where predicate = 'interacts_with'));
  perform pg_temp.check('registry has the interactions block (statement grammar)',
    exists (select 1 from jsonb_array_elements(page_source_registry() -> 'blocks') b
            where b ->> 'name' = 'interactions' and b ->> 'grammar' = 'statement'));
  perform pg_temp.check('grammar check still refuses unknown grammars',
    pg_temp.err('update block_schemas set grammar = ''bogus'' where name = ''interactions''') like '%block_schemas_grammar_check%');

  cur := (select current_revision_id from page_content where pcid = AMI);
  res := publish_page(A, AMI, cur, cur, pg_temp.payload(pg_temp.model('Amitriptyline.', two), 'add interactions'));
  r1 := (res ->> 'revision_id')::bigint;
  perform pg_temp.check('published live', res ->> 'status' = 'live', res::text);
  perform pg_temp.check('two current rows, in order, with predicate and revision',
    (select string_agg(position || ':' || object_text || ':' || predicate, '|' order by position)
     from community_statements where subject_pcid = AMI and is_current and revision_id = r1)
      = '1:Warfarin:interacts_with|2:St John''s wort tea:interacts_with');
  perform pg_temp.check('a known page resolves to its PCID',
    (select object_pcid from community_statements where subject_pcid = AMI and is_current and position = 1) = 1002962);
  perform pg_temp.check('an unknown page keeps its text and no PCID',
    (select object_pcid is null from community_statements where subject_pcid = AMI and is_current and position = 2));
  perform pg_temp.check('citations stored as keys',
    (select citations = array['pmid:444'] and effect = 'increased INR; monitor' from community_statements
     where subject_pcid = AMI and is_current and position = 1));
  perform pg_temp.check('renal rules still written alongside',
    (select count(*) from threshold_rules where pcid = AMI and is_current) = 1);

  -- Lead-only change: the block is untouched, no new rows.
  res := publish_page(A, AMI, r1, r1, pg_temp.payload(pg_temp.model('Amitriptyline, a TCA.', two), 'lead only'));
  r2 := (res ->> 'revision_id')::bigint;
  perform pg_temp.check('unchanged block not rewritten',
    (select count(*) from community_statements where subject_pcid = AMI) = 2
    and not exists (select 1 from community_statements where revision_id = r2));

  -- Changing one line replaces the block as a whole.
  res := publish_page(A, AMI, r2, r2, pg_temp.payload(pg_temp.model('Amitriptyline, a TCA.',
           jsonb_build_array(pg_temp.line('Warfarin', 'increased INR; check INR within a week', 'pmid:444'))), 'change'));
  r3 := (res ->> 'revision_id')::bigint;
  perform pg_temp.check('changed block: old rows retired, one current row from the new revision',
    (select count(*) from community_statements where subject_pcid = AMI and is_current) = 1
    and (select revision_id = r3 and effect like '%within a week' from community_statements where subject_pcid = AMI and is_current)
    and (select count(*) from community_statements where subject_pcid = AMI and not is_current) = 2);

  -- Emptying the block retires everything.
  res := publish_page(A, AMI, r3, r3, pg_temp.payload(pg_temp.model('Amitriptyline, a TCA.', '[]'::jsonb), 'empty'));
  r4 := (res ->> 'revision_id')::bigint;
  perform pg_temp.check('empty block leaves no current rows',
    not exists (select 1 from community_statements where subject_pcid = AMI and is_current));

  -- Access.
  perform pg_temp.check('anon can read community_statements', has_table_privilege('anon', 'public.community_statements', 'select'));
  perform pg_temp.check('RLS on, with a read policy only',
    (select relrowsecurity from pg_class where oid = 'public.community_statements'::regclass)
    and not exists (select 1 from pg_policies where tablename = 'community_statements' and cmd <> 'SELECT'));
  perform pg_temp.check('apply_page_revision still service-only',
    not has_function_privilege('anon', 'public.apply_page_revision(bigint, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.apply_page_revision(bigint, uuid)', 'execute'));
  perform pg_temp.check('a line needs a citation (table check)',
    pg_temp.err(format('insert into community_statements (subject_pcid, block_name, predicate, object_text, effect, citations, position, revision_id) values (%s, %L, %L, %L, %L, %L, 1, %s)',
      AMI, 'interactions', 'interacts_with', 'x', 'y', '{}', r4)) like '%citations%');
end $t$;

select (case when ok then 'PASS ' else 'FAIL ' end) || name || coalesce(' — ' || detail, '') as result
from pg_temp.results order by n;

-- Writing as a signed-in person is refused by RLS.
set role authenticated;
select case when msg like '%row-level security%' then 'PASS ' else 'FAIL ' end || 'insert as authenticated refused — ' || msg as result
from (select pg_temp.err(
  'insert into community_statements (subject_pcid, block_name, predicate, object_text, effect, citations, position, revision_id) select 1000500, ''interactions'', ''interacts_with'', ''x'', ''y'', ''{pmid:1}'', 1, max(id) from page_revisions') as msg) m;
reset role;
