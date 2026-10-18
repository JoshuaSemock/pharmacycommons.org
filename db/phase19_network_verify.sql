-- Run AFTER db/phase19_network.sql. Read-only checks; expected results in comments.
-- Destination: db/phase19_network_verify.sql

-- 1. Three functions exist, SECURITY INVOKER (prosecdef = false), executable by anon.
select p.proname, p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_run
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'network\_%'
order by 1;                                   -- 3 rows, false, true

-- 2. Acetazolamide: classification first, then use/safety interleaved by round-robin.
select r->'group_counts' as group_counts, r->>'total' as total
from (select public.network_neighborhood(1000577) r) x;

select e->>'group' as grp, e->>'predicate' as predicate, e->>'id' as id
from (select jsonb_array_elements(public.network_neighborhood(1000577, null, false, 12)->'edges') e) x;

-- 3. Missing concept and malformed ids are handled quietly.
select public.network_neighborhood(-1)->>'center' as missing_center,   -- null
       public.network_edge_evidence('cm:5000080:1000577')->>'kind' as ev_cm, -- class_membership
       public.network_edge_evidence('cs:1; drop table x') as ev_bad,         -- null
       public.network_edge_evidence(null) as ev_null;                        -- null

-- 4. Record the migration by hand if you ran the file in the SQL editor
--    (confirm the three names first, then insert in supabase_migrations.schema_migrations):
select version, name from supabase_migrations.schema_migrations order by version desc limit 5;
