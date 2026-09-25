/**
 * Sorting, filtering and export for list pages. Pure functions so the rules
 * are testable without rendering (see src/lists.test.ts).
 *
 * Destination: src/lists.ts
 */

import type { ListDetail, ListItem } from './api.generated'
import { formatDrugName } from './names'

export type SortKey = 'rank' | 'value' | 'name' | 'status'

export type SortOption = { key: SortKey; label: string }

/** The sort options that make sense for this list, in display order. */
export function sortOptions(list: Pick<ListDetail, 'items' | 'measure_label' | 'measure_unit'>): SortOption[] {
  const opts: SortOption[] = []
  if (list.items.some(i => i.rank !== null)) opts.push({ key: 'rank', label: 'Rank' })
  if (list.items.some(i => i.value !== null)) opts.push({ key: 'value', label: valueLabel(list) })
  opts.push({ key: 'name', label: 'A–Z' })
  if (list.items.some(i => i.legal_status)) opts.push({ key: 'status', label: 'Status' })
  return opts
}

/** Short column / button label for `value`. */
export function valueLabel(list: Pick<ListDetail, 'measure_label' | 'measure_unit'>): string {
  if (list.measure_unit === 'people') return 'People per year'
  if (list.measure_label?.toLowerCase().includes('rank')) return 'Overall rank'
  return list.measure_label ?? 'Value'
}

/**
 * Whether a bigger `value` is better. A patient count reads best biggest-first;
 * an "overall rank" is a rank, so smallest-first.
 */
export function valueIsRank(list: Pick<ListDetail, 'measure_label'>): boolean {
  return Boolean(list.measure_label?.toLowerCase().includes('rank'))
}

/** The key a list opens with. */
export function defaultSortKey(list: Pick<ListDetail, 'default_sort' | 'items' | 'measure_label' | 'measure_unit'>): SortKey {
  const available = sortOptions(list).map(o => o.key)
  const wanted: SortKey = list.default_sort === 'value_desc' ? 'value' : list.default_sort === 'name' ? 'name' : 'rank'
  return available.includes(wanted) ? wanted : available[0]
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })

/**
 * Sort a copy of `items`. The "natural" direction of each key is ascending
 * except `value` on a measured list (most first); `reverse` flips it. Nulls
 * always sink to the bottom, and ties fall back to name so the order is stable.
 */
export function sortItems(items: ListItem[], key: SortKey, reverse: boolean, opts: { valueIsRank?: boolean } = {}): ListItem[] {
  const byName = (a: ListItem, b: ListItem) => collator.compare(a.name, b.name)
  const nullsLast = (x: number | string | null, y: number | string | null): number | null => {
    if (x === null && y === null) return 0
    if (x === null) return 1
    if (y === null) return -1
    return null
  }
  const valueDesc = !opts.valueIsRank

  return [...items].sort((a, b) => {
    let c: number
    if (key === 'name') {
      c = byName(a, b)
      return reverse ? -c : c
    }
    const x = key === 'rank' ? a.rank : key === 'value' ? a.value : a.legal_status
    const y = key === 'rank' ? b.rank : key === 'value' ? b.value : b.legal_status
    const n = nullsLast(x, y)
    if (n !== null && n !== 0) return n
    if (n === 0) return byName(a, b)
    if (key === 'status') c = collator.compare(String(x), String(y))
    else c = (x as number) - (y as number)
    if (key === 'value' && valueDesc) c = -c
    if (reverse) c = -c
    return c !== 0 ? c : byName(a, b)
  })
}

export type ItemFilter = {
  /** Matches the drug name or the name as written in the source. */
  query?: string
  /** Keep items with rank ≤ top (unranked items are dropped when set). */
  top?: number | null
  /** Exact legal status, e.g. "CS-2". Matches inside combined statuses ("CS-2 (…); CS-3 (…)"). */
  status?: string | null
}

export function filterItems(items: ListItem[], f: ItemFilter): ListItem[] {
  const q = f.query?.trim().toLowerCase() ?? ''
  return items.filter(i => {
    if (q && !i.name.toLowerCase().includes(q) && !i.source_name.toLowerCase().includes(q)) return false
    if (f.top && (i.rank === null || i.rank > f.top)) return false
    if (f.status && !statusParts(i.legal_status).includes(f.status)) return false
    return true
  })
}

/** "CS-2 (dronabinol in oral solution); CS-3 (…)" → ["CS-2", "CS-3"]. */
export function statusParts(status: string | null): string[] {
  if (!status) return []
  return status
    .split(';')
    .map(s => s.replace(/\(.*\)/, '').trim())
    .filter(Boolean)
}

/** Distinct legal statuses on a list, in natural order (CS-1 … CS-5, then the rest). */
export function statusValues(items: ListItem[]): string[] {
  const set = new Set<string>()
  for (const i of items) for (const s of statusParts(i.legal_status)) set.add(s)
  return [...set].sort(collator.compare)
}

/** "Top N" choices worth offering for a ranked list of this length. */
export function topChoices(maxRank: number): number[] {
  return [10, 25, 50, 100, 200, 300, 500].filter(n => n < maxRank)
}

function csvCell(v: string | number | null): string {
  if (v === null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV of the rows as currently shown, with a PCID column so the file joins back to the API. */
export function listToCsv(list: Pick<ListDetail, 'measure_label'>, items: ListItem[]): string {
  const header = ['rank', 'drug', 'pcid', 'name_in_source']
  const hasValue = items.some(i => i.value !== null)
  const hasStatus = items.some(i => i.legal_status)
  if (hasValue) header.push(list.measure_label ?? 'value')
  if (hasStatus) header.push('legal_status')
  const lines = [header.map(csvCell).join(',')]
  for (const i of items) {
    const row: (string | number | null)[] = [i.rank, formatDrugName(i.name), `PCID-${i.pcid}`, i.source_name]
    if (hasValue) row.push(i.value)
    if (hasStatus) row.push(i.legal_status)
    lines.push(row.map(csvCell).join(','))
  }
  return lines.join('\n') + '\n'
}

/** 27311800 → "27.3 M"; 517000 → "517 K". */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)} M`
  if (n >= 1_000) return `${Math.round(n / 1_000).toLocaleString()} K`
  return n.toLocaleString()
}
