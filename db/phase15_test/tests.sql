-- Phase 15 behaviour tests. Run after stubs.sql + the migration.
-- Each check prints PASS/FAIL; any FAIL means the migration needs work.
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false)
$$;
create table pg_temp.results (n serial, name text, ok boolean, detail text);
grant all on pg_temp.results to authenticated;
grant all on sequence pg_temp.results_n_seq to authenticated;
create or replace function pg_temp.check(p_name text, p_ok boolean, p_detail text default null) returns void
language sql as $$ insert into pg_temp.results (name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;
create or replace function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'NO ERROR'; exception when others then return sqlerrm; end $$;

do $t$
declare
  J uuid := '8464cf01-f9ea-4053-880c-9424f971a192';
  A uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  B uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  r1 bigint; r2 bigint; r3 bigint; rp bigint; rp2 bigint; pg jsonb; v text; n int; e bigint;
begin
  -- seed results
  perform pg_temp.check('seed: Joshua is admin', exists(select 1 from user_roles where user_id = J and role = 'admin'));
  perform pg_temp.check('seed: warfarin + its salt form reviewed',
    (select count(*) from page_content where pcid in (1002962, 3000900) and protection = 'reviewed') = 2);
  perform pg_temp.check('seed: insulin glargine reviewed, IGF-II not',
    (select protection from page_content where pcid = 1001687) = 'reviewed'
    and not exists (select 1 from page_content where pcid = 1009727));

  -- gates
  perform pg_temp.as_user(B);
  perform pg_temp.check('unverified user cannot save',
    pg_temp.err('select save_page(1001900, null, ''x'', ''y'', ''s'')') = 'not_verified');
  perform pg_temp.as_user(A);
  perform pg_temp.check('handle required before first save',
    pg_temp.err('select save_page(1001900, null, ''x'', ''y'', ''s'')') = 'handle_required');
  perform set_contributor_handle('alice_md');
  perform pg_temp.as_user(J);
  perform set_contributor_handle('jsemock_rx');

  -- open page: live at once, links + refs
  perform pg_temp.as_user(A);
  r1 := save_page(1001900, null, 'Biguanide for type 2 diabetes.',
    E'## Use\nSee [[Hypertension|high BP]], [[PCID-1000001]], [[amitriptyline]] and [[No Such Page]].\n'
    'ACB here {{acb_score}}, amitriptyline {{ACB_score:amitriptyline}}, junk {{bogus}}.', 'first draft');
  perform pg_temp.check('open page: save is live',
    (select current_revision_id from page_content where pcid = 1001900) = r1);
  perform pg_temp.check('open page: revision unpatrolled',
    (select patrol_status from page_revisions where id = r1) = 'unpatrolled');
  select string_agg(target_text || '=' || coalesce(target_pcid::text, 'RED'), ' ' order by target_text) into v
    from page_links where source_pcid = 1001900;
  perform pg_temp.check('links resolved (name, PCID, slug) + red link',
    v = 'amitriptyline=1000500 hypertension=6000003 no such page=RED pcid-1000001=1000001', v);
  select string_agg(property_key || ':' || target_text || '=' || coalesce(target_pcid::text, 'null'), ' ' order by target_text) into v
    from page_property_refs where source_pcid = 1001900;
  perform pg_temp.check('property refs stored, unknown key ignored',
    v = 'acb_score:=1001900 acb_score:amitriptyline=1000500', v);

  -- conflict
  perform pg_temp.check('stale base revision -> edit_conflict',
    pg_temp.err('select save_page(1001900, null, ''a'', ''b'', ''stale'')') = 'edit_conflict');

  -- vandalism + revert
  r2 := save_page(1001900, r1, 'x', 'vandalism', 'oops');
  r3 := revert_page(1001900, r1);
  perform pg_temp.check('revert restores text',
    (select body_md from page_content where pcid = 1001900) like '## Use%');
  perform pg_temp.check('revert marks undone revision',
    (select patrol_status from page_revisions where id = r2) = 'reverted');

  -- patrol
  perform pg_temp.check('non-patroller cannot patrol',
    pg_temp.err(format('select patrol_revision(%s)', r3)) = 'not_patroller');
  perform pg_temp.as_user(J);
  perform patrol_revision(r3);
  perform pg_temp.check('patroller patrols another user''s edit',
    (select patrol_status from page_revisions where id = r3) = 'patrolled');

  -- reviewed page: Alice's edit is held
  perform pg_temp.as_user(A);
  rp := save_page(1002962, null, 'Vitamin K antagonist.', 'INR 2-3 for most indications.', 'add overview');
  perform pg_temp.check('reviewed page: edit held as pending',
    (select patrol_status from page_revisions where id = rp) = 'pending'
    and (select current_revision_id from page_content where pcid = 1002962) is null);
  perform pg_temp.check('reviewed page: pending text not live',
    (select body_md from page_content where pcid = 1002962) = '');
  rp2 := save_page(1002962, null, 'Coumarin.', 'second proposal', 'alt overview');
  perform pg_temp.check('author cannot accept own pending',
    pg_temp.err(format('select accept_revision(%s)', rp)) = 'not_patroller');

  perform pg_temp.as_user(J);
  perform accept_revision(rp, 'checked against label');
  perform pg_temp.check('accept makes it live',
    (select current_revision_id from page_content where pcid = 1002962) = rp);
  perform pg_temp.check('second proposal now stale',
    pg_temp.err(format('select accept_revision(%s)', rp2)) = 'stale_revision');
  perform pg_temp.check('reject requires a note',
    pg_temp.err(format('select reject_revision(%s, '''')', rp2)) = 'note_required');
  perform reject_revision(rp2, 'superseded');
  perform pg_temp.check('rejected', (select patrol_status from page_revisions where id = rp2) = 'rejected');

  -- patroller edit on reviewed page is live
  r1 := save_page(1002962, rp, 'Vitamin K antagonist.', 'INR 2-3; 2.5-3.5 mechanical mitral.', 'refine');
  perform pg_temp.check('patroller edit on reviewed page is live + autopatrolled',
    (select current_revision_id from page_content where pcid = 1002962) = r1
    and (select patrol_status from page_revisions where id = r1) = 'patrolled');

  -- infobox: values and transclusion
  perform pg_temp.check('list value resolves (ACB amitriptyline = 3)',
    resolve_property('acb_score', 1000500) ->> 'value' = '3', resolve_property('acb_score', 1000500)::text);
  perform pg_temp.check('rank resolves (most used metformin = 4)',
    resolve_property('most_used', 1001900) ->> 'value' = '4');
  perform pg_temp.check('attribute resolves (legal status)',
    resolve_property('legal_status', 1001900) ->> 'value' = 'Rx; Legend', resolve_property('legal_status', 1001900)::text);
  perform pg_temp.check('label property defers to client',
    resolve_property('dosing', 1001900) ->> 'resolve' = 'client');

  perform pg_temp.as_user(A);
  perform edit_infobox(1001900, 'ACB_SCORE', '0', 'Boustani 2008 ACB scale', 'not on scale');
  perform pg_temp.check('community value overrides source, keeps citation',
    resolve_property('acb_score', 1001900) ->> 'origin' = 'community'
    and resolve_property('acb_score', 1001900) ->> 'citation' = 'Boustani 2008 ACB scale');
  perform pg_temp.check('citation required',
    pg_temp.err('select edit_infobox(1001900, ''acb_score'', ''1'', '''', ''x'')') like '%infobox_edits_citation_check%');
  e := edit_infobox(1002962, 'qtc_risk', 'Low', 'CredibleMeds', 'add');
  perform pg_temp.check('infobox edit on reviewed page held',
    (select patrol_status from infobox_edits where id = e) = 'pending'
    and (resolve_property('qtc_risk', 1002962) ->> 'origin') = 'list');
  perform pg_temp.as_user(J);
  perform review_infobox_edit(e, true, 'ok');
  perform pg_temp.check('accepted infobox edit is current',
    resolve_property('qtc_risk', 1002962) ->> 'value' = 'Low');

  -- new pages
  perform pg_temp.as_user(A);
  perform pg_temp.check('duplicate by name blocked',
    pg_temp.err('select create_page(''moiety'', ''METFORMIN'', ''dup'')') = 'page_exists');
  perform pg_temp.check('duplicate by UNII blocked',
    pg_temp.err('select create_page(''moiety'', ''Metformin HCl new'', ''dup'', '''', '''', null, ''{"unii":"9100l32l2n"}'')') = 'identifier_exists');
  perform pg_temp.check('class pages not creatable',
    pg_temp.err('select create_page(''class'', ''Biguanides 2'', ''x'')') = 'kind_not_creatable');
  pg := create_page('clinical', 'Diabetic Ketoacidosis', 'new page', 'Acute complication.',
                    'Rarely with [[metformin]].', 'Adverse Reaction');
  perform pg_temp.check('clinical page minted from block 6 next_pcid',
    (pg ->> 'pcid')::bigint = 6000077 and (select next_pcid from pcid_blocks where block_id = 6) = 6000078, pg::text);
  perform pg_temp.check('new page satellite + concept_type',
    (select concept_type from clinical_concepts where pcid = 6000077) = 'Adverse Reaction');
  perform pg_temp.check('new page backlink to metformin',
    exists (select 1 from page_links where source_pcid = 6000077 and target_pcid = 1001900));
  perform pg_temp.check('new page listed unpatrolled',
    (select patrol_status from community_pages where pcid = 6000077) = 'unpatrolled');

  -- history + badges
  perform pg_temp.check('history shows handle + credential badge (taxonomy fallback)',
    exists (select 1 from page_history(1002962) where handle = 'jsemock_rx' and credential = 'Pharmacist'));
  update provider_verifications set credential = 'PharmD, BCPS' where user_id = J;
  perform pg_temp.check('credential badge normalised (PharmD, BCPS -> PharmD)',
    exists (select 1 from page_history(1002962) where handle = 'jsemock_rx' and credential = 'PharmD'));
  perform pg_temp.as_user(J);
  perform set_contributor_handle('jsemock_rx', false);
  perform pg_temp.check('display_credential=false hides badge',
    not exists (select 1 from page_history(1002962) where handle = 'jsemock_rx' and credential is not null));

  -- admin
  perform pg_temp.as_user(A);
  perform pg_temp.check('non-admin cannot grant roles',
    pg_temp.err(format('select grant_role(%L, ''patroller'')', A)) = 'not_admin');
  perform pg_temp.as_user(J);
  perform pg_temp.check('cannot grant role to unverified user',
    pg_temp.err(format('select grant_role(%L, ''patroller'')', B)) = 'not_verified');
  perform grant_role(A, 'patroller');
  perform pg_temp.as_user(A);
  perform pg_temp.check('granted patroller recognised', has_role('patroller'));
  perform pg_temp.as_user(J);
  perform block_contributor(A, 'test');
  perform pg_temp.as_user(A);
  perform pg_temp.check('blocked contributor cannot save',
    pg_temp.err('select save_page(1001900, null, ''x'', ''y'', ''s'')') = 'not_verified');
end $t$;

-- direct table writes must be impossible for API roles
set role authenticated;
select pg_temp.check('authenticated cannot insert page_content directly',
  pg_temp.err('insert into page_content (pcid) values (1000500)') ~ '(permission denied|row-level security)');
select pg_temp.check('authenticated cannot read revision authors',
  pg_temp.err('select created_by from page_revisions limit 1') like 'permission denied%');
reset role;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from pg_temp.results;
