-- Phase 24i: mirror of live migration 'phase24i_remove_georgia_mpje_lists' (schema_migrations version 20261030175407, applied 2026-10-30).
-- Remove the Georgia MPJE list family (parent + legend drugs + exceptions).
-- Same pattern as phase24a: delete the lists rows (list_items follow); the entities rows and PCIDs stay.
delete from public.lists where pcid in (10000020, 10000022) and parent_pcid = 10000024;
delete from public.lists where pcid = 10000024 and slug = 'georgia-mpje';
