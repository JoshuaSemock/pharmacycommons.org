-- Phase 16c — page templates for herbal and class pages (docs/page-editor.md §9 Q5)
--
-- Decided 2026-10-11 (§9): herbals (entity_type 'functional') get their own
-- template (Uses and evidence, Safety, Patient education); class pages move from
-- the phase-15 Overview to the model layout (lead, Class effects, Members,
-- References; sub-classes and the machine-readable record fixed in the rail).
-- Concept pages keep their template.
--
-- Same shape as phase16a: the JSON between the $registry$ markers must equal
-- src/pageSource/registry.json exactly (src/pageSource/pageSource.test.ts reads the
-- newest db/phase16*.sql that has one). One statement: the registry once, then
-- three upserts as data-modifying CTEs.
-- Upserts only: three new embeds, wider page_types on four embeds, two new
-- templates, re-numbered sort_order. Nothing is removed. Apply with
-- apply_migration (name phase16c_page_templates), then check that
-- page_source_registry() equals registry.json.

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
        { "kind": "section", "id": "safety", "heading": "Safety", "block": null, "help": "Adverse effects, drug interactions, pregnancy and lactation, and product quality concerns, with citations." },
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
