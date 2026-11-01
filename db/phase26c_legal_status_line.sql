-- Phase 26c/26d: one-line legal status for Quick Facts (applied 2026-11-01)
-- Values: CS-1..CS-5, Legend, OTC, "Legend and OTC", "CS-n and OTC".
-- Legend/OTC evidence: rx_status, legal_status, controlled_schedule, plus currently marketed
-- single-ingredient Drugs@FDA products (discontinued products ignored).
-- Leftover source labels (non-Rx, Exemption from Rx, Non-CS, Restricted dangerous drug) pass through.
-- Live definitions: pg_get_functiondef('public.legal_status_line'::regproc) and ('public.resolve_property'::regproc).
-- resolve_property gained one branch: source_ref '=legal_status_line' calls the function.
update public.infobox_properties set source_ref = '=legal_status_line' where key = 'legal_status';
-- Undo: update public.infobox_properties set source_ref = 'rx_status,legal_status' where key = 'legal_status';
