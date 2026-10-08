-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 15i — more page types, and abbreviations beside page titles
-- Destination: db/phase15i_page_types_abbreviations.sql   (run after phase 15h)
--
-- 1. Contributors can create classifications (block 5). They are stored as
--    drug_classes with class_type 'community' (source_system PharmacyCommons,
--    source_agency 'community') so they never mix with the ingested systems
--    (ATC, FDA, VA, ChemOnt) or the 71 curated groups. list_classes() now
--    returns community classes even before they have members, so a new one
--    shows on /classifications straight away.
-- 2. create_page() accepts p_entity_kind = 'class'. New clinical-concept
--    subtypes for terminology (Anatomy, Organism, Procedure, Term, …) need no
--    schema change: concept_type is free text.
-- 3. page_abbreviations(p_name): the dictionary abbreviations whose expansion
--    is this page's name, ignoring case, hyphens and punctuation
--    ("High-altitude pulmonary edema" → HAPE). Joint Commission "Do Not Use"
--    rows (source_tjc_flag) are never offered.
--
-- Applied as three migrations: 15i_a drops the class_type check, 15i_b adds it
-- back with 'community' and (re)defines the functions, 15i_c tightens
-- page_abbreviations() (the version below is the current one).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 15i_a ──────────────────────────────────────────────────────────────────
alter table public.drug_classes drop constraint drug_classes_class_type_chk;

-- ─── 15i_b ──────────────────────────────────────────────────────────────────
alter table public.drug_classes add constraint drug_classes_class_type_chk check (
  class_type is null
  or class_type = any (array['epc', 'moa', 'pe', 'chem', 'atc', 'va', 'chemont', 'curated', 'community'])
);

create or replace function public.class_type_label(t text)
 returns text
 language sql
 immutable
 set search_path to 'pg_catalog', 'public'
as $function$
  select case t
    when 'epc' then 'Pharmacologic class (FDA EPC)'
    when 'moa' then 'Mechanism of action'
    when 'pe'  then 'Physiologic effect'
    when 'chem' then 'Chemical structure (FDA)'
    when 'atc' then 'Therapeutic area (WHO ATC)'
    when 'va'  then 'Therapeutic class (VA)'
    when 'chemont' then 'Chemical taxonomy (ChemOnt)'
    when 'curated' then 'Pharmacy Commons group'
    when 'community' then 'Contributor classification'
    else 'Other' end $function$;

create or replace function public.list_classes(p_type text default null::text, p_search text default null::text)
 returns table(slug text, name text, class_type text, class_type_label text, source_code text, level smallint, member_count bigint)
 language sql
 stable
 set search_path to 'public'
as $function$
  select e.slug, e.name, d.class_type, class_type_label(d.class_type), d.source_code, d.level,
         coalesce(d.member_count, 0)::bigint
  from drug_classes d join entities e using(pcid)
  where (d.member_count > 0 or d.class_type = 'community')
    and (p_type is null or d.class_type=p_type)
    and (p_search is null or e.name ilike '%'||p_search||'%' or d.source_code ilike p_search||'%')
  order by 3, 5 nulls last, 2 $function$;

create or replace function public.create_page(p_entity_kind text, p_name text, p_summary text, p_description text default ''::text, p_body_md text default ''::text, p_subtype text default null::text, p_identifiers jsonb default '{}'::jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  b pcid_blocks%rowtype;
  v_pcid bigint;
  v_slug text := pc_slugify(p_name);
  v_dup bigint;
  v_unii text := nullif(upper(trim(p_identifiers ->> 'unii')), '');
  v_cas  text := nullif(trim(p_identifiers ->> 'cas'), '');
begin
  if not is_verified_contributor() then raise exception 'not_verified' using errcode = '42501'; end if;
  if not exists (select 1 from contributor_profiles where user_id = auth.uid()) then raise exception 'handle_required'; end if;
  if p_entity_kind not in ('moiety', 'combination', 'precise_form', 'formulation', 'class',
                           'clinical', 'measurement', 'target', 'functional') then
    raise exception 'kind_not_creatable';   -- list pages stay curated
  end if;
  if v_slug = '' or length(p_name) > 200 then raise exception 'bad_name'; end if;
  if coalesce(trim(p_summary), '') = '' then raise exception 'summary_required'; end if;
  if p_subtype is not null and length(p_subtype) > 80 then raise exception 'bad_subtype'; end if;
  if not has_role('patroller') and (select count(*) from community_pages
       where created_by = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'rate_limited';
  end if;

  -- Duplicate guards: same slug, same name, or (drug kinds) same UNII/CAS.
  select pcid into v_dup from entities
  where slug = v_slug or lower(name) = lower(trim(p_name)) limit 1;
  if found then raise exception 'page_exists' using detail = v_dup::text; end if;
  if v_unii is not null or v_cas is not null then
    select pcid into v_dup from (
      select pcid, unii, cas from moieties
      union all select pcid, unii, cas from precise_forms
      union all select pcid, unii, cas from combinations
    ) d
    where (v_unii is not null and upper(d.unii) = v_unii) or (v_cas is not null and d.cas = v_cas)
    limit 1;
    if found then raise exception 'identifier_exists' using detail = v_dup::text; end if;
  end if;

  -- Mint from the block (row lock serialises concurrent creates).
  select * into b from pcid_blocks where entity_kind = p_entity_kind for update;
  v_pcid := b.next_pcid;
  if v_pcid > b.max_id then raise exception 'block_full'; end if;
  update pcid_blocks set next_pcid = next_pcid + 1 where block_id = b.block_id;

  perform set_config('pc.change_source', 'community-create', true);
  perform set_config('pc.actor', auth.uid()::text, true);

  insert into entities (pcid, entity_type, slug, slug_uri, name)
  values (v_pcid, p_entity_kind, v_slug, b.slug_prefix || v_slug, trim(p_name));

  case p_entity_kind
    when 'moiety' then
      insert into moieties (pcid, term_type, origin, unii, cas, primary_source)
      values (v_pcid, 'Core moiety', 'community', v_unii, v_cas, 'Pharmacy Commons contributors');
    when 'precise_form' then
      insert into precise_forms (pcid, origin, unii, cas, primary_source)
      values (v_pcid, 'community', v_unii, v_cas, 'Pharmacy Commons contributors');
    when 'combination' then
      insert into combinations (pcid, origin, unii, cas, primary_source)
      values (v_pcid, 'community', v_unii, v_cas, 'Pharmacy Commons contributors');
    when 'formulation' then
      insert into formulations (pcid, origin, primary_source)
      values (v_pcid, 'community', 'Pharmacy Commons contributors');
    when 'class' then
      insert into drug_classes (pcid, class_type, source_system, source_agency, member_count)
      values (v_pcid, 'community', 'PharmacyCommons', 'community', 0);
    when 'clinical' then
      insert into clinical_concepts (pcid, concept_type, source_ref) values (v_pcid, p_subtype, 'community');
    when 'measurement' then
      insert into measurements (pcid, measurement_type) values (v_pcid, p_subtype);
    when 'functional' then
      insert into functional_groups (pcid, group_type, common_name) values (v_pcid, p_subtype, trim(p_name));
    when 'target' then
      insert into biological_targets (pcid) values (v_pcid);
  end case;

  insert into community_pages (pcid, created_by) values (v_pcid, auth.uid());

  if coalesce(trim(p_description), '') <> '' or coalesce(trim(p_body_md), '') <> '' then
    perform save_page(v_pcid, null, p_description, p_body_md, p_summary, 'create');
  end if;

  return jsonb_build_object('pcid', v_pcid, 'pcid_code', 'PCID-' || v_pcid,
                            'slug', v_slug, 'entity_type', p_entity_kind);
end $function$;

-- Expansion lookup key, so page_abbreviations() is an index probe, not a scan.
create index if not exists dictionary_terms_abbr_expansion_idx
  on public.dictionary_terms ((trim(regexp_replace(lower(definition), '[^a-z0-9]+', ' ', 'g'))))
  where kind = 'Abbreviation';

-- Abbreviations whose expansion is this name. Security invoker: reads
-- dictionary_terms and the Do Not Use list under their public read policies.
-- Never offers an abbreviation that is on the Joint Commission "Do Not Use"
-- list in any spelling (the flag is per row, so QD/qd/Q.D. are all checked by
-- lower(term)), only single-token forms (no "BP or B/P", no trailing period),
-- and one spelling per abbreviation (the most common; capitalised on a tie).
create or replace function public.page_abbreviations(p_name text)
 returns table(term text)
 language sql
 stable
 security invoker
 set search_path to 'public'
as $function$
  with n as (select trim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', ' ', 'g')) as k),
  banned as (
    select lower(t.term) as k from dictionary_terms t where t.source_tjc_flag
    union
    select lower(t.term) from list_items li join lists l on l.pcid = li.list_pcid
      join dictionary_terms t on t.id = li.term_id
    where l.slug = 'joint-commission-do-not-use'),
  hits as (
    select t.term, count(*) as n
    from dictionary_terms t, n
    where n.k <> ''
      and t.kind = 'Abbreviation'
      and t.term ~ '^[A-Za-z0-9][A-Za-z0-9/&+-]{0,11}$'
      and lower(t.term) <> n.k
      and trim(regexp_replace(lower(t.definition), '[^a-z0-9]+', ' ', 'g')) = n.k
      and lower(t.term) not in (select k from banned)
    group by t.term),
  one as (
    select distinct on (lower(term)) term, n from hits
    order by lower(term), n desc, (term ~ '^[A-Z]') desc, term)
  select term from one order by n desc, term limit 3 $function$;

grant execute on function public.page_abbreviations(text) to anon, authenticated;
