-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 15f — Quick Facts (infobox) review and history
-- Destination: db/phase15f_infobox_review.sql
--
-- Phase 15 let contributors write community infobox values (edit_infobox) and
-- reviewers accept/reject ones held on 'reviewed' pages (review_infobox_edit),
-- but had no way to mark a *live* infobox edit reviewed, and no public history
-- with author handles (infobox_edits.created_by is withheld by column grants).
--
-- Also fixes edit_infobox(): on a page with no page_content row (no Overview
-- text yet, i.e. most pages) the protection lookup returned NULL, so `v_held`
-- was NULL and the insert failed on infobox_edits.is_current NOT NULL. Found
-- by the local test for this migration (2026-10-05); no live edits affected.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.edit_infobox(
  p_pcid bigint, p_key text, p_value text, p_citation text, p_summary text
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_patroller boolean := has_role('patroller');
  v_protection text;
  v_held boolean;
begin
  if not is_verified_contributor() then raise exception 'not_verified' using errcode = '42501'; end if;
  if not exists (select 1 from contributor_profiles where user_id = auth.uid()) then raise exception 'handle_required'; end if;
  if not exists (select 1 from infobox_properties where key = lower(p_key)) then raise exception 'unknown_property'; end if;
  if not exists (select 1 from entities where pcid = p_pcid) then raise exception 'no_such_page'; end if;
  if length(coalesce(p_value, '')) > 2000 then raise exception 'too_long'; end if;

  -- No page_content row means an unprotected page.
  select protection into v_protection from page_content where pcid = p_pcid;
  v_protection := coalesce(v_protection, 'open');
  if v_protection = 'patrollers' and not v_patroller then raise exception 'protected'; end if;
  v_held := v_protection = 'reviewed' and not v_patroller;

  if not v_held then
    update infobox_edits set is_current = false
    where pcid = p_pcid and property_key = lower(p_key) and is_current;
  end if;

  insert into infobox_edits (pcid, property_key, value, citation, summary, is_current, created_by,
                             patrol_status, patrolled_by, patrolled_at)
  values (p_pcid, lower(p_key), nullif(trim(p_value), ''), trim(p_citation), trim(p_summary), not v_held, auth.uid(),
          case when v_held then 'pending' when v_patroller then 'patrolled' else 'unpatrolled' end,
          case when v_patroller then auth.uid() end,
          case when v_patroller then now() end)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.patrol_infobox_edit(p_edit_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role('patroller') then raise exception 'not_patroller' using errcode = '42501'; end if;
  update infobox_edits
  set patrol_status = 'patrolled', patrolled_by = auth.uid(), patrolled_at = now()
  where id = p_edit_id and patrol_status = 'unpatrolled' and created_by is distinct from auth.uid();
  if not found then raise exception 'cannot_patrol'; end if;
end $$;

-- Community values for a page (one property, or all), newest first, with
-- "@handle · badge" like page_history(). Never returns author ids.
create or replace function public.infobox_history(p_pcid bigint, p_key text default null, p_limit integer default 100)
returns table (id bigint, property_key text, value text, citation text, summary text, is_current boolean,
               created_at timestamptz, patrol_status text, review_note text, handle text, credential text)
language sql stable security definer set search_path = public as $$
  select e.id, e.property_key, e.value, e.citation, e.summary, e.is_current, e.created_at, e.patrol_status,
         e.review_note,
         coalesce(cp.handle, 'maintainer'),
         case when coalesce(cp.display_credential, true)
              then pc_credential_badge(pv.credential, pv.primary_taxonomy) end
  from infobox_edits e
  left join contributor_profiles cp on cp.user_id = e.created_by
  left join provider_verifications pv on pv.user_id = e.created_by
  where e.pcid = p_pcid and (p_key is null or e.property_key = lower(p_key))
  order by e.id desc
  limit least(greatest(p_limit, 1), 500)
$$;

revoke execute on function public.patrol_infobox_edit(bigint) from public, anon;
grant execute on function public.patrol_infobox_edit(bigint) to authenticated;
grant execute on function public.infobox_history(bigint, text, integer) to anon, authenticated;
