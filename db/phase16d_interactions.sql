-- Phase 16d — :::interactions, community_statements (docs/page-editor.md §5a, §9 Q3)
--
-- Community interactions are an overlay beside the ingested triple store, never rows
-- in clinical_statements (decided 2026-10-11, §9 Q3): one row per line of an
-- :::interactions block, written only by apply_page_revision() from a format-2
-- revision, with the revision id and a current flag like threshold_rules.
--
-- Apply as five migrations, in order (constraint drop and add go on their own,
-- per CLAUDE.md):
--   phase16d_1_drop_grammar_check   block_schemas.grammar check, before widening
--   phase16d_2_add_grammar_check    … now allowing 'statement'
--   phase16d_3_tables               predicate interacts_with, community_statements, read access
--   phase16d_4_functions            apply_page_revision() also writes statement blocks
--   phase16d_5_registry             the interactions block and template sections (registry.json)
-- Deploy publish-page with the statement grammar before part 5, so the editor
-- never sees an :::interactions block the server can't parse.
-- Additive apart from the constraint swap and the redefinition of
-- apply_page_revision(), whose threshold, Quick Facts, brand and link behaviour is
-- unchanged. Then get_advisors(type: security).

-- ═══ phase16d_1_drop_grammar_check ═══════════════════════════════════════════
begin;
alter table public.block_schemas drop constraint block_schemas_grammar_check;
commit;

-- ═══ phase16d_2_add_grammar_check ════════════════════════════════════════════
begin;
alter table public.block_schemas
  add constraint block_schemas_grammar_check check (grammar in ('keyed', 'brands', 'threshold', 'statement'));
commit;

-- ═══ phase16d_3_tables ═══════════════════════════════════════════════════════
begin;

insert into public.predicates (predicate, note)
values ('interacts_with', 'Community interaction (community_statements, :::interactions block); object is a drug, class, herbal or concept page.')
on conflict (predicate) do nothing;

create table public.community_statements (
  id           bigint generated always as identity primary key,
  subject_pcid bigint not null references public.entities (pcid),
  block_name   text not null references public.block_schemas (name),
  predicate    text not null references public.predicates (predicate),
  object_text  text not null check (length(trim(object_text)) between 1 and 200),
  object_pcid  bigint references public.entities (pcid),
  effect       text not null check (length(trim(effect)) between 1 and 1000),
  citations    text[] not null check (cardinality(citations) > 0),
  position     integer not null,
  revision_id  bigint not null references public.page_revisions (id),
  is_current   boolean not null default true,
  created_at   timestamptz not null default now()
);
comment on table public.community_statements is 'Community-written relationships from :::interactions (phase 16d). Shown beside clinical_statements, never merged into it. Current rows = the live page.';
create index community_statements_current on public.community_statements (subject_pcid, block_name) where is_current;
create index community_statements_object on public.community_statements (object_pcid) where is_current;
create index community_statements_revision on public.community_statements (revision_id);

alter table public.community_statements enable row level security;
create policy public_read on public.community_statements for select using (true);
grant select on public.community_statements to anon, authenticated;

commit;

-- ═══ phase16d_4_functions ════════════════════════════════════════════════════
begin;

-- Same as phase16b §6, plus the statement-block loop at the end.
create or replace function public.apply_page_revision(p_rev bigint, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r          page_revisions%rowtype;
  v_patrol   text;
  v_by       uuid;
  v_at       timestamptz;
  l          jsonb;
  v_key      text;
  v_desired  jsonb;
  v_cur      record;
  v_block    record;
  v_lines    jsonb;
  v_current  jsonb;
begin
  select * into r from page_revisions where id = p_rev;
  if not found or r.format <> 2 then raise exception 'not_a_page_model_revision'; end if;

  -- Rows written here inherit the revision's review state.
  v_patrol := case when r.patrol_status = 'patrolled' then 'patrolled' else 'unpatrolled' end;
  v_by := case when v_patrol = 'patrolled' then coalesce(r.patrolled_by, p_actor) end;
  v_at := case when v_patrol = 'patrolled' then coalesce(r.patrolled_at, now()) end;

  insert into page_content (pcid) values (r.pcid) on conflict (pcid) do nothing;
  update page_content
  set description = r.description, body_md = r.body_md, current_revision_id = r.id, updated_at = now()
  where pcid = r.pcid;

  -- Links and value references, from what the parser extracted.
  delete from page_links where source_pcid = r.pcid;
  insert into page_links (source_pcid, target_text, target_pcid)
  select r.pcid, t, resolve_page_target(t)
  from (select distinct lower(trim(e ->> 'target')) as t from jsonb_array_elements(r.extracted -> 'links') e) x
  where t <> '';

  delete from page_property_refs where source_pcid = r.pcid;
  insert into page_property_refs (source_pcid, property_key, target_text, target_pcid)
  select r.pcid, k, tt, case when tt = '' then r.pcid else resolve_page_target(tt) end
  from (select distinct lower(e ->> 'key') as k, lower(trim(coalesce(e ->> 'target', ''))) as tt
        from jsonb_array_elements(r.extracted -> 'properties') e) x
  where exists (select 1 from infobox_properties p where p.key = x.k);

  -- Quick Facts: desired overrides vs current community rows, key by key.
  for v_key in
    select key from infobox_properties
  loop
    select e into v_desired
    from jsonb_array_elements(coalesce(r.model -> 'infobox' -> 'lines', '[]'::jsonb)) e
    where e ->> 'key' = v_key;
    select * into v_cur from infobox_edits
    where pcid = r.pcid and property_key = v_key and is_current
    order by id desc limit 1;

    if v_desired is null then
      -- No override in the page: clear an existing one.
      if v_cur.id is not null and (v_cur.value is not null or v_cur.is_null_override) then
        update infobox_edits set is_current = false where pcid = r.pcid and property_key = v_key and is_current;
        insert into infobox_edits (pcid, property_key, value, citation, summary, is_current, created_by,
                                   patrol_status, patrolled_by, patrolled_at, revision_id)
        values (r.pcid, v_key, null, 'removed in page revision ' || r.id, r.summary, true, r.created_by,
                v_patrol, v_by, v_at, r.id);
      end if;
    elsif v_cur.id is null
       or v_cur.value is distinct from nullif(v_desired ->> 'value', '')
       or v_cur.is_null_override is distinct from (v_desired ->> 'isNull')::boolean
       or v_cur.citation is distinct from pc_cite_text(v_desired -> 'citations') then
      update infobox_edits set is_current = false where pcid = r.pcid and property_key = v_key and is_current;
      insert into infobox_edits (pcid, property_key, value, is_null_override, citation, summary, is_current,
                                 created_by, patrol_status, patrolled_by, patrolled_at, revision_id)
      values (r.pcid, v_key, nullif(v_desired ->> 'value', ''), (v_desired ->> 'isNull')::boolean,
              pc_cite_text(v_desired -> 'citations'), r.summary, true, r.created_by,
              v_patrol, v_by, v_at, r.id);
    end if;
    v_desired := null;
  end loop;

  -- Brands: add / hide lines vs current brand_edits, brand by brand.
  for v_cur in
    select coalesce(d.k, c.brand_key) as brand_key, d.line, c.id as cur_id, c.action as cur_action,
           c.citation as cur_citation, c.summary as cur_summary
    from (
      select pc_brand_key(e ->> 'brand') as k, e as line
      from jsonb_array_elements(coalesce(r.model -> 'brands' -> 'lines', '[]'::jsonb)) e
      where e ->> 'action' in ('add', 'hide')
    ) d
    full join (
      select * from brand_edits where pcid = r.pcid and is_current and action in ('add', 'hide')
    ) c on c.brand_key = d.k
  loop
    if v_cur.line is null then
      update brand_edits set is_current = false where pcid = r.pcid and brand_key = v_cur.brand_key and is_current;
      insert into brand_edits (pcid, brand_key, brand_display, action, citation, summary, is_current, created_by,
                               patrol_status, patrolled_by, patrolled_at, revision_id)
      select r.pcid, v_cur.brand_key, b.brand_display, 'clear', 'removed in page revision ' || r.id, r.summary, true,
             r.created_by, v_patrol, v_by, v_at, r.id
      from brand_edits b where b.id = v_cur.cur_id;
    elsif v_cur.cur_id is null
       or v_cur.cur_action <> (v_cur.line ->> 'action')
       or v_cur.cur_citation <> pc_cite_text(v_cur.line -> 'citations')
       or (v_cur.line ->> 'action' = 'hide' and v_cur.cur_summary is distinct from (v_cur.line ->> 'reason')) then
      update brand_edits set is_current = false where pcid = r.pcid and brand_key = v_cur.brand_key and is_current;
      insert into brand_edits (pcid, brand_key, brand_display, action, citation, summary, is_current, created_by,
                               patrol_status, patrolled_by, patrolled_at, revision_id)
      values (r.pcid, v_cur.brand_key, trim(regexp_replace(v_cur.line ->> 'brand', '\s+', ' ', 'g')),
              v_cur.line ->> 'action', pc_cite_text(v_cur.line -> 'citations'),
              -- hide: the reason readers see is the summary of the row (as edit_brand stores it)
              case when v_cur.line ->> 'action' = 'hide' then coalesce(nullif(v_cur.line ->> 'reason', ''), r.summary) else r.summary end,
              true, r.created_by, v_patrol, v_by, v_at, r.id);
    end if;
  end loop;

  -- Threshold blocks: each block is replaced as a whole when its lines change.
  for v_block in
    select b.name from block_schemas b where b.grammar = 'threshold'
  loop
    select coalesce(jsonb_agg(line order by sec_ord, part_ord, line_ord), '[]'::jsonb) into v_lines
    from jsonb_array_elements(r.model -> 'main') with ordinality as s(item, sec_ord),
         jsonb_array_elements(coalesce(s.item -> 'parts', '[]'::jsonb)) with ordinality as p(part, part_ord),
         jsonb_array_elements(coalesce(p.part -> 'block' -> 'lines', '[]'::jsonb)) with ordinality as l(line, line_ord)
    where s.item ->> 'kind' = 'section' and p.part ->> 'kind' = 'block' and p.part -> 'block' ->> 'name' = v_block.name;

    select coalesce(jsonb_agg(jsonb_build_object(
             'measure', measure, 'comparator', comparator, 'low', low, 'high', high, 'action', action,
             'citations', to_jsonb(citations)) order by position), '[]'::jsonb)
    into v_current
    from threshold_rules where pcid = r.pcid and block_name = v_block.name and is_current;

    if v_current is distinct from (
         select coalesce(jsonb_agg(jsonb_build_object(
                  'measure', x ->> 'measure', 'comparator', x ->> 'comparator',
                  'low', (x ->> 'low')::numeric, 'high', (x ->> 'high')::numeric, 'action', x ->> 'action',
                  'citations', (select coalesce(jsonb_agg(c ->> 'key'), '[]'::jsonb) from jsonb_array_elements(x -> 'citations') c))
                  order by o), '[]'::jsonb)
         from jsonb_array_elements(v_lines) with ordinality as t(x, o)) then
      update threshold_rules set is_current = false where pcid = r.pcid and block_name = v_block.name and is_current;
      insert into threshold_rules (pcid, block_name, measure, comparator, low, high, action, citations, position, revision_id)
      select r.pcid, v_block.name, x ->> 'measure', x ->> 'comparator', (x ->> 'low')::numeric, (x ->> 'high')::numeric,
             x ->> 'action', array(select c ->> 'key' from jsonb_array_elements(x -> 'citations') c), o::integer, r.id
      from jsonb_array_elements(v_lines) with ordinality as t(x, o);
    end if;
  end loop;

  -- Statement blocks (:::interactions → community_statements, phase 16d): each block
  -- is replaced as a whole when its lines change. The other party resolves like a
  -- [[link]]; an unresolved target keeps its text in object_text.
  for v_block in
    select b.name, coalesce(b.grammar_spec ->> 'predicate', 'interacts_with') as predicate
    from block_schemas b where b.grammar = 'statement'
  loop
    select coalesce(jsonb_agg(line order by sec_ord, part_ord, line_ord), '[]'::jsonb) into v_lines
    from jsonb_array_elements(r.model -> 'main') with ordinality as s(item, sec_ord),
         jsonb_array_elements(coalesce(s.item -> 'parts', '[]'::jsonb)) with ordinality as p(part, part_ord),
         jsonb_array_elements(coalesce(p.part -> 'block' -> 'lines', '[]'::jsonb)) with ordinality as l(line, line_ord)
    where s.item ->> 'kind' = 'section' and p.part ->> 'kind' = 'block' and p.part -> 'block' ->> 'name' = v_block.name;

    select coalesce(jsonb_agg(jsonb_build_object('target', object_text, 'effect', effect, 'citations', to_jsonb(citations))
             order by position), '[]'::jsonb)
    into v_current
    from community_statements where subject_pcid = r.pcid and block_name = v_block.name and is_current;

    if v_current is distinct from (
         select coalesce(jsonb_agg(jsonb_build_object(
                  'target', x ->> 'target', 'effect', x ->> 'effect',
                  'citations', (select coalesce(jsonb_agg(c ->> 'key'), '[]'::jsonb) from jsonb_array_elements(x -> 'citations') c))
                  order by o), '[]'::jsonb)
         from jsonb_array_elements(v_lines) with ordinality as t(x, o)) then
      update community_statements set is_current = false
      where subject_pcid = r.pcid and block_name = v_block.name and is_current;
      insert into community_statements (subject_pcid, block_name, predicate, object_text, object_pcid, effect, citations,
                                        position, revision_id)
      select r.pcid, v_block.name, v_block.predicate, trim(x ->> 'target'), resolve_page_target(lower(trim(x ->> 'target'))),
             x ->> 'effect', array(select c ->> 'key' from jsonb_array_elements(x -> 'citations') c), o::integer, r.id
      from jsonb_array_elements(v_lines) with ordinality as t(x, o);
    end if;
  end loop;
end $$;

revoke execute on function public.apply_page_revision(bigint, uuid) from public, anon, authenticated;

commit;

-- ═══ phase16d_5_registry ═════════════════════════════════════════════════════
begin;

with reg as (
  select $registry${
  "version": 1,
  "blocks": [
    {
      "name": "brands",
      "label": "Brand names",
      "grammar": "brands",
      "region": "rail",
      "owner_section": null,
      "page_types": ["drug"],
      "citation": "on_change",
      "help": "One brand per line. Source brands are listed with a # source note; leave them as they are. Add a missing brand with a citation. To mark a source brand as wrong, strike it through and cite why.",
      "example": "Glucophage   # source: Drugs@FDA, RxNorm\nRiomet ER [@dailymed:…]\n~~Wrongname~~ [@url:https://…] not a metformin product",
      "hints": ["brand", "trade name", "proprietary"],
      "grammar_spec": {
        "forms": [
          { "form": "Name", "meaning": "A brand that is already in the sources (shown with # source). No citation needed." },
          { "form": "Name [@key]", "meaning": "Add a brand the sources lack. Citation required." },
          { "form": "~~Name~~ [@key] reason", "meaning": "Mark a source brand as wrong. It stays listed, struck through, with the reason. Citation required." }
        ]
      },
      "enabled": true,
      "sort_order": 10
    },
    {
      "name": "infobox",
      "label": "Quick Facts",
      "grammar": "keyed",
      "region": "rail",
      "owner_section": null,
      "page_types": ["drug"],
      "citation": "on_change",
      "help": "One fact per line as key: value. Leave a value blank to use the source (shown as a # comment). A value you type replaces the source on this page and needs a citation. To record that the source is wrong and there is no value, write [NONE] with a citation.",
      "example": "acb_score:            # source: 1 (Anticholinergic burden list)\ndo_not_crush: Extended-release tablets [@dailymed:…]\nqtc_risk: [NONE] [@pmid:…]",
      "hints": ["quick facts", "infobox", "fact"],
      "grammar_spec": { "keys_from": "infobox_properties", "null_token": "[NONE]", "max_value_length": 2000 },
      "enabled": true,
      "sort_order": 20
    },
    {
      "name": "renal-dosing",
      "label": "Renal dosing",
      "grammar": "threshold",
      "region": "section",
      "owner_section": "renal-dosing",
      "page_types": ["drug"],
      "citation": "always",
      "help": "One kidney-function range per line, then a colon and what to do. Use eGFR (mL/min/1.73 m²), CrCl (mL/min) or dialysis. Ranges for the same measure must not overlap. Every line needs a citation.",
      "example": "egfr < 30: contraindicated [@dailymed:…]\negfr 30-45: do not start; if already taking, assess benefit and risk [@dailymed:…]\ncrcl >= 60: no adjustment [@pmid:…]\ndialysis: avoid [@pmid:…]",
      "hints": ["kidney", "renal", "egfr", "crcl", "creatinine", "clearance", "dialysis", "ckd", "gfr"],
      "grammar_spec": {
        "measures": {
          "egfr": { "label": "eGFR", "unit": "mL/min/1.73 m²", "numeric": true },
          "crcl": { "label": "CrCl", "unit": "mL/min", "numeric": true },
          "dialysis": { "label": "Dialysis", "unit": null, "numeric": false }
        },
        "forms": [
          { "form": "egfr < N: action", "meaning": "below N" },
          { "form": "egfr <= N: action", "meaning": "N or below" },
          { "form": "egfr N-M: action", "meaning": "from N up to (not including) M" },
          { "form": "egfr >= N: action", "meaning": "N or above" },
          { "form": "egfr > N: action", "meaning": "above N" },
          { "form": "dialysis: action", "meaning": "patients on dialysis" }
        ],
        "max_action_length": 1000
      },
      "enabled": true,
      "sort_order": 30
    },
    {
      "name": "interactions",
      "label": "Interactions",
      "grammar": "statement",
      "region": "section",
      "owner_section": "interactions",
      "page_types": ["drug", "herbal"],
      "citation": "always",
      "help": "One interaction per line: the other drug, class or herbal as a [[link]], a colon, then what happens and what to do. Every line needs a citation. Stored as data, shown beside the FDA-sourced interactions, never merged into them.",
      "example": "[[warfarin]]: increased INR; monitor INR when starting or stopping [@pmid:…]\n[[strong CYP3A4 inhibitors]]: avoid [@dailymed:…]",
      "hints": ["interaction", "interactions", "interacts", "inhibitor", "inducer", "ddi"],
      "grammar_spec": {
        "predicate": "interacts_with",
        "forms": [
          { "form": "[[other page]]: effect [@key]", "meaning": "What happens with the other drug, class or herbal, and what to do. Citation required." }
        ],
        "max_effect_length": 1000
      },
      "enabled": true,
      "sort_order": 40
    }
  ],
  "embeds": [
    { "name": "fda-label-link", "label": "Jump to FDA prescribing information", "region": "rail", "page_types": ["drug"], "help": "Link to the FDA label further down. Fixed in the left rail." },
    { "name": "identifiers", "label": "Identifiers", "region": "rail", "page_types": ["drug", "concept", "herbal"], "help": "PCID, CAS, UNII, InChIKey and other codes. Ingested; corrections come later as cited overrides." },
    { "name": "hierarchy", "label": "Drug hierarchy", "region": "main", "page_types": ["drug"], "help": "Moiety, precise forms, brand formulations and combinations. Built from FDA data." },
    { "name": "fda-label", "label": "FDA prescribing information", "region": "main", "page_types": ["drug"], "help": "The manufacturer's FDA label, unchanged. It can never be edited." },
    { "name": "guidelines", "label": "Clinical guidelines", "region": "main", "page_types": ["drug"], "help": "Linked clinical guidelines." },
    { "name": "classifications", "label": "Classifications", "region": "main", "page_types": ["drug"], "help": "FDA, ATC, ChemOnt and other class memberships." },
    { "name": "lists", "label": "Lists", "region": "main", "page_types": ["drug"], "help": "Lists this page belongs to (Do Not Crush, Beers, MPJE…)." },
    { "name": "knowledge-base", "label": "In the knowledge base", "region": "main", "page_types": ["concept", "herbal"], "help": "Statements in the knowledge base that point at this page." },
    { "name": "subclasses", "label": "Sub-classes", "region": "rail", "page_types": ["class"], "help": "Narrower classes inside this one, from the class system. Fixed in the side column." },
    { "name": "machine-readable", "label": "Sources and machine-readable record", "region": "rail", "page_types": ["class"], "help": "Where the class comes from, its PCID, JSON record and API links. Fixed in the side column." },
    { "name": "class-members", "label": "Members", "region": "main", "page_types": ["class"], "help": "Every drug in the class, from its class system (FDA, ATC, VA, ChemOnt…). Contributor classifications start empty." },
    { "name": "references", "label": "References", "region": "main", "page_types": ["drug", "concept", "herbal", "class"], "help": "Numbered list built from every [@citation] on the page." },
    { "name": "metadata", "label": "Additional metadata", "region": "main", "page_types": ["drug", "concept", "herbal"], "help": "Record metadata and the machine-readable record." }
  ],
  "templates": [
    {
      "page_type": "drug",
      "rail": ["brands", "infobox", "fda-label-link", "identifiers"],
      "main": [
        { "kind": "lead" },
        { "kind": "embed", "name": "hierarchy" },
        { "kind": "embed", "name": "fda-label" },
        { "kind": "section", "id": "renal-dosing", "heading": "Renal dosing", "block": "renal-dosing", "help": "Kidney-function thresholds (in the block) and any notes around them." },
        { "kind": "section", "id": "interactions", "heading": "Interactions", "block": "interactions", "help": "Interactions with other drugs, classes or herbals (in the block), each cited, and any notes around them." },
        { "kind": "section", "id": "patient-education", "heading": "Patient education", "block": null, "help": "Plain-language counselling points for patients." },
        { "kind": "embed", "name": "guidelines" },
        { "kind": "embed", "name": "classifications" },
        { "kind": "embed", "name": "lists" },
        { "kind": "embed", "name": "references" },
        { "kind": "embed", "name": "metadata" }
      ]
    },
    {
      "page_type": "concept",
      "rail": ["identifiers"],
      "main": [
        { "kind": "lead" },
        { "kind": "embed", "name": "knowledge-base" },
        { "kind": "section", "id": "patient-education", "heading": "Patient education", "block": null, "help": "Plain-language points for patients." },
        { "kind": "embed", "name": "references" },
        { "kind": "embed", "name": "metadata" }
      ]
    },
    {
      "page_type": "herbal",
      "rail": ["identifiers"],
      "main": [
        { "kind": "lead" },
        { "kind": "section", "id": "uses-and-evidence", "heading": "Uses and evidence", "block": null, "help": "What it is taken for and how strong the evidence is for each use, with citations." },
        { "kind": "section", "id": "safety", "heading": "Safety", "block": null, "help": "Adverse effects, pregnancy and lactation, and product quality concerns, with citations." },
        { "kind": "section", "id": "interactions", "heading": "Interactions", "block": "interactions", "help": "Interactions with drugs, classes or other herbals (in the block), each cited, and any notes around them." },
        { "kind": "section", "id": "patient-education", "heading": "Patient education", "block": null, "help": "Plain-language points for patients." },
        { "kind": "embed", "name": "knowledge-base" },
        { "kind": "embed", "name": "references" },
        { "kind": "embed", "name": "metadata" }
      ]
    },
    {
      "page_type": "class",
      "rail": ["subclasses", "machine-readable"],
      "main": [
        { "kind": "lead" },
        { "kind": "section", "id": "class-effects", "heading": "Class effects", "block": null, "help": "Effects, adverse effects, interactions and monitoring shared by drugs in this class, with citations." },
        { "kind": "embed", "name": "class-members" },
        { "kind": "embed", "name": "references" }
      ]
    }
  ]
}$registry$::jsonb as j
),
blocks as (
  insert into public.block_schemas
    (name, label, grammar, region, owner_section, page_types, citation, help, example, hints, grammar_spec, enabled, sort_order)
  select b.name, b.label, b.grammar, b.region, b.owner_section, b.page_types, b.citation, b.help, b.example, b.hints,
         b.grammar_spec, b.enabled, b.sort_order
  from reg, jsonb_to_recordset(reg.j -> 'blocks') as b(
    name text, label text, grammar text, region text, owner_section text, page_types text[], citation text,
    help text, example text, hints text[], grammar_spec jsonb, enabled boolean, sort_order integer)
  on conflict (name) do update
    set label = excluded.label, grammar = excluded.grammar, region = excluded.region, owner_section = excluded.owner_section,
        page_types = excluded.page_types, citation = excluded.citation, help = excluded.help, example = excluded.example,
        hints = excluded.hints, grammar_spec = excluded.grammar_spec, enabled = excluded.enabled, sort_order = excluded.sort_order,
        updated_at = now()
  returning name
),
embeds as (
  insert into public.section_embeds (name, label, region, page_types, help, sort_order)
  select x.e ->> 'name', x.e ->> 'label', x.e ->> 'region',
         array(select jsonb_array_elements_text(x.e -> 'page_types')), x.e ->> 'help', x.ord * 10
  from reg, jsonb_array_elements(reg.j -> 'embeds') with ordinality as x(e, ord)
  on conflict (name) do update
    set label = excluded.label, region = excluded.region, page_types = excluded.page_types, help = excluded.help,
        sort_order = excluded.sort_order
  returning name
),
templates as (
  insert into public.page_templates (page_type, rail, main, sort_order)
  select x.t ->> 'page_type', array(select jsonb_array_elements_text(x.t -> 'rail')), x.t -> 'main', x.ord * 10
  from reg, jsonb_array_elements(reg.j -> 'templates') with ordinality as x(t, ord)
  on conflict (page_type) do update
    set rail = excluded.rail, main = excluded.main, sort_order = excluded.sort_order
  returning page_type
)
select (select count(*) from blocks) as blocks, (select count(*) from embeds) as embeds, (select count(*) from templates) as templates;

commit;
