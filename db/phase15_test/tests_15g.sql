-- Phase 15g behaviour tests. Run after tests.sql (it reuses that run's state:
-- Alice created page 6000077 and edits on metformin, was made patroller, then blocked).
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
  v text; n int;
begin
  -- my contributions
  perform pg_temp.as_user(A);
  select string_agg(distinct kind, ',' order by kind) into v from my_contributions();
  perform pg_temp.check('my_contributions lists page edits, facts and new pages', v = 'fact,new_page,page', v);
  perform pg_temp.check('my_contributions only returns own work',
    not exists (select 1 from my_contributions() c join page_revisions r on r.id = c.item_id and c.kind = 'page'
                where r.created_by is distinct from A));
  perform pg_temp.check('my_contributions marks the live revision',
    exists (select 1 from my_contributions() c join page_content pc on pc.current_revision_id = c.item_id
            where c.kind = 'page' and c.is_live));
  perform pg_temp.check('created page listed once (no duplicate create revision)',
    (select count(*) from my_contributions() where pcid = 6000077) = 1);
  perform pg_temp.as_user(null);
  perform pg_temp.check('signed out: my_contributions empty', not exists (select 1 from my_contributions()));

  -- new pages queue + patrol
  perform pg_temp.check('new_pages_queue shows handle, not id',
    exists (select 1 from new_pages_queue() where pcid = 6000077 and handle = 'alice_md'));
  perform pg_temp.as_user(B);
  perform pg_temp.check('non-patroller cannot patrol a new page',
    pg_temp.err('select patrol_new_page(6000077)') = 'not_patroller');
  perform pg_temp.as_user(J);
  perform patrol_new_page(6000077);
  perform pg_temp.check('patroller marks a new page reviewed',
    (select patrol_status from community_pages where pcid = 6000077) = 'patrolled');
  perform pg_temp.check('patrolled page leaves the queue',
    not exists (select 1 from new_pages_queue() where pcid = 6000077));
  perform pg_temp.check('cannot patrol twice', pg_temp.err('select patrol_new_page(6000077)') = 'cannot_patrol');

  -- admin
  perform pg_temp.as_user(A);
  perform pg_temp.check('non-admin cannot list contributors',
    pg_temp.err('select * from admin_contributors()') = 'not_admin');
  perform pg_temp.as_user(J);
  select count(*) into n from admin_contributors('ALICE');
  perform pg_temp.check('admin finds contributor by handle fragment', n = 1);
  perform pg_temp.check('admin sees roles, block and activity',
    exists (select 1 from admin_contributors('alice') where roles = '{patroller}' and blocked and block_reason = 'test'
            and verified and edits >= 3 and last_edit_at is not null));
  perform unblock_contributor(A);
  perform pg_temp.as_user(A);
  perform pg_temp.check('unblocked contributor can edit again', is_verified_contributor());
  perform pg_temp.check('non-admin cannot unblock',
    pg_temp.err(format('select unblock_contributor(%L)', A)) = 'not_admin');
end $t$;

set role anon;
select pg_temp.check('anon cannot call my_contributions',
  pg_temp.err('select * from my_contributions()') like 'permission denied%');
select pg_temp.check('anon can read new_pages_queue',
  pg_temp.err('select * from new_pages_queue()') = 'NO ERROR');
reset role;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from pg_temp.results;
