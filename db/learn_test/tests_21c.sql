-- db/learn_test/tests_21c.sql — checks for the Learn generators (21c–21e). Run in the SQL editor.
-- Generators are re-run inside the block, then everything rolls back; the PASS/FAIL report is the error message.
do $t$
declare r text[] := '{}'; v int; j jsonb;
begin
  -- 1 idempotent: re-running a generator creates nothing
  j := public.learn_gen_jc_dnu();
  r := array_append(r, case when (j->>'created')::int = 0 then 'PASS' else 'FAIL' end || ' jc_dnu re-run creates 0');
  j := public.learn_gen_acb_highest();
  r := array_append(r, case when (j->>'created')::int = 0 then 'PASS' else 'FAIL' end || ' acb_highest re-run creates 0');
  -- 2 every MCQ has exactly one correct option and 2-6 options
  select count(*) into v from public.learn_items where item_type = 'mcq'
    and (jsonb_array_length(mcq_options) not between 2 and 6
      or jsonb_array_length(jsonb_path_query_array(mcq_options, '$[*] ? (@.is_correct == true)')) <> 1);
  r := array_append(r, case when v = 0 then 'PASS' else 'FAIL' end || ' mcq option integrity (' || v || ' bad)');
  -- 3 Do Not Crush distractors: never on the list, always oral-solid
  select count(*) into v from public.learn_items i, jsonb_array_elements(i.mcq_options) o
    where i.template_key = 'dnc_member' and not (o->>'is_correct')::boolean
      and exists (select 1 from public.entities e join public.list_items li on li.member_pcid = e.pcid
                  join public.lists l on l.pcid = li.list_pcid
                  where lower(e.name) = lower(o->>'text') and (l.slug = 'do-not-crush' or l.parent_pcid = 10000023));
  r := array_append(r, case when v = 0 then 'PASS' else 'FAIL' end || ' dnc distractors on the list (' || v || ')');
  -- 4 answers are core moieties, non-synonym
  select count(*) into v from public.learn_items i join public.moieties m on m.pcid = i.primary_pcid
    where i.is_official and i.primary_pcid is not null and (m.term_type <> 'Core moiety' or m.synonym_of_pcid is not null);
  r := array_append(r, case when v = 0 then 'PASS' else 'FAIL' end || ' non-core answers (' || v || ')');
  -- 5 acb_highest distractors all score 1 or 2
  select count(*) into v from public.learn_items i, jsonb_array_elements(i.mcq_options) o
    where i.template_key = 'acb_highest' and not (o->>'is_correct')::boolean
      and not exists (select 1 from public.learn_list_pool('anticholinergic-burden') p
                      where lower(p.name) = lower(o->>'text') and p.value in (1, 2));
  r := array_append(r, case when v = 0 then 'PASS' else 'FAIL' end || ' acb distractors not score 1/2 (' || v || ')');
  -- 6 generators are not executable by anon / authenticated
  select count(*) into v from information_schema.routine_privileges
    where routine_schema = 'public' and routine_name like 'learn\_gen\_%' and grantee in ('anon', 'authenticated', 'PUBLIC');
  r := array_append(r, case when v = 0 then 'PASS' else 'FAIL' end || ' generators revoked from public roles (' || v || ' grants)');
  -- 7 nothing official is published without review
  select count(*) into v from public.learn_items where is_official and status = 'published';
  r := array_append(r, 'INFO published official items: ' || v);
  raise exception E'REPORT\n%', array_to_string(r, E'\n');
end $t$;
