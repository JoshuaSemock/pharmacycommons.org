/**
 * References and Resources — one table, two pages.
 *
 * Reads `public.references_resources` (db/phase12a_references_resources.sql).
 * Every row appears on /references, grouped by `reference_section`. Rows
 * appear on /resources grouped by `headers`, except the datasets the Commons
 * is built from (`headers = 'Source datasets'`).
 *
 * The table replaced src/sources.ts and src/resources.ts on 2026-09-30. Edit
 * rows in Supabase; nothing here holds content.
 */

import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import type { SourceCitation } from './cite'

/** `headers` value for the datasets the Commons draws from. Kept off /resources. */
export const SOURCE_DATASETS = 'Source datasets'

export interface ReferenceResource {
  /** Stable slug; also the BibTeX key. */
  id: string
  sortOrder: number
  name: string
  /** Formal title, when it differs from `name`. */
  subtitle?: string
  href: string
  organization?: string
  pubYear?: number
  description?: string
  typeBadge?: string
  licenseBadge?: string
  /** Region and access notes: 'International', 'Free registration'. */
  badges: string[]
  /** Group on /resources. */
  headers: string
  /** Group on /references. */
  referenceSection: string
  /** What the source feeds in Pharmacy Commons (source datasets only). */
  commonsUse?: string
  version?: string
  currentAsOf?: string
  downloadUrl?: string
  /** Citation text as supplied. Used when `cite` is missing, and shown as the journal reference for guidelines. */
  citationText?: string
  /** Structured citation for src/cite.ts. */
  cite?: SourceCitation
}

/** Row as PostgREST returns it. */
export type ReferenceResourceRow = {
  id: string
  sort_order: number | null
  name: string
  subtitle: string | null
  href: string
  organization: string | null
  pub_year: number | null
  description: string | null
  type_badge: string | null
  license_badge: string | null
  badges: string[] | null
  headers: string
  reference_section: string
  commons_use: string | null
  version: string | null
  current_as_of: string | null
  download_url: string | null
  citation_text: string | null
  cite: unknown
}

export type ReferenceGroup = {
  /** Anchor id, from the heading. */
  id: string
  heading: string
  items: ReferenceResource[]
}

const COLUMNS =
  'id, sort_order, name, subtitle, href, organization, pub_year, description, type_badge, license_badge, badges, headers, reference_section, commons_use, version, current_as_of, download_url, citation_text, cite'

/** Every row, in curated order. */
export async function fetchAllReferences(): Promise<ReferenceResource[]> {
  const { data, error } = await supabase
    .from('references_resources')
    .select(COLUMNS)
    .order('sort_order', { ascending: true })

  if (error) throw new Error(`Failed to load references: ${error.message}`)

  return ((data ?? []) as ReferenceResourceRow[]).map(toReference)
}

export function toReference(row: ReferenceResourceRow): ReferenceResource {
  return {
    id: row.id,
    sortOrder: row.sort_order ?? 0,
    name: row.name,
    subtitle: row.subtitle ?? undefined,
    href: row.href,
    organization: row.organization ?? undefined,
    pubYear: row.pub_year ?? undefined,
    description: row.description ?? undefined,
    typeBadge: row.type_badge ?? undefined,
    licenseBadge: row.license_badge ?? undefined,
    badges: row.badges ?? [],
    headers: row.headers,
    referenceSection: row.reference_section,
    commonsUse: row.commons_use ?? undefined,
    version: row.version ?? undefined,
    currentAsOf: row.current_as_of ?? undefined,
    downloadUrl: row.download_url ?? undefined,
    citationText: row.citation_text ?? undefined,
    cite: parseCite(row.cite),
  }
}

/**
 * Validates the `cite` jsonb enough to hand it to formatSource. A malformed
 * value is dropped (the page falls back to `citation_text`) rather than
 * rendering "undefined" into a citation.
 */
export function parseCite(value: unknown): SourceCitation | undefined {
  if (!value || typeof value !== 'object') return undefined
  const v = value as Record<string, unknown>
  const str = (k: string) => typeof v[k] === 'string' && (v[k] as string).length > 0

  if (v.kind === 'web' && str('title') && str('publisher')) {
    return {
      kind: 'web',
      title: v.title as string,
      publisher: v.publisher as string,
      place: str('place') ? (v.place as string) : undefined,
      nlmPublisher: str('nlmPublisher') ? (v.nlmPublisher as string) : (v.publisher as string),
      since: typeof v.since === 'number' ? v.since : undefined,
      editionYear: v.editionYear === true ? true : undefined,
    }
  }
  if (
    v.kind === 'article' &&
    Array.isArray(v.authors) &&
    v.authors.every(a => typeof a === 'string') &&
    str('title') && str('journal') && str('journalAbbr') && str('volume') && str('pages') && str('doi') &&
    typeof v.year === 'number'
  ) {
    return {
      kind: 'article',
      authors: v.authors as string[],
      title: v.title as string,
      journal: v.journal as string,
      journalAbbr: v.journalAbbr as string,
      year: v.year,
      volume: v.volume as string,
      issue: str('issue') ? (v.issue as string) : undefined,
      pages: v.pages as string,
      doi: v.doi as string,
      pmid: str('pmid') ? (v.pmid as string) : undefined,
    }
  }
  return undefined
}

/** /resources shows everything except the datasets the Commons is built from. */
export function resourcesOnly(rows: ReferenceResource[]): ReferenceResource[] {
  return rows.filter(r => r.headers !== SOURCE_DATASETS)
}

export function isSourceDataset(row: ReferenceResource): boolean {
  return row.headers === SOURCE_DATASETS
}

/**
 * Groups rows by a key, ordering groups by their first row's sort_order and
 * rows within a group by sort_order. `first` lifts matching rows to the top
 * of each group (source datasets on /references).
 */
export function groupBy(
  rows: ReferenceResource[],
  key: (r: ReferenceResource) => string,
  first?: (r: ReferenceResource) => boolean,
): ReferenceGroup[] {
  const map = new Map<string, ReferenceResource[]>()
  for (const r of [...rows].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const k = key(r)
    const arr = map.get(k)
    if (arr) arr.push(r)
    else map.set(k, [r])
  }
  return [...map.entries()].map(([heading, items]) => ({
    id: slugify(heading),
    heading,
    items: first ? [...items.filter(first), ...items.filter(r => !first(r))] : items,
  }))
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * A short journal reference ("Diabetes Care 2026;49(Suppl 1):S183") worth
 * showing beside a web citation. Supplied citations that restate the web page
 * (they contain its URL) or an article's DOI add nothing, so they return null.
 */
export function journalReference(row: ReferenceResource): string | null {
  const text = row.citationText?.trim()
  if (!text || row.cite?.kind === 'article') return null
  if (/https?:\/\/|doi:/i.test(text)) return null
  return text
}

/* -------------------------------------------------------------------- hook */

let pending: Promise<ReferenceResource[]> | null = null

/** Loads once per session; References and Resources share the result. */
function loadOnce(): Promise<ReferenceResource[]> {
  if (!pending) {
    pending = fetchAllReferences().catch(err => {
      pending = null // let the next visit retry
      throw err
    })
  }
  return pending
}

/** `rows` is null while loading. */
export function useReferences(): { rows: ReferenceResource[] | null; failed: boolean } {
  const [rows, setRows] = useState<ReferenceResource[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadOnce()
      .then(data => {
        if (!cancelled) setRows(data)
      })
      .catch(err => {
        console.error(err)
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { rows, failed }
}
