-- db/phase18c_packaging_pens_seed.sql
-- Phase 18c: insulin and GLP-1/GIP pen rows for public.product_packaging (2026-10-13).
-- STATUS: NOT APPLIED. Joshua runs it in the SQL editor, then records it in schema_migrations.
--
-- Source: the FDA label text cached in public.label_section_text (How Supplied section and
-- its tables, from openFDA via the label-text function), read 2026-10-13. Each source_url is
-- the DailyMed page for that label's set id. Only figures stated in that text are used.
-- Left out on purpose because the cached sections did not state them: priming units (they sit
-- in the Instructions for Use), Apidra and Tresiba in-use days, doses per Saxenda/Victoza pen.
-- Units per pen = mL x units/mL as the label states both (3 mL, 100 units/mL = 300 units).
--
-- Re-runnable: a row is skipped when its product/basis/source already has one.

insert into public.product_packaging
  (entity_pcid, product_name, basis, container, units_per_container, doses_per_container, containers_per_box, in_use_days,
   value_source, source_name, source_url, source_checked, note)
select v.entity_pcid, v.product_name, v.basis, v.container, v.units_per_container, v.doses_per_container, v.containers_per_box, v.in_use_days,
  'manufacturer', v.src, 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=' || v.setid, date '2026-10-13', v.note
from (values
  (4000115, 'Admelog SoloStar', 'insulin', 'pen', 300, null::int, 5, 28,
   'ADMELOG How Supplied (DailyMed label effective 2025-06-04)', '0691def8-4a7b-4de3-866f-a280989f47f1',
   '3 mL single-patient-use SoloStar prefilled pen, 100 units/mL, carton of 5. In-use pens must be used within 28 days.'),
  (4000433, 'Apidra SoloStar', 'insulin', 'pen', 300, null, 5, null,
   'APIDRA How Supplied (DailyMed label effective 2025-11-25)', 'e7af6a7a-8046-4fb4-9979-4ec4230b23aa',
   '3 mL single-patient-use SoloStar prefilled pen, 100 units/mL, 5 pens per carton. In-use days not read from the cached text; check the label.'),
  (4000660, 'Basaglar KwikPen', 'insulin', 'pen', 300, null, 5, 28,
   'BASAGLAR How Supplied (DailyMed label effective 2026-06-16)', '0ad21db3-2b1c-4ed9-a687-bdd6a74d0aae',
   '3 mL single-patient-use KwikPen, 100 units/mL, 5 pens. In-use pens must be used within 28 days (the Tempo Pen is also 3 mL, 5 pens).'),
  (4002157, 'Fiasp FlexTouch', 'insulin', 'pen', 300, null, 5, 28,
   'FIASP How Supplied (DailyMed label effective 2023-06-21)', '834e7efc-393f-4c55-9125-628562a8a5cf',
   'Carton of five 3 mL single-patient-use FlexTouch pens, 100 units/mL. 28 days in use.'),
  (4002541, 'Humalog Mix50/50 KwikPen', 'insulin', 'pen', 300, null, 5, 10,
   'HUMALOG Mix50/50 How Supplied (DailyMed label effective 2026-07-27)', 'b34cd3ff-d0af-4852-b4ef-2a8b4a93aeae',
   'Five 3 mL single-patient-use KwikPen prefilled pens, 100 units/mL. At room temperature the pen can be used for a total of 10 days including unopened and in-use time; do not refrigerate once in use.'),
  (4005806, 'Tresiba U-100 FlexTouch', 'insulin', 'pen', 300, null, 5, null,
   'TRESIBA How Supplied (DailyMed label effective 2022-07-01)', '456c5e87-3dfd-46fa-8ac0-c6128d4c97c6',
   '3 mL, 100 units/mL, 300 units, 5 pens per pack; max dose 80 units per injection. In-use days not read from the cached text.'),
  (4005806, 'Tresiba U-200 FlexTouch', 'insulin', 'pen', 600, null, 3, null,
   'TRESIBA How Supplied (DailyMed label effective 2022-07-01)', '456c5e87-3dfd-46fa-8ac0-c6128d4c97c6',
   '3 mL, 200 units/mL, 600 units, 3 pens per pack; dials in 2-unit increments, max 160 units per injection. In-use days not read from the cached text.'),
  (4003611, 'Mounjaro single-dose pen', 'injection', 'pen', null, 1, 4, null,
   'MOUNJARO How Supplied (DailyMed label effective 2026-08-27)', 'd2d7da5d-ad07-4228-955f-cf7e355c8cc0',
   'Carton of 4 prefilled single-dose pens (0.5 mL each; 2.5, 5, 7.5, 10, 12.5 or 15 mg). Unrefrigerated storage allowed for up to 21 days total.'),
  (4006465, 'Zepbound single-dose pen', 'injection', 'pen', null, 1, 4, null,
   'ZEPBOUND How Supplied (DailyMed label effective 2026-08-28)', '487cd7e7-434c-4925-99fa-aa80b1cc776b',
   'Carton of 4 prefilled single-dose pens (0.5 mL each). Unrefrigerated storage allowed for up to 21 days total.'),
  (4005083, 'Saxenda', 'injection', 'pen', null, null, null, 30,
   'SAXENDA How Supplied (DailyMed label effective 2026-02-25)', '3946d389-0926-4f77-a708-0acb8153b143',
   '3 mL pen, 6 mg/mL (18 mg), delivers 0.6, 1.2, 1.8, 2.4 or 3 mg; packs of 3 or 5 pens. After first use the pen can be stored for 30 days.'),
  (4006163, 'Victoza', 'injection', 'pen', null, null, null, 30,
   'VICTOZA How Supplied (DailyMed label effective 2025-10-14)', '5a9ef4ea-c76a-4d34-a604-27c5b505f5a4',
   '3 mL pen, 6 mg/mL (18 mg), delivers 0.6, 1.2 or 1.8 mg; packs of 2 or 3 pens. After first use the pen can be stored for 30 days.')
) as v(entity_pcid, product_name, basis, container, units_per_container, doses_per_container, containers_per_box, in_use_days, src, setid, note)
where not exists (
  select 1 from public.product_packaging p
  where p.entity_pcid = v.entity_pcid and p.product_name = v.product_name and p.basis = v.basis and p.value_source = 'manufacturer');
