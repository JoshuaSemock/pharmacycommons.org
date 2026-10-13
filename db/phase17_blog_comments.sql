-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 17 — blog comments (2026-10-12)
--
-- Decisions (Joshua, 2026-10-12):
--   * Any signed-in account may comment (not only NPI-verified contributors).
--     Commenters need a public @handle; verified providers also show their
--     credential badge, exactly as in page history.
--   * Publish, then patrol: comments show at once; patrollers mark them
--     reviewed or hide them from /review. Comments by patrollers start reviewed.
--   * One level of replies: a reply must answer a top-level comment.
--
-- Blog posts are markdown files in the repo (src/content/posts), not database
-- rows, so comments are keyed by the post slug. The client only offers the
-- form on a real post; a comment written straight to the RPC for a slug that
-- has no post is never shown anywhere except the review queue.
--
-- Writes go only through the SECURITY DEFINER RPCs below; the table has RLS on
-- and no policies or grants, so author ids are never readable. Public reads go
-- through blog_comments(), which returns @handle + badge, never the uuid.
--
-- On account deletion author_id is set null and the comment stays, shown as
-- "former member" (privacy policy: contributions are kept but disassociated).
--
-- Apply as two migrations: 17a (table), 17b (functions + grants).
-- Behaviour tests: db/phase15_test/tests_17.sql (run after stubs → phase15).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 17a. Table ─────────────────────────────────────────────────────────────
create table public.blog_comments (
  id              bigint generated always as identity primary key,
  post_slug       text not null check (post_slug ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  parent_id       bigint references public.blog_comments (id),
  author_id       uuid references auth.users (id) on delete set null,
  body            text not null,
  state           text not null default 'visible' check (state in ('visible', 'hidden', 'deleted')),
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,
  patrolled_by    uuid references auth.users (id) on delete set null,
  patrolled_at    timestamptz,
  moderated_by    uuid references auth.users (id) on delete set null,
  moderated_at    timestamptz,
  moderation_note text,
  -- Deleted comments keep no text; live and hidden ones need 1–4,000 characters.
  constraint blog_comments_body_len check (
    (state = 'deleted' and body = '') or (state <> 'deleted' and length(body) between 1 and 4000))
);
alter table public.blog_comments enable row level security;
revoke all on public.blog_comments from public, anon, authenticated;

create index blog_comments_post_idx on public.blog_comments (post_slug, created_at);
create index blog_comments_parent_idx on public.blog_comments (parent_id) where parent_id is not null;
create index blog_comments_author_idx on public.blog_comments (author_id, created_at);
create index blog_comments_unpatrolled_idx on public.blog_comments (created_at)
  where state = 'visible' and patrolled_at is null;

-- ── 17b. Functions ─────────────────────────────────────────────────────────

-- True when the caller has an active contributor block.
create or replace function public.pc_is_blocked()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from contributor_blocks
                 where user_id = auth.uid() and (expires_at is null or expires_at > now()))
$$;

-- Public handle for any signed-in, unblocked account. set_contributor_handle()
-- stays verified-only (it also sets the badge preference); this one leaves an
-- existing display_credential untouched.
create or replace function public.set_public_handle(p_handle text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if pc_is_blocked() then raise exception 'blocked' using errcode = '42501'; end if;
  insert into contributor_profiles (user_id, handle)
  values (auth.uid(), trim(p_handle))
  on conflict (user_id) do update set handle = excluded.handle;
end $$;

-- The caller's own handle (null when none yet). Lets the comment form decide
-- whether to ask for one without a direct table read.
create or replace function public.my_public_handle()
returns text language sql stable security definer set search_path = public as $$
  select handle from contributor_profiles where user_id = auth.uid()
$$;

-- Comments on one post, oldest first. Hidden and deleted comments appear only
-- as placeholders (no text, no author) and only when they have live replies,
-- so a thread keeps its shape.
create or replace function public.blog_comments(p_slug text)
returns table (id bigint, parent_id bigint, handle text, credential text, body text, state text,
               created_at timestamptz, edited_at timestamptz, is_mine boolean)
language sql stable security definer set search_path = public as $$
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

create or replace function public.post_blog_comment(p_slug text, p_body text, p_parent_id bigint default null)
returns bigint language plpgsql security definer set search_path = public as $$
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
end $$;

-- Author edits their own live comment. A changed comment goes back to the
-- review queue unless the author is a patroller.
create or replace function public.edit_blog_comment(p_id bigint, p_body text)
returns void language plpgsql security definer set search_path = public as $$
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

-- Author deletes their own comment: the text is erased, not kept.
create or replace function public.delete_blog_comment(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  update blog_comments set state = 'deleted', body = '', edited_at = now()
   where id = p_id and author_id = auth.uid() and state <> 'deleted';
  if not found then raise exception 'no_such_comment'; end if;
end $$;

-- Patrollers: 'patrol' (mark reviewed), 'hide' (needs a note), 'restore'.
create or replace function public.moderate_blog_comment(p_id bigint, p_action text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
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

-- Live comments nobody has reviewed yet, newest first. Public, like the rest of
-- /review: everything it returns is already on the site.
create or replace function public.blog_comment_queue(p_limit integer default 100)
returns table (id bigint, post_slug text, parent_id bigint, handle text, credential text, body text,
               created_at timestamptz, edited_at timestamptz)
language sql stable security definer set search_path = public as $$
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

-- ── Execute grants ─────────────────────────────────────────────────────────
revoke execute on function
  public.pc_is_blocked(), public.set_public_handle(text), public.my_public_handle(),
  public.blog_comments(text), public.post_blog_comment(text, text, bigint),
  public.edit_blog_comment(bigint, text), public.delete_blog_comment(bigint),
  public.moderate_blog_comment(bigint, text, text), public.blog_comment_queue(integer)
from public, anon, authenticated;

grant execute on function public.blog_comments(text), public.blog_comment_queue(integer)
to anon, authenticated;

grant execute on function
  public.set_public_handle(text), public.my_public_handle(),
  public.post_blog_comment(text, text, bigint), public.edit_blog_comment(bigint, text),
  public.delete_blog_comment(bigint), public.moderate_blog_comment(bigint, text, text)
to authenticated;
