-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 15h — community brand names
-- Destination: db/phase15h_brand_edits.sql   (run after phase 15g)
--
-- Brand names on a page come from entity_brand_names (Drugs@FDA + RxNorm +
-- the workbook), a derived matview that ingests rebuild. Contributors can now:
--   add   a brand the sources lack (an international brand, a missing line)
--   hide  a source brand that is wrong for this page (it stays visible as
--         "removed by contributors", with the reason, so the disagreement shows)
--   clear an earlier add/hide, returning to what the sources say.
-- Every change needs a source. Like infobox_edits, community values never
-- touch ingest tables, the latest decision per (page, brand) is current, and
-- 'reviewed' pages hold non-reviewer changes as pending.
--
-- Also redefines my_contributions() and admin_contributors() (phase 15g) to
-- count brand changes.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.brand_edits (
  id            bigint generated always as identity primary key,
  pcid          bigint not null references public.entities (pcid),
  brand_key     text not null check (brand_key = upper(brand_key) and length(brand_key) between 1 and 120),
  brand_display text not null check (length(trim(brand_display)) between 1 and 120),
  action        text not null check (action in ('add', 'hide', 'clear')),
  citation      text not null check (length(trim(citation)) > 0),
  summary       text not null check (length(trim(summary)) between 1 and 500),
  is_current    boolean not null default true,
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  patrol_status text not null default 'unpatrolled'
                check (patrol_status in ('unpatrolled', 'patrolled', 'reverted', 'pending', 'rejected')),
  patrolled_by  uuid references auth.users (id),
  patrolled_at  timestamptz,
  review_note   text
);
create unique index brand_edits_current_idx on public.brand_edits (pcid, brand_key) where is_current;
create index brand_edits_queue_idx on public.brand_edits (patrol_status) where patrol_status in ('pending', 'unpatrolled');

alter table public.brand_edits enable row level security;
create policy public_read on public.brand_edits for select using (true);
revoke all on public.brand_edits from anon, authenticated;
grant select (id, pcid, brand_key, brand_display, action, citation, summary, is_current,
              created_at, patrol_status, patrolled_at, review_note)
  on public.brand_edits to anon, authenticated;

-- "Glucophage  XR " → "GLUCOPHAGE XR", the key entity_brand_names uses.
create or replace function public.pc_brand_key(p text)
returns text language sql immutable set search_path = public as $$
  select upper(trim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')))
$$;

create or replace function public.edit_brand(
  p_pcid bigint, p_brand text, p_action text, p_citation text, p_summary text
) returns bigint language plpgsql security definer set search_path = public as $$
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

create or replace function public.patrol_brand_edit(p_edit_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role('patroller') then raise exception 'not_patroller' using errcode = '42501'; end if;
  update brand_edits
  set patrol_status = 'patrolled', patrolled_by = auth.uid(), patrolled_at = now()
  where id = p_edit_id and patrol_status = 'unpatrolled' and created_by is distinct from auth.uid();
  if not found then raise exception 'cannot_patrol'; end if;
end $$;

create or replace function public.review_brand_edit(p_edit_id bigint, p_accept boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
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

-- Brand changes for a page (or every page, for the review queue), newest
-- first, with "@handle · badge". Never returns author ids.
create or replace function public.brand_history(p_pcid bigint default null, p_queue_only boolean default false,
                                                p_limit integer default 200)
returns table (id bigint, pcid bigint, slug text, name text, entity_type text, brand_key text, brand_display text,
               action text, citation text, summary text, is_current boolean, created_at timestamptz,
               patrol_status text, review_note text, handle text, credential text)
language sql stable security definer set search_path = public as $$
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

-- ── 15g functions, now counting brand changes ──────────────────────────────
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

-- ── Grants ─────────────────────────────────────────────────────────────────
revoke execute on function
  public.edit_brand(bigint, text, text, text, text), public.patrol_brand_edit(bigint),
  public.review_brand_edit(bigint, boolean, text)
from public, anon;
grant execute on function
  public.edit_brand(bigint, text, text, text, text), public.patrol_brand_edit(bigint),
  public.review_brand_edit(bigint, boolean, text)
to authenticated;
grant execute on function public.brand_history(bigint, boolean, integer) to anon, authenticated;
