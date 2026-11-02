-- Utility: exportable view of the main identity spine (blocks 1-4)
-- Applied to Supabase 2026-11-02 as migration "utility_export_main_spine_view".
-- Baseline: 15,914 moieties, 6,893 formulations, 2,612 combinations, 1,451 precise forms = 26,870 rows.
BEGIN;
SET LOCAL pc.change_source = 'export_spine_view';

CREATE OR REPLACE VIEW public.v_export_main_spine WITH (security_invoker = true) AS
SELECT
    e.pcid,
    e.name AS drug,
    e.entity_type,
    e.slug,
    e.slug_uri,
    e.created_at,
    e.updated_at,
    COALESCE(m.is_controlled, c.is_controlled, p.is_controlled, f.is_controlled) AS is_controlled,
    COALESCE(m.controlled_schedule, c.controlled_schedule, p.controlled_schedule, f.controlled_schedule) AS controlled_schedule,
    COALESCE(m.term_type, c.term_type, p.term_type, f.term_type) AS term_type,
    COALESCE(m.base_name, c.base_name, p.base_name, f.base_name) AS base_name,
    COALESCE(m.drugbank_id, c.drugbank_id, p.drugbank_id, f.drugbank_id) AS drugbank_id,
    COALESCE(m.cas, c.cas, p.cas, f.cas) AS cas,
    COALESCE(m.unii, c.unii, p.unii, f.unii) AS unii,
    COALESCE(m.inchi_key, c.inchi_key, p.inchi_key, f.inchi_key) AS inchi_key,
    COALESCE(m.legal_status, c.legal_status, p.legal_status, f.legal_status) AS legal_status,
    COALESCE(m.fda_marketing_status, c.fda_marketing_status, p.fda_marketing_status, f.fda_marketing_status) AS fda_marketing_status,
    m.description_text
FROM public.entities e
LEFT JOIN public.moieties m ON e.pcid = m.pcid
LEFT JOIN public.combinations c ON e.pcid = c.pcid
LEFT JOIN public.precise_forms p ON e.pcid = p.pcid
LEFT JOIN public.formulations f ON e.pcid = f.pcid
WHERE e.entity_type IN ('moiety', 'combination', 'precise_form', 'formulation');

GRANT SELECT ON public.v_export_main_spine TO anon, authenticated;

COMMIT;
