# Data Model Decisions — Figma UI ↔ Drug_Matrix Schema Reconciliation

Date: 2026-09-02
Context: Reconciling the Figma Make UI export (`SearchView.tsx`, `DrugDetail.tsx`, `data.ts`) against the Drug_Matrix relational schema.

## 1. Combination products route to every component ingredient

**Decision:** A formulation is no longer tied to a single parent ingredient. Each `DrugFormulation` carries an `ingredients[]` array listing every active component, so a combination product like Lomotil (diphenoxylate/atropine) or Caduet (amlodipine/atorvastatin) shows up — and links correctly — from *each* ingredient's own drug page, not just one "primary" substance.

**Frontend change:** `DrugFormulation.ingredients: FormulationIngredient[]` (apiUid, slug, name, optional roleNote). `HierarchyPanel` now renders a clickable chip per ingredient when a formulation has more than one.

**Backend implication:** The API layer flattens the FRM↔API junction table into this per-formulation ingredient list on read; no "primary ingredient" designation is needed in the schema itself, though the API may choose one for card/list-view display purposes only.

**Demo data:** Diphenoxylate and Atropine were added as full entries with a shared Lomotil formulation. Amlodipine and Clavulanate were added (as `isStub: true`) to complete the Caduet and Augmentin combinations that already existed in the mock data.

## 2. Drug interactions link only to in-database entries

**Decision:** `DrugInteraction` now carries optional `interactingDrugUid`/`interactingDrugSlug` fields. When the interacting agent is itself a Drug_Matrix entry (a real drug, or a non-prescribable substance like alcohol or iodinated contrast media), the interaction is a clickable link. When it isn't — most commonly because the interaction is described at the level of a drug *class* (e.g. "NSAIDs," "Strong CYP3A4 inhibitors," "Potassium-sparing diuretics") rather than a single substance — it stays plain text.

**Note on scope:** This is a refinement of the original instruction. Alcohol and iodinated contrast media are modeled as real entries (`entryType: 'substance'`) per the given examples. Several other interacting agents in the existing mock data (cimetidine, MAO inhibitors, warfarin, etc.) are genuinely single substances too, but most were left as text-only for now since this is demo data that will be superseded by openFDA ingestion — cimetidine was added as one representative linked example so the pattern is testable end-to-end. Drug *classes* should not be forced into fake single-entity Drug_Matrix records; if class-level interaction linking is wanted later, that's a separate "drug class" entity, not a Drug_Matrix API/PIN/FRM record.

**Backend implication:** Needs a `drug_interactions` junction table (`entry_uid_1`, `entry_uid_2`, severity, mechanism, source citation), with a uniqueness constraint preventing duplicate reverse-pairs (A→B and B→A recorded once, displayed on both entries' pages). Substance entries (alcohol, contrast media) need an `entry_type` column distinguishing them from prescribable drugs — see decision 4's schema notes — so they're excluded from general search/browse (already implemented client-side in `SearchView.tsx`) while still being valid interaction targets.

## 3. Classification stays three-dimensional, but each dimension is multi-valued, with room for more

**Decision:** `chemicalClass` is now an array (`string[]`) like `mechanism` and `physiologicEffect`, since some compounds have hybrid or dual chemical classifications. An optional `additionalTags?: string[]` field was added as an escape hatch for drug classes that need more than the three core dimensions, without requiring a fourth first-class dimension in the schema for what may be a handful of edge cases.

**Frontend change:** `ClassificationTab` renders `chemicalClass` as a chip list (previously a single line of text) and conditionally renders an "Additional Classification" card when `additionalTags` is present.

**Backend implication:** No schema change needed for the three core M2M dimensions (they were already many-to-many). `additionalTags` would map to either a lightweight free-text tag table or a generic key-value classification extension table, decided when a concrete case requiring it comes up — no drug in the current dataset needs it yet.

## 4. UID mapping layer

**Decision:** Every `Drug` object now carries both `id` (the URL-facing slug, unchanged) and `apiUid` (the real Drug_Matrix UID, e.g. `API-0001`). The frontend should only ever need `id`; the API layer resolves slug↔UID in both directions so raw API-XXXX/PIN-XXXX/FRM-XXXX values never appear in routes.

**Backend implication:** Add a unique `slug` column to the API, PIN, and FRM UID tables, generated from name with a dedupe suffix for collisions (e.g. two unrelated compounds sharing a root name). See `schema-updates.sql` for the concrete ALTER statements.

---

## Summary of frontend files touched
- `src/data.ts` — type definitions and all mock entries updated to the new shapes; new entries added (amlodipine, clavulanate, diphenoxylate, atropine, cimetidine, alcohol, iodinated contrast media)
- `src/DrugDetail.tsx` — hierarchy panel renders multi-ingredient chips; classification tab renders array + additional tags; interactions tab renders clickable links when a slug is present
- `src/SearchView.tsx` — chemicalClass array-aware search matching and display; substance entries excluded from browse/search results

## Still open (unchanged from prior status)
- Community contribution workflow
- MIT vs. GPL-3.0 license resolution (blocks Intent-to-Use filing)
