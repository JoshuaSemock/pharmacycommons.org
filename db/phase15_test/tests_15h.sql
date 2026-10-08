-- Phase 15h behaviour tests. Run after tests.sql, phase15g, tests_15g.sql and phase15h.
-- State from earlier runs: Alice (A) is a verified patroller (block lifted in 15g tests);
-- metformin 1001900 is open, warfarin 1002962 is 'reviewed'.
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false)
$$;
create table pg_temp.results (n serial, name text, ok boolean, detail text);
grant all on pg_temp.results to anon, authenticated;
grant all on sequence pg_temp.results_n_seq to anon, authenticated;
create or replace function pg_temp.check(p_name text, p_ok boolean, p_detail text default null) returns void
language sql as $$ insert into pg_temp.results (name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;
create or replace function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'NO ERROR'; exception when others then return sqlerrm; end $$;

do $t$
declare
  J uuid := '8464cf01-f9ea-4053-880c-9424f971a192';
  A uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  B uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  e1 bigint; e2 bigint; e3 bigint; ep bigint; v text;
begin
  -- make Alice an ordinary contributor again so publish-then-patrol applies
  perform pg_temp.as_user(J);
  perform revoke_role(A, 'patroller');

  perform pg_temp.as_user(B);
  perform pg_temp.check('unverified user cannot edit brands',
    pg_temp.err('select edit_brand(1001900, ''Glumetza'', ''add'', ''FDA'', ''s'')') = 'not_verified');

  perform pg_temp.as_user(A);
  perform pg_temp.check('brand change needs a source',
    pg_temp.err('select edit_brand(1001900, ''Glumetza'', ''add'', '' '', ''s'')') = 'citation_required');
  perform pg_temp.check('cannot add a brand the sources already list',
    pg_temp.err('select edit_brand(1001900, ''glucophage'', ''add'', ''FDA'', ''s'')') = 'already_listed');
  perform pg_temp.check('cannot hide a brand the sources do not list',
    pg_temp.err('select edit_brand(1001900, ''Nope'', ''hide'', ''FDA'', ''s'')') = 'not_a_source_brand');

  e1 := edit_brand(1001900, '  Glumetza  ', 'add', 'Drugs@FDA NDA021748', 'missing brand');
  perform pg_temp.check('add on an open page is live, unpatrolled, key normalised',
    (select is_current and patrol_status = 'unpatrolled' and brand_key = 'GLUMETZA' and brand_display = 'Glumetza'
     from brand_edits where id = e1));
  e2 := edit_brand(1001900, 'Fortamet', 'hide', 'Fortamet is an ER brand of a different product line', 'wrong page');
  perform pg_temp.check('hide on a source brand is live', (select is_current from brand_edits where id = e2));
  e3 := edit_brand(1001900, 'glumetza', 'clear', 'Duplicate of label', 'undo add');
  perform pg_temp.check('newer decision for the same brand replaces the older',
    (select not is_current from brand_edits where id = e1) and (select is_current from brand_edits where id = e3));

  -- reviewed page: held
  ep := edit_brand(1002962, 'Jantoven', 'add', 'DailyMed setid 0f6b…', 'generic brand');
  perform pg_temp.check('reviewed page: brand add held as pending',
    (select patrol_status = 'pending' and not is_current from brand_edits where id = ep));
  perform pg_temp.check('author cannot accept own pending brand edit',
    pg_temp.err(format('select review_brand_edit(%s, true)', ep)) = 'not_patroller');

  perform pg_temp.as_user(J);
  perform pg_temp.check('reject needs a note', pg_temp.err(format('select review_brand_edit(%s, false, '''')', ep)) = 'note_required');
  perform review_brand_edit(ep, true, 'checked DailyMed');
  perform pg_temp.check('accepted pending brand edit becomes current',
    (select is_current and patrol_status = 'patrolled' from brand_edits where id = ep));
  perform patrol_brand_edit(e2);
  perform pg_temp.check('reviewer marks a live brand edit reviewed',
    (select patrol_status from brand_edits where id = e2) = 'patrolled');

  -- history + contributions
  perform pg_temp.check('brand_history shows handle, queue lists unreviewed first',
    exists (select 1 from brand_history(1001900) where handle = 'alice_md')
    and (select count(*) from brand_history(null, true)) = 2);
  perform pg_temp.as_user(A);
  select string_agg(property_key, ',' order by item_id) into v from my_contributions() where kind = 'brand';
  perform pg_temp.check('my_contributions includes brand changes', v = 'add:Glumetza,hide:Fortamet,clear:glumetza,add:Jantoven', v);
  perform pg_temp.check('first Overview text on an existing page is listed (15g missed it)',
    exists (select 1 from my_contributions() c join page_revisions r on r.id = c.item_id
            where c.kind = 'page' and r.kind = 'create'));
  perform pg_temp.check('created page still listed once',
    (select count(*) from my_contributions() where pcid = 6000077) = 1);
  perform pg_temp.as_user(J);
  perform pg_temp.check('admin activity counts brand changes',
    (select edits from admin_contributors('alice')) >= 7);
end $t$;

set role authenticated;
select pg_temp.check('authenticated cannot write brand_edits directly',
  pg_temp.err('insert into brand_edits (pcid, brand_key, brand_display, action, citation, summary) values (1001900,''X'',''X'',''add'',''c'',''s'')') like 'permission denied%');
select pg_temp.check('authenticated cannot read brand edit authors',
  pg_temp.err('select created_by from brand_edits limit 1') like 'permission denied%');
reset role;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from pg_temp.results;
