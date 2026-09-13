/**
 * Pharmacy Commons — API layer
 *
 * Backed by the static catalog (public/drug-catalog.json), which ships with the
 * build and covers the full PCID spine. Supabase is an enhancement layer: when
 * the schema is deployed and a record exists, detail pages hydrate with clinical
 * and environmental data. When it isn't — or when a request fails — the catalog
 * answer is served instead.
 *
 * The consequence worth knowing: search and browse never touch the network, and
 * a backend outage costs detail, not availability.
 */

import { createClient } from '@supabase/supabase-js'
import {
  loadCatalog,
  searchCatalog,
  browse,
  getBySlug,
  getByPcid,
  pcidOf,
  type CatalogEntry,
} from './catalog'
import type {
  ApiError,
  DrugDetail,
  DrugListItem,
  DrugListResponse,
  DrugsListQuery,
  DrugsSearchQuery,
  SearchResponse,
} from './api.generated'

const SUPABASE_URL = 'https://nenwovhyrdcdkhxzjiiv.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lbndvdmh5cmRjZGtoeHpqaWl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMDc1NzcsImV4cCI6MjEwMzc4MzU3N30.gDxL9yx88AWPgwuPlDNv879VhpNHLQMFfmaqDwed30I'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

/**
 * Set false to skip Supabase entirely — useful while the schema is undeployed,
 * since every detail view would otherwise wait on a call that cannot succeed.
 * Flip to true once 01_core_schema_v2.sql has been applied.
 */
const BACKEND_ENABLED = false

// ─────────────────────────────────────────────────────────────────────────────
// Catalog → API shape
// ─────────────────────────────────────────────────────────────────────────────

function toListItem(e: CatalogEntry): DrugListItem {
  return {
    pcid_code: pcidOf(e),
    slug: e.slug,
    name: e.name,
    entity_type: e.type === 1 ? 'combination' : 'drug',
    description: e.brand ? `Also marketed as ${e.brand}.` : null,
    eco_risk: null,
    status: 'partial',
  }
}

function toDetail(e: CatalogEntry): DrugDetail {
  return {
    ...toListItem(e),
    attributes: {},
    components: [],
    interactions: [],
    eco: null,
    fda_ndc_codes: [],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch one drug by slug.
 * Returns null only when the slug is absent from the spine — a genuine 404.
 */
export async function getDrugBySlug(slug: string): Promise<DrugDetail | null> {
  await loadCatalog()

  const entry = getBySlug(slug)
  if (!entry) return null

  const base = toDetail(entry)
  if (!BACKEND_ENABLED) return base

  try {
    const { data, error } = await supabase.rpc('get_drug_by_slug', { p_slug: slug })
    if (error || !data || isApiError(data)) return base
    return { ...base, ...(data as Partial<DrugDetail>), status: 'full' }
  } catch (err) {
    console.warn(`[api] hydration failed for '${slug}', serving catalog entry`, err)
    return base
  }
}

export async function getDrugByPcid(pcidCode: string): Promise<DrugDetail | null> {
  await loadCatalog()
  const entry = getByPcid(pcidCode)
  return entry ? getDrugBySlug(entry.slug) : null
}

/** Paginated browse. Served from the catalog; no network call. */
export async function listDrugs(params: DrugsListQuery = {}): Promise<DrugListResponse | null> {
  await loadCatalog()

  const limit = Math.min(params.limit ?? 25, 100)
  const offset = Math.max(params.offset ?? 0, 0)
  const type = params.entity_type === 'combination' ? 1 : params.entity_type ? 0 : undefined

  const { entries, total } = browse({ type: type as 0 | 1 | undefined, offset, limit })

  return {
    drugs: entries.map(toListItem),
    total,
    offset,
    limit,
    has_more: offset + entries.length < total,
  }
}

/** Ranked search over name, brand, and slug. Local and synchronous. */
export async function searchDrugs(params: DrugsSearchQuery): Promise<SearchResponse | null> {
  const q = params.q?.trim()
  if (!q) return null

  await loadCatalog()

  const limit = Math.min(params.limit ?? 25, 100)
  const offset = Math.max(params.offset ?? 0, 0)

  const hits = searchCatalog(q, offset + limit + 1)
  const page = hits.slice(offset, offset + limit)

  return {
    query: q,
    drugs: page.map(toListItem),
    total: hits.length,
    offset,
    limit,
    has_more: hits.length > offset + limit,
  }
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