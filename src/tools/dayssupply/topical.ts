/**
 * Days supply and quantity — topical creams and ointments, by fingertip units.
 *
 * Pure functions, no React. Tested in topical.test.ts. Design: docs/days-supply.md,
 * "Topicals".
 *
 * One fingertip unit (FTU) is a line of cream squeezed from the tip of an adult
 * index finger to the first crease; it is about 0.5 g and covers an area about
 * two adult palms wide. This is an ESTIMATE of how much one application needs.
 * Published tables disagree a little (the trunk especially), so two are offered
 * and the page says which one it used. Adults only: children's amounts depend on
 * age and are not included.
 *
 * Sources (checked 2026-10-13):
 *   "fpnotebook": FPnotebook, Topical Medication Quantity
 *     https://fpnotebook.com/Derm/Pharm/TpclMdctnQnty.htm
 *   "gpnotebook": GPnotebook, Fingertip units
 *     https://gpnotebook.com/pages/dermatology/ftus
 *   The fingertip unit itself: Long CC, Finlay AY. Clin Exp Dermatol 1991;16:444-447 (PMID 1806320).
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { fmt } from '@/tools/medrec/sig'

export type TableId = 'fpnotebook' | 'gpnotebook'

export type Area = {
  id: string
  label: string
  /** Fingertip units for one application to one such area. */
  ftu: number
  /** How many of this area there can be (2 arms, 1 face). */
  max: number
}

export type Table = {
  id: TableId
  label: string
  source: string
  url: string
  /** Grams per fingertip unit. */
  gramsPerFtu: number
  areas: Area[]
}

export const TABLES: Record<TableId, Table> = {
  fpnotebook: {
    id: 'fpnotebook',
    label: 'FPnotebook',
    source: 'FPnotebook, Topical Medication Quantity',
    url: 'https://fpnotebook.com/Derm/Pharm/TpclMdctnQnty.htm',
    gramsPerFtu: 0.5,
    areas: [
      { id: 'face-neck', label: 'Face and neck', ftu: 2.5, max: 1 },
      { id: 'trunk-front', label: 'Trunk, front', ftu: 3.5, max: 1 },
      { id: 'trunk-back', label: 'Trunk, back', ftu: 3.5, max: 1 },
      { id: 'arm', label: 'Arm (each)', ftu: 3, max: 2 },
      { id: 'hand', label: 'Hand and fingers, both sides (each)', ftu: 1, max: 2 },
      { id: 'leg', label: 'Leg (each)', ftu: 6, max: 2 },
      { id: 'foot', label: 'Foot (each)', ftu: 2, max: 2 },
    ],
  },
  gpnotebook: {
    id: 'gpnotebook',
    label: 'GPnotebook',
    source: 'GPnotebook, Fingertip units',
    url: 'https://gpnotebook.com/pages/dermatology/ftus',
    gramsPerFtu: 0.5,
    areas: [
      { id: 'scalp', label: 'Scalp', ftu: 3, max: 1 },
      { id: 'face-neck', label: 'Face and neck', ftu: 2.5, max: 1 },
      { id: 'trunk-front', label: 'Trunk, front', ftu: 8, max: 1 },
      { id: 'trunk-back', label: 'Trunk, back', ftu: 8, max: 1 },
      { id: 'buttocks', label: 'Buttocks', ftu: 4, max: 1 },
      { id: 'arm-hand', label: 'Whole arm, including the hand (each)', ftu: 4, max: 2 },
      { id: 'hand', label: 'Hand alone, front and back (each)', ftu: 1, max: 2 },
      { id: 'leg-foot', label: 'Whole leg, including the foot (each)', ftu: 8, max: 2 },
      { id: 'foot', label: 'Foot alone (each)', ftu: 2, max: 2 },
      { id: 'genitalia', label: 'Genitalia', ftu: 0.5, max: 1 },
    ],
  },
}

/** Common tube and jar sizes in grams, smallest first. */
export const TUBE_SIZES = [15, 30, 45, 60, 80, 100, 120, 454] as const

export type TopicalInput = {
  table: TableId
  /** Area id → how many (as typed). */
  counts: Record<string, string>
  /** Applications per day. */
  perDay: string
  /** Days of treatment. */
  days: string
  /** Grams per package. Blank = grams only. */
  tubeGrams: string
  /** Override grams per FTU. Blank = the table's value. */
  gramsPerFtu: string
}

export type TopicalResult =
  | { ok: false; missing: string[] }
  | {
      ok: true
      table: Table
      ftuPerApplication: number
      gramsPerApplication: number
      gramsPerDay: number
      totalGrams: number
      /** Packages, when a package size is given. */
      tubes: number | null
      tubeGrams: number | null
      /** Days one package lasts at this use. */
      daysPerTube: number | null
      leftoverGrams: number | null
      parts: { label: string; count: number; ftu: number }[]
      work: string[]
      line: string
    }

const EPS = 1e-9
const num = (s: string): number | null => {
  const t = s.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}
const round2 = (n: number) => Math.round(n * 100) / 100

export function newTopical(table: TableId = 'fpnotebook'): TopicalInput {
  return { table, counts: {}, perDay: '2', days: '14', tubeGrams: '', gramsPerFtu: '' }
}

export function planTopical(inp: TopicalInput): TopicalResult {
  const table = TABLES[inp.table]
  const missing: string[] = []
  const parts = table.areas
    .map(a => ({ label: a.label, count: Math.min(num(inp.counts[a.id] ?? '') ?? 0, a.max), ftu: a.ftu }))
    .filter(p => p.count > 0)
  if (parts.length === 0) missing.push('at least one area of skin')
  const perDay = num(inp.perDay)
  const days = num(inp.days)
  if (!perDay) missing.push('applications per day')
  if (!days || !Number.isInteger(days)) missing.push('a whole number of days')
  const g = num(inp.gramsPerFtu) ?? table.gramsPerFtu
  if (!(g > 0)) missing.push('grams per fingertip unit')
  if (missing.length) return { ok: false, missing }

  const ftu = parts.reduce((a, p) => a + p.count * p.ftu, 0)
  const perApp = ftu * g
  const perDayG = perApp * (perDay as number)
  const total = perDayG * (days as number)
  const tube = num(inp.tubeGrams)

  const work = [
    `${parts.map(p => `${fmt(p.count)} × ${fmt(p.ftu)}`).join(' + ')} = ${fmt(round2(ftu))} fingertip units per application (${table.label} table).`,
    `${fmt(round2(ftu))} × ${fmt(g)} g = ${fmt(round2(perApp))} g per application.`,
    `${fmt(round2(perApp))} g × ${fmt(perDay as number)} a day = ${fmt(round2(perDayG))} g a day.`,
    `${fmt(round2(perDayG))} g × ${fmt(days as number)} days = ${fmt(round2(total))} g.`,
  ]
  let tubes: number | null = null
  let daysPerTube: number | null = null
  let leftover: number | null = null
  let line = `About ${fmt(round2(total))} g for ${fmt(days as number)} days (estimate).`
  if (tube && tube > 0) {
    tubes = Math.ceil(total / tube - EPS)
    daysPerTube = Math.floor(tube / perDayG + EPS)
    leftover = Math.max(0, tubes * tube - total)
    work.push(`${fmt(round2(total))} g ÷ ${fmt(tube)} g per package = ${fmt(round2(total / tube))} → ${fmt(tubes)} ${tubes === 1 ? 'package' : 'packages'}.`)
    work.push(`One ${fmt(tube)} g package lasts ${fmt(round2(tube / perDayG))} days at this use → ${fmt(daysPerTube)} days.`)
    line = `Dispense ${fmt(tubes)} × ${fmt(tube)} g (${fmt(round2(tubes * tube))} g) for a ${fmt(days as number)}-day course (estimate).`
  }
  return {
    ok: true,
    table,
    ftuPerApplication: ftu,
    gramsPerApplication: perApp,
    gramsPerDay: perDayG,
    totalGrams: total,
    tubes,
    tubeGrams: tube && tube > 0 ? tube : null,
    daysPerTube,
    leftoverGrams: leftover,
    parts,
    work,
    line,
  }
}
