/**
 * Medication reconciliation — save and reopen a list as CSV, and keep a
 * working copy in this browser.
 *
 * One file, one row per item. `record_type` says what a row is; the other
 * columns are shared, and each type fills only the ones it needs, so the file
 * opens cleanly in Excel. `directions` is written for people reading the file
 * and ignored on import (it is recalculated). Unknown row types are counted
 * and skipped, never guessed at.
 *
 * Format version 1. Add columns at the end; never rename or reuse one.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import {
  CATEGORY_LABEL,
  DRINKS,
  FREQ_BY_ID,
  STRENGTH_PERS,
  STRENGTH_UNITS,
  blankState,
  formDef,
  isAllergyType,
  isDurationMode,
  isFormId,
  isInstructionId,
  isStatusId,
  isUseStatus,
  newAllergy,
  newMedication,
  uid,
  type CategoryId,
  type MedRecState,
  type Medication,
  type StrengthPer,
  type StrengthUnit,
  type SubstanceKey,
} from './model'
import { sigText } from './sig'

export const CSV_COLUMNS = [
  'record_type',
  'name',
  'pcid',
  'category',
  'strength_value',
  'strength_unit',
  'strength_per',
  'form',
  'action',
  'quantity',
  'quantity_max',
  'unit',
  'route',
  'route_other',
  'frequency',
  'as_needed',
  'reason_for_use',
  'duration',
  'duration_number',
  'instructions',
  'other_instructions',
  'show_max',
  'max_per_24_hours',
  'status',
  'prescriber',
  'last_dose',
  'notes',
  'directions',
  'allergy_type',
  'reaction',
  'reaction_other',
  'severity',
  'severity_other',
  'when',
  'amount',
  'amount_per',
  'mg_each',
  'years',
  'quit_year',
  'how_taken',
  'how_often',
  'last_used',
  'audit_c_1',
  'audit_c_2',
  'audit_c_3',
  'date_of_birth',
  'prepared',
] as const
type Column = (typeof CSV_COLUMNS)[number]
type Row = Partial<Record<Column, string>>

const SUBSTANCES: readonly SubstanceKey[] = ['caffeine', 'nicotine', 'alcohol', 'recreational']
const pcidCell = (n: number | null) => (n == null ? '' : `PCID-${n}`)
const parsePcid = (v: string): number | null => {
  const m = /^(?:PCID-)?(\d{7,8})$/.exec(v.trim())
  return m ? Number(m[1]) : null
}

function toRows(state: MedRecState, today: string): Row[] {
  const rows: Row[] = []
  rows.push({
    record_type: 'list',
    name: state.name,
    date_of_birth: state.dob,
    prepared: today,
    notes: 'Pharmacy Commons medication reconciliation, format 1',
  })
  if (state.nkda) rows.push({ record_type: 'no_known_drug_allergies' })
  for (const a of state.allergies) {
    rows.push({
      record_type: 'allergy',
      name: a.substance,
      pcid: pcidCell(a.pcid),
      allergy_type: a.type,
      reaction: a.reaction,
      reaction_other: a.reactionOther,
      severity: a.severity,
      severity_other: a.severityOther,
      when: a.when,
    })
  }
  for (const m of state.meds) {
    rows.push({
      record_type: 'medication',
      name: m.drug,
      pcid: pcidCell(m.pcid),
      category: m.category,
      strength_value: m.sv,
      strength_unit: m.su,
      strength_per: m.sper,
      form: m.form,
      action: m.verb,
      quantity: m.qty,
      quantity_max: m.range ? m.qtyMax : '',
      unit: m.unit,
      route: m.route,
      route_other: m.routeOther,
      frequency: m.freq,
      as_needed: m.prn ? 'yes' : 'no',
      reason_for_use: m.indication,
      duration: m.dur,
      duration_number: m.durN,
      instructions: m.instr.join(';'),
      other_instructions: m.instrOther,
      show_max: m.showMax == null ? '' : m.showMax ? 'yes' : 'no',
      max_per_24_hours: m.maxOverride,
      status: m.status,
      prescriber: m.prescriber,
      last_dose: m.lastDose,
      notes: m.notes,
      directions: sigText(m),
    })
  }
  const s = state.subs
  for (const key of SUBSTANCES) {
    const status: Row = { record_type: `${key}_status`, status: s[key].status }
    if (key === 'nicotine') status.quit_year = s.nicotine.quitYear
    if (key === 'alcohol') {
      status.quit_year = s.alcohol.quitYear
      status.audit_c_1 = s.alcohol.audit[0]
      status.audit_c_2 = s.alcohol.audit[1]
      status.audit_c_3 = s.alcohol.audit[2]
    }
    rows.push(status)
  }
  for (const i of s.caffeine.items)
    rows.push({
      record_type: 'caffeine',
      name: i.source,
      amount: i.servings,
      amount_per: 'day',
      mg_each: i.mg,
    })
  for (const i of s.nicotine.items)
    rows.push({
      record_type: 'nicotine',
      name: i.product,
      amount: i.amount,
      amount_per: i.per,
      years: i.years,
    })
  for (const [k] of DRINKS)
    if (s.alcohol[k] !== '')
      rows.push({
        record_type: 'alcohol',
        name: k,
        amount: s.alcohol[k],
        amount_per: 'week',
      })
  for (const i of s.recreational.items)
    rows.push({
      record_type: 'recreational',
      name: i.substance,
      how_taken: i.how,
      how_often: i.often,
      last_used: i.last,
    })
  return rows
}

/** Quotes when needed; prefixes a quote to text Excel would run as a formula. */
export function csvCell(v: string | undefined): string {
  let s = v ?? ''
  if (/^[=+@]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(state: MedRecState, today = new Date().toISOString().slice(0, 10)): string {
  const lines = [CSV_COLUMNS.join(',')]
  for (const r of toRows(state, today)) lines.push(CSV_COLUMNS.map(c => csvCell(r[c])).join(','))
  return lines.join('\r\n') + '\r\n'
}

export function csvFileName(state: MedRecState, today = new Date().toISOString().slice(0, 10)): string {
  const who = (state.name.trim() || 'medication-list')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${who || 'medication-list'}-${today}.csv`
}

/** RFC 4180 reader: quoted fields, doubled quotes, CRLF or LF. Drops blank lines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter(r => r.some(x => x.trim() !== ''))
}

export type ImportResult = { state: MedRecState; skipped: number }

/** Throws with a readable message when the file isn't one this tool wrote. */
export function fromCsv(text: string): ImportResult {
  const rows = parseCsv(text.replace(/^﻿/, ''))
  const head = (rows.shift() ?? []).map(h => h.trim())
  if (!head.includes('record_type')) throw new Error('This file has no record_type column, so it was not saved by this tool.')
  const idx = new Map(head.map((h, i) => [h, i]))
  const s = blankState()
  let skipped = 0

  for (const r of rows) {
    const g = (k: Column): string => {
      const i = idx.get(k)
      const v = i == null ? '' : (r[i] ?? '')
      return /^'[=+@]/.test(v) ? v.slice(1) : v
    }
    const type = g('record_type').trim()
    if (type === 'list') {
      s.name = g('name')
      s.dob = g('date_of_birth')
    } else if (type === 'no_known_drug_allergies') s.nkda = true
    else if (type === 'allergy') {
      const t = g('allergy_type')
      s.allergies.push({
        ...newAllergy(),
        substance: g('name'),
        pcid: parsePcid(g('pcid')),
        type: isAllergyType(t) ? t : 'allergy',
        reaction: g('reaction'),
        reactionOther: g('reaction_other'),
        severity: g('severity'),
        severityOther: g('severity_other'),
        when: g('when'),
      })
    } else if (type === 'medication') s.meds.push(readMedication(g))
    else if (type.endsWith('_status') && (SUBSTANCES as readonly string[]).includes(type.slice(0, -7))) {
      const key = type.slice(0, -7) as SubstanceKey
      const st = g('status')
      s.subs[key].status = isUseStatus(st) ? st : ''
      if (key === 'nicotine') s.subs.nicotine.quitYear = g('quit_year')
      if (key === 'alcohol') {
        s.subs.alcohol.quitYear = g('quit_year')
        s.subs.alcohol.audit = [g('audit_c_1'), g('audit_c_2'), g('audit_c_3')].map(v => (/^[0-4]$/.test(v) ? v : '')) as [string, string, string]
      }
    } else if (type === 'alcohol') {
      const k = g('name')
      if (k === 'beer' || k === 'wine' || k === 'spirits') s.subs.alcohol[k] = g('amount')
      else skipped++
    } else if (type === 'caffeine')
      s.subs.caffeine.items.push({
        id: uid(),
        source: g('name') || 'other',
        servings: g('amount'),
        mg: g('mg_each'),
      })
    else if (type === 'nicotine')
      s.subs.nicotine.items.push({
        id: uid(),
        product: g('name') || 'cigarettes',
        amount: g('amount'),
        per: g('amount_per') === 'week' ? 'week' : 'day',
        years: g('years'),
      })
    else if (type === 'recreational')
      s.subs.recreational.items.push({
        id: uid(),
        substance: g('name'),
        how: g('how_taken') || 'other',
        often: g('how_often') || 'weekly',
        last: g('last_used'),
      })
    else skipped++
  }
  return { state: s, skipped }
}

function readMedication(g: (k: Column) => string): Medication {
  const formRaw = g('form')
  const form = isFormId(formRaw) ? formRaw : 'tablet'
  const f = formDef(form)
  const cat = g('category')
  const su = g('strength_unit')
  const per = g('strength_per')
  const dur = g('duration')
  const status = g('status')
  const showMax = g('show_max')
  const m: Medication = {
    ...newMedication(),
    drug: g('name'),
    pcid: parsePcid(g('pcid')),
    category: cat in CATEGORY_LABEL ? (cat as CategoryId) : 'rx',
    sv: g('strength_value'),
    su: (STRENGTH_UNITS as readonly string[]).includes(su) ? (su as StrengthUnit) : 'mg',
    sper: (STRENGTH_PERS as readonly string[]).includes(per) ? (per as StrengthPer) : f.per,
    form,
    verb: f.verbs.includes(g('action')) ? g('action') : f.verbs[0],
    qty: g('quantity'),
    qtyMax: g('quantity_max'),
    range: g('quantity_max') !== '',
    unit: f.units?.some(x => x.sg === g('unit')) ? g('unit') : (f.units?.[0].sg ?? ''),
    route: g('route') === 'other' || f.routes.includes(g('route')) ? g('route') : f.routes[0],
    routeOther: g('route_other'),
    freq: FREQ_BY_ID.has(g('frequency')) ? g('frequency') : 'once-daily',
    prn: g('as_needed') === 'yes',
    indication: g('reason_for_use'),
    dur: isDurationMode(dur) ? dur : 'ongoing',
    durN: g('duration_number'),
    instr: g('instructions').split(';').filter(isInstructionId),
    instrOther: g('other_instructions'),
    showMax: showMax === '' ? null : showMax === 'yes',
    maxOverride: g('max_per_24_hours'),
    status: isStatusId(status) ? status : 'taking',
    prescriber: g('prescriber'),
    lastDose: g('last_dose'),
    notes: g('notes'),
  }
  return m
}

// ─────────────────────────────────────────────────────────────────────────────
// Working copy in this browser
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'pc-medrec-v1'

export function loadSaved(): MedRecState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && (parsed as { v?: unknown }).v === 1) return parsed as MedRecState
  } catch {
    // Private windows and blocked storage throw; the page works without it.
  }
  return null
}

export function saveWorking(state: MedRecState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // See loadSaved.
  }
}
