/**
 * Pharmacy Commons medical dictionary — data and download helpers for
 * /tools/dictionary (src/tools/Dictionary.tsx). Design notes: docs/dictionary.md.
 *
 * The terms live in `public.dictionary_terms` (phase 14, loaded from
 * Dictionary.xlsx by scripts/dictionary_clean.py). Drug and brand names carry
 * `member_pcid`, the record they name. The Word download is built in the
 * database by `dictionary_dic()` (one word per CRLF line, no definitions or
 * IDs); this module only adds the byte-order mark and saves it.
 *
 * The pure helpers (filters, file encoding, bucket assignment) are tested in
 * src/dictionary.test.ts.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { supabase } from './supabaseClient'
import { GREEK_LETTERS, SYMBOL_KEY, type Bucket } from './catalog'

export type DictionaryKind = 'Term' | 'Abbreviation' | 'Grammar'

export type DictionaryEntry = {
  id: number
  term: string
  definition: string | null
  kind: DictionaryKind
  /** generic / brand for drug names; Initialism / Acronym / Logograph / Other for abbreviations. */
  term_type: string | null
  member_pcid: number | null
}

/** What the "Show" chips narrow the list to. */
export type DictionaryFilter = 'all' | 'drugs' | 'abbreviations' | 'terms'

export const FILTERS: { id: DictionaryFilter; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'drugs', label: 'Drug and brand names' },
  { id: 'abbreviations', label: 'Abbreviations' },
  { id: 'terms', label: 'Medical terms' },
]

export const isFilter = (v: string | null): v is DictionaryFilter => FILTERS.some(f => f.id === v)

const DRUG_TYPES = new Set(['generic', 'brand'])

/** Which chip an entry belongs to. Grammar notes (dose designations) count as abbreviations. */
export function filterOf(e: Pick<DictionaryEntry, 'kind' | 'term_type'>): Exclude<DictionaryFilter, 'all'> {
  if (e.term_type && DRUG_TYPES.has(e.term_type)) return 'drugs'
  if (e.kind === 'Abbreviation' || e.kind === 'Grammar') return 'abbreviations'
  return 'terms'
}

/** The PCID block a linked record sits in (1 moiety, 2 combination, 3 precise form, 4 brand formulation). */
export const blockOf = (pcid: number | null): number | null => (pcid ? Math.floor(pcid / 1_000_000) : null)

/** What a "generic" row's record actually is, by its PCID block. */
const GENERIC_BY_BLOCK: Record<number, string> = {
  1: 'Generic drug name.',
  2: 'Combination product.',
  3: 'Salt, ester or isomer form of a drug.',
  4: 'Brand-name product (FDA).',
}

/** Short label shown after the term. Brand formulations are filed as "generic" in the source, so the PCID block decides. */
export function tagOf(e: Pick<DictionaryEntry, 'kind' | 'term_type' | 'member_pcid'>): string | null {
  const block = blockOf(e.member_pcid)
  if (e.term_type === 'brand' || block === 4) return 'Brand'
  if (e.term_type === 'generic') return block === 2 ? 'Combination' : 'Generic'
  if (e.term_type === 'Acronym') return 'Acronym'
  if (e.term_type === 'Logograph') return 'Symbol'
  if (e.kind === 'Abbreviation' || e.kind === 'Grammar') return 'Abbreviation'
  return null
}

/** Brand rows read "The brand drug form of X." — say "Brand name for X." in the list. */
export function displayDefinition(e: Pick<DictionaryEntry, 'definition' | 'term_type'> & { member_pcid?: number | null }): string | null {
  const d = e.definition?.trim()
  const fallback = e.term_type === 'generic' ? GENERIC_BY_BLOCK[blockOf(e.member_pcid ?? null) ?? 1] ?? GENERIC_BY_BLOCK[1] : null
  if (!d) return fallback
  const brand = /^The brand drug form of (.+?)\.?$/i.exec(d)
  if (brand) return `Brand name for ${brand[1]}.`
  const generic = /^The generic drug form of (.+?)\.?$/i.exec(d)
  if (generic) return `Generic name; sold as ${generic[1]}.`
  if (/^A generic name for a drug/i.test(d)) return fallback
  return d
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

const COLUMNS = 'id, term, definition, kind, term_type, member_pcid'
export const PAGE_SIZE = 200

/**
 * The chip as PostgREST filters (the same split as `filterOf`). Applied with
 * `.match()` / `.in()` / `.or()` by the callers, which keeps the query
 * builder's types shallow.
 */
function filterParts(f: DictionaryFilter): { inCol?: 'term_type' | 'kind'; inVals?: string[]; kind?: string; or?: string } {
  if (f === 'drugs') return { inCol: 'term_type', inVals: ['generic', 'brand'] }
  if (f === 'abbreviations') return { inCol: 'kind', inVals: ['Abbreviation', 'Grammar'] }
  if (f === 'terms') return { kind: 'Term', or: 'term_type.is.null,term_type.not.in.(generic,brand)' }
  return {}
}

/** Entry counts per A–Z bucket (for disabling empty letters). */
export async function loadBucketCounts(): Promise<Record<Bucket, number>> {
  const { data, error } = await supabase.rpc('dictionary_buckets')
  if (error) throw new Error(`Failed to load dictionary letters: ${error.message}`)
  const out: Record<Bucket, number> = {}
  for (const r of (data ?? []) as { bucket: string; n: number }[]) out[r.bucket] = Number(r.n)
  return out
}

/** One page of a letter, in index order. */
export async function loadBucket(
  bucket: Bucket,
  filter: DictionaryFilter,
  offset: number,
  signal?: AbortSignal,
): Promise<{ rows: DictionaryEntry[]; total: number }> {
  let q = supabase
    .from('dictionary_terms')
    .select(COLUMNS, { count: 'exact' })
    .eq('bucket', bucket)
    .order('sort_key')
    .order('id')
    .range(offset, offset + PAGE_SIZE - 1)
  const f = filterParts(filter)
  if (f.inCol && f.inVals) q = q.in(f.inCol, f.inVals)
  if (f.kind) q = q.eq('kind', f.kind)
  if (f.or) q = q.or(f.or)
  if (signal) q = q.abortSignal(signal)
  const { data, error, count } = await q
  if (error) throw new Error(`Failed to load dictionary entries: ${error.message}`)
  return { rows: (data ?? []) as DictionaryEntry[], total: count ?? 0 }
}

/** Escape LIKE wildcards in what the user typed. */
export function ilikePattern(q: string): string {
  return q.trim().replace(/[\\%_]/g, m => `\\${m}`)
}

/** Terms starting with the query first, then terms containing it, then definitions containing it. */
export async function searchDictionary(query: string, filter: DictionaryFilter, signal?: AbortSignal): Promise<DictionaryEntry[]> {
  const q = ilikePattern(query)
  if (q.length < 2) return []
  const run = async (column: 'term' | 'definition', pattern: string, limit: number) => {
    let req = supabase.from('dictionary_terms').select(COLUMNS).ilike(column, pattern).order('sort_key').order('id').limit(limit)
    const f = filterParts(filter)
    if (f.inCol && f.inVals) req = req.in(f.inCol, f.inVals)
    if (f.kind) req = req.eq('kind', f.kind)
    if (f.or) req = req.or(f.or)
    if (signal) req = req.abortSignal(signal)
    const { data, error } = await req
    if (error) throw new Error(`Dictionary search failed: ${error.message}`)
    return (data ?? []) as DictionaryEntry[]
  }
  const [starts, contains, defs] = await Promise.all([
    run('term', `${q}%`, 150),
    run('term', `%${q}%`, 150),
    run('definition', `%${q}%`, 100),
  ])
  const seen = new Set<number>()
  const out: DictionaryEntry[] = []
  for (const row of [...starts, ...contains, ...defs]) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    out.push(row)
  }
  return out
}

/** The .dic body: one word per CRLF line, as built by dictionary_dic(). */
export async function loadDicText(): Promise<string> {
  const { data, error } = await supabase.rpc('dictionary_dic')
  if (error) throw new Error(`Failed to build the dictionary file: ${error.message}`)
  return String(data ?? '')
}

// ─────────────────────────────────────────────────────────────────────────────
// The download
// ─────────────────────────────────────────────────────────────────────────────

export const DIC_FILENAME = 'PharmacyCommons-Medical.dic'

/** CRLF line count, i.e. words in the file. */
export const wordCount = (dic: string): number => dic.split('\r\n').filter(Boolean).length

/** UTF-8 with a byte-order mark, so Word reads accented and Greek letters correctly. */
export function dicUtf8(dic: string): Blob {
  return new Blob(['﻿', dic], { type: 'text/plain;charset=utf-8' })
}

/**
 * UTF-16 little-endian with a byte-order mark — the encoding Word itself saves
 * custom dictionaries in. Offered as a fallback for older Word versions.
 */
export function dicUtf16(dic: string): Blob {
  const text = '﻿' + dic
  const buf = new Uint8Array(text.length * 2)
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    buf[2 * i] = c & 0xff
    buf[2 * i + 1] = c >> 8
  }
  return new Blob([buf], { type: 'text/plain;charset=utf-16le' })
}

/** Hand a Blob to the browser as a file. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ─────────────────────────────────────────────────────────────────────────────
// A–Z buckets
// ─────────────────────────────────────────────────────────────────────────────

const GREEK_NAMES = GREEK_LETTERS.map(g => g.name)
const GREEK_BY_GLYPH = new Map<string, string>(GREEK_LETTERS.map(g => [g.symbol, g.name]))
const GREEK_WORD_HYPHEN = new RegExp(`^(${GREEK_NAMES.join('|')})-`)

const stripLead = (s: string) => s.replace(/^[^a-z0-9Ͱ-Ͽ]+/, '')

function isSymbolLed(s: string): boolean {
  const bracketed = /^[([{]([^)\]}]*)[)\]}]/.exec(s)
  if (bracketed) {
    const inner = bracketed[1].trim()
    return inner.length > 0 && !/[a-z0-9Ͱ-Ͽ]/i.test(inner)
  }
  const c = s.charAt(0)
  return Boolean(c) && !/[a-z0-9([{Ͱ-Ͽ]/i.test(c)
}

/**
 * The bucket a dictionary term files under. The database stores it
 * (`dictionary_terms.bucket`, computed by scripts/dictionary_clean.py); this is
 * the same rule in TypeScript, kept for tests and for terms added later.
 *
 * It follows Browse (`bucketOf` in catalog.ts) with one difference: a
 * spelled-out Greek letter counts only before a hyphen ("beta-carotene" → β),
 * so abbreviations such as PSI, ETA or PI stay under P, E and P.
 */
export function dictionaryBucketOf(term: string): Bucket {
  const raw = term.trim().toLowerCase().replace(/µ/g, 'μ')
  if (!raw || isSymbolLed(raw)) return SYMBOL_KEY
  const s = stripLead(raw)
  if (!s) return SYMBOL_KEY
  const core = s.replace(/^[\d,'’\-\s]+/, '')
  const word = GREEK_WORD_HYPHEN.exec(core)
  if (word) return `g:${word[1]}`
  const glyph = GREEK_BY_GLYPH.get(core.charAt(0))
  if (glyph) return `g:${glyph}`
  const c = s.charAt(0)
  if (c >= 'a' && c <= 'z') return c.toUpperCase()
  if (c >= '0' && c <= '9') return '#'
  return SYMBOL_KEY
}
