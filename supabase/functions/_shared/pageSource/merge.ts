// GENERATED from src/pageSource/merge.ts by scripts/sync-page-source.mjs — do not edit here.
/**
 * Section-level three-way merge (docs/page-editor.md §7b).
 *
 *   base      the revision the contributor started editing from
 *   current   the page as it is now (someone may have published since)
 *   incoming  the contributor's version
 *
 * The page is split into units: the lead, each section (by stable id), each
 * Quick Facts key, each brand, and the main-column order. A unit only the
 * contributor changed takes their version; a unit only someone else changed
 * keeps theirs; a unit both changed differently is a conflict. So two people
 * editing different sections, or different Quick Facts keys, never collide.
 *
 * Structured lines in a section block (renal dosing) merge with their section:
 * their ranges depend on each other, so they're one unit.
 */

import { serializeMain } from './serialize.ts'
import type { BrandLine, InfoboxLine, MainItem, PageModel } from './types.ts'

export type Conflict = {
  unit: string
  /** What the contributor wrote, and what the page has now (for the side-by-side screen). */
  label: string
  incoming: string | null
  current: string | null
}

export type MergeResult =
  | { ok: true; model: PageModel; changed: string[] }
  /**
   * `model` is what the editor reloads after a conflict: everything that merged,
   * with the current version of each conflicting unit, based on the live revision.
   * The contributor re-applies their own text (shown beside it) and publishes again.
   */
  | { ok: false; conflicts: Conflict[]; model: PageModel }

/** Stable id of a main-column item: 'lead', an embed name, or a section id. */
export function itemId(item: MainItem): string {
  if (item.kind === 'lead') return 'lead'
  if (item.kind === 'embed') return `::${item.name}`
  if (!item.id) throw new Error(`Section "${item.heading}" has no id; assign ids before merging`)
  return item.id
}

function units(model: PageModel): Map<string, { text: string; item: MainItem }> {
  const out = new Map<string, { text: string; item: MainItem }>()
  for (const item of model.main) {
    if (item.kind === 'embed') continue
    out.set(itemId(item), { text: item.kind === 'lead' ? item.markdown : (serializeMain(item) ?? ''), item })
  }
  return out
}

const infoboxText = (l: InfoboxLine | undefined) =>
  l ? `${l.isNull ? '[NONE]' : (l.value ?? '')} ${l.citations.map(c => c.key).join(' ')}` : null

function brandKey(l: BrandLine): string {
  return l.brand.trim().replace(/\s+/g, ' ').toUpperCase()
}
const brandText = (l: BrandLine | undefined) =>
  !l || l.action === 'source' ? null : `${l.action} ${l.action === 'hide' ? l.reason : ''} ${l.citations.map(c => c.key).join(' ')}`

function threeWay<T>(
  prefix: string,
  keys: Set<string>,
  get: (m: 'b' | 'c' | 'i', key: string) => T | undefined,
  text: (v: T | undefined) => string | null,
  conflicts: Conflict[],
  changed: string[],
): Map<string, T | undefined> {
  const out = new Map<string, T | undefined>()
  for (const key of keys) {
    const b = text(get('b', key))
    const c = text(get('c', key))
    const i = text(get('i', key))
    const mine = i !== b
    const theirs = c !== b
    if (mine && theirs && i !== c) {
      conflicts.push({ unit: `${prefix}:${key}`, label: `${prefix === 'infobox' ? 'Quick Facts' : 'Brand'}: ${key}`, incoming: i, current: c })
      out.set(key, get('c', key))
      continue
    }
    if (mine) changed.push(`${prefix}:${key}`)
    out.set(key, mine ? get('i', key) : get('c', key))
  }
  return out
}

/** The main-column order with only ids present in `keep`. */
const restrict = (order: string[], keep: Set<string>) => order.filter(id => keep.has(id))
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, k) => x === b[k])

/**
 * @param infoboxOrder Quick Facts keys in registry order (infobox_properties.sort_order),
 *                     so the merged model is in the same order a parse produces.
 */
export function mergeModels(base: PageModel, current: PageModel, incoming: PageModel, infoboxOrder: string[] = []): MergeResult {
  const conflicts: Conflict[] = []
  const changed: string[] = []

  // ── Lead and sections ──────────────────────────────────────────────────────
  const B = units(base)
  const C = units(current)
  const I = units(incoming)
  const ids = new Set([...B.keys(), ...C.keys(), ...I.keys()])
  const resolved = new Map<string, MainItem | null>() // null = removed
  for (const id of ids) {
    const b = B.get(id)?.text ?? null
    const c = C.get(id)?.text ?? null
    const i = I.get(id)?.text ?? null
    const mine = i !== b
    const theirs = c !== b
    const label = (I.get(id) ?? C.get(id) ?? B.get(id))?.item
    const name = !label ? id : label.kind === 'lead' ? 'Lead' : label.kind === 'section' ? `## ${label.heading}` : id
    const clash = mine && theirs && i !== c
    if (clash) conflicts.push({ unit: id, label: name, incoming: i, current: c })
    else if (mine) changed.push(id)
    const pick = mine && !clash ? I.get(id) : C.get(id)
    resolved.set(id, pick ? pick.item : null)
  }

  // ── Order ──────────────────────────────────────────────────────────────────
  const orderB = base.main.map(itemId)
  const orderC = current.main.map(itemId)
  const orderI = incoming.main.map(itemId)
  const common = new Set(orderB.filter(id => orderC.includes(id) && orderI.includes(id)))
  const iMoved = !same(restrict(orderI, common), restrict(orderB, common))
  const cMoved = !same(restrict(orderC, common), restrict(orderB, common))
  if (iMoved && cMoved && !same(restrict(orderI, common), restrict(orderC, common))) {
    conflicts.push({ unit: 'order', label: 'Section order', incoming: orderI.join('\n'), current: orderC.join('\n') })
  }
  const orderClash = conflicts.some(c => c.unit === 'order')
  if (iMoved && !orderClash) changed.push('order')

  // Start from the side that moved things (contributor wins if only they did),
  // then add sections the other side created, next to their neighbour.
  const primary = iMoved && !orderClash ? orderI : orderC
  const secondary = iMoved && !orderClash ? orderC : orderI
  const order = [...primary]
  secondary.forEach((id, k) => {
    if (order.includes(id)) return
    const before = secondary.slice(0, k).reverse().find(x => order.includes(x))
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id)
  })

  const main: MainItem[] = []
  for (const id of order) {
    if (id.startsWith('::')) {
      const embed = [...incoming.main, ...current.main].find(m => m.kind === 'embed' && itemId(m) === id)
      // An embed only leaves the page if neither side still has it (they can't be removed anyway).
      if (embed) main.push(embed)
      continue
    }
    const item = resolved.get(id)
    if (item) main.push(item)
  }
  if (main[0]?.kind !== 'lead') {
    const lead = main.find(m => m.kind === 'lead')
    if (lead) main.splice(main.indexOf(lead), 1)
    main.unshift(lead ?? { kind: 'lead', id: 'lead', markdown: '' })
  }

  // ── Quick Facts, per key ───────────────────────────────────────────────────
  const ib = (m: PageModel) => new Map((m.infobox?.lines ?? []).map(l => [l.key, l]))
  const IB = { b: ib(base), c: ib(current), i: ib(incoming) }
  const ibKeys = new Set([...IB.b.keys(), ...IB.c.keys(), ...IB.i.keys()])
  const ibMerged = threeWay('infobox', ibKeys, (m, k) => IB[m].get(k), infoboxText, conflicts, changed)
  const infoboxLines = [...ibMerged.values()].filter((l): l is InfoboxLine => l !== undefined)
  const keyOrder = [...new Set([...infoboxOrder, ...[incoming, current, base].flatMap(m => (m.infobox?.lines ?? []).map(l => l.key))])]
  infoboxLines.sort((a, b) => keyOrder.indexOf(a.key) - keyOrder.indexOf(b.key))

  // ── Brands, per brand ──────────────────────────────────────────────────────
  const br = (m: PageModel) => new Map((m.brands?.lines ?? []).map(l => [brandKey(l), l]))
  const BR = { b: br(base), c: br(current), i: br(incoming) }
  const brKeys = new Set([...BR.b.keys(), ...BR.c.keys(), ...BR.i.keys()])
  const brMerged = threeWay('brands', brKeys, (m, k) => BR[m].get(k), brandText, conflicts, changed)
  // Source brands come from the incoming parse (it validated them against the sources).
  const brandLines: BrandLine[] = []
  for (const l of incoming.brands?.lines ?? []) {
    const merged = brMerged.get(brandKey(l))
    if (merged) brandLines.push(merged)
    else if (l.action === 'source') brandLines.push(l)
  }
  for (const [key, l] of brMerged) {
    if (l && !brandLines.some(x => brandKey(x) === key)) brandLines.push(l)
  }

  const model: PageModel = {
    title: incoming.title,
    brands: incoming.brands || current.brands ? { name: 'brands', lines: brandLines } : null,
    infobox: incoming.infobox || current.infobox ? { name: 'infobox', lines: infoboxLines } : null,
    main,
  }
  return conflicts.length ? { ok: false, conflicts, model } : { ok: true, changed, model }
}

/** Gives every contributor section without an id a new one. */
export function assignSectionIds(model: PageModel, newId: () => string): PageModel {
  return {
    ...model,
    main: model.main.map(m => (m.kind === 'section' && !m.id ? { ...m, id: newId() } : m)),
  }
}

/** Contributor section ids by lower-cased heading, for parsing an edit of this model. */
export function sectionIdsOf(model: PageModel): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of model.main) if (m.kind === 'section' && m.id && !m.template) out[m.heading.trim().replace(/\s+/g, ' ').toLowerCase()] = m.id
  return out
}

/** Replaces one unit of `model` with the same unit from a parsed fragment. */
export function spliceFragment(
  model: PageModel,
  fragment: PageModel,
  target: { kind: 'lead' } | { kind: 'section'; heading: string } | { kind: 'rail'; name: 'infobox' | 'brands' },
): PageModel {
  if (target.kind === 'rail') {
    return target.name === 'infobox' ? { ...model, infobox: fragment.infobox } : { ...model, brands: fragment.brands }
  }
  if (target.kind === 'lead') {
    const lead = fragment.main[0]
    return { ...model, main: model.main.map(m => (m.kind === 'lead' && lead.kind === 'lead' ? lead : m)) }
  }
  const key = target.heading.trim().toLowerCase()
  const replacement = fragment.main.find(m => m.kind === 'section')
  return {
    ...model,
    main: model.main.map(m => {
      if (m.kind !== 'section' || m.heading.trim().toLowerCase() !== key || !replacement || replacement.kind !== 'section') return m
      return { ...replacement, id: m.id, template: m.template }
    }),
  }
}
