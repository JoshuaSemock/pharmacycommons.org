-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 15g — "My contributions", new-page patrol, admin tools
-- Destination: db/phase15g_contributions_admin.sql
--
-- 1. my_contributions(): the signed-in contributor's own page edits, Quick
--    Facts values and created pages, with status and any reviewer note. Author
--    ids are withheld from the tables by column grants, so this is the only way
--    a contributor can list their own work.
-- 2. New pages are recorded in community_pages as 'unpatrolled' (phase 15) but
--    nothing could mark them checked. new_pages_queue() lists them with
--    "@handle · badge" (never author ids) and patrol_new_page() marks one.
-- 3. Admin: admin_contributors() finds contributors by handle with roles,
--    verification and block state; unblock_contributor() lifts a block
--    (phase 15 had block_contributor() only). Protection levels are read
--    straight from page_content (public) and set with set_page_protection().
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. My contributions ────────────────────────────────────────────────────
create or replace function public.my_contributions(p_limit integer default 200)
returns table (kind text, item_id bigint, pcid bigint, slug text, name text, entity_type text,
               property_key text, summary text, created_at timestamptz, patrol_status text,
               review_note text, is_live boolean)
language sql stable security definer set search_path = public as $$
  select * from (
    select 'page'::text, r.id, r.pcid, e.slug, e.name, e.entity_type, null::text, r.summary, r.created_at,
           r.patrol_status, r.review_note, coalesce(pc.current_revision_id = r.id, false)
    from page_revisions r
    join entities e on e.pcid = r.pcid
    left join page_content pc on pc.pcid = r.pcid
    where r.created_by = auth.uid() and r.kind <> 'create'
    union all
    select 'fact', i.id, i.pcid, e.slug, e.name, e.entity_type, i.property_key, i.summary, i.created_at,
           i.patrol_status, i.review_note, i.is_current
    from infobox_edits i
    join entities e on e.pcid = i.pcid
    where i.created_by = auth.uid()
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

-- ── 2. New pages: queue and patrol ─────────────────────────────────────────
create or replace function public.new_pages_queue(p_limit integer default 100, p_unpatrolled_only boolean default true)
returns table (pcid bigint, slug text, name text, entity_type text, created_at timestamptz,
               patrol_status text, handle text, credential text)
language sql stable security definer set search_path = public as $$
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

create or replace function public.patrol_new_page(p_pcid bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role('patroller') then raise exception 'not_patroller' using errcode = '42501'; end if;
  update community_pages
  set patrol_status = 'patrolled', patrolled_by = auth.uid(), patrolled_at = now()
  where pcid = p_pcid and patrol_status = 'unpatrolled' and created_by is distinct from auth.uid();
  if not found then raise exception 'cannot_patrol'; end if;
end $$;

-- ── 3. Admin ───────────────────────────────────────────────────────────────
-- Contributors (anyone with a handle) matching a handle fragment, newest
-- activity first. Admin only. Returns the user id (needed by grant_role,
-- revoke_role and block_contributor) but never the NPI, email or legal name.
create or replace function public.admin_contributors(p_query text default null, p_limit integer default 50)
returns table (user_id uuid, handle text, credential text, verified boolean, roles text[],
               blocked boolean, block_reason text, block_expires_at timestamptz,
               edits bigint, last_edit_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_role('admin') then raise exception 'not_admin' using errcode = '42501'; end if;
  return query
  with activity as (
    select created_by as uid, created_at from page_revisions where created_by is not null
    union all select created_by, created_at from infobox_edits where created_by is not null
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

create or replace function public.unblock_contributor(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role('admin') then raise exception 'not_admin' using errcode = '42501'; end if;
  delete from contributor_blocks where user_id = p_user_id;
end $$;

-- ── Grants ─────────────────────────────────────────────────────────────────
revoke execute on function
  public.my_contributions(integer), public.patrol_new_page(bigint),
  public.admin_contributors(text, integer), public.unblock_contributor(uuid)
from public, anon;
grant execute on function
  public.my_contributions(integer), public.patrol_new_page(bigint),
  public.admin_contributors(text, integer), public.unblock_contributor(uuid)
to authenticated;
grant execute on function public.new_pages_queue(integer, boolean) to anon, authenticated;
