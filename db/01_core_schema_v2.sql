-- RECONSTRUCTED 2026-10-13 from the live Supabase catalog (project nenwovhyrdcdkhxzjiiv).
-- The original file was lost. Live migrations it stands in for (supabase_migrations.schema_migrations):
--   20260905213038 init_schema, 20260909004159 drop_old_fk_constraints,
--   20260909004228 add_new_fk_constraints_to_drugs, 20260909004242 drop_obsolete_views_and_tables,
--   20260919205851 core_schema_v2, 20260919210014 drop_stale_functions_and_fix_search_path,
--   20260919210251 restrict_security_definer_execute, 20260919210517 add_clinical_statements_qualifiers
-- This is the CURRENT shape of those objects (later columns such as moieties.description_text,
-- clinical_statements.qualifier_*, pcid_retired.replaced_by_pcid are folded in), not the history.
-- It is not a replay script for an existing database: every statement is idempotent so it is safe
-- to run, but order matters on a blank database:
--   1. this file   2. phase4_*  3. phase5+ (phase8a attaches trg_log_change and defines log_entity_change)
-- Not included here (defined elsewhere in db/): log_entity_change + trg_log_change (phase8a),
-- api_meta / entity_changes / entity_versions / data_sources (phase8a), pc_slugify (phase15).
-- Never-reconstructable: the data. Seed rows below are the structural ones only.

-- ─── PCID blocks and retirement ──────────────────────────────────────────────
create table if not exists public.pcid_blocks (
  block_id    smallint not null,
  entity_kind text     not null,
  label       text     not null,
  min_id      bigint   not null,
  max_id      bigint   not null,
  slug_prefix text     not null,
  next_pcid   bigint   not null,
  constraint pcid_blocks_pkey PRIMARY KEY (block_id),
  constraint pcid_blocks_entity_kind_key UNIQUE (entity_kind),
  constraint pcid_blocks_check CHECK (((min_id < max_id) AND (next_pcid >= min_id)))
);

-- next_pcid seeded at min_id; live values are higher (see CLAUDE.md). Never overwrite on conflict.
insert into public.pcid_blocks (block_id, entity_kind, label, min_id, max_id, slug_prefix, next_pcid) values
  (1,  'moiety',      'Active Moiety',        1000001,  1999999,  'pc:moiety:',      1000001),
  (2,  'combination', 'Combination Product',  2000001,  2999999,  'pc:combination:', 2000001),
  (3,  'precise_form','Precise Form',         3000001,  3999999,  'pc:precise_form:',3000001),
  (4,  'formulation', 'Marketed Formulation', 4000001,  4999999,  'pc:formulation:', 4000001),
  (5,  'class',       'Pharmacologic Class',  5000001,  5999999,  'pc:class:',       5000001),
  (6,  'clinical',    'Clinical Concept',     6000001,  6999999,  'pc:clinical:',    6000001),
  (7,  'measurement', 'Measurement',          7000001,  7999999,  'pc:measurement:', 7000001),
  (8,  'target',      'Biological Target',    8000001,  8999999,  'pc:target:',      8000001),
  (9,  'functional',  'Functional Group',     9000001,  9999999,  'pc:functional:',  9000001),
  (10, 'list',        'List',                 10000001, 10999999, 'pc:list:',        10000001)
on conflict (block_id) do nothing;

-- ─── Entities ────────────────────────────────────────────────────────────────
create table if not exists public.entities (
  pcid        bigint not null,
  entity_type text   not null,
  slug        text   not null,
  slug_uri    text   not null,
  name        text   not null,
  created_at  timestamp with time zone,
  updated_at  timestamp with time zone,
  constraint entities_pkey PRIMARY KEY (pcid),
  constraint entities_slug_key UNIQUE (slug),
  constraint entities_slug_uri_key UNIQUE (slug_uri)
);
create index if not exists idx_entities_entity_type on public.entities using btree (entity_type);
do $$ begin
  alter table public.entities add constraint entities_entity_type_fkey
    FOREIGN KEY (entity_type) REFERENCES public.pcid_blocks(entity_kind);
exception when duplicate_object then null; end $$;

create table if not exists public.pcid_retired (
  pcid             bigint not null,
  retired_at       timestamp with time zone default now() not null,
  reason           text,
  replaced_by_pcid bigint,
  constraint pcid_retired_pkey PRIMARY KEY (pcid)
);
do $$ begin
  alter table public.pcid_retired add constraint pcid_retired_replaced_by_pcid_fkey
    FOREIGN KEY (replaced_by_pcid) REFERENCES public.entities(pcid);
exception when duplicate_object then null; end $$;

create or replace function public.enforce_pcid_in_block()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pcid_blocks b
        WHERE b.entity_kind = NEW.entity_type
          AND NEW.pcid BETWEEN b.min_id AND b.max_id
    ) THEN
        RAISE EXCEPTION 'PCID % is outside the range for block %', NEW.pcid, NEW.entity_type;
    END IF;
    RETURN NEW;
END;
$function$;

drop trigger if exists trg_entities_pcid_in_block on public.entities;
create trigger trg_entities_pcid_in_block before insert or update on public.entities
  for each row execute function public.enforce_pcid_in_block();

-- ─── Drug-entity tables (blocks 1–4 share one column spine) ──────────────────
create table if not exists public.moieties (
  pcid bigint not null,
  class_pcid bigint,
  class_name text,
  is_controlled boolean,
  controlled_schedule text,
  origin text,
  term_type text,
  base_name text,
  synonym_of_pcid bigint,
  block_exception text,
  primary_brand text,
  drugbank_id text,
  cas text,
  unii text,
  inchi_key text,
  ndc_codes text,
  fda_applnos text,
  lactmed_id text,
  legal_status text,
  statute_citation text,
  mpje_relevance text,
  fda_marketing_status text,
  rx_status text,
  primary_source text,
  source_count integer,
  description_text text,           -- phase 13b
  constraint moieties_pkey PRIMARY KEY (pcid)
);
-- Note: moieties.class_pcid / class_name remain (13c drop not applied); moieties_class_pcid_fkey was dropped in 13a.

create table if not exists public.combinations (
  pcid bigint not null,
  class_pcid bigint,
  class_name text,
  is_controlled boolean,
  controlled_schedule text,
  origin text,
  term_type text,
  base_name text,
  synonym_of_pcid bigint,
  block_exception text,
  primary_brand text,
  drugbank_id text,
  cas text,
  unii text,
  inchi_key text,
  ndc_codes text,
  fda_applnos text,
  lactmed_id text,
  legal_status text,
  statute_citation text,
  mpje_relevance text,
  fda_marketing_status text,
  rx_status text,
  primary_source text,
  source_count integer,
  constraint combinations_pkey PRIMARY KEY (pcid)
);

create table if not exists public.precise_forms (
  pcid bigint not null,
  class_pcid bigint,
  class_name text,
  is_controlled boolean,
  controlled_schedule text,
  origin text,
  term_type text,
  base_name text,
  synonym_of_pcid bigint,
  block_exception text,
  primary_brand text,
  drugbank_id text,
  cas text,
  unii text,
  inchi_key text,
  ndc_codes text,
  fda_applnos text,
  lactmed_id text,
  legal_status text,
  statute_citation text,
  mpje_relevance text,
  fda_marketing_status text,
  rx_status text,
  primary_source text,
  source_count integer,
  constraint precise_forms_pkey PRIMARY KEY (pcid)
);

create table if not exists public.formulations (
  pcid bigint not null,
  class_pcid bigint,
  class_name text,
  is_controlled boolean,
  controlled_schedule text,
  origin text,
  term_type text,
  base_name text,
  synonym_of_pcid bigint,
  block_exception text,
  primary_brand text,
  drugbank_id text,
  cas text,
  unii text,
  inchi_key text,
  ndc_codes text,
  fda_applnos text,
  lactmed_id text,
  legal_status text,
  statute_citation text,
  mpje_relevance text,
  fda_marketing_status text,
  rx_status text,
  primary_source text,
  source_count integer,
  constraint formulations_pkey PRIMARY KEY (pcid)
);

-- ─── Concept tables (blocks 6–9) ─────────────────────────────────────────────
create table if not exists public.clinical_concepts (
  pcid bigint not null,
  concept_type text,
  source_ref text,
  constraint clinical_concepts_pkey PRIMARY KEY (pcid)
);
create table if not exists public.measurements (
  pcid bigint not null,
  measurement_type text,
  units text,
  constraint measurements_pkey PRIMARY KEY (pcid)
);
create table if not exists public.biological_targets (
  pcid bigint not null,
  target_type text,
  source_ref text,
  constraint biological_targets_pkey PRIMARY KEY (pcid)
);
create table if not exists public.functional_groups (
  pcid bigint not null,
  group_type text,
  common_name text,
  family text,
  genus text,
  species text,
  part_used text,
  traditional_use text,
  derived_drug text,
  constraint functional_groups_pkey PRIMARY KEY (pcid)
);

-- Foreign keys to entities (cascade on the satellite tables; class_pcid / synonym_of_pcid do not cascade)
do $$
declare t text;
begin
  foreach t in array array['moieties','combinations','precise_forms','formulations','clinical_concepts','measurements','biological_targets','functional_groups'] loop
    begin
      execute format('alter table public.%I add constraint %I FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE', t, t || '_pcid_fkey');
    exception when duplicate_object then null; end;
  end loop;
  foreach t in array array['moieties','combinations','precise_forms','formulations'] loop
    begin
      execute format('alter table public.%I add constraint %I FOREIGN KEY (synonym_of_pcid) REFERENCES public.entities(pcid)', t, t || '_synonym_of_pcid_fkey');
    exception when duplicate_object then null; end;
    execute format('create index if not exists %I on public.%I using btree (synonym_of_pcid) where (synonym_of_pcid is not null)', t || '_synonym_of_idx', t);
  end loop;
  foreach t in array array['combinations','precise_forms','formulations'] loop
    begin
      execute format('alter table public.%I add constraint %I FOREIGN KEY (class_pcid) REFERENCES public.entities(pcid)', t, t || '_class_pcid_fkey');
    exception when duplicate_object then null; end;
  end loop;
end $$;

-- ─── Triple store ────────────────────────────────────────────────────────────
create table if not exists public.predicates (
  predicate text not null,
  note text,
  constraint predicates_pkey PRIMARY KEY (predicate)
);
-- 37 predicates live (seeded from Legend_Key; interacts_with added in phase16d). Ids only; ON CONFLICT keeps notes.
insert into public.predicates (predicate) values
  ('causes'),('contraindicated_with'),('derived_from'),('dosage_form'),('dosage_frequency'),('has_acronym'),
  ('has_component'),('has_contraindication'),('has_definition'),('has_diagnosis'),('has_dosage'),('has_dose'),
  ('has_formulation'),('has_guidance'),('has_lab_effect'),('has_lower_risk_than'),('has_member'),('has_monitoring'),
  ('has_pgx_association'),('has_pgx_gene'),('has_prevention'),('has_risk_factor'),('has_route'),('has_side_effect'),
  ('has_symptom'),('has_warning'),('induces'),('inhibits'),('interacts_with'),('is_hazardous'),('is_substrate_of'),
  ('lactation_recommendation'),('member_of'),('monitored_by'),('pregnancy_guidance'),('prevents'),('substrate_of'),
  ('treats')
on conflict (predicate) do nothing;

create sequence if not exists public.clinical_statements_statement_id_seq;
create table if not exists public.clinical_statements (
  statement_id bigint default nextval('public.clinical_statements_statement_id_seq'::regclass) not null,
  subject_pcid bigint not null,
  predicate text not null,
  object_pcid bigint,
  object_label text,
  comparator_pcid bigint,
  evidence_level text,
  source_agency text,
  source_doc_id text,
  source_section text,
  source_quote text,
  risk_profile text,
  updated_at timestamp with time zone,
  qualifier_key text,
  qualifier_value text,
  constraint clinical_statements_pkey PRIMARY KEY (statement_id),
  constraint unique_statement_triple UNIQUE (subject_pcid, predicate, object_pcid, object_label),
  constraint clinical_statements_check CHECK ((subject_pcid <> object_pcid)),
  constraint clinical_statements_check1 CHECK (((object_pcid IS NOT NULL) OR (object_label IS NOT NULL)))
);
alter sequence public.clinical_statements_statement_id_seq owned by public.clinical_statements.statement_id;
create index if not exists idx_clinical_statements_object on public.clinical_statements using btree (object_pcid);
create index if not exists clinical_statements_comparator_idx on public.clinical_statements using btree (comparator_pcid) where (comparator_pcid is not null);
create index if not exists idx_clinical_statements_subject on public.clinical_statements using btree (subject_pcid);
create index if not exists idx_clinical_statements_predicate on public.clinical_statements using btree (predicate);
do $$ begin
  alter table public.clinical_statements add constraint clinical_statements_comparator_pcid_fkey FOREIGN KEY (comparator_pcid) REFERENCES public.entities(pcid);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.clinical_statements add constraint clinical_statements_object_pcid_fkey FOREIGN KEY (object_pcid) REFERENCES public.entities(pcid);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.clinical_statements add constraint clinical_statements_predicate_fkey FOREIGN KEY (predicate) REFERENCES public.predicates(predicate);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.clinical_statements add constraint clinical_statements_subject_pcid_fkey FOREIGN KEY (subject_pcid) REFERENCES public.entities(pcid);
exception when duplicate_object then null; end $$;

-- Maintainer batch-change staging (approve_revision() is in the live DB; phase15 adds page_revisions for community edits)
create sequence if not exists public.revisions_id_seq;
create table if not exists public.revisions (
  id bigint default nextval('public.revisions_id_seq'::regclass) not null,
  target_pcid bigint,
  target_table text not null,
  payload jsonb not null,
  status text default 'pending'::text not null,
  submitted_by uuid,
  submitted_at timestamp with time zone default now() not null,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  review_note text,
  constraint revisions_pkey PRIMARY KEY (id),
  constraint revisions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);
alter sequence public.revisions_id_seq owned by public.revisions.id;
create index if not exists idx_revisions_target_pcid on public.revisions using btree (target_pcid);
create index if not exists idx_revisions_status on public.revisions using btree (status);
do $$ begin
  alter table public.revisions add constraint revisions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.revisions add constraint revisions_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.revisions add constraint revisions_target_pcid_fkey FOREIGN KEY (target_pcid) REFERENCES public.entities(pcid);
exception when duplicate_object then null; end $$;

-- ─── Generic helpers ─────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

-- Auto-enable RLS on every new public table (never drop: the ensure_rls event trigger depends on it).
create or replace function public.rls_auto_enable()
 returns event_trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- ─── RLS: public read on the reference tables ────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['pcid_blocks','pcid_retired','entities','moieties','combinations','precise_forms','formulations',
                           'clinical_concepts','measurements','biological_targets','functional_groups','predicates','clinical_statements'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='public_read') then
      execute format('create policy public_read on public.%I for select to public using (true)', t);
    end if;
  end loop;
end $$;

-- revisions: authors see their own; only active-NPI users may submit
alter table public.revisions enable row level security;
do $$ begin
  create policy read_own on public.revisions for select to public
    using (((auth.uid() = submitted_by) OR (auth.uid() = reviewed_by)));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy submit_own on public.revisions for insert to public
    with check (((auth.uid() = submitted_by) AND (EXISTS ( SELECT 1
      FROM provider_verifications pv
      WHERE ((pv.user_id = auth.uid()) AND (pv.status = 'active'::text))))));
exception when duplicate_object then null; end $$;
-- NOTE: the submit_own policy references provider_verifications (phase5_provider_verification.sql); on a blank
-- database run phase5 first or create that policy afterwards.
