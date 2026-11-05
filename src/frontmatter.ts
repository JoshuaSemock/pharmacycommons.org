/**
 * Readers for front matter that has already been parsed.
 *
 * Browser-safe and tiny: no YAML library here. Markdown files are parsed at
 * build time (the `?fm` import, see scripts/viteFrontmatter.ts, and
 * src/frontmatterParse.ts), so only the result ships to the browser.
 *
 * Front matter is data a person typed. These readers return undefined / [] /
 * false for a missing or wrongly typed value instead of letting it through.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type Frontmatter = Record<string, unknown>

export type FrontmatterResult = {
  /** Parsed block, or {} when there is none or it could not be read. */
  meta: Frontmatter
  /** Everything after the block, trimmed. The whole text, trimmed, when there is no block. */
  body: string
  /** Why the block could not be read, or null. */
  error: string | null
}

/** A non-empty string (numbers are accepted and converted: `version: 0.2`). */
export function readText(meta: Frontmatter, key: string): string | undefined {
  const v = meta[key]
  if (typeof v === 'string') return v.trim() || undefined
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return undefined
}

/** A calendar date written as yyyy-mm-dd; anything else (including 2026-02-31) is undefined. */
export function readIsoDate(meta: Frontmatter, key: string): string | undefined {
  const v = readText(meta, key)
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? undefined : v
}

/** `true` or `"true"`. */
export function readFlag(meta: Frontmatter, key: string): boolean {
  const v = meta[key]
  return v === true || (typeof v === 'string' && v.trim().toLowerCase() === 'true')
}

/** A YAML list, or a comma-separated string (`tags: a, b`), as trimmed non-empty strings. */
export function readList(meta: Frontmatter, key: string): string[] {
  const v = meta[key]
  const items = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []
  return items
    .filter((x): x is string | number => typeof x === 'string' || typeof x === 'number')
    .map(x => String(x).trim())
    .filter(Boolean)
}

/** A mapping of label → text, in the order written (for header lines such as Operator). */
export function readPairs(meta: Frontmatter, key: string): { label: string; value: string }[] {
  const v = meta[key]
  if (!v || typeof v !== 'object' || Array.isArray(v)) return []
  const out: { label: string; value: string }[] = []
  for (const [label, value] of Object.entries(v as Record<string, unknown>)) {
    const text = typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
    if (text) out.push({ label, value: text })
  }
  return out
}
