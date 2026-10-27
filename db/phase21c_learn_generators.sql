-- Phase 21c — Learn: template generators (docs/learn.md §5)
-- Destination: db/phase21c_learn_generators.sql
-- Rebuildable generators that turn published lists into study items. All are SECURITY DEFINER,
-- idempotent (natural_key + ON CONFLICT DO NOTHING) and NOT executable by anon/authenticated.
-- Items are created as status 'draft'; nothing is visible to learners until Joshua approves a
-- 50-item sample per template and a publish step runs (21e).
--
-- Quality gates (reported per call as jsonb):
--   * answers are block-1 core moieties only (moieties.term_type = 'Core moiety', synonym_of_pcid null)
--   * distractors come from Notable Drugs core moieties, never on the target list (or any sub-list)
--     and never a synonym of a list member; distractor choice is deterministic (md5), sharing an
--     FDA EPC class with the answer when possible
--   * Do Not Crush distractors additionally exclude any moiety with a modified-release /
--     transmucosal FDA dosage form (so a distractor cannot be "also correct")
--   * attribute MCQs only use values that match the fixed option set exactly (combined / odd
--     values such as 'CS-2; CS-5' are rejected, not guessed)

-- ---------------------------------------------------------------- helpers

create or replace function public.learn_list_pool(p_slug text)
returns table (pcid bigint, name text, slug text, legal_status text, value numeric, note text, pos integer)
language sql stable security definer set search_path = public as $fn$
  select distinct on (m.pcid) m.pcid, e.name, e.slug, li.legal_status, li.value, li.note, li.position
  from public.lists l
  join public.list_items li on li.list_pcid = l.pcid
  join public.moieties m on m.pcid = li.member_pcid and m.term_type = 'Core moiety' and m.synonym_of_pcid is null
  join public.entities e on e.pcid = m.pcid
  where l.slug = p_slug and l.published
  order by m.pcid, li.position
$fn$;

create or replace function public.learn_ensure_collection(
  p_slug text, p_title text, p_description text, p_list_slug text, p_templates text[], p_subject text, p_sort int default 0)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_list bigint;
begin
  select pcid into v_list from public.lists where slug = p_list_slug;
  insert into public.learn_collections (slug, title, description, subject_area, topic, is_official, status, source_list_pcid, template_keys, sort_order)
  values (p_slug, p_title, p_description, p_subject, p_title, true, 'draft', v_list, p_templates, p_sort)
  on conflict (slug) do update set template_keys = excluded.template_keys, description = excluded.description
  returning id into v_id;
  return v_id;
end $fn$;

-- Attach every item of a template (for the collection's source list) to the collection.
create or replace function public.learn_attach(p_collection_slug text, p_template_key text, p_section text)
returns int language plpgsql security definer set search_path = public as $fn$
declare n int;
begin
  insert into public.learn_collection_items (collection_id, item_id, sort_order, section_label)
  select c.id, i.id, (row_number() over (order by i.natural_key))::int, p_section
  from public.learn_collections c
  join public.learn_items i on i.template_key = p_template_key and i.source_list_pcid = c.source_list_pcid and i.is_official
  where c.slug = p_collection_slug
  on conflict (collection_id, item_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $fn$;

create or replace function public.learn_link_entities(p_template_key text)
returns int language plpgsql security definer set search_path = public as $fn$
declare n int;
begin
  insert into public.learn_item_entities (item_id, pcid, role)
  select id, primary_pcid, 'primary' from public.learn_items
  where template_key = p_template_key and primary_pcid is not null
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $fn$;

-- ---------------------------------------------------------------- list_member_mcq
-- "Which of these drugs is on <list>?"  one correct member + 3 deterministic non-member distractors.
create or replace function public.learn_gen_member_mcq(
  p_list_slug text, p_template_key text, p_stem text, p_ok_fmt text, p_wrong text, p_caveat text,
  p_agency text, p_subject text, p_release_filter boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare l public.lists%rowtype; v_cands int; v_new int; v_noclass int;
begin
  select * into l from public.lists where slug = p_list_slug and published;
  if not found then raise exception 'list % not found or unpublished', p_list_slug; end if;

  create temp table _picks on commit drop as
  with target_lists as (select pcid from public.lists where pcid = l.pcid or parent_pcid = l.pcid),
  members as (select distinct li.member_pcid as pcid from public.list_items li join target_lists t on t.pcid = li.list_pcid where li.member_pcid is not null),
  excl as (
    select pcid from members
    union select m.pcid from public.moieties m join members x on m.synonym_of_pcid = x.pcid
    union select m.synonym_of_pcid from public.moieties m join members x on m.pcid = x.pcid where m.synonym_of_pcid is not null),
  rel as (
    select distinct fpi.moiety_pcid as pcid
    from public.fda_product_ingredients fpi join public.fda_products p on p.product_id = fpi.product_id
    where p_release_filter and fpi.moiety_pcid is not null
      and p.dosage_form ~* '(extended|delayed|sustained|controlled|release|disintegrating|sublingual|buccal)'),
  pool as (
    select np.* from public.learn_list_pool('notable-drugs') np
    where np.pcid not in (select pcid from excl) and np.pcid not in (select pcid from rel)),
  answers as (select * from public.learn_list_pool(p_list_slug))
  select a.pcid, a.name, a.legal_status, a.note, a.pos,
    (select jsonb_agg(jsonb_build_object('pcid', d.pcid, 'name', d.name) order by d.rk)
       from (select p.pcid, p.name,
                    row_number() over (order by
                      (exists (select 1 from public.class_members c1
                               join public.class_members c2 on c2.class_pcid = c1.class_pcid and c2.member_pcid = p.pcid
                               join public.drug_classes dc on dc.pcid = c1.class_pcid
                               where c1.member_pcid = a.pcid and dc.class_type = 'epc') ) desc,
                      md5(a.pcid::text || '-' || p.pcid::text)) as rk
             from pool p where p.pcid <> a.pcid) d
       where d.rk <= 3) as dists
  from answers a;

  select count(*) into v_cands from _picks;
  select count(*) into v_noclass from _picks where dists is null or jsonb_array_length(dists) < 3;

  insert into public.learn_items (
    natural_key, item_type, template_key, generation_method, is_official, status,
    subject_area, topic, jurisdiction, difficulty_level, tags, primary_pcid,
    prompt, concise_answer, clinical_rationale, clinical_caveats, mcq_options,
    source_kind, source_list_pcid, source_agency, source_citation, source_url, license)
  select
    p_template_key || ':' || l.pcid || ':' || k.pcid, 'mcq', p_template_key, 'template', true, 'draft',
    p_subject, l.title, l.jurisdiction, 2, array['list:' || l.slug], k.pcid,
    p_stem, k.name,
    format(p_ok_fmt, k.name, coalesce(k.legal_status, '—'), coalesce(k.note, '')),
    p_caveat,
    (select jsonb_agg(jsonb_build_object('id', chr(96 + q.rn::int), 'text', q.txt, 'is_correct', q.ok,
                       'rationale', case when q.ok then format(p_ok_fmt, k.name, coalesce(k.legal_status, '—'), coalesce(k.note, '')) else p_wrong end) order by q.rn)
       from (select o.txt, o.ok, row_number() over (order by md5(p_template_key || k.pcid::text || o.txt)) rn
             from (select k.name as txt, true as ok
                   union all select d->>'name', false from jsonb_array_elements(k.dists) d) o) q),
    'list', l.pcid, p_agency, l.source_citation, l.source_url, l.license
  from _picks k
  where jsonb_array_length(coalesce(k.dists, '[]'::jsonb)) = 3
  on conflict (natural_key) do nothing;
  get diagnostics v_new = row_count;

  perform public.learn_link_entities(p_template_key);
  drop table _picks;
  return jsonb_build_object('template', p_template_key, 'candidates', v_cands,
    'rejected_fewer_than_3_distractors', v_noclass, 'created', v_new,
    'already_existed', v_cands - v_noclass - v_new);
end $fn$;

-- ---------------------------------------------------------------- attribute MCQ
-- "What is <attribute> of <drug>?"  fixed option set; answers whose value is not exactly one option are rejected.
-- attribute = coalesce(list_items.legal_status, list_items.value as integer)
create or replace function public.learn_gen_attribute_mcq(
  p_list_slug text, p_template_key text, p_stem_fmt text, p_options jsonb, p_ok_fmt text, p_wrong text,
  p_caveat text, p_agency text, p_subject text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare l public.lists%rowtype; v_cands int; v_new int; v_rej int;
begin
  select * into l from public.lists where slug = p_list_slug and published;
  if not found then raise exception 'list % not found or unpublished', p_list_slug; end if;

  create temp table _attr on commit drop as
  select a.pcid, a.name, a.note, coalesce(a.legal_status, (a.value::int)::text) as attr
  from public.learn_list_pool(p_list_slug) a;

  select count(*) into v_cands from _attr;
  select count(*) into v_rej from _attr a
    where not exists (select 1 from jsonb_array_elements(p_options) o where o->>'value' = a.attr);

  insert into public.learn_items (
    natural_key, item_type, template_key, generation_method, is_official, status,
    subject_area, topic, jurisdiction, difficulty_level, tags, primary_pcid,
    prompt, concise_answer, clinical_rationale, clinical_caveats, mcq_options,
    source_kind, source_list_pcid, source_agency, source_citation, source_url, license, third_party_sources)
  select
    p_template_key || ':' || l.pcid || ':' || a.pcid, 'mcq', p_template_key, 'template', true, 'draft',
    p_subject, l.title, l.jurisdiction, 2, array['list:' || l.slug, 'fixed-option-order'], a.pcid,
    format(p_stem_fmt, a.name),
    (select o->>'label' from jsonb_array_elements(p_options) o where o->>'value' = a.attr),
    format(p_ok_fmt, a.name, (select o->>'label' from jsonb_array_elements(p_options) o where o->>'value' = a.attr), coalesce(a.note, '')),
    p_caveat,
    (select jsonb_agg(jsonb_build_object('id', chr(96 + q.rn::int), 'text', q.o->>'label', 'is_correct', (q.o->>'value') = a.attr,
        'rationale', case when (q.o->>'value') = a.attr then format(p_ok_fmt, a.name, q.o->>'label', coalesce(a.note, '')) else p_wrong end) order by q.rn)
       from (select o, ordinality as rn from jsonb_array_elements(p_options) with ordinality as t(o, ordinality)) q),
    'list', l.pcid, p_agency, l.source_citation, l.source_url, l.license,
    case when p_list_slug = 'anticholinergic-burden' then array[l.source_citation] else '{}'::text[] end
  from _attr a
  where exists (select 1 from jsonb_array_elements(p_options) o where o->>'value' = a.attr)
  on conflict (natural_key) do nothing;
  get diagnostics v_new = row_count;

  perform public.learn_link_entities(p_template_key);
  drop table _attr;
  return jsonb_build_object('template', p_template_key, 'candidates', v_cands,
    'rejected_value_not_in_option_set', v_rej, 'created', v_new,
    'already_existed', v_cands - v_rej - v_new);
end $fn$;

-- ---------------------------------------------------------------- acb_highest
-- "Which of these has an anticholinergic score of 3?"  distractors are score-1/2 members of the same list,
-- so every distractor is a known negative by construction.
create or replace function public.learn_gen_acb_highest()
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare l public.lists%rowtype; v_cands int; v_new int; v_rej int;
begin
  select * into l from public.lists where slug = 'anticholinergic-burden' and published;
  if not found then raise exception 'anticholinergic-burden not found'; end if;

  create temp table _acb on commit drop as
  with pool as (select pcid, name, (value::int) as score, note from public.learn_list_pool('anticholinergic-burden')),
  answers as (select * from pool where score = 3)
  select a.pcid, a.name, a.note,
    (select jsonb_agg(jsonb_build_object('pcid', d.pcid, 'name', d.name, 'score', d.score) order by d.rk)
       from (select p.pcid, p.name, p.score,
                    row_number() over (order by
                      (exists (select 1 from public.class_members c1
                               join public.class_members c2 on c2.class_pcid = c1.class_pcid and c2.member_pcid = p.pcid
                               join public.drug_classes dc on dc.pcid = c1.class_pcid
                               where c1.member_pcid = a.pcid and dc.class_type = 'epc')) desc,
                      md5(a.pcid::text || '-' || p.pcid::text)) rk
             from pool p where p.score in (1, 2) and p.pcid <> a.pcid) d where d.rk <= 3) dists
  from answers a;

  select count(*) into v_cands from _acb;
  select count(*) into v_rej from _acb where jsonb_array_length(coalesce(dists, '[]'::jsonb)) < 3;

  insert into public.learn_items (
    natural_key, item_type, template_key, generation_method, is_official, status,
    subject_area, topic, difficulty_level, tags, primary_pcid,
    prompt, concise_answer, clinical_rationale, clinical_caveats, mcq_options,
    source_kind, source_list_pcid, source_agency, source_citation, source_url, license, third_party_sources)
  select
    'acb_highest:' || l.pcid || ':' || k.pcid, 'mcq', 'acb_highest', 'template', true, 'draft',
    'Medication safety', l.title, 2, array['list:' || l.slug], k.pcid,
    'Which of these drugs has the highest anticholinergic burden score (3) on the scale?', k.name,
    format('%s scores 3 on the anticholinergic burden scale. The other options score 1 or 2.', k.name),
    'Scores come from a compiled third-party scale; scales differ between sources. Use clinical judgment.',
    (select jsonb_agg(jsonb_build_object('id', chr(96 + q.rn::int), 'text', q.txt, 'is_correct', q.ok,
        'rationale', case when q.ok then format('%s scores 3.', k.name) else format('%s scores %s.', q.txt, q.sc) end) order by q.rn)
       from (select o.txt, o.ok, o.sc, row_number() over (order by md5('acb_highest' || k.pcid::text || o.txt)) rn
             from (select k.name as txt, true as ok, '3' as sc
                   union all select d->>'name', false, d->>'score' from jsonb_array_elements(k.dists) d) o) q),
    'list', l.pcid, 'Pharmacy Commons', l.source_citation, l.source_url, l.license, array[l.source_citation]
  from _acb k where jsonb_array_length(coalesce(k.dists, '[]'::jsonb)) = 3
  on conflict (natural_key) do nothing;
  get diagnostics v_new = row_count;

  perform public.learn_link_entities('acb_highest');
  drop table _acb;
  return jsonb_build_object('template', 'acb_highest', 'candidates', v_cands, 'rejected_fewer_than_3_distractors', v_rej,
    'created', v_new, 'already_existed', v_cands - v_rej - v_new);
end $fn$;

-- ---------------------------------------------------------------- dnc_reason (flashcards + single-reason MCQs)
create or replace function public.learn_gen_dnc_reason()
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare l public.lists%rowtype; v_cands int; v_cards int; v_mcq int; v_multi int; v_other int;
  v_opts jsonb := '[{"value":"Modified-release","label":"Modified-release (crushing defeats the release mechanism)"},
                    {"value":"Irritant","label":"Irritant (mucosal or GI irritation)"},
                    {"value":"Hazardous/teratogenic","label":"Hazardous or teratogenic (exposure risk to handler)"},
                    {"value":"Unpleasant taste","label":"Unpleasant taste"},
                    {"value":"Transmucosal","label":"Transmucosal (absorbed through the mouth lining)"}]'::jsonb;
begin
  select * into l from public.lists where slug = 'do-not-crush' and published;
  if not found then raise exception 'do-not-crush not found'; end if;

  select count(*) into v_cands from public.learn_list_pool('do-not-crush') where legal_status is not null;

  -- flashcards: every core member with a recorded reason
  insert into public.learn_items (
    natural_key, item_type, template_key, generation_method, is_official, status,
    subject_area, topic, difficulty_level, tags, primary_pcid,
    prompt, concise_answer, clinical_rationale, clinical_caveats,
    source_kind, source_list_pcid, source_agency, source_citation, source_url, license)
  select 'dnc_reason:' || l.pcid || ':' || a.pcid, 'flashcard', 'dnc_reason', 'template', true, 'draft',
    'Medication safety', l.title, 2, array['list:' || l.slug],  a.pcid,
    format('Why is %s%s on the Do Not Crush list?', a.name, case when a.note is not null then ' (' || a.note || ')' else '' end),
    a.legal_status,
    'Reason recorded on the Pharmacy Commons Do Not Crush list. Product and form: ' || coalesce(a.note, 'not recorded') || '.',
    'The list is a curated reference, not exhaustive. Confirm against the specific product and form before altering it.',
    'list', l.pcid, 'Pharmacy Commons', l.source_citation, l.source_url, l.license
  from public.learn_list_pool('do-not-crush') a where a.legal_status is not null
  on conflict (natural_key) do nothing;
  get diagnostics v_cards = row_count;

  -- MCQs: exactly one reason, from the five concrete categories ('Other' and multi-reason rows are rejected)
  select count(*) into v_multi from public.learn_list_pool('do-not-crush') where legal_status like '%;%';
  select count(*) into v_other from public.learn_list_pool('do-not-crush') where legal_status = 'Other';

  insert into public.learn_items (
    natural_key, item_type, template_key, generation_method, is_official, status,
    subject_area, topic, difficulty_level, tags, primary_pcid,
    prompt, concise_answer, clinical_rationale, clinical_caveats, mcq_options,
    source_kind, source_list_pcid, source_agency, source_citation, source_url, license)
  select 'dnc_reason_mcq:' || l.pcid || ':' || a.pcid, 'mcq', 'dnc_reason_mcq', 'template', true, 'draft',
    'Medication safety', l.title, 2, array['list:' || l.slug, 'fixed-option-order'], a.pcid,
    format('What is the main reason %s%s should not be crushed?', a.name, case when a.note is not null then ' (' || a.note || ')' else '' end),
    (select o->>'label' from jsonb_array_elements(v_opts) o where o->>'value' = a.legal_status),
    format('The Do Not Crush list records %s for %s.', lower(a.legal_status), a.name),
    'The list is a curated reference, not exhaustive. Confirm against the specific product and form.',
    (select jsonb_agg(jsonb_build_object('id', chr(96 + q.rn::int), 'text', q.o->>'label', 'is_correct', (q.o->>'value') = a.legal_status,
        'rationale', case when (q.o->>'value') = a.legal_status then 'Reason recorded on the list.' else 'Not the reason recorded on the list for this drug.' end) order by q.rn)
       from (select o, ordinality as rn from jsonb_array_elements(v_opts) with ordinality as t(o, ordinality)) q),
    'list', l.pcid, 'Pharmacy Commons', l.source_citation, l.source_url, l.license
  from public.learn_list_pool('do-not-crush') a
  where exists (select 1 from jsonb_array_elements(v_opts) o where o->>'value' = a.legal_status)
  on conflict (natural_key) do nothing;
  get diagnostics v_mcq = row_count;

  perform public.learn_link_entities('dnc_reason');
  perform public.learn_link_entities('dnc_reason_mcq');
  return jsonb_build_object('template', 'dnc_reason(+_mcq)', 'candidates_with_reason', v_cands,
    'flashcards_created', v_cards, 'mcq_created', v_mcq,
    'mcq_rejected_multi_reason', v_multi, 'mcq_rejected_reason_other', v_other);
end $fn$;

-- ---------------------------------------------------------------- jc_dnu
-- One flashcard per concept: case/punctuation variants (U/u, QD/Q.D./q.d./qd, ...) are consolidated.
create or replace function public.learn_gen_jc_dnu()
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare l public.lists%rowtype; v_rows int; v_groups int; v_new int;
begin
  select * into l from public.lists where slug = 'joint-commission-do-not-use' and published;
  if not found then raise exception 'joint-commission-do-not-use not found'; end if;
  select count(*) into v_rows from public.list_items where list_pcid = l.pcid;

  create temp table _jc on commit drop as
  select lower(regexp_replace(t.term, '[.\s]', '', 'g')) as k,
         min(li.position) as pos,
         string_agg(distinct t.term, ' / ' order by t.term) as variants,
         (array_agg(li.note order by li.position))[1] as note,
         (array_agg(t.definition order by li.position))[1] as def,
         (array_agg(li.legal_status order by li.position))[1] as agency
  from public.list_items li join public.dictionary_terms t on t.id = li.term_id
  where li.list_pcid = l.pcid
  group by 1;
  select count(*) into v_groups from _jc;

  insert into public.learn_items (
    natural_key, item_type, template_key, generation_method, is_official, status,
    subject_area, topic, difficulty_level, tags,
    prompt, concise_answer, clinical_rationale, clinical_caveats,
    source_kind, source_list_pcid, source_agency, source_citation, source_url, license, third_party_sources)
  select 'jc_dnu:' || l.pcid || ':' || left(regexp_replace(j.k, '[^a-z0-9]+', '-', 'g'), 40), 'flashcard', 'jc_dnu', 'template', true, 'draft',
    'Medication safety', l.title, 1, array['list:' || l.slug, 'abbreviations'],
    format('Do Not Use: %s. What is the risk, and what should you write instead?', j.variants),
    j.note, j.def,
    case when j.agency = 'ISMP addition' then 'Added by ISMP; not part of the original Joint Commission list.' end,
    'list', l.pcid, j.agency, l.source_citation, l.source_url, l.license, array[l.source_citation]
  from _jc j
  on conflict (natural_key) do nothing;
  get diagnostics v_new = row_count;
  drop table _jc;
  return jsonb_build_object('template', 'jc_dnu', 'list_rows', v_rows, 'concept_groups', v_groups, 'created', v_new);
end $fn$;

revoke execute on function public.learn_list_pool(text) from public, anon, authenticated;
revoke execute on function public.learn_ensure_collection(text, text, text, text, text[], text, int) from public, anon, authenticated;
revoke execute on function public.learn_attach(text, text, text) from public, anon, authenticated;
revoke execute on function public.learn_link_entities(text) from public, anon, authenticated;
revoke execute on function public.learn_gen_member_mcq(text, text, text, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.learn_gen_attribute_mcq(text, text, text, jsonb, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.learn_gen_acb_highest() from public, anon, authenticated;
revoke execute on function public.learn_gen_dnc_reason() from public, anon, authenticated;
revoke execute on function public.learn_gen_jc_dnu() from public, anon, authenticated;
