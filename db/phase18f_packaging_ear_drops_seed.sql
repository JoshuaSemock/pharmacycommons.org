-- db/phase18f_packaging_ear_drops_seed.sql
-- Phase 18f: multi-dose ear-drop bottle rows for public.product_packaging (2026-10-13).
-- STATUS: NOT APPLIED. Joshua runs it in the SQL editor, then records it in schema_migrations.
--
-- Source: the FDA label text cached in public.label_section_text (How Supplied section, from
-- openFDA via the label-text function), read 2026-10-13. Each source_url is the DailyMed page
-- for that label's set id. volume_ml is the bottle fill in mL. None of these labels states
-- drops per mL, so the calculator's default applies. Dermotic says to discard the bottle 2
-- months after first use; that is in the note, not in in_use_days, because the label gives
-- months, not days.
-- Left out: single-dose vials (Clotic, Otovel, Cetraxal), Ciprodex (only a 2011 repackager
-- label is on file), and the combination generics (neomycin/polymyxin/hydrocortisone,
-- hydrocortisone/acetic acid), which have no PCID of their own to attach to yet.
--
-- Re-runnable: a row is skipped when its product/basis/source already has one.

insert into public.product_packaging
  (entity_pcid, product_name, basis, volume_ml,
   value_source, source_name, source_url, source_checked, note)
select v.entity_pcid, v.product_name, 'drops', v.volume_ml,
  'manufacturer', v.src, 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=' || v.setid, date '2026-10-13', v.note
from (values
  (4001125, 'Cipro HC Otic 10 mL', 10, 'CIPRO HC OTIC How Supplied (DailyMed label effective 2024-11-08)', 'b26594a3-2adf-4954-8be0-5bd6f8de9671', '10 mL bottle with a dropper dispenser. Drops per mL is not stated on the label.'),
  (4001305, 'Cortisporin-TC Otic 10 mL', 10, 'CORTISPORIN-TC OTIC How Supplied (DailyMed label effective 2024-08-01)', '9c6fc1c7-3350-42ae-b999-aca48e704bb1', '10 mL bottle with dropper. Drops per mL is not stated on the label.'),
  (4001514, 'Dermotic oil 20 mL', 20, 'DERMOTIC How Supplied (DailyMed label effective 2025-05-09)', 'eb00f222-8105-4e05-90e8-bbd129784364', '20 mL bottle, dropper included. The label says to discard Dermotic Oil 2 months after initial use. Drops per mL is not stated on the label.'),
  (4006377, 'Xtoro 5 mL', 5, 'XTORO How Supplied (DailyMed label effective 2026-03-24)', '5c628272-019e-4511-8d5c-dcf56023da25', '5 mL fill in a 5 mL bottle with a controlled drop tip. Drops per mL is not stated on the label.'),
  (1002112, 'Ofloxacin otic solution 0.3% 5 mL', 5, 'Ofloxacin otic solution 0.3% How Supplied, generic label (DailyMed label effective 2024-10-31)', '72ad7b86-1d5b-48c9-bb40-319d6c186f1d', 'Plastic dropper bottle, 5 mL. Drops per mL is not stated on the label.'),
  (1002112, 'Ofloxacin otic solution 0.3% 10 mL', 10, 'Ofloxacin otic solution 0.3% How Supplied, generic label (DailyMed label effective 2024-10-31)', '72ad7b86-1d5b-48c9-bb40-319d6c186f1d', 'Plastic dropper bottle, 10 mL. Drops per mL is not stated on the label.'),
  (1005311, 'Acetic acid otic solution 2% 15 mL', 15, 'Acetic acid otic solution 2% How Supplied, generic label (DailyMed label effective 2024-12-27)', '0c5ebd59-0e98-4ea1-b279-9202a19f6dbf', '15 mL measured-drop safety-tip bottle. Drops per mL is not stated on the label.')
) as v(entity_pcid, product_name, volume_ml, src, setid, note)
where not exists (
  select 1 from public.product_packaging p
  where p.entity_pcid = v.entity_pcid and p.product_name = v.product_name and p.basis = 'drops' and p.value_source = 'manufacturer');
