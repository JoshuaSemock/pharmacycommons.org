-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 8a — Machine-readable view: change history, version history, registry
-- Destination: db/phase8a_history.sql   (applied as migration phase8a_history)
--
-- entity_changes   field-level audit log, written only by trigger.
-- entity_versions  content-hashed snapshots of each PCID's canonical document
--                  (filled by api_snapshot() in phase8b).
-- data_sources     provenance registry: every source key that appears in the
--                  data, with publisher, URL and license where known.
-- api_meta         base URLs / versions / data license, set once here.
--
-- Tagging a bulk load:  begin; set local pc.change_source = 'rxclass-ingest';
--                       ... updates ...; commit;
-- Untagged writes are logged with source 'direct'.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── api_meta ───────────────────────────────────────────────────────────────
create table if not exists public.api_meta (
  key   text primary key,
  value text,
  note  text
);
alter table public.api_meta enable row level security;
drop policy if exists public_read on public.api_meta;
create policy public_read on public.api_meta for select using (true);
grant select on public.api_meta to anon, authenticated;

insert into public.api_meta (key, value, note) values
  ('site_base',      'https://pharmacycommons.org', 'Human-readable site; also the base of permanent /id/PCID-n URIs'),
  ('api_base',       'https://nenwovhyrdcdkhxzjiiv.supabase.co/functions/v1/api', 'Where /v1/... is actually served today. Switch to https://pharmacycommons.org/api once a proxy fronts the site'),
  ('api_version',    'v1', null),
  ('schema_version', '1.0.0', 'Version of the entity document JSON Schema'),
  ('data_license',   null, 'UNSET — aggregated-dataset Creative Commons variant not yet chosen (CC BY 4.0 / CC BY-SA 4.0 / CC0). Documents report null until set.'),
  ('data_license_url', null, null)
on conflict (key) do nothing;

-- ── data_sources ───────────────────────────────────────────────────────────
create table if not exists public.data_sources (
  source_key  text primary key,          -- lower-case, as normalized from the data
  name        text not null,
  publisher   text,
  url         text,
  license     text,                      -- null = see terms_url; never guessed
  terms_url   text,
  kind        text not null check (kind in ('external','curated','derived','machine_assisted')),
  note        text
);
alter table public.data_sources enable row level security;
drop policy if exists public_read on public.data_sources;
create policy public_read on public.data_sources for select using (true);
grant select on public.data_sources to anon, authenticated;

insert into public.data_sources (source_key, name, publisher, url, license, terms_url, kind, note) values
  ('drug_matrix',     'Drug Matrix (Pharmacy Commons master workbook)', 'Pharmacy Commons', 'https://pharmacycommons.org', null, null, 'curated', 'Hand-curated spine; license follows api_meta.data_license'),
  ('pharmacycommons', 'Pharmacy Commons curation', 'Pharmacy Commons', 'https://pharmacycommons.org', null, null, 'curated', null),
  ('compound_master', 'Compound_Master import', 'Pharmacy Commons', null, null, null, 'curated', 'Internal compound list merged into the workbook'),
  ('id_supabase',     'Legacy Pharmacy Commons database', 'Pharmacy Commons', null, null, null, 'curated', 'Rows carried over from the pre-v2 schema'),
  ('rule',            'Rule-based classifier', 'Pharmacy Commons', null, null, null, 'machine_assisted', 'Class assignment from class_rules pattern matching'),
  ('agent_review',    'AI-assisted classification review', 'Pharmacy Commons', null, null, null, 'machine_assisted', 'Class assignment proposed by an AI agent and queued for review'),
  ('drugbank',        'DrugBank', 'OMx Personalized Health / University of Alberta', 'https://go.drugbank.com', null, 'https://go.drugbank.com/legal/terms_of_use', 'external', 'Identifiers and vocabulary only'),
  ('dailymed',        'DailyMed (FDA SPL labels)', 'U.S. National Library of Medicine', 'https://dailymed.nlm.nih.gov', 'Public domain (U.S. Government work)', 'https://dailymed.nlm.nih.gov/dailymed/about-dailymed.cfm', 'external', null),
  ('drugsfda',        'Drugs@FDA via openFDA', 'U.S. Food and Drug Administration', 'https://open.fda.gov/apis/drug/drugsfda/', 'CC0 1.0', 'https://open.fda.gov/license/', 'external', null),
  ('fda_products',    'FDA product listings via openFDA', 'U.S. Food and Drug Administration', 'https://open.fda.gov', 'CC0 1.0', 'https://open.fda.gov/license/', 'external', null),
  ('fda',             'U.S. Food and Drug Administration', 'U.S. Food and Drug Administration', 'https://www.fda.gov', 'Public domain (U.S. Government work)', null, 'external', 'Statement-level evidence (labeling, table of pharmacogenomic biomarkers)'),
  ('lactmed',         'LactMed', 'U.S. National Library of Medicine', 'https://www.ncbi.nlm.nih.gov/books/NBK501922/', 'Public domain (U.S. Government work)', null, 'external', null),
  ('rxnorm',          'RxNorm / RxNav', 'U.S. National Library of Medicine', 'https://www.nlm.nih.gov/research/umls/rxnorm/', null, 'https://www.nlm.nih.gov/research/umls/rxnorm/docs/termsofservice.html', 'external', null),
  ('atc',             'ATC classification (via RxClass)', 'WHO Collaborating Centre for Drug Statistics Methodology', 'https://atcddd.fhi.no', null, 'https://atcddd.fhi.no/copyright_disclaimer/', 'external', null),
  ('va',              'VA drug classes (via RxClass)', 'U.S. Department of Veterans Affairs', 'https://mor.nlm.nih.gov/RxClass/', 'Public domain (U.S. Government work)', null, 'external', null),
  ('chemont',         'ChemOnt chemical taxonomy (ClassyFire)', 'Wishart Lab, University of Alberta', 'http://classyfire.wishartlab.com', null, 'http://classyfire.wishartlab.com', 'external', null),
  ('cas',             'CAS Common Chemistry', 'CAS, a division of the American Chemical Society', 'https://commonchemistry.cas.org', 'CC BY-NC 4.0', 'https://commonchemistry.cas.org', 'external', 'Structure identifiers (physiochemical table)'),
  ('guideline',       'Clinical practice guideline', null, null, null, null, 'external', 'Per-guideline issuer and URL are on the guideline itself')
on conflict (source_key) do nothing;

-- ── entity_changes ─────────────────────────────────────────────────────────
create table if not exists public.entity_changes (
  change_id      bigint generated always as identity primary key,
  pcid           bigint not null,        -- no FK: a deleted entity keeps its history
  table_name     text   not null,
  op             text   not null check (op in ('INSERT','UPDATE','DELETE')),
  row_key        text,                   -- e.g. statement_id / guideline_id for multi-row tables
  changed_fields text[] not null,
  diff           jsonb  not null,        -- {field: {old, new}}
  source         text   not null default 'direct',
  revision_id    bigint,
  actor          uuid,                   -- never exposed by the public API
  changed_at     timestamptz not null default now()
);
create index if not exists entity_changes_pcid_idx on public.entity_changes (pcid, change_id desc);
comment on table public.entity_changes is
  'Append-only, trigger-written field-level history of every PCID. Read publicly only through api_entity_changes(), which omits actor. Tag bulk writes with SET LOCAL pc.change_source.';
alter table public.entity_changes enable row level security;
-- deliberately no policies: no direct anon/authenticated access

create or replace function public.log_entity_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o     jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n     jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  d     jsonb := '{}'::jsonb;
  f     text[] := '{}';
  k     text;
  col   text;
  p     bigint;
  seen  bigint[] := '{}';
  rkey  text := case when tg_nargs > 1 then coalesce(n, o) ->> tg_argv[1] end;
  src   text := coalesce(nullif(current_setting('pc.change_source', true), ''), 'direct');
  rev   bigint := nullif(current_setting('pc.revision_id', true), '')::bigint;
  who   uuid := coalesce(nullif(current_setting('pc.actor', true), '')::uuid, auth.uid());
begin
  for k in select jsonb_object_keys(coalesce(n, o)) loop
    continue when k in ('created_at', 'updated_at');
    if tg_op = 'UPDATE' then
      continue when (o -> k) is not distinct from (n -> k);
    elsif jsonb_typeof(coalesce(n, o) -> k) = 'null' then
      continue;  -- inserts/deletes: record only populated fields
    end if;
    d := d || jsonb_build_object(k, jsonb_build_object('old', o -> k, 'new', n -> k));
    f := f || k;
  end loop;

  if cardinality(f) = 0 then
    return null;
  end if;

  -- One log row per affected PCID (a statement touches subject, object and comparator)
  foreach col in array string_to_array(tg_argv[0], ',') loop
    for p in select distinct x::bigint
             from unnest(array[o ->> col, n ->> col]) x
             where x is not null loop
      continue when p = any(seen);
      seen := seen || p;
      insert into entity_changes (pcid, table_name, op, row_key, changed_fields, diff, source, revision_id, actor)
      values (p, tg_table_name, tg_op, rkey, f, d, src, rev, who);
    end loop;
  end loop;
  return null;
end;
$$;
revoke execute on function public.log_entity_change() from public, anon, authenticated;

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('entities',            'pcid',                                    null),
      ('moieties',            'pcid',                                    null),
      ('combinations',        'pcid',                                    null),
      ('precise_forms',       'pcid',                                    null),
      ('formulations',        'pcid',                                    null),
      ('drug_classes',        'pcid',                                    null),
      ('clinical_concepts',   'pcid',                                    null),
      ('measurements',        'pcid',                                    null),
      ('biological_targets',  'pcid',                                    null),
      ('functional_groups',   'pcid',                                    null),
      ('physiochemical',      'pcid',                                    null),
      ('clinical_statements', 'subject_pcid,object_pcid,comparator_pcid', 'statement_id'),
      ('entity_guidelines',   'pcid',                                    'guideline_id')
    ) v(tbl, cols, rowkey)
  loop
    execute format('drop trigger if exists trg_log_change on public.%I', t.tbl);
    if t.rowkey is null then
      execute format(
        'create trigger trg_log_change after insert or update or delete on public.%I
           for each row execute function public.log_entity_change(%L)', t.tbl, t.cols);
    else
      execute format(
        'create trigger trg_log_change after insert or update or delete on public.%I
           for each row execute function public.log_entity_change(%L, %L)', t.tbl, t.cols, t.rowkey);
    end if;
  end loop;
end $$;

-- ── entity_versions ────────────────────────────────────────────────────────
create table if not exists public.entity_versions (
  pcid           bigint  not null,
  version        integer not null,
  content        jsonb   not null,        -- the hashed body; envelope is added at serve time
  content_hash   text    not null,        -- sha256 of content::text
  reason         text    not null check (reason in ('baseline','change','derived')),
  change_through bigint,                  -- highest entity_changes.change_id folded into this version
  created_at     timestamptz not null default now(),
  primary key (pcid, version)
);
comment on table public.entity_versions is
  'Immutable snapshots of each PCID''s canonical document content. reason: baseline = first capture; change = a logged edit to this record; derived = upstream derived data changed (brand/class/label rebuilds) with no direct edit.';
alter table public.entity_versions enable row level security;
drop policy if exists public_read on public.entity_versions;
create policy public_read on public.entity_versions for select using (true);
grant select on public.entity_versions to anon, authenticated;

-- ── approve_revision: tag its writes so history shows the revision ─────────
create or replace function public.approve_revision(p_revision_id bigint, p_reviewer uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    r revisions%rowtype;
begin
    select * into r from revisions where id = p_revision_id and status = 'pending';
    if not found then
        raise exception 'No pending revision with id %', p_revision_id;
    end if;

    perform set_config('pc.change_source', 'revision', true);
    perform set_config('pc.revision_id', p_revision_id::text, true);
    perform set_config('pc.actor', coalesce(r.submitted_by::text, ''), true);

    if r.target_table = 'entities' then
        update entities
        set name = coalesce(r.payload->>'name', name),
            updated_at = now()
        where pcid = r.target_pcid;
    else
        raise exception 'approve_revision: target_table % not yet handled', r.target_table;
    end if;

    update revisions
    set status = 'approved', reviewed_by = p_reviewer, reviewed_at = now()
    where id = p_revision_id;
end;
$function$;
revoke execute on function public.approve_revision(bigint, uuid) from public, anon, authenticated;
