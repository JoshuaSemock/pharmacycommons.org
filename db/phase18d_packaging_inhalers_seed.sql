-- db/phase18d_packaging_inhalers_seed.sql
-- Phase 18d: inhaler rows for public.product_packaging (2026-10-13).
-- STATUS: applied 2026-10-13 by Joshua in the SQL editor; recorded by hand in schema_migrations (see docs/days-supply.md).
--
-- Source: the FDA label text cached in public.label_section_text (How Supplied section, from
-- openFDA via the label-text function), read 2026-10-13. Each source_url is the DailyMed page
-- for that label's set id. "actuations" is the number of doses the device holds as the label
-- states it (blisters per strip for Diskus and Ellipta, where one blister is one dose).
-- Left out because the cached text did not state them: priming for devices other than Dulera,
-- the Respimat and Aerosphere inhalers whose counts sit in tables, Symbicort 160/4.5.
--
-- Re-runnable: a row is skipped when its product/basis/source already has one.

insert into public.product_packaging
  (entity_pcid, product_name, basis, actuations, prime_actuations,
   value_source, source_name, source_url, source_checked, note)
select v.entity_pcid, v.product_name, 'inhaler', v.actuations, v.prime_actuations,
  'manufacturer', v.src, 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=' || v.setid, date '2026-10-13', v.note
from (values
  (4000124, 'Advair Diskus 100/50', 60, null::int, 'ADVAIR DISKUS How Supplied (DailyMed label effective 2026-03-26)', '4eeb5f6a-593f-4a9e-9692-adefa2caf8fc', 'Disposable inhaler with a foil blister strip of 60 blisters.'),
  (4000125, 'Advair Diskus 250/50', 60, null, 'ADVAIR DISKUS How Supplied (DailyMed label effective 2026-03-26)', '4eeb5f6a-593f-4a9e-9692-adefa2caf8fc', 'Disposable inhaler with a foil blister strip of 60 blisters.'),
  (4000126, 'Advair Diskus 500/50', 60, null, 'ADVAIR DISKUS How Supplied (DailyMed label effective 2026-03-26)', '4eeb5f6a-593f-4a9e-9692-adefa2caf8fc', 'Disposable inhaler with a foil blister strip of 60 blisters.'),
  (4005128, 'Serevent Diskus', 60, null, 'SEREVENT DISKUS How Supplied (DailyMed label effective 2022-10-10)', '12d9728e-6b5c-4aee-bfb0-745e542ed2e4', 'Disposable inhaler with a foil blister strip of 60 blisters.'),
  (4000167, 'Airsupra', 120, null, 'AIRSUPRA How Supplied (DailyMed label effective 2025-09-18)', 'e60aa9f9-5139-44df-b886-ebddc3c7eb13', '120-inhalation canister with a dose indicator, net fill weight 10.7 g.'),
  (4000255, 'Alvesco', 60, null, 'ALVESCO How Supplied (DailyMed label effective 2025-02-28)', '9f6112fb-78ef-43cf-8ae3-36370eb45468', '60 actuations per canister (80 mcg and 160 mcg strengths).'),
  (4000405, 'Anoro Ellipta', 30, null, 'ANORO ELLIPTA How Supplied (DailyMed label effective 2023-06-02)', '2dbd0671-c565-40c5-bf0f-e324db26799c', '30 inhalations (two strips of 30 blisters; one blister from each strip makes a dose). Institutional pack: 7 inhalations.'),
  (4000490, 'Arnuity Ellipta', 30, null, 'ARNUITY ELLIPTA How Supplied (DailyMed label effective 2023-10-18)', '50f193ee-1691-486d-9370-a664df63695c', 'Foil strip of 30 blisters. The 100 mcg and 200 mcg strengths also come as a 14-blister institutional pack.'),
  (4000537, 'Atrovent HFA', 200, null, 'ATROVENT HFA How Supplied (DailyMed label effective 2025-11-05)', '170e98ef-5560-4068-be7d-e649068eb884', 'The actuation indicator starts at 200 and counts down to 0 in steps of 20. Priming is not in the cached text; check the label.'),
  (4000726, 'Bevespi Aerosphere', 120, null, 'BEVESPI AEROSPHERE How Supplied (DailyMed label effective 2023-03-24)', 'ae02436e-9528-490e-a844-0c0f6f2843f9', '120-inhalation canister with a dose indicator, net fill weight 10.7 g.'),
  (4000794, 'Breo Ellipta', 30, null, 'BREO ELLIPTA How Supplied (DailyMed label effective 2024-11-07)', '96428df1-ea05-431a-98d3-1ec2c4b63878', '30 inhalations (two strips of 30 blisters; a blister from each strip makes a dose). Institutional pack: 14 blisters per strip.'),
  (4001739, 'Dulera 120-inhalation canister', 120, 4, 'DULERA How Supplied (DailyMed label effective 2026-07-10)', '8f399784-f257-4f31-b3dc-368bf2a1864d', 'Net fill weight 13 g. The dose counter starts at 124 and reads 120 after initial priming with 4 actuations.'),
  (4001739, 'Dulera 60-inhalation canister', 60, 4, 'DULERA How Supplied (DailyMed label effective 2026-07-10)', '8f399784-f257-4f31-b3dc-368bf2a1864d', 'Net fill weight 8.8 g. The dose counter starts at 64 and reads 60 after initial priming with 4 actuations.'),
  (4002685, 'Incruse Ellipta', 30, null, 'INCRUSE ELLIPTA How Supplied (DailyMed label effective 2023-12-13)', 'dbb64747-1505-49d7-9a33-99dd402e96d3', 'Foil strip of 30 blisters; institutional pack of 7.'),
  (4004752, 'Pulmicort Flexhaler 90 mcg', 60, null, 'PULMICORT FLEXHALER How Supplied (DailyMed label effective 2025-09-04)', 'ae1105cd-69fc-4c15-937f-c535304341c2', '60 actuations per device (90 mcg per dose).'),
  (4004752, 'Pulmicort Flexhaler 180 mcg', 120, null, 'PULMICORT FLEXHALER How Supplied (DailyMed label effective 2025-09-04)', 'ae1105cd-69fc-4c15-937f-c535304341c2', '120 actuations per device (180 mcg per dose).'),
  (4005417, 'Symbicort 80/4.5', 60, null, 'SYMBICORT How Supplied (DailyMed label effective 2026-03-12)', 'a645756c-c692-4bc6-a858-7e7e249561bd', '60-inhalation canister, net fill weight 6.9 g, with a counting device.'),
  (4005801, 'Trelegy Ellipta', 30, null, 'TRELEGY ELLIPTA How Supplied (DailyMed label effective 2023-06-02)', 'b5a81d5a-4648-4c7a-951d-33c014a63c7e', '30 inhalations (two strips of 30 blisters). Institutional pack: 14 blisters per strip.'),
  (4005916, 'Tudorza Pressair 60 doses', 60, null, 'TUDORZA PRESSAIR How Supplied (DailyMed label effective 2022-08-01)', '6f92cceb-a63f-4470-99b6-56179d98f10f', '60 metered doses (NDC 0310-0800-60); also supplied as 30 doses.'),
  (4005916, 'Tudorza Pressair 30 doses', 30, null, 'TUDORZA PRESSAIR How Supplied (DailyMed label effective 2022-08-01)', '6f92cceb-a63f-4470-99b6-56179d98f10f', '30 metered doses (NDC 0310-0800-39).')
) as v(entity_pcid, product_name, actuations, prime_actuations, src, setid, note)
where not exists (
  select 1 from public.product_packaging p
  where p.entity_pcid = v.entity_pcid and p.product_name = v.product_name and p.basis = 'inhaler' and p.value_source = 'manufacturer');
