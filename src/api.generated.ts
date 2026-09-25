/**
 * Pharmacy Commons — API types
 *
 * Hand-maintained to match 01_core_schema_v2.sql. Field names are snake_case to
 * mirror what PostgREST and the stored functions return, so a hydrated record
 * and a catalog-derived one are the same shape.
 */

export type DrugEntityType = 'drug' | 'substance' | 'combination' | 'device'

export type EcoRisk = 'insignificant' | 'low' | 'moderate' | 'high'

export type EcoMetrics = {
  rq: number | null
  pec: number | null
  mec: number | null
  dpd: number | null
  risk: EcoRisk | null
  excretion_route?: string | null
  primary_concern?: string | null
  notes?: string | null
}

export type DrugInteraction = {
  interacting_drug_name: string
  interacting_drug_slug?: string | null
  interacting_drug_pcid?: string | null
  severity?: 'minor' | 'moderate' | 'major' | null
  mechanism?: string | null
}

export type DrugComponent = {
  pcid_code: string
  slug: string
  name: string
  role_note?: string | null
}

/** One related entity nested under a moiety's hierarchy section. */
export type HierarchyMember = {
  pcid_code: string
  slug: string
  name: string
  term_type: string | null
  primary_brand?: string | null
  /** Brand names of this member (combination products carry theirs, e.g. Janumet). */
  brands?: string[]
}

/**
 * A moiety's precise forms, combination products, and known brand names —
 * derived from the `moiety_hierarchy` materialized view (base_name matching;
 * there's no FK for this yet). Only present on a moiety's DrugDetail; null
 * for every other entity type.
 */
export type MoietyHierarchy = {
  precise_forms: HierarchyMember[]
  combinations: HierarchyMember[]
  brand_names: string[]
}

/**
 * One brand name for a drug, from the `entity_brand_names` materialized view
 * (Drugs@FDA NDA/BLA products + RxNorm brand names + workbook-curated brands).
 */
export type BrandName = {
  /** As the source spells it: RxNorm casing when known ("Glucophage"), else FDA upper case. Format with names.ts. */
  name: string
  /** false = every FDA product under this brand is discontinued; null = status unknown (RxNorm/curated only). */
  marketed: boolean | null
  /** FDA application numbers the brand was approved under, e.g. ["NDA020357"]. */
  appl_nos: string[]
  /** RxNorm concept for the brand name, when RxNorm has it. */
  rxcui: string | null
  sources: ('drugsfda' | 'rxnorm' | 'drug_matrix')[]
}

/** Shape used by search results and browse lists. */
export type DrugListItem = {
  pcid_code: string
  slug: string
  name: string
  entity_type: DrugEntityType
  description: string | null
  eco_risk: EcoRisk | null
  /** 'partial' = from the static catalog; 'full' = hydrated from Supabase. */
  status: 'partial' | 'full'
}

/** Shape used by the drug detail page. */
export type DrugDetail = DrugListItem & {
  attributes: Record<string, unknown>
  components: DrugComponent[]
  interactions: DrugInteraction[]
  eco: EcoMetrics | null
  fda_ndc_codes: string[]
  /** Only populated when entity_type is 'moiety' (see api.ts:getDrugBySlug). */
  hierarchy: MoietyHierarchy | null
  /** Brand names for this drug or combination product, current ones first. */
  brands: BrandName[]
  created_at?: string
  updated_at?: string
}

export type DrugListResponse = {
  drugs: DrugListItem[]
  total: number
  offset: number
  limit: number
  has_more: boolean
}

export type SearchResponse = DrugListResponse & {
  query: string
}

export type ApiError = {
  error: true
  code: string
  message: string
}

export type DrugsListQuery = {
  limit?: number
  offset?: number
  entity_type?: DrugEntityType | null
}

export type DrugsSearchQuery = {
  q: string
  limit?: number
  offset?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Drug classes (2026-09-22)
//
// Every drug belongs to several classes, one or more per classification
// system: FDA Established Pharmacologic Class / Mechanism of Action /
// Physiologic Effect / Chemical Structure (via RxClass), WHO ATC, VA class,
// ChemOnt, and curated classes. Shapes mirror what the `get_class`,
// `get_entity_classes` and `list_classes` RPCs return.
// ─────────────────────────────────────────────────────────────────────────────

/** Classification system a class comes from. */
export type ClassType = 'epc' | 'moa' | 'pe' | 'chem' | 'atc' | 'va' | 'chemont' | 'curated'

/** A class named by reference — an ancestor in a class page's breadcrumb. */
export type ClassRef = {
  slug: string
  name: string
  /** Code in the source system, e.g. "N06AB" (ATC) or "CHEMONTID:0000012"; null when the source has none. */
  source_code: string | null
}

/** A direct sub-class of a class, with how many drugs it holds. */
export type ClassChild = ClassRef & {
  member_count: number
}

/** One drug in a class. `is_direct` is false when it is only in a sub-class. */
export type ClassMember = {
  pcid: number
  slug: string
  name: string
  /** Usually 'moiety'; every entity type links to /drugs/:slug. */
  entity_type: string
  is_direct: boolean
}

/** One row of `list_classes` — only classes with at least one member. */
export type ClassSummary = {
  slug: string
  name: string
  class_type: ClassType
  /** Human label for the class type, e.g. "WHO ATC". */
  class_type_label: string
  source_code: string | null
  /** Depth in the source hierarchy (ATC 1–5); null for flat systems. */
  level: number | null
  member_count: number
}

/** `search_classes` — a drug class that matched a Browse search, with its member moieties. */
export type ClassSearchHit = {
  slug: string
  name: string
  class_type: ClassType
  class_type_label: string
  source_code: string | null
  /**
   * How it matched, strongest first: a curated abbreviation (`class_search_aliases`),
   * an abbreviation in the class name's parentheses, the name's initials, or name words.
   */
  match: 'alias' | 'paren' | 'initialism' | 'name'
  /** Block-1 moieties in the class, alphabetical. */
  members: { pcid: number; slug: string; name: string }[]
}

/** `get_class` — one class page. */
export type ClassDetail = {
  pcid: number
  slug: string
  name: string
  class_type: ClassType
  class_type_label: string
  /** Source system name, e.g. "WHO ATC/DDD Index" or "FDA SPL (RxClass)". */
  source_system: string | null
  source_code: string | null
  level: number | null
  description: string | null
  /** Root first. */
  ancestors: ClassRef[]
  children: ClassChild[]
  /** Sorted by name; includes members inherited from sub-classes (is_direct = false). */
  members: ClassMember[]
  member_count: number
}

/** One row of `get_entity_classes` — a class a drug belongs to. */
export type EntityClass = {
  slug: string
  name: string
  class_type: ClassType
  class_type_label: string
  source_code: string | null
  /** false = the drug is in a sub-class of this class, not the class itself. */
  is_direct: boolean
  level: number | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Lists (2026-09-25)
//
// A list is a collection of drugs made for a purpose — a usage ranking, an
// exam's drugs to know — kept separate from classes. Pharmacy Commons lists
// have PCIDs in block 10. Shapes mirror the `list_lists`, `get_list` and
// `get_entity_lists` RPCs (db/phase9a_lists_schema.sql).
// ─────────────────────────────────────────────────────────────────────────────

/** curated = Pharmacy Commons; authority = published by an agency or body; community = made by members. */
export type ListKind = 'curated' | 'authority' | 'community'

/** How a list is ordered when first opened. */
export type ListSort = 'rank' | 'value_desc' | 'name' | 'position'

/** One row of `list_lists`. */
export type ListSummary = {
  pcid: number
  slug: string
  title: string
  description: string | null
  kind: ListKind
  /** Set for sub-lists, e.g. the Notable Drugs categories. */
  parent_slug: string | null
  /** 'US', 'US-GA', … null when the list has no legal scope. */
  jurisdiction: string | null
  item_count: number
  /** What `ListItem.value` means, e.g. "Mean people per year with at least one fill (2019–2023)". */
  measure_label: string | null
  default_sort: ListSort
  sort_order: number
}

/** One drug on a list. */
export type ListItem = {
  /** 1-based order within the list as stored. */
  position: number
  /** The list's own rank; null for unranked lists. */
  rank: number | null
  /** Measured value (see ListDetail.measure_label); null when the list has none. */
  value: number | null
  /** E.g. "CS-2" or "Legend" — only on lists with a jurisdiction. */
  legal_status: string | null
  note: string | null
  /** The name exactly as the source wrote it. */
  source_name: string
  pcid: number
  slug: string
  name: string
  entity_type: string
}

export type ListRef = { slug: string; title: string }
export type ListChild = ListRef & { item_count: number }

/** `get_list` — one list page. */
export type ListDetail = {
  pcid: number
  pcid_code: string
  slug: string
  title: string
  description: string | null
  kind: ListKind
  jurisdiction: string | null
  source_citation: string
  source_url: string | null
  license: string
  measure_label: string | null
  measure_unit: string | null
  /** What `ListItem.rank` means, e.g. "Rank within category". */
  rank_label: string | null
  default_sort: ListSort
  item_count: number
  updated_at: string
  parent: ListRef | null
  children: ListChild[]
  items: ListItem[]
}

/** One row of `get_entity_lists` — a list a drug appears on. */
export type EntityList = {
  slug: string
  title: string
  kind: ListKind
  rank: number | null
  value: number | null
  legal_status: string | null
  /** Set when the drug is on the list through a form or combination of it, e.g. hydrocodone via hydrocodone/acetaminophen. */
  via_pcid: number | null
  via_name: string | null
}
