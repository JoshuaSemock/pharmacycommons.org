-- Phase 21i checks (rollback-only; result is raised as an error so nothing persists).
-- Expect: nonadmin_refused=true, collections=7, publish_without_approved_refused=true, anon_exec=false.
do $$
declare u uuid; r jsonb; ok boolean := false; ref boolean := false; msg text := '';
begin
  begin perform public.learn_review_summary(); exception when sqlstate '42501' then ok := true; end;
  msg := 'nonadmin_refused=' || ok;
  select user_id into u from public.user_roles where role = 'admin' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);
  r := public.learn_review_summary();
  msg := msg || ' | collections=' || jsonb_array_length(r->'collections') || ' templates=' || jsonb_array_length(r->'templates');
  r := public.learn_review_items('dnc_member', 'draft', 2, 0, 'x');
  msg := msg || ' | sample_rows=' || jsonb_array_length(r->'items');
  begin perform public.learn_set_collection_status((select id from public.learn_collections where is_official limit 1), 'published');
  exception when sqlstate '22023' then ref := true; end;
  msg := msg || ' | publish_without_approved_refused=' || ref || ' | anon_exec=' || has_function_privilege('anon','public.learn_review_summary()','execute');
  raise exception '%', msg;
end $$;
