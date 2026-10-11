# Full-page editor — spec

> Drafted 2026-10-10 from Joshua's decisions in session; revised the same day with
> HTML rejection, the key panel, `[NONE]` and section-level merge. **Not built; no
> schema changes yet.** Extends `docs/user-edits.md` (phase 15). It supersedes §2 (page
> anatomy) and §11 step 3 (the Overview editor) there, and changes how §4–§6
> (links, Quick Facts, property values) are written, though not what they store.
> Layout references are to `src/DrugDetail.tsx` at commit `86f42af`.

## 1. Decisions (Joshua, 2026-10-10)

| Question | Decision |
| --- | --- |
| Architecture | **Database-first hybrid.** Canonical facts live in tables. Prose is Markdown. Every page also has a full-page *source view* that is generated from the database and parsed back into it on publish. |
| Editing experience | **Wikipedia-style.** The whole page is editable as one source text, with Preview and Publish. A page starts from its type's default template. |
| Overview | **Dissolves into the page.** No separate Overview box. The text above the first heading is the *lead*, as on Wikipedia. |
| Quick Facts | **Is the infobox**, written as an `:::infobox` block in the source. It stays in its current position (sticky left rail on desktop). |
| Layout | Keep today's order and the left/right split (§3). |
| Citations | `[@key]` in text, backed by one `references` table. Like Wikipedia's `<ref>`, but each source is stored once and reused. |
| Prose vs facts | Prose is separate but traceable. Prose never writes facts; only structured blocks do. Every link, value and citation is recorded per revision. |
| Templates | Build structured block templates **now**, not later. |
| Views | **One view.** Patient education is an ordinary section (`## Patient education`), not a separate mode. |
| Ingest-owned content | FDA label text is never editable. Classification and identifiers take cited overrides shown beside the source (like Quick Facts today). Renaming a page is reviewer-only. |
| Section deletion | Template sections **cannot be deleted**; reordering is allowed. |
| Raw HTML | **Rejected**, never stripped or allowed (§7a). Joshua, 2026-10-10. |
| Discoverability | The editor lists every valid key and line form for the block the cursor is in, and validates live while typing (§4a). Joshua, 2026-10-10. |
| Explicit "no value" | The exact token `[NONE]`, never a word (§4). Joshua, 2026-10-10. |
| Section editing | Required from day one. **edit** beside a section opens only that section; publishes merge by section (§7b). Joshua, 2026-10-10. |

## 2. Anatomy, mapped to Wikipedia

| Wikipedia | Pharmacy Commons | In the source |
| --- | --- | --- |
| Title | Page name + PCID (locked; renaming is reviewer-only) | `# Metformin` (read-only line) |
| Short description | One-line description under the name (see §9 Q1) | `:::short` or the first lead sentence |
| Infobox | **Quick Facts** | `:::infobox` |
| Lead section (text before the first heading) | **Lead**: replaces the Overview description and the opening body text | plain paragraphs before the first `##` |
| Table of contents | "On this page" (optional, from headings) | generated |
| Body sections | Contributor `##` sections plus locked data sections, in an order contributors can change | `## Heading` / `::section` |
| References | Auto-built from every `[@key]` on the page (prose and blocks) | `::references` (locked, generated) |
| Categories / navboxes | Classifications, Lists | `::classifications`, `::lists` |

## 3. Layout and ordering (unchanged from today)

**Drug pages** (moiety, precise form, formulation, combination):

- **Left rail (desktop, sticky), fixed:** Jump to FDA label → Quick Facts → Identifiers.
  Rail items are **pinned**: they can't be moved into the main column or reordered.
- **Main column, reorderable:** Lead → Drug hierarchy → FDA prescribing information →
  Guidelines → Classifications → Lists → [contributor sections anywhere] →
  References → Additional metadata.
- **Phones (single column, as now):** Jump → Quick Facts → Lead → main-column sections
  in their page order. Identifiers goes directly after the FDA label section, wherever
  that section has been moved. This keeps today's phone order for any page still in
  default order.
- **The main-column order is saved per page**, in the revision. Unedited pages use the
  type's default order.

**Concept pages** (clinical, measurement, target, functional) keep their layout
(main column left, identifier rail right): Lead → In the knowledge base →
[contributor sections] → References → Additional metadata.
**Class pages** keep `ClassDetail`'s order, with the lead replacing the Overview.

## 4. The source view

There are two ways in, both with Source and Preview tabs, a required edit summary and
**Publish**. Preview renders exactly what will publish.

- **edit** beside a section heading (and beside Quick Facts and the brand line) opens
  the editor loaded with **only that section's source**. This is the default way to
  edit, and it is what keeps concurrent edits from colliding (§7b).
- **Edit page** (page tab) opens the full source. Use it to reorder sections, add a new
  section, or make changes that span sections.

The lead counts as a section ("Lead"). A locked `::section` has no edit link of its own.

Example (metformin, after some community edits):

```
# Metformin                                   ← locked

:::brands
Glucophage
Fortamet [@dailymed:9a1b…]
:::

:::infobox
indications:                                  # source: FDA label
acb_score:                                    # source: 0 (ACB list)
do_not_crush: ER tablets [@ismp:dnc-2024]
qtc_risk:                                     # source: not listed
:::

Metformin is a biguanide that lowers hepatic glucose output and is
first-line therapy for [[type 2 diabetes]].[@pmid:28776081]

::hierarchy
::fda-label

## Renal dosing
:::renal-dosing
egfr < 30: contraindicated [@fda:metformin-label]
egfr 30-45: do not start; reassess if already taking [@fda:metformin-label]
:::

## Patient education
Take with meals to reduce stomach upset. …

::guidelines
::classifications
::lists
::references
::metadata
```

Rail blocks (`:::brands`, `:::infobox`, `::fda-label-link`, `::identifiers`) are
always generated at the top of the source, in a fixed order. Moving them is ignored
with a notice.

### Syntax

| Form | Meaning |
| --- | --- |
| Markdown (CommonMark + GFM) | prose |
| `[[target]]`, `[[target\|text]]` | page link (unchanged) |
| `{{key}}`, `{{key:target}}` | live property value (unchanged) |
| `[@pmid:…]` `[@doi:…]` `[@dailymed:setid]` `[@url:…]` `[@ref-slug]` | citation (§6) |
| `:::name` … `:::` | editable structured block; each line is parsed into a table (§5) |
| `::name` | locked section embed; can be moved, not edited or deleted |

Directive syntax follows the generic-directives proposal (`remark-directive`), so other
Markdown tools show it as plain text rather than breaking.

### Blank means "use the source"

In `:::infobox` (and every structured block), a line that is left blank shows the
source value as a `#` comment and stores nothing. Typing a value creates a community
override, which **must** carry a citation, as `infobox_edits` requires today.

**Explicit null: `[NONE]`.** To record "the source is wrong; there is no value",
the whole value must be exactly `[NONE]` (upper case, brackets) followed by a citation:
`qtc_risk: [NONE] [@pmid:…]`. It is recognised only as the complete value of a
structured line, so "none", "None known" or "no QT risk" anywhere (in prose or in a
value) stays literal text. `[NONE]` in prose is ordinary text. The editor's key list
(§4a) shows `[NONE]` as an option, and the stored row has `value = NULL`, `is_null_override = true`.

On the page,
an override shows with its citation, and the source value stays one tap away. So
disagreement is shown, not hidden. Ingest refreshes keep updating the comments and
never touch overrides.

**Consequence:** a revision stores only the *community layer* (prose, section order,
overrides, citations), never a copy of source data. Diffs therefore stay meaningful
when an FDA reload changes a label.

### 4a. Knowing what's valid: key panel, autocomplete and live checks

Contributors should never have to guess a key. The shared parser runs in the browser,
so the editor knows which block the cursor is in at every keystroke.

- **Block panel (sticky beside the editor; a drawer on phones).** For the block under the
  cursor it lists every accepted key or line form, with:
  - a one-line meaning and the allowed values (enum, number range, units)
  - an example line, and whether a citation is required
  - the current source value for this page
  
  Outside a block, it lists the block and section names that can be inserted, plus the
  inline syntax (`[[ ]]`, `{{ }}`, `[@ ]`). Click any entry to insert it.
- **Autocomplete:**
  - at the start of a line inside a block: its keys (`:::infobox`) or line forms
    (`:::renal-dosing`: `egfr < N:`, `egfr N-M:`, `crcl < N:` …)
  - after `:::` / `::`: block and section names
  - after `[[`: pages
  - after `{{`: property keys
  - after `[@`: references, plus PubMed/DailyMed lookup
- **Live validation.** Problems are underlined as the contributor types, with the
  message in the panel and on hover, so a rejection on Publish should be rare.
  An unknown key gets the nearest valid one ("Unknown key `kidney_warning`. Renal
  limits go in `:::renal-dosing`, e.g. `egfr < 30: …`"). Publish stays disabled until
  every error is fixed. Warnings (e.g. a value identical to the source) don't block.
- **Work is never lost.** The draft autosaves locally on every change (per page and
  section, kept for 7 days), so a failed publish or closed tab costs nothing.
- **One source of truth.** The panel, autocomplete and server validation all read from
  one registry: `infobox_properties` plus a new `block_schemas` (block name, line
  grammar, value types, citation rule, help text). A new key shows up in the editor
  without a frontend release.

## 5. Structured blocks

| Block | Writes to | Status |
| --- | --- | --- |
| `:::brands` | `brand_edits` (phase 15h) | table exists |
| `:::infobox` | `infobox_edits` (phase 15f), keys from `infobox_properties` | table exists |
| `:::renal-dosing` | new `renal_dose_rules` (pcid, measure eGFR/CrCl, bounds, action, reference, revision) | new |
| `:::interactions` | open: community-sourced `clinical_statements` rows or a separate table (§9 Q3) | later |
| `::classifications` overrides | open: cited add/remove of class membership, beside `class_members` | later |
| `::identifiers` overrides | cited correction beside the ingested value | later |

Rules shared by all blocks:
- Every changed line needs a `[@key]`. Unknown keys, malformed values and missing
  citations stop publish, with the error pinned to the line.
- Blocks are validated against their table's types and ranges before anything is
  written.

## 6. References and citations

- New `references` table: `ref_id`, `key` (`pmid:28776081`), type, title, authors,
  container, year, DOI/PMID/setid/URL, retrieved_at, license note.
- Keys are **self-resolving**. On publish, unknown `pmid:`/`doi:`/`dailymed:` keys are
  looked up (PubMed, Crossref, DailyMed) and stored, so contributors never need to
  create a reference first. `url:` keys store the URL and the title they give.
- `page_citations` (revision, ref_id, location: lead / section / block line) is built
  on publish, like `page_links`.
- `::references` renders a numbered list. In the text, citations show as superscript
  numbers linked to it.
- Infobox and brand citations (currently free text, 2 live rows) move to `[@key]`.
  Free text is still accepted as `[@url:…]` or a note during the transition.

## 7. Publish path

1. One shared TypeScript module (`src/pageSource/`) **serializes** the database to
   source text and **parses** source text into a page model: lead, ordered sections,
   blocks, links, values, citations. Preview uses it in the browser.
2. On publish, the browser sends the source text plus the base revision to a new Edge
   Function, `publish-page`. It runs the same parser, validates, resolves new
   references, and calls a SQL function only it may execute (`service_role`). That
   function re-checks verification, protection, rate limits and conflicts, then
   writes everything in **one transaction**.
3. The result is a **bundled revision**: one `page_revisions` row holding the
   community source plus the section order. Every row it wrote (`infobox_edits`,
   `brand_edits`, `renal_dose_rules`, `page_links`, `page_citations`,
   `page_property_refs`) carries its `revision_id`.
4. Revert, diff, patrol, accept and reject act on the bundle. On `reviewed` pages the
   whole bundle is held as pending.

This replaces `refresh_page_links()`'s SQL regexes with the shared parser, which ends
the drift between client and server patterns (for example, `[[x]]` inside a code span
currently creates a `page_links` row).

### 7a. Raw HTML is rejected

- **Rule.** Any node the CommonMark parser classes as HTML (an HTML block or inline
  HTML) blocks publish. It is neither stripped nor stored. This rule is about parsed
  HTML, not the `<` character, so `eGFR <30`, `a < b` and autolinks
  (`<https://…>`) are fine, as is HTML inside code spans and fences (`` `<b>` ``).
- **Message.** The error sits on the line and names the equivalent:

  | Found | Message |
  | --- | --- |
  | `<b>`, `<strong>` | Use `**bold**` |
  | `<i>`, `<em>` | Use `*italic*` |
  | `<br>` | Leave a blank line for a new paragraph |
  | `<a href=…>` | Use `[text](https://…)` or `[[page]]` |
  | `<table>` | Use a Markdown table: `\| a \| b \|` |
  | `<sup>` / `<sub>` | Write it plainly (`mg/m2`, `CO2`). Citations use `[@key]` |
  | anything else | Raw HTML isn't allowed; use Markdown |

- **Enforcement.** The browser flags it live (§4a), and `publish-page` enforces it.
  The renderer keeps its no-`rehype-raw` default as a second guard.
- **Existing text.** Nothing live contains HTML (`page_content`: 0 rows matched
  `<[a-zA-Z]`, checked 2026-10-10).

### 7b. Section editing and conflicts

- **Sections have stable ids.** Each one is stored with a stable id (lead, every
  `##` section, each rail block). Ids survive renaming a heading and moving a section;
  the source text never shows them.
- **A section edit sends three things:** the section id, the base revision, and the
  new section text.
- **The server merges by section.** On publish, `publish-page` compares the section
  as it was in the base revision with its current text:
  - **Same section unchanged since the base:** the new text replaces it in the
    current revision. Other people's edits to other sections stay as they are, with
    no conflict.
  - **Same section changed since the base:** a real conflict. The editor shows the
    contributor's text beside the current text, keeps the draft, and asks them to
    merge. Their work is never discarded.
- **Full-page edits merge the same way,** section by section. A conflict arises only
  for sections both people changed, or when both changed the section order.
- **Structured blocks merge per line,** so two people correcting different
  `:::infobox` keys at once never conflict.
- **Protected pages:** on `reviewed` pages a pending bundle records its base. On
  accept, the same merge runs; a pending edit is "stale" only if a section it touched
  changed since its base.
- **History:** each revision lists which sections it changed, so history and the
  review queue can say "edited Patient education". Revert can also restore one
  section.

**Rejected on publish:**
- raw HTML (§7a)
- deleting a template section
- editing a locked line
- an unknown block or section name
- a changed structured line without a citation
- a body over the size cap

## 8. What changes in the current UI

| Today | Becomes |
| --- | --- |
| `OpenSection` + `OverviewEditor` (description + body) | Lead and contributor sections rendered in place. One page editor. |
| Per-row Quick Facts edit (`InfoboxFact.tsx`) | Each row's **edit** opens the page editor at `:::infobox`. Row history stays. |
| Brand line edit (`BrandNames.tsx`) | Opens the page editor at `:::brands` |
| `page_content.description` / `body_md` | Converted once into the lead and sections. Live: 4 descriptions, 1 body (checked 2026-10-10), so it's trivial. |
| `/drugs/:slug/history` line diff | Diff of the community source, plus a list of structured changes ("acb_score: → 2 [@…]") |
| `/review` queues (page / Quick Facts / brands / new pages) | Page edits become one bundle item, labelled with the sections it changed. New pages stay separate. |
| Whole-page save conflict (`edit_conflict`) | Section-level merge. Only same-section edits conflict (§7b). |

The phase-15 tables, RPCs, roles, protection, rate limits and NPI gate all stay.

## 9. Open questions

1. **Short description.** Keep a separate one-line short description (used under the
   title, in search results and in the API), or take the lead's first sentence?
   Separate is more reliable: sentence splitting trips on "e.g." and doses.
2. **Contributor sections.** "Template sections can't be deleted" is read as applying
   to the type's default sections. Sections a contributor added can be removed by a
   later edit, so a vandal's heading isn't permanent. Confirm.
3. **Interactions.** Should community interactions become `clinical_statements` rows
   (`source_agency = 'community'`, with a revision id), or go in a separate table until
   reviewed? The first makes them first-class in the API and the triple store; the
   second keeps the triple store ingest-only.
4. **Empty template sections** (e.g. a new page's `## Patient education`). Hide them on
   the read view, or show "Nothing here yet — edit"? Wikipedia hides them.
5. **Default templates per type.** The drug template is §3. Concept, class and
   herbal templates: start from their current layouts plus `## Patient education`?

## 10. Build order

1. **Hardening:** shared parser module with test fixtures (including HTML-rejection and
   `[NONE]` cases); `block_schemas` registry; heading anchors on community sections.
   **Built 2026-10-10 (branch `feat/page-source-parser`, not merged; migration not applied):**
   - `src/pageSource/`: parser (`parse.ts`), block grammars (`blocks.ts`), prose/HTML
     checks (`prose.ts`, using the CommonMark parser), citations (`citations.ts`),
     serializer and templates (`serialize.ts`), key panel and autocomplete data
     (`assist.ts`), suggestions (`suggest.ts`), registry (`registry.json`).
   - `db/phase16a_block_schemas.sql`: `block_schemas`, `section_embeds`, `page_templates`
     (read-only to anon/authenticated) and `page_source_registry()`. Tested on a local
     Postgres 16: it returns exactly `registry.json`, and anon can't write.
   - Worked example: `src/pageSource/fixtures/metformin.page.md`, a complete metformin
     page (lead, 5 contributor sections, both template sections, renal dosing block,
     one cited Quick Facts override, 8 references) that parses with no diagnostics and
     serializes back byte-for-byte. 56 tests in `src/pageSource/pageSource.test.ts`.
   - Heading anchors: `WikiMarkdown` gives contributor headings ids (`#section-…`).
   - The drug template includes `## Renal dosing` and `## Patient education` as
     provisional template sections (§9 Q5 still open).
2. **References:** `references` + `page_citations` tables, `[@key]` resolution in
   `publish-page`, `::references` rendering.
3. **Source model:** serializer/parser for lead, sections, rail blocks, `:::infobox`,
   `:::brands`; stable section ids; per-page section order; bundled revisions with
   section-level merge (§7b); `publish-page` and its SQL function; one-time conversion
   of the 4 descriptions and 1 body.
4. **Editor UI:** section edit links (the default) and the Edit page tab;
   Source/Preview/Publish; block panel, autocomplete and live validation (§4a); local
   draft autosave; conflict merge screen; citation picker (search PubMed/DailyMed,
   insert `[@key]`). Retire `OverviewEditor` and the per-row editors.
5. **New blocks:** `renal_dose_rules` and `:::renal-dosing`, then interactions once
   §9 Q3 is settled.
6. **History and review:** bundle diffs and a single queue item per publish.
7. **API:** page text (Markdown + sanitized HTML), section order, references, licence
   (CC BY-SA 4.0 text / CC0 structured), revision id and contributor handles.
