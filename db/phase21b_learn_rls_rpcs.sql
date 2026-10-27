-- Phase 21b — Learn: access rules, guards, RPCs, view (docs/learn.md §6)
-- Destination: db/phase21b_learn_rls_rpcs.sql
-- Run after 21a. Official rows have no write policy: only SECURITY DEFINER code writes them.

-- ---------------------------------------------------------------- grants (explicit, defence in depth)
revoke all on public.learn_items, public.learn_item_entities, public.learn_collections,
              public.learn_collection_items, public.learn_user_item_state,
              public.learn_review_events, public.learn_user_settings
  from anon, authenticated;

grant select on public.learn_items, public.learn_item_entities,
                public.learn_collections, public.learn_collection_items to anon, authenticated;
grant insert, update, delete on public.learn_items, public.learn_collections,
                                public.learn_collection_items to authenticated;
grant select, insert, update, delete on public.learn_user_item_state, public.learn_user_settings to authenticated;
grant select, insert on public.learn_review_events to authenticated;
grant usage on sequence public.learn_review_events_id_seq to authenticated;

-- ---------------------------------------------------------------- policies
-- learn_items: published official, or your own
create policy learn_items_read on public.learn_items for select to anon, authenticated
  using ((is_official and status = 'published') or owner_id = (select auth.uid()));
create policy learn_items_insert on public.learn_items for insert to authenticated
  with check (not is_official and owner_id = (select auth.uid()) and generation_method = 'user');
create policy learn_items_update on public.learn_items for update to authenticated
  using (not is_official and owner_id = (select auth.uid()))
  with check (not is_official and owner_id = (select auth.uid()) and generation_method = 'user');
create policy learn_items_delete on public.learn_items for delete to authenticated
  using (not is_official and owner_id = (select auth.uid()));

create policy learn_collections_read on public.learn_collections for select to anon, authenticated
  using ((is_official and status = 'published') or owner_id = (select auth.uid()));
create policy learn_collections_insert on public.learn_collections for insert to authenticated
  with check (not is_official and owner_id = (select auth.uid()));
create policy learn_collections_update on public.learn_collections for update to authenticated
  using (not is_official and owner_id = (select auth.uid()))
  with check (not is_official and owner_id = (select auth.uid()));
create policy learn_collections_delete on public.learn_collections for delete to authenticated
  using (not is_official and owner_id = (select auth.uid()));

create policy learn_collection_items_read on public.learn_collection_items for select to anon, authenticated
  using (exists (select 1 from public.learn_collections c
                 where c.id = collection_id
                   and ((c.is_official and c.status = 'published') or c.owner_id = (select auth.uid()))));
create policy learn_collection_items_insert on public.learn_collection_items for insert to authenticated
  with check (
    exists (select 1 from public.learn_collections c
            where c.id = collection_id and not c.is_official and c.owner_id = (select auth.uid()))
    and exists (select 1 from public.learn_items i
                where i.id = item_id
                  and ((i.is_official and i.status = 'published') or i.owner_id = (select auth.uid()))));
create policy learn_collection_items_update on public.learn_collection_items for update to authenticated
  using (exists (select 1 from public.learn_collections c
                 where c.id = collection_id and not c.is_official and c.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.learn_collections c
                      where c.id = collection_id and not c.is_official and c.owner_id = (select auth.uid())));
create policy learn_collection_items_delete on public.learn_collection_items for delete to authenticated
  using (exists (select 1 from public.learn_collections c
                 where c.id = collection_id and not c.is_official and c.owner_id = (select auth.uid())));

create policy learn_item_entities_read on public.learn_item_entities for select to anon, authenticated
  using (exists (select 1 from public.learn_items i
                 where i.id = item_id
                   and ((i.is_official and i.status = 'published') or i.owner_id = (select auth.uid()))));

create policy learn_state_own on public.learn_user_item_state for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy learn_settings_own on public.learn_user_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy learn_events_read on public.learn_review_events for select to authenticated
  using (user_id = (select auth.uid()));
create policy learn_events_insert on public.learn_review_events for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- guards
create or replace function public.learn_touch() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;

create or replace function public.learn_personal_guard() returns trigger
language plpgsql set search_path = public as $$
declare v_cap int := 2000; v_text text;
begin
  if new.is_official then return new; end if;
  if tg_op = 'INSERT' then
    if (select count(*) from public.learn_items where owner_id = new.owner_id) >= v_cap then
      raise exception 'personal_item_limit' using errcode = '54000';
    end if;
  end if;
  v_text := concat_ws(' ', new.prompt, new.concise_answer, new.clinical_rationale, new.clinical_caveats,
                      new.personal_note, new.mcq_options::text);
  if v_text ~* '<\s*/?\s*[a-z!]' then
    raise exception 'html_not_allowed' using errcode = '22023';
  end if;
  return new;
end $$;

create or replace function public.learn_personal_collection_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if not new.is_official and tg_op = 'INSERT'
     and (select count(*) from public.learn_collections where owner_id = new.owner_id) >= 100 then
    raise exception 'personal_collection_limit' using errcode = '54000';
  end if;
  return new;
end $$;

create trigger learn_items_touch before update on public.learn_items
  for each row execute function public.learn_touch();
create trigger learn_items_guard before insert or update on public.learn_items
  for each row execute function public.learn_personal_guard();
create trigger learn_collections_touch before update on public.learn_collections
  for each row execute function public.learn_touch();
create trigger learn_collections_guard before insert on public.learn_collections
  for each row execute function public.learn_personal_collection_guard();
create trigger learn_state_touch before update on public.learn_user_item_state
  for each row execute function public.learn_touch();

revoke execute on function public.learn_touch(), public.learn_personal_guard(),
                           public.learn_personal_collection_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------- view: counts per collection
create or replace view public.learn_collection_counts with (security_invoker = true) as
select c.id as collection_id,
       count(i.id) filter (where i.item_type = 'flashcard')::int as flashcard_count,
       count(i.id) filter (where i.item_type = 'mcq')::int       as mcq_count
from public.learn_collections c
left join public.learn_collection_items ci on ci.collection_id = c.id
left join public.learn_items i on i.id = ci.item_id
group by c.id;
grant select on public.learn_collection_counts to anon, authenticated;

-- ---------------------------------------------------------------- RPC: record a review (idempotent)
-- The client computes the FSRS result; the server records it. p_state_after keys:
-- state, stability, difficulty, reps, lapses, due_at, last_rating.
-- An event older than the stored last_reviewed_at is logged but does not change state
-- (guest-progress replay rule, docs/learn.md §4).
create or replace function public.learn_record_review(
  p_item uuid, p_collection uuid, p_mode text, p_rating smallint,
  p_is_correct boolean, p_selected_option text, p_was_unsure boolean, p_duration_ms int,
  p_client_event_id uuid, p_reviewed_at timestamptz, p_scheduler_version text,
  p_state_before jsonb, p_state_after jsonb
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ver int;
  v_inserted int;
  v_at timestamptz := coalesce(p_reviewed_at, now());
  v_row public.learn_user_item_state;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if p_rating is null or p_rating not between 1 and 4 then raise exception 'bad_rating' using errcode = '22023'; end if;
  if v_at > now() + interval '5 minutes' then raise exception 'bad_timestamp' using errcode = '22023'; end if;
  if p_state_after is null then raise exception 'state_required' using errcode = '22023'; end if;

  select content_version into v_ver from public.learn_items where id = p_item;   -- RLS: visible items only
  if not found then raise exception 'item_not_found' using errcode = 'P0002'; end if;

  insert into public.learn_review_events
    (user_id, item_id, collection_id, client_event_id, study_mode, rating, is_correct, selected_option_id,
     was_unsure, duration_ms, scheduler_version, state_before, state_after, item_version_seen, reviewed_at)
  values
    (v_uid, p_item, p_collection, p_client_event_id, p_mode, p_rating, p_is_correct, p_selected_option,
     coalesce(p_was_unsure, false), p_duration_ms, coalesce(p_scheduler_version, 'fsrs-5.0'),
     p_state_before, p_state_after, v_ver, v_at)
  on conflict (user_id, client_event_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    insert into public.learn_user_item_state as s
      (user_id, item_id, state, stability, difficulty, reps, lapses, last_rating, last_reviewed_at, due_at, last_seen_item_version)
    values
      (v_uid, p_item,
       p_state_after->>'state',
       (p_state_after->>'stability')::double precision,
       (p_state_after->>'difficulty')::double precision,
       (p_state_after->>'reps')::int,
       (p_state_after->>'lapses')::int,
       p_rating, v_at, (p_state_after->>'due_at')::timestamptz, v_ver)
    on conflict (user_id, item_id) do update set
      state = excluded.state, stability = excluded.stability, difficulty = excluded.difficulty,
      reps = excluded.reps, lapses = excluded.lapses, last_rating = excluded.last_rating,
      last_reviewed_at = excluded.last_reviewed_at, due_at = excluded.due_at,
      last_seen_item_version = excluded.last_seen_item_version
    where s.last_reviewed_at is null or s.last_reviewed_at <= excluded.last_reviewed_at;

    if p_is_correct is not null then
      update public.learn_user_item_state
         set mcq_attempts = mcq_attempts + 1, mcq_correct = mcq_correct + (case when p_is_correct then 1 else 0 end)
       where user_id = v_uid and item_id = p_item;
    end if;
  end if;

  select * into v_row from public.learn_user_item_state where user_id = v_uid and item_id = p_item;
  return jsonb_build_object('recorded', v_inserted = 1, 'state', to_jsonb(v_row));
end $$;
revoke execute on function public.learn_record_review(uuid, uuid, text, smallint, boolean, text, boolean, int, uuid, timestamptz, text, jsonb, jsonb)
  from public, anon;
grant execute on function public.learn_record_review(uuid, uuid, text, smallint, boolean, text, boolean, int, uuid, timestamptz, text, jsonb, jsonb)
  to authenticated;

-- ---------------------------------------------------------------- RPC: study entry points for drug / list pages (public)
create or replace function public.learn_collections_for_pcid(p_pcid bigint)
returns table (collection_id uuid, slug text, title text, item_count int)
language sql stable security invoker set search_path = public as $$
  select c.id, c.slug, c.title, count(distinct i.id)::int
  from public.learn_items i
  join public.learn_collection_items ci on ci.item_id = i.id
  join public.learn_collections c on c.id = ci.collection_id
  where c.is_official and c.status = 'published' and i.is_official and i.status = 'published'
    and (i.primary_pcid = p_pcid
         or exists (select 1 from public.learn_item_entities e where e.item_id = i.id and e.pcid = p_pcid))
  group by c.id, c.slug, c.title, c.sort_order
  order by c.sort_order, c.title
$$;

create or replace function public.learn_collections_for_list(p_slug text)
returns table (collection_id uuid, slug text, title text, item_count int)
language sql stable security invoker set search_path = public as $$
  select c.id, c.slug, c.title, count(ci.item_id)::int
  from public.learn_collections c
  join public.lists l on l.pcid = c.source_list_pcid and l.slug = p_slug
  left join public.learn_collection_items ci on ci.collection_id = c.id
  left join public.learn_items i on i.id = ci.item_id and i.is_official and i.status = 'published'
  where c.is_official and c.status = 'published'
  group by c.id, c.slug, c.title, c.sort_order
  order by c.sort_order, c.title
$$;
revoke execute on function public.learn_collections_for_pcid(bigint), public.learn_collections_for_list(text) from public;
grant execute on function public.learn_collections_for_pcid(bigint), public.learn_collections_for_list(text) to anon, authenticated;

-- ---------------------------------------------------------------- RPC: admin publish / unpublish (in-app review screen)
create or replace function public.learn_set_status(p_ids uuid[], p_status text)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not public.has_role('admin') then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_status not in ('draft','review_needed','published','archived') then
    raise exception 'bad_status' using errcode = '22023';
  end if;
  update public.learn_items
     set status = p_status,
         reviewed_by = case when p_status = 'published' then auth.uid() else reviewed_by end,
         reviewed_at = case when p_status = 'published' then now() else reviewed_at end
   where id = any (p_ids) and is_official;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.learn_set_status(uuid[], text) from public, anon;
grant execute on function public.learn_set_status(uuid[], text) to authenticated;
