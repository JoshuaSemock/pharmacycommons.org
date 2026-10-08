/**
 * Classifications — every class system in one catalog (WHO ATC, VA, FDA
 * EPC/MoA/PE/Chemical, ChemOnt, Pharmacy Commons groups and contributor
 * classifications, class_type 'community', phase 15i).
 *
 * Shared by /classifications (search, group filter, compare tray) and
 * /classifications/compare. Kept free of React so the search ranking and the
 * overlap maths are unit-tested (src/classifications.test.ts).
 *
 * Destination: src/classifications.ts
 */

import { supabase } from './supabaseClient'

/** One row of list_classes(): a class with at least one member, or any contributor classification. */
export type ClassRow = {
  slug: string
  name: string
  class_type: string
  class_type_label: string
  source_code: string | null
  level: number | null
  member_count: number
}

/** One member of a class, as get_class() returns it. */
export type ClassMember = {
  pcid: number
  slug: string
  name: string
  entity_type: string
  is_direct: boolean
}

/** The fields of get_class() the compare view uses. */
export type ClassRecord = {
  pcid: number
  slug: string
  name: string
  class_type: string | null
  class_type_label: string | null
  source_code: string | null
  member_count: number | null
  members: ClassMember[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Systems and groups
// ─────────────────────────────────────────────────────────────────────────────

/** Short stamp per class_type, in display order. */
export const SYSTEMS: { type: string; badge: string }[] = [
  { type: 'atc', badge: 'WHO ATC' },
  { type: 'epc', badge: 'FDA EPC' },
  { type: 'moa', badge: 'FDA MoA' },
  { type: 'pe', badge: 'FDA PE' },
  { type: 'chem', badge: 'FDA Chem' },
  { type: 'va', badge: 'VA' },
  { type: 'curated', badge: 'Pharmacy Commons' },
  { type: 'community', badge: 'Contributors' },
  { type: 'chemont', badge: 'ChemOnt' },
]

const SYSTEM_ORDER = new Map(SYSTEMS.map((s, i) => [s.type, i]))

export function systemBadge(type: string | null): string {
  return SYSTEMS.find(s => s.type === type)?.badge ?? 'Other'
}

export type GroupKey = 'all' | 'atc' | 'fda' | 'va' | 'curated' | 'community' | 'chemont'

/** The taxonomy filter. FDA's four vocabularies (EPC, MoA, PE, Chemical) share one entry. */
export const GROUPS: { key: GroupKey; label: string; sublabel: string; types: string[] }[] = [
  { key: 'all', label: 'All classifications', sublabel: 'Every system', types: SYSTEMS.map(s => s.type) },
  { key: 'atc', label: 'WHO ATC', sublabel: 'Anatomical Therapeutic Chemical', types: ['atc'] },
  {
    key: 'fda',
    label: 'FDA pharmacologic classes',
    sublabel: 'Established class, mechanism, physiologic effect, chemical structure',
    types: ['epc', 'moa', 'pe', 'chem'],
  },
  { key: 'va', label: 'VA classes', sublabel: 'Veterans Affairs National Formulary', types: ['va'] },
  {
    key: 'curated',
    label: 'Pharmacy Commons curated',
    sublabel: 'Biologics, INN stems, natural products',
    types: ['curated'],
  },
  {
    key: 'community',
    label: 'Contributor classifications',
    sublabel: 'Groups contributors created, such as psychedelics',
    types: ['community'],
  },
  { key: 'chemont', label: 'ChemOnt taxonomy', sublabel: 'Chemical structure (ClassyFire)', types: ['chemont'] },
]

/** Reads ?group=, falling back to the old ?type= links from /classes. */
export function groupFromParams(params: URLSearchParams): GroupKey {
  const group = params.get('group')
  if (group && GROUPS.some(g => g.key === group)) return group as GroupKey
  const type = params.get('type')
  if (type) return GROUPS.find(g => g.key !== 'all' && g.types.includes(type))?.key ?? 'all'
  return 'all'
}

/** Systems whose classes nest (shown indented, with their codes). */
export const HIERARCHICAL = new Set(['atc', 'va', 'chemont'])
/** Systems whose codes are worth showing (ChemOnt IDs are opaque). */
export const SHOWS_CODES = new Set(['atc', 'va'])

export const MAX_COMPARE = 3

/** Parses ?c=slug,slug — the selection, at most MAX_COMPARE, no repeats. */
export function parseSelection(raw: string | null): string[] {
  const out: string[] = []
  for (const s of (raw ?? '').split(',')) {
    const slug = s.trim()
    if (slug && !out.includes(slug)) out.push(slug)
    if (out.length === MAX_COMPARE) break
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading
// ─────────────────────────────────────────────────────────────────────────────

// PostgREST returns at most 1,000 rows per request, and ATC (1,015) and
// ChemOnt (2,060) are bigger than that, so each system is paged.
const PAGE = 1000

async function loadType(type: string): Promise<ClassRow[]> {
  const rows: ClassRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.rpc('list_classes', { p_type: type }).range(from, from + PAGE - 1)
    if (error) throw error
    const page = (data ?? []) as ClassRow[]
    rows.push(...page)
    if (page.length < PAGE) return rows
  }
}

let cache: Promise<ClassRow[]> | null = null

/** Every class with members, in system order then the RPC's order. Fetched once per visit. */
export function loadAllClasses(): Promise<ClassRow[]> {
  if (!cache) {
    cache = Promise.all(SYSTEMS.map(s => loadType(s.type)))
      .then(groups => {
        const seen = new Set<string>()
        return groups.flat().filter(r => (seen.has(r.slug) ? false : (seen.add(r.slug), true)))
      })
      .catch(err => {
        cache = null
        throw err
      })
  }
  return cache
}

export async function getClass(slug: string): Promise<ClassRecord | null> {
  const { data, error } = await supabase.rpc('get_class', { p_slug: slug })
  if (error) throw error
  return (data as ClassRecord | null) ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────────────────────────────────────

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

/**
 * Lower is better; null means no match. A code match (N06AB, "N06") ranks
 * with an exact name; then names that start with the query, then names with a
 * word that starts with it, then names holding every query word.
 */
export function matchScore(row: ClassRow, query: string): number | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const name = row.name.toLowerCase()
  const code = (row.source_code ?? '').toLowerCase()
  if (name === q || (code && code === q)) return 0
  if (code && !q.includes(' ') && code.startsWith(q)) return 1
  if (name.startsWith(q)) return 2
  if (new RegExp(`(^|[^a-z0-9])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(name)) return 3
  const qWords = words(q)
  if (qWords.length === 0) return null
  const nameWords = words(name)
  if (qWords.every(w => nameWords.some(n => n.startsWith(w)))) return 4
  if (qWords.every(w => name.includes(w))) return 5
  return null
}

/** Matching rows, best first; ties go to the bigger class, then by name. */
export function searchClasses(rows: ClassRow[], query: string): ClassRow[] {
  const scored: { row: ClassRow; score: number }[] = []
  for (const row of rows) {
    const score = matchScore(row, query)
    if (score !== null) scored.push({ row, score })
  }
  return scored
    .sort(
      (a, b) =>
        a.score - b.score ||
        b.row.member_count - a.row.member_count ||
        a.row.name.localeCompare(b.row.name, 'en', { sensitivity: 'base' }),
    )
    .map(s => s.row)
}

/** Stable display order for an unfiltered catalog: system, then the RPC's own order. */
export function bySystem(a: ClassRow, b: ClassRow): number {
  return (SYSTEM_ORDER.get(a.class_type) ?? 99) - (SYSTEM_ORDER.get(b.class_type) ?? 99)
}

// ─────────────────────────────────────────────────────────────────────────────
// Compare
// ─────────────────────────────────────────────────────────────────────────────

export type OverlapRow = {
  pcid: number
  slug: string
  name: string
  /** One cell per class: null when the drug is not in it. */
  cells: (ClassMember | null)[]
  /** How many of the compared classes hold this drug. */
  inCount: number
}

export type Overlap = {
  rows: OverlapRow[]
  /** Drugs in every compared class. */
  shared: number
  /** Per class: drugs in that class and no other compared class. */
  unique: number[]
  /** Every pair of classes (i < j) and the drugs they share. */
  pairs: { a: number; b: number; shared: number }[]
}

/** Lines up the members of 2–3 classes by PCID. Rows are sorted by name. */
export function computeOverlap(classes: { members: ClassMember[] }[]): Overlap {
  const byPcid = new Map<number, OverlapRow>()
  classes.forEach((cls, col) => {
    for (const m of cls.members) {
      let row = byPcid.get(m.pcid)
      if (!row) {
        row = { pcid: m.pcid, slug: m.slug, name: m.name, cells: classes.map(() => null), inCount: 0 }
        byPcid.set(m.pcid, row)
      }
      if (!row.cells[col]) {
        row.cells[col] = m
        row.inCount += 1
      }
    }
  })
  const rows = [...byPcid.values()].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
  const unique = classes.map((_, col) => rows.filter(r => r.inCount === 1 && r.cells[col]).length)
  const pairs: Overlap['pairs'] = []
  for (let a = 0; a < classes.length; a++) {
    for (let b = a + 1; b < classes.length; b++) {
      pairs.push({ a, b, shared: rows.filter(r => r.cells[a] && r.cells[b]).length })
    }
  }
  return { rows, shared: rows.filter(r => r.inCount === classes.length).length, unique, pairs }
}
