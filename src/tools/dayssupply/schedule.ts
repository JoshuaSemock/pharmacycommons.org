/**
 * Days supply and quantity — step schedules (tapers, alternating doses, dose
 * step-ups).
 *
 * Pure functions, no React. Tested in schedule.test.ts. Design: docs/days-supply.md,
 * "Step schedules".
 *
 * A schedule is a list of steps run one after another. Each step lasts a whole
 * number of days and uses either
 *   - the same amount every day (amount per dose × doses per day), or
 *   - a set amount on each day of the week (warfarin by weekday), in which case
 *     the step is counted from the weekday it starts on.
 * Steps are calculated one at a time and then added up. When every step is the
 * same product (prednisone 10 mg tablets), the use units are added first and
 * the total is rounded up to whole packages once. When each step is a
 * different product (a GLP-1 pen for each strength), each step is rounded up to
 * whole packages on its own and the package counts are added.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { fmt } from '@/tools/medrec/sig'

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

export type StepKind = 'daily' | 'weekday'

/** One step, as typed (strings, so partial input survives). */
export type Step = {
  id: string
  kind: StepKind
  /** Whole days the step lasts. */
  days: string
  /** daily: amount per dose, in use units. */
  amount: string
  /** daily: doses per day (when a dose is given every day). */
  perDay: string
  /** daily: days between doses. 1 = every day, 7 = weekly. The first dose is on day 1 of the step. */
  every: string
  /** weekday: use units on Sunday … Saturday. */
  week: string[]
  /** Packages of this step's own product: use units per package. Blank = the shared package size. */
  capacity: string
  /** Days one package may be used once opened (this step's product). Blank = the shared limit. */
  inUseDays: string
}

export type Schedule = {
  steps: Step[]
  /** Weekday the first step starts on, 0 = Sunday. Used by weekday steps. */
  startDow: number
  /** What a use unit is: "tablet", "mL", "dose". */
  unitSg: string
  unitPl: string
  /** Name of one package: "bottle", "pen". */
  packSg: string
  packPl: string
  /** Use units per package, shared by every step unless the step has its own. Blank = loose units. */
  capacity: string
  /** Every step is a different product, so each one is rounded up to whole packages by itself. */
  separate: boolean
  /** Days a package may be used once opened or first used, shared by every step unless the step has its own. Blank = no limit. */
  inUseDays: string
}

let seq = 0
export const stepId = () => `s${++seq}`

export function newStep(o: Partial<Step> = {}): Step {
  return { id: stepId(), kind: 'daily', days: '', amount: '', perDay: '1', every: '1', week: Array(7).fill(''), capacity: '', inUseDays: '', ...o }
}

export function newSchedule(o: Partial<Schedule> = {}): Schedule {
  return {
    steps: [newStep()],
    startDow: 1,
    unitSg: 'tablet',
    unitPl: 'tablets',
    packSg: 'bottle',
    packPl: 'bottles',
    capacity: '',
    separate: false,
    inUseDays: '',
    ...o,
  }
}

const EPS = 1e-9
const num = (s: string): number | null => {
  const t = s.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}
const round2 = (n: number) => Math.round(n * 100) / 100
const ceilUnits = (n: number) => Math.ceil(n - EPS)
const word = (n: number, sg: string, pl: string) => `${fmt(n)} ${n === 1 ? sg : pl}`

export type StepResult = {
  id: string
  /** 1-based position. */
  n: number
  days: number
  /** First day of the step counted from day 1 of the schedule. */
  startDay: number
  /** Use units the step needs. */
  units: number
  /** Packages for this step on its own (separate mode only). */
  packs: number | null
  /** True when the use-within limit, not the amount used, sets this step's package count. */
  limitControls: boolean
  /** The step in words: "10 tablets once a day for 5 days". */
  text: string
}

export type ScheduleResult =
  | { ok: false; missing: string[] }
  | {
      ok: true
      steps: StepResult[]
      totalDays: number
      totalUnits: number
      /** Packages to dispense, or null when the schedule is counted in loose units. */
      dispense: number | null
      dispenseNoun: { sg: string; pl: string }
      /** Use units left over after the last step. */
      leftover: number | null
      /** True when a use-within limit raised the package count above what use alone needs. */
      limitControls: boolean
      line: string
      work: string[]
    }

/** Use units used by `days` days of a weekday step that begins on weekday `dow` (0 = Sunday). */
export function weekdayUnits(week: number[], dow: number, days: number): number {
  const full = Math.floor(days / 7)
  const rest = days - full * 7
  let total = full * week.reduce((a, b) => a + b, 0)
  for (let i = 0; i < rest; i++) total += week[(dow + i) % 7]
  return total
}

export function planSchedule(s: Schedule): ScheduleResult {
  const missing: string[] = []
  if (s.steps.length === 0) return { ok: false, missing: ['at least one step'] }

  const sharedCap = num(s.capacity)
  const sharedLimit = num(s.inUseDays)
  const parsed: { step: Step; days: number; units: number; text: string; startDow: number; cap: number | null; limit: number | null }[] = []
  let dow = s.startDow
  s.steps.forEach((st, i) => {
    const label = `step ${i + 1}`
    const days = num(st.days)
    if (!days || !Number.isInteger(days)) {
      missing.push(`a whole number of days for ${label}`)
      return
    }
    let units: number
    let text: string
    if (st.kind === 'daily') {
      const amt = num(st.amount)
      const per = num(st.perDay)
      if (!amt) {
        missing.push(`the amount per dose for ${label}`)
        return
      }
      if (!per) {
        missing.push(`doses per day for ${label}`)
        return
      }
      const every = num(st.every) ?? 1
      if (!Number.isInteger(every) || every < 1) {
        missing.push(`a whole number of days between doses for ${label}`)
        return
      }
      const doses = every === 1 ? per * days : Math.ceil(days / every - EPS)
      units = amt * doses
      const freq = every === 1 ? (per === 1 ? 'once a day' : `${fmt(per)} times a day`) : every === 7 ? 'once a week' : `once every ${fmt(every)} days`
      text = `${word(amt, s.unitSg, s.unitPl)} ${freq} for ${word(days, 'day', 'days')}`
    } else {
      const week = st.week.map(x => num(x) ?? 0)
      if (week.every(x => x === 0)) {
        missing.push(`an amount on at least one weekday for ${label}`)
        return
      }
      units = weekdayUnits(week, dow, days)
      text = `by weekday for ${word(days, 'day', 'days')}, starting on ${WEEKDAYS[dow]}`
    }
    const own = num(st.capacity)
    const lim = num(st.inUseDays) ?? sharedLimit
    parsed.push({ step: st, days, units, text, startDow: dow, cap: own ?? sharedCap, limit: lim && lim > 0 ? lim : null })
    dow = (dow + days) % 7
  })
  if (missing.length) return { ok: false, missing }
  if (s.separate && parsed.some(p => !p.cap)) return { ok: false, missing: [`${s.unitPl} per ${s.packSg} for each step`] }

  const work: string[] = []
  const steps: StepResult[] = []
  let day = 1
  let totalUnits = 0
  parsed.forEach((p, i) => {
    work.push(
      p.step.kind === 'daily'
        ? `Step ${i + 1}: ${p.text} = ${word(round2(p.units), s.unitSg, s.unitPl)}.`
        : `Step ${i + 1}: ${p.text} = ${word(round2(p.units), s.unitSg, s.unitPl)} (${p.step.week.map((x, d) => `${WEEKDAYS[d].slice(0, 3)} ${fmt(num(x) ?? 0)}`).join(', ')}).`,
    )
    let packs: number | null = null
    let stepLimit = false
    if (s.separate && p.cap) {
      const byUse = ceilUnits(p.units / p.cap)
      packs = byUse
      work.push(`  ${fmt(round2(p.units))} ÷ ${fmt(p.cap)} per ${s.packSg} = ${fmt(round2(p.units / p.cap))} → ${word(byUse, s.packSg, s.packPl)}.`)
      if (p.limit) {
        const byLimit = ceilUnits(p.days / p.limit)
        if (byLimit > byUse) {
          packs = byLimit
          stepLimit = true
          work.push(`  Each ${s.packSg} may be used for ${fmt(p.limit)} days once opened: ${fmt(p.days)} ÷ ${fmt(p.limit)} = ${fmt(round2(p.days / p.limit))} → ${word(byLimit, s.packSg, s.packPl)}. The use-within limit sets this step.`)
        } else {
          work.push(`  ${word(byUse, s.packSg, s.packPl)} already covers ${fmt(p.days)} days within the ${fmt(p.limit)}-day use-within limit.`)
        }
      }
    }
    steps.push({ id: p.step.id, n: i + 1, days: p.days, startDay: day, units: p.units, packs, limitControls: stepLimit, text: p.text })
    day += p.days
    totalUnits += p.units
  })
  const totalDays = day - 1
  work.push(`Total: ${word(totalDays, 'day', 'days')}, ${word(round2(totalUnits), s.unitSg, s.unitPl)}.`)

  const noun = { sg: s.packSg, pl: s.packPl }
  let dispense: number | null = null
  let leftover: number | null = null
  let limitControls = false
  let line: string
  if (s.separate) {
    limitControls = steps.some(x => x.limitControls)
    dispense = steps.reduce((a, x) => a + (x.packs ?? 0), 0)
    const held = parsed.reduce((a, p, i) => a + (steps[i].packs ?? 0) * (p.cap ?? 0), 0)
    leftover = Math.max(0, held - totalUnits)
    work.push(`Packages added up: ${steps.map(x => fmt(x.packs ?? 0)).join(' + ')} = ${word(dispense, s.packSg, s.packPl)}.`)
    line = `Dispense ${word(dispense, s.packSg, s.packPl)}, one set for each step; ${fmt(totalDays)}-day supply.`
  } else if (sharedCap) {
    const byUse = ceilUnits(totalUnits / sharedCap)
    dispense = byUse
    work.push(
      `${fmt(round2(totalUnits))} ÷ ${fmt(sharedCap)} per ${s.packSg} = ${fmt(round2(totalUnits / sharedCap))} → ${word(byUse, s.packSg, s.packPl)}.`,
    )
    if (sharedLimit && sharedLimit > 0) {
      const byLimit = ceilUnits(totalDays / sharedLimit)
      if (byLimit > byUse) {
        dispense = byLimit
        limitControls = true
        work.push(
          `Each ${s.packSg} may be used for ${fmt(sharedLimit)} days once opened: ${fmt(totalDays)} ÷ ${fmt(sharedLimit)} = ${fmt(round2(totalDays / sharedLimit))} → ${word(byLimit, s.packSg, s.packPl)}. The use-within limit sets the quantity.`,
        )
      } else {
        work.push(`${word(byUse, s.packSg, s.packPl)} already covers ${fmt(totalDays)} days within the ${fmt(sharedLimit)}-day use-within limit.`)
      }
    }
    leftover = Math.max(0, dispense * sharedCap - totalUnits)
    line = `Dispense ${word(dispense, s.packSg, s.packPl)} (${word(sharedCap, s.unitSg, s.unitPl)} each); ${fmt(totalDays)}-day supply.`
  } else {
    const n = ceilUnits(totalUnits)
    work.push(`${fmt(round2(totalUnits))} → ${word(n, s.unitSg, s.unitPl)} (whole ${s.unitPl} only).`)
    line = `Dispense ${word(n, s.unitSg, s.unitPl)}; ${fmt(totalDays)}-day supply.`
  }
  return {
    ok: true,
    steps,
    totalDays,
    totalUnits,
    dispense,
    dispenseNoun: noun,
    leftover,
    limitControls,
    line,
    work,
  }
}
