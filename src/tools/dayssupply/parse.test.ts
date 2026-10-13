import { describe, expect, it } from 'vitest'
import { applyFormDefaults, newMedication, type FormId, type Medication } from '@/tools/medrec/model'
import { sigText } from '@/tools/medrec/sig'
import { buildPlan, daysForQuantity, newPack, type Pack } from './calc'
import { applyProposal, readDirections, taperSteps } from './parse'

const start = (form: FormId = 'tablet'): Medication => applyFormDefaults({ ...newMedication(), form, drug: '', qty: '1', freq: 'once-daily' })
const apply = (text: string, form: FormId = 'tablet') => applyProposal(start(form), readDirections(text, form)).med

describe('reading directions', () => {
  it('the plan example: 4 inhalations every 6 hours as needed → 16 a day → 12 days from a 200-puff inhaler', () => {
    const m = apply('take 4 inhalations by mouth once every 6 hours as needed', 'mdi')
    expect(m.form).toBe('mdi')
    expect(m.qty).toBe('4')
    expect(m.freq).toBe('q6h')
    expect(m.prn).toBe(true)
    const pl = buildPlan(m, { ...newPack(), actuations: '200' })
    if (!pl.ok) throw new Error(pl.missing.join())
    expect(pl.plan.daily).toBe(16)
    expect(daysForQuantity(pl.plan, 1).days).toBe(12) // 200 ÷ 16 = 12.5 → 12
    // With 4 priming puffs: 196 ÷ 16 = 12.25 → 12
    const primed = buildPlan(m, { ...newPack(), actuations: '200', prime: '4' } as Pack)
    if (!primed.ok) throw new Error()
    expect(daysForQuantity(primed.plan, 1).days).toBe(12)
  })

  it('picks the form from the dosing unit', () => {
    expect(apply('2 puffs every 4 to 6 hours as needed for wheezing').form).toBe('mdi')
    expect(apply('1 drop in both eyes twice daily').form).toBe('eye-drops')
    expect(apply('instill 3 drops into the left ear three times a day').form).toBe('ear-drops')
    expect(apply('2 sprays in each nostril once daily').form).toBe('nasal-spray')
    expect(apply('inject 20 units under the skin at bedtime').form).toBe('injection')
    expect(apply('take 5 mL by mouth twice daily').form).toBe('liquid')
  })

  it('counts a range of hours at the shortest interval and says so', () => {
    const p = readDirections('2 puffs every 4 to 6 hours as needed for wheezing', 'mdi')
    expect(p.patch.freq).toBe('q4h')
    expect(p.patch.indication).toBe('wheezing')
    expect(p.notes.some(n => n.includes('every 4 hours, the most it allows'))).toBe(true)
  })

  it('reads dose ranges, word numbers, fractions and abbreviations people paste', () => {
    const r = apply('Take 1-2 tabs PO q8h prn pain')
    expect(r.qty).toBe('1')
    expect(r.range).toBe(true)
    expect(r.qtyMax).toBe('2')
    expect(r.freq).toBe('q8h')
    expect(r.route).toBe('by mouth')
    expect(r.prn).toBe(true)
    expect(apply('take one-half tablet by mouth daily').qty).toBe('0.5')
    expect(apply('take two capsules twice a day').qty).toBe('2')
    expect(apply('take 1 1/2 tablets bid').qty).toBe('1.5')
  })

  it('skips the strength and finds the dose', () => {
    const m = apply('metformin 500 mg, take 1 tablet by mouth twice daily')
    expect(m.qty).toBe('1')
    expect(m.unit).toBe('tablet')
    expect(m.freq).toBe('twice-daily')
  })

  it('reads mg as the dose for injections', () => {
    const m = apply('inject 0.5 mg under the skin once weekly', 'injection')
    expect(m.unit).toBe('mg')
    expect(m.qty).toBe('0.5')
    expect(m.freq).toBe('weekly')
  })

  it('changes teaspoons to mL and says so', () => {
    const p = readDirections('take 1 teaspoon by mouth three times daily', 'tablet')
    expect(p.form).toBe('liquid')
    expect(p.patch.qty).toBe('5')
    expect(p.notes.some(n => n.startsWith('Teaspoons were changed to mL'))).toBe(true)
  })

  it('reads a stated maximum', () => {
    const m = apply('2 puffs every 4 hours as needed, not to exceed 8 puffs in 24 hours', 'mdi')
    expect(m.maxOverride).toBe('8')
  })

  it('never reads ISMP error-prone abbreviations', () => {
    const p = readDirections('1 tab po qd', 'tablet')
    expect(p.patch.freq).toBeUndefined()
    expect(p.notes.some(n => n.includes('"qd" is on the ISMP list'))).toBe(true)
    const eye = readDirections('1 gtt OU bid', 'tablet')
    expect(eye.notes.some(n => n.includes('od / os / ou'))).toBe(true)
    expect(readDirections('10 u sc at night', 'injection').notes.filter(n => n.includes('ISMP')).length).toBeGreaterThanOrEqual(2)
  })

  it('does not mistake "as needed" for the ear abbreviation AS', () => {
    expect(readDirections('2 puffs every 4 hours as needed', 'mdi').notes.some(n => n.includes('ad / as / au'))).toBe(false)
  })

  it('flags tapers and reads only the first step', () => {
    const text = 'Take 2 puffs 4 times a day for 3 days, then 1 puff 4 times a day'
    expect(taperSteps(text)).toHaveLength(2)
    const p = readDirections(text, 'mdi')
    expect(p.patch.qty).toBe('2')
    expect(p.patch.freq).toBe('four-daily')
    expect(p.notes[0]).toMatch(/2 steps/)
  })

  it('names what it could not read', () => {
    const p = readDirections('take as directed', 'tablet')
    expect(p.notes).toContain('No amount was found. Enter how many each time.')
    expect(p.notes).toContain('How often was not found. Choose it by hand.')
    expect(readDirections('1 tab every 3 hours', 'tablet').notes.some(n => n.includes('every 3 hours'))).toBe(true)
  })

  it('writes the builder sentence in full words', () => {
    const s = sigText(apply('Take 1-2 tabs PO q8h prn pain'))
    expect(s).not.toMatch(/\b(tabs|po|q8h|prn)\b/i)
    expect(s.toLowerCase()).toContain('every 8 hours')
  })
})
