/**
 * Reads a legal document (docs/*.md): front matter plus markdown body.
 * Kept apart from src/legal.ts so the footer and signup form don't load the
 * document code. Takes the front matter already parsed at build time (a
 * `docs/x.md?fm` import). See src/legal.ts for the rules.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { readIsoDate, readPairs, readText } from './frontmatter'
import type { FrontmatterResult } from './frontmatter'

export type LegalMeta = { label: string; value: string }

export type LegalDoc = {
  title: string
  /** Short name for the footer and the signup checkbox. */
  label: string | null
  /** Route the document is served at, e.g. /terms. */
  route: string | null
  /** One plain-language sentence under the title. */
  lede: string | null
  /** "October 27, 2026", formatted from the ISO date. */
  effectiveDate: string | null
  /** effective_date as written in the front matter, yyyy-mm-dd, or null if missing or invalid. */
  effectiveIso: string | null
  /** Header lines from `details` (Operator, Maintainer…), in order. */
  meta: LegalMeta[]
  website: string | null
  contact: string | null
  /** Hash of the text after the front matter, as recorded by the document. */
  bodySha256: string | null
  /** Why the front matter could not be read, or null. */
  frontmatterError: string | null
  /** Markdown body: title removed, sections promoted to h2. */
  body: string
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** "2026-10-27" → "October 27, 2026". Returns the input unchanged if it is not yyyy-mm-dd. */
export function formatLegalDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return iso
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`
}

/**
 * Splits a canonical legal document into page parts.
 *
 * Metadata comes from the front matter. The body keeps the `#` title line for
 * people reading the file on GitHub; the page already renders the title as its
 * h1, so that line is dropped, and headings move up one level (### → h2,
 * #### → h3) so "On this page" lists the sections. Everything else is kept
 * word for word.
 */
export function parseLegalDoc({ meta, body: text, error }: FrontmatterResult): LegalDoc {

  const titleMatch = /^#\s+(.+)$/m.exec(text)
  const h1Title = (titleMatch?.[1] ?? '').replace(/^Pharmacy Commons\s+[—–-]\s+/, '').trim()
  const effectiveIso = readIsoDate(meta, 'effective_date') ?? null

  const body = text
    .replace(/^#\s.*$/m, '')
    .replace(/^(#{3,6})(\s)/gm, (_, hashes: string, space: string) => `${hashes.slice(1)}${space}`)
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    title: readText(meta, 'title') ?? h1Title,
    label: readText(meta, 'label') ?? null,
    route: readText(meta, 'route') ?? null,
    lede: readText(meta, 'lede') ?? null,
    effectiveDate: effectiveIso ? formatLegalDate(effectiveIso) : null,
    effectiveIso,
    meta: readPairs(meta, 'details'),
    website: readText(meta, 'website') ?? null,
    contact: readText(meta, 'contact') ?? null,
    bodySha256: readText(meta, 'body_sha256') ?? null,
    frontmatterError: error,
    body,
  }
}
