import { describe, expect, it } from 'vitest'
import { newTopical, planTopical, TABLES } from './topical'

describe('topicals by fingertip units', () => {
  it('adds the areas: both arms and the face', () => {
    const r = planTopical({ ...newTopical('fpnotebook'), counts: { 'face-neck': '1', arm: '2' }, perDay: '2', days: '14' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.ftuPerApplication).toBe(8.5) // 2.5 + 2 × 3
    expect(r.gramsPerApplication).toBe(4.25)
    expect(r.totalGrams).toBe(119) // 4.25 × 2 × 14
  })

  it('rounds up to whole tubes and shows how long one lasts', () => {
    const r = planTopical({ ...newTopical('fpnotebook'), counts: { 'face-neck': '1', arm: '2' }, perDay: '2', days: '14', tubeGrams: '60' })
    if (!r.ok) throw new Error('missing')
    expect(r.tubes).toBe(2) // 119 / 60
    expect(r.daysPerTube).toBe(7) // 60 / 8.5 g a day
    expect(r.leftoverGrams).toBe(1)
    expect(r.line).toBe('Dispense 2 × 60 g (120 g) for a 14-day course (estimate).')
  })

  it('shows that the two tables disagree on the trunk', () => {
    const counts = { 'trunk-front': '1', 'trunk-back': '1' }
    const a = planTopical({ ...newTopical('fpnotebook'), counts })
    const b = planTopical({ ...newTopical('gpnotebook'), counts })
    if (!a.ok || !b.ok) throw new Error('missing')
    expect(a.ftuPerApplication).toBe(7)
    expect(b.ftuPerApplication).toBe(16)
  })

  it('caps a count at the number of such areas', () => {
    const r = planTopical({ ...newTopical('fpnotebook'), counts: { 'face-neck': '5' } })
    if (!r.ok) throw new Error('missing')
    expect(r.ftuPerApplication).toBe(2.5)
  })

  it('honors a different grams-per-unit', () => {
    const r = planTopical({ ...newTopical('fpnotebook'), counts: { hand: '1' }, perDay: '1', days: '10', gramsPerFtu: '0.43' })
    if (!r.ok) throw new Error('missing')
    expect(r.gramsPerApplication).toBeCloseTo(0.43)
  })

  it('asks for what is missing', () => {
    const r = planTopical(newTopical())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.missing[0]).toBe('at least one area of skin')
  })

  it('has unique area ids in each table', () => {
    for (const t of Object.values(TABLES)) expect(new Set(t.areas.map(a => a.id)).size).toBe(t.areas.length)
  })
})
