-- Phase 21e — Learn: generator fixes from the first sample audit (supersedes the two functions in 21c)
-- Destination: db/phase21e_learn_generator_fixes.sql
-- 1. Do Not Crush distractors must be oral-solid drugs (the audit showed vaccines/biologics as options).
-- 2. No dnc_reason flashcard for reason 'Other' (the answer carries no information).
-- Draft items from the old versions are removed (never published, no learner state) and regenerated.

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
  oral as (
    select distinct fpi.moiety_pcid as pcid
    from public.fda_product_ingredients fpi join public.fda_products p on p.product_id = fpi.product_id
    where p_release_filter and fpi.moiety_pcid is not null and p.dosage_form ~* '(tablet|capsule)'),
  pool as (
    select np.* from public.learn_list_pool('notable-drugs') np
    where np.pcid not in (select pcid from excl) and np.pcid not in (select pcid from rel)
      and (not p_release_filter or np.pcid in (select pcid from oral))),
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
  from public.learn_list_pool('do-not-crush') a where a.legal_status is not null and a.legal_status <> 'Other'
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

delete from public.learn_items
where is_official and status = 'draft'
  and (template_key = 'dnc_member' or (template_key = 'dnc_reason' and concise_answer = 'Other'));

select public.learn_gen_member_mcq('do-not-crush', 'dnc_member', 'Which of these drugs is on the Pharmacy Commons Do Not Crush list?',
  '%1$s is on the list. Reason: %2$s. Product and form: %3$s.', 'Not on the Pharmacy Commons Do Not Crush list.',
  'The list is curated, not exhaustive. Absence from it does not make a product safe to crush.', 'Pharmacy Commons', 'Medication safety', true);
select public.learn_gen_dnc_reason();
select public.learn_attach('do-not-crush', 'dnc_member', 'Which drugs');
select public.learn_attach('do-not-crush', 'dnc_reason', 'Why (flashcards)');
