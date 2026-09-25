/**
 * Pharmacy Commons — API layer
 *
 * Phase 3: queries Supabase directly. The static-catalog fallback and the
 * BACKEND_ENABLED flag are gone — Supabase is now the only source, and a
 * request failure is a real error rather than a silent degrade to a cached
 * manifest (there is nothing left to degrade to).
 *
 * Reads go against `entities` (the cross-block spine — pcid, slug, name,
 * entity_type) joined to whichever of the four block 1–4 satellite tables
 * (`moieties` / `combinations` / `precise_forms` / `formulations`) the PCID's
 * block indicates, plus `clinical_statements` for components and
 * interactions. There is no eco-metrics table yet — `eco` stays null until
 * Phase 4 enrichment lands (CAS Common Chemistry / openFDA / EPA ECOTOX).
 *
 * 2026-09-20: a moiety's DrugDetail also carries `hierarchy` — its precise
 * forms, combination products and known brand names, nested here instead of
 * surfacing as their own catalog/search entries (see catalog.ts and
 * moiety_hierarchy in Supabase). Every other entity type gets `hierarchy: null`.
 *
 * 2026-09-22: every DrugDetail carries `brands`, read from the
 * `entity_brand_names` materialized view (Drugs@FDA NDA/BLA products, RxNorm
 * brand names, and the workbook's curated primary_brand). Combination members
 * in the hierarchy carry their own brands too ("Janumet").
 *
 * 2026-09-22: drug classes — getClassBySlug / getEntityClasses / listClasses
 * call the `get_class`, `get_entity_classes` and `list_classes` RPCs. They are
 * deliberately NOT folded into getDrugBySlug: DrugDetail.tsx loads a drug's
 * classes in its own card (like guidelines), so a slow or failed class lookup
 * never blocks the drug page.
 *
 * 2026-09-25: lists — listLists / getListBySlug / getEntityLists call the
 * `list_lists`, `get_list` and `get_entity_lists` RPCs. Like classes, a drug's
 * lists load in their own card on the drug page.
 */

import { supabase } from './supabaseClient'
import type {
  ApiError,
  BrandName,
  ClassDetail,
  ClassSummary,
  ClassType,
  DrugDetail,
  DrugEntityType,
  DrugInteraction,
  DrugComponent,
  DrugListItem,
  DrugListResponse,
  DrugsListQuery,
  DrugsSearchQuery,
  EntityClass,
  EntityList,
  HierarchyMember,
  ListDetail,
  ListSummary,
  MoietyHierarchy,
  SearchResponse,
} from './api.generated'

// ─────────────────────────────────────────────────────────────────────────────
// Block → satellite table
// ─────────────────────────────────────────────────────────────────────────────

const BLOCK_TABLE = {
  moiety: 'moieties',
  combination: 'combinations',
  precise_form: 'precise_forms',
  formulation: 'formulations',
} as const

type BlockKind = keyof typeof BLOCK_TABLE

function isBlockKind(entityType: string): entityType is BlockKind {
  return entityType in BLOCK_TABLE
}

function toDrugEntityType(entityType: string): DrugEntityType {
  return entityType === 'combination' ? 'combination' : 'drug'
}

/** Splits the source workbook's pipe/comma-delimited code columns. */
function splitCodes(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(/[|,]/)
    .map(s => s.trim())
    .filter(Boolean)
}

const HUMANIZED_FIELDS: Record<string, string> = {
  legal_status: 'Legal status',
  rx_status: 'Rx status',
  fda_marketing_status: 'FDA marketing status',
  cas: 'CAS number',
  unii: 'UNII',
  inchi_key: 'InChIKey',
  drugbank_id: 'DrugBank ID',
  lactmed_id: 'LactMed ID',
  fda_applnos: 'FDA applications',
  base_name: 'Base name',
  origin: 'Origin',
  statute_citation: 'Statute citation',
  mpje_relevance: 'MPJE relevance',
}

/** Builds the detail page's attribute list from whichever satellite columns are populated. */
function toAttributes(row: Record<string, unknown>): Record<string, unknown> {
  const attrs: Record<string, unknown> = {}
  for (const [col, label] of Object.entries(HUMANIZED_FIELDS)) {
    const v = row[col]
    if (v !== null && v !== undefined && v !== '') attrs[label] = v
  }
  return attrs
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch one drug by slug.
 * Returns null when the slug is absent from `entities` — a genuine 404.
 */
export async function getDrugBySlug(slug: string): Promise<DrugDetail | null> {
  const { data: entity, error: entityError } = await supabase
    .from('entities')
    .select('pcid, slug, name, entity_type')
    .eq('slug', slug)
    .maybeSingle()

  if (entityError) throw new Error(`Failed to load '${slug}': ${entityError.message}`)
  if (!entity) return null

  const { pcid, entity_type: entityType } = entity
  const table = isBlockKind(entityType) ? BLOCK_TABLE[entityType as BlockKind] : null

  let satellite: Record<string, unknown> = {}
  if (table) {
    const { data, error } = await supabase.from(table).select('*').eq('pcid', pcid).maybeSingle()
    if (error) throw new Error(`Failed to load '${slug}' details: ${error.message}`)
    if (data) satellite = data as Record<string, unknown>
  }

  const [components, interactions, brands, hierarchy] = await Promise.all([
    getComponents(pcid),
    getInteractions(pcid),
    getBrands(pcid),
    entityType === 'moiety' ? getMoietyHierarchy(pcid) : null,
  ])

  // The hierarchy's brand list is the moiety's own brands (kept for older callers).
  if (hierarchy) hierarchy.brand_names = brands.map(b => b.name)

  const listItem: DrugListItem = {
    pcid_code: `PCID-${pcid}`,
    slug: entity.slug,
    name: entity.name,
    entity_type: toDrugEntityType(entityType),
    description: typeof satellite.class_name === 'string' ? satellite.class_name : null,
    eco_risk: null, // no eco-metrics table yet — Phase 4
    status: 'full',
  }

  return {
    ...listItem,
    attributes: toAttributes(satellite),
    components,
    interactions,
    hierarchy,
    brands,
    eco: null,
    fda_ndc_codes: splitCodes(satellite.ndc_codes as string | null | undefined),
    created_at: typeof satellite.created_at === 'string' ? satellite.created_at : undefined,
    updated_at: typeof satellite.updated_at === 'string' ? satellite.updated_at : undefined,
  }
}

export async function getDrugByPcid(pcidCode: string): Promise<DrugDetail | null> {
  const m = /^PCID-(\d+)$/.exec(pcidCode)
  if (!m) return null

  const { data, error } = await supabase
    .from('entities')
    .select('slug')
    .eq('pcid', Number(m[1]))
    .maybeSingle()

  if (error) throw new Error(`Failed to resolve ${pcidCode}: ${error.message}`)
  return data ? getDrugBySlug(data.slug) : null
}

type BrandRow = {
  pcid: number
  brand_key: string
  brand_display: string | null
  marketed: boolean | null
  appl_nos: string[] | null
  brand_rxcui: string | null
  sources: BrandName['sources'] | null
}

function toBrand(r: BrandRow): BrandName {
  return {
    name: r.brand_display ?? r.brand_key,
    marketed: r.marketed,
    appl_nos: r.appl_nos ?? [],
    rxcui: r.brand_rxcui,
    sources: r.sources ?? [],
  }
}

/** Current brands first (discontinued last), then alphabetical. */
function sortBrands(a: BrandName, b: BrandName): number {
  const rank = (x: BrandName) => (x.marketed === false ? 1 : 0)
  return rank(a) - rank(b) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

/** Brand names for one entity (moiety or combination) from `entity_brand_names`. */
async function getBrands(pcid: number): Promise<BrandName[]> {
  const { data, error } = await supabase
    .from('entity_brand_names')
    .select('pcid, brand_key, brand_display, marketed, appl_nos, brand_rxcui, sources')
    .eq('pcid', pcid)

  if (error) throw new Error(`Failed to load brand names for PCID-${pcid}: ${error.message}`)
  return ((data ?? []) as BrandRow[]).map(toBrand).sort(sortBrands)
}

/**
 * A combination's `has_component` statements, resolved to the component
 * moiety's name/slug/pcid via `entities`.
 */
type EntityRef = { pcid: number; slug: string; name: string } | null

async function getComponents(pcid: number): Promise<DrugComponent[]> {
  // `clinical_statements` has three FKs into `entities` (subject/object/comparator),
  // so the embed needs an explicit constraint hint to disambiguate.
  const { data, error } = await supabase
    .from('clinical_statements')
    .select(
      'qualifier_value, object:entities!clinical_statements_object_pcid_fkey(pcid, slug, name)',
    )
    .eq('subject_pcid', pcid)
    .eq('predicate', 'has_component')

  if (error) throw new Error(`Failed to load components for PCID-${pcid}: ${error.message}`)

  // The untyped Supabase client can't statically infer this embed's shape,
  // so the raw rows are asserted against what the query actually returns.
  const rows = (data ?? []) as unknown as { qualifier_value: string | null; object: EntityRef }[]

  return rows
    .filter(row => row.object)
    .map(row => {
      const e = row.object as NonNullable<EntityRef>
      return {
        pcid_code: `PCID-${e.pcid}`,
        slug: e.slug,
        name: e.name,
        role_note: row.qualifier_value ?? null,
      }
    })
}

/**
 * Interactions in either direction: this PCID as subject or object of a
 * `has_contraindication` statement. (The vocabulary in Legend_Key also lists
 * `contraindicated_with`, but the live 2026-09-19 load only uses
 * `has_contraindication` — confirmed via `execute_sql`, not assumed.) The
 * object is often a drug class or clinical concept rather than another
 * drug (e.g. "Strong CYP3A4 Inhibitors", "Sulfa Allergy") — `entities`
 * spans every block, so the join resolves a name/slug either way, and the
 * UI already renders a text-only interaction when there's no slug to link.
 */
async function getInteractions(pcid: number): Promise<DrugInteraction[]> {
  const { data, error } = await supabase
    .from('clinical_statements')
    .select(
      'subject_pcid, object_label, risk_profile, qualifier_value, ' +
        'subject:entities!clinical_statements_subject_pcid_fkey(pcid, slug, name), ' +
        'object:entities!clinical_statements_object_pcid_fkey(pcid, slug, name)',
    )
    .eq('predicate', 'has_contraindication')
    .or(`subject_pcid.eq.${pcid},object_pcid.eq.${pcid}`)

  if (error) throw new Error(`Failed to load interactions for PCID-${pcid}: ${error.message}`)

  // Same inference limitation as getComponents() above — asserted, not inferred.
  const rows = (data ?? []) as unknown as {
    subject_pcid: number
    object_label: string | null
    risk_profile: string | null
    qualifier_value: string | null
    subject: EntityRef
    object: EntityRef
  }[]

  return rows.map(row => {
    const other = row.subject_pcid === pcid ? row.object : row.subject

    return {
      interacting_drug_name: other?.name ?? row.object_label ?? 'Unknown',
      interacting_drug_slug: other?.slug ?? null,
      interacting_drug_pcid: other ? `PCID-${other.pcid}` : null,
      severity: null, // clinical_statements has no severity column in this schema
      mechanism: row.qualifier_value ?? row.risk_profile ?? null,
    }
  })
}

/**
 * A moiety's precise forms and combination products — from the
 * `moiety_hierarchy` materialized view (base_name matching against
 * precise_forms/formulations/combinations; there's no FK for this yet, see
 * the view's own comment in Supabase). Each member carries its own brand
 * names from `entity_brand_names` (combination products: "Janumet").
 * `brand_names` is filled in by getDrugBySlug with the moiety's own brands.
 *
 * Formulations (brand-name products) don't come back from the view at all
 * today — their base_name is the brand name itself (e.g. "ABILIFY"), not the
 * chemical name, so nothing links them to a moiety by that method.
 */
async function getMoietyHierarchy(pcid: number): Promise<MoietyHierarchy> {
  const { data, error } = await supabase
    .from('moiety_hierarchy')
    .select('member_pcid, member_slug, member_name, member_term_type, primary_brand, relation')
    .eq('moiety_pcid', pcid)

  if (error) throw new Error(`Failed to load hierarchy for PCID-${pcid}: ${error.message}`)

  const rows = (data ?? []) as {
    member_pcid: number
    member_slug: string
    member_name: string
    member_term_type: string | null
    primary_brand: string | null
    relation: 'precise_form' | 'formulation' | 'combination'
  }[]

  // Brands of every member in one request
  const memberBrands = new Map<number, BrandName[]>()
  const ids = [...new Set(rows.map(r => r.member_pcid))]
  if (ids.length > 0) {
    const { data: brandRows, error: brandError } = await supabase
      .from('entity_brand_names')
      .select('pcid, brand_key, brand_display, marketed, appl_nos, brand_rxcui, sources')
      .in('pcid', ids)
    if (brandError) throw new Error(`Failed to load member brands for PCID-${pcid}: ${brandError.message}`)
    for (const r of (brandRows ?? []) as BrandRow[]) {
      const list = memberBrands.get(r.pcid) ?? []
      list.push(toBrand(r))
      memberBrands.set(r.pcid, list)
    }
  }

  const toMember = (row: (typeof rows)[number]): HierarchyMember => ({
    pcid_code: `PCID-${row.member_pcid}`,
    slug: row.member_slug,
    name: row.member_name,
    term_type: row.member_term_type,
    primary_brand: row.primary_brand,
    brands: (memberBrands.get(row.member_pcid) ?? []).sort(sortBrands).map(b => b.name),
  })

  const preciseForms = rows.filter(r => r.relation === 'precise_form').map(toMember)
  const combinations = rows.filter(r => r.relation === 'combination').map(toMember)

  return { precise_forms: preciseForms, combinations, brand_names: [] }
}

/** Paginated browse against the `catalog_entries` view, restricted to moieties. */
export async function listDrugs(params: DrugsListQuery = {}): Promise<DrugListResponse | null> {
  const limit = Math.min(params.limit ?? 25, 100)
  const offset = Math.max(params.offset ?? 0, 0)

  // Only moieties are catalog-level entries now (see catalog.ts's 2026-09-20
  // note) — precise forms, formulations and combination products live under
  // their parent moiety's hierarchy instead. `entity_type` is accepted for
  // API-compatibility but no longer widens the result past moiety rows.
  const query = supabase
    .from('catalog_entries')
    .select('pcid, slug, name, entity_type, primary_brand', { count: 'exact' })
    .eq('entity_type', 'moiety')
    .order('pcid', { ascending: true })
    .range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) throw new Error(`Failed to list drugs: ${error.message}`)

  const drugs: DrugListItem[] = (data ?? []).map(row => ({
    pcid_code: `PCID-${row.pcid}`,
    slug: row.slug,
    name: row.name,
    entity_type: toDrugEntityType(row.entity_type),
    description: row.primary_brand ? `Also marketed as ${row.primary_brand}.` : null,
    eco_risk: null,
    status: 'full',
  }))

  const total = count ?? drugs.length
  return { drugs, total, offset, limit, has_more: offset + drugs.length < total }
}

/** Ranked search over name, brand, and slug, restricted to moieties. */
export async function searchDrugs(params: DrugsSearchQuery): Promise<SearchResponse | null> {
  const q = params.q?.trim()
  if (!q) return null

  const limit = Math.min(params.limit ?? 25, 100)
  const offset = Math.max(params.offset ?? 0, 0)
  const like = `%${q}%`

  const { data, error, count } = await supabase
    .from('catalog_entries')
    .select('pcid, slug, name, entity_type, primary_brand', { count: 'exact' })
    .eq('entity_type', 'moiety')
    .or(`name.ilike.${like},primary_brand.ilike.${like},slug.ilike.${like}`)
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(`Search failed for '${q}': ${error.message}`)

  const drugs: DrugListItem[] = (data ?? []).map(row => ({
    pcid_code: `PCID-${row.pcid}`,
    slug: row.slug,
    name: row.name,
    entity_type: toDrugEntityType(row.entity_type),
    description: row.primary_brand ? `Also marketed as ${row.primary_brand}.` : null,
    eco_risk: null,
    status: 'full',
  }))

  const total = count ?? drugs.length
  return { query: q, drugs, total, offset, limit, has_more: offset + drugs.length < total }
}

export async function getDrugInteractions(slug: string) {
  const drug = await getDrugBySlug(slug)
  return drug?.interactions ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// Drug classes (RPCs: get_class, get_entity_classes, list_classes)
// ─────────────────────────────────────────────────────────────────────────────
//
// The untyped Supabase client types RPC results loosely, so each result is
// asserted against the contract the SQL function returns (see the ClassDetail /
// EntityClass / ClassSummary comments in api.generated.ts).

/**
 * One class page: ancestors, sub-classes and every member drug.
 * Returns null when no class has this slug — a genuine 404.
 */
export async function getClassBySlug(slug: string): Promise<ClassDetail | null> {
  const { data, error } = await supabase.rpc('get_class', { p_slug: slug })
  if (error) throw new Error(`Failed to load class '${slug}': ${error.message}`)
  if (!data) return null

  const detail = data as ClassDetail
  // Arrays can come back null from jsonb_agg over zero rows; normalize so callers can map freely.
  return {
    ...detail,
    ancestors: detail.ancestors ?? [],
    children: detail.children ?? [],
    members: detail.members ?? [],
  }
}

/**
 * The classes one drug belongs to, already ordered by system
 * (ATC, VA, EPC, MOA, PE, CHEM, ChemOnt). With `includeInherited`, a class the
 * drug is in only through a sub-class (e.g. ATC N06A for sertraline, which sits
 * directly in N06AB) comes back too, with `is_direct: false`.
 */
export async function getEntityClasses(pcid: number, includeInherited = false): Promise<EntityClass[]> {
  const { data, error } = await supabase.rpc('get_entity_classes', {
    p_pcid: pcid,
    p_include_inherited: includeInherited,
  })
  if (error) throw new Error(`Failed to load classes for PCID-${pcid}: ${error.message}`)
  return (data ?? []) as EntityClass[]
}

/**
 * Classes with at least one member, filtered by type and/or a name/code
 * search. Several thousand rows exist in total, so callers should pass a type
 * or a search string rather than asking for everything.
 */
export async function listClasses(type?: ClassType | null, search?: string | null): Promise<ClassSummary[]> {
  const q = search?.trim() || null
  const { data, error } = await supabase.rpc('list_classes', {
    p_type: type ?? null,
    p_search: q,
  })
  if (error) throw new Error(`Failed to list classes${q ? ` matching '${q}'` : ''}: ${error.message}`)
  return (data ?? []) as ClassSummary[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Lists (RPCs: list_lists, get_list, get_entity_lists)
// ─────────────────────────────────────────────────────────────────────────────
//
// numeric columns can arrive as strings depending on the PostgREST version, so
// rank/value are coerced to numbers here once rather than in every component.

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** Every published list, in index order (sub-lists carry `parent_slug`). */
export async function listLists(): Promise<ListSummary[]> {
  const { data, error } = await supabase.rpc('list_lists')
  if (error) throw new Error(`Failed to load lists: ${error.message}`)
  return ((data ?? []) as ListSummary[]).map(l => ({ ...l, item_count: toNum(l.item_count) ?? 0 }))
}

/** One list with all its items. Returns null when no published list has this slug. */
export async function getListBySlug(slug: string): Promise<ListDetail | null> {
  const { data, error } = await supabase.rpc('get_list', { p_slug: slug })
  if (error) throw new Error(`Failed to load list '${slug}': ${error.message}`)
  if (!data) return null
  const detail = data as ListDetail
  return {
    ...detail,
    children: detail.children ?? [],
    items: (detail.items ?? []).map(i => ({ ...i, rank: toNum(i.rank), value: toNum(i.value) })),
  }
}

/** The lists one drug is on; for a moiety this includes lists that name its forms or combinations. */
export async function getEntityLists(pcid: number): Promise<EntityList[]> {
  const { data, error } = await supabase.rpc('get_entity_lists', { p_pcid: pcid })
  if (error) throw new Error(`Failed to load lists for PCID-${pcid}: ${error.message}`)
  return ((data ?? []) as EntityList[]).map(l => ({ ...l, rank: toNum(l.rank), value: toNum(l.value) }))
}

export function isApiError(data: unknown): data is ApiError {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    (data as ApiError).error === true
  )
}
