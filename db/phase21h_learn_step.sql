-- Phase 21h — Learn: persist the learning-step index so a card mid-ladder resumes on the right step
-- Destination: db/phase21h_learn_step.sql
-- FSRS-5 learning/relearning cards move through short steps (1m, 10m). The client scheduler returns `step`;
-- without storing it a signed-in learner's card would restart its ladder on every device change.

alter table public.learn_user_item_state
  add column if not exists step smallint not null default 0;

create or replace function public.learn_record_review(
  p_item uuid, p_collection uuid, p_mode text, p_rating smallint, p_is_correct boolean, p_selected_option text,
  p_was_unsure boolean, p_duration_ms integer, p_client_event_id uuid, p_reviewed_at timestamp with time zone,
  p_scheduler_version text, p_state_before jsonb, p_state_after jsonb)
returns jsonb language plpgsql set search_path to 'public' as $function$
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

  select content_version into v_ver from public.learn_items where id = p_item;
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
      (user_id, item_id, state, step, stability, difficulty, reps, lapses, last_rating, last_reviewed_at, due_at, last_seen_item_version)
    values
      (v_uid, p_item,
       p_state_after->>'state',
       coalesce((p_state_after->>'step')::smallint, 0),
       (p_state_after->>'stability')::double precision,
       (p_state_after->>'difficulty')::double precision,
       (p_state_after->>'reps')::int,
       (p_state_after->>'lapses')::int,
       p_rating, v_at, (p_state_after->>'due_at')::timestamptz, v_ver)
    on conflict (user_id, item_id) do update set
      state = excluded.state, step = excluded.step, stability = excluded.stability, difficulty = excluded.difficulty,
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
end $function$;
