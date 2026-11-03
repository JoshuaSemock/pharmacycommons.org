-- Phase 34c — drop the default on physiochemical.source (Joshua, 2026-11-03)
-- Destination: db/phase34c_physiochemical_source_no_default.sql   (run after 34b)
-- Live migration name: phase34c_physiochemical_source_no_default (applied 2026-11-03 via apply_migration)
-- source is NOT NULL and used to default to 'CAS Common Chemistry', so a row inserted without a source
-- would have been labelled CC BY-NC 4.0 data. With no default the insert fails instead.
-- Checked before: 0 rows with a null source, 0 CAS rows. Security advisors afterwards: no new findings.
alter table public.physiochemical alter column source drop default;
comment on column public.physiochemical.source is 'Provenance of the row (PubChem | FDA GSRS | CAS Common Chemistry | ...). Required, no default: the licence follows the source.';
