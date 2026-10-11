-- TS ↔ SQL contract: publishes the payload from make_payload_16b.ts on stub page 1001900
-- (after tests_16b.sql) and prints what landed in each table.
\set ON_ERROR_STOP on
\set payload `cat /tmp/payload.json`
select publish_page('aaaaaaaa-0000-0000-0000-000000000001', 1001900,
  (select current_revision_id from page_content where pcid = 1001900),
  (select current_revision_id from page_content where pcid = 1001900), :'payload'::jsonb) as result;
select 'rules: ' || string_agg(measure || ' ' || comparator || ' ' || low || coalesce('-' || high, '') || ' → ' || left(action, 30), ' | ' order by position) from threshold_rules where pcid = 1001900 and is_current;
select 'infobox: ' || property_key || ' = ' || coalesce(value, '[NONE]') || ' ' || citation from infobox_edits where pcid = 1001900 and is_current and revision_id is not null;
select 'brands: ' || brand_key || ' ' || action || ' ' || citation || ' (' || summary || ')' from brand_edits where pcid = 1001900 and is_current and revision_id is not null;
select 'refs: ' || count(*) || ' numbered, first=' || min(ref_key) filter (where ordinal = 1) from page_citations where revision_id = (select current_revision_id from page_content where pcid = 1001900);
select 'links: ' || count(*) || ' (' || count(*) filter (where target_pcid is null) || ' red)' from page_links where source_pcid = 1001900;
select 'value refs: ' || string_agg(property_key, ',') from page_property_refs where source_pcid = 1001900;
select 'lead: ' || left(description, 50) || '… body starts: ' || left(body_md, 20) from page_content where pcid = 1001900;
