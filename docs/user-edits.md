# Community editing — spec

> Drafted 2026-10-04 from Joshua's decisions in session; updated the same day with
> the patrol, protection and attribution decisions. **Applied to production
> 2026-10-04** as phase15a–c (apply_migration) and phase15d–e (SQL editor, recorded
> in migration history); `verify-npi` v5 deployed. Source:
> `db/phase15_community_editing.sql`; 46/46 behaviour tests on a local Postgres 16
> copy (`db/test/`). Database side done — frontend (§11 steps 2–7) not started. Supersedes the "propose an
> edit → moderator approves" plan in ROADMAP item 7 and the comment in
> `Account.tsx`; `revisions` + `approve_revision()` stay for maintainer batch
> changes but are no longer the community path.

## 1. Decisions (Joshua, 2026-10-04)

| Question | Decision |
| --- | --- |
| Page anatomy | Permanent / editable split, top to bottom (§2) |
| Description | Editable by anyone verified; it is the lead of the open section |
| Review model | **Publish-then-patrol** (Wikipedia model), not pre-moderation |
| New pages | Any type of page can be created by a verified contributor |
| Infobox | Every Quick Facts row is editable |
| Transclusion | Pages can pull a property value live, e.g. the ACB score of metformin |
| Prose licence | Left to Claude → **CC BY-SA 4.0** for page text, **CC0** for structured edits (§8) |
| Patrollers | **Joshua only at launch** (admin). Others granted by Joshua via `grant_role()` |
| High-risk pages | **Start protected as `reviewed`** — non-patroller edits wait for acceptance (§9) |
| Attribution | **Handle + credential badge** (`@handle · PharmD`); contributor can hide the badge |

Unchanged: contributing requires a verified, active NPI (`provider_verifications`,
2026-09-19). Reading never requires an account.

## 2. Page anatomy

1. **Header** — permanent: name, PCID, entity type, save toggle. Editable: brand
   names / synonyms (as community values; RxNorm rows are never altered).
2. **Jump to FDA prescribing label** — permanent.
3. **Quick facts infobox** — every row editable (§5).
4. **Open section** — editable markdown: description (lead) then any headings and
   paragraphs contributors write ("## Vancomycin dosing calculations"), with
   `[[wiki links]]` (§4) and `{{property}}` values (§6).
5. **Permanent sections** — hierarchy, FDA label, identifiers, guidelines,
   classifications, lists, metadata. Ingest-owned; not editable.

The same open section and history exist on every PCID page (drug, clinical concept,
measurement, herbal…), not only moieties.

## 3. Storage and history

- `page_content` (one row per PCID): `description`, `body_md`, `current_revision_id`,
  `protection` (`open` | `patrollers`).
- `page_revisions`: every save is a full copy with `parent_id`, edit summary
  (required), size delta, kind (`create` / `edit` / `revert` / `seed`) and patrol
  status (`unpatrolled` / `patrolled` / `reverted`).
- **Edit conflicts:** a save names the revision it started from; if someone saved in
  between, the RPC raises `edit_conflict` and the editor shows both versions.
- **Revert:** any verified contributor can restore an earlier revision; the
  revisions it undoes are marked `reverted`.
- `moieties.description_text` (0 of 15,679 filled) is superseded by
  `page_content.description`. Joshua's descriptions spreadsheet
  (`PharmacyCommons_Moiety_Descriptions_template_2026-10-02.xlsx`) loads as `seed`
  revisions. Drop the column after the frontend moves.

## 4. Wiki links

- Syntax: `[[metformin]]`, `[[metformin|Glucophage]]`, `[[PCID-1000123]]`.
- Resolution order: `PCID-n` → exact slug → slugified text → a unique
  case-insensitive name. Slugs are globally unique (`entities_slug_key`), so a slug
  link is never ambiguous; a name shared by two entities stays unresolved.
- On every save, links are parsed **server-side** into `page_links`
  (source, text, target PCID or null). That gives:
  - **What links here** on every page (diabetes lists every drug page linking to it).
  - **Red links** for unresolved targets → "Create this page", pre-filled.
  - Stable links when a slug is renamed (render from `target_pcid`).
- Links are prose, not facts: they are not written to `clinical_statements`.
  Promoting a link to a sourced triple can be a later patrolled step.
- Editor autocompletes after `[[` from search.

## 5. Infobox

- `infobox_properties` is the registry (key, label, entity types, source). Seeded
  with today's Quick Facts rows: indications, dosing, contraindications,
  boxed_warning, epc_class, legal_status, most_used, do_not_crush, acb_score,
  qtc_risk. Templates per entity type come from `entity_types`.
- `infobox_edits` holds community values with a **required citation** and edit
  summary; one current row per (PCID, property). A null value clears it.
- **Display rule:** a community value is shown with its citation and a small
  "community" mark; the source value stays one tap away ("FDA label says …").
  Ingests never touch `infobox_edits`, so a reload can't erase a correction, and
  disagreement is shown, not resolved silently.
- Note: `epc_class` is editable here as an infobox value only — the
  Classifications section and `class_members` stay ingest-owned.

## 6. Property values in text (transclusion)

- Syntax: `{{acb_score:metformin}}`; on the drug's own page `{{acb_score}}`.
  Keys are case-insensitive. (Joshua proposed `{ACB_score:metformin}`; double
  braces avoid clashing with ordinary braces in text and match `[[ ]]`.)
- Value comes live from `resolve_property(key, pcid)`: community value first, else
  the source (list item, attribute). Label- and class-derived properties are
  computed by the client from data the page already loads.
- Rendered as an inline chip with the source on hover; a missing value renders
  "not recorded", never blank.
- References are stored in `page_property_refs`, so "pages using metformin's ACB
  score" is queryable.
- Works anywhere markdown renders, including list notes later.

## 7. New pages

The type picker maps to PCID blocks:

| User picks | Block / `entity_kind` | Subtype stored |
| --- | --- | --- |
| Drug — single ingredient | 1 `moiety` | — |
| Drug — salt or ester form | 3 `precise_form` | — |
| Drug — combination | 2 `combination` | — |
| Drug — branded product | 4 `formulation` | — |
| Dietary supplement — defined chemical (melatonin, vitamin D) | 1 `moiety` | — |
| Herbal / biological source (ashwagandha, fish oil) | 9 `functional` | `group_type` |
| Indication · Symptom · Adverse effect · Contraindication · Risk factor | 6 `clinical` | `concept_type` (existing values) |
| Lab / measurement | 7 `measurement` | `measurement_type` |
| Biological target | 8 `target` | — |

Class (5) and List (10) pages stay curated.

`create_page()`:
- Blocks duplicates by slug, by name, and (drug kinds) by UNII or CAS, returning the
  existing page so the UI can say "already exists → go there".
- Mints from `pcid_blocks.next_pcid` under a row lock, inserts `entities` + the
  block's table, tags `entity_changes` as `community-create`.
- Records the page in `community_pages` (`unpatrolled` until a patroller checks it).
- Because publish-then-patrol mints at creation, a duplicate found later is **merged,
  not deleted**: retire the PCID in `pcid_retired` with the new
  `replaced_by_pcid`, and `/id/PCID-n` redirects to the keeper.

**Consequence for the workbook:** once the site mints PCIDs, the database's
`pcid_blocks` is authoritative. The master workbook stops being the place PCIDs are
minted; `PCID_Blocks.Highest_Assigned` and `Dispatch_Log` are refreshed from the
database (export) rather than the other way round.

## 8. Licensing

- **Page text** (description, open section): **CC BY-SA 4.0**. Share-alike keeps
  community prose from being enclosed (same intent as GPL-3.0 for the code), and it
  is the Wikipedia licence, so text can move between the two with attribution.
- **Structured edits** (infobox values, new-page records): **CC0 1.0**, matching
  `api_meta.data_license`.
- API documents carry the page text with its own licence field.
- **Required legal edits before launch** (`docs/terms-of-use.md`):
  - §3 currently says contributions go through "the `approve_revision()` workflow
    prior to live publication" — false under publish-then-patrol.
  - §3's grant is a licence to Pharmacy Commons only; it must become "you license
    your text under CC BY-SA 4.0 and your structured contributions under CC0".
  - Add the licence notice under the editor's Save button ("By saving, you agree…").
  These are legal text: Joshua approves the wording.

## 9. Patrol, protection, safety and roles

**Roles** (`user_roles`): `patroller`, `admin` (admin implies patroller). At launch
only Joshua holds a role (admin, seeded). Joshua grants `patroller` with
`grant_role()` to verified contributors with a track record (guideline: 10+
edits, none reverted); there is no automatic promotion. Patroller edits are
auto-patrolled; nobody patrols or accepts their own edit.

**Protection levels** (`page_content.protection`):

| Level | Non-patroller save | Use |
| --- | --- | --- |
| `open` (default) | Live at once, enters patrol queue | Everything else |
| `reviewed` | Saved as **pending**; live page unchanged until a patroller accepts | High-alert / NTI drugs |
| `patrollers` | Refused | Emergency lock (vandalism, legal) |

- On a `reviewed` page the editor shows: "This high-alert page is reviewed before
  changes go live. Your edit will be sent to the patrol queue."
- Accepting requires the pending edit to still be based on the live revision; if
  another change was accepted first it is **stale** and must be redone (no silent
  overwrite). Rejecting requires a note, which the contributor sees.
- Infobox edits on `reviewed` pages are held the same way.
- Admin changes a page's level with `set_page_protection()`.

**Seeded as `reviewed` (phase15e): 44 moieties → 217 pages** (each moiety plus every
precise form, brand formulation and combination under it in `moiety_hierarchy`;
counts checked against live data 2026-10-04):
- Anticoagulants and thrombolytics: warfarin, heparin, enoxaparin, dalteparin,
  fondaparinux, apixaban, rivaroxaban, dabigatran, edoxaban, alteplase,
  tenecteplase, reteplase
- Insulins: all 16 `insulin*` moieties (insulin-like growth factor II excluded — not
  an insulin)
- Sulfonylureas: glipizide, glyburide, glimepiride
- High-potency opioids: fentanyl, methadone, hydromorphone
- Narrow therapeutic index: digoxin, lithium, phenytoin, fosphenytoin,
  carbamazepine, theophylline, tacrolimus, cyclosporine
- Cytotoxic chemotherapy: methotrexate, fluorouracil (Joshua, 2026-10-04: no other
  protections).

**Attribution:** history shows `@handle · badge`.
- Handle (`contributor_profiles.handle`) is chosen before the first save.
- Badge comes from the NPI Registry credential, normalised by
  `pc_credential_badge()` ("PharmD, BCPS" → PharmD; RPh, MD, DO, NP, APRN, PA,
  RN, DDS, DMD, DPM, OD, CPhT, PhD), falling back to the primary taxonomy
  ("Pharmacist"). The credential is self-reported to NPPES, so the UI says "as
  listed in the NPI Registry".
- `display_credential` (default on) lets a contributor show the handle only.
- NPI number, legal name and auth uuid are never exposed (`page_history()`).
- `verify-npi` didn't store the credential (it was only folded into
  `verified_name`); the updated function saves it to the new
  `provider_verifications.credential`. Existing verifications show the taxonomy
  until the person re-verifies.

**Other safeguards**
- **Blocks:** `block_contributor()` (optional expiry) stops a user editing.
- **Rate limits:** 60 saves/hour, 20 new pages/day (patrollers exempt).
- **Content rules:** no raw HTML; markdown only; external links
  `rel="nofollow ugc"`; images off for v1; 200k-character body cap.
- **Clinical banner:** every open section shows "Community-written. Last patrolled
  {date}." and links the medical disclaimer.

## 10. RPCs (all SECURITY DEFINER; no direct table writes)

| RPC | Who | Does |
| --- | --- | --- |
| `set_contributor_handle(handle, display_credential?)` | verified | handle + badge toggle |
| `save_page(pcid, base_rev, description, body_md, summary)` | verified | new revision; live on open pages, pending on `reviewed`; conflict check; rebuilds links/refs |
| `accept_revision(rev, note?)` / `reject_revision(rev, note)` | patroller | decide a pending page edit (stale check on accept) |
| `revert_page(pcid, to_rev, summary?)` | verified | restores a revision, marks undone ones `reverted` |
| `patrol_revision(rev)` | patroller | marks a live edit patrolled (not own) |
| `edit_infobox(pcid, key, value, citation, summary)` | verified | community infobox value (pending on `reviewed`) |
| `review_infobox_edit(id, accept, note?)` | patroller | decide a pending infobox edit |
| `grant_role` / `revoke_role` / `set_page_protection` / `block_contributor` | admin | governance |
| `create_page(kind, name, summary, description?, body?, subtype?, identifiers?)` | verified | duplicate checks, mint PCID, create page |
| `resolve_property(key, pcid)` | public | value for `{{…}}` and infobox |
| `resolve_page_target(text)` | public | link resolution |
| `page_history(pcid, limit?)` | public | revisions with handle + badge |

## 11. Build order

1. **Schema + RPCs** — apply phase 15a–e, then redeploy `verify-npi`. Already
   tested locally (`db/test/stubs.sql` + `tests.sql`, 46/46): gates, live vs held
   saves, conflicts, revert, accept/stale/reject, links and red links, property
   values, citation rule, duplicate and kind blocks, PCID minting, badges, admin
   RPCs, blocks, and that API roles can't write tables or read author ids.
2. **Read path** — re-lay out `DrugDetail` (and a generic page for non-drug types,
   ✅ 2026-10-05 with step 5)
   into §2's order; render the open section with `[[ ]]` and `{{ }}`; "What links
   here". Load Joshua's description spreadsheet as `seed` revisions.
3. **Editor** — ✅ 2026-10-04 (`src/OverviewEditor.tsx`): Write/Preview, `[[`
   autocomplete, required edit summary, licence notice, conflict screen, handle
   setup on first edit. Still to do: "My contributions" tab on Account.
4. **Infobox editing** — ✅ 2026-10-05 (`src/InfoboxFact.tsx`, phase 15f): per-row edit
   with citation, community value shown first with the source value one tap away,
   per-row history and review. Brand-name edits are not built (brands are RxNorm rows
   and would need their own overlay).
5. **New pages** — ✅ 2026-10-05: `/new` (`src/pages/CreatePage.tsx`) with the §7
   type picker (plus a measurement-type picker for labs), "Is it one of these?" name
   matches while typing, optional UNII/CAS for drug kinds, and links to the existing
   page when `create_page()` refuses a duplicate. Red links in an Overview open `/new`
   with the name filled in; verified contributors also get "Create a page" under the
   Overview. Clinical concepts, labs, targets and herbals get their own layout on
   `/drugs/:slug` (`ConceptPage` in `src/DrugDetail.tsx`, `src/concepts.ts`): name and
   kind, the Overview, "In the knowledge base" (`clinical_statements` whose object is
   the page, grouped by predicate), identifiers and the machine-readable record. No
   label, Quick Facts or hierarchy.
6. **History / diff / revert / patrol queue** — ✅ 2026-10-05: `/drugs/:slug/history`
   and `/review`. Still to do: admin UI for protection, roles and blocks (RPCs exist).
7. **Legal + launch** — terms of use §3, licence notice, disclaimer banner; update
   API documents (page text + licence), `updates.ts`, ROADMAP item 7.

## 11a. Fixes after launch

- 2026-10-05, phase 15f: `edit_infobox()` failed with a NOT NULL error on any page
  without a `page_content` row (no Overview text yet), because the protection lookup
  returned NULL. Found by the local test for 15f before any live Quick Facts edit
  existed (0 rows); fixed with `coalesce(protection, 'open')` and covered by a
  regression check.

## 12. Open items for Joshua

- None open. Decided 2026-10-04: no protection beyond the seeded 44 moieties;
  terms-of-use §3 rewritten and approved (in repo copy, not yet deployed);
  phase 15 applied.
