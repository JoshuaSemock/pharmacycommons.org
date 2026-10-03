/**
 * Medication reconciliation — the directions ("sig") engine and everything
 * else that is derived rather than entered: table columns, the 24-hour
 * maximum, review flags, and the substance-use totals.
 *
 * Pure functions over model.ts types; no React, no DOM. Tested in
 * medrec.test.ts.
 *
 * Sentence order:
 *   Verb · amount · (calculated dose) · route · frequency · duration · reason.
 *   Extra instructions. Maximum per 24 hours.
 * As needed moves the reason into "as needed for …" and puts the duration
 * after it as "for up to …".
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import {
  CAFFEINE_BY_ID,
  CATEGORY_LABEL,
  FREQ_BY_ID,
  INSTRUCTION_TEXT,
  NICOTINE_BY_ID,
  REC_HOW,
  REC_OFTEN,
  SEVERE_REACTIONS,
  SEVERITY_BY_ID,
  STATUS,
  ALLERGY_TYPES,
  formDef,
  type Allergy,
  type MedRecState,
  type Medication,
  type SubstanceKey,
  type Substances,
  type Tone,
  type UnitDef,
} from './model'
import { clinicalFlags, type ClinicalIndex } from './clinicalLists'

// ─────────────────────────────────────────────────────────────────────────────
// Numbers and words
// ─────────────────────────────────────────────────────────────────────────────

/** Positive finite number, or null. Blank, zero and negative input count as missing. */
export function num(v: string): number | null {
  const n = parseFloat(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** 2000 → "2,000"; 0.5 → "0.5" (leading zero); 1.0 → "1" (no trailing zero). */
export function fmt(n: number): string {
  return Number(n.toFixed(4)).toLocaleString('en-US', {
    maximumFractionDigits: 4,
  })
}

const WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
]

/** 2 → "two"; 0.5 → "one-half"; 1.5 → "one and one-half". Falls back to numerals above twenty or for odd fractions. */
export function words(n: number): string {
  const whole = Math.floor(n + 1e-9)
  const frac = +(n - whole).toFixed(3)
  const fr = frac === 0.5 ? 'one-half' : frac === 0.25 ? 'one-quarter' : frac === 0.75 ? 'three-quarters' : null
  if ((frac && !fr) || whole > 20) return fmt(n)
  if (!frac) return WORDS[whole]
  return whole ? `${WORDS[whole]} and ${fr}` : (fr as string)
}

export const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : '')

// ─────────────────────────────────────────────────────────────────────────────
// Medication parts
// ─────────────────────────────────────────────────────────────────────────────

/** The dosing unit in use, or null for forms written as "a thin layer". */
export function unitOf(m: Medication): UnitDef | null {
  const f = formDef(m.form)
  if (!f.units) return null
  return f.units.find(x => x.sg === m.unit) ?? f.units[0]
}

export function qtyPhrase(q: number, q2: number | null, unit: UnitDef): string {
  const hi = q2 ?? q
  if (unit.kind === 'count') return `${words(q)}${q2 ? ` to ${words(q2)}` : ''} ${hi > 1 ? unit.pl : unit.sg}`
  return `${fmt(q)}${q2 ? ` to ${fmt(q2)}` : ''} ${hi === 1 ? unit.sg : unit.pl}`
}

/** Amount of drug in `q` dosing units, when the strength makes that calculable. */
export function doseAmount(m: Medication, unit: UnitDef | null, q: number | null): number | null {
  const s = num(m.sv)
  if (!s || !q || !unit || m.su === '%') return null
  if (m.sper === 'each' && unit.kind === 'count') return q * s
  if (unit.sg === 'mL' && m.sper === 'mL') return q * s
  if (unit.sg === 'mL' && m.sper === '5 mL') return (q * s) / 5
  return null
}

function doseText(m: Medication, unit: UnitDef | null, q: number | null, q2: number | null): string {
  const a = doseAmount(m, unit, q)
  if (a == null) return ''
  if (q2) {
    const b = doseAmount(m, unit, q2)
    return b == null ? '' : `${fmt(a)} to ${fmt(b)} ${m.su}`
  }
  return `${fmt(a)} ${m.su === 'units' && a === 1 ? 'unit' : m.su}`
}

/** Quantities in use: `q2` only when a real, larger upper bound was entered. */
function quantities(m: Medication): { q: number | null; q2: number | null } {
  const q = num(m.qty)
  const raw = m.range ? num(m.qtyMax) : null
  return { q, q2: q && raw && raw > q ? raw : null }
}

const PLAIN_EACH = new Set(['tablet', 'capsule', 'gummy', 'lozenge', 'suppository'])

/** "25 mg", "100 mg per 5 mL", "1%", "90 mcg per puff", "25 mcg per hour". */
export function strengthText(m: Medication): string {
  const s = num(m.sv)
  if (!s) return ''
  let t = m.su === '%' ? `${fmt(s)}%` : `${fmt(s)} ${m.su}`
  const unit = unitOf(m)
  if (m.sper === 'mL') t += ' per mL'
  else if (m.sper === '5 mL') t += ' per 5 mL'
  else if (m.sper === 'hour') t += ' per hour'
  else if (m.sper === 'each' && unit && !PLAIN_EACH.has(unit.sg)) t += ` per ${unit.sg}`
  return t
}

export function medTitle(m: Medication): string {
  return [m.drug.trim() || 'Unnamed medication', strengthText(m), formDef(m.form).label.toLowerCase()].filter(Boolean).join(' ')
}

export const routeText = (m: Medication): string => (m.route === 'other' ? m.routeOther.trim() : m.route)

function durationLength(m: Medication): string {
  const n = num(m.durN)
  if (!n || (m.dur !== 'days' && m.dur !== 'weeks' && m.dur !== 'months')) return ''
  return `${fmt(n)} ${n === 1 ? m.dur.slice(0, -1) : m.dur}`
}

export const showsMax = (m: Medication): boolean => (m.showMax == null ? m.prn : m.showMax)

export type MaxInfo = { q: number; unit: UnitDef; auto: boolean; dose: string }

/**
 * Maximum dosing units per 24 hours: the hand-set value if there is one,
 * otherwise the (upper) quantity times administrations per day. Frequencies
 * less often than daily cap at one dose.
 */
export function maxInfo(m: Medication): MaxInfo | null {
  const unit = unitOf(m)
  if (!unit) return null
  const fr = FREQ_BY_ID.get(m.freq)
  const { q, q2 } = quantities(m)
  const override = num(m.maxOverride)
  if (override)
    return {
      q: override,
      unit,
      auto: false,
      dose: doseText(m, unit, override, null),
    }
  if (!q || !fr) return null
  const maxQ = (q2 ?? q) * Math.max(1, Math.floor(fr.perDay))
  return { q: maxQ, unit, auto: true, dose: doseText(m, unit, maxQ, null) }
}

const maxVerb = (verb: string): string => (verb === 'Give' ? 'give' : ['Take', 'Chew', 'Dissolve', 'Drink'].includes(verb) ? 'take' : 'use')

// ─────────────────────────────────────────────────────────────────────────────
// The sentence
// ─────────────────────────────────────────────────────────────────────────────

/** A run of the directions. `calc` marks calculated values; `gap` marks something still missing. */
export type Seg = { text: string; kind?: 'calc' | 'gap' }

export function sigSegments(m: Medication): Seg[] {
  const f = formDef(m.form)
  const unit = unitOf(m)
  const verb = f.verbs.includes(m.verb) ? m.verb : f.verbs[0]
  const clause: Seg[] = [{ text: verb }]

  if (f.thin) clause.push({ text: f.thin })
  else if (unit) {
    const { q, q2 } = quantities(m)
    if (!q) clause.push({ text: 'how many', kind: 'gap' })
    else {
      clause.push({ text: qtyPhrase(q, q2, unit) })
      const d = doseText(m, unit, q, q2)
      if (d) clause.push({ text: `(${d})`, kind: 'calc' })
    }
  }

  const route = routeText(m)
  if (route) clause.push({ text: route })
  else if (m.route === 'other') clause.push({ text: 'route', kind: 'gap' })

  const fr = FREQ_BY_ID.get(m.freq)
  if (fr) clause.push({ text: (m.prn && fr.count ? 'up to ' : '') + fr.text })

  const reason = m.indication.trim()
  const len = durationLength(m)
  const dur = m.dur === 'until-finished' ? 'until finished' : len ? `for ${m.prn ? 'up to ' : ''}${len}` : ''
  if (m.prn) {
    clause.push({ text: 'as needed' + (reason ? ` for ${reason}` : '') })
    if (dur) clause.push({ text: dur })
  } else {
    if (dur) clause.push({ text: dur })
    if (reason) clause.push({ text: `for ${reason}` })
  }

  const out: Seg[] = []
  clause.forEach((s, i) => {
    if (i) out.push({ text: ' ' })
    out.push(s)
  })
  out.push({ text: '.' })

  const extras = m.instr.map(k => INSTRUCTION_TEXT[k]).filter(Boolean)
  const other = m.instrOther.trim()
  if (other) extras.push(/[.!?]$/.test(other) ? other : `${other}.`)
  for (const e of extras) out.push({ text: ' ' }, { text: e })

  if (showsMax(m)) {
    const mx = maxInfo(m)
    if (mx) {
      out.push({ text: ' ' })
      out.push({
        text: `Do not ${maxVerb(verb)} more than ${qtyPhrase(mx.q, null, mx.unit)}${mx.dose ? ` (${mx.dose})` : ''} in 24 hours.`,
        kind: 'calc',
      })
    }
  }
  return out
}

/** Plain-text directions, with any missing piece shown in [brackets]. */
export function sigText(m: Medication): string {
  return sigSegments(m)
    .map(s => (s.kind === 'gap' ? `[${s.text}]` : s.text))
    .join('')
}

// ─────────────────────────────────────────────────────────────────────────────
// Table columns
// ─────────────────────────────────────────────────────────────────────────────

export type MedColumns = {
  name: string
  category: string
  strength: string
  form: string
  dose: string
  route: string
  freq: string
  dur: string
  reason: string
  status: string
  prescriber: string
  lastDose: string
  notes: string
}

export const MED_COLUMNS: readonly [keyof MedColumns | 'sig', string][] = [
  ['name', 'Name'],
  ['strength', 'Strength'],
  ['form', 'Form'],
  ['dose', 'Dose'],
  ['route', 'Route'],
  ['freq', 'How often'],
  ['dur', 'How long'],
  ['reason', 'Reason for use'],
  ['sig', 'Directions'],
  ['status', 'Status'],
  ['prescriber', 'Prescriber or source'],
  ['lastDose', 'Last dose'],
  ['notes', 'Notes'],
]

/** One value per table column. Blank strings render as a dash. */
export function medColumns(m: Medication): MedColumns {
  const f = formDef(m.form)
  const unit = unitOf(m)
  const { q, q2 } = quantities(m)
  let dose = ''
  if (f.thin) dose = cap(f.thin)
  else if (q && unit) {
    const d = doseText(m, unit, q, q2)
    dose = cap(qtyPhrase(q, q2, unit)) + (d ? ` (${d})` : '')
  }
  const fr = FREQ_BY_ID.get(m.freq)
  const freq = fr ? cap((m.prn && fr.count ? 'up to ' : '') + fr.text) + (m.prn ? ', as needed' : '') : ''
  const len = durationLength(m)
  const dur = m.dur === 'until-finished' ? 'Until finished' : m.dur === 'ongoing' ? 'Ongoing' : len ? (m.prn ? 'Up to ' : '') + len : ''
  return {
    name: m.drug.trim(),
    category: CATEGORY_LABEL[m.category],
    strength: strengthText(m),
    form: f.label,
    dose,
    route: cap(routeText(m)),
    freq,
    dur,
    reason: cap(m.indication.trim()),
    status: STATUS[m.status].label,
    prescriber: m.prescriber.trim(),
    lastDose: m.lastDose.trim(),
    notes: m.notes.trim(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Allergies
// ─────────────────────────────────────────────────────────────────────────────

export const reactionText = (a: Allergy): string => (a.reaction === 'other' ? a.reactionOther.trim() : a.reaction)
export const severityText = (a: Allergy): string => (a.severity === 'other' ? a.severityOther.trim() : (SEVERITY_BY_ID.get(a.severity)?.label ?? ''))
export const allergyTypeText = (a: Allergy): string => ALLERGY_TYPES.find(([t]) => t === a.type)?.[1] ?? ''

/** 2 severe · 1 moderate · 0 mild or unknown. A severe reaction makes it severe whatever the treatment was. */
export function allergyLevel(a: Allergy): 0 | 1 | 2 {
  if (SEVERE_REACTIONS.has(a.reaction)) return 2
  return SEVERITY_BY_ID.get(a.severity)?.level ?? 0
}

// ─────────────────────────────────────────────────────────────────────────────
// Review flags
// ─────────────────────────────────────────────────────────────────────────────

export type Flag = {
  tone: Extract<Tone, 'warn' | 'caution' | 'info'>
  text: string
}

const stripClass = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s*\(class\)\s*$/, '')
    .trim()

/**
 * Everything to check before the list is finished. Pass the clinical list index
 * (clinicalLists.ts) to add anticholinergic burden, QT and do-not-crush flags;
 * without it (still loading, offline, tests) those are simply left out.
 */
export function reviewFlags(state: MedRecState, clinical: ClinicalIndex | null = null): Flag[] {
  const out: Flag[] = []
  const named = state.allergies.filter(a => a.substance.trim())
  if (!state.nkda && !named.length)
    out.push({
      tone: 'caution',
      text: 'Allergies are not recorded yet. Add an allergy, or check "No known drug allergies".',
    })
  if (state.nkda && named.length)
    out.push({
      tone: 'caution',
      text: `"No known drug allergies" is checked, but ${named.length} ${named.length === 1 ? 'allergy is' : 'allergies are'} listed.`,
    })
  for (const a of named) {
    if (allergyLevel(a) === 2) {
      const r = reactionText(a)
      out.push({
        tone: 'warn',
        text: `Severe reaction on file: ${a.substance.trim()}${r ? ` (${r.toLowerCase()})` : ''}.`,
      })
    }
  }

  const seen = new Set<string>()
  for (const m of state.meds) {
    const name = m.drug.trim()
    if (!name) continue
    const key = name.toLowerCase()
    const dupKey = m.pcid != null ? `pcid:${m.pcid}` : key
    if (seen.has(dupKey)) out.push({ tone: 'caution', text: `${name} is listed more than once.` })
    seen.add(dupKey)
    for (const a of named) {
      const ak = stripClass(a.substance)
      const samePcid = a.pcid != null && a.pcid === m.pcid
      if (samePcid || (ak.length > 3 && (key.includes(ak) || ak.includes(key))))
        out.push({
          tone: 'warn',
          text: `${name} is on the medication list and also listed as an allergy (${a.substance.trim()}).`,
        })
    }
    if (!num(m.sv)) out.push({ tone: 'info', text: `No strength entered for ${name}.` })
    if (!m.indication.trim()) out.push({ tone: 'info', text: `No reason for use entered for ${name}.` })
    if (m.status === 'differently' || m.status === 'not-taking') {
      const note = m.notes.trim()
      out.push({
        tone: 'caution',
        text: `${name}: ${STATUS[m.status].label.toLowerCase()}${note ? ` (${note})` : ''}.`,
      })
    }
  }
  out.push(...clinicalFlags(state, clinical))
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Substance use
// ─────────────────────────────────────────────────────────────────────────────

export const caffeineMgPerDay = (s: Substances): number => s.caffeine.items.reduce((t, i) => t + (num(i.servings) ?? 0) * (num(i.mg) ?? 0), 0)

/** Pack-years = cigarettes per day ÷ 20 × years. Cigarettes only. */
export const packYears = (s: Substances): number =>
  s.nicotine.items
    .filter(i => i.product === 'cigarettes')
    .reduce((t, i) => {
      const a = num(i.amount) ?? 0
      const perDay = i.per === 'week' ? a / 7 : a
      return t + (perDay / 20) * (num(i.years) ?? 0)
    }, 0)

export const drinksPerWeek = (s: Substances): number => (num(s.alcohol.beer) ?? 0) + (num(s.alcohol.wine) ?? 0) + (num(s.alcohol.spirits) ?? 0)

/** 0–12, or null until all three questions are answered. */
export function auditCScore(s: Substances): number | null {
  const a = s.alcohol.audit
  if (a.some(x => x === '')) return null
  return a.reduce((t, x) => t + Number(x), 0)
}

/** One line per substance for the printable list. */
export function substanceSummary(s: Substances, key: SubstanceKey): string {
  const sub = s[key]
  if (!sub.status) return 'Not recorded'
  if (sub.status === 'never') return 'Never'
  const lead = sub.status === 'current' ? 'Current.' : 'Former.'
  const quitYear = 'quitYear' in sub ? sub.quitYear.trim() : ''
  const quit = sub.status === 'former' && quitYear ? ` Quit ${quitYear}.` : ''

  switch (key) {
    case 'caffeine': {
      if (sub.status !== 'current') return lead
      const items = s.caffeine.items
        .filter(i => num(i.servings))
        .map(i => `${fmt(num(i.servings) ?? 0)} × ${(CAFFEINE_BY_ID.get(i.source)?.label ?? 'other').toLowerCase()}`)
      return `${lead} About ${fmt(Math.round(caffeineMgPerDay(s)))} mg of caffeine per day${items.length ? ` (${items.join('; ')})` : ''}.`
    }
    case 'nicotine': {
      const items = s.nicotine.items.map(i => {
        const p = NICOTINE_BY_ID.get(i.product)
        const yrs = num(i.years)
        return `${p?.label ?? 'Nicotine'}, ${i.amount.trim() || '?'} ${p?.unit ?? ''} per ${i.per}${yrs ? ` for ${fmt(yrs)} years` : ''}`
      })
      const py = packYears(s)
      return `${lead}${items.length ? ` ${items.join('; ')}.` : ''}${py ? ` ${fmt(Math.round(py * 10) / 10)} pack-years.` : ''}${quit}`
    }
    case 'alcohol': {
      if (sub.status !== 'current') return `${lead}${quit}`
      const sc = auditCScore(s)
      return `${lead} About ${fmt(drinksPerWeek(s))} standard drinks per week.${sc != null ? ` AUDIT-C score ${sc} of 12.` : ''}`
    }
    case 'recreational': {
      const items = s.recreational.items
        .filter(i => i.substance.trim())
        .map(i => {
          const how = REC_HOW.find(([k]) => k === i.how)?.[1].toLowerCase()
          const often = REC_OFTEN.find(([k]) => k === i.often)?.[1].toLowerCase()
          const last = i.last.trim() ? `last used ${i.last.trim().toLowerCase()}` : ''
          return [i.substance.trim(), how, often, last].filter(Boolean).join(', ')
        })
      return `${lead}${items.length ? ` ${items.join('; ')}.` : ''}`
    }
  }
}
