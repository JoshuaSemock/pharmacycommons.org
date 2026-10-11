/**
 * Looks up citation metadata the first time a source is cited
 * (docs/page-editor.md §6). Runs in the publish-page Edge Function; the fetch
 * is passed in so tests run on recorded responses.
 *
 *   pmid:      NCBI E-utilities esummary (JSON)
 *   doi:       Crossref /works/{doi}
 *   dailymed:  DailyMed /services/v2/spls.json?setid=
 *   url:       nothing to look up
 *   ref slug:  must already exist in citation_sources
 *
 * Response shapes checked against live responses on 2026-10-10.
 */

import type { Citation } from './types'

export type SourceMeta = {
  key: string
  kind: Citation['kind']
  title: string | null
  authors: string | null
  container: string | null
  year: number | null
  volume: string | null
  issue: string | null
  pages: string | null
  doi: string | null
  pmid: string | null
  setid: string | null
  url: string | null
  resolved: boolean
}

export type Lookup =
  | { status: 'found'; meta: SourceMeta }
  | { status: 'not_found'; message: string }
  /** The service didn't answer. Publishing goes ahead; the source is resolved later. */
  | { status: 'unavailable'; meta: SourceMeta }

export type FetchJson = (url: string) => Promise<unknown | null>

const empty = (c: Citation): SourceMeta => ({
  key: c.key,
  kind: c.kind,
  title: null,
  authors: null,
  container: null,
  year: null,
  volume: null,
  issue: null,
  pages: null,
  doi: c.kind === 'doi' ? c.id : null,
  pmid: c.kind === 'pmid' ? c.id : null,
  setid: c.kind === 'dailymed' ? c.id : null,
  url: c.kind === 'url' ? c.id : null,
  resolved: false,
})

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** "Aroda VR, Edelstein SL, Goldberg RB, et al." — the first three, as AMA and Vancouver do. */
function authorList(names: string[]): string | null {
  if (!names.length) return null
  return names.length > 3 ? `${names.slice(0, 3).join(', ')}, et al.` : names.join(', ')
}

export function fromEsummary(c: Citation, body: unknown): Lookup {
  const result = isObj(body) && isObj(body.result) ? body.result : null
  const doc = result && isObj(result[c.id]) ? (result[c.id] as Obj) : null
  if (!doc || 'error' in doc) return { status: 'not_found', message: `PubMed has no article with PMID ${c.id}.` }
  const authors = Array.isArray(doc.authors)
    ? doc.authors.filter(a => isObj(a) && a.authtype === 'Author').map(a => str((a as Obj).name)).filter((n): n is string => n !== null)
    : []
  const doi = Array.isArray(doc.articleids)
    ? (doc.articleids.find(a => isObj(a) && a.idtype === 'doi') as Obj | undefined)?.value
    : null
  const year = /^(\d{4})/.exec(str(doc.pubdate) ?? '')?.[1]
  return {
    status: 'found',
    meta: {
      ...empty(c),
      title: str(doc.title)?.replace(/\.$/, '') ?? null,
      authors: authorList(authors),
      container: str(doc.source),
      year: year ? Number(year) : null,
      volume: str(doc.volume),
      issue: str(doc.issue),
      pages: str(doc.pages),
      doi: str(doi)?.toLowerCase() ?? null,
      resolved: true,
    },
  }
}

export function fromCrossref(c: Citation, body: unknown): Lookup {
  const m = isObj(body) && isObj(body.message) ? body.message : null
  if (!m) return { status: 'not_found', message: `No DOI record found for ${c.id}.` }
  const first = (v: unknown) => (Array.isArray(v) ? str(v[0]) : str(v))
  const authors = Array.isArray(m.author)
    ? m.author
        .filter(isObj)
        .map(a => {
          const family = str(a.family)
          if (!family) return null
          const initials = (str(a.given) ?? '').split(/[\s.-]+/).filter(Boolean).map(p => p[0].toUpperCase()).join('')
          return initials ? `${family} ${initials}` : family
        })
        .filter((n): n is string => n !== null)
    : []
  const issued = isObj(m.issued) && Array.isArray(m.issued['date-parts']) ? m.issued['date-parts'][0] : null
  const year = Array.isArray(issued) && typeof issued[0] === 'number' ? issued[0] : null
  return {
    status: 'found',
    meta: {
      ...empty(c),
      title: first(m.title),
      authors: authorList(authors),
      container: first(m['short-container-title']) ?? first(m['container-title']),
      year,
      volume: str(m.volume),
      issue: str(m.issue),
      pages: str(m.page),
      resolved: true,
    },
  }
}

export function fromDailyMed(c: Citation, body: unknown): Lookup {
  const data = isObj(body) && Array.isArray(body.data) ? body.data : []
  const spl = data.find(d => isObj(d) && d.setid === c.id) as Obj | undefined
  if (!spl) return { status: 'not_found', message: `DailyMed has no label with set id ${c.id}.` }
  const title = str(spl.title)
  // "METFORMIN HYDROCHLORIDE TABLET, EXTENDED RELEASE [AJANTA PHARMA USA INC.]"
  const labeler = title ? /\[([^\]]+)\]\s*$/.exec(title)?.[1] ?? null : null
  const year = /(\d{4})\s*$/.exec(str(spl.published_date) ?? '')?.[1]
  return {
    status: 'found',
    meta: {
      ...empty(c),
      title: title ? title.replace(/\s*\[[^\]]+\]\s*$/, '') : null,
      authors: labeler,
      container: 'DailyMed',
      year: year ? Number(year) : null,
      volume: spl.spl_version !== undefined ? `SPL version ${String(spl.spl_version)}` : null,
      url: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${c.id}`,
      resolved: true,
    },
  }
}

export function lookupUrl(c: Citation): string | null {
  switch (c.kind) {
    case 'pmid':
      return `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${encodeURIComponent(c.id)}&retmode=json`
    case 'doi':
      return `https://api.crossref.org/works/${encodeURIComponent(c.id)}`
    case 'dailymed':
      return `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?setid=${encodeURIComponent(c.id)}`
    default:
      return null
  }
}

/** Looks one citation up. `ref` slugs are checked by the caller against citation_sources. */
export async function resolveCitation(c: Citation, fetchJson: FetchJson): Promise<Lookup> {
  if (c.kind === 'url') return { status: 'found', meta: { ...empty(c), resolved: true } }
  const url = lookupUrl(c)
  if (!url) return { status: 'unavailable', meta: empty(c) }
  let body: unknown
  try {
    body = await fetchJson(url)
  } catch {
    return { status: 'unavailable', meta: empty(c) }
  }
  // A 404 from Crossref arrives as null: a real "not found". Other failures throw above.
  if (body === null) {
    return c.kind === 'doi' ? { status: 'not_found', message: `No DOI record found for ${c.id}.` } : { status: 'unavailable', meta: empty(c) }
  }
  if (c.kind === 'pmid') return fromEsummary(c, body)
  if (c.kind === 'doi') return fromCrossref(c, body)
  return fromDailyMed(c, body)
}
