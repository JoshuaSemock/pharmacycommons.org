import { describe, expect, it } from 'vitest'
import { applyFormDefaults, newMedication, type Medication } from '@/tools/medrec/model'
import { sigText } from '@/tools/medrec/sig'
import { buildPlan, daysForQuantity, newPack, quantityForDays, rateText, refillDate, type Pack, type Plan } from './calc'

const med = (o: Partial<Medication>): Medication => {
  const base = newMedication()
  const withForm = o.form ? applyFormDefaults({ ...base, form: o.form }) : base
  return { ...withForm, ...o }
}
const pack = (o: Partial<Pack>): Pack => ({ ...newPack(), ...o })

function plan(m: Medication, p: Pack, dpm?: string): Plan {
  const r = buildPlan(m, p, dpm)
  if (!r.ok) throw new Error(`missing: ${r.missing.join(', ')}`)
  return r.plan
}

const albuterol = med({ form: 'mdi', qty: '2', freq: 'q4h', prn: true, indication: 'wheezing' })

describe('inhalers', () => {
  it("Joshua's example: 200 puffs, two puffs every 4 hours as needed → 12 a day → 16 days", () => {
    const pl = plan(albuterol, pack({ actuations: '200' }))
    expect(pl.daily).toBe(12)
    const r = daysForQuantity(pl, 1)
    expect(r.days).toBe(16)
    expect(r.line).toBe('Dispense 1 inhaler (200 puffs each); 16-day supply.')
  })

  it('subtracts first-use priming', () => {
    const r = daysForQuantity(plan(albuterol, pack({ actuations: '200', prime: '4' })), 1)
    expect(r.days).toBe(16) // 196 ÷ 12 = 16.3
    expect(r.steps.some(s => s.includes('200 puffs − 4 to prime'))).toBe(true)
  })

  it('rounds quantity up to whole inhalers for a target', () => {
    const r = quantityForDays(plan(albuterol, pack({ actuations: '200' })), 30)
    expect(r.dispense).toBe(2)
    expect(r.days).toBe(33)
    expect(r.leftover).toBe(40) // 400 − 360
  })
})

describe('eye drops', () => {
  const drops = med({ form: 'eye-drops', qty: '1', freq: 'twice-daily', route: 'into both eyes' })

  it("Joshua's example: 30 mL, both eyes twice daily, payer 16 drops per mL → 120 days; manufacturer 20 → 150", () => {
    const p = pack({ mL: '30', dropsPerMl: '20', dropsPerMlPayer: '16' })
    expect(plan(drops, p).daily).toBe(4)
    expect(daysForQuantity(plan(drops, p, '16'), 1).days).toBe(120)
    expect(daysForQuantity(plan(drops, p), 1).days).toBe(150)
  })

  it('one eye halves the drops', () => {
    const r = daysForQuantity(plan({ ...drops, route: 'into the right eye' }, pack({ mL: '5' })), 1)
    expect(r.days).toBe(50) // 100 drops ÷ 2 a day
  })

  it('shows the discard-after-opening limit as the controlling number', () => {
    const r = daysForQuantity(plan(drops, pack({ mL: '5', inUseDays: '28' })), 1)
    expect(r.daysByUse).toBe(25)
    expect(r.days).toBe(25)
    expect(r.limitControls).toBe(false)
    const once = med({ form: 'eye-drops', qty: '1', freq: 'bedtime', route: 'into the left eye' })
    const r2 = daysForQuantity(plan(once, pack({ mL: '2.5', inUseDays: '42' })), 1)
    expect(r2.daysByUse).toBe(50)
    expect(r2.days).toBe(42)
    expect(r2.limitControls).toBe(true)
  })
})

describe('insulin', () => {
  it('adds pen priming to every injection and rounds to whole boxes', () => {
    const m = med({ form: 'injection', unit: 'unit', qty: '20', freq: 'bedtime' })
    const pl = plan(m, pack({ container: 'pen', unitsPer: '300', primeUnits: '2', perBox: '5', wholeBox: true, inUseDays: '28' }))
    expect(pl.basis).toBe('insulin')
    expect(pl.daily).toBe(22)
    const r = quantityForDays(pl, 30)
    expect(r.dispense).toBe(5) // 3 pens needed, whole box of 5
    expect(r.days).toBe(68) // 5 × 300 ÷ 22 = 68.2
  })

  it('a vial at a low dose is ended by its in-use limit, not by use', () => {
    const m = med({ form: 'injection', unit: 'unit', qty: '10', freq: 'once-daily' })
    const pl = plan(m, pack({ container: 'vial', unitsPer: '1000', primeUnits: '0', inUseDays: '28' }))
    const r = daysForQuantity(pl, 1)
    expect(r.daysByUse).toBe(100)
    expect(r.days).toBe(28)
    expect(r.limitControls).toBe(true)
    expect(quantityForDays(pl, 90).dispense).toBe(4)
  })
})

describe('injectables, including GLP-1 pens', () => {
  it('counts labeled doses per pen, not milligrams', () => {
    const m = med({ form: 'injection', unit: 'mg', qty: '0.5', freq: 'weekly' })
    const pl = plan(m, pack({ dosesPer: '4' }))
    const r = daysForQuantity(pl, 1)
    expect(r.days).toBe(28)
    expect(r.line).toBe('Dispense 1 pen (4 doses each); 28-day supply.')
    expect(rateText(pl)).toBe('1 dose a week')
  })

  it('describes use less often than daily in whole doses', () => {
    const monthly = plan(med({ form: 'injection', unit: 'mL', qty: '1', freq: 'monthly' }), pack({ container: 'vial' }))
    expect(rateText(monthly)).toBe('1 dose every 30 days')
    expect(rateText(plan(albuterol, pack({ actuations: '200' })))).toBe('12 puffs a day')
  })

  it('single-dose pens, weekly, carton of 4 → 28 days', () => {
    const m = med({ form: 'injection', unit: 'pen', qty: '1', freq: 'weekly' })
    const pl = plan(m, pack({ dosesPer: '1', perBox: '4', wholeBox: true }))
    expect(daysForQuantity(pl, 4).days).toBe(28)
    expect(quantityForDays(pl, 30).dispense).toBe(8) // 5 pens needed → 2 cartons
    expect(quantityForDays({ ...pl, box: { size: 4, whole: false } }, 28).dispense).toBe(4)
  })
})

describe('tablets and liquids', () => {
  it('uses the top of a range and reports the bottom alongside', () => {
    const m = med({ qty: '1', range: true, qtyMax: '2', freq: 'twice-daily' })
    const r = quantityForDays(plan(m, pack({})), 30)
    expect(r.dispense).toBe(120)
    expect(r.days).toBe(30)
    expect(r.daysMin).toBe(60)
  })

  it('weekly tablets: 30 days needs 5 doses, 4 tablets last 28 days', () => {
    const pl = plan(med({ qty: '1', freq: 'weekly' }), pack({}))
    expect(quantityForDays(pl, 30).dispense).toBe(5)
    expect(daysForQuantity(pl, 4).days).toBe(28)
  })

  it('liquid in mL, rounded to whole bottles when asked', () => {
    const m = med({ form: 'liquid', qty: '5', freq: 'three-daily' })
    expect(quantityForDays(plan(m, pack({})), 10).dispense).toBe(150)
    const r = quantityForDays(plan(m, pack({ size: '100', wholePack: true })), 10)
    expect(r.dispense).toBe(2)
    expect(r.days).toBe(13)
  })

  it('a hand-set maximum replaces the calculated one for as-needed use', () => {
    const m = med({ qty: '2', freq: 'q6h', prn: true, maxOverride: '6' })
    expect(quantityForDays(plan(m, pack({})), 10).dispense).toBe(60)
  })
})

describe('missing input', () => {
  it('names what is missing instead of guessing', () => {
    const r = buildPlan(med({ form: 'eye-drops', qty: '1', freq: 'twice-daily' }), pack({ mL: '' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.missing).toContain('bottle size in mL')
  })

  it('refuses forms it does not cover yet', () => {
    expect(buildPlan(med({ form: 'cream' }), pack({})).ok).toBe(false)
  })
})

describe('refill date', () => {
  it('adds days supply × threshold, rounded down', () => {
    expect(refillDate('2026-09-28', 30, 75)).toEqual({ date: '2026-10-20', after: 22 })
    expect(refillDate('2026-12-20', 16, 100)).toEqual({ date: '2027-01-05', after: 16 })
    expect(refillDate('', 30, 75)).toBeNull()
  })
})

describe('wording', () => {
  const ISMP = /\b(QD|QOD|q\.?d\.?|IU|U|MS|MSO4|MgSO4|cc|SC|SQ|HS|TIW|D\/C|AD|AS|AU|OD|OS|OU)\b/
  it('directions and dispensing lines use nothing from the ISMP do-not-use list', () => {
    const cases: [Medication, Pack][] = [
      [albuterol, pack({ actuations: '200' })],
      [med({ form: 'eye-drops', qty: '1', freq: 'twice-daily', route: 'into both eyes' }), pack({ mL: '5' })],
      [med({ form: 'injection', unit: 'unit', qty: '20', freq: 'bedtime' }), pack({})],
      [med({ form: 'injection', unit: 'mg', qty: '0.5', freq: 'weekly' }), pack({ dosesPer: '4' })],
      [med({ form: 'liquid', qty: '5', freq: 'three-daily' }), pack({})],
      [med({ qty: '1', freq: 'once-daily' }), pack({})],
    ]
    for (const [m, p] of cases) {
      const r = quantityForDays(plan(m, p), 30)
      for (const t of [sigText(m), r.line, ...r.steps]) {
        expect(t).not.toMatch(ISMP)
        expect(t).not.toMatch(/\d\.0\b/)
        expect(t).not.toMatch(/(^|[^\d])\.\d/)
      }
    }
  })
})
