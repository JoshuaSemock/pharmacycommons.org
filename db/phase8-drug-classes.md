# Phase 8 — Drug classes and class pages

Every moiety in `entities` (entity_type = 'moiety') belongs to at least one class. Each class has a page at
`/classes/:slug` listing its members as links; each drug page shows its classes.

## Data model

| Object | Purpose |
|---|---|
| `drug_classes` (+ `entities` row, block 5 PCIDs) | One row per class. New columns: `class_type`, `source_system`, `source_code`, `parent_pcid`, `level`, `description`, `member_count`. |
| `class_members(class_pcid, member_pcid, is_direct, source_system, match_basis)` | Many-to-many membership. `is_direct = false` means the drug is inherited from a sub-class (ATC/VA/rule hierarchy) or, for ChemOnt, that the term is an ancestor of a more specific term the drug also carries. |
| `class_rules` | Pharmacy Commons groups: biologic types, natural-product types and INN/USAN stem groups, each with a regex on the drug name. `fallback_only` rules (INV, REVIEW) apply only to drugs still in no class. |
| `class_agent_review` / `class_agent_skip` | Pharmacist-agent assignments for drugs no source covered (confidence high/medium, basis, optional source URL). Reapplied on every rebuild as `source_system = 'agent_review'`. |
| staging: `rxclass_lookup`, `rxclass_drug`, `rxclass_classes`, `rxclass_va_products`, `chemont_terms`, `classyfire_lookup`, `class_review_queue` | Raw pulls from RxClass, ChemOnt and ClassyFire. |

`class_type` values and the labels the site shows:

| class_type | Label | Source |
|---|---|---|
| atc | Therapeutic area (WHO ATC) | RxClass ATC levels 1–4, hierarchy by code prefix |
| epc | Pharmacologic class (FDA EPC) | RxClass DailyMed/FDASPL `has_epc` |
| moa | Mechanism of action | RxClass `has_moa` |
| pe | Physiologic effect | RxClass `has_pe` |
| chem | Chemical structure (FDA) | RxClass `has_chemical_structure` |
| va | Therapeutic class (VA) | RxClass VA, kept only when a single-ingredient product of the drug is in the class |
| chemont | Chemical taxonomy (ChemOnt) | `chemont_links` (DrugBank/ClassyFire) + ClassyFire lookups; kingdom level omitted |
| curated | Pharmacy Commons group | `class_rules` + reviewed assignments |

## Rebuild

Everything derived is rebuilt by one idempotent call (service role only):

```sql
set statement_timeout = '15min';
select public.rebuild_classes();
```

Order of operations: build candidate classes → claim pre-existing untyped `drug_classes` rows with the same
name (keeps their PCIDs and slugs) → mint the rest via `mint_class()` → set parents → rebuild memberships
(RxClass direct, rule patterns, reviewed assignments, ATC/VA/rule ancestors, ChemOnt, curated
`member_of` clinical statements, name-root inheritance for salt/stereo/"(exception)" variants) → fallback
INV / REVIEW → refresh `member_count`. Memberships with `source_system = 'curated'` are never deleted.

Filters applied during the rebuild:
- ATC "combinations of …" codes are dropped when the drug also has a single-agent ATC code.
- VA classes are dropped when they only reach the drug through a combination product.

## Ingest functions (edge functions, header `x-ingest-token` = `ingest_tokens.name='rxclass'`)

- `rxclass-ingest` — `{"limit":200,"chain":true}` drug pass; `{"mode":"taxonomy"}` ATC/VA trees;
  `{"mode":"va_verify"}` VA single-ingredient product lists.
- `classyfire-ingest` — `{"limit":60,"chain":true}` ChemOnt lineage by InChIKey (PubChem name → InChIKey
  fallback). ClassyFire is slow and drops ~40–50% of requests; failures are recorded as `status='error'`
  in `classyfire_lookup` and can be retried by deleting those rows.
- `chemont-terms` — one-off load of the ChemOnt 2.1 ontology into `chemont_terms`.

After any ingest run, call `rebuild_classes()`.

## Read API (anon)

- `get_class(p_slug)` → jsonb: header, ancestors, children (with counts), members.
- `get_entity_classes(p_pcid, p_include_inherited)` → rows; precise forms fall back to their moiety's classes.
- `list_classes(p_type, p_search)` → rows with member counts (classes with ≥ 1 member).

## Coverage at build time (2026-09-23)

15,610 / 15,610 moieties in ≥ 1 class; 4,884 class pages. About 6,300 carry an ATC/EPC/MOA/PE/VA class;
the rest are placed by structure (ChemOnt), biologic/natural-product type, INN stem or reviewed assignment.
77 are in "Awaiting classification" (devices, test kits, unidentifiable names) and about 1,200 are only in
"Investigational code-named compounds".
