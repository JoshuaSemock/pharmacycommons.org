-- Phase 23c — Learn: brand-name learner driven by learn_brand_list (Joshua's Brands.xlsx, importance-ranked)
-- Destination: db/phase23c_learn_brand_list_generator.sql
-- Replaces the Notable-Drugs-based brand_generic generator (21f/21g). Every 'ready' row of learn_brand_list becomes
-- one MCQ "Which generic drug is sold under the brand name X?". Distractors: other generics from the sheet, preferring the
-- same therapeutic domain, never sharing a first-word ingredient with the answer (blocks salts, combos, same-molecule rows).
-- natural_key = 'brand_list:<sheet_id>' (idempotent). Source is the owner's own sheet, so items are published directly
-- (template-generated; the review check only constrains llm_draft/authored items).

create or replace function public.learn_gen_brand_list()
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_rows int; v_rej int; v_new int;
begin
  create temp table _rows on commit drop as
  select l.sheet_id, l.importance, l.brand_name as brand, l.generic_pcid, l.brand_pcid, l.therapeutic_domain as dom, l.clinical_context as ctx,
    case when g ~ '^[A-Z][a-z]' then lower(left(g,1)) || substr(g,2) else g end as gtext,
    array(select distinct split_part(trim(t),' ',1)
          from regexp_split_to_table(lower(regexp_replace(g,'\(.*?\)','','g')), '\s*(/|;|,| and |-)\s*') t where trim(t) <> '') as ftok
  from public.learn_brand_list l,
       lateral (select regexp_replace(regexp_replace(trim(l.generic_name),'\s*/\s*','/','g'),'\s+',' ','g') as g) x
  where l.status = 'ready' and l.brand_pcid is not null;
  select count(*) into v_rows from _rows;

  create temp table _pool on commit drop as
  select distinct on (gtext) gtext, dom, ftok from _rows order by gtext, sheet_id;

  create temp table _picks on commit drop as
  select r.*, (select jsonb_agg(d.gtext order by d.rk) from (
      select c.gtext, row_number() over (order by (c.dom = r.dom) desc, md5(r.sheet_id::text || c.gtext)) rk
      from _pool c
      where c.gtext <> r.gtext and not (c.ftok && r.ftok)
        and position(lower(r.gtext) in lower(c.gtext)) = 0 and position(lower(c.gtext) in lower(r.gtext)) = 0) d
    where d.rk <= 3) as dists
  from _rows r;
  select count(*) into v_rej from _picks where jsonb_array_length(coalesce(dists,'[]'::jsonb)) < 3;

  insert into public.learn_items (
    natural_key, item_type, template_key, generation_method, is_official, status,
    subject_area, topic, difficulty_level, tags, primary_pcid,
    prompt, concise_answer, clinical_rationale, clinical_caveats, mcq_options,
    source_kind, source_agency, source_citation, license)
  select 'brand_list:' || k.sheet_id, 'mcq', 'brand_generic', 'template', true, 'published',
    'Pharmacology', 'Brand and generic names', case k.importance when 'High' then 1 when 'Medium' then 2 else 3 end,
    array['brand', 'importance:' || lower(k.importance)], k.brand_pcid,
    format('Which generic drug is sold under the brand name %s?', k.brand), k.gtext,
    format('%s is a brand name of %s.', k.brand, k.gtext) || coalesce(' ' || nullif(trim(k.ctx), '') || '.', ''),
    'Brand names change over time and a product may be discontinued; the generic name is the stable identifier.',
    (select jsonb_agg(jsonb_build_object('id', chr(96 + q.rn::int), 'text', q.txt, 'is_correct', q.ok,
        'rationale', case when q.ok then format('%s is a brand of %s.', k.brand, k.gtext) else format('%s is not the generic for %s.', q.txt, k.brand) end) order by q.rn)
       from (select o.txt, o.ok, row_number() over (order by md5('brand_list' || k.sheet_id::text || o.txt)) rn
             from (select k.gtext as txt, true as ok
                   union all select d, false from jsonb_array_elements_text(k.dists) d) o) q),
    'authored', 'Pharmacy Commons',
    'Pharmacy Commons brand-name priority list (Brands.xlsx; importance ' || k.importance || '), curated by the site owner; brand and generic matched to PCIDs.',
    'CC0-1.0'
  from _picks k where jsonb_array_length(coalesce(k.dists,'[]'::jsonb)) = 3
  on conflict (natural_key) do nothing;
  get diagnostics v_new = row_count;

  perform public.learn_link_entities('brand_generic');
  drop table _rows, _pool, _picks;
  return jsonb_build_object('ready_rows', v_rows, 'rejected_fewer_than_3_distractors', v_rej, 'created', v_new);
end $fn$;
revoke execute on function public.learn_gen_brand_list() from public, anon, authenticated;
