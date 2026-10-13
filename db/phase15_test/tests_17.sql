-- Phase 17 (blog comments) behaviour tests.
-- Run on a fresh local Postgres 16 after: stubs.sql → phase15_community_editing.sql →
-- phase17_blog_comments.sql. Uses only the stub users:
--   J = Joshua (verified, admin ⇒ patroller), A = Alice (verified), B = Bob (registered, not verified).
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

insert into auth.users values ('cccccccc-0000-0000-0000-000000000003', 'carol');
insert into public.user_roles (user_id, role) values ('8464cf01-f9ea-4053-880c-9424f971a192', 'admin')
  on conflict do nothing;

do $t$
declare
  J uuid := '8464cf01-f9ea-4053-880c-9424f971a192';
  A uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  B uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  C uuid := 'cccccccc-0000-0000-0000-000000000003';
  c1 bigint; r1 bigint; rj bigint; n int; i int;
begin
  -- signed out
  perform pg_temp.as_user(null);
  perform pg_temp.check('signed-out cannot comment',
    pg_temp.err('select post_blog_comment(''build-log'', ''hi'')') = 'not_signed_in');

  -- Bob: registered, unverified — needs a handle first, then can comment
  perform pg_temp.as_user(B);
  perform pg_temp.check('handle required before first comment',
    pg_temp.err('select post_blog_comment(''build-log'', ''hi'')') = 'handle_required');
  perform pg_temp.check('unverified cannot use the verified-only handle RPC',
    pg_temp.err('select set_contributor_handle(''bob'')') = 'not_verified');
  perform set_public_handle('  bob_rph ');
  perform pg_temp.check('unverified can set a public handle', my_public_handle() = 'bob_rph');
  perform pg_temp.check('bad handle rejected by the table check',
    pg_temp.err('select set_public_handle(''x'')') like '%contributor_profiles_handle_check%');
  perform pg_temp.check('empty comment rejected',
    pg_temp.err('select post_blog_comment(''build-log'', ''   '')') = 'empty');
  perform pg_temp.check('over-long comment rejected',
    pg_temp.err(format('select post_blog_comment(''build-log'', %L)', repeat('x', 4001))) = 'too_long');
  perform pg_temp.check('malformed slug rejected',
    pg_temp.err('select post_blog_comment(''../etc'', ''hi'')') = 'no_such_post');
  c1 := post_blog_comment('build-log', '  First!  ');
  perform pg_temp.check('comment is live, trimmed, unpatrolled',
    (select state = 'visible' and body = 'First!' and patrolled_at is null from blog_comments where id = c1));

  -- Alice (verified, not patroller) replies; her badge shows
  perform pg_temp.as_user(A);
  perform set_contributor_handle('alice_md');
  r1 := post_blog_comment('build-log', 'Reply', c1);
  perform pg_temp.check('reply to another post rejected',
    pg_temp.err(format('select post_blog_comment(''other-post'', ''x'', %s)', c1)) = 'no_such_comment');
  perform pg_temp.check('reply to a reply rejected',
    pg_temp.err(format('select post_blog_comment(''build-log'', ''x'', %s)', r1)) = 'reply_depth');
  perform pg_temp.check('cannot edit someone else''s comment',
    pg_temp.err(format('select edit_blog_comment(%s, ''hacked'')', c1)) = 'no_such_comment');
  perform pg_temp.check('cannot delete someone else''s comment',
    pg_temp.err(format('select delete_blog_comment(%s)', c1)) = 'no_such_comment');
  perform pg_temp.check('non-patroller cannot moderate',
    pg_temp.err(format('select moderate_blog_comment(%s, ''hide'', ''spam'')', c1)) = 'not_patroller');

  -- public read
  perform pg_temp.as_user(null);
  perform pg_temp.check('anon reads both comments in order',
    (select array_agg(id order by created_at, id) from blog_comments('build-log')) = array[c1, r1]);
  perform pg_temp.check('handles + badge, no badge for unverified',
    (select handle = 'bob_rph' and credential is null from blog_comments('build-log') where id = c1)
    and (select handle = 'alice_md' and credential is not null from blog_comments('build-log') where id = r1));
  perform pg_temp.check('is_mine false for anon',
    not exists (select 1 from blog_comments('build-log') where is_mine));
  perform pg_temp.check('queue lists both unpatrolled comments',
    (select count(*) from blog_comment_queue()) = 2);

  -- Bob edits, then is_mine
  perform pg_temp.as_user(B);
  perform edit_blog_comment(c1, 'First, edited');
  perform pg_temp.check('author edit sets edited_at',
    (select body = 'First, edited' and edited_at is not null from blog_comments where id = c1));
  perform pg_temp.check('is_mine true for author only',
    (select is_mine from blog_comments('build-log') where id = c1)
    and not (select is_mine from blog_comments('build-log') where id = r1));

  -- Joshua (patroller): own comments start reviewed; moderation
  perform pg_temp.as_user(J);
  perform set_contributor_handle('joshua');
  rj := post_blog_comment('build-log', 'Thanks all');
  perform pg_temp.check('patroller comment starts reviewed',
    (select patrolled_at is not null from blog_comments where id = rj));
  perform pg_temp.check('hide needs a note',
    pg_temp.err(format('select moderate_blog_comment(%s, ''hide'', '' '')', c1)) = 'note_required');
  perform moderate_blog_comment(r1, 'patrol');
  perform pg_temp.check('patrol clears the queue entry',
    not exists (select 1 from blog_comment_queue() where id = r1));
  perform moderate_blog_comment(c1, 'hide', 'Off topic');
  perform pg_temp.check('hidden parent with live reply shows as a textless placeholder',
    (select state = 'hidden' and body is null and handle is null from blog_comments('build-log') where id = c1));
  perform pg_temp.check('hidden comment leaves the queue',
    not exists (select 1 from blog_comment_queue() where id = c1));

  perform pg_temp.as_user(A);
  perform pg_temp.check('cannot reply to a hidden comment',
    pg_temp.err(format('select post_blog_comment(''build-log'', ''x'', %s)', c1)) = 'no_such_comment');
  perform delete_blog_comment(r1);
  perform pg_temp.check('author delete erases text',
    (select state = 'deleted' and body = '' from blog_comments where id = r1));
  perform pg_temp.check('hidden parent with no live replies disappears; deleted reply disappears',
    not exists (select 1 from blog_comments('build-log') where id in (c1, r1)));

  perform pg_temp.as_user(J);
  perform moderate_blog_comment(c1, 'restore', null);
  perform pg_temp.check('restore brings a hidden comment back',
    (select state = 'visible' and body = 'First, edited' from blog_comments('build-log') where id = c1));

  -- Bob edits after review: back in the queue
  perform pg_temp.as_user(B);
  perform edit_blog_comment(c1, 'First, edited again');
  perform pg_temp.check('edit after review re-enters the queue',
    exists (select 1 from blog_comment_queue() where id = c1));

  -- rate limit: Bob has 1 comment in the last 10 minutes; 4 more are fine, the 6th is refused
  for i in 1..4 loop perform post_blog_comment('build-log', 'spam ' || i); end loop;
  perform pg_temp.check('rate limit after 5 in 10 minutes',
    pg_temp.err('select post_blog_comment(''build-log'', ''six'')') = 'rate_limited');

  -- blocked account
  perform pg_temp.as_user(C);
  insert into contributor_blocks (user_id, reason) values (C, 'test');
  perform pg_temp.check('blocked account cannot set a handle',
    pg_temp.err('select set_public_handle(''carol'')') = 'blocked');

  -- account deletion (FK on delete set null) keeps the comment as "former member"
  perform pg_temp.as_user(null);
  delete from contributor_profiles where user_id = B;
  update blog_comments set author_id = null where author_id = B;
  perform pg_temp.check('comment without an author shows as former member, no badge',
    (select handle = 'former member' and credential is null and not is_mine
     from blog_comments('build-log') where id = c1));
end $t$;

-- Grants: anon can read, cannot write
set role anon;
select pg_temp.check('anon cannot call post_blog_comment',
  pg_temp.err('select post_blog_comment(''build-log'', ''x'')') like 'permission denied%');
select pg_temp.check('anon cannot read blog_comments table',
  pg_temp.err('select 1 from public.blog_comments limit 1') like 'permission denied%');
select pg_temp.check('anon can read via blog_comments()',
  pg_temp.err('select * from public.blog_comments(''build-log'')') = 'NO ERROR');
reset role;

select n, ok, name, detail from pg_temp.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from pg_temp.results;
