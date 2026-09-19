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

  const [components, interactions] = await Promise.all([
    getComponents(pcid),
    getInteractions(pcid),
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

/** Paginated browse against the `catalog_entries` view (blocks 1–4 only). */
export async function listDrugs(params: DrugsListQuery = {}): Promise<DrugListResponse | null> {
  const limit = Math.min(params.limit ?? 25, 100)
  const offset = Math.max(params.offset ?? 0, 0)

  let query = supabase
    .from('catalog_entries')
    .select('pcid, slug, name, entity_type, primary_brand', { count: 'exact' })
    .order('pcid', { ascending: true })
    .range(offset, offset + limit - 1)

  if (params.entity_type === 'combination') {
    query = query.eq('entity_type', 'combination')
  } else if (params.entity_type) {
    query = query.in('entity_type', ['moiety', 'precise_form', 'formulation'])
  }

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

/** Ranked search over name, brand, and slug via the `catalog_entries` view. */
export async function searchDrugs(params: DrugsSearchQuery): Promise<SearchResponse | null> {
  const q = params.q?.trim()
  if (!q) return null

  const limit = Math.min(params.limit ?? 25, 100)
  const offset = Math.max(params.offset ?? 0, 0)
  const like = `%${q}%`

  const { data, error, count } = await supabase
    .from('catalog_entries')
    .select('pcid, slug, name, entity_type, primary_brand', { count: 'exact' })
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

export function isApiError(data: unknown): data is ApiError {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    (data as ApiError).error === true
  )
}
