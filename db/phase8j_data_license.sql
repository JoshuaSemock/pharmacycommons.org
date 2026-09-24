-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 8j — Aggregated-dataset license: CC0 1.0 (Option A of the prepared
-- phase8g_data_license draft; renamed because migration phase8g_snapshot_all
-- already exists).
-- Destination: db/phase8j_data_license.sql
-- Applied as migration phase8j_data_license (2026-09-24).
--
-- Decision (Joshua, 2026-09-24): match the site footer —
-- "Original data CC0 1.0; third-party data keeps its source license."
-- data_license_scope carries that carve-out so ATC, ChemOnt, CAS, DrugBank and
-- RxNorm fields are not implicitly relicensed.
--
-- Open follow-ups (not done here):
--   • Confirm the 13,523 moiety DrugBank IDs came from the CC0 "DrugBank
--     Vocabulary" download, then set data_sources.drugbank.license = 'CC0 1.0'.
--   • CAS Common Chemistry rows (physiochemical, empty today) will be
--     CC BY-NC 4.0 regardless; documents must carry per-field source.
-- ═══════════════════════════════════════════════════════════════════════════

set local pc.change_source = 'phase8j-data-license';

update public.api_meta
   set value = 'CC0-1.0',
       note  = 'Creative Commons Zero 1.0 Universal. Applies to Pharmacy Commons–authored content; see data_license_scope.'
 where key = 'data_license';

update public.api_meta
   set value = 'https://creativecommons.org/publicdomain/zero/1.0/', note = null
 where key = 'data_license_url';

insert into public.api_meta (key, value, note) values
  ('data_license_scope',
   'Covers Pharmacy Commons identifiers (PCIDs), records, relationships and curation. '
   || 'Fields attributed to a third-party source in the document''s provenance remain under that '
   || 'source''s terms, listed at /v1 under "sources".',
   'Keeps upstream data (ATC, ChemOnt, CAS, DrugBank, RxNorm) from being implicitly relicensed')
on conflict (key) do update set value = excluded.value, note = excluded.note;

update public.data_sources
   set license = 'CC0 1.0', terms_url = 'https://creativecommons.org/publicdomain/zero/1.0/'
 where kind in ('curated', 'machine_assisted')
   and publisher = 'Pharmacy Commons'
   and license is null;

create or replace function public.api_index()
returns jsonb
language sql stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'name',           'Pharmacy Commons API',
    'api_version',    api_meta_value('api_version'),
    'schema_version', api_meta_value('schema_version'),
    'site',           api_meta_value('site_base'),
    'license',        jsonb_build_object(
                        'data',  api_meta_value('data_license'),
                        'url',   api_meta_value('data_license_url'),
                        'scope', api_meta_value('data_license_scope')),
    'entity_types', (
      select jsonb_agg(jsonb_build_object(
               'type', b.entity_kind, 'label', b.label, 'block', b.block_id,
               'pcid_range', jsonb_build_array('PCID-' || b.min_id, 'PCID-' || b.max_id),
               'count', (select count(*) from entities e where e.entity_type = b.entity_kind))
             order by b.block_id)
        from pcid_blocks b),
    'sources', (select jsonb_agg(jsonb_strip_nulls(to_jsonb(d)) order by d.source_key) from data_sources d),
    'tracking_since', (select min(created_at) from entity_versions))
$$;
