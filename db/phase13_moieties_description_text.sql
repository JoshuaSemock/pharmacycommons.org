-- Phase 13 (2026-10-02): one-line drug description on moiety pages.
--
-- moieties.description_text holds a hand-written one-liner shown under the
-- drug name (src/DrugDetail.tsx header; src/api.ts reads it as `description`).
-- It replaces two dead columns: class_pcid (NULL on all 15,619 rows; class
-- membership lives in class_members) and class_name ('Unassigned' on 15,529
-- rows, blank on 90). Other blocks keep their class_pcid/class_name for now.
--
-- Applied as three migrations:
--   phase13a_drop_moieties_class_pcid_fkey      applied 2026-10-02
--   phase13b_moieties_description_text          applied 2026-10-02
--   phase13c_drop_moieties_class_pcid_class_name  NOT YET APPLIED (needs approval)

-- phase13a
alter table public.moieties drop constraint moieties_class_pcid_fkey;

-- phase13b
alter table public.moieties add column description_text text;
comment on column public.moieties.description_text is
  'One-line description shown under the drug name on the moiety page. Written by Joshua Semock, PharmD (Pharmacy Commons-authored). NULL = not written yet; the page shows "Unassigned".';

-- phase13c
alter table public.moieties drop column class_pcid;
alter table public.moieties drop column class_name;
