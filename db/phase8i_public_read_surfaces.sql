-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 8i — Public read surfaces: make the intended-public RPCs and views
-- public on purpose, and clear the security-advisor findings that came from
-- them being public by accident.
-- Destination: db/phase8i_public_read_surfaces.sql
-- Applied as migration phase8i_public_read_surfaces (2026-09-24).
--
-- Decision (Joshua, 2026-09-24): class RPCs, the entity document/changes RPCs,
-- and DailyMed label metadata are public.
--
-- 1. get_class / list_classes / get_entity_classes → SECURITY INVOKER.
--    Every table they read (entities, drug_classes, class_members) already has
--    a public_read policy and moiety_hierarchy is granted to anon, so they need
--    no elevated rights. Clears 6 advisor warnings.
-- 2. api_entity_document / api_entity_changes stay SECURITY DEFINER on purpose:
--    api_entity_document calls api_snapshot(), which writes entity_versions;
--    api_entity_changes must read entity_changes (no public policy) while
--    omitting the actor column. Explicit grants + COMMENTs record the intent;
--    their two advisor warnings each are accepted.
-- 3. DailyMed label tables (U.S. Government work, public domain) get
--    public_read policies, and entity_labels becomes security_invoker with
--    SELECT-only grants (it previously ran as owner and carried INSERT/UPDATE/
--    DELETE/TRUNCATE grants to anon/authenticated).
-- 4. class_display_name / class_type_label get a pinned search_path.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Class RPCs run as the caller
alter function public.get_class(text)                    security invoker;
alter function public.list_classes(text, text)           security invoker;
alter function public.get_entity_classes(bigint, boolean) security invoker;

grant execute on function public.get_class(text)                     to anon, authenticated;
grant execute on function public.list_classes(text, text)            to anon, authenticated;
grant execute on function public.get_entity_classes(bigint, boolean) to anon, authenticated;

-- 2. Intentionally public SECURITY DEFINER RPCs
grant execute on function public.api_entity_document(text, integer)         to anon, authenticated;
grant execute on function public.api_entity_changes(text, integer, bigint)  to anon, authenticated;

comment on function public.api_entity_document(text, integer) is
  'PUBLIC API (intentional SECURITY DEFINER): calls api_snapshot(), which writes entity_versions. Advisor lints 0028/0029 accepted 2026-09-24.';
comment on function public.api_entity_changes(text, integer, bigint) is
  'PUBLIC API (intentional SECURITY DEFINER): reads entity_changes, which has no public policy, and omits the actor column. Advisor lints 0028/0029 accepted 2026-09-24.';

-- 3. DailyMed label data is public; the view runs as the caller
create policy public_read on public.label_documents             for select using (true);
create policy public_read on public.label_document_formulations for select using (true);
create policy public_read on public.label_sections              for select using (true);

alter view public.entity_labels set (security_invoker = true);
revoke all on public.entity_labels from anon, authenticated;
grant select on public.entity_labels to anon, authenticated;

-- 4. Pinned search_path on the two helper functions
alter function public.class_display_name(text) set search_path = pg_catalog, public;
alter function public.class_type_label(text)   set search_path = pg_catalog, public;
