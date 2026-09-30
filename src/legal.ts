/**
 * Legal & governance documents.
 *
 * The canonical text lives in docs/*.md. The /terms, /disclaimer, /licensing
 * and /privacy pages import those files raw and render them with the blog's
 * Markdown component, so the site can never drift from the committed text:
 * edit the markdown, and the page changes with it.
 *
 * When any of the four documents changes materially, bump LEGAL_VERSION to the
 * new Effective Date. New signups record the version they agreed to
 * (auth.users.raw_user_meta_data.legal_agreements_version), and
 * src/legal.test.ts fails if a document's Effective Date and this constant
 * disagree.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/** Effective Date of the current documents, ISO yyyy-mm-dd. */
export const LEGAL_VERSION = '2026-09-29'

export const LEGAL_CONTACT_EMAIL = 'contact@pharmacycommons.org'

export type LegalPageLink = {
  to: '/terms' | '/disclaimer' | '/licensing' | '/privacy'
  /** Full document title, as on the page. */
  title: string
  /** Short name for the footer and the signup checkbox. */
  label: string
  /** Canonical markdown file, relative to the repo root. */
  file: string
}

export const LEGAL_PAGES: LegalPageLink[] = [
  { to: '/terms', title: 'Terms of Use', label: 'Terms of Use', file: 'docs/terms-of-use.md' },
  {
    to: '/disclaimer',
    title: 'Medical Information Disclaimer',
    label: 'Medical Disclaimer',
    file: 'docs/medical-disclaimer.md',
  },
  {
    to: '/privacy',
    title: 'Privacy Policy',
    label: 'Privacy Policy',
    file: 'docs/privacy-policy.md',
  },
  {
    to: '/licensing',
    title: 'Data Provenance and Licensing Policy',
    label: 'Data Provenance Policy',
    file: 'docs/data-provenance-and-licensing.md',
  },
]

export type LegalMeta = { label: string; value: string }

export type LegalDoc = {
  title: string
  /** "September 29, 2026" as written in the document. */
  effectiveDate: string | null
  /** The same date as ISO yyyy-mm-dd, or null if it could not be read. */
  effectiveIso: string | null
  /** Header lines other than Effective Date, Website and Contact (Operator, Maintainer…). */
  meta: LegalMeta[]
  /** Markdown body: title and header lines removed, sections promoted to h2. */
  body: string
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

/** "September 29, 2026" → "2026-09-29". */
export function toIsoDate(text: string): string | null {
  const m = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(text.trim())
  if (!m) return null
  const month = MONTHS.indexOf(m[1].toLowerCase())
  if (month < 0) return null
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

/** A header line such as `**Operator:** Pharmacy of the Commons, LLC`. */
const META_LINE = /^\*\*([^*:]+):\*\*\s*(.+)$/

/**
 * Splits a canonical legal document into page parts.
 *
 * The documents use `#` for the title and `###` for numbered sections. The
 * page already renders the title as its h1, so it is dropped, and headings
 * move up one level (### → h2, #### → h3) so "On this page" lists the sections.
 * Header lines before the first section (Effective Date, Operator…) move into
 * the page header; everything else is kept word for word.
 */
export function parseLegalDoc(raw: string): LegalDoc {
  const text = raw.replace(/\r\n?/g, '\n')

  const titleMatch = /^#\s+(.+)$/m.exec(text)
  const title = (titleMatch?.[1] ?? '').replace(/^Pharmacy Commons\s+[—–-]\s+/, '').trim()

  const firstSection = text.search(/^#{2,6}\s/m)
  const head = firstSection >= 0 ? text.slice(0, firstSection) : text
  const rest = firstSection >= 0 ? text.slice(firstSection) : ''

  let effectiveDate: string | null = null
  const meta: LegalMeta[] = []
  const intro: string[] = []

  for (const line of head.split('\n')) {
    if (/^#\s/.test(line)) continue
    const m = META_LINE.exec(line.trim())
    if (m) {
      const label = m[1].trim()
      const value = m[2].trim()
      if (/^effective date$/i.test(label)) effectiveDate = value
      // Website is the page itself; Contact has its own callout on every page.
      else if (!/^(website|contact)$/i.test(label)) meta.push({ label, value })
      continue
    }
    intro.push(line)
  }

  const body = `${intro.join('\n')}\n${rest}`
    .replace(/^(#{3,6})(\s)/gm, (_, hashes: string, space: string) => `${hashes.slice(1)}${space}`)
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    title,
    effectiveDate,
    effectiveIso: effectiveDate ? toIsoDate(effectiveDate) : null,
    meta,
    body,
  }
}
