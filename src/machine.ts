/**
 * Pharmacy Commons — machine-readable layer (client side)
 *
 * Every record page is also an interface to the knowledge infrastructure:
 * a permanent PCID IRI, a JSON(-LD) document, version history and a field-
 * level change log, all served by the public `api` Edge Function
 * (supabase/functions/api) from one SQL source of truth (public.api_*).
 *
 * This module builds those URLs, fetches the document for the page, and
 * projects it into schema.org JSON-LD for <head> so search engines and other
 * crawlers see the same structured record the API serves.
 *
 * Destination: src/machine.ts
 */

import { useEffect } from 'react'

/** Where /v1/... is served. Override with VITE_PC_API_BASE once a proxy fronts pharmacycommons.org/api. */
export const API_BASE: string =
  (import.meta.env.VITE_PC_API_BASE as string | undefined) ??
  'https://nenwovhyrdcdkhxzjiiv.supabase.co/functions/v1/api'

export const SITE_BASE = 'https://pharmacycommons.org'

// ─── Document shape (subset the site reads; full contract at /v1/schema/entity.json) ──

export interface EntityRef {
  '@id': string
  pcid: string
  name: string
  slug: string
  entity_type: string
}

export interface ProvenanceSource {
  key: string
  name: string
  publisher?: string
  url?: string
  license?: string
  terms_url?: string
  kind: 'external' | 'curated' | 'derived' | 'machine_assisted'
  contributes: string[]
}

export interface ClassMembership {
  class: EntityRef
  class_type?: string
  code?: string
  system?: string
  direct: boolean
  basis?: string
  machine_assisted?: true
}

export interface VersionInfo {
  number: number
  latest: number
  is_latest: boolean
  hash: string
  reason: 'baseline' | 'change' | 'derived'
  created_at: string
}

export interface EntityDocument {
  '@context': string
  '@id': string
  '@type'?: string[]
  pcid: string
  pcid_int: number
  name: string
  entity_type: string
  block: { id: number; label: string }
  slug: string
  slug_uri: string
  identifiers?: {
    cas?: string
    unii?: string
    inchi_key?: string
    drugbank_id?: string
    lactmed_id?: string
    rxcui?: string
    ndc_codes?: string[]
    fda_application_numbers?: string[]
    class_code?: string
  }
  attributes?: Record<string, unknown>
  classification?: {
    primary?: EntityRef
    parent?: EntityRef
    memberships?: ClassMembership[]
    members?: { count: number; direct: number }
  }
  relationships?: unknown[]
  brands?: { name: string; marketed?: boolean }[]
  provenance?: {
    primary_source?: string
    source_count?: number
    origin?: string
    record_created?: string
    record_updated?: string
    sources?: ProvenanceSource[]
  }
  version: VersionInfo
  links: {
    self: string
    canonical: string
    html: string
    json: string
    versions: string
    changes: string
    schema: string
    context: string
  }
  license?: { data: string | null; url: string | null; note?: string }
  generated_at?: string
}

export interface VersionListItem {
  number: number
  hash: string
  reason: VersionInfo['reason']
  created_at: string
  changes?: number
  url: string
}

export interface ChangeEntry {
  change_id: number
  changed_at: string
  table: string
  op: 'INSERT' | 'UPDATE' | 'DELETE'
  row_key?: string
  fields: string[]
  diff: Record<string, { old: unknown; new: unknown }>
  source: string
  revision_id?: number
}

// ─── URLs ──────────────────────────────────────────────────────────────────

/** 'PCID-1001923' → the full set of stable addresses for that record. */
export function entityUrls(pcidCode: string, slug: string) {
  const entity = `${API_BASE}/v1/entities/${pcidCode}`
  return {
    permanent: `${SITE_BASE}/id/${pcidCode}`,
    page: `${SITE_BASE}/drugs/${slug}`,
    json: `${entity}.json`,
    jsonld: `${entity}.jsonld`,
    versions: `${entity}/versions`,
    changes: `${entity}/changes`,
    schema: `${API_BASE}/v1/schema/entity.json`,
    index: `${API_BASE}/v1`,
  }
}

// ─── Fetching ──────────────────────────────────────────────────────────────

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { headers: { Accept: 'application/json' }, signal })
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`)
  return (await r.json()) as T
}

export function getEntityDocument(pcidCode: string, signal?: AbortSignal): Promise<EntityDocument> {
  return getJson<EntityDocument>(`${API_BASE}/v1/entities/${pcidCode}`, signal)
}

export async function getVersions(pcidCode: string, signal?: AbortSignal): Promise<VersionListItem[]> {
  const r = await getJson<{ versions: VersionListItem[] }>(`${API_BASE}/v1/entities/${pcidCode}/versions`, signal)
  return r.versions ?? []
}

export async function getChanges(
  pcidCode: string,
  signal?: AbortSignal,
): Promise<{ changes: ChangeEntry[]; next?: string; note?: string }> {
  return getJson(`${API_BASE}/v1/entities/${pcidCode}/changes?limit=25`, signal)
}

// ─── schema.org projection for <head> ──────────────────────────────────────
//
// The API document is Pharmacy Commons' own vocabulary (with a schema:Drug
// type alongside). Search engines read plain schema.org, so the page embeds a
// projection of the same record: identifiers as PropertyValues, brands as
// alternateName, direct classes as drugClass, plus a link to the dataset form.

const SCHEMA_TYPE: Record<string, string> = {
  moiety: 'Drug',
  combination: 'Drug',
  precise_form: 'Drug',
  formulation: 'Drug',
  class: 'DrugClass',
  clinical: 'MedicalEntity',
  measurement: 'MedicalEntity',
  target: 'BioChemEntity',
  functional: 'Thing',
}

export function toSchemaOrg(doc: EntityDocument): Record<string, unknown> {
  const ids = doc.identifiers ?? {}
  const identifier = [
    { propertyID: 'PCID', value: doc.pcid },
    ids.unii && { propertyID: 'UNII', value: ids.unii },
    ids.cas && { propertyID: 'CAS', value: ids.cas },
    ids.rxcui && { propertyID: 'RxCUI', value: ids.rxcui },
    ids.drugbank_id && { propertyID: 'DrugBank', value: ids.drugbank_id },
    ids.inchi_key && { propertyID: 'InChIKey', value: ids.inchi_key },
    ids.class_code && { propertyID: 'ClassCode', value: ids.class_code },
  ]
    .filter(Boolean)
    .map(v => ({ '@type': 'PropertyValue', ...(v as object) }))

  const sameAs = [
    ids.drugbank_id && `https://go.drugbank.com/drugs/${ids.drugbank_id}`,
    ids.unii && `https://precision.fda.gov/uniisearch/srs/unii/${ids.unii}`,
    ids.rxcui && `https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=${ids.rxcui}`,
  ].filter(Boolean)

  const directClasses = (doc.classification?.memberships ?? [])
    .filter(m => m.direct)
    .map(m => ({ '@type': 'DrugClass', '@id': m.class['@id'], name: m.class.name }))

  const type = SCHEMA_TYPE[doc.entity_type] ?? 'Thing'
  const out: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': type,
    '@id': doc['@id'],
    name: doc.name,
    url: doc.links.html,
    identifier,
    subjectOf: {
      '@type': 'Dataset',
      name: `${doc.name} (${doc.pcid}) — Pharmacy Commons record`,
      url: doc.links.self,
      version: String(doc.version.number),
      dateModified: doc.version.created_at,
      distribution: [
        { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: doc.links.json },
        { '@type': 'DataDownload', encodingFormat: 'application/ld+json', contentUrl: doc.links.json.replace(/\.json$/, '.jsonld') },
      ],
      ...(doc.license?.url ? { license: doc.license.url } : {}),
    },
  }
  if (sameAs.length) out.sameAs = sameAs
  if (type === 'Drug') {
    const brands = (doc.brands ?? []).map(b => b.name)
    if (brands.length) out.alternateName = brands
    if (directClasses.length) out.drugClass = directClasses
    const legal = doc.attributes?.legal_status
    if (typeof legal === 'string') out.legalStatus = legal
  }
  return out
}

// ─── <head> wiring ─────────────────────────────────────────────────────────

const HEAD_MARK = 'data-pc-machine'

/**
 * While a record page is mounted: embeds its schema.org JSON-LD and
 * advertises the JSON/JSON-LD alternates and permanent IRI in <head>.
 * Everything added is removed again on unmount or when the record changes.
 */
export function useMachineHead(doc: EntityDocument | null) {
  useEffect(() => {
    if (!doc) return
    const added: Element[] = []
    const add = (el: Element) => {
      el.setAttribute(HEAD_MARK, doc.pcid)
      document.head.appendChild(el)
      added.push(el)
    }

    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.textContent = JSON.stringify(toSchemaOrg(doc))
    add(script)

    const alt = (type: string, href: string) => {
      const link = document.createElement('link')
      link.rel = 'alternate'
      link.type = type
      link.href = href
      add(link)
    }
    alt('application/json', doc.links.json)
    alt('application/ld+json', doc.links.json.replace(/\.json$/, '.jsonld'))

    // index.html ships one static canonical (the homepage) for every route.
    // Point it at this record's page while mounted, then put it back — a
    // second canonical tag would be ignored or treated as a conflict.
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    const previousHref = canonical?.getAttribute('href') ?? null
    if (canonical) {
      canonical.href = doc.links.html
    } else {
      canonical = document.createElement('link')
      canonical.rel = 'canonical'
      canonical.href = doc.links.html
      add(canonical)
    }

    return () => {
      added.forEach(el => el.remove())
      if (previousHref !== null && canonical?.isConnected) canonical.setAttribute('href', previousHref)
    }
  }, [doc])
}
