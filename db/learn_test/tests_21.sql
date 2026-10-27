-- Learn tests (phase 21a/21b). Destination: db/learn_test/tests_21.sql
-- Run in the SQL editor or via execute_sql after 21a and 21b are applied.
-- Everything runs in one DO block that ends by raising an exception, so nothing persists;
-- the exception message is the report: every line should start with PASS.
do $t$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  a uuid; b uuid; c uuid; col uuid; pc bigint;
  e1 uuid := gen_random_uuid();
  n int; n2 int; r jsonb;
  results text[] := '{}';
  st jsonb := '{"state":"review","stability":2.5,"difficulty":5.1,"reps":1,"lapses":0,"due_at":"2026-11-01T00:00:00Z"}';
  opts jsonb := '[{"id":"a","text":"X","is_correct":true,"rationale":"r"},{"id":"b","text":"Y","is_correct":false,"rationale":"r"}]';
begin
  select pcid into pc from public.entities order by pcid limit 1;
  -- the signup gate (enforce_signup_requirements) needs this metadata
  insert into auth.users (id, aud, role, email, raw_user_meta_data) values
    (u1, 'authenticated', 'authenticated', u1 || '@test.invalid', '{"date_of_birth":"1990-01-01","age_confirmed":"true","account_type":"researcher","first_name":"T","last_name":"T"}'),
    (u2, 'authenticated', 'authenticated', u2 || '@test.invalid', '{"date_of_birth":"1990-01-01","age_confirmed":"true","account_type":"researcher","first_name":"T","last_name":"T"}');

  insert into public.learn_items (natural_key, item_type, template_key, generation_method, is_official, status, subject_area, topic, primary_pcid, prompt, concise_answer, source_kind, source_citation)
    values ('test:a','flashcard','t','template',true,'published','S','T',pc,'Q a','A a','list','Test source') returning id into a;
  insert into public.learn_items (natural_key, item_type, template_key, generation_method, is_official, status, subject_area, topic, prompt, concise_answer, source_kind, source_citation)
    values ('test:b','flashcard','t','template',true,'draft','S','T','Q b','A b','list','Test source') returning id into b;
  insert into public.learn_items (natural_key, item_type, template_key, generation_method, is_official, status, subject_area, topic, prompt, concise_answer, source_kind, source_citation, mcq_options)
    values ('test:c','mcq','t','template',true,'published','S','T','Q c','A c','list','Test source', opts) returning id into c;
  insert into public.learn_collections (slug, title, subject_area, is_official, status) values ('test-col','Test','S',true,'published') returning id into col;
  insert into public.learn_collection_items (collection_id, item_id) values (col,a),(col,b),(col,c);

  -- constraints (as postgres)
  begin
    insert into public.learn_items (item_type, generation_method, is_official, status, subject_area, topic, prompt, concise_answer, source_kind, source_citation, mcq_options)
    values ('mcq','template',true,'draft','S','T','q','a','list','x','[{"id":"a","text":"X","is_correct":true},{"id":"b","text":"Y","is_correct":true}]');
    results := array_append(results, 'FAIL mcq with two correct options accepted');
  exception when check_violation then results := array_append(results, 'PASS mcq with two correct options rejected'); end;
  begin
    insert into public.learn_items (item_type, generation_method, is_official, status, subject_area, topic, prompt, concise_answer, source_kind, source_citation)
    values ('mcq','template',true,'draft','S','T','q','a','list','x');
    results := array_append(results, 'FAIL mcq without options accepted');
  exception when check_violation then results := array_append(results, 'PASS mcq without options rejected'); end;
  begin
    insert into public.learn_items (item_type, generation_method, is_official, status, subject_area, topic, prompt, concise_answer, source_kind, source_citation, source_quote)
    values ('flashcard','llm_draft',true,'published','S','T','q','a','label','x','quote');
    results := array_append(results, 'FAIL unreviewed llm_draft published');
  exception when check_violation then results := array_append(results, 'PASS unreviewed llm_draft cannot be published'); end;
  begin
    insert into public.learn_items (item_type, generation_method, is_official, status, subject_area, topic, prompt, concise_answer, source_kind, source_citation)
    values ('flashcard','template',true,'draft','S','T','q','a','list','   ');
    results := array_append(results, 'FAIL blank source_citation accepted');
  exception when check_violation then results := array_append(results, 'PASS blank source_citation rejected'); end;

  -- anon
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  select count(*) into n from public.learn_items where natural_key like 'test:%';
  results := array_append(results, (case when n = 2 then 'PASS' else 'FAIL' end) || format(' anon sees only published official items (%s)', n));
  select flashcard_count, mcq_count into n, n2 from public.learn_collection_counts where collection_id = col;
  results := array_append(results, (case when n = 1 and n2 = 1 then 'PASS' else 'FAIL' end) || format(' collection counts count visible items only (%s/%s)', n, n2));
  select count(*) into n from public.learn_collections_for_pcid(pc) where collection_id = col;
  results := array_append(results, (case when n = 1 then 'PASS' else 'FAIL' end) || ' learn_collections_for_pcid finds the collection');
  begin
    insert into public.learn_items (item_type, generation_method, is_official, subject_area, topic, prompt, concise_answer, source_kind, source_citation)
    values ('flashcard','user',false,'S','T','q','a','authored','x');
    results := array_append(results, 'FAIL anon insert allowed');
  exception when insufficient_privilege then results := array_append(results, 'PASS anon cannot insert items'); end;
  begin
    perform public.learn_record_review(a, col, 'flashcard', 3::smallint, null, null, false, 1000, gen_random_uuid(), now(), 'fsrs-5.0', null, st);
    results := array_append(results, 'FAIL anon can record reviews');
  exception when insufficient_privilege then results := array_append(results, 'PASS anon cannot record reviews'); end;
  execute 'reset role';

  -- u1
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  execute 'set local role authenticated';
  insert into public.learn_items (item_type, generation_method, is_official, owner_id, subject_area, topic, prompt, concise_answer, source_kind, source_citation, natural_key)
    values ('flashcard','user',false,u1,'S','T','mine','a','authored','me','test:u1');
  results := array_append(results, 'PASS u1 can insert a personal item');
  begin
    insert into public.learn_items (item_type, generation_method, is_official, subject_area, topic, prompt, concise_answer, source_kind, source_citation)
    values ('flashcard','template',true,'S','T','q','a','list','x');
    results := array_append(results, 'FAIL user inserted an official item');
  exception when insufficient_privilege then results := array_append(results, 'PASS user cannot insert an official item'); end;
  begin
    insert into public.learn_items (item_type, generation_method, is_official, owner_id, subject_area, topic, prompt, concise_answer, source_kind, source_citation)
    values ('flashcard','user',false,u2,'S','T','q','a','authored','x');
    results := array_append(results, 'FAIL user inserted an item owned by someone else');
  exception when insufficient_privilege then results := array_append(results, 'PASS user cannot insert for another owner'); end;
  begin
    insert into public.learn_items (item_type, generation_method, is_official, owner_id, subject_area, topic, prompt, concise_answer, source_kind, source_citation)
    values ('flashcard','user',false,u1,'S','T','<script>alert(1)</script>','a','authored','x');
    results := array_append(results, 'FAIL html accepted in a personal item');
  exception when sqlstate '22023' then results := array_append(results, 'PASS html rejected in a personal item'); end;
  update public.learn_items set prompt = 'hacked' where id = a;
  get diagnostics n = row_count;
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end) || ' user cannot update an official item');
  delete from public.learn_items where id = a;
  get diagnostics n = row_count;
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end) || ' user cannot delete an official item');
  begin
    insert into public.learn_collection_items (collection_id, item_id) values (col, a);
    results := array_append(results, 'FAIL user added an item to an official collection');
  exception when insufficient_privilege then results := array_append(results, 'PASS user cannot edit an official collection'); end;
  begin
    perform public.learn_set_status(array[a], 'archived');
    results := array_append(results, 'FAIL non-admin changed item status');
  exception when insufficient_privilege then results := array_append(results, 'PASS non-admin cannot change item status'); end;

  -- personal collection with an official published item; draft official item refused
  declare pcol uuid;
  begin
    insert into public.learn_collections (title, subject_area, is_official, owner_id) values ('Mine','S',false,u1) returning id into pcol;
    insert into public.learn_collection_items (collection_id, item_id) values (pcol, a);
    results := array_append(results, 'PASS user can add a published official item to a personal set');
    begin
      insert into public.learn_collection_items (collection_id, item_id) values (pcol, b);
      results := array_append(results, 'FAIL user added an unpublished official item');
    exception when insufficient_privilege then results := array_append(results, 'PASS user cannot add an unpublished official item'); end;
  end;

  -- record reviews
  r := public.learn_record_review(a, col, 'flashcard', 3::smallint, null, null, false, 1500, e1, now(), 'fsrs-5.0', null, st);
  results := array_append(results, (case when (r->>'recorded')::boolean and (r->'state'->>'reps')::int = 1 then 'PASS' else 'FAIL' end) || ' first review is recorded');
  r := public.learn_record_review(a, col, 'flashcard', 3::smallint, null, null, false, 1500, e1, now(), 'fsrs-5.0', null, st);
  select count(*) into n from public.learn_review_events where item_id = a;
  results := array_append(results, (case when not (r->>'recorded')::boolean and n = 1 then 'PASS' else 'FAIL' end) || ' repeated client_event_id is ignored');
  r := public.learn_record_review(a, col, 'flashcard', 1::smallint, null, null, false, 1500, gen_random_uuid(), now() - interval '1 day', 'fsrs-5.0', null,
                                  '{"state":"learning","stability":0.4,"difficulty":6,"reps":9,"lapses":3,"due_at":"2026-10-28T00:00:00Z"}');
  select count(*) into n from public.learn_review_events where item_id = a;
  results := array_append(results, (case when (r->'state'->>'reps')::int = 1 and n = 2 then 'PASS' else 'FAIL' end) || ' older event is logged but does not change state');
  r := public.learn_record_review(c, col, 'mcq_practice', 3::smallint, true, 'a', false, 4000, gen_random_uuid(), now(), 'fsrs-5.0', null, st);
  results := array_append(results, (case when (r->'state'->>'mcq_attempts')::int = 1 and (r->'state'->>'mcq_correct')::int = 1 then 'PASS' else 'FAIL' end) || ' MCQ counters update');
  begin
    perform public.learn_record_review(b, col, 'flashcard', 3::smallint, null, null, false, 1000, gen_random_uuid(), now(), 'fsrs-5.0', null, st);
    results := array_append(results, 'FAIL reviewed an unpublished item');
  exception when sqlstate 'P0002' then results := array_append(results, 'PASS unpublished item cannot be reviewed'); end;
  begin
    perform public.learn_record_review(a, col, 'flashcard', 3::smallint, null, null, false, 1000, gen_random_uuid(), now() + interval '2 days', 'fsrs-5.0', null, st);
    results := array_append(results, 'FAIL future timestamp accepted');
  exception when sqlstate '22023' then results := array_append(results, 'PASS future timestamp rejected'); end;
  begin
    update public.learn_review_events set rating = 4 where user_id = u1;
    results := array_append(results, 'FAIL review events are editable');
  exception when insufficient_privilege then results := array_append(results, 'PASS review events are immutable'); end;
  execute 'reset role';

  -- u2
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.learn_items where natural_key = 'test:u1';
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end) || ' u2 cannot see u1 personal items');
  select count(*) into n from public.learn_user_item_state;
  select count(*) into n2 from public.learn_review_events;
  results := array_append(results, (case when n = 0 and n2 = 0 then 'PASS' else 'FAIL' end) || format(' u2 cannot see u1 state or events (%s/%s)', n, n2));
  execute 'reset role';

  raise exception E'LEARN TESTS\n%', array_to_string(results, E'\n');
end $t$;
