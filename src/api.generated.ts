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