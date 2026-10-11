-- Phase 16a — registry for the full-page editor (docs/page-editor.md §4a, §5)
--
-- What can be written in a page's source: structured blocks (:::name), locked
-- section embeds (::name) and the default layout of each page type. The editor's
-- key panel, autocomplete and the publish check all read this, so adding a key or
-- block here reaches the editor without a frontend release.
--
-- Source of truth in the repo: src/pageSource/registry.json. The JSON between the
-- $registry$ markers below must equal that file exactly; src/pageSource/
-- pageSource.test.ts fails if they drift. Quick Facts keys stay in
-- public.infobox_properties (phase 15) and are not duplicated here.
--
-- Additive only: three new tables and one read function. No existing table,
-- column, policy or function is changed. Apply with apply_migration, then run
-- get_advisors(type: security).

begin;

create table public.block_schemas (
  name          text primary key check (name ~ '^[a-z][a-z0-9-]*$'),
  label         text not null,
  grammar       text not null check (grammar in ('keyed', 'brands', 'threshold')),
  region        text not null check (region in ('rail', 'section')),
  owner_section text,
  page_types    text[] not null,
  citation      text not null check (citation in ('on_change', 'always')),
  help          text not null,
  example       text not null,
  hints         text[] not null default '{}',
  grammar_spec  jsonb not null default '{}',
  enabled       boolean not null default true,
  sort_order    integer not null default 0,
  updated_at    timestamptz not null default now(),
  check (region = 'rail' or owner_section is not null)
);
comment on table public.block_schemas is 'Structured blocks (:::name) allowed in page source. Mirrors src/pageSource/registry.json (phase 16a).';

create table public.section_embeds (
  name       text primary key check (name ~ '^[a-z][a-z0-9-]*$'),
  label      text not null,
  region     text not null check (region in ('rail', 'main')),
  page_types text[] not null,
  help       text not null,
  sort_order integer not null default 0
);
comment on table public.section_embeds is 'Locked, ingest-owned sections (::name) that can be moved but not edited or removed (phase 16a).';

create table public.page_templates (
  page_type text primary key,
  rail      text[] not null,
  main      jsonb not null check (jsonb_typeof(main) = 'array'),
  sort_order integer not null default 0
);
comment on table public.page_templates is 'Default page layout per page type: rail items and ordered main-column items (phase 16a).';

alter table public.block_schemas  enable row level security;
alter table public.section_embeds enable row level security;
alter table public.page_templates enable row level security;

create policy block_schemas_read  on public.block_schemas  for select to anon, authenticated using (true);
create policy section_embeds_read on public.section_embeds for select to anon, authenticated using (true);
create policy page_templates_read on public.page_templates for select to anon, authenticated using (true);
grant select on public.block_schemas, public.section_embeds, public.page_templates to anon, authenticated;

-- Seed ------------------------------------------------------------------------
with reg as (select $registry${
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
    }
  ],
  "embeds": [
    { "name": "fda-label-link", "label": "Jump to FDA prescribing information", "region": "rail", "page_types": ["drug"], "help": "Link to the FDA label further down. Fixed in the left rail." },
    { "name": "identifiers", "label": "Identifiers", "region": "rail", "page_types": ["drug", "concept"], "help": "PCID, CAS, UNII, InChIKey and other codes. Ingested; corrections come later as cited overrides." },
    { "name": "hierarchy", "label": "Drug hierarchy", "region": "main", "page_types": ["drug"], "help": "Moiety, precise forms, brand formulations and combinations. Built from FDA data." },
    { "name": "fda-label", "label": "FDA prescribing information", "region": "main", "page_types": ["drug"], "help": "The manufacturer's FDA label, unchanged. It can never be edited." },
    { "name": "guidelines", "label": "Clinical guidelines", "region": "main", "page_types": ["drug"], "help": "Linked clinical guidelines." },
    { "name": "classifications", "label": "Classifications", "region": "main", "page_types": ["drug"], "help": "FDA, ATC, ChemOnt and other class memberships." },
    { "name": "lists", "label": "Lists", "region": "main", "page_types": ["drug"], "help": "Lists this page belongs to (Do Not Crush, Beers, MPJE…)." },
    { "name": "knowledge-base", "label": "In the knowledge base", "region": "main", "page_types": ["concept"], "help": "Statements in the knowledge base that point at this page." },
    { "name": "references", "label": "References", "region": "main", "page_types": ["drug", "concept"], "help": "Numbered list built from every [@citation] on the page." },
    { "name": "metadata", "label": "Additional metadata", "region": "main", "page_types": ["drug", "concept"], "help": "Record metadata and the machine-readable record." }
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
    }
  ]
}$registry$::jsonb as j)
insert into public.block_schemas
  (name, label, grammar, region, owner_section, page_types, citation, help, example, hints, grammar_spec, enabled, sort_order)
select b.name, b.label, b.grammar, b.region, b.owner_section, b.page_types, b.citation, b.help, b.example, b.hints,
       b.grammar_spec, b.enabled, b.sort_order
from reg, jsonb_to_recordset(reg.j -> 'blocks') as b(
  name text, label text, grammar text, region text, owner_section text, page_types text[], citation text,
  help text, example text, hints text[], grammar_spec jsonb, enabled boolean, sort_order integer);

with reg as (select $registry${
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
    }
  ],
  "embeds": [
    { "name": "fda-label-link", "label": "Jump to FDA prescribing information", "region": "rail", "page_types": ["drug"], "help": "Link to the FDA label further down. Fixed in the left rail." },
    { "name": "identifiers", "label": "Identifiers", "region": "rail", "page_types": ["drug", "concept"], "help": "PCID, CAS, UNII, InChIKey and other codes. Ingested; corrections come later as cited overrides." },
    { "name": "hierarchy", "label": "Drug hierarchy", "region": "main", "page_types": ["drug"], "help": "Moiety, precise forms, brand formulations and combinations. Built from FDA data." },
    { "name": "fda-label", "label": "FDA prescribing information", "region": "main", "page_types": ["drug"], "help": "The manufacturer's FDA label, unchanged. It can never be edited." },
    { "name": "guidelines", "label": "Clinical guidelines", "region": "main", "page_types": ["drug"], "help": "Linked clinical guidelines." },
    { "name": "classifications", "label": "Classifications", "region": "main", "page_types": ["drug"], "help": "FDA, ATC, ChemOnt and other class memberships." },
    { "name": "lists", "label": "Lists", "region": "main", "page_types": ["drug"], "help": "Lists this page belongs to (Do Not Crush, Beers, MPJE…)." },
    { "name": "knowledge-base", "label": "In the knowledge base", "region": "main", "page_types": ["concept"], "help": "Statements in the knowledge base that point at this page." },
    { "name": "references", "label": "References", "region": "main", "page_types": ["drug", "concept"], "help": "Numbered list built from every [@citation] on the page." },
    { "name": "metadata", "label": "Additional metadata", "region": "main", "page_types": ["drug", "concept"], "help": "Record metadata and the machine-readable record." }
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
    }
  ]
}$registry$::jsonb as j)
insert into public.section_embeds (name, label, region, page_types, help, sort_order)
select x.e ->> 'name', x.e ->> 'label', x.e ->> 'region',
       array(select jsonb_array_elements_text(x.e -> 'page_types')), x.e ->> 'help', x.ord * 10
from reg, jsonb_array_elements(reg.j -> 'embeds') with ordinality as x(e, ord);

with reg as (select $registry${
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
    }
  ],
  "embeds": [
    { "name": "fda-label-link", "label": "Jump to FDA prescribing information", "region": "rail", "page_types": ["drug"], "help": "Link to the FDA label further down. Fixed in the left rail." },
    { "name": "identifiers", "label": "Identifiers", "region": "rail", "page_types": ["drug", "concept"], "help": "PCID, CAS, UNII, InChIKey and other codes. Ingested; corrections come later as cited overrides." },
    { "name": "hierarchy", "label": "Drug hierarchy", "region": "main", "page_types": ["drug"], "help": "Moiety, precise forms, brand formulations and combinations. Built from FDA data." },
    { "name": "fda-label", "label": "FDA prescribing information", "region": "main", "page_types": ["drug"], "help": "The manufacturer's FDA label, unchanged. It can never be edited." },
    { "name": "guidelines", "label": "Clinical guidelines", "region": "main", "page_types": ["drug"], "help": "Linked clinical guidelines." },
    { "name": "classifications", "label": "Classifications", "region": "main", "page_types": ["drug"], "help": "FDA, ATC, ChemOnt and other class memberships." },
    { "name": "lists", "label": "Lists", "region": "main", "page_types": ["drug"], "help": "Lists this page belongs to (Do Not Crush, Beers, MPJE…)." },
    { "name": "knowledge-base", "label": "In the knowledge base", "region": "main", "page_types": ["concept"], "help": "Statements in the knowledge base that point at this page." },
    { "name": "references", "label": "References", "region": "main", "page_types": ["drug", "concept"], "help": "Numbered list built from every [@citation] on the page." },
    { "name": "metadata", "label": "Additional metadata", "region": "main", "page_types": ["drug", "concept"], "help": "Record metadata and the machine-readable record." }
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
    }
  ]
}$registry$::jsonb as j)
insert into public.page_templates (page_type, rail, main, sort_order)
select x.t ->> 'page_type', array(select jsonb_array_elements_text(x.t -> 'rail')), x.t -> 'main', x.ord * 10
from reg, jsonb_array_elements(reg.j -> 'templates') with ordinality as x(t, ord);

-- Read path: the registry in the same shape as registry.json ---------------------
create or replace function public.page_source_registry()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $fn$
  select jsonb_build_object(
    'version', 1,
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', name, 'label', label, 'grammar', grammar, 'region', region, 'owner_section', owner_section,
        'page_types', to_jsonb(page_types), 'citation', citation, 'help', help, 'example', example,
        'hints', to_jsonb(hints), 'grammar_spec', grammar_spec, 'enabled', enabled, 'sort_order', sort_order)
        order by sort_order, name)
      from block_schemas), '[]'::jsonb),
    'embeds', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'label', label, 'region', region,
        'page_types', to_jsonb(page_types), 'help', help) order by sort_order, name)
      from section_embeds), '[]'::jsonb),
    'templates', coalesce((
      select jsonb_agg(jsonb_build_object('page_type', page_type, 'rail', to_jsonb(rail), 'main', main) order by sort_order, page_type)
      from page_templates), '[]'::jsonb)
  )
$fn$;
comment on function public.page_source_registry() is 'Page-source registry for the editor and publish-page (phase 16a). Same shape as src/pageSource/registry.json.';
grant execute on function public.page_source_registry() to anon, authenticated;

commit;
