-- db/phase18e_packaging_eye_drops_seed.sql
-- Phase 18e: multi-dose eye-drop bottle rows for public.product_packaging (2026-10-13).
-- STATUS: NOT APPLIED. Joshua runs it in the SQL editor, then records it in schema_migrations.
--
-- Source: the FDA label text cached in public.label_section_text (How Supplied section, from
-- openFDA via the label-text function), read 2026-10-13. Each source_url is the DailyMed page
-- for that label's set id. One row per bottle fill size the label lists. volume_ml is the fill
-- in mL, not the container size. None of these labels states drops per mL, so the row leaves
-- it out and the calculator's default applies. in_use_days is filled only where the label
-- gives a time after opening (Rhopressa and Rocklatan 6 weeks, Vyzulta 8 weeks).
-- Left out: single-dose vials (Cequa, Xiidra, Acuvail, Cosopt PF, Zioptan), ointments and gels
-- (Ciloxan, Akten, Lotemax SM, grams not mL), Cystadrops (not a drop-per-mL bottle) and every
-- ear product (Clotic is single-dose vials; the other otic labels are not cached yet).
--
-- Re-runnable: a row is skipped when its product/basis/source already has one.

insert into public.product_packaging
  (entity_pcid, product_name, basis, volume_ml, in_use_days,
   value_source, source_name, source_url, source_checked, note)
select v.entity_pcid, v.product_name, 'drops', v.volume_ml, v.in_use_days,
  'manufacturer', v.src, 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=' || v.setid, date '2026-10-13', v.note
from (values
  (4000239, 'Alphagan P 0.1% 5 mL', 5, null::int, 'ALPHAGAN P How Supplied (DailyMed label effective 2025-09-18)', '264c4494-c225-486f-888a-caaf36be46b3', '5 mL fill. Drops per mL is not stated on the label.'),
  (4000239, 'Alphagan P 0.1% 10 mL', 10, null, 'ALPHAGAN P How Supplied (DailyMed label effective 2025-09-18)', '264c4494-c225-486f-888a-caaf36be46b3', '10 mL fill. Drops per mL is not stated on the label.'),
  (4000239, 'Alphagan P 0.1% 15 mL', 15, null, 'ALPHAGAN P How Supplied (DailyMed label effective 2025-09-18)', '264c4494-c225-486f-888a-caaf36be46b3', '15 mL fill. Drops per mL is not stated on the label.'),
  (4000239, 'Alphagan P 0.15% 5 mL', 5, null, 'ALPHAGAN P How Supplied (DailyMed label effective 2025-09-18)', '264c4494-c225-486f-888a-caaf36be46b3', '5 mL fill. Drops per mL is not stated on the label.'),
  (4000239, 'Alphagan P 0.15% 10 mL', 10, null, 'ALPHAGAN P How Supplied (DailyMed label effective 2025-09-18)', '264c4494-c225-486f-888a-caaf36be46b3', '10 mL fill. Drops per mL is not stated on the label.'),
  (4000239, 'Alphagan P 0.15% 15 mL', 15, null, 'ALPHAGAN P How Supplied (DailyMed label effective 2025-09-18)', '264c4494-c225-486f-888a-caaf36be46b3', '15 mL fill. Drops per mL is not stated on the label.'),
  (4000244, 'Alrex 0.2% 5 mL', 5, null, 'ALREX How Supplied (DailyMed label effective 2022-03-31)', '21c76da0-50a1-41c0-91b8-8cc4dcc27f60', '5 mL fill. Drops per mL is not stated on the label.'),
  (4000244, 'Alrex 0.2% 10 mL', 10, null, 'ALREX How Supplied (DailyMed label effective 2022-03-31)', '21c76da0-50a1-41c0-91b8-8cc4dcc27f60', '10 mL fill. Drops per mL is not stated on the label.'),
  (4000606, 'AzaSite 1% 2.5 mL', 2.5, null, 'AZASITE How Supplied (DailyMed label effective 2024-07-25)', '0c5d6f5e-18ea-436f-8c62-bbaf66effe3d', '2.5 mL fill. Drops per mL is not stated on the label.'),
  (4000620, 'Azopt 1% 10 mL', 10, null, 'AZOPT How Supplied, Novartis (Alcon) (DailyMed label effective 2023-11-24)', '0afb6589-51ba-432c-aed1-20a12d5d3455', '10 mL fill. Drops per mL is not stated on the label.'),
  (4000620, 'Azopt 1% 15 mL', 15, null, 'AZOPT How Supplied, Novartis (Alcon) (DailyMed label effective 2023-11-24)', '0afb6589-51ba-432c-aed1-20a12d5d3455', '15 mL fill. Drops per mL is not stated on the label.'),
  (4000697, 'Bepreve 1.5% 5 mL', 5, null, 'BEPREVE How Supplied (DailyMed label effective 2022-08-31)', '68bbf6a0-c4b5-47c1-8a1c-08220fbdbce6', '5 mL fill. Drops per mL is not stated on the label.'),
  (4000697, 'Bepreve 1.5% 10 mL', 10, null, 'BEPREVE How Supplied (DailyMed label effective 2022-08-31)', '68bbf6a0-c4b5-47c1-8a1c-08220fbdbce6', '10 mL fill. Drops per mL is not stated on the label.'),
  (4000701, 'Besivance 0.6% 5 mL', 5, null, 'BESIVANCE How Supplied (DailyMed label effective 2026-07-23)', '80bf4981-4f86-4d25-83a5-7d5dfe0b22e0', '5 mL fill. Drops per mL is not stated on the label.'),
  (4000722, 'Betimol 0.25% 5 mL', 5, null, 'BETIMOL How Supplied (DailyMed label effective 2025-06-27)', '3ae775f4-340c-4bf4-aa49-8a31daba0f8b', '5 mL fill. Drops per mL is not stated on the label.'),
  (4000722, 'Betimol 0.5% 5 mL', 5, null, 'BETIMOL How Supplied (DailyMed label effective 2025-06-27)', '3ae775f4-340c-4bf4-aa49-8a31daba0f8b', '5 mL fill. Drops per mL is not stated on the label.'),
  (4000722, 'Betimol 0.5% 15 mL', 15, null, 'BETIMOL How Supplied (DailyMed label effective 2025-06-27)', '3ae775f4-340c-4bf4-aa49-8a31daba0f8b', '15 mL fill. Drops per mL is not stated on the label.'),
  (4000725, 'Betoptic S 0.25% 10 mL', 10, null, 'BETOPTIC S How Supplied, Novartis (Alcon) (DailyMed label effective 2025-01-22)', '905ba189-456c-4aa4-8231-39a971374ad8', '10 mL fill. Drops per mL is not stated on the label.'),
  (4000725, 'Betoptic S 0.25% 15 mL', 15, null, 'BETOPTIC S How Supplied, Novartis (Alcon) (DailyMed label effective 2025-01-22)', '905ba189-456c-4aa4-8231-39a971374ad8', '15 mL fill. Drops per mL is not stated on the label.'),
  (4000829, 'BromSite 0.075% 5 mL', 5, null, 'BROMSITE How Supplied (DailyMed label effective 2026-01-08)', '144a5072-341b-4591-8705-773b63044bcc', '5 mL fill. Drops per mL is not stated on the label.'),
  (4001250, 'Combigan 5 mL', 5, null, 'COMBIGAN How Supplied (DailyMed label effective 2026-03-17)', 'feaf1480-a4b8-4486-992a-96be3a596243', '5 mL fill. Drops per mL is not stated on the label.'),
  (4001250, 'Combigan 10 mL', 10, null, 'COMBIGAN How Supplied (DailyMed label effective 2026-03-17)', 'feaf1480-a4b8-4486-992a-96be3a596243', '10 mL fill. Drops per mL is not stated on the label.'),
  (4001250, 'Combigan 15 mL', 15, null, 'COMBIGAN How Supplied (DailyMed label effective 2026-03-17)', 'feaf1480-a4b8-4486-992a-96be3a596243', '15 mL fill. Drops per mL is not stated on the label.'),
  (4001763, 'Durezol 0.05% 5 mL', 5, null, 'DUREZOL How Supplied, Novartis (Alcon) (DailyMed label effective 2026-08-18)', 'ea520a27-f569-4b31-8bad-a25ad54b2caa', '5 mL fill. Drops per mL is not stated on the label.'),
  (4002647, 'Ilevro 0.3% 3 mL', 3, null, 'ILEVRO How Supplied (DailyMed label effective 2026-04-01)', '10f411d3-a81e-074a-e063-6294a90ab547', '3 mL fill. Drops per mL is not stated on the label.'),
  (4003275, 'Lumigan 0.01% 2.5 mL', 2.5, null, 'LUMIGAN How Supplied (DailyMed label effective 2024-06-22)', 'a5e67c75-db88-4372-bb07-c8dd15c97631', '2.5 mL fill. Drops per mL is not stated on the label.'),
  (4003275, 'Lumigan 0.01% 5 mL', 5, null, 'LUMIGAN How Supplied (DailyMed label effective 2024-06-22)', 'a5e67c75-db88-4372-bb07-c8dd15c97631', '5 mL fill. Drops per mL is not stated on the label.'),
  (4003275, 'Lumigan 0.01% 7.5 mL', 7.5, null, 'LUMIGAN How Supplied (DailyMed label effective 2024-06-22)', 'a5e67c75-db88-4372-bb07-c8dd15c97631', '7.5 mL fill. Drops per mL is not stated on the label.'),
  (4003806, 'Nevanac 0.1% 3 mL', 3, null, 'NEVANAC How Supplied (DailyMed label effective 2024-11-05)', '11b9a0cf-2a70-17ef-e063-6394a90a5d9e', '3 mL fill. Drops per mL is not stated on the label.'),
  (4004919, 'Restasis MultiDose 5.5 mL', 5.5, null, 'RESTASIS MULTIDOSE How Supplied (DailyMed label effective 2025-08-21)', '7224d810-bb96-4682-a942-3355e6e8061a', '5.5 mL fill. Drops per mL is not stated on the label.'),
  (4004958, 'Rhopressa 0.02% 2.5 mL', 2.5, 42, 'RHOPRESSA How Supplied (DailyMed label effective 2026-01-20)', '7d4f0e3a-5b86-4c43-982a-813b22ae7e22', '2.5 mL fill. Drops per mL is not stated on the label. After opening, usable for up to 6 weeks (42 days).'),
  (4005002, 'Rocklatan 2.5 mL', 2.5, 42, 'ROCKLATAN How Supplied (DailyMed label effective 2026-08-27)', 'b1d71f41-be06-4a08-94d4-e352198f09c2', '2.5 mL fill. Drops per mL is not stated on the label. After opening, usable for up to 6 weeks (42 days).'),
  (4005162, 'Simbrinza 8 mL', 8, null, 'SIMBRINZA How Supplied, Novartis (Alcon) (DailyMed label effective 2025-03-11)', 'a49c157e-6310-0011-7b7f-e26fc1820d59', '8 mL fill. Drops per mL is not stated on the label.'),
  (4005681, 'Timoptic 0.25% 5 mL', 5, null, 'TIMOPTIC How Supplied (DailyMed label effective 2022-04-30)', '45ac65b3-19f7-4f33-aebf-cadd3daa4bf1', '5 mL fill. Drops per mL is not stated on the label.'),
  (4005683, 'Timoptic-XE 0.25% 5 mL', 5, null, 'TIMOPTIC-XE How Supplied (DailyMed label effective 2022-03-31)', 'a4d03de7-06b7-4cfc-9d1b-616969df209c', '5 mL fill. Drops per mL is not stated on the label.'),
  (4005796, 'Travatan Z 2.5 mL', 2.5, null, 'TRAVATAN Z How Supplied, Novartis (Alcon) (DailyMed label effective 2025-01-31)', '4b5cffb0-74e0-44e4-8e18-f5d56e9db450', '2.5 mL fill. Drops per mL is not stated on the label.'),
  (4005796, 'Travatan Z 5 mL', 5, null, 'TRAVATAN Z How Supplied, Novartis (Alcon) (DailyMed label effective 2025-01-31)', '4b5cffb0-74e0-44e4-8e18-f5d56e9db450', '5 mL fill. Drops per mL is not stated on the label.'),
  (4006174, 'Vigamox 0.5% 3 mL', 3, null, 'VIGAMOX How Supplied (DailyMed label effective 2026-01-22)', '12053b08-7e66-c6f3-e063-6394a90a9cd9', '3 mL fill. Drops per mL is not stated on the label.'),
  (4006281, 'Vyzulta 0.024% 2.5 mL', 2.5, 56, 'VYZULTA How Supplied (DailyMed label effective 2024-02-27)', '60ce7900-a677-4fc2-88d0-1603baa9dbd4', '2.5 mL fill. Drops per mL is not stated on the label. After opening, usable for up to 8 weeks (56 days).'),
  (4006281, 'Vyzulta 0.024% 5 mL', 5, 56, 'VYZULTA How Supplied (DailyMed label effective 2024-02-27)', '60ce7900-a677-4fc2-88d0-1603baa9dbd4', '5 mL fill. Drops per mL is not stated on the label. After opening, usable for up to 8 weeks (56 days).'),
  (4006565, 'Zymaxid 0.5% 2.5 mL', 2.5, null, 'ZYMAXID How Supplied (DailyMed label effective 2016-09-08)', '1160b16c-929a-4e85-9c0b-1d8c96a7678b', '2.5 mL fill. Drops per mL is not stated on the label.')
) as v(entity_pcid, product_name, volume_ml, in_use_days, src, setid, note)
where not exists (
  select 1 from public.product_packaging p
  where p.entity_pcid = v.entity_pcid and p.product_name = v.product_name and p.basis = 'drops' and p.value_source = 'manufacturer');
