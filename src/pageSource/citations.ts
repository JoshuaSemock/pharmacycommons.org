/**
 * `[@key]` citations (docs/page-editor.md §6).
 *
 * Keys are self-resolving: the prefix says where the reference comes from, so a
 * contributor never has to create a reference before citing it.
 *
 *   [@pmid:26900641]                     PubMed
 *   [@doi:10.1210/jc.2015-3754]          Crossref
 *   [@dailymed:1ed9dde4-339c-…]          DailyMed set id
 *   [@url:https://www.fda.gov/…]         any web page
 *   [@ada-soc-2025]                      an existing reference by its slug
 *
 * Several in one bracket: [@pmid:1; @pmid:2]. Adjacent brackets also work.
 * This file only checks the shape of a key; whether it resolves is checked when
 * the page is published.
 */

import type { Citation } from './types'

/** A whole citation bracket. Body up to 600 chars, no newlines or brackets. */
export const CITATION_PATTERN = /\[@([^\[\]\n]{1,600})\]/g

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type KeyProblem = { raw: string; message: string }

/** Parses one key (without the leading @). */
export function parseCitationKey(raw: string): Citation | KeyProblem {
  const key = raw.trim()
  const colon = key.indexOf(':')
  if (colon === -1) {
    if (/^[a-z0-9][a-z0-9-]{1,80}$/.test(key)) return { kind: 'ref', id: key, key }
    return { raw: key, message: `“${key}” isn't a citation key. Use pmid:…, doi:…, dailymed:…, url:… or a reference's short name.` }
  }
  const prefix = key.slice(0, colon).toLowerCase()
  const id = key.slice(colon + 1).trim()
  switch (prefix) {
    case 'pmid':
      return /^\d{1,9}$/.test(id)
        ? { kind: 'pmid', id, key: `pmid:${id}` }
        : { raw: key, message: `A PMID is digits only (got “${id}”).` }
    case 'doi': {
      const doi = id.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
      return /^10\.\d{4,9}\/\S+$/.test(doi)
        ? { kind: 'doi', id: doi.toLowerCase(), key: `doi:${doi.toLowerCase()}` }
        : { raw: key, message: `A DOI starts with 10. and a slash, e.g. doi:10.1210/jc.2015-3754 (got “${id}”).` }
    }
    case 'dailymed':
      return UUID.test(id)
        ? { kind: 'dailymed', id: id.toLowerCase(), key: `dailymed:${id.toLowerCase()}` }
        : { raw: key, message: `A DailyMed set id looks like 1ed9dde4-339c-486f-a346-dde33a5e493f (got “${id}”).` }
    case 'url':
      return /^https?:\/\/[^\s<>"]+\.[^\s<>"]+$/i.test(id)
        ? { kind: 'url', id, key: `url:${id}` }
        : { raw: key, message: `A url: citation needs a full web address starting with https:// (got “${id}”).` }
    default:
      return { raw: key, message: `Unknown citation type “${prefix}:”. Use pmid:, doi:, dailymed: or url:.` }
  }
}

export function isProblem(c: Citation | KeyProblem): c is KeyProblem {
  return 'message' in c
}

/** Finds every citation in a piece of text. */
export function findCitations(text: string): { citations: Citation[]; problems: KeyProblem[]; index: number }[] {
  const out: { citations: Citation[]; problems: KeyProblem[]; index: number }[] = []
  for (const m of text.matchAll(CITATION_PATTERN)) {
    const citations: Citation[] = []
    const problems: KeyProblem[] = []
    for (const part of m[1].split(';')) {
      const raw = part.trim().replace(/^@/, '')
      if (!raw) continue
      const parsed = parseCitationKey(raw)
      if (isProblem(parsed)) problems.push(parsed)
      else citations.push(parsed)
    }
    out.push({ citations, problems, index: m.index ?? 0 })
  }
  return out
}

/** Splits trailing citations off a block value: "Extended-release [@a][@b]" → text + citations. */
export function splitCitations(text: string): { text: string; citations: Citation[]; problems: KeyProblem[] } {
  const citations: Citation[] = []
  const problems: KeyProblem[] = []
  for (const found of findCitations(text)) {
    citations.push(...found.citations)
    problems.push(...found.problems)
  }
  const rest = text.replace(CITATION_PATTERN, ' ').replace(/\s+/g, ' ').trim()
  return { text: rest, citations, problems }
}

/** How a citation is written back into source. */
export function formatCitations(citations: Citation[]): string {
  return citations.map(c => `[@${c.key}]`).join('')
}
