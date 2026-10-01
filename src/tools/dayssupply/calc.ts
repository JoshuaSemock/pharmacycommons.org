/**
 * Days supply and quantity — the calculation engine.
 *
 * Pure functions, no React. Tested in dayssupply.test.ts. Design and the
 * decisions behind it: docs/days-supply.md.
 *
 * Directions are the med rec model (medrec/model.ts `Medication`), written by
 * the same sentence engine (medrec/sig.ts), so the wording rules are shared:
 * no abbreviations except units, nothing from the ISMP do-not-use list.
 *
 * Every calculation goes through one shape, a `Plan`:
 *   daily use (in use units: tablets, mL, drops, puffs, units, doses)
 *   an optional container (inhaler, bottle, pen, vial) with its capacity
 *   an optional in-use limit (days a container may be used once opened)
 *   an optional box (containers that are dispensed together)
 * Days supply rounds down; quantity rounds up to whole containers.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FREQ_BY_ID, formDef, type FormId, type Medication } from '@/tools/medrec/model'
import { fmt, num, unitOf } from '@/tools/medrec/sig'

// ─────────────────────────────────────────────────────────────────────────────
// What kind of product this is
// ─────────────────────────────────────────────────────────────────────────────

export type Basis = 'count' | 'liquid' | 'drops' | 'spray' | 'inhaler' | 'insulin' | 'injection'

const COUNT_FORMS: ReadonlySet<FormId> = new Set<FormId>([
  'tablet',
  'er-tablet',
  'capsule',
  'er-capsule',
  'chewable',
  'odt',
  'gummy',
  'lozenge',
  'rectal-supp',
  'patch',
])

/** Forms this calculator covers in version 1, in the order the form menu lists them. */
export const SUPPORTED_GROUPS: readonly [string, FormId[]][] = [
  ['By mouth', ['tablet', 'er-tablet', 'capsule', 'er-capsule', 'chewable', 'odt', 'liquid', 'gummy', 'lozenge']],
  ['Eyes, ears, nose', ['eye-drops', 'ear-drops', 'nasal-spray']],
  ['Inhaled', ['mdi', 'dpi']],
  ['Injected', ['injection']],
  ['Other', ['patch', 'rectal-supp']],
]

export function basisOf(m: Medication): Basis | null {
  if (COUNT_FORMS.has(m.form)) return 'count'
  switch (m.form) {
    case 'liquid':
      return 'liquid'
    case 'eye-drops':
    case 'ear-drops':
      return 'drops'
    case 'nasal-spray':
      return 'spray'
    case 'mdi':
    case 'dpi':
      return 'inhaler'
    case 'injection':
      return unitOf(m)?.sg === 'unit' ? 'insulin' : 'injection'
    default:
      return null
  }
}

/** Both eyes, both ears and each nostril double the amount per dose. */
export function sidesOf(m: Medication): 1 | 2 {
  return ['into both eyes', 'into both ears', 'into each nostril'].includes(m.route) ? 2 : 1
}

// ─────────────────────────────────────────────────────────────────────────────
// Package
// ─────────────────────────────────────────────────────────────────────────────

export type Container = 'pen' | 'vial'

/** Everything about the package, as typed (strings, so partial input survives). */
export type Pack = {
  /** Count and liquid forms: an optional package size (tablets, or mL per bottle). */
  size: string
  /** Count and liquid forms: dispense whole packages only. */
  wholePack: boolean
  /** Drops: bottle size in mL. */
  mL: string
  /** Drops: drops per mL, manufacturer (or general default). */
  dropsPerMl: string
  /** Drops: drops per mL the payer uses. Blank = no comparison. */
  dropsPerMlPayer: string
  /** Inhalers and sprays: actuations per device. */
  actuations: string
  /** Inhalers and sprays: actuations spent priming before first use. */
  prime: string
  /** Insulin and injections: pen or vial. */
  container: Container
  /** Insulin: units per pen or vial. */
  unitsPer: string
  /** Insulin pens: units spent priming before each injection. */
  primeUnits: string
  /** Injections: doses per pen or vial, as labeled. */
  dosesPer: string
  /** Insulin and injections: pens or vials per box. */
  perBox: string
  /** Dispense whole boxes only. */
  wholeBox: boolean
  /** Days a container may be used once opened or first used. Blank = no limit. */
  inUseDays: string
}

export function newPack(): Pack {
  return {
    size: '',
    wholePack: false,
    mL: '',
    dropsPerMl: '20',
    dropsPerMlPayer: '',
    actuations: '',
    prime: '',
    container: 'pen',
    unitsPer: '300',
    primeUnits: '2',
    dosesPer: '1',
    perBox: '',
    wholeBox: false,
    inUseDays: '',
  }
}

/** Typical U-100 insulin packages. Starting values only; the user checks the product. */
export const INSULIN_DEFAULTS: Record<Container, Pick<Pack, 'unitsPer' | 'primeUnits' | 'perBox'>> = {
  pen: { unitsPer: '300', primeUnits: '2', perBox: '5' },
  vial: { unitsPer: '1000', primeUnits: '0', perBox: '1' },
}

// ─────────────────────────────────────────────────────────────────────────────
// The plan
// ─────────────────────────────────────────────────────────────────────────────

export type Noun = { sg: string; pl: string }
const noun = (sg: string, pl: string = `${sg}s`): Noun => ({ sg, pl })
export const nounFor = (n: number, x: Noun): string => (n === 1 ? x.sg : x.pl)
/** "12 puffs", "1 bottle", "0.5 tablets" → "0.5 tablet" is wrong English, so fractions take the plural. */
export const count = (n: number, x: Noun): string => `${fmt(n)} ${nounFor(n, x)}`

export type Plan = {
  basis: Basis
  /** Use units per day at the directed (maximum) use. */
  daily: number
  /** Use units per day at the low end of a range; null when there is no range. */
  dailyMin: number | null
  use: Noun
  /** The thing handed over, when it isn't loose use units. `capacity` is in use units. */
  container: { noun: Noun; capacity: number; describe: string } | null
  /** In-use limit in days, if one applies. */
  limitDays: number | null
  /** Containers per box, and whether only whole boxes are dispensed. */
  box: { size: number; whole: boolean } | null
  /** How daily use and capacity were worked out, one sentence per step. */
  steps: string[]
}

export type PlanResult = { ok: true; plan: Plan } | { ok: false; missing: string[] }

const EPS = 1e-9
const floorDays = (n: number) => Math.floor(n + EPS)
const ceilUnits = (n: number) => Math.ceil(n - EPS)

/** Administrations per day and the words for them. */
function frequency(m: Medication): { perDay: number; text: string } | null {
  const f = FREQ_BY_ID.get(m.freq)
  return f ? { perDay: f.perDay, text: f.text } : null
}

function perDayText(perDay: number): string {
  if (perDay >= 1) return perDay === 1 ? 'once a day' : `${fmt(perDay)} times a day`
  const everyN = 1 / perDay
  if (Math.abs(everyN - Math.round(everyN)) < 1e-6) return `once every ${fmt(Math.round(everyN))} days`
  return `${fmt(perDay * 7)} times a week`
}

export function buildPlan(m: Medication, p: Pack, dropsPerMl?: string): PlanResult {
  const basis = basisOf(m)
  if (!basis) return { ok: false, missing: ['a form this calculator covers'] }
  const missing: string[] = []
  const fr = frequency(m)
  if (!fr) missing.push('how often')
  const q = num(m.qty)
  const qMaxRaw = m.range ? num(m.qtyMax) : null
  const qMax = q && qMaxRaw && qMaxRaw > q ? qMaxRaw : null
  const unit = unitOf(m)
  const override = m.prn ? num(m.maxOverride) : null
  if (!q && !override) missing.push('how many per dose')

  const steps: string[] = []
  const sides = sidesOf(m)
  const sideNote = sides === 2 ? ` × 2 (${m.route.replace(/^into /, '')})` : ''

  // Amount per administration in use units, and the use unit itself.
  let use: Noun = unit ? noun(unit.sg, unit.pl) : noun('dose')
  let per = (qMax ?? q ?? 0) * sides
  let perMin = qMax && q ? q * sides : null

  if (basis === 'insulin') {
    use = noun('unit')
    const prime = p.container === 'pen' ? (num(p.primeUnits) ?? 0) : 0
    per = (qMax ?? q ?? 0) + prime
    perMin = qMax && q ? q + prime : null
  } else if (basis === 'injection') {
    use = noun('dose')
    // Counted units (pens, syringes) are doses; a measured dose (0.5 mg, 1 mL) is one injection.
    per = unit?.kind === 'count' ? (qMax ?? q ?? 0) : q ? 1 : 0
    perMin = unit?.kind === 'count' && qMax && q ? q : null
  }

  if (missing.length) return { ok: false, missing }
  const f = fr as { perDay: number; text: string }

  let daily: number
  let dailyMin: number | null
  if (override) {
    daily = override * sides
    dailyMin = null
    steps.push(`Maximum set by hand: ${count(override, use)} in 24 hours${sideNote}${sides === 2 ? ` = ${count(daily, use)}` : ''}.`)
  } else {
    daily = per * f.perDay
    dailyMin = perMin != null ? perMin * f.perDay : null
    const amount = (qMax ?? q) as number
    if (basis === 'insulin') {
      const prime = per - amount
      steps.push(
        `${fmt(amount)} units${prime ? ` + ${fmt(prime)} units to prime the pen` : ''} = ${count(per, use)} per injection, ${f.text} (${perDayText(f.perDay)}) → ${count(daily, use)} a day.`,
      )
    } else if (basis === 'injection') {
      steps.push(`${count(per, use)} per injection, ${f.text} (${perDayText(f.perDay)}) → ${fmt(daily)} ${nounFor(daily, use)} a day.`)
    } else {
      const u = unit ? (amount === 1 ? unit.sg : unit.pl) : 'doses'
      steps.push(
        `${fmt(amount)} ${u}${sideNote}, ${f.text}${m.prn ? ' as needed, counted at the most allowed' : ''} (${perDayText(f.perDay)}) → ${fmt(daily)} ${nounFor(daily, use)} a day.`,
      )
    }
    if (dailyMin != null) steps.push(`At the low end of the range: ${fmt(dailyMin)} ${nounFor(dailyMin, use)} a day.`)
  }

  if (!(daily > 0)) return { ok: false, missing: ['how many per dose'] }

  // Container, limit and box.
  let container: Plan['container'] = null
  const limit = num(p.inUseDays)
  let box: Plan['box'] = null

  switch (basis) {
    case 'count':
    case 'liquid': {
      const size = num(p.size)
      if (size && p.wholePack) {
        const pk = basis === 'liquid' ? noun('bottle') : noun('package')
        container = { noun: pk, capacity: size, describe: `${count(size, use)} each` }
        steps.push(`One ${pk.sg} holds ${count(size, use)}.`)
      }
      break
    }
    case 'drops': {
      const mL = num(p.mL)
      const dpm = num(dropsPerMl ?? p.dropsPerMl)
      if (!mL) missing.push('bottle size in mL')
      if (!dpm) missing.push('drops per mL')
      if (mL && dpm) {
        const cap = mL * dpm
        container = { noun: noun('bottle'), capacity: cap, describe: `${fmt(mL)} mL each, counted at ${fmt(dpm)} drops per mL` }
        steps.push(`${fmt(mL)} mL × ${fmt(dpm)} drops per mL = ${count(cap, use)} per bottle.`)
      }
      break
    }
    case 'spray':
    case 'inhaler': {
      const acts = num(p.actuations)
      const prime = num(p.prime) ?? 0
      if (!acts) missing.push(basis === 'spray' ? 'sprays per bottle' : 'puffs per inhaler')
      if (acts) {
        const cap = acts - prime
        if (cap <= 0) missing.push('fewer priming actuations than the device holds')
        const dev = basis === 'spray' ? noun('bottle') : noun('inhaler')
        container = { noun: dev, capacity: cap, describe: `${count(acts, use)} each` }
        steps.push(
          prime
            ? `${count(acts, use)} − ${fmt(prime)} to prime before first use = ${count(cap, use)} per ${dev.sg}.`
            : `${count(acts, use)} per ${dev.sg}.`,
        )
      }
      break
    }
    case 'insulin': {
      const units = num(p.unitsPer)
      if (!units) missing.push(`units per ${p.container}`)
      if (units) {
        const c = noun(p.container)
        container = { noun: c, capacity: units, describe: `${fmt(units)} units each` }
        steps.push(`${fmt(units)} units per ${p.container}.`)
      }
      break
    }
    case 'injection': {
      const doses = num(p.dosesPer)
      if (!doses) missing.push(`doses per ${p.container}`)
      if (doses) {
        const c = noun(p.container)
        const label = unit?.kind === 'count' ? noun(unit.sg, unit.pl) : c
        container = { noun: label, capacity: doses, describe: `${count(doses, use)} each` }
        steps.push(`${count(doses, use)} per ${label.sg}, as labeled. Drug left after the labeled doses is not counted.`)
      }
      break
    }
  }
  if (missing.length) return { ok: false, missing }

  if (container && (basis === 'insulin' || basis === 'injection')) {
    const size = num(p.perBox)
    if (size && size > 1) box = { size, whole: p.wholeBox }
  }

  return {
    ok: true,
    plan: { basis, daily, dailyMin, use, container, limitDays: container && limit ? limit : null, box, steps },
  }
}

/**
 * Most used, in words that suit the schedule: "12 puffs a day" for daily use,
 * "1 dose a week" or "1 dose every 30 days" for anything less often.
 */
export function rateText(plan: Plan): string {
  const d = plan.daily
  if (d >= 1 - EPS) return `${fmt(Math.round(d * 100) / 100)} ${nounFor(d, plan.use)} a day`
  const week = d * 7
  if (Math.abs(week - Math.round(week)) < 1e-6) return `${fmt(Math.round(week))} ${nounFor(Math.round(week), plan.use)} a week`
  const every = 1 / d
  if (Math.abs(every - Math.round(every)) < 1e-6) return `1 ${plan.use.sg} every ${fmt(Math.round(every))} days`
  return `${fmt(Math.round(week * 100) / 100)} ${plan.use.pl} a week`
}

// ─────────────────────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────────────────────

export type Result = {
  /** What is handed over, in containers (or use units when there is no container). */
  dispense: number
  dispenseNoun: Noun
  /** Days the quantity lasts with any in-use limit applied. This is the days supply. */
  days: number
  /** Days the quantity lasts by use alone, ignoring the in-use limit. */
  daysByUse: number
  /** Days at the low end of a dose range, when there is one. */
  daysMin: number | null
  /** True when the in-use limit, not use, sets the days supply. */
  limitControls: boolean
  /** Use units left over at the end of the target days (quantity mode only). */
  leftover: number | null
  /** Plain-language dispensing line, no abbreviations. */
  line: string
  steps: string[]
}

/** Days one container lasts by use, and with the in-use limit. */
function perContainer(plan: Plan): { byUse: number; limited: number } | null {
  if (!plan.container) return null
  const byUse = plan.container.capacity / plan.daily
  return { byUse, limited: plan.limitDays ? Math.min(byUse, plan.limitDays) : byUse }
}

function finish(plan: Plan, dispense: number, target: number | null, steps: string[]): Result {
  const pc = perContainer(plan)
  let days: number
  let daysByUse: number
  let daysMin: number | null = null
  let leftover: number | null = null
  if (pc && plan.container) {
    daysByUse = floorDays(dispense * pc.byUse)
    days = floorDays(dispense * pc.limited)
    if (plan.dailyMin) daysMin = floorDays(dispense * Math.min(plan.container.capacity / plan.dailyMin, plan.limitDays ?? Infinity))
    if (target != null) leftover = Math.max(0, dispense * plan.container.capacity - target * plan.daily)
  } else {
    daysByUse = floorDays(dispense / plan.daily)
    days = daysByUse
    if (plan.dailyMin) daysMin = floorDays(dispense / plan.dailyMin)
    if (target != null) leftover = Math.max(0, dispense - target * plan.daily)
  }
  const limitControls = days < daysByUse
  const dn = plan.container ? plan.container.noun : plan.use
  const each = plan.container ? ` (${plan.container.describe})` : ''
  const line = `Dispense ${count(dispense, dn)}${each}; ${fmt(days)}-day supply.`

  const out = [...steps]
  if (pc && plan.container) {
    out.push(
      `${count(dispense, plan.container.noun)} × ${fmt(plan.container.capacity)} ÷ ${fmt(plan.daily)} a day = ${fmt(round2(dispense * pc.byUse))} days → ${fmt(daysByUse)} days by use.`,
    )
    if (plan.limitDays) {
      out.push(
        limitControls
          ? `Each ${plan.container.noun.sg} may be used for ${fmt(plan.limitDays)} days once opened, which ends it before it is used up: ${fmt(dispense)} × ${fmt(plan.limitDays)} = ${fmt(days)} days.`
          : `Each ${plan.container.noun.sg} is used up within its ${fmt(plan.limitDays)}-day in-use limit, so the limit does not change the days supply.`,
      )
    }
  } else {
    out.push(`${count(dispense, plan.use)} ÷ ${fmt(plan.daily)} a day = ${fmt(round2(dispense / plan.daily))} → ${fmt(days)} days.`)
  }
  if (daysMin != null && daysMin !== days) out.push(`At the low end of the range the same quantity lasts ${fmt(daysMin)} days.`)
  return { dispense, dispenseNoun: dn, days, daysByUse, daysMin, limitControls, leftover, line, steps: out }
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Quantity to cover `targetDays`, rounded up to whole containers (and whole boxes when set). */
export function quantityForDays(plan: Plan, targetDays: number): Result {
  const steps = [...plan.steps]
  const pc = perContainer(plan)
  if (pc && plan.container) {
    const exact = targetDays / pc.limited
    let n = ceilUnits(exact)
    steps.push(
      `${fmt(targetDays)} days ÷ ${fmt(round2(pc.limited))} days per ${plan.container.noun.sg}${pc.limited < pc.byUse ? ' (in-use limit)' : ''} = ${fmt(round2(exact))} → ${count(n, plan.container.noun)}.`,
    )
    if (plan.box?.whole) {
      const boxes = ceilUnits(n / plan.box.size)
      const rounded = boxes * plan.box.size
      if (rounded !== n) steps.push(`Whole boxes of ${fmt(plan.box.size)}: ${fmt(boxes)} ${boxes === 1 ? 'box' : 'boxes'} = ${count(rounded, plan.container.noun)}.`)
      n = rounded
    }
    return finish(plan, n, targetDays, steps)
  }
  const exact = targetDays * plan.daily
  const n = ceilUnits(exact)
  steps.push(`${fmt(targetDays)} days × ${fmt(plan.daily)} a day = ${fmt(round2(exact))} → ${count(n, plan.use)}.`)
  return finish(plan, n, targetDays, steps)
}

/** Days supply for a quantity given in containers (or use units when there is no container). */
export function daysForQuantity(plan: Plan, quantity: number): Result {
  return finish(plan, quantity, null, [...plan.steps])
}

// ─────────────────────────────────────────────────────────────────────────────
// Refill date
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Earliest refill: fill date + days supply × threshold, rounded down to whole
 * days. `fill` is yyyy-mm-dd; the result is yyyy-mm-dd, computed in UTC so a
 * daylight-saving change can't move it.
 */
export function refillDate(fill: string, daysSupply: number, thresholdPct: number): { date: string; after: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fill)
  if (!m || !(daysSupply > 0) || !(thresholdPct > 0)) return null
  const after = floorDays((daysSupply * thresholdPct) / 100)
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + after))
  return { date: d.toISOString().slice(0, 10), after }
}

/** "2026-10-19" → "October 19, 2026". */
export function longDate(iso: string): string {
  const [y, mo, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' })
}

/** The label the package section uses for the dispensed thing, for the quantity input. */
export function dispenseNounFor(m: Medication, p: Pack): Noun {
  const basis = basisOf(m)
  const unit = unitOf(m)
  switch (basis) {
    case 'count':
      return p.wholePack && num(p.size) ? noun('package') : unit ? noun(unit.sg, unit.pl) : noun('tablet')
    case 'liquid':
      return p.wholePack && num(p.size) ? noun('bottle') : noun('mL', 'mL')
    case 'drops':
      return noun('bottle')
    case 'spray':
      return noun('bottle')
    case 'inhaler':
      return noun('inhaler')
    case 'insulin':
      return noun(p.container)
    case 'injection':
      return unit?.kind === 'count' ? noun(unit.sg, unit.pl) : noun(p.container)
    default:
      return noun('unit')
  }
}

export const formLabel = (id: FormId): string => formDef(id).label
