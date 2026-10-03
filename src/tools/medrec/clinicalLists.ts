/**
 * Medication reconciliation — clinical lists.
 *
 * Some Pharmacy Commons lists say something clinical about a drug: its
 * anticholinergic burden score, whether it can prolong the QT interval, whether
 * some of its products must not be crushed. This module brings those lists into
 * the tool: a marker on each medication in the table, totals and warnings in
 * "Check before you finish", and a risk summary on the printable list.
 *
 * Which lists count is decided here, in CLINICAL_LISTS, keyed by list slug.
 * Every other list (most-used rankings, Notable Drugs, the Georgia MPJE lists)
 * is ignored. To bring in another clinical list, add its slug with how it
 * combines across a person's medications:
 *   sum   numeric scores add up (anticholinergic burden)
 *   count medications on the list are counted (QT risk)
 *   each  each medication is mentioned on its own (do not crush)
 *
 * Privacy: the tool still sends nothing about the person. The whole of each
 * clinical list is downloaded once per visit (public data) and matched in the
 * browser, so no request ever names a medication on someone's list. Because the
 * data comes from the live lists, it is not stored in the CSV; it is matched
 * again whenever a list is opened, so scores are always current.
 *
 * Matching: by PCID when the name was picked from the search, otherwise by the
 * typed name, ignoring case and a trailing salt ("hydroxyzine hydrochloride"
 * matches hydroxyzine). Only list entries for the drug itself (moieties) are
 * used; entries for a specific product or combination need the product, which
 * the tool does not record yet.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { ListItem } from '@/api.generated'
import type { MedRecState, Medication, Tone } from './model'
import { formDef } from './model'

export type Aggregate = 'sum' | 'count' | 'each'

export type ClinicalListDef = {
  /** Shown in markers and summaries, e.g. "Anticholinergic burden". */
  label: string
  aggregate: Aggregate
}

export const CLINICAL_LISTS: Record<string, ClinicalListDef> = {
  'anticholinergic-burden': { label: 'Anticholinergic burden', aggregate: 'sum' },
  'arrhythmia-risk': { label: 'QT and arrhythmia risk', aggregate: 'count' },
  'do-not-crush': { label: 'Do not crush', aggregate: 'each' },
}

/** One medication's entry on one clinical list. */
export type MedListEntry = {
  slug: string
  label: string
  /** Numeric score, e.g. 3 for anticholinergic burden. */
  value: number | null
  /** Text value, e.g. "Long QT; Brugada" or "Modified-release". */
  text: string | null
  /** The list's own note, e.g. "Xanax XR · tablet". */
  note: string | null
}

/** Entries by moiety PCID and by normalized name. */
export type ClinicalIndex = {
  byPcid: Map<number, MedListEntry[]>
  byName: Map<string, MedListEntry[]>
}

// ─── Building the index ──────────────────────────────────────────────────────

const SALTS =
  'hydrochloride|hcl|dihydrochloride|hydrobromide|sodium|potassium|calcium|magnesium|maleate|succinate|tartrate|bitartrate|besylate|mesylate|citrate|sulfate|phosphate|bromide|acetate|fumarate|hyclate|monohydrate|dihydrate|trihydrate|pamoate|lactate|gluconate|napsylate|valerate|propionate|dipropionate|furoate|xinafoate|tromethamine|disodium|hemifumarate|hemitartrate|methylbromide'
const SALT_RE = new RegExp(`(\\s+(${SALTS}))+$`)

/** "Hydroxyzine Hydrochloride" → "hydroxyzine"; "cholecalciferol (vitamin D3)" → "cholecalciferol". */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9/\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(SALT_RE, '')
}

function push<K>(map: Map<K, MedListEntry[]>, key: K, entry: MedListEntry) {
  const list = map.get(key) ?? []
  if (!list.some(e => e.slug === entry.slug)) list.push(entry)
  map.set(key, list)
}

/** Build the index from each clinical list's items (pure, for tests). */
export function buildClinicalIndex(lists: { slug: string; items: Pick<ListItem, 'pcid' | 'name' | 'source_name' | 'entity_type' | 'value' | 'legal_status' | 'note'>[] }[]): ClinicalIndex {
  const index: ClinicalIndex = { byPcid: new Map(), byName: new Map() }
  for (const { slug, items } of lists) {
    const def = CLINICAL_LISTS[slug]
    if (!def) continue
    for (const item of items) {
      if (item.entity_type !== 'moiety') continue
      const entry: MedListEntry = {
        slug,
        label: def.label,
        value: item.value,
        text: item.legal_status,
        note: item.note,
      }
      push(index.byPcid, item.pcid, entry)
      for (const n of new Set([nameKey(item.name), nameKey(item.source_name)])) if (n) push(index.byName, n, entry)
    }
  }
  return index
}

let pending: Promise<ClinicalIndex> | null = null

/** Downloads every clinical list once per visit. Lists that fail to load are left out. */
export function loadClinicalIndex(): Promise<ClinicalIndex> {
  if (!pending) {
    pending = import('@/api')
      .then(({ getListBySlug }) =>
        Promise.all(
          Object.keys(CLINICAL_LISTS).map(slug =>
            getListBySlug(slug)
              .then(l => ({ slug, items: l?.items ?? [] }))
              .catch((err: unknown) => {
                console.warn(`[medrec] clinical list ${slug} unavailable`, err)
                return { slug, items: [] }
              }),
          ),
        ),
      )
      .then(buildClinicalIndex)
      .catch((err: unknown) => {
        pending = null
        throw err
      })
  }
  return pending
}

// ─── Per medication ──────────────────────────────────────────────────────────

/** The clinical list entries for one medication: by PCID first, then by name. */
export function clinicalFor(m: Medication, index: ClinicalIndex | null): MedListEntry[] {
  if (!index) return []
  if (m.pcid != null) {
    const hit = index.byPcid.get(m.pcid)
    if (hit) return hit
  }
  const key = nameKey(m.drug)
  return key ? (index.byName.get(key) ?? []) : []
}

/** True when the entry says the drug can prolong the QT interval. */
export const isLongQt = (e: MedListEntry): boolean => e.slug === 'arrhythmia-risk' && /long\s*qt/i.test(e.text ?? '')

/** Short marker for the table and the printable list: "ACB 3", "QT risk", "Do not crush". */
export function markerText(e: MedListEntry): string {
  switch (e.slug) {
    case 'anticholinergic-burden':
      return e.value != null ? `ACB ${e.value}` : 'ACB'
    case 'arrhythmia-risk':
      return isLongQt(e) ? 'QT risk' : 'Arrhythmia risk'
    case 'do-not-crush':
      return 'Do not crush'
    default:
      return e.label
  }
}

/** Longer explanation for the marker's tooltip and screen readers. */
export function markerDetail(e: MedListEntry): string {
  switch (e.slug) {
    case 'anticholinergic-burden':
      return `Anticholinergic burden score ${e.value ?? 'not given'}${e.note ? ` (${e.note})` : ''}.`
    case 'arrhythmia-risk':
      return `On the Drugs Which Affect Risk of Arrhythmias list${e.text ? `: ${e.text.split(/\s*;\s*/).join(', ')}` : ''}.`
    case 'do-not-crush':
      return `Some products should not be crushed${e.text ? ` (${e.text.split(/\s*;\s*/).join(', ').toLowerCase()})` : ''}${e.note ? `: ${e.note}` : ''}.`
    default:
      return e.label
  }
}

export function markerTone(e: MedListEntry): Tone {
  if (e.slug === 'anticholinergic-burden') return (e.value ?? 0) >= 3 ? 'warn' : (e.value ?? 0) >= 2 ? 'caution' : 'info'
  if (e.slug === 'arrhythmia-risk') return 'caution'
  return 'info'
}

// ─── Across the whole list ───────────────────────────────────────────────────

/** Medications that count toward totals: ones being taken (as prescribed or differently). */
export const isActive = (m: Medication): boolean => m.status === 'taking' || m.status === 'differently'

export type ClinicalSummary = {
  /** Total anticholinergic burden across active, non-topical medications, and who contributes. */
  acb: { total: number; meds: { name: string; score: number }[] }
  /** Active medications that can prolong the QT interval. */
  qt: string[]
  /** Active medications listed as a risk in Brugada syndrome. */
  brugada: string[]
  /** Active medications with products that should not be crushed. */
  crush: { name: string; reason: string | null; products: string | null; tube: boolean; wholeForm: boolean }[]
}

export function summarize(meds: Medication[], index: ClinicalIndex | null): ClinicalSummary {
  const out: ClinicalSummary = { acb: { total: 0, meds: [] }, qt: [], brugada: [], crush: [] }
  for (const m of meds) {
    if (!isActive(m)) continue
    const name = m.drug.trim()
    if (!name) continue
    for (const e of clinicalFor(m, index)) {
      // Anticholinergic scales describe systemic exposure, so creams, ointments,
      // gels and lotions (forms written as "a thin layer") stay out of the total.
      if (e.slug === 'anticholinergic-burden' && e.value != null) {
        if (formDef(m.form).thin) continue
        out.acb.total += e.value
        out.acb.meds.push({ name, score: e.value })
      } else if (e.slug === 'arrhythmia-risk') {
        if (isLongQt(e)) out.qt.push(name)
        if (/brugada/i.test(e.text ?? '')) out.brugada.push(name)
      } else if (e.slug === 'do-not-crush') {
        const route = m.route === 'other' ? m.routeOther : m.route
        out.crush.push({
          name,
          reason: e.text,
          products: e.note,
          tube: /feeding tube/i.test(route),
          wholeForm: (formDef(m.form).suggest ?? []).includes('whole'),
        })
      }
    }
  }
  out.acb.meds.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  return out
}

export type ClinicalFlag = { tone: 'warn' | 'caution' | 'info'; text: string }

const joinNames = (names: string[]): string =>
  names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`

/** Review flags from the clinical lists, for "Check before you finish". */
export function clinicalFlags(state: Pick<MedRecState, 'meds'>, index: ClinicalIndex | null): ClinicalFlag[] {
  if (!index) return []
  const s = summarize(state.meds, index)
  const out: ClinicalFlag[] = []

  if (s.acb.total > 0) {
    const parts = s.acb.meds.map(m => `${m.name} ${m.score}`).join(', ')
    out.push(
      s.acb.total >= 3
        ? {
            tone: 'warn',
            text: `Anticholinergic burden score ${s.acb.total} (${parts}). A total of 3 or more is linked to cognitive impairment, falls and delirium, especially in older adults.`,
          }
        : { tone: 'info', text: `Anticholinergic burden score ${s.acb.total} (${parts}).` },
    )
  }

  if (s.qt.length >= 2)
    out.push({ tone: 'caution', text: `${s.qt.length} medications can prolong the QT interval: ${joinNames(s.qt)}. Taken together, the risk adds up.` })
  else if (s.qt.length === 1) out.push({ tone: 'info', text: `${s.qt[0]} can prolong the QT interval.` })

  if (s.brugada.length)
    out.push({ tone: 'info', text: `${joinNames(s.brugada)} ${s.brugada.length === 1 ? 'is' : 'are'} listed as a risk in Brugada syndrome.` })

  for (const c of s.crush) {
    const what = [c.reason?.split(/\s*;\s*/).join(', ').toLowerCase(), c.products].filter(Boolean).join(': ')
    if (c.tube)
      out.push({ tone: 'warn', text: `${c.name} is given through a feeding tube, but some of its products should not be crushed${what ? ` (${what})` : ''}.` })
    else if (!c.wholeForm) out.push({ tone: 'info', text: `${c.name}: some products should not be crushed${what ? ` (${what})` : ''}.` })
  }
  return out
}
