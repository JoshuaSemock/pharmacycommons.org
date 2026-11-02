-- Phase 28: normalise combinations.term_type (applied 2026-11-02 via apply_migration
-- as "phase28_combination_term_type_backfill").
-- Before: 2,344 'Combination product', 168 'From live registry' (PCIDs 2000001-2000168, a
-- provenance tag, not a type), and 100 combination entities (PCIDs 2002167-2002266) with no
-- row in public.combinations at all (so the export view showed term_type NULL).
-- After: combinations has 2,612 rows, all 'Combination product'; entities and combinations agree.
-- Rollback for part 2: DELETE FROM public.combinations WHERE pcid BETWEEN 2002167 AND 2002266
--   AND term_type = 'Combination product' AND coalesce(base_name, cas, unii, inchi_key) IS NULL;
BEGIN;
SET LOCAL pc.change_source = 'phase28_combination_term_type';

-- 1. Relabel the 168 pre-existing combinations tagged by provenance instead of type.
UPDATE public.combinations
SET term_type = 'Combination product'
WHERE term_type = 'From live registry';

-- 2. Give the 100 satellite-less combination entities a row (term_type only; the rest stays NULL).
INSERT INTO public.combinations (pcid, term_type)
SELECT e.pcid, 'Combination product'
FROM public.entities e
LEFT JOIN public.combinations c ON c.pcid = e.pcid
WHERE e.entity_type = 'combination'
  AND c.pcid IS NULL
ON CONFLICT (pcid) DO NOTHING;

COMMIT;
