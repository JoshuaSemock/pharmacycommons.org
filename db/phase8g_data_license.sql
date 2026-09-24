-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 8g — Set the aggregated-dataset license (api_meta.data_license)
-- Destination: db/phase8g_data_license.sql   (apply as migration phase8g_data_license)
--
-- PREPARED, NOT APPLIED. Uncomment exactly ONE option block below, then run.
-- The license choice is Joshua's; this file only makes it a one-line decision.
--
-- What it does:
--   1. api_meta.data_license      ← SPDX identifier (machine-readable)
--   2. api_meta.data_license_url  ← canonical legal-code URL
--   3. api_meta.data_license_scope (new key) ← what the license actually covers,
--      so third-party fields are not implicitly relicensed
--   4. data_sources rows authored by Pharmacy Commons (curated / machine_assisted)
--      get the same license, instead of null
--   5. api_index() also reports the scope
--
-- Upstream constraints found in the live DB on 2026-09-24 (see decision notes at end):
--   ATC      1,035 classes / 21,229 memberships — WHOCC: no commercial
--            distribution, no modification, attribution required
--   ChemOnt  2,066 classes / 192,568 memberships (+241,180 chemont_links) —
--            commercial redistribution needs the authors' explicit permission
--   CAS Common Chemistry (CC BY-NC 4.0) — physiochemical table is EMPTY today,
--            so no conflict yet; it starts the moment that table is loaded
--   DrugBank IDs on 13,523 moieties — fine IF they came from the CC0
--            "DrugBank Vocabulary" download; conflicts if from the CC BY-NC set
-- ═══════════════════════════════════════════════════════════════════════════

begin;
set local pc.change_source = 'phase8g-data-license';

-- ── Pick ONE ───────────────────────────────────────────────────────────────

-- Option A — CC0 1.0 (public-domain dedication; maximal machine reuse, no attribution required)
-- \set lic   'CC0-1.0'
-- \set url   'https://creativecommons.org/publicdomain/zero/1.0/'
-- \set label 'Creative Commons Zero 1.0 Universal'

-- Option B — CC BY 4.0 (reuse for any purpose, attribution required)
-- \set lic   'CC-BY-4.0'
-- \set url   'https://creativecommons.org/licenses/by/4.0/'
-- \set label 'Creative Commons Attribution 4.0 International'

-- Option C — CC BY-SA 4.0 (attribution + derivatives must stay open under the same terms)
-- \set lic   'CC-BY-SA-4.0'
-- \set url   'https://creativecommons.org/licenses/by-sa/4.0/'
-- \set label 'Creative Commons Attribution-ShareAlike 4.0 International'

-- Option D — CC BY-NC 4.0 (only whole-dataset option compatible with ATC/ChemOnt/CAS NC terms;
--            still does not satisfy ATC's no-modification clause)
-- \set lic   'CC-BY-NC-4.0'
-- \set url   'https://creativecommons.org/licenses/by-nc/4.0/'
-- \set label 'Creative Commons Attribution-NonCommercial 4.0 International'

-- If running in the Supabase SQL editor (no psql \set), replace the three
-- :'lic' / :'url' / :'label' references below with the literal strings.

-- ── 1–3. api_meta ──────────────────────────────────────────────────────────
update public.api_meta set value = :'lic',
       note  = :'label' || '. Applies to Pharmacy Commons–authored content; see data_license_scope.'
 where key = 'data_license';

update public.api_meta set value = :'url', note = null
 where key = 'data_license_url';

insert into public.api_meta (key, value, note) values
  ('data_license_scope',
   'Covers Pharmacy Commons identifiers (PCIDs), records, relationships and curation. '
   || 'Fields attributed to a third-party source in the document''s provenance remain under that '
   || 'source''s terms, listed at /v1 under "sources".',
   'Keeps upstream data (ATC, ChemOnt, CAS, DrugBank, RxNorm) from being implicitly relicensed')
on conflict (key) do update set value = excluded.value, note = excluded.note;

-- ── 4. Pharmacy Commons–authored sources inherit the license ───────────────
update public.data_sources
   set license = :'lic', terms_url = :'url'
 where kind in ('curated', 'machine_assisted')
   and publisher = 'Pharmacy Commons'
   and license is null;

-- ── 5. api_index() reports scope alongside the license ─────────────────────
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

commit;

-- ── Verify ─────────────────────────────────────────────────────────────────
-- select key, value from api_meta where key like 'data_license%';
-- select api_index() -> 'license';
-- select source_key, license from data_sources where kind in ('curated','machine_assisted');

-- ═══════════════════════════════════════════════════════════════════════════
-- Decision notes (for Joshua — not executed)
--
-- • Options A–C (CC0 / BY / BY-SA) all permit commercial reuse and adaptation.
--   They are safe ONLY together with data_license_scope above, i.e. the license
--   covers Pharmacy Commons' own work and each third-party field keeps its
--   upstream terms. Without that carve-out, ATC and ChemOnt content in class
--   records would be offered under terms their owners don't allow.
-- • Option D (BY-NC) is the only single license that matches the NC sources for
--   the whole dataset, but it blocks commercial reuse of Pharmacy Commons' own
--   curation too — at odds with the "commons" / machine-first goal.
-- • Before choosing A: confirm the 13,523 DrugBank IDs came from the CC0
--   DrugBank Vocabulary file. Worth recording as drugbank.license = 'CC0 1.0'
--   (Vocabulary only) once confirmed.
-- • Before loading physiochemical from CAS Common Chemistry: those rows will be
--   CC BY-NC regardless of the choice here; the API documents should carry the
--   per-field source so consumers can filter them out.
-- • This choice also gates the USPTO filing timing noted in CLAUDE.md.
-- ═══════════════════════════════════════════════════════════════════════════
