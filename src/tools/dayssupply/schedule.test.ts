import { describe, expect, it } from 'vitest'
import { newSchedule, newStep, planSchedule, weekdayUnits, type Schedule } from './schedule'

const ok = (s: Schedule) => {
  const r = planSchedule(s)
  if (!r.ok) throw new Error(`missing: ${r.missing.join(', ')}`)
  return r
}

describe('weekdayUnits', () => {
  it('counts whole weeks and the leftover days from the starting weekday', () => {
    const week = [0, 5, 2.5, 5, 2.5, 5, 2.5] // Sun..Sat
    expect(weekdayUnits(week, 1, 7)).toBe(22.5)
    expect(weekdayUnits(week, 1, 14)).toBe(45)
    expect(weekdayUnits(week, 1, 3)).toBe(5 + 2.5 + 5) // Mon Tue Wed
    expect(weekdayUnits(week, 6, 3)).toBe(2.5 + 0 + 5) // Sat Sun Mon wraps
  })
})

describe('tapers, one product', () => {
  // Prednisone 10 mg tablets: 4 a day Ã— 3 days, 3 Ã— 3, 2 Ã— 3, 1 Ã— 3
  const taper = newSchedule({
    unitSg: 'tablet',
    unitPl: 'tablets',
    steps: [
      newStep({ days: '3', amount: '4' }),
      newStep({ days: '3', amount: '3' }),
      newStep({ days: '3', amount: '2' }),
      newStep({ days: '3', amount: '1' }),
    ],
  })

  it('adds the steps: 30 tablets over 12 days', () => {
    const r = ok(taper)
    expect(r.totalDays).toBe(12)
    expect(r.totalUnits).toBe(30)
    expect(r.steps.map(s => s.startDay)).toEqual([1, 4, 7, 10])
    expect(r.line).toBe('Dispense 30 tablets; 12-day supply.')
  })

  it('rounds the total up to whole packages once', () => {
    const r = ok({ ...taper, capacity: '28', packSg: 'bottle', packPl: 'bottles' })
    expect(r.dispense).toBe(2)
    expect(r.leftover).toBe(26)
    expect(r.line).toBe('Dispense 2 bottles (28 tablets each); 12-day supply.')
  })

  it('counts doses per day', () => {
    const r = ok(newSchedule({ steps: [newStep({ days: '5', amount: '1', perDay: '2' })] }))
    expect(r.totalUnits).toBe(10)
  })
})

describe('warfarin by weekday', () => {
  it('uses the weekday the schedule starts on', () => {
    const week = ['2.5', '5', '2.5', '5', '2.5', '5', '2.5'] // Sun..Sat
    const mon = ok(newSchedule({ startDow: 1, steps: [newStep({ kind: 'weekday', days: '30', week })] }))
    const sun = ok(newSchedule({ startDow: 0, steps: [newStep({ kind: 'weekday', days: '30', week })] }))
    // 4 full weeks = 4 Ã— 25 = 100; 2 extra days: Mon+Tue = 7.5, Sun+Mon = 7.5
    expect(mon.totalUnits).toBe(107.5)
    expect(sun.totalUnits).toBe(107.5)
    expect(mon.line).toBe('Dispense 108 tablets; 30-day supply.')
  })

  it('continues the weekday across steps', () => {
    const week = ['0', '1', '0', '0', '0', '0', '0'] // Monday only
    const r = ok(
      newSchedule({
        startDow: 1,
        steps: [newStep({ kind: 'weekday', days: '3', week }), newStep({ kind: 'weekday', days: '7', week })],
      }),
    )
    // step 1: Mon Tue Wed = 1; step 2 starts Thursday, runs Thu..Wed = includes next Monday = 1
    expect(r.steps.map(s => s.units)).toEqual([1, 1])
  })
})

describe('dose step-up, a different pen for each step', () => {
  const stepUp = newSchedule({
    unitSg: 'dose',
    unitPl: 'doses',
    packSg: 'pen',
    packPl: 'pens',
    separate: true,
    capacity: '4',
    steps: [
      newStep({ days: '28', amount: '1', every: '7' }), // weekly, written as a fraction of a day
      newStep({ days: '28', amount: '1', every: '7' }),
      newStep({ days: '28', amount: '1', every: '7' }),
    ],
  })

  it('rounds each step up to whole pens, then adds them', () => {
    const r = ok(stepUp)
    expect(r.steps.map(s => s.packs)).toEqual([1, 1, 1])
    expect(r.dispense).toBe(3)
    expect(r.totalDays).toBe(84)
  })

  it('does not share a partly used pen between steps', () => {
    // 3 weeks on the first strength = 3 doses â†’ still one whole pen; 3 weeks on the second â†’ another
    const r = ok({ ...stepUp, steps: [newStep({ days: '21', amount: '1', every: '7' }), newStep({ days: '21', amount: '1', every: '7' })] })
    expect(r.dispense).toBe(2)
    expect(r.leftover).toBe(2) // 2 pens Ã— 4 doses âˆ’ 6 doses
  })

  it('lets a step use its own package size', () => {
    const r = ok({ ...stepUp, steps: [newStep({ days: '28', amount: '1', every: '7', capacity: '2' }), newStep({ days: '28', amount: '1', every: '7' })] })
    expect(r.steps.map(s => s.packs)).toEqual([2, 1])
  })
})

describe('use-within limit', () => {
  // Insulin-style: 28 days of use per pen, 300 units each
  const base = newSchedule({ unitSg: 'unit', unitPl: 'units', packSg: 'pen', packPl: 'pens', capacity: '300' })

  it('adds pens when the limit ends a pen before it is used up', () => {
    // 10 units a day for 60 days = 600 units = 2 pens by use; a 28-day limit needs ceil(60/28) = 3
    const r = ok({ ...base, inUseDays: '28', steps: [newStep({ days: '60', amount: '10' })] })
    expect(r.dispense).toBe(3)
    expect(r.limitControls).toBe(true)
    expect(r.leftover).toBe(300) // 900 − 600
    expect(r.work.some(w => w.includes('use-within limit sets the quantity'))).toBe(true)
  })

  it('leaves the count alone when use already needs enough pens', () => {
    // 30 units a day for 30 days = 900 units = 3 pens; ceil(30/28) = 2
    const r = ok({ ...base, inUseDays: '28', steps: [newStep({ days: '30', amount: '30' })] })
    expect(r.dispense).toBe(3)
    expect(r.limitControls).toBe(false)
  })

  it('applies a step own limit in separate mode', () => {
    const r = ok({
      ...base,
      separate: true,
      steps: [newStep({ days: '56', amount: '10', inUseDays: '28' }), newStep({ days: '28', amount: '10' })],
    })
    // step 1: 560 units = 2 pens by use, ceil(56/28) = 2; step 2: 280 units = 1 pen
    expect(r.steps.map(x => x.packs)).toEqual([2, 1])
    const r2 = ok({ ...base, separate: true, inUseDays: '14', steps: [newStep({ days: '28', amount: '5' })] })
    // 140 units = 1 pen by use; shared limit 14 days needs 2
    expect(r2.steps[0].packs).toBe(2)
    expect(r2.steps[0].limitControls).toBe(true)
  })

  it('ignores the limit when counting loose units', () => {
    const r = ok(newSchedule({ inUseDays: '28', steps: [newStep({ days: '60', amount: '1' })] }))
    expect(r.dispense).toBeNull()
    expect(r.limitControls).toBe(false)
  })
})

describe('missing input', () => {
  it('says what is missing', () => {
    const r = planSchedule(newSchedule({ steps: [newStep({ days: '', amount: '' })] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.missing[0]).toContain('days')
  })

  it('needs a package size for every step when products differ', () => {
    const r = planSchedule(newSchedule({ separate: true, steps: [newStep({ days: '7', amount: '1' })] }))
    expect(r.ok).toBe(false)
  })
})
