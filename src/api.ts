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
 */

import { supabase } from './supabaseClient'
import type {
  ApiError,
  DrugDetail,
  DrugEntityType,
  DrugInteraction,
  DrugComponent,
  DrugListItem,
  DrugListResponse,
  DrugsListQuery,
  DrugsSearchQuery,
  HierarchyMember,
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

  const [components, interactions, hierarchy] = await Promise.all([
    getComponents(pcid),
    getInteractions(pcid),
    entityType === 'moiety' ? getMoietyHierarchy(pcid, satellite.primary_brand as string | null) : null,
  ])

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
 * A moiety's precise forms, combination products, and known brand names —
 * from the `moiety_hierarchy` materialized view (base_name matching against
 * precise_forms/formulations/combinations; there's no FK for this yet, see
 * the view's own comment in Supabase). `ownBrand` is the moiety row's own
 * `primary_brand`, folded into `brand_names` alongside any carried by its
 * precise forms or combinations.
 *
 * Formulations (brand-name products) don't come back from the view at all
 * today — their base_name is the brand name itself (e.g. "ABILIFY"), not the
 * chemical name, so nothing links them to a moiety until the FDA NDC-matching
 * pass (fda_applications/fda_products.pcid) runs. Once that lands, this is
 * the function to extend with a `relation = 'formulation'` bucket.
 */
async function getMoietyHierarchy(
  pcid: number,
  ownBrand: string | null,
): Promise<MoietyHierarchy> {
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

  const toMember = (row: (typeof rows)[number]): HierarchyMember => ({
    pcid_code: `PCID-${row.member_pcid}`,
    slug: row.member_slug,
    name: row.member_name,
    term_type: row.member_term_type,
    primary_brand: row.primary_brand,
  })

  const preciseForms = rows.filter(r => r.relation === 'precise_form').map(toMember)
  const combinations = rows.filter(r => r.relation === 'combination').map(toMember)

  const brandNames = Array.from(
    new Set(
      [ownBrand, ...rows.map(r => r.primary_brand)].filter(
        (b): b is string => typeof b === 'string' && b.length > 0,
      ),
    ),
  ).sort((a, b) => a.localeCompare(b))

  return { precise_forms: preciseForms, combinations, brand_names: brandNames }
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
// DailyMed labels
// ─────────────────────────────────────────────────────────────────────────────
//
// 2026-09-22: `entity_labels` is a view joining `label_document_formulations`
// (setid ↔ pcid, matched via UNII rollup or product NDC) to `label_documents`
// and `entities`. `label_sections` carries the section outline (loinc code,
// title, order) for a setid but not the section body text — that lives as a
// JSON blob per setid in the public `label-sections` Storage bucket, fetched
// separately and merged in here by array position (both are built from the
// same source `sections_json` list, in the same order).

export type LabelDocument = {
  setid: string
  label_title: string | null
  labeler: string | null
  document_type_display: string | null
  effective_time: string | null
}

export type LabelSection = {
  section_order: number
  loinc_code: string | null
  loinc_display: string | null
  title: string | null
  parent_loinc_code: string | null
  parent_title: string | null
  text: string
}

/** A handful of early-loaded rows carry the literal string "NaN" from a since-fixed
 *  ingestion bug rather than a real value — treat it as absent everywhere it's read. */
function cleanText(value: string | null | undefined): string | null {
  return value && value !== 'NaN' ? value : null
}

/** Every DailyMed label document linked to this PCID, most recent first. A PCID can
 *  carry more than one label (different manufacturers/formulations of the same
 *  ingredient), so callers should let the person pick which one to read. */
export async function getDrugLabels(pcid: number): Promise<LabelDocument[]> {
  const { data, error } = await supabase
    .from('entity_labels')
    .select('setid, label_title, labeler, document_type_display, effective_time')
    .eq('pcid', pcid)
    .order('effective_time', { ascending: false })

  if (error) throw new Error(`Failed to load labels for PCID-${pcid}: ${error.message}`)

  // A document can match the same pcid via more than one UNII (e.g. a
  // combination's label rolling up several ingredient UNIIs that all resolve
  // to entities sharing this pcid via distinct rows) — de-dupe by setid.
  const seen = new Set<string>()
  return (data ?? [])
    .filter(row => (seen.has(row.setid) ? false : (seen.add(row.setid), true)))
    .map(row => ({
      setid: row.setid,
      label_title: cleanText(row.label_title),
      labeler: cleanText(row.labeler),
      document_type_display: cleanText(row.document_type_display),
      effective_time: cleanText(row.effective_time),
    }))
}

/** The full section outline + body text for one label document. */
export async function getLabelContent(setid: string): Promise<LabelSection[]> {
  const { data: meta, error } = await supabase
    .from('label_sections')
    .select('section_order, loinc_code, loinc_display, title, parent_loinc_code, parent_title')
    .eq('setid', setid)
    .order('section_order', { ascending: true })

  if (error) throw new Error(`Failed to load sections for ${setid}: ${error.message}`)

  const { data: urlData } = supabase.storage.from('label-sections').getPublicUrl(`${setid}.json`)
  const res = await fetch(urlData.publicUrl)
  if (!res.ok) throw new Error(`Failed to fetch label text for ${setid}: HTTP ${res.status}`)
  const body = (await res.json()) as { text?: string }[]

  return (meta ?? []).map((row, i) => ({
    section_order: row.section_order,
    loinc_code: row.loinc_code,
    loinc_display: row.loinc_display,
    title: cleanText(row.title),
    parent_loinc_code: row.parent_loinc_code,
    parent_title: cleanText(row.parent_title),
    text: body[i]?.text ?? '',
  }))
}

export function isApiError(data: unknown): data is ApiError {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    (data as ApiError).error === true
  )
}
