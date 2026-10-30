/**
 * Learn — question filters. A filter is a `key:value` tag on an item (`importance:high`, `schedule:2`).
 * Within one group the choices are OR'd (Schedule II or III), across groups they are AND'd
 * (…and High importance). The selection lives in the URL as `?f=schedule:2,schedule:3,importance:high`
 * so a filtered set can be bookmarked or shared.
 *
 * Destination: src/learn/filters.ts
 */

import type { LearnItem } from './types'

/** Tag keys that become filter groups, in display order. Add a key here once items carry `key:value` tags. */
export const FILTER_GROUPS: { key: string; label: string }[] = [
  { key: 'schedule', label: 'Schedule' },
  { key: 'importance', label: 'Importance' },
]

const ROMAN: Record<string, string> = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV', '5': 'V' }
const ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

export function valueLabel(key: string, value: string): string {
  if (key === 'schedule') return `Schedule ${ROMAN[value] ?? value}`
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export type FilterGroup = { key: string; label: string; values: { value: string; label: string; count: number }[] }

/** Selected values per group key. */
export type Selection = Record<string, string[]>

/** Groups that actually split these items: at least two distinct values. */
export function facetsOf(items: readonly LearnItem[]): FilterGroup[] {
  const out: FilterGroup[] = []
  for (const g of FILTER_GROUPS) {
    const counts = new Map<string, number>()
    for (const it of items)
      for (const t of it.tags) {
        if (t.startsWith(`${g.key}:`)) {
          const v = t.slice(g.key.length + 1)
          counts.set(v, (counts.get(v) ?? 0) + 1)
        }
      }
    if (counts.size < 2) continue
    const values = [...counts]
      .sort((a, b) => (ORDER[a[0]] ?? 0) - (ORDER[b[0]] ?? 0) || a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([value, count]) => ({ value, label: valueLabel(g.key, value), count }))
    out.push({ key: g.key, label: g.label, values })
  }
  return out
}

export function applyFilters(items: readonly LearnItem[], sel: Selection): LearnItem[] {
  const active = Object.entries(sel).filter(([, v]) => v.length > 0)
  if (active.length === 0) return [...items]
  return items.filter(it => active.every(([key, vals]) => vals.some(v => it.tags.includes(`${key}:${v}`))))
}

export function parseSelection(raw: string | null): Selection {
  const sel: Selection = {}
  if (!raw) return sel
  for (const part of raw.split(',')) {
    const i = part.indexOf(':')
    if (i < 1) continue
    const key = part.slice(0, i)
    if (!FILTER_GROUPS.some(g => g.key === key)) continue
    const value = part.slice(i + 1)
    if (value && !(sel[key] ?? []).includes(value)) (sel[key] ??= []).push(value)
  }
  return sel
}

export function serializeSelection(sel: Selection): string {
  return FILTER_GROUPS.flatMap(g => (sel[g.key] ?? []).map(v => `${g.key}:${v}`)).join(',')
}

export function toggleValue(sel: Selection, key: string, value: string): Selection {
  const cur = sel[key] ?? []
  const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value]
  return { ...sel, [key]: next }
}
