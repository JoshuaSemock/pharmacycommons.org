-- Phase 24c: mirror of live migration 'create_federal_controlled_substances_views' (schema_migrations version 20261030171333, applied 2026-10-30).
-- Federal controlled substances table, views and lists (see docs/federal-controlled-substances.md).
do $$
declare
  s record; i record;
begin
  for s in select * from (values
      ('all',   'true'),
      ('c2',    'schedule_num = 2'),
      ('c3_5',  'schedule_num between 3 and 5'),
      ('c2_5',  'schedule_num between 2 and 5')
    ) as t(suffix, predicate)
  loop
    for i in select unnest(array['High','Medium','Low']) as lvl
    loop
      execute format($v$
        create or replace view public.%I with (security_invoker = true) as
        select drug_name as "Drug Name", brand_names as "Brand Names",
               control_status as "Control Status", importance as "Importance"
        from public.federal_controlled_substances
        where %s and importance = %L
        order by drug_name$v$,
        'v_cs_' || s.suffix || '_' || lower(i.lvl), s.predicate, i.lvl);
      execute format('grant select on public.%I to anon, authenticated',
        'v_cs_' || s.suffix || '_' || lower(i.lvl));
    end loop;
  end loop;
end $$;

grant select on public.federal_controlled_substances to anon, authenticated;
