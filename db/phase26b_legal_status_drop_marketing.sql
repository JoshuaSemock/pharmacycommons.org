-- Phase 26b: remove FDA marketing status from the "Legal status" infobox line (applied 2026-11-01)
-- fda_marketing_status is the union of every Drugs@FDA product status ever seen for a drug,
-- so marketed drugs (lisinopril, gabapentin, amoxicillin...) showed "Discontinued".
-- Display-only change: the fda_marketing_status column and its data are untouched.
update public.infobox_properties
set source_ref = 'rx_status,legal_status'
where key = 'legal_status' and source_ref = 'rx_status,legal_status,fda_marketing_status';

-- Undo:
-- update public.infobox_properties set source_ref = 'rx_status,legal_status,fda_marketing_status' where key = 'legal_status';
