-- Phase 21d — Learn: seed official collections from the 21c generators (docs/learn.md §5.4)
-- Destination: db/phase21d_learn_seed_collections.sql
-- Re-runnable: items are keyed by natural_key, collections by slug, attachments by (collection, item).
-- Everything stays 'draft' until Joshua approves a 50-item sample per template (publish step: 21e).

select public.learn_ensure_collection('do-not-crush', 'Do Not Crush', 'Which drugs and forms should not be crushed, and why.', 'do-not-crush', array['dnc_member','dnc_reason','dnc_reason_mcq'], 'Medication safety', 10);
select public.learn_gen_member_mcq('do-not-crush', 'dnc_member', 'Which of these drugs is on the Pharmacy Commons Do Not Crush list?',
  '%1$s is on the list. Reason: %2$s. Product and form: %3$s.', 'Not on the Pharmacy Commons Do Not Crush list.',
  'The list is curated, not exhaustive. Absence from it does not make a product safe to crush.', 'Pharmacy Commons', 'Medication safety', true);
select public.learn_gen_dnc_reason();
select public.learn_attach('do-not-crush', 'dnc_member', 'Which drugs');
select public.learn_attach('do-not-crush', 'dnc_reason', 'Why (flashcards)');
select public.learn_attach('do-not-crush', 'dnc_reason_mcq', 'Why (multiple choice)');

select public.learn_ensure_collection('anticholinergic-burden', 'Anticholinergic Burden', 'Anticholinergic burden scores for common drugs.', 'anticholinergic-burden', array['acb_score','acb_highest'], 'Medication safety', 20);
select public.learn_gen_attribute_mcq('anticholinergic-burden', 'acb_score', 'What is the anticholinergic burden score of %s?',
  '[{"value":"1","label":"Score 1"},{"value":"2","label":"Score 2"},{"value":"3","label":"Score 3"}]'::jsonb,
  '%1$s: %2$s on the anticholinergic burden scale.', 'Not the recorded score for this drug.',
  'Compiled from third-party scales; sources differ. Use clinical judgment.', 'Pharmacy Commons', 'Medication safety');
select public.learn_gen_acb_highest();
select public.learn_attach('anticholinergic-burden', 'acb_score', 'Score of a drug');
select public.learn_attach('anticholinergic-burden', 'acb_highest', 'Highest-burden drugs');

select public.learn_ensure_collection('arrhythmia-risk', 'Drugs Which Affect Arrhythmia Risk', 'Drugs listed for Long QT and Brugada syndrome risk.', 'arrhythmia-risk', array['arrhythmia_condition'], 'Medication safety', 30);
select public.learn_gen_attribute_mcq('arrhythmia-risk', 'arrhythmia_condition', 'For which arrhythmia condition is %s listed?',
  '[{"value":"Long QT","label":"Long QT only"},{"value":"Brugada","label":"Brugada syndrome only"},{"value":"Brugada; Long QT","label":"Both Long QT and Brugada syndrome"}]'::jsonb,
  '%1$s: %2$s.', 'Not the listing recorded for this drug.',
  'Curated list; not a complete list of QT-prolonging drugs.', 'Pharmacy Commons', 'Medication safety');
select public.learn_attach('arrhythmia-risk', 'arrhythmia_condition', null);

select public.learn_ensure_collection('georgia-mpje-controlled-substances', 'Georgia Controlled Substance Schedules', 'Georgia schedules for controlled substances (MPJE study).', 'georgia-mpje-controlled-substances', array['mpje_schedule'], 'Pharmacy law', 40);
select public.learn_gen_attribute_mcq('georgia-mpje-controlled-substances', 'mpje_schedule', 'Under Georgia law, which schedule is %s?',
  '[{"value":"CS-1","label":"Schedule I"},{"value":"CS-2","label":"Schedule II"},{"value":"CS-3","label":"Schedule III"},{"value":"CS-4","label":"Schedule IV"},{"value":"CS-5","label":"Schedule V"}]'::jsonb,
  '%1$s: %2$s under the Georgia Controlled Substances Act.', 'Not the Georgia schedule for this drug.',
  'Georgia schedules can differ from federal schedules and change by rule. Check current law.', 'State of Georgia', 'Pharmacy law');
select public.learn_attach('georgia-mpje-controlled-substances', 'mpje_schedule', null);

select public.learn_ensure_collection('joint-commission-do-not-use', 'Do Not Use Abbreviations', 'Error-prone abbreviations from the Joint Commission "Do Not Use" list and ISMP additions.', 'joint-commission-do-not-use', array['jc_dnu'], 'Medication safety', 50);
select public.learn_gen_jc_dnu();
select public.learn_attach('joint-commission-do-not-use', 'jc_dnu', null);
