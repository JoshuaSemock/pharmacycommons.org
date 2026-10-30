-- Phase 24f: mirror of live migration 'phase19c_publish_federal_controlled_substances_lists' (schema_migrations version 20261030172905, applied 2026-10-30).
-- Federal controlled substances table, views and lists (see docs/federal-controlled-substances.md).
update public.lists set description =
  'Substances controlled under the federal Controlled Substances Act (Schedules I–V), with brand names and an importance rating. Filter by schedule to see one group, or open a part below. All High and Medium importance substances are included; some Low importance substances (mostly Schedule I research chemicals) are not yet linked and will be added.'
where pcid = 10000040;

update public.lists set description =
  'Federally controlled substances rated low importance. This part is not yet complete: some Low importance substances (mostly Schedule I research chemicals) are not yet linked and will be added.'
where pcid = 10000046;

update public.lists set published = true, updated_at = now()
where pcid between 10000040 and 10000046;
