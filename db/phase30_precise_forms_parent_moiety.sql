-- Phase 30: explicit active-moiety link on precise forms (active ingredients).
-- Applied 2026-11-02. Part 1 via apply_migration, recorded live as
-- "phase27a_precise_forms_parent_moiety" (the live name predates the repo renumber: repo
-- phase27 is LASA, 28 combination term_type, 29 salt base moieties; match by version, not name).
-- Parts 2 and 3 were run with execute_sql (data backfill, COALESCE-guarded).
--
-- Why: the parent of a precise form (salt/ester/hydrate = FDA "active ingredient") was only
-- implied by the free-text precise_forms.base_name, which moiety_hierarchy joins on. base_name is
-- often truncated to the first word (SODIUM, CALCIUM, MAGNESIUM, POTASSIUM, FERROUS, ZINC, CUPRIC),
-- so a name match alone is unsafe; FDA's own link (fda_product_ingredients) is better.
-- Result (checked 2026-11-02): 1,297 of 1,451 rows linked, 0 orphans.
--   951 rows: FDA gives exactly one moiety, and the name match agrees or does not exist (part 2)
--   346 rows: no FDA ingredient rows, one exact name match, form name starts with the moiety name (part 3)
--   154 rows left NULL on purpose: 130 are in the review sheet (33 FDA-vs-name conflicts, 7
--   ambiguous two-ion salts, 90 unmatched) and 24 have FDA rows without a unique moiety.
-- Cross-check against moiety_hierarchy: 1,288 agree, 7 forms are not in the hierarchy, 3 disagree
--   (FERRIC CITRATE -> Ferric cation here vs Ferric sulfate / Ferric chloride there;
--    SODIUM PHOSPHATE, MONOBASIC ANHYDROUS -> Sodium phosphate, monobasic here vs sodium there).
-- Nothing is merged, retired or moved by this file. Conflicts, hydrates, brand-name rows and
-- misfiled combinations are decided in the review sheet (Joshua) and handled separately; apply
-- phase26a first, because retired PCIDs return 410 without a replaced_by pointer until it is live.

-- Part 1: schema
ALTER TABLE public.precise_forms
  ADD COLUMN IF NOT EXISTS parent_moiety_pcid bigint REFERENCES public.moieties(pcid);

CREATE INDEX IF NOT EXISTS precise_forms_parent_moiety_pcid_idx
  ON public.precise_forms (parent_moiety_pcid);

COMMENT ON COLUMN public.precise_forms.parent_moiety_pcid IS
  'Active moiety this active ingredient (salt/hydrate/ester) belongs to. Backfilled from FDA ingredient links (fda_product_ingredients.form_pcid -> moiety_pcid); phase 30.';

-- Part 2: FDA link, unique moiety, name match agrees or absent
BEGIN;
SET LOCAL pc.change_source = 'phase30_parent_moiety_fda';
WITH fda AS (
  SELECT form_pcid AS pcid, array_agg(DISTINCT moiety_pcid) FILTER (WHERE moiety_pcid IS NOT NULL) AS a
  FROM public.fda_product_ingredients WHERE form_pcid IS NOT NULL GROUP BY 1),
nm AS (
  SELECT pf.pcid, array_agg(DISTINCT e.pcid) AS n
  FROM public.precise_forms pf
  JOIN public.entities e ON lower(trim(e.name)) = lower(trim(pf.base_name))
  JOIN public.moieties m ON m.pcid = e.pcid
  GROUP BY 1),
t AS (
  SELECT pf.pcid, a[1] AS target
  FROM public.precise_forms pf JOIN fda USING (pcid) LEFT JOIN nm USING (pcid)
  WHERE cardinality(a) = 1 AND (n IS NULL OR n = a)
    AND EXISTS (SELECT 1 FROM public.moieties m WHERE m.pcid = a[1]))
UPDATE public.precise_forms pf
SET parent_moiety_pcid = COALESCE(pf.parent_moiety_pcid, t.target)
FROM t WHERE t.pcid = pf.pcid AND pf.parent_moiety_pcid IS NULL;
COMMIT;

-- Part 3: name match only, for forms with no FDA ingredient rows
BEGIN;
SET LOCAL pc.change_source = 'phase30_parent_moiety_name';
WITH t AS (
  SELECT pf.pcid, min(e.pcid) AS target
  FROM public.precise_forms pf
  JOIN public.entities e ON lower(trim(e.name)) = lower(trim(pf.base_name))
  JOIN public.moieties m ON m.pcid = e.pcid
  JOIN public.entities fe ON fe.pcid = pf.pcid
  WHERE pf.parent_moiety_pcid IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.fda_product_ingredients i WHERE i.form_pcid = pf.pcid)
    AND lower(fe.name) LIKE lower(e.name) || '%'
  GROUP BY pf.pcid HAVING count(DISTINCT e.pcid) = 1)
UPDATE public.precise_forms pf
SET parent_moiety_pcid = COALESCE(pf.parent_moiety_pcid, t.target)
FROM t WHERE t.pcid = pf.pcid AND pf.parent_moiety_pcid IS NULL;
COMMIT;

-- Check (expected 1297 linked, 154 unlinked, 0 orphans on 2026-11-02):
-- SELECT count(*) FILTER (WHERE parent_moiety_pcid IS NOT NULL) linked,
--        count(*) FILTER (WHERE parent_moiety_pcid IS NULL) unlinked,
--        count(*) FILTER (WHERE parent_moiety_pcid IS NOT NULL
--                         AND NOT EXISTS (SELECT 1 FROM public.moieties m WHERE m.pcid = parent_moiety_pcid)) orphans
-- FROM public.precise_forms;
