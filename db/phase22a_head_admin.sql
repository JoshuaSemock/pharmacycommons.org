-- Phase 22a — Head administrator ("owner") role
-- Destination: db/phase22a_head_admin.sql
-- Applied as two migrations (constraint drop and add are kept separate): 22a_1 = part 1, 22a_2 = parts 2-6.
-- The owner (joshua.semock.pharmd@gmail.com) holds every admin power plus:
--   * may patrol / review their OWN edits (everyone else still needs a second reviewer);
--   * is the only account that can grant or revoke the admin role;
--   * cannot be blocked, and the owner role cannot be granted or revoked through the API (SQL editor only).

-- ── 1. (22a_1) allow the new role value ─────────────────────────────────────
alter table public.user_roles drop constraint if exists user_roles_role_check;

-- ── 2. (22a_2) role check, has_role, grants ─────────────────────────────────
alter table public.user_roles add constraint user_roles_role_check check (role in ('patroller', 'admin', 'owner'));

-- owner implies admin implies patroller; has_role('owner') matches only the owner.
create or replace function public.has_role(p_role text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles
    where user_id = auth.uid()
      and (role = p_role or (p_role <> 'owner' and role in ('admin', 'owner')))
  )
$$;

create or replace function public.grant_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
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

create or replace function public.revoke_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
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

create or replace function public.block_contributor(p_user_id uuid, p_reason text, p_expires_at timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
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

-- ── 3. the owner may review their own edits ─────────────────────────────────
create or replace function public.patrol_revision(p_revision_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role('patroller') then raise exception 'not_patroller' using errcode = '42501'; end if;
  update page_revisions
  set patrol_status = 'patrolled', patrolled_by = auth.uid(), patrolled_at = now()
  where id = p_revision_id and patrol_status = 'unpatrolled'
    and (created_by is distinct from auth.uid() or has_role('owner'));
  if not found then raise exception 'cannot_patrol'; end if;
end $$;

create or replace function public.patrol_infobox_edit(p_edit_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role('patroller') then raise exception 'not_patroller' using errcode = '42501'; end if;
  update infobox_edits
  set patrol_status = 'patrolled', patrolled_by = auth.uid(), patrolled_at = now()
  where id = p_edit_id and patrol_status = 'unpatrolled'
    and (created_by is distinct from auth.uid() or has_role('owner'));
  if not found then raise exception 'cannot_patrol'; end if;
end $$;

create or replace function public.patrol_new_page(p_pcid bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role('patroller') then raise exception 'not_patroller' using errcode = '42501'; end if;
  update community_pages
  set patrol_status = 'patrolled', patrolled_by = auth.uid(), patrolled_at = now()
  where pcid = p_pcid and patrol_status = 'unpatrolled'
    and (created_by is distinct from auth.uid() or has_role('owner'));
  if not found then raise exception 'cannot_patrol'; end if;
end $$;

create or replace function public.patrol_brand_edit(p_edit_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role('patroller') then raise exception 'not_patroller' using errcode = '42501'; end if;
  update brand_edits
  set patrol_status = 'patrolled', patrolled_by = auth.uid(), patrolled_at = now()
  where id = p_edit_id and patrol_status = 'unpatrolled'
    and (created_by is distinct from auth.uid() or has_role('owner'));
  if not found then raise exception 'cannot_patrol'; end if;
end $$;

-- ── 4. seed: Joshua is the owner (keeps his existing admin row) ─────────────
insert into public.user_roles (user_id, role)
select id, 'owner' from auth.users where email = 'joshua.semock.pharmd@gmail.com'
on conflict do nothing;
