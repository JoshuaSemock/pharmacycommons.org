-- Phase 26a — name the replacement when an API reference is a retired PCID (2026-10-30)
-- Destination: db/phase26a_api_retired_replacement.sql   (run after 25a)
--
-- Before: api_not_found() answered every retired PCID with a bare 410 "retired" and never read
--   pcid_retired.replaced_by_pcid, although CLAUDE.md and the Developers page both say the body names
--   the replacement (and that the API redirects). Phase 25a retired 55 more PCIDs, all with a replacement.
-- After: the 410 body also carries replaced_by ("PCID-1000025") and replaced_by_pcid (1000025). The
--   replacement is the first LIVE record on the replaced_by chain (max 10 hops, cycle-safe), so a
--   replacement that is itself retired later still resolves. The Edge Function turns this into a
--   301 for the record document (supabase/functions/api/index.ts); version, change and member routes
--   keep the 410 and name the replacement in the body.
-- Same signature, language and search_path as the function it replaces, so the four api_* callers
--   (api_entity_document, api_entity_versions, api_entity_changes, api_class_members) are untouched.
-- No data change; CREATE OR REPLACE only.

create or replace function public.api_not_found(p_ref text)
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
  with recursive ref as (
    select (regexp_match(coalesce(p_ref, ''), '(\d{7})'))[1]::bigint as pcid
  ),
  walk(pcid, hop) as (
    select r.replaced_by_pcid, 1
      from ref join pcid_retired r on r.pcid = ref.pcid
    union all
    select r.replaced_by_pcid, w.hop + 1
      from walk w join pcid_retired r on r.pcid = w.pcid
     where w.hop < 10
  ),
  target as (
    select w.pcid
      from walk w
     where exists (select 1 from entities e where e.pcid = w.pcid)
     order by w.hop
     limit 1
  )
  select case
    when r.pcid is not null then
      jsonb_build_object(
        'error', true, 'status', 410, 'code', 'retired',
        'message', 'PCID-' || r.pcid || ' was retired and is never reissued.',
        'retired_at', r.retired_at, 'reason', r.reason)
      || case when t.pcid is not null
              then jsonb_build_object('replaced_by', 'PCID-' || t.pcid, 'replaced_by_pcid', t.pcid)
              else '{}'::jsonb end
    else jsonb_build_object(
      'error', true, 'status', 404, 'code', 'not_found',
      'message', 'No record matches ' || coalesce(p_ref, '(empty)') || '. Use a PCID (PCID-1001923), a slug (metformin) or a slug URI (pc:moiety:metformin).')
  end
  from ref
  left join pcid_retired r on r.pcid = ref.pcid
  left join target t on true
$function$;

-- Verify after running (expected: 1000025, 1003113, null/404, null/404):
--   select public.api_not_found('PCID-1000073') ->> 'replaced_by';
--   select public.api_not_found('1002992')      ->> 'replaced_by';
--   select public.api_not_found('PCID-1999999') ->> 'code';   -- not_found
--   select public.api_not_found('metformin')    ->> 'code';   -- not_found
-- Then record it: insert into supabase_migrations.schema_migrations (version, name)
--   values ('<timestamp>', 'phase26a_api_retired_replacement');
