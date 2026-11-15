-- Routes for the static edition recorder (docs/static-export.md).
-- psql -At -v sample=100 -f scripts/static/routes.sql -o routes.txt   (sample=0 → every record)
-- Permalinks (/id/PCID-n) are not recorded; scripts/static/permalinks.mjs writes them.
-- Destination: scripts/static/routes.sql
\if :{?sample}
\else
  \set sample 0
\endif
with fixed(route, ord) as (values
  ('/', 0), ('/browse', 1), ('/classifications', 1), ('/topics', 1), ('/lists', 1), ('/lists/compare', 1),
  ('/learn', 1), ('/tools', 1), ('/tools/creatinine-clearance', 1), ('/tools/medication-reconciliation', 1),
  ('/tools/days-supply', 1), ('/tools/dictionary', 1), ('/developers', 1), ('/resources', 1),
  ('/references', 1), ('/blog', 1), ('/about', 1), ('/terms', 1), ('/disclaimer', 1), ('/privacy', 1),
  ('/licensing', 1)
), ranked as (
  select e.slug, e.entity_type, e.pcid,
         row_number() over (partition by e.entity_type order by md5(e.pcid::text)) rn
  from entities e
  where e.slug is not null
), picked as (
  select * from ranked where :sample = 0 or rn <= :sample
)
select route from (
  select route, ord, '' k from fixed
  union all
  select case entity_type when 'class' then '/classifications/' when 'list' then '/lists/' else '/drugs/' end || slug,
         2, entity_type || slug
  from picked
) x order by ord, k;
