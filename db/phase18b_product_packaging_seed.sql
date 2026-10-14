-- db/phase18b_product_packaging_seed.sql
-- Phase 18b: first three curated rows for public.product_packaging (2026-10-13).
-- STATUS: applied 2026-10-13 by Joshua in the SQL editor after phase 18; recorded by hand as
-- 20261014003501 phase18b_product_packaging_seed. Live: 3 rows (Lantus SoloStar, ProAir HFA, Xalatan).
--
-- Every figure below was read from the FDA-approved label on 2026-10-13 and the
-- page quoted in source_name / source_url. Nothing is inferred. Where a label does
-- not state a figure (Xalatan: drops per mL), the row leaves it out.
--
-- Re-runnable: each insert is skipped when its product/basis/source already has a row.

insert into public.product_packaging
  (entity_pcid, product_name, basis, container, units_per_container, prime_units, containers_per_box, in_use_days,
   value_source, source_name, source_url, source_checked, note)
select 4003044, 'Lantus SoloStar', 'insulin', 'pen', 300, 2, 5, 28,
  'manufacturer', 'LANTUS prescribing information and Instructions for Use, Sanofi (FDA label, 2022)',
  'https://www.accessdata.fda.gov/drugsatfda_docs/label/2022/021081s076lbl.pdf', date '2026-10-13',
  '3 mL pen, 100 units/mL, 300 units. Safety test of 2 units before every injection. Use a pen for up to 28 days after first use, kept below 86°F (30°C) and not refrigerated.'
where not exists (
  select 1 from public.product_packaging where entity_pcid = 4003044 and product_name = 'Lantus SoloStar' and basis = 'insulin' and value_source = 'manufacturer');

insert into public.product_packaging
  (entity_pcid, product_name, basis, actuations, prime_actuations,
   value_source, source_name, source_url, source_checked, note)
select 4004649, 'ProAir HFA', 'inhaler', 200, 3,
  'manufacturer', 'PROAIR HFA prescribing information, Teva (FDA label, 2019)',
  'https://www.accessdata.fda.gov/drugsatfda_docs/label/2019/021457s036lbl.pdf', date '2026-10-13',
  '8.5 g canister, 200 actuations. Prime with three sprays before first use, and again when it has not been used for more than 2 weeks. Discard when the dose counter shows 0 or at the expiration date, whichever is first.'
where not exists (
  select 1 from public.product_packaging where entity_pcid = 4004649 and product_name = 'ProAir HFA' and basis = 'inhaler' and value_source = 'manufacturer');

insert into public.product_packaging
  (entity_pcid, product_name, basis, volume_ml, in_use_days,
   value_source, source_name, source_url, source_checked, note)
select 4006322, 'Xalatan', 'drops', 2.5, 42,
  'manufacturer', 'XALATAN prescribing information, Pfizer (FDA label, 2022)',
  'https://www.accessdata.fda.gov/drugsatfda_docs/label/2022/020597s054lbl.pdf', date '2026-10-13',
  '2.5 mL in a 5 mL bottle. Once opened, store at up to 77°F (25°C) for 6 weeks. The label does not state drops per mL; it says one drop contains about 1.5 mcg of latanoprost (0.005%, 50 mcg/mL), which would be roughly 33 drops per mL, so the common 20 drops per mL default may undercount drops in this bottle.'
where not exists (
  select 1 from public.product_packaging where entity_pcid = 4006322 and product_name = 'Xalatan' and basis = 'drops' and value_source = 'manufacturer');
